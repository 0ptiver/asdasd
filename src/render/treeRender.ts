import * as THREE from 'three';
import { hash2 } from '../core/rng';
import { WOOD_BY_ID, MUTATION_BY_ID } from '../data/woods';
import { isNight } from '../core/gameTime';
import type { Tree } from '../world/trees';
import type { TreeChange, TreeSystem } from '../systems/trees';
import { InstancePool } from './instancePool';
import { stumpGeo, treeGeo } from './treeGeo';

const POOL_CAP = 7000;
const HI_DIST = 150; // chunks closer than this use full-detail trees

interface Placed {
  lod: 0 | 1;
  stump: boolean;
}

/** Keeps instanced tree meshes in sync with the TreeSystem. Near chunks use detailed geometry, far chunks low-poly. */
export class TreeRenderer {
  readonly group = new THREE.Group();
  private pools = new Map<string, InstancePool>();
  private placed = new Map<string, Placed>();
  private stump: InstancePool;
  private shakes = new Map<string, number>();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  private chunkLod = new Map<string, 0 | 1>();
  private lastCenter = '';
  private colorCache = new Map<number, THREE.Color>();

  constructor(private trees: TreeSystem) {
    this.stump = new InstancePool(stumpGeo(), 3000);
    this.group.add(this.stump.mesh);
    trees.listeners.push((t, k) => this.onChange(t, k));
    for (const t of trees.trees.values()) this.onChange(t, 'add');
  }

  private pool(
    style: string,
    part: 'trunk' | 'leaf',
    lod: 0 | 1,
    geo: () => THREE.BufferGeometry,
  ): InstancePool {
    const key = `${style}:${part}:${lod}`;
    let p = this.pools.get(key);
    if (!p) {
      p = new InstancePool(geo(), POOL_CAP, undefined, lod === 0);
      this.pools.set(key, p);
      this.group.add(p.mesh);
    }
    return p;
  }

  private col(hex: number): THREE.Color {
    let c = this.colorCache.get(hex);
    if (!c) this.colorCache.set(hex, (c = new THREE.Color(hex)));
    return c;
  }

  private chunkOf(id: string): string {
    return id.slice(0, id.indexOf(':'));
  }

  private matrixFor(t: Tree, tilt = 0, tiltAxis = 0): THREE.Matrix4 {
    this.q.setFromAxisAngle(this.v.set(0, 1, 0), t.yaw);
    if (tilt) {
      this.q2.setFromAxisAngle(this.v.set(Math.cos(tiltAxis), 0, Math.sin(tiltAxis)), tilt);
      this.q.premultiply(this.q2);
    }
    this.v.set(t.x, t.y, t.z);
    this.s.setScalar(t.scale);
    return this.m.compose(this.v, this.q, this.s);
  }

  private colorsFor(t: Tree): { trunk: THREE.Color; leaf: THREE.Color; glowT: number; glowL: number } {
    const w = WOOD_BY_ID[t.wood]!;
    const vr = 0.9 + 0.2 * hash2(t.x * 7, t.z * 13, 3);
    const trunk = this.c.set(w.color).clone().multiplyScalar(vr);
    const leaf = this.col(w.leaf || w.color)
      .clone()
      .multiplyScalar(0.9 + 0.2 * hash2(t.x * 3, t.z * 5, 4));
    const mut = t.mut ? MUTATION_BY_ID[t.mut] : null;
    if (mut?.tint) {
      trunk.lerp(this.col(mut.tint), 0.7);
      leaf.lerp(this.col(mut.tint), 0.75);
    }
    const emissive = !!(w.emissive || mut?.emissive);
    const glowT = emissive ? 0.35 : 0;
    const glowL = emissive ? 0.65 : 0;
    return { trunk, leaf, glowT, glowL };
  }

  private addTree(t: Tree, lod: 0 | 1): void {
    const geo = treeGeo(t.style, lod === 1);
    const { trunk, leaf, glowT, glowL } = this.colorsFor(t);
    const m = this.matrixFor(t);
    this.pool(t.style, 'trunk', lod, () => geo.trunk).add(t.id, m, trunk, glowT);
    if (geo.foliage) this.pool(t.style, 'leaf', lod, () => geo.foliage!).add(t.id, m, leaf, glowL);
  }
  private removeTree(t: Tree, lod: 0 | 1): void {
    this.pools.get(`${t.style}:trunk:${lod}`)?.remove(t.id);
    this.pools.get(`${t.style}:leaf:${lod}`)?.remove(t.id);
  }
  private addStump(t: Tree): void {
    const w = WOOD_BY_ID[t.wood]!;
    this.m.compose(
      this.v.set(t.x, t.y, t.z),
      this.q.identity(),
      this.s.set(t.scale * (t.radius / t.scale / 0.45), t.scale, t.scale * (t.radius / t.scale / 0.45)),
    );
    this.stump.add(t.id, this.m, this.col(w.color).clone().multiplyScalar(0.8), 0);
  }

