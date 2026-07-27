import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// T-1704 · THE VERSION STAMP — `__SQ_VERSION__`
// ---------------------------------------------------------------------------
// Read from the ROOT `package.json`, which is the single source of truth for
// what this build calls itself (a unit test pins the root manifest and all five
// workspace manifests to the same string). Substituted at BUILD TIME, on exactly
// the `__SQ_EDITION__` precedent below and for the same reason: the packaged
// cockpit is served over `app://` out of an asar archive with no `package.json`
// beside it, so a bundle that had to look its own version up at runtime could not
// show one at all. `src/version.ts` is the reading side and fails safe to
// `0.0.0-dev` when nothing substituted it.
const ROOT_VERSION: string = (
  JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
    version?: string;
  }
).version!;

// The engine and content packages are consumed as compiled workspace packages
// (their package `main` points at dist/index.js). `predev`/`prebuild` build them
// before Vite starts, so no source aliasing is needed — Vite resolves the bare
// `@spacerquest/*` specifiers through the npm-workspace symlinks.
//
// ---------------------------------------------------------------------------
// T-1703 · THE DEMO BUILD FLAG — `vite build --mode demo`
// ---------------------------------------------------------------------------
// The edition is COMPILED INTO THE BUNDLE via `define`, not read at runtime. A
// runtime switch (`?edition=full`, an env var the renderer reads at boot) was
// considered and REJECTED at this definition site: a gate that lifts at runtime
// is not a gate, and the demo artifact must be physically incapable of becoming
// the full game. `__SQ_EDITION__` is substituted at build time, so `dist-demo`
// literally contains the string `"demo"` and nothing in the shipped bundle can
// change it.
//
// `--mode` is a CLI FLAG rather than an environment variable, deliberately: the
// dev machine is win32 and `VITE_FOO=x vite build` is not portable across
// PowerShell / cmd / bash. One flag works everywhere, including inside the
// Playwright `webServer` commands.
//
// The two builds keep SEPARATE output directories and SEPARATE preview ports, so
// `e2e/demo-gate.spec.ts` can hold both up side by side in one run and assert the
// same control is gated on one and live on the other — the negative half is what
// makes it a gate proof rather than a screenshot.
export default defineConfig(({ mode }) => {
  const demo = mode === 'demo';
  return {
    plugins: [react()],
    define: {
      // Anything but an exact `--mode demo` compiles to 'full'. `resolveEdition`
      // (src/edition.ts) fails safe the same way on the reading side: a build that
      // cannot prove it is the demo is not the demo — which errs toward MORE
      // gating being required, never less.
      __SQ_EDITION__: JSON.stringify(demo ? 'demo' : 'full'),
      // T-1704 · Both builds carry the SAME version: the demo and the full game
      // are cut from one commit, and a player reporting a bug from either one is
      // reporting it against that commit.
      __SQ_VERSION__: JSON.stringify(ROOT_VERSION),
    },
    server: { port: demo ? 5174 : 5173, strictPort: true },
    preview: { port: demo ? 5174 : 5173, strictPort: true },
    // tsc (the composite typecheck build) emits to dist/; keep Vite's bundle
    // separate so the two never clobber each other. The demo bundle gets its own
    // directory so a demo build can never overwrite the artifact the web e2e suite
    // and `packages/desktop`'s full package are staged from.
    build: { outDir: demo ? 'dist-demo' : 'dist-web', emptyOutDir: true },
  };
});
