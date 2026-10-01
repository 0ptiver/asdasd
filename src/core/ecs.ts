/**
 * Minimal typed ECS used for dynamic entities (logs, vehicles, workers, NPCs, projectiles).
 * Static world content (trees, terrain) is chunk-generated data, not entities.
 */
export type Entity = number;

export class Component<T> {
  readonly data = new Map<Entity, T>();
  constructor(readonly name: string) {}
  get(e: Entity): T | undefined {
    return this.data.get(e);
  }
  set(e: Entity, v: T): void {
    this.data.set(e, v);
  }
  has(e: Entity): boolean {
    return this.data.has(e);
  }
  remove(e: Entity): void {
    this.data.delete(e);
  }
}

export class World {
  private nextId = 1;
  private alive = new Set<Entity>();
  private comps: Component<any>[] = [];

  register<T>(name: string): Component<T> {
    const c = new Component<T>(name);
    this.comps.push(c);
    return c;
  }

  create(): Entity {
    const e = this.nextId++;
    this.alive.add(e);
    return e;
  }

  destroy(e: Entity): void {
    if (!this.alive.delete(e)) return;
    for (const c of this.comps) c.remove(e);
  }

  exists(e: Entity): boolean {
    return this.alive.has(e);
  }

  get count(): number {
    return this.alive.size;
  }

  /** Iterate entities having all given components. */
  *query(...cs: Component<any>[]): Generator<Entity> {
    const first = cs[0];
    if (!first) return;
    for (const e of [...first.data.keys()]) {
      if (cs.every((c) => c.has(e))) yield e;
    }
  }
}
