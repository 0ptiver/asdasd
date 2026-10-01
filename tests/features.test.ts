import { describe, expect, it } from 'vitest';
import { makeSim, run } from './helpers/headless';
import { PLOT_BY_ID } from '../src/data/plots';
import { BOSS_BY_ID } from '../src/data/bosses';
import { OUTPOSTS } from '../src/world/landmarks';
import { BRIDGE } from '../src/world/layout';

describe('crafting & market', () => {
  it('crafts furniture from planks at a bench and sells it for more than the planks', async () => {
    const { sim, state } = await makeSim(5, (s) => (s.money = 10000));
    sim.inventory.add('plank_oak', 40);
    const bench = sim.hub.layout.points.find((p) => p.id === 'public_bench')!;
    expect(bench).toBeTruthy();
    sim.player.teleport(bench.x, bench.z + 2);
    run(sim, 1);
    expect(sim.crafting.craftFurniture('chair', 'oak')).toBe(false); // needs crafting level 1
    expect(sim.crafting.craftFurniture('barrel', 'oak')).toBe(true);
    state.skills.crafting = 400;
    expect(sim.crafting.craftFurniture('chair', 'oak')).toBe(true);
    expect(sim.inventory.count('chair@oak')).toBeGreaterThanOrEqual(1);
    expect(sim.inventory.count('plank_oak')).toBeLessThanOrEqual(32);
    expect(state.skills.crafting).toBeGreaterThan(0);
    const chairPrice = sim.market.itemPrice('chair@oak');
    const plankPrice = sim.market.itemPrice('plank_oak') * 4;
    expect(chairPrice).toBeGreaterThan(0);
    expect(chairPrice).toBeGreaterThan(plankPrice);
  });
  it('futures have capped risk and auctions charge a tax', async () => {
    const { sim, state } = await makeSim(5, (s) => (s.money = 100000));
    const before = state.money;
    expect(sim.exchange.openFuture('oak', 1, 1000, 3)).toBe(true);
    expect(state.money).toBe(before - 1000);
    // crash the price: loss is capped at the stake
    sim.market.recordSale('oak', 100000);
    const f = state.market.futures[0]!;
    expect(sim.exchange.futureValue(f)).toBeGreaterThanOrEqual(0);
    expect(sim.exchange.futureValue(f)).toBeLessThanOrEqual(3000);
    sim.exchange.closeEarly(f.id);
    expect(state.market.futures.length).toBe(0);
    // auction: buy costs price + fee
    sim.exchange.refreshAuctions();
    const a = state.market.auctions[0]!;
    const m0 = state.money;
    expect(sim.exchange.buy(a.id)).toBe(true);
    expect(m0 - state.money).toBeGreaterThan(a.price);
  });
});

describe('jobs & workers', () => {
  it('delivery jobs pay out with reputation and a time bonus', async () => {
    const { sim, state } = await makeSim(5, (s) => (s.money = 100000));
    sim.shop.buyAxe('plain_axe');
    state.jobs = [];
    sim.jobs.generate(3);
    const j = state.jobs.find((x) => x.kind === 'planks')! ?? state.jobs[0]!;
    j.kind = 'planks';
    j.item = 'plank_oak';
    j.wood = 'oak';
    j.units = 10;
    j.reward = 500;
    j.expires = state.time + 1;
    j.bonusBy = state.time + 0.5;
    sim.jobs.accept(j.id);
    sim.inventory.add('plank_oak', 10);
    const m0 = state.money;
    expect(sim.jobs.deliver(j.id)).toBe(true);
    expect(state.money - m0).toBeGreaterThanOrEqual(750);
    expect(state.rep[j.town]).toBeGreaterThan(0);
    expect(state.stats.jobs).toBe(1);
  });
  it('workers produce planks over time and wages are deducted', async () => {
    const { sim, state } = await makeSim(5, (s) => (s.money = 1e6));
    state.discoveredSpecies.push('oak');
    expect(sim.workers.hire('oak')).toBe(true);
    run(sim, 30);
    const w = state.workers[0]!;
    expect(w.stock).toBeGreaterThan(0);
    w.stock = 100;
    w.owed = 50;
    const m0 = state.money;
    expect(sim.workers.collect(w.id)).toBe(100);
    expect(sim.inventory.count('plank_oak')).toBe(100);
    expect(state.money).toBeLessThan(m0);
  });
});

describe('plot businesses', () => {
  it('a personal sawmill saws logs into its output bin; upgrades add yield', async () => {
    const { sim, state } = await makeSim(7, (s) => (s.money = 1e7));
    sim.plots.buy('hub1');
    const c = PLOT_BY_ID.hub1!.center;
    const y = sim.streamer.terrain.heightAt(c[0], c[1]);
    sim.player.teleport(c[0], c[1] + 10);
    run(sim, 1);
    const r = sim.building.place('hub1', ['sawmill', c[0], y, c[1], 0, 1, 1, 1, 0, 0]);
    expect(typeof r).not.toBe('string');
    const b = [...sim.building.built.values()][0]!;
    const z = sim.businesses.zone(b);
    sim.logs.spawnLog('oak', 3, 0.45, { x: z.x, y: z.y + 0.3, z: z.z }, null, null, null);
    run(sim, 8);
    expect(sim.logs.logs.size).toBe(0);
    expect(sim.businesses.outCount(b)).toBeGreaterThanOrEqual(2);
    expect(sim.businesses.collect(b)).toBeGreaterThanOrEqual(2);
    expect(sim.inventory.count('plank_oak')).toBeGreaterThanOrEqual(2);
    expect(sim.businesses.upgrade(b)).toBe(true);
    expect(sim.businesses.state(b).level).toBe(2);
    expect(state.plots.hub1!.businesses[String(b.p[10])]).toBeTruthy();
  });
});

