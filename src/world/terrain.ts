/**
 * Pure, seeded world generation: heights, biome ownership, rivers, roads. No rendering/physics deps,
 * so it is unit-testable and shared by chunk meshing, tree placement, physics colliders and the minimap.
 */
import { CONFIG } from '../config';
import { fbm, noise2 } from '../core/rng';
import { BIOMES, BIOME_BY_ID } from '../data/biomes';
import { PLOTS } from '../data/plots';
import { HUB, riverX, RIVER_WIDTH, BRIDGE_Z, BRIDGE, DOCK } from './layout';
import type { BiomeDef, BiomeId } from '../data/types';

export const SEA_LEVEL = 0;
const WORLD_HALF = CONFIG.worldSize / 2;
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ---------- river & roads ----------
export { riverX, RIVER_WIDTH, BRIDGE_Z, BRIDGE, DOCK };
export const riverDist = (x: number, z: number): number => Math.abs(x - riverX(z)) * 0.97;

type Pt = [number, number];
const c = (id: BiomeId): Pt => BIOME_BY_ID[id].center;
/** Road polylines. Roads flatten/colour terrain and are where vehicles go fast. */
export const ROADS: Pt[][] = [
  [[0, 0], [60, -26], [BRIDGE.x - 30, BRIDGE.z], [BRIDGE.x + 30, BRIDGE.z], [300, -110], c('cherry')],
  [[0, 0], [-120, -60], [-300, -100], c('birchwood')],
  [[0, 0], [10, -200], [-10, -380], c('redwood')],
  [[0, 0], [100, 150], [300, 320], c('goldbasin')],
  [[0, 0], [-120, 130], [-340, 280], c('swamp')],
  [[0, 0], [0, 300], [0, 640], c('desert')],
  [
    [c('birchwood')[0], c('birchwood')[1]],
    [-800, -160],
    [c('crystal')[0] + 150, c('crystal')[1]],
  ],
  [
    [c('redwood')[0], c('redwood')[1]],
    [-300, -800],
    [c('taiga')[0] + 200, c('taiga')[1] + 100],
  ],
  [
    [c('cherry')[0], c('cherry')[1]],
    [760, -300],
    [c('volcano')[0] - 200, c('volcano')[1] + 100],
  ],
  [
    [c('swamp')[0], c('swamp')[1]],
    [-800, 600],
    [c('haunted')[0] + 200, c('haunted')[1] - 40],
  ],
  [
    [DOCK.x, DOCK.z],
    [DOCK.x - 60, DOCK.z - 10],
    [30, 20],
  ],
  [
    [c('desert')[0], c('desert')[1]],
    [-30, 900],
    [0, 700],
  ],
];

/** Railway: hub station -> far biomes. Used by rail vehicles and rendering. */
export const RAIL: Pt[] = [
  [HUB.trainStation[0], HUB.trainStation[1]],
  [-160, -140],
  [-320, -260],
  [-520, -420],
  [-700, -640],
  [-760, -900],
  [-720, -1020],
];

function segDist(px: number, pz: number, a: Pt, b: Pt): number {
  const vx = b[0] - a[0];
  const vz = b[1] - a[1];
  const wx = px - a[0];
  const wz = pz - a[1];
  const l2 = vx * vx + vz * vz;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wz * vz) / l2));
  const dx = wx - vx * t;
  const dz = wz - vz * t;
  return Math.sqrt(dx * dx + dz * dz);
}

export function roadDist(x: number, z: number): number {
  let best = 1e9;
  for (const r of ROADS) {
    for (let i = 0; i < r.length - 1; i++) {
      const a = r[i]!;
      const b = r[i + 1]!;
      // cheap bbox reject
      if (
        x < Math.min(a[0], b[0]) - 40 ||
        x > Math.max(a[0], b[0]) + 40 ||
        z < Math.min(a[1], b[1]) - 40 ||
        z > Math.max(a[1], b[1]) + 40
      )
        continue;
      const d = segDist(x, z, a, b);
      if (d < best) best = d;
    }
  }
  return best;
}
export const ROAD_HALF = 4.2;

// ---------- biome ownership ----------
export interface BiomeBlend {
  main: BiomeDef;
  /** normalized distance to the main biome center (0 center, 1 edge) */
  score: number;
  weights: { biome: BiomeDef; w: number }[];
}

export class Terrain {
  constructor(readonly seed: number) {}

  private warp(x: number, z: number): number {
    return (fbm(x * 0.0025, z * 0.0025, this.seed + 11, 3) - 0.5) * 0.38;
  }

