// node scripts/tour.mjs '[["name","js",waitMs],...]'
import { chromium } from '@playwright/test';
import { readdirSync } from 'node:fs';
const base = '/opt/pw-browsers';
const dir = readdirSync(base).find((d) => d.startsWith('chromium-'));
const exe = `${base}/${dir}/chrome-linux/chrome`;
const shots = JSON.parse(process.argv[2] || '[]');
const size = process.argv[3] ? process.argv[3].split('x').map(Number) : [960, 540];
const browser = await chromium.launch({
  executablePath: exe,
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--no-sandbox',
  ],
});
const page = await browser.newPage({ viewport: { width: size[0], height: size[1] } });
const logs = [];
page.on('console', (m) => {
  if (['error', 'warning'].includes(m.type())) logs.push(m.type() + ': ' + m.text());
});
page.on('pageerror', (e) =>
  logs.push('PAGEERROR: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')),
);
await page.goto('http://localhost:5173/');
await page.getByTestId('main-menu').waitFor({ timeout: 90000 });
await page.getByTestId('new-0').click();
await page.getByTestId('start-new').click();
await page.getByTestId('hud').waitFor({ timeout: 90000 });
for (const [name, js, wait = 1500] of shots) {
  if (js) {
    const r = await page.evaluate(js);
    if (r !== undefined) console.log(name, 'eval:', JSON.stringify(r));
  }
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `/tmp/${name}.png` });
}
if (logs.length) console.log(logs.slice(0, 15).join('\n'));
await browser.close();
