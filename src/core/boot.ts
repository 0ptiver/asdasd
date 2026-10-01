import type { Game } from './game';
import { Sim } from './sim';
import type { GameState } from '../save/schema';
import { Streamer } from '../systems/streaming';
import { PlayerSystem } from '../systems/player';
import { TreeSystem } from '../systems/trees';
import { HubSystem } from '../systems/hubSystem';
import { EconomySystem } from '../systems/economy';

/** Assembles all simulation systems in dependency order. */
export function buildSim(game: Game, state: GameState): Sim {
  const sim = new Sim(game, state);
  sim.econ = sim.add(new EconomySystem(sim));
  sim.streamer = sim.add(new Streamer(sim));
  sim.player = sim.add(new PlayerSystem(sim, sim.streamer));
  sim.trees = sim.add(new TreeSystem(sim, sim.streamer));
  sim.hub = sim.add(new HubSystem(sim, sim.streamer));
  return sim;
}
