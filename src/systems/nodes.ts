import type { Sim, System } from '../core/sim';
import { Rng, hash2 } from '../core/rng';
import { BIOMES, BIOME_BY_ID } from '../data/biomes';
import { CONFIG } from '../config';
import { SEA_LEVEL } from '../world/terrain';
import { levelOf } from '../core/skills';
import type { Interactable } from './hubSystem';
import { itemName } from './itemValue';
import { isNight } from '../core/gameTime';

export type NodeKind = 'ore' | 'forage' | 'dig';
export interface ResNode {
  id: string;
  kind: NodeKind;
  x: number;
  z: number;
  y: number;
  item: string;
  biome: string;
  /** seasonal collectible */
  seasonal?: boolean;
}

const ORE_TABLE: Record<string, [string, number][]> = {
  birchwood: [
    ['coal', 3],
    ['copper_ore', 2],
  ],
  redwood: [
    ['coal', 2],
    ['iron_ore', 3],
  ],
  goldbasin: [
    ['copper_ore', 2],
    ['gold_ore', 3],
    ['iron_ore', 2],
  ],
  volcano: [
    ['coal', 4],
    ['iron_ore', 3],
    ['gold_ore', 1],
  ],
  taiga: [
    ['iron_ore', 3],
    ['coal', 2],
  ],
  crystal: [
    ['crystal_shard', 3],
    ['gold_ore', 2],
    ['iron_ore', 2],
  ],
  deepcave: [
    ['crystal_shard', 3],
    ['gold_ore', 3],
  ],
  desert: [
    ['copper_ore', 3],
    ['gold_ore', 2],
  ],
  cherry: [['copper_ore', 2]],
  swamp: [['coal', 2]],
  haunted: [
    ['iron_ore', 2],
    ['gold_ore', 1],
  ],
};
const FORAGE_TABLE: Record<string, [string, number][]> = {
  meadow: [
    ['berries', 3],
    ['herbs', 2],
    ['mushroom', 2],
  ],
  birchwood: [
    ['mushroom', 3],
    ['berries', 2],
    ['honeycomb', 1],
  ],
  cherry: [
    ['berries', 3],
    ['honeycomb', 2],
    ['herbs', 2],
  ],
  redwood: [
    ['mushroom', 4],
    ['herbs', 2],
  ],
  swamp: [
    ['herbs', 3],
    ['mushroom', 3],
  ],
  goldbasin: [['herbs', 2]],
  taiga: [
    ['frostbloom', 3],
    ['berries', 1],
  ],
  tropics: [
    ['honeycomb', 2],
    ['berries', 3],
  ],
  crystal: [['glowcap', 4]],
  deepcave: [['glowcap', 3]],
  desert: [['aloe', 4]],
  haunted: [
    ['mushroom', 2],
    ['herbs', 2],
  ],
  volcano: [['herbs', 1]],
  sky: [
    ['honeycomb', 3],
    ['herbs', 2],
  ],
};
const DIG_LOOT: [string, number, number][] = [
  ['old_coin', 6, 1],
  ['relic', 2.5, 1],
  ['gem_red', 1, 1],
  ['gem_blue', 0.8, 1],
  ['crown', 0.1, 1],
  ['honeycomb', 3, 2],
  ['gear_scrap', 0, 1],
];

function weighted(r: number, t: [string, number][]): string {
  const total = t.reduce((a, [, w]) => a + w, 0);
  let x = r * total;
  for (const [id, w] of t) {
    x -= w;
    if (x <= 0) return id;
  }
  return t[0]![0];
}

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export const seasonOf = (days: number) => SEASONS[Math.floor(days / 7) % 4]!;

/** Mining ore veins, foraging, treasure digging and fishing. */
export class NodeSystem implements System {
  readonly name = 'nodes';
  nodes: ResNode[] = [];
  private respawn = new Map<string, number>(); // id -> state.time when available
  treasure: { x: number; z: number; found: boolean } | null = null;
  fishing: { t: number; wait: number; bite: boolean } | null = null;
  private tick = 0;
  digHold = 0;
  constructor(private sim: Sim) {}

