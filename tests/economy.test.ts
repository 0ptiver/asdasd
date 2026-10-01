import { describe, expect, it } from 'vitest';
import { hoursToAfford, simulate } from '../scripts/economy';
import { VEHICLE_BY_ID } from '../src/data/vehicles';
import { AXE_BY_ID } from '../src/data/axes';
import { ITEMS, ITEM_BY_ID } from '../src/data/items';
import { WOODS } from '../src/data/woods';

describe('economy balance targets', () => {
  const { milestones } = simulate();
  it('first upgrade arrives within ~5 minutes', () => {
    const plain = milestones.find((m) => m.what === 'Plain Axe')!;
    expect(plain.hours * 60).toBeGreaterThan(1);
    expect(plain.hours * 60).toBeLessThan(8);
  });
  it('first real vehicle (pickup) arrives in roughly half an hour', () => {
    const h = hoursToAfford(VEHICLE_BY_ID.pickup!.price);
    expect(h).toBeGreaterThan(0.2);
    expect(h).toBeLessThan(1.0);
  });
  it('the first end-game axe takes 20-30 hours', () => {
    const h = hoursToAfford(AXE_BY_ID.end_times_axe!.price);
    expect(h).toBeGreaterThan(18);
    expect(h).toBeLessThan(34);
  });
  it('plank value exceeds log value and furniture exceeds planks for every wood', () => {
    for (const w of WOODS) expect(w.plankMult).toBeGreaterThan(1);
    expect(ITEM_BY_ID.plank_oak!.value * 2).toBeGreaterThan(WOODS[0]!.baseValue);
    expect(ITEMS.filter((i) => i.category === 'plank').length).toBe(WOODS.length);
  });
});
