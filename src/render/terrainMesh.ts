import * as THREE from 'three';
import { CONFIG } from '../config';
import { fbm } from '../core/rng';
import type { Chunk } from '../systems/streaming';
import type { Terrain } from '../world/terrain';
import { ROAD_HALF, roadDist } from '../world/terrain';
import { BIOME_BY_ID } from '../data/biomes';

const N = CONFIG.chunkSegments;
const S = CONFIG.chunkSize;
const ROCK = new THREE.Color(0x77716a);
const SAND = new THREE.Color(0xe2d1a0);
const ROAD = new THREE.Color(0x8d7f68);
const SEABED = new THREE.Color(0x3a5a5a);
const MUD = new THREE.Color(0x4a4030);

const colorCache = new Map<number, THREE.Color>();
const col = (hex: number): THREE.Color => {
  let c = colorCache.get(hex);
  if (!c) colorCache.set(hex, (c = new THREE.Color(hex)));
  return c;
};

/** Build the ground mesh for one chunk: vertex-colored by biome/slope/road/shore, flat-shaded low poly. */
export function buildTerrainMesh(chunk: Chunk, terrain: Terrain, material: THREE.Material): THREE.Mesh {
  const stride = N + 1;
  const step = S / N;
  const pos = new Float32Array(stride * stride * 3);
  const colors = new Float32Array(stride * stride * 3);
  const tmp = new THREE.Color();
  const ox = chunk.cx * S;
  const oz = chunk.cz * S;
  for (let ix = 0; ix <= N; ix++) {
    for (let iz = 0; iz <= N; iz++) {
      const i = ix * stride + iz;
      const wx = ox + ix * step;
      const wz = oz + iz * step;
      const h = chunk.heights[i]!;
      pos[i * 3] = ix * step;
      pos[i * 3 + 1] = h;
      pos[i * 3 + 2] = iz * step;
      const blend = terrain.biomeBlend(wx, wz);
      const n = fbm(wx * 0.05, wz * 0.05, 5, 2);
      tmp.setRGB(0, 0, 0);
      for (const w of blend.weights) {
        const b = w.biome;
        const c = col(b.ground).clone().lerp(col(b.groundAlt), n);
        tmp.r += c.r * w.w;
        tmp.g += c.g * w.w;
        tmp.b += c.b * w.w;
      }
      // slope → rock
      const hx = chunk.heights[Math.min(N, ix + 1) * stride + iz]! - chunk.heights[Math.max(0, ix - 1) * stride + iz]!;
      const hz = chunk.heights[ix * stride + Math.min(N, iz + 1)]! - chunk.heights[ix * stride + Math.max(0, iz - 1)]!;
      const slope = Math.hypot(hx, hz) / (2 * step);
      const main = blend.main;
      if (slope > 0.75 && main.id !== 'taiga') tmp.lerp(ROCK, Math.min(0.85, (slope - 0.75) * 2));
      // shoreline & underwater
      if (!main.indoor) {
        if (h < 1.6 && h > -0.8 && main.id !== 'swamp') tmp.lerp(SAND, Math.min(1, (1.6 - h) / 1.4) * 0.9);
        if (h < 1.0 && main.id === 'swamp') tmp.lerp(MUD, 0.7);
        if (h <= -0.8) tmp.lerp(SEABED, Math.min(1, (-0.8 - h) / 2));
      }
      // volcano glow near lava patches
      if (main.id === 'volcano' && h < 6) tmp.lerp(col(0xff4a10), 0.7);
      // roads
      const rd = roadDist(wx, wz);
      if (rd < ROAD_HALF + 1.5) tmp.lerp(ROAD, 1 - Math.max(0, (rd - ROAD_HALF) / 1.5));
      // subtle brightness noise for facets
      const v = 0.94 + 0.12 * fbm(wx * 0.3, wz * 0.3, 9, 1);
      colors[i * 3] = tmp.r * v;
      colors[i * 3 + 1] = tmp.g * v;
      colors[i * 3 + 2] = tmp.b * v;
    }
  }
  const idx: number[] = [];
  for (let ix = 0; ix < N; ix++) {
    for (let iz = 0; iz < N; iz++) {
      const a = ix * stride + iz;
      const b = (ix + 1) * stride + iz;
      const c = (ix + 1) * stride + iz + 1;
      const d = ix * stride + iz + 1;
      // CCW seen from above (+y): x right, z toward viewer
      idx.push(a, d, b, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, material);
  mesh.position.set(ox, 0, oz);
  mesh.receiveShadow = true;
  mesh.frustumCulled = true;
  g.computeBoundingSphere();
  void BIOME_BY_ID;
  return mesh;
}

/** Sky-island layer mesh (cliffs hang below the rim). Returns null if no land. */
export function buildSkyMesh(chunk: Chunk, material: THREE.Material): THREE.Mesh | null {
  if (!chunk.skyHeights) return null;
  const stride = N + 1;
  const step = S / N;
  const base = (BIOME_BY_ID.sky.elevation ?? 220) - 24;
  const pos = new Float32Array(stride * stride * 3);
  const colors = new Float32Array(stride * stride * 3);
  const grass = col(BIOME_BY_ID.sky.ground);
  const rock = col(0xb8b0c8);
  for (let ix = 0; ix <= N; ix++) {
    for (let iz = 0; iz <= N; iz++) {
      const i = ix * stride + iz;
      const h = chunk.skyHeights[i]!;
      const void_ = Number.isNaN(h);
      pos[i * 3] = ix * step;
      pos[i * 3 + 1] = void_ ? base : h;
      pos[i * 3 + 2] = iz * step;
      const c = void_ ? rock : grass;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
  }
  const idx: number[] = [];
  for (let ix = 0; ix < N; ix++)
    for (let iz = 0; iz < N; iz++) {
      const a = ix * stride + iz;
      const b = (ix + 1) * stride + iz;
      const c = (ix + 1) * stride + iz + 1;
      const d = ix * stride + iz + 1;
      const vals = [a, b, c, d].map((k) => chunk.skyHeights![k]!);
      if (vals.every((v) => Number.isNaN(v))) continue;
      idx.push(a, d, b, b, d, c);
    }
  if (!idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, material);
  mesh.position.set(chunk.cx * S, 0, chunk.cz * S);
  mesh.receiveShadow = true;
  return mesh;
}
