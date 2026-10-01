import type { Sim, System } from '../core/sim';
import { RAPIER } from '../physics/world';
import type { Built } from './building';
import { FURNITURE_SHAPES, furnitureId } from '../data/recipes';
import { WOOD_BY_ID } from '../data/woods';
import { CONFIG } from '../config';
import { MUTATION_BY_ID } from '../data/woods';
import { itemName } from './itemValue';

export const SAWMILL_MAX = 5;
export const BUSINESS_UPGRADE = (price: number, level: number) =>
  Math.round(price * 0.6 * Math.pow(1.9, level));

interface Feed {
  logId: number;
  t: number;
}

const rotate = (x: number, z: number, yaw: number): [number, number] => [
  x * Math.cos(yaw) + z * Math.sin(yaw),
  -x * Math.sin(yaw) + z * Math.cos(yaw),
];

/** Plot businesses: personal sawmill, sell stand, workshop, factory and firewood stall. */
export class BusinessSystem implements System {
  readonly name = 'businesses';
  private feeds = new Map<number, Feed[]>(); // part id -> active sawing jobs
  private tick = 0;
  constructor(private sim: Sim) {}

  state(b: Built) {
    const st = this.sim.state.plots[b.plot]!;
    const key = String(b.p[10]);
    return (st.businesses[key] ??= { level: 1, stock: 0, lastCollect: 0, out: {}, input: {} });
  }

  speed(level: number): number {
    return 1 + (level - 1) * 0.35;
  }
  lanes(level: number): number {
    return level >= 5 ? 4 : level >= 3 ? 2 : 1;
  }
  yield(level: number): number {
    return 1 + (level - 1) * 0.15 + (level >= 4 ? 0.1 : 0);
  }

  upgradeCost(b: Built): number {
    const d = this.sim.building.def(b);
    return BUSINESS_UPGRADE(d.money ?? 1000, this.state(b).level);
  }
  upgrade(b: Built): boolean {
    const bs = this.state(b);
    if (bs.level >= SAWMILL_MAX) return false;
    if (!this.sim.econ.spend(this.upgradeCost(b), 'business upgrade')) return false;
    bs.level++;
    this.sim.bus.emit('notify', {
      text: `${this.sim.building.def(b).name} upgraded to level ${bs.level}`,
      kind: 'good',
    });
    return true;
  }

  /** World-space intake box of a sawmill / stand. */
  zone(b: Built): { x: number; y: number; z: number; hx: number; hy: number; hz: number; yaw: number } {
    const d = this.sim.building.def(b);
    const [, x, y, z, yaw, sx, , sz] = b.p;
    const local =
      d.interactive === 'sawmill'
        ? { x: -2.4 * sx, z: 1.5 * sz, hx: 2.4, hz: 1.7 }
        : { x: 0, z: 1.8 * sz, hx: 1.6, hz: 1.3 };
    const [wx, wz] = rotate(local.x, local.z, yaw);
    return { x: x + wx, y: y + 1.4, z: z + wz, hx: local.hx, hy: 2, hz: local.hz, yaw };
  }
  private inZone(z: ReturnType<BusinessSystem['zone']>, px: number, py: number, pz: number): boolean {
    const dx = px - z.x,
      dz = pz - z.z;
    const [lx, lz] = rotate(dx, dz, -z.yaw);
    return Math.abs(lx) < z.hx && Math.abs(lz) < z.hz && Math.abs(py - z.y) < z.hy + 1;
  }

  update(dt: number): void {
    this.tick++;
    const sim = this.sim;
    const pl = sim.player;
    for (const b of sim.building.built.values()) {
      if (b.plot === 'visit') continue;
      const d = sim.building.def(b);
      if (!d.interactive) continue;
      if (d.interactive === 'sawmill') this.updateSawmill(b, dt, pl);
      else if (d.interactive === 'sellstand') this.updateStand(b, dt);
      else if (
        d.interactive === 'workbench' &&
        (d.id === 'workshop' || d.id === 'factory' || d.id === 'firewood_stall')
      )
        this.updateFactory(b, dt);
    }
  }

