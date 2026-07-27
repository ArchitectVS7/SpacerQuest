# Rimward — Tech Stack Decisions

**Date:** 2026-07-10 · **Status:** Approved
Companion to `PRD-REIMAGINED.md`. Records what is decided, what is deliberately
deferred, and why.

## Decided

### 1. TypeScript end-to-end
All game code is TypeScript. Rationale: `foundation/rules/` is already TS
(formulas reuse directly, no transliteration); the UGT playtest harness drives
web interfaces (points at Rimward with minimal work); it is the developer's
proven stack from the Museum Edition. Considered alternative: Godot 4 —
better engine tooling, but Rimward's cockpit is ~90% dense text/panel UI,
which is web tech's home turf and Godot's weak spot, and Godot would forfeit
both the TS rules reuse and the existing UGT integration.

### 2. Headless rules engine, UI as a client
The game logic is a pure TS package with **no UI imports and seeded,
deterministic RNG**: `engine.advanceDay(actions) → events`. The cockpit UI is
one client of it; UGT and balance simulators are others. This is the direct
lesson of the Museum Edition, where rules woven through 54 screens made every
change and every test hard.

Non-negotiable engine properties:
- **Deterministic:** same seed + same actions = same galaxy, always. (Every
  d20 roll flows from the seed — this is what makes 10,000-day overnight
  balance simulation and reproducible bug reports possible.)
- **Serializable:** full game state round-trips through JSON (saves, UGT
  snapshots and Steam Cloud all come free — T-1702b synced the *existing*
  T-1002 envelope byte for byte, adding no `GameState` field, no event and no
  save migration).
- **Event-sourced output:** the engine emits typed events (the news wire is
  literally the event log, rendered in-fiction).

### 3. Distribution: Steam-first, commercial
Per the PRD: $15–20 premium, demo-first marketing. Implications planned in
from the start: a desktop shell build target, Steamworks integration
(achievements mirror the Registry of Deeds; Steam Cloud for saves), and the
demo (Tour One) as a first-class build configuration, not an afterthought.
Browser builds remain the dev/playtest loop.

**T-1702a shipped the achievement half.** The mirror is exactly what §8.2 of the
PRD already says it is — *the achievements are the Deeds* — so no new rule
exists: the engine emits `DeedEarned` / `RenownRankUp` as it always did,
`ui/src/steam.ts` maps that stream to Steam API names (derived from the deed id,
never hand-authored, so a new Deed cannot be silently unmirrored), and
`desktop/src/steam.ts` hands a **string** to Steamworks — the shell still knows
nothing about Deeds. 44 Deeds plus the Conqueror capstone are mirrored; the
partner-site table is `docs/STEAM-ACHIEVEMENTS.md`, kept in step with the code by
a unit test. **No Steam is a first-class state, not an error path:** no app id is
compiled in (`COMPILED_STEAM_APP_ID` is `null`), `initSteam` and every unlock
never throw, the app is otherwise identical, and `steamworks.js` is an
`optionalDependency` whose absence is tested.

