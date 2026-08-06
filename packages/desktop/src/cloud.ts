// ---------------------------------------------------------------------------
// T-1702b · STEAM CLOUD, ON THE SEED-CARRYING T-1002 ENVELOPE.
//
// TECH-STACK §2 promised this for free ("full game state round-trips through
// JSON — saves … and eventually Steam Cloud come free") and §3 named it
// ("Steam Cloud for saves"). `docs/PRD-REIMAGINED.md` says nothing about Steam,
// cloud saves or presence (verified by grep), so there is NO PRD divergence to
// comment for this module — the governing spec is TECH-STACK, and its "Steam
// Cloud and rich presence are T-1702b" sentence is replaced in this same commit
// with what actually shipped.
//
// DECISION A — THE API, NOT AUTO-CLOUD, AND WHY.
// Steam offers two mechanisms. AUTO-CLOUD is a partner-site path glob with zero
// code; it is REJECTED here, deliberately, because the Accept says the cloud
// round trip must be VERIFIED in the dev sandbox — and a feature with no code has
// no test, no named reader and no failure mode anyone can prove is graceful. The
// ISteamRemoteStorage API path (`client.cloud.*`) is testable end to end against
// a fake, carries an honest status the player can read in Settings, and is what
// makes standing constraints 6 and 7 dischargeable at all. (It also means
// Auto-Cloud must stay OFF on the partner site — both at once would double-write
// the same files; see `docs/STEAM-ACHIEVEMENTS.md`'s partner-site section.)
//
// DECISION B — THE CONFLICT POLICY IS RESTORE-ONLY-WHEN-ABSENT.
// Cloud → local happens ONLY when the local file is absent. Local → cloud happens
// on every write, coalesced. That is not taste, it is a missing primitive plus a
// standing precedent:
//
//   * steamworks.js's `listFiles()` returns NAME AND SIZE ONLY — there is no
//     modification time in the binding at all — so "newest wins" cannot be
//     implemented honestly against this API. Designing around a timestamp that
//     does not exist would be a guess dressed as a merge.
//   * Overwriting a live local career with a stale cloud copy is exactly the
//     data-loss class this repo has already refused twice: `storage.ts`'s
//     `migrateInto` SEMANTIC 3 — "NEVER overwrites a key already present in the
//     target — a desktop career already in progress beats a stale browser one" —
//     and T-1605a's quarantine-before-write rule. This is that same law applied
//     to a second medium, not a new invention.
//
// So the shipped promise is precise, and the Settings row says it in those words:
// Steam Cloud SEEDS a machine that has no career yet, and BACKS UP the one you
// have. It is NOT a two-way merge; two-way conflict resolution is deliberately
// out of scope (see the Delivered note), because without a timestamp the only
// honest two-way policy would be to ask the player, and a save-conflict dialog is
// its own feature with its own Accept.
//
// PURE NODE — NO `electron` IMPORT, NO `steamworks.js` IMPORT, AND NO `node:fs`
// IMPORT EITHER. The same discipline (and the same structural test) as
// `steam.ts`, `updater.ts` and `saveStore.ts`: everything about the world arrives
// through the injected {@link CloudHost}, which is what lets the unit suite drive
// every branch with no Electron binary and no native Steam binary, so CI's
// `Build, lint, test` job keeps running under `ELECTRON_SKIP_BINARY_DOWNLOAD: 1`.
// The single guarded require of the native package still lives in `main.ts` —
// this file may not even NAME it in a quoted string, which the structural scan in
// `__tests__/steam.test.ts` pins along with the two import forms. And the
// local reads/writes are the SAME `saveStore.ts` the storage IPC channels use —
// the cloud must never grow a second, unvalidated path to the save directory.
//
// NO GAME RULE LIVES HERE, and none could: this module moves opaque BYTES under
// key names the shell already owns (`saveStore.ts`'s `SAFE_KEY`, `main.ts`'s
// `resolveSaveDir`). It has never heard of a seed, a day or a Deed. Standing
// constraint 3 is N/A with the reason: no `GameState` field, no `GameEvent`,
// `CURRENT_SAVE_VERSION` unmoved and no `MIGRATIONS` entry owed — what crosses
// the wire is the EXISTING T-1002 envelope, byte for byte.
// ---------------------------------------------------------------------------

