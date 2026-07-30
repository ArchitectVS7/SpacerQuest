# N-series review brief — 2026-07-30

> Prepared automatically for **T-040** (`TASKS.md`, M4 — Checkpoint) against
> `docs/NPC_REDESIGN.md`. **It makes no decision and contains no new analysis.** Every number
> below is copied from a committed document with its source named inline; nothing here is
> re-derived, re-rounded or re-computed. **Four decisions are owed and none has been made.**
> The run halts on the commit that carries this file, and the runner may not self-approve any
> item in it.
>
> Source tree: `7d193c57` (`T-030: FIRST TASK: the instrument learns to see ports`). Baseline
> of record: `docs/balance/baseline-n11-shipped.json`. **No fingerprint is moved by this
> commit** — `docs/` and `*.md` are outside all three hashed corpora (`rulesFingerprint`,
> `instrumentFingerprint` and `docsFingerprint` all hash sources under
> `packages/{engine,content,sim}/src`), so a new file in `docs/` stales no fixture. That is
> asserted by construction; no fixture was re-extracted to demonstrate it.
>
> Line citations below are stamped **as of `7d193c57`** and are given as *heading first, line
> number second*, per this track's own convention that line citations rot (N7-RIG,
> `docs/NPC_REDESIGN.md:2568-2569`).

**How to read this**

- **Part 1** — the three UNRULED parity-ledger verbs (Explore, VisitHangout, Storylet): each
  row as it stands, each memo's own recommendation bullets, what each memo leaves open to the
  owner, and each memo's closing decision-owed line, verbatim.
- **Part 2** — N11's verdict: the Result line, its four graded limbs, the per-archetype p10
  floor table, and the structural reason recorded with it.
- **Part 3** — five items still open that this run did not touch, each with what it is, where
  it is argued, why it is still open, and who owns it.
- **Part 4** — the four decisions owed, as an unticked checklist phrased in the source
  documents' own words.

---

## Part 1 — the three UNRULED parity-ledger verbs

The ledger's own framing (`THE PARITY LEDGER`, `docs/NPC_REDESIGN.md:221-223`):

> The three UNRULED rows are deliberately not defaulted: "most" is only honest if every
> exclusion is a recorded decision rather than a silent gap. Rule on each (implement,
> fast-forward, or exclude with a reason) before N8 pins the living-field baseline.

And the memos' own framing (`UNRULED VERBS — decision memos`, `:229-235`):

> The ledger leaves three rows UNRULED (Explore, VisitHangout, Storylet). These memos cost
> each row out so that the owner's eventual call lands against measured numbers rather than
> an intuition about symmetry. **They make no call and change no code.** Each memo lays out
> (a) what the player's verb does, (b) what the cast has instead, (c) the three options with
> their real prices, (d) a recommendation with its reason, and (e) nothing further — it
> closes on `DECISION: OWED` and stops there. The ledger rows above are left untouched on
> purpose: a memo is an input to a decision, not the decision.

Sources for this Part, as of `7d193c57`:

| verb | ledger row | memo heading | §(d) recommendation | open-to-owner | §(e) decision line |
| --- | --- | --- | --- | --- | --- |
| Explore | `:204` | `### Explore — decision memo` `:237` | `:351-418` | `:419-422` | `:424-432` |
| VisitHangout | `:205` | `### VisitHangout — decision memo` `:436` | `:742-783` | `:785-790` | `:792-804` |
| Storylet | `:209` | `### Storylet — decision memo` `:808` | `:1122-1143` | `:1145-1157` | `:1159-1175` |

---

### 1.1 Explore

**Ledger row as it stands today** (`THE PARITY LEDGER`, `:204`), verbatim:

| player verb | NPC today | owed by |
| --- | --- | --- |
| Explore | never | **UNRULED — owner decides by N8** |

**Recommendation, condensed to the memo's own bullets** (`Explore — decision memo` §(d),
`:402-418`). The memo introduces them as *"offered as a recommendation, not as a ruling"*:

