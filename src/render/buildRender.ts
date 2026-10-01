import * as THREE from 'three';
import type { Built } from '../systems/building';
import type { Sim } from '../core/sim';
import { PART_BY_ID } from '../data/parts';
import { WOODS } from '../data/woods';
import { PLOTS } from '../data/plots';
import { InstancePool } from './instancePool';
import { partGeo } from './partGeo';
import { Prims, propMaterial } from './prims';
import { daylight } from '../core/gameTime';

const CAP = 1400;

function textTexture(text: string): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 64;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#f2e6c0';
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#3a2a18';
  let size = 40;
  ctx.font = `800 ${size}px sans-serif`;
  while (ctx.measureText(text).width > 240 && size > 10) ctx.font = `800 ${(size -= 2)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Renders placed parts (instanced), the placement ghost, selection box, plot boundary markers and lamp lights. */
export class BuildRender {
  readonly group = new THREE.Group();
  private bodies = new Map<string, InstancePool>();
  private accents = new Map<string, InstancePool>();
  private ghost: THREE.Mesh | null = null;
  private ghostKind = '';
  private ghostMat = new THREE.MeshBasicMaterial({ color: 0x40ff60, transparent: true, opacity: 0.45, depthWrite: false });
  private sel: THREE.LineSegments;
  private markers = new THREE.Group();
  private markerSig = '';
  private signMeshes = new Map<number, THREE.Mesh>();
  private lights: THREE.PointLight[] = [];
  private lightT = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  private colorCache = new Map<number, THREE.Color>();
  private unsub: (() => void)[] = [];

  constructor(private sim: Sim) {
    const b = sim.building;
    this.group.add(this.markers);
    this.sel = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xffe040 }));
    this.sel.visible = false;
    this.group.add(this.sel);
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffe2a0, 0, 20, 1.6);
      this.lights.push(l);
      this.group.add(l);
    }
    for (const part of b.built.values()) this.add(part);
    const a = (p: Built) => this.add(p);
    const r = (p: Built) => this.remove(p);
    const c = (p: Built) => this.change(p);
    b.onAdd.push(a);
    b.onRemove.push(r);
    b.onChange.push(c);
    this.unsub.push(() => {
      b.onAdd.splice(b.onAdd.indexOf(a), 1);
      b.onRemove.splice(b.onRemove.indexOf(r), 1);
      b.onChange.splice(b.onChange.indexOf(c), 1);
    });
  }

  dispose(): void {
    for (const u of this.unsub) u();
  }

  private pool(map: Map<string, InstancePool>, kind: string, which: 'body' | 'accent'): InstancePool | null {
    let p = map.get(kind);
    if (!p) {
      const g = partGeo(kind);
      const geo = which === 'body' ? g.body : g.accent;
      if (!geo) return null;
      p = new InstancePool(geo, CAP);
      map.set(kind, p);
      this.group.add(p.mesh);
    }
    return p;
  }

  private col(hex: number): THREE.Color {
    let c = this.colorCache.get(hex);
    if (!c) this.colorCache.set(hex, (c = new THREE.Color(hex)));
    return c;
  }

  private matrixOf(b: Built): THREE.Matrix4 {
    const [, x, y, z, ry, sx, sy, sz] = b.p;
    this.q.setFromAxisAngle(this.v.set(0, 1, 0), ry);
    this.m.compose(this.v.set(x, y, z), this.q, this.s.set(sx, sy, sz));
    const def = PART_BY_ID[b.p[0]]!;
    if (def.interactive === 'door' && b.open) {
      // swing 90° about the hinge on the local -x edge
      const hinge = (-def.size[0] * sx) / 2;
      const t1 = new THREE.Matrix4().makeTranslation(hinge, 0, 0);
      const rot = new THREE.Matrix4().makeRotationY(-Math.PI / 2);
      const t2 = new THREE.Matrix4().makeTranslation(-hinge, 0, 0);
      this.m.multiply(t1).multiply(rot).multiply(t2);
    }
    return this.m;
  }

  private colorOf(b: Built): THREE.Color {
    const paint = b.p[8];
    if (paint) return this.c.copy(this.col(paint));
    const wood = WOODS[b.p[9]];
    return this.c.copy(this.col(wood?.color ?? 0x9a6a3a)).lerp(this.col(0xffffff), 0.1);
  }

  private add(b: Built): void {
    const id = String(b.id);
    const kind = b.p[0];
    const m = this.matrixOf(b);
    const body = this.pool(this.bodies, kind, 'body');
    body?.add(id, m, this.colorOf(b), 0);
    const acc = this.pool(this.accents, kind, 'accent');
    if (acc) {
      const glow = kind === 'lamp' || kind === 'lantern' ? 0.9 : 0;
      acc.add(id, m, this.c.set(0xffffff), glow);
    }
    if (kind === 'sign') this.addSign(b);
  }
  private remove(b: Built): void {
    const id = String(b.id);
    this.bodies.get(b.p[0])?.remove(id);
    this.accents.get(b.p[0])?.remove(id);
    const s = this.signMeshes.get(b.id);
    if (s) {
      this.group.remove(s);
      this.signMeshes.delete(b.id);
    }
  }
  private change(b: Built): void {
    const id = String(b.id);
    const m = this.matrixOf(b);
    const body = this.bodies.get(b.p[0]);
    body?.setMatrix(id, m);
    this.accents.get(b.p[0])?.setMatrix(id, m);
    // recolor: remove+add keeps things simple
    if (body) {
      body.remove(id);
      body.add(id, m, this.colorOf(b), 0);
    }
    const s = this.signMeshes.get(b.id);
    if (s) {
      this.group.remove(s);
      this.signMeshes.delete(b.id);
      this.addSign(b);
    }
  }
  private addSign(b: Built): void {
    const text = this.sim.state.plots[b.plot]?.texts[String(b.p[10])] ?? 'Sign';
    const def = PART_BY_ID.sign!;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry((def.size[0] - 0.24) * b.p[5], 0.44 * b.p[6]), new THREE.MeshBasicMaterial({ map: textTexture(text), side: THREE.DoubleSide }));
    const [, x, y, z, ry] = b.p;
    const off = new THREE.Vector3(0, (def.size[1] - 0.4) * b.p[6], 0.095 * b.p[7]).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
    mesh.position.set(x + off.x, y + off.y, z + off.z);
    mesh.rotation.y = ry;
    this.group.add(mesh);
    this.signMeshes.set(b.id, mesh);
  }

  update(dt: number): void {
    const sim = this.sim;
    const bs = sim.building;
    for (const p of this.bodies.values()) p.flush();
    for (const p of this.accents.values()) p.flush();
    // ghost
    const showGhost = bs.active && bs.tool === 'place';
    if (showGhost) {
      if (!this.ghost || this.ghostKind !== bs.kind) {
        if (this.ghost) this.group.remove(this.ghost);
        const g = partGeo(bs.kind);
        const geos = [g.body];
        if (g.accent) geos.push(g.accent);
        this.ghost = new THREE.Mesh(g.body, this.ghostMat);
        this.ghostKind = bs.kind;
        this.group.add(this.ghost);
      }
      const gh = bs.ghost;
      this.ghost.visible = true;
      this.ghost.position.set(gh.x, gh.y, gh.z);
      this.ghost.rotation.y = bs.rot;
      this.ghost.scale.set(bs.scale[0], bs.scale[1], bs.scale[2]);
      this.ghostMat.color.setHex(gh.valid ? 0x40ff60 : 0xff4040);
    } else if (this.ghost) this.ghost.visible = false;
    // selection
    const selB = bs.selection !== null ? bs.built.get(bs.selection) : null;
    if (selB && bs.active) {
      const d = PART_BY_ID[selB.p[0]]!;
      this.sel.visible = true;
      this.sel.position.set(selB.p[1], selB.p[2] + (d.size[1] * selB.p[6]) / 2, selB.p[3]);
      this.sel.rotation.y = selB.p[4];
      this.sel.scale.set(d.size[0] * selB.p[5] + 0.08, d.size[1] * selB.p[6] + 0.08, d.size[2] * selB.p[7] + 0.08);
    } else this.sel.visible = false;
    // markers
    const sig = PLOTS.map((p) => (sim.state.plots[p.id] ? sim.state.plots[p.id]!.sections : 0)).join('');
    if (sig !== this.markerSig) {
      this.markerSig = sig;
      this.buildMarkers();
    }
    // lamp lights
    this.lightT -= dt;
    if (this.lightT <= 0) {
      this.lightT = 0.5;
      const dark = daylight(sim.state.time) < 0.55;
      const cands: { x: number; y: number; z: number; d: number }[] = [];
      if (dark) {
        for (const b of bs.built.values()) {
          const k = b.p[0];
          if (k !== 'lamp' && k !== 'lantern') continue;
          const d = Math.hypot(b.p[1] - sim.player.x, b.p[3] - sim.player.z);
          if (d < 60) cands.push({ x: b.p[1], y: b.p[2] + (PART_BY_ID[k]!.size[1] * b.p[6]) * 0.85, z: b.p[3], d });
        }
        cands.sort((a, b) => a.d - b.d);
      }
      this.lights.forEach((l, i) => {
        const c = cands[i];
        if (c) {
          l.position.set(c.x, c.y, c.z);
          l.intensity = 2.2;
        } else l.intensity = 0;
      });
    }
  }

  private buildMarkers(): void {
    this.markers.clear();
    const sim = this.sim;
    const T = sim.streamer.terrain;
    const p = new Prims();
    for (const def of PLOTS) {
      const owned = !!sim.state.plots[def.id];
      const r = sim.plots.rect(def, owned ? undefined : 1);
      const col = owned ? 0x4ad850 : 0xe05a3a;
      const post = (x: number, z: number, h = 1.4) => {
        const y = def.biome === 'sky' ? (T.skyIslandHeight(x, z) ?? 220) : T.heightAt(x, z);
        p.box(0.2, h, 0.2, x, y + h / 2, z, 0x6a4a2a).box(0.26, 0.2, 0.26, x, y + h + 0.1, z, col);
      };
      const stepX = 8, stepZ = 8;
      for (let x = r.x0; x <= r.x1 + 0.1; x += (r.x1 - r.x0) / Math.max(1, Math.round((r.x1 - r.x0) / stepX))) {
        post(x, r.z0);
        post(x, r.z1);
      }
      for (let z = r.z0 + (r.z1 - r.z0) / Math.max(1, Math.round((r.z1 - r.z0) / stepZ)); z < r.z1 - 0.1; z += (r.z1 - r.z0) / Math.max(1, Math.round((r.z1 - r.z0) / stepZ))) {
        post(r.x0, z);
        post(r.x1, z);
      }
      if (!owned) {
        const cx = def.center[0], cz = r.z1 + 1.5;
        const y = def.biome === 'sky' ? (T.skyIslandHeight(cx, cz) ?? 220) : T.heightAt(cx, cz);
        p.box(0.25, 3.4, 0.25, cx, y + 1.7, cz, 0x4a3220);
        p.box(3.2, 1.3, 0.2, cx, y + 3.2, cz, 0xe8d8a8);
        const lbl = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.1), new THREE.MeshBasicMaterial({ map: textTexture(`${def.name}  $${def.price.toLocaleString()}`), side: THREE.DoubleSide }));
        lbl.position.set(cx, y + 3.2, cz + 0.12);
        this.markers.add(lbl);
      }
    }
    const mesh = new THREE.Mesh(p.build(), propMaterial());
    mesh.castShadow = false;
    this.markers.add(mesh);
  }
}