/**
 * The slice of steamworks.js's `cloud` namespace this module uses.
 *
 * DUPLICATED from steamworks.js, never imported — an `import type` from an
 * OPTIONAL dependency is a hard compile error the moment the optional install is
 * skipped, which is precisely the state this file exists to support. Same
 * reasoning, and same rule, as `steam.ts`'s {@link SteamClientLike}.
 */
export interface CloudClientLike {
  isEnabledForAccount(): boolean;
  isEnabledForApp(): boolean;
  readFile(name: string): string;
  writeFile(name: string, content: string): boolean;
  fileExists(name: string): boolean;
}

/**
 * Whether saves are syncing on this launch.
 *
 * Two states, not five, for the same reason `steam.ts`'s {@link SteamState} has
 * two: the player-facing question is binary ("are my careers backed up?"). The
 * distinguishable CAUSES live in {@link CloudStatus.reason}, which is a
 * developer's question and stays in the log.
 */
export type CloudState = 'ready' | 'unavailable';

export interface CloudStatus {
  state: CloudState;
  /**
   * Why, in machine-readable form: `'no-steam' | 'no-binding' |
   * 'disabled-for-app' | 'disabled-for-account' | 'ready'`. Diagnostic only.
   */
  reason: string;
  /**
   * Files pulled DOWN from the cloud on this launch, by save-store key name.
   *
   * READER: `main.ts`'s `about` reply (as a COUNT) → `preload.ts`'s `about()` →
   * `packages/ui/src/storage.ts`'s `cloudRestored` → `App.tsx`'s Settings
   * "Steam → Cloud saves" row. The names themselves stay here and in the log:
   * a filename list on a Settings row is developer output, not a player line.
   */
  restored: readonly string[];
}

/** Everything {@link initCloud} is allowed to know about the world. Injected so
 *  the unit suite can drive every branch with no Steam client, no native binary,
 *  no Electron and no real save directory. */
export interface CloudHost {
  /** `null` when there is no Steam at all, or when the loaded binding has no
   *  `cloud` namespace (a steamworks.js older than 0.4). */
  client: CloudClientLike | null;
  /** Read one save-store key. `null` for "no such file", exactly as
   *  `saveStore.ts`'s `getItem` reports a first run. MAY THROW — a blocked or
   *  unreadable store is caught by this module and reported, never propagated. */
  readLocal(name: string): string | null;
  /** Write one save-store key. MAY THROW; see above. */
  writeLocal(name: string, content: string): void;
  /** `setTimeout` in the main process; captured by the tests so the coalescing
   *  window is observable rather than slept through. */
  schedule(run: () => void, ms: number): void;
  log?(message: string): void;
}

/** A resolved cloud session. Total on every path: an `unavailable` session is a
 *  real session that answers, not a `null` every caller has to check — the same
 *  contract `steam.ts`'s {@link SteamSession} holds. */
export interface CloudSession {
  status: CloudStatus;
  /**
   * A save key was just written locally. Marks it dirty and arms the coalescing
   * flush. NEVER THROWS, NEVER BLOCKS, and never performs the upload inline —
   * see {@link CLOUD_FLUSH_MS}.
   */
  mark(name: string): void;
  /** Write every dirty name up, now. Called by the coalescing timer and — this
   *  is why it must be synchronous and total — by `main.ts`'s `before-quit`. */
  flush(): void;
}

/**
 * THE ALLOWLIST — which save-store keys ride the cloud.
 *
 * `sq.save.v1` is the autosave (the seed-carrying T-1002 envelope the Accept
 * names); `sq.slot.{1,2,3}.v1` are the three manual slots; `sq.slot.N.meta` is a
 * slot's display summary, and it is carried because WITHOUT IT a restored slot
 * renders as "Empty" in Settings — restoring the envelope alone would be a
 * half-restore the player reads as data loss.
 *
 * THE EXCLUSIONS ARE THE INTERESTING PART, so each is stated rather than left to
 * the regex, and a blanket "mirror every `sq.` key" was rejected on the second
 * one alone:
 *
 *   * `sq.save.v1.corrupt` — T-1605a's quarantine blob. Syncing damage to every
 *     machine the player owns is the exact opposite of what quarantine is for.
 *   * `sq.migrated.from-localstorage.v1` — MACHINE-LOCAL state. Syncing it DOWN
 *     would make a fresh machine skip its own localStorage import, so this one
 *     marker crossing the cloud is a CAREER-LOSS BUG, not untidiness.
 *   * `sq.fx`, `sq.vol.*`, `sq.audio.muted`, `sq.motion-tier`, `sq.text-size`,
 *     `sq.onboarding.v1`, `sq.save.seed` — display and machine settings, not
 *     careers. The Accept scopes this task to the envelope, and a player who
 *     turns the CRT off on a laptop has not asked for it off on their desktop.
 *
 * This is a STORAGE policy, not a game rule, which is why it may live in
 * `packages/desktop` at all: the shell already owns save-file naming (see
 * `saveStore.ts`'s `SAFE_KEY` and `main.ts`'s `resolveSaveDir`). It never inspects
 * a single byte of what it moves.
 */
