import type { Sim, System } from '../core/sim';
import { G, GROUPS, RAPIER } from '../physics/world';
import { CAVE_BIOMES, buildDome } from '../world/caves';
import { OUTPOSTS, SHAFTS, buildSecrets, buildStations, type Secret, type Station } from '../world/landmarks';
import { BRIDGE, DOCK, FERRY_ROUTE } from '../world/layout';
import { SEA_LEVEL } from '../world/terrain';
import { CONFIG } from '../config';
import { ITEM_BY_ID } from '../data/items';
import type { Interactable } from './hubSystem';
import { itemName } from './itemValue';

const FERRY_SPEED = 8;
const FERRY_FEE = 50;

/** Caves, fast-travel stations, secrets, shafts, toll bridge, scheduled ferry and passive outposts. */
export class WorldSystem implements System {
  readonly name = 'world';
  readonly stationList: Station[] = buildStations();
  secrets: Secret[] = [];
  private caveBodies: RAPIER.RigidBody[] = [];
  private gateBody: RAPIER.RigidBody | null = null;
  private tick = 0;
  ferry = {
    s: 0,
    dir: 1 as 1 | -1,
    x: DOCK.x,
    y: 0,
    z: DOCK.z,
    yaw: 0,
    docked: 'hub' as 'hub' | 'isles' | null,
    dockT: 0,
    riding: false,
  };
  private ferryPath: [number, number][] = [];
  private ferryLen: number[] = [];

  constructor(private sim: Sim) {}

  init(): void {
    const T = this.sim.streamer.terrain;
    this.secrets = buildSecrets(T, this.sim.state.seed);
    const w = this.sim.physics.world;
    for (const b of CAVE_BIOMES) {
      const d = buildDome(T, b);
      const body = w.createRigidBody(RAPIER.RigidBodyDesc.fixed());
      w.createCollider(
        RAPIER.ColliderDesc.trimesh(d.positions, d.indices).setCollisionGroups(GROUPS.build),
        body,
      );
      this.caveBodies.push(body);
    }
    this.buildFerryPath();
    this.updateGate(true);
    this.offlineEarnings();
  }

  // ------------------------------------------------------------ fast travel
  stations(): { id: string; x: number; z: number; unlocked: boolean }[] {
    const un = this.sim.state.world.stations;
    return this.stationList.map((s) => ({
      id: s.id,
      x: s.x,
      z: s.z,
      unlocked: !!s.start || un.includes(s.id),
    }));
  }
  nearestStation(x: number, z: number, r: number): { id: string } | null {
    let best: { id: string } | null = null;
    let bd = r;
    for (const s of this.stationList) {
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }
  travelCost(id: string): number {
    const s = this.stationList.find((x) => x.id === id);
    if (!s) return 0;
    const p = this.sim.player;
    return Math.round(Math.hypot(s.x - p.x, s.z - p.z) * 0.4);
  }
  travel(id: string): boolean {
    const s = this.stationList.find((x) => x.id === id);
    const sim = this.sim;
    if (!s || sim.player.mode !== 'foot') return false;
    if (!s.start && !sim.state.world.stations.includes(id)) {
      sim.bus.emit('notify', { text: 'Station not discovered yet — walk to it first', kind: 'bad' });
      return false;
    }
    const cost = this.travelCost(id);
    if (cost > 0 && !sim.econ.spend(cost, 'fast travel')) return false;
    const y = s.biome === 'sky' ? 230 : undefined;
    sim.player.teleport(s.x, s.z, y);
    sim.bus.emit('notify', { text: `Traveled to ${s.name}${cost ? ` (-$${cost})` : ''}`, kind: 'good' });
    sim.game.closePanel();
    return true;
  }

  // ------------------------------------------------------------ toll bridge
  tollActive(): boolean {
    return this.sim.state.world.tollUntil > this.sim.state.time;
  }
  payToll(): boolean {
    const sim = this.sim;
    if (this.tollActive()) {
      sim.bus.emit('notify', { text: 'Your toll pass is still valid', kind: 'info' });
      return false;
    }
    if (!sim.econ.spend(25, 'toll')) return false;
    sim.state.world.tollUntil = sim.state.time + 900 / CONFIG.dayLengthSec;
    sim.bus.emit('notify', { text: 'Toll paid — the bridge gate opens for 15 minutes', kind: 'good' });
    this.updateGate(false);
    return true;
  }
  private updateGate(force: boolean): void {
    const open = this.tollActive();
    const w = this.sim.physics.world;
    if (open && this.gateBody) {
      w.removeRigidBody(this.gateBody);
      this.gateBody = null;
    } else if (!open && (!this.gateBody || force)) {
      if (this.gateBody) return;
      // barrier across the bridge's west entrance
      this.gateBody = w.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(BRIDGE.x - BRIDGE.halfLen - 1, BRIDGE.y + 1.2, BRIDGE.z),
      );
      w.createCollider(
        RAPIER.ColliderDesc.cuboid(0.25, 1.4, BRIDGE.width / 2).setCollisionGroups(GROUPS.build),
        this.gateBody,
      );
    }
  }

