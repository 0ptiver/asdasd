import { CONFIG } from '../config';
import type { Sim, System } from '../core/sim';
import { RAPIER } from '../physics/world';
import { SEA_LEVEL } from '../world/terrain';
import { HUB } from '../world/layout';
import type { Streamer } from './streaming';
import { ITEM_BY_ID } from '../data/items';

const P = CONFIG.player;
const HALF = (P.height - 2 * P.radius) / 2;

export type PlayerMode = 'foot' | 'vehicle';

export class PlayerSystem implements System {
  readonly name = 'player';
  x = 0;
  y = 0; // feet
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  yaw = 0; // facing
  camYaw = 0;
  camPitch = 0.28;
  camDist = 6.5;
  grounded = false;
  swimming = false;
  sprinting = false;
  mode: PlayerMode = 'foot';
  moveSpeed = 0; // horizontal speed, for animation
  swing = 0; // 0..1 swing animation phase (set by chopping)
  fallDamageArmed = 0;
  /** gameplay-input lock (ui open, in vehicle etc.) */
  locked = false;
  private body!: RAPIER.RigidBody;
  private collider!: RAPIER.Collider;
  private cc!: RAPIER.KinematicCharacterController;
  private breath = 25;
  extraSpeed = 1; // multiplier hooks (hazards, buffs)
  buffs: Record<string, number> = {};

  constructor(private sim: Sim, private streamer: Streamer) {}

  get pos() {
    return { x: this.x, y: this.y, z: this.z };
  }

