import { describe, expect, it } from 'vitest';
import { validateData } from '../src/data/validate';
import { AXES, BIOMES, VEHICLES, WOODS, PLOTS } from '../src/data/registry';

describe('data tables', () => {
  it('passes validation', () => {
    expect(validateData()).toEqual([]);
  });
  it('meets content targets', () => {
    expect(AXES.length).toBeGreaterThanOrEqual(40);
    expect(VEHICLES.length).toBeGreaterThanOrEqual(25);
    expect(WOODS.length).toBeGreaterThanOrEqual(28);
    expect(BIOMES.length).toBe(14);
    expect(PLOTS.length).toBeGreaterThanOrEqual(30);
  });
});
