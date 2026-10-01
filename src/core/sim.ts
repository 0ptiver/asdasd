import { CONFIG } from '../config';
import type { Game } from './game';
import type { GameState } from '../save/schema';
import { advance } from './gameTime';
import { PhysicsWorld } from '../physics/world';

export interface System {
  readonly name: string;
  init?(): void | Promise<void>;
  update(dt: number): void;
  beforeSave?(): void;
  dispose?(): void;
}

/** The deterministic-ish simulation: owns physics + systems, steps at fixed dt. No rendering here. */
export class Sim {
  readonly bus;
  readonly physics = new PhysicsWorld();
  readonly systems: System[] = [];
  tickCount = 0;
  private autosaveAcc = 0;

  constructor(
    readonly game: Game,
    readonly state: GameState,
  ) {
    this.bus = game.bus;
  }

  add<T extends System>(s: T): T {
    this.systems.push(s);
    return s;
  }

  async init(): Promise<void> {
    for (const s of this.systems) await s.init?.();
  }

  step(dt: number): void {
    this.tickCount++;
    this.state.time = advance(this.state.time, dt);
    this.state.playedSec += dt;
    this.physics.step();
    for (const s of this.systems) s.update(dt);
    this.autosaveAcc += dt;
    if (this.autosaveAcc >= CONFIG.autosaveSec && this.game.settings.autosave) {
      this.autosaveAcc = 0;
      void this.game.save(true);
    }
  }

  beforeSave(): void {
    for (const s of this.systems) s.beforeSave?.();
  }

  dispose(): void {
    for (const s of this.systems) s.dispose?.();
    this.physics.dispose();
  }
}
