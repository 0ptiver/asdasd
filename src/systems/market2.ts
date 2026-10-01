import type { Sim, System } from '../core/sim';
import { CONFIG } from '../config';
import { Rng } from '../core/rng';
import { WOODS, WOOD_BY_ID } from '../data/woods';
import { ITEMS } from '../data/items';
import type { AuctionListing, FuturesPosition } from '../save/schema';
import { baseItemValue, itemName } from './itemValue';

const DAY = CONFIG.dayLengthSec;
const rng = new Rng(808);

/** Auction house (NPC + player listings, with a tax money-sink) and the capped-risk Lumber Exchange (futures). */
export class ExchangeSystem implements System {
  readonly name = 'exchange';
  constructor(private sim: Sim) {}
  private nextRefresh = 0;

  private get m() {
    return this.sim.state.market;
  }

  init(): void {
    if (!this.m.auctions.length) this.refreshAuctions();
  }

  update(): void {
    const st = this.sim.state;
    if (this.sim.tickCount % 60 !== 0) return;
    if (st.time >= this.nextRefresh) {
      this.nextRefresh = st.time + 300 / DAY;
      this.refreshAuctions();
    }
    // NPC buyers purchase fairly-priced player listings
    for (const a of [...this.m.auctions]) {
      if (a.seller !== 'player') continue;
      if (a.expires <= st.time) {
        this.sim.inventory.add(a.item, a.n);
        this.m.auctions = this.m.auctions.filter((x) => x !== a);
        this.sim.bus.emit('notify', {
          text: `Your ${itemName(a.item)} listing expired and was returned`,
          kind: 'info',
        });
        continue;
      }
      const fair = this.sim.market.itemPrice(a.item) * a.n;
      const ratio = a.price / Math.max(1, fair);
      const chance = ratio <= 1.0 ? 0.08 : ratio <= 1.2 ? 0.03 : ratio <= 1.5 ? 0.005 : 0;
      if (rng.chance(chance)) {
        const net = Math.round(a.price * (1 - CONFIG.market.tradeTax));
        this.sim.econ.earn(net, 'auction');
        this.m.auctions = this.m.auctions.filter((x) => x !== a);
        this.sim.bus.emit('notify', {
          text: `Sold ${a.n}× ${itemName(a.item)} at auction: +$${net.toLocaleString()} (after ${CONFIG.market.tradeTax * 100}% tax)`,
          kind: 'money',
        });
      }
    }
    // futures expiry
    for (const f of [...this.m.futures]) if (f.expires <= st.time) this.settle(f);
  }

  refreshAuctions(): void {
    this.m.auctions = this.m.auctions.filter((a) => a.seller === 'player');
    const st = this.sim.state;
    const stock = rng.int(6, 10);
    for (let i = 0; i < stock; i++) {
      const roll = rng.float();
      let item: string;
      let n = 1;
      if (roll < 0.5) {
        const w = rng.pick(WOODS.filter((x) => !x.guardianOnly && x.weight > 0 && x.baseValue < 400));
        item = 'plank_' + w.id;
        n = rng.int(10, 60);
      } else if (roll < 0.8) {
        const f = ['chair', 'table', 'bookshelf', 'bed', 'barrel'][rng.int(0, 4)]!;
        const w = rng.pick(WOODS.filter((x) => x.baseValue < 150 && x.weight > 0));
        item = `${f}@${w.id}`;
        n = rng.int(1, 6);
      } else {
        const it = rng.pick(ITEMS.filter((x) => ['ore', 'forage', 'fish', 'treasure'].includes(x.category)));
        item = it.id;
        n = rng.int(3, 20);
      }
      const unit = this.sim.market.itemPrice(item) || baseItemValue(item);
      this.m.auctions.push({
        id: this.sim.state.world.nextUid++,
        item,
        n,
        price: Math.round(unit * n * rng.range(0.78, 1.18)),
        seller: 'npc',
        expires: st.time + 1,
      });
    }
  }

  buy(id: number): boolean {
    const a = this.m.auctions.find((x) => x.id === id);
    if (!a || a.seller !== 'npc') return false;
    const fee = Math.round(a.price * CONFIG.market.tradeTax);
    if (!this.sim.econ.spend(a.price + fee, 'auction')) return false;
    const left = this.sim.inventory.add(a.item, a.n);
    if (left === a.n) {
      this.sim.econ.earn(a.price + fee, 'refund');
      this.sim.bus.emit('notify', { text: 'Inventory full', kind: 'bad' });
      return false;
    }
    this.m.auctions = this.m.auctions.filter((x) => x !== a);
    this.sim.bus.emit('notify', { text: `Bought ${a.n}× ${itemName(a.item)} (fee $${fee})`, kind: 'good' });
    return true;
  }

  list(item: string, n: number, price: number): boolean {
    const inv = this.sim.inventory;
    if (n <= 0 || price <= 0 || !inv.has(item, n)) return false;
    if (this.m.auctions.filter((a) => a.seller === 'player').length >= 8) {
      this.sim.bus.emit('notify', { text: 'You can only have 8 active listings', kind: 'bad' });
      return false;
    }
    // listing fee (money sink)
    const fee = Math.round(price * 0.01);
    if (!this.sim.econ.spend(fee, 'listing fee')) return false;
    inv.remove(item, n);
    this.m.auctions.push({
      id: this.sim.state.world.nextUid++,
      item,
      n,
      price: Math.round(price),
      seller: 'player',
      expires: this.sim.state.time + 2,
    });
    return true;
  }
  cancel(id: number): void {
    const a = this.m.auctions.find((x) => x.id === id && x.seller === 'player');
    if (!a) return;
    this.sim.inventory.add(a.item, a.n);
    this.m.auctions = this.m.auctions.filter((x) => x !== a);
  }

  // ---- futures: pick a wood, direction, stake and leverage; payout capped to [0, 3×stake] so risk is capped.
  openFuture(wood: string, dir: 1 | -1, stake: number, leverage: number): boolean {
    if (!WOOD_BY_ID[wood] || stake < 100 || leverage < 1 || leverage > 3) return false;
    if (this.m.futures.length >= 5) {
      this.sim.bus.emit('notify', { text: 'Max 5 open positions', kind: 'bad' });
      return false;
    }
    if (!this.sim.econ.spend(stake, 'future')) return false;
    this.m.futures.push({
      id: this.sim.state.world.nextUid++,
      wood,
      dir,
      stake,
      entry: this.sim.market.woodMult(wood),
      expires: this.sim.state.time + 600 / DAY,
      leverage,
    });
    return true;
  }
  futureValue(f: FuturesPosition): number {
    const now = this.sim.market.woodMult(f.wood);
    const pct = (now - f.entry) / f.entry;
    return Math.max(0, Math.min(f.stake * 3, Math.round(f.stake * (1 + f.dir * pct * f.leverage))));
  }
  settle(f: FuturesPosition): void {
    const v = this.futureValue(f);
    this.m.futures = this.m.futures.filter((x) => x !== f);
    if (v > 0) this.sim.econ.earn(v, 'future');
    this.sim.bus.emit('notify', {
      text: `Future on ${WOOD_BY_ID[f.wood]!.name} closed: ${v >= f.stake ? '+' : '-'}$${Math.abs(v - f.stake).toLocaleString()}`,
      kind: v >= f.stake ? 'money' : 'bad',
    });
  }
  closeEarly(id: number): void {
    const f = this.m.futures.find((x) => x.id === id);
    if (f) this.settle(f);
  }
}
export type { AuctionListing };
