/** Typed event bus. Systems communicate through events instead of importing each other. */
export interface GameEvents {
  'money:change': { delta: number; total: number; reason: string };
  'tree:chop': { treeId: string; wood: string; dmg: number; crit: boolean };
  'tree:fell': { treeId: string; wood: string; mutation: string | null; x: number; y: number; z: number };
  'tree:respawn': { treeId: string };
  'log:spawn': { logId: number; wood: string };
  'log:sold': { wood: string; value: number; units: number };
  'plank:made': { wood: string; count: number };
  'item:add': { item: string; count: number };
  'item:sell': { item: string; count: number; value: number };
  'axe:equip': { axeId: string };
  'axe:break': { axeId: string };
  notify: { text: string; kind?: 'info' | 'good' | 'bad' | 'money' };
  sfx: { name: string; x?: number; y?: number; z?: number; vol?: number };
  'biome:enter': { biome: string; prev: string | null };
  'weather:change': { weather: string };
  'quest:progress': { quest: string; stage: number };
  'quest:done': { quest: string };
  achievement: { id: string };
  'vehicle:enter': { id: number };
  'vehicle:exit': { id: number };
  'plot:buy': { plot: string };
  'save:done': { slot: number; auto: boolean };
  'boss:down': { boss: string };
  fx: { kind: string; x: number; y: number; z: number; color?: number; n?: number };
  shake: { amount: number };
  'ui:open': { panel: string };
  'ui:close': { panel: string };
  level: { skill: string; level: number };
  prestige: { level: number };
  'event:start': { id: string; text: string };
  'event:end': { id: string };
}

type Handler<T> = (payload: T) => void;

export class EventBus {
  private handlers = new Map<string, Set<Handler<any>>>();

  on<K extends keyof GameEvents>(type: K, fn: Handler<GameEvents[K]>): () => void {
    let set = this.handlers.get(type as string);
    if (!set) this.handlers.set(type as string, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }

  emit<K extends keyof GameEvents>(type: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(type as string);
    if (!set) return;
    for (const fn of [...set]) fn(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}