  biomeBlend(x: number, z: number): BiomeBlend {
    const warp = this.warp(x, z);
    let best: BiomeDef = BIOMES[0]!;
    let bestScore = 1e9;
    const raw: { biome: BiomeDef; s: number }[] = [];
    for (const b of BIOMES) {
      const dx = x - b.center[0];
      const dz = z - b.center[1];
      const d = Math.sqrt(dx * dx + dz * dz);
      const s = (d / b.radius) * (1 + warp);
      raw.push({ biome: b, s });
      if (s < bestScore) {
        bestScore = s;
        best = b;
      }
    }
    let total = 0;
    const weights: { biome: BiomeDef; w: number }[] = [];
    for (const r of raw) {
      if (r.s > bestScore * 1.0 + 0.5) continue;
      const w = 1 / (Math.pow(r.s, 6) + 1e-3);
      weights.push({ biome: r.biome, w });
      total += w;
    }
    for (const w of weights) w.w /= total;
    return { main: best, score: bestScore, weights };
  }

  biomeAt(x: number, z: number): BiomeDef {
    return this.biomeBlend(x, z).main;
  }

  /** Terrain height contribution of one biome (before blending). */
  private biomeHeight(b: BiomeDef, x: number, z: number, score: number): number {
    const s = this.seed;
    const dx = x - b.center[0];
    const dz = z - b.center[1];
    const d = Math.sqrt(dx * dx + dz * dz);
    switch (b.id) {
      case 'meadow': {
        const n = fbm(x * 0.008, z * 0.008, s + 1, 4) - 0.5;
        return b.baseHeight + n * b.amp * 2;
      }
      case 'birchwood': {
        const n = fbm(x * 0.007, z * 0.007, s + 2, 5) - 0.5;
        return b.baseHeight + n * b.amp * 2.2;
      }
      case 'cherry':
        return b.baseHeight + (fbm(x * 0.009, z * 0.009, s + 3, 4) - 0.5) * b.amp * 2;
      case 'redwood': {
        const n = fbm(x * 0.006, z * 0.006, s + 4, 5) - 0.5;
        const ridge = 1 - Math.abs(fbm(x * 0.004, z * 0.004, s + 40, 3) * 2 - 1);
        return b.baseHeight + n * b.amp * 1.4 + ridge * 10;
      }
      case 'swamp': {
        const n = fbm(x * 0.02, z * 0.02, s + 5, 4);
        const channels = smoothstep(0.55, 0.7, n);
        return b.baseHeight + (fbm(x * 0.05, z * 0.05, s + 51, 2) - 0.5) * b.amp - channels * 5.2;
      }
      case 'goldbasin': {
        const bowl = -smoothstep(0.1, 0.9, 1 - score) * 6;
        return (
          b.baseHeight +
          bowl +
          (fbm(x * 0.01, z * 0.01, s + 6, 4) - 0.5) * b.amp * 2 +
          smoothstep(0.7, 1.1, score) * 14
        );
      }
      case 'volcano': {
        const cone = Math.pow(Math.max(0, 1 - d / (b.radius * 0.95)), 1.7) * 130;
        const crater = -smoothstep(0.0, 0.14, 0.14 - d / b.radius) * 40;
        const rough = (fbm(x * 0.02, z * 0.02, s + 7, 4) - 0.5) * 12;
        const lavaCut = noise2(x * 0.03, z * 0.03, s + 77) > 0.74 && d > 40 ? -4 : 0;
        return b.baseHeight + cone + crater + rough + lavaCut * 1;
      }
      case 'taiga': {
        const n = fbm(x * 0.006, z * 0.006, s + 8, 5);
        const ridge = 1 - Math.abs(n * 2 - 1);
        return b.baseHeight + ridge * b.amp * 1.2 + (fbm(x * 0.03, z * 0.03, s + 81, 2) - 0.5) * 3;
      }
      case 'tropics': {
        const mask = fbm(x * 0.007, z * 0.007, s + 9, 4) + (1 - score) * 0.5;
        const island = smoothstep(0.5, 0.62, mask);
        return -9 + island * (12.5 + (fbm(x * 0.03, z * 0.03, s + 91, 3) - 0.5) * b.amp);
      }
      case 'crystal':
      case 'deepcave':
        return b.baseHeight + (fbm(x * 0.03, z * 0.03, s + 10, 3) - 0.5) * b.amp;
      case 'desert': {
        const n = fbm(x * 0.005, z * 0.005, s + 12, 4);
        const mesa = Math.floor(n * 5) / 5 + smoothstep(0, 1, (n * 5) % 1) * 0.2;
        const dunes = (fbm(x * 0.02, z * 0.02, s + 121, 3) - 0.5) * 5;
        return b.baseHeight + mesa * b.amp * 1.6 + dunes;
      }
      case 'haunted':
        return b.baseHeight + (fbm(x * 0.01, z * 0.01, s + 13, 5) - 0.5) * b.amp * 2.2;
      case 'sky':
        return -8 + (fbm(x * 0.01, z * 0.01, s + 14, 2) - 0.5) * 4;
    }
  }

  private plotBase = new Map<string, number>();
  /** Max half-extent growth from expansions (kept in sync with PlotSystem). */
  static readonly PLOT_GROW = 24;

