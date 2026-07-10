# SpacerQuest — Session Handover

> Paste the "PROMPT" section below into a fresh session. The rest is reference.
> Last refreshed: 2026-07-09 (Mac). Branch `ugt-reverify-findings` @ `394cf100`.

---

## PROMPT (paste this)

You are continuing work on **SpacerQuest**, a faithful web remake of a 1991 Apple II BBS game. The
remake lives in `spacerquest-web/` (server-side terminal "screens" over sockets to an xterm frontend;
the computer plays the other 20 spacers' turns). The repo lives at `C:\dev\Games\SpacerQuest` on the
Windows machine and `/Users/vs7/Dev/Games/SpacerQuest` on the Mac. The UGT test harness repo
(`_UGT Universal Game Tester`) exists ONLY on the Mac, as a sibling of this repo.

**Current status (2026-07-09): the fix queue is drained.** All 7 findings from the UGT Phase-2 balance
campaign plus the 2 follow-up findings from its re-verification are **fixed on this branch** (through
`394cf100`) and covered by passing keystroke-path regression tests. The completed campaign reports have
been archived to `docs/archive/` (`UGT-PLAYTEST-FINDINGS.md`, `EVALUATION.md`) — read them for history,
not for open work. The last faithfulness gap — Roscoe's `ej=sp` "Special Prices on Upgrades Today!"
discount — was implemented this session (see "Resolved this session" below). Full suite green:
**51 files / 1,958 tests; tsc clean.**

**What is actually open (small):**

1. **Live UGT re-verification of the 2 follow-up findings is still pending** (Mac UGT repo). The code
   fixes and headless tests are done; what's outstanding is the harness re-run + the fuel-disciplined
   **sonnet-competence velocity run** that would confirm the projected 5–15× score-velocity lift from
   the Finding-1 varfix. Tracked in UGT `PLAN-FORWARD.md` § "NEXT STEPS". Not a code change — a
   measurement task. See "UGT re-verification" below for the one-liner.
2. **Future-by-design (do NOT start without a decision):** the design "big wins" from the archived
   `EVALUATION.md` §6 (onboarding polish, richer economic-goal surfacing, rank-curve tuning) and the
   **Great Void → larger quest** content pass (`EVALUATION.md` §7). These are deliberate future content,
   not bugs.

**Resolved this session (2026-07-09):** Roscoe's daily upgrade discount (SP.SPEED `up3`, "Special Prices
on Upgrades Today!") is now modeled. The announcement side already existed (`traders.ts` "Today: X has
specials"); this added the actual price effect. `upgrades.ts` gained `getDailyUpgradeSpecialSystem`
(date-deterministic system 4–11, mirroring `random(8)+3`; no schema column needed),
`applySpecialUpgradeDiscount` (the `up3` step-down table), and `isUpgradeSpecialActive` (Commander
score≥150 AND docked in the day's special system). `calculateUpgradePrice` takes an `applySpecial` flag;
`upgradeShipComponent` applies it to STRENGTH upgrades and the shipyard-upgrade screen shows the banner +
`[Special Price!]` on the receipt. Tests: `tests/upgrades.test.ts` (discount table + helpers) and
`playtest-coverage` `shipyard.upgrade_special_price` (keystroke path: 30,000→10,000 in-system vs full
out-of-system). Also fixed the stale `.env.ugt` `DAILY_TRIP_LIMIT` comment (said 2, now 3).

**Hard rules (from the user's global CLAUDE.md — follow exactly):**
- **Test through the UI, never the API.** Drive actions via the keystroke path —
  `handleScreenInput`/`handleScreenRequest` on the screen-router. Never use REST/`fetch` to bypass a
  screen a player would navigate (exception: `/api/navigation/launch`+`/arrive` ARE the sanctioned
  path — the real frontend calls them). Assert real effects (DB/state), not just "a screen rendered."
- **All tests must pass before committing.** Never dismiss a failure as "pre-existing." A statistical
  anomaly is a bug to investigate, not an observation to log.
- **After starting a server, verify the LISTENING PID is yours** (`lsof -nP -iTCP:<port> -sTCP:LISTEN`;
  on Windows `netstat -ano | findstr :<port>`) and grep the spawn log for `EADDRINUSE`. A stale server
  squatting the port passed health checks and silently invalidated a full test campaign on 2026-07-06.
- Don't commit or push unless asked.

**Environment setup (do this first):**
```
cd spacerquest-web
# If fresh checkout/machine: npm install; if fresh DB volume: npx prisma db push && npm run db:seed
docker compose up -d db redis                 # Postgres :5454, Redis :6380 (game's own, not Supabase)
export DATABASE_URL="postgresql://spacerquest:spacerquest@localhost:5454/spacerquest"
npm test                    # ~1,953 passing / exit 0 — needs DATABASE_URL + DB up; vitest 'forks' pool
npm run dev:server          # boots on :3000; dev login at GET /auth/dev-login (302 + JWT)
```
Confirm the baseline is green before changing anything.

---

## Reference — key facts for the next session

**Doc layout (after the 2026-07-09 reorg)**
- `docs/` — system design & spec: `PRD.md`, `GAME-ACTIONS.md`, `User-Manual.md`, `Traceability.md`,
  `ARENA_DESIGN.md`, `PLAYTEST-DESIGN.md`.
- `docs/archive/` — completed point-in-time reports: `UGT-PLAYTEST-FINDINGS.md` (the Phase-2 campaign +
  re-verification findings, all resolved), `EVALUATION.md` (dated stack/faithfulness/coverage audit).
- Root — `HANDOVER.md` (this, the living status doc), `plan.md` (old March coverage baseline),
  original 1991 source in `SQ/` + `Decompile/`.

**Architecture**
- Game logic = server-side "screens" in `spacerquest-web/src/game/screens/*.ts` (each exports
  `render`/`handleInput` returning `{output, nextScreen}`). Router: `src/sockets/screen-router.ts`.
  Hub: `main-menu.ts`.
- Frontend (`src/frontend/`) is a thin xterm terminal: keystroke → socket `screen:input` →
  `handleScreenInput` → screen. Second path: REST `/api/navigation/launch` + `/arrive` →
  `screenOverride` (arrival screens: combat, andromeda-dock, nemesis-lattice, black-hole-hub,
  black-hole-event).
- Game systems: `src/game/systems/*.ts`. Bots: `src/bots/`. Original 1991 source: `SQ/` +
  `Decompile/Source-Text/`. Reverse-engineered spec: `docs/PRD.md`, `docs/GAME-ACTIONS.md`,
  `docs/User-Manual.md`.

**Testing**
- Unit/integration: `vitest` (`tests/*.test.ts`), DB-touching tests need Postgres up. Pool is `forks`
  + `tests/vitest.setup.ts` disconnects Prisma (fixes a native-engine SIGSEGV on teardown).
- Headless coverage playtest: `tests/playtest-coverage.test.ts` — drives screens by keystroke, asserts
  DB effects (83 tracked actions). The regression net for the UGT findings, including the four newest:
  `navigation.bare_arrive_guard`, `navigation.double_arrive_guard`, `turn.end_turn_allowance`,
  `turn.end_turn_zero_trips`. Pattern to copy for new coverage.
- Prefer the headless keystroke-path approach over browser e2e for reliable coverage.

**UGT re-verification (Mac only)**
```
# repo: /Users/vs7/Dev/Games/_UGT Universal Game Tester  (START at its PLAN-FORWARD.md)
cd ../SpacerQuest/spacerquest-web && docker compose up -d db redis
NODE_ENV=test PORT=3005 \
  DATABASE_URL='postgresql://spacerquest:spacerquest@localhost:5454/spacerquest_ugt' \
  JWT_SECRET='ugt-test-secret-minimum-32-characters-long' REDIS_URL='redis://localhost:6380' \
  UGT_TRAINING=1 CLASSIC_MODE=false BOT_COUNT=0 npx tsx src/app/index.ts &
lsof -nP -iTCP:3005 -sTCP:LISTEN     # MUST be the PID you just spawned (see hard rules)
cd '../../_UGT Universal Game Tester'
export ANTHROPIC_API_KEY=$(grep '^ANTHROPIC_API=' .env | cut -d= -f2)
python3 integrations/spacerquest/run_llm_playtest.py 3 100 anthropic claude-sonnet-5
# Campaign artifacts land in integrations/spacerquest/results/ (gitignored). Reference sets kept
# locally: baseline-2026-07-05/ (pre-fix sonnet), oldcode-haiku-2026-07-06/ (pre-fix haiku control),
# reverify-newcode-2026-07-06/ (post-fix haiku). A 100-action run ≈ 7-9 min.
```
Expected: score velocity ~2–3× old code under haiku (33.7 mean/100 actions, [11,50,40]); the full
5–15× lift is still unconfirmed pending a fuel-disciplined (sonnet-competence) run — that run is
open item 2 above.

**Useful specifics**
- Delivery score is now `2 + trip distance + battles won this trip − battles lost` (varfix,
  `docking.ts`); per-trip counters are `patrolBattlesWon/Lost`, consumed+reset at docking/patrol payoff.
- Combat: each attack burns `floor(weaponStr/2)` fuel; below that, "Weapons Malfunction!" (attack
  skipped, enemy still fires). Big weapons need big fuel reserves — this now dominates combat outcomes.
- `DAILY_TRIP_LIMIT = 3` (`constants.ts:165`). Daily trips are an **allowance**, not a quota:
  `validateEndTurn` lets you end the turn with unused trips; the 3-trip cap applies only to *launching*
  a 4th trip.
- `POST /api/navigation/arrive` rejects with `400 "No active travel"` when there is no TravelState
  (guards the old bare-arrive score pump / double-arrive; `navigation.ts:169`, before any mutation).
- Roscoe's upgrade discount: a Commander (score≥150) docked in the day's `getDailyUpgradeSpecialSystem()`
  (systems 4–11, date-derived) gets the SP.SPEED `up3` step-down on STRENGTH upgrade cost — see
  `isUpgradeSpecialActive`/`calculateUpgradePrice(..., applySpecial)` in `upgrades.ts`.
- Credits are split `creditsHigh`*10000 + `creditsLow`. Bank requires Commander (score ≥ 150).
  Spacers Hangout = Sun-3 `[H]`. Wise One = 17, Sage = 18, Andromeda = 21–26, Maligna = 27,
  black hole = 28. `TRAVEL_WALLCLOCK_SECONDS = 3`; hazard checkpoints derive from distance.
- Dev baseline (`dev-setup-character`): score 148, 100k cr — the +20k COMMANDER honorarium fires on
  the first end_turn of every run; start baselines mid-band or subtract it in analysis.
- `.env.ugt`'s `DAILY_TRIP_LIMIT` / `ENCOUNTER_CHANCE` are **dead config** (nothing reads them; the
  hardcoded constants govern). Annotated in-file — do NOT "re-enable" them.

**Session state (2026-07-09, Mac):** `main` fixes all live through `394cf100` on branch
`ugt-reverify-findings`, plus this session's uncommitted working-tree changes (Roscoe `ej=sp` discount +
docs reorg). Design docs relocated to `docs/`; completed reports archived to `docs/archive/`. Full suite
re-verified green (51 files / 1,958 tests; tsc clean). db/redis containers left up. Nothing committed
this session unless the user asked.
