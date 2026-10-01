import type { Sim, System } from '../core/sim';
import { RAPIER } from '../physics/world';
import type { Log } from './logs';
import { MUTATION_BY_ID } from '../data/woods';

const FEED_TIME = 2.2;

interface Feeding {
  log: Log;
  t: number;
  start: { x: number; y: number; z: number };
}

/** Public sawmill: logs entering the intake zone are fed through the saw and become planks (collected at the output bin). */
export class SawmillSystem implements System {
  readonly name = 'sawmill';
  private feeding: Feeding[] = [];
  /** planks waiting in the public mill's output bin */
  get output(): Record<string, number> {
    return (this.sim.state.stats as any).__mill ?? ((this.sim.state.stats as any).__mill = {});
  }
  sawing = false;

  constructor(private sim: Sim) {}

  /** Plank count produced from a given volume of wood. */
  planksFor(units: number, mut: string | null, level = 0): number {
    const mv = mut ? (MUTATION_BY_ID[mut]?.valueMult ?? 1) : 1;
    const yieldMult = 1 + level * 0.15;
    return Math.max(1, Math.round(units * 2 * Math.max(1, mv * 0.9) * yieldMult));
  }

  refineDirect(wood: string, units: number, mut: string | null): void {
    const n = this.planksFor(units, mut, 0);
    const left = this.sim.inventory.add('plank_' + wood, n);
    this.sim.bus.emit('plank:made', { wood, count: n - left });
    this.sim.bus.emit('notify', { text: `+${n - left} ${wood} planks (refined)`, kind: 'good' });
    this.sim.state.stats.planks = (this.sim.state.stats.planks ?? 0) + n - left;
  }

  collect(): number {
    let total = 0;
    for (const [wood, n] of Object.entries(this.output)) {
      if (n <= 0) continue;
      const left = this.sim.inventory.add('plank_' + wood, n);
      const took = n - left;
      this.output[wood] = left;
      total += took;
    }
    if (total > 0) this.sim.bus.emit('notify', { text: `Collected ${total} planks`, kind: 'good' });
    else this.sim.bus.emit('notify', { text: 'No planks to collect', kind: 'info' });
    return total;
  }

  outputCount(): number {
    let t = 0;
    for (const n of Object.values(this.output)) t += n;
    return t;
  }

  update(dt: number): void {
    const z = this.sim.hub.layout.sawIntake;
    // detect logs entering the intake
    for (const l of this.sim.logs.logs.values()) {
      if (l.busy || l.grabbed) continue;
      const t = l.body.translation();
      if (Math.abs(t.x - z.x) < z.hx && Math.abs(t.z - z.z) < z.hz && t.y > z.y - 2 && t.y < z.y + z.hy) {
        l.busy = true;
        l.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
        this.feeding.push({ log: l, t: 0, start: { x: t.x, y: t.y, z: t.z } });
      }
    }
    this.sawing = this.feeding.length > 0;
    for (let i = this.feeding.length - 1; i >= 0; i--) {
      const f = this.feeding[i]!;
      f.t += dt;
      const k = Math.min(1, f.t / FEED_TIME);
      const x = f.start.x + (z.x + 3.4 - f.start.x) * k;
      const y = f.start.y + (z.y - 0.2 + f.log.r - f.start.y) * Math.min(1, k * 2);
      const zz = f.start.z + (z.z - f.start.z) * Math.min(1, k * 2);
      f.log.body.setNextKinematicTranslation({ x, y, z: zz });
      f.log.body.setNextKinematicRotation({ x: 0, y: 0, z: Math.sin(Math.PI / 4), w: Math.cos(Math.PI / 4) });
      if (k > 0.8 && (this.sim.tickCount & 3) === 0) {
        this.sim.bus.emit('fx', { kind: 'sparks', x: z.x + 4.2, y: z.y + 1.2, z: z.z, n: 3 });
        this.sim.bus.emit('fx', { kind: 'sawdust', x: z.x + 4.2, y: z.y + 1.0, z: z.z, n: 4 });
      }
      if (k >= 1) {
        const l = f.log;
        const n = this.planksFor(l.units, l.mut);
        this.output[l.wood] = (this.output[l.wood] ?? 0) + n;
        this.sim.state.stats.planks = (this.sim.state.stats.planks ?? 0) + n;
        this.sim.state.stats.logsSawn = (this.sim.state.stats.logsSawn ?? 0) + 1;
        this.sim.bus.emit('plank:made', { wood: l.wood, count: n });
        this.sim.bus.emit('sfx', { name: 'saw', x: z.x, y: z.y, z: z.z, vol: 0.8 });
        this.sim.logs.removeLog(l.id);
        this.feeding.splice(i, 1);
      }
    }
  }
}