  init(): void {
    const T = this.sim.streamer.terrain;
    const rng = new Rng(this.sim.state.seed ^ 0x0e5a);
    const place = (
      kind: NodeKind,
      biomeId: string,
      count: number,
      table: Record<string, [string, number][]>,
    ) => {
      const b = BIOME_BY_ID[biomeId as keyof typeof BIOME_BY_ID];
      const t = table[biomeId];
      if (!b || !t) return;
      let n = 0,
        tries = 0;
      while (n < count && tries < count * 25) {
        tries++;
        const a = rng.range(0, Math.PI * 2);
        const r = Math.sqrt(rng.float()) * b.radius * 0.9;
        const x = b.center[0] + Math.cos(a) * r,
          z = b.center[1] + Math.sin(a) * r;
        if (T.biomeAt(x, z).id !== b.id) continue;
        let y = T.heightAt(x, z);
        if (b.id === 'sky') {
          const sy = T.skyIslandHeight(x, z);
          if (sy === null) continue;
          y = sy;
        }
        if (y < SEA_LEVEL + 0.5 && b.id !== 'swamp') continue;
        this.nodes.push({
          id: `${kind}:${biomeId}:${n}`,
          kind,
          x,
          z,
          y,
          item: weighted(rng.float(), t),
          biome: biomeId,
        });
        n++;
      }
    };
    for (const b of BIOMES) {
      place('ore', b.id, b.indoor ? 14 : 7, ORE_TABLE);
      place('forage', b.id, 10, FORAGE_TABLE);
    }
    // seasonal collectibles near the hub, refreshed with the season
    for (let i = 0; i < 14; i++) {
      const a = rng.range(0, Math.PI * 2),
        r = rng.range(25, 70);
      this.nodes.push({
        id: `seasonal:${i}`,
        kind: 'forage',
        x: Math.cos(a) * r,
        z: Math.sin(a) * r + 6,
        y: 4,
        item: 'seasonal',
        biome: 'meadow',
        seasonal: true,
      });
    }
    this.treasure = this.sim.state.world.treasure[0] ?? null;
  }

  available(n: ResNode): boolean {
    return (this.respawn.get(n.id) ?? 0) <= this.sim.state.time;
  }

  seasonalItem(): string | null {
    const s = seasonOf(this.sim.state.time);
    return s === 'spring' ? 'egg' : s === 'autumn' ? 'pumpkin' : s === 'winter' ? 'candy' : null;
  }

  itemOf(n: ResNode): string {
    if (n.seasonal) return this.seasonalItem() ?? 'berries';
    return n.item;
  }

  update(): void {
    this.tick++;
    const sim = this.sim;
    const p = sim.player;
    const st = sim.state;
    if (this.tick % 15 === 0) this.refresh(p);
    if (this.fishing) this.updateFishing(1 / 60);
    void st;
  }

  private refresh(p: { x: number; z: number }): void {
    const list: Interactable[] = [];
    const sim = this.sim;
    for (const n of this.nodes) {
      if (Math.abs(n.x - p.x) > 8 || Math.abs(n.z - p.z) > 8) continue;
      if (!this.available(n)) continue;
      if (n.seasonal && !this.seasonalItem()) continue;
      const item = this.itemOf(n);
      const need = n.kind === 'ore' ? 'pickaxe' : null;
      list.push({
        id: 'node:' + n.id,
        label:
          n.kind === 'ore'
            ? sim.inventory.has('pickaxe')
              ? `Mine ${itemName(item)}`
              : 'Needs a Pickaxe'
            : `Gather ${itemName(item)}`,
        x: n.x,
        z: n.z,
        y: n.y,
        radius: 3,
        kind: 'node' as any,
        arg: n.id,
      });
      void need;
    }
    // fishing spot: facing water within 6m with a rod
    if (sim.inventory.has('fishing_rod') && !sim.vehicles.current) {
      const T = sim.streamer.terrain;
      const fx = -Math.sin(sim.player.camYaw),
        fz = -Math.cos(sim.player.camYaw);
      for (const d of [3, 5, 7]) {
        if (T.heightAt(p.x + fx * d, p.z + fz * d) < SEA_LEVEL - 0.5) {
          list.push({
            id: 'fish',
            label: this.fishing ? 'Stop fishing' : 'Cast line',
            x: p.x,
            z: p.z,
            y: 0,
            radius: 99,
            kind: 'fish' as any,
            prio: 60,
          });
          break;
        }
      }
    }
    // treasure dig
    if (
      this.treasure &&
      !this.treasure.found &&
      Math.hypot(this.treasure.x - p.x, this.treasure.z - p.z) < 6
    ) {
      list.push({
        id: 'dig',
        label: sim.inventory.has('shovel') ? 'Dig here' : 'Needs a Shovel',
        x: this.treasure.x,
        z: this.treasure.z,
        y: 0,
        radius: 6,
        kind: 'dig' as any,
      });
    }
    sim.hub.extraNodes = list;
  }

