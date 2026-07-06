# SpacerQuest — Session Handover

> Paste the "PROMPT" section below into a fresh session. The rest is reference.

---

## PROMPT (paste this)

You are continuing work on **SpacerQuest**, a faithful web remake of a 1991 Apple II BBS game. The remake lives in `spacerquest-web/` (server-side terminal "screens" over sockets to an xterm frontend; the computer plays the other 20 spacers' turns). Working dir: `/Users/vs7/Dev/Games/SpacerQuest`.

**Read `UGT-PLAYTEST-FINDINGS.md` first — it is the current work order.** In the last session, the UGT
(Universal Game Tester) project ran a full LLM balance campaign against the LIVE server (~1,300 competent
actions through the real screens, 10×100 + 1×300 runs) and a sub-agent design-intent review board delivered a
verdict: **economy meets the design intent; progression deviates via confirmed rewrite bugs vs the 1991
source.** Robustness was perfect (0 crashes/violations). Two bugs were already fixed on this branch during
the campaign (nondeterministic user/character resolution; dev-setup run-isolation leaks — commits `c0f1b9fa`,
`7e671acc`). `EVALUATION.md` remains the broader evaluation ledger; its §5 coverage gaps (RNG seams, boss
missions, arena) are still open but now SECOND in priority.

**Your task: fix the ranked findings in `UGT-PLAYTEST-FINDINGS.md`**, in its suggested order:
1. **Cargo-docking score dropped the original's `+distance+wins` terms** (`docking.ts:227-244`, flat +2 vs
   `SP.DOCK1.txt` varfix; `patrol.ts:197` already does it right) + **`DAILY_TRIP_LIMIT` conflates 2
   sessions/day with 3 trips/day** (`constants.ts:162`). Together these are why conquest extrapolates to
   ~54,000 actions instead of the authentic months-scale.
2. **No fuel gate on attacking** — free full-power attacks at fuel 0 (`screens/combat.ts:177-178`); original
   made weapons "Malfunction!" and skip your round (`SP.FIGHT1.txt:308-310`).
3. **Roscoe's upgrade grants +10 strength at the per-+1 price** (`upgrades.ts:442` vs `SP.SPEED.txt:158-179`,
   contradicts its own comment at `upgrades.ts:10-15`).
4. **Silent cargo-contract refusal state** (near-soft-lock, root cause open — repro data referenced in the
   findings doc, §Finding 4).
5. Docs: Manual Appendix A rank thresholds (Admiral+ wrong); PRD §9.2's unachievable "~50% combat win rate".

Each fix needs tests through the keystroke path; extend `tests/playtest-coverage.test.ts` where it fits.

**Hard rules (from the user's global CLAUDE.md — follow exactly):**
- **Test through the UI, never the API.** Drive actions via the keystroke path — `handleScreenInput`/`handleScreenRequest` on the screen-router (what a real keypress runs). Never use REST/`fetch` to bypass a screen a player would navigate. Assert real effects (DB/state changes), not just "a screen rendered."
- **All tests must pass before committing.** Never dismiss a failure as "pre-existing" — investigate the root cause and fix it. A statistical anomaly (e.g. expecting 30% hazards, seeing 0) is a bug to investigate, not an observation to log.
- Don't commit or push unless asked. (As of 2026-07-05 the tree is clean; branch
  `playthrough-coverage-rng-seams` is pushed and current.)

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

**Session state (2026-07-05):** working tree clean; everything committed on `playthrough-coverage-rng-seams`
(latest: UGT dual-validation fixes `c0f1b9fa`/`7e671acc` + this handover/findings doc). Note `origin/main`
has moved ahead separately — reconcile when merging. The UGT test harness lives in the sibling repo
`../_UGT Universal Game Tester` (see its `PLAN-FORWARD.md` for the campaign record; re-verification one-liner
is at the bottom of `UGT-PLAYTEST-FINDINGS.md`).
