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
`docs/STEAM-ACHIEVEMENTS.md`, and T-1704 carried each of them into
`docs/RELEASE-CHECKLIST.md` §D as an item awaiting the user.

**T-1703 shipped the demo configuration** — "a first-class build configuration,
not an afterthought", as the paragraph above always promised. Four decisions,
recorded here because each one closed off an easier alternative.

**(D1) The gate is an ENGINE rule keyed off a new persisted scalar,
`GameState.edition` (`'full' | 'demo'`), not a UI hide.** Three requirements
forced it: the gate must survive a save, it must be provable headlessly, and it
must be *promotable* on import ("demo-save carries into full game"). One scalar
makes that carry a one-line promotion (`engine/src/demo.ts`'s `promoteEdition`)
instead of a save converter. The split is the same seam `storage.ts` already
draws: the **build** decides which edition a career is born in or promoted to;
the **engine** decides what a demo career may do. `CURRENT_SAVE_VERSION` moves
8 → 9 with a v8→v9 migration backfilling `edition: 'full'` — a statement of fact,
since every save that exists predates the demo build.

**(D2) "Hangout progression" on the task's gate list means the CREW/dice
progression bought at the Hangout, not the Hangout.** The reading and its
evidence live at the definition site (`content/src/demo.ts`): it is the repo's
own vocabulary (`PlayerAction.Crew` is documented as "PRD §7 dice progression …
at the Hangout/port"), and gating the venue would cut two authored Tour One beats
— PRD §7.3's Day-23 Spacer's Dare and §7.5's bad-day Penny Wise loan — out of the
demo's own Tour One. So dare/meet/befriend/insult/rumor/borrow/repay stay open;
crew **hire** is locked and **dismiss** is not.

**(D3) A hard day ceiling does most of the work, and only three features are
named locks.** The demo runs Tour One plus three post-resolution days (days 1–33;
day 30's dusk still fires `TourOneResolved`, still flips the era to VETERAN and
still sets `veteran.unlocked` — the teaser days are the point). Everything gated
behind career *depth* — the Nemesis crossing, the alliance arcs, the Registry
ladder — is unreachable because 33 days is not enough, which is honest by
construction and cannot rot as content is added. The three named locks exist
because those three ARE reachable inside 33 days: the cheapest crew role is
2,000cr, the cheapest port stake 7,150cr, and CONQUEROR is a Registry row and a
Steam achievement regardless of days played (so the demo's achievement manifest
is the full 45 minus that one capstone).

**(D4) Gated controls render DISABLED with authored tease copy, never removed** —
"teased-but-gated" is the task's own phrasing, it is this repo's existing idiom
(the crew hire already "disables-not-hides an unaffordable hire"), and it gives
Playwright a *stronger* proof than absence: `click({ trial: true })` runs the full
actionability chain, so a gated control fails it.

**Rejected, and recorded as such: a runtime edition switch.** A gate that lifts
at runtime is not a gate. The edition is compiled into the bundle by Vite
`define` (`vite build --mode demo` → `__SQ_EDITION__` → `dist-demo`), so the demo
artifact physically cannot become the full game; `ui/src/edition.ts`'s
`resolveEdition` fails safe to `'full'`, which errs toward *more* gating being
required, never less. The demo build additionally **refuses to open a full-game
save** — the obvious hole in the gate, closed in `promoteEdition`.

**Packaging and the depot.** `packages/desktop/electron-builder.demo.cjs` is a
separate config (appId `com.spacerquest.rimward.demo`, productName "Rimward
Demo", output `release-demo/`, `electronLanguages: ['en-US']`), so the demo and
the full game coexist on one machine — which they must, since the demo's job is
to hand a career to a full game that is still installed. The shell serves
whichever bundle was staged (`renderer-demo/` if present, else `renderer/`) as a
**path** question: `ShellInfo` is deliberately NOT widened with an `edition`
field, because a second answer to "which edition is this?" is a second answer
that can disagree with the cockpit's compiled `BUILD_EDITION`. Steam content-
builder scripts live at `packages/desktop/steam/{app,depot}_build_demo.vdf` with
**placeholder ids (`0`)**, on the same rule `COMPILED_STEAM_APP_ID` follows — this
repo holds no partner ids; obtaining them is `docs/RELEASE-CHECKLIST.md` items
**D4**/**D5**, still open — and a unit test pins the pair against the builder
config so the ContentRoot cannot drift.

**The size budget measures the DISTRIBUTABLE artifact**, not the unpacked tree,
and that is stated at `desktop/src/size.ts`'s `DEMO_MAX_DISTRIBUTABLE_BYTES`
rather than left to inference: the installer is what a player downloads and what
compresses into a depot, while `win-unpacked/` is ~216 MB of Chromium that is
never transferred in that form and would fail a 200 MB budget for reasons no work
on this game could change. Measured on win32: the demo installer is
**93,444,570 B (93.4 MB)** against the 200 MB ceiling, and `scripts/check-size.mjs`
fails `package:*:demo` over budget.

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
scripts/      repo-level tooling — not a workspace, not shipped
```
`scripts/` was added by **T-1704** on the same rule that put `desktop/` on this
list: it is a directory a reader will meet. It holds tooling that operates on the
REPOSITORY rather than on the game — today just `verify-clean-clone.mjs`, which
clones the repo into a temp dir and runs the gate there, so "builds green from a
clean clone" is a command anyone can run rather than a claim in a release note.
Nothing in `packages/` imports it and nothing in it is distributed.
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

### 5. The cockpit's animation library: GSAP (T-136)

**T-136** added the cockpit's first animation dependency — **GSAP 3.15.0**, in
`packages/ui`'s `dependencies`. Recorded here because it is the second runtime
package this project ships (after React) and because the licence is not one of
the two this repo already carries.

- **Licence: the Standard "No Charge" GSAP License**, not MIT. The npm package
  ships **no LICENSE file** — its `README.md` names the licence and points at
  <https://gsap.com/standard-license>, which was read before the dependency was
  accepted. It permits commercial use in a **sold** product (§3's Steam-first
  target) and prohibits only using GSAP to build tooling that competes with
  Webflow's visual-animation builder. It is credited in `packages/ui/src/credits.ts`
  and `docs/CREDITS.md`, so the notice ships inside the build.
- **Why it earns its place, and where it stops.** It drives exactly one thing:
  the Liar's Dice **reveal timeline** (dim the table → lift the dealer's four
  shrouds in stagger → land the verdict), which is a sequenced, staggered,
  callback-bearing sequence that CSS keyframes can only fake with hand-tuned
  per-element delays. The dice themselves are **CSS 3D** (`transform-style:
  preserve-3d`, six faces, pips as glowing dots) — there is no WebGL and no
  3D-engine dependency anywhere in the cockpit, and there must not be one added
  by the back door of an animation library.
- **The instant rail is non-negotiable.** Under reduced motion the timeline is
  **never created**, not created-and-skipped, so the settled DOM exists on the
  very next render. That is what keeps the e2e suite honest (its specs run under
  `emulateMedia({ reducedMotion: 'reduce' })`) and what keeps decoration from
  ever gating input.
- **The MIT fallback, if the licence ever changes**: `animejs` v4. Nothing in the
  cockpit uses a GSAP plugin — only the core `gsap` timeline — so the swap is
  contained to `LiarsDiceScene`.

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
