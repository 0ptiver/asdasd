/** Save game schema. Bump CONFIG.saveVersion and add a migration in migrations.ts when the shape changes. */
import { CONFIG } from '../config';
import type { GearSlot, SkillId } from '../data/types';

export interface ItemStack {
  id: string;
  n: number;
}
export interface AxeInst {
  uid: string;
  def: string;
  up: number;
  ench: Record<string, number>;
  dur: number;
  skin: string;
  xp: number;
}
export interface OwnedVehicle {
  uid: string;
  def: string;
  upg: Record<string, number>;
  paint: number;
  decal: string;
  fuel: number;
  hp: number;
  pos: [number, number, number];
  yaw: number;
  trailer: string | null;
}
/** kind, x, y, z, yaw, sx, sy, sz, color, material index, extra */
export type PlacedPart = [
  string,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number?,
];

export interface PlotState {
  sections: number; // 1 + purchased adjacent sections
  parts: PlacedPart[];
  blueprints: Record<string, PlacedPart[]>;
  sawmillLevel: number;
  chests: Record<string, ItemStack[]>;
  texts: Record<string, string>;
  /** logic wires between part uids: [from, to] */
  wires: [number, number][];
  businesses: Record<
    string,
    {
      level: number;
      stock: number;
      lastCollect: number;
      out?: Record<string, number>;
      input?: Record<string, number>;
      recipe?: string;
      prog?: number;
    }
  >;
  outpost: { level: number; lastCollect: number };
}

export interface SavedLog {
  w: string;
  len: number;
  r: number;
  x: number;
  y: number;
  z: number;
  q: [number, number, number, number];
  mut: string | null;
  age: number;
  owner: string;
}

export interface PriceEntry {
  mult: number;
  trend: number;
  supply: number;
  history: number[];
}
export interface MarketState {
  prices: Record<string, PriceEntry>;
  event: { id: string; until: number; wood?: string; mult: number } | null;
  nextTick: number;
  auctions: AuctionListing[];
  futures: FuturesPosition[];
}
export interface AuctionListing {
  id: number;
  item: string;
  n: number;
  price: number;
  seller: 'npc' | 'player';
  expires: number;
}
export interface FuturesPosition {
  id: number;
  wood: string;
  dir: 1 | -1;
  stake: number;
  entry: number;
  expires: number;
  leverage: number;
}

export interface ActiveQuest {
  id: string;
  stage: number;
  progress: number;
  name?: string;
  text?: string;
  kind?: string;
  target?: string;
  need?: number;
  reward?: number;
  type?: 'daily' | 'weekly' | 'story';
  done?: boolean;
}
export interface Job {
  id: number;
  wood: string;
  units: number;
  reward: number;
  town: string;
  expires: number;
  bonusBy: number;
  taken: boolean;
  delivered: number;
  kind: 'logs' | 'planks' | 'furniture';
  item?: string;
}
export interface Worker {
  id: number;
  name: string;
  level: number;
  wage: number;
  xp: number;
  hiredAt: number;
  wood: string;
  plot: string;
  efficiency: number;
  stock: number;
  owed: number;
  lastMs: number;
}

export interface GameState {
  version: number;
  name: string;
  seed: number;
  createdAt: number;
  savedAt: number;
  playedSec: number;
  time: number; // days
  weather: { kind: string; until: number };
  money: number;
  totalEarned: number;
  prestige: { level: number; points: number };
  player: { x: number; y: number; z: number; yaw: number; hp: number; stamina: number; fuel: number };
  skills: Record<SkillId, number>; // xp
  inv: { slots: (ItemStack | null)[]; size: number; hotbar: (string | null)[] };
  axes: AxeInst[];
  equipped: string | null;
  gear: Partial<Record<GearSlot, string>>;
  vehicles: OwnedVehicle[];
  world: {
    chopped: Record<string, number>; // treeId -> respawn at (state.time days)
    logs: SavedLog[];
    secrets: string[];
    stations: string[];
    bossDown: Record<string, number>;
    visited: string[];
    treasure: { x: number; z: number; found: boolean }[];
    nextUid: number;
    mutated: Record<string, string>;
    outposts: Record<string, { level: number; lastMs: number; lastPlayed: number }>;
    tollUntil: number;
    boss: Record<string, number>;
    events: { id: string; until: number; data?: any } | null;
    nextEvent: number;
  };
  market: MarketState;
  plots: Record<string, PlotState>;
  quests: { done: string[]; active: ActiveQuest[]; dailyDay: number; weeklyWeek: number; dailyDone: number };
  rep: Record<string, number>;
  jobs: Job[];
  workers: Worker[];
  stats: Record<string, number>;
  achievements: string[];
  pets: string[];
  activePet: string | null;
  cosmetics: string[];
  tutorial: { done: boolean; step: number };
  discoveredSpecies: string[];
}

