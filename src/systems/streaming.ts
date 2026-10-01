import { CONFIG } from '../config';
import type { Sim, System } from '../core/sim';
import { GROUPS, RAPIER } from '../physics/world';
import { BIOME_BY_ID } from '../data/biomes';
import type { BiomeDef } from '../data/types';
import { Terrain } from '../world/terrain';
import { generateChunkTrees, treeKey, type Tree } from '../world/trees';

export interface Chunk {
  cx: number;
  cz: number;
  key: string;
  heights: Float32Array; // (N+1)^2 indexed ix*(N+1)+iz, ground layer
  skyHeights: Float32Array | null; // sky-island layer (absolute y, NaN = void)
  trees: Tree[];
  biome: BiomeDef;
  bodies: RAPIER.RigidBody[];
}

const N = CONFIG.chunkSegments;
const S = CONFIG.chunkSize;
export const worldToChunk = (v: number): number => Math.floor(v / S);

/** Loads/unloads terrain chunks around the player, builds ground colliders, hands trees to listeners. */
export class Streamer implements System {
  readonly name = 'streamer';
  readonly terrain: Terrain;
  readonly loaded = new Map<string, Chunk>();
  onLoad: ((c: Chunk) => void)[] = [];
  onUnload: ((c: Chunk) => void)[] = [];
  /** Positions streaming is centered on (player + vehicles). */
  focus: { x: number; z: number } = { x: 0, z: 0 };
  blocked: ((x: number, z: number) => boolean) | undefined;
  /** extra trees injected into chunks (guardian trees) */
  treeProviders: ((cx: number, cz: number) => Tree[])[] = [];
  private tick = 0;

  constructor(private sim: Sim) {
    this.terrain = new Terrain(sim.state.seed);
  }

  get viewChunks(): number {
    return this.sim.game.settings.viewChunks;
  }

  /** Synchronously load everything needed around the focus (used on spawn / teleport). */
  preload(x: number, z: number, radius = 2): void {
    this.focus = { x, z };
    const cx0 = worldToChunk(x);
    const cz0 = worldToChunk(z);
    for (let dx = -radius; dx <= radius; dx++)
      for (let dz = -radius; dz <= radius; dz++) this.load(cx0 + dx, cz0 + dz);
  }

  private load(cx: number, cz: number): void {
    const key = treeKey(cx, cz);
    if (this.loaded.has(key)) return;
    const t = this.terrain;
    const stride = N + 1;
    const heights = new Float32Array(stride * stride);
    const step = S / N;
    for (let ix = 0; ix <= N; ix++)
      for (let iz = 0; iz <= N; iz++)
        heights[ix * stride + iz] = t.heightAt(cx * S + ix * step, cz * S + iz * step);
    const mid = t.biomeAt(cx * S + S / 2, cz * S + S / 2);
    let skyHeights: Float32Array | null = null;
    if (
      BIOME_BY_ID.sky &&
      Math.hypot(cx * S + S / 2 - BIOME_BY_ID.sky.center[0], cz * S + S / 2 - BIOME_BY_ID.sky.center[1]) <
        BIOME_BY_ID.sky.radius * 1.3
    ) {
      skyHeights = new Float32Array(stride * stride);
      let any = false;
      for (let ix = 0; ix <= N; ix++)
        for (let iz = 0; iz <= N; iz++) {
          const v = t.skyIslandHeight(cx * S + ix * step, cz * S + iz * step);
          skyHeights[ix * stride + iz] = v === null ? NaN : v;
          if (v !== null) any = true;
        }
      if (!any) skyHeights = null;
    }
    const trees = generateChunkTrees(t, cx, cz, this.blocked);
    for (const p of this.treeProviders) trees.push(...p(cx, cz));
    const chunk: Chunk = { cx, cz, key, heights, skyHeights, trees, biome: mid, bodies: [] };
    this.buildColliders(chunk);
    this.loaded.set(key, chunk);
    for (const f of this.onLoad) f(chunk);
  }

  private buildColliders(c: Chunk): void {
    const w = this.sim.physics.world;
    const stride = N + 1;
    // Rapier heightfield: heights[ix*(N+1)+iz], x then z; centered on the body origin.
    const body = w.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(c.cx * S + S / 2, 0, c.cz * S + S / 2),
    );
    const hf = RAPIER.ColliderDesc.heightfield(N, N, c.heights, { x: S, y: 1, z: S })
      .setCollisionGroups(GROUPS.ground)
      .setFriction(1.0);
    w.createCollider(hf, body);
    c.bodies.push(body);
    if (c.skyHeights) {
      const sh = new Float32Array(stride * stride);
      for (let i = 0; i < sh.length; i++) sh[i] = Number.isNaN(c.skyHeights[i]!) ? -400 : c.skyHeights[i]!;
      const sb = w.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(c.cx * S + S / 2, 0, c.cz * S + S / 2),
      );
      w.createCollider(
        RAPIER.ColliderDesc.heightfield(N, N, sh, { x: S, y: 1, z: S })
          .setCollisionGroups(GROUPS.ground)
          .setFriction(1.0),
        sb,
      );
      c.bodies.push(sb);
    }
  }

  private unload(c: Chunk): void {
    for (const f of this.onUnload) f(c);
    for (const b of c.bodies) this.sim.physics.world.removeRigidBody(b);
    this.loaded.delete(c.key);
  }

  update(): void {
    this.tick++;
    if (this.tick % 6 !== 0) return;
    const r = this.viewChunks;
    const cx0 = worldToChunk(this.focus.x);
    const cz0 = worldToChunk(this.focus.z);
    const want: [number, number, number][] = [];
    for (let dx = -r; dx <= r; dx++)
      for (let dz = -r; dz <= r; dz++) {
        const d = dx * dx + dz * dz;
        if (d <= r * r + 1) want.push([cx0 + dx, cz0 + dz, d]);
      }
    want.sort((a, b) => a[2] - b[2]);
    let budget = 2;
    for (const [cx, cz] of want) {
      if (budget <= 0) break;
      if (!this.loaded.has(treeKey(cx, cz))) {
        this.load(cx, cz);
        budget--;
      }
    }
    for (const c of [...this.loaded.values()]) {
      if (Math.hypot(c.cx - cx0, c.cz - cz0) > r + 1.5) this.unload(c);
    }
  }

  chunkAt(x: number, z: number): Chunk | undefined {
    return this.loaded.get(treeKey(worldToChunk(x), worldToChunk(z)));
  }

  dispose(): void {
    for (const c of [...this.loaded.values()]) this.unload(c);
  }
}
