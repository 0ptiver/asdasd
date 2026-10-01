/** Deterministic tree placement. A tree is fully described by (chunk, index) + the world seed. */
import { CONFIG } from '../config';
import { hash2 } from '../core/rng';
import { BIOME_BY_ID } from '../data/biomes';
import { MUTATIONS, WOOD_BY_ID } from '../data/woods';
import type { BiomeDef, TreeStyle, WoodDef } from '../data/types';
import { HUB } from './layout';
import { ROAD_HALF, SEA_LEVEL, Terrain, roadDist, riverDist, RIVER_WIDTH } from './terrain';

export interface StyleInfo {
  height: number; // trunk height at scale 1
  radius: number; // base trunk radius at scale 1
}
export const STYLE: Record<TreeStyle, StyleInfo> = {
  broadleaf: { height: 8, radius: 0.45 },
  conifer: { height: 11, radius: 0.42 },
  birch: { height: 9, radius: 0.32 },
  cherry: { height: 7, radius: 0.42 },
  redwood: { height: 24, radius: 1.1 },
  palm: { height: 9, radius: 0.3 },
  cactus: { height: 5, radius: 0.5 },
  mangrove: { height: 7, radius: 0.5 },
  crystal: { height: 8, radius: 0.55 },
  mushroom: { height: 6, radius: 0.5 },
  cloud: { height: 8, radius: 0.5 },
  dead: { height: 8, radius: 0.4 },
  lava: { height: 8, radius: 0.55 },
  gold: { height: 8, radius: 0.5 },
  willow: { height: 8, radius: 0.5 },
};

export const LOG_SEG = 3; // meters per log segment at full length
export const LOG_R0 = 0.45; // reference radius for 1 unit of volume

export interface Tree {
  id: string;
  wood: string;
  style: TreeStyle;
  x: number;
  y: number;
  z: number;
  scale: number;
  yaw: number;
  mut: string | null;
  maxHp: number;
  hp: number;
  height: number;
  radius: number;
  nightOnly: boolean;
  glow: number;
  /** hidden = chopped (waiting to respawn) */
  hidden: boolean;
  guardian?: boolean;
}

export const treeKey = (cx: number, cz: number) => `${cx},${cz}`;

const MYTHIC_CHANCE = 1 / 20000;

function pickWood(biome: BiomeDef, r: number): WoodDef | null {
  const list = [...new Set(biome.woods)]
    .map((id) => WOOD_BY_ID[id]!)
    .filter((w) => w && !w.guardianOnly && w.weight > 0);
  if (!list.length) return null;
  let total = 0;
  for (const w of list) total += w.weight;
  let x = r * total;
  for (const w of list) {
    x -= w.weight;
    if (x <= 0) return w;
  }
  return list[list.length - 1]!;
}

