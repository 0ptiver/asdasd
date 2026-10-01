import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig({
  base: './',
  plugins: [preact()],
  build: { target: 'es2022', chunkSizeWarningLimit: 1500, sourcemap: false },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
