import { CONFIG } from '../config';
import type { Sim, System } from '../core/sim';
import { GROUPS, RAPIER } from '../physics/world';
import { MUTATION_BY_ID, WOOD_BY_ID } from '../data/woods';
import { SEA_LEVEL } from '../world/terrain';
import { Rng } from '../core/rng';
import { logUnits, planLogs, type Tree } from '../world/trees';
import type { SavedLog } from '../save/schema';

const MASS_PER_UNIT = 10;

export interface Log {
  id: number;
  body: RAPIER.RigidBody;
  wood: string;
  len: number;
  r: number;
  units: number;
  mass: number;
  mut: string | null;
  owner: string;
  age: number;
  grabbed: boolean;
  /** frozen in the sawmill feed */
  busy: boolean;
  /** pulled toward the player (Vacuum axe / Magnet enchant) */
  magnet: boolean;
}

export interface FallingTree {
  id: string;
  tree: Pick<Tree, 'id' | 'wood' | 'style' | 'x' | 'y' | 'z' | 'scale' | 'yaw' | 'mut' | 'height' | 'radius'>;
  dx: number;
  dz: number;
  angle: number;
  omega: number;
  t: number;
  done: boolean;
  /** logs to spawn on impact (refined axe: planks instead) */
  refine: boolean;
  owner: string;
  vacuum: boolean;
}

const rng = new Rng(4242);

/** Physical logs + falling trees. */
export class LogSystem implements System {
  readonly name = 'logs';
  readonly logs = new Map<number, Log>();
  readonly falling: FallingTree[] = [];
  onFallStart: ((f: FallingTree) => void)[] = [];
  onFallEnd: ((f: FallingTree) => void)[] = [];
  private nextId = 1;
  private tick = 0;
  /** collider handle -> log id (for raycasts) */
  private byCollider = new Map<number, number>();

  constructor(private sim: Sim) {}

  init(): void {
    // restore saved logs
    for (const l of this.sim.state.world.logs) {
      const lg = this.spawnLog(l.w, l.len, l.r, { x: l.x, y: l.y, z: l.z }, l.q, null, l.mut, l.owner);
      if (lg) lg.age = l.age;
    }
    this.sim.state.world.logs = [];
  }

  beforeSave(): void {
    const out: SavedLog[] = [];
    for (const l of this.logs.values()) {
      if (out.length >= 250) break;
      const t = l.body.translation();
      const q = l.body.rotation();
      out.push({
        w: l.wood,
        len: l.len,
        r: l.r,
        x: t.x,
        y: t.y,
        z: t.z,
        q: [q.x, q.y, q.z, q.w],
        mut: l.mut,
        age: l.age,
        owner: l.owner,
      });
    }
    this.sim.state.world.logs = out;
  }

  logFromCollider(handle: number): Log | undefined {
    const id = this.byCollider.get(handle);
    return id === undefined ? undefined : this.logs.get(id);
  }

