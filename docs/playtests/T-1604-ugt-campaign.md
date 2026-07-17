# T-1604 · UGT Campaign & Fix Loop — Findings Report

**Date:** 2026-07-17
**Method:** UGT (the sibling repo, `_UGT Universal Game Tester`) pointed at Rimward
through its **own CLI phases** — `ugt smoke-test` → `ugt verify` → `ugt train` →
`ugt evaluate`, all through `integrations/spacerquest/ugt.config.yaml` and the
Gym-wire bridge `rimward_gym_bridge.py` over the built
`packages/sim/dist/protocol-stdio.js` bin — plus the in-repo **protocol campaign
harness** (`packages/sim/src/protocol-campaign.ts`) driving the same T-1003
`handleMessage` core (`new-game → start-day → legal-actions → apply-action … →
end-day`) for the seed-swept invariant/determinism sweep.
**Loop discipline:** autonomous test → triage → fix → re-run (per the
`feedback_playtest_loop` memory protocol — no stopping per failure).

## Volume

| Source | Actions | Notes |
| --- | --- | --- |
| **UGT CLI phases (sibling repo, real wire)** | **71,107** | `results/ugt-cli-actions-summary.json` — smoke-test + verify + train (PPO 32,768 timesteps ×2) + evaluate (×3, incl. 5-episode random baselines); **0 ActionBlocked from legal picks, 0 protocol errors**; every one an `apply-action` over the spawned `protocol-stdio.js` |
| In-repo 6-seed × 2-picker sweep | 12,000 | `results/campaign-sweep-6seeds.json` — 0 blocks, 0 violations |
| Random-legal fuzzer, seed 42 (full log) | 1,200 | `results/campaign-random-legal-seed42-1200.json` |
| Trader-policy driver, seed 42 | 1,200 | deep-state run (debt cleared, combat, upgrades) |
| Acceptance test (vitest) | ~5,600 | `protocol-campaign.test.ts` (3 pickers, ≥1,000/run + determinism) |
| UGT-sibling raw wire smoke | 20 | `results/ugt-sibling-wire-smoke.txt` — no-Gym-layer wire proof |

**≥1,000 UGT actions logged: met by UGT itself, 71× over** — the sibling tool's own
CLI/config/adapter machinery drove 71,107 actions through the T-1003 wire (full
per-action JSONL retained in the UGT repo at
`integrations/spacerquest/results/ugt-actions.jsonl`, 16 MB; the committed summary
here carries the counts by action and event type).

## UGT CLI phases — what ran and what it found

| Phase | Result |
| --- | --- |
| `ugt smoke-test` | PASS — connection, obs mapping, 5 random-action steps (`results/ugt-cli-smoke-test.txt`) |
| `ugt verify` (Phase 1) | **9/9 features PASSED, 100% coverage** (`results/ugt-cli-coverage-report.json`): sign-contract, buy-fuel, travel, pay-debt, end-day, sign→forfeit, explore, wait-inert, plus the `parity_no_blocked_from_legal` invariant feature |
| `ugt train` (Phase 2a) | PPO, 32,768 timesteps over the live wire (~600 fps), model + VecNormalize stats saved (`results/ugt-cli-train.txt`) |
| `ugt evaluate` (Phase 2b) | **VALID** — trained mean reward **+124.0** vs random baseline **−8.4**, action entropy 0.76, no collapse; the learned policy plays the trade loop (sign → travel-to-contract → refuel → end-day) (`results/ugt-cli-eval-summary.json`) |

**Phase-2 side finding (harness-level, not a game defect):** the first eval — full
20-action table — collapsed to all-`wait` and **UGT's collapse detector correctly
flagged the run INVALID** (`results/ugt-cli-eval-summary-INVALID-fulltable.json`,
kept as evidence). Resolved with UGT's own Gate-1 `training.action_subset`
(trader macro-vocabulary), after which the eval is valid and decisively above
random. Tour One is not cleared by the 32k-step agent (0/5 wins) — consistent
with T-1603's finding that clearing the 25,000 marker demands genuinely competent
play; the shipped `traderPolicy` remains the competence probe.

