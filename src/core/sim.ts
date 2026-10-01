import { CONFIG } from '../config';
import type { Game } from './game';
import type { GameState } from '../save/schema';
import { advance } from './gameTime';
import { PhysicsWorld } from '../physics/world';
import type { Streamer } from '../systems/streaming';
import type { PlayerSystem } from '../systems/player';
import type { TreeSystem } from '../systems/trees';
import type { HubSystem } from '../systems/hubSystem';
import type { EconomySystem } from '../systems/economy';

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
  // typed handles to core systems (assigned in boot.ts)
  streamer!: Streamer;
  player!: PlayerSystem;
  trees!: TreeSystem;
  hub!: HubSystem;
  econ!: EconomySystem;
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

  /** Positions that need nearby collision geometry (player, vehicles, ...). */
  actorPositions(): { x: number; z: number; r: number }[] {
    const out = [{ x: this.player.x, z: this.player.z, r: 26 }];
    return out;
  }

  beforeSave(): void {
    for (const s of this.systems) s.beforeSave?.();
  }

  dispose(): void {
    for (const s of this.systems) s.dispose?.();
    this.physics.dispose();
  }
}