  gather(id: string): boolean {
    const sim = this.sim;
    const n = this.nodes.find((x) => x.id === id);
    if (!n || !this.available(n)) return false;
    if (n.kind === 'ore' && !sim.inventory.has('pickaxe')) {
      sim.bus.emit('notify', { text: 'You need a Pickaxe (Gus sells them)', kind: 'bad' });
      return false;
    }
    const item = this.itemOf(n);
    const luck =
      1 + levelOf(sim.state.skills.foraging) * 0.02 + (sim.state.activePet === 'pet_fox' ? 0.2 : 0);
    const count =
      n.kind === 'ore'
        ? 1 + (Math.random() < 0.3 * luck ? 1 : 0) + (levelOf(sim.state.skills.strength) > 10 ? 1 : 0)
        : 1 + (Math.random() < 0.25 * luck ? 1 : 0);
    const left = sim.inventory.add(item, count);
    if (left === count) {
      sim.bus.emit('notify', { text: 'Inventory full', kind: 'bad' });
      return false;
    }
    this.respawn.set(n.id, sim.state.time + (n.kind === 'ore' ? 300 : 150) / CONFIG.dayLengthSec);
    sim.addXp(n.kind === 'ore' ? 'strength' : 'foraging', n.kind === 'ore' ? 8 : 5);
    if (n.kind === 'ore') {
      sim.state.stats.ore = (sim.state.stats.ore ?? 0) + count;
      sim.quests.progress('mine', undefined, count);
      sim.bus.emit('sfx', { name: 'chop', x: n.x, y: n.y, z: n.z });
      sim.bus.emit('fx', { kind: 'chips', x: n.x, y: n.y + 0.5, z: n.z, color: 0x888890, n: 8 });
    } else {
      sim.state.stats.foraged = (sim.state.stats.foraged ?? 0) + count;
      sim.bus.emit('sfx', { name: 'good' });
    }
    sim.bus.emit('notify', { text: `+${count}× ${itemName(item)}`, kind: 'good' });
    return true;
  }