**T-1702b shipped Steam Cloud and rich presence.** Two calls of substance, both
recorded here rather than left implicit. (1) Cloud is the **ISteamRemoteStorage
API, not Auto-Cloud** — Auto-Cloud is a partner-site path glob with zero code,
and a feature with no code has no test, no named reader and no failure mode
anyone can prove is graceful, which the Accept's "verified in the dev sandbox"
demands. Auto-Cloud must therefore stay *off* on the partner site, or both
mechanisms would write the same files. (2) The conflict policy is
**restore-only-when-absent**: cloud → local happens only when the local file is
missing, local → cloud on every write, coalesced. `listFiles()` returns name and
size only — there is no modification time in the binding — so "newest wins"
cannot be implemented honestly; and overwriting a live local career with a stale
cloud copy is the data-loss class this repo already refused in `storage.ts`'s
`migrateInto` **semantic 3** ("a desktop career already in progress beats a stale
browser one"). So the shipped promise is precise: Steam Cloud *seeds* a machine
with no career and *backs up* the one you have; a two-way merge is deliberately
out of scope. Seven keys ride the cloud — the autosave, the three slot envelopes
and their three display-meta files — and the exclusions are the interesting part:
the quarantine blob would sync damage everywhere, and
`sq.migrated.from-localstorage.v1` is **machine-local** (syncing it down would
make a fresh machine skip its own localStorage import, i.e. lose a career).
Uploads are coalesced on a 3-second timer because `store.ts` autosaves after
every action and a save can be ~10.9 MiB. **Rich presence** publishes `system`,
`day` and `steam_display: '#Status_InSystem'`; the sentence a friend reads is a
partner-site localization token, so the shell owns no prose (the cockpit's
`richPresenceLine` renders the same sentence for Settings, pinned to the doc by a
test). **One client load, three consumers:** `SteamSession.client` is handed to
both new modules, so cloud and presence are `unavailable` *exactly* when Steam
is, structurally rather than by three copies of the same try/catch — and both,
like `initSteam`, never throw. Both partner-site configurations live in
`docs/STEAM-ACHIEVEMENTS.md` for T-1704.

The Steam overlay is still deliberately not enabled (it needs
`--in-process-gpu --disable-direct-composition`, which changes how the tube
composites, and the CRT aesthetic is the stated reason Electron was chosen at
all).

### 4. Repository shape: monorepo packages
```
packages/
  engine/     pure rules — no DOM, no I/O, seeded RNG
  ui/         the cockpit (web) — renders engine state, submits actions
  content/    NPC sheets, storylets, systems, balance tables (data, not code)
  sim/        headless harnesses: balance runs, UGT adapter
  desktop/    Electron shell — window management, the OS app-data save dir,
              packaging/updater, and the Steamworks achievement pipe
```
`desktop/` was added by **T-1701a** (the §3 desktop shell target, on the
Electron lean below). It has **zero workspace dependencies and zero game rules**:
it is a window, a synchronous file-backed key/value store and (T-1702a) a pipe
that forwards achievement API-name *strings* to Steamworks, and the cockpit
reaches all of it through one seam (`ui/src/storage.ts`) that falls through to
`localStorage` and a no-op achievement sink when no shell is present — so the
browser build stays the dev/playtest loop, untouched. T-1702a gave it its first
runtime dependency: **one optional native package** (`steamworks.js`), whose
absence is a supported and tested state, so "zero *runtime* dependencies" from
T-1701a/b no longer holds while "zero *workspace* dependencies" still does.

**T-1701b** added packaging and the updater. electron-builder produces mac
(`dir` + `zip`) and win (`dir` + `nsis`) targets from `desktop/package.json`'s
`build` block, with `packages/ui/dist-web` — the *same* vite bundle the web e2e
suite tests — staged into `desktop/renderer` by `scripts/copy-renderer.mjs`. The
packaged renderer is served over a **privileged `app://` scheme**, not `file://`:
a standard, secure scheme keeps absolute asset paths resolving (so `ui`'s
`vite.config.ts` is untouched) and gives a trustworthy origin, so the cockpit's
storage, crypto and audio behave exactly as they do in the browser build. The
auto-updater is a **stub that is inert because no build carries a feed** —
`COMPILED_FEED_URL` is `null` and electron-builder's `publish` is `null`, so no
`app-update.yml` is embedded either. The updater *backend* is deliberately still
undecided: §3 is Steam-first and Steam ships its own patcher, so a second update
channel may never be wanted. Code signing/notarization, app icons and
self-hosted fonts are named follow-ups, not shipped here.
`content/` is data (JSON/typed TS data modules) so expansion Seasons and the
d20 cast stay authorable without touching engine code.

## Deferred (with current lean)

| Decision | Decide when | Current lean |
|---|---|---|
| Renderer: DOM/React vs. PixiJS canvas | After first visual prototype of the cockpit | DOM for iteration speed + WebGL/CSS CRT post-process layer; go canvas only if the aesthetic demands it |
| Desktop shell: Electron vs. Tauri | Before first Steam build | Electron — uniform Chromium protects the CRT aesthetic; Tauri's per-machine webviews risk it |
| State/UI framework details | With renderer choice | React + a thin store; engine state is the source of truth |
| Save format versioning / migration scheme | Before first public demo | Versioned JSON with explicit migrations |

## Constraints carried over from project rules
- No feature exists only in the UI: if the engine can't do it headlessly, it
  isn't done (UGT must be able to reach everything a player can).
- Playtests exercise the real UI (per global testing rules); the engine-direct
  path is for balance simulation, not UX validation.
