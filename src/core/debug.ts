import type { Game } from './game';
import { AXES } from '../data/axes';
import { BIOME_BY_ID, BIOMES } from '../data/biomes';
import { ITEM_BY_ID, ITEMS } from '../data/items';
import { VEHICLES } from '../data/vehicles';
import { WOODS } from '../data/woods';
import { HUB } from '../world/layout';

/** Debug console commands (backtick). Cheats for testing. */
export function runCommand(game: Game, line: string): string {
  const sim = game.sim;
  if (!sim) return 'no game running';
  const [cmd, ...args] = line.trim().split(/\s+/);
  const num = (i: number, d = 0) =>
    args[i] !== undefined && !Number.isNaN(Number(args[i])) ? Number(args[i]) : d;
  switch (cmd) {
    case 'help':
      return 'money N | give ITEM [N] | axe ID | axes (give all) | tp BIOME|hub|X Z | time H | weather KIND | unlockall | xp SKILL N | vehicle ID | heal | speed N | fly | fell | stats | ids';
    case 'money':
      sim.econ.earn(num(0, 1000), 'debug');
      return `money = ${sim.state.money}`;
    case 'give': {
      const id = args[0] ?? '';
      if (!ITEM_BY_ID[id] && !id.includes('@')) return `unknown item ${id}`;
      const left = sim.inventory.add(id, num(1, 1));
      return left ? `inventory full (${left} left over)` : 'ok';
    }
    case 'axe': {
      if (!AXES.find((a) => a.id === args[0])) return 'unknown axe';
      sim.inventory.giveAxe(args[0]!);
      return 'ok';
    }
    case 'axes':
      for (const a of AXES) if (!sim.state.axes.some((x) => x.def === a.id)) sim.inventory.giveAxe(a.id);
      return `${sim.state.axes.length} axes`;
    case 'tp': {
      const a = args[0] ?? '';
      if (a === 'hub') sim.player.teleport(HUB.spawn[0], HUB.spawn[1]);
      else if (BIOME_BY_ID[a as keyof typeof BIOME_BY_ID]) {
        const b = BIOME_BY_ID[a as keyof typeof BIOME_BY_ID];
        const y = b.id === 'sky' ? (b.elevation ?? 220) + 8 : undefined;
        if (b.indoor) sim.player.teleport(b.center[0] + b.radius * 0.5, b.center[1]);
        else sim.player.teleport(b.center[0], b.center[1], y);
      } else if (!Number.isNaN(Number(a))) sim.player.teleport(num(0), num(1));
      else return 'tp hub|' + BIOMES.map((b) => b.id).join('|') + '|x z';
      return `at ${sim.player.x.toFixed(0)}, ${sim.player.z.toFixed(0)}`;
    }
    case 'time':
      sim.state.time = Math.floor(sim.state.time) + num(0, 12) / 24;
      return 'ok';
    case 'weather':
      sim.state.weather = { kind: args[0] ?? 'clear', until: sim.state.time + 1 };
      return 'ok';
    case 'unlockall':
      for (const a of AXES) if (!sim.state.axes.some((x) => x.def === a.id)) sim.inventory.giveAxe(a.id);
      for (const i of ITEMS) if (i.gearSlot) sim.inventory.add(i.id, 1);
      sim.econ.earn(1e9, 'debug');
      for (const v of VEHICLES) sim.vehicles.give(v.id);
      return 'unlocked axes, gear, vehicles, +$1B';
    case 'xp':
      sim.addXp((args[0] ?? 'woodcutting') as any, num(1, 1000));
      return 'ok';
    case 'vehicle':
      return sim.vehicles.give(args[0] ?? 'pickup') ? 'ok' : 'unknown vehicle';
    case 'heal':
      sim.state.player.hp = 100;
      sim.state.player.stamina = 100;
      sim.state.player.fuel = 100;
      return 'ok';
    case 'speed':
      sim.player.extraSpeed = num(0, 1);
      return 'ok';
    case 'fell': {
      const t = sim.chopping.findTarget(8);
      if (!t) return 'no tree in front';
      sim.trees.hit(t, t.maxHp);
      sim.trees.markFelled(t);
      sim.logs.fellTree(t, sim.player.x, sim.player.z);
      return 'ok';
    }
    case 'stats':
      return JSON.stringify(sim.state.stats);
    case 'ids':
      return `woods: ${WOODS.map((w) => w.id).join(', ')}`;
    default:
      return `unknown command '${cmd}' (try help)`;
  }
}
