import RAPIER from '@dimforge/rapier3d-compat';

export { RAPIER };

let ready = false;
export async function initPhysics(): Promise<void> {
  if (ready) return;
  await RAPIER.init();
  ready = true;
}

/** Collision membership bits. */
export const G = {
  GROUND: 1,
  LOG: 2,
  PLAYER: 4,
  VEHICLE: 8,
  BUILD: 16,
  STUMP: 32,
  TRIGGER: 64,
  PROP: 128,
} as const;
/** Rapier interaction groups: high 16 bits = membership, low 16 = filter. */
export const grp = (member: number, filter: number): number => ((member & 0xffff) << 16) | (filter & 0xffff);
export const GROUPS = {
  ground: grp(G.GROUND, G.LOG | G.PLAYER | G.VEHICLE | G.BUILD | G.STUMP | G.PROP),
  log: grp(G.LOG, G.GROUND | G.LOG | G.VEHICLE | G.BUILD | G.STUMP | G.PROP),
  vehicle: grp(G.VEHICLE, G.GROUND | G.LOG | G.VEHICLE | G.BUILD | G.STUMP | G.PROP),
  build: grp(G.BUILD, G.LOG | G.PLAYER | G.VEHICLE | G.GROUND | G.PROP),
  stump: grp(G.STUMP, G.LOG | G.VEHICLE | G.PLAYER),
  prop: grp(G.PROP, G.GROUND | G.LOG | G.VEHICLE | G.BUILD),
};

export class PhysicsWorld {
  readonly world: RAPIER.World;
  readonly events: RAPIER.EventQueue;
  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -22, z: 0 });
    this.world.timestep = 1 / 60;
    this.events = new RAPIER.EventQueue(true);
  }
  step(): void {
    this.world.step(this.events);
  }
  dispose(): void {
    this.world.free();
    this.events.free();
  }
}
