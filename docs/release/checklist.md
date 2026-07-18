# Release checklist — Spacer Quest: Rimward — `v1.0.0-rc1`

**T-1704.** Final release sweep. This is the master checklist. Every line is in exactly one
of three states:

- **`[x]` checked by the agent** — done now, with evidence in-repo.
- **`PENDING(tag-cut)`** — a mechanical release-cut step that can only be performed once the
  T-1704 release **commit exists and Section 2 has cleared**: creating the annotated tag,
  the CI run against that tag, and the clean-clone re-run against the tagged commit. The
  agent must **not** pre-check these — none of them can be true before the tag exists, and
  as of this writing `git tag -l` is empty and the release commit is not yet made. The
  orchestrator ticks each one and records its evidence (SHA / CI run id / dated pass) at the
  moment it actually cuts the tag.
- **`BLOCKED(user)`** — a fully-specified item only the user can complete (Steam login,
  Steamworks appid provisioning, or an explicit policy decision). The agent never ticks a
  `BLOCKED(user)` line and never self-waives one.

- **Tag:** `v1.0.0-rc1` (annotated) on the T-1704 release commit.
- **Version stamp:** `1.0.0-rc1` — one source of truth in `packages/ui/package.json`,
  baked into the renderer via Vite `define` (`__APP_VERSION__`), rendered in the bezel on
  every screen (`data-testid="app-version"`), asserted by
  `packages/ui/src/__tests__/version.test.ts` and `packages/ui/e2e/smoke.spec.ts`.

---

## 1. Agent-completed (checked)

- [x] **Version stamped** to `1.0.0-rc1` in `packages/ui/package.json` and
      `packages/desktop/package.json`; baked via Vite `define` (`vite.config.ts`,
      `vitest.config.ts`); declared in `packages/ui/src/vite-env.d.ts`; rendered in the
      bezel brand block (`packages/ui/src/App.tsx`); styled in `packages/ui/src/theme.css`.
- [x] **Version has a named reader.** `packages/ui/src/__tests__/version.test.ts` asserts
      `__APP_VERSION__` is defined, is semver-shaped, and equals `package.json`'s `version`
      (cannot silently drift). `packages/ui/e2e/smoke.spec.ts` asserts it renders in the
      real DOM a player sees.
- [x] **Credits / licenses** written: `docs/release/CREDITS.md` (fonts, audio, shipped
      runtime libraries).
- [x] **Store-page asset export list** written: `docs/release/store-assets.md` (capsule
      set, screenshots, descriptions, trailer spec) — note these are art-production tasks,
      not an engineering blocker for the RC tag.
- [x] **Press one-pager** written: `docs/release/press-one-pager.md`.
- [x] **README** points at `docs/release/` and states RC status.
- [x] **Steam appid files wired into packaging.** `steam_appid.txt` is added to
      `extraResources` in `electron-builder.yml` and `steam_appid.demo.txt` to
      `electron-builder.demo.yml`, so each packaged app ships its appid file at
      `process.resourcesPath` — the first location `resolveSteamAppId()`
      (`packages/desktop/src/main.ts`) probes. The wiring is value-agnostic; the file
      currently carries the dev-sandbox `480`, and writing the real depot appid into it is
      the only remaining part of §2.2 (below), which is `BLOCKED(user)`.

## 1a. Performed at tag cut — `PENDING(tag-cut)`

These are the mechanical release-cut steps. Each depends on the T-1704 release commit
existing and Section 2 having cleared, so **none can be truthfully checked yet**. The
orchestrator ticks each one and fills in its evidence at the moment it cuts the tag; the
agent must not pre-check them.

- [ ] **Clean-clone RC build verified green.** Run the "Clean-clone verification" sequence
      below against the **tagged** commit from a throwaway checkout, and record the observed
      result (pass/fail + date + SHA) in that section. Not yet run against a tagged commit —
      the release commit does not exist yet.
- [ ] **CI green on the tagged commit.** All jobs (`ci`, `e2e`, `desktop`, `demo`,
      `desktop-win`) green on the pushed T-1704 release commit before tagging.
      _Orchestrator: record the commit SHA + CI run id in the T-1704 Delivered note._
      Not yet true — there is no tagged commit.
- [ ] **Annotated tag `v1.0.0-rc1`** created on that green commit and pushed.
      _Orchestrator: record the tagged SHA in the Delivered note._ Not yet created —
      `git tag -l` is empty.

### Clean-clone verification

Run from a throwaway checkout of the release commit (a `git worktree` or fresh clone —
**not** committed), in order:

