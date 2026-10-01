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
import type { InventorySystem } from '../systems/inventory';
import type { LogSystem } from '../systems/logs';
import type { GrabSystem } from '../systems/grab';
import type { ChoppingSystem } from '../systems/chopping';
import type { MarketSystem } from '../systems/market';
import type { SawmillSystem } from '../systems/sawmill';
import type { SellSystem } from '../systems/sell';
import type { ShopSystem } from '../systems/shop';
import type { ItemUseSystem } from '../systems/itemUse';
import type { QuestSystem } from '../systems/quests';
import type { BiomeSystem } from '../systems/biomeSystem';
import { levelOf } from './skills';
import type { SkillId } from '../data/types';
import type { WorldMap } from '../ui/worldMap';
import type { PlotSystem } from '../systems/plots';
import type { BuildingSystem } from '../systems/building';
import type { VehicleSystem } from '../systems/vehicles';
import type { WorldSystem } from '../systems/worldFeatures';
import type { CraftingSystem } from '../systems/crafting';
import type { ExchangeSystem } from '../systems/market2';
import type { JobSystem } from '../systems/jobs';
import type { WorkerSystem } from '../systems/workers';
import type { BusinessSystem } from '../systems/businesses';
import type { NodeSystem } from '../systems/nodes';
import type { BossSystem } from '../systems/bosses';
import type { AchievementSystem, PrestigeSystem, EventSystem, PetSystem } from '../systems/progression';

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
  inventory!: InventorySystem;
  logs!: LogSystem;
  grab!: GrabSystem;
  chopping!: ChoppingSystem;
  market!: MarketSystem;
  sawmill!: SawmillSystem;
  sell!: SellSystem;
  shop!: ShopSystem;
  itemUse!: ItemUseSystem;
  quests!: QuestSystem;
  biome!: BiomeSystem;
  worldMap: WorldMap | null = null;
  get fastTravel() {
    return this.world;
  }
  get treasure() {
    return this.nodes;
  }
  plots!: PlotSystem;
  building!: BuildingSystem;
  vehicles!: VehicleSystem;
  world!: WorldSystem;
  crafting!: CraftingSystem;
  exchange!: ExchangeSystem;
  jobs!: JobSystem;
  workers!: WorkerSystem;
  businesses!: BusinessSystem;
  nodes!: NodeSystem;
  bosses!: BossSystem;
  achievements!: AchievementSystem;
  prestige!: PrestigeSystem;
  events!: EventSystem;
  pets!: PetSystem;
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

  addXp(skill: SkillId, amount: number): void {
    const st = this.state;
    const before = levelOf(st.skills[skill]);
    st.skills[skill] += amount * (1 + st.prestige.level * 0.05);
    const after = levelOf(st.skills[skill]);
    if (after > before) {
      this.bus.emit('level', { skill, level: after });
      this.bus.emit('notify', {
        text: `${skill[0]!.toUpperCase() + skill.slice(1)} level ${after}!`,
        kind: 'good',
      });
    }
  }

  /** Positions that need nearby collision geometry (player, vehicles, ...). */
  actorPositions(): { x: number; z: number; r: number }[] {
    const out = [{ x: this.player.x, z: this.player.z, r: 26 }];
    const cv = this.vehicles?.current;
    if (cv) {
      const t = cv.body.translation();
      out.push({ x: t.x, z: t.z, r: 40 });
    }
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
