# UGT Phase-2 Playtest — Handover Report & Findings

**Date:** 2026-07-05
**Produced by:** UGT (Universal Game Tester) Phase 2 — LLM balance playtester driving the LIVE
`spacerquest-web` server (Socket.IO screens + the same navigation HTTP the real frontend uses).
**Test volume:** 10 runs × 100 actions (claude-sonnet-5) + 1 × 300-action endurance run + ~200
guide-tuning actions = **~1,300 competent LLM-chosen actions**, on top of Phase 1's 200 random/heuristic
steps. Every action went through the real terminal screens or the sanctioned nav HTTP — no API shortcuts.
**Raw data** (in the UGT repo, `integrations/spacerquest/results/`): `campaign-10x100-summary.json`,
`playtest-run-{1..10}.json`, `endurance-1x300-report.json`. Process/verdict record:
UGT `PLAN-FORWARD.md` § "GATE C VERDICT".

---

## FIX STATUS (2026-07-06) — all ranked findings resolved on this branch

| # | Finding | Fix |
|---|---|---|
| 1 | Cargo-docking score terms | `docking.ts` now applies the full varfix `s2=(s2+wb+q6+y)-lb` on every arrival (cargo y=2, no-cargo core y=2, rim y=4/8, wrong-port teleport −5 then y=2). `patrolBattlesWon/Lost` generalized to per-trip wb/lb counters (incremented for ALL battles in `screens/combat.ts` + disconnect resolution, consumed+reset at docking/patrol payoff). Trip distance (q6) is computed in `/api/navigation/arrive` before `completeTravel` deletes the TravelState and passed to `processDocking`. Also fixed en route: `tripsCompleted` (u1) was double-incremented (both `completeTravel` and `processDocking`) — now once per arrival, owned by `completeTravel`. |
| 2 | Free attacks at fuel 0 | `screens/combat.ts` + `processCombatRound`: if `fuel < floor(weaponStr/2)` or weapon power < 1, the attack prints `<weapon> Malfunction!`, is skipped, burns no fuel, and the enemy still fires (SP.FIGHT1.txt begin). |
| 3 | Roscoe's +10 for +1 price | `upgrades.ts`: strength upgrades grant exactly **+1** (SP.SPEED.S up1 `x=x+1`) at the unchanged tiered price. The ej=sp "Special Prices Today" discount is still unmodeled (noted in-code; needs per-session state). |
| 4 | Silent cargo-contract refusal | **Root cause found**: the Space Commandant interstitial (armed at weapons+shields ≥ 50 — which run 3 crossed via the Finding-3 bug) treated ANY key except N as "Yes", so a buffered "1" (meant for the manifest board) consented and warped the player into the Top Gun D/M/T offer menu, which swallowed every other key forever. Fixes: Commandant prompts (traders-cargo + space-patrol) now require an explicit **Y**; any other key = "Not now" + the board renders immediately; the Top Gun offer menu surfaces its exits on unrecognized keys. Credits were a proxy: the upgrade spree that crossed w+s≥50 is also what drained credits. |
| 5 | Manual Appendix A ranks | Corrected from `SP.END.txt:373-381` / `constants.ts` (Admiral 750, Top Dog 1,200, Grand Mufti 1,650, Mega Hero 2,250, Giga Hero 2,700); §4.8 scoring rewritten around the varfix formula (+1 per battle win at docking, not +10). |
| 6 | `DAILY_TRIP_LIMIT` | Now **3** (`constants.ts`), with the authentic SP.REG.S refusal text ("Only 3 completed trips allowed per day"); `EVALUATION.md` claim corrected. |
| 7 | PRD §9.2 ~50% win rate | Metric amended with a note explaining band matchmaking makes 50% unachievable by design; watch for degenerate values instead. |

All fixes are covered by keystroke-path tests in `tests/playtest-coverage.test.ts`
(§"UGT PHASE-2 FIXES") asserting real DB effects; full suite green (51 files / 1,949 tests).
The re-verification one-liner at the bottom of this doc remains the acceptance check.

