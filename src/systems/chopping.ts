import type { Sim, System } from '../core/sim';
import { WOOD_BY_ID } from '../data/woods';
import { AXE_BY_ID } from '../data/axes';
import { Rng } from '../core/rng';
import { levelOf } from '../core/skills';
import { axeStats, woodMultiplier } from './axeStats';
import type { Tree } from '../world/trees';
import { ITEM_BY_ID } from '../data/items';

const rng = new Rng(777);

/** Axe swing → damage → felling. */
export class ChoppingSystem implements System {
  readonly name = 'chopping';
  target: Tree | null = null;
  swing = -1; // -1 idle, 0..1 swinging
  private hitDone = false;
  private cooldown = 0;
  private dots = new Map<string, { dmg: number; left: number }>();
  /** last hit info for HUD */
  lastHitDmg = 0;
  lastCrit = false;
  fuelWarned = false;
  private buf: Tree[] = [];

  constructor(private sim: Sim) {}

  /** Best tree in front of the player within reach. */
  findTarget(reach: number): Tree | null {
    const p = this.sim.player;
    // aim direction = camera forward projected to XZ
    const fx = -Math.sin(p.camYaw);
    const fz = -Math.cos(p.camYaw);
    this.buf.length = 0;
    this.sim.trees.near(p.x, p.z, reach + 2.5, this.buf);
    let best: Tree | null = null;
    let bs = -1e9;
    for (const t of this.buf) {
      const dx = t.x - p.x;
      const dz = t.z - p.z;
      const d = Math.hypot(dx, dz);
      const edge = d - t.radius;
      if (edge > reach) continue;
      const dot = (dx * fx + dz * fz) / (d || 1);
      if (dot < 0.35 && edge > 1.2) continue;
      const score = dot * 3 - edge * 0.5;
      if (score > bs) {
        bs = score;
        best = t;
      }
    }
    return best;
  }

  update(dt: number): void {
    const sim = this.sim;
    const inp = sim.game.input;
    const st = sim.state;
    const pl = sim.player;
    const axe = sim.inventory.equipped();
    const locked = pl.locked || inp.uiOpen || pl.mode !== 'foot';
    // DOT (poison/burn)
    for (const [id, d] of this.dots) {
      const t = sim.trees.trees.get(id);
      d.left -= dt;
      if (!t || t.hidden || d.left <= 0) {
        this.dots.delete(id);
        continue;
      }
      if (Math.floor(d.left * 2) !== Math.floor((d.left + dt) * 2))
        this.applyDamage(t, d.dmg, false, null, true);
    }
    if (!axe) {
      this.swing = -1;
      pl.swing = -1;
      this.target = null;
      return;
    }
    const stats = axeStats(axe, {
      woodcutting: levelOf(st.skills.woodcutting),
      petBonus: st.activePet === 'pet_beaver' ? 0.05 : 0,
      prestige: st.prestige.level * 0.1,
    });
    const def = stats.def;
    this.target = locked ? null : this.findTarget(stats.reach);
    if (this.cooldown > 0) this.cooldown -= dt;
    const wantChop = !locked && inp.primary && !sim.grab.active;
    if (this.swing < 0) {
      if (wantChop && this.cooldown <= 0) {
        if (def.ability === 'fuel' && st.player.fuel <= 0) {
          if (!this.fuelWarned)
            sim.bus.emit('notify', { text: 'Chainsaw out of fuel — use a Fuel Can', kind: 'bad' });
          this.fuelWarned = true;
        } else {
          this.fuelWarned = false;
          this.swing = 0;
          this.hitDone = false;
          if (this.target) {
            const dx = this.target.x - pl.x;
            const dz = this.target.z - pl.z;
            pl.yaw = Math.atan2(dx, dz);
          }
        }
      }
    } else {
      const dur = 1 / stats.speed;
      this.swing += dt / dur;
      pl.facingLocked = true;
      if (!this.hitDone && this.swing >= 0.5) {
        this.hitDone = true;
        this.doHit(stats, axe);
      }
      if (this.swing >= 1) {
        this.swing = -1;
        pl.facingLocked = false;
        this.cooldown = def.ability === 'fuel' ? 0 : 0.03;
      }
    }
    pl.swing = this.swing;
    if (this.swing < 0) pl.facingLocked = false;
    // chainsaw fuel
    if (def.ability === 'fuel' && this.swing >= 0) st.player.fuel = Math.max(0, st.player.fuel - dt * 1.2);
  }

