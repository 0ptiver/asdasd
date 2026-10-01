/** Fixed and seeded world landmarks: fast-travel stations, secrets, cave shafts, outposts, oasis. */
import { Rng } from '../core/rng';
import { BIOMES } from '../data/biomes';
import { HUB, BRIDGE, DOCK } from './layout';
import type { Terrain } from './terrain';
import { SEA_LEVEL } from './terrain';

export interface Station {
  id: string;
  name: string;
  x: number;
  z: number;
  biome: string;
  start?: boolean;
}
export interface Secret {
  id: string;
  x: number;
  z: number;
  biome: string;
  kind: 'acorn' | 'chest' | 'statue' | 'shrine';
  reward: { money?: number; item?: string; n?: number; pet?: string; xp?: number };
}
export interface Shaft {
  id: string;
  name: string;
  a: [number, number];
  b: [number, number];
}
export interface Outpost {
  id: string;
  name: string;
  x: number;
  z: number;
  biome: string;
  income: number;
  cost: number;
}

export function buildStations(): Station[] {
  const out: Station[] = [{ id: 'hub', name: 'Hub Square', x: 12, z: 10, biome: 'meadow', start: true }];
  for (const b of BIOMES) {
    if (b.id === 'meadow') continue;
    // station sits toward the hub side of each biome, near its road
    const dx = HUB.center[0] - b.center[0],
      dz = HUB.center[1] - b.center[1];
    const d = Math.hypot(dx, dz) || 1;
    const off = b.indoor ? b.radius * 0.3 : b.radius * 0.45;
    out.push({
      id: b.id,
      name: `${b.name} Station`,
      x: b.center[0] + (dx / d) * off,
      z: b.center[1] + (dz / d) * off,
      biome: b.id,
    });
  }
  void BRIDGE;
  void DOCK;
  return out;
}

export function buildSecrets(terrain: Terrain, seed: number): Secret[] {
  const rng = new Rng(seed ^ 0x5ec2e7);
  const out: Secret[] = [];
  const kinds: Secret['kind'][] = ['acorn', 'chest', 'statue', 'shrine'];
  for (const b of BIOMES) {
    let n = 0;
    let tries = 0;
    while (n < 3 && tries < 200) {
      tries++;
      const a = rng.range(0, Math.PI * 2);
      const r = Math.sqrt(rng.float()) * b.radius * 0.85;
      const x = b.center[0] + Math.cos(a) * r;
      const z = b.center[1] + Math.sin(a) * r;
      if (terrain.biomeAt(x, z).id !== b.id) continue;
      let y = terrain.heightAt(x, z);
      if (b.id === 'sky') {
        const sy = terrain.skyIslandHeight(x, z);
        if (sy === null) continue;
        y = sy;
      }
      if (y < SEA_LEVEL + 0.6) continue;
      const kind = kinds[n % kinds.length]!;
      const tier = b.tier;
      const reward =
        n === 0
          ? { money: 400 * tier * tier * (1 + tier) }
          : n === 1
            ? { item: tier >= 4 ? 'crystal_shard' : 'old_coin', n: 1 + tier }
            : { xp: 80 * tier, item: n === 2 && tier >= 3 ? 'gem_blue' : 'honeycomb', n: 1 };
      out.push({ id: `${b.id}:${n}`, x, z, biome: b.id, kind, reward });
      n++;
    }
  }
  // a pet reward hidden in three places
  const pets = ['pet_fox', 'pet_owl', 'pet_beaver'];
  pets.forEach((p, i) => {
    const s = out.filter((o) => o.kind === 'shrine')[i * 4 + 1];
    if (s) s.reward = { pet: p, money: 5000 };
  });
  return out;
}

export const SHAFTS: Shaft[] = [
  { id: 'shaft1', name: 'Crystal Mine Shaft', a: [-560, -150], b: [-1100, -150] },
  { id: 'shaft2', name: 'Deep Shaft', a: [-1000, 760], b: [-1180, -640] },
];

export const OUTPOSTS: Outpost[] = [
  {
    id: 'op_birch',
    name: 'Birchwood Lumber Camp',
    x: -430,
    z: -60,
    biome: 'birchwood',
    income: 220,
    cost: 60000,
  },
  {
    id: 'op_redwood',
    name: 'Redwood Mill Outpost',
    x: 40,
    z: -460,
    biome: 'redwood',
    income: 900,
    cost: 240000,
  },
  { id: 'op_gold', name: 'Gold Basin Depot', x: 480, z: 400, biome: 'goldbasin', income: 3000, cost: 900000 },
  { id: 'op_oasis', name: 'Oasis Trading Post', x: 20, z: 960, biome: 'desert', income: 9000, cost: 3000000 },
  {
    id: 'op_isles',
    name: 'Isles Dock Depot',
    x: 900,
    z: 800,
    biome: 'tropics',
    income: 24000,
    cost: 9000000,
  },
];
