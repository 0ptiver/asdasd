import { describe, expect, it } from 'vitest';
import { makeSim, run } from './helpers/headless';
import { VEHICLES } from '../src/data/vehicles';
import { RAPIER } from '../src/physics/world';

async function setup(def: string, at: [number, number] = [0, 330]) {
  const r = await makeSim(11, (s) => (s.money = 1e9));
  const { sim } = r;
  sim.player.teleport(at[0], at[1]);
  run(sim, 1);
  const o = (sim.vehicles.give(def), sim.state.vehicles[sim.state.vehicles.length - 1]!);
  const lv = sim.vehicles.live.get(o.uid)!;
  const t = sim.streamer.terrain;
  lv.body.setTranslation({ x: at[0], y: t.heightAt(at[0], at[1]) + 2.5, z: at[1] }, true);
  lv.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  lv.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  return { ...r, lv };
}

describe('vehicles', () => {
  it('all vehicle defs spawn a body without throwing', async () => {
    const { sim } = await makeSim(11, (s) => (s.money = 1e9));
    for (const v of VEHICLES) expect(sim.vehicles.give(v.id)).toBe(true);
    expect(sim.vehicles.live.size).toBe(VEHICLES.length);
    run(sim, 2);
    for (const lv of sim.vehicles.live.values()) {
      const t = lv.body.translation();
      expect(Number.isFinite(t.x + t.y + t.z)).toBe(true);
    }
  });

  it('a pickup settles on its suspension, accelerates, steers and brakes', async () => {
    const { sim, lv, input } = await setup('pickup');
    run(sim, 2);
    const t0 = lv.body.translation();
    const g = sim.streamer.terrain.heightAt(t0.x, t0.z);
    expect(t0.y - g).toBeGreaterThan(0.5);
    expect(t0.y - g).toBeLessThan(2.2);
    sim.vehicles.enter(lv);
    input.moveY = 1;
    run(sim, 6);
    const top = lv.speed;
    expect(top).toBeGreaterThan(12);
    expect(top).toBeLessThanOrEqual(lv.def.maxSpeed * 1.1);
    // brake in a straight line
    input.moveY = 0;
    input.keys.add('jump');
    run(sim, 4);
    expect(Math.abs(lv.speed)).toBeLessThan(top * 0.3);
    input.keys.delete('jump');
    // steering changes heading
    input.moveY = 1;
    run(sim, 3);
    const yaw0 = 2 * Math.atan2(lv.body.rotation().y, lv.body.rotation().w);
    input.moveX = 1;
    run(sim, 1.5);
    const yaw1 = 2 * Math.atan2(lv.body.rotation().y, lv.body.rotation().w);
    expect(Math.abs(yaw1 - yaw0)).toBeGreaterThan(0.1);
    const q = lv.body.rotation();
    expect(1 - 2 * (q.x * q.x + q.z * q.z)).toBeGreaterThan(0.7);
  });

  it('fuel burns while driving and an empty tank stops the engine', async () => {
    const { sim, lv, input } = await setup('jeep');
    sim.vehicles.enter(lv);
    run(sim, 1);
    const f0 = lv.owned.fuel;
    input.moveY = 1;
    run(sim, 5);
    expect(lv.owned.fuel).toBeLessThan(f0);
    lv.owned.fuel = 0;
    run(sim, 8);
    expect(Math.abs(lv.speed)).toBeLessThan(6);
  });

  it('a motorboat floats at the water surface and moves under power', async () => {
    const { sim, lv, input } = await setup('motorboat', [210, 300]);
    // river at x≈190+
    const rx = 190 + 45 * Math.sin((300 - 66) * 0.0072) + 16 * Math.sin((300 - 66) * 0.02);
    lv.body.setTranslation({ x: rx, y: 1.5, z: 300 }, true);
    run(sim, 4);
    const t = lv.body.translation();
    expect(t.y).toBeGreaterThan(-1.5);
    expect(t.y).toBeLessThan(1.5);
    sim.vehicles.enter(lv);
    input.moveY = 1;
    run(sim, 3);
    expect(Math.hypot(lv.body.linvel().x, lv.body.linvel().z)).toBeGreaterThan(2);
  });

  it('a balloon climbs with the burner and a helicopter lifts off', async () => {
    for (const id of ['balloon', 'helicopter']) {
      const { sim, lv, input } = await setup(id, [60, 260]);
      sim.vehicles.enter(lv);
      const y0 = lv.body.translation().y;
      input.keys.add('jump');
      run(sim, 4);
      expect(lv.body.translation().y).toBeGreaterThan(y0 + 3);
    }
  });

  it('a log trailer can be hitched and towed', async () => {
    const { sim, input } = await makeSim(11, (s) => (s.money = 1e9));
    sim.player.teleport(0, 330);
    run(sim, 1);
    sim.vehicles.give('pickup');
    sim.vehicles.give('log_trailer');
    const [a, b] = sim.state.vehicles.map((o) => sim.vehicles.live.get(o.uid)!);
    const T = sim.streamer.terrain;
    a!.body.setTranslation({ x: 0, y: T.heightAt(0, 330) + 2.5, z: 330 }, true);
    a!.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    b!.body.setTranslation({ x: 0, y: T.heightAt(0, 322) + 2.5, z: 322 }, true);
    b!.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    run(sim, 2);
    sim.vehicles.enter(a!);
    sim.vehicles.toggleHitch();
    expect(a!.trailer).toBe(b);
    input.moveY = 1;
    run(sim, 6);
    const ta = a!.body.translation(),
      tb = b!.body.translation();
    expect(Math.hypot(ta.x - tb.x, ta.z - tb.z)).toBeLessThan(14);
    expect(a!.speed).toBeGreaterThan(5);
  });
});
void RAPIER;
