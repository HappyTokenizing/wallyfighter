import { defineConfig } from 'vite'
import { shotSink } from './tools/shot-sink.js'

export default defineConfig({
  base: './',
  plugins: [shotSink()],
  server: { port: 5173, strictPort: true },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // v2.0 P2: the single bundle blew past 1500 kB — split the heavy,
        // self-contained content packs from the core loop so the mobile/touch
        // first load parses less per chunk (and caches them independently).
        manualChunks(id) {
          if (id.includes('node_modules')) return 'vendor' // three + cannon-es
          if (id.includes('/src/arenas/')) return 'arenas'
          if (id.includes('/src/characters/')) return 'characters'
          if (id.includes('/src/audio/')) return 'audio'
        },
      },
    },
  },
})
