import { CONFIG } from '../config';
import type { Sim, System } from '../core/sim';
import { G, grp, GROUPS, RAPIER } from '../physics/world';
import { VEHICLES, VEHICLE_BY_ID, VEHICLE_UPGRADES } from '../data/vehicles';
import type { VehicleDef } from '../data/types';
import type { OwnedVehicle } from '../save/schema';
import { RAIL, SEA_LEVEL } from '../world/terrain';
import { HUB } from '../world/layout';
import { levelOf } from '../core/skills';

const WHEEL_QUERY = grp(G.VEHICLE, G.GROUND | G.BUILD);
const smooth = (cur: number, tgt: number, k: number, dt: number) =>
  cur + (tgt - cur) * (1 - Math.exp(-k * dt));

export type Control =
  'wheeled' | 'boat' | 'rail' | 'balloon' | 'airship' | 'plane' | 'heli' | 'hover' | 'mech';

export function controlOf(def: VehicleDef): Control {
  const t = def.traits;
  if (t.includes('mechArms')) return 'mech';
  if (t.includes('hover')) return 'hover';
  if (t.includes('plane')) return 'plane';
  if (t.includes('heli')) return 'heli';
  if (t.includes('balloon')) return def.id === 'airship' ? 'airship' : 'balloon';
  if (t.includes('boat')) return 'boat';
  if (t.includes('rails') && def.id !== 'mining_cart') return 'rail';
  return 'wheeled';
}

export interface Wheel {
  x: number;
  y: number;
  z: number;
  steer: boolean;
  drive: boolean;
}

export interface LiveVehicle {
  owned: OwnedVehicle;
  def: VehicleDef;
  control: Control;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  ctrl: RAPIER.DynamicRayCastVehicleController | null;
  wheels: Wheel[];
  throttle: number;
  steer: number;
  brake: number;
  speed: number; // signed forward speed
  rpm: number;
  driver: boolean;
  trailer: LiveVehicle | null;
  towedBy: LiveVehicle | null;
  joint: RAPIER.ImpulseJoint | null;
  lights: boolean;
  wheelSpin: number;
  steerAngle: number;
  /** rail: distance along path */
  railS: number;
  vertical: number;
  asleep: boolean;
  /** for animation */
  rotor: number;
  /** mech chop cooldown */
  armT: number;
  lastSpeed: number;
  halfH: number;
  /** ferry route phase */
  ferryT: number;
}

export function wheelLayout(def: VehicleDef): Wheel[] {
  const [w, , l] = def.size;
  const n = def.wheels;
  if (n === 0) return [];
  const track = n === 2 ? w * 0.28 : w / 2 - def.wheelRadius * 0.35;
  const out: Wheel[] = [];
  const axles = n <= 4 ? 2 : 3;
  for (let a = 0; a < axles; a++) {
    const z =
      axles === 2 ? (a === 0 ? l * 0.32 : -l * 0.32) : a === 0 ? l * 0.36 : a === 1 ? -l * 0.05 : -l * 0.36;
    for (const sx of [-1, 1]) out.push({ x: sx * track, y: 0, z, steer: a === 0, drive: true });
  }
  return out;
}

/** All drivable vehicles: spawning, control models (wheeled/boat/air/rail/hover/mech), fuel, damage, trailers. */
export class VehicleSystem implements System {
  readonly name = 'vehicles';
  readonly live = new Map<string, LiveVehicle>();
  current: LiveVehicle | null = null;
  camMode = 0;
  private tick = 0;
  private hornCd = 0;

  constructor(private sim: Sim) {}

  init(): void {
    for (const o of this.sim.state.vehicles) this.spawn(o);
  }

  // ----------------------------------------------------------- ownership
  def(id: string): VehicleDef | undefined {
    return VEHICLE_BY_ID[id];
  }

  /** Statistics with upgrades applied. */
  stats(v: { def: VehicleDef; owned: OwnedVehicle }) {
    const u = v.owned.upg;
    const driving = levelOf(this.sim.state.skills.driving);
    return {
      engine: v.def.engine * (1 + (u.engine ?? 0) * 0.08),
      maxSpeed: v.def.maxSpeed * (1 + (u.engine ?? 0) * 0.04) * (1 + driving * 0.005),
      grip: 1 + (u.tires ?? 0) * 0.08,
      capacity: v.def.capacity * (1 + (u.capacity ?? 0) * 0.12),
      fuelCap: v.def.fuelCap * (1 + (u.tank ?? 0) * 0.15),
      armor: 1 - (u.armor ?? 0) * 0.1,
      fuelUse: v.def.fuelUse * (1 - driving * 0.01),
    };
  }

  upgradeCost(owned: OwnedVehicle, key: string): number {
    const d = VEHICLE_BY_ID[owned.def]!;
    const up = VEHICLE_UPGRADES.find((x) => x.id === key);
    if (!up) return 0;
    return Math.round(Math.max(300, d.price * up.baseCost) * Math.pow(1.7, owned.upg[key] ?? 0));
  }

  buy(defId: string): boolean {
    const d = VEHICLE_BY_ID[defId];
    const s = this.sim;
    if (!d || d.price <= 0) return false;
    if (!s.econ.spend(d.price, 'vehicle')) return false;
    this.give(defId);
    s.quests.progress('buy', 'vehicle', 1);
    s.quests.progress('buy', defId, 1);
    return true;
  }

  /** Add a vehicle to the player's collection and spawn it at its home pad. */
  give(defId: string): boolean {
    const d = VEHICLE_BY_ID[defId];
    if (!d) return false;
    const s = this.sim;
    const pad = this.padFor(d);
    const o: OwnedVehicle = {
      uid: s.inventory.newUid('v'),
      def: defId,
      upg: {},
      paint: d.color,
      decal: 'none',
      fuel: d.fuelCap,
      hp: 100,
      pos: [pad.x, pad.y, pad.z],
      yaw: pad.yaw,
      trailer: null,
    };
    s.state.vehicles.push(o);
    this.spawn(o);
    s.bus.emit('notify', {
      text: `${d.name} delivered to the ${d.kind === 'water' ? 'harbor' : d.kind === 'air' ? 'airfield' : d.kind === 'rail' ? 'station' : 'garage'}`,
      kind: 'good',
    });
    return true;
  }