  spawnLog(
    wood: string,
    len: number,
    r: number,
    pos: { x: number; y: number; z: number },
    q: [number, number, number, number] | null,
    vel: { x: number; y: number; z: number } | null,
    mut: string | null,
    owner = 'world',
  ): Log | null {
    const def = WOOD_BY_ID[wood];
    if (!def) return null;
    if (this.logs.size >= CONFIG.physics.maxLogs) this.cullOldest();
    const w = this.sim.physics.world;
    const rb = w.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, pos.y, pos.z)
        .setLinearDamping(0.12)
        .setAngularDamping(0.5)
        .setCcdEnabled(true),
    );
    if (q) rb.setRotation({ x: q[0], y: q[1], z: q[2], w: q[3] }, true);
    if (vel) rb.setLinvel(vel, true);
    const units = logUnits(len, r);
    const mult = def.props.includes('heavy') ? 2.2 : 1;
    const mass = Math.max(1, units * MASS_PER_UNIT * mult * (MUTATION_BY_ID[mut ?? '']?.valueMult ? 1 : 1));
    const col = w.createCollider(
      RAPIER.ColliderDesc.cylinder(len / 2, r)
        .setMass(mass)
        .setFriction(0.9)
        .setRestitution(0.05)
        .setCollisionGroups(GROUPS.log)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      rb,
    );
    const log: Log = {
      id: this.nextId++,
      body: rb,
      wood,
      len,
      r,
      units,
      mass,
      mut,
      owner,
      age: 0,
      grabbed: false,
      busy: false,
      magnet: false,
    };
    this.logs.set(log.id, log);
    this.byCollider.set(col.handle, log.id);
    this.sim.bus.emit('log:spawn', { logId: log.id, wood });
    return log;
  }

  removeLog(id: number): void {
    const l = this.logs.get(id);
    if (!l) return;
    for (let i = 0; i < l.body.numColliders(); i++) this.byCollider.delete(l.body.collider(i).handle);
    this.sim.physics.world.removeRigidBody(l.body);
    this.logs.delete(id);
  }

  private cullOldest(): void {
    let oldest: Log | null = null;
    for (const l of this.logs.values())
      if (!l.grabbed && !l.busy && (!oldest || l.age > oldest.age)) oldest = l;
    if (oldest) this.removeLog(oldest.id);
  }

  /** Begin felling: tree is already marked felled by the caller. */
  fellTree(
    tree: Tree,
    fromX: number,
    fromZ: number,
    opts: { refine?: boolean; vacuum?: boolean } = {},
  ): void {
    let dx = tree.x - fromX;
    let dz = tree.z - fromZ;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    const f: FallingTree = {
      id: tree.id,
      tree: {
        id: tree.id,
        wood: tree.wood,
        style: tree.style,
        x: tree.x,
        y: tree.y,
        z: tree.z,
        scale: tree.scale,
        yaw: tree.yaw,
        mut: tree.mut,
        height: tree.height,
        radius: tree.radius,
      },
      dx,
      dz,
      angle: 0.03,
      omega: 0.15,
      t: 0,
      done: false,
      refine: !!opts.refine,
      owner: 'player',
      vacuum: !!opts.vacuum,
    };
    this.falling.push(f);
    for (const cb of this.onFallStart) cb(f);
    this.sim.bus.emit('sfx', { name: 'creak', x: tree.x, y: tree.y, z: tree.z });
  }

  private impact(f: FallingTree): void {
    const t = f.tree;
    f.done = true;
    const ax = f.dx * Math.sin(f.angle);
    const ay = Math.cos(f.angle);
    const az = f.dz * Math.sin(f.angle);
    const plan = planLogs(t);
    const terrain = this.sim.streamer.terrain;
    // quaternion rotating +Y to the trunk axis
    const q = quatFromTo(0, 1, 0, ax, ay, az);
    const mutDef = t.mut ? MUTATION_BY_ID[t.mut] : null;
    void mutDef;
    this.sim.bus.emit('fx', {
      kind: 'leaves',
      x: t.x + ax * t.height * 0.6,
      y: t.y + 2,
      z: t.z + az * t.height * 0.6,
      n: 26,
      color: WOOD_BY_ID[t.wood]?.leaf || WOOD_BY_ID[t.wood]?.color,
    });
    this.sim.bus.emit('shake', {
      amount: Math.min(0.9, 0.12 + t.height * 0.025 * (t.scale > 1.4 ? 1.3 : 1)),
    });
    this.sim.bus.emit('sfx', { name: 'thud', x: t.x, y: t.y, z: t.z, vol: Math.min(1, 0.5 + t.scale * 0.3) });
    if (f.refine) {
      let units = 0;
      for (const p of plan) units += logUnits(p.len, p.r);
      this.sim.sawmill?.refineDirect(t.wood, units, t.mut);
      return;
    }
    for (const p of plan) {
      const dist = p.offset + p.len / 2;
      const px = t.x + ax * dist;
      const pz = t.z + az * dist;
      let py = t.y + ay * dist;
      const ground = terrain.surfaceAt(px, pz, t.y + 2);
      py = Math.max(py, ground + p.r + 0.1);
      const speed = f.omega * dist * 0.35;
      // tangential direction in the vertical plane (down + forward)
      const vx = f.dx * Math.cos(f.angle) * speed;
      const vz = f.dz * Math.cos(f.angle) * speed;
      const vy = -Math.sin(f.angle) * speed;
      const log = this.spawnLog(
        t.wood,
        p.len,
        p.r,
        { x: px, y: py, z: pz },
        q,
        { x: vx, y: vy, z: vz },
        t.mut,
        f.owner,
      );
      if (log) {
        log.body.setAngvel(
          { x: rng.range(-0.8, 0.8), y: rng.range(-0.8, 0.8), z: rng.range(-0.8, 0.8) },
          true,
        );
        if (f.vacuum) log.magnet = true;
      }
    }
  }

  update(dt: number): void {
    this.tick++;
    const terrain = this.sim.streamer.terrain;
    // ---- falling trees: inverted-pendulum
    for (const f of this.falling) {
      f.t += dt;
      const L = Math.max(3, f.tree.height * 0.55);
      const alpha = ((3 * 22) / (2 * L)) * Math.sin(f.angle);
      f.omega += alpha * dt * 1.1;
      f.angle += f.omega * dt;
      const tipX = f.tree.x + f.dx * Math.sin(f.angle) * f.tree.height * 0.9;
      const tipZ = f.tree.z + f.dz * Math.sin(f.angle) * f.tree.height * 0.9;
      const tipY = f.tree.y + Math.cos(f.angle) * f.tree.height * 0.9;
      const tipGround = terrain.surfaceAt(tipX, tipZ, f.tree.y + 2);
      if (f.angle >= Math.PI / 2 - 0.12 || (f.angle > 0.4 && tipY <= tipGround + 0.4) || f.t > 6) {
        f.angle = Math.min(f.angle, Math.PI / 2 - 0.05);
        this.impact(f);
      }
    }
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i]!;
      if (f.done) {
        for (const cb of this.onFallEnd) cb(f);
        this.falling.splice(i, 1);
      }
    }
    // ---- per-log upkeep
    const p = this.sim.player;
    for (const l of this.logs.values()) {
      const t = l.body.translation();
      // buoyancy
      const submerge = SEA_LEVEL - (t.y - l.r);
      if (submerge > 0) {
        const def = WOOD_BY_ID[l.wood]!;
        const f = def.props.includes('floats') ? 1.8 : def.props.includes('heavy') ? 0.8 : 1.25;
        const depth = Math.min(1, submerge / (l.r * 2));
        const lv = l.body.linvel();
        l.body.applyImpulse(
          {
            x: -lv.x * 0.04 * l.mass * 0.3,
            y: (22 * f * depth * l.mass - lv.y * l.mass * 2) * dt,
            z: -lv.z * 0.04 * l.mass * 0.3,
          },
          true,
        );
      }
      if (t.y < -80) {
        l.age = 1e9;
      }
      if (l.magnet && !l.grabbed) {
        const dx = p.x - t.x,
          dz = p.z - t.z,
          dy = p.y + 1 - t.y;
        const d = Math.hypot(dx, dy, dz);
        if (d < 3.5 || d > 60) l.magnet = false;
        else {
          const k = Math.min(14, 6 + 80 / d);
          l.body.setLinvel({ x: (dx / d) * k, y: (dy / d) * k + 1.5, z: (dz / d) * k }, true);
        }
      }
      if (this.tick % 60 === 0) {
        const d = Math.hypot(t.x - p.x, t.z - p.z);
        if (d > 25 && !l.grabbed) l.age += 1;
        if (d > 35 && d < CONFIG.physics.sleepDistance && !l.grabbed) {
          // keep awake only if moving; Rapier sleeps automatically
        }
        if (l.age > CONFIG.physics.logDespawnSec || t.y < -80) {
          if (!this.sim.plots.insideOwnedPlot(t.x, t.z)) {
            this.removeLog(l.id);
            continue;
          }
          l.age = 0;
        } else if (l.age === CONFIG.physics.logDespawnSec - CONFIG.physics.logWarnSec && d < 200) {
          this.sim.bus.emit('notify', {
            text: 'A log is about to despawn — move it to a plot or sell it',
            kind: 'info',
          });
        }
      }
    }
  }

  dispose(): void {
    for (const id of [...this.logs.keys()]) this.removeLog(id);
  }
}

/** Quaternion rotating unit vector (ax,ay,az) onto (bx,by,bz). */
export function quatFromTo(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
): [number, number, number, number] {
  const dot = ax * bx + ay * by + az * bz;
  if (dot > 0.99999) return [0, 0, 0, 1];
  if (dot < -0.99999) return [1, 0, 0, 0];
  const cx = ay * bz - az * by;
  const cy = az * bx - ax * bz;
  const cz = ax * by - ay * bx;
  const w = 1 + dot;
  const l = Math.hypot(cx, cy, cz, w);
  return [cx / l, cy / l, cz / l, w / l];
}
