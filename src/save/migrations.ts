import { CONFIG } from '../config';
import { newGameState, type GameState } from './schema';

type Migration = (s: any) => any;

/** migrations[n] upgrades a version-n save to version n+1. */
export const migrations: Record<number, Migration> = {
  0: (s) => ({ ...s, version: 1, stats: s.stats ?? {}, achievements: s.achievements ?? [] }),
};

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Deep-merge defaults for any missing keys so older/hand-edited saves never crash the game. */
export function fillDefaults<T>(target: any, defaults: T): T {
  if (!isObj(defaults)) return (target === undefined ? defaults : target) as T;
  const out: any = isObj(target) ? { ...target } : {};
  for (const k of Object.keys(defaults)) {
    const dv = (defaults as any)[k];
    if (out[k] === undefined) out[k] = dv;
    else if (
      isObj(dv) &&
      Object.keys(dv).length > 0 &&
      isObj(out[k]) &&
      k !== 'chopped' &&
      k !== 'prices' &&
      k !== 'plots'
    )
      out[k] = fillDefaults(out[k], dv);
  }
  return out;
}

export function migrate(raw: unknown): GameState {
  if (!isObj(raw)) throw new Error('Save is not an object');
  let s: any = raw;
  let v = typeof s.version === 'number' ? s.version : 0;
  if (v > CONFIG.saveVersion)
    throw new Error(`Save version ${v} is newer than this game (${CONFIG.saveVersion})`);
  while (v < CONFIG.saveVersion) {
    const m = migrations[v];
    if (!m) throw new Error(`No migration from version ${v}`);
    s = m(s);
    v = s.version;
  }
  return fillDefaults(s, newGameState(String(s.name ?? 'Lumberjack'), Number(s.seed ?? 1)));
}
