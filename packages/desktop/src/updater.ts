// ---------------------------------------------------------------------------
// T-1701b · THE AUTO-UPDATER STUB.
//
// "Updater stub present and inert without a feed" (the Accept). Both halves are
// structural here rather than a matter of inspection:
//
//   * PRESENT — `initUpdater` runs on every packaged launch, resolves a status,
//     and that status is shown to the player (Settings → Build → Updates). Its
//     READER CHAIN is: `main.ts`'s `updaterStatus` → the `sq-shell:about` IPC
//     channel → `preload.ts`'s `about()` → `packages/ui/src/storage.ts`'s
//     `updateStatus` → `App.tsx`'s `BuildRow`. Constraint 7 discharged end to
//     end, asserted by `e2e/packaged.spec.ts` and `e2e/shell.spec.ts`.
//   * INERT — with no feed this module makes ZERO calls on `autoUpdater`: no
//     `setFeedURL`, no `checkForUpdates`, no listeners, no network. That is
//     asserted as an empty call log in `__tests__/updater.test.ts`, not by
//     reading the code. And there is no feed to find: {@link COMPILED_FEED_URL}
//     is `null`, and electron-builder's `publish` is `null` in
//     `package.json`'s `build` block, so no `app-update.yml` is embedded either
//     — two independent reasons, so arming needs a deliberate act, not a slip.
//
// PURE NODE — NO `electron` IMPORT, the same discipline (and the same
// structural test) as `saveStore.ts`. Everything arrives by injection through
// {@link UpdaterHost}. Two things depend on it: this module unit-tests with no
// Electron binary (so CI's `Build, lint, test` job keeps running with
// `ELECTRON_SKIP_BINARY_DOWNLOAD: 1`), and the update POLICY stays testable
// independently of the process model.
//
// WHY THE BUILT-IN `autoUpdater` SHAPE AND NOT `electron-updater`. Two reasons.
// (1) `packages/desktop` has zero runtime dependencies — a property T-1701a
// stated and this task keeps; `electron-updater` is a runtime dependency.
// (2) The backend is genuinely undecided: TECH-STACK §3 is Steam-first and
// Steam ships its OWN patcher, so a game distributed there may never want a
// second update channel at all. Squirrel vs. electron-updater vs. Steam is a
// T-17xx distribution decision, and this stub deliberately does not pre-empt
// it. Because the stub only ever ARMS when a feed exists, and no build this
// repo produces carries one, no backend is exercised today.
// ---------------------------------------------------------------------------

/**
 * What the updater resolved to on this launch.
 *
 *  - `unsupported` — this build cannot self-update at all (dev build, or a
 *    platform Electron's `autoUpdater` does not serve).
 *  - `inert` — it could, but there is no usable feed. The shipped state.
 *  - `armed` — a feed was accepted and a check was made.
 */
export type UpdaterState = 'unsupported' | 'inert' | 'armed';

export interface UpdaterStatus {
  state: UpdaterState;
  /**
   * Why, in machine-readable form: `'not-packaged' | 'platform-unsupported' |
   * 'no-feed' | 'invalid-feed' | 'feed-rejected' | 'feed'`. Diagnostic only —
   * the player-facing surface shows {@link UpdaterState}, because the reason is
   * a developer's question and the state is a player's.
   */
  reason: string;
  /** The armed feed URL, or `null` when nothing was armed. */
  feed: string | null;
}

/**
 * An Electron `autoUpdater`-shaped object.
 *
 * DUPLICATED rather than imported, so this module stays electron-free (see the
 * header). The three members below are the whole surface this stub uses; if it
 * ever grows, the shape grows here and nowhere else.
 */
export interface AutoUpdaterLike {
  setFeedURL(options: { url: string }): void;
  checkForUpdates(): void;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
}

/** Everything {@link initUpdater} is allowed to know about the world. Injected
 *  so the unit suite can drive every branch without an Electron binary. */
export interface UpdaterHost {
  isPackaged: boolean;
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
  autoUpdater: AutoUpdaterLike;
  /** Optional sink for the two `autoUpdater` events an armed stub listens to.
   *  Absent in production — an armed build does not exist yet. */
  log?(message: string): void;
}

