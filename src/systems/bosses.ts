import type { Sim, System } from '../core/sim';
import { CONFIG } from '../config';
import { BOSSES } from '../data/bosses';
import { WOOD_BY_ID } from '../data/woods';
import type { BossDef } from '../data/types';
import { STYLE, type Tree } from '../world/trees';
import { worldToChunk } from './streaming';
import { Rng } from '../core/rng';
import { itemName } from './itemValue';

type Attack = BossDef['attacks'][number];
interface Hazard {
  kind: 'ring' | 'burst' | 'cloud' | 'beam' | 'fireball' | 'frost';
  x: number;
  z: number;
  r: number;
  t: number; // time until trigger
  dur: number;
  dmg: number;
  vx?: number;
  vz?: number;
  done?: boolean;
  color: number;
}
interface BossState {
  def: BossDef;
  tree: Tree;
  engaged: boolean;
  next: number;
  hazards: Hazard[];
  enraged: boolean;
}

const rng = new Rng(1313);

/** Guardian trees: huge HP, attack patterns, health bars, drops (incl. Heartwood logs). */
export class BossSystem implements System {
  readonly name = 'bosses';
  readonly states = new Map<string, BossState>();
  engaged: BossState | null = null;
  constructor(private sim: Sim) {}

  init(): void {
    const T = this.sim.streamer.terrain;
    for (const def of BOSSES) {
      const w = WOOD_BY_ID[def.wood]!;
      const y =
        def.biome === 'sky'
          ? (T.skyIslandHeight(def.pos[0], def.pos[1]) ?? 220)
          : T.heightAt(def.pos[0], def.pos[1]);
      const scale = 3.4;
      const style = STYLE[w.style];
      const tree: Tree = {
        id: 'boss:' + def.id,
        wood: def.wood,
        style: w.style,
        x: def.pos[0],
        y,
        z: def.pos[1],
        scale,
        yaw: 0,
        mut: null,
        maxHp: def.hp,
        hp: def.hp,
        height: style.height * scale,
        radius: style.radius * scale,
        nightOnly: false,
        glow: 1,
        hidden: false,
        guardian: true,
      };
      this.states.set(def.id, { def, tree, engaged: false, next: 3, hazards: [], enraged: false });
    }
    this.sim.streamer.treeProviders.push((cx, cz) => {
      const out: Tree[] = [];
      for (const b of this.states.values()) {
        if (worldToChunk(b.tree.x) === cx && worldToChunk(b.tree.z) === cz && !this.isDown(b.def.id)) {
          b.tree.hp = b.tree.maxHp;
          b.tree.hidden = false;
          out.push(b.tree);
        }
      }
      return out;
    });
    // trees already loaded (initial preload) → inject now
    for (const b of this.states.values()) {
      if (!this.isDown(b.def.id) && this.sim.streamer.chunkAt(b.tree.x, b.tree.z)) {
        const c = this.sim.streamer.chunkAt(b.tree.x, b.tree.z)!;
        if (!c.trees.includes(b.tree)) {
          c.trees.push(b.tree);
          this.sim.trees.addLoose(b.tree);
        }
      }
    }
  }

  isDown(id: string): boolean {
    return (this.sim.state.world.boss[id] ?? 0) > this.sim.state.time;
  }

