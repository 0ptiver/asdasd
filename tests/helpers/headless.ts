import { EventBus } from '../../src/core/events';
import { DEFAULT_SETTINGS, newGameState, type GameState } from '../../src/save/schema';
import { buildSim } from '../../src/core/boot';
import { initPhysics } from '../../src/physics/world';
import type { Sim } from '../../src/core/sim';

export class FakeInput {
  moveX = 0;
  moveY = 0;
  lookDX = 0;
  lookDY = 0;
  primary = false;
  secondary = false;
  wheel = 0;
  uiOpen = false;
  keys = new Set<string>();
  edges = new Set<string>();
  held(a: string) {
    return this.keys.has(a);
  }
  rawPressed(c: string) {
    return this.edges.has(c);
  }
  pressed(a: string) {
    return this.edges.has(a);
  }
}

export async function makeSim(
  seed = 123,
  patch?: (s: GameState) => void,
): Promise<{ sim: Sim; input: FakeInput; state: GameState; game: any }> {
  await initPhysics();
  const state = newGameState('Test', seed);
  patch?.(state);
  const input = new FakeInput();
  const game: any = {
    bus: new EventBus(),
    settings: { ...DEFAULT_SETTINGS },
    input,
    save: async () => {},
    loop: { fps: 60 },
  };
  const sim = buildSim(game, state);
  game.sim = sim;
  await sim.init();
  return { sim, input, state, game };
}

export function run(sim: Sim, seconds: number, each?: (i: number) => void): void {
  const n = Math.round(seconds * 60);
  for (let i = 0; i < n; i++) {
    each?.(i);
    sim.step(1 / 60);
  }
}

/** Teleport the player next to the nearest tree matching `pred` and aim at it. */
export function standBeside(sim: Sim, pred: (t: any) => boolean = () => true): any {
  const p = sim.player;
  const cands = sim.trees
    .near(p.x, p.z, 400)
    .filter(pred)
    .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
  const t = cands[0];
  if (!t) throw new Error('no tree found');
  const dx = t.x - p.x,
    dz = t.z - p.z,
    d = Math.hypot(dx, dz);
  p.teleport(t.x - (dx / d) * 2.4, t.z - (dz / d) * 2.4);
  p.camYaw = Math.atan2(-dx, -dz);
  return t;
}