  init(): void {
    const s = this.sim.state.player;
    this.x = s.x;
    this.z = s.z;
    this.yaw = s.yaw;
    this.camYaw = s.yaw + Math.PI;
    this.streamer.preload(this.x, this.z, 2);
    const g = this.streamer.terrain.surfaceAt(this.x, this.z, s.y);
    this.y = Math.max(s.y, g + 0.2);
    const w = this.sim.physics.world;
    this.body = w.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(this.x, this.y + P.height / 2, this.z));
    this.collider = w.createCollider(
      RAPIER.ColliderDesc.capsule(HALF, P.radius).setCollisionGroups((G_PLAYER << 16) | PLAYER_FILTER),
      this.body,
    );
    this.cc = w.createCharacterController(0.02);
    this.cc.setUp({ x: 0, y: 1, z: 0 });
    this.cc.enableAutostep(0.45, 0.2, true);
    this.cc.enableSnapToGround(0.4);
    this.cc.setMaxSlopeClimbAngle((58 * Math.PI) / 180);
    this.cc.setMinSlopeSlideAngle((62 * Math.PI) / 180);
    this.cc.setSlideEnabled(true);
  }

  teleport(x: number, z: number, y?: number): void {
    this.streamer.preload(x, z, 2);
    this.x = x;
    this.z = z;
    this.y = (y ?? this.streamer.terrain.heightAt(x, z)) + 0.3;
    this.vx = this.vy = this.vz = 0;
    this.body.setTranslation({ x, y: this.y + P.height / 2, z }, true);
  }

  respawn(): void {
    const st = this.sim.state;
    st.player.hp = 100;
    this.teleport(HUB.spawn[0], HUB.spawn[1]);
    const loss = Math.floor(st.money * 0.05);
    if (loss > 0) this.sim.econ?.spend(loss, 'respawn');
    this.sim.bus.emit('notify', { text: `You passed out and woke up in town (-$${loss})`, kind: 'bad' });
  }

  /** Camera ray (matches the View's camera placement, minus smoothing/collision). */
  cameraRay(): { ox: number; oy: number; oz: number; dx: number; dy: number; dz: number } {
    const cp = Math.cos(this.camPitch);
    const sp = Math.sin(this.camPitch);
    const fx = -Math.sin(this.camYaw) * cp;
    const fy = -sp;
    const fz = -Math.cos(this.camYaw) * cp;
    const hx = this.x, hy = this.y + 1.7, hz = this.z;
    const ox = hx - fx * this.camDist + Math.cos(this.camYaw) * 0.5;
    const oy = hy - fy * this.camDist + 0.3;
    const oz = hz - fz * this.camDist - Math.sin(this.camYaw) * 0.5;
    // aim at a point far along the look direction from the head so the ray passes through the crosshair target
    const tx = hx + Math.cos(this.camYaw) * 0.5 + fx * 40, ty = hy - 0.1 + fy * 40, tz = hz - Math.sin(this.camYaw) * 0.5 + fz * 40;
    const dx = tx - ox, dy = ty - oy, dz = tz - oz;
    const l = Math.hypot(dx, dy, dz);
    return { ox, oy, oz, dx: dx / l, dy: dy / l, dz: dz / l };
  }

  grabReach(): number {
    let r = CONFIG.player.grabReach;
    if (this.sim.inventory?.equipped()?.def === 'gale_axe') r += 2;
    return r;
  }

  /** Strength stat = how heavy a log you can drag. */
  strength(): number {
    const st = this.sim.state;
    let s: number = CONFIG.player.baseStrength + Math.sqrt(st.skills.strength) * 1.2;
    const gl = st.gear.gloves ? ITEM_BY_ID[st.gear.gloves]?.buff?.strength ?? 0 : 0;
    s += gl + (this.buffs.strength ?? 0);
    if (st.activePet === 'pet_ox') s += 10;
    s *= 1 + st.prestige.level * 0.05;
    return s;
  }

  speedMultiplier(): number {
    const st = this.sim.state;
    let m = this.extraSpeed;
    const boots = st.gear.boots ? ITEM_BY_ID[st.gear.boots]?.buff?.speed ?? 0 : 0;
    m *= 1 + boots;
    return m;
  }

  update(dt: number): void {
    const inp = this.sim.game.input;
    const st = this.sim.state;
    for (const k of Object.keys(this.buffs)) {
      if (k.endsWith('_t')) continue;
    }
    if (this.mode === 'vehicle') {
      this.syncState();
      this.streamer.focus = { x: this.x, z: this.z };
      return;
    }
    const lock = this.locked || inp.uiOpen;
    // camera
    if (!lock) {
      const sens = 0.0022 * this.sim.game.settings.sensitivity;
      this.camYaw -= inp.lookDX * sens;
      this.camPitch += inp.lookDY * sens * (this.sim.game.settings.invertY ? -1 : 1);
      this.camPitch = Math.max(-0.5, Math.min(1.25, this.camPitch));
      this.camDist = Math.max(2.5, Math.min(14, this.camDist + inp.wheel * 0.8));
    }
    let mx = lock ? 0 : inp.moveX;
    let mz = lock ? 0 : inp.moveY;
    const wantSprint = !lock && inp.held('sprint') && (mx !== 0 || mz !== 0) && st.player.stamina > 1;
    this.sprinting = wantSprint;
    const biomeHere = this.streamer.terrain.biomeAt(this.x, this.z);
    let speed = (wantSprint ? P.sprintSpeed : P.walkSpeed) * this.speedMultiplier();
    if (biomeHere.hazards.includes('slow') && !this.swimming) speed *= 0.72;
    if (this.swimming) speed *= 0.55;
    if (this.carryingSlow > 0) speed *= 1 - this.carryingSlow;

    // movement relative to camera yaw
    const sin = Math.sin(this.camYaw);
    const cos = Math.cos(this.camYaw);
    const len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }
    const dirX = -sin * mz + cos * mx;
    const dirZ = -cos * mz - sin * mx;
    const accel = this.grounded || this.swimming ? 14 : 4;
    this.vx += (dirX * speed - this.vx) * Math.min(1, accel * dt);
    this.vz += (dirZ * speed - this.vz) * Math.min(1, accel * dt);
    this.moveSpeed = Math.hypot(this.vx, this.vz);
    if (len > 0.1 && !this.facingLocked) {
      const target = Math.atan2(dirX, dirZ);
      let d = target - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, 14 * dt);
    }

    // stamina
    if (wantSprint) st.player.stamina = Math.max(0, st.player.stamina - P.sprintCost * dt);
    else st.player.stamina = Math.min(P.maxStamina, st.player.stamina + P.staminaRegen * dt);

    // water state
    const ground = this.streamer.terrain.surfaceAt(this.x, this.z, this.y);
    const depth = SEA_LEVEL - ground;
    const wasSwim = this.swimming;
    this.swimming = depth > 1.3 && this.y < SEA_LEVEL - 0.2;
    if (this.swimming) {
      const hasMask = st.gear.head === 'scuba_mask';
      this.breath -= hasMask ? 0 : dt * (this.y + 1.5 < SEA_LEVEL ? 1 : -3);
      this.breath = Math.min(25, this.breath);
      if (this.breath <= 0) st.player.hp -= 6 * dt;
      const target = SEA_LEVEL - 1.15;
      this.vy += (target - this.y) * 5 * dt;
      this.vy *= 1 - Math.min(1, 3 * dt);
      if (!lock && inp.held('jump')) this.vy = 3.5;
    } else {
      this.breath = 25;
      this.vy -= P.gravity * dt;
      const jumpHeld = !lock && (inp.pressed('jump') || inp.held('jump'));
      if (this.grounded && jumpHeld) {
        const jb = st.gear.boots ? ITEM_BY_ID[st.gear.boots]?.buff?.jump ?? 0 : 0;
        this.vy = P.jumpSpeed * (1 + jb);
        this.grounded = false;
      }
      // jetpack
      if (!lock && inp.held('jump') && !this.grounded && st.gear.backpack === 'jetpack' && st.player.fuel > 0) {
        this.vy = Math.min(this.vy + 40 * dt, 9);
        st.player.fuel -= 12 * dt;
      }
    }
    if (wasSwim && !this.swimming && this.grounded) this.vy = 0;

    const desired = { x: this.vx * dt, y: this.vy * dt, z: this.vz * dt };
    this.cc.computeColliderMovement(this.collider, desired, undefined, undefined, undefined);
    const mv = this.cc.computedMovement();
    const wasGrounded = this.grounded;
    this.grounded = this.cc.computedGrounded();
    if (this.grounded && this.vy < 0) {
      if (!wasGrounded && this.vy < -20) {
        const dmg = (-this.vy - 20) * 3;
        st.player.hp -= dmg;
        this.sim.bus.emit('shake', { amount: Math.min(1, dmg / 30) });
      } else if (!wasGrounded && this.vy < -9) this.sim.bus.emit('sfx', { name: 'land', vol: 0.4 });
      this.vy = 0;
    }
    if (mv.y > desired.y + 0.001 && this.vy > 0 && Math.abs(mv.y) < Math.abs(desired.y) * 0.5) this.vy = 0; // bonk head
    this.x += mv.x;
    this.y += mv.y;
    this.z += mv.z;
    // safety: never fall under the terrain (collider not ready yet)
    const g = this.streamer.terrain.surfaceAt(this.x, this.z, this.y + 1);
    if (this.y < g - 1.5) {
      this.y = g + 0.3;
      this.vy = 0;
    }
    if (this.y < -60) {
      st.player.hp = 0;
    }
    this.body.setNextKinematicTranslation({ x: this.x, y: this.y + P.height / 2, z: this.z });

    // world bounds
    const b = CONFIG.worldSize / 2 - 4;
    this.x = Math.max(-b, Math.min(b, this.x));
    this.z = Math.max(-b, Math.min(b, this.z));

    if (st.player.hp <= 0) this.respawn();
    else st.player.hp = Math.min(100, st.player.hp + dt * 0.6);
    this.syncState();
    this.streamer.focus = { x: this.x, z: this.z };
  }

  carryingSlow = 0;
  facingLocked = false;

  private syncState(): void {
    const s = this.sim.state.player;
    s.x = this.x;
    s.y = this.y;
    s.z = this.z;
    s.yaw = this.yaw;
  }

  dispose(): void {
    this.sim.physics.world.removeCharacterController(this.cc);
  }
}

const G_PLAYER = 4;
const PLAYER_FILTER = 1 | 16 | 32 | 8; // ground | build | stump | vehicle