```
npm ci
npx tsc -b
npm run lint
npm run format:check
npm test
npm run build
# optional, unsigned local package smoke:
CSC_IDENTITY_AUTO_DISCOVERY=false npm run package:dir -w @spacerquest/desktop
```

**Observed result:** _record pass/fail + date + commit SHA here when run for the tag._
(During T-1704 implementation the full local gate — `tsc -b`, `lint`, `format:check`,
`npm test` incl. the new `version.test.ts`, `npm run build`, and the `smoke.spec.ts`
e2e — was run green on the branch. The clean-clone re-run must be recorded against the
tagged commit.)

---

## 2. User-gated — `BLOCKED(user)`

Each line below is ready to act on. The orchestrator sets `BLOCKED(user)` on reaching this
section and never checks or waives these items itself.

### 2.1 Live Steam smoke test (deferred from T-1702)

The full seam is already built and unit-covered — only a running Steam client with the
user's login is missing:

- `packages/desktop/src/steam-achievements.ts` maps Deed events → Steam achievements.
- `packages/desktop/src/cloud-sync.ts` handles the Steam Cloud save round-trip.
- `resolveSteamAppId()` (`packages/desktop/src/main.ts`) reports the appid; dev sandbox
  ships Spacewar `480`.

- [ ] Under a running Steam client with `SQ_STEAM_APPID=480` (or the real depot appid once
      provisioned), earn a Deed and **confirm its achievement fires in the Steam overlay**.
- [ ] Confirm a **seed-carrying `sq.save.v1` Steam Cloud save round-trips across two
      machines** — write on machine A, sync, launch on machine B, and confirm the same seed
      / career state loads.
- [ ] **Record here:** passed against a real client on `<date>`, OR explicitly waived by the
      user with a reason. _No agent can perform this — it requires the user's Steam login._

### 2.2 Real depot appids for BOTH builds

Both `packages/desktop/steam_appid.txt` and `packages/desktop/steam_appid.demo.txt`
currently ship `480` (Spacewar dev sandbox). See `docs/steam/depot-demo.md`.

The **electron-builder wiring is already done** (see §1 "Steam appid files wired into
packaging"): each config now ships its appid file at `process.resourcesPath`, where
`resolveSteamAppId()` probes first. Only the real appid **values** — which require the
user's Steamworks account — remain outstanding:

- [ ] Provision the **full** and **demo** appids + depot ids in the Steamworks partner site.
- [ ] Write the real full appid into `packages/desktop/steam_appid.txt` and the real demo
      appid into `packages/desktop/steam_appid.demo.txt` (the wiring already ships these
      files, so no config change is needed once the values are written).
- [ ] Link the demo app to the full game's store page (Steamworks "demo" association).

### 2.3 Two T-1701 deferrals — explicit recorded decisions

**Code-signing / notarization (macOS).**

- [ ] **Decision (pick one):**
  - [ ] **Waive for a Steam-only launch.** Steam wraps and distributes the binary, so
        Gatekeeper is satisfied through Steam; no independent notarization is required for a
        Steam-only release. _Record the waiver text and the date the user signs off here._
  - [ ] Provide a Developer ID signing identity + notarization credentials and wire them into
        `electron-builder.yml`.

**Auto-update feed** (`maybeCheckForUpdates()`, `packages/desktop/src/main.ts:265`).

- [ ] **Decision (pick one):**
  - [ ] **Confirm dormant for a Steam launch.** With no `SQ_UPDATE_FEED` set, the updater is a
        guarded no-op; Steam owns updates for a Steam release. _Record confirmation + date._
  - [ ] Set a real generic feed URL (`SQ_UPDATE_FEED` / electron-builder `publish` config) and
        smoke-test an update round-trip.

---

## 3. Recorded decisions / known limitations

These are agent-noted and user-confirmable — not blockers for the RC tag.

- **App icons.** No `build/icon.icns` / `build/icon.ico` ship yet; electron-builder falls
  back to its default icon and packaging still succeeds (documented in
  `electron-builder.yml`). Real icons are a pre-1.0-final follow-up.
- **Fonts load from the Google Fonts CDN** (`packages/ui/index.html`) with a system-font
  fallback when offline. `Chakra Petch` and `IBM Plex Mono` are both SIL OFL 1.1, which
  permits self-hosting/bundling — bundling for offline fidelity is a low-effort follow-up,
  out of this task's minimum scope. See `docs/release/CREDITS.md`.
- **Bundle-size warning.** The renderer chunk exceeds Vite's 500 kB advisory. Non-blocking;
  code-splitting is a post-RC optimization.
