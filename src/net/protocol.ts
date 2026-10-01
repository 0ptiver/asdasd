/** Shared multiplayer protocol: message shapes + strict validators (used by server and tests). */
import { ITEM_BY_ID } from '../data/items';
import { FURNITURE_SHAPES } from '../data/recipes';
import { WOOD_BY_ID } from '../data/woods';

export const MAX_MSG_BYTES = 64 * 1024;
export const MAX_CHAT = 200;
export const MAX_PARTS_SHARED = 800;

export type ItemMap = Record<string, number>;

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const isNum = (v: unknown, lim = 1e6): v is number =>
  typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim;
const isStr = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= max;

export function validItemId(id: string): boolean {
  if (ITEM_BY_ID[id]) return true;
  const i = id.indexOf('@');
  if (i < 0) return false;
  return !!FURNITURE_SHAPES.find((s) => s.id === id.slice(0, i)) && !!WOOD_BY_ID[id.slice(i + 1)];
}

export function validItems(v: unknown): v is ItemMap {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const e = Object.entries(v as Record<string, unknown>);
  if (e.length > 24) return false;
  return e.every(([k, n]) => validItemId(k) && isInt(n, 1, 100000));
}

export function cleanName(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const t = s
    .replace(/[^\w \-.]/g, '')
    .trim()
    .slice(0, 16);
  return t.length >= 2 ? t : null;
}

export function cleanChat(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  // strip control chars & markup, collapse whitespace
  const t = s
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CHAT);
  return t.length ? t : null;
}

export type ClientMsg =
  | { t: 'hello'; id: string; token: string; name: string; world: string }
  | {
      t: 'pos';
      x: number;
      y: number;
      z: number;
      yaw: number;
      biome: string;
      moving: number;
      vehicle: string;
      tp?: boolean;
    }
  | { t: 'chat'; text: string; to?: string }
  | { t: 'deposit'; money: number; items: ItemMap }
  | { t: 'withdraw'; money: number; items: ItemMap }
  | {
      t: 'trade';
      op: 'request' | 'accept' | 'decline' | 'offer' | 'confirm' | 'cancel';
      who?: string;
      tid?: string;
      money?: number;
      items?: ItemMap;
    }
  | { t: 'stats'; earned: number; trees: number; prestige: number; playedSec: number; worth: number }
  | { t: 'plot'; plot: string; parts: unknown[] }
  | { t: 'visit'; owner: string }
  | { t: 'social'; op: 'friend' | 'unfriend' | 'block' | 'unblock' | 'public'; who?: string; value?: boolean }
  | { t: 'lb'; board: string }
  | { t: 'ping'; n: number };

export function parseClientMsg(raw: string): ClientMsg | null {
  if (raw.length > MAX_MSG_BYTES) return null;
  let o: any;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof o !== 'object' || o === null || typeof o.t !== 'string') return null;
  switch (o.t) {
    case 'hello':
      if (
        !isStr(o.id, 64) ||
        !(typeof o.token === 'string' && o.token.length <= 96) ||
        cleanName(o.name) === null ||
        !isStr(o.world, 24)
      )
        return null;
      return {
        t: 'hello',
        id: o.id,
        token: o.token,
        name: cleanName(o.name)!,
        world:
          String(o.world)
            .replace(/[^\w-]/g, '')
            .slice(0, 24) || 'main',
      };
    case 'pos':
      if (
        ![o.x, o.z].every((v) => isNum(v, 3000)) ||
        !isNum(o.y, 600) ||
        !isNum(o.yaw, 20) ||
        !isStr(o.biome, 20)
      )
        return null;
      return {
        t: 'pos',
        x: o.x,
        y: o.y,
        z: o.z,
        yaw: o.yaw,
        biome: o.biome,
        moving: isNum(o.moving, 100) ? o.moving : 0,
        vehicle: typeof o.vehicle === 'string' ? o.vehicle.slice(0, 24) : '',
        tp: !!o.tp,
      };
    case 'chat': {
      const text = cleanChat(o.text);
      if (!text) return null;
      return { t: 'chat', text, to: typeof o.to === 'string' ? o.to.slice(0, 64) : undefined };
    }
    case 'deposit':
    case 'withdraw':
      if (!isInt(o.money, 0, 1e12) || !validItems(o.items ?? {})) return null;
      return { t: o.t, money: o.money, items: o.items ?? {} };
    case 'trade':
      if (!['request', 'accept', 'decline', 'offer', 'confirm', 'cancel'].includes(o.op)) return null;
      if (o.money !== undefined && !isInt(o.money, 0, 1e12)) return null;
      if (o.items !== undefined && !validItems(o.items)) return null;
      return {
        t: 'trade',
        op: o.op,
        who: typeof o.who === 'string' ? o.who.slice(0, 64) : undefined,
        tid: typeof o.tid === 'string' ? o.tid.slice(0, 32) : undefined,
        money: o.money,
        items: o.items,
      };
    case 'stats':
      if (![o.earned, o.trees, o.prestige, o.playedSec, o.worth].every((v) => isNum(v, 1e15) && v >= 0))
        return null;
      return {
        t: 'stats',
        earned: o.earned,
        trees: o.trees,
        prestige: o.prestige,
        playedSec: o.playedSec,
        worth: o.worth,
      };
    case 'plot':
      if (!isStr(o.plot, 16) || !Array.isArray(o.parts) || o.parts.length > MAX_PARTS_SHARED) return null;
      for (const p of o.parts)
        if (!Array.isArray(p) || p.length < 10 || p.length > 11 || typeof p[0] !== 'string') return null;
      return { t: 'plot', plot: o.plot, parts: o.parts };
    case 'visit':
      return isStr(o.owner, 64) ? { t: 'visit', owner: o.owner } : null;
    case 'social':
      if (!['friend', 'unfriend', 'block', 'unblock', 'public'].includes(o.op)) return null;
      return {
        t: 'social',
        op: o.op,
        who: typeof o.who === 'string' ? o.who.slice(0, 64) : undefined,
        value: !!o.value,
      };
    case 'lb':
      return isStr(o.board, 16) ? { t: 'lb', board: o.board } : null;
    case 'ping':
      return { t: 'ping', n: isNum(o.n) ? o.n : 0 };
    default:
      return null;
  }
}