const CLOUD_CARRIED = /^sq\.(save\.v1|slot\.[123]\.(v1|meta))$/;

/** The names {@link initCloud} tries to pull down, in restore order. Enumerated
 *  (rather than derived from a cloud listing) because the RESTORE has to know
 *  what to ask for before anything local exists, and because an allowlist that
 *  can only be widened by an edit here is the point. */
const CLOUD_NAMES: readonly string[] = [
  'sq.save.v1',
  'sq.slot.1.v1',
  'sq.slot.1.meta',
  'sq.slot.2.v1',
  'sq.slot.2.meta',
  'sq.slot.3.v1',
  'sq.slot.3.meta',
];

/**
 * How long a dirty key waits before it is uploaded.
 *
 * NOT a tuning knob picked by feel. `store.ts` autosaves after EVERY mutating
 * action, so an uncoalesced 1:1 upload would turn a sitting's ~200 actions into
 * 200 cloud writes of a save T-1605c measured at up to ~10.9 MiB. Three seconds
 * is long enough that a burst of actions costs one write and short enough that a
 * player who alt-F4s has at most a few seconds of play unbacked — and the quit
 * path flushes synchronously anyway, so the ordinary close loses nothing.
 */
export const CLOUD_FLUSH_MS = 3000;

/** Whether a save-store key rides the cloud. Exported for the unit test, which
 *  pins the exclusions by name — see {@link CLOUD_CARRIED}. */
export function isCloudCarried(name: string): boolean {
  return CLOUD_CARRIED.test(name);
}

/**
 * Resolve Steam Cloud for this launch, and perform the restore.
 *
 * NEVER THROWS, the same contract and the same reason as `initSteam`: a
 * storefront feature must not be able to take the game down at boot. Every call
 * into the injected host and the native binding is inside a try/catch, and any
 * failure degrades to `unavailable` (or, per name, to "that one did not come
 * down") rather than propagating.
 *
 * The RESTORE happens before this function returns, and `main.ts` calls it before
 * `createWindow` for a load-bearing reason stated there: the cockpit reads
 * `sq.save.v1` at MODULE SCOPE, so a window created first would boot a fresh
 * career on a machine whose cloud save was sitting one call away.
 */
export function initCloud(host: CloudHost): CloudSession {
  const restored: string[] = [];
  const status = resolveStatus(host);

  if (status.state === 'ready') {
    // The client is non-null on every `ready` path (see `resolveStatus`), but the
    // restore reasserts it rather than using a `!` — this runs at boot, where an
    // optimistic assertion costs the player their career.
    const client = host.client;
    if (client) restoreAll(host, client, restored);
  }

  return session(host, { ...status, restored }, status.state === 'ready' ? host.client : null);
}

/**
 * THE STATUS ORDER IS THE CONTRACT, and each step has its own unit test.
 *
 *   1. no client            → `unavailable/no-steam` (no Steam, or Steam refused)
 *   2. no `cloud` namespace → `unavailable/no-binding` (a pre-0.4 steamworks.js)
 *   3. `isEnabledForApp`    → `unavailable/disabled-for-app` (partner-site switch)
 *   4. `isEnabledForAccount`→ `unavailable/disabled-for-account` (the player's own
 *                              Steam setting — their choice, not a fault)
 *   5. otherwise            → `ready`
 *
 * Steps 3 and 4 are asked in that order because the app-level switch is the one a
 * developer can actually act on; both are read once, at boot, because they are
 * account/app settings rather than per-write state.
 */
