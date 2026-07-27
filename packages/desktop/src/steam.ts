// ---------------------------------------------------------------------------
// T-1702a · THE STEAMWORKS CORE.
//
// "steamworks.js initialization with the graceful no-Steam fallback designed in
// from the start" (the Accept). BOTH halves are structural here rather than a
// matter of inspection:
//
//   * PRESENT — `initSteam` runs on every launch, resolves a status, and that
//     status is shown to the player (Settings → Steam). Its READER CHAIN is:
//     `main.ts`'s `steamStatus` → the `sq-shell:about` IPC channel →
//     `preload.ts`'s `about()` → `packages/ui/src/storage.ts`'s `steamStatus` →
//     `App.tsx`'s `SteamRow`. Constraint 7 discharged end to end, asserted by
//     `e2e/shell.spec.ts`, `e2e/packaged.spec.ts` and (on the web backend)
//     `packages/ui/e2e/settings-saves.spec.ts`.
//   * GRACEFUL — the no-Steam path is not an error path. `initSteam` NEVER
//     THROWS and {@link SteamSession.unlock} NEVER THROWS: a missing
//     `steamworks.js`, a native ABI mismatch, an unsupported OS/arch, a Steam
//     client that is not running and a game launched outside Steam are all the
//     SAME player-visible outcome — `state: 'unavailable'` — and the app is
//     otherwise byte-identical. That is asserted by unit tests here and, at the
//     product level, by the two T-1701a shell e2e tests which launch with no
//     Steam at all and stayed green with NO EDITS.
//
// PURE NODE — NO `electron` IMPORT, the same discipline (and the same
// structural test) as `saveStore.ts` and `updater.ts`. Everything about the
// world arrives by injection through {@link SteamHost}, including the loader
// itself: this module never names the native package at all, in an import or a
// require — a fact a structural test in `__tests__/steam.test.ts` pins, because
// even an `import type` from an OPTIONAL dependency is a hard compile error the
// moment that optional install is skipped, which is precisely the state this
// file exists to support. Two more things depend on it: the module unit-tests
// with no Electron binary AND no native Steam binary (so CI's `Build, lint,
// test` job keeps running under `ELECTRON_SKIP_BINARY_DOWNLOAD: 1`), and the
// achievement POLICY stays testable independently of the process model. The
// single guarded require lives in `main.ts`'s `loadSteamClient`, resolved lazily
// at `whenReady`.
//
// WHAT THIS MODULE DOES NOT KNOW. It has never heard of a Deed. `packages/desktop`
// has zero workspace dependencies (see `tsconfig.json`'s no-`references`
// comment) and this task keeps that: the deed → achievement mapping lives in
// `packages/ui/src/steam.ts`, which already imports `@spacerquest/content`, and
// what crosses the bridge is a STRING. A shell that knew what a deed was would
// be a shell with a game rule in it.
//
// T-1702b · ONE CLIENT LOAD, THREE CONSUMERS. `initSteam` is still the ONLY
// guarded load and the ONLY graceful-fallback try/catch in this package. Steam
// Cloud (`cloud.ts`) and rich presence (`presence.ts`) are handed the SAME client
// through {@link SteamSession.client} rather than each performing their own
// `require` and their own app-id resolution — which is what makes them
// `unavailable` EXACTLY when Steam is, structurally, instead of by three copies
// of the same reasoning. Neither of those modules is a game rule either: one
// moves opaque save bytes under key names the shell already owns, the other
// publishes two numbers the engine already round-trips.
//
// THE ONE RUNTIME DEPENDENCY. T-1701a/b stated "zero runtime dependencies"; that
// claim is amended (here, in `main.ts` and in `updater.ts`) rather than left to
// rot. The package now has ZERO WORKSPACE DEPENDENCIES and exactly ONE OPTIONAL
// NATIVE DEPENDENCY — `steamworks.js`, declared under `optionalDependencies` —
// whose ABSENCE IS A SUPPORTED, TESTED STATE (`reason: 'load-failed'`). It ships
// prebuilt `.node` binaries for win32-x64, linux-x64 and darwin x64/arm64 in its
// own tarball, so `npm ci` needs no toolchain and `npmRebuild: false` stays.
// ---------------------------------------------------------------------------

import { appendFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
// T-1702b · LOCAL modules, so the "never import from an optional dependency"
// rule above is untouched — `cloud.ts` and `presence.ts` duplicate their slices
// of the steamworks.js surface exactly as this file does, precisely so nothing
// anywhere in `packages/desktop` names the optional package at type level. Said
// out loud so a later reader does not think the rule was bent.
import type { CloudClientLike } from './cloud';
import type { PresenceClientLike } from './presence';

/**
 * What Steam resolved to on this launch.
 *
 *  - `ready` — the native binding loaded and `init(appId)` succeeded, so
 *    achievements will be sent.
 *  - `unavailable` — anything else. THE SHIPPED STATE for every build this repo
 *    produces today, because {@link COMPILED_STEAM_APP_ID} is `null`.
 *
 * Two states, not five, because the player-facing question is binary ("are my
 * achievements being recorded?"). The five distinguishable causes live in
 * {@link SteamStatus.reason}, which is a developer's question.
 */
export type SteamState = 'ready' | 'unavailable';

export interface SteamStatus {
  state: SteamState;
  /**
   * Why, in machine-readable form: `'no-app-id' | 'not-loaded' | 'load-failed' |
   * 'init'`. Diagnostic only — the player-facing surface shows
   * {@link SteamState}, the same split `updater.ts` uses.
   */
  reason: string;
  /** The app id Steam was initialised against, or `null` when nothing was. */
  appId: number | null;
}

/** What one {@link SteamSession.unlock} call actually did. Honest rather than
 *  boolean, because the four outcomes have genuinely different meanings and the
 *  e2e/log evidence depends on telling them apart:
 *
 *   - `unavailable` — no Steam. Nothing was attempted.
 *   - `already` — Steam says this achievement is already unlocked for this user,
 *     so the native call is skipped. This is what keeps a 44-deed BACKFILL from
 *     being 44 redundant native calls on every boot.
 *   - `unlocked` — `activate` accepted it.
 *   - `rejected` — the call reached Steamworks and Steamworks said no. The
 *     ordinary cause is an API name the partner backend does not define, which
 *     is exactly what happens under the Spacewar (480) dev sandbox. NOT swallowed
 *     into `unlocked`: "it reached Steam and Steam refused" is the single most
 *     useful thing a Steamworks integration can tell you. */
export type UnlockResult = 'unavailable' | 'already' | 'unlocked' | 'rejected';

/**
 * The slice of steamworks.js's client this module uses.
 *
 * DUPLICATED rather than imported, so this module stays dependency-free at TYPE
 * level too (an `import type` from an optional dependency is a compile error the
 * moment the optional install is skipped — which is precisely the state this
 * whole file exists to support). T-1702a said "two members are the whole surface;
 * if it grows, it grows here and nowhere else" — IT GREW, and the sentence is
 * amended rather than left to rot: T-1702b added `cloud` and `localplayer`, and
 * this is still the one place the shape of the client is stated.
 *
 * THE TWO NEW MEMBERS ARE OPTIONAL, and that is load-bearing twice over: a
 * binding that predates those namespaces degrades to `unavailable` (see
 * `cloud.ts`'s `no-binding` and `presence.ts`'s equivalent) instead of throwing,
 * AND every pre-existing fake client in the unit suite keeps typechecking with no
 * edits, which is the rebalance-fallout rule applied to a type.
 */
export interface SteamClientLike {
  achievement: {
    activate(name: string): boolean;
    isActivated(name: string): boolean;
  };
  /** T-1702b · Steam Cloud (`ISteamRemoteStorage`). See `cloud.ts`. */
  cloud?: CloudClientLike;
  /** T-1702b · Rich presence lives on `localplayer`. See `presence.ts`. */
  localplayer?: PresenceClientLike;
}

/** Everything {@link initSteam} is allowed to know about the world. Injected so
 *  the unit suite can drive every branch with no Steam client, no native binary
 *  and no Electron. */
export interface SteamHost {
  isPackaged: boolean;
  env: Record<string, string | undefined>;
  /**
   * Load + initialise the native binding for `appId`.
   *
   * Free to return `null` OR to THROW — `steamworks.js` throws from module scope
   * on an unsupported OS/arch, `init()` throws when the Steam client is not
   * running, and `require` throws when the optional dependency was never
   * installed. All three are the same player-visible outcome, so the contract
   * deliberately accepts either failure shape rather than demanding the caller
   * normalise them.
   */
  load(appId: number): SteamClientLike | null;
  log?(message: string): void;
}

/** A resolved Steam session. `unlock` is total: it answers for every input on
 *  every path, including "there is no Steam". */
export interface SteamSession {
  status: SteamStatus;
  unlock(apiName: string): UnlockResult;
  /**
   * T-1702b · DECISION B — ONE CLIENT LOAD, THREE CONSUMERS.
   *
   * The client this session initialised, or `null` on every `unavailable` path.
   * Exposed so `main.ts` can hand the SAME object to `initCloud` and
   * `initPresence` rather than performing a second guarded require and
   * a second app-id resolution. The consequence is the property this task wants:
   * cloud and presence are `unavailable` EXACTLY when Steam is, through one code
   * path, so "the no-Steam fallback still clean for both features" is structural
   * rather than three copies of the same try/catch.
   */
  readonly client: SteamClientLike | null;
}

/**
 * THE APP ID.
 *
 * `null` in every build this repository produces today — which is why the
 * shipped state is `unavailable`, and is asserted by a unit test so an app id
 * cannot be committed by accident. This repo holds no partner app id: obtaining
 * one is part of setting up the store page — `docs/RELEASE-CHECKLIST.md` item
 * **D4**, still open — and a committed id would make every dev build try to talk
 * to a real Steam product.
 *
 * A build (or a developer) supplies one with `SQ_STEAM_APP_ID`. `480` is
 * Spacewar, Valve's public dev sandbox, and is how this task's Steam evidence is
 * produced — see the Delivered note.
 */
export const COMPILED_STEAM_APP_ID: number | null = null;

/**
 * Environment override, for the dev sandbox and the unit/e2e suites.
 *
 * Blank, non-numeric, non-integer and non-positive values all count as ABSENT
 * rather than as an app id of `0`/`NaN` — a blank env var is how a CI matrix says
 * "not this one", and `init(0)` would be a call into the native layer with
 * garbage.
 */
export function resolveAppId(host: SteamHost): number | null {
  const raw = host.env.SQ_STEAM_APP_ID?.trim();
  if (!raw) return COMPILED_STEAM_APP_ID;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return COMPILED_STEAM_APP_ID;
  return parsed;
}

/**
 * TEST-ONLY · Where the recording Steam client writes, or `null` for "use the
 * real one".
 *
 * REFUSED WHEN PACKAGED, unconditionally. A packaged build that could be talked
 * into a fake Steam client by an environment variable is a packaged build whose
 * achievement state an attacker can write to a file of their choosing; and the
 * packaged e2e's whole job is to prove the REAL path. The flag lives entirely in
 * `packages/desktop` — the same rule `SQ_STORAGE=web` follows — so the cockpit
 * carries no test flag anywhere.
 */
export function resolveFakeLogPath(host: SteamHost): string | null {
  if (host.isPackaged) return null;
  const raw = host.env.SQ_STEAM_FAKE?.trim();
  return raw ? raw : null;
}

/**
 * T-1702b · TEST-ONLY · Where the recording client's FAKE STEAM CLOUD lives, or
 * `null` for "no cloud".
 *
 * REFUSED WHEN PACKAGED, unconditionally, for exactly the reason
 * {@link resolveFakeLogPath} is: a packaged build whose cloud store an
 * environment variable can redirect is a packaged build with an
 * attacker-chosen save directory — and the packaged e2e's whole job is to prove
 * the REAL path. Like every other test switch in this project it lives entirely
 * in `packages/desktop`, so the cockpit carries no test flag anywhere.
 */
export function resolveFakeCloudDir(host: SteamHost): string | null {
  if (host.isPackaged) return null;
  const raw = host.env.SQ_STEAM_FAKE_CLOUD?.trim();
  return raw ? raw : null;
}

/**
 * TEST-ONLY · A {@link SteamClientLike} that records to a JSONL file instead of
 * talking to Steam.
 *
 * This is what lets `e2e/shell.spec.ts` assert that a deed earned BY PLAYING
 * arrived on the far side of the real IPC bridge, in the real Electron main
 * process — without a Steam client on the runner. It answers `isActivated` from
 * its own log, so the dedupe path (`already`) is exercised for real rather than
 * stubbed.
 *
 * T-1702b · IT NOW RECORDS ALL THREE SURFACES:
 *
 *   * achievements — the unchanged JSONL `{"achievement": name}` lines;
 *   * presence — `{"presence": {"key": k, "value": v}}` appended to the SAME log,
 *     so one file is the whole record of what crossed into the main process;
 *   * cloud — a REAL, FILE-BACKED fake when `cloudDir` is given: one file per
 *     name, so `writeFile`/`readFile`/`fileExists` are a genuine round trip
 *     through the filesystem rather than an in-memory stub that could not
 *     survive the relaunch the Accept's round-trip test depends on. With no
 *     `cloudDir` there is no `cloud` member at all, which is how a launch proves
 *     the `no-binding` degradation.
 *
 * Every method swallows its own I/O errors: a test harness that cannot write its
 * log must not be able to fail a player's action, which is the same rule the
 * real path follows.
 */
export function createRecordingClient(logPath: string, cloudDir?: string | null): SteamClientLike {
  const lines = (): { achievement?: string }[] => {
    try {
      return readFileSync(logPath, 'utf8')
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as { achievement?: string });
    } catch {
      return []; // no log yet, or an unreadable one — nothing is activated
    }
  };
  const append = (entry: unknown): boolean => {
    try {
      appendFileSync(logPath, `${JSON.stringify(entry)}\n`, 'utf8');
      return true;
    } catch {
      return false;
    }
  };

  const client: SteamClientLike = {
    achievement: {
      isActivated: (name) => lines().some((entry) => entry.achievement === name),
      activate: (name) => append({ achievement: name }),
    },
    // Presence is write-only on the real API too, so recording it is the whole
    // fake. `value` may be `null` (a clear), and that is recorded as `null`
    // rather than dropped — a spec that asserts the quit-time clear needs it.
    localplayer: {
      setRichPresence: (key, value) => {
        append({ presence: { key, value: value ?? null } });
      },
    },
  };

  if (cloudDir) {
    const file = (name: string): string => join(cloudDir, name);
    client.cloud = {
      // A fake cloud that was configured IS enabled; there is no partner-site
      // switch to consult in a test.
      isEnabledForApp: () => true,
      isEnabledForAccount: () => true,
      fileExists: (name) => {
        try {
          return existsSync(file(name));
        } catch {
          return false;
        }
      },
      readFile: (name) => {
        try {
          return readFileSync(file(name), 'utf8');
        } catch {
          return '';
        }
      },
      writeFile: (name, content) => {
        try {
          mkdirSync(cloudDir, { recursive: true });
          writeFileSync(file(name), content, 'utf8');
          return true;
        } catch {
          return false;
        }
      },
    };
  }

  return client;
}