---

## Executive verdict

**The economy meets the game's documented design intent. The progression does not — and every deviation
traces to a concrete, fixable rewrite bug against the 1991 source, not to the design.** The project's own
Authenticity-First principle (PRD §1.3/§2.4: "all formulas … unchanged") commits it to fixing these.

**Robustness is exemplary:** 0 invariant violations, 0 crashes, 0 hard soft-locks across all 1,500 tested
actions (LLM + random). The machine-checked invariants were: no negative fuel/credits/bank/cargo, system and
rank in range, battle outcomes mutually exclusive per encounter, no credit inflation, combat always
progresses, every action leaves a renderable screen.

**Measured balance (competent play):**

| Metric | Value | Reading |
|---|---|---|
| Trade-loop operating profit | **+71.6k cr mean / +77.5k median per 100 actions, 10/10 runs positive** | The cargo engine pays, exactly as the Manual §5.3 intends |
| Net credits incl. upgrade capex | median +33.8k / 100 actions; 2 runs deep negative from upgrade spending | Capex is a strategy-variance line, not a loop problem (but see Finding 3) |
| Endurance (300 actions) | +178.9k cr; +68k/+69k/+41k per 100-action third | Profitability is stable at scale |
| Score velocity | **18.4 ± 2.4 per 100 actions** | ⇒ cargo-only Conqueror ≈ **54,000 actions** — see Finding 1 |
| Combat record | 35 W / 1 L after weapons/shields 20; loot ~70 cr/win; ~9 rounds/fight | Ship-investment check works; combat is a fuel toll, not income (authentic) |
| Promotions | Exactly 1/run (COMMANDER) | Artifact of the dev baseline — see Finding M1 |

---

## Findings for the developers (ranked)

### 1. CONFIRMED · HIGH · Progression — cargo-docking score dropped the original's distance + battles terms

- **Where:** `spacerquest-web/src/game/systems/docking.ts:227-244` — `q6ForScoring = isBribedManifest ?
  cargoPayment : 0` (the comment literally says **"regular=TBD"**), then `newScore = score + q6ForScoring + 2`.
- **Original:** `Decompile/Source-Text/SP.DOCK1.txt:163-169` (varfix): `s2 = s2 + wb + q6 + y − lb` with
  y=2, **q6 = trip distance in astrecs**, **wb/lb = battles won/lost during the trip**. A long run with a
  win was worth ~+15–40 score, not +2.
- **Proof of oversight, not policy:** `systems/patrol.ts:197` implements the same original formula correctly
  (`score + wb + q6 + 1 − lb`).
- **Impact:** this is the root cause of the ~54,000-action conquest extrapolation (score 10,000 win,
  `screens/main-menu.ts:43`). At the intended daily cadence that is *years*; the original's pacing was
  months. Restoring `+ q6 + wb − lb` returns the curve to the authentic order of magnitude (~5–15× faster).
- **Fix:** compute trip distance and per-trip battle deltas at docking and add them to the score delta,
  mirroring patrol.ts. Also note Manual §4.8's "+10 per battle win" overstates the original (+1 wb at
  docking) — reconcile the doc while fixing.

### 2. CONFIRMED · HIGH · Combat/economy — attacking is FREE at fuel < weapons/2 (missing malfunction gate)

- **Where:** `spacerquest-web/src/game/screens/combat.ts:177-178` — `fuelConsumed = floor(weaponStrength/2)`
  then `newFuel = Math.max(0, fuel − fuelConsumed)`. **No fuel check before the attack resolves.** At fuel 0
  a player attacks at full power, forever, for free.
- **Original:** `Decompile/Source-Text/SP.FIGHT1.txt:308-310` — with insufficient fuel your weapons
  **"Malfunction!"**: your attack is skipped and the enemy still fires. Out of fuel = defenseless,
  retreat-or-pay. (Both versions clamp fuel at 0 — negative fuel is authentically impossible.)
