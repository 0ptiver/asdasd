import { describe, expect, it } from 'vitest';
import { makeSim, run } from './helpers/headless';
import { PLOT_BY_ID } from '../src/data/plots';
import type { PlacedPart } from '../src/save/schema';

async function setup() {
  const r = await makeSim(9, (s) => (s.money = 1e7));
  r.sim.plots.buy('hub1');
  r.sim.inventory.add('plank_oak', 300);
  r.sim.crafting; // ensure present
  r.state.skills.crafting = 10000; // unlock logic parts
  const c = PLOT_BY_ID.hub1!.center;
  const y = r.sim.streamer.terrain.heightAt(c[0], c[1]);
  r.sim.player.teleport(c[0], c[1] + 12);
  run(r.sim, 1);
  const put = (k: string, dx: number, dz: number, ry = 0) => {
    const res = r.sim.building.place('hub1', [k, c[0] + dx, y, c[1] + dz, ry, 1, 1, 1, 0, 0] as PlacedPart);
    if (typeof res === 'string') throw new Error(k + ': ' + res);
    return res;
  };
  return { ...r, put, c, y };
}

describe('logic building', () => {
  it('a wired switch opens a door and powers a piston', async () => {
    const { sim, put, state } = await setup();
    const sw = put('switch', -5, 3);
    const door = put('door', 0, 0);
    const piston = put('piston', 5, 0);
    sim.building.toggleWire(sw, door);
    sim.building.toggleWire(sw, piston);
    expect(state.plots.hub1!.wires.length).toBe(2);
    run(sim, 0.5);
    expect(door.open).toBe(false);
    sw.power = true;
    run(sim, 1);
    expect(door.open).toBe(true);
    expect(sim.logic.extension(piston)).toBeGreaterThan(0.8);
    sw.power = false;
    run(sim, 1);
    expect(door.open).toBe(false);
    expect(sim.logic.extension(piston)).toBeLessThan(0.2);
  });

  it('AND and NOT gates combine signals', async () => {
    const { sim, put } = await setup();
    const a = put('switch', -6, 4),
      b = put('switch', -4, 4);
    const and = put('gate_and', -5, 2);
    const not = put('gate_not', -5, 0);
    const lamp = put('lamp', 0, 4);
    sim.building.toggleWire(a, and);
    sim.building.toggleWire(b, and);
    sim.building.toggleWire(and, not);
    sim.building.toggleWire(not, lamp);
    run(sim, 0.3);
    expect(sim.logic.power.get(lamp.id)).toBe(true); // NOT(AND(false,false))
    a.power = true;
    run(sim, 0.3);
    expect(sim.logic.power.get(lamp.id)).toBe(true);
    b.power = true;
    run(sim, 0.3);
    expect(sim.logic.power.get(lamp.id)).toBe(false); // both on → AND true → NOT false
  });

  it('wires survive save/load and removing a wire works', async () => {
    const { sim, put, state } = await setup();
    const sw = put('switch', 0, 0),
      door = put('door', 4, 0);
    sim.building.toggleWire(sw, door);
    const copy = JSON.parse(JSON.stringify(state));
    expect(copy.plots.hub1.wires[0]).toEqual([sw.p[10], door.p[10]]);
    sim.building.toggleWire(sw, door);
    expect(state.plots.hub1!.wires.length).toBe(0);
  });
});
