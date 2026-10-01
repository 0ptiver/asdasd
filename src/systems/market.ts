import { CONFIG } from '../config';
import { Rng } from '../core/rng';
import type { Sim, System } from '../core/sim';
import { WOODS, WOOD_BY_ID } from '../data/woods';
import { ITEMS } from '../data/items';
import { parseFurniture } from '../data/recipes';
import type { PriceEntry } from '../save/schema';
import { baseItemValue, ITEM_VALUE_HOOK } from './itemValue';

const SEC_PER_DAY = CONFIG.dayLengthSec;

const EVENTS = [
  { id: 'surge', text: (w: string) => `Demand surge: ${w} is in high demand!`, mult: 1.6, wood: true },
  { id: 'glut', text: (w: string) => `Market glut: ${w} prices are down.`, mult: 0.7, wood: true },
  { id: 'boom', text: () => 'Construction boom: all wood prices up!', mult: 1.2, wood: false },
  { id: 'slump', text: () => 'Economic slump: all wood prices down.', mult: 0.85, wood: false },
];

/** Dynamic prices: per-wood multiplier driven by supply (sales), mean-reversion, noise and random events. */
export class MarketSystem implements System {
  readonly name = 'market';
  private rng = new Rng(9001);
  constructor(private sim: Sim) {
    ITEM_VALUE_HOOK.value = (id) => this.itemPrice(id);
  }

  private get m() {
    return this.sim.state.market;
  }

  init(): void {
    for (const w of WOODS) this.entry(w.id);
    for (const i of ITEMS) if (['ore', 'fish', 'forage', 'treasure'].includes(i.category)) this.entry(i.id);
  }

  private entry(key: string): PriceEntry {
    let e = this.m.prices[key];
    if (!e) e = this.m.prices[key] = { mult: 1, trend: 0, supply: 0, history: [1] };
    return e;
  }

  /** Multiplier currently paid for a wood (logs, planks, furniture of that wood). */
  woodMult(wood: string): number {
    const e = this.entry(wood);
    const sat = Math.max(0.35, 1 - e.supply * CONFIG.market.elasticity);
    let m = e.mult * sat;
    const ev = this.m.event;
    if (ev && ev.until > this.sim.state.time) {
      if (!ev.wood || ev.wood === wood) m *= ev.mult;
    }
    return m;
  }

  itemMult(id: string): number {
    const f = parseFurniture(id);
    if (f) return this.woodMult(f.wood);
    const w = id.startsWith('plank_') ? id.slice(6) : null;
    if (w && WOOD_BY_ID[w]) return this.woodMult(w);
    if (this.m.prices[id]) {
      const e = this.m.prices[id]!;
      return e.mult * Math.max(0.4, 1 - e.supply * CONFIG.market.elasticity * 3);
    }
    return 1;
  }

  itemPrice(id: string): number {
    return Math.max(
      0,
      Math.round(
        baseItemValue(id) * this.itemMult(id) * this.bonus() * (this.sim.events?.sellMultiplier(id) ?? 1),
      ),
    );
  }

  /** Global multipliers: prestige, pet, etc. */
  bonus(): number {
    const st = this.sim.state;
    let m = 1 + st.prestige.level * CONFIG.prestige.multPerLevel;
    if (st.activePet === 'pet_sprite') m *= 1.05;
    return m;
  }

  logPrice(wood: string, units: number, mut: string | null, fortune = 0): number {
    const w = WOOD_BY_ID[wood];
    if (!w) return 0;
    const mv = mut
      ? (({ giant: 3, golden: 5, frozen: 2.5, cursed: 8 } as Record<string, number>)[mut] ?? 1)
      : 1;
    return Math.max(
      1,
      Math.round(w.baseValue * units * mv * this.woodMult(wood) * this.bonus() * (1 + fortune * 0.1)),
    );
  }

  /** Record that `units` of wood were sold (pushes price down). */
  recordSale(key: string, units: number): void {
    const e = this.entry(WOOD_BY_ID[key] ? key : key.startsWith('plank_') ? key.slice(6) : key);
    e.supply += units;
  }

  trend(key: string): number {
    return this.entry(key).trend;
  }
  history(key: string): number[] {
    return this.entry(key).history;
  }

  private nextTickAt = 0;
  update(): void {
    const st = this.sim.state;
    if (this.nextTickAt === 0) this.nextTickAt = st.market.nextTick || st.time;
    if (st.time < this.nextTickAt) return;
    this.nextTickAt = st.time + CONFIG.market.tickSec / SEC_PER_DAY;
    st.market.nextTick = this.nextTickAt;
    for (const [key, e] of Object.entries(this.m.prices)) {
      e.supply *= 1 - CONFIG.market.recovery;
      const old = e.mult;
      // mean reversion toward 1 with noise
      e.mult += (1 - e.mult) * 0.08 + (this.rng.float() - 0.5) * 0.07;
      e.mult = Math.min(1.9, Math.max(0.55, e.mult));
      e.trend = Math.sign(Math.round((e.mult - old) * 1000));
      e.history.push(+(e.mult * Math.max(0.35, 1 - e.supply * CONFIG.market.elasticity)).toFixed(3));
      if (e.history.length > 30) e.history.shift();
      void key;
    }
    // events
    const ev = this.m.event;
    if (ev && ev.until <= st.time) this.m.event = null;
    if (!this.m.event && this.rng.chance(0.06)) {
      const def = this.rng.pick(EVENTS);
      const w = def.wood ? this.rng.pick(WOODS.filter((x) => x.weight > 0 && !x.guardianOnly)) : null;
      this.m.event = {
        id: def.id,
        until: st.time + (240 + this.rng.range(0, 240)) / SEC_PER_DAY,
        wood: w?.id,
        mult: def.mult,
      };
      this.sim.bus.emit('notify', { text: def.text(w?.name ?? ''), kind: 'info' });
    }
  }

  get event() {
    const ev = this.m.event;
    return ev && ev.until > this.sim.state.time ? ev : null;
  }
}
