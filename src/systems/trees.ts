import { CONFIG } from '../config';
import type { Sim, System } from '../core/sim';
import { GROUPS, RAPIER } from '../physics/world';
import { isNight } from '../core/gameTime';
import { WOOD_BY_ID } from '../data/woods';
import type { Chunk, Streamer } from './streaming';
import type { Tree } from '../world/trees';

export type TreeChange = 'add' | 'remove' | 'fell' | 'respawn' | 'night' | 'day' | 'hit';

const CELL = 16;
const gkey = (ix: number, iz: number) => ix * 100003 + iz;

/** Owns tree state (HP, hidden/respawn), spatial lookup, and trunk colliders near actors. */
export class TreeSystem implements System {
  readonly name = 'trees';
  readonly trees = new Map<string, Tree>();
  private grid = new Map<number, Tree[]>();
  private respawning = new Set<string>();
  private lastHit = new Map<string, number>();
  private colliders = new Map<string, RAPIER.RigidBody>();
  listeners: ((t: Tree, kind: TreeChange) => void)[] = [];
  private tick = 0;
  /** extra respawn-speed multiplier from the equipped axe etc. (set by chopping system when a tree is felled) */
  constructor(
    private sim: Sim,
    private streamer: Streamer,
  ) {}

  init(): void {
    this.streamer.onLoad.push((c) => this.addChunk(c));
    this.streamer.onUnload.push((c) => this.removeChunk(c));
    for (const c of this.streamer.loaded.values()) this.addChunk(c);
  }

  private emit(t: Tree, k: TreeChange): void {
    for (const l of this.listeners) l(t, k);
  }

  private gridAdd(t: Tree): void {
    const k = gkey(Math.floor(t.x / CELL), Math.floor(t.z / CELL));
    let a = this.grid.get(k);
    if (!a) this.grid.set(k, (a = []));
    a.push(t);
  }
  private gridRemove(t: Tree): void {
    const k = gkey(Math.floor(t.x / CELL), Math.floor(t.z / CELL));
    const a = this.grid.get(k);
    if (!a) return;
    const i = a.indexOf(t);
    if (i >= 0) a.splice(i, 1);
    if (!a.length) this.grid.delete(k);
  }

  private isGone(t: Tree): boolean {
    return t.hidden || (t.nightOnly && !isNight(this.sim.state.time));
  }

  private addChunk(c: Chunk): void {
    const chopped = this.sim.state.world.chopped;
    for (const t of c.trees) {
      this.trees.set(t.id, t);
      const until = chopped[t.id];
      if (until !== undefined && until > this.sim.state.time) {
        t.hidden = true;
        this.respawning.add(t.id);
      } else {
        t.hidden = false;
        if (until !== undefined) delete chopped[t.id];
      }
      if (!this.isGone(t)) this.gridAdd(t);
      this.emit(t, 'add');
    }
  }
  private removeChunk(c: Chunk): void {
    for (const t of c.trees) {
      this.emit(t, 'remove');
      if (!this.isGone(t)) this.gridRemove(t);
      this.trees.delete(t.id);
      this.respawning.delete(t.id);
      this.dropCollider(t.id);
    }
  }

  /** Trees within `r` of (x,z) that are standing. */
  near(x: number, z: number, r: number, out: Tree[] = []): Tree[] {
    const r2 = r * r;
    const x0 = Math.floor((x - r) / CELL),
      x1 = Math.floor((x + r) / CELL);
    const z0 = Math.floor((z - r) / CELL),
      z1 = Math.floor((z + r) / CELL);
    for (let ix = x0; ix <= x1; ix++)
      for (let iz = z0; iz <= z1; iz++) {
        const a = this.grid.get(gkey(ix, iz));
        if (!a) continue;
        for (const t of a) {
          const dx = t.x - x,
            dz = t.z - z;
          if (dx * dx + dz * dz <= r2) out.push(t);
        }
      }
    return out;
  }