  kill(t: Tree): void {
    const sim = this.sim;
    const b = this.states.get(t.id.slice(5));
    if (!b) return;
    const def = b.def;
    sim.state.world.boss[def.id] = sim.state.time + def.respawnSec / CONFIG.dayLengthSec;
    sim.trees.markFelled(t);
    sim.state.world.chopped[t.id] = sim.state.world.boss[def.id]!;
    // wood drop: physical logs of the guardian's wood (Heartwood from the deep guardian)
    const dropWood = def.id === 'deep_guardian' ? 'heartwood' : def.wood;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      sim.logs.spawnLog(
        dropWood,
        3,
        0.6,
        { x: t.x + Math.cos(a) * 3, y: t.y + 3 + i * 0.3, z: t.z + Math.sin(a) * 3 },
        null,
        { x: Math.cos(a) * 2, y: 3, z: Math.sin(a) * 2 },
        null,
      );
    }
    const r = def.reward;
    sim.econ.earn(r.money, 'boss');
    sim.addXp('woodcutting', r.xp);
    for (const [id, n] of Object.entries(r.items ?? {})) {
      sim.inventory.add(id, n);
      sim.bus.emit('notify', { text: `+${n}× ${itemName(id)}`, kind: 'good' });
    }
    if (r.axe && !sim.shop.ownsAxe(r.axe)) sim.inventory.giveAxe(r.axe);
    sim.state.stats.bosses = (sim.state.stats.bosses ?? 0) + 1;
    const kinds = Object.keys(sim.state.world.boss).filter((k) => sim.state.stats['boss_' + k]).length;
    sim.state.stats['boss_' + def.id] = 1;
    sim.state.stats.bossKinds = Object.keys(sim.state.stats).filter((k) => k.startsWith('boss_')).length;
    void kinds;
    b.hazards = [];
    b.engaged = false;
    if (this.engaged === b) this.engaged = null;
    sim.bus.emit('boss:down', { boss: def.id });
    sim.bus.emit('notify', { text: `${def.name} has fallen!`, kind: 'money' });
    sim.bus.emit('shake', { amount: 1 });
    sim.bus.emit('sfx', { name: 'explosion', x: t.x, y: t.y, z: t.z, vol: 1 });
    sim.bus.emit('fx', { kind: 'magic', x: t.x, y: t.y + 4, z: t.z, n: 60, color: def.color });
  }

  update(dt: number): void {
    const sim = this.sim;
    const p = sim.player;
    const st = sim.state;
    // respawn check
    if (sim.tickCount % 120 === 0) {
      for (const b of this.states.values()) {
        if (b.tree.hidden && !this.isDown(b.def.id) && sim.trees.trees.has(b.tree.id))
          sim.trees.revive(b.tree);
      }
    }
    let eng: BossState | null = null;
    for (const b of this.states.values()) {
      if (this.isDown(b.def.id) || b.tree.hidden) continue;
      const d = Math.hypot(b.tree.x - p.x, b.tree.z - p.z);
      if (d < 70) {
        if (b.tree.hp < b.tree.maxHp || d < 40) eng = b;
        // guardians don't regen while engaged
        b.next -= dt;
        b.enraged = b.tree.hp < b.tree.maxHp * 0.4;
        if (b.next <= 0 && (b.tree.hp < b.tree.maxHp || d < 45)) {
          this.attack(b);
          b.next = (b.enraged ? 2.2 : 3.6) + rng.range(0, 1.5);
        }
      } else if (b.tree.hp < b.tree.maxHp)
        b.tree.hp = Math.min(b.tree.maxHp, b.tree.hp + b.tree.maxHp * 0.02 * dt);
      this.updateHazards(b, dt);
    }
    this.engaged = eng;
    void st;
  }

  private attack(b: BossState): void {
    const sim = this.sim;
    const p = sim.player;
    const kind: Attack = rng.pick(b.def.attacks);
    const t = b.tree;
    const scale = 1 + (b.def.hp > 50000 ? 0.5 : 0);
    sim.bus.emit('sfx', { name: 'roar', x: t.x, y: t.y, z: t.z, vol: 0.9 });
    switch (kind) {
      case 'slam':
        b.hazards.push({
          kind: 'ring',
          x: t.x,
          z: t.z,
          r: 11 * scale,
          t: 1.0,
          dur: 0.1,
          dmg: 24 * scale,
          color: b.def.color,
        });
        break;
      case 'roots':
        for (let i = 0; i < (b.enraged ? 4 : 2); i++)
          b.hazards.push({
            kind: 'burst',
            x: p.x + rng.range(-5, 5),
            z: p.z + rng.range(-5, 5),
            r: 3,
            t: 1.2 + i * 0.35,
            dur: 0.1,
            dmg: 18,
            color: 0x6a4a2a,
          });
        break;
      case 'spores':
        b.hazards.push({ kind: 'cloud', x: p.x, z: p.z, r: 6, t: 0.8, dur: 5, dmg: 5, color: 0x9aff7a });
        break;
      case 'fireball': {
        const dx = p.x - t.x,
          dz = p.z - t.z,
          d = Math.hypot(dx, dz) || 1;
        b.hazards.push({
          kind: 'fireball',
          x: t.x,
          z: t.z,
          r: 2.5,
          t: 0,
          dur: 6,
          dmg: 30,
          vx: (dx / d) * 20,
          vz: (dz / d) * 20,
          color: 0xff5a1a,
        });
        break;
      }
      case 'frost':
        b.hazards.push({ kind: 'frost', x: t.x, z: t.z, r: 14, t: 1.1, dur: 0.1, dmg: 12, color: 0x9ae8ff });
        break;
      case 'summon':
        for (let i = 0; i < 3; i++)
          b.hazards.push({
            kind: 'burst',
            x: p.x + Math.cos(i * 2.1) * 6,
            z: p.z + Math.sin(i * 2.1) * 6,
            r: 3.2,
            t: 0.9 + i * 0.5,
            dur: 0.1,
            dmg: 16,
            color: 0x7aff7a,
          });
        break;
      case 'beam': {
        b.hazards.push({
          kind: 'beam',
          x: t.x,
          z: t.z,
          r: 2,
          t: 1.0,
          dur: 2,
          dmg: 9,
          vx: p.x,
          vz: p.z,
          color: b.def.color,
        });
        break;
      }
    }
  }

  private updateHazards(b: BossState, dt: number): void {
    const sim = this.sim;
    const p = sim.player;
    const st = sim.state;
    for (const h of b.hazards) {
      if (h.done) continue;
      if (h.kind === 'fireball') {
        h.x += (h.vx ?? 0) * dt;
        h.z += (h.vz ?? 0) * dt;
        h.dur -= dt;
        sim.bus.emit('fx', { kind: 'embers', x: h.x, y: p.y + 1.4, z: h.z, n: 2 });
        if (Math.hypot(h.x - p.x, h.z - p.z) < h.r) {
          this.hurt(h.dmg);
          h.done = true;
        } else if (h.dur <= 0) h.done = true;
        continue;
      }
      if (h.t > 0) {
        h.t -= dt;
        // telegraph
        if (Math.floor(h.t * 8) !== Math.floor((h.t + dt) * 8))
          sim.bus.emit('fx', {
            kind: 'ring',
            x: h.x,
            y: sim.streamer.terrain.heightAt(h.x, h.z) + 0.3,
            z: h.z,
            n: h.r,
            color: h.color,
          });
        if (h.t > 0) continue;
        if (h.kind === 'ring' || h.kind === 'burst' || h.kind === 'frost') {
          sim.bus.emit('fx', {
            kind: 'dust',
            x: h.x,
            y: sim.streamer.terrain.heightAt(h.x, h.z) + 0.5,
            z: h.z,
            n: 14,
            color: h.color,
          });
          sim.bus.emit('shake', { amount: 0.25 });
          if (h.kind === 'ring') {
            // doughnut: safe right next to the trunk
            const d = Math.hypot(p.x - h.x, p.z - h.z);
            if (d < h.r && d > b.tree.radius * 1.2) this.hurt(h.dmg);
          } else if (Math.hypot(p.x - h.x, p.z - h.z) < h.r) {
            this.hurt(h.dmg);
            if (h.kind === 'frost') {
              p.buffs.slow = 1;
              p.buffs.slow_t = 3;
            }
          }
          h.done = true;
        }
      }
      if (h.kind === 'cloud' || h.kind === 'beam') {
        h.dur -= dt;
        if (h.kind === 'cloud') {
          if (Math.floor(h.dur * 6) !== Math.floor((h.dur + dt) * 6))
            sim.bus.emit('fx', {
              kind: 'magic',
              x: h.x + rng.range(-4, 4),
              y: p.y + 0.5,
              z: h.z + rng.range(-4, 4),
              n: 3,
              color: h.color,
            });
          if (Math.hypot(p.x - h.x, p.z - h.z) < h.r) st.player.hp -= h.dmg * dt;
        } else {
          // beam from boss to the locked target point
          const ax = b.tree.x,
            az = b.tree.z,
            bx = h.vx ?? 0,
            bz = h.vz ?? 0;
          const len = Math.hypot(bx - ax, bz - az) || 1;
          const t = Math.max(0, Math.min(1, ((p.x - ax) * (bx - ax) + (p.z - az) * (bz - az)) / (len * len)));
          const d = Math.hypot(p.x - (ax + (bx - ax) * t), p.z - (az + (bz - az) * t));
          if (Math.floor(h.dur * 10) !== Math.floor((h.dur + dt) * 10))
            for (let i = 0; i < 6; i++)
              sim.bus.emit('fx', {
                kind: 'sparks',
                x: ax + (bx - ax) * (i / 5),
                y: b.tree.y + 3 - i * 0.4,
                z: az + (bz - az) * (i / 5),
                n: 2,
              });
          if (d < 2.2) st.player.hp -= h.dmg * dt * 3;
        }
        if (h.dur <= 0) h.done = true;
      }
    }
    b.hazards = b.hazards.filter((h) => !h.done);
  }

  private hurt(dmg: number): void {
    const sim = this.sim;
    sim.state.player.hp -= dmg;
    sim.bus.emit('shake', { amount: 0.35 });
    sim.bus.emit('sfx', { name: 'thud', vol: 0.6 });
  }
}
