import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    proxy: {
      '/ws': { target: 'ws://127.0.0.1:8080', ws: true },
    },
  },
  build: {
    rollupOptions: {
      output: { manualChunks: { three: ['three'] } },
    },
    chunkSizeWarningLimit: 550,
  },
});
