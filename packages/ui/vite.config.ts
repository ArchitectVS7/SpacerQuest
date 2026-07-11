import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The engine and content packages are consumed as compiled workspace packages
// (their package `main` points at dist/index.js). `predev`/`prebuild` build them
// before Vite starts, so no source aliasing is needed — Vite resolves the bare
// `@spacerquest/*` specifiers through the npm-workspace symlinks.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
  // tsc (the composite typecheck build) emits to dist/; keep Vite's bundle
  // separate so the two never clobber each other.
  build: { outDir: 'dist-web', emptyOutDir: true },
});
