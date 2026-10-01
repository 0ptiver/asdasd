import type { Sim, System } from '../core/sim';
import { GROUPS, RAPIER } from '../physics/world';
import { buildHub, type HubLayout, type InteractPoint } from '../world/hub';
import { NPCS } from '../data/npcs';
import type { NpcDef } from '../data/types';
import { HUB } from '../world/layout';
import type { Streamer } from './streaming';

export interface Interactable extends InteractPoint {
  npc?: NpcDef;
  y: number;
}

/** Static hub colliders + the list of things the player can interact with. */
export class HubSystem implements System {
  readonly name = 'hub';
  layout!: HubLayout;
  interactables: Interactable[] = [];
  nearest: Interactable | null = null;
  /** dynamic interactables (built parts) */
  extra: Interactable[] = [];
  private bodies: RAPIER.RigidBody[] = [];

  constructor(
    private sim: Sim,
    private streamer: Streamer,
  ) {}

  init(): void {
    const t = this.streamer.terrain;
    this.layout = buildHub(t);
    const w = this.sim.physics.world;
    for (const b of this.layout.boxes) {
      const body = w.createRigidBody(
        RAPIER.RigidBodyDesc.fixed()
          .setTranslation(b.x, b.y, b.z)
          .setRotation({ x: 0, y: Math.sin(b.ry / 2), z: 0, w: Math.cos(b.ry / 2) }),
      );
      w.createCollider(RAPIER.ColliderDesc.cuboid(b.hx, b.hy, b.hz).setCollisionGroups(GROUPS.build), body);
      this.bodies.push(body);
    }
    for (const p of this.layout.points) this.interactables.push({ ...p, y: t.heightAt(p.x, p.z) });
    for (const n of NPCS) {
      this.interactables.push({
        id: 'npc:' + n.id,
        label: `Talk to ${n.name}`,
        x: n.pos[0],
        z: n.pos[1],
        radius: 3.4,
        kind: 'npc',
        arg: n.id,
        npc: n,
        y: t.heightAt(n.pos[0], n.pos[1]),
      });
    }
    this.interactables.push({
      id: 'questboard',
      label: 'Quest & job board',
      x: HUB.questBoard[0],
      z: HUB.questBoard[1] + 2.5,
      radius: 4,
      kind: 'board',
      y: 4,
    });
    this.interactables.push({
      id: 'garage',
      label: 'Garage',
      x: HUB.garage[0],
      z: HUB.garage[1] + 8,
      radius: 6,
      kind: 'garage',
      y: 4,
    });
    this.interactables.push({
      id: 'forge',
      label: 'Forge',
      x: HUB.smithy[0] - 9,
      z: HUB.smithy[1] + 3,
      radius: 4,
      kind: 'forge',
      y: 4,
    });
  }

  update(): void {
    const p = this.sim.player;
    let best: Interactable | null = null;
    let bd = Infinity;
    for (const it of [...this.interactables, ...this.extra]) {
      const d = Math.hypot(it.x - p.x, it.z - p.z);
      if (d < it.radius && d < bd) {
        bd = d;
        best = it;
      }
    }
    this.nearest = best;
  }

  dispose(): void {
    for (const b of this.bodies) this.sim.physics.world.removeRigidBody(b);
  }
}