/** Places trees for one chunk. `blocked(x,z)` lets plots / structures exclude areas. */
export function generateChunkTrees(
  terrain: Terrain,
  cx: number,
  cz: number,
  blocked?: (x: number, z: number) => boolean,
): Tree[] {
  const S = CONFIG.chunkSize;
  const cell = 8;
  const n = S / cell;
  const out: Tree[] = [];
  const seed = terrain.seed;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const gx = cx * n + i;
      const gz = cz * n + j;
      const h0 = hash2(gx, gz, seed + 1);
      const x = cx * S + (i + 0.15 + 0.7 * hash2(gx, gz, seed + 2)) * cell;
      const z = cz * S + (j + 0.15 + 0.7 * hash2(gx, gz, seed + 3)) * cell;
      const blend = terrain.biomeBlend(x, z);
      // choose owning biome stochastically across blends for natural borders
      let r = hash2(gx, gz, seed + 4);
      let biome = blend.main;
      for (const w of blend.weights) {
        r -= w.w;
        if (r <= 0) {
          biome = w.biome;
          break;
        }
      }
      const isSky = biome.id === 'sky';
      const edgeFade = Math.min(1, Math.max(0, 1.7 - blend.score));
      const dens = (biome.density / 100) * cell * cell * 0.62 * edgeFade;
      if (h0 > dens) continue;
      if (Math.hypot(x - HUB.center[0], z - HUB.center[1]) < HUB.flatRadius * 0.95 && biome.id === 'meadow')
        continue;
      if (roadDist(x, z) < ROAD_HALF + 3.5) continue;
      if (riverDist(x, z) < RIVER_WIDTH * 1.6) continue;
      let y: number;
      if (isSky) {
        const sy = terrain.skyIslandHeight(x, z);
        if (sy === null) continue;
        y = sy;
      } else {
        y = terrain.heightAt(x, z);
        if (y < SEA_LEVEL + 0.4 && biome.id !== 'swamp' && biome.id !== 'tropics') continue;
        if (y < SEA_LEVEL + 0.2) continue;
        if (terrain.slopeAt(x, z) > 1.1) continue;
        // caves: trees only inside their own indoor biome footprint, none in its walls/entrance
        const cave = terrain.caveInfo(x, z);
        if (cave && cave.biome.id !== biome.id) continue;
        if (biome.indoor && (!cave || cave.s > 0.9)) continue;
        // desert/gold basin sparse, volcano avoid lava patches handled by slope; skip very high peaks
        if (biome.id === 'volcano' && y > 95) continue;
      }
      if (blocked && blocked(x, z)) continue;
      const rw = hash2(gx, gz, seed + 5);
      let wood = pickWood(biome, rw);
      if (!wood) continue;
      if (biome.tier >= 2 && hash2(gx, gz, seed + 6) < MYTHIC_CHANCE) wood = WOOD_BY_ID.prismwood!;
      const id = `${cx},${cz}:${i},${j}`;
      const style = STYLE[wood.style];
      let scale = 0.8 + 0.5 * hash2(gx, gz, seed + 7);
      // mutation
      let mut: string | null = null;
      const mr = hash2(gx, gz, seed + 8);
      let acc = 0;
      for (const m of MUTATIONS) {
        const boost =
          m.id === 'cursed' && biome.id === 'haunted'
            ? 5
            : m.id === 'frozen' && biome.id === 'taiga'
              ? 6
              : m.id === 'golden' && biome.id === 'goldbasin'
                ? 2
                : 1;
        acc += m.chance * boost;
        if (mr < acc) {
          mut = m.id;
          break;
        }
      }
      if (wood.id === 'prismwood') mut = null;
      const md = mut ? MUTATIONS.find((m) => m.id === mut)! : null;
      if (md) scale *= md.scale;
      const maxHp = Math.round(wood.hp * scale * scale * (md?.hpMult ?? 1));
      out.push({
        id,
        wood: wood.id,
        style: wood.style,
        x,
        y,
        z,
        scale,
        yaw: hash2(gx, gz, seed + 9) * Math.PI * 2,
        mut,
        maxHp,
        hp: maxHp,
        height: style.height * scale,
        radius: style.radius * scale,
        nightOnly: !!wood.nightOnly,
        glow: wood.props.includes('glows') || wood.emissive ? 1 : 0,
        hidden: false,
      });
    }
  }
  return out;
}

/** Volume units of a log segment (1 unit = 3m at reference radius). */
export const logUnits = (len: number, r: number): number => (len / LOG_SEG) * (r / LOG_R0) * (r / LOG_R0);

/** Plan how a felled tree splits into log segments (bottom → top). */
export function planLogs(
  tree: Pick<Tree, 'height' | 'radius' | 'style'>,
): { len: number; r: number; offset: number }[] {
  const stump = 0.5;
  const usable = Math.max(1.5, tree.height * 0.85 - stump);
  const n = Math.max(1, Math.ceil(usable / LOG_SEG));
  const out: { len: number; r: number; offset: number }[] = [];
  let off = stump;
  for (let i = 0; i < n; i++) {
    const len = Math.min(LOG_SEG, usable - i * LOG_SEG);
    if (len < 0.4) break;
    const t = (off + len / 2) / tree.height;
    const r = tree.radius * (1 - 0.55 * t);
    out.push({ len, r, offset: off });
    off += len;
  }
  return out;
}

export const woodOf = (id: string): WoodDef => WOOD_BY_ID[id] as WoodDef;
export const biomeOf = (id: string): BiomeDef => BIOME_BY_ID[id as keyof typeof BIOME_BY_ID];
