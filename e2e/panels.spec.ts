import { test, expect } from '@playwright/test';

test('every panel renders without errors and biomes can be visited', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/');
  await page.getByTestId('main-menu').waitFor({ timeout: 60_000 });
  await page.getByTestId('new-1').click();
  await page.getByTestId('start-new').click();
  await expect(page.getByTestId('hud')).toBeVisible({ timeout: 60_000 });
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.sim.econ.earn(5e7, 'test');
    g.sim.shop.buyAxe('plain_axe');
  });
  const panels: [string, string?][] = [
    ['inventory'],
    ['quests'],
    ['map'],
    ['land'],
    ['garage'],
    ['gas'],
    ['market'],
    ['exchange'],
    ['craft'],
    ['smith'],
    ['workers'],
    ['achievements'],
    ['traveler'],
    ['train'],
    ['net'],
    ['pause'],
    ['sell'],
    ['shop', 'tools'],
    ['shop', 'gear'],
    ['shop', 'harbor'],
    ['shop', 'airfield'],
    ['outpost', 'op_birch'],
    ['npc', 'gus'],
    ['npc', 'ivy'],
  ];
  for (const [name, arg] of panels) {
    await page.evaluate(
      ([n, a]) => {
        const g = (window as any).__game;
        g.closePanel();
        g.openPanel(n, a);
      },
      [name, arg],
    );
    await page.waitForTimeout(250);
    await expect(page.locator('.panel')).toBeVisible();
  }
  await page.evaluate(() => (window as any).__game.closePanel());
  // visit every biome (streams chunks, builds meshes, runs hazards/weather)
  for (const b of [
    'birchwood',
    'cherry',
    'redwood',
    'swamp',
    'goldbasin',
    'volcano',
    'taiga',
    'tropics',
    'crystal',
    'deepcave',
    'desert',
    'haunted',
    'sky',
  ]) {
    await page.evaluate((id) => {
      const g = (window as any).__game;
      g.sim.state.player.hp = 100;
      g.sim.player.teleport(
        ...((): [number, number, number | undefined] => {
          const c: any = (
            {
              birchwood: [-480, -120],
              cherry: [480, -160],
              redwood: [0, -540],
              swamp: [-560, 420],
              goldbasin: [520, 460],
              volcano: [1000, -560],
              taiga: [-700, -1100],
              tropics: [950, 850],
              crystal: [-1000, -150],
              deepcave: [-1150, -650],
              desert: [0, 1000],
              haunted: [-1050, 850],
              sky: [300, -1150],
            } as any
          )[id];
          return [c[0], c[1], id === 'sky' ? 228 : undefined];
        })(),
      );
    }, b);
    await page.waitForTimeout(900);
  }
  await page.evaluate(() => (window as any).__game.sim.player.teleport(0, 12));
  await page.waitForTimeout(500);
  const name = await page.evaluate(() => (window as any).__game.sim.biome.current.id);
  expect(typeof name).toBe('string');
  expect(errors).toEqual([]);
});
