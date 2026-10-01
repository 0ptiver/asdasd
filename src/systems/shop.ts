import type { Sim, System } from '../core/sim';
import { AXE_BY_ID, AXES, ENCHANTS, SKINS, AXE_MAX_UPGRADE, upgradeCost } from '../data/axes';
import { ITEM_BY_ID } from '../data/items';
import { Rng } from '../core/rng';
import { itemName } from './itemValue';

export interface ShopEntry {
  kind: 'axe' | 'item';
  id: string;
  price: number;
  locked?: string; // reason
  owned?: boolean;
}

export const TOOL_ITEMS = [
  'fuel_can',
  'repair_kit',
  'shovel',
  'fishing_rod',
  'pickaxe',
  'treasure_map',
  'stamina_tonic',
  'warm_stew',
];
export const GEAR_ITEMS = [
  'backpack_s',
  'backpack_m',
  'backpack_l',
  'boots_work',
  'boots_spring',
  'gloves_work',
  'gloves_power',
  'headlamp',
  'fire_suit',
  'snow_gear',
  'scuba_mask',
  'jetpack',
];

export class ShopSystem implements System {
  readonly name = 'shop';
  constructor(private sim: Sim) {}
  update(): void {}

  ownsAxe(def: string): boolean {
    return this.sim.state.axes.some((a) => a.def === def);
  }
  maxOwnedTier(): number {
    let t = 0;
    for (const a of this.sim.state.axes) t = Math.max(t, AXE_BY_ID[a.def]?.tier ?? 0);
    return t;
  }

  /** Axes for sale at a given vendor. */
  axeStock(vendor: 'shop' | 'smith'): ShopEntry[] {
    const maxT = this.maxOwnedTier();
    return AXES.filter((a) => a.source === vendor)
      .sort((a, b) => a.price - b.price)
      .map((a) => ({
        kind: 'axe' as const,
        id: a.id,
        price: a.price,
        owned: this.ownsAxe(a.id),
        locked: a.tier >= 3 && a.tier > maxT + 1 ? `Own a tier ${a.tier - 1} axe first` : undefined,
      }));
  }

  buyAxe(id: string): boolean {
    const def = AXE_BY_ID[id];
    const s = this.sim;
    if (!def || (def.source !== 'shop' && def.source !== 'smith')) return false;
    if (this.ownsAxe(id)) {
      s.bus.emit('notify', { text: 'You already own this axe', kind: 'info' });
      return false;
    }
    if (def.tier >= 3 && def.tier > this.maxOwnedTier() + 1) {
      s.bus.emit('notify', { text: `Own a tier ${def.tier - 1} axe first`, kind: 'bad' });
      return false;
    }
    if (!s.econ.spend(def.price, 'axe')) return false;
    s.inventory.giveAxe(id);
    s.state.stats.axesBought = (s.state.stats.axesBought ?? 0) + 1;
    s.quests?.progress('buy', 'axe', 1);
    s.bus.emit('sfx', { name: 'coin' });
    return true;
  }

  buyItem(id: string, n = 1): boolean {
    const s = this.sim;
    const def = ITEM_BY_ID[id];
    if (!def) return false;
    if (def.gearSlot && s.inventory.count(id) + (s.state.gear[def.gearSlot] === id ? 1 : 0) > 0) {
      s.bus.emit('notify', { text: 'You already have this', kind: 'info' });
      return false;
    }
    const price = def.value * n;
    if (!s.econ.canAfford(price)) {
      s.bus.emit('notify', { text: 'Not enough money', kind: 'bad' });
      return false;
    }
    const space = s.inventory.add(id, n);
    if (space === n) {
      s.bus.emit('notify', { text: 'Inventory full', kind: 'bad' });
      return false;
    }
    const bought = n - space;
    s.econ.spend(def.value * bought, 'item');
    s.bus.emit('notify', { text: `Bought ${bought}× ${itemName(id)}`, kind: 'good' });
    s.bus.emit('sfx', { name: 'coin' });
    if (id === 'shovel' || id === 'fishing_rod' || id === 'pickaxe') s.state.stats['has_' + id] = 1;
    return true;
  }