  private updateSawmill(b: Built, dt: number, pl: { x: number; z: number }): void {
    const sim = this.sim;
    if (Math.hypot(b.p[1] - pl.x, b.p[3] - pl.z) > 150) return;
    const bs = this.state(b);
    const z = this.zone(b);
    let feeds = this.feeds.get(b.id);
    if (!feeds) this.feeds.set(b.id, (feeds = []));
    // auto-feed: pull nearby free logs toward the intake
    if (bs.level >= 2 && this.tick % 3 === 0) {
      for (const l of sim.logs.logs.values()) {
        if (l.busy || l.grabbed) continue;
        const t = l.body.translation();
        const dx = z.x - t.x,
          dz = z.z - t.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 4 + bs.level * 3 && dist > 1.2 && Math.abs(t.y - z.y) < 3)
          l.body.setLinvel({ x: (dx / dist) * 3.5, y: l.body.linvel().y, z: (dz / dist) * 3.5 }, true);
      }
    }
    // intake
    if (feeds.length < this.lanes(bs.level)) {
      for (const l of sim.logs.logs.values()) {
        if (l.busy || l.grabbed) continue;
        const t = l.body.translation();
        if (this.inZone(z, t.x, t.y, t.z)) {
          l.busy = true;
          l.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
          feeds.push({ logId: l.id, t: 0 });
          if (feeds.length >= this.lanes(bs.level)) break;
        }
      }
    }
    for (let i = feeds.length - 1; i >= 0; i--) {
      const f = feeds[i]!;
      const l = sim.logs.logs.get(f.logId);
      if (!l) {
        feeds.splice(i, 1);
        continue;
      }
      f.t += dt * this.speed(bs.level);
      const k = Math.min(1, f.t / 3);
      const [bx, bz] = rotate(1.44, 1.5, b.p[4]);
      const tx = b.p[1] + bx,
        tz = b.p[3] + bz;
      const t = l.body.translation();
      l.body.setNextKinematicTranslation({
        x: t.x + (tx - t.x) * Math.min(1, dt * 1.8),
        y: z.y - 0.3,
        z: t.z + (tz - t.z) * Math.min(1, dt * 1.8),
      });
      if (k > 0.6 && (this.tick & 3) === 0) {
        sim.bus.emit('fx', { kind: 'sparks', x: tx, y: z.y + 0.1, z: tz, n: 2 });
        sim.bus.emit('fx', { kind: 'sawdust', x: tx, y: z.y, z: tz, n: 3 });
      }
      if (k >= 1) {
        const mv = l.mut ? (MUTATION_BY_ID[l.mut]?.valueMult ?? 1) : 1;
        const n = Math.max(1, Math.round(l.units * 2 * Math.max(1, mv * 0.9) * this.yield(bs.level)));
        bs.out![l.wood] = (bs.out![l.wood] ?? 0) + n;
        sim.state.stats.planks = (sim.state.stats.planks ?? 0) + n;
        sim.state.stats.logsSawn = (sim.state.stats.logsSawn ?? 0) + 1;
        sim.bus.emit('plank:made', { wood: l.wood, count: n });
        sim.bus.emit('sfx', { name: 'saw', x: b.p[1], y: b.p[2], z: b.p[3], vol: 0.7 });
        sim.logs.removeLog(l.id);
        feeds.splice(i, 1);
        if (bs.level >= 5) this.autoSell(b); // full automation
      }
    }
  }

  private autoSell(b: Built): void {
    const bs = this.state(b);
    for (const [w, n] of Object.entries(bs.out ?? {})) {
      if (n <= 0) continue;
      const price = Math.round(this.sim.market.itemPrice('plank_' + w) * n * 0.9);
      bs.out![w] = 0;
      this.sim.market.recordSale('plank_' + w, n * 0.5);
      this.sim.econ.earn(price, 'auto-sell');
    }
  }

  collect(b: Built): number {
    const bs = this.state(b);
    let total = 0;
    for (const [id, n] of Object.entries(bs.out ?? {})) {
      if (n <= 0) continue;
      const item = id.includes('@') ? id : 'plank_' + id;
      const left = this.sim.inventory.add(item, n);
      bs.out![id] = left;
      total += n - left;
    }
    if (total) this.sim.bus.emit('notify', { text: `Collected ${total} items`, kind: 'good' });
    return total;
  }
  outCount(b: Built): number {
    return Object.values(this.state(b).out ?? {}).reduce((a, c) => a + c, 0);
  }

  // ---- sell stand: auto-sells dropped logs at a bonus + passively sells stocked planks
  private standAcc = new Map<number, number>();
  private updateStand(b: Built, dt: number): void {
    const sim = this.sim;
    const bs = this.state(b);
    const z = this.zone(b);
    const rate = 0.85 + 0.05 * (bs.level - 1);
    for (const l of [...sim.logs.logs.values()]) {
      if (l.busy || l.grabbed) continue;
      const t = l.body.translation();
      if (!this.inZone(z, t.x, t.y, t.z)) continue;
      const v = Math.round(sim.market.logPrice(l.wood, l.units, l.mut, 0) * rate);
      sim.market.recordSale(l.wood, l.units);
      sim.econ.earn(v, 'sell stand');
      sim.logs.removeLog(l.id);
      sim.bus.emit('log:sold', { wood: l.wood, value: v, units: l.units });
      sim.bus.emit('fx', { kind: 'coins', x: t.x, y: t.y + 1, z: t.z, n: 5 });
      sim.state.stats.logsSold = (sim.state.stats.logsSold ?? 0) + 1;
    }
    // passive sales of stocked items
    const inp = (bs.input ??= {});
    const acc = (this.standAcc.get(b.id) ?? 0) + dt;
    const period = 6 / this.speed(bs.level);
    if (acc >= period) {
      this.standAcc.set(b.id, acc - period);
      for (const [id, n] of Object.entries(inp)) {
        if (n <= 0) continue;
        const price = Math.round(sim.market.itemPrice(id) * rate);
        inp[id] = n - 1;
        sim.econ.earn(price, 'sell stand');
        sim.market.recordSale(id.includes('@') ? id.split('@')[1]! : id, 0.4);
        sim.state.stats.standSold = (sim.state.stats.standSold ?? 0) + 1;
        break;
      }
    } else this.standAcc.set(b.id, acc);
  }

  deposit(b: Built, item: string, n: number): boolean {
    const bs = this.state(b);
    const have = this.sim.inventory.count(item);
    n = Math.min(n, have);
    if (n <= 0) return false;
    this.sim.inventory.remove(item, n);
    (bs.input ??= {})[item] = ((bs.input ??= {})[item] ?? 0) + n;
    return true;
  }
  withdraw(b: Built, item: string): void {
    const bs = this.state(b);
    const n = bs.input?.[item] ?? 0;
    if (n <= 0) return;
    const left = this.sim.inventory.add(item, n);
    bs.input![item] = left;
  }

  // ---- workshop / factory / firewood stall: consume stocked planks → produce goods over time
  setRecipe(b: Built, recipe: string): void {
    this.state(b).recipe = recipe;
  }
  private updateFactory(b: Built, dt: number): void {
    const bs = this.state(b);
    const d = this.sim.building.def(b);
    if (!bs.recipe) return;
    const [shapeId, wood] = bs.recipe.split('@') as [string, string];
    const shape = FURNITURE_SHAPES.find((s) => s.id === shapeId);
    if (!shape || !WOOD_BY_ID[wood]) return;
    if (d.id === 'firewood_stall' && shapeId !== 'firewood_bundle') return;
    const plank = 'plank_' + wood;
    const have = bs.input?.[plank] ?? 0;
    if (have < shape.planks) return;
    const period =
      (shape.time * (d.id === 'factory' ? 0.25 : d.id === 'workshop' ? 0.6 : 0.8)) / this.speed(bs.level);
    bs.prog = (bs.prog ?? 0) + dt;
    if (bs.prog >= period) {
      bs.prog = 0;
      bs.input![plank] = have - shape.planks;
      const n = d.id === 'factory' ? 2 : d.id === 'firewood_stall' ? 4 : 1;
      const id = furnitureId(shapeId, wood);
      bs.out![id] = (bs.out![id] ?? 0) + n;
      this.sim.state.stats.crafted = (this.sim.state.stats.crafted ?? 0) + n;
      this.sim.addXp('crafting', 2);
    }
  }
  describeRecipe(r: string | undefined): string {
    if (!r) return 'none';
    return itemName(r);
  }
}
void CONFIG;