  // ------------------------------------------------------------ ferry
  private buildFerryPath(): void {
    this.ferryPath = FERRY_ROUTE;
    let acc = 0;
    this.ferryLen = [0];
    for (let i = 1; i < FERRY_ROUTE.length; i++) {
      acc += Math.hypot(
        FERRY_ROUTE[i]![0] - FERRY_ROUTE[i - 1]![0],
        FERRY_ROUTE[i]![1] - FERRY_ROUTE[i - 1]![1],
      );
      this.ferryLen.push(acc);
    }
  }
  get ferryTotal(): number {
    return this.ferryLen[this.ferryLen.length - 1] ?? 0;
  }
  private ferryPoint(s: number): { x: number; z: number; yaw: number } {
    const pts = this.ferryPath;
    s = Math.max(0, Math.min(this.ferryTotal, s));
    let i = 0;
    while (i < pts.length - 2 && this.ferryLen[i + 1]! < s) i++;
    const a = pts[i]!,
      b = pts[i + 1]!;
    const seg = this.ferryLen[i + 1]! - this.ferryLen[i]!;
    const t = seg > 0 ? (s - this.ferryLen[i]!) / seg : 0;
    return {
      x: a[0] + (b[0] - a[0]) * t,
      z: a[1] + (b[1] - a[1]) * t,
      yaw: Math.atan2(b[0] - a[0], b[1] - a[1]),
    };
  }
  private updateFerry(dt: number): void {
    const f = this.ferry;
    if (f.docked) {
      f.dockT -= dt;
      if (f.dockT <= 0) f.docked = null;
    } else {
      f.s += f.dir * FERRY_SPEED * dt;
      if (f.s >= this.ferryTotal) {
        f.s = this.ferryTotal;
        f.dir = -1;
        f.docked = 'isles';
        f.dockT = 40;
      } else if (f.s <= 0) {
        f.s = 0;
        f.dir = 1;
        f.docked = 'hub';
        f.dockT = 40;
      }
    }
    const p = this.ferryPoint(f.s);
    f.x = p.x;
    f.z = p.z;
    f.y = SEA_LEVEL + 0.4;
    f.yaw = f.dir === 1 ? p.yaw : p.yaw + Math.PI;
    if (f.riding) {
      const pl = this.sim.player;
      pl.x = f.x;
      pl.z = f.z;
      pl.y = f.y + 2.2;
      pl.yaw = f.yaw;
      if (f.docked === (f.dir === 1 ? 'isles' : 'hub')) this.disembark();
    }
  }
  boardFerry(): boolean {
    const sim = this.sim;
    const f = this.ferry;
    if (f.riding || sim.player.mode !== 'foot') return false;
    if (f.docked !== 'hub' && Math.hypot(f.x - sim.player.x, f.z - sim.player.z) > 25) {
      sim.bus.emit('notify', {
        text: `The ferry is out at sea. Next departure in ~${Math.round(Math.max(0, (this.ferryTotal - f.s) / FERRY_SPEED))}s`,
        kind: 'info',
      });
      return false;
    }
    if (f.docked === 'isles' && Math.hypot(f.x - sim.player.x, f.z - sim.player.z) > 25) return false;
    if (!sim.econ.spend(FERRY_FEE, 'ferry')) return false;
    f.riding = true;
    sim.player.mode = 'vehicle';
    sim.player.locked = true;
    sim.player.camDist = 14;
    sim.bus.emit('notify', { text: 'All aboard! The ferry arrives in a couple of minutes.', kind: 'good' });
    if (f.docked) f.dockT = Math.min(f.dockT, 3);
    return true;
  }
  private disembark(): void {
    const f = this.ferry;
    const pl = this.sim.player;
    f.riding = false;
    pl.mode = 'foot';
    pl.locked = false;
    const isles = f.dir === -1;
    const x = isles ? 850 : DOCK.x + 6,
      z = isles ? 880 : DOCK.z;
    pl.teleport(x, z);
    this.sim.bus.emit('notify', {
      text: isles ? 'Welcome to the Tropic Isles!' : 'Back at the Hub dock',
      kind: 'good',
    });
  }