/**
 * Resolve — and, only with an app id, initialise — Steam for this launch.
 *
 * NEVER THROWS. A Steam integration that can take the app down at boot is worse
 * than no Steam integration: the player loses the game to a storefront feature
 * they did not ask for. Every call into the injected loader is inside the one
 * try/catch below, and any failure degrades to `unavailable`.
 *
 * The order of the checks is the contract, and each step has a test in
 * `__tests__/steam.test.ts`.
 */
export function initSteam(host: SteamHost): SteamSession {
  // 1. NO APP ID → the shipped state, and `load` is NEVER CALLED. Asserted as an
  //    empty call log on a recording fake (the `updater.test.ts` pattern), not by
  //    reading this comment: a build with no app id must not so much as touch the
  //    native binding, because merely requiring the native package throws on an
  //    unsupported OS/arch — before any of our code runs.
  const appId = resolveAppId(host);
  if (appId === null)
    return session(host, { state: 'unavailable', reason: 'no-app-id', appId: null }, null);

  // 2. THE GRACEFUL FALLBACK, and it is a try/catch rather than a guess: the
  //    optional dependency may be absent, its native ABI may mismatch this
  //    Electron, the OS/arch may be unsupported, or the Steam client may simply
  //    not be running. Every one of those is a throw, and every one of them is
  //    the same answer to the player.
  let client: SteamClientLike | null;
  try {
    client = host.load(appId);
  } catch (err) {
    host.log?.(`unavailable: ${err instanceof Error ? err.message : String(err)}`);
    return session(host, { state: 'unavailable', reason: 'load-failed', appId: null }, null);
  }

  // 3. A loader that declined without throwing (no binding for this platform).
  if (!client) {
    host.log?.('unavailable: no Steam client could be loaded');
    return session(host, { state: 'unavailable', reason: 'not-loaded', appId: null }, null);
  }

  host.log?.(`ready against app ${appId}`);
  return session(host, { state: 'ready', reason: 'init', appId }, client);
}

