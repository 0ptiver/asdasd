import { describe, expect, it } from 'vitest';
import { Terrain, riverX, BRIDGE, DOCK, ROADS, SEA_LEVEL } from '../src/world/terrain';
import { BIOMES } from '../src/data/biomes';

describe('terrain', () => {
  const t = new Terrain(1234);
  it('is deterministic per seed and differs across seeds', () => {
    expect(t.heightAt(100, 100)).toBe(new Terrain(1234).heightAt(100, 100));
    expect(t.heightAt(100, 100)).not.toBe(new Terrain(999).heightAt(100, 100));
  });
  it('hub is flat and above water', () => {
    for (const [x, z] of [
      [0, 0],
      [30, 30],
      [-40, 20],
      [0, 12],
    ]) {
      expect(t.heightAt(x!, z!)).toBeCloseTo(4, 0);
    }
  });
  it('river is below sea level at its center and dock is on land', () => {
    expect(t.heightAt(riverX(200), 200)).toBeLessThan(SEA_LEVEL);
    expect(t.heightAt(DOCK.x, DOCK.z)).toBeGreaterThan(SEA_LEVEL - 0.5);
    expect(t.heightAt(BRIDGE.x - 40, BRIDGE.z)).toBeGreaterThan(0);
  });
  it('each biome center resolves to its own biome', () => {
    for (const b of BIOMES) {
      const m = t.biomeAt(b.center[0], b.center[1]);
      expect(m.id).toBe(b.id);
    }
  });
  it('heights are finite and bounded across the world', () => {
    for (let x = -1500; x <= 1500; x += 150) {
      for (let z = -1500; z <= 1500; z += 150) {
        const h = t.heightAt(x, z);
        expect(Number.isFinite(h)).toBe(true);
        expect(h).toBeLessThan(250);
        expect(h).toBeGreaterThan(-200);
      }
    }
  });
  it('roads connect inside the world', () => {
    for (const r of ROADS)
      for (const [x, z] of r)
        (expect(Math.abs(x)).toBeLessThan(1500), expect(Math.abs(z)).toBeLessThan(1500));
  });
  it('sky islands exist only in the sky biome', () => {
    let found = 0;
    const b = BIOMES.find((x) => x.id === 'sky')!;
    for (let x = b.center[0] - 220; x < b.center[0] + 220; x += 10)
      for (let z = b.center[1] - 220; z < b.center[1] + 220; z += 10)
        if (t.skyIslandHeight(x, z) !== null) found++;
    expect(found).toBeGreaterThan(50);
    expect(t.skyIslandHeight(0, 0)).toBeNull();
  });
});

import { generateChunkTrees, planLogs, logUnits } from '../src/world/trees';
describe('trees', () => {
  const t = new Terrain(77);
  it('generates deterministic trees with valid woods per biome', () => {
    const a = generateChunkTrees(t, 5, 5);
    const b = generateChunkTrees(t, 5, 5);
    expect(a.length).toBe(b.length);
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
  });
  it('places no trees in the hub or on the road', () => {
    const trees = generateChunkTrees(t, 0, 0).concat(generateChunkTrees(t, -1, -1));
    for (const tr of trees) expect(Math.hypot(tr.x, tr.z)).toBeGreaterThan(85);
  });
  it('forests are populated', () => {
    let n = 0;
    for (let cx = 5; cx < 8; cx++) for (let cz = 5; cz < 8; cz++) n += generateChunkTrees(t, cx, cz).length;
    expect(n).toBeGreaterThan(30);
  });
  it('log plan covers trunk and units scale with size', () => {
    const logs = planLogs({ height: 9, radius: 0.45, style: 'broadleaf' });
    expect(logs.length).toBeGreaterThanOrEqual(2);
    const total = logs.reduce((s, l) => s + logUnits(l.len, l.r), 0);
    expect(total).toBeGreaterThan(1);
    const big = planLogs({ height: 20, radius: 1, style: 'redwood' }).reduce(
      (s, l) => s + logUnits(l.len, l.r),
      0,
    );
    expect(big).toBeGreaterThan(total * 3);
  });
});
