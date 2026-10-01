import { AXE_BY_ID, upgradeDamageMult } from '../data/axes';
import { WOOD_BY_ID } from '../data/woods';
import type { AxeInst } from '../save/schema';
import type { AxeDef } from '../data/types';

export interface AxeStats {
  def: AxeDef;
  damage: number;
  speed: number;
  reach: number;
  durMax: number;
  broken: boolean;
}

export function axeStats(
  a: AxeInst,
  extra: { woodcutting?: number; petBonus?: number; prestige?: number } = {},
): AxeStats {
  const def = AXE_BY_ID[a.def]!;
  let dmg = def.damage * upgradeDamageMult(a.up);
  dmg *= 1 + (a.ench.sharpness ?? 0) * 0.08;
  dmg *= 1 + (extra.woodcutting ?? 0) * 0.01 + (extra.petBonus ?? 0) + (extra.prestige ?? 0);
  if (def.ability === 'levels') dmg *= 1 + Math.min(1.5, a.xp / 4000);
  const speed = def.speed * (1 + (a.ench.efficiency ?? 0) * 0.06);
  const broken = a.dur <= 0;
  return { def, damage: broken ? dmg * 0.2 : dmg, speed, reach: def.reach, durMax: def.durability, broken };
}

/** Damage multiplier of an axe vs a wood: per-wood bonus × tier penalty. */
export function woodMultiplier(def: AxeDef, woodId: string): number {
  const w = WOOD_BY_ID[woodId];
  if (!w) return 1;
  let m = def.mult[woodId] ?? 1;
  if (def.tier < w.minTier) m *= Math.pow(0.18, w.minTier - def.tier);
  if (def.ability === 'burn' && w.props.includes('burns')) m *= 1.6;
  if (def.ability === 'freeze' && w.props.includes('burns')) m *= 1.15;
  return m;
}
