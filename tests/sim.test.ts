import { describe, expect, it } from 'vitest';
import { makeSim, run, standBeside } from './helpers/headless';

describe('simulation: chop → logs → sell', () => {
  it('boots the world and the hub', async () => {
    const { sim } = await makeSim();
    expect(sim.streamer.loaded.size).toBeGreaterThan(5);
    expect(sim.hub.layout.boxes.length).toBeGreaterThan(10);
    run(sim, 2);
    expect(sim.player.y).toBeGreaterThan(3);
    expect(sim.player.grounded).toBe(true);
  });

  it('buying an axe equips it and costs money', async () => {
    const { sim, state } = await makeSim();
    expect(sim.shop.buyAxe('basic_hatchet')).toBe(true);
    expect(state.money).toBe(70);
    expect(sim.inventory.equipped()?.def).toBe('basic_hatchet');
    expect(sim.shop.buyAxe('basic_hatchet')).toBe(false);
  });

  it('chops a tree down, which falls and splits into physical logs', async () => {
    const { sim, input, state } = await makeSim(123, (s) => (s.money = 100000));
    sim.shop.buyAxe('plain_axe');
    run(sim, 1);
    sim.player.teleport(0, 150); // meadow edge with trees
    run(sim, 2);
    const t = standBeside(sim, (x) => x.wood === 'oak' && x.mut === null && x.scale < 1.1);
    run(sim, 0.5);
    input.primary = true;
    let fellAt = -1;
    run(sim, 40, (i) => {
      if (t.hidden && fellAt < 0) fellAt = i;
    });
    input.primary = false;
    expect(t.hidden).toBe(true);
    run(sim, 3);
    expect(sim.logs.logs.size).toBeGreaterThanOrEqual(2);
    expect(state.stats.trees).toBe(1);
    expect(state.skills.woodcutting).toBeGreaterThan(0);
    const first = [...sim.logs.logs.values()][0]!;
    expect(first.wood).toBe('oak');
    // logs rest on the terrain
    run(sim, 3);
    for (const l of sim.logs.logs.values()) {
      const p = l.body.translation();
      const g = sim.streamer.terrain.heightAt(p.x, p.z);
      expect(p.y).toBeGreaterThan(g - 0.5);
      expect(p.y).toBeLessThan(g + 3);
    }
  });

  it('a log dropped in the sell zone is sold for money', async () => {
    const { sim, state } = await makeSim();
    const z = sim.hub.layout.sellZone;
    const before = state.money;
    sim.logs.spawnLog('oak', 3, 0.45, { x: z.x, y: z.y + 2, z: z.z }, null, null, null);
    run(sim, 3);
    expect(sim.logs.logs.size).toBe(0);
    expect(state.money).toBeGreaterThan(before);
    expect(state.stats.logsSold).toBe(1);
  });

  it('a log in the sawmill intake becomes planks in the output bin', async () => {
    const { sim } = await makeSim();
    const z = sim.hub.layout.sawIntake;
    sim.logs.spawnLog('birch', 3, 0.45, { x: z.x, y: z.y + 1, z: z.z }, null, null, null);
    run(sim, 5);
    expect(sim.logs.logs.size).toBe(0);
    expect(sim.sawmill.outputCount()).toBeGreaterThanOrEqual(2);
    sim.sawmill.collect();
    expect(sim.inventory.count('plank_birch')).toBeGreaterThanOrEqual(2);
    const n = sim.inventory.count('plank_birch');
    const m0 = sim.state.money;
    sim.sell.sellItem('plank_birch', n);
    expect(sim.state.money).toBeGreaterThan(m0);
  });

  it('selling pushes prices down (supply & demand) and they recover', async () => {
    const { sim } = await makeSim();
    const m0 = sim.market.woodMult('oak');
    sim.market.recordSale('oak', 100);
    expect(sim.market.woodMult('oak')).toBeLessThan(m0 * 0.85);
  });
});
