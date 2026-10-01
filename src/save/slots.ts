import { openDB, type IDBPDatabase } from 'idb';
import { CONFIG } from '../config';
import { migrate } from './migrations';
import { DEFAULT_SETTINGS, type GameState, type SaveMeta, type Settings } from './schema';

const DB_NAME = 'timber-empire';
let dbp: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbp) {
    dbp = openDB(DB_NAME, 1, {
      upgrade(d) {
        d.createObjectStore('slots');
        d.createObjectStore('kv');
      },
    });
  }
  return dbp;
}

export function resetDbHandle(): void {
  dbp = null;
}

export function metaOf(slot: number, s: GameState): SaveMeta {
  return {
    slot,
    name: s.name,
    savedAt: s.savedAt,
    playedSec: s.playedSec,
    money: s.money,
    prestige: s.prestige.level,
    version: s.version,
  };
}

export async function listSlots(): Promise<(SaveMeta | null)[]> {
  const d = await db();
  const out: (SaveMeta | null)[] = [];
  for (let i = 0; i < CONFIG.saveSlots; i++) {
    const rec = (await d.get('slots', i)) as GameState | undefined;
    out.push(rec ? metaOf(i, rec) : null);
  }
  return out;
}

export async function saveSlot(slot: number, state: GameState): Promise<void> {
  if (slot < 0 || slot >= CONFIG.saveSlots) throw new Error('bad slot');
  state.savedAt = Date.now();
  const d = await db();
  await d.put('slots', JSON.parse(JSON.stringify(state)), slot);
}

export async function loadSlot(slot: number): Promise<GameState | null> {
  const d = await db();
  const rec = await d.get('slots', slot);
  return rec ? migrate(rec) : null;
}

export async function deleteSlot(slot: number): Promise<void> {
  const d = await db();
  await d.delete('slots', slot);
}

export function exportSave(state: GameState): string {
  return JSON.stringify({ game: 'timber-empire', exportedAt: Date.now(), save: state });
}

export function parseImport(text: string): GameState {
  const obj = JSON.parse(text);
  const raw = obj && obj.game === 'timber-empire' ? obj.save : obj;
  return migrate(raw);
}

export async function loadSettings(): Promise<Settings> {
  try {
    const d = await db();
    const s = (await d.get('kv', 'settings')) as Partial<Settings> | undefined;
    return { ...DEFAULT_SETTINGS, ...(s ?? {}), keys: { ...DEFAULT_SETTINGS.keys, ...(s?.keys ?? {}) } };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  try {
    const d = await db();
    await d.put('kv', JSON.parse(JSON.stringify(s)), 'settings');
  } catch {
    /* storage unavailable (private mode) */
  }
}
