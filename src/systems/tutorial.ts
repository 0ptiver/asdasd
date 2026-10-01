import type { Sim, System } from '../core/sim';
import { WOODS } from '../data/woods';

export const TUTORIAL_STEPS: { text: string; done: (s: Sim) => boolean }[] = [
  { text: 'Welcome to Timber Empire! Move with WASD (mouse to look, Shift to sprint). Walk to Gus & Sons (the tool shop west of the fountain), press [E] and buy an axe.', done: (s) => s.state.axes.length > 0 },
  { text: 'Head out of town to the trees, face one and HOLD the left mouse button to chop it down.', done: (s) => (s.state.stats.trees ?? 0) >= 1 },
  { text: 'The tree fell into logs! Click and hold a log to grab it (scroll changes distance, right-click throws), and drop it into the glowing LOGS IN bay of the Public Sawmill.', done: (s) => (s.state.stats.logsSawn ?? 0) >= 1 || (s.state.stats.logsSold ?? 0) >= 1 },
  { text: 'Collect the planks from the sawmill output with [E] — planks are worth more than logs.', done: (s) => WOODS.some((w) => s.inventory.count('plank_' + w.id) > 0) || (s.state.stats.planksSold ?? 0) > 0 || (s.state.stats.logsSold ?? 0) > 0 },
  { text: 'Sell at the Sell Counter: press [E] there to sell planks, or drop logs straight onto the counter pad.', done: (s) => (s.state.stats.planksSold ?? 0) >= 1 || (s.state.stats.logsSold ?? 0) >= 1 },
  { text: 'You\'re in business! Useful keys: [I] inventory · [J] quests & jobs · [M] map · [B] build (buy land from Marla first) · [G] garage. Upgrade your axe with the money you earn. Good luck!', done: () => false },
];

/** Short interactive tutorial driven by what the player actually does. */
export class TutorialSystem implements System {
  readonly name = 'tutorial';
  private t = 0;
  constructor(private sim: Sim) {}

  get step() {
    return this.sim.state.tutorial.step;
  }
  get active(): boolean {
    return !this.sim.state.tutorial.done;
  }
  get text(): string {
    return TUTORIAL_STEPS[Math.min(this.step, TUTORIAL_STEPS.length - 1)]!.text;
  }
  skip(): void {
    this.sim.state.tutorial.done = true;
  }

  update(dt: number): void {
    const tut = this.sim.state.tutorial;
    if (tut.done) return;
    this.t += dt;
    if (this.t < 0.5) return;
    this.t = 0;
    const cur = TUTORIAL_STEPS[tut.step]!;
    if (tut.step >= TUTORIAL_STEPS.length - 1) {
      // final tip stays for 20 seconds
      this.finalT = (this.finalT ?? 0) + 0.5;
      if (this.finalT > 20) tut.done = true;
      return;
    }
    if (cur.done(this.sim)) {
      tut.step++;
      this.sim.bus.emit('sfx', { name: 'good' });
    }
  }
  private finalT?: number;
}