- **How it was found:** the LLM playtester flagged it live twice (endurance run steps 94 and 203 — in combat
  at fuel 1–2 while each round should cost 8–10), and campaign run 9 hit it silently (4 no-op combat rounds
  at fuel 0, steps 88–91).
- **Impact:** an exploit (optimal play is to *drain* fuel to 0 before long fights, deleting the fuel economy
  from combat) and an authenticity break. **Not a soft-lock** — retreat is always free in both versions
  (`systems/combat.ts:716-737`, `SP.FIGHT1.txt:210-211`).
- **Fix:** gate the player attack on `fuel >= fuelConsumed`; on failure print the malfunction message and
  proceed straight to the enemy's round.

### 3. CONFIRMED · MEDIUM · Economy — Roscoe's strength upgrade grants +10 for the original's per-+1 price

- **Where:** `spacerquest-web/src/game/systems/upgrades.ts:442` grants `strength + 10` per purchase at the
  price `(floor(str/10)+1) × 10,000` (`upgrades.ts:21-26`) — **contradicting its own doc comment at
  `upgrades.ts:10-15`** ("per-1-point strength upgrade").
- **Original:** `SP.SPEED.txt:158-179` — same price formula grants **+1** strength (with a home-system
  discount the rewrite omits entirely). Roscoe's was the extreme late-game sink for pushing 90→199 past the
  shipyard cap.
- **Impact:** simultaneously ~10× too generous per point vs the original AND a mid-game capital trap vs the
  shipyard tier path (tier-9 = strength 90 for 10,000 cr flat, `upgrades.ts:35` — the documented path,
  Manual §5.2). Two campaign runs cratered (−87.6k, −28.0k) buying 20–30k Roscoe upgrades the shipyard sells
  for hundreds. Fix restores both authenticity and the intended shipyard-first progression.

### 4. CONFIRMED · MEDIUM · Near-soft-lock, root cause OPEN — cargo contracts silently no-op in some state

- **Data:** campaign-wide, all 44 successful contract signings happened at credits ≥ 39,870 and **all 29
  failures at credits ≤ 12,420** (run 3, steps 43+): the agent pressed T→A→1→Y twenty-nine consecutive
  times and *nothing changed* — no destination set, no error surfaced in state, turn counter advanced.
- **Root cause open:** the signing path (`screens/traders-cargo.ts` pendingManifestChoice → Y) has **no
  credit check**, so the credits correlation is a proxy for something else. Candidates to investigate: an
  empty/exhausted daily manifest board (`generateManifestBoard`), the `manifestDate`/second-visit halving
  logic, location, or a fuel gate. Repro data: UGT `results/playtest-run-3.json`, steps 43+ (full state
  snapshots + terminal text per step).
- **Impact:** a player in this state gets zero feedback and is functionally locked out of the income loop —
  run 3 spent 57 of 100 actions in this hole. Even if a message renders on the board screen, the contract
  refusal is invisible in every state field a player tracks. Find the gate, then surface it loudly.

### 5. CONFIRMED · MEDIUM · Docs — User-Manual Appendix A rank thresholds wrong from Admiral up

| Rank | Manual App. A (wrong) | Code + SP.END.txt (correct) |
|---|---|---|
| Admiral | 600 | **750** |
| Top Dog | 900 | **1,200** |
| Grand Mufti | 1,100 | **1,650** |
| Mega Hero | 1,400 | **2,250** |
| Giga Hero | 1,700 | **2,700** |

`User-Manual.md:1137-1147` vs `constants.ts:27-37` / `SP.END.txt:373-381`. The Manual self-flags these as
"not independently verified" — they are now verified wrong; update Appendix A. (Lieutenant→Commodore rows
are correct.)

### 6. CONFIRMED · LOW · Pacing — `DAILY_TRIP_LIMIT = 2` conflates sessions/day with trips/day