- **The destitute-explorer argument does not survive measurement.** It was the strongest
  case for implementing: explorers are one of the two destitute archetypes (medians 167 for
  explorers and 132 for fighters, as N10's Result records under "THE MONOPOLY LIMB IS NOW
  ARCHETYPE-SPLIT"), and salvage looked like income they cannot reach. Measured, Explore is
  a net credit **sink** for the actor that plays it — 53.8cr gross per attempt against
  400-640cr of fuel — and removing the verb from the shipped explorer policy leaves it
  **richer** (median 90,135 against 60,391; 101 of 120 seeds). So salvage is measurably a
  **cost the cast cannot afford**, not income they are missing.
- **It is doubly unreachable for the captains it was meant to help.** At day 120 the
  capstone's median captain carries 27 fuel (p25 = 4, p10 = 0) against an 80-fuel gate, and
  the p25 captain's 150cr buys none of it.
- **Therefore Explore is not the floor fix N11/N12 are hunting.** Worth saying plainly,
  because it removes a candidate from that search rather than leaving it open — the
  non-trader floor that did not move at N10 (p10 126 -> 126) will not move here.

The two measurements those bullets rest on, with the memo's own provenance (`:353-388`):

- **Measurement 1 — the ablation probe** (`.scratch/t010-ablate.ts`, gitignored), two arms
  over seeds 1..120 × 120 days, arm B filtering `Explore` out of `explorerPolicy`; arm A's
  `finalCredits` is byte-equal to `runCampaign(seed, 120, 'explorer').finalState.credits` on
  seeds 1-5 (5/5 MATCH).

  | quantity (n = 120 seeds x 120 days) | value |
  | --- | --- |
  | Explore attempts / run | 180.2 |
  | POIs discovered / run (nav-check pass rate) | 60.5 (**0.336**) |
  | `SalvageRecovered` events / run | 41.0 |
  | GROSS salvage credits / run | mean **9,688** · median 9,418 · p25 7,873 · p75 11,112 |
  | **GROSS salvage per _attempt_** | **53.8cr**, against 80 fuel = **400-640cr** |
  | POI-sourced fragments / run | 6.33 |
  | `ExplorationFailed` reasons (totals) | `nav-check` 3,275 · `insufficient-fuel` 923 |
  | finalCredits **with** Explore | median **60,391** · mean 57,847 |
  | finalCredits **without** Explore | median **90,135** · mean 90,198 |
  | seeds that ended **richer without** Explore | **101 / 120** |

- **Measurement 2 — the committed capstone.** `docs/balance/baseline-n10-shipped.json`,
  `fleet.milestones[day = 120]`, n = **240,000** captain-samples (8,000 runs × 30 captains):
  `npcCredits` p10 **126**, p25 **150**, median 76,049; `npcFuel` p10 **0**, p25 **4**,
  median **27**, p75 69, p90 100 — against `EXPLORATION_FUEL_COST = 80`.

**The memo's three honesty caveats on measurement 1** (`:390-400`), carried here because the
recommendation is hedged by them and reading the bullets without them would turn a hedged
measurement into a claim:

1. **The ablation is not rng-paired.** Removing actions shifts the within-day event-index
   forks, so the arms diverge rather than tracking each other. That is why the result is
   reported distributionally *and* as a paired sign count (101/120), never as a single mean
   difference.
2. **Arm B leaves the freed dice unspent.** It measures Explore's own net contribution, not
   "Explore against its best substitute".
3. **`explorerPolicy` is a _player_ policy** in `packages/sim/src`; it is not the NPC
   explorer archetype. What transfers to the cast is the **per-attempt** economics (53.8cr
   gross against 400-640cr of fuel), not the whole-run figure.

**What stays genuinely open, and belongs to the owner** (`:419-422`), verbatim:

> What stays genuinely open, and belongs to the owner: whether the *authored* rewards
> (fragments, charts) are worth carrying to the cast at all, and whether the verb is worth
> revisiting **after N13** gives the cast a hand — at which point the die-cost question
> that blocks option 1 has an answer.

**DECISION: OWED**

> The owner is choosing between: **option 1** implement at full parity (blocked on N13 and
> N11, costs a save migration and a new capstone), **option 2** algorithmic fast-forward
> recorded as a partial (no save change, still needs the die question answered), and
> **option 3** exclude with the stated reason (zero code, and N8 counts it as a ruled
> exclusion). Nothing in this memo selects among them.

---

### 1.2 VisitHangout

**Ledger row as it stands today** (`THE PARITY LEDGER`, `:205`), verbatim:

| player verb | NPC today | owed by |
| --- | --- | --- |
| VisitHangout | Socialize stand-in; no borrow/repay | **UNRULED — owner decides by N8** |

**Recommendation, condensed to the memo's own bullets** (`VisitHangout — decision memo` §(d),
`:744-783`). The memo frames the section as: *"The task's sharp question is whether NPC
borrowing gives the destitute archetypes a real recourse or merely a more elaborate
bankruptcy. The arithmetic answers it, and it answers it differently for the two halves of
the field"*:

- **For a captain below the ante, the loan is a rope, not a lever.** A captain locked out
  of Socialize is on `brokeIdle`, which pays **`NPC_ODD_JOB_CREDITS = 25`/day**. The carry
  on the *smallest loan the band allows* is **13cr/dusk** — **52% of that captain's entire
  daily income**, before a single credit of principal. They cannot service it, so they
  reach `dueDay` owing 445cr, default, and collect a 1.5× encounter multiplier they have no
  ship to survive (the same capstone puts `npcFuel` p25 at 4 and `npcHullStrength` p10 at
  10 against a 90 ceiling). That is the elaborate bankruptcy, arrived at by content
  arithmetic rather than by intuition.