The bridge (`rimward_gym_bridge.py`) is transport-only, per the sibling repo's
ddd_harness rule: every action id structurally selects among the specs the
engine's own `legal-actions` enumerator advertises — so the 71k-action
**0-ActionBlocked / 0-error** tally is itself a full-campaign parity proof.

## Method — three pickers, one protocol surface

Every action goes through `handleMessage` (the same pure core the stdio/WebSocket
transports wrap), never `applyPlayerAction` directly — so protocol-level defects
(over-advertised legal actions, phase stalls, ActionBlocked leakage) are in scope.

1. **`randomLegalPicker`** — a fuzzer that forms actions ONLY from the advertised
   `legal-actions` specs (random spec, random params). This proves the parity
   guarantee and reaches every player verb (Trade, Travel, Combat, Shipyard,
   Storylet, Explore, VisitHangout, Crew, Port).
2. **`makePolicyPicker(traderPolicy)`** — routes the sim's shipped, proven
   `traderPolicy` through the protocol per-day-batch, so the campaign reaches the
   DEEP states a competent captain reaches (debt cleared to 0, encounters fought,
   ship upgraded) rather than the poverty spirals a naive heuristic falls into.
3. **`competentPicker`** — a spec-only heuristic (a second parity probe).

## Machine-checked invariants (asserted every step)

- `credits ≥ 0`, `0 ≤ fuel ≤ maxFuel`, `debt ≥ 0`.
- `diceRemaining` (as the protocol reports it) equals the unspent indices of the
  committed dawn hand.
- **ZERO `ActionBlocked` results from a `legal-actions`-obeying pick** — the core
  parity guarantee (`legalActions` must never advertise an action the engine
  blocks). Any occurrence is a HIGH enumerator finding.
- No protocol `error` / `apply-failed`, and no throw escapes `handleMessage`.
- Determinism: same seed → byte-identical log (engine purity / `SeededRng`).

**Result across the 12,000-action sweep: 0 ActionBlocked-from-legal-picks, 0
invariant violations, 0 protocol errors, 0 crashes.** Deaths are **not** zero and
are not meant to be: **6 successions total, all under the random-legal fuzzer**
(seed 1: 1, seed 42: 1, seed 77: 0, seed 101: 1, seed 2024: 2, seed 31337: 1),
**0 under the trader policy** — see Finding 4, which triages them as the designed
succession mechanic firing on a naive agent, not a defect.

## Measured metrics (competent trader-policy, seed 42, 1,200 actions)

| Metric | Value | Reading |
| --- | --- | --- |
| Cargo deliveries (`TradeEvent`) | 1,003 | the trade loop pays |
| Merchant Guild debt | **cleared to 0** | the 25,000-cr onboarding debt is serviceable |
| Final credits | ~367k | competent play compounds |
| Encounters fought (`EncounterResolved`) | 154 | combat is reached and survived |
| Deaths (succession) | 0 | no unrecoverable spiral under competent play |
| Fuel-starvation stalls | **0** | no soft-lock: never ends a day unable to afford the cheapest jump |

The random-legal fuzzer, by contrast, does NOT manage fuel and legitimately
strands itself (156 stall-days on seed 42) — expected for a random agent and NOT a
game defect; its job is breadth + invariant coverage, which it delivers (9 verbs,
0 violations).

## Findings (ranked)

