// ---------------------------------------------------------------------------
// T-1703 · THE DEMO'S SIZE BUDGET.
//
// The Accept says "build size sane (<200MB)", and the interesting question is
// WHICH SIZE — because this repo produces two numbers that differ by 3.5x and
// only one of them is honest.
//
// **THE BUDGET MEASURES THE DISTRIBUTABLE ARTIFACT** — the installer / zip a
// player downloads, and the thing that compresses into a Steam depot. NOT the
// unpacked tree.
//
// The measured baseline, taken on win32 before this task changed anything:
//   * `release/Rimward Setup 1.0.0.exe` .......... 101,932,947 B (~97 MiB)
//   * `release/win-unpacked/` (the tree) ......... ~357 MB
// and the unpacked tree breaks down as ~216 MB `Rimward.exe` (the Electron /
// Chromium runtime), ~47 MB `locales/`, ~25 MB `dxcompiler.dll` — with the GAME's
// own payload at ~9.5 MB in `resources/`.
//
// So the unpacked number is almost entirely Chromium, is never transferred in
// that form, and would fail a 200 MB budget for reasons no amount of work on this
// game could change. Measuring it would be measuring Electron. The installer is
// what a player waits for and what a depot stores, so that is the number, and it
// clears the budget with ~100 MB of headroom.
//
// The demo package is SMALLER than the full one, not larger: same runtime, same
// cockpit bundle, minus every locale but en-US (`electronLanguages` in
// `electron-builder.demo.json`, which alone drops ~46 MB from the tree).
// ---------------------------------------------------------------------------

/**
 * The ceiling, in bytes, for a DISTRIBUTABLE demo artifact (installer / zip).
 * 200 MB as the Accept states it — decimal MB, because that is what a storefront
 * and a download progress bar mean by "MB".
 */
export const DEMO_MAX_DISTRIBUTABLE_BYTES = 200 * 1000 * 1000;

/** Whether an artifact of `bytes` blows the budget. Pure, so `scripts/
 *  check-size.mjs` carries no policy of its own — it measures and calls this.
 *  A non-finite or negative size is treated as OVER budget: a measurement that
 *  failed must not read as a pass. */
export function overBudget(bytes: number): boolean {
  if (!Number.isFinite(bytes) || bytes < 0) return true;
  return bytes > DEMO_MAX_DISTRIBUTABLE_BYTES;
}

/** Human-readable MB, one decimal — for the check script's output and for a
 *  failure message a human can act on. */
export function formatMegabytes(bytes: number): string {
  return `${(bytes / (1000 * 1000)).toFixed(1)} MB`;
}
