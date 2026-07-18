/// <reference types="vite/client" />

// T-1703 · The demo build flag rides a custom Vite env var. `types: ["vite/client"]`
// (packages/ui/tsconfig.json) already types `import.meta.env`, but a CUSTOM `VITE_*`
// var must be declared here or `tsc -b` rejects the read in `demo.ts`. Optional (`?`)
// because the full/web build never sets it — its absence IS the "not a demo" signal.
interface ImportMetaEnv {
  readonly VITE_SQ_DEMO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// T-1704 · The build-time version stamp, baked by Vite `define` (vite.config.ts) from
// this package's `version`. Declared here so `tsc -b` and the renderer both see the
// global. Rendered in the always-visible bezel (App.tsx, `data-testid="app-version"`)
// and asserted by src/__tests__/version.test.ts (the named reader).
declare const __APP_VERSION__: string;