| # | Severity | Status | Finding | Fix |
| --- | --- | --- | --- | --- |
| 1 | **HIGH** | CONFIRMED · FIXED | A storylet failure-effect fine larger than cash on hand drove `credits` **negative** (−82 on seed 42, via the `cargo.spices.customs-sniff` "bluff" fail: `credits: -100` with <100 cr). `applyStoryletEffects` added the fine with **no floor**, unlike the `fuel` effect and unlike every other penalty site. | `packages/engine/src/storylets.ts`: floor at 0 (`credits = max(0, credits + effect)`), emitting the ACTUAL applied delta — mirroring the `fuel` effect and the deliberate clamps at every other penalty site (patrol fine, combat tribute `canAfford`, day wage `credits ≥ wage`, hangout dare wager cap). Regression: `packages/engine/src/__tests__/storylets.test.ts` § "T-1604 · storylet credits penalty floors at zero" (RED before: −70; GREEN after: 0). |
| 2 | LOW (harness) | FIXED | The policy-backed driver could commit a queued Trade/Travel **after** an encounter interrupted a jump mid-batch → an `ActionBlocked(active-encounter)` the batch planner never anticipated (14 on the first trader run). This is a **driver-discipline** gap (a real UGT client re-reads legal actions between steps), not an enumerator bug. | `packages/sim/src/protocol-campaign.ts` `makePolicyPicker`: re-read the live legal set and drop a queued action the engine would now refuse (skip non-Combat while `inEncounter`; skip orphaned Combat otherwise — matching `runCampaign` index.ts:2050-2053). |
| 3 | **HIGH** | CONFIRMED · FIXED | **Poverty-trap soft-lock (seed 77 × trader).** In the committed sweep, seed 77 diverged wildly: `daysPlayed 956`, `finalCredits 0`, `finalDebt 947,045,251,585` (vs ~433 days / ~250–320k cr / **0** debt for every other trader seed). Day-by-day trace: combat degraded **both** the hull (tank → 210) **and** the drives (per-jump fuel ↑) until, marooned at rim corner **Algol-2 (20)**, EVERY jump cost more fuel than a full tank could hold (`cheapestJumpFuelCost > maxFuel`). No fuel/credit amount frees such a ship — only a repair — so the picker re-queued the same dead Travel for ~926 straight days while the unpaid Guild marker compounded. The `cannotAffordCheapestJump` probe **missed** it (the tank held enough for SOME cheap jump, just not the wall). This violates the PRD design law ("no actor gets permanently trapped at zero with no move left … the world provides floors"). | **Threefold, root-cause:** (a) **Subsistence floor** — `packages/content/src/subsistence.ts` `SUBSISTENCE_STIPEND` + `packages/engine/src/day.ts` endDay: a stranded captain (`isStranded`, `economy.ts`) earns a small odd-job wage each dusk so it can climb back to a jump (the PRD "world provides a floor" law). (b) **`forfeit-cargo`** — `packages/engine/src/actions/trade.ts`: a player-initiated action to abandon an undeliverable contract (before this, `activeContract` cleared ONLY by delivery/storylet/patrol/succession — the sign gate then wedged the ship), advertised by `legalActions` and surfaced as the UI Trade pane's **Abandon** button (`store.ts` `abandonContract`, `App.tsx`). (c) **Strand-repair** — `packages/sim/src/index.ts` `planStrandRepair`: every policy repairs back to mobility ahead of all else when stranded. Regressions: `economy.test.ts` (`isStranded`), `day.test.ts` (subsistence floor), `actions.test.ts` (`forfeit-cargo`), `protocol-campaign.test.ts` seed-77 recovery (stalls now in (0, 150), debt < 1e10), `manifest-trade.spec.ts` (UI Abandon). Post-fix seed 77: **559 days, 3,601 cr, 42 stalls, debt arrested at ~3.6e8** — mobile and trading the whole map. |
| 4 | INFO (by-design) | ACKNOWLEDGED · RULED-IN | **6 successions in the sweep, all under the random-legal fuzzer, 0 under the trader policy** (`results/campaign-sweep-6seeds.json`: `deaths` = 1/1/0/1/2/1 on random-legal seeds 1/42/77/101/2024/31337; 0 on every trader row). This is the **designed succession mechanic** (`packages/engine/src/legacy.ts` `applySuccession` / `player.legacy.successionCount`) firing exactly as intended: the fuzzer picks legal actions at random with no fuel/finance management, insolvency-spirals into a fatal loss, and hands the career to an heir — the same nonzero-deaths outcome T-1603 treats as **desired** (a career that can end is the point). Not a defect: no invariant is violated by a succession (`credits/fuel/debt` stay in-range across the event), and the survivor-invariant is asserted by `legacy.ts`'s own succession test. The competent trader policy — the "can a real captain finish?" probe — takes **0** deaths across all 6 seeds, which is the safety signal that matters. | **No fix — reported, not patched.** Verified in scope: the sweep's `deaths` column is the intended random-agent outcome, and the trader-policy zero confirms no unrecoverable spiral under competent play (Finding 3 removed the one genuine soft-lock that *could* strand a competent captain). Succession itself is covered by `packages/engine/src/__tests__/legacy.test.ts` (survivor-invariant + `successionCount` increment). |

