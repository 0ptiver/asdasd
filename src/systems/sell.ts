import type { Sim, System } from '../core/sim';
import { WOOD_BY_ID } from '../data/woods';
import { ITEM_BY_ID } from '../data/items';
import { itemName } from './itemValue';

/** Sell counter: logs dropped in the zone are bought; inventory items sold via the shop UI. */
export class SellSystem implements System {
  readonly name = 'sell';
  private inZone = new Map<number, number>();
  constructor(private sim: Sim) {}

  update(dt: number): void {
    const z = this.sim.hub.layout.sellZone;
    for (const l of [...this.sim.logs.logs.values()]) {
      if (l.busy || l.grabbed) {
        this.inZone.delete(l.id);
        continue;
      }
      const t = l.body.translation();
      const inside =
        Math.abs(t.x - z.x) < z.hx && Math.abs(t.z - z.z) < z.hz && t.y > z.y - 2.5 && t.y < z.y + z.hy + 2;
      if (!inside) {
        this.inZone.delete(l.id);
        continue;
      }
      const tt = (this.inZone.get(l.id) ?? 0) + dt;
      this.inZone.set(l.id, tt);
      if (tt > 0.5) {
        this.inZone.delete(l.id);
        this.sellLog(l.id);
      }
    }
  }

  sellLog(id: number): number {
    const sim = this.sim;
    const l = sim.logs.logs.get(id);
    if (!l) return 0;
    const t = l.body.translation();
    const axe = sim.inventory.equipped();
    const fortune = axe?.ench.fortune ?? 0;
    let value = sim.market.logPrice(l.wood, l.units, l.mut, fortune);
    if (axe && (axe.ench.midas ?? 0) > 0 && Math.random() < 0.03) {
      value *= 4;
      sim.bus.emit('notify', { text: 'Midas touch! x4 value', kind: 'money' });
    }
    // bonus-sell woods pay extra at the hub
    const w = WOOD_BY_ID[l.wood]!;
    if (w.props.includes('bonusSell')) value = Math.round(value * 1.1);
    sim.market.recordSale(l.wood, l.units);
    sim.econ.earn(value, 'log');
    sim.state.stats.logsSold = (sim.state.stats.logsSold ?? 0) + 1;
    sim.state.stats.logUnits = (sim.state.stats.logUnits ?? 0) + l.units;
    sim.logs.removeLog(id);
    sim.bus.emit('log:sold', { wood: l.wood, value, units: l.units });
    sim.bus.emit('fx', {
      kind: 'coins',
      x: t.x,
      y: t.y + 1,
      z: t.z,
      n: Math.min(12, 3 + Math.floor(Math.log10(value + 1) * 2)),
    });
    sim.bus.emit('sfx', { name: 'coin', x: t.x, y: t.y, z: t.z });
    sim.bus.emit('notify', { text: `Sold ${w.name} log  +$${value.toLocaleString()}`, kind: 'money' });
    return value;
  }

  /** Sell `n` of an inventory item at market price. */
  sellItem(id: string, n: number): number {
    const sim = this.sim;
    const have = sim.inventory.count(id);
    n = Math.min(n, have);
    if (n <= 0) return 0;
    const unit = sim.market.itemPrice(id);
    const total = unit * n;
    sim.inventory.remove(id, n);
    sim.econ.earn(total, 'item');
    const cat = ITEM_BY_ID[id]?.category;
    if (id.startsWith('plank_')) {
      sim.market.recordSale(id, n * 0.5);
      sim.state.stats.planksSold = (sim.state.stats.planksSold ?? 0) + n;
    } else if (id.includes('@')) {
      sim.market.recordSale(id.split('@')[1]!, n * 0.8);
      sim.state.stats.furnitureSold = (sim.state.stats.furnitureSold ?? 0) + n;
    } else if (cat) sim.market.recordSale(id, n * 0.3);
    sim.bus.emit('item:sell', { item: id, count: n, value: total });
    sim.bus.emit('sfx', { name: 'coin' });
    sim.bus.emit('notify', {
      text: `Sold ${n}× ${itemName(id)}  +$${total.toLocaleString()}`,
      kind: 'money',
    });
    return total;
  }
}
