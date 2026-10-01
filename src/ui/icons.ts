import { ITEM_BY_ID } from '../data/items';
import { WOOD_BY_ID } from '../data/woods';
import { parseFurniture } from '../data/recipes';

const ICONS: Record<string, string> = {
  plank: '🪵',
  ore: '⛏️',
  gem: '💎',
  fish: '🐟',
  leaf: '🍃',
  map: '🗺️',
  tool: '🛠️',
  potion: '🧪',
  chair: '🪑',
  table: '🍽️',
  shelf: '📚',
  bed: '🛏️',
  barrel: '🛢️',
  bundle: '🔥',
  chest: '📦',
  door: '🚪',
  bag: '🎒',
  boot: '🥾',
  glove: '🧤',
  lamp: '🔦',
  suit: '🧥',
  mask: '🤿',
  jet: '🚀',
  crate: '🎁',
  key: '🔑',
  pet: '🐾',
  fuel: '⛽',
};
export const iconOf = (id: string): string => {
  if (id.startsWith('axe:')) return '🪓';
  const f = parseFurniture(id);
  if (f)
    return (
      ICONS[
        f.shape === 'door_item'
          ? 'door'
          : f.shape === 'chest_item'
            ? 'chest'
            : f.shape === 'firewood_bundle'
              ? 'bundle'
              : f.shape
      ] ?? '🪑'
    );
  return ICONS[ITEM_BY_ID[id]?.icon ?? ''] ?? '📦';
};
export const colorOf = (id: string): string => {
  const f = parseFurniture(id);
  const hex = f ? WOOD_BY_ID[f.wood]?.color : ITEM_BY_ID[id]?.color;
  return '#' + (hex ?? 0x888888).toString(16).padStart(6, '0');
};
export const hex = (n: number): string => '#' + n.toString(16).padStart(6, '0');