- **The recourse it does buy is one step wide, and the step is real but small.** 250cr
  clears the 150 ante immediately, which unlocks a verb worth a measured **+44.1cr per
  action** at a measured **0.1101** frequency — about **+4.9cr per captain-day**. Against
  13cr/dusk of carry, the unlocked verb pays back **~37% of the interest** it was borrowed
  to reach. It also buys **31–50 fuel = 3–5 patrols** (at +40/−20 a sweep), which is the
  more plausible route out. Neither reaches a hull: 250cr stops at the **tier-3** yard rung,
  and **R10 (the tier-1 hull cliff) is R-owned and confounds any "buy a hull" arm** of this
  question outright, so that arm should not be run under this track.
- **So the destitute-borrower case is weak on the numbers, and the strongest case for
  lending is a different one.** It is the **counterparty defect**, which the probe measures
  independently of the loan question: `executeSocialize` adds **+4.86cr per captain-day**
  to the field against no counterparty at all — a pure **faucet** where the player's dare is
  a zero-sum transfer. That is a parity break in the verb the cast *already plays*, it needs
  no save-shape change, and it is arguably worth more than lending is. Recorded here rather
  than folded into the recommendation, because it is not the question the owner was asked.
- **And the cheapest item on the list is the venue gate.** **95.91% of the cast's
  Socialize actions resolve at a system with no Hangout.** One `STAR_SYSTEMS` read closes
  it — but it deletes ~96% of the verb's occurrences, so it moves the verb mix and owes a
  new capstone. That is a real price, and it is the reason the gate should not be treated as
  a free drive-by fix.

The memo's closing recommendation sentence (`:777-783`), verbatim:

> On that evidence, offered as a recommendation and not as a ruling: **option 2 over option
> 1, and only after the N4 ruling** — the ledger (borrow, shared accrual, default expressed
> as the encounter multiplier) is where the parity value is, the wager and the disposition
> beat are where the cost is, and the disposition beat in particular is unbuildable until (ii)
> above is answered. The `NpcState.loan` field is owed by option 1 and option 2 alike, so the
> **optional-field form** is the one to price first, because it is the only route that does
> not queue behind N11's version bump.

*Note carried from the memo itself: the counterparty-faucet bullet and the venue-gate bullet
are recorded **outside** the recommendation there, and they are outside it here too.*

**What stays genuinely open, and belongs to the owner** (`:785-790`), verbatim:

> What stays genuinely open, and belongs to the owner: whether Penny Wise's authored quest
> line tolerates thirty captains at her desk at all; the N4 `loan-default` /
> `contraband-caught` pairing, which should be ruled **with** this row rather than after it;
> the die cost, which is **N13's** and which no option here can close; and whether the
> counterparty faucet in bullet three is a separate work item or part of whatever this row
> becomes.

**DECISION: OWED**

> The owner is choosing between: **option 1** implement at full parity (an `NpcState.loan`
> plus a migration or the optional-field route, an actor-parameterised accrual function, an
> actor discriminator on `LoanEvent` before the instrument mis-attributes NPC debt to the
> player, a new sim limb, a new capstone, the N4 ruling as an input, and the die still blocked
> on N13), **option 2** the loan ledger fast-forwarded and recorded as a partial (same field
> cost — a debt is persistent state — but no wager, no counterparty, no disposition beat), and
> **option 3** exclude lending with the stated reason (zero code, and N8 counts the row as a
> ruled **partial**, not a ruled absence, because the cast already plays the verb). Nothing in
> this memo selects among them.

---

### 1.3 Storylet

**Ledger row as it stands today** (`THE PARITY LEDGER`, `:209`), verbatim:

| player verb | NPC today | owed by |
| --- | --- | --- |
| Storylet | authored player-facing content | **UNRULED — owner decides by N8** |

**Recommendation, condensed to the memo's own bullets** (`Storylet — decision memo` §(d),
`:1122-1143`). The memo's own lead-in: *"Offered as a recommendation, not as a ruling. **Option
3 — exclude with the reason recorded** — on four grounds, in descending strength"*:

1. **The shared once-only `completed` ledger makes cast participation subtractive for the
   player.** This is the strongest argument because it is structural and needs no
   measurement: 112 of 114 storylets are `repeat: 'never'` against **one world-scoped**
   `completed` map, so a captain resolving a beat does not play *alongside* the player, it
   plays *instead of* them. The Sage's decode storylets are the proof case — the game's only
   decoder, and each of its twelve beats consumable exactly once.