  // ---- treasure
  useMap(): boolean {
    const sim = this.sim;
    if (!sim.inventory.has('treasure_map')) return false;
    if (this.treasure && !this.treasure.found) {
      sim.bus.emit('notify', { text: 'You are already following a map', kind: 'info' });
      return false;
    }
    sim.inventory.remove('treasure_map', 1);
    const T = sim.streamer.terrain;
    const rng = new Rng((Date.now() ^ sim.state.world.nextUid++) >>> 0);
    for (let i = 0; i < 80; i++) {
      const a = rng.range(0, Math.PI * 2),
        r = rng.range(120, 420);
      const x = sim.player.x + Math.cos(a) * r,
        z = sim.player.z + Math.sin(a) * r;
      if (Math.abs(x) > 1400 || Math.abs(z) > 1400) continue;
      const b = T.biomeAt(x, z);
      if (b.indoor || b.id === 'sky' || T.heightAt(x, z) < 1) continue;
      this.treasure = { x, z, found: false };
      sim.state.world.treasure = [this.treasure];
      sim.bus.emit('notify', {
        text: `X marks the spot — ${Math.round(r)}m to the ${b.name}. Bring a shovel.`,
        kind: 'good',
      });
      return true;
    }
    return false;
  }
  dig(): boolean {
    const sim = this.sim;
    const t = this.treasure;
    if (!t || t.found) return false;
    if (!sim.inventory.has('shovel')) {
      sim.bus.emit('notify', { text: 'You need a Shovel', kind: 'bad' });
      return false;
    }
    const b = sim.streamer.terrain.biomeAt(t.x, t.z);
    const rng = new Rng((Math.floor(t.x) * 31 + Math.floor(t.z)) >>> 0);
    const luck = 1 + levelOf(sim.state.skills.foraging) * 0.03;
    let total = 0;
    for (const [, w] of DIG_LOOT) total += w;
    let r = rng.float() * total;
    let pick = DIG_LOOT[0]![0];
    for (const [id, w] of DIG_LOOT) {
      r -= w * (id === 'crown' || id === 'gem_red' || id === 'gem_blue' ? luck : 1);
      if (r <= 0) {
        pick = id;
        break;
      }
    }
    if (pick === 'gear_scrap') pick = 'gold_ore';
    const n = pick === 'old_coin' ? rng.int(3, 8) : 1;
    sim.inventory.add(pick, n);
    sim.econ.earn(Math.round(150 * b.tier * b.tier), 'treasure');
    t.found = true;
    sim.state.world.treasure = [];
    this.treasure = null;
    sim.addXp('foraging', 60);
    sim.state.stats.treasures = (sim.state.stats.treasures ?? 0) + 1;
    sim.bus.emit('notify', { text: `Treasure! ${n}× ${itemName(pick)} and a pouch of coins`, kind: 'money' });
    sim.bus.emit('fx', { kind: 'magic', x: t.x, y: 1, z: t.z, n: 30, color: 0xffe066 });
    return true;
  }

  // ---- fishing
  toggleFishing(): void {
    const sim = this.sim;
    if (this.fishing) {
      this.fishing = null;
      return;
    }
    const lvl = levelOf(sim.state.skills.foraging);
    this.fishing = { t: 0, wait: 2.5 + Math.random() * 4.5 - Math.min(2, lvl * 0.05), bite: false };
    sim.bus.emit('notify', { text: 'You cast your line…', kind: 'info' });
    sim.bus.emit('sfx', { name: 'splash' });
  }
  private updateFishing(dt: number): void {
    const f = this.fishing!;
    const sim = this.sim;
    f.t += dt;
    if (sim.vehicles.current || Math.hypot(sim.player.vx, sim.player.vz) > 2) {
      this.fishing = null;
      return;
    }
    if (!f.bite && f.t >= f.wait) {
      f.bite = true;
      sim.bus.emit('notify', { text: 'A bite! Reeling in…', kind: 'good' });
      sim.bus.emit('sfx', { name: 'splash' });
    }
    if (f.bite && f.t >= f.wait + 1.2) {
      this.catchFish();
      this.fishing = null;
    }
  }
  private catchFish(): void {
    const sim = this.sim;
    const b = sim.biome.current;
    const lvl = levelOf(sim.state.skills.foraging);
    const luck = 1 + lvl * 0.04 + (sim.state.activePet === 'pet_fox' ? 0.2 : 0);
    const r = Math.random();
    let fish = 'minnow';
    const deep = ['swamp'].includes(b.id);
    const sea = ['tropics'].includes(b.id);
    if (r < 0.01 * luck && b.tier >= 2) fish = 'golden_koi';
    else if (sea && r < 0.45) fish = 'tuna';
    else if (deep && r < 0.5) fish = 'eel';
    else if (r < 0.35 * luck) fish = r < 0.18 * luck ? 'bass' : 'trout';
    sim.inventory.add(fish, 1);
    sim.addXp('foraging', 10);
    sim.state.stats.fish = (sim.state.stats.fish ?? 0) + 1;
    sim.quests.progress('fish', undefined, 1);
    sim.bus.emit('notify', { text: `Caught a ${itemName(fish)}!`, kind: 'good' });
    sim.bus.emit('sfx', { name: 'coin' });
  }
}
void hash2;
void isNight;
