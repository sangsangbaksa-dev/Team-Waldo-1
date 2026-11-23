import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  resolve: { alias: [{ find: /^three$/, replacement: 'three/src/Three.js' }] },
  build: {
    rollupOptions: {
      output: {
        onlyExplicitManualChunks: true,
        manualChunks(id) {
          if (id.includes('/node_modules/three/src/renderers/shaders/ShaderChunk/')) return 'three-shaders';
          if (id.includes('/node_modules/three/')) return 'three';
        },
      },
    },
  },
});
