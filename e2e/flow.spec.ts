import { test, expect } from '@playwright/test';

test('new save → buy axe → chop a tree → saw & sell planks → saved state survives reload', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/');
  await page.getByTestId('main-menu').waitFor({ timeout: 60_000 });
  await page.getByTestId('new-0').click();
  await page.getByTestId('start-new').click();
  await expect(page.getByTestId('hud')).toBeVisible({ timeout: 60_000 });

  // buy an axe via the shop logic, walk to a tree, chop it
  const result = await page.evaluate(async () => {
    const g = (window as any).__game;
    const sim = g.sim;
    const step = (secs: number, each?: (i: number) => void) => {
      for (let i = 0; i < secs * 60; i++) {
        each?.(i);
        sim.step(1 / 60);
      }
    };
    sim.econ.earn(500, 'test');
    sim.shop.buyAxe('plain_axe');
    sim.player.teleport(0, 150);
    step(2);
    const p = sim.player;
    const trees = sim.trees
      .near(p.x, p.z, 300)
      .filter((t: any) => t.wood === 'oak' && !t.mut && t.scale < 1.1)
      .sort((a: any, b: any) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    const t = trees[0];
    const dx = t.x - p.x,
      dz = t.z - p.z,
      d = Math.hypot(dx, dz);
    p.teleport(t.x - (dx / d) * 2.4, t.z - (dz / d) * 2.4);
    p.camYaw = Math.atan2(-dx, -dz);
    step(0.5);
    g.input.primary = true;
    step(30);
    g.input.primary = false;
    step(4);
    const logsMade = sim.logs.logs.size;
    // drag all logs to the sawmill intake and let it saw them
    const z = sim.hub.layout.sawIntake;
    for (const l of [...sim.logs.logs.values()]) l.body.setTranslation({ x: z.x, y: z.y + 1, z: z.z }, true);
    step(8);
    sim.sawmill.collect();
    const planks = sim.inventory.count('plank_oak');
    const before = sim.state.money;
    sim.sell.sellItem('plank_oak', planks);
    await g.save(false);
    return {
      felled: sim.state.stats.trees,
      logsMade,
      planks,
      gained: sim.state.money - before,
      money: sim.state.money,
    };
  });
  expect(result.felled).toBe(1);
  expect(result.logsMade).toBeGreaterThanOrEqual(2);
  expect(result.planks).toBeGreaterThanOrEqual(2);
  expect(result.gained).toBeGreaterThan(0);

  // reload and continue the save
  await page.reload();
  await page.getByTestId('main-menu').waitFor({ timeout: 60_000 });
  await page.getByTestId('continue-0').click();
  await expect(page.getByTestId('hud')).toBeVisible({ timeout: 60_000 });
  const after = await page.evaluate(() => {
    const s = (window as any).__game.state;
    return {
      money: s.money,
      axes: s.axes.length,
      trees: s.stats.trees,
      chopped: Object.keys(s.world.chopped).length,
    };
  });
  expect(after.money).toBe(result.money);
  expect(after.axes).toBe(1);
  expect(after.trees).toBe(1);
  expect(after.chopped).toBe(1);
  expect(errors).toEqual([]);
});
