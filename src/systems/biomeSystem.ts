import type { Sim, System } from '../core/sim';
import { BIOME_BY_ID } from '../data/biomes';
import { Rng } from '../core/rng';
import { ITEM_BY_ID } from '../data/items';
import { isNight } from '../core/gameTime';
import { CONFIG } from '../config';
import type { BiomeDef } from '../data/types';

export const WEATHERS = ['clear', 'rain', 'snow', 'fog', 'blizzard', 'sandstorm', 'ash', 'storm'] as const;

/** Tracks the player's biome, applies hazards (heat/cold/lava/dark/void) and drives weather. */
export class BiomeSystem implements System {
  readonly name = 'biome';
  current: BiomeDef = BIOME_BY_ID.meadow;
  prevId: string | null = null;
  private rng = new Rng(555);
  private acc = 0;
  hazardText = '';
  warmth = 0;
  private nextLightning = 0;

  constructor(private sim: Sim) {}

  init(): void {
    this.current = this.sim.streamer.terrain.biomeAt(this.sim.player.x, this.sim.player.z);
    this.prevId = this.current.id;
    const w = this.sim.state.weather;
    if (w.until <= this.sim.state.time) this.rollWeather();
  }

  rollWeather(): void {
    const st = this.sim.state;
    const list = this.current.weather;
    // clear is most likely
    const kind = this.rng.chance(0.55) && list.includes('clear') ? 'clear' : this.rng.pick(list);
    st.weather = { kind, until: st.time + (240 + this.rng.range(0, 600)) / CONFIG.dayLengthSec };
    this.sim.bus.emit('weather:change', { weather: kind });
    if (kind !== 'clear') this.sim.bus.emit('notify', { text: `Weather: ${kind}`, kind: 'info' });
  }

  update(dt: number): void {
    const sim = this.sim;
    const st = sim.state;
    const p = sim.player;
    this.acc += dt;
    if (this.acc < 0.25) return;
    const step = this.acc;
    this.acc = 0;
    const b = sim.streamer.terrain.biomeAt(p.x, p.z);
    if (b.id !== this.current.id) {
      const prev = this.current.id;
      this.current = b;
      if (!st.world.visited.includes(b.id)) {
        st.world.visited.push(b.id);
        sim.bus.emit('notify', { text: `Discovered: ${b.name}`, kind: 'good' });
      }
      sim.bus.emit('biome:enter', { biome: b.id, prev });
      sim.bus.emit('notify', { text: b.name, kind: 'info' });
      // weather may not fit this biome anymore
      if (!b.weather.includes(st.weather.kind) && st.weather.kind !== 'clear') this.rollWeather();
    }
    if (st.weather.until <= st.time) this.rollWeather();

    // ---- hazards
    const gear = st.gear;
    const buff = p.buffs;
    this.hazardText = '';
    let dmg = 0;
    const weather = st.weather.kind;
    const hasFire = gear.body === 'fire_suit';
    const hasSnow = gear.body === 'snow_gear' || !!buff.cold;
    if (b.hazards.includes('heat')) {
      if (b.id === 'volcano' && !hasFire) {
        dmg += 2.5;
        this.hazardText = 'Scorching heat! Wear a Fire Suit';
      } else if (b.id === 'desert' && weather === 'clear' && !isNight(st.time)) {
        // mild: just drains stamina faster
        st.player.stamina = Math.max(0, st.player.stamina - 0.8 * step);
      }
    }
    if (b.id === 'volcano') {
      const h = sim.streamer.terrain.heightAt(p.x, p.z);
      if (h < 6.8 && p.y < h + 1.5) {
        if (!hasFire) {
          dmg += 22;
          this.hazardText = 'LAVA!';
        }
        if (p.grounded && !hasFire) p.vy = 6;
      }
    }
    if (b.hazards.includes('cold') || weather === 'blizzard') {
      const cold = b.hazards.includes('cold')
        ? weather === 'blizzard'
          ? 3
          : 1.2
        : weather === 'blizzard'
          ? 1.5
          : 0;
      if (cold > 0 && !hasSnow) {
        dmg += cold;
        this.hazardText = 'Freezing! Wear Snow Gear or eat Warm Stew';
      }
    }
    if (b.hazards.includes('curse') && isNight(st.time)) {
      st.player.stamina = Math.max(0, st.player.stamina - 1.5 * step);
    }
    // speed mods
    p.extraSpeed = weather === 'sandstorm' && b.id === 'desert' ? 0.8 : weather === 'blizzard' ? 0.75 : 1;
    if (weather === 'storm') {
      // lightning strikes trees → fells them (storm event)
      if (st.time > this.nextLightning) {
        this.nextLightning = st.time + this.rng.range(8, 25) / CONFIG.dayLengthSec;
        const near = sim.trees.near(p.x, p.z, 70);
        if (near.length) {
          const t = this.rng.pick(near);
          sim.bus.emit('fx', { kind: 'bolt', x: t.x, y: t.y + t.height, z: t.z, n: 4 });
          sim.bus.emit('sfx', { name: 'zap', x: t.x, y: t.y, z: t.z, vol: 1 });
          sim.bus.emit('shake', { amount: 0.15 });
          if (this.rng.chance(0.35)) {
            sim.trees.hit(t, t.maxHp);
            sim.trees.markFelled(t);
            sim.logs.fellTree(t, t.x + this.rng.range(-3, 3), t.z + this.rng.range(-3, 3));
          }
        }
      }
    }
    if (dmg > 0) st.player.hp -= dmg * step;
    if (b.id === 'sky' && p.y < 150 && p.y > 10) st.player.hp -= 0; // void fall handled by terrain safety / death
    void ITEM_BY_ID;
  }

  get headlampNeeded(): boolean {
    return !!this.current.indoor;
  }
}
