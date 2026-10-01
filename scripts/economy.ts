/**
 * Economy model: estimates income/hour per axe tier and simulates a greedy progression to find time-to-unlock for
 * axes, vehicles and biomes. Used by `npm run economy` (writes ECONOMY.md tables) and by the balance unit test.
 */
import { AXES, upgradeDamageMult } from '../src/data/axes';
import { BIOMES } from '../src/data/biomes';
import { VEHICLES } from '../src/data/vehicles';
import { WOODS } from '../src/data/woods';
import { ITEM_BY_ID } from '../src/data/items';
import { CONFIG } from '../src/config';
import type { AxeDef, WoodDef } from '../src/data/types';

const AVG_SCALE = 1.1; // average tree volume factor (scale² of 0.8..1.3)
const UNITS_PER_TREE = 3.1 * AVG_SCALE;
const MARKET = 0.82; // saturation penalty from supply & demand

export function woodMult(a: AxeDef, w: WoodDef): number {
  let m = a.mult[w.id] ?? 1;
  if (a.tier < w.minTier) m *= Math.pow(0.18, w.minTier - a.tier);
  if (a.ability === 'burn' && w.props.includes('burns')) m *= 1.6;
  return m;
}

export interface Setup { axe: AxeDef; up: number; vehicle: number; workers: number }

/** seconds spent per tree given logistics level (0 = carry by hand, 1 = pickup, 2 = truck, 3 = big rig/heli) */
function overheadSec(vehicle: number): number {
  return [14, 9, 6, 4][Math.min(3, vehicle)]!;
}

export function treeProfit(a: AxeDef, w: WoodDef, vehicle: number, up = 0): { perTree: number; perHour: number } {
  const dmg = a.damage * upgradeDamageMult(up) * woodMult(a, w) * (a.ability === 'cleave' ? 1.15 : 1);
  const hp = w.hp * AVG_SCALE;
  const chop = hp / (dmg * a.speed);
  const t = chop + overheadSec(vehicle) + 2.5; // walking + sawing latency
  const perTree = UNITS_PER_TREE * w.baseValue * w.plankMult * MARKET;
  return { perTree, perHour: (3600 / t) * perTree };
}

/** Best wood a given axe can farm effectively (must be able to chop it in a reasonable time and be unlocked). */
export function bestWood(a: AxeDef, vehicle: number, up: number, tierGate: number): { wood: WoodDef; perHour: number } {
  let best = { wood: WOODS[0]!, perHour: 0 };
  for (const w of WOODS) {
    if (w.weight <= 0 || w.guardianOnly || w.rarity === 'mythic') continue;
    const b = BIOMES.find((x) => x.id === w.biome)!;
    if (b.tier > tierGate) continue;
    if (w.minTier > a.tier + 0) continue;
    const r = treeProfit(a, w, vehicle, up);
    // rarer woods have fewer trees nearby → density penalty
    const dens = Math.min(1, w.weight / 6) * 0.35 + 0.65;
    const pr = r.perHour * dens;
    if (pr > best.perHour) best = { wood: w, perHour: pr };
  }
  return best;
}

export interface Milestone { what: string; hours: number; money: number }

