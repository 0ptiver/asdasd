import * as THREE from 'three';
import { MUTATION_BY_ID, WOOD_BY_ID } from '../data/woods';
import type { LogSystem } from '../systems/logs';
import type { FallingTree } from '../systems/logs';
import { InstancePool } from './instancePool';
import { Prims, propMaterial } from './prims';
import { treeGeo } from './treeGeo';
import { glowMaterial } from './instancePool';
import type { TreeRenderer } from './treeRender';

const logGeo = () => new Prims().cyl(1, 1, 1, 10, 0, 0, 0, 0xffffff, undefined, 0.74).cyl(0.97, 0.97, 0.02, 10, 0, 0.5, 0, 0xffffff, undefined, 1.15).cyl(0.97, 0.97, 0.02, 10, 0, -0.5, 0, 0xffffff, undefined, 1.15).build();

/** Logs: instanced cylinders, written from physics bodies each frame. Also animates falling trees. */
export class LogRenderer {
  readonly group = new THREE.Group();
  private pool = new InstancePool(logGeo(), 700);
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  private colors = new Map<string, THREE.Color>();
  private falls = new Map<string, THREE.Group>();

  constructor(private logs: LogSystem, private trees: TreeRenderer) {
    this.group.add(this.pool.mesh);
    logs.onFallStart.push((f) => this.startFall(f));
    logs.onFallEnd.push((f) => this.endFall(f));
    for (const f of logs.falling) this.startFall(f);
  }

  private color(id: string, mut: string | null): THREE.Color {
    const key = id + ':' + (mut ?? '');
    let c = this.colors.get(key);
    if (!c) {
      c = new THREE.Color(WOOD_BY_ID[id]?.color ?? 0x7a5230);
      const tint = mut ? MUTATION_BY_ID[mut]?.tint : null;
      if (tint) c.lerp(new THREE.Color(tint), 0.65);
      this.colors.set(key, c);
    }
    return c;
  }

  private startFall(f: FallingTree): void {
    const t = f.tree;
    const g = new THREE.Group();
    const geo = treeGeo(t.style, false);
    const col = this.trees.colorsOf(t as any);
    const trunk = new THREE.Mesh(geo.trunk, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, color: col.trunk, emissive: col.trunk, emissiveIntensity: col.glowT * 0.5 }));
    trunk.castShadow = true;
    g.add(trunk);
    if (geo.foliage) {
      const leaf = new THREE.Mesh(geo.foliage, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, color: col.leaf, emissive: col.leaf, emissiveIntensity: col.glowL * 0.5 }));
      leaf.castShadow = true;
      g.add(leaf);
    }
    g.position.set(t.x, t.y, t.z);
    g.scale.setScalar(t.scale);
    g.userData = { f };
    this.group.add(g);
    this.falls.set(f.id, g);
  }
  private endFall(f: FallingTree): void {
    const g = this.falls.get(f.id);
    if (g) {
      this.group.remove(g);
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.material) (m.material as THREE.Material).dispose();
      });
      this.falls.delete(f.id);
    }
  }

  update(): void {
    let i = 0;
    for (const l of this.logs.logs.values()) {
      const t = l.body.translation();
      const q = l.body.rotation();
      this.p.set(t.x, t.y, t.z);
      this.q.set(q.x, q.y, q.z, q.w);
      this.s.set(l.r, l.len, l.r);
      this.m.compose(this.p, this.q, this.s);
      const w = WOOD_BY_ID[l.wood]!;
      this.c.copy(this.color(l.wood, l.mut));
      if (l.grabbed) this.c.multiplyScalar(1.15);
      this.pool.setAt(i++, this.m, this.c, w.emissive || l.mut === 'golden' || l.mut === 'cursed' ? 0.5 : 0);
    }
    this.pool.setCount(i);
    this.pool.flush();
    // falling trees
    const axis = new THREE.Vector3();
    for (const g of this.falls.values()) {
      const f = (g.userData as { f: FallingTree }).f;
      axis.set(f.dz, 0, -f.dx);
      g.quaternion.setFromAxisAngle(axis, f.angle);
    }
  }
}
void propMaterial;
void glowMaterial;
