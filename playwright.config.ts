import { defineConfig } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';

function chromePath(): string | undefined {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  if (!existsSync(base)) return undefined;
  const dir = readdirSync(base).find((d) => d.startsWith('chromium-')) ?? readdirSync(base).find((d) => d.startsWith('chromium'));
  if (!dir) return undefined;
  for (const sub of ['chrome-linux/chrome', 'chrome-linux64/chrome']) {
    if (existsSync(`${base}/${dir}/${sub}`)) return `${base}/${dir}/${sub}`;
  }
  return undefined;
}

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions: { executablePath: chromePath(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] },
    viewport: { width: 1280, height: 720 },
  },
  webServer: { command: 'npm run build && npx vite preview --port 4173', port: 4173, reuseExistingServer: true, timeout: 180_000 },
});