The original allowed **2 login sessions AND 3 cargo trips per day** (Manual §2.8:226-246). The rewrite's
`constants.ts:162` caps trips at 2, and `travel.ts:203-207` prints the *session* message when blocking the
3rd *trip*. `EVALUATION.md:43`'s "3-trip-cap intact" claim is inaccurate. Cutting daily trips by a third
compounds Finding 1's slowdown. Fix: `DAILY_TRIP_LIMIT = 3` (and keep sessions as a separate concept if
sessions ever matter again).

### 7. PLAUSIBLE · LOW · Docs — PRD §9.2's "~50% combat win rate" metric is unachievable by design

The authentic jm/jn encounter-band matchmaking (`systems/combat.ts:182-207`, GameConfig ju=3/jv=5) means an
upgraded ship only ever gets engaged by opponents in its band — our weapons-20 agent only ever fought K1 and
went 35W/1L. That is the *original's intended* behavior (weak/overpowered players get skipped). Amend the
PRD metric, not the mechanics.

---

## Already fixed during this campaign (committed on this branch)

These were found by the playtest harness mid-campaign and fixed at the source (dual-validation), commits
`c0f1b9fa` and `7e671acc`:

1. **Nondeterministic user/character resolution** — `dev-login` used a bare `findFirst()` over all users and
   every route + the socket layer used unordered `findFirst({userId})`. With multiple users/characters in
   the DB, HTTP and socket sessions could bind DIFFERENT characters (observed live: battle counters
   "resetting" 41→0, and a 40-attack combat stall where attacks hit character A while `in_combat` was read
   from character B). Fixed: oldest-first ordering in dev-login + socket auth; `dev-setup-character` now
   enforces one-character-per-user.
2. **Test-run isolation leaks in `dev-setup-character`** — it never reset `battlesWon`/`battlesLost` (which
   feed Battle Factor and salvage quality, so successive test runs fought measurably better), `bank`, or
   `isConqueror` (a stale win flag made every subsequent run report a win). All now reset.

Also annotated: `.env.ugt`'s `DAILY_TRIP_LIMIT` env var is dead config (nothing reads it; the hardcoded
constant governs), same class as the previously-annotated `ENCOUNTER_CHANCE`.

## Measurement caveats (for whoever re-runs the numbers)

- **The dev baseline (score 148) injects a guaranteed +20k COMMANDER honorarium into every run** — larger
  than the raw mean credits_gain it contaminates. Start test baselines mid-band (e.g. score 200) or subtract
  the honorarium in analysis.
- Coverage: the verdict covers the **core loop** (trade/combat/upgrade/repair/refuel/end-turn). Jail,
  lost-in-space rescue, bank, surrender/tribute, pub, patrol, missions, and Andromeda were not exercised.
- The agent's cargo choice was fixed (always manifest slot 1) — metrics measure loop economics under fixed
  contract choice, not full-strategy play.
- LLMs under-flag on their own (0 volunteered flags in 1,000 campaign actions despite two flag-worthy
  events); the UGT playtester now auto-flags mechanically when the same action produces no material state
  change 3× against a stated expectation.

## Suggested fix order & re-verification

