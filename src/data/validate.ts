/** Validates every data table: referential integrity and sane numbers. Returns a list of errors. */
import {
  AXES,
  BIOMES,
  BOSSES,
  ITEM_BY_ID,
  ITEMS,
  NPCS,
  PLOTS,
  QUESTS_ALL,
  RECIPES,
  VEHICLES,
  WOODS,
  WOOD_BY_ID,
  BIOME_BY_ID,
  AXE_BY_ID,
} from './registry';

export function validateData(): string[] {
  const errs: string[] = [];
  const dupe = (name: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) errs.push(`${name}: duplicate id "${id}"`);
      seen.add(id);
    }
  };
  dupe(
    'woods',
    WOODS.map((w) => w.id),
  );
  dupe(
    'axes',
    AXES.map((a) => a.id),
  );
  dupe(
    'vehicles',
    VEHICLES.map((v) => v.id),
  );
  dupe(
    'items',
    ITEMS.map((i) => i.id),
  );
  dupe(
    'biomes',
    BIOMES.map((b) => b.id),
  );
  dupe(
    'plots',
    PLOTS.map((p) => p.id),
  );
  dupe(
    'npcs',
    NPCS.map((n) => n.id),
  );
  dupe(
    'quests',
    QUESTS_ALL.map((q) => q.id),
  );

  for (const w of WOODS) {
    if (!BIOME_BY_ID[w.biome]) errs.push(`wood ${w.id}: unknown biome ${w.biome}`);
    if (w.baseValue <= 0 || w.hp <= 0 || w.respawnSec <= 0) errs.push(`wood ${w.id}: non-positive number`);
    if (w.plankMult < 1) errs.push(`wood ${w.id}: plankMult < 1 would make sawing a loss`);
    if (!ITEM_BY_ID[`plank_${w.id}`]) errs.push(`wood ${w.id}: missing plank item`);
  }
  for (const b of BIOMES) {
    for (const w of b.woods) if (!WOOD_BY_ID[w]) errs.push(`biome ${b.id}: unknown wood ${w}`);
    if (b.radius <= 0) errs.push(`biome ${b.id}: bad radius`);
    if (Math.abs(b.center[0]) > 1500 || Math.abs(b.center[1]) > 1500)
      errs.push(`biome ${b.id}: outside world`);
    if (b.gate.gear && !ITEM_BY_ID[b.gate.gear]) errs.push(`biome ${b.id}: unknown gate gear ${b.gate.gear}`);
  }
  for (const a of AXES) {
    for (const k of Object.keys(a.mult)) if (!WOOD_BY_ID[k]) errs.push(`axe ${a.id}: unknown wood mult ${k}`);
    if (a.damage <= 0 || a.speed <= 0 || a.reach <= 0 || a.durability <= 0)
      errs.push(`axe ${a.id}: non-positive stat`);
    if (a.source === 'shop' && a.price <= 0) errs.push(`axe ${a.id}: shop axe without price`);
  }
  for (const v of VEHICLES) {
    if (v.price < 0 || v.mass <= 0) errs.push(`vehicle ${v.id}: bad price/mass`);
  }
  for (const i of ITEMS) {
    if (i.wood && !WOOD_BY_ID[i.wood]) errs.push(`item ${i.id}: unknown wood`);
  }
  for (const r of RECIPES) {
    if (!ITEM_BY_ID[r.output]) errs.push(`recipe ${r.id}: unknown output ${r.output}`);
    for (const k of Object.keys(r.inputs))
      if (k !== 'plank:*' && !ITEM_BY_ID[k]) errs.push(`recipe ${r.id}: unknown input ${k}`);
  }
  for (const q of QUESTS_ALL) {
    if (q.requires && !QUESTS_ALL.find((x) => x.id === q.requires))
      errs.push(`quest ${q.id}: unknown requires`);
    if (q.reward.axe && !AXE_BY_ID[q.reward.axe]) errs.push(`quest ${q.id}: unknown axe reward`);
    for (const k of Object.keys(q.reward.items ?? {}))
      if (!ITEM_BY_ID[k]) errs.push(`quest ${q.id}: unknown item reward ${k}`);
  }
  for (const b of BOSSES) {
    if (!WOOD_BY_ID[b.wood]) errs.push(`boss ${b.id}: unknown wood`);
    if (b.reward.axe && !AXE_BY_ID[b.reward.axe]) errs.push(`boss ${b.id}: unknown reward axe`);
    for (const k of Object.keys(b.reward.items ?? {}))
      if (!ITEM_BY_ID[k]) errs.push(`boss ${b.id}: unknown item reward ${k}`);
  }
  for (const p of PLOTS) if (!BIOME_BY_ID[p.biome]) errs.push(`plot ${p.id}: unknown biome`);
  return errs;
}
