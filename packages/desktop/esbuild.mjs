// ============================================================================
//  T-1701 · Bundle the Electron main + preload into self-contained CJS
// ============================================================================
//
// WHY bundle instead of shipping raw `tsc` output:
//
// electron-builder runs a "dependencies install/rebuild" pass (app-builder-lib's
// `installOrRebuild`) whenever the app directory has no local `node_modules`. In an
// npm-workspaces monorepo every dependency is HOISTED to the repo-root
// `node_modules`, so `packages/desktop/node_modules` does not exist — electron-builder
// therefore shells out to `npm install --production` with `cwd = packages/desktop`,
// which npm resolves as a workspace-wide prune that strips ALL devDependencies from
// the shared root `node_modules`. That prune deletes `app-builder-bin` (and
// electron-builder itself) mid-run, so packaging dies with
// `spawn .../app-builder_arm64 ENOENT` and never produces an app. (This is the
// well-known electron-builder + hoisted-workspace incompatibility.)
//
// The robust fix is to make the packaged app need ZERO runtime `node_modules`: we
// bundle `main.ts` and `preload.ts` (inlining `electron-updater` and every other JS
// dependency) into standalone CJS files, leaving only `electron` external because the
// runtime always provides it. Combined with `npmRebuild: false` in
// electron-builder.yml, electron-builder has nothing to install or rebuild, so the
// destructive workspace prune never runs and the app is fully self-contained in
// `dist/`.
//
// The bundle is the SAME artifact used by dev / `electron .` / the e2e `_electron`
// launches, so there is a single main-process code path everywhere.

import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.ts', 'src/preload.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  // Electron injects `electron` at runtime; everything else (electron-updater and
  // its transitive deps) is inlined so no node_modules ship in the app.
  //
  // T-1702 · `steamworks.js` is the ONE exception: it is a NATIVE prebuilt addon
  // (`.node` binaries) that cannot be bundled into JS, so it stays external and is
  // `require`d at runtime from node_modules. electron-builder ships it unpacked out of
  // the asar (see electron-builder.yml `files` + `asarUnpack`). `steam-achievements.ts`
  // (pure content-derived logic) IS bundled; only the native surface is external.
  external: ['electron', 'steamworks.js'],
  outdir: 'dist',
  logLevel: 'info',
});