  private doHit(stats: ReturnType<typeof axeStats>, axe: import('../save/schema').AxeInst): void {
    const sim = this.sim;
    const def = stats.def;
    const t = this.target;
    // durability
    if (axe.dur > 0) {
      axe.dur -= 1;
      if (axe.dur <= 0) {
        sim.bus.emit('axe:break', { axeId: axe.def });
        sim.bus.emit('notify', { text: `${def.name} broke! Repair it at the Smithy.`, kind: 'bad' });
      }
    }
    const pl = sim.player;
    if (!t) {
      sim.bus.emit('sfx', { name: 'whiff', x: pl.x, y: pl.y, z: pl.z, vol: 0.4 });
      return;
    }
    let dmg = stats.damage * woodMultiplier(def, t.wood);
    let crit = false;
    const critChance =
      def.ability === 'crit' ? (def.id === 'crystal_axe' || def.id === 'prismatic_axe' ? 0.22 : 0.15) : 0.04;
    if (rng.chance(critChance)) {
      crit = true;
      dmg *= def.id === 'crystal_axe' ? 2.5 : def.id === 'prismatic_axe' ? 3 : 2;
    }
    if (def.ability === 'levels') axe.xp += 1;
    this.lastHitDmg = dmg;
    this.lastCrit = crit;
    sim.bus.emit('sfx', { name: 'chop', x: t.x, y: t.y + 1.2, z: t.z, vol: 0.8 });
    sim.bus.emit('fx', {
      kind: 'chips',
      x: t.x - Math.sin(Math.atan2(t.x - pl.x, t.z - pl.z)) * t.radius * 0.5,
      y: t.y + 1.2,
      z: t.z,
      color: WOOD_BY_ID[t.wood]!.color,
      n: crit ? 14 : 7,
    });
    this.applyDamage(t, dmg, crit, axe, false);
    // abilities on hit
    const w = WOOD_BY_ID[t.wood]!;
    switch (def.ability) {
      case 'burn':
        if (w.props.includes('burns') || w.id === 'pine') this.dots.set(t.id, { dmg: dmg * 0.25, left: 3 });
        sim.bus.emit('fx', { kind: 'embers', x: t.x, y: t.y + 1.5, z: t.z, n: 8 });
        break;
      case 'poison':
        this.dots.set(t.id, { dmg: dmg * 0.2, left: 4 });
        break;
      case 'cleave': {
        const splash = def.id === 'beast_axe' ? 0.5 : def.id === 'guardian_cleaver' ? 0.4 : 0.25;
        const near = sim.trees.near(t.x, t.z, 5);
        for (const o of near)
          if (o !== t)
            this.applyDamage(
              o,
              (dmg * splash * woodMultiplier(def, o.wood)) / woodMultiplier(def, t.wood),
              false,
              axe,
              true,
            );
        break;
      }
      case 'chain': {
        const near = sim.trees
          .near(t.x, t.z, 12)
          .filter((o) => o !== t)
          .slice(0, 3);
        for (const o of near) {
          this.applyDamage(o, dmg * 0.5, false, axe, true);
          sim.bus.emit('fx', { kind: 'bolt', x: o.x, y: o.y + 4, z: o.z, n: 1, color: 0xffee66 });
        }
        break;
      }
      case 'gravity':
        for (const l of sim.logs.logs.values()) {
          const lt = l.body.translation();
          if (Math.hypot(lt.x - pl.x, lt.z - pl.z) < 12)
            l.body.applyImpulse({ x: 0, y: l.mass * 1.4, z: 0 }, true);
        }
        break;
      case 'lifesteal':
        sim.state.player.stamina = Math.min(100, sim.state.player.stamina + 4);
        break;
    }
  }

  private applyDamage(
    t: Tree,
    dmg: number,
    crit: boolean,
    axe: import('../save/schema').AxeInst | null,
    splash: boolean,
  ): void {
    const sim = this.sim;
    if (t.hidden) return;
    sim.bus.emit('tree:chop', { treeId: t.id, wood: t.wood, dmg, crit });
    const dead = sim.trees.hit(t, dmg);
    if (!dead) return;
    this.fell(t, axe, splash);
  }

  private fell(t: Tree, axe: import('../save/schema').AxeInst | null, _splash: boolean): void {
    const sim = this.sim;
    const st = sim.state;
    const def = axe ? AXE_BY_ID[axe.def] : null;
    let respawnMult = 1;
    if (def?.ability === 'regrow') respawnMult = def.id === 'overgrown_axe' ? 0.6 : 0.8;
    if (WOOD_BY_ID[t.wood]!.props.includes('regrows')) respawnMult *= 0.5;
    sim.trees.markFelled(t, respawnMult);
    const pl = sim.player;
    sim.logs.fellTree(t, pl.x, pl.z, {
      refine: def?.ability === 'refine',
      vacuum: def?.ability === 'vacuum' || (axe?.ench.magnet ?? 0) > 0,
    });
    // xp & stats
    const w = WOOD_BY_ID[t.wood]!;
    const xp = Math.max(1, Math.round(Math.sqrt(w.baseValue) * 3 * t.scale));
    sim.addXp('woodcutting', xp);
    st.stats.trees = (st.stats.trees ?? 0) + 1;
    st.stats['chop_' + t.wood] = (st.stats['chop_' + t.wood] ?? 0) + 1;
    if (!st.discoveredSpecies.includes(t.wood)) {
      st.discoveredSpecies.push(t.wood);
      sim.bus.emit('notify', { text: `New wood discovered: ${w.name}!`, kind: 'good' });
    }
    if (t.mut) sim.bus.emit('notify', { text: `A ${t.mut} ${w.name} tree!`, kind: 'good' });
    sim.bus.emit('tree:fell', { treeId: t.id, wood: t.wood, mutation: t.mut, x: t.x, y: t.y, z: t.z });
  }
}

void ITEM_BY_ID;