/** Greedy progression: always buy the cheapest next thing that increases income, farm in between. */
export function simulate(): { milestones: Milestone[]; table: { axe: AxeDef; wood: string; perHour: number }[] } {
  let t = 0; // hours
  let money: number = CONFIG.startMoney;
  const shop = AXES.filter((a) => a.source === 'shop' && a.price > 0).sort((a, b) => a.price - b.price);
  const vehicles = VEHICLES.filter((v) => v.price > 0 && v.kind === 'ground' && !v.isTrailer).sort((a, b) => a.price - b.price);
  const milestones: Milestone[] = [];
  const table: { axe: AxeDef; wood: string; perHour: number }[] = [];
  const holder: { axe: AxeDef | null } = { axe: null };
  let vehicleLevel = 0;
  let owned = new Set<string>();
  let workerIncome = 0;
  const ups = (a: AxeDef | null) => (a ? Math.min(10, Math.floor(Math.log2(1 + t * 0.6))) : 0);
  const rate = () => {
    if (!holder.axe) return 600; // fists/log-hauling by hand: ~$600/h starting out (planks from borrowed hatchet etc.)
    const tierGate = holder.axe.tier + 1;
    return bestWood(holder.axe, vehicleLevel, ups(holder.axe), tierGate).perHour + workerIncome;
  };
  let guard = 0;
  while (guard++ < 5000) {
    // candidate purchases
    // smart player: skip axes that wouldn't raise income by at least 12%
    const cur = rate();
    const nextAxe = shop.find((a) => {
      if (owned.has(a.id) || (holder.axe && a.price <= holder.axe.price) || a.tier > (holder.axe?.tier ?? 0) + 1) return false;
      const gain = bestWood(a, vehicleLevel, ups(a), a.tier + 1).perHour + workerIncome;
      if (holder.axe && gain < cur * 1.12) {
        owned.add(a.id); // not worth buying
        return false;
      }
      return true;
    });
    const nextVeh = vehicles.find((v) => !owned.has(v.id));
    const vehicleWorth = nextVeh && vehicleLevel < 3 && (holder.axe?.tier ?? 0) >= [1, 2, 3, 4][vehicleLevel]!;
    let target: { name: string; price: number; apply: () => void } | null = null;
    if (nextAxe) target = { name: nextAxe.name, price: nextAxe.price, apply: () => { holder.axe = nextAxe; owned.add(nextAxe.id); } };
    if (vehicleWorth && nextVeh && (!target || nextVeh.price < target.price * 1.6)) {
      const nv = nextVeh;
      target = { name: nv.name, price: nv.price, apply: () => { vehicleLevel = Math.min(3, vehicleLevel + 1); owned.add(nv.id); } };
    }
    if (!target) break;
    const r = rate();
    const need = Math.max(0, target.price - money);
    const dt = need / r;
    t += dt;
    money += need - target.price + 0; // spend
    money = 0;
    target.apply();
    // workers & outposts kick in as multipliers once the player is rich enough (approximation)
    if (holder.axe && holder.axe!.tier >= 3) workerIncome = Math.min(workerIncome + holder.axe!.tier * 600, 40_000);
    milestones.push({ what: target.name, hours: t, money: target.price });
    if (guard > 400) break;
    if (holder.axe) table.push({ axe: holder.axe, wood: bestWood(holder.axe, vehicleLevel, ups(holder.axe), holder.axe.tier + 1).wood.name, perHour: rate() });
    if (t > 200) break;
  }
  owned = new Set();
  return { milestones, table };
}

export function biomeUnlocks(): { biome: string; gate: string }[] {
  return BIOMES.map((b) => ({
    biome: b.name,
    gate: [b.gate.tier ? `axe tier ${b.gate.tier}` : '', b.gate.gear ? `gear: ${ITEM_BY_ID[b.gate.gear]?.name} ($${ITEM_BY_ID[b.gate.gear]?.value.toLocaleString()})` : '', b.gate.vehicle ? `vehicle: ${b.gate.vehicle}` : ''].filter(Boolean).join(' + ') || 'none',
  }));
}


/** Income curve of the optimized path: list of [startHour, incomePerHour]. */
export function incomeCurve(): { t: number; rate: number; spentBefore: number }[] {
  const { milestones, table } = simulate();
  const out: { t: number; rate: number; spentBefore: number }[] = [{ t: 0, rate: 600, spentBefore: 0 }];
  let spent = 0;
  milestones.forEach((m, i) => {
    spent += m.money;
    out.push({ t: m.hours, rate: table[Math.min(i, table.length - 1)]?.perHour ?? 600, spentBefore: spent });
  });
  return out;
}

/** Hours until a player following the optimized path could afford `price` on top of what they already bought. */
export function hoursToAfford(price: number): number {
  const curve = incomeCurve();
  let earned = CONFIG.startMoney;
  for (let i = 0; i < curve.length; i++) {
    const seg = curve[i]!;
    const next = curve[i + 1];
    const need = price + seg.spentBefore;
    const dt = next ? next.t - seg.t : 1e9;
    const gain = seg.rate * dt;
    if (earned + gain >= need) return seg.t + (need - earned) / seg.rate;
    earned += gain;
  }
  return Infinity;
}