Root-cause investigation for the two initial red signals ruled OUT game defects:
- The competent picker's early "1,195 failed travels" was a **poverty spiral** (over-
  paid debt → broke → couldn't fund a far contract's fuel), a legitimate game
  state, resolved by delegating the competent driver to the shipped `traderPolicy`.
- Every other credit-deduction site (`patrol.ts`, `combat.ts`, `day.ts`,
  `hangout.ts`) was already clamped/gated — Finding 1 was the lone unguarded path.

### Finding 3 deep-dive — the rim-corner strand mechanism (seed 77)

The `finalDebt 947,045,251,585` in the sweep was the tell. Reproduced with
`npm run campaign -- --seed 77 --actions 1000 --picker veteran` and traced the live
state day-by-day:

- **Days 15–26:** the trader ventured to rim corner Algol-2 (20); repeated
  interdictions on the long, high-danger rim lanes forced it to RUN (which dumps the
  loaded ship back at origin and burns the outbound fuel), draining 3,000 cr → 0.
- **Day 30:** the Tour One marker (25,000) fell due while the ship was broke →
  UNPAID → `guild.debt-flagged` → the T-1309 marker begins compounding at 2%/dusk.
- **Days 30→956:** combat had left the hull at condition 7 (tank 210) **and** the
  drives worn, so from system 20 the cheapest possible jump cost **234 fuel > 210
  maxFuel**. The ship sat full-tanked (210/210) and solvent-ish yet **immobile** —
  no fuel or credit amount lifts a `cheapestJumpFuelCost > maxFuel` strand, only a
  repair. The picker re-queued the same dead Travel every day; the flagged marker
  compounded unchecked to ~9.5e11.

Why the harness's own soft-lock probe missed it: `cannotAffordCheapestJump` asks
whether SOME cheap jump is affordable, and early on the tank still held enough for a
shorter hop — so it read `fuelStarvationStalls: 0` even as the ship froze. The fix
does not touch the probe (it is honest); it removes the dead-end the probe can't be
expected to model, and the post-fix run now trips the probe legitimately (42 stalls,
all recovered) rather than freezing silently below it.

The fix is deliberately **root-cause and reachable by a real player**, not a picker
patch: the subsistence floor and `forfeit-cargo` are engine rules a UI client drives
(the Abandon button, the dusk wage on the wire); the strand-repair is the sim making
the same repair a thinking player would. The other five trader seeds are **byte-for-
byte unchanged** (the floor/repair predicates are false on every non-stranded dusk).

## ActionBlocked UI/protocol parity — VERIFIED (all three reasons)

| Reason | Protocol proof | UI mirror |
| --- | --- | --- |
| `active-encounter` | `protocol.test.ts` (pre-existing): apply during encounter → `action-result` carrying `ActionBlocked`, committed to eventLog, no die spent | `combat.spec.ts`: the full-screen combat overlay covers the trade/jump/shipyard panes the instant a jump is interdicted |
| `destination-locked` | `protocol.test.ts` § "T-1604 · ActionBlocked parity…": Travel to a sealed system (id 27) → `action-result` + typed `ActionBlocked(destination-locked)`, one eventLog entry, no die spent; `legalActions` never advertises it | `action-blocked-parity.spec.ts`: sealed systems (21/24/27/28) are not even rendered as selectable starmap nodes while the crossing is locked |
| `no-hangout` | `protocol.test.ts` § same: VisitHangout at a non-Hangout system → typed `ActionBlocked(no-hangout)`, one eventLog entry, no die spent | `action-blocked-parity.spec.ts` (+ `hangout.spec.ts`): the Hangout launcher is absent at a non-`hasHangout` system — no affordance to refuse |

