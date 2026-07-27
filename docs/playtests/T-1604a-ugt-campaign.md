# T-1604a · UGT campaign run — findings report

**Date:** 2026-07-26
**Task:** T-1604a (campaign only — **no game code was changed**; fixes are T-1604b / T-1605b).

---

## 1. Method + provenance

UGT (the sibling repo `C:/dev/Games/ugt-universal-game-tester`) was pointed at Rimward through
the repaired T-1003 stdio protocol. Every action in this campaign was formed **only** from the
`LegalActionSpec`s the engine's own `legal-actions` enumerator advertised, sent as an
`apply-action` over `packages/sim/dist/protocol-stdio.js`, and answered by the same pure
`handleMessage` core the UI drives.

| Provenance | Value |
| --- | --- |
| Game under test (SpacerQuest) | `50b3bb37` (`T-1603c: Combat & survival tuning`) |
| Protocol bin | `C:\dev\Games\SpacerQuest\packages\sim\dist\protocol-stdio.js`, mtime `2026-07-26 17:12:05` |
| UGT commit | `b53165b5` (`Scrub game-specific integrations from core…`) |
| UGT integration files | **Restored from `dcf8858^`** — `integrations/` is gitignored in the UGT repo and had been deleted from disk (`ugt.config.yaml`, `feature-map.yaml`, `rimward_gym_bridge.py`, `smoke_spacerquest_adapter.py`, `README.md`, `HANDOFF.md`). `invariants.py` (UGT T-101) was never tracked and was **re-authored** from the T-101 spec in the UGT repo's `TASKS.md`, including T-301's corrected dice ceiling `[0, MAX_DAWN_HAND_SIZE=7]`. |
| Campaign driver | `integrations/spacerquest/campaign_t1604a.py` (new) |
| Full per-action trail | `integrations/spacerquest/results/t1604a-actions.jsonl` — **11,646 lines, 3.5 MB, retained in the UGT repo** (deliberately NOT committed here; the 2026-07-17 branch committed a 19,844-line JSON and that is not repeated) |

Everything the campaign drives is UGT's own game-agnostic machinery — nothing was forked or
re-implemented (UGT `LESSONS.md` M1): `ugt.utils.config_parser.UgtConfig`,
`ugt.adapters.subprocess.SubprocessAdapter`, `ugt.utils.feature_map.FeatureMap`,
`ugt.core.verifier.verify_game`, `ugt.core.exploit_hunter.ExploitHunter`, and
`ugt.core.trial.{GateRunner, InvariantSuite, first_divergence}`. The exploit hunter **already**
never stops on a failure (it dedups into `HuntReport.findings` and keeps walking) — that *is* the
"no stopping per failure" memory protocol, so no early exit was added.

### Reproduce

```sh
# 1. Build the protocol bin (SpacerQuest repo root)
npm run build -w @spacerquest/sim

# 2. Restore the UGT integration (only needed on a fresh clone — integrations/ is gitignored there)
cd C:/dev/Games/ugt-universal-game-tester
mkdir -p integrations/spacerquest
for f in ugt.config.yaml feature-map.yaml rimward_gym_bridge.py smoke_spacerquest_adapter.py README.md HANDOFF.md; do
  git show "dcf8858^:integrations/spacerquest/$f" > "integrations/spacerquest/$f"; done

# 3. The campaign (~110 s)
PYTHONIOENCODING=utf-8 python integrations/spacerquest/campaign_t1604a.py
#   --quick   tiny volumes; proves the harness, not the game

# 4. The raw-wire spike on its own
PYTHONIOENCODING=utf-8 python integrations/spacerquest/smoke_spacerquest_adapter.py

# 5. This repo's ActionBlocked parity proofs
npx vitest run packages/sim/src/__tests__/protocol.test.ts -t "T-1604a"
npm run test:e2e -w @spacerquest/ui -- action-blocked-parity.spec.ts
```

> **Reading the campaign transcript.** `campaign_t1604a.py` uses UGT's `GateRunner`, which is
> fail-closed: its footer reads **`T-1604a CAMPAIGN NOT MET — 14/16 checks`**. That is the correct
> and intended output — the two failing checks are the `inv_no_negative_resources` violations of
> Finding F1, and a failed check is DATA (LESSONS M3). Nothing was softened to turn it green. This
> is a *different* gate from the SpacerQuest repo gate (`tsc -b` / `lint` / `format:check` / `test`
> / `test:e2e`), which is green for this task.

Committed evidence lives in `docs/playtests/results/`:
`T-1604a-campaign-summary.json` (the machine-readable leg/ledger summary every number below is
read from), `T-1604a-coverage-report.json` (Phase-1 verify), `T-1604a-campaign-console.txt` (the
full gate transcript).

### Legs

| # | Leg | What it is |
| --- | --- | --- |
| 1 | spike | `smoke_spacerquest_adapter.py` — raw Rimward wire, no adapter class, no Gym layer |
| 2 | verify | `verify_game(config, FeatureMap, max_turns=80)` — Phase-1 feature coverage |
| 3 | tour-one | `ExploitHunter`, uniform policy over the **full 22-id table**, `UGT_TERMINATE_ON=era`, 8 × 300 |
| 4 | veteran | same, `UGT_TERMINATE_ON=career-end`, `UGT_MAX_DAYS=120`, 6 × 900 — walks days 30→131 |
| 5 | competence | a state-driven policy that **selects among ids only** (no cost, route or rule), 6 × 900 |
| 6 | determinism | two fresh `SubprocessAdapter` subprocesses, identical recorded id stream, `first_divergence` |

---

## 2. Pre-flight information-integrity audit (UGT `LESSONS.md` §B, P1–P11)

Run **before** any volume. Cited disposition for each.

