import { ITEM_BY_ID } from '../data/items';
import { FURNITURE_SHAPES, parseFurniture } from '../data/recipes';
import { WOOD_BY_ID } from '../data/woods';

/** Base (unscaled by market) item value. Furniture value derives from wood plank value × shape multiplier. */
export function baseItemValue(id: string): number {
  const f = parseFurniture(id);
  if (f) {
    const shape = FURNITURE_SHAPES.find((s) => s.id === f.shape);
    const w = WOOD_BY_ID[f.wood];
    if (!shape || !w) return 0;
    const plank = Math.max(1, Math.round((w.baseValue * w.plankMult) / 2));
    return Math.round(plank * shape.planks * shape.mult);
  }
  return ITEM_BY_ID[id]?.value ?? 0;
}

export function itemName(id: string): string {
  const f = parseFurniture(id);
  if (f) {
    const shape = FURNITURE_SHAPES.find((s) => s.id === f.shape);
    return `${WOOD_BY_ID[f.wood]?.name ?? f.wood} ${shape?.name ?? f.shape}`;
  }
  return ITEM_BY_ID[id]?.name ?? id;
}

/** Hook object so InventorySystem doesn't import market code directly (market overrides `value`). */
export const ITEM_VALUE_HOOK = { value: baseItemValue };
