import type { Sim, System } from '../core/sim';
import { CONFIG } from '../config';
import { Rng } from '../core/rng';
import { WOODS, WOOD_BY_ID } from '../data/woods';
import { FURNITURE_SHAPES, furnitureId } from '../data/recipes';
import type { Job } from '../save/schema';
import { baseItemValue, itemName } from './itemValue';

const DAY = CONFIG.dayLengthSec;
export const TOWNS = [
  { id: 'hub', name: 'Meadow Hub', minTier: 0 },
  { id: 'cherry', name: 'Cherry Grove', minTier: 1 },
  { id: 'redwood', name: 'Redwood Camp', minTier: 2 },
  { id: 'goldbasin', name: 'Gold Basin', minTier: 3 },
  { id: 'tropics', name: 'Isles Dock', minTier: 3 },
  { id: 'desert', name: 'Oasis Post', minTier: 4 },
  { id: 'taiga', name: 'Frost Lodge', minTier: 4 },
];

/** Delivery contracts with time bonuses and per-town reputation. */
export class JobSystem implements System {
  readonly name = 'jobs';
  private rng = new Rng(4711);
  private nextGen = 0;
  constructor(private sim: Sim) {}

  init(): void {
    this.sim.bus.on('log:sold', (e) => this.onLogSold(e.wood, e.units));
    if (!this.sim.state.jobs.length) this.generate(5);
  }

  update(): void {
    if (this.sim.tickCount % 120 !== 0) return;
    const st = this.sim.state;
    // expire
    for (const j of [...st.jobs]) {
      if (j.expires <= st.time) {
        st.jobs = st.jobs.filter((x) => x !== j);
        if (j.taken) {
          st.rep[j.town] = Math.max(0, (st.rep[j.town] ?? 0) - 2);
          this.sim.bus.emit('notify', {
            text: `Job expired: ${this.describe(j)} (-2 reputation)`,
            kind: 'bad',
          });
        }
      }
    }
    if (st.time >= this.nextGen && st.jobs.filter((j) => !j.taken).length < 6) {
      this.nextGen = st.time + 240 / DAY;
      this.generate(2);
    }
  }

  maxTier(): number {
    return Math.max(1, this.sim.shop.maxOwnedTier());
  }

  repBonus(town: string): number {
    return Math.min(1, (this.sim.state.rep[town] ?? 0) / 200);
  }

  generate(n: number): void {
    const st = this.sim.state;
    const tier = this.maxTier();
    const towns = TOWNS.filter((t) => t.minTier <= tier);
    for (let i = 0; i < n; i++) {
      const town = this.rng.pick(towns);
      const woods = WOODS.filter(
        (w) => w.weight > 0 && !w.guardianOnly && w.minTier <= tier + 1 && w.rarity !== 'mythic',
      );
      const wood = this.rng.pick(woods);
      const kinds: Job['kind'][] = ['logs', 'planks', 'planks', 'furniture'];
      const kind = this.rng.pick(kinds);
      let units: number;
      let item: string | undefined;
      let base: number;
      if (kind === 'logs') {
        units = this.rng.int(6, 20);
        base = wood.baseValue * units;
      } else if (kind === 'planks') {
        units = this.rng.int(12, 50);
        item = 'plank_' + wood.id;
        base = baseItemValue(item) * units;
      } else {
        const shape = this.rng.pick(FURNITURE_SHAPES.slice(0, 6));
        units = this.rng.int(2, 8);
        item = furnitureId(shape.id, wood.id);
        base = baseItemValue(item) * units;
      }
      const dur = this.rng.range(0.6, 1.4);
      const reward = Math.round(base * this.rng.range(1.35, 2.0));
      st.jobs.push({
        id: st.world.nextUid++,
        wood: wood.id,
        units,
        reward,
        town: town.id,
        expires: st.time + dur,
        bonusBy: st.time + dur * 0.5,
        taken: false,
        delivered: 0,
        kind,
        item,
      });
    }
  }

  describe(j: Job): string {
    const w = WOOD_BY_ID[j.wood]?.name ?? j.wood;
    if (j.kind === 'logs') return `${j.units} units of ${w} logs`;
    return `${j.units}× ${itemName(j.item ?? '')}`;
  }

  accept(id: number): void {
    const j = this.sim.state.jobs.find((x) => x.id === id);
    if (!j || j.taken) return;
    if (this.sim.state.jobs.filter((x) => x.taken).length >= 3) {
      this.sim.bus.emit('notify', { text: 'You can only hold 3 active jobs', kind: 'bad' });
      return;
    }
    j.taken = true;
  }

  deliver(id: number): boolean {
    const sim = this.sim;
    const j = sim.state.jobs.find((x) => x.id === id);
    if (!j || !j.taken || j.kind === 'logs' || !j.item) return false;
    if (!sim.inventory.has(j.item, j.units)) {
      sim.bus.emit('notify', { text: `Need ${j.units}× ${itemName(j.item)}`, kind: 'bad' });
      return false;
    }
    sim.inventory.remove(j.item, j.units);
    this.complete(j);
    return true;
  }

  private onLogSold(wood: string, units: number): void {
    for (const j of [...this.sim.state.jobs]) {
      if (j.taken && j.kind === 'logs' && j.wood === wood) {
        j.delivered += units;
        if (j.delivered >= j.units) this.complete(j);
      }
    }
  }

  private complete(j: Job): void {
    const sim = this.sim;
    const st = sim.state;
    const early = st.time <= j.bonusBy;
    const bonus = 1 + (early ? 0.5 : 0) + this.repBonus(j.town);
    const pay = Math.round(j.reward * bonus);
    st.jobs = st.jobs.filter((x) => x !== j);
    sim.econ.earn(pay, 'job');
    st.rep[j.town] = (st.rep[j.town] ?? 0) + (early ? 3 : 2);
    st.stats.jobs = (st.stats.jobs ?? 0) + 1;
    sim.addXp('woodcutting', Math.round(pay / 40));
    sim.bus.emit('notify', {
      text: `Job done: +$${pay.toLocaleString()}${early ? ' (time bonus!)' : ''}`,
      kind: 'money',
    });
    if (st.stats.jobs % 3 === 0) sim.inventory.add('key_common', 1);
  }
}
