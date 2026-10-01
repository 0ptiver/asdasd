import * as THREE from 'three';
import { CONFIG } from '../config';
import { mulberry32 } from '../core/rng';
import type { Chunk } from '../systems/streaming';
import type { Terrain } from '../world/terrain';
import { ROAD_HALF, roadDist } from '../world/terrain';
import { propMaterial } from './prims';

const S = CONFIG.chunkSize;

/** Per-biome density of ground cover: [grass tufts, flowers, rocks] relative multipliers. */
const COVER: Record<string, [number, number, number]> = {
  meadow: [1, 1, 0.4],
  birchwood: [0.9, 0.4, 0.5],
  cherry: [0.9, 1.2, 0.4],
  redwood: [0.7, 0, 0.8],
  swamp: [0.9, 0.2, 0.3],
  goldbasin: [0.35, 0, 1.3],
  volcano: [0, 0, 2],
  taiga: [0.5, 0, 1],
  tropics: [1, 0.8, 0.4],
  crystal: [0.2, 0, 1.2],
  desert: [0.12, 0, 1.2],
  haunted: [0.4, 0, 0.9],
  sky: [0.9, 0.7, 0.3],
  deepcave: [0, 0, 0],
};
const FLOWER = [0xffffff, 0xffd84a, 0xff7aa8, 0xb48cff, 0xff6a4a];

let geoCache: {
  tuft: THREE.BufferGeometry;
  flower: THREE.BufferGeometry;
  rock: THREE.BufferGeometry;
} | null = null;
function geos() {
  if (geoCache) return geoCache;
  const white = (g: THREE.BufferGeometry) => {
    const n = g.attributes.position!.count;
    const c = new Float32Array(n * 3).fill(1);
    // darker at the base for a soft contact shadow
    const p = g.attributes.position!;
    for (let i = 0; i < n; i++) {
      const k = 0.62 + 0.55 * Math.min(1, Math.max(0, p.getY(i) / 0.7));
      c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g.deleteAttribute('uv');
    return g;
  };
  const blades: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + i * 0.4;
    const h = 0.45 + (i % 3) * 0.16;
    const g = new THREE.ConeGeometry(0.075, h, 3, 1).toNonIndexed();
    g.translate(0, h / 2, 0);
    g.rotateX(0.28 + (i % 2) * 0.12);
    g.rotateY(a);
    g.translate(Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08);
    blades.push(g);
  }
  const merge = (list: THREE.BufferGeometry[]) => {
    let total = 0;
    for (const g of list) total += g.attributes.position!.count;
    const pos = new Float32Array(total * 3);
    const nor = new Float32Array(total * 3);
    let o = 0;
    for (const g of list) {
      pos.set(g.attributes.position!.array as Float32Array, o * 3);
      nor.set(g.attributes.normal!.array as Float32Array, o * 3);
      o += g.attributes.position!.count;
    }
    const m = new THREE.BufferGeometry();
    m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    return m;
  };
  const tuft = white(merge(blades));
  const stem = new THREE.CylinderGeometry(0.02, 0.025, 0.4, 4).toNonIndexed();
  stem.translate(0, 0.2, 0);
  const head = new THREE.IcosahedronGeometry(0.1, 0);
  head.scale(1, 0.7, 1);
  head.translate(0, 0.42, 0);
  const flower = white(merge([stem, head]));
  const rock = white(new THREE.IcosahedronGeometry(0.5, 0));
  geoCache = { tuft, flower, rock };
  return geoCache;
}

/** Instanced grass tufts, flowers and pebbles for one terrain chunk (deterministic, purely cosmetic). */
export function buildScatter(chunk: Chunk, terrain: Terrain, quality: number): THREE.Group | null {
  const biomeCover = COVER[chunk.biome.id] ?? [0.6, 0, 0.5];
  if (chunk.biome.indoor) return null;
  const rnd = mulberry32((chunk.cx * 73856093) ^ (chunk.cz * 19349663) ^ 0x51ed);
  const g = geos();
  const ox = chunk.cx * S;
  const oz = chunk.cz * S;
  const tufts: number[] = [];
  const flowers: number[] = [];
  const rocks: number[] = [];
  const tuftN = Math.round(650 * quality);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const col = new THREE.Color();
  const mats: { kind: number; m: THREE.Matrix4; c: THREE.Color }[] = [];
  for (let i = 0; i < tuftN; i++) {
    const x = ox + rnd() * S;
    const z = oz + rnd() * S;
    const kind = rnd();
    const blend = terrain.biomeBlend(x, z);
    const b = blend.main;
    if (b.indoor) continue;
    const cov = COVER[b.id] ?? biomeCover;
    if (Math.hypot(x, z) < 72) continue;
    const h = terrain.heightAt(x, z);
    if (h < 0.5 || h > 400) continue;
    if (roadDist(x, z) < ROAD_HALF + 0.8) continue;
    const slope = Math.abs(terrain.heightAt(x + 1, z) - h) + Math.abs(terrain.heightAt(x, z + 1) - h);
    const pick = rnd();
    let type = -1;
    if (kind < 0.8 && pick < cov[0]) type = 0;
    else if (kind >= 0.8 && kind < 0.88 && pick < cov[1]) type = 1;
    else if (kind >= 0.88 && pick < Math.min(1, cov[2])) type = 2;
    if (type < 0) continue;
    if (type !== 2 && slope > 1.4) continue;
    const s = type === 2 ? 0.25 + rnd() * rnd() * 1.1 : 0.7 + rnd() * 0.9;
    e.set(type === 2 ? rnd() * 0.6 : 0, rnd() * Math.PI * 2, type === 2 ? rnd() * 0.6 : 0);
    q.setFromEuler(e);
    m.compose(
      new THREE.Vector3(x - ox, h - (type === 2 ? s * 0.12 : 0), z - oz),
      q,
      new THREE.Vector3(s, type === 2 ? s * (0.6 + rnd() * 0.4) : s, s),
    );
    if (type === 2) col.setHex(0x8a857c).multiplyScalar(0.7 + rnd() * 0.5);
    else if (type === 1) col.setHex(FLOWER[Math.floor(rnd() * FLOWER.length)]!);
    else {
      col
        .setHex(b.ground)
        .lerp(new THREE.Color(b.groundAlt), rnd())
        .multiplyScalar(1.1 + rnd() * 0.35);
    }
    mats.push({ kind: type, m: m.clone(), c: col.clone() });
  }
  if (!mats.length) return null;
  void tufts;
  void flowers;
  void rocks;
  const group = new THREE.Group();
  group.position.set(ox, 0, oz);
  const geoOf = [g.tuft, g.flower, g.rock];
  for (let t = 0; t < 3; t++) {
    const list = mats.filter((x) => x.kind === t);
    if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(geoOf[t]!, propMaterial(), list.length);
    list.forEach((it, i) => {
      mesh.setMatrixAt(i, it.m);
      mesh.setColorAt(i, it.c);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = t === 2;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}
