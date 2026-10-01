export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';
export type SkillId = 'woodcutting' | 'strength' | 'driving' | 'crafting' | 'foraging';

export type BiomeId =
  | 'meadow'
  | 'birchwood'
  | 'cherry'
  | 'redwood'
  | 'swamp'
  | 'goldbasin'
  | 'volcano'
  | 'taiga'
  | 'tropics'
  | 'crystal'
  | 'deepcave'
  | 'desert'
  | 'haunted'
  | 'sky';

export type WoodProp =
  'glows' | 'burns' | 'floats' | 'heavy' | 'regrows' | 'bonusSell' | 'questDouble' | 'grows' | 'frozen';
export type TreeStyle =
  | 'broadleaf'
  | 'conifer'
  | 'birch'
  | 'cherry'
  | 'redwood'
  | 'palm'
  | 'cactus'
  | 'mangrove'
  | 'crystal'
  | 'mushroom'
  | 'cloud'
  | 'dead'
  | 'lava'
  | 'gold'
  | 'willow';

export interface WoodDef {
  id: string;
  name: string;
  baseValue: number; // value of one log unit
  plankMult: number; // plank value multiplier over log value
  hp: number; // tree HP at 1 unit scale
  biome: BiomeId;
  rarity: Rarity;
  color: number; // trunk / log color
  leaf: number; // foliage color (0 = none)
  style: TreeStyle;
  props: WoodProp[];
  respawnSec: number;
  weight: number; // spawn weight inside its biome
  desc: string;
  /** minimum axe tier able to damage it meaningfully */
  minTier: number;
  nightOnly?: boolean;
  guardianOnly?: boolean;
  emissive?: number;
}

export interface MutationDef {
  id: 'giant' | 'golden' | 'frozen' | 'cursed';
  name: string;
  chance: number;
  valueMult: number;
  hpMult: number;
  scale: number;
  tint: number | null;
  emissive: number;
}

export type AxeAbility =
  | 'none'
  | 'burn'
  | 'freeze'
  | 'cleave'
  | 'chain'
  | 'longreach'
  | 'regrow'
  | 'inverse'
  | 'refine'
  | 'gravity'
  | 'fuel'
  | 'exact'
  | 'dismantle'
  | 'vacuum'
  | 'levels'
  | 'poison'
  | 'crit'
  | 'lifesteal';

export interface AxeDef {
  id: string;
  name: string;
  tier: number; // 1..6 (0 = utility / event)
  price: number; // 0 + source for non-buyable
  source: 'shop' | 'smith' | 'forge' | 'drop' | 'quest' | 'boss' | 'event' | 'crate' | 'start';
  sourceNote?: string;
  damage: number;
  speed: number; // swings per second
  reach: number;
  durability: number;
  mult: Record<string, number>; // per wood id damage multiplier
  ability: AxeAbility;
  abilityDesc: string;
  rarity: Rarity;
  head: number; // color of head
  handle: number; // handle color
  shape:
    'hatchet' | 'axe' | 'double' | 'maul' | 'pick' | 'chainsaw' | 'cleaver' | 'curved' | 'long' | 'blade';
  glow?: number;
  desc: string;
}

export interface VehicleDef {
  id: string;
  name: string;
  kind: 'ground' | 'water' | 'air' | 'rail' | 'special';
  price: number;
  unlock: string; // note
  mass: number;
  engine: number; // drive force
  maxSpeed: number;
  turn: number;
  brake: number;
  capacity: number; // cargo mass
  fuelCap: number;
  fuelUse: number; // per second at full throttle
  seats: number;
  size: [number, number, number]; // w,h,l chassis
  color: number;
  wheels: number;
  wheelRadius: number;
  trailerHitch: boolean;
  isTrailer?: boolean;
  traits: string[]; // 'snow', 'swamp', 'magnet', 'grapple', 'winch', 'amphibious', 'rails', 'mechArms'
  desc: string;
}

export interface BiomeDef {
  id: BiomeId;
  name: string;
  center: [number, number]; // world x,z (world is centered on 0,0)
  radius: number;
  tier: number; // difficulty / progression tier
  sky: number; // zenith color (day)
  horizon: number;
  fog: number;
  fogDensity: number;
  ground: number;
  groundAlt: number;
  light: number;
  ambient: number;
  baseHeight: number;
  amp: number; // terrain amplitude
  density: number; // trees per 100 m^2
  woods: string[];
  weather: string[];
  hazards: string[];
  gate: { gear?: string; tier?: number; vehicle?: string; note: string };
  musicKey: number; // semitone root for procedural music
  ambience: string;
  indoor?: boolean;
  nightOnly?: boolean;
  elevation?: number; // y-offset (sky islands)
  desc: string;
}

export type ItemCategory =
  | 'plank'
  | 'ore'
  | 'fish'
  | 'forage'
  | 'material'
  | 'furniture'
  | 'gear'
  | 'tool'
  | 'consumable'
  | 'crate'
  | 'key'
  | 'map'
  | 'treasure'
  | 'pet'
  | 'blueprint'
  | 'fuel';

export interface ItemDef {
  id: string;
  name: string;
  category: ItemCategory;
  value: number;
  stack: number;
  desc: string;
  color: number;
  icon: string;
  wood?: string;
  gearSlot?: GearSlot;
  buff?: Partial<
    Record<
      'strength' | 'speed' | 'cold' | 'heat' | 'light' | 'swim' | 'jump' | 'fly' | 'carry' | 'luck',
      number
    >
  >;
}

export type GearSlot = 'backpack' | 'boots' | 'gloves' | 'head' | 'body' | 'tool';

export interface RecipeDef {
  id: string;
  name: string;
  station: 'bench' | 'forge' | 'workshop' | 'factory' | 'stall';
  inputs: Record<string, number>; // item id or 'plank:*' (any plank)
  output: string; // item id
  count: number;
  time: number;
  xp: number;
  minCraftLevel: number;
}

export interface QuestStage {
  text: string;
  kind:
    | 'chop'
    | 'sell'
    | 'plank'
    | 'visit'
    | 'talk'
    | 'earn'
    | 'craft'
    | 'kill'
    | 'fish'
    | 'mine'
    | 'deliver'
    | 'buy'
    | 'drive'
    | 'build';
  target?: string; // wood / biome / npc / item
  count: number;
}
export interface QuestDef {
  id: string;
  name: string;
  giver: string;
  type: 'story' | 'daily' | 'weekly';
  stages: QuestStage[];
  reward: { money?: number; xp?: number; items?: Record<string, number>; axe?: string; rep?: number };
  requires?: string;
  intro: string;
  outro: string;
}

export interface NpcDef {
  id: string;
  name: string;
  role: string;
  pos: [number, number];
  color: number;
  lines: string[];
  shop?: 'tools' | 'land' | 'smith' | 'mechanic' | 'market' | 'harbor' | 'traveler' | 'gear';
}

export interface BossDef {
  id: string;
  name: string;
  biome: BiomeId;
  hp: number;
  wood: string;
  reward: { money: number; axe?: string; items?: Record<string, number>; xp: number };
  attacks: ('slam' | 'spores' | 'roots' | 'fireball' | 'frost' | 'summon' | 'beam')[];
  color: number;
  pos: [number, number];
  respawnSec: number;
}

export interface PlotDef {
  id: string;
  name: string;
  biome: BiomeId;
  center: [number, number];
  size: [number, number];
  price: number;
  expand: number; // price per adjacent section
  maxSections: number;
}
