import type { Sim, System } from '../core/sim';
import { ACHIEVEMENTS, type AchievementDef } from '../data/achievements';
import { AXES } from '../data/axes';
import { BIOMES } from '../data/biomes';
import { WOODS } from '../data/woods';
import { CONFIG } from '../config';
import { levelOf } from '../core/skills';
import { emptyPlot, newGameState } from '../save/schema';
import { Rng } from '../core/rng';
import { itemName } from './itemValue';
import { isNight } from '../core/gameTime';
import { seasonOf } from './nodes';

/** Achievements with crate/key rewards. */
export class AchievementSystem implements System {
  readonly name = 'achievements';
  constructor(private sim: Sim) {}

  progress(a: AchievementDef): number {
    const st = this.sim.state;
    if (a.stat) return st.stats[a.stat] ?? 0;
    switch (a.custom) {
      case 'biomes':
        return st.world.visited.length;
      case 'woods':
        return st.discoveredSpecies.length;
      case 'axes':
        return new Set(st.axes.map((x) => x.def)).size;
      case 'vehicles':
        return st.vehicles.length;
      case 'plots':
        return Object.keys(st.plots).length;
      case 'skills':
        return Math.max(...Object.values(st.skills).map(levelOf));
      case 'prestige':
        return st.prestige.level;
      default:
        return 0;
    }
  }

  update(): void {
    if (this.sim.tickCount % 90 !== 0) return;
    const st = this.sim.state;
    for (const a of ACHIEVEMENTS) {
      if (st.achievements.includes(a.id)) continue;
      if (this.progress(a) >= (a.target ?? 1)) this.unlock(a);
    }
  }

  unlock(a: AchievementDef): void {
    const sim = this.sim;
    sim.state.achievements.push(a.id);
    if (a.reward.money) sim.econ.earn(a.reward.money, 'achievement');
    for (const [id, n] of Object.entries(a.reward.items ?? {})) sim.inventory.add(id, n);
    sim.bus.emit('achievement', { id: a.id });
    sim.bus.emit('notify', {
      text: `🏆 Achievement: ${a.name}${a.reward.money ? ` (+$${a.reward.money.toLocaleString()})` : ''}`,
      kind: 'money',
    });
    sim.bus.emit('sfx', { name: 'level' });
  }
}

/** Prestige / rebirth: reset money & gear for permanent multipliers. */
export class PrestigeSystem implements System {
  readonly name = 'prestige';
  constructor(private sim: Sim) {}
  update(): void {}

  requirement(): number {
    return CONFIG.prestige.baseMoneyRequirement * Math.pow(2.2, this.sim.state.prestige.level);
  }
  canPrestige(): boolean {
    return this.sim.state.totalEarned >= this.requirement();
  }
  progress(): number {
    return Math.min(1, this.sim.state.totalEarned / this.requirement());
  }

  /** Keeps cosmetics, achievements, pets, plots & buildings, skills (halved), discovered woods and map knowledge. */
  doPrestige(): boolean {
    const sim = this.sim;
    const st = sim.state;
    if (!this.canPrestige()) return false;
    const fresh = newGameState(st.name, st.seed);
    st.prestige.level++;
    st.prestige.points++;
    st.money = CONFIG.startMoney * (1 + st.prestige.level * 2);
    st.totalEarned = 0;
    st.axes = [];
    st.equipped = null;
    st.vehicles.forEach((v) => sim.vehicles.despawn(v.uid));
    st.vehicles = [];
    st.inv = fresh.inv;
    st.gear = {};
    st.workers = [];
    st.jobs = [];
    st.market = fresh.market;
    st.world.outposts = {};
    st.world.chopped = {};
    st.quests = fresh.quests;
    for (const k of Object.keys(st.skills) as (keyof typeof st.skills)[])
      st.skills[k] = Math.floor(st.skills[k] * 0.5);
    for (const plot of Object.values(st.plots)) {
      // businesses reset, parts remain
      plot.businesses = {};
    }
    sim.bus.emit('prestige', { level: st.prestige.level });
    sim.bus.emit('notify', {
      text: `PRESTIGE ${st.prestige.level}! Permanent bonuses: +${st.prestige.level * CONFIG.prestige.multPerLevel * 100}% sell value, +${st.prestige.level * 5}% XP, +${st.prestige.level * 10}% axe damage.`,
      kind: 'money',
    });
    void emptyPlot;
    sim.quests.init();
    return true;
  }
}

