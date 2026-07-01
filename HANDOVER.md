# SpacerQuest — Session Handover

> Paste the "PROMPT" section below into a fresh session. The rest is reference.

---

## PROMPT (paste this)

You are continuing work on **SpacerQuest**, a faithful web remake of a 1991 Apple II BBS game. The remake lives in `spacerquest-web/` (server-side terminal "screens" over sockets to an xterm frontend; the computer plays the other 20 spacers' turns). Working dir: `/Users/vs7/Dev/Games/SpacerQuest`.

**Read `EVALUATION.md` first — it is the source of truth** for what's been evaluated, fixed, and what's still open. In the last session we: fixed real-time travel (now a fixed ~3s wait, encounters/hazards preserved — accepted deviation), fixed a test-suite SIGSEGV, wired the Cloaker UI, revived the Spacers Hangout + Raid (which unlocked the entire alliance system — it was the only place to join an alliance), wired the Great Void black-hole event with a discoverability nudge (see §7 — great story), deleted dead `combat-display.ts`, and added a deterministic headless coverage playtest (`tests/playtest-coverage.test.ts`, 32 actions). All 1869 tests pass.

**Your task: tackle the remaining playthrough-coverage gaps in `EVALUATION.md` §5 ("Still outstanding")**, in this priority order:
1. **Forced-RNG seams** so these become deterministically testable through the UI: **combat surrender & retreat** as resolved outcomes, and **travel hazards & course changes**. Right now they depend on `Math.random()` with no injection seam — add test seams (dependency-injected rolls / env or param overrides) without changing default gameplay behavior.
2. **Boss-mission playthrough end-to-end:** Nemesis (system 28) and Maligna (system 27) battles + full Andromeda transit (black-hole-hub → NGC → Great Void → dock), driven through the keystroke path.
3. **Arena dueling, DEFCON funding, and a rank-progression arc** as player-path coverage.

Then extend `tests/playtest-coverage.test.ts` (or add sibling files) to cover them and raise its regression floor.

**Hard rules (from the user's global CLAUDE.md — follow exactly):**
- **Test through the UI, never the API.** Drive actions via the keystroke path — `handleScreenInput`/`handleScreenRequest` on the screen-router (what a real keypress runs). Never use REST/`fetch` to bypass a screen a player would navigate. Assert real effects (DB/state changes), not just "a screen rendered."
- **All tests must pass before committing.** Never dismiss a failure as "pre-existing" — investigate the root cause and fix it. A statistical anomaly (e.g. expecting 30% hazards, seeing 0) is a bug to investigate, not an observation to log.
- Don't commit or push unless asked. Nothing from the last session is committed yet.

**Environment setup (do this first):**
```
cd /Users/vs7/Dev/Games/SpacerQuest/spacerquest-web
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

**Uncommitted changes from last session** (all green, nothing committed): `constants.ts`, `travel.ts`, `App.tsx`, `Terminal.tsx`, `main-menu.ts`, `black-hole-event.ts`, `navigation.ts`, `vitest.config.ts`, `functional-requirements.test.ts`; new `tests/vitest.setup.ts`, `tests/playtest-coverage.test.ts`, `EVALUATION.md`; deleted `combat-display.ts` + its test.
