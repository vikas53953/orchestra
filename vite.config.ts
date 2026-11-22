import { defineConfig } from 'vite';

export default defineConfig({
  root: 'apps/desktop/src/renderer',
  base: './',
  oxc: { jsx: { runtime: 'automatic' } },
  build: { outDir: '../../../../out/renderer', emptyOutDir: true },
});
