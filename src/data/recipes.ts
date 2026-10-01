import type { RecipeDef } from './types';
import { WOODS } from './woods';

/** Furniture is crafted per wood: `chair` + wood id => item "chair@oak" with value scaling from plank value. */
export const FURNITURE_SHAPES = [
  { id: 'firewood_bundle', name: 'Firewood Bundle', planks: 2, mult: 1.6, level: 0, time: 3 },
  { id: 'barrel', name: 'Barrel', planks: 4, mult: 1.9, level: 0, time: 5 },
  { id: 'chair', name: 'Wooden Chair', planks: 4, mult: 2.1, level: 1, time: 6 },
  { id: 'door_item', name: 'Door', planks: 6, mult: 2.2, level: 2, time: 7 },
  { id: 'table', name: 'Wooden Table', planks: 8, mult: 2.4, level: 3, time: 10 },
  { id: 'chest_item', name: 'Storage Chest', planks: 8, mult: 2.4, level: 4, time: 10 },
  { id: 'bookshelf', name: 'Bookshelf', planks: 12, mult: 2.7, level: 6, time: 14 },
  { id: 'bed', name: 'Bed Frame', planks: 16, mult: 3.0, level: 8, time: 18 },
] as const;

export const furnitureId = (shape: string, wood: string): string => `${shape}@${wood}`;
export const parseFurniture = (id: string): { shape: string; wood: string } | null => {
  const i = id.indexOf('@');
  return i < 0 ? null : { shape: id.slice(0, i), wood: id.slice(i + 1) };
};

/** Fixed recipes (non-wood-specific). */
export const RECIPES: RecipeDef[] = [
  {
    id: 'r_fuel',
    name: 'Fuel Can',
    station: 'workshop',
    inputs: { coal: 2, nails: 4 },
    output: 'fuel_can',
    count: 1,
    time: 4,
    xp: 4,
    minCraftLevel: 0,
  },
  {
    id: 'r_repair',
    name: 'Repair Kit',
    station: 'workshop',
    inputs: { iron_ore: 2, copper_ore: 1 },
    output: 'repair_kit',
    count: 2,
    time: 5,
    xp: 6,
    minCraftLevel: 0,
  },
  {
    id: 'r_lacquer',
    name: 'Lacquer',
    station: 'workshop',
    inputs: { berries: 4, herbs: 1 },
    output: 'lacquer',
    count: 3,
    time: 4,
    xp: 3,
    minCraftLevel: 1,
  },
  {
    id: 'r_gears',
    name: 'Gears',
    station: 'workshop',
    inputs: { iron_ore: 3, copper_ore: 3 },
    output: 'gears',
    count: 1,
    time: 6,
    xp: 10,
    minCraftLevel: 2,
  },
  {
    id: 'r_stamina',
    name: 'Stamina Tonic',
    station: 'bench',
    inputs: { herbs: 2, berries: 2 },
    output: 'stamina_tonic',
    count: 2,
    time: 4,
    xp: 5,
    minCraftLevel: 0,
  },
  {
    id: 'r_strength',
    name: 'Strength Tonic',
    station: 'bench',
    inputs: { honeycomb: 2, herbs: 3 },
    output: 'strength_tonic',
    count: 1,
    time: 6,
    xp: 12,
    minCraftLevel: 3,
  },
  {
    id: 'r_stew',
    name: 'Warm Stew',
    station: 'bench',
    inputs: { mushroom: 3, herbs: 1, trout: 1 },
    output: 'warm_stew',
    count: 2,
    time: 5,
    xp: 6,
    minCraftLevel: 1,
  },
  {
    id: 'r_void_alloy',
    name: 'Void Alloy',
    station: 'forge',
    inputs: { crystal_shard: 6, plank_void: 4, gold_ore: 8 },
    output: 'void_alloy',
    count: 1,
    time: 20,
    xp: 120,
    minCraftLevel: 10,
  },
  {
    id: 'r_sun_core',
    name: 'Sun Core',
    station: 'forge',
    inputs: { plank_sunfire: 6, gold_ore: 10, coal: 20 },
    output: 'sun_core',
    count: 1,
    time: 20,
    xp: 120,
    minCraftLevel: 10,
  },
  {
    id: 'r_firewood_stall',
    name: 'Firewood Crate (stall)',
    station: 'stall',
    inputs: { 'plank:*': 12 },
    output: 'firewood_bundle',
    count: 8,
    time: 8,
    xp: 8,
    minCraftLevel: 0,
  },
];

export const woodIds = WOODS.map((w) => w.id);
