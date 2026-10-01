import { describe, expect, it } from 'vitest';
import { makeSim, run } from './helpers/headless';
import { runCommand } from '../src/core/debug';
import { BIOMES } from '../src/data/biomes';
import { Rng } from '../src/core/rng';

/** Randomized long session: hops between biomes, chops, drives, builds, triggers events; nothing may throw or go NaN. */
describe('soak', () => {
  it('survives a long randomized play session without errors', async () => {
    const minutes = Number(process.env.SOAK_MINUTES ?? 4);
    const { sim, input, game, state } = await makeSim(31337, (s) => (s.money = 1e9));
    const errors: unknown[] = [];
    const origError = console.error;
    console.error = (...a: unknown[]) => errors.push(a);
    game.openPanel = () => {};
    runCommand(game, 'unlockall');
    const rng = new Rng(99);
    const biomes = BIOMES.map((b) => b.id);
    sim.plots.buy('hub1');
    sim.inventory.add('plank_oak', 400);
    let ticksRun = 0;
    for (let step = 0; step < minutes * 6; step++) {
      // each step = 10 game seconds
      const act = rng.int(0, 9);
      const b = rng.pick(biomes);
      switch (act) {
        case 0:
          runCommand(game, `tp ${b}`);
          break;
        case 1: {
          const t = sim.chopping.findTarget(40) ?? sim.trees.near(sim.player.x, sim.player.z, 60)[0];
          if (t) {
            sim.player.teleport(t.x - 2, t.z);
            sim.player.camYaw = -Math.PI / 2;
            input.primary = true;
          }
          break;
        }
        case 2:
          input.primary = false;
          runCommand(game, `weather ${rng.pick(['clear', 'rain', 'snow', 'fog', 'sandstorm', 'storm', 'blizzard', 'ash'])}`);
          break;
        case 3:
          sim.events.start(rng.pick(['wood_rush', 'meteor', 'caravan', 'forest_fire', 'storm', 'merchant']));
          break;
        case 4: {
          const v = rng.pick(state.vehicles);
          if (v) {
            const lv = sim.vehicles.live.get(v.uid)!;
            if (sim.vehicles.current) sim.vehicles.exit();
            if (!lv.def.isTrailer && lv.def.seats > 0) {
              const p = sim.player;
              const T = sim.streamer.terrain;
              sim.streamer.preload(p.x, p.z, 1);
              lv.body.setTranslation({ x: p.x + 4, y: T.heightAt(p.x + 4, p.z) + 3, z: p.z }, true);
              sim.vehicles.enter(lv);
              input.moveY = rng.pick([1, 1, -1, 0]);
              input.moveX = rng.pick([-1, 0, 1]);
            }
          }
          break;
        }
        case 5:
          if (sim.vehicles.current) sim.vehicles.exit();
          input.moveY = 0;
          input.moveX = 0;
          break;
        case 6:
          sim.exchange.update();
          sim.market.recordSale(rng.pick(['oak', 'birch', 'pine']), rng.int(1, 50));
          break;
        case 7:
          if (sim.player.mode === 'foot') sim.nodes.gather(rng.pick(sim.nodes.nodes).id);
          break;
        case 8:
          sim.world.boardFerry();
          break;
        case 9: {
          const logs = [...sim.logs.logs.values()];
          if (logs.length) sim.logs.removeLog(rng.pick(logs).id);
          if (rng.chance(0.2)) game.save(true);
          break;
        }
      }
      run(sim, 10);
      ticksRun += 600;
      const p = sim.player;
      expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
      for (const v of sim.vehicles.live.values()) {
        const t = v.body.translation();
        expect(Number.isFinite(t.x + t.y + t.z)).toBe(true);
      }
      if (state.player.hp < 5) state.player.hp = 100;
    }
    console.error = origError;
    expect(errors).toEqual([]);
    expect(ticksRun).toBeGreaterThan(0);
    expect(sim.logs.logs.size).toBeLessThanOrEqual(260);
  }, 300_000);
});