  padFor(d: VehicleDef): { x: number; y: number; z: number; yaw: number } {
    const lay = this.sim.hub.layout;
    const T = this.sim.streamer.terrain;
    const n = this.sim.state.vehicles.length;
    if (d.kind === 'water') {
      const b = lay.boatPad;
      return { x: b.x, y: 0.5, z: b.z + (n % 5) * 6, yaw: b.yaw };
    }
    if (d.kind === 'air') {
      const a = lay.airPad;
      return { x: a.x + (n % 4) * 14, y: T.heightAt(a.x, a.z) + 2.2, z: a.z, yaw: a.yaw };
    }
    if (d.kind === 'rail') {
      return { x: RAIL[0]![0] + 6, y: T.heightAt(RAIL[0]![0], RAIL[0]![1]) + 1, z: RAIL[0]![1] + 8, yaw: 0 };
    }
    const g = lay.garagePad;
    const col = n % 4,
      row = Math.floor(n / 4) % 3;
    return { x: g.x - 9 + col * 6.5, y: T.heightAt(g.x, g.z) + 1.6, z: g.z + row * 9, yaw: Math.PI };
  }

  // ----------------------------------------------------------- spawn
  spawn(o: OwnedVehicle): LiveVehicle | null {
    const def = VEHICLE_BY_ID[o.def];
    if (!def || this.live.has(o.uid)) return null;
    const world = this.sim.physics.world;
    const control = controlOf(def);
    const [w, h, l] = def.size;
    const halfH = h / 2;
    const T = this.sim.streamer.terrain;
    // make sure the ground exists under the spawn point
    this.sim.streamer.preload(o.pos[0], o.pos[2], 1);
    let y = o.pos[1];
    const g = T.heightAt(o.pos[0], o.pos[2]);
    if (control === 'wheeled') y = Math.max(y, g + def.wheelRadius + 0.9 + halfH);
    else if (control === 'boat') y = Math.max(y, SEA_LEVEL + 0.3);
    const q = { x: 0, y: Math.sin(o.yaw / 2), z: 0, w: Math.cos(o.yaw / 2) };
    const desc = (
      control === 'rail' ? RAPIER.RigidBodyDesc.kinematicPositionBased() : RAPIER.RigidBodyDesc.dynamic()
    )
      .setTranslation(o.pos[0], y, o.pos[2])
      .setRotation(q)
      .setCanSleep(false)
      .setLinearDamping(0.05)
      .setAngularDamping(control === 'wheeled' ? 0.3 : 1.2);
    if (
      control === 'balloon' ||
      control === 'airship' ||
      control === 'plane' ||
      control === 'heli' ||
      control === 'mech'
    )
      desc.setGravityScale(0).enabledRotations(false, true, false);
    if (control === 'mech') desc.setGravityScale(1);
    const mass = def.mass;
    if (control !== 'rail') {
      const ix = (mass * (h * h + l * l)) / 12,
        iy = (mass * (w * w + l * l)) / 12,
        iz = (mass * (w * w + h * h)) / 12;
      desc.setAdditionalMassProperties(
        mass,
        { x: 0, y: control === 'wheeled' ? -halfH * 0.6 : -halfH * 0.2, z: 0 },
        { x: ix, y: iy, z: iz },
        { x: 0, y: 0, z: 0, w: 1 },
      );
    }
    const body = world.createRigidBody(desc);
    const cdesc = RAPIER.ColliderDesc.cuboid(w / 2, halfH, l / 2)
      .setDensity(0)
      .setFriction(0.3)
      .setCollisionGroups(GROUPS.vehicle);
    if (control === 'wheeled') cdesc.setTranslation(0, 0, 0);
    const collider = world.createCollider(cdesc, body);
    const lv: LiveVehicle = {
      owned: o,
      def,
      control,
      body,
      collider,
      ctrl: null,
      wheels: [],
      throttle: 0,
      steer: 0,
      brake: 0,
      speed: 0,
      rpm: 0,
      driver: false,
      trailer: null,
      towedBy: null,
      joint: null,
      lights: false,
      wheelSpin: 0,
      steerAngle: 0,
      railS: 0,
      vertical: 0,
      asleep: false,
      rotor: 0,
      armT: 0,
      lastSpeed: 0,
      halfH,
      ferryT: 0,
    };
    if (control === 'wheeled') this.setupWheels(lv);
    if (control === 'rail') {
      lv.railS = this.railParam(o.pos[0], o.pos[2]);
      this.placeOnRail(lv);
    }
    this.live.set(o.uid, lv);
    if (o.trailer) {
      const tr = this.live.get(o.trailer);
      if (tr) this.couple(lv, tr);
    }
    return lv;
  }

  private setupWheels(lv: LiveVehicle): void {
    const world = this.sim.physics.world;
    const def = lv.def;
    const ctrl = world.createVehicleController(lv.body);
    lv.wheels = wheelLayout(def);
    const rest = Math.max(0.3, def.wheelRadius * 0.7);
    const st = this.stats(lv);
    for (const wh of lv.wheels) {
      const cy = -lv.halfH + 0.12;
      ctrl.addWheel(
        { x: wh.x, y: cy, z: wh.z },
        { x: 0, y: -1, z: 0 },
        { x: -1, y: 0, z: 0 },
        rest,
        def.wheelRadius,
      );
    }
    const n = lv.wheels.length;
    for (let i = 0; i < n; i++) {
      ctrl.setWheelSuspensionStiffness(i, 14 + def.mass / 90);
      ctrl.setWheelSuspensionCompression(i, 2.4);
      ctrl.setWheelSuspensionRelaxation(i, 2.8);
      ctrl.setWheelMaxSuspensionTravel(i, rest * 1.2);
      ctrl.setWheelMaxSuspensionForce(i, (def.mass * 22 * 3) / n);
      ctrl.setWheelFrictionSlip(i, 10.5 * st.grip);
      ctrl.setWheelSideFrictionStiffness(i, 1.2);
    }
    lv.ctrl = ctrl;
  }

  despawn(uid: string): void {
    const lv = this.live.get(uid);
    if (!lv) return;
    if (lv === this.current) this.exit();
    if (lv.joint) this.sim.physics.world.removeImpulseJoint(lv.joint, true);
    if (lv.ctrl) this.sim.physics.world.removeVehicleController(lv.ctrl);
    this.sim.physics.world.removeRigidBody(lv.body);
    this.live.delete(uid);
  }