/** Build the session object. Split out so every `initSteam` exit produces the
 *  SAME `unlock` contract — an `unavailable` session is a real session that
 *  answers, not a null a caller has to check. */
function session(
  host: SteamHost,
  status: SteamStatus,
  client: SteamClientLike | null,
): SteamSession {
  return {
    status,
    // T-1702b · Decision B: the one loaded client, handed on to cloud + presence.
    client,
    unlock(apiName: string): UnlockResult {
      // 4. NO STEAM → nothing is attempted and nothing throws. This is the path
      //    every build this repo ships takes.
      if (!client) return 'unavailable';

      // 5. DEDUPE AT THE SOURCE. The cockpit backfills a loaded career's whole
      //    earned set on boot (see `packages/ui/src/steam.ts`), so without this a
      //    44-deed veteran would make 44 redundant native calls every launch.
      //    A throwing `isActivated` is NOT fatal — fall through and let
      //    `activate` be the judge, since a redundant activate is harmless.
      try {
        if (client.achievement.isActivated(apiName)) return 'already';
      } catch (err) {
        host.log?.(
          `isActivated(${apiName}) failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // 6. THE CALL. `false` means Steamworks REFUSED it — almost always an API
      //    name the partner backend does not define (which is what our names do
      //    under Spacewar). Reported honestly and logged, never folded into
      //    success.
      try {
        const ok = client.achievement.activate(apiName);
        if (!ok) host.log?.(`rejected by Steam: ${apiName}`);
        return ok ? 'unlocked' : 'rejected';
      } catch (err) {
        // 7. A throw from the native layer degrades here rather than becoming an
        //    unhandled exception in the main process. An achievement is
        //    cosmetic; a crashed main process is the whole game.
        host.log?.(
          `activate(${apiName}) failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        return 'rejected';
      }
    },
  };
}
