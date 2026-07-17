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