/**
 * THE FEED.
 *
 * `null` in every build this repository produces today — which IS the meaning of
 * "inert without a feed" in T-1701b's Accept, and is asserted by a unit test so
 * a feed cannot be committed by accident (a committed feed would make every
 * shipped build phone home). A release pipeline arms the stub by setting
 * `SQ_UPDATE_FEED` or by flipping this constant; nothing else in the app
 * changes.
 *
 * electron-builder's `publish` is likewise `null` (see `package.json`'s `build`
 * block), so no `app-update.yml` is embedded in the package — there is no
 * second, hidden feed source behind this one.
 */
export const COMPILED_FEED_URL: string | null = null;

/** Environment override, for a release pipeline (and for the unit suite). An
 *  empty or whitespace-only value counts as ABSENT rather than as a feed of
 *  `''`, because a blank env var is how a CI matrix says "not this one". */
export function resolveFeed(host: UpdaterHost): string | null {
  const fromEnv = host.env.SQ_UPDATE_FEED?.trim();
  if (fromEnv) return fromEnv;
  return COMPILED_FEED_URL;
}

/** The platforms Electron's built-in `autoUpdater` serves. On Linux it throws on
 *  first use, which is why the check is a guard and not a preference — CI's
 *  ubuntu `desktop` job launches this same main process. */
function platformSupported(platform: NodeJS.Platform): boolean {
  return platform === 'darwin' || platform === 'win32';
}

/**
 * Resolve — and, only if a feed exists, arm — the updater for this launch.
 *
 * NEVER THROWS. An updater that can take the app down at boot is worse than no
 * updater: the player loses the game to a feature they did not ask for. Every
 * call into `autoUpdater` is inside the one try/catch below, and a failure
 * degrades to `unsupported` rather than propagating.
 *
 * The order of the checks is the contract, and each step has a test in
 * `__tests__/updater.test.ts`.
 */
export function initUpdater(host: UpdaterHost): UpdaterStatus {
  // 1. A DEV BUILD MUST NEVER SELF-UPDATE — it would overwrite a working tree
  //    with a release. `autoUpdater` is not touched at all on this path.
  if (!host.isPackaged) return { state: 'unsupported', reason: 'not-packaged', feed: null };

  // 2. Linux (and anything else) has no built-in updater; calling it throws.
  if (!platformSupported(host.platform)) {
    return { state: 'unsupported', reason: 'platform-unsupported', feed: null };
  }

  const feed = resolveFeed(host);

  // 3. THE SHIPPED STATE. No feed means no calls whatsoever — this is the
  //    acceptance criterion, and `updater.test.ts` asserts it as a CALL COUNT
  //    on a recording fake rather than by reading this comment.
  if (feed === null) return { state: 'inert', reason: 'no-feed', feed: null };

  // 4. An update feed is a remote-code-execution channel: whatever it serves
  //    becomes the binary the player runs next. Plaintext transport is not a
  //    configuration option, so a non-HTTPS feed is refused rather than
  //    downgraded-with-a-warning.
  let parsed: URL;
  try {
    parsed = new URL(feed);
  } catch {
    return { state: 'inert', reason: 'invalid-feed', feed: null };
  }
  if (parsed.protocol !== 'https:') return { state: 'inert', reason: 'invalid-feed', feed: null };

  // 5. Arm. Listeners FIRST, so an error raised synchronously by `setFeedURL`
  //    or `checkForUpdates` has somewhere to land instead of becoming an
  //    unhandled `error` event (which Electron surfaces as a crash dialog).
  try {
    host.autoUpdater.on('error', (...args: unknown[]) =>
      host.log?.(`updater error: ${String(args[0])}`),
    );
    host.autoUpdater.on('update-downloaded', () => host.log?.('update downloaded'));
    host.autoUpdater.setFeedURL({ url: feed });
    host.autoUpdater.checkForUpdates();
  } catch (err) {
    host.log?.(`updater could not be armed: ${err instanceof Error ? err.message : String(err)}`);
    return { state: 'unsupported', reason: 'feed-rejected', feed: null };
  }
  return { state: 'armed', reason: 'feed', feed };
}