function resolveStatus(host: CloudHost): Omit<CloudStatus, 'restored'> {
  const client = host.client;
  if (!client) return { state: 'unavailable', reason: 'no-steam' };
  // A binding that predates the `cloud` namespace hands us an object without it.
  // Degrade, do not throw: this is the same "an old binding is not a crash" rule
  // the optional members on `SteamClientLike` exist for.
  if (typeof client.isEnabledForApp !== 'function') {
    host.log?.('unavailable: this Steam binding has no cloud namespace');
    return { state: 'unavailable', reason: 'no-binding' };
  }
  try {
    if (!client.isEnabledForApp()) {
      host.log?.('unavailable: Steam Cloud is disabled for this app');
      return { state: 'unavailable', reason: 'disabled-for-app' };
    }
    if (!client.isEnabledForAccount()) {
      host.log?.('unavailable: Steam Cloud is disabled for this account');
      return { state: 'unavailable', reason: 'disabled-for-account' };
    }
  } catch (err) {
    host.log?.(`unavailable: ${err instanceof Error ? err.message : String(err)}`);
    return { state: 'unavailable', reason: 'no-binding' };
  }
  host.log?.('ready');
  return { state: 'ready', reason: 'ready' };
}

/**
 * Pull down every carried name the local store does not already hold.
 *
 * SEMANTIC 3, cited by name: a local file that exists is NEVER overwritten, so a
 * career in progress on this machine always beats whatever the cloud holds. That
 * is `storage.ts`'s `migrateInto` rule applied to a second medium.
 *
 * PER-NAME ISOLATION: a throw on one name is caught, logged and skipped, and the
 * rest still restore. A corrupt cloud copy of slot 2 must not cost the player
 * slot 1 or their autosave.
 */
function restoreAll(host: CloudHost, client: CloudClientLike, restored: string[]): void {
  for (const name of CLOUD_NAMES) {
    try {
      if (host.readLocal(name) !== null) continue; // semantic 3
      if (!client.fileExists(name)) continue;
      const bytes = client.readFile(name);
      // A cloud entry that exists but reads as nothing is not a save. Writing an
      // empty file would turn "no career here" into "a career that will not load".
      if (typeof bytes !== 'string' || bytes.length === 0) continue;
      host.writeLocal(name, bytes);
      restored.push(name);
      host.log?.(`restored ${name} from Steam Cloud (${bytes.length} bytes)`);
    } catch (err) {
      host.log?.(`restore of ${name} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

/** Build the session object. Split out so EVERY `initCloud` exit produces the
 *  same `mark`/`flush` contract — an `unavailable` session still answers, and
 *  answers by doing nothing at all. */
function session(
  host: CloudHost,
  status: CloudStatus,
  client: CloudClientLike | null,
): CloudSession {
  const dirty = new Set<string>();
  let pending = false;

  const flush = (): void => {
    // Cleared FIRST, so a throw on one name cannot leave the timer permanently
    // armed (or permanently disarmed) — `flush` is called from `before-quit`, and
    // a quit that waits on a re-armed timer is a quit that hangs.
    pending = false;
    if (!client || dirty.size === 0) {
      dirty.clear();
      return;
    }
    const names = [...dirty];
    dirty.clear();
    for (const name of names) {
      try {
        // Re-read the CURRENT bytes rather than a copy captured at `mark` time:
        // between the mark and this flush the player has probably acted several
        // more times, and the cloud must hold what the disk holds, not a stale
        // intermediate.
        const bytes = host.readLocal(name);
        if (bytes === null) continue; // deleted between mark and flush
        const ok = client.writeFile(name, bytes);
        if (!ok) host.log?.(`Steam Cloud refused ${name}`);
      } catch (err) {
        // Swallowed, and that is the rule: a cloud write is a backup of something
        // that is already safely on disk. Letting it throw would surface as an
        // unhandled main-process error (or, from `before-quit`, as a hung quit)
        // for a failure the player has lost nothing to.
        host.log?.(`upload of ${name} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  return {
    status,
    mark(name: string): void {
      if (!client) return; // no Steam: nothing to mark, nothing to arm
      if (!isCloudCarried(name)) return; // settings and quarantine never ride
      dirty.add(name);
      if (pending) return; // already armed — this is the whole coalescing win
      pending = true;
      try {
        host.schedule(flush, CLOUD_FLUSH_MS);
      } catch (err) {
        // A scheduler that refuses leaves the name dirty for the quit-time flush
        // rather than losing it, and must not throw into the storage IPC handler
        // that called us.
        pending = false;
        host.log?.(
          `could not arm the cloud flush: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
    flush,
  };
}
