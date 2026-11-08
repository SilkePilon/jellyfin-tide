/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative: client.css resolves fonts next to itself (/Tide/assets/...), so a Jellyfin base URL (/jellyfin/Tide/...) works.
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    cssCodeSplit: false,
    rollupOptions: {
      input: 'src/main.ts',
      output: {
        format: 'iife',
        name: 'Tide',
        entryFileNames: 'client.js',
        // fonts are served with immutable caching: content-hash them. client.css stays unhashed (?v= busted).
        assetFileNames: (info) =>
          info.names?.some((n) => n.endsWith('.css')) ? 'client.css' : 'assets/[name]-[hash][extname]',
      },
    },
  },
  test: { environment: 'jsdom', globals: true, setupFiles: ['test/setup.ts'] },
});
