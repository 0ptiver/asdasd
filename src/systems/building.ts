import type { Sim, System } from '../core/sim';
import { G, grp, GROUPS, RAPIER } from '../physics/world';
import { PART_BY_ID, PARTS, type PartDef } from '../data/parts';
import { WOODS, WOOD_BY_ID } from '../data/woods';
import { PLOT_BY_ID } from '../data/plots';
import type { PlacedPart } from '../save/schema';
import { itemName } from './itemValue';
import { levelOf } from '../core/skills';
import { CONFIG } from '../config';
import { Terrain } from '../world/terrain';
import { VISIT } from '../world/layout';

export interface Built {
  id: number;
  plot: string;
  p: PlacedPart;
  body: RAPIER.RigidBody | null;
  open: boolean;
  /** logic power state (switch / gates) */
  power: boolean;
}

export type Tool = 'place' | 'select' | 'delete' | 'wire';
export const UID_KINDS = new Set([
  'chest',
  'sign',
  'door',
  'gate',
  'lamp',
  'lantern',
  'piston',
  'conveyor',
  'screen',
  'switch',
  'timer',
  'sensor',
  'gate_and',
  'gate_not',
  'sawmill',
  'sellstand',
  'workbench',
  'workshop',
  'factory',
  'firewood_stall',
]);

type Op =
  | { t: 'add'; plot: string; p: PlacedPart; id: number }
  | { t: 'remove'; plot: string; p: PlacedPart }
  | { t: 'xform'; id: number; before: PlacedPart; after: PlacedPart };

export interface Ghost {
  x: number;
  y: number;
  z: number;
  valid: boolean;
  reason: string;
  plot: string | null;
}

const QUERY = grp(G.PLAYER, G.GROUND | G.BUILD);
const woodIndex = (id: string): number =>
  Math.max(
    0,
    WOODS.findIndex((w) => w.id === id),
  );

/** Freeform plot building: placement with snapping, selection/move/rotate/scale, undo/redo, blueprints, colliders. */
export class BuildingSystem implements System {
  readonly name = 'building';
  readonly built = new Map<number, Built>();
  private colliderMap = new Map<number, Built>();
  private nextId = 1;
  onAdd: ((b: Built) => void)[] = [];
  onRemove: ((b: Built) => void)[] = [];
  onChange: ((b: Built) => void)[] = [];

  // ---- build mode state
  active = false;
  tool: Tool = 'place';
  kind = 'wall';
  wood = 'oak';
  color = 0;
  rot = 0;
  scale: [number, number, number] = [1, 1, 1];
  snap = 1;
  yOff = 0;
  selection: number | null = null;
  clipboard: { p: PlacedPart; dx: number; dy: number; dz: number }[] = [];
  ghost: Ghost = { x: 0, y: 0, z: 0, valid: false, reason: '', plot: null };
  signText = 'Sign';
  private undoStack: Op[] = [];
  private redoStack: Op[] = [];
  private priLast = false;
  private secLast = false;
  private tick = 0;
  /** unit-less count of parts placed (for quests) */
  constructor(private sim: Sim) {}

  init(): void {
    for (const [plot, st] of Object.entries(this.sim.state.plots)) {
      for (const p of st.parts) this.register(plot, p, false);
    }
  }

  // --------------------------------------------------------------- registry
  private register(plot: string, p: PlacedPart, withCollider: boolean): Built {
    const b: Built = {
      id: this.nextId++,
      plot,
      p,
      body: null,
      open: false,
      power: false,
    };
    this.built.set(b.id, b);
    if (withCollider) this.addCollider(b);
    for (const f of this.onAdd) f(b);
    return b;
  }

  def(b: Built): PartDef {
    return PART_BY_ID[b.p[0]]!;
  }

