// ---------------------------------------------------------------------------
// T-1703 · THE DEMO PACKAGE.
//
// A SEPARATE electron-builder config rather than a flag on the full one, because
// a demo is a DIFFERENT PRODUCT on a storefront: its own appId, its own product
// name, its own install directory and its own output tree — so a demo build can
// never overwrite or be mistaken for the full game on a player's machine. That
// matters more here than usual: the demo's whole job is to hand a career to a
// full game that must still be installed to receive it.
//
// The full package's config stays inline in `package.json`, untouched.
//
// CommonJS, not JSON, and that is deliberate: electron-builder's schema
// validator REJECTS unknown keys, so a `.json` config cannot carry the reasoning
// for its own settings (it rejects `"//"` comment keys outright). Every other
// non-obvious constant in this repo is argued at its definition site, and a
// packaging config is not the place to start making exceptions.
// `src/__tests__/demo-package.test.ts` requires this file and pins the settings
// the Steam depot scripts depend on.
// ---------------------------------------------------------------------------

module.exports = {
  appId: 'com.spacerquest.rimward.demo',
  productName: 'Rimward Demo',
  extraMetadata: { name: 'rimward-demo' },
  directories: { output: 'release-demo' },

  // `renderer-demo` (staged by `scripts/copy-renderer.mjs --edition demo`)
  // INSTEAD of `renderer`. Exactly one of the two ever ships, which is what lets
  // `main.ts` resolve the bundle as a PATH question and never learn what an
  // edition is — the cockpit's compiled `BUILD_EDITION` stays the only answer to
  // "which edition is this?".
  files: ['dist/**/*', 'renderer-demo/**/*', 'package.json', 'node_modules/steamworks.js/**'],
  asarUnpack: ['**/node_modules/steamworks.js/**'],

  electronVersion: '43.2.0',
  npmRebuild: false,
  publish: null,

  // en-US only. The game ships no localization (TASKS.md lists it under
  // "Deliberately deferred"), so the other ~50 locale packs are ~46 MB of dead
  // weight in every package — a real, free reduction against the size budget in
  // `src/size.ts` rather than a trick to pass it. When localization lands, this
  // list grows with it.
  electronLanguages: ['en-US'],

  mac: { target: ['dir', 'zip'], category: 'public.app-category.games' },
  win: { target: ['dir', 'nsis'] },

  // A distinct install directory and shortcut name, so the demo and the full game
  // coexist on one machine.
  nsis: { shortcutName: 'Rimward Demo' },
};