interface EventDef {
  id: string;
  text: string;
  dur: number; // seconds
  weight: number;
}
const EVENT_DEFS: EventDef[] = [
  { id: 'wood_rush', text: '🪵 WOOD RUSH! All wood sells for +50% for 5 minutes!', dur: 300, weight: 3 },
  {
    id: 'meteor',
    text: '☄️ METEOR SHOWER! Glowing meteor ore has landed near you — grab it before it cools!',
    dur: 240,
    weight: 2,
  },
  {
    id: 'caravan',
    text: '🐪 A trade caravan arrived! Planks & furniture sell for +40% for 4 minutes.',
    dur: 240,
    weight: 2,
  },
  {
    id: 'forest_fire',
    text: '🔥 FOREST FIRE nearby! Burned trees fall — grab the logs, avoid the flames!',
    dur: 100,
    weight: 1.4,
  },
  { id: 'storm', text: '⛈️ A thunderstorm rolls in — lightning is felling trees!', dur: 200, weight: 1.6 },
  {
    id: 'merchant',
    text: '🧙 The Traveling Merchant is in the Hub with rare goods for 6 minutes!',
    dur: 360,
    weight: 2,
  },
];

/** Random world events, plus seasons. */
export class EventSystem implements System {
  readonly name = 'events';
  private rng = new Rng(2718);
  private fire: { x: number; z: number; r: number } | null = null;
  private lastSeason = '';
  meteors: { id: string; x: number; z: number }[] = [];
  constructor(private sim: Sim) {}

  get current() {
    const e = this.sim.state.world.events;
    return e && e.until > this.sim.state.time ? e : null;
  }

  /** Price multiplier applied to selling while an event is active. */
  sellMultiplier(item: string): number {
    const e = this.current;
    if (!e) return 1;
    if (e.id === 'wood_rush') return 1.5;
    if (e.id === 'caravan' && (item.startsWith('plank_') || item.includes('@'))) return 1.4;
    return 1;
  }

  update(dt: number): void {
    const sim = this.sim;
    const st = sim.state;
    const w = st.world;
    if (sim.tickCount % 60 === 0) {
      const season = seasonOf(st.time);
      if (season !== this.lastSeason) {
        if (this.lastSeason)
          sim.bus.emit('notify', {
            text: `Season changed: ${season}. ${season === 'autumn' ? 'Pumpkins grow near the hub!' : season === 'winter' ? 'Candy canes appear near the hub!' : season === 'spring' ? 'Painted eggs hide near the hub!' : 'Long sunny days.'}`,
            kind: 'info',
          });
        this.lastSeason = season;
      }
      if (w.events && w.events.until <= st.time) {
        sim.bus.emit('event:end', { id: w.events.id });
        sim.bus.emit('notify', { text: 'The event has ended.', kind: 'info' });
        if (w.events.id === 'forest_fire') this.fire = null;
        if (w.events.id === 'meteor') this.meteors = [];
        w.events = null;
      }
      if (!w.events && st.time >= w.nextEvent) {
        if (w.nextEvent > 0) this.start();
        w.nextEvent = st.time + (420 + this.rng.range(0, 480)) / CONFIG.dayLengthSec;
      }
    }
    const e = this.current;
    if (e?.id === 'forest_fire' && this.fire) this.tickFire(dt);
    if (e?.id === 'meteor' && sim.tickCount % 40 === 0) {
      const p = sim.player;
      sim.bus.emit('fx', {
        kind: 'embers',
        x: p.x + this.rng.range(-60, 60),
        y: p.y + 40,
        z: p.z + this.rng.range(-60, 60),
        n: 6,
      });
    }
  }