export interface SaveMeta {
  slot: number;
  name: string;
  savedAt: number;
  playedSec: number;
  money: number;
  prestige: number;
  version: number;
}

export interface Settings {
  quality: 'low' | 'medium' | 'high' | 'ultra';
  shadows: boolean;
  bloom: boolean;
  ssao: boolean;
  reducedMotion: boolean;
  colorblind: 'none' | 'deuter' | 'protan' | 'tritan';
  textScale: number;
  music: number;
  sfx: number;
  ambience: number;
  sensitivity: number;
  invertY: boolean;
  fov: number;
  viewChunks: number;
  keys: Record<string, string>;
  autosave: boolean;
}

export const DEFAULT_KEYS: Record<string, string> = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  sprint: 'ShiftLeft',
  interact: 'KeyE',
  inventory: 'KeyI',
  map: 'KeyM',
  build: 'KeyB',
  quests: 'KeyJ',
  garage: 'KeyG',
  craft: 'KeyC',
  hotbarNext: 'KeyF',
  drop: 'KeyX',
  special: 'KeyQ',
  recall: 'KeyR',
  horn: 'KeyH',
  lights: 'KeyL',
  console: 'Backquote',
};

export const DEFAULT_SETTINGS: Settings = {
  quality: 'medium',
  shadows: true,
  bloom: true,
  ssao: false,
  reducedMotion: false,
  colorblind: 'none',
  textScale: 1,
  music: 0.5,
  sfx: 0.7,
  ambience: 0.5,
  sensitivity: 1,
  invertY: false,
  fov: 70,
  viewChunks: CONFIG.viewChunks,
  keys: { ...DEFAULT_KEYS },
  autosave: true,
};

export function emptyPlot(): PlotState {
  return {
    sections: 1,
    parts: [],
    blueprints: {},
    sawmillLevel: 0,
    chests: {},
    texts: {},
    wires: [],
    businesses: {},
    outpost: { level: 0, lastCollect: 0 },
  };
}

export function newGameState(name: string, seed: number): GameState {
  const now = Date.now();
  return {
    version: CONFIG.saveVersion,
    name,
    seed,
    createdAt: now,
    savedAt: now,
    playedSec: 0,
    time: CONFIG.startHour / 24,
    weather: { kind: 'clear', until: 0.2 },
    money: CONFIG.startMoney,
    totalEarned: 0,
    prestige: { level: 0, points: 0 },
    player: { x: 0, y: 8, z: 14, yaw: Math.PI, hp: 100, stamina: CONFIG.player.maxStamina, fuel: 100 },
    skills: { woodcutting: 0, strength: 0, driving: 0, crafting: 0, foraging: 0 },
    inv: { slots: new Array(24).fill(null), size: 24, hotbar: new Array(8).fill(null) },
    axes: [],
    equipped: null,
    gear: {},
    vehicles: [],
    world: {
      chopped: {},
      logs: [],
      secrets: [],
      stations: [],
      bossDown: {},
      visited: ['meadow'],
      treasure: [],
      nextUid: 1,
      mutated: {},
      outposts: {},
      tollUntil: 0,
      boss: {},
      events: null,
      nextEvent: 0,
    },
    market: { prices: {}, event: null, nextTick: 0, auctions: [], futures: [] },
    plots: {},
    quests: { done: [], active: [], dailyDay: -1, weeklyWeek: -1, dailyDone: 0 },
    rep: {},
    jobs: [],
    workers: [],
    stats: {},
    achievements: [],
    pets: [],
    activePet: null,
    cosmetics: [],
    tutorial: { done: false, step: 0 },
    discoveredSpecies: [],
  };
}