  sell(uid: string): boolean {
    const o = this.sim.state.vehicles.find((v) => v.uid === uid);
    if (!o) return false;
    this.despawn(uid);
    this.sim.state.vehicles = this.sim.state.vehicles.filter((v) => v.uid !== uid);
    this.sim.econ.earn(Math.round(VEHICLE_BY_ID[o.def]!.price * 0.5), 'vehicle sale');
    return true;
  }

  // ----------------------------------------------------------- enter / exit
  nearestEnterable(x: number, z: number, r = 4.5): LiveVehicle | null {
    let best: LiveVehicle | null = null;
    let bd = r;
    for (const v of this.live.values()) {
      if (v.def.isTrailer || v.def.seats <= 0 || v.driver) continue;
      const t = v.body.translation();
      const d = Math.hypot(t.x - x, t.z - z) - Math.max(v.def.size[0], v.def.size[2]) * 0.35;
      if (d < bd) {
        bd = d;
        best = v;
      }
    }
    return best;
  }

  enter(v: LiveVehicle): boolean {
    if (this.current || v.def.isTrailer) return false;
    const st = this.sim.state;
    if (v.owned.hp <= 0) {
      this.sim.bus.emit('notify', { text: 'Vehicle is wrecked — repair it at the mechanic', kind: 'bad' });
      return false;
    }
    this.current = v;
    v.driver = true;
    v.asleep = false;
    this.sim.player.mode = 'vehicle';
    this.sim.player.locked = true;
    this.sim.player.camDist = 9 + v.def.size[2] * 0.7;
    this.sim.player.camPitch = 0.3;
    this.camMode = 0;
    {
      const q = v.body.rotation();
      this.sim.player.camYaw = 2 * Math.atan2(q.y, q.w) + Math.PI;
    }
    this.sim.bus.emit('vehicle:enter', { id: 0 });
    this.sim.bus.emit('notify', {
      text: `Driving ${v.def.name}  [WASD] drive · [Space] brake · [E] exit · [R] recall · [L] lights · [H] horn`,
      kind: 'info',
    });
    st.player.fuel = Math.min(st.player.fuel, 100);
    return true;
  }

  exit(): void {
    const v = this.current;
    if (!v) return;
    const t = v.body.translation();
    const p = this.sim.player;
    const side = v.def.size[0] / 2 + 1.4;
    const q = v.body.rotation();
    const yaw = 2 * Math.atan2(q.y, q.w);
    const ex = t.x + Math.cos(yaw) * side,
      ez = t.z - Math.sin(yaw) * side;
    let ey = this.sim.streamer.terrain.surfaceAt(ex, ez, t.y + 3);
    if (v.control === 'boat' || v.control === 'hover') ey = Math.max(ey, t.y - 0.5);
    if (v.control === 'balloon' || v.control === 'airship' || v.control === 'heli' || v.control === 'plane') {
      const g = this.sim.streamer.terrain.surfaceAt(t.x, t.z, t.y);
      if (t.y - g > 6) {
        this.sim.bus.emit('notify', { text: 'Land before exiting!', kind: 'bad' });
        return;
      }
    }
    v.driver = false;
    v.throttle = v.steer = 0;
    v.brake = 1;
    this.current = null;
    p.mode = 'foot';
    p.locked = false;
    p.x = ex;
    p.z = ez;
    p.y = Math.max(ey, v.control === 'boat' ? SEA_LEVEL : ey) + 0.4;
    p.vx = p.vy = p.vz = 0;
    p.teleport(ex, ez, p.y);
    this.sim.bus.emit('vehicle:exit', { id: 0 });
  }

  recall(v: LiveVehicle): void {
    if (v === this.current) return;
    const p = this.sim.player;
    const cost = 50;
    if (!this.sim.econ.spend(cost, 'recall')) return;
    const yaw = p.camYaw;
    const x = p.x + -Math.sin(yaw) * 8,
      z = p.z + -Math.cos(yaw) * 8;
    this.sim.streamer.preload(x, z, 1);
    if (v.trailer) this.uncouple(v);
    const g = v.control === 'boat' ? SEA_LEVEL : this.sim.streamer.terrain.surfaceAt(x, z, p.y + 5);
    v.body.setTranslation({ x, y: g + (v.control === 'wheeled' ? 2.2 : 1), z }, true);
    v.body.setRotation({ x: 0, y: Math.sin(p.yaw / 2), z: 0, w: Math.cos(p.yaw / 2) }, true);
    v.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    v.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    v.asleep = false;
    this.sim.bus.emit('notify', { text: `${v.def.name} recalled (-$${cost})`, kind: 'good' });
  }