  // ------------------------------------------------------------ secrets
  findSecret(s: Secret): void {
    const sim = this.sim;
    if (sim.state.world.secrets.includes(s.id)) return;
    sim.state.world.secrets.push(s.id);
    const r = s.reward;
    if (r.money) sim.econ.earn(r.money, 'secret');
    if (r.xp) sim.addXp('foraging', r.xp);
    if (r.item) sim.inventory.add(r.item, r.n ?? 1);
    if (r.pet) {
      sim.inventory.add(r.pet, 1);
      sim.bus.emit('notify', { text: `A ${itemName(r.pet)} followed you home!`, kind: 'money' });
    }
    sim.bus.emit('notify', {
      text: `Secret found!${r.money ? ` +$${r.money}` : ''}${r.item ? ` +${r.n ?? 1}× ${itemName(r.item)}` : ''}`,
      kind: 'money',
    });
    sim.bus.emit('sfx', { name: 'level' });
    sim.bus.emit('fx', { kind: 'magic', x: s.x, y: 2, z: s.z, n: 30, color: 0xffe066 });
    sim.state.stats.secrets = (sim.state.stats.secrets ?? 0) + 1;
  }

  // ------------------------------------------------------------ outposts
  outposts() {
    return OUTPOSTS.map((o) => ({ def: o, st: this.sim.state.world.outposts[o.id] }));
  }
  outpostRate(id: string): number {
    const o = OUTPOSTS.find((x) => x.id === id)!;
    const st = this.sim.state.world.outposts[id];
    if (!st) return 0;
    return (
      o.income *
      (1 + (st.level - 1) * 0.6) *
      (1 + this.sim.state.prestige.level * CONFIG.prestige.multPerLevel)
    );
  }
  outpostPending(id: string): number {
    const st = this.sim.state.world.outposts[id];
    if (!st) return 0;
    const hours = Math.min(CONFIG.idle.offlineCapHours, (Date.now() - st.lastMs) / 3.6e6);
    const online = Math.min(hours, Math.max(0, (this.sim.state.playedSec - st.lastPlayed) / 3600));
    const offline = Math.max(0, hours - online);
    return Math.floor(this.outpostRate(id) * (online + offline * CONFIG.idle.offlineEfficiency));
  }
  buyOutpost(id: string): boolean {
    const o = OUTPOSTS.find((x) => x.id === id);
    const sim = this.sim;
    if (!o || sim.state.world.outposts[id]) return false;
    if (!sim.econ.spend(o.cost, 'outpost')) return false;
    sim.state.world.outposts[id] = { level: 1, lastMs: Date.now(), lastPlayed: sim.state.playedSec };
    sim.bus.emit('notify', { text: `${o.name} acquired — it earns passive income!`, kind: 'good' });
    return true;
  }
  upgradeOutpost(id: string): boolean {
    const o = OUTPOSTS.find((x) => x.id === id);
    const st = this.sim.state.world.outposts[id];
    if (!o || !st || st.level >= 5) return false;
    if (!this.sim.econ.spend(Math.round(o.cost * 0.6 * st.level), 'outpost')) return false;
    this.collectOutpost(id);
    st.level++;
    return true;
  }
  collectOutpost(id: string): number {
    const st = this.sim.state.world.outposts[id];
    if (!st) return 0;
    const amt = this.outpostPending(id);
    st.lastMs = Date.now();
    st.lastPlayed = this.sim.state.playedSec;
    if (amt > 0) this.sim.econ.earn(amt, 'outpost');
    return amt;
  }
  private offlineEarnings(): void {
    const hoursAway = (Date.now() - this.sim.state.savedAt) / 3.6e6;
    let total = 0;
    for (const o of OUTPOSTS) if (this.sim.state.world.outposts[o.id]) total += this.outpostPending(o.id);
    if (total > 0 && hoursAway > 0.02)
      this.sim.bus.emit('notify', {
        text: `Your outposts earned $${total.toLocaleString()} while you were away — collect them at each outpost`,
        kind: 'money',
      });
  }

