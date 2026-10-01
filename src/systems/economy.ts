import type { Sim, System } from '../core/sim';

/** Wallet. Market pricing is layered on in market.ts. */
export class EconomySystem implements System {
  readonly name = 'economy';
  constructor(private sim: Sim) {}
  update(): void {}

  get money(): number {
    return this.sim.state.money;
  }
  canAfford(n: number): boolean {
    return this.sim.state.money >= n;
  }
  earn(n: number, reason = 'sale'): void {
    if (!(n > 0)) return;
    const s = this.sim.state;
    n = Math.round(n);
    s.money += n;
    s.totalEarned += n;
    s.stats.earned = (s.stats.earned ?? 0) + n;
    this.sim.bus.emit('money:change', { delta: n, total: s.money, reason });
  }
  spend(n: number, reason = 'purchase'): boolean {
    n = Math.round(n);
    const s = this.sim.state;
    if (n < 0 || s.money < n) {
      this.sim.bus.emit('notify', { text: 'Not enough money', kind: 'bad' });
      return false;
    }
    s.money -= n;
    s.stats.spent = (s.stats.spent ?? 0) + n;
    this.sim.bus.emit('money:change', { delta: -n, total: s.money, reason });
    return true;
  }
}