  /** Height with plots flattened for building. */
  heightAt(x: number, z: number): number {
    const h = this.rawHeight(x, z);
    for (const p of PLOTS) {
      if (p.biome === 'sky') continue;
      const hx = p.size[0] / 2 + Terrain.PLOT_GROW;
      const hz = p.size[1] / 2 + Terrain.PLOT_GROW;
      const dx = Math.abs(x - p.center[0]);
      const dz = Math.abs(z - p.center[1]);
      if (dx > hx + 14 || dz > hz + 14) continue;
      let base = this.plotBase.get(p.id);
      if (base === undefined) {
        base = this.rawHeight(p.center[0], p.center[1]);
        this.plotBase.set(p.id, base);
      }
      const k = (1 - smoothstep(0, 14, dx - hx)) * (1 - smoothstep(0, 14, dz - hz));
      return lerp(h, base, k);
    }
    return h;
  }

  /** Walkable ground height at x,z (ground layer, ignoring sky islands and plots). */
  rawHeight(x: number, z: number): number {
    const blend = this.biomeBlend(x, z);
    let h = 0;
    for (const w of blend.weights) {
      h += w.w * this.biomeHeight(w.biome, x, z, this.scoreOf(w.biome, x, z));
    }
    // roads: gently flatten toward their local average (cheap: blend with a low-frequency version)
    const rd = roadDist(x, z);
    if (rd < ROAD_HALF * 3) {
      const k = 1 - smoothstep(ROAD_HALF, ROAD_HALF * 3, rd);
      const smoothH = this.lowFreqHeight(x, z);
      h = lerp(h, smoothH, k * 0.85);
    }
    // hub flattening
    const hd = Math.hypot(x - HUB.center[0], z - HUB.center[1]);
    const hubK = 1 - smoothstep(HUB.flatRadius * 0.7, HUB.flatRadius * 1.25, hd);
    if (hubK > 0) h = lerp(h, 4, hubK);
    // river carve
    const rdv = riverDist(x, z);
    if (rdv < RIVER_WIDTH * 2.4) {
      const bank = 1 - smoothstep(RIVER_WIDTH * 0.45, RIVER_WIDTH * 2.4, rdv);
      const bed = -2.8 + (fbm(x * 0.05, z * 0.05, this.seed + 3, 2) - 0.5);
      h = lerp(h, Math.min(h, bed), bank);
    }
    // world edge -> ocean
    const edge = Math.max(Math.abs(x), Math.abs(z));
    if (edge > WORLD_HALF - 140) h -= (edge - (WORLD_HALF - 140)) * 0.3;
    return h;
  }

  private scoreOf(b: BiomeDef, x: number, z: number): number {
    return Math.hypot(x - b.center[0], z - b.center[1]) / b.radius;
  }

  private lowFreqHeight(x: number, z: number): number {
    // average the biome base heights (no noise) for road bed smoothing
    const blend = this.biomeBlend(x, z);
    let h = 0;
    for (const w of blend.weights)
      h +=
        w.w *
        (w.biome.id === 'sky'
          ? -8
          : w.biome.id === 'tropics'
            ? 3
            : w.biome.baseHeight + (fbm(x * 0.003, z * 0.003, this.seed + 1, 2) - 0.5) * w.biome.amp);
    return h;
  }

  /** Sky-island layer: returns absolute height or null where void. */
  skyIslandHeight(x: number, z: number): number | null {
    const b = BIOME_BY_ID.sky;
    const d = Math.hypot(x - b.center[0], z - b.center[1]) / b.radius;
    if (d > 1.15) return null;
    const m = fbm(x * 0.012, z * 0.012, this.seed + 140, 4) + (1 - d) * 0.42;
    if (m < 0.58) return null;
    const top = (m - 0.58) * 24 + (fbm(x * 0.05, z * 0.05, this.seed + 141, 2) - 0.5) * 3;
    return (b.elevation ?? 220) + Math.min(top, 10);
  }

  /** Height where a player standing near height `y` would stand (handles the sky layer). */
  surfaceAt(x: number, z: number, y: number): number {
    const sky = this.skyIslandHeight(x, z);
    if (sky !== null && y > (BIOME_BY_ID.sky.elevation ?? 220) - 25) return sky;
    return this.heightAt(x, z);
  }

  isWater(x: number, z: number): boolean {
    return this.heightAt(x, z) < SEA_LEVEL - 0.15;
  }

  /** Cave entrance direction (angle) for indoor biomes: toward +x (the hub side). */
  static readonly CAVE_GAP = 0.2;
  caveInfo(x: number, z: number): { biome: BiomeDef; s: number } | null {
    for (const b of BIOMES) {
      if (!b.indoor) continue;
      const s = Math.hypot(x - b.center[0], z - b.center[1]) / b.radius;
      if (s < 1.0) return { biome: b, s };
    }
    return null;
  }

  slopeAt(x: number, z: number): number {
    const e = 1.5;
    const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return Math.hypot(dx, dz) / (2 * e);
  }
}

export { WORLD_HALF };