  private addCollider(b: Built): void {
    if (b.body) return;
    const d = this.def(b);
    if (d.collider === 'none') return;
    if (d.interactive === 'door' && b.open) return;
    const [, x, y, z, ry, sx, sy, sz] = b.p;
    const hx = (d.size[0] * sx) / 2;
    const hy = (d.size[1] * sy) / 2;
    const hz = (d.size[2] * sz) / 2;
    const w = this.sim.physics.world;
    const cy = Math.sin(ry / 2);
    const cw = Math.cos(ry / 2);
    let rot = { x: 0, y: cy, z: 0, w: cw };
    let desc: RAPIER.ColliderDesc;
    let ty = y + hy;
    if (d.collider === 'ramp') {
      // slab along the incline, rising toward local +z (visual wedge rises toward +z)
      const L = Math.hypot(hy * 2, hz * 2);
      const ang = Math.atan2(hy * 2, hz * 2);
      const pitch = { x: Math.sin(-ang / 2), y: 0, z: 0, w: Math.cos(-ang / 2) };
      rot = quatMul(rot, pitch);
      desc = RAPIER.ColliderDesc.cuboid(hx, 0.12, L / 2);
      ty = y + hy;
    } else desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz);
    const body = w.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, ty, z).setRotation(rot));
    const col = w.createCollider(desc.setCollisionGroups(GROUPS.build).setFriction(0.9), body);
    b.body = body;
    this.colliderMap.set(col.handle, b);
  }
  private dropCollider(b: Built): void {
    if (!b.body) return;
    for (let i = 0; i < b.body.numColliders(); i++) this.colliderMap.delete(b.body.collider(i).handle);
    this.sim.physics.world.removeRigidBody(b.body);
    b.body = null;
  }

  // --------------------------------------------------------------- costs
  /** Cost of a part as { itemId: n, money: n }. */
  costOf(def: PartDef): { items: Record<string, number>; money: number } {
    const items: Record<string, number> = {};
    if (def.furniture) items[`${def.furniture}@${this.wood}`] = 1;
    else if (def.planks) items['plank_' + this.wood] = def.planks;
    return { items, money: def.money ?? 0 };
  }
  costOfPart(p: PlacedPart): { items: Record<string, number>; money: number } {
    const def = PART_BY_ID[p[0]]!;
    const wood = WOODS[p[9]]?.id ?? 'oak';
    const items: Record<string, number> = {};
    if (def.furniture) items[`${def.furniture}@${wood}`] = 1;
    else if (def.planks) items['plank_' + wood] = def.planks;
    return { items, money: def.money ?? 0 };
  }
  canAfford(c: { items: Record<string, number>; money: number }): boolean {
    for (const [id, n] of Object.entries(c.items)) if (!this.sim.inventory.has(id, n)) return false;
    return this.sim.state.money >= c.money;
  }
  private pay(c: { items: Record<string, number>; money: number }): boolean {
    if (!this.canAfford(c)) return false;
    for (const [id, n] of Object.entries(c.items)) this.sim.inventory.remove(id, n);
    if (c.money) this.sim.econ.spend(c.money, 'build');
    return true;
  }
  private refund(c: { items: Record<string, number>; money: number }): void {
    for (const [id, n] of Object.entries(c.items)) {
      const left = this.sim.inventory.add(id, n);
      if (left)
        this.sim.bus.emit('notify', { text: `Inventory full — lost ${left}× ${itemName(id)}`, kind: 'bad' });
    }
    if (c.money) this.sim.econ.earn(Math.round(c.money * 0.5), 'refund');
  }

  // --------------------------------------------------------------- mutate
  /** Place a part (data in plot coordinates = world coordinates). Returns the Built or an error string. */
  place(plot: string, p: PlacedPart, opts: { free?: boolean; record?: boolean } = {}): Built | string {
    const def = PART_BY_ID[p[0]];
    if (!def) return 'Unknown part';
    const st = this.sim.state.plots[plot];
    if (!st) return 'You do not own this plot';
    if (st.parts.length >= this.sim.plots.partCap(plot)) return 'Part limit reached for this plot';
    if (def.unlock && levelOf(this.sim.state.skills.crafting) < def.unlock)
      return `Needs Crafting level ${def.unlock}`;
    if (!opts.free) {
      const cost = this.costOfPart(p);
      if (!this.pay(cost)) return 'Not enough materials';
    }
    // dup check
    for (const o of st.parts)
      if (
        o[0] === p[0] &&
        Math.abs(o[1] - p[1]) < 0.05 &&
        Math.abs(o[2] - p[2]) < 0.05 &&
        Math.abs(o[3] - p[3]) < 0.05 &&
        Math.abs(o[4] - p[4]) < 0.05
      )
        return 'Already placed here';
    if (UID_KINDS.has(p[0]) && p[10] === undefined) p[10] = this.sim.state.world.nextUid++;
    if (p[0] === 'sign') st.texts[String(p[10])] = this.signText;
    st.parts.push(p);
    const near = Math.hypot(p[1] - this.sim.player.x, p[3] - this.sim.player.z) < 200;
    const b = this.register(plot, p, near);
    this.sim.state.stats.partsPlaced = (this.sim.state.stats.partsPlaced ?? 0) + 1;
    this.sim.quests.progress('build', undefined, 1);
    this.sim.bus.emit('sfx', { name: 'chop', x: p[1], y: p[2], z: p[3], vol: 0.5 });
    if (opts.record !== false) this.pushUndo({ t: 'add', plot, p: [...p] as PlacedPart, id: b.id });
    return b;
  }

  remove(id: number, record = true): boolean {
    const b = this.built.get(id);
    if (!b) return false;
    const st = this.sim.state.plots[b.plot];
    if (!st) return false;
    const def = this.def(b);
    if (def.interactive === 'chest') {
      const c = st.chests[String(b.p[10])];
      if (c && c.length) {
        this.sim.bus.emit('notify', { text: 'Empty the chest first', kind: 'bad' });
        return false;
      }
    }
    if (def.interactive === 'sawmill' || def.interactive === 'sellstand')
      delete st.businesses[String(b.p[10] ?? '')];
    this.dropCollider(b);
    const i = st.parts.indexOf(b.p);
    if (i >= 0) st.parts.splice(i, 1);
    this.built.delete(id);
    for (const f of this.onRemove) f(b);
    if (this.selection === id) this.selection = null;
    this.refund(this.costOfPart(b.p));
    if (record) this.pushUndo({ t: 'remove', plot: b.plot, p: [...b.p] as PlacedPart });
    this.sim.bus.emit('sfx', { name: 'whiff', x: b.p[1], y: b.p[2], z: b.p[3], vol: 0.5 });
    return true;
  }

  /** Edit a placed part's transform/paint. */
  edit(
    id: number,
    patch: Partial<{
      x: number;
      y: number;
      z: number;
      ry: number;
      sx: number;
      sy: number;
      sz: number;
      color: number;
      mat: number;
    }>,
    record = true,
  ): boolean {
    const b = this.built.get(id);
    if (!b) return false;
    const before = [...b.p] as PlacedPart;
    const p = b.p;
    if (patch.x !== undefined) p[1] = patch.x;
    if (patch.y !== undefined) p[2] = patch.y;
    if (patch.z !== undefined) p[3] = patch.z;
    if (patch.ry !== undefined) p[4] = patch.ry;
    if (patch.sx !== undefined) p[5] = patch.sx;
    if (patch.sy !== undefined) p[6] = patch.sy;
    if (patch.sz !== undefined) p[7] = patch.sz;
    if (patch.color !== undefined) p[8] = patch.color;
    if (patch.mat !== undefined) p[9] = patch.mat;
    // must stay inside its plot
    const def = PLOT_BY_ID[b.plot]!;
    const r = this.sim.plots.rect(def);
    if (p[1] < r.x0 || p[1] > r.x1 || p[3] < r.z0 || p[3] > r.z1) {
      for (let i = 0; i < before.length; i++) (p as any)[i] = before[i];
      return false;
    }
    this.dropCollider(b);
    if (Math.hypot(p[1] - this.sim.player.x, p[3] - this.sim.player.z) < 200) this.addCollider(b);
    for (const f of this.onChange) f(b);
    if (record) this.pushUndo({ t: 'xform', id, before, after: [...p] as PlacedPart });
    return true;
  }

  private pushUndo(op: Op): void {
    this.undoStack.push(op);
    if (this.undoStack.length > 120) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  undo(): void {
    const op = this.undoStack.pop();
    if (!op) return;
    if (op.t === 'add') {
      this.remove(op.id, false);
    } else if (op.t === 'remove') {
      const r = this.place(op.plot, [...op.p] as PlacedPart, { record: false });
      if (typeof r === 'string') this.sim.bus.emit('notify', { text: 'Cannot undo: ' + r, kind: 'bad' });
      else op.p = [...op.p] as PlacedPart;
      if (typeof r !== 'string') this.undoStack.length && void 0;
    } else {
      const b = this.built.get(op.id);
      if (b)
        this.edit(
          op.id,
          {
            x: op.before[1],
            y: op.before[2],
            z: op.before[3],
            ry: op.before[4],
            sx: op.before[5],
            sy: op.before[6],
            sz: op.before[7],
            color: op.before[8],
            mat: op.before[9],
          },
          false,
        );
    }
    this.redoStack.push(op);
  }
  redo(): void {
    const op = this.redoStack.pop();
    if (!op) return;
    if (op.t === 'add') {
      const r = this.place(op.plot, [...op.p] as PlacedPart, { record: false });
      if (typeof r !== 'string') op.id = r.id;
    } else if (op.t === 'remove') {
      const st = this.sim.state.plots[op.plot];
      const b = [...this.built.values()].find(
        (x) =>
          x.plot === op.plot &&
          st?.parts.includes(x.p) &&
          x.p[1] === op.p[1] &&
          x.p[3] === op.p[3] &&
          x.p[0] === op.p[0],
      );
      if (b) this.remove(b.id, false);
    } else {
      this.edit(
        op.id,
        {
          x: op.after[1],
          y: op.after[2],
          z: op.after[3],
          ry: op.after[4],
          sx: op.after[5],
          sy: op.after[6],
          sz: op.after[7],
          color: op.after[8],
          mat: op.after[9],
        },
        false,
      );
    }
    this.undoStack.push(op);
  }

  // --------------------------------------------------------------- blueprints
  saveBlueprint(plot: string, name: string): number {
    const st = this.sim.state.plots[plot];
    if (!st || !name) return 0;
    const def = PLOT_BY_ID[plot]!;
    const [cx, cz] = def.center;
    const parts = st.parts.map(
      (p) =>
        [
          p[0],
          round(p[1] - cx),
          round(p[2]),
          round(p[3] - cz),
          p[4],
          p[5],
          p[6],
          p[7],
          p[8],
          p[9],
          p[10],
        ] as PlacedPart,
    );
    st.blueprints[name] = parts;
    this.sim.bus.emit('notify', { text: `Blueprint "${name}" saved (${parts.length} parts)`, kind: 'good' });
    return parts.length;
  }
  blueprintCost(parts: PlacedPart[]): Record<string, number> {
    const need: Record<string, number> = {};
    for (const p of parts) {
      const c = this.costOfPart(p);
      for (const [k, v] of Object.entries(c.items)) need[k] = (need[k] ?? 0) + v;
      if (c.money) need.money = (need.money ?? 0) + c.money;
    }
    return need;
  }
  /** Place a blueprint centered on (ox,oz) with ground-relative y. Fails atomically if materials are missing. */
  loadBlueprint(plot: string, name: string, ox: number, oz: number, yaw = 0): string | null {
    const st = this.sim.state.plots[plot];
    const bp = st?.blueprints[name] ?? this.findBlueprint(name);
    if (!st || !bp) return 'No such blueprint';
    const need = this.blueprintCost(bp);
    for (const [k, v] of Object.entries(need)) {
      if (k === 'money' ? this.sim.state.money < v : !this.sim.inventory.has(k, v))
        return `Missing materials: ${k === 'money' ? '$' + v : v + '× ' + itemName(k)}`;
    }
    if (st.parts.length + bp.length > this.sim.plots.partCap(plot)) return 'Would exceed the plot part limit';
    const gy = this.sim.streamer.terrain.heightAt(ox, oz);
    const s = Math.sin(yaw),
      c = Math.cos(yaw);
    let placed = 0;
    for (const p of bp) {
      const rx = p[1] * c + p[3] * s,
        rz = -p[1] * s + p[3] * c;
      const q: PlacedPart = [
        p[0],
        ox + rx,
        gy + p[2],
        oz + rz,
        p[4] + yaw,
        p[5],
        p[6],
        p[7],
        p[8],
        p[9],
        UID_KINDS.has(p[0]) ? undefined : p[10],
      ];
      const r = this.place(plot, q, { record: false });
      if (typeof r !== 'string') placed++;
    }
    this.sim.bus.emit('notify', { text: `Placed ${placed} parts from "${name}"`, kind: 'good' });
    return null;
  }
  private findBlueprint(name: string): PlacedPart[] | undefined {
    for (const st of Object.values(this.sim.state.plots)) if (st.blueprints[name]) return st.blueprints[name];
    return undefined;
  }

  // --------------------------------------------------------------- interaction
  use(id: number): void {
    const b = this.built.get(id);
    if (!b) return;
    const d = this.def(b);
    const s = this.sim;
    switch (d.interactive) {
      case 'door':
        b.open = !b.open;
        if (b.open) this.dropCollider(b);
        else this.addCollider(b);
        for (const f of this.onChange) f(b);
        s.bus.emit('sfx', { name: 'whiff', x: b.p[1], y: b.p[2], z: b.p[3], vol: 0.5 });
        break;
      case 'chest':
        s.game.openPanel('chest', String(id));
        break;
      case 'switch':
        if (d.id === 'bed') {
          const night = s.state.time % 1;
          if (night > 0.7 || night < 0.25) {
            s.state.time = Math.floor(s.state.time) + (night > 0.7 ? 1 : 0) + 0.3;
            s.state.player.hp = 100;
            s.bus.emit('notify', { text: 'You slept until morning', kind: 'good' });
          } else s.bus.emit('notify', { text: 'You can only sleep at night (after 17:00)', kind: 'info' });
        } else {
          b.power = !b.power;
          s.bus.emit('sfx', { name: 'click' });
        }
        break;
      default:
        if (b.plot !== 'visit') s.game.openPanel('part', String(id));
    }
  }

  chestOf(id: number) {
    const b = this.built.get(id);
    if (!b || b.plot === 'visit' || this.def(b).interactive !== 'chest') return null;
    const st = this.sim.state.plots[b.plot]!;
    return (st.chests[String(b.p[10])] ??= []);
  }

  /** Ray vs oriented part box (slab test). Returns distance or -1. */
  private rayPart(
    b: Built,
    o: { x: number; y: number; z: number },
    d: { x: number; y: number; z: number },
  ): number {
    const def = this.def(b);
    const [, x, y, z, ry, sx, sy, sz] = b.p;
    const c = Math.cos(-ry),
      s = Math.sin(-ry);
    const lx = o.x - x,
      ly = o.y - (y + (def.size[1] * sy) / 2),
      lz = o.z - z;
    const ox = lx * c + lz * s,
      oz = -lx * s + lz * c;
    const dx = d.x * c + d.z * s,
      dz = -d.x * s + d.z * c;
    const h = [(def.size[0] * sx) / 2, (def.size[1] * sy) / 2, (def.size[2] * sz) / 2] as const;
    let t0 = 0,
      t1 = 1e9;
    const O = [ox, ly, oz],
      D = [dx, d.y, dz];
    for (let i = 0; i < 3; i++) {
      if (Math.abs(D[i]!) < 1e-9) {
        if (Math.abs(O[i]!) > h[i]!) return -1;
      } else {
        let a = (-h[i]! - O[i]!) / D[i]!,
          bb = (h[i]! - O[i]!) / D[i]!;
        if (a > bb) [a, bb] = [bb, a];
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, bb);
        if (t0 > t1) return -1;
      }
    }
    return t0;
  }

  pickPart(maxDist = 40): Built | null {
    const r = this.aimRay();
    let best: Built | null = null;
    let bd = maxDist;
    const pl = this.sim.player;
    for (const b of this.built.values()) {
      if (Math.abs(b.p[1] - pl.x) > 60 || Math.abs(b.p[3] - pl.z) > 60) continue;
      const t = this.rayPart(b, { x: r.ox, y: r.oy, z: r.oz }, { x: r.dx, y: r.dy, z: r.dz });
      if (t >= 0 && t < bd) {
        bd = t;
        best = b;
      }
    }
    return best;
  }

  // --------------------------------------------------------------- visiting other players' plots (read-only)
  visitOwner: string | null = null;
  /** Show another player's shared plots on the Visitor Isle. */
  loadVisit(owner: string, plots: Record<string, unknown[]>): void {
    this.clearVisit();
    this.visitOwner = owner;
    let ox = VISIT.x - VISIT.hx + 25;
    for (const [plotId, parts] of Object.entries(plots)) {
      const def = PLOT_BY_ID[plotId];
      if (!def) continue;
      for (const raw of parts) {
        const p = raw as PlacedPart;
        if (!PART_BY_ID[p[0]]) continue;
        const q: PlacedPart = [
          p[0],
          ox + (p[1] - def.center[0]),
          VISIT.y + (p[2] - this.sim.streamer.terrain.heightAt(def.center[0], def.center[1])),
          VISIT.z + (p[3] - def.center[1]),
          p[4],
          p[5],
          p[6],
          p[7],
          p[8],
          p[9],
          undefined,
        ];
        this.register('visit', q, true);
      }
      ox += def.size[0] + 16;
    }
    this.sim.player.teleport(VISIT.x - VISIT.hx + 12, VISIT.z + VISIT.hz - 6, VISIT.y);
    this.sim.bus.emit('notify', { text: `Visiting ${owner}'s plots (look, but don't touch!)`, kind: 'good' });
  }
  clearVisit(): void {
    for (const b of [...this.built.values()]) {
      if (b.plot !== 'visit') continue;
      this.dropCollider(b);
      this.built.delete(b.id);
      for (const f of this.onRemove) f(b);
    }
    this.visitOwner = null;
  }

  // --------------------------------------------------------------- build mode
  setMode(on: boolean): void {
    if (on && this.visitOwner) {
      this.sim.bus.emit('notify', { text: 'You cannot build while visiting', kind: 'bad' });
      return;
    }
    this.active = on;
    const inp = this.sim.game.input;
    inp.freeCursor = on;
    if (on) inp.releasePointer();
    else inp.requestPointer();
    if (!on) this.selection = null;
    this.sim.player.camDist = on ? Math.max(this.sim.player.camDist, 9) : this.sim.player.camDist;
  }

  halfExtents(def: PartDef, ry: number, s: [number, number, number]): { hx: number; hz: number; h: number } {
    const w = (def.size[0] * s[0]) / 2,
      d = (def.size[2] * s[2]) / 2;
    const c = Math.abs(Math.cos(ry)),
      si = Math.abs(Math.sin(ry));
    return { hx: c * w + si * d, hz: si * w + c * d, h: def.size[1] * s[1] };
  }

  /** Aim ray: cursor position in build mode (free cursor), crosshair otherwise. */
  aimRay() {
    const inp = this.sim.game.input;
    return inp.freeCursor ? this.sim.player.screenRay(inp.mouseNX, inp.mouseNY) : this.sim.player.cameraRay();
  }

  private computeGhost(): void {
    const sim = this.sim;
    const def = PART_BY_ID[this.kind];
    const g = this.ghost;
    if (!def) return;
    const r = this.aimRay();
    const ray = new RAPIER.Ray({ x: r.ox, y: r.oy, z: r.oz }, { x: r.dx, y: r.dy, z: r.dz });
    const hit = sim.physics.world.castRayAndGetNormal(ray, 60, true, undefined, QUERY);
    const ext = this.halfExtents(def, this.rot, this.scale);
    if (!hit) {
      g.valid = false;
      g.reason = 'Aim at the ground';
      return;
    }
    const px = r.ox + r.dx * hit.timeOfImpact,
      py = r.oy + r.dy * hit.timeOfImpact,
      pz = r.oz + r.dz * hit.timeOfImpact;
    const n = hit.normal;
    const other = this.colliderMap.get(hit.collider.handle);
    const sn = this.snap;
    let x = Math.round(px / sn) * sn;
    let z = Math.round(pz / sn) * sn;
    let y: number;
    if (other) {
      const od = this.def(other);
      const oext = this.halfExtents(od, other.p[4], [other.p[5], other.p[6], other.p[7]]);
      if (n.y > 0.7) {
        y = od.collider === 'ramp' ? py : other.p[2] + oext.h;
        x = other.p[1] + Math.round((px - other.p[1]) / sn) * sn;
        z = other.p[3] + Math.round((pz - other.p[3]) / sn) * sn;
      } else if (Math.abs(n.y) <= 0.7) {
        // flush against the side of the neighbor
        y = other.p[2];
        if (Math.abs(n.x) > Math.abs(n.z)) {
          x = other.p[1] + Math.sign(n.x) * (oext.hx + ext.hx);
          z = other.p[3] + Math.round((pz - other.p[3]) / sn) * sn;
        } else {
          z = other.p[3] + Math.sign(n.z) * (oext.hz + ext.hz);
          x = other.p[1] + Math.round((px - other.p[1]) / sn) * sn;
        }
      } else y = py;
    } else {
      const T = sim.streamer.terrain;
      y = Math.max(
        T.surfaceAt(x, z, py + 1),
        T.surfaceAt(x - ext.hx, z - ext.hz, py + 1),
        T.surfaceAt(x + ext.hx, z + ext.hz, py + 1),
      );
      if (hit.collider && n.y < 0.5) y = Math.max(y, py);
    }
    y += this.yOff;
    g.x = x;
    g.y = y;
    g.z = z;
    // validity: inside an owned plot
    const plot = sim.plots.plotAt(x, z, true);
    g.plot = plot?.id ?? null;
    if (!plot) {
      g.valid = false;
      g.reason = sim.plots.plotAt(x, z) ? 'You do not own this plot' : 'Not on one of your plots';
      return;
    }
    const rc = sim.plots.rect(plot);
    if (
      x - ext.hx < rc.x0 - 0.01 ||
      x + ext.hx > rc.x1 + 0.01 ||
      z - ext.hz < rc.z0 - 0.01 ||
      z + ext.hz > rc.z1 + 0.01
    ) {
      g.valid = false;
      g.reason = 'Outside the plot boundary';
      return;
    }
    const st = sim.state.plots[plot.id]!;
    if (st.parts.length >= sim.plots.partCap(plot.id)) {
      g.valid = false;
      g.reason = `Part limit (${st.parts.length}/${sim.plots.partCap(plot.id)})`;
      return;
    }
    if (def.unlock && levelOf(sim.state.skills.crafting) < def.unlock) {
      g.valid = false;
      g.reason = `Needs Crafting level ${def.unlock}`;
      return;
    }
    const cost = this.costOf(def);
    if (!this.canAfford(cost)) {
      g.valid = false;
      g.reason =
        'Not enough: ' +
        Object.entries(cost.items)
          .map(([k, v]) => `${v}× ${itemName(k)}`)
          .join(', ') +
        (cost.money ? ` $${cost.money}` : '');
      return;
    }
    g.valid = true;
    g.reason = '';
  }

  private currentPart(): PlacedPart {
    const g = this.ghost;
    const def = PART_BY_ID[this.kind]!;
    return [
      this.kind,
      g.x,
      g.y,
      g.z,
      this.rot,
      this.scale[0],
      this.scale[1],
      this.scale[2],
      this.color,
      woodIndex(this.wood),
      this.kind === 'sign' ? undefined : undefined,
    ] as PlacedPart;
    void def;
  }

  update(dt: number): void {
    this.tick++;
    const sim = this.sim;
    const inp = sim.game.input;
    // collider streaming + interactables near the player
    if (this.tick % 30 === 0) this.streamColliders();
    if (this.tick % 10 === 0) this.refreshInteractables();
    if (!this.active || inp.uiOpen || sim.player.mode !== 'foot') return;
    void dt;
    // hotkeys
    const ctrl = inp.rawHeld('ControlLeft') || inp.rawHeld('ControlRight') || inp.rawHeld('MetaLeft');
    const shift = inp.rawHeld('ShiftLeft') || inp.rawHeld('ShiftRight');
    if (inp.rawPressed('KeyR') && !ctrl) this.rotate(shift ? Math.PI / 12 : Math.PI / 2);
    if (inp.rawPressed('KeyZ') && ctrl) this.undo();
    if (inp.rawPressed('KeyY') && ctrl) this.redo();
    if (inp.rawPressed('KeyC') && ctrl) this.copy();
    if (inp.rawPressed('KeyV') && ctrl) this.paste();
    if (inp.rawPressed('Tab'))
      this.tool =
        this.tool === 'place'
          ? 'select'
          : this.tool === 'select'
            ? 'delete'
            : this.tool === 'delete'
              ? 'wire'
              : 'place';
    if (inp.rawPressed('Delete') || inp.rawPressed('Backspace')) this.deleteSelected();
    if (inp.rawPressed('BracketRight')) this.resize(1.1);
    if (inp.rawPressed('BracketLeft')) this.resize(1 / 1.1);
    if (inp.rawPressed('KeyX'))
      this.snap = this.snap === 1 ? 0.5 : this.snap === 0.5 ? 0.25 : this.snap === 0.25 ? 2 : 1;
    if (inp.wheel !== 0 && (shift || this.tool === 'place')) {
      this.yOff = Math.max(-2, Math.min(12, this.yOff + (inp.wheel < 0 ? 0.25 : -0.25)));
      if (this.tool === 'place') sim.player.camDist -= inp.wheel * 0.8; // undo the zoom side-effect
    }
    // arrow keys nudge selection
    if (this.selection !== null && this.tool === 'select') {
      const b = this.built.get(this.selection);
      if (b) {
        const s = this.snap;
        const yaw = sim.player.camYaw;
        const fx = Math.round(-Math.sin(yaw)),
          fz = Math.round(-Math.cos(yaw));
        if (inp.rawPressed('ArrowUp')) this.edit(b.id, { x: b.p[1] + fx * s, z: b.p[3] + fz * s });
        if (inp.rawPressed('ArrowDown')) this.edit(b.id, { x: b.p[1] - fx * s, z: b.p[3] - fz * s });
        if (inp.rawPressed('ArrowLeft')) this.edit(b.id, { x: b.p[1] + fz * s, z: b.p[3] - fx * s });
        if (inp.rawPressed('ArrowRight')) this.edit(b.id, { x: b.p[1] - fz * s, z: b.p[3] + fx * s });
        if (inp.rawPressed('PageUp')) this.edit(b.id, { y: b.p[2] + s });
        if (inp.rawPressed('PageDown')) this.edit(b.id, { y: b.p[2] - s });
      }
    }
    if (this.tool === 'place') this.computeGhost();
    const pri = inp.primary;
    const sec = inp.secondary;
    const priEdge = pri && !this.priLast;
    const secEdge = inp.rmbClick || (!inp.freeCursor && sec && !this.secLast);
    this.priLast = pri;
    this.secLast = sec;
    if (priEdge) this.click();
    if (secEdge) {
      if (this.tool === 'place') {
        const b = this.pickPart();
        if (b) this.remove(b.id);
      } else this.selection = null;
    }
  }

  wireFrom: number | null = null;
  click(): void {
    if (this.tool === 'wire') {
      const b = this.pickPart();
      if (!b) {
        this.wireFrom = null;
        return;
      }
      if (this.wireFrom === null) {
        this.wireFrom = b.id;
        this.sim.bus.emit('notify', {
          text: `Wire from ${this.def(b).name} — click the part to power`,
          kind: 'info',
        });
      } else {
        const a = this.built.get(this.wireFrom);
        if (a && a !== b && a.plot === b.plot) this.toggleWire(a, b);
        this.wireFrom = null;
      }
      return;
    }
    if (this.tool === 'place') {
      const g = this.ghost;
      if (!g.valid || !g.plot) {
        this.sim.bus.emit('notify', { text: g.reason || 'Cannot place here', kind: 'bad' });
        return;
      }
      const p = this.currentPart();
      const r = this.place(g.plot, p);
      if (typeof r === 'string') this.sim.bus.emit('notify', { text: r, kind: 'bad' });
    } else if (this.tool === 'select') {
      const b = this.pickPart();
      this.selection = b?.id ?? null;
    } else {
      const b = this.pickPart();
      if (b) this.remove(b.id);
    }
  }

  /** Create or remove a wire between two logic-capable parts of one plot. */
  toggleWire(a: Built, b: Built): boolean {
    const st = this.sim.state.plots[a.plot];
    if (!st || a.p[10] === undefined || b.p[10] === undefined) {
      this.sim.bus.emit('notify', { text: 'Those parts cannot be wired', kind: 'bad' });
      return false;
    }
    const w = (st.wires ??= []);
    const i = w.findIndex(([x, y]) => x === a.p[10] && y === b.p[10]);
    if (i >= 0) {
      w.splice(i, 1);
      this.sim.bus.emit('notify', { text: 'Wire removed', kind: 'info' });
    } else {
      if (w.length >= 300) return false;
      w.push([a.p[10] as number, b.p[10] as number]);
      this.sim.bus.emit('notify', { text: 'Wired!', kind: 'good' });
    }
    return true;
  }

  rotate(a: number): void {
    if (this.tool === 'select' && this.selection !== null) {
      const b = this.built.get(this.selection);
      if (b) this.edit(b.id, { ry: b.p[4] + a });
    } else this.rot = (this.rot + a) % (Math.PI * 2);
  }
  resize(k: number): void {
    if (this.tool === 'select' && this.selection !== null) {
      const b = this.built.get(this.selection);
      if (b) this.edit(b.id, { sx: clamp(b.p[5] * k), sy: clamp(b.p[6] * k), sz: clamp(b.p[7] * k) });
    } else this.scale = [clamp(this.scale[0] * k), clamp(this.scale[1] * k), clamp(this.scale[2] * k)];
  }
  paintSelected(color: number, wood?: string): void {
    if (this.selection === null) return;
    this.edit(this.selection, { color, ...(wood ? { mat: woodIndex(wood) } : {}) });
  }
  deleteSelected(): void {
    if (this.selection !== null) this.remove(this.selection);
  }
  copy(): void {
    const b = this.selection !== null ? this.built.get(this.selection) : null;
    if (!b) return;
    // copy the selected part plus all parts within 6m on the same plot (a "group")
    this.clipboard = [];
    for (const o of this.built.values()) {
      if (o.plot !== b.plot) continue;
      if (Math.hypot(o.p[1] - b.p[1], o.p[3] - b.p[3]) <= 6 && Math.abs(o.p[2] - b.p[2]) < 8)
        this.clipboard.push({
          p: [...o.p] as PlacedPart,
          dx: o.p[1] - b.p[1],
          dy: o.p[2] - b.p[2],
          dz: o.p[3] - b.p[3],
        });
    }
    this.sim.bus.emit('notify', { text: `Copied ${this.clipboard.length} part(s)`, kind: 'info' });
  }
  paste(): void {
    const g = this.ghost;
    if (!this.clipboard.length) return;
    if (!g.plot) {
      this.computeGhost();
    }
    if (!g.plot) return;
    const s = Math.sin(this.rot),
      c = Math.cos(this.rot);
    let n = 0;
    for (const e of this.clipboard) {
      const p = [...e.p] as PlacedPart;
      p[1] = g.x + e.dx * c + e.dz * s;
      p[3] = g.z - e.dx * s + e.dz * c;
      p[2] = g.y + e.dy;
      p[4] = e.p[4] + this.rot;
      if (UID_KINDS.has(p[0])) p[10] = undefined;
      const rr = this.place(g.plot, p);
      if (typeof rr !== 'string') n++;
    }
    this.sim.bus.emit('notify', { text: `Pasted ${n} part(s)`, kind: 'good' });
  }

  // --------------------------------------------------------------- housekeeping
  private streamColliders(): void {
    const p = this.sim.player;
    for (const b of this.built.values()) {
      const d = Math.hypot(b.p[1] - p.x, b.p[3] - p.z);
      if (d < 170 && !b.body) this.addCollider(b);
      else if (d > 230 && b.body) this.dropCollider(b);
    }
  }
  private refreshInteractables(): void {
    const p = this.sim.player;
    const list: any[] = [];
    for (const b of this.built.values()) {
      const d = this.def(b);
      if (!d.interactive) continue;
      const dist = Math.hypot(b.p[1] - p.x, b.p[3] - p.z);
      if (dist > 14) continue;
      list.push({
        id: 'part:' + b.id,
        label:
          d.interactive === 'door'
            ? b.open
              ? 'Close door'
              : 'Open door'
            : d.id === 'bed'
              ? 'Sleep'
              : d.interactive === 'switch'
                ? 'Toggle switch'
                : `Use ${d.name}`,
        x: b.p[1],
        z: b.p[3],
        y: b.p[2],
        radius: Math.max(2.8, d.size[0] * 0.8),
        kind: 'part',
        arg: String(b.id),
      });
    }
    this.sim.hub.extra = list;
  }

  /** Total parts across all plots. */
  total(): number {
    return this.built.size;
  }

  dispose(): void {
    for (const b of this.built.values()) this.dropCollider(b);
  }
}

const clamp = (v: number) => Math.max(0.25, Math.min(4, v));
const round = (v: number) => Math.round(v * 1000) / 1000;
function quatMul(
  a: { x: number; y: number; z: number; w: number },
  b: { x: number; y: number; z: number; w: number },
) {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}
void PARTS;
void WOOD_BY_ID;
void CONFIG;
void Terrain;
