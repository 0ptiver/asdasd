import type { Sim, System } from '../core/sim';
import { FURNITURE_SHAPES, RECIPES, furnitureId } from '../data/recipes';
import { WOODS, WOOD_BY_ID } from '../data/woods';
import { ITEM_BY_ID } from '../data/items';
import { levelOf } from '../core/skills';
import { Rng } from '../core/rng';
import { itemName } from './itemValue';
import type { RecipeDef } from '../data/types';

const rng = new Rng(2024);

/** Crafting stations: furniture per wood, and fixed recipes (potions, parts, alloys). */
export class CraftingSystem implements System {
  readonly name = 'crafting';
  constructor(private sim: Sim) {}
  update(): void {}

  level(): number {
    return levelOf(this.sim.state.skills.crafting);
  }

  /** Is a bench/forge/workshop in reach? (public bench in the hub or a built crafting part) */
  stationNearby(kind: RecipeDef['station'] | 'any' = 'any'): boolean {
    const p = this.sim.player;
    const pub = this.sim.hub.layout.points.find((x) => x.id === 'public_bench');
    if (pub && Math.hypot(pub.x - p.x, pub.z - p.z) < 8) return kind !== 'forge' || true;
    for (const b of this.sim.building.built.values()) {
      const d = this.sim.building.def(b);
      if (d.interactive !== 'workbench' && d.id !== 'workbench') continue;
      if (Math.hypot(b.p[1] - p.x, b.p[3] - p.z) < 8) return true;
    }
    const smithy = this.sim.hub.interactables.find((i) => i.id === 'forge');
    if (kind === 'forge' && smithy && Math.hypot(smithy.x - p.x, smithy.z - p.z) < 8) return true;
    return false;
  }

  canCraftFurniture(shape: string, wood: string): { ok: boolean; why?: string } {
    const sh = FURNITURE_SHAPES.find((s) => s.id === shape);
    if (!sh) return { ok: false, why: 'unknown' };
    if (this.level() < sh.level) return { ok: false, why: `Crafting level ${sh.level}` };
    if (!this.sim.inventory.has('plank_' + wood, sh.planks))
      return { ok: false, why: `${sh.planks} ${WOOD_BY_ID[wood]?.name} planks` };
    return { ok: true };
  }

  craftFurniture(shape: string, wood: string): boolean {
    const sim = this.sim;
    const c = this.canCraftFurniture(shape, wood);
    if (!c.ok) {
      sim.bus.emit('notify', { text: `Need ${c.why}`, kind: 'bad' });
      return false;
    }
    if (!this.stationNearby()) {
      sim.bus.emit('notify', { text: 'You need to be at a crafting bench', kind: 'bad' });
      return false;
    }
    const sh = FURNITURE_SHAPES.find((s) => s.id === shape)!;
    const id = furnitureId(shape, wood);
    sim.inventory.remove('plank_' + wood, sh.planks);
    let n = 1;
    if (rng.chance(this.level() * 0.01)) n++;
    const left = sim.inventory.add(id, n);
    if (left === n) {
      sim.inventory.add('plank_' + wood, sh.planks); // refund
      sim.bus.emit('notify', { text: 'Inventory full', kind: 'bad' });
      return false;
    }
    sim.addXp('crafting', sh.planks * 2 + sh.level * 3);
    sim.state.stats.crafted = (sim.state.stats.crafted ?? 0) + n;
    sim.quests.progress('craft', undefined, n);
    sim.bus.emit('notify', {
      text: `Crafted ${n}× ${itemName(id)}${n > 1 ? ' (bonus!)' : ''}`,
      kind: 'good',
    });
    sim.bus.emit('sfx', { name: 'chop' });
    return true;
  }

  recipes(station?: RecipeDef['station']): RecipeDef[] {
    return RECIPES.filter(
      (r) =>
        !station ||
        r.station === station ||
        (station === 'bench' && r.station !== 'forge' && r.station !== 'stall'),
    );
  }

  craft(recipeId: string): boolean {
    const sim = this.sim;
    const r = RECIPES.find((x) => x.id === recipeId);
    if (!r) return false;
    if (this.level() < r.minCraftLevel) {
      sim.bus.emit('notify', { text: `Crafting level ${r.minCraftLevel} required`, kind: 'bad' });
      return false;
    }
    if (!this.stationNearby(r.station)) {
      sim.bus.emit('notify', { text: 'You need to be at a crafting station', kind: 'bad' });
      return false;
    }
    // resolve inputs (plank:* = any plank)
    const take: [string, number][] = [];
    for (const [id, n] of Object.entries(r.inputs)) {
      if (id === 'plank:*') {
        let need = n;
        for (const w of WOODS) {
          const have = sim.inventory.count('plank_' + w.id);
          const t = Math.min(have, need);
          if (t > 0) take.push(['plank_' + w.id, t]);
          need -= t;
          if (need <= 0) break;
        }
        if (need > 0) {
          sim.bus.emit('notify', { text: `Need ${n} planks`, kind: 'bad' });
          return false;
        }
      } else {
        if (!sim.inventory.has(id, n)) {
          sim.bus.emit('notify', { text: `Need ${n}× ${itemName(id)}`, kind: 'bad' });
          return false;
        }
        take.push([id, n]);
      }
    }
    for (const [id, n] of take) sim.inventory.remove(id, n);
    const left = sim.inventory.add(r.output, r.count);
    if (left) sim.bus.emit('notify', { text: 'Inventory full — some output lost', kind: 'bad' });
    sim.addXp('crafting', r.xp);
    sim.state.stats.crafted = (sim.state.stats.crafted ?? 0) + r.count;
    sim.quests.progress('craft', undefined, r.count);
    sim.bus.emit('notify', { text: `Crafted ${r.count}× ${itemName(r.output)}`, kind: 'good' });
    return true;
  }
}
void ITEM_BY_ID;