Plus the campaign's whole-sweep guarantee: **0 ActionBlocked ever resulted from a
`legal-actions`-obeying pick** across the in-repo 12,000-action sweep AND the
71,107 actions UGT's own CLI drove over the wire.

## Reproduce

```sh
# In-repo campaign (any seed / picker):
npm run campaign -w @spacerquest/sim -- --seed 42 --actions 1200 --picker veteran
npm run campaign -w @spacerquest/sim -- --seed 42 --actions 1200 --picker random-legal
# Finding 3 — the seed-77 poverty-trap (now recovers):
npm run campaign -w @spacerquest/sim -- --seed 77 --actions 1000 --picker veteran --slim

# Acceptance (vitest):
npx vitest run packages/sim/src/__tests__/protocol-campaign.test.ts
npx vitest run packages/sim/src/__tests__/protocol.test.ts -t "T-1604"
npx vitest run packages/engine/src/__tests__/storylets.test.ts -t "T-1604"
npx vitest run packages/engine/src/__tests__/economy.test.ts -t "isStranded"
npx vitest run packages/engine/src/__tests__/day.test.ts -t "subsistence"
npx vitest run packages/engine/src/__tests__/actions.test.ts -t "forfeit"
npx playwright test action-blocked-parity.spec.ts manifest-trade.spec.ts   # (from packages/ui)

# UGT campaign — ALL of UGT's own CLI phases (from the UGT repo root):
export SPACERQUEST_UGT_LOG="$PWD/integrations/spacerquest/results/ugt-actions.jsonl"
python3 -m ugt.cli smoke-test --config integrations/spacerquest/ugt.config.yaml --profile rimward
python3 -m ugt.cli verify     --config integrations/spacerquest/ugt.config.yaml \
    --feature-map integrations/spacerquest/feature-map.yaml --max-turns 60
python3 -m ugt.cli train      --config integrations/spacerquest/ugt.config.yaml --profile rimward
python3 -m ugt.cli evaluate   --config integrations/spacerquest/ugt.config.yaml \
    --profile rimward --model integrations/spacerquest/models/ppo_rimward_final --episodes 5

# UGT sibling raw-wire smoke (no Gym layer):
python3 integrations/spacerquest/smoke_spacerquest_adapter.py
```

## Raw evidence

- `results/ugt-cli-actions-summary.json` — **71,107 UGT-driven wire actions** by action/event type; 0 blocked-from-legal, 0 errors (full JSONL in the UGT repo: `integrations/spacerquest/results/ugt-actions.jsonl`).
- `results/ugt-cli-smoke-test.txt`, `results/ugt-cli-verify.txt`, `results/ugt-cli-coverage-report.json` — smoke + Phase-1 verify (9/9, 100%).
- `results/ugt-cli-train.txt` — Phase-2a PPO training log (32,768 timesteps over the wire).
- `results/ugt-cli-evaluate.txt`, `results/ugt-cli-eval-summary.json` — Phase-2b valid eval (+124.0 vs −8.4 random); `results/ugt-cli-eval-summary-INVALID-fulltable.json` — the collapse-detector catch that motivated the Gate-1 action subset.
- `results/campaign-sweep-6seeds.json` — 6-seed × 2-picker aggregate (12,000 actions).
- `results/campaign-random-legal-seed42-1200.json` — full per-action fuzzer log.
- `results/ugt-sibling-wire-smoke.txt` — the raw UGT → Rimward wire smoke transcript.