  /** Damage a tree. Returns true if it died. */
  hit(t: Tree, dmg: number): boolean {
    t.hp -= dmg;
    this.lastHit.set(t.id, this.sim.state.time);
    this.emit(t, 'hit');
    return t.hp <= 0;
  }

  /** Mark a tree felled (removes it from the world until it respawns). */
  markFelled(t: Tree, respawnMult = 1): void {
    if (t.hidden) return;
    t.hidden = true;
    this.gridRemove(t);
    this.dropCollider(t.id);
    const w = WOOD_BY_ID[t.wood]!;
    const sec = w.respawnSec * respawnMult * (t.mut === 'giant' ? 1.5 : 1);
    this.sim.state.world.chopped[t.id] = this.sim.state.time + sec / CONFIG.dayLengthSec;
    this.respawning.add(t.id);
    this.emit(t, 'fell');
  }

  revive(t: Tree): void {
    t.hidden = false;
    t.hp = t.maxHp;
    delete this.sim.state.world.chopped[t.id];
    this.respawning.delete(t.id);
    if (!this.isGone(t)) this.gridAdd(t);
    this.emit(t, 'respawn');
  }

  update(): void {
    this.tick++;
    const st = this.sim.state;
    if (this.tick % 30 === 0) {
      for (const id of [...this.respawning]) {
        const t = this.trees.get(id);
        if (!t) {
          this.respawning.delete(id);
          continue;
        }
        const until = st.world.chopped[id];
        if (until === undefined || until <= st.time) this.revive(t);
      }
      // regen unhit trees
      for (const [id, at] of this.lastHit) {
        if (st.time - at > 25 / CONFIG.dayLengthSec) {
          const t = this.trees.get(id);
          if (t) t.hp = t.maxHp;
          this.lastHit.delete(id);
        }
      }
    }
    if (this.tick % 120 === 0) {
      const night = isNight(st.time);
      for (const t of this.trees.values()) {
        if (!t.nightOnly || t.hidden) continue;
        const inGrid = (this.grid.get(gkey(Math.floor(t.x / CELL), Math.floor(t.z / CELL))) ?? []).includes(
          t,
        );
        if (night && !inGrid) {
          this.gridAdd(t);
          this.emit(t, 'night');
        } else if (!night && inGrid) {
          this.gridRemove(t);
          this.dropCollider(t.id);
          this.emit(t, 'day');
        }
      }
    }
    if (this.tick % 12 === 0) this.updateColliders();
  }

  // ---- trunk colliders near actors ----
  private updateColliders(): void {
    const actors = this.sim.actorPositions();
    const want = new Set<string>();
    const buf: Tree[] = [];
    for (const a of actors) {
      buf.length = 0;
      this.near(a.x, a.z, a.r, buf);
      for (const t of buf) want.add(t.id);
    }
    for (const id of want) {
      if (this.colliders.has(id)) continue;
      const t = this.trees.get(id);
      if (!t || this.isGone(t)) continue;
      const w = this.sim.physics.world;
      const body = w.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(t.x, t.y + 3, t.z));
      w.createCollider(
        RAPIER.ColliderDesc.cylinder(3, Math.max(0.3, t.radius * 0.85)).setCollisionGroups(GROUPS.stump),
        body,
      );
      this.colliders.set(id, body);
    }
    for (const [id] of this.colliders) if (!want.has(id)) this.dropCollider(id);
  }
  private dropCollider(id: string): void {
    const b = this.colliders.get(id);
    if (b) {
      this.sim.physics.world.removeRigidBody(b);
      this.colliders.delete(id);
    }
  }

  /** Register a tree that was injected into an already-loaded chunk. */
  addLoose(t: Tree): void {
    this.trees.set(t.id, t);
    if (!this.isGone(t)) this.gridAdd(t);
    this.emit(t, 'add');
  }

  isStanding(t: Tree): boolean {
    return !this.isGone(t);
  }

  dispose(): void {
    for (const id of [...this.colliders.keys()]) this.dropCollider(id);
  }
}
