import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served from https://<user>.github.io/Traiger-Tree/. A relative base means
// assets resolve next to index.html whatever the path (or its casing) is, and
// hash routing keeps deep links working without server-side rewrites.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist', sourcemap: false },
});
