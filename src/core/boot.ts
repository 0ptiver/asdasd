import type { Game } from './game';
import { Sim } from './sim';
import type { GameState } from '../save/schema';
import { Streamer } from '../systems/streaming';
import { PlayerSystem } from '../systems/player';
import { TreeSystem } from '../systems/trees';
import { HubSystem } from '../systems/hubSystem';
import { EconomySystem } from '../systems/economy';
import { InventorySystem } from '../systems/inventory';
import { LogSystem } from '../systems/logs';
import { GrabSystem } from '../systems/grab';
import { ChoppingSystem } from '../systems/chopping';
import { MarketSystem } from '../systems/market';
import { SawmillSystem } from '../systems/sawmill';
import { SellSystem } from '../systems/sell';
import { ShopSystem } from '../systems/shop';
import { ControlsSystem } from '../systems/controls';
import { ItemUseSystem } from '../systems/itemUse';
import { QuestSystem } from '../systems/quests';
import { BiomeSystem } from '../systems/biomeSystem';
import { PlotSystem } from '../systems/plots';
import { BuildingSystem } from '../systems/building';
import { VehicleSystem } from '../systems/vehicles';

/** Assembles all simulation systems in dependency order. */
export function buildSim(game: Game, state: GameState): Sim {
  const sim = new Sim(game, state);
  sim.econ = sim.add(new EconomySystem(sim));
  sim.streamer = sim.add(new Streamer(sim));
  sim.plots = sim.add(new PlotSystem(sim, sim.streamer));
  sim.player = sim.add(new PlayerSystem(sim, sim.streamer));
  sim.trees = sim.add(new TreeSystem(sim, sim.streamer));
  sim.hub = sim.add(new HubSystem(sim, sim.streamer));
  sim.inventory = sim.add(new InventorySystem(sim));
  sim.market = sim.add(new MarketSystem(sim));
  sim.logs = sim.add(new LogSystem(sim));
  sim.grab = sim.add(new GrabSystem(sim));
  sim.chopping = sim.add(new ChoppingSystem(sim));
  sim.sawmill = sim.add(new SawmillSystem(sim));
  sim.sell = sim.add(new SellSystem(sim));
  sim.shop = sim.add(new ShopSystem(sim));
  sim.itemUse = sim.add(new ItemUseSystem(sim));
  sim.quests = sim.add(new QuestSystem(sim));
  sim.biome = sim.add(new BiomeSystem(sim));
  sim.building = sim.add(new BuildingSystem(sim));
  sim.vehicles = sim.add(new VehicleSystem(sim));
  sim.add(new ControlsSystem(sim));
  return sim;
}