2. **The verb's rewards and gates are player-scoped by design, and the standing constraint
   requires the same rules *where the verb applies*, not that every verb apply** (the
   Explore memo's formulation, lines 334-335). 31.6% of triggers read a field that exists
   only on the player; the payload is prose with no cast-side reader.
3. **Option 1 is not reachable in this track's remaining steps regardless of the ruling.**
   It is blocked on N13 for the die and on a per-actor sub-state that queues behind N11's
   version bump — so the practical choice this quarter is between option 2 and option 3.
4. **And option 2's honest form is narrower than it first looks.** Its sub-shape (i) has no
   state to write and its sub-shape (ii) is a second definition of a player-facing outcome.
   What remains is the `resolveAbandonedChains` precedent, which is a precedent for the
   mechanism and not for the scope.

The memo also records the exclusion's classification (`:1115-1120`): one of the player's
eleven verbs stays player-only and N8's *"all or most of a full player's actions"* has to
count Storylet as a ruled exclusion — and *"because the cast does **not** play this verb at
all, this would be a ruled **absence**, the same class as Explore's option 3 — not a ruled
partial."*

**What stays genuinely open, and belongs to the owner** (`:1145-1157`), verbatim:

> What stays genuinely open, and belongs to the owner:
>
> - **Whether a *non-storylet* expression of cast-side narrative belongs anywhere.** The N4
>   `loan-default` / `contraband-caught` re-siting question (lines 681-687) is the same shape
>   — grudge writes that need a storylet-side expression or a re-siting — and it should be
>   ruled with an eye to this row, since "express it storylet-side" would be a heavier answer
>   in the hypothetical where this row is eventually ruled an exclusion.
> - **Two defects that exist today whichever option is chosen, recorded here rather than
>   folded into the recommendation** (the register T-011 used at lines 755-756): the
>   `dead`-unfiltered storylet lookups (part (b), three sites) and the actor-less storylet
>   events that the sim already folds into the player's smuggling counters. Neither is caused
>   by this ruling and neither is fixed by it; both are separate work items for the owner to
>   schedule.

**DECISION: OWED**

> The owner is choosing between: **option 1** implement at full parity (a per-captain
> `StoryletState` sub-state on `NpcState` with a `.strict()` schema declaration, a version
> bump queued behind N11's, a migration that calls the seeding rule, a per-actor answer to
> the global flag namespace, an actor parameter threaded through the whole 793-line storylets
> module, an actor discriminator on all six storylet events, a sixth `NPC_INTENT_TYPES`
> member with 30 `IDEAL_WEIGHTS` rows, a new sim limb, a new capstone, and the die still
> blocked on N13), **option 2** a fast-forward recorded as a partial (whose compliant form
> reduces to extending the `resolveAbandonedChains` precedent from the player's own unplayed
> chain to a captain's, which is a design question rather than a refactor — and which still
> buys persistent state and authored content, so it is save-free in neither direction), and
> **option 3** exclude with the stated reason (zero code, and N8 counts the row as a ruled
> **absence**, the same class as Explore, not a ruled partial). Nothing in this memo selects
> among them.

---

## Part 2 — N11's verdict

**Result (2026-07-30): CHANGE ACCEPTED — HYPOTHESIS HELD, AND BOTH DISPROVES LIMBS SURVIVED.**

Grading provenance, verbatim (`N11 — NPCs earn deeds and Renown (SHIPPED 2026-07-30)`,
`:1904-1908`):

> Graded at `docs/balance/baseline-n11-shipped.json` (1,000 seeds × 120 days ×
> 8 policies; the merge reported *"wrote aggregate for 8000 rows"*), diffed against
> `baseline-n10-shipped.json`, with the smoke fixture re-extracted FROM that capstone
> (`spreads harvested`). All four limbs by name:

### 2.1 PROVES 1 — real ranks and purchases through the gate: HELD

(`:1910-1929`.) The cast's rank distribution (`fleet.milestones[*].npcRenownRanks`, 240,000
captain-slots at each day) at all three reporting days:

| rung | day 30 | day 60 | day 120 |
| --- | --- | --- | --- |
| ADMIRAL | 8 (0.0%) | 105 (0.0%) | 881 (0.4%) |
| COMMODORE | 104,288 (43.5%) | 159,440 (66.4%) | 180,989 (75.4%) |
| CAPTAIN | 94,696 (39.5%) | 54,146 (22.6%) | 35,411 (14.8%) |
| COMMANDER | 37,049 (15.4%) | 22,886 (9.5%) | 19,494 (8.1%) |
| LIEUTENANT (zero-deed rung) | 3,959 (1.6%) | 3,423 (1.4%) | 3,225 (1.3%) |

