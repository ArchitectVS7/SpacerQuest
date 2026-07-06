# SpacerQuest — Session Handover

> Paste the "PROMPT" section below into a fresh session. The rest is reference.

---

## PROMPT (paste this)

You are continuing work on **SpacerQuest**, a faithful web remake of a 1991 Apple II BBS game. The remake lives in `spacerquest-web/` (server-side terminal "screens" over sockets to an xterm frontend; the computer plays the other 20 spacers' turns). The repo lives at `C:\dev\Games\SpacerQuest` on the Windows machine and `/Users/vs7/Dev/Games/SpacerQuest` on the Mac. The UGT test harness repo (`_UGT Universal Game Tester`) exists ONLY on the Mac, as a sibling of this repo.

**Read `UGT-PLAYTEST-FINDINGS.md` first.** Status as of 2026-07-06:
- All 7 ranked findings from the UGT Phase-2 balance campaign are **fixed on `main`** (through
  `98868f04`) and **RE-VERIFIED live** from the UGT repo (3×100 LLM actions + targeted probes — see the
  "RE-VERIFICATION RESULT (2026-07-06)" section of that doc). Suite green on both machines:
  51 files / 1,949 tests; tsc clean.
- The re-verification filed **two NEW findings** (bottom of that doc) that are now the fix queue.

**Your task, in order:**

1. **Fix NEW Finding 1 — bare-arrive score pump (MED).** `POST /api/navigation/arrive` with no active
   TravelState still runs `processDocking`: +2 score (plain-docking varfix, q6=0) plus a spawned
   encounter, every call, without limit. Guard the route (reject arrive when no TravelState exists —
   `src/app/routes/navigation.ts`, the `travelState` read near the top). Add a keystroke/route-path
   test in `tests/playtest-coverage.test.ts` §"UGT PHASE-2 FIXES" asserting a bare arrive changes
   neither score nor combat state.
2. **Fix NEW Finding 2 — end_turn/buy_fuel poverty trap (LOW-MED).** `validateEndTurn`
   (`src/game/systems/end-turn.ts:22`) refuses until `tripCount == DAILY_TRIP_LIMIT` (3), and
   `traders-buy-fuel.ts:79` refuses when broke — a player who can't fund a 3rd trip can neither fly
   nor end the turn. Preferred fix: treat daily trips as an *allowance* (end_turn allowed with unused
   trips — Manual §2.8 frames it that way), keeping the 3-trip *cap*. If the mandatory-trips rule is
   deliberate, surface both refusals prominently instead.
3. **Then `EVALUATION.md` §5 coverage gaps** — RNG seams, boss missions, arena (the standing
   second priority).
4. Smaller queued items: Roscoe's "Special Prices Today" (ej=sp) session discount is still unmodeled
   (noted in-code in `upgrades.ts`); `.env.ugt`'s `DAILY_TRIP_LIMIT`/`ENCOUNTER_CHANCE` remain dead
   config (annotated, do not "re-enable").

**Re-verification protocol (Mac only, from the UGT repo):** see "UGT re-verification" below. Expected
current numbers: score velocity ~2–3× old code under haiku (33.7 mean/100 actions, values [11,50,40]);
the 5–15× projection is still unconfirmed pending a fuel-disciplined (sonnet-competence) run — that
run is the UGT side's next step, tracked in UGT `PLAN-FORWARD.md` §"NEXT STEPS (2026-07-06)".

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
npm test                    # 1,949 passing / exit 0 — needs DATABASE_URL + DB up; vitest 'forks' pool
npm run dev:server          # boots on :3000; dev login at GET /auth/dev-login (302 + JWT)
```
Confirm the baseline is green before changing anything.

---

## Reference — key facts for the next session

**Architecture**
- Game logic = server-side "screens" in `spacerquest-web/src/game/screens/*.ts` (each exports
  `render`/`handleInput` returning `{output, nextScreen}`). Router: `src/sockets/screen-router.ts`.
  Hub: `main-menu.ts`.
- Frontend (`src/frontend/`) is a thin xterm terminal: keystroke → socket `screen:input` →
  `handleScreenInput` → screen. Second path: REST `/api/navigation/launch` + `/arrive` →
  `screenOverride` (arrival screens: combat, andromeda-dock, nemesis-lattice, black-hole-hub,
  black-hole-event).
- Game systems: `src/game/systems/*.ts`. Bots: `src/bots/`. Original 1991 source: `SQ/` +
  `Decompile/Source-Text/`. Reverse-engineered spec: `PRD.md`, `GAME-ACTIONS.md`, `User-Manual.md`.

**Testing**
- Unit/integration: `vitest` (`tests/*.test.ts`), DB-touching tests need Postgres up. Pool is `forks`
  + `tests/vitest.setup.ts` disconnects Prisma (fixes a native-engine SIGSEGV on teardown).
- Headless coverage playtest: `tests/playtest-coverage.test.ts` — drives screens by keystroke, asserts
  DB effects. §"UGT PHASE-2 FIXES" covers the seven fixed findings. Pattern to copy for new coverage.
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

**Useful specifics**
- Delivery score is now `2 + trip distance + battles won this trip − battles lost` (varfix,
  `docking.ts`); per-trip counters are `patrolBattlesWon/Lost`, consumed+reset at docking/patrol payoff.
- Combat: each attack burns `floor(weaponStr/2)` fuel; below that, "Weapons Malfunction!" (attack
  skipped, enemy still fires). Big weapons need big fuel reserves — this now dominates combat outcomes.
- `DAILY_TRIP_LIMIT = 3` (constants.ts). end_turn currently REQUIRES all 3 trips (see task 2).
- Credits are split `creditsHigh`*10000 + `creditsLow`. Bank requires Commander (score ≥ 150).
  Spacers Hangout = Sun-3 `[H]`. Wise One = 17, Sage = 18, Andromeda = 21–26, Maligna = 27,
  black hole = 28. `TRAVEL_WALLCLOCK_SECONDS = 3`; hazard checkpoints derive from distance.
- Dev baseline (`dev-setup-character`): score 148, 100k cr — the +20k COMMANDER honorarium fires on
  the first end_turn of every run; start baselines mid-band or subtract it in analysis.

**Do NOT do yet:** expanding the Great Void into a larger quest — flagged in `EVALUATION.md` §7 as a
deliberate future content pass.

**Session state (2026-07-06, Mac):** `main` at `98868f04` + this session's commits (re-verification
findings + this handover). All 7 original findings fixed AND re-verified; 2 new findings queued (tasks
1–2 above). Suite green both machines. Servers/probe DB from the re-verification session were stopped
and dropped; db/redis containers left up.