| # | Check | Disposition |
| --- | --- | --- |
| **P1** | The agent must see entity **identities**, not opaque handles | **N/A by construction, verified.** No LLM pilot in this campaign. Every driver is structural: it picks among `LegalActionSpec`s the engine itself emitted and fills each parameter from the domain that spec declares (`rimward_gym_bridge.Bridge._select`/`_fill`), so identities are never needed to choose legally. Recorded as N/A rather than passed. |
| **P2** | The adapter must pass through every field the game marks PUBLIC | **FIXED this round — was a real gap.** Diffed `Bridge._state()` against `StateSummary` (`packages/sim/src/protocol.ts:137-186`). The 2026-07-17 normalizer dropped `renownRank`, `eraEvent`, `flags`, and the whole legal-action shape. Restored five machine-actionable reads: `renownRank`, `eraEventActive`, `nemesisUnlocked`, `tourOneResolved`, `legalActionCount`. Still-dropped fields are now justified **in a comment at the definition site**: display strings (`systemName`, `destinationName`), the dawn-hand face values (the enumerator returns legal `spendDie` indices directly), board/storylet *contents* (the bridge picks specs off the live legal list, never a cached board), and crew/port id lists (the invariants read counts). |
| **P3** | Truncation is silent starvation | **N/A.** No prompt, no guide, no char budget in this campaign. The JSONL trail is unbudgeted and complete (11,646 lines / 3.5 MB, one line per applied action). |
| **P4** | The action channel must send what the caller thinks it is sending | **FIXED — this was the headline pre-flight defect.** Bridge id 9 was `forfeit_cargo`, but `Trade/forfeit-cargo` **does not exist** on the Rimward redesign line: `legalActions` (`protocol.ts:459-508`) never advertises it, and the name survives only as a `TradeEvent` label emitted by `legacy.ts` on succession. Every fire of id 9 therefore fell through the bridge's `spec = specs[0]` fallback and was logged under the wrong name. Re-pointed at `Port/buy` (T-1307). Separately, **the silent fallback itself was fixed**: the bridge now records `specType` (the class actually sent) and `fellBack` on every JSONL entry and in `info`. Without those two, §6's per-id ledger and every per-id claim in this report would be unverifiable. |
| **P5** | The prompt must not leak what the real client hides | **N/A.** No prompt. The bridge reads exactly the `StateSummary` the protocol serves to any client — it has no god-view channel. |
| **P6** | The guide must teach the RULES, not just the entities | **N/A.** No strategy guide. The competence policy in leg 5 encodes **no** rule: every branch reads a field the bridge already reported and returns an *action id*; it never computes a cost, a route, a price or a DC (`campaign_t1604a.competence_policy`). |
| **P7** | Verify competence from the reasoning text, not the exit code | **Adapted, passed.** No reasoning text exists, so the competence probe is behavioural: leg 5 reached **day 151, 9,806 cr, 17 encounters, 0 negative-credit states** versus the uniform walk's day 131 / 2,881 cr — the policy demonstrably plays a different, deeper game than random. |
| **P8** | Never pool batches across an information fix | **BOUNDARY DECLARED.** P2 and P4 above are information fixes. **The 2026-07-17 batch (71,107 actions, 0 blocked) is permanently unpoolable with this one** — it was measured with a 20-id table whose id 9 was a phantom verb and whose ids 20/21 did not exist, over a normalizer missing five state reads. This campaign re-baselines; do not average the two. |
| **P9** | One clean run proves the channel, not the balance | **Acknowledged, scope-limited.** This is a robustness/parity campaign, not a balance verdict. Balance is T-1603a–c's fleet sweep. Findings 3–5 below are reported as *observations with measurements*, and the report does not claim a tuned economy. |
| **P10** | The agent needs MEMORY — tally distinct vs total, look for interleaved repetition | **MEASURED — see §6.** `collections.Counter` over the JSONL keyed by `(actionName, systemId)` and `(actionName, day)`, plus the per-id fallback rate. Interleaved repetition is present and characterised. |
| **P11** | A prompt-level warning is advice; a hard ceiling needs code | **N/A (no prompt), but the adjacent trap was checked.** The corollary — "a noise-floor metric must exclude synthetic no-op steps from its own denominator" — applies here and is honoured: the volume tally (§3) counts the bridge's own `actionsApplied` (which only increments on a real `apply-action`), and `end_day` is excluded from the id-coverage check by name because it is a lifecycle rollover that never produces an applied action. |

