import { describe, expect, it } from 'vitest';
import { makeSim, run } from './helpers/headless';
import { PLOT_BY_ID } from '../src/data/plots';
import type { PlacedPart } from '../src/save/schema';

const wall = (x: number, z: number, y = 4): PlacedPart => ['wall', x, y, z, 0, 1, 1, 1, 0, 0];

describe('land & building', () => {
  it('buying a plot costs money and unlocks building there', async () => {
    const { sim, state } = await makeSim(7, (s) => (s.money = 10000));
    const def = PLOT_BY_ID.hub1!;
    expect(sim.plots.buy('hub1')).toBe(true);
    expect(state.money).toBe(10000 - def.price);
    expect(sim.plots.buy('hub1')).toBe(false);
    expect(sim.plots.insideOwnedPlot(def.center[0], def.center[1])).toBe(true);
    expect(sim.plots.insideOwnedPlot(0, 0)).toBe(false);
  });

  it('places parts using planks, refunds on delete, and supports undo/redo', async () => {
    const { sim, state } = await makeSim(7, (s) => (s.money = 100000));
    sim.plots.buy('hub1');
    const c = PLOT_BY_ID.hub1!.center;
    sim.inventory.add('plank_oak', 20);
    const r = sim.building.place('hub1', wall(c[0], c[1]));
    expect(typeof r).not.toBe('string');
    expect(sim.inventory.count('plank_oak')).toBe(17);
    expect(state.plots.hub1!.parts.length).toBe(1);
    sim.building.undo();
    expect(state.plots.hub1!.parts.length).toBe(0);
    expect(sim.inventory.count('plank_oak')).toBe(20);
    sim.building.redo();
    expect(state.plots.hub1!.parts.length).toBe(1);
    const b = [...sim.building.built.values()][0]!;
    expect(sim.building.remove(b.id)).toBe(true);
    expect(sim.inventory.count('plank_oak')).toBe(20);
  });

  it('refuses placement without materials and outside plots', async () => {
    const { sim } = await makeSim(7, (s) => (s.money = 100000));
    sim.plots.buy('hub1');
    const c = PLOT_BY_ID.hub1!.center;
    const r = sim.building.place('hub1', wall(c[0], c[1]));
    expect(r).toBe('Not enough materials');
    expect(sim.building.place('hub2', wall(0, 0))).toBe('You do not own this plot');
  });

  it('placed walls are solid for the player (physics colliders)', async () => {
    const { sim } = await makeSim(7, (s) => (s.money = 100000));
    sim.plots.buy('hub1');
    const c = PLOT_BY_ID.hub1!.center;
    sim.inventory.add('plank_oak', 50);
    sim.player.teleport(c[0], c[1] + 8);
    run(sim, 1);
    // a long wall east-west across z=c[1]
    for (let i = -2; i <= 2; i++) sim.building.place('hub1', wall(c[0] + i * 4, c[1], sim.streamer.terrain.heightAt(c[0], c[1])));
    run(sim, 1);
    expect([...sim.building.built.values()].every((b) => b.body)).toBe(true);
    const input = (sim.game as any).input;
    input.moveY = 1; // forward
    sim.player.camYaw = 0; // forward = -z, toward the wall
    run(sim, 3);
    expect(sim.player.z).toBeGreaterThan(c[1] + 0.3); // blocked by the wall
  });

  it('blueprints save and load atomically', async () => {
    const { sim, state } = await makeSim(7, (s) => (s.money = 100000));
    sim.plots.buy('hub1');
    sim.plots.buy('hub2');
    const c = PLOT_BY_ID.hub1!.center;
    const y = sim.streamer.terrain.heightAt(c[0], c[1]);
    sim.inventory.add('plank_oak', 100);
    sim.building.place('hub1', wall(c[0], c[1], y));
    sim.building.place('hub1', wall(c[0] + 4, c[1], y));
    expect(sim.building.saveBlueprint('hub1', 'two walls')).toBe(2);
    const c2 = PLOT_BY_ID.hub2!.center;
    expect(sim.building.loadBlueprint('hub2', 'two walls', c2[0], c2[1])).toBeNull();
    expect(state.plots.hub2!.parts.length).toBe(2);
    // not enough planks → fails without placing anything
    sim.inventory.remove('plank_oak', sim.inventory.count('plank_oak'));
    expect(sim.building.loadBlueprint('hub2', 'two walls', c2[0], c2[1] + 6)).toContain('Missing materials');
    expect(state.plots.hub2!.parts.length).toBe(2);
  });

  it('parts and plots survive a save round-trip', async () => {
    const { sim, state } = await makeSim(7, (s) => (s.money = 100000));
    sim.plots.buy('hub1');
    const c = PLOT_BY_ID.hub1!.center;
    sim.inventory.add('plank_oak', 20);
    sim.building.place('hub1', wall(c[0], c[1]));
    const copy = JSON.parse(JSON.stringify(state));
    const { sim: sim2 } = await makeSim(7, (s) => Object.assign(s, copy));
    expect(sim2.building.total()).toBe(1);
  });
});
