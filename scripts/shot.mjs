// Dev helper: node scripts/shot.mjs out.png "js to eval in page after start" [waitMs] [url]
import { chromium } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
const base = '/opt/pw-browsers';
const dir = readdirSync(base).find((d) => d.startsWith('chromium-'));
const exe = `${base}/${dir}/chrome-linux/chrome`;
const [out = '/tmp/shot.png', js = '', wait = '1500', url = 'http://localhost:5173/'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
await page.goto(url);
await page.getByTestId('main-menu').waitFor({ timeout: 90000 });
await page.getByTestId('new-0').click();
await page.getByTestId('start-new').click();
await page.getByTestId('hud').waitFor({ timeout: 90000 });
if (js) { const r = await page.evaluate(js); if (r !== undefined) console.log('eval:', JSON.stringify(r)); }
await page.waitForTimeout(Number(wait));
await page.screenshot({ path: out });
const fps = await page.evaluate(() => window.__game.loop.fps);
console.log('fps', fps.toFixed(1));
if (logs.length) console.log(logs.slice(0, 15).join('\n'));
await browser.close();