**One more pre-flight fix, from LESSONS O10** ("a rung that passes at its old check count after new content
shipped has not tested the new content"): the bridge's 20-id vocabulary predates T-1306/T-1307 and never
covered `Reroll` or `Crew/dismiss`, both of which `legalActions` advertises (`protocol.ts:552-596`). Added as
ids 20/21, `action_space.size` bumped 20 → 22 in lockstep in `ugt.config.yaml`. And the bridge terminated
every episode at the day-30 era flip, so **no prior campaign had ever walked the veteran era at all**; the new
`UGT_TERMINATE_ON=career-end` knob (which reads the protocol's own stop signal — empty `actions`,
`canWait:false`, empty `lifecycle`) lets legs 4–5 run to day 131 and 151.

---

## 3. Volume

Two independent tallies, per LESSONS O8 — both reported, neither quietly preferred.

| Leg | Hunter steps | **Applied actions** (bridge `actionsApplied`) | Fell back | Max day |
| --- | --- | --- | --- | --- |
| 3 · tour-one (uniform, 8 ep) | 2,225 | **1,990** | 1,216 | 31 |
| 4 · veteran (uniform, 6 ep) | 5,400 | **4,695** | 2,773 | 131 |
| 5 · competence (6 ep) | 5,400 | **4,503** | 4 | 151 |
| **Hunt-leg total** | 13,025 | **11,188** | 3,993 | — |
| Verify + determinism legs | — | +458 | — | — |
| **JSONL lines (every applied action, all legs)** | | **11,646** | | |

**≥ 1,000 UGT actions logged: MET, 11× over.** The two numbers differ by exactly 458 because the
JSONL covers more legs than the hunt-leg counter sum (verify and the two determinism runs also
drive the bridge and also log). That relation is asserted as its own gate check
(`volume accounting: JSONL >= summed hunt-leg actionsApplied`), not hand-waved.

Non-vacuity of the volume: the era flip was reached in **all three** hunt legs, 33 encounters were
entered and fought, 2 successions occurred, and the veteran/competence legs reached days 131/151 —
so the actions were spent on real, deep play, not on a stalled day 1.

---

## 4. Machine-checked invariants

Eight flat predicates (`integrations/spacerquest/invariants.py`, re-authored from UGT T-101), swept
after **every one of the 13,025 hunter steps** in all three legs via
`InvariantSuite(ALL_FLAT_PREDICATES).to_hunter_invariants()`.

| Predicate | Asserts | Result |
| --- | --- | --- |
| `inv_no_negative_resources` | `credits`, `debt`, `fuel` never negative | **VIOLATED** — see Finding 1 (`credits = -40`, legs 3 and 4) |
| `inv_fuel_within_tank` | `fuel <= maxFuel` | 0 violations |
| `inv_day_monotonic` | the calendar never runs backwards | 0 violations |
| `inv_phaseday_binary` | `phaseDay ∈ {0,1}` | 0 violations |
| `inv_blocked_from_legal_non_increasing` | **zero `ActionBlocked` from a legal-list pick** | 0 violations |
| `inv_protocol_errors_non_increasing` | no `error` response to a legal-derived action | 0 violations |
| `inv_era_one_way` | `eraVeteran` never flips 1 → 0 | 0 violations |
| `inv_dice_bounds` | `diceLeft ∈ [0, MAX_DAWN_HAND_SIZE=7]` | 0 violations |

`ExploitHunter` dedups by `(kind, name, action_name, message[:80])`, so the 44 raw finding rows in
the console transcript are **one** underlying defect surfacing under 22 different action labels ×
2 legs — the credit floor of Finding 1. Leg 5 (competence) took **0** findings.

**Determinism:** two independently-`connect()`ed `SubprocessAdapter` instances (two fresh node
subprocesses, both resolving `BASE_SEED + 0`) driven through an identical 200-step recorded id
sequence produced state streams of length **201 each with `first_divergence(...) == None`** —
byte-identical. Engine purity and `SeededRng` hold over the wire.

---

## 5. `ActionBlocked` UI/protocol parity — VERIFIED, all four reasons

The engine defines four reasons (`packages/engine/src/types.ts:341-353`) — one more than the
2026-07-17 campaign's three. Both surfaces are asserted for all four.

| Reason | Protocol proof | UI mirror |
| --- | --- | --- |
| `active-encounter` | `packages/sim/src/__tests__/protocol.test.ts:293-313` (pre-existing): apply during an encounter → `action-result` carrying typed `ActionBlocked`, committed to `eventLog`, no die spent | **NEW** `packages/ui/e2e/action-blocked-parity.spec.ts:65` — with the overlay up, all five blockable cockpit affordances (starmap jump, sign-contract, buy-fuel, repair, explore) are mounted but **refuse the pointer**; combat stances stay reachable |
| `destination-locked` | **NEW** `protocol.test.ts:390` — a Travel to sealed system 21, sent off the legal list, returns `action-result` + `ActionBlocked{Travel, destination-locked}`, exactly one `eventLog` entry, `diceRemaining` unchanged, `dayEventCount` unchanged | `packages/ui/e2e/nemesis-crossing.spec.ts:136-138` — NEMESIS **and** Andromeda-21 are not rendered as starmap nodes at all while locked (`toHaveCount(0)`) |
| `no-hangout` | **NEW** `protocol.test.ts:407` — `VisitHangout` at Aldebaran-1 → `ActionBlocked{VisitHangout, no-hangout}`, same four assertions | `packages/ui/e2e/hangout.spec.ts:131,143` — the `hangout-toggle` launcher is present at Sun-3 (`toHaveCount(1)`) and absent one hop away (`toHaveCount(0)`) |
| `career-ended` | **NEW** `protocol.test.ts:419` — `Explore` at `NEMESIS_SYSTEM_ID` (the enumerator advertises **nothing** there, asserted in the same test) → `ActionBlocked{Explore, career-ended}`, same four assertions | `packages/ui/e2e/nemesis-crossing.spec.ts:191-194` + `nemesis-ending.spec.ts:108-140` — the ending screen **replaces** the cockpit; the only control is `ending-return` |

The three new protocol cases deliberately **bypass the legal list**, because that path was the gap:
`destination-locked` / `no-hangout` / `career-ended` were previously proven only as
*non-advertisement* and as engine-level emission, never through `handleMessage`'s T-1003 commit
contract. Each asserts all four clauses of that contract — `action-result` (not `error`), the exact
`actionType` + `reason`, exactly one committed `eventLog` entry, and a pure log-append (no die
spent, `dayEventCount` unchanged).

**Campaign-wide guarantee, machine-checked:** the bridge forms actions **only** from advertised
specs, so any `ActionBlocked` in a response is a real enumerator defect. Across all three hunt legs:

```
blockedFromLegal = 0, 0, 0      protocolErrors = 0, 0, 0
```

over **11,188 applied actions** — and enforced *per step*, not just at the end, by
`inv_blocked_from_legal_non_increasing`. **Zero.**

> **Caveat, stated because it matters for how much this counter proves.** `blockedFromLegal == 0`
> covers only `ActionBlocked`. The enumerator also advertises verbs the engine then *typed-fails*
> (`ShipyardFail`, `PortEvent{failed}`, `TravelEvent{insufficientFuel}`), which burn a die and never
> touch this counter. See Findings 2 and 3.

---

## 6. Action ledger / P10

| Measure | Value |
| --- | --- |
| Applied actions (JSONL lines) | 11,646 |
| Distinct action names seen | 21 of 22 |
| Distinct `(actionName, systemId)` pairs | 233 |
| Top `(action, context)` repeats | `travel_contract` @ sys 8 ×794, @ 11 ×707, @ 5 ×699, @ 14 ×693, @ 18 ×686 |
| Top `(action, day)` repeats | `wait` @ d3 ×45, `wait` @ d2 ×36, `travel_contract` @ d28 ×36 |

The 22nd id, `end_day`, never appears **by construction**: it is a lifecycle rollover
(`end-day` + `start-day`), not an `apply-action`, so the bridge has no applied action to log. The
coverage check excludes it **by name with that reason** rather than by loosening the threshold.

**Interleaved repetition is present and is not, by itself, a defect** (P10's own correction: in most
games repetition is correct play). `travel_contract` ×794 at Mira-9 is the competence policy
re-attempting a jump it cannot afford — that repetition *is* Finding 3, and it is reported there.

### Per-id fallback rate — the honesty column

The bridge falls back to `specs[0]` when an id's preferred class is not advertised. A high rate
means **that verb was barely tested**, and before this round the ledger could not tell you so.

| Id | Fires | Fallback rate | Reading |
| --- | --- | --- | --- |
| `reroll` | 341 | **100 %** | never once fired for real — see Finding 4 |
| `crew_dismiss` | 321 | **100 %** | never once fired for real — see Finding 4 |
| `haggle` | 354 | 97.5 % | only legal with an unsigned, un-haggled board contract |
| `combat_fight` | 306 | 97.1 % | only legal inside an encounter (37 in the whole campaign) |
| `combat_run` | 358 | 95.0 % | ditto |
| `explore` | 335 | 89.0 % | fuel-gated |
| `visit_hangout` | 333 | 83.8 % | `hasHangout` systems only |
| `sign_contract` | 368 | 83.7 % | only with an empty hold |
| `buy_fuel_max` | 381 | 74.0 % | needs credits ≥ price and tank headroom |
| `pay_debt` | 339 | 64.6 % | needs credits > 0 |
| `storylet_first` | 350 | 63.7 % | |
| `port_buy` | 331 | 33.5 % | |
| `crew_hire` | 326 | 32.2 % | |
| `shipyard_buy` | 348 | 32.8 % | |
| `travel_random` | 335 | 26.9 % | |
| `shipyard_repair` | 451 | 19.7 % | |
| `travel_contract` | 4,570 | 2.4 % | |
| `wait` / `first_legal` / `random_legal` | 444 / 328 / 329 | 0 % | structural by definition |

Combat's three ids are ~96 % fallback simply because a uniform walk spends most of its life outside
an encounter (37 encounters entered in 11,188 actions). That is expected and is *not* filed as a
finding — it is recorded so that no future report reads "`combat_fight` fired 306 times" as
combat coverage.

---

## 7. Findings — severity-triaged

Root cause is routed per O6-D: **game** / **harness** / **UGT-core**. A failed check is DATA; no
assertion was softened to force a green, and nothing here is fixed — that is T-1604b.

### HIGH

#### F1 · HIGH · game · An unfloored storylet credit penalty drives `credits` negative

**Evidence.** `inv_no_negative_resources` fired in **two independent legs** with two **different**
storylets, both landing on `credits = -40`:

| Leg | Episode/step | Storylet | Choice | Credits before → after |
| --- | --- | --- | --- | --- |
| 3 tour-one | ep 6, step 73 (day 6, Aldebaran-1) | `cargo.nutri-goods.spoilage-scare` | `eat-the-loss` | 0 → **−40** |
| 4 veteran | ep 0, step 312 (day 23, Aldebaran-1) | `port.aldebaran.grain-exchange` | `broker-it` | 0 → **−40** |

Leg-3 `minCredits = −40`, leg-4 `minCredits = −40`. Once negative the state persists across dozens
of subsequent steps (which is why the deduped console shows 22 labels per leg for one defect).

**Root cause, cited.** `packages/engine/src/storylets.ts:326-327`:

```ts
if (effects.credits !== undefined) {
  state.player.credits += effects.credits;   // no floor
```

The `fuel` effect **directly below it** (lines 335-341) clamps to `[0, maxFuel]` and emits the
*actually applied* delta; the credits branch does neither. Both content sites are unguarded in the
same way: `packages/content/src/storylets.ts:813-814` authors `effects: { credits: -40 }` on
`eat-the-loss` with no `requirements.credits` gate, and `:2134-2136` authors the same figure as
`failureEffects` on `broker-it`'s TRADE check — so a captain at 0 cr takes the full fine, and on the
`broker-it` path takes it as the *outcome of a roll* it had no way to decline. Every **other**
credit-deduction site in the engine is clamped
or gated (patrol fine, combat tribute `canAfford`, the day wage, the hangout dare wager cap) — this
is the lone unguarded path, and it is exactly the defect the retired 2026-07-17 branch fixed and
this redesign line never inherited.

**Reproduce.** `python integrations/spacerquest/campaign_t1604a.py` (deterministic; leg 3 seed
20260726 ep 6, leg 4 seed 20260727 ep 0), or read
`results/t1604a-actions.jsonl` for the two entries above.

**Proposed disposition (T-1604b).** Floor at 0 in `applyStoryletEffects`, mirroring the `fuel`
branch, and emit the **applied** delta rather than the authored one, so the event log stays honest.
Regression test in `packages/engine/src/__tests__/storylets.test.ts` (RED at −40, GREEN at 0).

#### F2 · HIGH · game · Poverty/immobility trap: zero credits + an undeliverable contract has no exit

**Evidence.** Audited live over the raw wire before being confirmed (LESSONS M9), seed 20260728:

```
day 16 · Mira-9 (8) · credits 0 · fuel 29/300 · debt 25,000
activeContract → Pollux-7 (payment 2,200), hold full
stuck at the same system for 15 consecutive days
```

At **dawn with a full 5-die hand**, the enumerator offers: 1 × `Travel`, 1 × `Crew/hire`,
1 × `Port/buy`, 4 × `Shipyard/*`, 9 × `Storylet` choices — and **no income verb**. Concretely:

- `Trade/sign-contract` is not advertised (`player.activeContract` is set — the hold is full).
- `Trade/buy-fuel` is not advertised (`affordableFuel = floor(0 / price) = 0`).
- `Travel` **is** advertised, and every attempt returns `TravelEvent{insufficientFuel:true}` with
  `fuelUsed: 0`, `fuel 29 → 29`, `systemId` unchanged — **and one die spent**. The measured trace
  shows all five dice burned this way every day, days 3 through 16.
- `VisitHangout` (the Penny Wise loan, the designed bad-day out) is not advertised — Mira-9 has no
  Hangout.
- There is **no `forfeit-cargo`** verb on this line, so the hold cannot be cleared to sign a
  reachable contract; `activeContract` is cleared only by delivery, storylet, patrol or succession.
- There is **no subsistence floor** at dusk.

Left to run, the same seed reaches **day 401 · credits 0 · system 8 · fuel 29/300 · debt
38,055,255** — the ship never left Mira-9 for 385 days while the Guild marker compounded ~1,522×.
The uniform legs show the same signature at lower amplitude (`maxDebt` 172,181 on leg 4;
`fullTankStalledSteps` 579 on leg 5).

This violates the PRD design law that *no actor gets permanently trapped at zero with no move left —
the world provides floors.*

**Honest residual (audited, not hidden).** The probe's driver always jumped toward its contract
destination; a *short* hop to a near neighbour may still be affordable at 29 fuel. That does not
change the verdict — a short hop yields **no income** (delivery is the only payout and it is out of
reach, and the hold cannot be re-let) — but an exhaustive proof that *no* sequence escapes was not
performed here. That proof is exactly the property T-1605b already owns.

**Reproduce.** `docs/playtests/results/T-1604a-campaign-console.txt` (leg 5 `fullTankStalledSteps
579`, `maxDebt 269,362`); the live trace is reproducible by driving seed 20260728 with the
sign → refuel → travel-to-contract loop over `protocol-stdio.js`.

**Proposed disposition.** **Split across two tasks, deliberately.** The *fix* belongs to T-1604b —
restore a floor the world provides (a dusk subsistence stipend when stranded, and/or a
player-initiated abandon-contract verb advertised by `legalActions` and surfaced in the UI Trade
pane). The *invariant* belongs to **T-1605b**, which already owns "poverty-trap invariant over
adversarial states"; this report supplies it a fourth named adversarial state — *zero-credits with
an undeliverable contract at a Hangout-less system* — rather than duplicating that task here.

### MED

#### F3 · MED · game · The `Travel` enumerator gates on locks but not on fuel, so a headless driver burns a die per unaffordable jump

**Evidence.** `legalActions` (`protocol.ts:509-535`) filters `destinationId` by the
`nemesis.crossing.unlocked` gate — T-1101's own rationale is that it must "never advertise a Travel
the day.ts gate will deterministically refuse … burning a die on the block" — but it applies **no
affordability filter**. `resolveTravel` (`travel.ts:618-633`) then typed-fails with
`TravelEvent{insufficientFuel:true, fuelUsed:0}` **after the die is spent**. Measured: `fuel 29 →
29`, `diceLeft 5 → 4`, five times a day for fourteen consecutive days (F2's trace).

This is invisible to §5's parity counter — it is not an `ActionBlocked` — which is precisely why it
is called out. The UI does not have this problem: `route-preview` quotes the cost and `store.ts:850-853`
surfaces the dry-tank notice, so a human never spends the die. The **protocol client does**.

**Proposed disposition (T-1604b).** Either narrow the advertised `destinationId` domain to
destinations the current tank can reach (the T-1101 precedent), or attach the per-destination fuel
cost to the `Travel` spec's `note`/params so a driver can filter. Prefer the former: it is the same
"never advertise a guaranteed refusal" law already written into this function.

#### F4 · MED · game/harness · `Reroll` and `Crew/dismiss` are advertised but were **never once** reachable in 11,188 actions

**Evidence.** Per-id fallback rate **100 %** for both ids across the whole campaign (341 and 321
attempts). `Reroll` requires `player.dawnHand.rerollsRemaining > 0`, which only a reroll **crew
member** sets at dawn; `Crew/dismiss` requires crew aboard. The `crew_hire` id fired non-fallback
221 of 326 times (67.8 %), and `Crew/hire` was sent 247 times across all ids, yet **no durable crew
ever resulted** (`crew_dismiss` never found one to release) — the hire price is validated *on apply*
(`CrewEvent{failed}`) and a
Tour-One-budget captain (campaign `maxCredits` 2,786 / 2,881 / 9,806) cannot afford one. The
Phase-1 features written for exactly these verbs both report **NOT_REACHED**
(`T-1604a-coverage-report.json`).

Reading: the whole T-1306 crew/dice-progression subsystem is **economically unreachable inside the
volume a Tour One campaign can generate**. That is a balance/reachability statement, not a crash —
hence MED, and hence reported with the numbers rather than asserted.

**Proposed disposition.** Route to T-1604b as a *reachability* question for the crew price curve,
with T-1603a–c's balance sweep as the arbiter; and note for whoever takes it that a fix is only
provable once a driver can afford a hire, so the regression should be a seeded engine test, not a
campaign re-run.

#### F5 · MED · game · 68 % of Shipyard applies typed-fail after the die is already spent

**Evidence.** 707 `Shipyard/*` actions were sent from the advertised list; the campaign logged
**482 `ShipyardFail`** against 225 `ShipyardEvent`. `shipyard.ts:545-552` documents this as
deliberate — *"the die is spent BEFORE the business checks, so even a refused purchase consumes it.
The UI avoids wasting a die on a predictable refusal by gating its buttons on `quoteShipyard().ok`."*

So the rule is ratified, but the **mitigation exists only in the UI**. The protocol enumerator
advertises `Shipyard` unconditionally whenever `hasDie`, with no affordability/renown signal in the
spec — the same asymmetry as F3, from a different subsystem. `Port/buy` and `Crew/hire` share the
shape (advertise-then-validate-on-apply, `PortEvent{failed}` / `CrewEvent{failed}`).

**Proposed disposition (T-1604b).** Surface the UI's own `quoteShipyard().ok` predicate on the wire —
either as an advertise-gate or as a field on the spec — so a headless client has the same
information the cockpit already renders. This is a *parity of affordance* fix, adjacent to but
distinct from the `ActionBlocked` parity in §5.

### LOW

#### F6 · LOW · UGT-core · `verify_game` discards every feature's before/after/delta evidence

**Evidence.** `ugt/core/verifier.py:167-169`:

```py
for fid in coverage:
    if coverage[fid] not in details:      # compares a STATUS STRING against feature-id keys
        details[fid] = {"status": status_map.get(coverage[fid], "NOT_REACHED")}
```

`coverage[fid]` is `"passed"`/`"failed"`/`"not_reached"` while `details` is keyed by feature id, so
the guard is always true and every rich entry is overwritten with a bare status.
`T-1604a-coverage-report.json` is 976 bytes for 11 features and contains no `before`, `after` or
`delta` for any of them.

**Proposed disposition.** Fix upstream in the UGT repo (`if fid not in details`). Not a SpacerQuest
change; recorded here so the next campaign does not re-derive it.

#### F7 · LOW · UGT-core · `verify_game`'s idle action cannot advance Rimward's state, so slow-precondition features can never be reached

**Evidence.** `verifier.py:75-78` picks its idle action as `4 if state["ship"]["fuel"] < 100 else 0`.
Rimward's normalized state is **flat** — there is no `ship` key — so the lookup always defaults to
999 and the idle action is always **0 = `wait`**, which is inert by design (asserted by the
`wait_is_inert` feature: no credits, no fuel, no calendar movement). The verifier therefore cannot
tick the world forward, and any feature whose precondition needs accumulated credits/crew/rerolls is
structurally unreachable regardless of `max_turns`. This fully explains the three `NOT_REACHED`
rows and is why they are reported as a **named gap**, not a silent skip. Run duration: 0.1 s for
80 turns.

**Proposed disposition.** Fix upstream: make the idle action configurable (e.g. an
`engine.idle_action` key), or fall back to the game's own advertised no-op. In the meantime the
three affected features stay in `feature-map.yaml` reporting NOT_REACHED honestly.

#### F8 · LOW · harness · Two feature-map entries were measuring nothing

**Evidence.** `forfeit_cargo_clears_hold` asserted a verb that does not exist on this line; it could
only ever have "passed" via the bridge's silent fallback firing something else. **Deleted** this
round, and the missing escape hatch is reported as F2 instead of being papered over by a green cell.
Recorded as a finding because a green feature that measures nothing is worse than a red one.

### INFO · by-design

#### F9 · INFO · game · 2 successions across the campaign — the designed mechanic, not a defect

**Evidence.** `ShipLost` ×3 / `LegacySuccession` ×3 in the event tally; `successionCount` reached 1
in leg 4 (uniform) and 1 in leg 5 (competence), 0 in leg 3. No invariant is violated across a
succession — `credits`/`fuel`/`debt` stay in range and `inv_era_one_way` holds. This is
`legacy.ts::applySuccession` firing exactly as designed (a career that can end is the point, and
T-1603c deliberately tuned for a **nonzero** death rate). Reported, not filed for fixing.

---

### Triage summary

| Severity | Count | Items |
| --- | --- | --- |
| **HIGH** | **2** | F1 storylet credit floor · F2 poverty/immobility trap |
| MED | 3 | F3 travel fuel gate · F4 crew/reroll unreachable · F5 shipyard die-before-check |
| LOW | 3 | F6, F7 (UGT-core) · F8 (harness, already fixed) |
| INFO | 1 | F9 successions, by design |

---

## 8. Explicit non-goals and limitations

- **No game code was changed by this task.** The only SpacerQuest edits are three new
  `protocol.test.ts` cases, one new e2e spec, this report + its evidence, and the TASKS.md note.
  Every finding above is deferred to T-1604b / T-1605b, per the task's own scope boundary.
- **`ugt train` / `ugt evaluate` were not run** (out of scope for T-1604a).
- **The `ugt.cli` / Gym-env path was not exercised**, because `gymnasium` and `stable_baselines3`
  are not installed in this environment and `ugt` is not pip-installed, so
  `python -m ugt.cli …` fails at `from ugt.core.env import UniversalGameEnv`. The **same UGT
  adapters** (`SubprocessAdapter`, `verify_game`, `ExploitHunter`, `UgtConfig`, `FeatureMap`,
  `GateRunner`/`InvariantSuite`/`first_divergence`) were driven directly, exactly as UGT's own
  ladder scripts (`verify_round{1,2,3}.py`) construct them. Named limitation, not a silent omission.
- **P8 boundary:** the 2026-07-17 batch (71,107 actions) is **permanently unpoolable** with this one
  — see §2 P8. Re-baseline; do not average.
- **This is a robustness/parity campaign, not a balance verdict** (P9). The economy numbers in §7
  are measurements attached to findings, not a tuning conclusion.
- Findings F6/F7 are **UGT-core** defects and are not fixable from this repo.

---

## 9. Handoff to T-1604b

The HIGH list is **2**, comfortably under the "split before starting if >~5" threshold in TASKS.md,
so T-1604b can absorb both without splitting.

- [x] **F1** — FIXED in T-1604b. Floored at the one site, `packages/engine/src/storylets.ts`
      `applyEffects` (the `effects.credits` branch), mirroring the `fuel` clamp three lines below
      it and emitting the **applied** delta. Regression:
      `packages/engine/src/__tests__/storylets.test.ts` → `describe('T-1604b · F1 storylet credit
      floor')`, four cases, all four verified RED against the pre-fix engine.
- [x] **F2** — FIXED in T-1604b, on both locks. (a) A dusk **subsistence floor** in
      `packages/engine/src/day.ts` `endDay` (content `SUBSISTENCE_FLOOR_CREDITS`,
      `packages/content/src/subsistence.ts`), emitting the new `SubsistenceIncome` event;
      (b) a player-initiated **`abandon-contract`** verb in
      `packages/engine/src/actions/trade.ts`, advertised by `legalActions`
      (`packages/sim/src/protocol.ts`) and surfaced in the UI Trade pane
      (`packages/ui/src/App.tsx` `TradePane`, `[data-testid="abandon-contract"]`). Regressions:
      `packages/engine/src/__tests__/economy.test.ts` → `describe('T-1604b · dusk subsistence
      floor')`, `packages/engine/src/__tests__/actions.test.ts` → `describe('T-1604b ·
      abandon-contract')`, `packages/sim/src/__tests__/protocol.test.ts` → `describe('T-1604b · F2
      poverty/immobility trap')` (the audited state, driven through `legalActions`), and
      `packages/ui/e2e/manifest-trade.spec.ts` → "dumping the run clears the hold and re-opens the
      board". **The matching invariant remains T-1605b's**, which already owns the poverty-trap
      property test; this report hands it a fourth named adversarial state rather than duplicating
      the task.

Worth carrying into the same batch if cheap, since F3/F5 share one root shape (*the enumerator
advertises what the engine will refuse or charge a die for, and only the UI knows better*):

- [x] **F3** — FIXED 2026-07-27. See §11.
- [x] **F5** — FIXED 2026-07-27. See §11.

F4 is a balance/reachability question for the crew price curve; F6/F7 belong to the UGT repo.

---

## 10 · T-1604b resolutions

Written by T-1604b, the fix task. §7's findings text is deliberately **not** edited — a report's
findings are the record of what was measured. Resolutions live here and in §9.

**No waiver was requested.** The Accept line's "…or explicitly waived by the user, with the waiver
recorded in the report" branch is **unused**: both HIGH findings are fixed with regression tests.
Said here explicitly rather than left ambiguous.

### F1 · HIGH · FIXED

Floored at the single site — `packages/engine/src/storylets.ts`, `applyEffects`, the
`effects.credits` branch — with the exact shape of the `fuel` clamp three lines below it: clamp
first, then emit the **applied** delta. `StoryletEffectApplied.amount` therefore now means the
delta that actually landed, not the authored one; that semantic change is pinned by test 3 below.
**The content was NOT touched**, deliberately: `eat-the-loss` is the requirement-free choice its
storylet needs to satisfy the T-401 invariant (`storylets.test.ts` "every storylet offers at least
one requirement-free choice"), and `broker-it`'s −40 is the failure branch of a TRADE roll the
captain could not decline. The engine floors; the content stays.

Regressions in `packages/engine/src/__tests__/storylets.test.ts`:

1. the audited leg-3 case (`cargo.nutri-goods.spoilage-scare` / `eat-the-loss` at 0 credits) → 0
   credits, `amount: 0`;
2. the audited leg-4 twin (`port.aldebaran.grain-exchange` / `broker-it`, failure branch forced by
   a natural 1) → 0 credits;
3. a **partial** floor (10 credits vs a −40 fine) → 0 credits and `amount: -10` — the test that
   pins the applied-delta meaning;
4. an **exhaustive content sweep** over every `STORYLETS` entry × choice ×
   `effects`/`successEffects`/`failureEffects` that debits credits, driven from the poorest balance
   each choice's own requirements allow: the purse never goes negative and the emitted deltas sum
   to the real movement. This is the regression that closes the finding _class_ rather than the two
   witnesses — a future unguarded fine is safe by construction.

**Mutation evidence:** all four were run against the pre-fix engine (the `+=` restored) and failed
RED — case 1 at `credits −40 / amount −40`, the sweep at
`cargo.medicinals.quarantine-seal/inspect/failureEffects drove credits negative: −100`.

### F2 · HIGH · FIXED (both locks)

The audited trap had two locks — no income verb, and a hold that could not be re-let. Both are
closed.

**(a) The dusk subsistence floor.** `packages/engine/src/day.ts` `endDay`, immediately after the
T-1307 port-income block (the dusk's last credit mutation — the loan and guild accruals write
_ledgers_, never credits) and before the day-30 resolution and `evaluateDeeds`, so any deed reading
credits sees the floored value. Guarded on `careerEnded(...) === false` and
`credits < SUBSISTENCE_FLOOR_CREDITS`, so every solvent dusk is byte-identical — no event, no
credit change, no rng draw (proven by a same-seed A/B on `rngState`). Credits are raised **to** the
line, never by it: a floor, not a faucet, and unfarmable. The number is `100`, the game's existing
broke line (`NPC_BROKE_CREDITS`), defined as data in `packages/content/src/subsistence.ts` and
disclosed as a post-T-1603 economy number in `docs/BALANCE-POLICY.md` Part C (E8). Closes the
asymmetry that was the actual bug: `npc.ts` `brokeIdle` has paid the _cast_ odd-job money since
T-106, while the player — named in the same PRD sentence — had no floor at all.

**(b) The `abandon-contract` verb.** `packages/engine/src/actions/trade.ts`: one die plus the
forfeited payment, and deliberately **no credit fee** (a fee would re-strand exactly the captain
the verb exists to free). An empty hold is a typed refusal that spends no die. The dumped contract
does not return to `market.manifestBoard`. It is a **new** `TradeEvent.action` value, not a reuse
of `'forfeit-cargo'` — that value is the succession/death forfeit and is read as such by the UI
obituary and the sim's death path, so overloading it would file a voluntarily dumped crate in a
captain's death notice.

Reachability, per standing constraints 2 and 6: `legalActions` advertises `Trade/abandon-contract`
whenever a die is in hand and the hold is full (`packages/sim/src/protocol.ts`, documented in
`packages/sim/PROTOCOL.md`), and the cockpit carries `[data-testid="abandon-contract"]` in
`TradePane`'s active-contract block.

Named readers (standing constraint 7), each asserted:

| Event / field                                            | Reader                                                                                              | Assertion                                                       |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `SubsistenceIncome`                                      | sim campaign roll-up `subsistenceDays` (`packages/sim/src/index.ts`)                                | `campaign-reach.test.ts`, broke-and-dry career                  |
| `SubsistenceIncome` (paired `WireEntry{kind:'plain'}`)   | UI wire pane via the existing generic path (`packages/ui/src/format.ts` `wireKind`) — no new UI code | `economy.test.ts` asserts the WireEntry rides with the event    |
| `TradeEvent{abandon-contract}`                           | sim route-leg tracker (closes the leg `'lost'`)                                                     | `campaign-reach.test.ts` → "abandon-contract closes its route leg" |
| `TradeEvent{abandon-contract}` (refusal)                 | UI store `failNoticeFrom` → visible notice                                                          | `actions.test.ts` (no die spent) + the e2e disabled-control assertion |
| `StoryletEffectApplied.amount` (new meaning)             | the F1 tests; the cockpit credits readout can no longer render negative                             | `storylets.test.ts` test 3                                      |

**Regressions.** The headline is `packages/sim/src/__tests__/protocol.test.ts` →
`describe('T-1604b · F2 poverty/immobility trap')`, which rebuilds the audited state field for
field (day 16, Mira-9, 0 credits, 29/300 fuel, an undeliverable Pollux-7 contract) and asserts it
through `legalActions` — the surface a headless driver actually sees: no income verb is advertised
(the trap is real), `abandon-contract` **is** advertised and applying it re-opens `sign-contract`,
and within five dusks `buy-fuel` is advertised again with credits above zero at every dawn. Both
"escape" assertions are RED before this task.

**Scope, restated from §7 F2's own split:** this is the regression for the _witnessed_ state. The
exhaustive "no sequence escapes" **invariant remains T-1605b's**, which already owns the
poverty-trap property test over adversarial states.

### Explicitly DEFERRED: F3 and F5 (MED)

§9 offers these as "worth carrying into the same batch if cheap". They were **not** done, and are
not silently dropped:

- **F3** (narrow the `Travel` `destinationId` domain to affordable destinations) changes the
  _advertised-action contract_ — the `legalActions` destination domain plus `PROTOCOL.md` — which
  is its own reviewable deliverable under the "one task ships one deliverable" rule, and it is a
  behaviour change every headless driver would feel.
- **F5** (put `quoteShipyard().ok` on the wire) is the same shape in a different subsystem.

Both are MED; T-1604b's Accept line covers HIGH. Proposed follow-up for the orchestrator/user to
add to TASKS.md: **`T-1604c · UGT MED-finding fixes (F3 travel-fuel gate, F5 shipyard
die-before-check)`**. F4 (crew/reroll economic unreachability) remains a balance question for
T-1603's successor, and F6/F7 remain UGT-repo defects.

### Fallout, named rather than absorbed

- **No `GameState` field was added** by either fix, so `CURRENT_SAVE_VERSION` is unchanged and no
  `MIGRATIONS` entry was needed. The two new event shapes are additive to the serialized
  `eventLog` and backward-compatible (old saves cannot contain them); a JSON round-trip test over a
  log holding `SubsistenceIncome` ships with the fix.
- **No existing golden was regenerated.** The day-loop golden and both protocol replay goldens are
  byte-identical — the floor never fires on a solvent script. A **third** replay log
  (`REPLAY_LOG_ABANDON`, seed 7) and its own new golden were added to cover the new Trade
  sub-action, rather than splicing an action into a stable log and burying a real regression under
  a re-pin.
- **The T-1603 balance suite passes unchanged.** Two structural assertions moved, both because they
  read a number the floor now touches: `crew.test.ts`'s crew-walk case (the "no charge on a walk"
  claim is now asserted _directly_, as the absence of a `CrewEvent{wage}`, instead of inferred from
  a closing balance) and `campaign-reach.test.ts`'s scripted broke-and-dry career (seed re-pinned
  1 → 3, with the seeds-1..10 sweep recorded at the site: 8 of 10 still register fuel starvation,
  so the T-1004 metric stays reachable).

---

## 11 · The MED follow-ups and one new finding (2026-07-27)

Written by the UGT-side re-baseline audit that re-ran the trial ladder against `28c2de3c` and found
it red. §7's findings text is again deliberately **not** edited — a report's findings are the record
of what was measured. F4 remains open and is still a balance question, not a defect.

### F3 · MED · FIXED

`legalActions` filtered `destinationId` by the T-1101 destination lock and by nothing else, so a
tank that could not cover a jump was still offered every system on the map. `resolveTravel` spends
the die and rolls the pilot check *before* it reaches its fuel branch, so the refusal costs a die and
returns nothing.

The cockpit never had the problem — it gates on `travelPreview().reachable` — so the fix gives the
wire that predicate rather than a second copy of it. **`canReachSystem`** (`actions/travel.ts`) is
now the single definition of `ship.fuel >= fuelRequired`, read by `travelPreview.reachable` and by
`legalActions`. A tank that can reach nothing is offered **no `Travel` spec at all** rather than one
with an empty `choices` list; fuel, the dusk subsistence floor and `abandon-contract` stay
advertised, so the withholding strands nobody.

Worth recording for whoever reads the finding later: at a **full** starter tank every ungated system
is reachable, so the filter is a no-op on day 1 and engages only once fuel is spent — which is
exactly the state F2 measured (29 fuel of 300).

Regressions in `protocol.test.ts`: the split-the-map witness at a part-full tank (both halves
asserted non-empty, since a one-sided check would pass vacuously at a full tank), the property over
four tank levels — which closes the finding *class* rather than two witnesses — and the dry-tank
case. All three verified RED against the unfiltered enumerator. One existing fixture moved with them
per the rebalance-fallout rule: the T-1505b crossing test flew a starter tank on the longest jump on
the map and now fuels to the engine's own quote, so its assertion is about the lock and only the
lock.

### F5 · MED · FIXED (and extended to the two verbs sharing its shape)

The fix is not a new "affordable?" field for the caller to interpret. It is to narrow what is
advertised until **filling a spec from its own declared domains always succeeds** — the contract the
rest of the enumerator already keeps.

Two of the four Shipyard shapes have a single discriminating parameter, so their domains narrow
exactly: `buy-cargo-pods` bisects the engine's own check for the largest quantity that fits hull and
purse, and `buy-special-equipment` filters its enum through the predicate that owns affordability,
renown **and** mutual exclusion. The other two are **joint** — cost depends on component *and* tier,
on repairMode *and* component — and a `ParamSpec` cannot express a joint domain, so they split into
one spec per component with an exact domain each (tier prices rise monotonically, so the affordable
tiers are a prefix and an int range says so precisely).

Two things fell out of the split. `repairMode: 'all'` now carries **no `component` key at all**,
which makes the F-R2-2 defect unrepresentable rather than merely documented — `execute` branches on
the mere presence of that key. And a broke captain is still offered the free work (a pristine
repair-all, a tier-1 swap the trade-in covers); withholding that would be wrong in the other
direction, and it is why the regression asserts "everything advertised quotes at 0" rather than "no
yard specs at all".

`Port/buy` (gated on `quotePort().ok`) and `Crew/hire` (role list filtered by `hirePrice`) were
carried in the same change: the finding named them as sharing the shape, and `resolveCrew` likewise
spends the die before it checks the price — the campaign sent 247 hires and berthed nobody. **This
does not fix F4**: the roles are still unaffordable on a Tour One budget, and now they are honestly
absent instead of eating a die to say so.

Every gate calls the engine's own predicate rather than recomputing a price in the enumerator.

### G1 · MED · NEW · FIXED · a protocol client could not open a demo career

Found while auditing what the T-1703 demo work left reachable. `createInitialState(seed, edition)`
has accepted an edition since T-1703, but `handleMessage`'s `new-game`/`reset` passed only the seed
— so the whole demo licence (both `demo-locked` verbs, the `demo-ended` refusal, the demo branch of
the stop signal, and the `edition` / `demoDaysRemaining` summary fields) was unreachable from **any**
protocol client, including the harness that would regression-test the shipped demo build. Every
existing demo test reaches past the protocol and builds a `GameState` by hand, which is what hid it.

`edition` is now an optional field on both messages, defaulting to `'full'` so every existing caller
and every recorded replay log is byte-identical. It is deliberately **not** inherited across a
`reset`, and an unrecognised value is a typed `error` rather than a silent downgrade to `'full'` — a
harness that asked for a demo and got a full career would report coverage it never had.

### The UGT-repo half

F6 (`verify_game` discarding every feature's before/after/delta) is **fixed** in the UGT repo; the
guard now reads `fid not in details`, and a re-run report carries before/after/delta again. F7's
specific `state["ship"]["fuel"]` lookup was already gone, but the defect it caused survived the
refactor as a hardcoded idle action of 0 — which for this game is the `wait` a feature assertion
separately pins as inert. UGT now takes an `engine.idle_action` config key.

### Gate

`tsc -b`, `lint`, `format:check` and `test` (1,089) green on each of the three commits. The cockpit
is untouched throughout — it does not consume `legalActions`.