  start(id?: string): void {
    const sim = this.sim;
    const def = id ? EVENT_DEFS.find((d) => d.id === id)! : this.rng.weighted(EVENT_DEFS, (d) => d.weight);
    const p = sim.player;
    const w = sim.state.world;
    w.events = { id: def.id, until: sim.state.time + def.dur / CONFIG.dayLengthSec };
    sim.bus.emit('event:start', { id: def.id, text: def.text });
    sim.bus.emit('notify', { text: def.text, kind: 'money' });
    if (def.id === 'storm') sim.state.weather = { kind: 'storm', until: w.events.until };
    if (def.id === 'forest_fire') {
      const a = this.rng.range(0, Math.PI * 2);
      this.fire = { x: p.x + Math.cos(a) * 60, z: p.z + Math.sin(a) * 60, r: 28 };
    }
    if (def.id === 'meteor') {
      for (let i = 0; i < 6; i++) {
        const a = this.rng.range(0, Math.PI * 2),
          r = this.rng.range(25, 90);
        const x = p.x + Math.cos(a) * r,
          z = p.z + Math.sin(a) * r;
        const y = sim.streamer.terrain.heightAt(x, z);
        const id = `meteor:${i}`;
        const item = this.rng.pick(['gold_ore', 'crystal_shard', 'iron_ore', 'sun_core']);
        sim.nodes.nodes.push({ id, kind: 'forage', x, z, y, item, biome: 'meteor' });
        this.meteors.push({ id, x, z });
        sim.bus.emit('fx', { kind: 'embers', x, y: y + 1, z, n: 30 });
      }
    }
  }

  private tickFire(dt: number): void {
    const sim = this.sim;
    const f = this.fire!;
    const near = sim.trees.near(f.x, f.z, f.r);
    for (const t of near) {
      if (this.rng.chance(dt * 0.35)) {
        sim.bus.emit('fx', { kind: 'embers', x: t.x, y: t.y + 3, z: t.z, n: 6 });
        sim.bus.emit('fx', { kind: 'smoke', x: t.x, y: t.y + 5, z: t.z, n: 2 });
        if (sim.trees.hit(t, t.maxHp * 0.35)) {
          sim.trees.markFelled(t);
          sim.logs.fellTree(t, f.x, f.z);
        }
      }
    }
    if (sim.tickCount % 10 === 0)
      for (let i = 0; i < 4; i++)
        sim.bus.emit('fx', {
          kind: 'embers',
          x: f.x + this.rng.range(-f.r, f.r),
          y: sim.streamer.terrain.heightAt(f.x, f.z) + 1,
          z: f.z + this.rng.range(-f.r, f.r),
          n: 3,
        });
    const p = sim.player;
    if (Math.hypot(p.x - f.x, p.z - f.z) < f.r && sim.state.gear.body !== 'fire_suit') {
      sim.state.player.hp -= 5 * dt;
      sim.biome.hazardText = 'In the fire! Get out!';
    }
  }
}

/** Companion pet (perks are applied where relevant). */
export class PetSystem implements System {
  readonly name = 'pets';
  x = 0;
  z = 0;
  constructor(private sim: Sim) {}
  update(dt: number): void {
    const p = this.sim.player;
    const tx = p.x + Math.sin(p.yaw + 2.4) * 2,
      tz = p.z + Math.cos(p.yaw + 2.4) * 2;
    const k = 1 - Math.exp(-dt * 3);
    if (Math.hypot(tx - this.x, tz - this.z) > 30) {
      this.x = tx;
      this.z = tz;
    }
    this.x += (tx - this.x) * k;
    this.z += (tz - this.z) * k;
  }
  setActive(id: string | null): void {
    this.sim.state.activePet = id;
  }
}
void AXES;
void BIOMES;
void WOODS;
void itemName;
void isNight;