  /** Equip a gear item from inventory. */
  equipGear(itemId: string): void {
    const s = this.sim;
    const def = ITEM_BY_ID[itemId];
    if (!def?.gearSlot) return;
    if (!s.inventory.has(itemId)) return;
    const prev = s.state.gear[def.gearSlot];
    s.inventory.remove(itemId, 1);
    if (prev) s.inventory.add(prev, 1);
    s.state.gear[def.gearSlot] = itemId;
    s.inventory.syncSize();
    s.bus.emit('notify', { text: `Equipped ${def.name}`, kind: 'good' });
  }
  unequipGear(slot: keyof import('../save/schema').GameState['gear']): void {
    const s = this.sim;
    const cur = s.state.gear[slot];
    if (!cur) return;
    if (s.inventory.add(cur, 1) === 0) {
      delete s.state.gear[slot];
      // backpack removal must not drop items: shrink only if empty tail
      s.inventory.syncSize();
    }
  }

  // ---- smith ----
  repairCost(uid: string): number {
    const a = this.sim.inventory.axeByUid(uid);
    if (!a) return 0;
    const def = AXE_BY_ID[a.def]!;
    const missing = 1 - a.dur / def.durability;
    return Math.round(Math.max(5, def.price * 0.04 + def.damage * 2) * missing);
  }
  repairAxe(uid: string): boolean {
    const a = this.sim.inventory.axeByUid(uid);
    if (!a) return false;
    const cost = this.repairCost(uid);
    if (cost <= 0) return false;
    if (!this.sim.econ.spend(cost, 'repair')) return false;
    a.dur = AXE_BY_ID[a.def]!.durability;
    this.sim.bus.emit('notify', { text: 'Axe repaired', kind: 'good' });
    return true;
  }
  useRepairKit(uid: string): boolean {
    const a = this.sim.inventory.axeByUid(uid);
    if (!a || !this.sim.inventory.has('repair_kit')) return false;
    const def = AXE_BY_ID[a.def]!;
    this.sim.inventory.remove('repair_kit', 1);
    a.dur = Math.min(def.durability, a.dur + def.durability * 0.4);
    return true;
  }
  upgradeCostOf(uid: string): number {
    const a = this.sim.inventory.axeByUid(uid);
    if (!a || a.up >= AXE_MAX_UPGRADE) return 0;
    return upgradeCost(AXE_BY_ID[a.def]!, a.up);
  }
  /** Upgrades need money plus ore (iron for +1..+5, gold for +6..+10). */
  upgradeOre(a: { up: number }): { id: string; n: number } {
    return a.up < 5 ? { id: 'iron_ore', n: 2 + a.up * 2 } : { id: 'gold_ore', n: 2 + (a.up - 5) * 2 };
  }
  upgradeAxe(uid: string): boolean {
    const a = this.sim.inventory.axeByUid(uid);
    const s = this.sim;
    if (!a || a.up >= AXE_MAX_UPGRADE) return false;
    const ore = this.upgradeOre(a);
    if (!s.inventory.has(ore.id, ore.n)) {
      s.bus.emit('notify', { text: `Need ${ore.n}× ${itemName(ore.id)}`, kind: 'bad' });
      return false;
    }
    if (!s.econ.spend(this.upgradeCostOf(uid), 'upgrade')) return false;
    s.inventory.remove(ore.id, ore.n);
    a.up++;
    s.bus.emit('notify', { text: `Axe upgraded to +${a.up}`, kind: 'good' });
    s.bus.emit('sfx', { name: 'level' });
    return true;
  }
  enchantAxe(uid: string, enchId: string): boolean {
    const a = this.sim.inventory.axeByUid(uid);
    const e = ENCHANTS.find((x) => x.id === enchId);
    const s = this.sim;
    if (!a || !e) return false;
    const lvl = a.ench[e.id] ?? 0;
    if (lvl >= e.max) return false;
    const cost = e.cost * (lvl + 1);
    const oreN = 3 + lvl * 2;
    if (!s.inventory.has(e.ore, oreN)) {
      s.bus.emit('notify', { text: `Need ${oreN}× ${itemName(e.ore)}`, kind: 'bad' });
      return false;
    }
    if (!s.econ.spend(cost, 'enchant')) return false;
    s.inventory.remove(e.ore, oreN);
    a.ench[e.id] = lvl + 1;
    s.bus.emit('notify', { text: `${e.name} ${lvl + 1} applied`, kind: 'good' });
    return true;
  }
  skinAxe(uid: string, skinId: string): boolean {
    const a = this.sim.inventory.axeByUid(uid);
    const sk = SKINS.find((x) => x.id === skinId);
    const s = this.sim;
    if (!a || !sk) return false;
    const owned = sk.price === 0 || s.state.cosmetics.includes('skin:' + sk.id);
    if (!owned) {
      if (!s.econ.spend(sk.price, 'skin')) return false;
      s.state.cosmetics.push('skin:' + sk.id);
    }
    a.skin = sk.id;
    return true;
  }