  private onChange(t: Tree, k: TreeChange): void {
    const cl = this.chunkLod.get(this.chunkOf(t.id)) ?? 0;
    switch (k) {
      case 'add': {
        const night = isNight(0);
        void night;
        if (!t.hidden && !(t.nightOnly && !this.trees.isStanding(t))) {
          this.addTree(t, cl);
          this.placed.set(t.id, { lod: cl, stump: false });
        } else if (t.hidden) {
          this.addStump(t);
          this.placed.set(t.id, { lod: cl, stump: true });
        }
        break;
      }
      case 'remove': {
        const p = this.placed.get(t.id);
        if (p) {
          if (p.stump) this.stump.remove(t.id);
          else this.removeTree(t, p.lod);
          this.placed.delete(t.id);
        }
        this.shakes.delete(t.id);
        break;
      }
      case 'fell': {
        const p = this.placed.get(t.id);
        if (p && !p.stump) this.removeTree(t, p.lod);
        this.addStump(t);
        this.placed.set(t.id, { lod: cl, stump: true });
        this.shakes.delete(t.id);
        break;
      }
      case 'respawn': {
        const p = this.placed.get(t.id);
        if (p?.stump) this.stump.remove(t.id);
        if (this.trees.isStanding(t)) {
          this.addTree(t, cl);
          this.placed.set(t.id, { lod: cl, stump: false });
        }
        break;
      }
      case 'night': {
        this.addTree(t, cl);
        this.placed.set(t.id, { lod: cl, stump: false });
        break;
      }
      case 'day': {
        const p = this.placed.get(t.id);
        if (p && !p.stump) this.removeTree(t, p.lod);
        this.placed.delete(t.id);
        break;
      }
      case 'hit':
        this.shakes.set(t.id, 0.35);
        break;
    }
  }

  update(dt: number, cx: number, cz: number): void {
    // LOD re-evaluation when the focus chunk changes
    const key = `${Math.floor(cx / 64)},${Math.floor(cz / 64)}`;
    if (key !== this.lastCenter) {
      this.lastCenter = key;
      const touched = new Set<string>();
      for (const t of this.trees.trees.values()) {
        const ck = this.chunkOf(t.id);
        let lod = this.chunkLod.get(ck);
        if (lod === undefined || !touched.has(ck)) {
          const [ccx, ccz] = ck.split(',').map(Number) as [number, number];
          const d = Math.hypot(ccx * 64 + 32 - cx, ccz * 64 + 32 - cz);
          const nl: 0 | 1 = d < HI_DIST ? 0 : 1;
          touched.add(ck);
          this.chunkLod.set(ck, nl);
          lod = nl;
        }
        const p = this.placed.get(t.id);
        if (p && !p.stump && p.lod !== lod) {
          this.removeTree(t, p.lod);
          this.addTree(t, lod);
          p.lod = lod;
        }
      }
    }
    // shakes
    for (const [id, left] of this.shakes) {
      const t = this.trees.trees.get(id);
      const p = this.placed.get(id);
      const nl = left - dt;
      if (!t || !p || p.stump) {
        this.shakes.delete(id);
        continue;
      }
      const amp = nl > 0 ? Math.sin(nl * 60) * 0.035 * (nl / 0.35) : 0;
      const m = this.matrixFor(t, amp, t.yaw);
      this.pools.get(`${t.style}:trunk:${p.lod}`)?.setMatrix(id, m);
      this.pools.get(`${t.style}:leaf:${p.lod}`)?.setMatrix(id, m);
      if (nl <= 0) this.shakes.delete(id);
      else this.shakes.set(id, nl);
    }
    for (const p of this.pools.values()) p.flush();
    this.stump.flush();
  }

  /** Colors for a felled tree's visuals. */
  colorsOf(t: Tree): { trunk: THREE.Color; leaf: THREE.Color; glowT: number; glowL: number } {
    return this.colorsFor(t);
  }
}