- An EARNED rank above the zero-deed rung is held by **98.4% → 98.6% → 98.7%** of slots
  across days 30/60/120.
- CAPTAIN-or-better by **82.9% → 89.0% → 90.5%** — *"exact day-120 value 90.53%; an earlier
  draft's '90.6%' was a rounding slip, corrected here with the counts shown"*.
- The modal rung is already COMMODORE at day 30.
- `fleet.npcSpecialEquipmentPurchases` is **342,168 over 8,000 runs = 42.771 per run**
  (`:1926-1927`). The PARITY LEDGER's Shipyard row states the same quantity as **"42.8 gated
  purchases per run at the N11 capstone"** (`:203`). Both figures are carried with their
  sources; neither is re-derived here.
- The −1 lockout is gone, through the player's own `requiredRank` check with no NPC
  branch — `grep -rn "isNpc" packages/engine/src/actions/shipyard.ts` returns nothing.

### 2.2 PROVES 2 — the Honor List's top end and a contested spine: HELD AS AN INTERSECTION, with a recorded blindness

(`:1930-1939`.)

- Over 20 ambient seeds × 120 days, **73.3% of captain-slots own a rank-gated fit** (Star
  Buster 440, Arch Angel 413, both 413 of 600).
- Owners sit at mean component-score rank **11.73** against non-owners' **25.06** — the
  gated-fit owners ARE the top of the board, in **20 of 20 seeds**, and a waiting player holds
  **0 of the 8 titles**.
- It is graded as an intersection and not as "the board shows the fits" because **`honorList`
  scores components only** (`effectiveScore(ship[id])` + `allAroundScore` over
  `SHIP_COMPONENTS`) and is structurally **blind to the boolean `hasStarBuster` /
  `hasArchAngel`**. That blindness is *"a finding, not a defect fixed here"*.

### 2.3 DISPROVES · renown inflation — NOT DEMONSTRATED

(`:1940-1950`.)

- Off the rank-distribution table above, the cast's median rung runs **CAPTAIN → COMMODORE →
  COMMODORE** across days 30/60/120 and never exceeds COMMODORE.
- At day 120 the median captain sits **COMMODORE (9 deeds)**; the median player, off the same
  capstone at the same day, sits **TOP_DOG (17 deeds)** — two rungs higher, and the cast's
  13-deed source ceiling is *below* the player's median rank.
- **No cast slot reaches TOP_DOG or above at any milestone day** (ADMIRAL, the cast's ceiling
  rung, peaks at 0.4% of slots at day 120).
- Even the pathological `greedy` arm (a player who never trades) is CAPTAIN 55.2% /
  COMMODORE 43.1%, i.e. level with the cast median rather than under it, while every competent
  arm is TOP_DOG..GIGA_HERO. *"Deed pacing is right for a 30-seat field."*

### 2.4 DISPROVES · zero accrual — NOT DEMONSTRATED

(`:1951-1955`.)

- Every archetype accrues at every milestone day, and the limb N10 flagged as most at risk is
  the one that clears most clearly: the **fighter's** deed count runs **p10 1 → 2 → 2** and
  **median 5 → 7 → 8** across days 30/60/120; the **explorer's** p10 **4 → 5 → 5**.
- Fleet-wide `npcDeedCount` is **p10 3/4/5** and **median 8/9/10**. *"The coarse turn reaches
  the thresholds."*

### 2.5 The per-archetype p10 floor

Under N11's own heading **"DISCHARGED — N10'S HAND-OFF, WHICH OUTRANKS THE VERDICT, AND IT
ANSWERS NO FOR THE THIRD TIME"** (`:1957-1971`). Per-archetype `npcCredits` **p10 (the
FLOOR)** at the milestone days, n10 before → n11 after, off the two capstones' own 8,000-run
row sets — *"the probe's pooled p10 and median were asserted equal to both committed artefacts
before any before/after number was believed"*:

| archetype | p10 day 30 | p10 day 60 | p10 day 120 | median day 120 |
| --- | --- | --- | --- | --- |
| trader | 1003 → **132** | 74192 → **27987** | 382939 → **329990** | 687781 → 660977 |
| fighter | 125 → **125** | 125 → **125** | 125 → **125** | 152 → 145 |
| explorer | 125 → **125** | 125 → **125** | 125 → **125** | 136 → 149 |
| veteran | 126 → **126** | 126 → **126** | 127 → **127** | 161070 → 140763 |
| gambler | 126 → **125** | 109 → **106** | 128 → **126** | 55697 → 41668 |
| smuggler | 128 → **127** | 128 → **128** | 132 → **130** | 256210 → 233188 |
| POOLED | 126 → **126** | 126 → **126** | 126 → **126** | 76049 → **55437** |

