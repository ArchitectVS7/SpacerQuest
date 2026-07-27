import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEMO_MAX_DISTRIBUTABLE_BYTES, formatMegabytes, overBudget } from '../size';

// ---------------------------------------------------------------------------
// T-1703 · The demo package's two non-code artifacts — the size budget and the
// Steam depot scripts — held to what they claim.
//
// Neither can be proved by a packaging run in CI (no runner packages Electron on
// every commit, and none has steamcmd), so what IS provable is pinned here: the
// budget's boundary behaviour, and that the depot pair agrees with itself and
// with the electron-builder config it stages from. A drift between
// `electron-builder.demo.json`'s output directory and the VDFs' ContentRoot
// would otherwise be found by a human, once, at release.
// ---------------------------------------------------------------------------

const HERE = join(__dirname, '..', '..');
const read = (...parts: string[]): string => readFileSync(join(HERE, ...parts), 'utf8');

describe('T-1703 · the demo size budget', () => {
  it('is the 200MB the Accept states, in decimal MB', () => {
    // Decimal, because that is what a storefront and a download progress bar
    // mean by "MB" — the number a player compares this against.
    expect(DEMO_MAX_DISTRIBUTABLE_BYTES).toBe(200_000_000);
    expect(formatMegabytes(DEMO_MAX_DISTRIBUTABLE_BYTES)).toBe('200.0 MB');
  });

  it('passes at and below the budget, fails above it', () => {
    expect(overBudget(0)).toBe(false);
    expect(overBudget(DEMO_MAX_DISTRIBUTABLE_BYTES - 1)).toBe(false);
    expect(overBudget(DEMO_MAX_DISTRIBUTABLE_BYTES)).toBe(false); // exactly at is not over
    expect(overBudget(DEMO_MAX_DISTRIBUTABLE_BYTES + 1)).toBe(true);
  });

  it('passes the measured full-build installer, with the headroom recorded', () => {
    // The baseline this task measured on win32 before changing anything:
    // `release/Rimward Setup 1.0.0.exe` = 101,932,947 B. The demo package is
    // SMALLER (same runtime, same cockpit, minus every locale but en-US), so if
    // the full installer clears the budget the demo cannot fail it for any reason
    // this repo controls. Pinned as a REGRESSION GUARD on the budget, not as a
    // claim about a file that may not exist on this machine.
    const MEASURED_FULL_INSTALLER_BYTES = 101_932_947;
    expect(overBudget(MEASURED_FULL_INSTALLER_BYTES)).toBe(false);
    expect(formatMegabytes(MEASURED_FULL_INSTALLER_BYTES)).toBe('101.9 MB');
  });

  it('treats an unmeasurable size as OVER budget, never as a pass', () => {
    // A failed measurement must not read as "the size is fine" — the one way a
    // budget check can be worse than no budget check at all.
    expect(overBudget(Number.NaN)).toBe(true);
    expect(overBudget(Number.POSITIVE_INFINITY)).toBe(true);
    expect(overBudget(-1)).toBe(true);
  });
});

describe('T-1703 · the Steam depot scripts', () => {
  const app = read('steam', 'app_build_demo.vdf');
  const depot = read('steam', 'depot_build_demo.vdf');
  // The config is CommonJS rather than JSON so it can carry the reasoning for its
  // own settings (electron-builder's schema validator rejects `"//"` comment keys
  // outright). Loading it the way electron-builder does is also the strongest
  // form of this test: a config that fails to evaluate fails here first.
  const builder = createRequire(join(HERE, 'package.json'))(
    join(HERE, 'electron-builder.demo.cjs'),
  ) as {
    appId: string;
    productName: string;
    directories: { output: string };
    files: string[];
    electronLanguages: string[];
  };

  it('the app script references the depot script by filename', () => {
    // The pair only works if the reference resolves; a renamed depot file with a
    // stale reference fails at `run_app_build`, which is a release-day discovery.
    expect(app).toContain('depot_build_demo.vdf');
  });

  it('both scripts stage from the demo package output directory', () => {
    // THE DRIFT THIS FILE EXISTS FOR: electron-builder writes to
    // `release-demo/`, and both VDFs must read from the same tree. Change one
    // without the other and steamcmd uploads an empty (or stale) depot.
    expect(builder.directories.output).toBe('release-demo');
    expect(app).toContain('"contentroot"\t"../release-demo/win-unpacked"');
    expect(depot).toContain('"contentroot"\t"../release-demo/win-unpacked"');
    // Forward slashes on purpose — a Windows-style path in a committed script
    // breaks on the macOS runner. Asserted so it cannot drift back.
    expect(app).not.toContain('\\');
    expect(depot).not.toContain('\\');
  });

  it('carries PLACEHOLDER ids, matching the repo’s no-partner-id rule', () => {
    // The same rule `steam.ts`'s COMPILED_STEAM_APP_ID follows and its own unit
    // test pins: this repo holds no partner ids, and a real one committed by
    // accident would point dev builds at a live Steam product. Asserted so the
    // placeholders cannot be quietly replaced without this test being updated
    // deliberately (T-1704 does exactly that).
    expect(app).toMatch(/"appid"\s+"0"/);
    expect(depot).toMatch(/"DepotID"\s+"0"/);
  });

  it('the demo package is a DIFFERENT product from the full game', () => {
    // A demo that shared the full game's appId/productName would install over it
    // — and the demo's whole job is to hand a career to a full game that must
    // still be there to receive it.
    expect(builder.appId).toBe('com.spacerquest.rimward.demo');
    expect(builder.appId).not.toBe('com.spacerquest.rimward');
    expect(builder.productName).toBe('Rimward Demo');
  });

  it('ships the demo renderer and NOT the full one', () => {
    // The property `main.ts`'s RENDERER_DIR resolution depends on: exactly one of
    // the two staged directories exists in any given package.
    expect(builder.files).toContain('renderer-demo/**/*');
    expect(builder.files).not.toContain('renderer/**/*');
  });

  it('ships one locale, the free size reduction', () => {
    // ~46 MB of locale packs for a game that ships no localization (TASKS.md
    // "Deliberately deferred"). Real weight removed, not a trick to pass a check.
    expect(builder.electronLanguages).toEqual(['en-US']);
  });
});
