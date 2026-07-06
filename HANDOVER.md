# SpacerQuest — Session Handover

> Paste the "PROMPT" section below into a fresh session. The rest is reference.

---

## PROMPT (paste this)

You are continuing work on **SpacerQuest**, a faithful web remake of a 1991 Apple II BBS game. The remake lives in `spacerquest-web/` (server-side terminal "screens" over sockets to an xterm frontend; the computer plays the other 20 spacers' turns). Working dir: `C:\dev\Games\SpacerQuest` (Windows as of 2026-07-06; was previously a Mac).

**Read `UGT-PLAYTEST-FINDINGS.md` first** — its "FIX STATUS (2026-07-06)" table records that ALL
seven ranked findings from the UGT Phase-2 balance campaign are now FIXED in the working tree
(session of 2026-07-06, **uncommitted**): docking varfix score restoration (+wb+q6+y−lb, per-trip
battle counters, u1 double-count), 3-trip daily cap, combat fuel Malfunction! gate, Roscoe +1
upgrades, the Commandant-prompt hijack behind the "silent contract refusal" (root cause found), and
the Manual/PRD/EVALUATION doc corrections. Each fix has keystroke-path tests in
`tests/playtest-coverage.test.ts` §"UGT PHASE-2 FIXES". Suite green: 51 files / 1,949 tests; tsc clean.

**Your task, in order:**
1. If the user approves, commit the working tree (branch first — you are on `main`; suggested name
   `ugt-findings-fixes`). Diff spans: `constants.ts`, `travel.ts`, `docking.ts`, `navigation.ts`,
   `screens/combat.ts`, `systems/combat.ts`, `upgrades.ts`, `screens/{traders-cargo,space-patrol,topgun,shipyard,shipyard-upgrade}.ts`,
   `sockets/game.ts`, `prisma/schema.prisma` (comments only), 8 test files, and the 4 root docs.
2. Re-verification: from the UGT repo (NOT on this machine — it lived at
   `/Users/vs7/Dev/Games/_UGT Universal Game Tester` on the Mac), server up with `CLASSIC_MODE=false`:
   `python3 integrations/spacerquest/run_llm_playtest.py 3 100 anthropic claude-sonnet-5` — expect
   score velocity up ~5-15×, combat fuel spend to bite, 0 violations still.
3. Then `EVALUATION.md` §5 coverage gaps (RNG seams, boss missions, arena) — the standing second priority.

**Hard rules (from the user's global CLAUDE.md — follow exactly):**
- **Test through the UI, never the API.** Drive actions via the keystroke path — `handleScreenInput`/`handleScreenRequest` on the screen-router (what a real keypress runs). Never use REST/`fetch` to bypass a screen a player would navigate. Assert real effects (DB/state changes), not just "a screen rendered."
- **All tests must pass before committing.** Never dismiss a failure as "pre-existing" — investigate the root cause and fix it. A statistical anomaly (e.g. expecting 30% hazards, seeing 0) is a bug to investigate, not an observation to log.
- Don't commit or push unless asked.

**Environment setup (do this first):**
```
cd C:\dev\Games\SpacerQuest\spacerquest-web    # Windows; Git Bash path /c/dev/Games/SpacerQuest/spacerquest-web
# If fresh checkout/machine: npm install; if fresh DB volume: npx prisma db push && npm run db:seed
# (migrations lag schema.prisma — User.isAdmin has no migration; db push is the sync mechanism)
docker compose up -d db redis                 # Postgres :5454, Redis :6380 (game's own, not Supabase)
export DATABASE_URL="postgresql://spacerquest:spacerquest@localhost:5454/spacerquest"
npx prisma migrate deploy   # (only if a fresh volume; usually already seeded: 28 systems, 65 NPCs, 20 bots)
npm test                    # 1869 passing, exit 0 — needs DATABASE_URL + DB up; uses vitest 'forks' pool
npm run dev:server          # boots on :3000; dev login at GET /auth/dev-login (302 + JWT)
```
Confirm the baseline is green before changing anything.

---

## Reference — key facts for the next session

**Architecture**
- Game logic = server-side "screens" in `spacerquest-web/src/game/screens/*.ts` (each exports `render`/`handleInput` returning `{output, nextScreen}`). Router: `src/sockets/screen-router.ts`. Hub: `main-menu.ts`.
- Frontend (`src/frontend/`) is a thin xterm terminal: keystroke → socket `screen:input` → `handleScreenInput` → screen. A second path: REST `/api/navigation/arrive` → `screenOverride` (arrival screens: combat, andromeda-dock, nemesis-lattice, black-hole-hub, and now black-hole-event).
- Game systems: `src/game/systems/*.ts`. Bots: `src/bots/`. Original 1991 source: `SQ/` (single-line Applesoft BASIC). Reverse-engineered spec: `PRD.md`, `GAME-ACTIONS.md` (~163 actions), `User-Manual.md`.

**Testing**
- Unit/integration: `vitest` (`tests/*.test.ts`). DB-touching tests need Postgres up. Pool is `forks` + `tests/vitest.setup.ts` disconnects Prisma (fixes a native-engine SIGSEGV on teardown).
- Headless coverage playtest: `tests/playtest-coverage.test.ts` — creates a dedicated user (`bbsUserId: playtest-coverage-user`, auto-cleaned), drives screens by keystroke, asserts effects. Pattern to copy for new coverage.
- Browser e2e (`tests/e2e/09-browser-game-agent.spec.ts`, `tests/e2e/playtest/`) is the higher-fidelity but flakier complement (has stalled at the auth screen before). Prefer the headless keystroke-path approach for reliable coverage.

**Useful specifics**
- Credits are split `creditsHigh`*10000 + `creditsLow` (so `creditsHigh:100` = 1,000,000 cr).
- Bank requires **Commander** rank (score ≥ 150). Spacers Hangout is at **Sun-3 (system 1)**, `[H]` on the main menu. Wise One = system 17, Sage = system 18. Andromeda systems = 21–26, Maligna = 27, black hole = 28.
- `crimeType` is `Int?` (5=smuggling, 6=carrier loss, 7=conduct); jail is a `J%` name prefix. Alliances: enum `ASTRO_LEAGUE`/`SPACE_DRAGONS`/`WARLORD_CONFED`/`REBEL_ALLIANCE`.
- Great Void reward = `ship.hasWeaponMark` (+150 weapon power in the Maligna battle, `SP.MAL.S:83`); gated on the Wise One's `character.numberKey` (1–9).
- `TRAVEL_WALLCLOCK_SECONDS = 3` (fixed wait); `TRAVEL_TIME_MULTIPLIER = 3` is now game-units only (drives hazard checkpoints from **distance**, not wall-clock).

**Do NOT do yet:** expanding the Great Void into a larger quest — it's flagged in `EVALUATION.md` §7 as a deliberate future content pass, not now.

**Session state (2026-07-06):** on `main` (PR #14 merged the previous branch; `origin/main` up to date at
session start). **All 7 UGT findings fixed in the working tree, UNCOMMITTED** — suite green (51 files /
1,949 tests), `tsc --noEmit` clean. Machine moved Mac → Windows: fresh `npm install` + `prisma db push` +
`npm run db:seed` were needed. The UGT test harness repo (`_UGT Universal Game Tester`) is NOT on this
machine — re-verification must run wherever it lives (see the one-liner at the bottom of
`UGT-PLAYTEST-FINDINGS.md`).
