import type { Sim, System } from '../core/sim';
import { G, GROUPS, RAPIER } from '../physics/world';
import type { Built } from './building';
import { PART_BY_ID } from '../data/parts';

const rot = (x: number, z: number, yaw: number): [number, number] => [
  x * Math.cos(yaw) + z * Math.sin(yaw),
  -x * Math.sin(yaw) + z * Math.cos(yaw),
];

/**
 * Plot logic: switches, timers and sensors power lamps, doors, pistons, conveyors and screens through wires; AND / NOT gates
 * combine signals. Each tick evaluates a few relaxation passes (so chains settle) and actuates outputs.
 */
export class LogicSystem implements System {
  readonly name = 'logic';
  /** part id -> computed power */
  power = new Map<number, boolean>();
  private pistonExt = new Map<number, number>();
  private pistonBody = new Map<number, RAPIER.RigidBody>();
  private clock = 0;
  private tick = 0;
  /** parts that have at least one incoming wire */
  private wired = new Set<number>();
  constructor(private sim: Sim) {}

  private byUid(plot: string): Map<number, Built> {
    const m = new Map<number, Built>();
    for (const b of this.sim.building.built.values())
      if (b.plot === plot && b.p[10] !== undefined) m.set(b.p[10] as number, b);
    return m;
  }

  private logicPlots = new Set<string>();

  update(dt: number): void {
    this.tick++;
    this.clock += dt;
    if (this.tick % 60 === 1) {
      this.logicPlots.clear();
      for (const [id, st] of Object.entries(this.sim.state.plots)) {
        if (st.wires?.length || st.parts.some((p) => p[0] === 'piston' || p[0] === 'conveyor' || p[0] === 'timer' || p[0] === 'sensor')) this.logicPlots.add(id);
      }
    }
    const sim = this.sim;
    const pl = sim.player;
    for (const [plotId, st] of Object.entries(sim.state.plots)) {
      if (!this.logicPlots.has(plotId)) continue;
      const wires = st.wires ?? [];
      const parts = this.byUid(plotId);
      if (!parts.size) continue;
      // only simulate plots near the player
      const any = parts.values().next().value as Built;
      if (Math.hypot(any.p[1] - pl.x, any.p[3] - pl.z) > 140) continue;
      const incoming = new Map<number, number[]>();
      for (const [a, b] of wires) (incoming.get(b) ?? incoming.set(b, []).get(b)!).push(a);
      // sources
      const out = new Map<number, boolean>();
      for (const [uid, b] of parts) {
        const k = b.p[0];
        if (k === 'switch') out.set(uid, b.power);
        else if (k === 'timer') out.set(uid, Math.floor(this.clock / 2 + uid * 0.37) % 2 === 0);
        else if (k === 'sensor') out.set(uid, this.sensed(b));
      }
      // relax gates + outputs
      for (let pass = 0; pass < 4; pass++) {
        for (const [uid, b] of parts) {
          const k = b.p[0];
          if (k === 'switch' || k === 'timer' || k === 'sensor') continue;
          const ins = (incoming.get(uid) ?? []).map((u) => out.get(u) ?? false);
          let v: boolean;
          if (k === 'gate_and') v = ins.length >= 2 && ins.every(Boolean);
          else if (k === 'gate_not') v = ins.length > 0 ? !ins.some(Boolean) : true;
          else v = ins.some(Boolean);
          out.set(uid, v);
          if (ins.length) this.wired.add(uid);
        }
      }
      for (const [uid, b] of parts) {
        const on = out.get(uid) ?? false;
        const was = this.power.get(b.id);
        this.power.set(b.id, on);
        if (was !== on) b.power = on && PART_BY_ID[b.p[0]]?.id !== 'switch' ? on : b.power;
        this.actuate(b, on, (incoming.get(uid)?.length ?? 0) > 0, dt);
      }
    }
  }

  private sensed(b: Built): boolean {
    const pl = this.sim.player;
    const [lx, lz] = rot(0, 2.2, b.p[4]);
    const cx = b.p[1] + lx,
      cz = b.p[3] + lz;
    if (Math.hypot(pl.x - cx, pl.z - cz) < 3.2 && Math.abs(pl.y - b.p[2]) < 3) return true;
    for (const l of this.sim.logs.logs.values()) {
      const t = l.body.translation();
      if (Math.hypot(t.x - cx, t.z - cz) < 3 && Math.abs(t.y - b.p[2]) < 3) return true;
    }
    return false;
  }

  private actuate(b: Built, on: boolean, wired: boolean, dt: number): void {
    const sim = this.sim;
    switch (b.p[0]) {
      case 'door':
      case 'gate':
        if (wired && b.open !== on) sim.building.use(b.id);
        break;
      case 'piston': {
        let ext = this.pistonExt.get(b.id) ?? 0;
        ext += ((on ? 1 : 0) - ext) * Math.min(1, dt * 6);
        this.pistonExt.set(b.id, ext);
        this.movePiston(b, ext);
        break;
      }
      case 'conveyor':
        if (!wired || on) this.runConveyor(b, dt);
        break;
    }
  }

  extension(b: Built): number {
    return this.pistonExt.get(b.id) ?? 0;
  }

  private movePiston(b: Built, ext: number): void {
    let body = this.pistonBody.get(b.id);
    const [x, y, z, yaw] = [b.p[1], b.p[2], b.p[3], b.p[4]];
    const [dx, dz] = rot(0, 0.8 + ext * 1.4, yaw);
    if (!body) {
      const w = this.sim.physics.world;
      body = w.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased()
          .setTranslation(x + dx, y + 0.3, z + dz)
          .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }),
      );
      w.createCollider(RAPIER.ColliderDesc.cuboid(0.3, 0.3, 0.45).setCollisionGroups(GROUPS.build), body);
      this.pistonBody.set(b.id, body);
    }
    body.setNextKinematicTranslation({ x: x + dx, y: y + 0.3, z: z + dz });
  }

  private runConveyor(b: Built, dt: number): void {
    const [, x, y, z, yaw, sx, sy, sz] = b.p;
    const d = PART_BY_ID.conveyor!;
    const hx = (d.size[0] * sx) / 2,
      hz = (d.size[2] * sz) / 2,
      top = y + d.size[1] * sy;
    const pl = this.sim.player;
    const check = (px: number, py: number, pz: number) => {
      const [lx, lz] = rot(px - x, pz - z, -yaw);
      return Math.abs(lx) < hx && Math.abs(lz) < hz && py > top - 0.2 && py < top + 1.8;
    };
    const [fx, fz] = rot(0, 1, yaw);
    for (const l of this.sim.logs.logs.values()) {
      if (l.busy || l.grabbed) continue;
      const t = l.body.translation();
      if (check(t.x, t.y - l.r, t.z)) {
        const v = l.body.linvel();
        l.body.setLinvel({ x: fx * 2.5, y: v.y, z: fz * 2.5 }, true);
      }
    }
    if (this.sim.player.mode === 'foot' && check(pl.x, pl.y, pl.z)) {
      pl.x += fx * 2.5 * dt;
      pl.z += fz * 2.5 * dt;
    }
  }

  isWired(b: Built): boolean {
    return this.wired.has(b.p[10] as number);
  }

  dispose(): void {
    for (const body of this.pistonBody.values()) this.sim.physics.world.removeRigidBody(body);
  }
}
void G;
