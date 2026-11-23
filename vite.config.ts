import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: { input: { arcade: 'index.html', roomTone: 'room-tone/index.html' } },
  },
  test: { include: ['tests/**/*.test.ts', 'tests/**/*.test.mjs'] },
});