  // ----------------------------------------------------------- trailers
  couple(a: LiveVehicle, b: LiveVehicle): boolean {
    if (a.trailer || b.towedBy || !a.def.trailerHitch || !b.def.isTrailer) return false;
    const w = this.sim.physics.world;
    const aBack = { x: 0, y: -a.halfH * 0.4, z: -a.def.size[2] / 2 - 0.2 };
    const bFront = { x: 0, y: -b.halfH * 0.4, z: b.def.size[2] / 2 + 0.2 };
    // snap the trailer so both anchors coincide (avoids a violent joint correction)
    const aq = a.body.rotation();
    const at = a.body.translation();
    const yaw = 2 * Math.atan2(aq.y, aq.w);
    const cs = Math.cos(yaw),
      sn = Math.sin(yaw);
    const ax = at.x + aBack.x * cs + aBack.z * sn,
      ay = at.y + aBack.y,
      az = at.z - aBack.x * sn + aBack.z * cs;
    b.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
    b.body.setTranslation(
      { x: ax - (bFront.x * cs + bFront.z * sn), y: ay - bFront.y, z: az - (-bFront.x * sn + bFront.z * cs) },
      true,
    );
    b.body.setLinvel(a.body.linvel(), true);
    b.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    const joint = w.createImpulseJoint(RAPIER.JointData.spherical(aBack, bFront), a.body, b.body, true);
    a.trailer = b;
    b.towedBy = a;
    a.joint = joint;
    a.owned.trailer = b.owned.uid;
    return true;
  }
  uncouple(a: LiveVehicle): void {
    if (!a.trailer) return;
    if (a.joint) this.sim.physics.world.removeImpulseJoint(a.joint, true);
    a.joint = null;
    a.trailer.towedBy = null;
    a.trailer = null;
    a.owned.trailer = null;
  }
  /** Try to hitch the closest trailer to the current vehicle (or unhitch). */
  toggleHitch(): void {
    const v = this.current;
    if (!v) return;
    if (v.trailer) {
      this.uncouple(v);
      this.sim.bus.emit('notify', { text: 'Trailer unhitched', kind: 'info' });
      return;
    }
    if (!v.def.trailerHitch) return;
    const t = v.body.translation();
    const q = v.body.rotation();
    const yaw = 2 * Math.atan2(q.y, q.w);
    const bx = t.x - Math.sin(yaw) * (v.def.size[2] / 2 + 2.5),
      bz = t.z - Math.cos(yaw) * (v.def.size[2] / 2 + 2.5);
    let best: LiveVehicle | null = null;
    let bd = 6;
    for (const o of this.live.values()) {
      if (!o.def.isTrailer || o.towedBy) continue;
      const ot = o.body.translation();
      const d = Math.hypot(ot.x - bx, ot.z - bz);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    if (best && this.couple(v, best))
      this.sim.bus.emit('notify', { text: `${best.def.name} hitched`, kind: 'good' });
    else this.sim.bus.emit('notify', { text: 'Back up to a trailer to hitch it', kind: 'info' });
  }

  // ----------------------------------------------------------- rails
  private railLen: number[] = [];
  private railTotal = 0;
  private ensureRail(): void {
    if (this.railLen.length) return;
    let acc = 0;
    this.railLen.push(0);
    for (let i = 1; i < RAIL.length; i++) {
      acc += Math.hypot(RAIL[i]![0] - RAIL[i - 1]![0], RAIL[i]![1] - RAIL[i - 1]![1]);
      this.railLen.push(acc);
    }
    this.railTotal = acc;
  }
  railParam(x: number, z: number): number {
    this.ensureRail();
    let best = 0,
      bd = 1e9;
    for (let i = 0; i < RAIL.length - 1; i++) {
      const a = RAIL[i]!,
        b = RAIL[i + 1]!;
      const vx = b[0] - a[0],
        vz = b[1] - a[1];
      const l2 = vx * vx + vz * vz;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[1]) * vz) / l2));
      const d = Math.hypot(x - (a[0] + vx * t), z - (a[1] + vz * t));
      if (d < bd) {
        bd = d;
        best = this.railLen[i]! + t * Math.sqrt(l2);
      }
    }
    return best;
  }
  railPoint(s: number): { x: number; z: number; yaw: number } {
    this.ensureRail();
    s = Math.max(0, Math.min(this.railTotal, s));
    let i = 0;
    while (i < RAIL.length - 2 && this.railLen[i + 1]! < s) i++;
    const a = RAIL[i]!,
      b = RAIL[i + 1]!;
    const seg = this.railLen[i + 1]! - this.railLen[i]!;
    const t = seg > 0 ? (s - this.railLen[i]!) / seg : 0;
    return {
      x: a[0] + (b[0] - a[0]) * t,
      z: a[1] + (b[1] - a[1]) * t,
      yaw: Math.atan2(b[0] - a[0], b[1] - a[1]),
    };
  }
  private placeOnRail(lv: LiveVehicle): void {
    const p = this.railPoint(lv.railS);
    const T = this.sim.streamer.terrain;
    const y = T.heightAt(p.x, p.z) + 0.35 + lv.halfH;
    lv.body.setNextKinematicTranslation({ x: p.x, y, z: p.z });
    lv.body.setNextKinematicRotation({ x: 0, y: Math.sin(p.yaw / 2), z: 0, w: Math.cos(p.yaw / 2) });
  }

  // ----------------------------------------------------------- main update
  update(dt: number): void {
    this.tick++;
    const sim = this.sim;
    const inp = sim.game.input;
    this.hornCd -= dt;
    const cur = this.current;
    if (this.tick % 10 === 0) this.refreshPrompts();
    if (cur) this.readInput(cur, inp);
    const pp = sim.player;
    for (const v of this.live.values()) {
      const t = v.body.translation();
      // far vehicles sleep
      if (!v.driver && !v.towedBy && Math.hypot(t.x - pp.x, t.z - pp.z) > 420 && v.control !== 'boat') {
        if (!v.asleep) {
          v.body.sleep();
          v.asleep = true;
        }
        continue;
      }
      if (v.asleep && Math.hypot(t.x - pp.x, t.z - pp.z) < 380) {
        v.asleep = false;
        v.body.wakeUp();
      }
      if (v.asleep) continue;
      this.step(v, dt);
      v.owned.pos = [t.x, t.y, t.z];
      const q = v.body.rotation();
      v.owned.yaw = 2 * Math.atan2(q.y, q.w);
    }
    if (cur) this.driverUpdate(cur, dt);
  }

  private refreshPrompts(): void {
    const p = this.sim.player;
    const list: any[] = [];
    if (!this.current) {
      for (const v of this.live.values()) {
        if (v.def.isTrailer || v.def.seats <= 0 || v.driver) continue;
        const t = v.body.translation();
        const r = Math.max(v.def.size[0], v.def.size[2]) * 0.5 + 2.4;
        if (Math.hypot(t.x - p.x, t.z - p.z) > r + 3) continue;
        list.push({
          id: 'veh:' + v.owned.uid,
          label: `Drive ${v.def.name}`,
          x: t.x,
          z: t.z,
          y: t.y,
          radius: r,
          kind: 'vehicle',
          arg: v.owned.uid,
        });
      }
    }
    this.sim.hub.extraVeh = list;
  }

  private readInput(v: LiveVehicle, inp: Sim['game']['input']): void {
    const lock = inp.uiOpen;
    const f = lock ? 0 : (inp.held('forward') ? 1 : 0) - (inp.held('back') ? 1 : 0);
    const s = lock ? 0 : (inp.held('right') ? 1 : 0) - (inp.held('left') ? 1 : 0);
    const tf = lock ? 0 : inp.moveY;
    const ts = lock ? 0 : inp.moveX;
    v.throttle = smooth(v.throttle, f || tf, 12, 1 / 60);
    if (Math.abs(v.throttle) < 0.03 && !(f || tf)) v.throttle = 0;
    v.steer = smooth(v.steer, s || ts, 8, 1 / 60);
    if (Math.abs(v.steer) < 0.02 && !(s || ts)) v.steer = 0;
    v.brake = !lock && inp.held('jump') ? 1 : 0;
    v.vertical = lock ? 0 : (inp.held('jump') ? 1 : 0) - (inp.held('sprint') ? 1 : 0);
    if (!lock) {
      if (inp.pressed('interact')) this.exit();
      if (inp.pressed('lights')) v.lights = !v.lights;
      if (inp.pressed('horn') && this.hornCd <= 0) {
        this.hornCd = 0.5;
        this.sim.bus.emit('sfx', { name: 'horn', x: v.body.translation().x, z: v.body.translation().z });
      }
      if (inp.pressed('recall')) this.toggleHitch();
      if (inp.rawPressed('KeyV')) {
        this.camMode = (this.camMode + 1) % 3;
        this.sim.player.camDist = [9 + v.def.size[2] * 0.7, 20 + v.def.size[2], 2.5][this.camMode]!;
      }
    }
    // camera look
    const pl = this.sim.player;
    if (!lock) {
      pl.camYaw -= inp.lookDX * 0.0022 * this.sim.game.settings.sensitivity;
      pl.camPitch = Math.max(
        -0.2,
        Math.min(1.1, pl.camPitch + inp.lookDY * 0.0022 * this.sim.game.settings.sensitivity),
      );
      pl.camDist = Math.max(5, Math.min(30, pl.camDist + inp.wheel * 1.2));
    }
  }

  private driverUpdate(v: LiveVehicle, dt: number): void {
    const t = v.body.translation();
    const p = this.sim.player;
    p.x = t.x;
    p.y = t.y;
    p.z = t.z;
    p.moveSpeed = 0;
    const q = v.body.rotation();
    p.yaw = 2 * Math.atan2(q.y, q.w);
    this.sim.state.player.x = t.x;
    this.sim.state.player.y = t.y;
    this.sim.state.player.z = t.z;
    // chase camera auto-follow when moving fast
    if (Math.abs(v.speed) > 4 && this.camMode === 0 && !this.sim.game.input.uiOpen) {
      let d = p.yaw + Math.PI - p.camYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      p.camYaw += d * Math.min(1, dt * 0.9) * (v.speed > 0 ? 1 : 0);
    }
    this.sim.state.stats.driven = (this.sim.state.stats.driven ?? 0) + Math.abs(v.speed) * dt;
    if (this.tick % 30 === 0) this.sim.addXp('driving', Math.abs(v.speed) * 0.02);
    this.sim.quests.progress('drive', undefined, Math.abs(v.speed) * dt);
  }

  private fuelUse(v: LiveVehicle, dt: number, load: number): boolean {
    if (v.def.fuelUse <= 0) return true;
    const st = this.stats(v);
    if (v.owned.fuel <= 0) return false;
    v.owned.fuel = Math.max(0, v.owned.fuel - st.fuelUse * load * dt);
    return true;
  }

  private step(v: LiveVehicle, dt: number): void {
    const st = this.stats(v);
    const q = v.body.rotation();
    const lin = v.body.linvel();
    const yaw = 2 * Math.atan2(q.y, q.w);
    const fx = Math.sin(yaw),
      fz = Math.cos(yaw);
    v.speed = lin.x * fx + lin.z * fz;
    const drive = v.driver && v.owned.hp > 0;
    const powered = drive && this.fuelUse(v, dt, Math.abs(v.throttle) * 0.8 + 0.2 * Math.abs(v.vertical));
    if (v.driver && v.owned.fuel <= 0 && this.tick % 120 === 0)
      this.sim.bus.emit('notify', { text: 'Out of fuel!', kind: 'bad' });
    const thr = powered ? v.throttle : 0;
    switch (v.control) {
      case 'wheeled':
        this.stepWheeled(v, dt, st, thr, drive);
        break;
      case 'boat':
        this.stepBoat(v, dt, st, thr, drive);
        break;
      case 'rail':
        this.stepRail(v, dt, st, thr, drive);
        break;
      case 'balloon':
      case 'airship':
        this.stepBalloon(v, dt, st, thr, powered);
        break;
      case 'heli':
        this.stepHeli(v, dt, st, thr, powered);
        break;
      case 'plane':
        this.stepPlane(v, dt, st, thr, powered);
        break;
      case 'hover':
        this.stepHover(v, dt, st, thr, drive);
        break;
      case 'mech':
        this.stepMech(v, dt, st, thr, powered);
        break;
    }
    // crash damage
    const sp = Math.hypot(lin.x, lin.z);
    if (v.lastSpeed - sp > 9 && v.driver) {
      const dmg = (v.lastSpeed - sp - 9) * 2.2 * st.armor;
      v.owned.hp = Math.max(0, v.owned.hp - dmg);
      this.sim.bus.emit('shake', { amount: Math.min(0.8, dmg / 30) });
      this.sim.bus.emit('sfx', { name: 'thud', vol: 0.8 });
      if (v.owned.hp <= 0) this.sim.bus.emit('notify', { text: `${v.def.name} is wrecked!`, kind: 'bad' });
    }
    v.lastSpeed = sp;
    // flipped / fell out of world
    const t = v.body.translation();
    if (t.y < -60 && v.control !== 'boat') {
      const g = this.sim.streamer.terrain.heightAt(t.x, t.z);
      v.body.setTranslation({ x: t.x, y: Math.max(g, 0) + 4, z: t.z }, true);
      v.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }
    // slow overlay: fall in water for ground vehicle
    if (v.control === 'wheeled' && t.y < SEA_LEVEL - 0.3 && v.driver) {
      v.owned.hp = Math.max(0, v.owned.hp - 6 * dt);
    }
  }

  // ---- wheeled
  private stepWheeled(
    v: LiveVehicle,
    dt: number,
    st: ReturnType<VehicleSystem['stats']>,
    thr: number,
    drive: boolean,
  ): void {
    const c = v.ctrl;
    if (!c) return;
    const n = v.wheels.length;
    const speedAbs = Math.abs(v.speed);
    const maxS = st.maxSpeed * (v.def.traits.includes('snow') ? 1 : 1);
    // terrain penalty: swamp/sand without proper vehicle
    const biome = this.sim.streamer.terrain.biomeAt(v.body.translation().x, v.body.translation().z);
    let terrain = 1;
    if (biome.hazards.includes('slow') && !v.def.traits.includes('swamp')) terrain *= 0.7;
    if (biome.id === 'taiga' && !v.def.traits.includes('snow')) terrain *= 0.55;
    if (biome.id === 'desert' && !v.def.traits.includes('sand') && !v.def.traits.includes('snow'))
      terrain *= 0.85;
    let eng = 0;
    if (drive) {
      const limited =
        thr > 0 ? speedAbs < maxS * terrain || v.speed < 0 : speedAbs < maxS * 0.45 || v.speed > 0;
      eng = limited ? thr * st.engine * terrain : 0;
      // low-speed torque boost
      if (speedAbs < 3) eng *= 1.25;
    }
    const steerMax = (v.def.turn * 0.75) / (1 + speedAbs / (12 + v.def.mass / 400));
    const steerAngle = -(drive ? v.steer : 0) * steerMax;
    v.steerAngle = smooth(v.steerAngle, steerAngle, 14, dt);
    const brakeForce = drive
      ? v.brake * v.def.brake * v.def.mass * 0.08
      : v.towedBy
        ? 0
        : v.def.brake * 0.03 * (v.def.mass / 12);
    const coast = drive && thr === 0 ? v.def.mass * 0.05 : 0;
    for (let i = 0; i < n; i++) {
      const w = v.wheels[i]!;
      c.setWheelEngineForce(i, w.drive ? eng / n : 0);
      c.setWheelBrake(i, (brakeForce + coast) / n);
      c.setWheelSteering(i, w.steer ? v.steerAngle : 0);
    }
    c.updateVehicle(dt, undefined, WHEEL_QUERY);
    v.wheelSpin += (v.speed / v.def.wheelRadius) * dt;
    // anti-flip assist: gently right the chassis when airborne/tilted
    const q = v.body.rotation();
    const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
    if (upY < 0.55 && drive && speedAbs < 3) {
      v.body.applyTorqueImpulse({ x: 0, y: 0, z: 0 }, true);
    }
    // aerodynamic-ish drag
    const lin = v.body.linvel();
    const dragK = (0.012 + 0.0006 * speedAbs) * dt;
    v.body.setLinvel({ x: lin.x * (1 - dragK), y: lin.y, z: lin.z * (1 - dragK) }, true);
    v.rpm = Math.min(1, speedAbs / (maxS || 1));
  }

  // ---- boat
  private stepBoat(
    v: LiveVehicle,
    dt: number,
    st: ReturnType<VehicleSystem['stats']>,
    thr: number,
    drive: boolean,
  ): void {
    const b = v.body;
    const q = b.rotation();
    const yaw = 2 * Math.atan2(q.y, q.w);
    const fx = Math.sin(yaw),
      fz = Math.cos(yaw);
    const [w, , l] = v.def.size;
    const t = b.translation();
    const lin = b.linvel();
    // buoyancy at four corners
    const pts: [number, number][] = [
      [w / 2, l / 2],
      [-w / 2, l / 2],
      [w / 2, -l / 2],
      [-w / 2, -l / 2],
    ];
    const cs = Math.cos(yaw),
      sn = Math.sin(yaw);
    let submerged = 0;
    const draft = Math.max(0.4, v.def.size[1] * 0.45);
    for (const [px, pz] of pts) {
      const wx = t.x + px * cs + pz * sn;
      const wz = t.z - px * sn + pz * cs;
      const depth = SEA_LEVEL - (t.y - draft + this.cornerRise(q, px, pz));
      if (depth > 0) {
        submerged++;
        const f = Math.min(depth, 1.5) * v.def.mass * 60 - lin.y * v.def.mass * 5;
        b.applyImpulseAtPoint({ x: 0, y: (f / 4) * dt, z: 0 }, { x: wx, y: t.y, z: wz }, true);
      }
    }
    // keel: kill lateral velocity, drag (re-read: impulses above changed the velocity immediately)
    const lin2 = b.linvel();
    const side = lin2.x * fz - lin2.z * fx; // lateral component
    const fwd = lin2.x * fx + lin2.z * fz;
    if (submerged > 0) {
      const k = Math.min(1, 3.5 * dt);
      b.setLinvel(
        {
          x: lin2.x - fz * side * k - fx * fwd * 0.15 * dt,
          y: lin2.y,
          z: lin2.z + fx * side * k - fz * fwd * 0.15 * dt,
        },
        true,
      );
      const f = drive ? thr * st.engine * (submerged / 4) : 0;
      if ((thr >= 0 && fwd < st.maxSpeed) || (thr < 0 && fwd > -st.maxSpeed * 0.4))
        b.applyImpulse({ x: fx * f * dt, y: 0, z: fz * f * dt }, true);
      const turn =
        -(drive ? v.steer : 0) * v.def.turn * Math.min(1, Math.abs(fwd) / 3 + 0.25) * (fwd >= -0.5 ? 1 : -1);
      const av = b.angvel();
      b.setAngvel({ x: av.x * 0.9, y: smooth(av.y, turn * 1.1, 4, dt), z: av.z * 0.9 }, true);
    }
    // upright torque
    const upX = 2 * (q.x * q.y - q.w * q.z),
      upZ = 2 * (q.y * q.z + q.w * q.x);
    b.applyTorqueImpulse({ x: -upZ * v.def.mass * 3 * dt, y: 0, z: upX * v.def.mass * 3 * dt }, true);
    v.rpm = Math.min(1, Math.abs(fwd) / st.maxSpeed);
    // scheduled ferry: automatic shuttle between dock and isles when nobody drives
    void HUB;
  }
  private cornerRise(q: { x: number; y: number; z: number; w: number }, px: number, pz: number): number {
    // vertical offset of a body-local point (px,0,pz) after rotation q
    const ry = 2 * (q.y * q.z - q.w * q.x) * pz + 2 * (q.x * q.y + q.w * q.z) * px;
    return ry;
  }

  // ---- rail
  private stepRail(
    v: LiveVehicle,
    dt: number,
    st: ReturnType<VehicleSystem['stats']>,
    thr: number,
    drive: boolean,
  ): void {
    if (v.def.isTrailer) {
      const lead = v.towedBy;
      if (lead) {
        v.railS = lead.railS - (lead.def.size[2] / 2 + v.def.size[2] / 2 + 1);
        this.placeOnRail(v);
      }
      return;
    }
    this.ensureRail();
    const eng = drive ? thr * st.engine : 0;
    const acc = (eng / v.def.mass) * 1.1 - (v.brake && drive ? Math.sign(v.speed) * 8 : 0) - v.speed * 0.04;
    v.speed = Math.max(-st.maxSpeed * 0.3, Math.min(st.maxSpeed, v.speed + acc * dt));
    if (Math.abs(v.speed) < 0.15 && thr === 0) v.speed = 0;
    v.railS = Math.max(0, Math.min(this.railTotal, v.railS + v.speed * dt));
    this.placeOnRail(v);
    v.wheelSpin += (v.speed / v.def.wheelRadius) * dt;
    v.rpm = Math.min(1, Math.abs(v.speed) / st.maxSpeed);
  }

  // ---- balloon / airship
  private stepBalloon(
    v: LiveVehicle,
    dt: number,
    st: ReturnType<VehicleSystem['stats']>,
    thr: number,
    powered: boolean,
  ): void {
    const b = v.body;
    const q = b.rotation();
    const yaw = 2 * Math.atan2(q.y, q.w);
    const lin = b.linvel();
    const t = b.translation();
    const ground = this.sim.streamer.terrain.surfaceAt(t.x, t.z, t.y);
    const airship = v.control === 'airship';
    let vyT = -0.8;
    if (powered) vyT = v.vertical * (airship ? 5 : 4.5) - (v.vertical === 0 ? 0.6 : 0);
    if (t.y - v.halfH < ground + 0.2 && vyT < 0) vyT = 0;
    const vy = smooth(lin.y, vyT, 1.4, dt);
    // horizontal
    const maxS = st.maxSpeed;
    let vx = lin.x,
      vz = lin.z;
    if (airship) {
      const turn = powered ? -v.steer * 0.5 : 0;
      b.setAngvel({ x: 0, y: smooth(b.angvel().y, turn, 3, dt), z: 0 }, true);
      const tx = Math.sin(yaw) * thr * maxS,
        tz = Math.cos(yaw) * thr * maxS;
      vx = smooth(vx, tx, 0.8, dt);
      vz = smooth(vz, tz, 0.8, dt);
    } else {
      // balloon: drift in camera-relative directions slowly
      const cy = this.sim.player.camYaw;
      const mx = powered ? v.steer : 0,
        mz = thr;
      const tx = (-Math.sin(cy) * mz + Math.cos(cy) * mx) * maxS;
      const tz = (-Math.cos(cy) * mz - Math.sin(cy) * mx) * maxS;
      vx = smooth(vx, tx, 0.5, dt);
      vz = smooth(vz, tz, 0.5, dt);
      if (Math.abs(tx) + Math.abs(tz) > 0.5) {
        const want = Math.atan2(tx, tz);
        let d = want - yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        b.setAngvel({ x: 0, y: d * 0.8, z: 0 }, true);
      } else b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
    b.setLinvel({ x: vx, y: vy, z: vz }, true);
    v.rpm = Math.min(1, Math.hypot(vx, vz) / maxS);
    if (v.driver && v.owned.fuel > 0 && powered) v.rotor += dt;
  }

  // ---- helicopter
  private stepHeli(
    v: LiveVehicle,
    dt: number,
    st: ReturnType<VehicleSystem['stats']>,
    thr: number,
    powered: boolean,
  ): void {
    const b = v.body;
    const q = b.rotation();
    const yaw = 2 * Math.atan2(q.y, q.w);
    const lin = b.linvel();
    const t = b.translation();
    const ground = this.sim.streamer.terrain.surfaceAt(t.x, t.z, t.y);
    let vyT = -2.5;
    if (powered) vyT = v.vertical * 9 + (v.vertical === 0 ? 0 : 0);
    if (powered && v.vertical === 0) vyT = 0;
    if (t.y - v.halfH < ground + 0.15 && vyT < 0) vyT = 0;
    const vy = smooth(lin.y, vyT, 2.2, dt);
    const maxS = st.maxSpeed;
    const tx = Math.sin(yaw) * thr * maxS * (powered ? 1 : 0),
      tz = Math.cos(yaw) * thr * maxS * (powered ? 1 : 0);
    const vx = smooth(lin.x, tx, 1.4, dt),
      vz = smooth(lin.z, tz, 1.4, dt);
    const turn = powered ? -v.steer * 1.3 : 0;
    b.setAngvel({ x: 0, y: smooth(b.angvel().y, turn, 5, dt), z: 0 }, true);
    b.setLinvel({ x: vx, y: vy, z: vz }, true);
    v.rotor += dt * (powered ? 30 : 0);
    v.rpm = powered ? 1 : 0;
  }

  // ---- plane
  private stepPlane(
    v: LiveVehicle,
    dt: number,
    st: ReturnType<VehicleSystem['stats']>,
    thr: number,
    powered: boolean,
  ): void {
    const b = v.body;
    const q = b.rotation();
    const yaw = 2 * Math.atan2(q.y, q.w);
    const lin = b.linvel();
    const t = b.translation();
    const water = this.sim.streamer.terrain.surfaceAt(t.x, t.z, t.y);
    const groundY = Math.max(water, SEA_LEVEL);
    const onGround = t.y - v.halfH < groundY + 0.4;
    // throttle: W/S integrate a throttle setting
    v.ferryT = Math.max(0, Math.min(1, v.ferryT + (powered ? thr * dt * 0.5 : -dt * 0.3)));
    const target = v.ferryT * st.maxSpeed;
    const fwd = lin.x * Math.sin(yaw) + lin.z * Math.cos(yaw);
    const sp = smooth(fwd, target, 0.5, dt);
    const stall = 18;
    let vyT = -4;
    if (sp > stall) vyT = powered ? -v.vertical * 0 + (v.vertical > 0 ? 9 : v.vertical < 0 ? -9 : 0.4) : -2;
    if (onGround && vyT < 0) vyT = 0;
    const vy = smooth(lin.y, vyT, 1.5, dt);
    const turn = powered ? -v.steer * 0.7 * Math.min(1, sp / 12) : 0;
    b.setAngvel({ x: 0, y: smooth(b.angvel().y, turn, 4, dt), z: 0 }, true);
    b.setLinvel({ x: Math.sin(yaw) * sp, y: vy, z: Math.cos(yaw) * sp }, true);
    v.rotor += dt * (10 + sp);
    v.speed = sp;
    v.rpm = v.ferryT;
    if (onGround && Math.abs(vy) < 0.1 && sp < 0.5 && v.driver) v.owned.fuel -= 0;
  }

  // ---- hover sled
  private stepHover(
    v: LiveVehicle,
    dt: number,
    st: ReturnType<VehicleSystem['stats']>,
    thr: number,
    drive: boolean,
  ): void {
    const b = v.body;
    const q = b.rotation();
    const yaw = 2 * Math.atan2(q.y, q.w);
    const fx = Math.sin(yaw),
      fz = Math.cos(yaw);
    const t = b.translation();
    const lin = b.linvel();
    const [w, , l] = v.def.size;
    const cs = Math.cos(yaw),
      sn = Math.sin(yaw);
    const hover = 1.3;
    const T = this.sim.streamer.terrain;
    for (const [px, pz] of [
      [w / 2, l / 2],
      [-w / 2, l / 2],
      [w / 2, -l / 2],
      [-w / 2, -l / 2],
    ] as [number, number][]) {
      const wx = t.x + px * cs + pz * sn,
        wz = t.z - px * sn + pz * cs;
      const gy = Math.max(T.heightAt(wx, wz), SEA_LEVEL);
      const h = t.y - gy;
      const f = Math.max(0, hover - h) * v.def.mass * 26 - lin.y * v.def.mass * 1.2;
      if (h < hover * 2)
        b.applyImpulseAtPoint(
          { x: 0, y: (f / 4 + ((v.def.mass * 22) / 4) * (h < hover * 1.4 ? 1 : 0)) * dt, z: 0 },
          { x: wx, y: t.y, z: wz },
          true,
        );
    }
    const lin2 = b.linvel();
    const fwd = lin2.x * fx + lin2.z * fz;
    const side = lin2.x * fz - lin2.z * fx;
    const f = drive ? thr * st.engine : 0;
    if (fwd < st.maxSpeed) b.applyImpulse({ x: fx * f * dt, y: 0, z: fz * f * dt }, true);
    const k = Math.min(1, 1.8 * dt);
    const lin3 = b.linvel();
    b.setLinvel(
      {
        x: lin3.x - fz * side * k - fx * fwd * 0.2 * dt,
        y: lin3.y,
        z: lin3.z + fx * side * k - fz * fwd * 0.2 * dt,
      },
      true,
    );
    const turn = -(drive ? v.steer : 0) * v.def.turn * 1.2;
    b.setAngvel(
      { x: b.angvel().x * 0.85, y: smooth(b.angvel().y, turn, 5, dt), z: b.angvel().z * 0.85 },
      true,
    );
    const upX = 2 * (q.x * q.y - q.w * q.z),
      upZ = 2 * (q.y * q.z + q.w * q.x);
    b.applyTorqueImpulse({ x: -upZ * v.def.mass * 4 * dt, y: 0, z: upX * v.def.mass * 4 * dt }, true);
    v.rpm = Math.min(1, Math.abs(fwd) / st.maxSpeed);
  }

  // ---- mech
  private stepMech(
    v: LiveVehicle,
    dt: number,
    st: ReturnType<VehicleSystem['stats']>,
    thr: number,
    powered: boolean,
  ): void {
    const b = v.body;
    const q = b.rotation();
    const yaw = 2 * Math.atan2(q.y, q.w);
    const lin = b.linvel();
    const sp = powered ? thr * st.maxSpeed : 0;
    b.setLinvel(
      { x: smooth(lin.x, Math.sin(yaw) * sp, 6, dt), y: lin.y, z: smooth(lin.z, Math.cos(yaw) * sp, 6, dt) },
      true,
    );
    b.setAngvel(
      { x: 0, y: smooth(b.angvel().y, powered ? -v.steer * v.def.turn * 2 : 0, 8, dt), z: 0 },
      true,
    );
    v.speed = sp;
    v.armT -= dt;
    // arms chop trees in front
    if (powered && v.armT <= 0) {
      const t = b.translation();
      const tx = t.x + Math.sin(yaw) * 3.4,
        tz = t.z + Math.cos(yaw) * 3.4;
      const near = this.sim.trees.near(tx, tz, 3.2);
      if (near.length) {
        v.armT = 0.55;
        const tree = near[0]!;
        const dmg = 160 * (1 + levelOf(this.sim.state.skills.woodcutting) * 0.02);
        this.sim.chopping.mechHit(tree, dmg);
      }
    }
    v.rotor += dt * Math.abs(sp) * 0.8;
  }

  /** Fuel & repair services. */
  refuel(v: OwnedVehicle, full = true): number {
    const def = VEHICLE_BY_ID[v.def]!;
    const live = this.live.get(v.uid);
    const cap = live ? this.stats(live).fuelCap : def.fuelCap;
    const need = cap - v.fuel;
    if (need <= 0.5) return 0;
    const price = Math.ceil(need * 0.8);
    if (!this.sim.econ.spend(price, 'fuel')) return 0;
    v.fuel = cap;
    void full;
    return price;
  }
  repairCost(v: OwnedVehicle): number {
    const d = VEHICLE_BY_ID[v.def]!;
    return Math.round(((100 - v.hp) / 100) * d.price * 0.12);
  }
  repair(v: OwnedVehicle): boolean {
    const c = this.repairCost(v);
    if (c <= 0) return false;
    if (!this.sim.econ.spend(c, 'repair')) return false;
    v.hp = 100;
    return true;
  }
  upgrade(v: OwnedVehicle, key: string): boolean {
    const up = VEHICLE_UPGRADES.find((x) => x.id === key);
    if (!up || (v.upg[key] ?? 0) >= up.max) return false;
    if (!this.sim.econ.spend(this.upgradeCost(v, key), 'vehicle upgrade')) return false;
    v.upg[key] = (v.upg[key] ?? 0) + 1;
    const live = this.live.get(v.uid);
    if (live?.ctrl)
      for (let i = 0; i < live.wheels.length; i++)
        live.ctrl.setWheelFrictionSlip(i, 10.5 * this.stats(live).grip);
    return true;
  }

  dispose(): void {
    for (const id of [...this.live.keys()]) this.despawn(id);
  }
}
void CONFIG;
void VEHICLES;
