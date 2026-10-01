import type { Sim, System } from '../core/sim';
import { G, grp, RAPIER } from '../physics/world';
import { levelOf } from '../core/skills';
import type { Log } from './logs';

const LOG_QUERY = grp(G.LOG, G.LOG);

/** Mouse-ray grab: pick a log under the crosshair, hold it with a velocity spring, throw with right-click. */
export class GrabSystem implements System {
  readonly name = 'grab';
  active = false;
  held: Log | null = null;
  private dist = 5;
  private localAnchor = { x: 0, y: 0, z: 0 };
  private pressedLast = false;
  hint = '';

  constructor(private sim: Sim) {}

  /** Ray from the camera through the screen aim point. */
  cameraRay(): { ox: number; oy: number; oz: number; dx: number; dy: number; dz: number } {
    return this.sim.player.cameraRay();
  }

  private tryGrab(): void {
    const sim = this.sim;
    const pl = sim.player;
    const r = this.cameraRay();
    const ray = new RAPIER.Ray({ x: r.ox, y: r.oy, z: r.oz }, { x: r.dx, y: r.dy, z: r.dz });
    const hit = sim.physics.world.castRay(ray, 60, true, undefined, LOG_QUERY);
    if (!hit) return;
    const log = sim.logs.logFromCollider(hit.collider.handle);
    if (!log || log.busy) return;
    const px = r.ox + r.dx * hit.timeOfImpact;
    const py = r.oy + r.dy * hit.timeOfImpact;
    const pz = r.oz + r.dz * hit.timeOfImpact;
    const reach = this.reach();
    if (Math.hypot(px - pl.x, pz - pl.z) > reach + 2) {
      this.hint = 'Too far to grab';
      return;
    }
    const limit = pl.strength();
    if (log.mass > limit) {
      sim.bus.emit('notify', { text: `Too heavy! Needs strength ${Math.ceil(log.mass)} (you have ${Math.floor(limit)})`, kind: 'bad' });
      return;
    }
    const t = log.body.translation();
    const q = log.body.rotation();
    // anchor in log local space
    const inv = new RAPIER.Quaternion(-q.x, -q.y, -q.z, q.w);
    const v = rotate({ x: px - t.x, y: py - t.y, z: pz - t.z }, inv);
    this.localAnchor = v;
    this.dist = hit.timeOfImpact;
    this.held = log;
    log.grabbed = true;
    this.active = true;
    log.body.wakeUp();
  }

  reach(): number {
    return this.sim.player.grabReach();
  }

  release(throwIt = false): void {
    const l = this.held;
    if (l) {
      l.grabbed = false;
      if (throwIt) {
        const r = this.cameraRay();
        const k = 14 / Math.sqrt(Math.max(1, l.mass / 6));
        l.body.setLinvel({ x: r.dx * k, y: r.dy * k + 3, z: r.dz * k }, true);
      }
    }
    this.held = null;
    this.active = false;
  }

  update(dt: number): void {
    const sim = this.sim;
    const inp = sim.game.input;
    const pl = sim.player;
    const locked = pl.locked || inp.uiOpen || pl.mode !== 'foot';
    this.hint = '';
    if (locked) {
      if (this.active) this.release();
      return;
    }
    const down = inp.primary;
    if (down && !this.pressedLast && !this.active) {
      // prefer grabbing a log if one is under the crosshair; otherwise the chopper takes the click
      this.tryGrab();
    }
    if (!down && this.active) this.release();
    this.pressedLast = down;
    if (!this.active || !this.held) return;
    const l = this.held;
    if (!sim.logs.logs.has(l.id)) {
      this.release();
      return;
    }
    if (inp.secondary) {
      this.release(true);
      return;
    }
    this.dist = Math.max(2.5, Math.min(this.reach(), this.dist - inp.wheel * 0.6));
    const r = this.cameraRay();
    let tx = r.ox + r.dx * (this.dist + 3);
    let ty = r.oy + r.dy * (this.dist + 3);
    let tz = r.oz + r.dz * (this.dist + 3);
    // keep within reach of the player
    const hx = tx - pl.x, hz = tz - pl.z;
    const hd = Math.hypot(hx, hz);
    const reach = this.reach();
    if (hd > reach) {
      tx = pl.x + (hx / hd) * reach;
      tz = pl.z + (hz / hd) * reach;
    }
    const ground = sim.streamer.terrain.surfaceAt(tx, tz, pl.y + 2);
    ty = Math.max(ty, ground + l.r + 0.2);
    const t = l.body.translation();
    const q = l.body.rotation();
    const a = rotate(this.localAnchor, q);
    const ax = t.x + a.x, ay = t.y + a.y, az = t.z + a.z;
    const ex = tx - ax, ey = ty - ay, ez = tz - az;
    const heavy = Math.min(1, pl.strength() / (l.mass * 1.6));
    const gain = 10 * (0.35 + 0.65 * heavy);
    const maxV = 22 * (0.4 + 0.6 * heavy);
    let vx = ex * gain, vy = ey * gain, vz = ez * gain;
    const sp = Math.hypot(vx, vy, vz);
    if (sp > maxV) {
      vx *= maxV / sp;
      vy *= maxV / sp;
      vz *= maxV / sp;
    }
    l.body.setLinvel({ x: vx, y: vy, z: vz }, true);
    const av = l.body.angvel();
    l.body.setAngvel({ x: av.x * 0.85, y: av.y * 0.85, z: av.z * 0.85 }, true);
    l.body.wakeUp();
    l.age = 0;
    pl.carryingSlow = Math.min(0.45, l.mass / (pl.strength() * 2.4));
    // lose grip if too far
    if (Math.hypot(t.x - pl.x, t.z - pl.z) > reach + 6) this.release();
    void dt;
  }

  postUpdate(): void {
    if (!this.active) this.sim.player.carryingSlow = 0;
  }
}

function rotate(v: { x: number; y: number; z: number }, q: { x: number; y: number; z: number; w: number }): { x: number; y: number; z: number } {
  const ix = q.w * v.x + q.y * v.z - q.z * v.y;
  const iy = q.w * v.y + q.z * v.x - q.x * v.z;
  const iz = q.w * v.z + q.x * v.y - q.y * v.x;
  const iw = -q.x * v.x - q.y * v.y - q.z * v.z;
  return {
    x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
    y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
    z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x,
  };
}
void levelOf;
