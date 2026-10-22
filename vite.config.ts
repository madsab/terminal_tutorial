import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist/client',
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        admin: resolve(import.meta.dirname, 'admin.html'),
      },
    },
  },
  server: {
    proxy: {
      '/ws': { target: 'ws://localhost:8080', ws: true },
      '/local-assets': { target: 'http://localhost:8080' },
    },
  },
  test: { include: ['tests/**/*.test.ts'] },
});
