import type { Sim, System } from '../core/sim';
import { ITEM_BY_ID, CRATE_LOOT } from '../data/items';
import { AXE_BY_ID, SKINS } from '../data/axes';
import { PAINTS } from '../data/vehicles';
import { Rng } from '../core/rng';
import { itemName } from './itemValue';

const rng = new Rng(31337);

/** Using items: consumables, crates, pets, gear, tools. */
export class ItemUseSystem implements System {
  readonly name = 'itemUse';
  constructor(private sim: Sim) {}
  update(dt: number): void {
    this.tickBuffs(dt);
  }

  use(id: string): boolean {
    const s = this.sim;
    const def = ITEM_BY_ID[id];
    if (!def || !s.inventory.has(id)) return false;
    const pl = s.player;
    switch (id) {
      case 'stamina_tonic':
        s.state.player.stamina = 100;
        s.inventory.remove(id);
        s.bus.emit('notify', { text: 'Stamina restored', kind: 'good' });
        return true;
      case 'strength_tonic':
        pl.buffs.strength = 30;
        pl.buffs.strength_t = 300;
        s.inventory.remove(id);
        s.bus.emit('notify', { text: '+30 strength for 5 minutes', kind: 'good' });
        return true;
      case 'warm_stew':
        pl.buffs.cold = 1;
        pl.buffs.cold_t = 240;
        s.inventory.remove(id);
        s.bus.emit('notify', { text: 'Protected from the cold for 4 minutes', kind: 'good' });
        return true;
      case 'fuel_can':
        s.state.player.fuel = Math.min(100, s.state.player.fuel + 60);
        s.inventory.remove(id);
        s.bus.emit('notify', { text: 'Chainsaw / jetpack fuel refilled', kind: 'good' });
        return true;
      case 'repair_kit': {
        const a = s.inventory.equipped();
        if (!a) return false;
        return s.shop.useRepairKit(a.uid);
      }
      case 'crate_common':
      case 'crate_rare':
      case 'crate_mythic':
        return this.openCrate(id);
      case 'treasure_map':
        return s.treasure?.useMap() ?? false;
    }
    if (def.category === 'pet') {
      if (!s.state.pets.includes(id)) s.state.pets.push(id);
      s.state.activePet = id;
      s.inventory.remove(id);
      s.bus.emit('notify', { text: `${def.name} is now your companion`, kind: 'good' });
      return true;
    }
    if (def.gearSlot) {
      s.shop.equipGear(id);
      return true;
    }
    return false;
  }

  openCrate(crate: string): boolean {
    const s = this.sim;
    const key = crate === 'crate_common' ? 'key_common' : 'key_rare';
    if (!s.inventory.has(key)) {
      s.bus.emit('notify', { text: `You need a ${itemName(key)}`, kind: 'bad' });
      return false;
    }
    s.inventory.remove(crate, 1);
    s.inventory.remove(key, 1);
    const loot = CRATE_LOOT[crate]!;
    if (loot.mythicChance > 0 && rng.chance(loot.mythicChance)) {
      s.inventory.giveAxe('prismatic_axe');
      s.bus.emit('notify', { text: 'JACKPOT! Prismatic Axe!', kind: 'money' });
      return true;
    }
    const pick = rng.pick(loot.cosmetics);
    const [kind, val] = pick.split(':') as [string, string];
    if (s.state.cosmetics.includes(pick)) {
      const refund = kind === 'skin' ? (SKINS.find((x) => x.id === val)?.price ?? 1000) * 0.5 : 1500;
      s.econ.earn(refund, 'crate');
      s.bus.emit('notify', {
        text: `Duplicate ${kind} — converted to $${Math.round(refund)}`,
        kind: 'money',
      });
    } else {
      s.state.cosmetics.push(pick);
      const nm = kind === 'paint' ? `Paint #${PAINTS[Number(val)]?.toString(16)}` : val;
      s.bus.emit('notify', { text: `Unlocked ${kind}: ${nm}`, kind: 'good' });
    }
    return true;
  }

  tickBuffs(dt: number): void {
    const b = this.sim.player.buffs;
    for (const k of Object.keys(b)) {
      if (!k.endsWith('_t')) continue;
      b[k]! -= dt;
      if (b[k]! <= 0) {
        delete b[k];
        delete b[k.slice(0, -2)];
      }
    }
  }
}
void AXE_BY_ID;
