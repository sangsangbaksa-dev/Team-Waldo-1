import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: { arcade: 'index.html', roomTone: 'room-tone/index.html', projectHarbor: 'project-harbor/index.html', harborPlay: 'project-harbor/play/index.html' },
    },
  },
  test: { include: ['tests/**/*.test.ts'] },
});