1. Finding 1 (score terms) + Finding 6 (trip limit) — a few lines each; restores intended progression.
2. Finding 2 (fuel malfunction gate) — small, kills an exploit.
3. Finding 3 (Roscoe's +1) — one line + the home-system discount if desired.
4. Finding 4 — investigate root cause from `playtest-run-3.json`, then add visible feedback.
5. Docs: Findings 5 and 7.

After fixes, a cheap re-verification from the UGT repo (server up with `CLASSIC_MODE=false`):
`python3 integrations/spacerquest/run_llm_playtest.py 3 100 anthropic claude-sonnet-5` — expect score
velocity to jump ~5–15× (Finding 1), combat fuel spend to bite (Finding 2), and no change in the 0-violation
robustness record.

---

## RE-VERIFICATION RESULT (2026-07-06) — run from the UGT repo against this branch's fixes

3×100 LLM actions (`claude-haiku-4-5-20251001`, user-directed; a same-model old-code control run scored
17/100 vs sonnet's 18.4, so the model swap barely moves the baseline). Raw data in the UGT repo:
`integrations/spacerquest/results/reverify-newcode-2026-07-06/` (+ `oldcode-haiku-2026-07-06/` control).

- **Finding 1 CONFIRMED FIXED.** Per-delivery score = 2 + trip distance + wins − losses, verified
  per-step through the real UI/HTTP path (+11 for a 9-distance haul; +7 probe-verified for a clean 1→6
  hop on both the cargo and plain-docking paths). Score velocity 33.7 mean [11, 50, 40] per 100 actions
  vs 17 same-model old-code (~2–3×). The full 5–15× needs combat wins and long hauls — the agent went
  0W/14L (see next line), so −lb dockings dragged the mean. Directionally and mechanically correct.
- **Finding 2 CONFIRMED FIXED — and it bites hard.** Keystroke-path probe at fuel 1: "Weapons
  Malfunction!", 0 fuel burned, enemy still fires. In campaign play the agent (which over-upgraded
  weapons to 99 → ~50 fuel/attack) went **0W/14L across 300 actions**, losing every fight it entered
  at low fuel — the pre-fix 35W/1L record was the free-attack exploit at work. Fuel logistics is now a
  real combat constraint, as in the original.
- **Finding 6 CONFIRMED** (3 trips/turn), **Finding 4 no recurrence** (0 silent contract-refusal
  stretches in 300 actions; weapons+shields crossed 50 — the old trigger — in every run).
- **Robustness held: 0 invariant violations in 300 actions.**

### New findings from this pass (unranked, for triage)

> **FIX STATUS (2026-07-06, same-day):** both findings below are **FIXED on `main`** (code + tests, suite
> 51 files / 1,953 passing). 1: arrive now 400s (`No active travel`) with no TravelState, before any state
> mutation — double-arrive also rejected (tests `navigation.bare_arrive_guard`, `navigation.double_arrive_guard`).
> 2: `validateEndTurn` now treats daily trips as an allowance — end_turn allowed at any tripCount outside
> classic mode, 3-trip launch cap unchanged, confirm screen shows "You have N unused trip(s) today. End turn
> anyway?" (tests `turn.end_turn_allowance`, `turn.end_turn_zero_trips`). Live re-verification from the UGT
> harness pending (queued with the sonnet-competence velocity run).

1. **CONFIRMED · MED · Bare `POST /api/navigation/arrive` is a score pump + encounter spawner.** With no
   active TravelState the route still runs `processDocking` — the (new) plain-docking varfix awards +2
   (q6=0) and an encounter spawns, every call, without limit (probe: 148→156 in 4 back-to-back calls,
   never leaving Sun-3). Introduced by the Finding-1 fix extending varfix to plain docking. Not
   reachable from the UI (the frontend only calls arrive after travel), but trivially scriptable.
   Guard: reject `/api/navigation/arrive` when no TravelState exists.
2. **CONFIRMED · LOW-MED · Poverty trap between `end_turn` and `buy_fuel`.** `validateEndTurn`
   (`systems/end-turn.ts:22`) refuses until `tripCount == DAILY_TRIP_LIMIT` (now 3), and
   `traders-buy-fuel.ts:79` refuses when credits < cost. Both print a terminal message but change
   nothing in game state (UGT's contradiction detector auto-flagged both: run 1 steps 35 and 56). A
   player too broke to fund a 3rd trip can neither fly nor end the turn — with the cap raised 2→3 this
   state is easier to reach. Recoverable in our runs, but consider allowing end_turn with unused trips:
   the original treated the 3 daily trips as an allowance (Manual §2.8), not an obligation to fly.
