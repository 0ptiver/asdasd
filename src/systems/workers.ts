import type { Sim, System } from '../core/sim';
import { CONFIG } from '../config';
import { WOOD_BY_ID } from '../data/woods';
import type { Worker } from '../save/schema';
import { Rng } from '../core/rng';
import { levelOf } from '../core/skills';

const NAMES = [
  'Axel',
  'Birch',
  'Clem',
  'Dale',
  'Ember',
  'Finn',
  'Gruff',
  'Hank',
  'Ivo',
  'Jori',
  'Knut',
  'Lars',
  'Moss',
  'Nils',
  'Olaf',
  'Pine',
];
export const MAX_WORKER_LEVEL = 20;

/** Hireable AI lumberjacks: they log a chosen wood on a timer, accumulate planks, and cost wages. */
export class WorkerSystem implements System {
  readonly name = 'workers';
  private rng = new Rng(61);
  constructor(private sim: Sim) {}

  init(): void {
    // catch up offline production (capped, reduced efficiency)
    const now = Date.now();
    for (const w of this.sim.state.workers) {
      const hours = Math.min(CONFIG.idle.offlineCapHours, (now - w.lastMs) / 3.6e6);
      if (hours > 0.01) this.produce(w, hours * 3600 * CONFIG.idle.offlineEfficiency);
      w.lastMs = now;
    }
  }

  hireCost(): number {
    return Math.round(3000 * Math.pow(2.6, this.sim.state.workers.length));
  }
  maxWorkers(): number {
    return (
      3 +
      Math.floor(this.sim.state.prestige.level / 2) +
      Math.floor(levelOf(this.sim.state.skills.crafting) / 10)
    );
  }

  unitsPerHour(w: Worker): number {
    return (28 + w.level * 14) * (1 + w.efficiency);
  }
  wagePerHour(w: Worker): number {
    return Math.round(w.wage * Math.pow(1.12, w.level - 1));
  }
  /** value per hour of the planks produced */
  incomePerHour(w: Worker): number {
    const wood = WOOD_BY_ID[w.wood];
    if (!wood) return 0;
    return (
      this.unitsPerHour(w) *
      2 *
      Math.round((wood.baseValue * wood.plankMult) / 2) *
      this.sim.market.woodMult(w.wood)
    );
  }

  hire(wood: string, plot = ''): boolean {
    const sim = this.sim;
    if (sim.state.workers.length >= this.maxWorkers()) {
      sim.bus.emit('notify', { text: 'You cannot manage more workers yet', kind: 'bad' });
      return false;
    }
    const w = WOOD_BY_ID[wood];
    if (!w || w.weight <= 0 || !sim.state.discoveredSpecies.includes(wood)) {
      sim.bus.emit('notify', { text: 'Workers only know woods you have discovered', kind: 'bad' });
      return false;
    }
    if (!sim.econ.spend(this.hireCost(), 'hire')) return false;
    const worker: Worker = {
      id: sim.state.world.nextUid++,
      name: NAMES[this.rng.int(0, NAMES.length - 1)]!,
      level: 1,
      wage: 90 + Math.round(w.baseValue * 3),
      xp: 0,
      hiredAt: sim.state.playedSec,
      wood,
      plot,
      efficiency: 0,
      stock: 0,
      owed: 0,
      lastMs: Date.now(),
    };
    sim.state.workers.push(worker);
    sim.bus.emit('notify', { text: `${worker.name} joined your crew!`, kind: 'good' });
    return true;
  }
  fire(id: number): void {
    this.sim.state.workers = this.sim.state.workers.filter((w) => w.id !== id);
  }
  setWood(id: number, wood: string): void {
    const w = this.sim.state.workers.find((x) => x.id === id);
    if (w && this.sim.state.discoveredSpecies.includes(wood)) w.wood = wood;
  }
  upgradeCost(w: Worker): number {
    return Math.round(2500 * Math.pow(1.5, w.level));
  }
  upgrade(id: number): boolean {
    const w = this.sim.state.workers.find((x) => x.id === id);
    if (!w || w.level >= MAX_WORKER_LEVEL) return false;
    if (!this.sim.econ.spend(this.upgradeCost(w), 'training')) return false;
    w.level++;
    w.efficiency += 0.05;
    return true;
  }

  private produce(w: Worker, seconds: number): void {
    const units = (this.unitsPerHour(w) / 3600) * seconds;
    w.stock += units * 2;
    w.owed += (this.wagePerHour(w) / 3600) * seconds;
    w.xp += units;
    if (w.xp > 400 * w.level && w.level < MAX_WORKER_LEVEL) {
      w.xp = 0;
      w.efficiency += 0.02;
    }
  }

  update(dt: number): void {
    for (const w of this.sim.state.workers) {
      this.produce(w, dt);
      w.lastMs = Date.now();
    }
  }

  /** Collect planks (wages are paid out of your wallet; unpaid wages carry over). */
  collect(id: number): number {
    const sim = this.sim;
    const w = sim.state.workers.find((x) => x.id === id);
    if (!w) return 0;
    const planks = Math.floor(w.stock);
    if (planks <= 0) return 0;
    const wage = Math.min(Math.floor(w.owed), sim.state.money);
    const left = sim.inventory.add('plank_' + w.wood, planks);
    const took = planks - left;
    w.stock -= took;
    if (wage > 0) {
      sim.state.money -= wage;
      w.owed -= wage;
    }
    sim.state.stats.workerPlanks = (sim.state.stats.workerPlanks ?? 0) + took;
    sim.bus.emit('notify', { text: `${w.name} delivered ${took} planks (wages -$${wage})`, kind: 'good' });
    return took;
  }
}