  /** Forge: 3 lower-tier axes + a rare plank → a random higher-tier shop axe (tier+1). */
  forgeCandidates(): { tier: number; axes: string[] }[] {
    const out: Record<number, string[]> = {};
    for (const a of this.sim.state.axes) {
      const d = AXE_BY_ID[a.def]!;
      if (a.uid === this.sim.state.equipped && this.sim.state.axes.length <= 1) continue;
      (out[d.tier] ??= []).push(a.uid);
    }
    return Object.entries(out)
      .filter(([t, l]) => l.length >= 3 && Number(t) >= 1 && Number(t) < 6)
      .map(([t, l]) => ({ tier: Number(t), axes: l }));
  }
  forge(uids: string[], plankId: string): boolean {
    const s = this.sim;
    if (uids.length !== 3) return false;
    const axes = uids.map((u) => s.inventory.axeByUid(u));
    if (axes.some((a) => !a)) return false;
    const tier = AXE_BY_ID[axes[0]!.def]!.tier;
    if (!axes.every((a) => AXE_BY_ID[a!.def]!.tier === tier)) {
      s.bus.emit('notify', { text: 'All three axes must be the same tier', kind: 'bad' });
      return false;
    }
    const plankDef = ITEM_BY_ID[plankId];
    const wood = plankDef?.wood;
    if (!wood || !s.inventory.has(plankId, 5)) {
      s.bus.emit('notify', { text: 'Need 5 planks of a rare wood', kind: 'bad' });
      return false;
    }
    const rare = ['rare', 'epic', 'legendary', 'mythic', 'uncommon'];
    const woodRar = ITEM_BY_ID[plankId] && wood;
    void woodRar;
    const pool = AXES.filter((a) => a.source === 'shop' && a.tier === tier + 1);
    if (!pool.length) return false;
    if (!s.econ.spend(2000 * tier * tier, 'forge')) return false;
    s.inventory.remove(plankId, 5);
    const rng = new Rng((Date.now() & 0xffff) + s.state.playedSec);
    const result = rng.pick(pool);
    for (const u of uids) this.removeAxe(u);
    void rare;
    s.inventory.giveAxe(result.id);
    s.bus.emit('notify', { text: `The forge produced: ${result.name}!`, kind: 'good' });
    return true;
  }
  removeAxe(uid: string): void {
    const st = this.sim.state;
    st.axes = st.axes.filter((a) => a.uid !== uid);
    for (let i = 0; i < st.inv.hotbar.length; i++)
      if (st.inv.hotbar[i] === 'axe:' + uid) st.inv.hotbar[i] = null;
    if (st.equipped === uid) st.equipped = st.axes[0]?.uid ?? null;
  }
}