export function report(): string {
  const { milestones } = simulate();
  const rows: string[] = [];
  const h = (x: number) => (x < 1 ? `${Math.round(x * 60)} min` : `${x.toFixed(1)} h`);
  rows.push('# ECONOMY\n');
  rows.push('Generated by `npm run economy` from the data tables in `/src/data` — do not edit by hand.\n');
  rows.push('## Method\n');
  rows.push('A player farms the best wood their axe tier and biome access allow (damage × speed vs tree HP, plus per-tree logistics overhead that shrinks with vehicles), sells planks at market (×0.82 supply & demand penalty), and always buys the next purchase that raises income ≥ 12%. Workers and outposts add a modest bonus from tier 3. Real play will differ; the numbers are targets for tuning, enforced by `tests/economy.test.ts`.\n');
  rows.push('**Targets:** first upgrade ≈ 5 min · first vehicle ≈ 30 min (Pickup) · first end-game axe 20–30 h · prestige extends beyond.\n');
  rows.push('## Optimized progression\n');
  rows.push('| Hours | Purchase | Cost |\n|---:|---|---:|');
  for (const m of milestones) rows.push(`| ${m.hours.toFixed(2)} | ${m.what} | $${m.money.toLocaleString()} |`);
  rows.push('\n## Income per hour by axe\n');
  rows.push('| Axe | Tier | Best wood | Income/hour (market-adjusted) |\n|---|---:|---|---:|');
  for (const a of AXES.filter((x) => x.source === 'shop' && x.price > 0)) {
    const b = bestWood(a, Math.min(3, a.tier), Math.min(10, a.tier * 2), a.tier + 1);
    rows.push(`| ${a.name} | ${a.tier} | ${b.wood.name} | $${Math.round(b.perHour).toLocaleString()} |`);
  }
  rows.push('\n## Time to unlock — axes\n');
  rows.push('| Axe | Tier | Price | Affordable after |\n|---|---:|---:|---:|');
  for (const a of AXES.filter((x) => x.source === 'shop' && x.price > 0)) rows.push(`| ${a.name} | ${a.tier} | $${a.price.toLocaleString()} | ${h(hoursToAfford(a.price))} |`);
  rows.push('\n## Time to unlock — vehicles\n');
  rows.push('| Vehicle | Kind | Price | Affordable after |\n|---|---|---:|---:|');
  for (const v of VEHICLES.filter((x) => x.price > 0)) rows.push(`| ${v.name} | ${v.kind} | $${v.price.toLocaleString()} | ${h(hoursToAfford(v.price))} |`);
  rows.push('\n## Biome access\n');
  rows.push('| Biome | Tier | Gate | Approx. reachable after |\n|---|---:|---|---:|');
  for (const b of BIOMES) {
    const gearPrice = b.gate.gear ? ITEM_BY_ID[b.gate.gear]?.value ?? 0 : 0;
    const axeMin = AXES.filter((a) => a.source === 'shop' && a.price > 0 && a.tier >= (b.gate.tier ?? 0)).sort((x, y) => x.price - y.price)[0]?.price ?? 0;
    const vehicle = b.gate.vehicle ? VEHICLES.find((v) => v.id === b.gate.vehicle)?.price ?? 0 : 0;
    rows.push(`| ${b.name} | ${b.tier} | ${b.gate.note} | ${h(hoursToAfford(gearPrice + axeMin + vehicle))} |`);
  }
  rows.push('\n## Money sinks\n');
  rows.push('- Axe upgrades (+1…+10, each level ≈ 1.55× the last) and enchants (ore + money)\n- Repairs (axes, vehicles), fuel, toll bridge ($25 / 15 min), ferry ($50), fast travel (distance × $0.4), recall ($50)\n- Land (34 plots + 2 expansion tiers each), buildings (planks + prefab prices), business upgrades\n- Crew wages, worker training, auction & trade tax (5%), listing fee (1%), exchange losses\n- Cosmetics: skins, paints, decals; crates need keys\n- Death: 5% of money lost on respawn\n- Prestige: reset of money/axes/vehicles for permanent multipliers\n');
  rows.push('## Other income streams\n');
  rows.push('1. Log & plank sales (dynamic prices)  2. Personal sawmill + upgrades  3. Furniture crafting  4. Delivery jobs & reputation  5. Daily / weekly / story quests  6. Hired lumberjack crew  7. Plot businesses (sell stand, workshop, factory, firewood stall)  8. Auction house & trading  9. Treasure hunting  10. Fishing & foraging  11. Mining ore  12. Guardian bounties  13. Lumber Exchange futures (capped risk)  14. Outposts (offline income, 8 h cap)  15. Crates & keys (cosmetics only)  16. Events (wood rush, caravan, meteors, fires, storms)  17. Secrets (one-time rewards)  18. Seasonal collectibles\n');
  return rows.join('\n');
}

if (process.argv[1] && /economy\.(ts|js)$/.test(process.argv[1])) {
  const md = report();
  if (process.argv.includes('--write')) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    import('node:fs').then((fs) => fs.writeFileSync('ECONOMY.md', md + '\n'));
    console.log('ECONOMY.md written');
  } else console.log(md);
}