### 2.6 The structural reason, recorded with the verdict

(`:1973-1983`, verbatim:)

> **THE STRUCTURAL REASON THE FLOOR CANNOT MOVE HERE, and it is the finding to carry
> forward: A DEED PAYS NO CREDITS.** `deeds.ts` never touches `credits` — a deed is a rank
> counter and rank is a SPENDING UNLOCK. So the only cash effect N11 can have is OUTWARD,
> and that is exactly what the capstone measures: cast median wealth **fell** 76,049 →
> 55,437 (−27%) and the trader floor fell 382,939 → 329,990, because the captains who could
> afford the gate bought through it. N10's hand-off hoped *"a deed sourced from fights won
> is the first income-adjacent reward a fighter earns"*; there is no such reward in the
> engine, for player or NPC. Four of six archetypes sit at a day-120 p10 of **125–130cr on a
> hull-40 ship, unchanged at every milestone day and unchanged by every policy arm** (the
> archetype × policy split is flat to ±1cr). **No deed weight, threshold, `150 × tier` or
> pacing constant was touched to move this** — a re-pricing is an owner call.

### 2.7 What the owner is being asked to do here

Accept or reject this verdict as recorded. **This brief takes no position on it.**

One fact about the state of the record, stated so the shape of the choice is clear:
`docs/NPC_REDESIGN.md`'s N11 heading already reads **`### N11 — NPCs earn deeds and Renown
(SHIPPED 2026-07-30)`** (`:1902`) and the baseline of record is already re-pinned to
`docs/balance/baseline-n11-shipped.json` (`:2041-2046`). A rejection is therefore a decision
about the **record and the sequel**, not an undo the runner may perform.

### 2.8 What N11 hands to N12 — a pointer list, not re-argued

Carried because it is the input the N11 accept/reject decision directly gates
(`TASKS.md:694-697` records N12 proper as deferred pending *"the owner's read on N11's floor
result"*). From the `WHAT N11 HANDS TO N12` block (standing amendment 4, `:2068-2105`), four
items:

1. **N12 is the last must-have that could move the wealth floor, and a cash-funded port
   economy is a two-archetype economy, not a six.** *"Measure port ownership PER ARCHETYPE
   from the first task, not fleet-wide"* — a fleet-wide number would hide it. If ports are
   unreachable for four of six archetypes, that is a finding to report and *"a re-pricing is
   an owner call — do not tune a port price to make the floor move."*
2. **The field is now armed, which changes N12's pacing input.** Read the day-30/60/120
   `npcCredits` percentiles from **`baseline-n11-shipped.json`**, not N10's; the cast's median
   wealth is 27% lower because it spent that money at the yard.
3. **`honorList` is blind to non-component assets, and N12 will hit this before N13 does** —
   the two rank-gated fits are invisible on the board and **a port will be invisible too**.
4. **For N13, one sharpened input** — the **13-deed** content slate bounds the cast's rank
   ceiling (fleet `npcDeedCount` median is 10 of an available 13 by day 120), so closing the
   die gap would move the *choice* of which verb pays rather than cast rank.

---

## Part 3 — still open, untouched by this run

### 3.1 `executeCombat` is still the pre-N3 abstraction — fighters take 0 deaths

- **What it is.** The PARITY LEDGER's Combat row (`:202`) records: *"**GAP FOUND AT N4:** that
  is the verb a captain is FORCED into; the one they CHOOSE (`executeCombat`) is still the
  pre-N3 abstract GUNS check + flat `150 × tier`, with no interceptor, no damage and no ship
  loss — so the six fighters take 6.4 interdictions each and **0 deaths**"*, and marks the row
  *"`executeCombat` still owed"*.
- **Where it is argued.** N3's Result, under *"THE PARITY GAP THIS STEP LEFT OPEN, and it is
  N3-shaped rather than N4-shaped"* (`:1387-1392`): N3 wired the shared rules into the two
  verbs that TRAVEL (`executeTravel`, `executeTrade`) and left the cast's own Combat verb an
  abstraction; *"the six fighters absorb 6.4 interdictions each and take **0 deaths** while
  five explorers take 0.2 each."*
- **Why it is still open.** It is a real parity gap that no step in this run's scope closed.
- **Who owns it.** `TASKS.md:703-704` (Deliberately deferred): *"A real parity gap (N3-shaped,
  not N4-shaped), but whether it lands as an N3 follow-up or at N13 is a sequencing decision
  for the owner."* The open question is **sequencing**.

*No decision is proposed here.*

### 3.2 Watch item OI-9 — the NPC refit spends no die

- **What it is.** N2's Result (`:1295-1306`): *"**WATCH ITEM OI-9 — the NPC refit pays no
  die.** `considerRefit` applies `applyShipyardMutation` directly; `resolveShipyard` is never
  called, and the `spendDie: 0` sitting beside it is a placeholder, not a cost. A player
  buying at the yard burns 1 of their 5 dice **even when the purchase is refused.**"*
  Everything else in that row is at parity — same prices, same gates, the engine's own
  functions on both sides.
- **Where it is argued.** The counter-argument lives at the definition site,
  `packages/engine/src/npc.ts:648-673`: *"one coarse action stands in for a whole NPC day, so
  charging a die would double-charge the abstraction."* The item's own **trigger**, verbatim:
  *"Trigger: if N3+ sweeps show the field out-fitting the player, the first knob is making the
  refit displace the day's verb some fraction of the time — not re-pricing the ladder."*
- **Why it is still open.** The PARITY LEDGER's Shipyard row carries **`OI-9 open`** (`:203`).
  N11's Result confirms it was not closed there: *"**OI-9 is untouched:** the equipment action
  carries `spendDie: 0` and the NPC refit still pays no die (N13's)"* (`:2032-2033`).
  `TASKS.md:705-706` records that its trigger — the field out-fitting the player — **has not
  fired**.
- **Who owns it.** Recorded as a watch item with *"a reasonable argument on both sides"*
  (`TASKS.md:705-706`); N11 assigns the die question to N13.

*No decision is proposed here.*

### 3.3 The N4 `loan-default` / `contraband-caught` re-siting question

- **What it is.** N4's ruling (`:1503-1511`): *"(2) **OPEN, and an owner design question:**
  `applyDisposition`'s `loan-default` (Penny Wise) and `contraband-caught` (a named patrol
  captain) reasons were written so T-1204's interception weighting could read them. With those
  captains out of the pool that reader is unreachable for them, so those grudges need a
  storylet-side expression or the writes need re-siting."*
- **Where it is argued.** `buildNamedCandidates` filters on `NPC_PROFILES`, so the eleven
  storyline captains stopped being drawable as random lane interdictions — correct under N4's
  ruling, but it removes the reader. The two write sites, verified present at `7d193c57`:
  `applyDisposition(nextState, LENDER_ID, LOAN_DEFAULT_DISPOSITION, 'loan-default', events)` at
  `packages/engine/src/day.ts:937` (`LOAN_DEFAULT_DISPOSITION = -5`,
  `packages/content/src/lending.ts:85`), and the `'contraband-caught'` write at
  `packages/engine/src/actions/patrol.ts:115`. The VisitHangout memo's own breakdown
  (`:681-692`) records that of the default's two consequences one survives (the collection
  flag, `travel.ts:495-503`) and one is unreachable (the interceptor identity,
  `buildNamedCandidates`, `travel.ts:275-301`).
- **Why it is still open — and two cross-links that change *when* it should be ruled.** The
  VisitHangout memo names it in its open-to-owner paragraph as *"the N4 `loan-default` /
  `contraband-caught` pairing, which should be ruled **with** this row rather than after it"*
  (`:786-787`). The Storylet memo records that *"express it storylet-side" would be a heavier
  answer in the hypothetical where this row is eventually ruled an exclusion* (`:1147-1151`).
- **Who owns it.** N4 records it explicitly as *"an owner design question"*.

*No decision is proposed here.*

### 3.4 N7-RIG's still-open new-hashed-ROOT hole

- **What it is.** N7-RIG's `Still binds` list (`:2604-2610`), verbatim: *"**ONE HOLE OF THE
  SAME CLASS IS STILL OPEN — recorded, not closed.** The guard catches a new *subdirectory*
  under a hashed root. A whole new hashed **root** — a new package, say `packages/economy/src`
  — is caught by nothing: it would never be walked, and every enumeration test would pass while
  describing a game that had grown a limb. Closing it needs a different mechanism (the
  workspace list is what would have to be totality-checked, not a directory listing). **It
  belongs to whichever step first adds a package** — that step must either declare the new root
  here or record why it holds no rule code."*
- **Where it is argued.** `packages/sim/src/balance/rules-fingerprint.ts`, alongside OI-6
  (every directory under a hashed root is a decision on record). Related sharp edge recorded in
  the same list (`:2578-2583`): an empty, `.d.ts`-only or asset-only directory **THROWS**, and
  it hard-fails `smoke-extract` at the CLI rather than only in a test — the remedy is one line
  in `HASHED_ROOT_IGNORED_DIRECTORIES` or in the declared set.
- **Why it is still open.** No step in this run added a package, so nothing exercised the
  hole: a whole new hashed ROOT would still be walked by nothing.
- **Who owns it.** Ownership is already assigned in the source: *"whichever step first adds a
  package."* Recorded here as a live hole, **not as an owner decision this checkpoint gates.**

*No decision is proposed here.*

### 3.5 R10 — the tier-1 hull cliff, R-owned, confounds this track's sweeps

- **What it is.** `R10 — The tier-1 hull is a 25-credit day-1 exploit (found by N2,
  2026-07-29)`, `docs/BALANCE-REDESIGN-WORKLIST.md:1166-1205`. Reproduced on a fresh
  `createInitialState(12345)` and verified independently from the constants:
  `maxCargoPodsForShip` computes `(cond + 1) × hullCapacity`, where `hullCapacity = strength`
  until strength exceeds 10. So:

  | hull | strength | cargo pods | fuel tank |
  | --- | --- | --- | --- |
  | junker (start) | 1 | **10** | **300** |
  | tier 1 | 10 | **100** | **3,000** |
  | tier 2 | 20 | 100 | 6,000 |

  *"**One rung multiplies cargo capacity by ten, and it costs 25 credits** —
  `YARD_COMPONENT_TIER_PRICES[0]` is 50, less a 25 junker trade-in. Ninety extra pods at 10cr
  each is another 900. **For 925 of a 1,000-credit starting purse**, the same seeded manifest
  board goes from payments `1,910 / 6,280 / 2,300 / 2,080 / 6,280` to `6,300 / 41,900 / 8,600 /
  5,300 / 41,900`. Note also that tier 1 and tier 2 both yield 100 pods — tier 1 is a cliff,
  not a step."*

  Two related player-facing defects recorded alongside it (`:1195-1205`): **`quoteShipyard`'s
  `after.maxFuel` is wrong for a hull purchase** — the pane previews the fuel ceiling as
  unchanged, 300 → 300 where the real purchase yields 3,000, *"a player-visible preview lie on
  the single most valuable purchase in the game"*; and **`tradeInValue`'s junker band
  out-prices the tier-1 list price** — indexed by raw strength it reaches 3,000 at strength 9
  against a 50cr tier-1 sticker, unreachable for the player but live for NPCs, *"one rung,
  once, per component."*
- **Where it is argued.** `docs/BALANCE-REDESIGN-WORKLIST.md:1166-1205`, with the R-ownership
  statement at `:1154` (*"R10 is R-owned but confounds N-series sweeps — the tier-1 hull cliff
  is the root cause of the top-of-field convergence in N2's Result and shapes every NPC refit
  outcome until fixed"*) and the sequencing line at `:1321` (*"R10 (tier-1 hull cliff) —
  IMPORTANT; also confounds N-series sweeps until fixed"*). Restated on the N-side at
  `docs/NPC_REDESIGN.md:2933-2935`. The VisitHangout memo names its practical consequence for
  this track: *"R10 (the tier-1 hull cliff) is R-owned and confounds any 'buy a hull' arm of
  this question outright, so that arm should not be run under this track"* (`:762-763`).
- **Why it is still open.** It is filed under the R-series' `IMPORTANT` section and no R step
  ran during this track.
- **Who owns it.** **R-owned.** Listed here because it confounds N-series measurement, **not
  for a ruling at this checkpoint.**

*No decision is proposed here.*

---

## Part 4 — the four decisions owed

Each line names the allowed answers exactly as the source document phrases them, and nothing
more.

- [ ] **Explore** — **option 1** implement at full parity / **option 2** algorithmic
      fast-forward recorded as a partial / **option 3** exclude with the stated reason (zero
      code, and N8 counts it as a ruled **exclusion**).
- [ ] **VisitHangout** — **option 1** implement at full parity / **option 2** the loan ledger
      fast-forwarded and recorded as a partial / **option 3** exclude lending with the stated
      reason (zero code, and N8 counts the row as a ruled **partial**, not a ruled absence,
      because the cast already plays the verb).
- [ ] **Storylet** — **option 1** implement at full parity / **option 2** a fast-forward
      recorded as a partial / **option 3** exclude with the stated reason (zero code, and N8
      counts the row as a ruled **absence**, the same class as Explore, not a ruled partial).
- [ ] **N11's verdict** — **accept** / **reject**.

The Part 3 items are **not** on this checklist. Three of them are named in their own sources
as owner calls but do not gate this checkpoint (`executeCombat`'s sequencing, OI-9, and the N4
`loan-default` / `contraband-caught` re-siting); one (N7-RIG's new-hashed-ROOT hole) is
pre-assigned to whichever step first adds a package; and one (R10) is R-owned.

**The runner has made no decision and will not make one; the run halts here.**