  // ------------------------------------------------------------ update
  update(dt: number): void {
    this.tick++;
    const sim = this.sim;
    const p = sim.player;
    this.updateFerry(dt);
    if (this.tick % 20 === 0) {
      // discover stations
      for (const s of this.stationList) {
        if (!sim.state.world.stations.includes(s.id) && Math.hypot(s.x - p.x, s.z - p.z) < 10) {
          sim.state.world.stations.push(s.id);
          sim.bus.emit('notify', { text: `Fast-travel station unlocked: ${s.name}`, kind: 'good' });
        }
      }
      this.updateGate(false);
    }
    if (this.tick % 15 === 0) this.refreshInteractables();
  }

  private refreshInteractables(): void {
    const p = this.sim.player;
    const list: Interactable[] = [];
    for (const s of this.secrets) {
      if (this.sim.state.world.secrets.includes(s.id)) continue;
      if (Math.hypot(s.x - p.x, s.z - p.z) < 6)
        list.push({
          id: 'secret:' + s.id,
          label: s.kind === 'chest' ? 'Open hidden chest' : 'Investigate',
          x: s.x,
          z: s.z,
          y: 0,
          radius: 3.5,
          kind: 'secret' as any,
          arg: s.id,
        });
    }
    for (const sh of SHAFTS) {
      for (const [a, b] of [
        [sh.a, sh.b],
        [sh.b, sh.a],
      ] as [number, number][][]) {
        if (Math.hypot(a![0]! - p.x, a![1]! - p.z) < 6)
          list.push({
            id: sh.id + ':' + a![0],
            label: `Take ${sh.name}`,
            x: a![0]!,
            z: a![1]!,
            y: 0,
            radius: 4,
            kind: 'shaft' as any,
            arg: `${b![0]},${b![1]}`,
          });
      }
    }
    for (const o of OUTPOSTS) {
      if (Math.hypot(o.x - p.x, o.z - p.z) < 10)
        list.push({
          id: o.id,
          label: this.sim.state.world.outposts[o.id] ? `${o.name} (collect)` : `${o.name} (for sale)`,
          x: o.x,
          z: o.z,
          y: 0,
          radius: 6,
          kind: 'outpost' as any,
          arg: o.id,
        });
    }
    for (const s of this.stationList) {
      if (Math.hypot(s.x - p.x, s.z - p.z) < 6)
        list.push({
          id: 'st:' + s.id,
          label: 'Fast travel map',
          x: s.x,
          z: s.z,
          y: 0,
          radius: 4,
          kind: 'fast_travel',
          arg: s.id,
        });
    }
    // ferry dock
    if (Math.hypot(DOCK.x - p.x, DOCK.z - p.z) < 40 && this.ferry.docked === 'hub')
      list.push({
        id: 'ferry',
        label: `Board the ferry ($${FERRY_FEE})`,
        x: p.x,
        z: p.z,
        y: 0,
        radius: 99,
        kind: 'ferry' as any,
        prio: 60,
      });
    else if (Math.hypot(850 - p.x, 880 - p.z) < 40 && this.ferry.docked === 'isles')
      list.push({
        id: 'ferry2',
        label: `Board the ferry ($${FERRY_FEE})`,
        x: p.x,
        z: p.z,
        y: 0,
        radius: 99,
        kind: 'ferry' as any,
        prio: 60,
      });
    this.sim.hub.extraWorld = list;
  }

  dispose(): void {
    const w = this.sim.physics.world;
    for (const b of this.caveBodies) w.removeRigidBody(b);
    if (this.gateBody) w.removeRigidBody(this.gateBody);
  }
}
void G;
void ITEM_BY_ID;
