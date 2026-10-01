import type { ItemDef } from './types';
import { WOODS } from './woods';

const planks: ItemDef[] = WOODS.map((w) => ({
  id: `plank_${w.id}`,
  name: `${w.name} Plank`,
  category: 'plank',
  value: Math.max(1, Math.round((w.baseValue * w.plankMult) / 2)),
  stack: 999,
  desc: `Sawn ${w.name} board.`,
  color: w.color,
  icon: 'plank',
  wood: w.id,
}));

const o = (
  id: string,
  name: string,
  category: ItemDef['category'],
  value: number,
  color: number,
  desc: string,
  extra: Partial<ItemDef> = {},
): ItemDef => ({
  id,
  name,
  category,
  value,
  stack: 99,
  desc,
  color,
  icon: id,
  ...extra,
});

export const ITEMS: ItemDef[] = [
  ...planks,
  // ore
  o('coal', 'Coal', 'ore', 18, 0x2a2a2a, 'Burns hot. Fuels locomotives and the forge.', {
    stack: 999,
    icon: 'ore',
  }),
  o('copper_ore', 'Copper Ore', 'ore', 40, 0xc87a3a, 'Soft reddish ore.', { stack: 999, icon: 'ore' }),
  o('iron_ore', 'Iron Ore', 'ore', 65, 0x9a8a82, 'The backbone of toolmaking.', { stack: 999, icon: 'ore' }),
  o('gold_ore', 'Gold Ore', 'ore', 220, 0xf2c63a, 'Heavy and shiny.', { stack: 999, icon: 'ore' }),
  o('crystal_shard', 'Crystal Shard', 'ore', 700, 0xb48aff, 'Hums faintly.', { stack: 999, icon: 'gem' }),
  o('void_alloy', 'Void Alloy', 'material', 4000, 0x3a0a6a, 'Smelted from Void sawdust and crystal.', {
    stack: 99,
    icon: 'ore',
  }),
  o('sun_core', 'Sun Core', 'material', 4000, 0xffa020, 'A burning heart of sunfire.', {
    stack: 99,
    icon: 'gem',
  }),
  // fish
  o('minnow', 'Minnow', 'fish', 8, 0xb0c0d0, 'Tiny but tasty.', { icon: 'fish' }),
  o('trout', 'River Trout', 'fish', 30, 0x7aa08a, 'Spotted and silver.', { icon: 'fish' }),
  o('bass', 'Lake Bass', 'fish', 55, 0x5a7a4a, 'A hearty catch.', { icon: 'fish' }),
  o('eel', 'Swamp Eel', 'fish', 110, 0x3a4a3a, 'Slippery.', { icon: 'fish' }),
  o('tuna', 'Reef Tuna', 'fish', 260, 0x3a6a9a, 'Big and fast.', { icon: 'fish' }),
  o('golden_koi', 'Golden Koi', 'fish', 1500, 0xffc83a, 'A rare shimmering koi.', { icon: 'fish' }),
  // forage
  o('mushroom', 'Forest Mushroom', 'forage', 12, 0xc8a070, 'Edible and earthy.', { icon: 'leaf' }),
  o('berries', 'Wild Berries', 'forage', 9, 0xc02a5a, 'Sweet and tart.', { icon: 'leaf' }),
  o('herbs', 'Healing Herbs', 'forage', 22, 0x5ac05a, 'Used in tonics.', { icon: 'leaf' }),
  o('honeycomb', 'Honeycomb', 'forage', 45, 0xf0b030, 'Sticky gold.', { icon: 'leaf' }),
  o('glowcap', 'Glowcap', 'forage', 90, 0x39ffd0, 'Luminous cave fungus.', { icon: 'leaf' }),
  o('frostbloom', 'Frostbloom', 'forage', 130, 0xaee8ff, 'A flower that blooms in blizzards.', {
    icon: 'leaf',
  }),
  o('aloe', 'Desert Aloe', 'forage', 60, 0x6ac08a, 'Soothing sap.', { icon: 'leaf' }),
  // treasure
  o('old_coin', 'Old Coin', 'treasure', 150, 0xd8b83a, 'Stamped with a forgotten face.', { icon: 'gem' }),
  o('relic', 'Ancient Relic', 'treasure', 900, 0xb8a070, 'Museum quality.', { icon: 'gem' }),
  o('gem_red', 'Ruby', 'treasure', 1800, 0xe0204a, 'Flawless.', { icon: 'gem' }),
  o('gem_blue', 'Sapphire', 'treasure', 2200, 0x2a5ae0, 'Deep as the ocean.', { icon: 'gem' }),
  o('crown', "King's Crown", 'treasure', 12000, 0xffd83a, 'Lost long ago.', { icon: 'gem' }),
  o('treasure_map', 'Treasure Map', 'map', 100, 0xd8c090, 'X marks the spot. Needs a shovel.', {
    stack: 20,
    icon: 'map',
  }),
  // materials
  o('nails', 'Nails', 'material', 2, 0x9a9a9a, 'Boxed nails.', { stack: 999, icon: 'ore' }),
  o('gears', 'Gears', 'material', 120, 0xb0a070, 'Brass gears.', { icon: 'ore' }),
  o('lacquer', 'Lacquer', 'material', 30, 0xc07a20, 'Furniture finish.', { icon: 'leaf' }),
  o('fuel_can', 'Fuel Can', 'fuel', 80, 0xc02a2a, 'Refills a vehicle or chainsaw (60 units).', {
    stack: 20,
    icon: 'fuel',
  }),
  o('repair_kit', 'Repair Kit', 'consumable', 250, 0x6a6a72, 'Restores 40% axe durability.', {
    stack: 20,
    icon: 'tool',
  }),
  o('shovel', 'Shovel', 'tool', 400, 0x8a8a92, 'Digs up treasure.', { stack: 1, icon: 'tool' }),
  o('fishing_rod', 'Fishing Rod', 'tool', 350, 0x9a6a3a, 'Cast it near water.', { stack: 1, icon: 'tool' }),
  o('pickaxe', 'Pickaxe', 'tool', 1200, 0x7a7a82, 'Mine ore in caves.', { stack: 1, icon: 'tool' }),
  o('stamina_tonic', 'Stamina Tonic', 'consumable', 120, 0x3ac0ff, 'Refills stamina.', {
    stack: 20,
    icon: 'potion',
  }),
  o('strength_tonic', 'Strength Tonic', 'consumable', 600, 0xff6a3a, '+30 strength for 5 minutes.', {
    stack: 20,
    icon: 'potion',
  }),
  o('warm_stew', 'Warm Stew', 'consumable', 90, 0xc08a3a, 'Protects from cold for 4 minutes.', {
    stack: 20,
    icon: 'potion',
  }),
  // furniture (crafted)
  o('chair', 'Wooden Chair', 'furniture', 0, 0x9a6a3a, 'A sturdy chair. Value depends on wood.', {
    stack: 50,
    icon: 'chair',
  }),
  o('table', 'Wooden Table', 'furniture', 0, 0x9a6a3a, 'A big table.', { stack: 50, icon: 'table' }),
  o('bookshelf', 'Bookshelf', 'furniture', 0, 0x9a6a3a, 'Holds nothing yet.', { stack: 50, icon: 'shelf' }),
  o('bed', 'Bed Frame', 'furniture', 0, 0x9a6a3a, 'Comfortable.', { stack: 50, icon: 'bed' }),
  o('barrel', 'Barrel', 'furniture', 0, 0x9a6a3a, 'Watertight (mostly).', { stack: 50, icon: 'barrel' }),
  o('firewood_bundle', 'Firewood Bundle', 'furniture', 0, 0x9a6a3a, 'Sells well in winter.', {
    stack: 99,
    icon: 'bundle',
  }),
  o('chest_item', 'Storage Chest', 'furniture', 0, 0x9a6a3a, 'Place it on your plot to store items.', {
    stack: 20,
    icon: 'chest',
  }),
  o('door_item', 'Door', 'furniture', 0, 0x9a6a3a, 'Hinged door.', { stack: 50, icon: 'door' }),
  // seasonal collectibles (exchange 10 at Ivy for a seasonal axe)
  o('egg', 'Painted Egg', 'material', 40, 0xffb8e0, 'Spring-event collectible.', { stack: 99, icon: 'gem' }),
  o('pumpkin', 'Pumpkin', 'material', 40, 0xff8a1a, 'Harvest-event collectible.', {
    stack: 99,
    icon: 'leaf',
  }),
  o('candy', 'Candy Cane', 'material', 40, 0xff4a5a, 'Winter-event collectible.', {
    stack: 99,
    icon: 'leaf',
  }),
  // gear
  o('backpack_s', 'Small Backpack', 'gear', 800, 0x7a5a3a, '+10 inventory slots.', {
    stack: 1,
    icon: 'bag',
    gearSlot: 'backpack',
    buff: { carry: 10 },
  }),
  o('backpack_m', 'Hiker Pack', 'gear', 18000, 0x3a6a4a, '+20 inventory slots.', {
    stack: 1,
    icon: 'bag',
    gearSlot: 'backpack',
    buff: { carry: 20 },
  }),
  o('backpack_l', 'Expedition Pack', 'gear', 220000, 0x4a4a8a, '+32 inventory slots.', {
    stack: 1,
    icon: 'bag',
    gearSlot: 'backpack',
    buff: { carry: 32 },
  }),
  o('boots_work', 'Work Boots', 'gear', 2500, 0x6a4a2a, '+8% speed.', {
    stack: 1,
    icon: 'boot',
    gearSlot: 'boots',
    buff: { speed: 0.08 },
  }),
  o('boots_spring', 'Spring Boots', 'gear', 60000, 0x3ad0a0, '+14% speed, higher jump.', {
    stack: 1,
    icon: 'boot',
    gearSlot: 'boots',
    buff: { speed: 0.14, jump: 0.3 },
  }),
  o('gloves_work', 'Work Gloves', 'gear', 3500, 0xb08a4a, '+12 strength.', {
    stack: 1,
    icon: 'glove',
    gearSlot: 'gloves',
    buff: { strength: 12 },
  }),
  o('gloves_power', 'Power Gauntlets', 'gear', 140000, 0xc03a3a, '+40 strength.', {
    stack: 1,
    icon: 'glove',
    gearSlot: 'gloves',
    buff: { strength: 40 },
  }),
  o('headlamp', 'Headlamp', 'gear', 9000, 0xf0e8a0, 'Lights up caves.', {
    stack: 1,
    icon: 'lamp',
    gearSlot: 'head',
    buff: { light: 1 },
  }),
  o('fire_suit', 'Fire Suit', 'gear', 90000, 0xe05a2a, 'Immune to lava heat damage.', {
    stack: 1,
    icon: 'suit',
    gearSlot: 'body',
    buff: { heat: 1 },
  }),
  o('snow_gear', 'Snow Gear', 'gear', 75000, 0x8ac0e8, 'Protects from blizzard cold.', {
    stack: 1,
    icon: 'suit',
    gearSlot: 'body',
    buff: { cold: 1 },
  }),
  o('scuba_mask', 'Scuba Mask', 'gear', 45000, 0x3a8ad0, 'Swim without drowning.', {
    stack: 1,
    icon: 'mask',
    gearSlot: 'head',
    buff: { swim: 1 },
  }),
  o('jetpack', 'Jetpack', 'gear', 2500000, 0x8a8a9a, 'Hold jump to fly (uses fuel).', {
    stack: 1,
    icon: 'jet',
    gearSlot: 'backpack',
    buff: { fly: 1, carry: 12 },
  }),
  // crates & keys
  o('crate_common', 'Wooden Crate', 'crate', 0, 0x9a6a3a, 'Contains cosmetics. Needs a key.', {
    stack: 99,
    icon: 'crate',
  }),
  o('crate_rare', 'Iron Crate', 'crate', 0, 0x8a8a9a, 'Better cosmetics. Needs a key.', {
    stack: 99,
    icon: 'crate',
  }),
  o('crate_mythic', 'Prism Crate', 'crate', 0, 0xff7ae8, 'Chance at the Prismatic Axe.', {
    stack: 99,
    icon: 'crate',
  }),
  o('key_common', 'Wooden Key', 'key', 0, 0xc8a050, 'Opens a Wooden Crate.', { stack: 99, icon: 'key' }),
  o('key_rare', 'Iron Key', 'key', 0, 0xb0b0c0, 'Opens an Iron or Prism Crate.', { stack: 99, icon: 'key' }),
  // pets
  o('pet_fox', 'Fox Kit', 'pet', 0, 0xe07a2a, 'Finds forage: +20% forage luck.', { stack: 1, icon: 'pet' }),
  o('pet_owl', 'Owl', 'pet', 0, 0x9a8a6a, 'Sees in the dark: lights caves slightly.', {
    stack: 1,
    icon: 'pet',
  }),
  o('pet_beaver', 'Beaver', 'pet', 0, 0x7a5a3a, '+5% chopping damage.', { stack: 1, icon: 'pet' }),
  o('pet_ox', 'Baby Ox', 'pet', 0, 0xd0c0a0, '+10 carry strength.', { stack: 1, icon: 'pet' }),
  o('pet_sprite', 'Wood Sprite', 'pet', 0, 0x6aff9a, '+5% sell value.', { stack: 1, icon: 'pet' }),
];

export const ITEM_BY_ID: Record<string, ItemDef> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

export const CRATE_LOOT: Record<string, { cosmetics: string[]; mythicChance: number }> = {
  crate_common: {
    cosmetics: ['skin:ember', 'skin:azure', 'paint:2', 'paint:5', 'decal:stripes', 'decal:checker'],
    mythicChance: 0,
  },
  crate_rare: {
    cosmetics: ['skin:jade', 'skin:royal', 'skin:noir', 'decal:flames', 'decal:stars', 'paint:8', 'paint:9'],
    mythicChance: 0,
  },
  crate_mythic: { cosmetics: ['skin:rose', 'decal:logo', 'paint:4'], mythicChance: 0.015 },
};
