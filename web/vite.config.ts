import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served from https://<user>.github.io/traiger-tree/ — hash routing keeps
// deep links working without any server-side rewrites.
export default defineConfig({
  plugins: [react()],
  base: '/traiger-tree/',
  build: { outDir: 'dist', sourcemap: false },
});