describe('world features', () => {
  it('fast travel needs discovery and costs money', async () => {
    const { sim } = await makeSim(5, (s) => (s.money = 100000));
    expect(sim.world.travel('redwood')).toBe(false);
    const st = sim.world.stationList.find((s) => s.id === 'redwood')!;
    sim.player.teleport(st.x, st.z);
    run(sim, 1);
    expect(sim.state.world.stations).toContain('redwood');
    sim.player.teleport(0, 12);
    run(sim, 1);
    const m0 = sim.state.money;
    expect(sim.world.travel('redwood')).toBe(true);
    expect(sim.state.money).toBeLessThan(m0);
    expect(Math.hypot(sim.player.x - st.x, sim.player.z - st.z)).toBeLessThan(5);
  });
  it('the bridge toll gate blocks the player until paid', async () => {
    const { sim, input } = await makeSim(5, (s) => (s.money = 1000));
    sim.player.teleport(BRIDGE.x - BRIDGE.halfLen - 8, BRIDGE.z);
    run(sim, 1);
    input.moveY = 1;
    sim.player.camYaw = -Math.PI / 2; // facing +x (east, across the bridge)
    run(sim, 3);
    expect(sim.player.x).toBeLessThan(BRIDGE.x - BRIDGE.halfLen + 0.5);
    expect(sim.world.payToll()).toBe(true);
    run(sim, 6);
    expect(sim.player.x).toBeGreaterThan(BRIDGE.x - BRIDGE.halfLen + 2);
  });
  it('outposts earn passive income', async () => {
    const { sim } = await makeSim(5, (s) => (s.money = 1e7));
    const o = OUTPOSTS[0]!;
    expect(sim.world.buyOutpost(o.id)).toBe(true);
    sim.state.world.outposts[o.id]!.lastMs -= 3 * 3.6e6; // 3 hours ago
    const pending = sim.world.outpostPending(o.id);
    expect(pending).toBeGreaterThan(o.income * 1.4);
    const m0 = sim.state.money;
    sim.world.collectOutpost(o.id);
    expect(sim.state.money - m0).toBe(pending);
  });
  it('secrets give one-time rewards', async () => {
    const { sim } = await makeSim(5);
    const s = sim.world.secrets[0]!;
    const m0 = sim.state.money;
    sim.world.findSecret(s);
    sim.world.findSecret(s);
    expect(sim.state.world.secrets.filter((x) => x === s.id).length).toBe(1);
    expect(sim.state.money > m0 || sim.state.stats.secrets === 1).toBe(true);
  });
  it('mining, foraging and digging give resources', async () => {
    const { sim } = await makeSim(5, (s) => (s.money = 100000));
    sim.inventory.add('pickaxe', 1);
    const ore = sim.nodes.nodes.find((n) => n.kind === 'ore')!;
    expect(sim.nodes.gather(ore.id)).toBe(true);
    expect(sim.inventory.count(ore.item)).toBeGreaterThanOrEqual(1);
    expect(sim.nodes.gather(ore.id)).toBe(false); // depleted until respawn
    sim.inventory.add('treasure_map', 1);
    expect(sim.nodes.useMap()).toBe(true);
    sim.inventory.add('shovel', 1);
    expect(sim.nodes.dig()).toBe(true);
  });
});

describe('guardians, prestige, achievements', () => {
  it('a guardian can be felled and drops rewards + logs', async () => {
    const { sim, state } = await makeSim(5, (s) => (s.money = 1e9));
    const def = BOSS_BY_ID.old_hollow!;
    sim.player.teleport(def.pos[0] + 6, def.pos[1] + 6);
    run(sim, 2);
    const b = sim.bosses.states.get('old_hollow')!;
    expect(sim.trees.trees.get(b.tree.id)).toBe(b.tree);
    const m0 = state.money;
    sim.trees.hit(b.tree, b.tree.maxHp);
    sim.bosses.kill(b.tree);
    expect(state.stats.bosses).toBe(1);
    expect(state.money).toBeGreaterThan(m0);
    expect(sim.logs.logs.size).toBeGreaterThanOrEqual(6);
    expect(sim.bosses.isDown('old_hollow')).toBe(true);
  });
  it('achievements unlock and pay out; prestige resets money for multipliers', async () => {
    const { sim, state } = await makeSim(5, (s) => (s.money = 1000));
    state.stats.trees = 1;
    run(sim, 3);
    expect(state.achievements).toContain('first_tree');
    expect(sim.prestige.canPrestige()).toBe(false);
    state.totalEarned = 5_000_000;
    state.money = 3_000_000;
    state.achievements.push('keepme');
    expect(sim.prestige.doPrestige()).toBe(true);
    expect(state.prestige.level).toBe(1);
    expect(state.money).toBeLessThan(1000);
    expect(state.achievements).toContain('keepme');
    expect(sim.market.bonus()).toBeGreaterThan(1.2);
  });
});
