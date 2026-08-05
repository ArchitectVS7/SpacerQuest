# NPC Redesign — the 30 NPCs play the full player loop

**Status:** active work list. The NPC parity track (N-series), extracted whole from
`BALANCE-REDESIGN-WORKLIST.md` on 2026-07-29 by owner decision, so the track has one
document and one target. Every step entry below was moved verbatim in that extraction;
nothing was re-graded or re-measured in the move. The R-series (the balance redesign
proper) stays in `BALANCE-REDESIGN-WORKLIST.md`, PAUSED behind this track's N8 — see
"After N8" at the end of this document.
**Companions:** `BALANCE-REDESIGN-WORKLIST.md` (the R-series record, and the two
known-red `it.fails` tripwires the battery carries — both R-owned; the N-series runs
against a green gate and any third failure is unambiguously the N-task's),
`BALANCE-POLICY.md` (governance, plus the archetype vocabulary and measured baseline in
its Part D), `PRD-REIMAGINED.md` (design intent), `docs/VERSIONING.md` (the N-series is
the named gate for 0.5.0).
**Cross-references:** `R#` step references resolve to `BALANCE-REDESIGN-WORKLIST.md`.
`OI-#` items are the 2026-07-29 doc-vs-code audit; these entries are its whole record
(grep the OI number, here and in the worklist). Fuller per-step records than the pruned
"Still binds" blocks: `git show 433ffce3 -- docs/BALANCE-REDESIGN-WORKLIST.md` for
N0–N2/N6/N7/N9, and `git show a9cffd85 -- docs/NPC_REDESIGN.md` for N3/N4/N7-RIG/N10.

**THE PRUNE RULE, since this document is the record and records grow.** A SHIPPED step
keeps its verdict, its "Still binds" bullets and a `git show` pointer — nothing else. The
test is PROSPECTIVE vs RETROSPECTIVE: *does this text change what the next step does?* If
yes it stays; if it only says what happened, git has it losslessly at a hash. Three things
are explicitly NOT prunable, because they are the reason the record exists: **lessons that
changed method** (e.g. "a status board is not evidence"), **superseded-formula landmines**
(e.g. "do not re-derive `2 + 2·tier`", "31 is the BOARD size and is not to be 'fixed'"),
and **owner rulings**. Full measurement tables, red-test enumerations and hash-by-hash
re-pin logs go to git — most are already duplicated at their definition site in code,
which is the copy that cannot go stale. Both `#### The audit that reopened this step`
blocks are kept in full by owner decision (2026-07-29).

---

## THE SINGLE TARGET, and what "done" means

The 30 NPCs operate with the full player loop — same rules, same prices, same
functions, to simulate a multiplayer field. THE PARITY LEDGER below is the completion
criterion: **this track is DONE when every ledger row is SHIPPED, fast-forwarded under
the standing constraint, or EXCLUDED by a recorded owner ruling — and N8 has re-pinned
the baseline of record against that field.** **Every ledger row is now ruled (owner,
2026-07-30): Explore and Storylet are recorded EXCLUSIONS, VisitHangout a recorded PARTIAL.
So the only rows still owing WORK are Port (N12) and the two that wait on N13's hand (Crew,
Reroll) — and N8's ruling precondition is discharged.**


## THE NPC PARITY TRACK (N-series)

**Why this track exists, and why it interrupted the R-series.** The balance work kept
producing findings that were really one finding: the 30 NPCs are not playing the game.
They are an economic texture generator wearing a captain's name. Owner's framing, and
it is the right one — *"an NPC needs to trade, so they need to upgrade their ship. They
need to fly, so they need to interact with pirates. That means they pay bribes, with
either credits or cargo, or fight, or flee. They literally MUST act like a player."*

**STATUS BOARD** — updated as each step lands; the per-step `**Result:**` blocks below are
the detail. Run order is N0 → N1 → **N7** → N2 → N6 → N3 → **N4** → **N10** → **N11** → **N12 → N13** →
N5 → N8 (see "Sequencing at a glance" for why N7 moved and why N4 kept its early slot;
N10–N13 added by owner ruling 2026-07-29 — see THE PARITY LEDGER below). **Next unblocked
step: N12 — and its FIRST TASK is already discharged** (the instrument learned to see ports
ahead of the step, so N12 can measure its own effect from day one). **The parity ledger is
fully ruled as of 2026-07-30**, so N8 now waits on N12 alone.

| step | status | outcome |
| --- | --- | --- |
| N0 — copy-on-write discipline | **SHIPPED** | clone flat in NPC richness, not linear; killed the quadratic |
| N1 — NPCs own a real ship | **SHIPPED** `b438096b` | change accepted, **hypothesis disproved** — capstone byte-identical; found the N2 blocker + the fuel exemption |
| N7 — capstone diff + smoke rig | **SHIPPED** | **accepted** — 1.5 s smoke vs 2 min capstone; staleness fails loudly; found N9 |
| N2 — NPCs upgrade their ships | **SHIPPED** | **ACCEPTED** — spread max/median 13.4→155, fits 5→144, Honor List 2/8→8/8 contested; found R10 |
| N6 — Honor List, 31-way board | **SHIPPED** | **accepted** — actor-shaped board; found 6 of 8 titles uncontestable by construction |
| N3 — NPCs meet pirates | **SHIPPED 2026-07-29 (rebuilt)** | encounters on every NPC jump, stance triangle on the shared rules, permanent death, four dead-field skips; **capstone discharged at N4** (the two steps share one capstone, and the cost of that is under N3's own Result) |
| N4 — NPC archetypes | **SHIPPED 2026-07-29 (rebuilt)** | **ACCEPTED** — the Ideal×archetype blend, a hand-curated 6/6/5/5/4/4 roster, and a control arm that makes the effect attributable: median wealth trader +43% / veteran +31% / gambler −38% / explorer −99% / fighter −71% against the neutral arm. Found the **verb payout asymmetry** (only Trade pays) and two live instrument bugs |
| N5 — NPC proficiency spread | TODO · **UN-GATED 2026-08-02** | reuses R1's `PilotDegradationProfile`. N13 shipped the decision surface its die-allocation lever needed, and the seam is already wired and inert: `npcVirtualHand(rng, dullDieChance?)` takes the profile's `dullDieChance` directly. **Grade WITHIN archetype and reuse N13's control arm** — see the rewritten lever list in N5's own section |
| **N10 — NPCs work the contract board** | **SHIPPED 2026-07-29** | **CHANGE ACCEPTED · HYPOTHESIS DISPROVED** — the shared per-system pool is built and the cast works it galaxy-wide, but competition is not a force: cast demand is ~6% of the galaxy's job supply, and neither throttle was ever the binding constraint. The step's real effect was the parity gap it was not looking for — the cast now CHOOSES its contract (`pickContract`), worth +247% on cast median wealth. **The non-trader floor did not move (p10 126 → 126)** |
| **N11 — NPCs earn deeds and Renown** | **SHIPPED 2026-07-30** | **CHANGE ACCEPTED · HYPOTHESIS HELD, BOTH DISPROVES LIMBS SURVIVED** — the −1 dead end is gone (98.7% of cast slots hold an earned rank at day 120, 42.8 gated purchases per run), the median captain sits **two rungs BELOW** a competent player (COMMODORE vs TOP_DOG), and nobody accrues zero. **The floor did not move for the THIRD time (p10 126 → 126) and the structural reason is now known: a deed pays no credits — rank is a spending unlock, not income**, so cast median wealth FELL 76,049 → 55,437 |
| **N12 — NPCs buy ports** | **TODO · MUST-HAVE** · FIRST TASK DONE | lands BEFORE N8. Its FIRST TASK — the aggregate learning to see ports, player AND per-NPC — **landed ahead of the step (2026-07-30)**, so the step can measure its own effect. **N11 hands it the sharpened question:** the floor has now failed to move three times, and a port must be BOUGHT, so measure port ownership PER ARCHETYPE from the first sweep — fleet-wide would hide a two-archetype economy |
| **N13 — NPC decision surface (dawn-hand parity)** | **SHIPPED 2026-08-02** (`TASKS.md` T-156) | **CHANGE ACCEPTED · HYPOTHESIS — see N13's Result for the verdict word and the three-arm decomposition.** The cast holds a five-die virtual hand dealt through the player's own `rollDawnHand` and spent through `spendDie` at both of `npc.ts`'s check sites; the PICK is the one sanctioned abstraction, flagged at `npcHand.ts`'s definition site. `Crew`/`Reroll` are now recorded EXCLUSIONS in THE PARITY LEDGER, the Combat row's die gap is closed, and N5 is un-gated with its lever seam already wired and inert |
| **N14 — captain voice: the daily wire boast** | **TODO · EXPERIMENT** | owner spec 2026-07-29 — 3 boasts × 30 captains, top-3 candidates, one per day, 2-day cooldown + line rotation; **not** PvP messaging (PRD non-goal) |
| **N9 — the instrument's three unplayed actions** | **SHIPPED** | **hypothesis REJECTED** — verbs cost 38% of fleet cash, not gain; found the aggregate cannot see an asset |
| N8 — re-pin against a living field | TODO | **ledger rulings discharged 2026-07-30; the aggregate now sees ports**; re-pin against the post-N9 instrument; **follows N10–N12** (owner ruling 2026-07-29) |

> [!NOTE]
> **MEASUREMENT DEBT DISCHARGED (2026-07-29).** The caution that stood here recorded
> `balance:smoke` RED on the N7 staleness gate, because N3's roster split and N4's
> archetype field moved hashed rule sources and **neither step ran its capstone**. It
> was resolved the way the gate demands — **a new capstone, never a refreshed
> number**: `docs/balance/baseline-n4-shipped.json` (1,000 seeds × 120 days × 8
> policies = 8,000 runs, both `--milestone-days` and `--aggregate` honoured, fixture
> re-extracted FROM it with `spreads harvested`). Fingerprints moved to rules
> `c9530236d51b237e` / instrument `75e73b1e7d32168c` / docs `774c91af0fbdecc0`.
>
> **The battery stands at 1,485 passing / 0 failing** (engine 906 · sim 323 · ui 154
> · desktop 102) with `balance:smoke` green (123) — **updated at T-116's closeout**, which
> entered green and left green, with no threshold, band, golden or fingerprint edited and
> no sample widened. N11 closed at 1,347/0 (engine 795 · sim 315 · ui 135 · desktop 102);
> N10 entered at 1,287/0 and left at 1,312/0; the M2 Explore rebuild (T-110…T-117) added
> the difference. Three `it.fails` tripwires are still correctly red and all three are
> R-owned: `balance-targets`' clear-day band (trader median **21** against `[22, 30]`,
> n = 987, **unmoved by the T-116 capstone**) and `balance-combat-survival`'s death-rate
> floor and Auto-Repair assertions. There is no fourth. N4 entered at
> **1,184 / 23 failing**; both steps
> summarise their inherited reds under their own Result and the red-by-red account is
> in git at the pointer each carries. One `it.fails` tripwire was filed at N4 — see
> that Result; it is still correctly red at N10's widened sample.
>
> **INSTRUMENT WIDENED AND FIXTURE RE-EXTRACTED AT T-173 (2026-08-04) — no capstone, and the
> baseline of record does NOT move.** Under BR-10 (an instrument-only fingerprint move does not
> earn a capstone) and BR-9 (the remedy is a re-extract from the same aggregate), T-173 closed
> the blind spot BR-13 recorded: three measurement shapes now carry the Hangout/disposition
> fields that four separate probes (T-125, T-137, T-148, T-150) had to descend from a gitignored
> `.scratch/` script to obtain. **`SeedRow`** gains `hangout` and `disposition` (both carried
> whole off the report); **`MilestoneSample`** gains `npcDisposition` (through `sampleField`, so
> it is index-aligned with the seven per-captain arrays beside it); **`CombatEncounterRecord`**
> gains `interceptorId`, `interceptorSource`, `interceptorDisposition`, `namedPoolDispositions`
> and `namedPoolReconstructed`; and `PolicyAggregate` / `MilestoneAggregate` gain the
> `interceptor` block and `npcDisposition` / `npcNonzeroDispositionShare`. **ADDITIVE ONLY** —
> no existing key on any shape was renamed, retyped or removed. Fingerprints, transcribed from
> the re-extracted `docs/balance/smoke/tiers.json`: `rulesFingerprint` **UNMOVED** at
> `febc55edd3a94b3f` (T-173 changed zero lines under `packages/engine/src` and
> `packages/content/src` — putting the pool or the standing on `EncounterStarted` would have
> moved it, which is why the measurement stays in `packages/sim`), while
> `instrumentFingerprint` `836f9e8804ea2637` -> `b28fad2af6107f8a` and `docsFingerprint`
> `f827fddcbb3fa446` -> `e7b35fa4850f418d`. `CURRENT_SAVE_VERSION` does NOT move (15): no
> persisted shape changed, so no migration and no round-trip test is owed. **INERTNESS, proven
> twice.** (1) The re-extract moved `productVersion`-class provenance and the two fingerprints
> only — every recorded checkpoint number is byte-identical, which is BR-9's own test and is
> machine-enforced by `smoke-reextraction.test.ts`. (2) A two-arm 40-seed × 120-day × 8-policy
> sweep (320 runs per arm, BEFORE built in a `git worktree` at the parent commit) diffed at the
> aggregate level: *"NO MEASURED VALUE MOVED. Every difference below is a SHAPE difference:
> fields present on one side only."* — 528 one-sided paths, all of them the new fields, and not
> one shared path moved. The `.scratch/t125-hangout.ts` lineage is retired
> (`docs/HANGOUT_REDESIGN.md` §10.7 carries the counter → field map).
>
> **BASELINE OF RECORD RE-PINNED AT T-208 (2026-08-05)** to
> `docs/balance/baseline-t208-quest-captain-ports.json` — the **M19 MILESTONE CLOSER**, and a
> **CONTENT-AND-ENGINE** capstone: the 11 `QUEST_PROFILES` captains now sit at a **DECLARED
> HOME PORT** (`NpcProfile.homePortSystemId`, content) read once at birth by
> `createInitialState` (engine), replacing the arbitrary `(index % 20) + 1` seed that had
> parked **six of the eleven at rim systems with no Cantina** — permanently, because a quest
> captain never moves. Same shape as the outgoing capstone: 1,000 seeds × 120 days ×
> 8 policies = 8,000 rows, eight one-indexed shards then `--merge`,
> `--milestone-days 21,29,30,41,60,120`, spreads harvested. Gate PASS, **0 invariant
> violations**. One fingerprint moves and one does not, by construction: `rulesFingerprint`
> `cbb087860825aa35` → `2f93098dc9ab15f0` (content is hashed WHOLESALE and `state.ts` /
> `save.ts` are hashed engine rule modules), while `instrumentFingerprint` is **UNMOVED** at
> `5c230e99648cddee` (nothing under `packages/sim/src` outside `__tests__` was touched) and
> `docsFingerprint` moves `5ca4979722c55ee1` → `a88b9aa992f78ec6`. `CURRENT_SAVE_VERSION`
> **DOES** move, 16 → **17** (re-read live at `packages/engine/src/save.ts`): `MIGRATIONS[16]`
> re-seeds a carried save's quest captains through the same `questHomePortForProfile` rule the
> two loader paths read, and `save.test.ts` carries the round-trip and the idempotence proof.
> **`balance:diff` = SIX OF TEN ROWS MOVED** — fleet, explorer, gambler, greedy, smuggler and
> veteran, with fighter, trader and trader-degraded byte-identical. **THE MOVE WAS PREDICTED
> IN WRITING BEFORE THE RUN** (`TASKS.md` T-208) together with its channel:
> `resolveVisitHangout` resolves a Dare dealer and a social target from co-located NPCs
> **without an `isSimulatedCaptain` filter**, and the bond hook requires co-location too, so
> relocating eleven records changes which captain is in which room. Headline movement is small
> in every direction — fleet `tourOneClearRate` 0.6329 → 0.6348, fleet `finalCredits.median`
> 49,839 → 49,687, fleet `survival.deathsPer1000Days` 0.5125 → 0.5146. **NOTHING WAS TUNED IN
> RESPONSE**, no band was widened and no threshold moved.
>
> **BASELINE OF RECORD RE-PINNED AT T-206 (2026-08-05)** to
> `docs/balance/baseline-t206-captain-voice.json` — a **CONTENT-ONLY** capstone shipping the
> authored VOICE of the cast: `tableTalk` (2-4 Liar's Dice lines) and `catchphrases`
> (enter / duringBattle / win / loss) for the 27 captains T-205 carried on its
> `VOICE_AUTHORING_PENDING` worklist, which is deleted here along with the `waived` branch
> and the three hygiene rules that policed it. **Presence is now REQUIRED of all 30
> `NPC_PROFILES` unconditionally**, and still never required of the 11 `QUEST_PROFILES`.
> 245 authored lines, every one of them distinct across the roster, longest 72 chars against
> the 120 cap. Same shape as the outgoing capstone: 1,000 seeds × 120 days × 8 policies =
> 8,000 rows, eight one-indexed shards then `--merge`, `--milestone-days 21,29,30,41,60,120`,
> spreads harvested. Gate PASS, **0 invariant violations**. One fingerprint moves and one
> does not, by construction: `rulesFingerprint` `5ae9a5d473827024` → `cbb087860825aa35`
> (content is hashed WHOLESALE, so prose with no reader still moves it — that is what this
> capstone pays for, rather than editing a fingerprint or a golden), while
> `instrumentFingerprint` is **UNMOVED** at `5c230e99648cddee` (nothing under
> `packages/sim/src` outside `__tests__` was touched) and `docsFingerprint` moves
> `22c4de362494c36a` → `5ca4979722c55ee1`. `CURRENT_SAVE_VERSION` does NOT move (**16**,
> re-read live at `packages/engine/src/save.ts:562`): `createInitialState` maps `NpcProfile`
> into `NpcState` field by field with no spread, so nothing new reaches a persisted record
> and no migration or round-trip test is owed. **`balance:diff` = "NOTHING MOVED. Every
> compared field is equal on both sides"** — PREDICTED IN WRITING BEFORE THE RUN (`TASKS.md`
> T-206), and the only correct result for data nothing reads until T-207: a moved
> `outcomeHash` or a moved policy row would have meant something consumes the profile object
> wholesale, and was pre-committed as a FINDING to escalate rather than a thing to
> re-baseline around. The re-extracted fixture moves exactly four lines — the two
> fingerprints, `sweepLabel` and `gitCommit` — with every tier number byte-identical.
>
> **BASELINE OF RECORD RE-PINNED AT T-204 (2026-08-05)** to
> `docs/balance/baseline-t204-cantina-rename.json` — a **TEXT-ONLY** capstone shipping the
> player-facing rename of "Hangout" to "Cantina". Scoped deliberately narrow: authored PROSE
> STRING VALUES only (UI copy, onboarding and walkthrough text, per-port house name, deed
> citation, flaw detail, the gamble wire templates, and the NPC Socialize clauses those
> templates interpolate). NOTHING internal moved — not a file name, not an exported symbol,
> not the `hasHangout`/`PORT_HANGOUTS` identifiers, and **not** the save schema's
> `z.literal('VisitHangout')`, which is stored verbatim in every existing save and whose
> rename would owe its own migration (explicitly deferred, not forgotten).
> One fingerprint moves and one does not, by construction: `rulesFingerprint`
> `f33b6af1ee21dffa` → `5ae9a5d473827024` — **content is hashed WHOLESALE, so even a pure-text
> edit moves it, and that is paid for with this capstone rather than by editing a fingerprint
> or a golden** — while `instrumentFingerprint` is **UNMOVED** at `5c230e99648cddee` (nothing
> under `packages/sim/src` outside `__tests__` was touched). `CURRENT_SAVE_VERSION` does NOT
> move (16, re-read live at `packages/engine/src/save.ts:562`): no `GameState` field was
> added, removed or retyped, so no migration and no round-trip test is owed. Persisted
> `lastAction.details` and `wire[].message` *values* differ for newly generated states, but
> old saves keep their old prose and stay valid — **a value change is not a shape change.**
> **EVERY ONE OF THE EIGHT POLICY ROWS CAME BACK BYTE-IDENTICAL** — `balance:diff` reported
> *"NOTHING MOVED. Every compared field is equal on both sides."* That was PREDICTED IN
> WRITING BEFORE THE RUN (a text-only change has no mechanical effect, and `lastAction.details`
> has zero computational readers — every consumer is a display path), so the run confirms a
> prediction rather than discovering a result; a moved row would have been a finding to file,
> not a rename gone right. Two goldens were RE-DERIVED, not hand-patched to pass: the sim
> replay golden (all six constants) and the engine day-loop golden (all four hashes). Both
> re-derivations are justified in-file by the same mechanical proof — reverse-substituting
> "Cantina" → "Hangout" in each new pre-image reproduces the committed predecessor constants
> EXACTLY, and all three replay `rngState`s held at `364866002 / 268015010 / -1231248819`, so
> no dice draw moved.
>
> **BASELINE OF RECORD RE-PINNED AT T-202 (2026-08-05)** to
> `docs/balance/baseline-t202-liars-dice-ceiling.json` — a **CONTENT-ONLY** capstone shipping
> the owner's R3 ruling from the T-198 pacing checkpoint:
> `LIARS_DICE_ROUNDS_PER_DAY = [1, 2, 3, 4, 5, 6]` (tiers 0-5, a strict +1/tier climb, revised
> up from the `[1, 2, 2, 3, 3, 4]` suggestion T-197 shipped marked `PROPOSED`). One fingerprint
> moves and one does not, by construction: `rulesFingerprint` `10e19c88e9a07856` →
> `f33b6af1ee21dffa` (a content constant changed), `instrumentFingerprint` **UNMOVED** at
> `5c230e99648cddee` (nothing under `packages/sim/src` outside `__tests__` was touched).
> `CURRENT_SAVE_VERSION` does NOT move (16, re-read at `packages/engine/src/save.ts:562`): no
> persisted shape changed, so no migration and no round-trip test is owed.
> **EVERY ONE OF THE EIGHT POLICY ROWS CAME BACK BYTE-IDENTICAL** — `balance:diff` reported
> *"NOTHING MOVED. Every compared field is equal on both sides."* Fleet `tourOneClearRate`
> 0.6329, median final credits 49,839, ships lost 492, encounters/run 22.2482, all unmoved.
> Gate PASS, 0 invariant violations, 8,000 rows over 8 one-indexed shards, spreads harvested.
> **THAT NULL RESULT WAS PREDICTED IN WRITING BEFORE THE RUN, AND IT IS AN INSTRUMENT GAP
> RATHER THAN A VERDICT (F-202-1)** — this block's own task predicted "only the `gambler` row
> moves, and it moves UP", and that prediction was corrected before the sweep rather than
> after: the sim's gambler is the only policy that plans a Dare at all
> (`packages/sim/src/index.ts:4225`) and its loop is bounded by
> `Math.min(GAMBLER_MAX_DARES_PER_DAY = 2, liarsDiceRoundsRemaining(state))` (`:4058,:4584`),
> so it plays `1,2,2,2,2,2` hands by tier under BOTH the old and the new table. The instrument
> cannot exhibit tiers ≥ 2 of the ruled ceiling — structurally the same shape as T-197's Insult
> null result below. Measuring the ceiling needs a gambler arm bounded by the engine's own
> accessor, which is a new instrument BEHAVIOUR and its own task, filed as F-202-1 in
> `TASKS.md`'s T-202 block rather than smuggled into this content capstone.
>
> **BASELINE OF RECORD RE-PINNED AT T-197 (2026-08-05)** to
> `docs/balance/baseline-t197-hangout-caps.json` — the **M17 MILESTONE CLOSER**
> (`docs/DAWN-HAND-REDESIGN.md` §3/§4a/§4b). All seven Hangout venues became Free Actions
> and two DAILY CAPS replaced the die: the social pool (`SOCIAL_PLAYS_PER_DAY = 3`, shared
> by meet/befriend/insult) and the Liar's Dice rounds cap (scaling with `liarsDiceTier`).
> **THIS IS THE FIRST CAPSTONE OF THE ARC THAT IS NOT A SINGLE-ARM ATTRIBUTION**, and that
> is said before the numbers rather than after: T-196a moved only `rulesFingerprint` and
> T-196b moved only `instrumentFingerprint` by design, whereas T-197 moves BOTH (rules
> `55414694d7187afc` → `10e19c88e9a07856`, instrument `812d9e87d7307f3c` →
> `5c230e99648cddee`, save schema 15 → 16), so no arithmetic in its diff can separate the
> rule effect from the exploitation effect.
> THREE of the eight policy rows moved — `gambler`, `smuggler`, `trader-degraded` — against
> arm 2's seven, and the narrowness is the result: this task changes only the three planners
> that touch a Hangout, so only the policies that call them can feel it. Fleet
> `tourOneClearRate` 0.6342 → 0.6329, median final credits 49,839 → 49,839 (UNMOVED),
> ships lost 487 → 492, encounters/run 22.2404 → 22.2482. Gate PASS, 0 invariant violations.
>
> **THE INSULT MEASUREMENT, REPORTED HONESTLY AS A NULL RESULT.** The task asked whether
> `SOCIAL_PLAYS_PER_DAY = 3` holds the free-insult × 2.358× wronged-interceptor farming
> loop. **The `fighter` row came back BYTE-IDENTICAL** — encounters/run 19.6460, ships lost
> 11, median credits 82,671, clear rate 0.6030, all unchanged from T-196b. That is NOT
> evidence the pool works, because **no sim policy has ever emitted `meet`, `befriend` or
> `insult`** (only `protocol.ts`'s enumerator names them). The loop cannot be EXHIBITED by
> this instrument, so the pool cannot be measured against it here, and the honest reading is
> that the fighter's stillness confirms only that the freed dice and the rounds cap do not
> reach it. What CAN be said is the analytic bound: 3 plays/day × −4 disposition ⇒ at most
> ONE manufactured grudge per day, from a −10 floor, where before the cap it was three
> clicks. **The instrument gap is T-198's brief**; an insult-playing policy is a new
> instrument behaviour and its own arm, and was deliberately not added here.
>
> **BASELINE OF RECORD RE-PINNED AT T-196b (2026-08-05)** to
> `docs/balance/baseline-t196b-instruments.json` — the **M17 arm-2** capstone
> (`docs/DAWN-HAND-REDESIGN.md` §3). The eight sim policies stopped budgeting a dawn die
> for the nine freed action types and the protocol enumerator stopped advertising one, so
> the RULES are unmoved (`rulesFingerprint` still `55414694d7187afc`) and only the
> INSTRUMENT hash changes. Its diff against the T-196a arm is therefore the measured value
> of EXPLOITATION alone, cleanly attributed. SEVEN of the eight policy rows moved — all but
> `greedy`, whose day plan did not change — against arm 1's two. Fleet `tourOneClearRate`
> 0.6305 → 0.6342, median final credits 49,517 → 49,839 (+0.7%), ships lost 465 → 487.
> The arm is carried by the fighter (clear rate 0.499 → 0.603, median credits 45,551 →
> 82,671); the smuggler and explorer give a little back (−5.9% and −4.2% clear rate) and
> both also carry F-196b-1's per-sweep credit charge on their Explore loops, the finding
> this capstone's own gate caught and closed. Gate PASS, 0 invariant violations.
>
> **BASELINE OF RECORD RE-PINNED AT T-196a (2026-08-04)** to
> `docs/balance/baseline-t196a-free-actions.json` — the **M17 arm-1** capstone
> (`docs/DAWN-HAND-REDESIGN.md` §3). Nine administrative action types stopped costing a
> dawn die — `sign-contract`, `buy-fuel`, `abandon-contract`, all four `Shipyard` kinds,
> `Crew` hire/dismiss and the `Port` buy — with the `spendDie` field deleted from their
> action shapes and from the zod schema. This is the CONTROL arm of a control-arm pair:
> the rules are eased and the INSTRUMENTS ARE DELIBERATELY UNCHANGED (the sim policies
> still budget a die for these verbs; the protocol enumerator still advertises one), so
> T-196b's arm measures the exploitation separately.
> **PREDICTED BEFORE THE RUN and held.** NPC-side rows near-still: `npc.ts` imports only
> `applyShipyardMutation`/`quoteShipyard`/travel helpers and never these four resolvers,
> and `fleet.npcSpecialEquipmentPurchasesPerRun` moved 44.1695 -> 44.2002 (+0.1%),
> inside shard noise. Player-policy rows move — but MUCH more narrowly than predicted,
> and the shape of that narrowness is the finding: **exactly two of the eight policy rows
> moved, `explorer` and `smuggler`, and they are exactly the two that queue `Explore`.**
> `trader`, `trader-degraded`, `fighter`, `veteran`, `gambler` and `greedy` came back
> byte-identical on every headline metric — clear rate, credits, encounters, contracts,
> ports, ships lost. Fleet deltas are small: `tourOneClearRate` 0.6320 -> 0.6305,
> median final credits 49,729 -> 49,517 (−0.4%), ships lost 436 -> 465 (+6.7%), with
> `explorer` 49 -> 66 and `smuggler` 46 -> 58 carrying all of it. `explorer`'s clear rate
> 0.8710 -> 0.8660 and median credits 70,310 -> 68,333 (−2.8%); `smuggler`'s 0.8190 ->
> 0.8120 and 45,601 -> 45,216 (−0.8%). CROSS-CHECKED against a second, independent
> instrument: `campaign-degraded.test.ts`'s `PINNED_FINGERPRINTS` (5 seeds × 40 days,
> a different sample entirely) moved the SAME two policies and held the same five.
> `rulesFingerprint` `febc55edd3a94b3f` -> `55414694d7187afc`; `instrumentFingerprint`
> `836f9e8804ea2637` -> `6106da3575355153` (the sim's policy builders lost their
> `spendDie` arguments — a shape edit, not a budget change); `docsFingerprint` moved too,
> because it hashes RAW bytes of the same sources and this task rewrote a great many
> now-false comments (it is informational only and fails nothing).
> `CURRENT_SAVE_VERSION` does NOT move (15): no persisted shape changed, and
> the three now-unreachable `no-die`/`invalid-die-index`/`die-already-spent` members of
> `CrewEventFailReason`/`PortEventFailReason` were deliberately KEPT so pre-M17 saves
> still load under the `.strict()` event-log schema.
>
> > **BASELINE OF RECORD RE-PINNED AT T-199 (2026-08-04)** to
> `docs/balance/baseline-t199-pacifist.json` — the **F-150-2** capstone. The shared
> `planPacifistCombat` no longer plays one stance against an unaffordable tribute, `smugglerPolicy`
> gains the Explore recovery guard T-150 had to back out, and the rim-strand class (`trader`,
> `fighter`) is closed structurally by a shared `planHomewardBurn` / `planStrandedExplore`.
> **PREDICTED BEFORE THE RUN and held:** all eight rows move except `greedy`, which never reaches
> the changed planner. **The change it exists for is `assertNoIncomeStall`: 7 violations → 0** at
> 1,000 seeds × 35 days. Fleet deltas are deliberately small — `fleet.tourOneClearRate` 0.6310 ->
> 0.6320, median final credits 50,813 -> 49,729 (-2.1%), ships lost 411 -> 436 (+6.1%), with the
> `fighter` row alone falling 14 -> 8 (-42.9%) on its new crippled repair. `rulesFingerprint`
> **unmoved** at `febc55edd3a94b3f` — T-199 changed `packages/sim/src/index.ts`, the INSTRUMENT,
> and zero lines under `packages/engine/src`, `packages/content/src` or `packages/ui/src` — while
> `instrumentFingerprint` `f8a237612f4c38d5` -> `836f9e8804ea2637` and `docsFingerprint`
> `26e3998c51814e72` -> `f827fddcbb3fa446` (all three transcribed from the T-199-re-extracted
> `docs/balance/smoke/tiers.json`, `spreads harvested`). `CURRENT_SAVE_VERSION` does NOT move (15):
> no persisted shape changed. **This block was written at T-165, not at T-199** — T-199 re-pinned
> only two of the five pointer sites, and this banner was one of the three left stale (see the
> T-165 note under BR-14 in `docs/BALANCE-RIG-DECISIONS.md`; agreement is now machine-checked by
> `packages/sim/src/__tests__/baseline-pointers.test.ts`).
>
> **BASELINE OF RECORD RE-PINNED AT T-195 (2026-08-04)** to
> `docs/balance/baseline-t195-dawn-dice.json` — a `/bakeoff` result: the travel die now sets a
> 0-15% fuel discount (`navDieFuelDiscount`) and a 0-20% encounter-evasion bonus
> (`navDieEvasionFactor`), both monotonic benefits with no fail state (see `travel.ts`'s
> `T-1605b` comment for why a real check-and-penalty shape was tested and rejected — it measured
> safe per-jump but raised fleet-wide fuel-starvation days 278% in the bake-off rig). The Nemesis
> crossing is excluded — it keeps its own quoted burn and its own real check. **Real, broad
> movement, not a re-pin formality:** ALL EIGHT policies moved. `fleet.tourOneClearRate` 0.5605 ->
> 0.6310 (+12.6%), `finalCredits.median` +40.5%, `survival.shipsLost` -27.1%,
> `encountersPerRun` -10.3% — the game is measurably, broadly easier, which is the expected and
> intended shape of a monotonic-benefit die (see the M16 task block for the owner's own read on
> this: two seeded regression tests, `campaign-reach.test.ts` and `campaign-policies.test.ts`,
> flagged specific instances of this same easing and were left UNCHANGED rather than patched to
> match — worth the owner's attention if the 15%/20% magnitudes want tuning down later).
> `rulesFingerprint` `5d4ddb2593cca4f6` -> `febc55edd3a94b3f`, `instrumentFingerprint` unmoved at
> `f8a237612f4c38d5` (no instrument source touched), `docsFingerprint` -> `26e3998c51814e72`.
> `CURRENT_SAVE_VERSION` does NOT move (15): no persisted shape changed.
>
> **BASELINE OF RECORD RE-PINNED AT T-188 (2026-08-04)** to
> `docs/balance/baseline-t188-orbital-3d.json`. **T-188's own changes are PROVEN INERT, not
> assumed:** two isolated 30-seed bisects (gambler, veteran — the two archetypes any Hangout/
> route-geometry change would most plausibly touch) diffed a pre-change and post-change tree
> against each other and both report "NOTHING MOVED. Every compared field is equal on both
> sides." T-188 adds `coordinates3D`/`distance3D`/`orbitalLayout2D` to `systems.ts` (additive,
> not wired into `travel.ts`'s live formula — see the T-188 task block) and renames the display
> name `Sun-3` -> `Sol-3` throughout; neither touches a value any sim policy reads. **What
> DID move — `fleet` (397 fields) and `veteran` (601 fields), diffed against the outgoing
> `baseline-t160-dealer-fix.json` — is entirely T-161's `veteranPolicy` contract-filter fix**
> (already reviewed, gated and committed; see its own TASKS.md block), which changed real
> `veteranPolicy` behaviour but had not yet had its own full 8,000-row capstone taken — T-188's
> capstone is simply the first one run since, so it correctly absorbs T-161's already-accepted
> drift rather than introducing new drift of its own. `explorer`, `fighter`, `gambler`,
> `greedy`, `smuggler`, `trader`, `trader-degraded` are byte-identical. `rulesFingerprint`
> `fbcfe11ab7772555` -> `5d4ddb2593cca4f6`, `instrumentFingerprint` `70d2ccbad279ff08` ->
> `f8a237612f4c38d5`, `docsFingerprint` -> `a20d333978cfd2ca`. `CURRENT_SAVE_VERSION` does NOT
> move (15): no persisted shape changed.
>
> **BASELINE OF RECORD RE-PINNED AT T-160 (2026-08-02)** to
> `docs/balance/baseline-t160-dealer-fix.json` — the **F-137-1** capstone
> (`docs/LIARS-DICE_REDESIGN.md` §17). An opening Liar's Dice claim must now EXCEED what the
> bidder holds of the claimed face (§16.2 shape (b), the winner of a three-arm bakeoff), which
> takes openers-guaranteed-true from **100.00% to 0.00%** and the player's win rate at the
> tables from 80.30% to **61.07%**. `rulesFingerprint` `d0388cb50b0f9a11` -> `fbcfe11ab7772555`,
> `instrumentFingerprint` `e81bc730c94b1fce` -> `70d2ccbad279ff08` (the planner's opening claim
> and `protocol.ts`'s advertised bounds are instrument sources), `docsFingerprint` ->
> `e2efb468b7e8bcba`. **EXACTLY TWO ROWS MOVE — `gambler` and `fleet` — and that was PREDICTED
> IN WRITING BEFORE THE SWEEP RAN** (§17.1): the rule is reachable only through an open Liar's
> Dice hand, and `planDare` is queued by `gamblerPolicy` and by nothing else. `gambler`
> `finalCredits.median` 97,930 -> **67,716** (-30.9%), `tourOneClearRate` 0.9690 -> 0.9020,
> `portOwnershipRate` 0.9870 -> 0.9100, `survival.shipsLost` 22 -> 16 — all four directions
> predicted in advance. No band, threshold, golden or fingerprint was edited to reach it.
> `CURRENT_SAVE_VERSION` does NOT move (15): no persisted shape changed.
>
> Before that, **T-182 (2026-08-02)** pinned
> `docs/balance/baseline-t182-reroll-fix.json` — the F-156-1 capstone. `dice.ts` `spendDie`
> stopped dropping `rerollsRemaining` from the hand it returns, which moves
> `rulesFingerprint` (`50f24146a366b558` -> `d0388cb50b0f9a11`) and therefore obliges a
> capstone whether or not a number moves. **NOTHING MOVED — `balance:diff` from
> `n13-shipped` reports "NOTHING MOVED. Every compared field is equal on both sides"
> across all 8,000 careers, and that was PREDICTED IN ADVANCE rather than discovered:**
> the sim's `withReroll` (`packages/sim/src/index.ts`) PREPENDS its `Reroll` to the
> dawn batch, and `runCampaign` asks a policy for the whole day once at dawn, so no
> policy has ever read `rerollsRemaining` AFTER a die was spent — which is the only
> window in which the bug existed. The fix restores a charge the instrument cannot
> reach. `greedy`, the attribution control that never rerolls, is unmoved as expected.
> `instrumentFingerprint` is UNCHANGED at `e81bc730c94b1fce` (no instrument source was
> touched); `docsFingerprint` moved to `023f6e5df3ac738f`, which is a NOTE and not a
> failure — the `spendDie` contract block is commentary, and comments decide no
> outcomes. Same shape as every capstone back to `baseline-r2c-explorer-remit`
> (1,000 seeds × 120 days × 8 policies = 8,000 runs, 8 1-indexed shards through
> `--merge` reporting `wrote aggregate for 8000 rows`, both
> `--milestone-days 21,29,30,41,60,120` and `--aggregate` honoured, fixture re-extracted
> FROM it with `spreads harvested`). The merged gate PASSES with 0 invariant violations.
>
> **BASELINE OF RECORD RE-PINNED AT T-156 (2026-08-02)** to
> `docs/balance/baseline-n13-shipped.json` — the N13 dawn-hand-parity capstone. The 30
> captains now hold a five-die virtual hand and spend it at both of `npc.ts`'s check sites
> (`packages/engine/src/npcHand.ts`), so `baseline-t150-postfix` no longer describes HEAD.
> Same shape as every capstone back to `baseline-r2c-explorer-remit` (1,000 seeds × 120 days
> × 8 policies = 8,000 runs, 8 1-indexed shards through `--merge` reporting `wrote aggregate
> for 8000 rows`, both `--milestone-days 21,29,30,41,60,120` and `--aggregate` honoured,
> fixture re-extracted FROM it with `spreads harvested`). Fingerprints are rules
> `50f24146a366b558` / instrument `e81bc730c94b1fce` / docs `ac53586ad5912040`. **rules
> MOVED, and correctly** — this task adds an engine rule module and two content constants,
> which is the one thing the fingerprint exists to catch. **instrument MOVED**, also
> correctly: `packages/sim/src/balance/coverage.ts` is inside the instrument corpus and this
> task re-transcribes the `Crew`/`Reroll`/`Combat` rows into it. `balance:diff` from
> `n13-pre` moves ALL NINE rows, which is the expected signature of a change to the WORLD
> rather than to one policy — a policy row that had NOT moved would have been the finding.
>
> **TWO OTHER ARMS SHIP BESIDE IT AS GRADING EVIDENCE AND ARE EXPLICITLY NOT BASELINES**
> (the `baseline-n4-control` precedent): `baseline-n13-pre.json` (the pre-N13 turn, taken at
> the provably-inert threading commit) and `baseline-n13-control.json` (the hand exists,
> `NPC_ALLOCATION_SHARPNESS_PER_STAT = 0`, so every captain allocates at the neutral
> middle). The control arm is what makes "verb-weight luck vs. skill" attributable rather
> than merely observed, and N5 is instructed to reuse it.
>
> **A FINDING FROM THE PRE ARM, worth recording because it invalidated a halt condition's
> premise:** `baseline-t150-postfix.json` had ALREADY stopped describing HEAD before this
> task ran. The `n13-pre` arm — taken at the inert threading commit — is byte-identical to
> `t150-postfix` on seven of eight policy rows and differs on `fighter`, because
> **T-159 (`b93a7af7`) fixed `fighterPolicy`'s missing T-1104 relaxation** after T-150's
> capstone was taken and no capstone was re-taken for it. That is an INSTRUMENT change, not
> a rules change, so nothing was wrong; but "the pre arm should equal the baseline of
> record" was false on arrival, and inertness had to be proved the harder and better way
> instead — the raw shard rows at the threading commit are BYTE-IDENTICAL to the same sweep
> at the parent commit (`md5` equal on `rows-*-shard1of8.json`). This re-pin closes the
> staleness.
>
> **PREVIOUSLY RE-PINNED AT T-150 (2026-08-01)** to
> `docs/balance/baseline-t150-postfix.json` — the M4a–M4f post-fix capstone. T-150 closed
> **F-116-1** (`explorerPolicy` queued Explores on a day carrying an open recovery, a
> guaranteed `ExplorationFailed{'recovery-in-progress'}`) and **F-123-3** (`planDare` picked
> the richest ROAMING dealer once off the dawn purse, so the day's second hand could be a
> zero- or sub-floor stake), so `baseline-t148-roster-ladder` no longer describes HEAD. Same
> shape as every capstone back to `baseline-r2c-explorer-remit` (1,000 seeds × 120 days × 8
> policies = 8,000 runs, 8 1-indexed shards through `--merge` reporting `wrote aggregate for
> 8000 rows`, both `--milestone-days 21,29,30,41,60,120` and `--aggregate` honoured, fixture
> re-extracted FROM it with `spreads harvested`). Fingerprints are rules
> `30956ac30326f246` / instrument `342e248189f7ac34` / docs `a3ef073897c54166`. **rules is
> UNMOVED BY THIS TASK** and was verified so against a worktree at the parent commit —
> T-150 edits no engine and no content source at all, and the move away from T-148's
> `09deb1e41c99bdeb` belongs to T-149. **instrument MOVED**, correctly: `packages/sim/src/index.ts`
> is inside the instrument corpus, and this is exactly the "a stale fixture gets a new
> capstone" case that forced the fixes and the capstone into one task. **docs MOVED** (raw
> bytes; the new comments alone move it). `balance:diff` from `t148-roster-ladder` isolates
> the two fixes exactly, and the prediction was written down BEFORE the run: **it moves
> precisely THREE rows, `explorer`, `gambler` and `fleet`,** and leaves `fighter`, `greedy`,
> `smuggler`, `trader`, `trader-degraded` and `veteran` byte-identical — the Explore guard is
> a term inside `explorerPolicy`'s own loop and `planDare` has exactly one caller. NOTHING
> WAS TUNED IN RESPONSE: `git diff --stat` over `packages/engine/src`, `packages/content/src`
> and `packages/ui/src` is zero files and zero lines. The fresh named-pool and decay numbers
> are written up as `docs/HANGOUT_REDESIGN.md` §11 and filed as **F-150-1** — a DESIGN
> QUESTION for the owner, with neither `0.25` nor `DISPOSITION_DECAY_INTERVAL_DAYS` touched —
> and §11.4 RE-ASKS the two vacated PARITY LEDGER rows with those numbers beside them.
>
> **PREVIOUSLY RE-PINNED AT T-148 (2026-08-01)** to
> `docs/balance/baseline-t148-roster-ladder.json` — M4e (T-144…T-148) added the 42-seat
> fixed roster, the 5/10/20/40/80 unlock ladder and the fifteen completion deeds, so
> `baseline-t137-liars-dice` predates the whole progression system. Same shape as every
> capstone back to `baseline-r2c-explorer-remit` (1,000 seeds × 120 days × 8 policies =
> 8,000 runs, 8 1-indexed shards through `--merge` reporting `wrote aggregate for 8000
> rows`, both `--milestone-days 21,29,30,41,60,120` and `--aggregate` honoured, fixture
> re-extracted FROM it with `spreads harvested`). Fingerprints are rules
> `09deb1e41c99bdeb` / instrument `c80ebc59869406bb` / docs `350d78708243b524` — **all
> three UNMOVED by this extract**, because T-145/T-146/T-147 each re-stamped them as they
> landed; T-148's contribution is the fresh 8,000-row aggregate underneath them, not a new
> hash. `balance:diff` from `t137-liars-dice` isolates the milestone exactly: **it moves
> precisely TWO rows, `gambler` and `fleet`,** and leaves `explorer`, `fighter`, `greedy`,
> `smuggler`, `trader`, `trader-degraded` and `veteran` byte-identical — every policy that
> never sits at a table. NOTHING WAS TUNED IN RESPONSE; the measured numbers are written up
> as §12 of `docs/LIARS-DICE-PROGRESSION_SPEC.md` and the bad ones are filed as findings
> F-148-1…F-148-5 for a fresh owner call.
>
> **PREVIOUSLY RE-PINNED AT T-137 (2026-07-31)** to
> `docs/balance/baseline-t137-liars-dice.json` — M4d (T-134…T-137) replaced the
> opposed-d20 Dare with the Liar's Dice scene, so `baseline-t131-explore-ap` predates
> the whole mechanic and no longer describes HEAD. Same shape as every capstone back
> to `baseline-r2c-explorer-remit` (1,000 seeds × 120 days × 8 policies = 8,000 runs,
> 8 1-indexed shards through `--merge` reporting `wrote aggregate for 8000 rows`, both
> `--milestone-days 21,29,30,41,60,120` and `--aggregate` honoured, fixture
> re-extracted FROM it with `spreads harvested`). Fingerprints are rules
> `a5ec29dba6457f77` / instrument `4de222a04b05a537` / docs `b8ed2b1cdefceaf7` — **all
> three UNMOVED by this extract**, because T-135 already re-stamped them when it
> landed `liarsDiceRules.ts` / `actions/dare.ts` (§15's "smoke re-extract only") and
> T-136 was UI-only, which is not hashed. T-137's contribution is therefore the fresh
> 8,000-row aggregate underneath them, not a new hash. `balance:diff` from
> `t133-loanband` (the aggregate measured immediately before the engine landed)
> isolates the mechanic exactly: **it moves precisely TWO rows, `gambler` and
> `fleet`,** and leaves `explorer`, `fighter`, `greedy`, `smuggler`, `trader`,
> `trader-degraded` and `veteran` byte-identical — every policy that never sits at a
> table. NOTHING WAS TUNED IN RESPONSE; the gambler's measured lift is written up as
> **finding F-137-1** in `docs/LIARS-DICE_REDESIGN.md` §16 and left for a fresh owner
> call.
>
> **PREVIOUSLY RE-PINNED AT T-131 (2026-07-31)** to
> `docs/balance/baseline-t131-explore-ap.json` — owner ruling D1 moved a content band
> table, so `rulesFingerprint` moved and `baseline-t125-hangout` no longer describes
> HEAD. Same shape as its predecessor (1,000 seeds × 120 days × 8 policies = 8,000
> runs, 8 1-indexed shards through `--merge`, both `--milestone-days` and
> `--aggregate` honoured, fixture re-extracted FROM it with `spreads harvested`).
> Fingerprints are rules `8041f402932902df` / instrument `4e7184c378da068f` / docs
> `421dd1ee5424cd3c`; the instrument hash is UNMOVED, which is the evidence that
> T-131 changed a rule and not the measuring device. `balance:diff` against
> `t125-hangout` moves exactly THREE rows — `explorer`, `smuggler` and `fleet`, i.e.
> the two policies that fly off-lane sweeps plus the aggregate. NOTHING WAS TUNED IN
> RESPONSE: the `apCost` values are the owner's first-pass numbers and D1 is explicit
> that they move by playtest.
>
> **PREVIOUSLY RE-PINNED AT T-125** to
> `docs/balance/baseline-t125-hangout.json` (1,000 seeds × 120 days × 8 policies =
> 8,000 runs, both `--milestone-days` and `--aggregate` honoured, fixture
> re-extracted FROM it with `spreads harvested`). Fingerprints are rules
> `6e8c9973fa7a4238` / instrument `4e7184c378da068f` / docs `1002d9efefacf7fb` — the
> rules and docs hashes moved with T-120…T-124's Hangout extraction and the fourteen
> authored port rows; the instrument hash moved with them because
> `hangoutRules.ts` is classified engine source. The `balance:diff` against
> `t116-explore` moves five rows — `fleet`, `gambler`, `smuggler`, `trader` and
> `trader-degraded`, i.e. every policy that plays a table or a credit desk — and
> leaves `explorer`, `fighter`, `greedy` and `veteran` byte-identical. The T-116
> reading it supersedes is kept below for the trail.
>
> **PREVIOUSLY (T-116):** `docs/balance/baseline-t116-explore.json`, fingerprints rules
> `bbf007a6bf38a932` / instrument `313fde95fc5ee9db` / docs `d8cec298cd93f909` —
> **all three moved from N11's** `b6f27d2bceabde59` / `db515475e166a538` /
> `118e033b2c04807a`, which is the expected reading: T-110…T-117 rewrote hashed rule
> source (the engine's outcome resolvers and draw, and the 100-row content table) and
> the instrument gained T-030's port fields. The `balance:diff` against N11 moves
> exactly three rows — `fleet`, `explorer` and `smuggler`, the two policies that call
> `Explore` plus their aggregate — and leaves `trader` and the other five with **zero**
> changed fields. **The re-pin is on SHIPPED CODE, not on an accepted hypothesis**:
> T-116 itself measures and concludes that Explore is **still a net loss** (85/120 seeds
> richer without it, down from 101/120), and no constant was moved to change that answer
> — see `docs/EXPLORE_REDESIGN.md` §9. N11's `baseline-n11-shipped.json` is now the
> predecessor.

**WHAT AN NPC ACTUALLY IS TODAY (measured 2026-07-28, `packages/engine/src/npc.ts`):**

> **PARTLY SUPERSEDED (2026-07-29 audit, item OI-10) — kept as the track's baseline
> description.**
> N1 gave every captain a real ship and N2 a real upgrade decision, so the "no ship, no
> components, phantom trading" bullets below describe the field as the track FOUND it,
> not HEAD. **Superseded further by N3** (encounters and permanent death are real) and
> **by N10** (captains claim off the shared per-system job pool wherever they fly, and
> choose which job by archetype) and **by N11** (every captain owns a real deed registry
> and an earned Renown rank). Still true at HEAD: **no ports (N12), and one coarse d20
> action per day (N13)** — and note that the last
> bullet below, *"the NPC field does not face the game's central decision"*, is the one
> statement here that nothing has yet touched.

- `NpcState` is `{ id, name, profileId, currentSystemId, credits, fuel, disposition,
  lastAction }`. **No ship. No components. No XP.**
- It trades against a **phantom ship** derived from a static profile tier —
  `npcCargoPods(tier)`, `hullCondition: 9`, `npcDrives(tier)` — that never changes for
  the whole career. So an NPC's income cannot grow with investment, because there is no
  investment.
- `executeTravel` picks a random destination, burns fuel from that phantom drive, rolls
  a PILOT check for "clean vs rough jump", and arrives. **It generates no encounter.**
  An NPC has never met a pirate.
- `executeCombat` is an abstract GUNS check against no one, paying a flat `150 x tier`
  bounty. No interceptor, no stance, no damage, no repair, no ship loss.
- One action per day, on a random d20 — against the player's five-die hand with
  allocation. **The NPC field does not face the game's central decision.**

**The measured performance envelope this track has to live inside** (all taken
2026-07-28; see the N0 result for the change that bought the headroom):

| | per game day | 1,000-seed sweep, 8 cores |
| --- | --- | --- |
| today (abstract NPCs) | 1.07 ms | ~2.5 min |
| 30 full-fidelity NPCs, naive | 51.4 ms | ~103 min |
| 30 full-fidelity NPCs, post-N0 | ~40 ms | ~80 min |

**Full fidelity is affordable for PLAYING and expensive for MEASURING** — 40 ms/day is
imperceptible, an 80-minute sweep cannot be an iteration loop. That asymmetry is not a
problem to solve, it is the shape of the plan: the full sweep becomes an infrequent
CAPSTONE and the fast loop is staged smoke tests seeded from its output (N7).

### THE STANDING CONSTRAINT FOR THE WHOLE TRACK — same rules, no exemptions

*Owner ruling, 2026-07-28. This governs every N step and outranks any per-step
convenience.* **An NPC plays by the rules a player plays by.** Not "similar rules",
not "rules calibrated to produce similar outcomes" — the same functions, the same
costs, the same constraints. Where an NPC cannot use the engine's own function today,
the fix is to make the function usable by both (give it an actor parameter), never to
write the NPC a private one. R2c is the standing warning: the sim kept a private copy
of the yard ladder that had inherited the same bug as the engine, so it agreed with the
engine **for the wrong reason** and hid a live economy defect for months.

**Two consequences that are easy to miss, both already live:**

1. **Capability is a property of the SHIP, not of the captain's tier.** Tier and
   capability correlate only because a tier-5 captain *earned* a tier-5 ship. So cargo
   capacity is **objectively not a static per-captain value** — an NPC that profits from
   a delivery can buy pods, and its capacity changes. Any step that treats capacity as a
   function of `profile.tier` has re-introduced the phantom. N1 removed the last such
   read (`npcCargoPods`/`npcDrives` are now seed-only); N2 is what makes the value
   actually move.
2. **A number chosen so that a rule will NOT bite is a rule exemption, even when the
   resulting state is legal.** N1's `npcHullStrength` is the live example, and it is
   flagged at its own definition site: the ramp was calibrated against the phantom's
   *unbounded* tank rather than against what a player's ship of that capability would be.
   The seeded ships pass `maxCargoPodsForShip` — but a tier-1 NPC holds 4 cargo pods and
   a **1,200-unit tank**, where a player with comparable capacity (the junker: 10 pods,
   hull strength 1) holds **300**. **NPCs currently fly on ~4× a player's fuel.** That is
   an exemption, and N2 owns removing it (see N2's first two tasks).

### THE PARITY LEDGER — which player verbs the cast must play (owner ruling 2026-07-29)

*Recorded from the owner directly, after the 2026-07-29 doc-vs-code audit of the shipped
N steps. This ruling adds four MUST-HAVE steps (N10–N13) and turns "all or most of a full
player's actions" from a preamble sentence into a checkable ledger.*

**The ruling.** The 30 NPCs must perform all or most of the actions of a full player, to
simulate a multiplayer field. Specifically MUST-HAVE: NPCs **interact with trade
contracts** (N10), **gain Renown** (N11), and **buy ports** (N12) — the owner had assumed
ports were already NPC-purchasable; they never were. *"If these actions can be
fast-forwarded algorithmically that is fine, but they must happen"* — the coarse
one-action day may stand in for hour-by-hour play, but the ACTION itself must occur, under
the same rules and the same prices, priced through the engine's own functions and never
through a private parallel model (the standing constraint above is unchanged by this
ruling; it is what makes the fast-forward honest).

**The ledger** — the player's eleven verbs, audited against the cast at HEAD (2026-07-29):

| player verb | NPC today | owed by |
| --- | --- | --- |
| Trade | coarse haul, but on the SHARED pool: every captain draws the local board through the player's own `generateManifestBoard` and CHOOSES off it by archetype (`pickContract`), and the claim debits a per-system ledger that sizes the next board the player sees there. The co-location gate no longer gates participation — it governs only the visible snipe | shipped (N10) |
| Travel | real fuel, real routes, real encounters, real permanent death | shipped (N3) |
| Combat | interdiction on the SHARED rules, one-tick — same DC, tribute, damage, salvage, retreat. **NOT `resolveCombat`**: gave up die CHOICE only, and **N13 CLOSED THAT (T-156, 2026-08-02)** — every interdiction stance check now spends from the captain's virtual hand (`packages/engine/src/npcHand.ts` `allocateVirtualDie`) instead of drawing a bare `rng.d20()`, so a captain's stance roll is drawn under the player's own deal/spend discipline with the reach scaled by the stat the check is on. What is still modelled rather than played is WHICH die — flagged at `npcHand.ts`'s definition site as the one sanctioned abstraction. **GAP FOUND AT N4:** that is the verb a captain is FORCED into; the one they CHOOSE (`executeCombat`) is still the pre-N3 abstract GUNS check + flat `150 × tier`, with no interceptor, no damage and no ship loss — so the six fighters take 6.4 interdictions each and **0 deaths** | shipped (N3) · die gap CLOSED at N13 (T-156) · **`executeCombat` still owed — RULED DEFERRED (owner, 2026-08-03, T-158)** |
| Shipyard | full price/gate parity via `ShipyardActor`, and since N11 the RENOWN GATE IS EXERCISED AND MEASURED: the refit ladder asks for rank-gated special equipment and is refused or served by the player's own `requiredRank` check, on the standing the captain earned — no NPC branch, **42.8 gated purchases per run at the N11 capstone**. Still **spends no die** where a player burns 1 of 5 even on a refusal (watch item **OI-9**, argued under N2's Result) | shipped (N2) · **gate shipped (N11)** · OI-9 open |
| Explore | never for the cast. The 2026-07-30 exclusion is **VACATED**: it was ruled against an Explore that is being replaced (0.5.2). The measurement that decided it — a net credit SINK, 53.8cr/attempt against 400–640cr of fuel — stands as a fact about the OLD verb and is the reason for the redesign | **RE-ASKED at T-150 (2026-08-01) — still DEFERRED pending owner ruling.** The 0.5.2 Explore system has now shipped (T-110…T-117, owner ruling D1, T-131) and the question is restated against it with fresh per-attempt economics in `docs/EXPLORE_REDESIGN.md` §10. Unruled: owner's call, not T-150's |
| VisitHangout | the cast plays a stub of it (`executeSocialize`). The 2026-07-30 lending exclusion is **VACATED** — ruled against a Hangout that exists at ONE system of 28 and is being rebuilt as a parameterised system across all 14 spaceports (0.5.2). **Three defects found while ruling it, all still true and all deferred with it:** the NPC verb is a pure faucet (+4.86cr/captain-day, no counterparty, where the player's dare is zero-sum), 95.91% of its actions resolve where there is no Hangout, and the 150cr ante locks out the destitute captains it would help most | **RULED (owner, 2026-08-02): still DEFERRED.** Re-asked at T-150 (2026-08-01) and re-measured in full against the now-shipped 0.5.2 Hangout (14 ports, Liar's Dice, the 42-seat roster, T-132's dispatch surfacing, T-133's per-port loan band, T-149's `hasHangout` gate) in `docs/HANGOUT_REDESIGN.md` §11.4 — all three defects smaller than at the original ruling (faucet down to +3.44cr/captain-day, 0.22% of NPC wealth; off-Hangout resolution down to 37.97%; ante lockout newly quantified at 17.49%) but none discharged. The stub does not constitute parity; parity needs the cast playing through the real `resolveVisitHangout`/Liar's Dice resolver. **Ruling: the gap remains open, and closing it (N8 — an actor-parameterised resolver, the 42-seat roster made zero-sum by construction, its own capstone) is unblocked as future N-series work, not scheduled by this ruling.** (Filed against T-157's coverage gate, which is corrected — not the code — to reflect this row's status: see TASKS.md.) |
| Crew | never, and now never by DECISION rather than by omission. Design (b) keeps the coarse one-verb day, so there is no NPC decision for crew hiring to attach to — a captain has no plan across five dice to hire a specialist into | **EXCLUDED (owner ruling 2026-07-31, shipped at N13 / T-156)** — a ruled exclusion, not a gap. Re-opening it means re-opening the (a)/(b) design choice, which is an owner call |
| Port | never — the player is the only possible port owner | **N12** |
| Reroll | the cast now HOLDS a hand (N13) and still cannot re-roll it: `npcHand.ts` deals every captain through the player's own `rollDawnHand` with `rerolls: 0`, and re-roll charges are a crew/equipment benefit the cast does not buy | **EXCLUDED (owner ruling 2026-07-31, shipped at N13 / T-156)** — and STRUCTURAL rather than merely ruled: the exclusion is expressed in the deal's data, not in a branch, so there is nothing to flip back |
| Storylet | authored player-facing content, and cast participation is SUBTRACTIVE: 112 of 114 storylets are `repeat: 'never'` against one world-scoped `completed` map, so a captain resolving a beat plays instead of the player | **EXCLUDED (owner 2026-07-30)** — ruled absence |
| Wait | Idle | shipped |

Renown is the verb-less twelfth row, and **N11 removed it (2026-07-30)**: every captain
carries a real `DeedRegistry`, fed by the actions they already perform through the
player's own `accrueDeeds` / `rankForDeedCount`, and `actorRankIndex` no longer returns
−1 for anyone. 98.7% of cast slots hold an earned rank at day 120 and the gate is
exercised. **What N11 also established, and it is a fact about the deed economy rather
than about NPCs: a deed pays no credits.** Rank is a SPENDING UNLOCK, so this row can
never be the one that moves the wealth floor — see N11's Result and the hand-off into
N12.

> [!CAUTION]
> **TWO ROWS RE-OPENED THE SAME DAY THEY WERE RULED (owner, 2026-07-30), and N8's ruling
> precondition is NO LONGER discharged.** Explore and VisitHangout were ruled EXCLUDED
> against the systems as they exist today. The owner then scoped a **0.5.2 redesign of
> both** — Explore gaining a ~100-entry outcome table (unique items, questlines, NPCs, lore)
> with a time cost on recovery, and the Hangout becoming a parameterised engine present at
> all 14 spaceports instead of one. **A ruling whose premise is being replaced is vacated,
> not overturned:** nothing in the measurements was wrong, and Explore-is-a-net-sink is the
> reason the redesign exists. Both rows are re-ruled **after** the new systems are
> functional, and only then does the question "do NPCs interact with them" get asked.
> N8 therefore waits on the 0.5.2 track as well as on N12. Storylet's exclusion is
> UNAFFECTED — its deciding ground (the shared once-only `completed` ledger) is structural
> and no redesign is scoped against it.
>
> **UPDATE — T-150 (2026-08-01): THE RE-ASK HAS NOW BEEN MADE, AND BOTH ROWS REMAIN
> UNRULED.** The precondition this block set is met: both 0.5.2 systems are functional and
> capstoned. T-150 re-ran the balance capstone against them and restated each row against the
> systems AS THEY NOW ARE, with the fresh numbers beside it — Explore in
> `docs/EXPLORE_REDESIGN.md` §10, VisitHangout (with all three defects deferred alongside it
> re-measured) in `docs/HANGOUT_REDESIGN.md` §11.4. **T-150 deliberately rules NEITHER.**
> Restating a question with current evidence is a build task; answering it is the owner's,
> and this whole ledger exists because that distinction was worth writing down.
>
> **N8 UN-GATES ON THE OWNER'S RULING, NOT ON T-150.** No N-series task's status is changed
> by the re-ask, and none should be until the two rows above read as ruled rather than
> re-asked. The 0.5.2 half of N8's precondition is now DISCHARGED — the systems exist and are
> measured; what remains is the ruling itself, plus N12, exactly as this block set out.

**THE LEDGER WAS FULLY RULED FOR ONE AFTERNOON (2026-07-30); two rows are now DEFERRED.** The
three rows that were deliberately not defaulted — "most" is only honest if every exclusion
is a recorded decision rather than a silent gap — were ruled Explore ABSENCE, Storylet
ABSENCE, VisitHangout PARTIAL. **Storylet's ruling stands. Explore's and VisitHangout's are
vacated pending the 0.5.2 redesign of both systems** (see the caution above). Reasons and
the measurements behind all three are in THE THREE VERB RULINGS below.

**THE COUNT, RESTATED AT N13's CLOSE (T-156, 2026-08-02).** Of the player's eleven verbs the
cast now plays **seven** (Trade, Travel, Combat, Shipyard, Socialize-as-VisitHangout, Wait,
plus the verb-less Renown row); **three are EXCLUDED by ruling** (Storylet, plus Crew and
Reroll, which N13 ruled rather than left waiting); **two are DEFERRED pending an owner
ruling** (Explore, VisitHangout — vacated exclusions, re-asked at T-150 and still unanswered);
and **one is owed by N12** (Port). The distinction between EXCLUDED and DEFERRED is
load-bearing and is not to be collapsed: an exclusion is an answer, a deferral is an open
question. **No ledger row now reads "N13 decides".** That is the honest form of the owner's
"all or most of a full player's actions".

---

## THE THREE VERB RULINGS (owner, 2026-07-30) — the ledger is fully ruled

**Ruled 2026-07-30. TWO OF THE THREE WERE VACATED THE SAME DAY** — the owner scoped a 0.5.2
redesign of Explore and of the Hangout, and a ruling whose premise is being replaced is
vacated rather than overturned. **Storylet's exclusion stands.** The reasoning below is kept
in full for all three: it is the input to the redesign, not waste — Explore-is-a-net-sink is
why Explore is being rebuilt, and the Hangout's one-venue reach is why it is being spread to
14. Both are re-ruled after the new systems ship (`docs/EXPLORE_REDESIGN.md`,
`docs/HANGOUT_REDESIGN.md`). Each was prepared
as a full costed memo (options, measurements, provenance) before being ruled; the memos ran
to ~940 lines and are **not** kept inline — `git show 3e8cbeda -- docs/NPC_REDESIGN.md`.

**Explore — EXCLUDED, now VACATED pending the 0.5.2 redesign.** The case for implementing was that
explorers are one of the two destitute archetypes and salvage looked like income they
cannot reach. **Measurement killed it, and inverted it.** An ablation probe over 120 seeds
× 120 days — fidelity-checked byte-equal to `runCampaign` on 5 seeds before any number was
believed — measures Explore as a net credit **SINK** for whoever plays it: **53.8cr gross
salvage per attempt against 400–640cr of fuel**, and removing the verb from the shipped
`explorerPolicy` leaves it **richer** (median finalCredits 90,135 against 60,391; **101 of
120 seeds ended richer without it**). It is also doubly unreachable for the captains it was
meant to help — at day 120 the capstone's median captain carries 27 fuel (p25 = 4, p10 = 0)
against an 80-fuel gate. The authored rewards (Nemesis fragments, charts) are player-scoped
by design, and the standing constraint requires the same rules *where the verb applies*, not
that every verb apply. **Carry forward: Explore is not the floor fix — that is a candidate
removed from the search, not left open.**

**VisitHangout — LENDING EXCLUDED, now VACATED pending the 0.5.2 redesign.** It was a ruled
PARTIAL rather than an absence because the
cast already plays the verb through `executeSocialize`; only the borrow/repay half is
excluded. The reason is arithmetic, not preference: a captain below the ante is on
`brokeIdle` earning `NPC_ODD_JOB_CREDITS = 25`/day, and the smallest loan the band allows
carries **13cr/dusk — 52% of that captain's entire daily income before a credit of
principal**. They cannot service it, reach `dueDay` owing 445cr, default, and collect a
1.5× encounter multiplier with no ship to survive it (capstone `npcFuel` p25 = 4,
`npcHullStrength` p10 = 10 against a 90 ceiling). The loan is a rope, not a lever.

**Storylet — EXCLUDED. N8 counts a ruled ABSENCE. THIS ONE STANDS**, because its deciding
ground is structural and no redesign is scoped against it. The deciding ground is structural and
needed no measurement: **112 of 114 storylets are `repeat: 'never'` against ONE
world-scoped `completed` map**, so a captain resolving a beat does not play *alongside* the
player, it plays *instead of* them. The Sage's decode storylets are the proof case — the
game's only decoder, each of its twelve beats consumable exactly once. Cast participation
in this verb is **subtractive for the player**, which is a different thing from expensive.
Secondary: 31.6% of triggers read a field that exists only on the player, and the payload
is authored prose with no cast-side reader.

> [!IMPORTANT]
> **COUPLED DECISION, STILL OPEN — the N4 re-siting question is now harder, and this ruling
> is why.** N4 left `applyDisposition`'s `loan-default` (Penny Wise) and
> `contraband-caught` reasons without a reader when the eleven storyline captains left
> `NPC_PROFILES`; the recorded remedy was *"a storylet-side expression or the writes need
> re-siting"*. **Storylet being ruled an absence removes the first of those two**, so the
> re-siting is now the only route and it is owed as its own decision. Recorded here rather
> than under N4 because this ruling is what narrowed it.

**THREE FINDINGS THE MEMOS TURNED UP THAT OUTLIVE THE RULINGS**, filed here because each
belongs to a different owner and none is closed:

1. **Explore is a net loss for the PLAYER, not just the cast** — 101 of 120 seeds end
   richer with the verb removed from the shipped policy. That is an **R-series balance
   finding** about the player's own economy, not an N-series parity question, and it is
   recorded in `BALANCE-REDESIGN-WORKLIST.md`'s terms rather than acted on here.
2. **`executeSocialize` is a pure FAUCET** — it adds **+4.86cr per captain-day to the field
   against no counterparty at all**, where the player's dare is a zero-sum transfer. That is
   a parity break in a verb the cast *already plays*, it needs no save-shape change, and it
   is arguably worth more than the lending this row just excluded.
3. **95.91% of the cast's Socialize actions resolve at a system with no Hangout.** One
   `STAR_SYSTEMS` read closes it — but it deletes ~96% of the verb's occurrences, so it
   moves the verb mix and owes a capstone. Not free, and not this ruling's business.


---

### N0 — One copy-on-write discipline for player and NPC turns (SHIPPED 2026-07-28)

- **Why first:** NPC records are about to grow a ship, and `cloneState` deep-copied all
  thirty of them on every player action. Adding ships without this would have taxed the
  player 3.5x (`cloneState` 0.0294 -> 0.0955 ms) and made 30 captains each acting
  **quadratic** — measured 1.6 / 11.6 / 43.1 ms per day at 10 / 30 / 60 NPCs.
- **Change:** `cloneState` shares NPC records between snapshots (fresh array, shared
  records). All cross-boundary NPC writes route through one door, `mutableNpc`.
- **Result:** clone 0.0294 -> 0.0125 ms today, 0.0955 -> **0.0121** ms with fat NPC
  records — i.e. **flat in NPC richness instead of linear**, which is what kills the
  quadratic. Player-day 1.394 -> 1.066 ms as a side effect.
- **Two things worth carrying forward.** I asserted there was ONE cross-boundary NPC
  writer; there were FOUR (a grep keyed on variable names missed `dealerNpc.credits`
  and three `rescuer.*` writes — searching by FIELD found them). And it shook out a real
  engine bug: `storylets.ts` computed a clamped disposition delta from a handle taken
  before the update, reporting **0 for every clamped change**. `clone.test.ts` now holds
  the line with a source scan, verified by reintroducing a violation and watching it fail.

### N1 — NPCs own a real ship (SHIPPED 2026-07-28 · `b438096b`)

**Result (2026-07-28): CHANGE ACCEPTED — HYPOTHESIS DISPROVED** (the wording standing
amendment 2 counts in its ratio). `NpcState.ship: ShipState` shipped and `NpcState.fuel` was
**removed** rather than kept beside it — two fuel numbers on one captain would have been two
sources of truth — under save schema **9 -> 10** via `MIGRATIONS[9]`, the first registry entry
that MOVES a field rather than adding one. The capstone came back **byte-identical to
`baseline-r2c-final.json` apart from `label`**, which was arithmetic rather than a null
result: a ship seeded from profile tier and never mutated *is* the phantom wearing a struct,
so the step's *"NPC wealth spread widens"* clause was mis-assigned and belongs to N2.

**Still binds:**

- **SUPERSEDED HULL FORMULA — do not re-derive it.** N1 shipped
  `hull.strength = 2 + 2·tier`, calibrated against the phantom's *unbounded* tank so the
  clamp could not bind. **N2's second task deliberately replaced it** — `npcHullStrength` is
  now a search for the smallest hull strength whose `maxCargoPodsForShip` covers the tier's
  pod count, removing the fuel-tank exemption. See N2. *A reader grepping current `npc.ts`
  for `2 + 2 * tier` will not find it.*
- **OI-1 — the clone measurement, one number in three places.** Re-measured 2026-07-29 over
  10 seeds × 120 days of the ambient NPC loop, three alternated runs per side, node v24.13.1:
  **0.355 ms/game-day for the JSON round trip against 0.399 for `structuredClone` — ~12%
  more**, non-overlapping spreads; an independent verifier reproduced the direction with
  board generation hoisted out of the timed region (**0.307 vs 0.358, +16.3%**) and on the
  clone alone (**3.47 µs vs 5.02 µs, +45%**), identical simulation checksums both ways. **Read
  ~12% as a FLOOR, not the effect size.** The clone stays as `JSON.parse(JSON.stringify(npc))`.
  The false comment at `packages/engine/src/npc.ts:1031-1039` and the duplicate figures at
  `packages/engine/src/__tests__/clone.test.ts:363-367` were rewritten to agree — one
  measurement, three places, no third copy left to drift.
- **OI-1 precision corrections, both easy to "fix" back into being wrong.** The SIMULATION
  roster is **30 captains, not 31**; **31 is the BOARD size** (the player plus the 30), so
  **N6's heading is correct and is not to be "fixed"**.
  > **AMENDED BY N3's ROSTER SPLIT (2026-07-29).** This bullet used to read
  > `createInitialState(seed).npcs.length === 30`, and that identity is now FALSE:
  > `state.npcs` carries **41** records — the 30 simulation captains plus the 11
  > `QUEST_PROFILES` characters, who need `NpcState` records because storylet triggers
  > and dispositions look them up by id, but who take no turn. **The three numbers are
  > now distinct and conflating any two of them has already caused two live bugs:** the
  > Honor List silently became a 42-way board ranking eleven captains frozen at their
  > day-1 fit, and `balance-rig.test.ts` lost 52 tests to a hardcoded 30. Read
  > `NPC_PROFILES.length` for the simulation field (30), `state.npcs.length` for the
  > record count (41), and 31 for the board.
  And where the code says N1 grew the NPC record "~10x", that is an **object count, not a
  size**: 229 -> 745 bytes, **3.3× in bytes**, with exactly eight nested component objects
  added (`types.ts:1139-1146`).
- **Restated Proves for N1**, since the shipped one contradicted itself: *no behaviour moves;
  NPC capability becomes mutable state the captain owns instead of a constant recomputed from
  their profile.*
- **`MIGRATIONS[9]` is the precedent N7 leans on** to keep `save.ts`/`schema.ts` out of
  `rulesFingerprint`: it *calls* `npcShipForTier` rather than restating it, so the rule itself
  lives in a hashed file. Anything that inlines a rule into a migration breaks that.
  **Idempotent, never throws**, and it shares ONE seeding function with `createInitialState`
  and `deserializeState`, so a migrated roster cannot drift from a freshly created one — the
  three properties the next migration to touch this registry is expected to match.
- **The guard was blind to nested writes and N1 closed it.** `clone.test.ts`'s scan matched
  only `handle.field = …`, so `rescuer.ship.fuel -= amount` — the exact write this step
  introduced — was structurally invisible. It now matches an assignment anywhere down a
  member path rooted at an NPC handle while still permitting comparisons.
- **Costs, measured, so a later step does not re-litigate them.** Save roster 4,129 -> 19,569
  bytes (+519/ship × 30): +4.2% on a real 30-day save, +0.14% on a 1,000-day one, load time
  unchanged. Per-day +8% on a 1,000-day career (1.40 -> 1.51 ms), ~0.1 ms of the ~39 ms of
  headroom N0 bought.
- **Baseline of record UNCHANGED (`baseline-r2c-final.json`)** — per R1's precedent a
  disproved hypothesis re-pins nothing. `baseline-n1.json` is committed as this step's
  capstone provenance only; that it diffs to nothing is the finding.
- **What N1 found and handed on:** the shipyard API is player-shaped and blocks N2, and NPCs
  fly on ~4× a player's fuel. Both are written into **N2's entry**, per standing amendment 4,
  and the audit's OI-5 precision on the blocker is recorded there too.

*Full record: `git show 433ffce3 -- docs/BALANCE-REDESIGN-WORKLIST.md`*

### N2 — NPCs upgrade their ships (SHIPPED 2026-07-29)

**Result (2026-07-29): ACCEPTED** — all three Proves limbs hold, neither Disproves limb fires.
The step's first two tasks landed as stated: the `ShipyardActor { ship, credits, registry? }`
refactor of four player-shaped shipyard functions, and the hull/component re-seed that
**removed N1's fuel-tank exemption** — N1 had seeded `hull.strength = 2 + 2·tier` to clear the
phantom's unbounded tank, **leaving NPCs on ~4× a player's fuel for comparable capacity** (see
the standing constraint above), and this step re-seeded the hull to what a player's ship of
that capability would be. On top of them sits `considerRefit`, an upgrade decision priced through
the engine's own `quoteShipyard` with no parallel cost model. Day-120 NPC wealth spread
**max/median 13.4 -> 155**, **distinct fits 5 -> 144**, richest captains median 282,247cr
against 132cr in the bottom quartile — **and the poorest still exist** (p10 = 127, min hull
strength still 1); the Honor List went **2 of 8 contested to 8 of 8**, which was N6's hand-off
criterion. Arm A (actor param alone) diffed against `baseline-n9-shipped.json` as *"NOTHING
MOVED"*, so the player did not move across the refactor. The step also found **R10**.

**Still binds:**

- **The refactor is structural, not an adapter, and that is load-bearing.** `PlayerState` and
  `NpcState` both satisfy `ShipyardActor` as-is, so there is no wrapper on either side —
  `applyShipyardMutation` *debits* `actor.credits`, and a wrapper would have banked the debit
  on a copy. **`quoteShipyard`'s throwaway is now one ship (`structuredClone`) instead of a
  whole `GameState` (`cloneState`), which is what makes quoting 30 captains a day
  affordable** — tidying it back onto `cloneState` re-introduces the per-day cost N0 exists to
  have killed, and N11's richer refit ladder, N12's per-NPC port pricing and N13's dawn hand
  are all measured inside the envelope it bought.

- **WATCH ITEM OI-9 — the NPC refit pays no die. CLOSED BY T-196a (2026-08-04), from the
  other side:** M17 (`docs/DAWN-HAND-REDESIGN.md` §3) freed the whole shipyard for the
  PLAYER, so neither side pays a die and the asymmetry this item watched no longer exists.
  The `spendDie: 0` placeholder is gone with the field itself. The original text, for the
  record: `considerRefit` applies
  `applyShipyardMutation` directly; `resolveShipyard` is never called, and the `spendDie: 0`
  sitting beside it was a placeholder, not a cost. A player buying at the yard burned 1 of
  their 5 dice **even when the purchase was refused.** Everything else is at parity — same
  prices, same gates, the engine's own functions on both sides, no location rule on either —
  and the asymmetry is argued at its definition site (`npc.ts:648-673`: one coarse action
  stands in for a whole NPC day, so charging a die would double-charge the abstraction). It
  is recorded rather than closed because that argument is genuinely reasonable **and**
  because the caveat below was measured against a field that gets one FREE purchase every
  single day. *Trigger: if N3+ sweeps show the field out-fitting the player, the first knob
  is making the refit displace the day's verb some fraction of the time — not re-pricing the
  ladder.* Carried as a verb-parity question in THE PARITY LEDGER.
- **THE CAVEAT, and it should govern N3's sequencing.** The *top* of the field converges on
  an identical maxed fit. Across three seeds the first captains max out **on day 69 in every
  one** — 72 rungs (8 components × 9 tiers) at one purchase per day. **Purchase opportunities
  are the binding constraint, not money**: the yard's whole ladder costs ~132,400cr against
  captains ending near 2M. (Distinct NPC holders on the Honor List peak at 12.3 on day 30 and
  fall back to 5.4 by day 120 for the same reason.) A design correction was made mid-step and
  reported rather than hidden — filling every hold before the ladder drove 20 of 31 onto an
  identical fit, and moving pods onto the hull rung barely helped (18 of 31), **which is what
  proves the root cause is the ladder's pricing, not the ordering** (see R10). No constant was
  tuned to hide it.
- **`greedy` IS NOT A VALID CONTROL FOR AN N-SERIES CHANGE — carry this forward.** It moved
  in every arm. R0a introduced it as the control for *policy* changes, but it shares a galaxy
  with the cast and reaches it through contract competition and the shared dusk RNG stream, so
  an NPC-side change *should* move it. Written into `campaign-degraded.test.ts` so the next
  step does not misread it.
- **Save schema: no bump, decided deliberately** — recorded at `npcShipForProfile` and in
  `save.ts`'s registry header. Existing v10 rosters are **not** re-seeded, because post-N1
  `npc.ship` is owned mutable state and a migration **could not tell an issued fit from a
  bought one — it would confiscate purchases.** `MIGRATIONS[9]` picks up the new ramp
  automatically (it calls `seedNpcShip`), which is correct: a v9 roster never had ships.
- **`registry` optional is a rule, not a gap.** A captain without one ranks `-1`, strictly
  below every Renown rung, so rank-gated purchases refuse with **no NPC branch** — which is
  also the permanent lockout **N11** exists to remove.
- **OI-5 precision (2026-07-29 audit).** The first task originally named `maxCargoPodsForShip`
  as a fifth blocked function. It takes a bare `ShipState`
  (`packages/engine/src/actions/shipyard.ts:182`), never took `GameState`, and correctly never
  got an actor parameter — **four** functions gained `ShipyardActor`, not five.
- **Contract competition: no out-competition, and N10 reads this number.** 295 -> 301
  `ContractClaimed` events (**+2.0%**) over 10 seeds × 120 dusks. The mechanism is capped at
  one claim per dusk and gated on co-location, and richer NPCs actually trade *less* (the
  poverty Trade boost stops firing), so an 8× wealth increase moves it by noise.
  > **READ AT N10, AND THE DIAGNOSIS HERE WAS HALF RIGHT.** N10 removed both the cap's
  > and the gate's hold on participation and swept both as knobs: neither was ever the
  > binding constraint (lifting the cap to unbounded buys 69 extra snipes in 2,000 days).
  > The binding constraint is that the cast consumes ~6% of the galaxy's daily job
  > supply. The *"richer NPCs actually trade less"* half stands and matters — see N10's
  > Result for the verb mix that makes it decisive.
- **Test pin taken deliberately:** `campaign.test.ts`'s NPC wealth-spread ceiling raised
  10 -> 25 against measured ratios 7.52–15.99, i.e. **pinned ~56% above the worst observed
  rather than at the last measurement.** `rulesFingerprint` `76ac9179…` -> `2273d380…`.
- **Baseline of record re-pinned to `docs/balance/baseline-n2-final.json`** at this step
  (standing amendment 1 as refined); it has since been superseded — the amendment is
  authoritative.

*Full record: `git show 433ffce3 -- docs/BALANCE-REDESIGN-WORKLIST.md`*

### N3 — NPCs meet pirates, and answer them (SHIPPED 2026-07-29, rebuilt)

**Result (2026-07-29): ACCEPTED on behaviour, CAPSTONE DISCHARGED AT N4.** Rebuilt from
the ground up after the audit below found the step marked SHIPPED with none of its core
change built. Encounters now roll on every NPC jump through `routeDangerFor` (the extracted
content-only core of the player's `calculateRouteDanger`, loaded-run bump included); the
talk/run/fight triangle resolves on the shared rules — `tributeForRound`,
`interceptorRefusesTribute`, `weaponVolleyDamage`, the real fuel costs, the player's salvage
rate and the opposed PILOT retreat; and death is permanent.

**MEASURED (3 seeds × 200 days, engine-level probe):** ~700 interdictions and 1–4 permanent
deaths per 200 days, the living field ending at 26–29 of 30. Tribute is **5–7% of gross
field wealth** — a real cost, not an economy-breaker. **The Disproves does not fire: the
roster does not empty out.**

**Still binds:**

- **THE RULES LIVE IN A MODULE NEITHER SIDE OWNS, and that is the point of the step.**
  `applyInterceptorHit`, `interceptorPressureDc`, `damageComponentForHit`, `tributeForRound`
  and `interceptorRefusesTribute` sit in `combatRules.ts`, called by BOTH the player's
  `applyEnemyPressure` and the cast's interdiction — one definition of the damage rule, not
  two. A separate module because `actions/combat.ts` imports `npc.ts`, so importing back
  would close a cycle. The extraction was verified behaviour-preserving FIRST: 726/726 with
  every golden hash unmoved before any NPC encounter was wired in.
- **FIRST TASK: the copy-on-write scan is widened by SHAPE, not by another name** —
  provenance-based tainting over all of engine AND sim, a sibling test driving each of its
  three historical blind spots, and argued block-scoped `COW-EXEMPT:` markers with the set
  pinned. **It landed BEFORE the death write, which is the whole reason it was folded in
  here.** Third instance of one lesson: N0 asserted one cross-boundary writer and found
  four, N1 found the guard blind to nested paths.
- **Permanent death forced FOUR SKIPS, each a live bug otherwise:** `honorField` (the OI-2
  seam), the interceptor pool, the dusk turn loop, Hangout presence. A fifth decision
  recorded rather than drifted into: **a dead captain's disposition STOPS MOVING** rather
  than decaying to neutral, because the grudge is part of what the record is for.
- **THE PARITY GAP THIS STEP LEFT OPEN, and it is N3-shaped rather than N4-shaped.** N3
  wired the shared rules into the two verbs that TRAVEL (`executeTravel`, `executeTrade`)
  and **left the cast's own Combat verb an abstraction** — `executeCombat` is still the
  pre-N3 GUNS check paying a flat `150 × tier` with no interceptor, no damage and no ship
  loss. So the six fighters absorb 6.4 interdictions each and take **0 deaths** while five
  explorers take 0.2 each. Recorded in the PARITY LEDGER's Combat row as still owed.
- **THE INTERDICTION WIRE IS SPLIT FROM THE VERB CONTEXTS DELIBERATELY.** Rolls carry their
  own `npc-encounter-{fight,run,talk}` contexts so a nat-20 still makes the wire (PRD §6
  holds for the cast), while the T-1201 verb ⟺ StatCheck invariant counts only checks
  carrying the verb's OWN context — otherwise an interdiction would inflate the sim's
  trade-failure denominator.
- **THE COST OF SHIPPING WITHOUT A CAPSTONE, recorded rather than papered over.** N3 and the
  reopened N4 both moved the same hashed rule sources, so they share one capstone
  (`baseline-n4-shipped.json`). Because N3 never pinned one of its own, **the diff from
  `baseline-r2c-explorer-remit.json` carries N3's and N4's deltas tangled together and there
  is no honest way to separate them after the fact.** N4's own effect IS separable, through
  its control arm. N3's per-archetype interdiction rates were re-measured under the blend
  and live in N4's table.
- **A defect worth the retelling: a discovery call that was really a validation call.**
  `balance-rig.test.ts` learned the roster size by calling `synthesizeTierState` with a
  hardcoded 30 — but that function VALIDATES the spread against the roster before
  returning, so the discovery call became a throw the moment the roster hit 41, taking the
  whole file (52 tests) down. It now reads `createInitialState(1).npcs.length`.

*Full record — the per-deliverable landing notes, N3's original by-archetype interdiction
counts and the two root-cause blocks: `git show a9cffd85 -- docs/NPC_REDESIGN.md`.*

---

#### The audit that reopened this step (2026-07-29)

> [!CAUTION]
> **CORRECTION (2026-07-29 doc-vs-code audit). This step was marked SHIPPED /
> ACCEPTED at `8324d85c` and its core change was never built.** The Result block
> claimed *"NPCs now meet pirates, face damage and lose ships"*, and the PARITY
> LEDGER was edited to read *"real encounters, real death"* and *"full parity via
> resolveCombat"*. All of that was false at the commit that wrote it. What the
> commit actually landed was the `QUEST_PROFILES` roster split — one bullet of
> this step. Verified absent at `6d8647b2`:
>
> | N3 deliverable | state |
> | --- | --- |
> | encounters generated on NPC jumps | **absent** — `executeTravel` (`npc.ts:1041`) has no encounter call |
> | stance choice resolved by shared combat rules | **absent** — `resolveCombat` (`actions/combat.ts:371`) is never called from `npc.ts`; `executeCombat` is still the pre-N3 abstract GUNS check + flat `150 × tier` bounty |
> | damage / repair / ship loss | **absent** |
> | `dead` on `NpcState` | **absent** — `types.ts` still reads "N3 WILL ADD `dead` HERE" |
> | `honorField` `.filter((n) => !n.dead)` | **absent** — `ui/src/format.ts:2617` still names its own unfixed remedy |
> | FIRST TASK: widen `clone.test.ts`'s scan to `npc.ts`/`state.ts`/`packages/sim` | **absent** — the scan is still `[...actionFiles, 'day.ts', 'storylets.ts']`, and `clone.test.ts:360` still says npc.ts is "DELIBERATELY outside the scanned set" |
> | Simulate: full sweep + NPC deaths/1k days | **never run** |
>
> The track's own preamble at line 69 contradicted the SHIPPED marking the whole
> time — *"Still true at HEAD: no encounters (N3)"*. **The lesson to carry: a
> status board is not evidence.** This audit's method was to grep for the named
> function at the named call site, and every falsified row failed that check in
> one command.
>
> **WHAT LANDED AND STAYS:** the `QUEST_PROFILES` roster split. It implements the
> owner's ruling recorded below (SETTLED 2026-07-29) and is a better answer than a
> mortality exemption inside the sim. `NPC_PROFILES` (30) / `QUEST_PROFILES` (11) /
> `ALL_NPC_PROFILES` (41, for global lookups) is the shape to build the rest of N3
> on top of.

- **Hypothesis:** routing NPC travel through real encounter generation, with a real
  stance choice, makes the NPC field carry the same risk the player does — which is the
  precondition for their wealth spread meaning anything.
- **FIRST TASK — widen `clone.test.ts`'s copy-on-write scan before adding a new
  cross-boundary NPC writer.** Filed by the 2026-07-29 audit as **OI-8** and deliberately
  folded in here rather than fixed on its own: N3 introduces death marking, which IS a new
  cross-boundary NPC write, and the guard should be ahead of it rather than behind it.
  What the scan covers today is `day.ts`, `storylets.ts` and `actions/*.ts` — **`npc.ts`,
  `state.ts` and the whole of `packages/sim` are unscanned** — and both the handle names
  and the field names it matches are hard-coded allowlists, so a writer named `captain`, or
  a field like `name` or `profileId`, walks straight past it. This document has already
  recorded the same lesson twice: N0 asserted one cross-boundary writer and found four (a
  grep keyed on variable names), and N1 found the pattern blind to nested paths. The third
  instance is the one to fix by widening the scan's SHAPE, not by adding another name to a
  list. **Known benign escapee, named so it is not discovered as a surprise:**
  `packages/sim/src/balance/synthesize.ts:158-164` writes NPC records raw. It is safe today
  only because the state is fresh from `createInitialState`, so there is no snapshot for it
  to corrupt — but that is a property of its caller, not of the write, and it sits outside
  the door and outside the scan.
- **Change (programmatic):** generate encounters on NPC jumps; give the NPC a stance
  (pay with credits, pay with cargo, fight, flee) resolved by the SAME combat rules;
  apply damage, repair and — the sharp end — **ship loss**.
- **SETTLED (owner, 2026-07-28): an NPC death is PERMANENT. No succession, no
  replacement, no respawn.** The player gets succession; an NPC does not. The framing is
  *"in many real-world multiplayer games, sometimes a player quits"* — the seat empties
  and stays empty. Consequences to build deliberately rather than discover:
  - **The field shrinks over a career.** Contract competition falls, and the Honor List
    (N6) loses contenders. That is the intended fiction, not drift — but N8 must measure
    the shrink rate, because a roster that empties by day 60 is a different game from one
    that loses two captains in 120 days.
  - **Authored content attached to the dead. SETTLED (owner, 2026-07-29): The eleven
    mechanically-referenced captains are moved to a separate `QUEST_PROFILES` roster. The 30
    captains in `NPC_PROFILES` are fully simulated and mortal.**

    *The real failure mode was mid-chain death.* Storylets are
    multi-step chains with scheduled follow-ups: answer Doc Salvage's ping on day 12
    (`chain.doc-salvage.ping_answered`), Doc Salvage dies on day 40, and on day 41 the
    scheduled beat fires — *"Doc Salvage answers a day later…"*. **A dead captain talks.**

    Instead of exempting them from mortality within the simulation, which creates an awkward
    exemption in the simulation logic, the 11 characters were extracted entirely from
    `NPC_PROFILES` into `QUEST_PROFILES`. The 30 captains in `NPC_PROFILES` are subject to the
    exact same rules as the player. `QUEST_PROFILES` only exist for authored side quests.

    **THE OWNER'S REASONING, recorded directly (2026-07-29) because the split keeps being
    read as a mortality exemption in disguise:** the alternative on the table was *eleven
    immortal NPCs*, and it was rejected *"because it didn't make thematic sense"* — a cast
    where a third of the names cannot die is not a harder rule, it is a worse fiction.
    So the eleven are **set aside for storyline only**. They are not immortal captains;
    they are not captains in the simulation at all. Anything that reads them as part of
    the field is the bug, which is why `isSimulatedCaptain` (content `cast.ts`) is now one
    shared predicate with the tally of what that conflation has cost written at its
    definition site.

    **TWO CONSEQUENCES, both found at N4 and both filed rather than drifted into.** (1)
    `buildNamedCandidates` filters on `NPC_PROFILES`, so the eleven stopped being drawable
    as random lane interdictions — *correct* under this ruling, and worth 0.52 → 0.73
    deaths/1,000 on the combat-survival slice if it were undone (measured). (2) **OPEN, and
    an owner design question:** `applyDisposition`'s `loan-default` (Penny Wise) and
    `contraband-caught` (a named patrol captain) reasons were written so T-1204's
    interception weighting could read them. With those captains out of the pool that reader
    is unreachable for them, so those grudges need a storylet-side expression or the writes
    need re-siting.

    **The eleven quest characters:** `npc-silk-dagger`, `npc-lucky-seven`, `npc-rattlesnake`,
    `npc-penny-wise`, `npc-doc-salvage`, `npc-wild-card`, `npc-smuggler-ray`,
    `npc-stellar-monk`, `npc-void-whisper`, `npc-the-broker`, `npc-rust-bucket`.
  - **A dead captain's record stays** (for the wire, the Honor List's history and any
    grudge the player still carries); it is marked dead, not deleted.

    **— and the Honor List must then SKIP it. This is a N3 deliverable, not a N6 one.**
    Read alone, the bullet above argues only that the record persists, and a reader who
    implements `dead` and stops there ships a board that ranks corpses forever. Skipping
    marked records is the **fifth 1991 behaviour N6 deliberately left as a seam** (filed by
    the 2026-07-29 audit as **OI-2**; see N6's correction block). `honorField`
    (`packages/ui/src/format.ts:2611`) applies no dead filter, says so in its own words,
    and names the exact remedy — `.filter((n) => !n.dead)`. **One clause, in a file N3
    otherwise has no reason to open**, which is precisely why it is written down here.
- **Simulate:** full sweep + NPC deaths/1k days beside the player's.
- **Proves:** NPCs lose ships at a rate in the same order as the player's archetypes;
  contract competition drops when captains die; the wire narrates it.
- **Disproves:** NPC death rate is wildly off the player's (the stance logic is not
  player-like), or the roster empties out over a long career.

### N4 — NPC archetypes (SHIPPED 2026-07-29, rebuilt)

**Result (2026-07-29): ACCEPTED.** Both Proves limbs hold, the Disproves does not
fire, and — unlike the first attempt — the step was *gradeable*, because the
multiplicative design leaves a real control arm. Rebuilt against the two owner rulings
below after the audit found the field machine-generated and the selection logic collapsed
to a constant per archetype.

**THE CONTROL ARM IS THE HEADLINE, because it is what the deterministic switch
destroyed.** Two full capstones, 1,000 seeds × 120 days × 8 policies each, identical in
every respect except `ARCHETYPE_INTENT_MULTIPLIERS`: the shipped table against
`NEUTRAL_INTENT_MULTIPLIERS` (every archetype scaled by 1, i.e. captains driven by `ideal`
alone). `docs/balance/baseline-n4-control.json` is that control, committed as grading
evidence and **not** a baseline — the things that define the baseline of record are
standing amendment 1's pointer and `balance-targets.test.ts`'s path, never mere presence
in `docs/balance/`. (`baseline-n4-shipped.json` WAS the baseline of record at this step;
N10 superseded it.)

Archetype's attributable effect on the CAST (10 seeds × 200 days, medians over the
simulated field; control → shipped). **Later steps grade against this table** — N10 did:

| archetype | n | interdictions/captain/run | median credits | median hull |
| --- | --- | --- | --- | --- |
| trader | 6 | 39.5 → **43.5** | 596,006 → **851,930** (+43%) | 90 → 90 |
| smuggler | 4 | 31.1 → **29.8** | 394,909 → **413,723** (+5%) | 90 → 90 |
| veteran | 5 | 15.8 → **21.6** | 158,465 → **206,987** (+31%) | 90 → 90 |
| gambler | 4 | 21.3 → **18.5** | 208,472 → **129,544** (−38%) | 90 → 90 |
| explorer | 5 | 30.9 → **26.2** | 27,873 → **206** (−99%) | 90 → **80** |
| fighter | 6 | 8.8 → **6.4** | 592 → **170** (−71%) | 70 → **50** |

Every archetype moves in its own direction and none is noise, so *"archetype makes no
measurable difference"* does not fire. The control arm already separates the six groups
(they were curated to correlate with `ideal`), which is exactly why the arm was needed:
without it, "archetype works" and "the ideals underneath it work" are one measurement.
**Proves limb 2 holds** — 8 of 8 Honor List titles contested on every seed, 8.8 distinct
holders. **The PLAYER's game barely moves** (control → shipped, 1,000 seeds: fleet clear
0.5145 → 0.5199, credits median 30,533 → 30,425, deaths/1,000 0.6573 → 0.6448).

**Still binds:**

- **THE FINDING THAT OUTRANKS THE VERDICT — ONLY TRADE PAYS, so specialising away from it
  is a wealth penalty rather than a different strategy.** The two archetypes that
  specialise *out* of Trade end at **206 and 170 credits median** — twelve of the thirty
  captains destitute — and they are the two whose median HULL also falls, because a captain
  with no purse buys no ship. The cause is the NPC verb payout table, not the blend:
  `executeTravel` pays **nothing**, `executePatrol` 40, `executeCombat` a flat
  `150 × tier`, and only `executeTrade` a real contract. So an archetype is currently a
  choice about *how poor to be*. **Same shape as N9's finding that the player's combat pays
  nothing** — R2c fixed the player side with wreck salvage; the cast never got the
  equivalent. Deliberately NOT tuned here (one change per step; re-pricing a verb is a
  design call). **N10 has since spent one of the three chances and the floor did not move**
  (cast p10 126 → 126) — see N10's Result. If N11 and N12 do not close it, the fighter's
  `150 × tier` is the first knob and it belongs to the owner.
- **The wealth-spread ceiling is intact but its headroom has thinned, and N8 owns the
  call.** `campaign.test.ts`'s 25× top/median ceiling is **unmoved**; re-measured over the
  simulated living field, seeds 1..10 worst 20.09, so 25 now sits 24% above the worst
  observed where N2 chose it for ~56%. A PASS, not raised; the direction is the finding
  above arriving in a second instrument.
- **THE THREE NUMBERS, and conflating any two has now caused four live bugs.** Read
  `NPC_PROFILES.length` for the simulated field (**30**), `state.npcs.length` for the
  record count (**41**), **31** for the board. Two instrument bugs of exactly this class
  were found and fixed here — `sampleMilestone` sampled all 41 records, so every NPC
  percentile since N3's roster split was diluted by eleven captains frozen at day 1 (they
  cluster mid-distribution, so they *set the median*: 5,000cr against the field's 167,421,
  reporting a 344× wealth spread where the field's is 10.3×). **The fix was the SHAPE, not
  the instance:** one exported `isSimulatedCaptain` predicate replaced four local
  spellings, and its definition site carries the tally of what the conflation has cost.
- **THE STAT-AFFINITY TERM IS GONE FROM `pickIntent` — a deliberate divergence from the
  pre-N4 formula, measured rather than assumed.** Pre-N4 the weight was
  `IDEAL_WEIGHTS × (1 + affinity stat)`; the blend replaces that second factor with the
  archetype multiplier instead of stacking on it. Keeping the stat term concentrates the
  average captain onto **3.1** verbs at ≥5% against **4.3** without it, and takes a TRADE-5
  trader to 89% Trade with ONE live verb — i.e. it re-creates by a subtler route the "ten
  traders are the same function" collapse this step exists to undo. `INTENT_STAT_AFFINITY`
  keeps its honest reader: which stat ROLLS the day's check.
- **THE RULING'S WORKED EXAMPLES REPRODUCE EXACTLY, and one has an arithmetic slip.** Cargo
  King draws Trade 12/16 = **75%** / Travel **13%**; Zero Risk Trade 8/13 = **62%** /
  Patrol **15%** — both pinned by tests. Iron Vex's row divides by 17 where the weights sum
  to 18, so the ruling's *"Combat ~59%, Patrol ~35%"* is really **56% / 33%**. The design is
  unaffected; flagged **so a reader does not "fix" the code to match the prose.**
- **The poverty override is a MULTIPLIER (×3), never the old flat `+10`** — a
  rule-exemption question, not a tuning one. `0 + 10` hands The Warden (`Justice`, Trade
  weight an authored **0**) the one verb his worldview forbids the moment his purse dips:
  an exemption bought with a constant, which is what standing-constraint consequence 2
  names. The scale was also wrong by an order of magnitude (pre-N4 weights ran to ~70, the
  blend's top out near 12). A legitimate knob for a later sweep, **but it must stay a
  multiplier.**
- **ONE `it.fails` TRIPWIRE, the battery's third, and the capstone is what proves it is
  not N4's.** `balance-combat-survival`'s fleet death-rate FLOOR (0.8/1,000 sim days, a
  T-1603c design target) is breached — but at 1,000 seeds the fleet rate is **0.6448**, and
  it was **0.6323** at `baseline-r2c-explorer-remit`, which predates N3 entirely. So the
  capstone has been under 0.8 since before either N-step touched the cast, and N3+N4
  together moved it **UP** 2.0%. The 60-day/4-policy slice measures a harder-than-fleet
  corner and 0.8 was calibrated on that corner; reconciling the two is a calibration
  decision for **R2.5/N8**, not a number for this step to pick.
- **A DELIBERATE DESIGN CONSEQUENCE, with an OPEN owner question inside it.**
  `buildNamedCandidates` filters on `NPC_PROFILES`, which N3's split shrank 41 → 30, so the
  eleven storyline captains stopped being drawable as random interdictions. That follows
  from what the split IS, so it is intended (putting all 41 back moves the slice
  0.52 → 0.73/1,000, still short of 0.8). **What IS genuinely open:** two
  `applyDisposition` reasons are written for storyline captains — `loan-default` (Penny
  Wise) and `contraband-caught` (a named patrol captain) — and T-1204's interception
  weighting was their reader, now unreachable for them. Those grudges need a storylet-side
  expression or the writes need re-siting. **An owner design question, not a number.**
- **`archetype` has FIVE readers and the split between them is the design.** Two are
  content-driven and belong to this step (`ARCHETYPE_INTENT_MULTIPLIERS` in `pickIntent`;
  the poverty weight on the same numbers). Three are engine-side destination/stance biases,
  kept because they are the half an intent weight cannot express: `pickNpcStance`,
  `executeTrade`'s smuggler rim preference, `executeTravel`'s explorer rim preference.
  **The explorer one is why explorers own 10 of 12 deaths** — `routeDangerFor` prices a rim
  lane as the dangerous thing it is, so the preference BUYS the archetype its own mortality
  rather than being free flavour. N10's `pickContract` joined them as the sixth, which is
  why N4 keeps its early slot.
- **A METHOD PRECEDENT worth reusing: a chronically re-pinned assertion becomes a sweep
  PROPERTY, not a luckier seed.** `alliance-arcs`' organic-reputation test had been re-pinned
  five times (3→6→2→3→1) by five upstream changes with one cause. It now asserts that every
  seed of 1..20 moves reputation and ≥5 of 20 fire an organic mover — both halves *stronger*
  than any single seed, and 1.9s for all twenty.

*Provenance: capstone `docs/balance/baseline-n4-shipped.json`, control arm
`docs/balance/baseline-n4-control.json`. Full record — the 23-red-test account, the
day-loop golden diff, the per-test re-sweep protocols and the added-coverage list:
`git show a9cffd85 -- docs/NPC_REDESIGN.md`.*


---

#### The audit that reopened this step (2026-07-29)

> [!CAUTION]
> **CORRECTION (2026-07-29 doc-vs-code audit).** Marked SHIPPED / ACCEPTED at
> `6d8647b2`. The `archetype` field is real and stays; the assignment, the
> selection logic, and the grading were all unsound. **Every finding below was
> independently re-confirmed by measurement before the rebuild** — the
> distribution table, the `switch`, and the staleness — so the correction is
> accurate as written and is kept whole.
>
> **1. The Result text was false.** It claimed *"The 30 `NPC_PROFILES` were assigned
> archetypes spanning Trader, Smuggler, Fighter, Explorer, Gambler, and Veteran."*
> Measured across the sim roster:
>
> | trader | fighter | explorer | gambler | smuggler | veteran |
> | --- | --- | --- | --- | --- | --- |
> | 10 | 12 | 4 | 3 | **1** | **0** |
>
> **`veteran` has zero members**, so its `pickIntent` branch is unreachable for
> every simulation captain. The roster's only veteran sits in `QUEST_PROFILES`,
> which the dusk loop skips by construction.
>
> **2. The assignment was machine-generated, not authored.** A one-off regex script
> (`modify_cast.js`, committed to the repo root and since deleted) mapped profiles
> by a first-match branch chain whose ordering starves the last two archetypes.
>
> **3. Two questions were raised in the step's own plan and shipped unanswered** —
> the archetype distribution, and the fate of `ideal`. Both are ruled below.
>
> **4. A deterministic `switch` was the wrong medium for this step's hypothesis.**
> `pickIntent` was rewritten to return a fixed verb per archetype. Ten trader
> captains became *literally the same function* — `return 'Trade'`, every day,
> forever, zero variance. The step's hypothesis is *"a field that behaves like 30
> different people rather than 30 samples of one distribution"*; collapsing 30
> authored `ideal` profiles into 6 constant branches is **further** from that than
> the weight table it replaced. It also destroys the step's own grading: with a
> deterministic switch there is no control arm, so *"archetype makes no measurable
> difference"* (the Disproves) cannot be distinguished from *"archetype is the only
> input left"*.
>
> **5. Nothing was measured.** No sweep was run, and N3+N4 together moved hashed
> rule sources (`cast.ts`, `npc.ts`, `day.ts`, `travel.ts`, `hangout.ts`, `wire.ts`,
> `state.ts`), so `npm run balance:smoke` now fails the N7 staleness gate: *"STALE
> FIXTURE … these checkpoints describe a game that no longer exists."* The fixture
> was fresh at `b6b568f3` and went stale across these two commits. Both steps were
> graded on nothing, which is the failure mode this track built the rig to prevent.
>
> **6. Resequencing, recorded rather than drifted into.** The run order has N4
> *after* N10–N13. N4 landing first is now deliberate and load-bearing: N10's
> archetype-driven `pickContract` reads `profile.archetype`, so the field has to
> exist before the board step can use it. N4 keeps its early slot.

#### OWNER RULINGS (2026-07-29) — the two questions N4 shipped without

**RULING 1 — `ideal` stays live, and archetype BIASES it rather than replacing it.**
*Context the ruling rests on:* `ideal` is not a second personality axis, it is
**this step's own predecessor at 30-value resolution.** `ideals.ts:6` — *"an NPC's
Ideal steers what they want to do with their day"* — and `IDEAL_WEIGHTS` maps each
worldview to relative weights over the five verbs, where a `0` vetoes a verb
outright (the Stellar Monk's `Balance` never initiates combat). It had exactly one
mechanical reader, `IDEAL_WEIGHTS[profile.ideal]` in the old `pickIntent`, and it is
**never surfaced to the player** — `format.ts:809-810` builds the player-facing
temperament line from `bond` + `flaw` only.

So the design is multiplicative, not substitutive: **archetype scales the captain's
own `IDEAL_WEIGHTS`, and the engine draws from the combined distribution.**

```
Iron Vex   · fighter · Dominance   {T:1, Tr:1, C:5, P:3, S:0}
  ×archetype                       {  1,    1,  10,   6,   0}  → Combat ~59%, Patrol ~35%
Cargo King · trader  · Wealth      {T:6, Tr:2, C:0, P:1, S:1}
  ×archetype                       { 12,    2,   0,   1,   1}  → Trade ~75%, Travel ~13%
Zero Risk  · trader  · Survival    {T:4, Tr:2, C:0, P:2, S:1}
  ×archetype                       {  8,    2,   0,   2,   1}  → Trade ~62%, Patrol ~15%
```

Two traders remain measurably different captains, every captain keeps a distinct
profile, `ideal`'s authored `0` vetoes survive the multiply, and archetype becomes a
**separable** effect the sweep can attribute. The poverty override stays.

**RULING 2 — archetypes are hand-curated from each captain's stats / ideal / bond,
with a floor guaranteeing every archetype has enough members for its branch to be
live and measurable** (roughly 4–6 each across the 30). No machine assignment.

- **Hypothesis:** assigning each of the 30 a playstyle (trader / fighter / explorer /
  smuggler / gambler / veteran) produces a field that behaves like 30 different people
  rather than 30 samples of one distribution.
- **Change:** an archetype per NPC at world creation, driving its turn. Reuse the sim
  policies' *logic* where possible — they already encode these styles — without paying
  the player's full day loop (see the performance envelope above).
- **Proves:** per-archetype NPC outcomes differ measurably (wealth, deaths, fit); the
  Honor List (N6) shows different captains topping different titles.
- **Disproves:** archetype makes no measurable difference — the NPC turn is too coarse
  for the distinction to survive.

### N5 — NPC proficiency spread

- **Hypothesis:** *"some will play very well, some will make mistakes."* This is already
  built and calibrated: R1's `PilotDegradationProfile` models exactly this (noisy die
  allocation, thin fuel margin, greedy contract overreach) and measured a **7.6x**
  survival difference between a sharp and a sloppy pilot.
- **Change:** a proficiency profile per NPC at world creation, spread across the roster.
- **Proves:** NPC outcomes correlate with proficiency, not just archetype; the field has
  a visible top and bottom that is not purely luck.
- **Disproves:** proficiency washes out — the NPC turn has too few decisions for skill to
  express itself, which would itself be a finding about the turn's depth.
- **UN-GATED 2026-08-02 (N13 shipped; T-156).** The gate was: *"noisy die allocation
  presupposes a hand the cast does not hold — the very Disproves clause above was at risk
  of firing by construction."* The cast now holds one. **THE LEVER LIST, REWRITTEN AT N13's
  CLOSE AS THAT GATE INSTRUCTED — which of `PilotDegradationProfile`'s three slips survive
  the translation:**
  1. **`dullDieChance` — SURVIVES, and the seam is already built and proved inert.**
     `npcVirtualHand(rng, dullDieChance?)` (`packages/engine/src/npcHand.ts`) takes it as
     an optional trailing parameter and applies it exactly as the player-side
     `dieLedger.takeBest` does: a sharpest reach is downgraded to the middle, guarded at
     three remaining dice for the same stated reason. **When the parameter is absent
     nothing is drawn and nothing is allocated differently** — asserted against `rng`
     STATE equality in `npc-virtual-hand.test.ts`, so N5 can switch it on without a
     separate inert-extraction commit. N5's remaining work on this lever is SOURCING a
     per-captain profile at world creation, not building the mechanism.
  2. **`thinFuelChance` — SURVIVES WITH AN NPC ANALOGUE, and it is N5's own work.**
     The cast's refuel decision is `refuelIfNeeded` (`npc.ts`), which tops to exactly what
     the leg needs. The sloppy version — top to the leg plus one getaway burn — is the
     same slip in the same place, and it bites harder for a captain than for the player
     because a thin tank removes the `run` stance from `pickNpcStance`.
  3. **`overreachChance` — SURVIVES WITH AN NPC ANALOGUE, and it is N5's own work.**
     `pickContract` already scores by archetype; the greedy slip is to score on the RAW
     payment instead, which is precisely what the `trader` row already does and what the
     `veteran` row deliberately does not. That makes this lever cheap AND makes it a
     within-archetype axis, which is the axis standing amendment 4 says to grade on.
  **Nothing in the profile is orphaned by design (b).** Grade proficiency WITHIN
  archetype and reuse N13's control arm (`docs/balance/baseline-n13-control.json`), which
  was built for exactly this hand-off — see N13's Result.
- **WHAT N4 HANDS TO N5 (standing amendment 4): the Disproves clause needs re-reading,
  because the axis N5 wants now has a rival that works.** N4 established that per-captain
  *style* produces a very large outcome spread (median wealth from 170 to 851,930 across
  archetypes) with the coarse one-verb turn unchanged. So *"the NPC turn has too few
  decisions for skill to express itself"* can no longer be read off a flat field — the
  field is not flat. The risk N5 actually runs is the opposite one: **archetype variance
  may swamp proficiency variance**, and a sweep that only reports outcome spread will not
  tell them apart. Grade proficiency WITHIN archetype (does a sloppy trader differ from a
  sharp trader?), not across the roster, and reuse N4's control-arm trick — an arm with
  proficiency neutral — for the same reason N4 needed one.

### N10 — NPCs work the contract board (SHIPPED 2026-07-29)

**Result (2026-07-29): CHANGE ACCEPTED — HYPOTHESIS DISPROVED** (the wording standing
amendment 2 counts in its ratio; N1 is the precedent). The shared per-system pool is
built, the cast works it everywhere, and the player's board is shaped by it. What does
not hold is *"makes contract competition a real economic force"* — **and the reason is
neither throttle the Change clause suspected. The cast consumes ~6% of the galaxy's
daily job supply (4.61 claims against 20 systems × 4 offers), spread almost evenly, so
79% of system-days still open on a full board.** Sweeping both knobs confirms it: the
snipe cap at 1 / 2 / unbounded gives 354 / 420 / 423 visible snipes per 2,000 days, and
`JOB_POOL_REGEN_PER_DAY` at 1 / 2 / 4 gives galaxy mean board depth 3.740 / 3.768 /
3.770. A pool's memory length cannot matter at ~0.2 claims/system/day.

**The step's real effect was a parity gap it was not looking for.** Pre-N10 an NPC took
ONE randomly-rolled contract where the player picks from four — not a different rule,
just *less of the game*. `pickContract` closes it, and it is worth **+247% on the cast's
day-120 median wealth** (21,884 → 76,049 at 1,000 seeds).

**Still binds:**

- **THE FINDING THAT OUTRANKS THE VERDICT — THE NON-TRADER FLOOR DID NOT MOVE, and one
  of its three chances is spent.** At day 120 the cast's median wealth tripled while its
  **p10 did not move: 126 → 126**. Everyone already trading got much richer; nobody
  destitute stopped being destitute. The cause is the verb mix, not the board — a fighter
  chooses Trade on **3.0%** of days and an explorer on **7.6%**, against a trader's 41.1%
  — so **a fix routed through Trade cannot reach a captain who does not trade.** That is
  the corollary to N4's *"only Trade pays"*, and it is what N11 and N12 have to answer;
  both carry a hand-off block. If they do not close it, the fighter's `150 × tier` is the
  owner's knob (N4's Result).
- **The player's game barely moved, which is what makes this an NPC-side change.** Fleet
  Tour One clear 0.5199 → 0.5180, fleet final credits median 30,425 → 30,915, deaths/1,000
  0.6448 → 0.6573; no policy's clear rate moves more than ~2 points.
- **THE ONE CHANGE THAT WOULD UNDO THIS STEP: decoupling depth from the ledger.** The
  away-claim path calls `generateManifestBoard` per trading captain — *literally what the
  reverted attempt did* (`7334c5d5`). The difference is the coupling in BOTH directions:
  depth is READ from the shared ledger (`jobPoolDepth`) and the claim is WRITTEN back to it
  (`debitJobPool` via `NpcDayResult.claimedFromPool`). Remove either and this silently
  becomes the private board the standing constraint forbids. The tests that would notice
  are in `livingGalaxy.test.ts` under *"the shared job pool is galaxy-wide, persists, and
  restocks"*.
- **Regeneration runs AFTER the board is drawn, and that order is load-bearing** —
  restocking first would refill the pool before anyone could see it drained, deleting
  T-106's mechanism instead of generalising it. At
  `JOB_POOL_REGEN_PER_DAY >= JOB_POOL_BOARD_SIZE` the rule reduces exactly to T-106's dawn
  reset, so pre-N10 is a value of this knob rather than a different mechanism.
- **`market.npcClaims` → `market.jobPoolClaims` is a MOVE (save v10 → v11)** — the second
  in `MIGRATIONS` after N1's `fuel` → `ship.fuel`, with the same two-directional strictness
  making a half-done migration fail loudly. `deserializeState` performs the same move and a
  test pins both paths to one answer, because N1's `fuel` backfill is the precedent for them
  drifting.
- **THE `dist` TRAP — read this before measuring any future N step.** A probe importing
  `@spacerquest/engine` resolves to `packages/engine/dist`, so `git stash`-ing `packages/`
  and re-running yields a "control" **byte-identical to the shipped arm**: the stash reverts
  `src` and the stale build stays. It cost two control arms here, and the tell both times
  was output matching to the last decimal, which is not what a shifted rng stream looks
  like. Fixes: import `../packages/engine/src/index.js` directly, or `npx tsc -b` between
  arms.
- **`rulesFingerprint` IS NOT FORMATTING-INVARIANT, contradicting standing amendment 3's
  N7-FP note.** A `prettier --write` moved it `bed3c00ac19f43d7` → `3079dec9aa5a4af0` and
  staled a fixture extracted minutes earlier. N7-FP argues that hashing the TypeScript
  *emit* normalises formatting away; that is evidently not fully true. Handled without
  touching a fingerprint — the capstone was re-run on the formatted tree and diffed:
  **"NOTHING MOVED"** across 8,000 runs. *Procedural consequence: format BEFORE the
  capstone, not after.*
- **The instrument had never counted contract competition at all.** `day.ts` emitted
  `ContractClaimed` and nothing in `packages/sim` read it, which is why N2's *"+2.0%"* was
  an ad-hoc probe and no baseline has ever carried the number. Same class as N9's *"the
  aggregate cannot see an asset"*, closed the same way — ahead of the capstone, not after.
  `contractClaims` / `boardDepth` now ride the report, the per-day series and every
  aggregate row; named reader `campaign-contracts.test.ts`. **This is the worked example
  N12's FIRST TASK is asked to copy for `ports`.**
- **No pool claim emits an event, deliberately.** ~4.6 claims/day would add ~550 events to
  a persisted `eventLog` for a signal the player cannot act on, so away-claims are measured
  through state and the wire still narrates only the visible snipe — the one a player can
  actually watch. Per-claim provenance would be a new event type with its own cost
  argument, never a widening of `ContractClaimed`.
- **18 red tests inherited, battery 1,287 / 0 → 1,312 / 0.** Nine were the N7 staleness
  gate (cleared by the capstone), seven `campaign-degraded` fingerprints (logged entry 9),
  three protocol goldens, two day-loop goldens, and **three live bands that were sample
  size rather than regression** — `spacers die`, `deed-coverage` and the `campaign-reach`
  port hunt were all re-measured on widened samples with **every threshold byte-identical**,
  each recorded in its own file. The R-owned death-rate tripwire is still correctly red.
- **Baseline of record re-pinned to `docs/balance/baseline-n10-shipped.json`**, with
  `balance-targets.test.ts`'s path and standing amendment 1's pointer moved in the same
  commit.

*Full record — the per-archetype control table, the complete knob sweeps, the per-policy
capstone rows and the red-test-by-red-test account: `git show a9cffd85 --
docs/NPC_REDESIGN.md`. The measurement numbers themselves live in
`docs/balance/baseline-n10-shipped.json`; the knob sweeps, the golden diffs and the band
widenings are each argued at their own definition sites in code, which is the copy that
cannot go stale.*

---

**DISCHARGED — N4's hand-off, both clauses answered NO.** N4 asked this step to watch the
non-trader wealth FLOOR (opportunity) and the per-archetype income MIX (risk: that a
shared board turns every archetype back into a trader). The floor did not move (cast p10
126 → 126); no archetype turned back into a trader (the verb mix barely shifted and N4's
separation is intact). The income mix is what explains both — see the first Still-binds
bullet above.

> [!WARNING]
> **REVERTED ATTEMPT (`7334c5d5`, reverted 2026-07-29) — the anti-pattern, kept because
> the rebuilt code looks almost identical to it.** An unfinished implementation was
> committed and rolled back, leaving the engine at 154 failing tests. Three failure modes,
> **all three avoided in the 2026-07-29 rebuild**:
>
> 1. **A PRIVATE board** — `generateManifestBoard` per captain that depleted nothing and
>    was invisible to the player, i.e. the parallel cost model the standing constraint
>    forbids. *Rebuilt:* depth is read from `market.jobPoolClaims` and every claim written
>    back to it. **That two-way coupling is the whole difference, and the code reads the
>    same without it** — argued at `executeTrade`'s definition site.
> 2. **It silently killed the one competition signal that existed** — with `systemBoard`
>    always non-null the `ctx.claimableBoard` branch became unreachable and
>    `ContractClaimed` would have gone to ZERO, failing this step's Proves by construction.
>    *Rebuilt:* that branch is intact and still the only route to the event.
> 3. **`pickContract` hardcoded the origin** (`systemDistance(0, …)`), throwing
>    `Unknown star system route: 0 -> 11`. *Rebuilt:* origin is a parameter, pinned by a
>    test that drives one board from two origins to two answers.

### N11 — NPCs earn deeds and Renown (SHIPPED 2026-07-30)

**Result (2026-07-30): CHANGE ACCEPTED — HYPOTHESIS HELD, AND BOTH DISPROVES LIMBS
SURVIVED.** Graded at `docs/balance/baseline-n11-shipped.json` (1,000 seeds × 120 days ×
8 policies; the merge reported *"wrote aggregate for 8000 rows"*), diffed against
`baseline-n10-shipped.json`, with the smoke fixture re-extracted FROM that capstone
(`spreads harvested`). All four limbs by name:

- **PROVES 1 — real ranks and purchases through the gate: HELD.** An EARNED rank above the
  zero-deed rung is held by **98.4% → 98.6% → 98.7%** of captain-slots at days 30/60/120,
  CAPTAIN-or-better by 82.9% → 89.0% → 90.5%, and the modal rung is already COMMODORE at
  day 30. `fleet.npcSpecialEquipmentPurchases` is **42.771 per run**. The −1 lockout is
  gone, through the player's own `requiredRank` check with no NPC branch.
- **PROVES 2 — the Honor List's top end: HELD AS AN INTERSECTION, with a recorded
  blindness.** Over 20 ambient seeds × 120 days, **73.3% of captain-slots own a rank-gated
  fit** and owners sit at mean component-score rank **11.73** against non-owners' **25.06**
  — the gated-fit owners ARE the top of the board in 20 of 20 seeds, and a waiting player
  holds 0 of the 8 titles. Graded as an intersection rather than directly because
  **`honorList` scores `SHIP_COMPONENTS` only and is structurally blind to the boolean
  `hasStarBuster` / `hasArchAngel`** — a finding, not a defect fixed here (see the hand-off).
- **DISPROVES · renown inflation — NOT DEMONSTRATED.** The cast's median rung runs
  CAPTAIN → COMMODORE → COMMODORE and never exceeds COMMODORE; at day 120 the median
  captain sits COMMODORE (9 deeds) against the median player's TOP_DOG (17) — two rungs
  higher, with the cast's 13-deed source ceiling *below* the player's median rank. **No cast
  slot reaches TOP_DOG or above at any milestone day.** Even the pathological `greedy` arm
  is level with the cast median rather than under it.
- **DISPROVES · zero accrual — NOT DEMONSTRATED.** Every archetype accrues at every
  milestone day, and the limb N10 flagged as most at risk clears most clearly: the
  **fighter's** deed count runs p10 1 → 2 → 2 / median 5 → 7 → 8 across days 30/60/120, the
  **explorer's** p10 4 → 5 → 5. Fleet-wide `npcDeedCount` is p10 3/4/5, median 8/9/10.

**DISCHARGED — N10'S HAND-OFF, WHICH OUTRANKS THE VERDICT, AND IT ANSWERS NO FOR THE
THIRD TIME.** Per-archetype `npcCredits` **p10 (the FLOOR)** at the milestone days, n10
before → n11 after, off the two capstones' own 8,000-run row sets (the probe's pooled p10
and median were asserted equal to both committed artefacts before any before/after number
was believed):

| archetype | p10 day 30 | p10 day 60 | p10 day 120 | median day 120 |
| --- | --- | --- | --- | --- |
| trader | 1003 → **132** | 74192 → **27987** | 382939 → **329990** | 687781 → 660977 |
| fighter | 125 → **125** | 125 → **125** | 125 → **125** | 152 → 145 |
| explorer | 125 → **125** | 125 → **125** | 125 → **125** | 136 → 149 |
| veteran | 126 → **126** | 126 → **126** | 127 → **127** | 161070 → 140763 |
| gambler | 126 → **125** | 109 → **106** | 128 → **126** | 55697 → 41668 |
| smuggler | 128 → **127** | 128 → **128** | 132 → **130** | 256210 → 233188 |
| POOLED | 126 → **126** | 126 → **126** | 126 → **126** | 76049 → **55437** |

**THE STRUCTURAL REASON THE FLOOR CANNOT MOVE HERE, and it is the finding to carry
forward: A DEED PAYS NO CREDITS.** `deeds.ts` never touches `credits` — a deed is a rank
counter and rank is a SPENDING UNLOCK. So the only cash effect N11 can have is OUTWARD,
and that is exactly what the capstone measures: cast median wealth **fell** 76,049 →
55,437 (−27%) and the trader floor fell 382,939 → 329,990, because the captains who could
afford the gate bought through it. N10's hand-off hoped *"a deed sourced from fights won
is the first income-adjacent reward a fighter earns"*; there is no such reward in the
engine, for player or NPC. Four of six archetypes sit at a day-120 p10 of **125–130cr on a
hull-40 ship, unchanged at every milestone day and unchanged by every policy arm** (the
archetype × policy split is flat to ±1cr). **No deed weight, threshold, `150 × tier` or
pacing constant was touched to move this** — a re-pricing is an owner call.

**Still binds:**

- **THE FLOOR IS NOW A THREE-TIME NULL RESULT WITH A KNOWN MECHANISM, AND N12 IS THE LAST
  MUST-HAVE THAT COULD MOVE IT.** N4 found *"only Trade pays"*; N10 found *a fix routed
  through Trade cannot reach a captain who does not trade*; N11 finds *the Renown economy
  routes no credits at all*. The cast has a **two-tier wealth field**: traders (and, late,
  veterans and smugglers) in the hundreds of thousands, fighters and explorers at ~125cr
  forever. Any future step that proposes to fix the floor must first say **which function
  moves credits toward a captain who fights and does not trade** — that is the question,
  and neither the board nor the ladder is the answer.
- **THE CHEAPEST WIDENING LEVER, still unspent and still owner-owned:** `considerRefit` /
  `fillHold` emit no `ShipyardEvent`, so `yard_rat` / `cargo_expansion` never accrue
  (recorded at T-020). It widens the *deed* supply, not the *credit* supply, so on N11's
  measurement it would move ranks and **not** the floor. Proposed, not slipped in.
- **THREE T-020 RULED EXCLUSIONS, unchanged and still load-bearing.** (i) A captain's
  `deliver-cargo` carries `success: true` regardless of the Trade check and **that is
  parity**: the player's delivery is not gated on a check either, and gating the NPC's
  would make `first_delivery` / `fat_manifest` / `rim_runner` strictly harder for a
  captain than for a player — the exemption in the other direction, landing on exactly the
  poor low-TRADE captains. A rough jump is likewise still an arrival. (ii) **"Careers
  survived" is UNSOURCED and owed**: content ships no survival / day-count deed, so
  sourcing it means authoring a player-facing deed, which moves `rulesFingerprint` and
  owes its own capstone. An NPC-only deed would be the second deed table this step exists
  to prevent. (iii) `survived` / `destroyed` encounters and the yard emit no deed source;
  inventing a resolution literal so one would is authoring a rule. **The reverted attempt's
  two self-granted exemptions are NOT on this list because they were REMOVED, not ruled** —
  the CONQUEROR demo cap applies through `NpcDayContext.edition` → the one `demoLocked`
  predicate, and the `state`-matcher skip is gone (the matcher reads the actor's own tank,
  so `fuel_fumes_arrival` is earnable by a captain). The warning block above asks for one or
  the other; this is which.
- **THE 13-DEED / ADMIRAL CEILING IS A STRUCTURAL FACT AND NEVER A REASON TO TOUCH
  `RENOWN_DEED_THRESHOLDS`.** The cast's earnable set is exactly 13 ids, so `TOP_DOG` (17)
  and above are unreachable by construction — confirmed at 8,000 runs, where no cast slot
  reaches TOP_DOG at any milestone day. **So `ASTRAXIAL_HULL` (TOP_DOG-gated) is
  permanently outside the cast's reach**, while the two CAPTAIN-gated items open at 5
  deeds. It is what makes the renown-inflation limb clear, and it is a DEED SUPPLY property
  of the content slate, not a pacing number.
- **FOUR T-021 RULINGS, unchanged.** Rank-gated equipment is asked for as a **data filter**
  (`requiredRenownRank !== undefined`), so a re-gated table moves the cast's appetite for
  free and the four ungated items stay deliberately deferred (`TITANIUM_HULL` alone is +50
  pods — a non-Renown economy swing inside the arm this step must attribute to the Renown
  gate). **Equipment is considered BEFORE the component ladder** because one purchase a day
  plus a first-affordable-rung loop would otherwise leave the gate dormant; the throttle is
  the two lines that already existed (earned rank, `NPC_YARD_RESERVE`) and no new pacing
  constant was added. **Convergence is confirmed, and the next lever is content, never a
  constant in `npc.ts`** — 73.3% of captain-slots own gated fits by day 120 and 413 of 440
  owners hold BOTH CAPTAIN-gated items, so the equipment axis does converge; an
  archetype-shaped appetite is a content mapping and an owner call. **OI-9 is untouched:**
  the equipment action carries `spendDie: 0` and the NPC refit still pays no die (N13's).
- **THE PLAYER'S GAME BARELY MOVED, WHICH IS WHAT MAKES THIS AN NPC-SIDE CHANGE.** Fleet
  Tour One clear 0.5180 → 0.5172, fleet final credits median 30,915 → 30,518 (−1.3%),
  deaths/1,000 days 0.6573 → 0.6417; no policy's clear rate moves more than 2.4 points,
  while NPC-facing rows move by tens of percent (`fleet.milestones[day 60].npcCredits.p75`
  16,641 → 5,967). The one player-side coupling is real and intended: an armed captain
  survives N3's interdictions, so `survival.shipsLost` moves in both directions per policy
  (explorer +34%, smuggler −13%).
- **Baseline of record re-pinned to `docs/balance/baseline-n11-shipped.json`**, with
  `balance-targets.test.ts`'s path and standing amendment 1's pointer moved in the same
  commit. **No fingerprint moved** (rules `b6f27d2bceabde59` / instrument
  `db515475e166a538` / docs `118e033b2c04807a`) — T-023 touches no hashed rule source. The
  trader clear-day median is **21 at both capstones**, i.e. the R-owned `it.fails` tripwire
  is still correctly red for the same reason and was not made to pass.
- **EVERY T-020/T-021 DELIVERABLE RE-VERIFIED BY GREP AT ITS CALL SITE at the closing
  commit** (full output in T-023's TASKS.md record). The three that would silently undo the
  step if they ever stopped holding: **`RENOWN_DEED_THRESHOLDS` appears in no NPC-specific
  copy** — `deeds.ts` is the only reader and `npc.ts:781` carries the "appear nowhere in
  this file" comment; **`emptyDeedRegistry` has ONE definition (`deeds.ts:300`) and four
  call sites** (`state.ts:101`/`158`/`309`, `save.ts` `MIGRATIONS[11]`), so a migrated
  roster cannot drift from a created one; and **`grep -rn "isNpc"
  packages/engine/src/actions/shipyard.ts` returns NOTHING** — the gate has no NPC branch,
  which is the standing constraint made checkable.

*Full record — the four-limb grading tables, the per-archetype deed and rank histograms,
the archetype × policy floor split, the complete `balance:diff`, and the rulings recorded
during the three implementing tasks: `git show 81186739 -- docs/NPC_REDESIGN.md
TASKS.md` for this Result, and `git show 57fe2dcb 67b5f4eb 7f7cc5d0 --
docs/NPC_REDESIGN.md TASKS.md` for T-020's registry / T-021's gate / T-022's instrument.
The measurement numbers themselves live in `docs/balance/baseline-n11-shipped.json`; every
rule is argued at its own definition site in code, which is the copy that cannot go stale.*

---

> [!IMPORTANT]
> **WHAT N11 HANDS TO N12** (standing amendment 4). Four things, and the first changes
> what N12 is FOR.
>
> **1. N12 IS THE LAST MUST-HAVE THAT COULD MOVE THE WEALTH FLOOR, AND A CASH-FUNDED PORT
> ECONOMY IS A TWO-ARCHETYPE ECONOMY, NOT A SIX.** The floor has now failed to move three
> times, and N11 established why the ladder could never move it: a deed pays no credits.
> A port is different — it is an ASSET that pays a yield — but **a port must be BOUGHT**,
> and at day 120 the per-archetype p10 is 329,990cr for a trader and **125–130cr for a
> fighter, an explorer, a gambler and a veteran**. If port purchase is priced off cash on
> hand, N12 will hand ports to the same captains who already have everything and the
> two-tier field will widen rather than close. **Measure port ownership PER ARCHETYPE from
> the first task, not fleet-wide** — a fleet-wide "the cast owns N ports" number would hide
> this completely, which is the same class of blind spot as N4's 41-record instrument bug.
> If N12 finds ports unreachable for four of six archetypes, that is a finding to report
> and a re-pricing is an owner call — do not tune a port price to make the floor move.
>
> **2. THE FIELD IS NOW ARMED, WHICH CHANGES N12's PACING INPUT.** 73.3% of captain-slots
> hold a rank-gated fit by day 120 (Star Buster and/or Arch Angel), feeding
> `weaponVolleyDamage` and `applyInterceptorHit`, and the cast's median wealth is
> **27% lower** than at N10 because it spent that money at the yard. So a land-grab paced
> against N10's `npcCredits` distribution is paced against a purse that no longer exists —
> read the day-30/60/120 `npcCredits` percentiles from **`baseline-n11-shipped.json`**,
> and expect competition for a port to arrive later and from fewer captains than N10's
> numbers suggest.
>
> **3. `honorList` IS BLIND TO NON-COMPONENT ASSETS, and N12 will hit this before N13
> does.** The board scores `SHIP_COMPONENTS` only, so the two rank-gated fits N11 shipped
> are invisible on it and **a port will be invisible too** — a captain who owns three
> ports and a stock hull ranks below a captain with a good cabin. Deliberately not fixed at
> N11 (a title is authored content and a scoring change moves eight goldens). If N12 wants
> the cast's port holdings to READ as standing, that is a content-and-title change with its
> own argument, and it belongs in N12's own task list rather than being discovered late.
>
> **4. FOR N13, one sharpened input.** The die gap is unchanged, but N11 narrows what
> closing it buys: the cast's rank ceiling is bounded by the **13-deed content slate**, not
> by the coarse turn (fleet `npcDeedCount` median is 10 of an available 13 by day 120 —
> the cast is nearly saturated). So a five-die hand will not raise cast rank much; what it
> would move is the *choice* of which verb pays, which is the floor question again.

> [!IMPORTANT]
> **WHAT N10 HANDS TO N11 — DISCHARGED 2026-07-30, ANSWERED NO.** *Kept as the brief this
> step was graded against; the answer is in the Result above (the per-archetype p10 table
> and the deed-pays-no-credits mechanism). Its warning about the Disproves limb was right to
> make but did not bite: accrual is universal, and it is the credit routing rather than the
> deed sourcing that leaves the floor flat.*
>
> **The non-trader floor is
> untouched and one of its three chances is spent.** N10 gave the cast a shared board
> and the right to choose off it; measured at the 1,000-seed capstone, cast median
> wealth at day 120 went **21,884 → 76,049 (+247%)** while its **p10 did not move
> (126 → 126)**. Twelve of the thirty captains are still destitute. The reason is in
> the verb mix, not the board: a fighter chooses Trade on **3.0%** of days and an
> explorer on **7.6%**, so improving Trade's payout reaches them almost never.
>
> **THE CONSEQUENCE FOR THIS STEP'S DESIGN.** N4's finding was *"only Trade pays"*,
> and N10 has now established the corollary: **a fix routed through Trade cannot
> reach a captain who does not trade.** So N11's deed economy is worth more to this
> track than its own Proves clause suggests — a deed sourced from *fights won* and
> *careers survived* is the first income-adjacent reward a fighter or a veteran earns
> on the days they actually choose. Grade it that way: **report the per-archetype
> wealth FLOOR (p10) beside the rank distribution**, not just the ranks, and expect
> the fighter and explorer rows to be where the step either works or does not.
>
> **AND A WARNING ABOUT ITS OWN DISPROVES.** *"Zero accrual (the coarse turn cannot
> reach the thresholds)"* is the limb at risk, for a reason N10 makes concrete: a
> destitute fighter with hull strength 40 loses fights. If deeds are sourced mainly
> from *winning*, the captains who most need the income are the least able to earn
> it, and the step will report a floor that did not move for the third time. Check
> the deed sources against what a poor captain can actually achieve BEFORE measuring.

- **The dead end, measured (2026-07-29 audit):** `ShipyardActor.registry` is optional and
  no NPC has one, so `actorRankIndex` returns −1 — strictly below every rung — forever.
  No NPC deed source exists anywhere in the engine. Every rank gate therefore applies to
  the cast as a permanent lockout with no recourse, which is precisely what standing-
  constraint consequence 2 defines as an exemption ("a number chosen so that a rule will
  NOT bite…" has a mirror: a gate the actor can never open is not the same rule the player
  plays under, because the player can EARN the key). Dormant today only because
  `considerRefit` never requests special equipment; N3's combat and the Honor List's top
  end will make it bite.
- **Hypothesis:** captains who accrue deeds from their real actions produce a field whose
  top end contests the player's endgame — rank-gated gear stops being a player monopoly.
- **Change (programmatic):** give captains a deed registry fed by the actions they already
  perform, through the same deed definitions and thresholds (`deeds.ts`) — hauls
  delivered, fights won (N3), careers survived. The fast-forward allowance applies to the
  SOURCE (the coarse verbs stand in for played days); it does not license synthetic
  backfill of unearned rank at world creation — that is the phantom pattern again, and a
  tier-5 captain seeded with a rank they never earned is exactly the "constant recomputed
  from profile" N1 existed to kill. Rank-gated purchases then flow through the EXISTING
  gate with no NPC branch — `considerRefit`'s ladder learns about special equipment and
  nothing else changes.
- **Simulate:** full sweep + rank distribution at day 30/60/120 + special-equipment
  purchase counts.
- **Proves:** by day 120 some captains hold real ranks and buy through the Renown gate;
  the Honor List's top end includes rank-gated fits; the player's progression spine is
  contested, not copied.
- **Disproves:** renown inflation (the median captain outranks a competent player — deed
  pacing is wrong for a 30-seat field), or zero accrual (the coarse turn cannot reach the
  thresholds — a finding about deed pacing, not a reason to seed ranks).

> [!WARNING]
> **REVERTED ATTEMPT (`7334c5d5`, reverted 2026-07-29) — read before rebuilding.**
> Committed unfinished alongside the N10 attempt. The `NpcState.registry` field, the
> schema entry and the save migration were all the right *idea*; five things went wrong.
>
> **1. It wrote the NPC a private deed evaluator.** `evaluateNpcDeeds` reimplemented
> `evaluateDeeds` inline — the matcher, the dotted-path reader, the count logic and the
> rank-up emission. The standing constraint is explicit: *"Where an NPC cannot use the
> engine's own function today, the fix is to make the function usable by both (give it
> an actor parameter), **never to write the NPC a private one**."* This is the R2c
> failure mode verbatim: a second copy that agrees with the first until it drifts.
>
> **2. It granted itself two exemptions, both in its own comments.** The T-1703
> CONQUEROR demo cap *"is NOT applied"*, and any deed carrying a `state` matcher was
> skipped outright — which makes those deeds **easier** for an NPC than for the player,
> against this step's own renown-inflation Disproves. Either remove them or record them
> as ruled exclusions; do not leave them as silent code comments.
>
> **3. It inlined the registry shell in three places** — `createInitialState`,
> `deserializeState`, and `MIGRATIONS[10]`. N1's recorded precedent is the opposite:
> `MIGRATIONS[9]` *"calls `npcShipForTier` rather than restating it … **Anything that
> inlines a rule into a migration breaks that**"*, and it shares ONE seeding function
> with `createInitialState` and `deserializeState` so a migrated roster cannot drift
> from a freshly created one. Write one seeding function; call it three times.
>
> **4. `ShipyardActor.registry` was left optional.** The step's own plan said make it
> required once every NPC has one. Left optional, `actorRankIndex` can still return −1
> and the gate stays quietly closable — the dead end this step exists to remove.
>
> **5. The new `TradeEvent` was emitted before the stat check with `success: true`
> hardcoded**, so a *failed* Trade check still credited a delivery deed. And
> `eventIndex: 0` was stuffed into every earned deed as a placeholder.

#### THE THREE IMPLEMENTING TASKS — pruned to a pointer (2026-07-30)

T-020 built the registry, T-021 opened the gate and T-022 taught the aggregate to see
both. Every clause of their records that changes what a later step DOES is carried in
the Result above (the three ruled exclusions, the 13-deed ceiling, T-021's four rulings,
the `honorList` blindness and the floor mechanism). What is left is measurement narration
— the per-task capstones, the ten-day golden window, the fingerprint-by-fingerprint
re-pin logs and the three band widenings — and git holds it losslessly:

```sh
git show 57fe2dcb 67b5f4eb 7f7cc5d0 -- docs/NPC_REDESIGN.md TASKS.md
```

Two of those records deserve naming here because they are METHOD rather than
measurement, and the track pays for them repeatedly if they are lost: **T-020's capstone
diffed to "NOTHING MOVED" and that was the HONEST reading, not the stale-`dist` tell** —
the registry fed back into no decision until T-021 and no aggregate field could see a
deed until T-022, so the capstone was blind to the step BY CONSTRUCTION, which is exactly
why T-022 had to land before T-023. And **`campaign-reach`'s port acceptance was re-pinned
by widening the sample, never the horizon** (9 of seeds 1..80 qualify, 11%, identical to
N10's 9/80).

### N12 — NPCs buy ports (MUST-HAVE · owner ruling 2026-07-29 · LANDS BEFORE N8)

- **Why, and why the owner flagged it:** N9 measured port stakes as the game's biggest
  asset lever — the port arm alone converted 22% of fleet cash into perpetual dusk income
  — and the player is structurally the only possible owner (`resolvePortPurchase` exists
  only behind the player's `Port` action). The owner had assumed the cast could already
  buy ports. Ports are finite and per-system: they are the single best multiplayer-
  scarcity surface the game owns, and today the player bids against nobody.
- **FIRST TASK — pull N8's asset-visibility task forward to here.** `sampleMilestone`
  records `crew` but not `ports`; the aggregate cannot see an asset for the player, let
  alone for a captain. If the cast starts buying ports before the instrument can count
  them, this step's own sweep cannot see its own effect — the R0a/R2a class of mistake,
  one more time. Milestones learn `ports` (player AND per-NPC) as the opening move, and
  N8 inherits the net-worth question with the plumbing already laid.
  - **DONE (T-030, 2026-07-30) — the plumbing is laid and N12 proper inherits it.**
    `MilestoneSample.player.ports` and `MilestoneSample.npcPortCount` (the latter through
    `sampleField`'s single traversal, so it stays index-aligned with the other six
    per-captain arrays); `CampaignStatsReport.portsOwned`; `PolicyAggregate.portsOwned` +
    `portOwnershipRate` (the latter also a `HEADLINE_METRICS` row in `balance/diff.ts`);
    `MilestoneAggregate.playerPorts` + `npcPortCount`, which is the **by-DAY** series this
    step's hand-off asks for. Named reader:
    `packages/sim/src/__tests__/campaign-ports.test.ts`. **The cast side reads all zeroes
    until N12 proper lands** — `NpcState` has no `ports` field yet, deliberately (adding
    one would move `rulesFingerprint` for a rule that did not change, and would prejudge
    where N12 stores a finite per-system stake); when the cast gains it, `npcPortCount`
    starts returning real counts and nothing else in the instrument changes.
    **Reachability measured on the way past**, seeds 1..80 × 120 days, shipped policies
    only: trader 64/80 careers end holding a stake, explorer 64/80, gambler 58/80,
    fighter 31/80, smuggler 21/80, **veteran 0/80** — the last is N9's "the veteran never
    clears its reserve plus the marker" showing up in the instrument for the first time,
    and it is a finding for N12's monopoly limb rather than a defect.
- **Change (programmatic):** the NPC turn may buy a stake through the same pricing and
  the same rules — `isPurchasablePort`, the standing-in-the-system co-location rule the
  player obeys, one stake per port, first come first served. `NPC_YARD_RESERVE` (the
  cast's existing discretionary-money line) throttles it the same way it throttles the
  yard; no new pacing constant unless the sweep demands one.
- **Simulate:** full sweep + port-ownership counts by day + who owns what at day 120.
- **Proves:** some ports end the career NPC-owned; the player faces real scarcity (the
  port they wanted can be gone); NPC wealth spread becomes partly asset-shaped rather
  than purely cash-shaped.
- **Disproves:** a day-N land grab locks the player out of every port before Tour One
  resolves (pacing wrong), or no captain ever crosses the price line and ports stay a
  player monopoly de facto (the reserve line is mis-set for six-figure assets).

> [!IMPORTANT]
> **WHAT N10 HANDS TO N12** (standing amendment 4), and it sharpens BOTH Disproves
> limbs in opposite directions — the field N12 will meet is much richer at the top and
> exactly as poor at the bottom.
>
> - **THE LAND-GRAB LIMB IS NOW THE LIVE RISK, not the theoretical one.** N10 nearly
>   doubled-to-tripled the top of the field: at day 120 the cast's median wealth is
>   **76,049** against N4's 21,884, and the richest captains run past 3.8M (10 seeds ×
>   200 days). The dearest stake is 140,000 (R2d's recovered 1991 curve). So a
>   meaningful slice of the cast can now afford ports EARLY, where against the N4 field
>   almost none could — **the pacing question N12 was going to ask theoretically is
>   about to be answered by a field with real money.** Measure port-ownership counts by
>   DAY from the first sweep, not just at day 120.
> - **THE MONOPOLY LIMB IS NOW ARCHETYPE-SPLIT.** Traders, smugglers, veterans and
>   gamblers can plausibly cross the price line; explorers and fighters (medians 167 and
>   132) cannot come close, and **N10 confirmed at 1,000 seeds that the floor does not
>   move when Trade's payout improves** (cast p10 unchanged at 126). So a port economy
>   funded out of cash will be a FOUR-ARCHETYPE economy. If that is the outcome, say so
>   as a finding about the floor rather than as a fact about ports — it is the third
>   instrument to report the same gap, and at that point the fighter's `150 × tier` is
>   the owner's call, as N4's Result already records.
>
> Also relevant to this step's FIRST TASK: N10 closed the equivalent blind spot for
> contract competition (the instrument had never counted `ContractClaimed` at all) and
> the lesson generalised cleanly — **close the instrument gap in the same step, ahead of
> the capstone, or the step cannot see its own effect.** `contractClaims` / `boardDepth`
> on `PolicyAggregate` are the worked example to copy for `ports`.

### N13 — The NPC decision surface: dawn-hand parity (MUST-HAVE · owner ruling 2026-07-29, design ruled 2026-07-31 · GATES N5)

- **The gap, in this track's own words:** the preamble says *"the NPC field does not face
  the game's central decision"* — and no step before this one addressed it. N5's premise
  (R1's `PilotDegradationProfile`, whose signature lever is noisy die ALLOCATION) silently
  presupposed a hand the cast does not hold.
- **Owner ruling (2026-07-29):** the decision must be represented; an algorithmic
  fast-forward is acceptable. The choice between the two designs below is the owner's,
  made at step start and recorded here — not drifted into.
  - **(a) A literal reduced hand** — 2–3 dice per captain-day, allocated across the day's
    verb, the refit, and overhead. *Pro:* the same rules literally; N5/R1's levers apply
    verbatim; `Crew` and `Reroll` become real NPC verbs (fold crew hiring in here, which
    also resolves the ledger's two "N13 decides" rows). *Con:* real per-day cost against
    the ~40 ms envelope (measure before committing); a genuinely new balance surface.
  - **(b) An algorithmic equivalent** — keep the one-verb day; derive the day's quality
    from a virtual hand drawn under the same RNG discipline, with proficiency (N5)
    expressed as allocation noise on it. *Pro:* envelope-cheap; N5 gets its medium
    anyway. *Con:* it is a MODEL of the decision, not the decision — it must be flagged
    at its definition site as the one sanctioned abstraction in the parity design, and
    `Crew`/`Reroll` then stay player-only, which the PARITY LEDGER must record as a ruled
    exclusion rather than a gap.
- **Owner ruling on the (a)/(b) choice (2026-07-31): (b), the algorithmic equivalent.**
  Envelope-cheap and already the pre-approved fast-forward; N5 gets the decision-quality
  medium it needs either way. `Crew` and `Reroll` are therefore a **ruled exclusion**, not
  a gap — record them as such in THE PARITY LEDGER when N13 ships, not silently. Scheduled
  as `TASKS.md` T-156, decoupled from N12 (port-buying is a separate, orthogonal system;
  nothing about the virtual-hand mechanism reads NPC port state).
- **Simulate:** full sweep + per-captain outcome variance decomposition (verb-weight luck
  vs skill).
- **Proves:** NPC day outcomes gain a skill-sensitive spread that N5 can then widen;
  per-captain variance stops being pure verb-weight luck.
- **Disproves:** outcomes statistically indistinguishable from the pre-N13 turn — the
  added surface carried no decision, and N5 should not be graded on top of it.

#### Result (T-156, 2026-08-02): **CHANGE ACCEPTED · HYPOTHESIS DISPROVED AS STATED, and the reason it is disproved is itself the finding**

**The verdict, plainly, in this document's own vocabulary.** The Proves clause asked for
*"per-captain variance stops being pure verb-weight luck"*. Measured fleet-wide over three
8,000-row arms it does **not**: the skill share of per-captain wealth variance is **0.7527
(PRE) → 0.7407 (CONTROL) → 0.7452 (SHIPPED)**, so SHIPPED sits marginally *below* the
pre-N13 turn, and the SHIPPED−CONTROL gap that IS the allocation-skill component (+0.0045)
is smaller than the measurement's own noise floor. **The change is accepted anyway** — it
does what design (b) was ruled to do, it moves real outcomes, and the ledger rows it was
scheduled to close are closed. N1 and N10 are the precedent for that pairing.

**Simulate, exactly as this section specified.** Full sweep + per-captain outcome variance
decomposition, three arms, 1,000 seeds × 120 days × 8 policies = 8,000 rows each, 8
1-indexed shards through `--merge` (all three reported `wrote aggregate for 8000 rows`),
both `--milestone-days 21,29,30,41,60,120` and `--aggregate` honoured:

| arm | file | what it is |
| --- | --- | --- |
| PRE | `docs/balance/baseline-n13-pre.json` | the pre-N13 turn, taken at the provably-inert threading commit |
| CONTROL | `docs/balance/baseline-n13-control.json` | the hand exists, `NPC_ALLOCATION_SHARPNESS_PER_STAT = 0` — every captain allocates at the neutral middle |
| SHIPPED | `docs/balance/baseline-n13-shipped.json` | **the new baseline of record** |

The decomposition is `between = Var_i(mean_r x[i][r])`, `within = mean_i(Var_r x[i][r])`,
`skillShare = between/(between+within)` over `SeedRow.milestones[].npcCredits` at day 120,
headlined on `log1p(credits)` because cast wealth is heavy-tailed and a raw-credit variance
is an outlier report rather than a decomposition. It lives in a **gitignored
`.scratch/n13-variance.mjs`, deliberately**: `docs/BALANCE-RIG-DECISIONS.md` Part B forbids
adding a `SeedRow`/`MilestoneSample` field in the same commit that takes the capstone, and
the substrate this needs was already on disk. Confidence is the spread of `skillShare`
across each arm's 8 disjoint 1,000-row shards — a noise floor computed from data already
held, not an invented statistic.

| arm | between | within | skillShare (log1p) | 8-shard spread | skillShare (raw) |
| --- | --- | --- | --- | --- | --- |
| PRE | 9.9525 | 3.2700 | **0.7527** | 0.7508 – 0.7566 (0.0058) | 0.8436 |
| CONTROL | 9.4908 | 3.3217 | **0.7407** | 0.7372 – 0.7463 (0.0091) | 0.8333 |
| SHIPPED | 9.4141 | 3.2186 | **0.7452** | 0.7417 – 0.7482 (0.0065) | 0.8357 |

**Reading it against the rule written down BEFORE the run.** PROVED required
`skillShare(SHIPPED) > skillShare(CONTROL)` by more than either shard spread, *with*
`skillShare(CONTROL) ≈ skillShare(PRE)`. Neither limb holds: the gap is +0.0045 against
spreads of 0.0065 and 0.0091, and CONTROL − PRE is −0.0119, which is *larger* than the
lever's own effect. **So the dominant fleet-wide effect of N13 is not the skill lever at
all — it is the HAND ITSELF, and it is a variance REDUCER.** `Var[middle of five sorted
d20s]` is roughly a third of `Var[d20]`, so simply routing every check through a hand
compresses per-day outcome noise for everyone; `between` fell 9.95 → 9.49 with skill
switched off entirely. That was not predicted, and it is the sort of thing a control arm
exists to make visible.

**WHERE THE SKILL LEVER DOES SHOW UP: WITHIN ARCHETYPE — which is exactly where standing
amendment 4 told N5 to look.** Re-running the same decomposition over each archetype's
captain slots alone, so `between` is the spread among captains who share a playstyle:

| archetype | n | PRE | CONTROL | SHIPPED | SHIPPED − CONTROL | shards with a positive gap |
| --- | --- | --- | --- | --- | --- | --- |
| explorer | 5 | 0.6464 | 0.6224 | 0.6656 | **+0.0432** | **8/8** |
| fighter | 6 | 0.2198 | 0.2928 | 0.3234 | **+0.0306** | **8/8** |
| veteran | 5 | 0.7531 | 0.7670 | 0.7835 | **+0.0165** | **8/8** |
| smuggler | 4 | 0.7037 | 0.6934 | 0.6970 | +0.0035 | 5/8 |
| trader | 6 | 0.0937 | 0.0835 | 0.0876 | +0.0040 | 5/8 |
| gambler | 4 | 0.3567 | 0.3411 | 0.3419 | +0.0008 | 5/8 |

The gap is positive in **all eight independent 1,000-row shards** for explorer, fighter and
veteran, and is a coin flip (5/8) for smuggler, trader and gambler. **THE SPLIT IS NOT
NOISE AND IT HAS A STRUCTURAL CAUSE, ALREADY WRITTEN DOWN IN CONTENT:** a die can only
matter where the check it feeds has a CONSEQUENCE. Explorers, fighters and veterans fly and
fight, so their days turn on Travel/PILOT, Combat/GUNS and the interdiction stance checks —
all of which pay or cost. The trader's day turns on which contract `pickContract` takes, and
`NPC_CHECK_DCS`'s own comment records that *"the Trade check deliberately carries NO
credit/fuel consequence"*; the gambler's Socialize check is a flat ±150 stake. **This is
N4's verb payout asymmetry — "only Trade pays" — measured from the other side, and it BOUNDS
both N13 and N5.**

**HAND-OF-FIVE ECONOMICS, mean-neutral as calibrated** (day-120 fleet, PRE → CONTROL →
SHIPPED): cast wealth **mean 244,171 → 240,029 → 244,155** (+0.0% net — the mean-neutrality
the pivot was chosen for, held), **median 53,834 → 52,317 → 58,535 (+8.7%)**, p90 675,712 →
673,425. So the median captain got ~12 points richer *attributably* (the control arm is
−2.8%, the shipped arm +8.7%), and the fleet got no richer overall — the skill lever
redistributes rather than mints. Ships lost **615 → 573 (−6.8%)**. The player is essentially
untouched: `tourOneClearRate` 0.5690 → 0.5689, `finalCredits.median` 37,571 → 36,947
(−1.7%), `boardDepth.mean` 3.7773 → 3.7764.

**THE FLOOR STILL HAS NOT MOVED — for the FOURTH consecutive step.** `npcCredits.p10` at day
120 reads **126 → 127**. N10, N11 and now N13 have each left it where it was, and N11 named
the structural reason for its own case (a deed pays no credits). N13's reason is different
and is the archetype table above: the poorest captains are the ones whose verb outcomes a
die cannot reach. **This is the sharpened question N13 hands on**, and it should be read
beside N12's before either is graded.

**HAND EXHAUSTION, measured rather than assumed small.** Five dice against one verb check
plus up to `NPC_ENCOUNTER_MAX_ROUNDS` stance rounds. Over 40 seeds × 120 days (82,393
captain-days that rolled at least one check, 118,606 allocations): **3.09% of rolling
captain-days exhaust the hand and 3.48% of all allocations are served by the documented raw
d20 fallback.** The per-day census is 1 check on 78.5% of days and 7 on 1.9%. The fallback is
exactly the pre-N13 draw, so it can never be worse than what it replaced — but it is a real
3.5%, it is named as boundary 2 at `npcHand.ts`'s definition site, and it is not hidden.

**What shipped, at its call sites** (the "never mark DONE without grepping" rule):
`packages/engine/src/npcHand.ts` — `npcVirtualHand()` built once per captain-day in
`resolveNpcDay`, `allocateVirtualDie()` spent at **both** check sites, `rollNpcCheck`
(the day's verb) and `rollEncounterCheck` (the interdiction stance). The deal is the
player's own `rollDawnHand` at `DAWN_BASE_HAND_SIZE` and the spend is the player's own
`spendDie`; only the PICK is modelled, flagged at the definition site under the marker
`THE ONE SANCTIONED ABSTRACTION` — the same string `npc.ts` already carried, so one grep
finds both. The deal is LAZY, which is load-bearing: an Idle / FlawOverride / broke day
still rolls nothing.

**What was NOT touched, deliberately.** The interceptor's pressure roll and both dice of the
post-kill opposed retreat stay raw `rng.d20()`, because the PLAYER's equivalents are raw too
(`actions/combat.ts`) — parity means matching, not maximising. **OI-9 stays OPEN**: the NPC
refit still spends no die where a player burns one. N13 makes it closable for the first time
(there is now a hand to spend from) and it is not being closed here.

**No save-shape change.** The hand is per-captain-day and never persisted; `NpcState` gains
no field, `CURRENT_SAVE_VERSION` is unmoved, no migration and no round-trip test are owed —
asserted in `npc.test.ts` rather than claimed.

**Discipline, stated so it can be checked.** No fingerprint, band, threshold or golden was
edited to reach a result. The threading was proved inert in its own step first — all four
day-loop golden hashes unmoved, the engine battery green, and the raw sweep shard rows
**byte-identical** to the same sweep at the parent commit. Only then was the deal switched
on, and the goldens were then **REGENERATED** with the committed regenerator (a different
sentence from "edited": `gen-day-loop-golden.ts`, the fixture header's own "deliberate
rebalance" case). The calibration was chosen for mean-neutrality at the roster's measured
median stat and validated on a cheap 100-seed two-arm probe **before** the capstone, not
after a red band. Collateral reds were fixed legitimately: seed re-pins with the sweep
evidence recorded (`recovery.test.ts` 52 → 719, `campaign-reach.test.ts` 1 → 3,
`era-storylet-coverage.test.ts` [4,22] → [8,26]), a sample widened 20 → 100 in
`alliance-arcs.test.ts` — which incidentally showed its "EVERY seed" claim had been false at
HEAD too — and entry-27 re-derivations of the seven `campaign-degraded` policy fingerprints
and the three protocol session goldens, each with its cause named.

**One defect found and filed, not fixed here: F-156-1** (`TASKS.md` T-182). `dice.ts`
`spendDie` rebuilds the hand as `{ dice, spent }` and **drops `rerollsRemaining`**, so the
first die a player spends through `actions/trade.ts` / `travel.ts` / `shipyard.ts` /
`exploration.ts` / `combat.ts` / `storylets.ts` silently destroys the day's crew-granted
re-roll charges. It is a PLAYER-path bug, it is out of N13's scope, and folding its fix into
this commit would have put two rule changes under one capstone and made this very
decomposition unattributable. The written risk analysis is on the task.

---

### N14 — Captain voice: the daily wire boast (EXPERIMENT · owner spec 2026-07-29)

*Added by the owner during the 2026-07-29 audit, out of the question "what per-captain
axis do we NOT have yet?". Framed by the owner as **an experiment that will likely
mutate** — grade it on whether the wire reads better, not on a sweep.*

- **The gap.** The cast has six mechanical axes (`archetype`, `ideal`, `stats`, `flaw`
  + `flawDc`, `bond`, `tier`) and **no voice**. `wireStories.ts` keys its authored lines
  by verb CATEGORY with an `{actor}` placeholder, so all 30 captains speak identically:
  *"Iron Vex turned a legendary profit on a single haul"* reads word-for-word the same as
  *"The Chef turned a legendary profit on a single haul."*
- **NOT PvP messaging, and that is a deliberate exclusion.** `PRD-REIMAGINED.md:231`
  lists *"Multiplayer of any kind"* under non-goals, with the async arena *"parked
  deliberately"* for a future Season. Greetings / threats / victory / retreat lines for
  player-to-player contact are therefore **out of scope**. The Galactic Wire is the live
  player-facing surface that needs voice today; encounter narration becomes the second
  once N3 is actually built.
- **Change (owner spec):**
  - **Three authored boast lines per captain**, voiced individually and informed by that
    captain's name and archetype. 30 × 3 = 90 lines, in `content/` as pure data.
  - **One boast per day reaches the player, not thirty.** The owner's constraint is
    explicit: *"at the player's start, the player should NOT see 30 messages from NPC
    actions, but a top 3 based on actions that day."*
  - **Selection:** rank the day's captains by their actions, take the **top 3** as
    candidates, and emit the boast of the **first candidate not on cooldown**.
  - **Cooldown:** a captain who boasts is barred for **2 days**. This is what the top-3
    candidate list is for — if #1 is cooling down you fall to #2, then #3.
  - **Line rotation:** mark the emitted line used, so a captain's next boast draws a
    fresh one of their three. Together with the cooldown this is what *"makes those three
    text blurbs last a long time."*
- **OPEN — must be pinned before implementation, not drifted into:**
  > [!IMPORTANT]
  > **(a) What does "top 3 based on actions that day" rank ON?** Credits earned that
  > day? Contract value? A nat-20 in the day's check? Deed progress (N11)? The rank
  > function is the whole feature — a boast is only interesting if it is attached to
  > something the player can see the captain actually did.
  >
  > **(b) What happens when all three candidates are on cooldown?** Silence for the day,
  > or fall through to candidate #4+? Silence is cheaper and arguably better texture;
  > falling through guarantees a daily beat. Owner's call.
- **Proves:** the wire reads like 30 people rather than one narrator; a captain's boast
  is recognisably theirs; the 90 lines do not visibly repeat over a 120-day career.
- **Disproves:** the cooldown + rotation still cycles visibly inside one career (90 lines
  is too few), or the boast reads as noise because the rank function attached it to a day
  the player had no stake in.

### N6 — The Honor List becomes a real 31-way board (SHIPPED 2026-07-28)

**Result (2026-07-28): ACCEPTED** — and it measured the field's flatness as a number, which was
the most useful thing it produced. The board is **actor-shaped, not player-shaped**
(`HonorCaptain`, `honorField(game)` building `[player, ...npcs]`, a `rankTitle` that never
touches `game.player.*`), so one scoring path applies the engine's own `effectiveScore` whoever
the captain is and **there is no NPC branch to drift**; no `packages/engine` change was needed,
and **nothing outside `packages/ui` imports UI source**, verified, so that is the complete
affected scope — which is what warrants a scope-limited battery for the next UI change, N3's
`.filter((n) => !n.dead)` included.
Its finding — six of the eight titles uncontestable **by construction**, because
`npcShipForTier` varied only hull, drives and pods — became N2's premise and N2's acceptance
criterion, and N2 discharged it (2 of 8 -> 8 of 8 contested).

**Still binds:**

- **OI-2 — the fifth 1991 behaviour is a SEAM owned by N3, not a delivery.** Four behaviours
  were recovered from the original BASIC (`7ca606d7^:Decompile/Source-Text/SP.TOP.txt`, quoted
  at the definition site): the whole-registry walk, per-component max, co-held ties, and the
  40-character holder-line budget. The fifth — **skip-don't-delete for marked records**
  (`if (left$(na$,1)="*") … next`) — is **not implemented**: `honorField`
  (`packages/ui/src/format.ts:2620`) applies no dead filter, and `NpcState` has no `dead`
  field to read. The code says so in its own words at `format.ts:2611` — *"DEAD CAPTAINS (N3,
  not yet landed — this is the seam, not the feature)"* — and names the exact remedy,
  `.filter((n) => !n.dead)`. **Do not implement it here, and do not ask another step to
  implement it early:** the `dead` field is N3's state shape, and building it ahead of N3 is
  the ahead-of-the-step smuggling this track polices. **N3 owns it.**
- **OI-11 — KNOWN COSMETIC GAP in the holder-line budget, recorded not fixed.** The
  40-character budget counts **one** character per separator (`format.ts:2687`:
  `line += (holders.length > 0 ? 1 : 0) + captain.name.length`), exactly what the BASIC
  counted for its `"/"` join — so **the data-level 1991 parity is exact and the fidelity claim
  stands unqualified.** The UI then renders the separator as `" / "`, three characters, so the
  RENDERED line can exceed 40 visible characters. One surface, no rule depends on it. It is
  filed rather than patched because closing it means deciding whether the budget is a DATA
  rule (keep 1, the divergence moves to the renderer) or a DISPLAY rule (count 3, and 1991
  parity is what bends) — a decision, not a typo.
- **Ties are CO-HELD, not broken.** Any tiebreak available here (roster index, profile tier,
  credits) would be *this file inventing a rule about who is the better captain* — the R2c
  failure mode. Determinism comes from ordering: holders sort by name on a plain code-unit
  compare with **no locale collator**, so the board cannot depend on the machine that rendered
  it. Roster order is deliberately unused, asserted by a test that reverses `game.npcs` and
  requires a byte-identical board — which also means **N3 marking captains dead cannot
  reshuffle the display**.
- **`playerRank` is computed blind to `isPlayer`, to holder order and to the line budget**
  (`1 + captains scoring strictly higher`), so the player can never out-rank someone they
  merely tied. The player is pinned first among co-holders for honesty, not favour: on a
  31-way tie the 40-character budget prints ~3 of 31 names.
- **One documented divergence from foundation** (BALANCE-POLICY Part B rule 3): 1991 credited
  the **ship** (`nz$`); this board credits the **captain**, because Rimward's wire, dossier,
  Hangout and grudges all name the captain. Scoring, ties and budget untouched.
- **PROCESS: parallel agents need isolated worktrees.** N6 and N9 were run in parallel in one
  shared working tree, so N6's full-suite and `balance:smoke` runs were contaminated by N9's
  half-finished edits. The UI work itself was isolated and unaffected; the fix is cheap and it
  cost real confidence.
- **Out of scope, reported not fixed, and MEASURED ON THE CONTAMINATED TREE:** three shipped
  policies allegedly never buy a component upgrade in 120 days (`trader` ending at 3,000cr on
  the untouched day-1 junker, `veteran` at 1,085cr, only `smuggler` upgrading drives 10 -> 30).
  That reading is hard to reconcile with the baseline's 80,305cr median trader, which is
  itself a reason to distrust it. **Re-measure on a clean tree before acting.**

*Full record: `git show 433ffce3 -- docs/BALANCE-REDESIGN-WORKLIST.md`*

### N7 — The measurement rig: capstone sweep + staged smoke tests (SHIPPED 2026-07-28)

**Result (2026-07-28): ACCEPTED.** The loop the owner designed — capstone sweep -> differ ->
checkpoint extraction -> fast staged smoke tiers — ships as `npm run balance:diff` /
`balance:extract` / `balance:smoke` plus `--milestone-days` on the sweep, with 94 new tests
(71 smoke + 23 rig guards). **A full sweep is only warranted as a capstone after a series of
green smoke tests.** It immediately found that the instrument had never played three of the
game's eleven actions (see N9).

**Still binds:**

- **SUPERSEDED IN MECHANISM BY N7-FP (2026-07-29 · `b7b52116`), audit item OI-3.** N7 shipped
  the fingerprint as a hash over **raw file bytes**, and explicitly refused comment-stripping
  on the grounds that "a parser that mis-parses fails silently, in the one direction this
  whole design exists to prevent." That is no longer HEAD: `rulesFingerprint` is now taken
  over the TypeScript printer's re-emission with comments stripped, and the raw-byte hash
  survives demoted as `docsFingerprint`. **The refused warning was RIGHT and was honoured, not
  discarded** — the silent-mis-parse hole was real, was filed as **OI-7**, and is closed by a
  hard `parseDiagnostics` assertion. See **N7-FP** and **N7-RIG**.
- **The fixture contract.** Fixtures live in `docs/balance/smoke/` (see its README) and every
  one records `productVersion`, `saveSchemaVersion`, a `rulesFingerprint` and its sweep
  provenance. **A stale fixture fails loudly and is never silently used** — there is no
  `--force`, no env override, no auto-refresh, and a rig test asserts that checking a stale
  fixture leaves the file on disk untouched. Staleness was verified independently by moving
  the hash and watching every tier fail in `beforeAll`, so **the 64 tier assertions did not
  run at all** — nothing can report green about a game that no longer exists.
- **Two fingerprints, not one.** `rulesFingerprint` covers `packages/content/src` + the
  engine's rule modules; **`packages/sim` is deliberately OUT of it and into a separate
  `instrumentFingerprint`** — the sim is the thermometer, not the weather, so folding it in
  would assert "the ruleset changed" every time a policy was tuned. `save.ts`/`schema.ts` are
  excluded because persistence is versioned by `saveSchemaVersion` (safe only on the N1
  precedent, where `MIGRATIONS[9]` *calls* `npcShipForTier`); `types.ts` and `clone.ts` are
  IN, on the N1 and N0 precedents. **The classification is total and reviewer-checkable:**
  three tests enumerate `packages/{engine,content,sim}/src` and fail on any `.ts` that is
  neither hashed nor named in the exclusion map with a reason, **so a new engine module cannot
  land unclassified.** *Read that totality claim alongside N7-RIG: it was true for FILES
  inside declared directories and silently untrue for DIRECTORIES until OI-6 landed, and it is
  still untrue for a whole new hashed ROOT.*
- **THE HONEST CAVEAT, enforced structurally rather than documented.** You cannot start a
  career at day 21 without simulating days 1–20, so mid-game tiers use SYNTHESIZED states, and
  **a synthesized run must never be used to grade balance.** `runCampaign`'s only door to a
  mid-game start stamps `syntheticStart: true`, `summarizeReport` carries the stamp to the
  `SeedRow`, and `aggregateRows` **throws** on any synthetic row, naming seed and policy.
  Since a `BaselineAggregate` is the artefact every balance number in this document comes
  from, a synthesized run cannot become a balance number by any route. Filtering was
  considered and rejected: a silent drop turns *"you measured something you may not measure"*
  into *"your sample was smaller than you thought"*. **Smoke tests catch regressions; the
  capstone sweep remains the only authority on numbers.**
- **What the smoke suite MISSES, stated because a breakage detector that oversells its
  coverage is the failure mode here.** *Ship loss and succession: zero coverage* — at 0.57
  deaths/1,000 days, 672 sim-days expects 0.38 deaths, so no seconds-scale tier can cover the
  death path. *A synthesized captain has an empty deed registry and LIEUTENANT rank*, so
  deed-gated storylets, rank-driven `player.tier` and the progression spine are untested in
  the three mid-game tiers (fabricating deeds would be authoring content inside a fixture).
  *The spread is rank-coupled marginals, not joint samples*, so the `max` slot holds 83,701
  credits **and** 25,000 debt. *The recorded-outcome half only catches drift while the rules
  hold still* — which is why the **invariants** are a separate half, including a per-tier "not
  measuring a stalled field" check so the goldens cannot quietly become tautologies.
- **The `days-29-31` tier is declared per tier, not inferred from the day window.** `day.ts`
  forks the career at `day === player.debtDueDay` (30) into cleared/unpaid, and the unpaid
  branch sets `guild.debt-flagged`, which re-prices every board and encounter thereafter:
  **56/56 runs resolve Tour One on that tier, 0/56 on each of the other three.** If
  `debtDueDay` moves, the assertion fails and is re-decided instead of silently re-deriving.
- **Every capstone harvests real milestone samples to replace the estimated spreads**, so the
  fixtures get truer with each capstone. The shipped fixture is `spreadSource: "harvested"`;
  the `estimatedSpread` fallback was verified and correctly reports `spreadSource:
  "estimated"` with a re-run note. `--milestone-days` is proven non-invasive: 0 numeric
  changes, 0 value changes, 3,699 shape changes — all of them added `milestones[…]` paths.
- **Reading a differ report: `label` is the sole deliberate ignore, and the report names what
  it ignored.** Keying `topRoutes` by route id once produced 192 phantom "shape changes" — a
  route dropping out of the top five is a value change, not a schema difference. Check the
  shape/value split before believing a moved row.
- **Baseline of record UNCHANGED at this step** (`baseline-r2c-final.json`); the harvest
  capstone was numerically identical to `baseline-n1.json` and was deliberately left
  uncommitted in `.scratch/`, because **writing a `baseline-*.json` into `docs/balance/` reads
  as a re-pin, and a re-pin is a decision, not a side effect.**

*Full record: `git show 433ffce3 -- docs/BALANCE-REDESIGN-WORKLIST.md`*

### N7-FP — The rules fingerprint hashes code, not bytes (SHIPPED 2026-07-29)

**This is not a graded N-series step** — no hypothesis, no sweep, no verdict, no re-pin. It is
a defect and its fix, recorded beside N7-RIG because both change *the instrument that decides
whether a fixture still describes HEAD*. `rules-fingerprint.ts` used to hash raw file text, so
editing a COMMENT in any rule source moved `rulesFingerprint` and declared every balance
fixture stale — answering *"this is a different game"* when the truth was *"same game, better
sentence"*, and taxing exactly the definition-site commentary BALANCE-POLICY Part B rule 3
requires. **The fix (option C of three considered):** comments are now stripped before hashing
**using the TypeScript parser rather than a regex** (`//` and `/* */` occur inside string
literals here, so text-stripping would corrupt real code), and the re-print also normalises
quote style, so a Prettier pass cannot move a rules fingerprint either.

**Still binds:**

- **The raw-byte hash is NOT deleted, it is demoted.** It survives as `docsFingerprint`,
  recorded in fixture provenance and reported when it moves, but **never a
  `FreshnessProblem`** — a commentary change is worth dating, not worth failing.
  `fixtureFreshness` never reads it; its only reader, `fixtureDocsDrift`, returns
  `string | null`.
- **ACCEPTED COST: treat a `typescript` MAJOR bump as a re-stamp event.** The printer's output
  can shift across TypeScript major versions, moving every fingerprint at once on a dependency
  bump — loud, one-time, obviously attributable, remedied by the same re-stamp. This trades a
  rare loud false positive for a frequent quiet one.
- **What holds it honest, and only the pair is meaningful.** `balance-rig.test.ts` pins BOTH
  directions against a synthetic tree (a comment edit does NOT move `rulesFingerprint`; a
  `140000 -> 130000` edit in the same file DOES), plus a guard that a string literal containing
  comment markers is still hashed as code, and two tests that docs drift stays informational.
  Comment-insensitivity alone is satisfied by a hash that ignores everything.
- **Changing the hash ALGORITHM is not a re-measure.** Both fingerprints moved, so the fixture
  was re-extracted from the unchanged baseline of record — no rule changed, no new capstone
  committed. Stated because *"re-stamped without re-measuring"* is exactly the move
  `docs/VERSIONING.md` forbids doing silently.
- **OI-4 — how to quote a battery total in this document.** This entry originally read "1,233
  passing", N2's figure copied forward; `b7b52116`'s own commit message says **1,239** and the
  audit re-measured 1,239 at that HEAD. Root `npm test` is
  `npm run test --workspaces --if-present`, and **exactly four workspaces have a `test`
  script** — desktop 102, engine 725, sim 277, ui 135 at `b7b52116`. `packages/content` has no
  test script at all (only `build`), so a "content 102" arm in any note is `packages/desktop`
  mislabelled. *Post-remediation the battery stands at **1,262 passing / 0 failing** — sim
  **300**; the +23 is the OI-6 / OI-6b / OI-7 rig tests recorded in N7-RIG below.*

*Full record: `git show 433ffce3 -- docs/BALANCE-REDESIGN-WORKLIST.md`*

### N7-RIG — Two blind spots in the fingerprint, closed by audit (REMEDIATION · 2026-07-29)

**This is not a graded N-series step** — no hypothesis, no sweep, no verdict, no re-pin. It
is remediation of three items (**OI-6**, **OI-6b**, **OI-7**) from the 2026-07-29 doc-vs-code
audit: five verification passes over every step marked SHIPPED, which raised **13 items
(OI-1 … OI-12 plus OI-6b), all closed the same day**. The audit's own working file was never
committed — **this document is the whole record**, and every item is traceable by grepping its
OI-number: `OI-1`/`OI-5` under N1/N2, `OI-2` under N6 and N3, `OI-3` under N7 and standing
amendment 3, `OI-4` under N7-FP, `OI-6`/`OI-6b`/`OI-7` here, `OI-8` under N3, `OI-9` under N2
and THE PARITY LEDGER, `OI-10` in the track preamble, `OI-11` under N6, `OI-12` under N8.
Where an item stayed open by decision it is filed under the step that owns it. **Nothing was
re-stamped and nothing was owed** — both fingerprints unmoved, and the stamped
`docsFingerprint` reproduced exactly against a pristine `git archive HEAD` tree, so the
working-tree drift was 100% attributable to OI-1's comment rewrite in `npc.ts`.

**Still binds** (all in `packages/sim/src/balance/rules-fingerprint.ts`, deliberately without
the line citations the full record carries — they rot):

- **OI-6 — every directory under a hashed root is a decision on record.** The walk read only
  the declared directories, so `packages/engine/src/rules/` would have been invisible to the
  hash **and** to the enumeration tests that exist to make the classification total. The guard
  **fails rather than auto-recursing**, deliberately: auto-recursion would let a whole subtree
  join the fingerprint with nobody having decided it should. It lives in the PRODUCTION MODULE
  rather than a test, and that is load-bearing — `checkpoints.ts` and `smoke-extract.ts` stamp
  fixtures from the command line, and a vitest-only guard cannot reach a CLI stamp.
- **SHARP BUT INTENTIONAL, and a future step will hit this:** an empty, `.d.ts`-only or
  asset-only directory THROWS, and it hard-fails `smoke-extract` at the CLI rather than only in
  a test. Adding e.g. `packages/content/src/data/*.json` will stop a fixture extraction dead
  until someone declares the directory. Conservative-safe and consistent with the module's
  doctrine, but a real cost; the remedy is one line in `HASHED_ROOT_IGNORED_DIRECTORIES` or in
  the declared set.
- **OI-6b — the four symlink rules, settled.** `readdirSync(withFileTypes)` types a symlink by
  ITSELF, not its target, so a symlinked directory slipped both the guard and the walk. Every
  entry is now classified ONCE via `statSync` — which FOLLOWS the link where `lstatSync` would
  not, and that is the entire reason for choosing it. (1) A symlinked *directory* trips the
  guard and escapes it exactly as a real one does. (2) A symlinked `.ts` file is HASHED —
  `readFileSync` follows the link, so it is real rule code deciding real outcomes. (3) The
  repo-relative path IN THIS TREE enters the manifest, not the target's, because a fingerprint
  describes this tree. (4) A dangling or non-regular link fails loudly with a named
  `UNRESOLVABLE SYMLINK` message rather than letting a bare `ENOENT` escape from inside a
  fixture stamp.
- **OI-7 — a file TypeScript cannot parse used to hash silently.** `ts.createSourceFile` does
  not throw on bad syntax: it RECOVERS, and the printer prints the recovered tree
  (`export const A = (` prints as `export const A = ();`). Two different broken states can
  recover to the same tree — **a fingerprint collision between rulesets that are not the same
  ruleset.** `assertParseClean` now fails with the file, line:column and the parser's own
  message before anything is hashed. An assertion rather than a documented mitigation for the
  same reason as OI-6: `tsc -b` runs in the battery, not before `smoke-extract` stamps a
  fixture. **Its own failure mode is covered** — if `parseDiagnostics` ever stops being
  readable (a TypeScript upgrade renaming that `@internal` field) it throws rather than
  silently stopping checking.
- **ONE HOLE OF THE SAME CLASS IS STILL OPEN — recorded, not closed.** The guard catches a new
  *subdirectory* under a hashed root. A whole new hashed **root** — a new package, say
  `packages/economy/src` — is caught by nothing: it would never be walked, and every
  enumeration test would pass while describing a game that had grown a limb. Closing it needs a
  different mechanism (the workspace list is what would have to be totality-checked, not a
  directory listing). **It belongs to whichever step first adds a package** — that step must
  either declare the new root here or record why it holds no rule code.

*Full record — the per-item line citations, the hashed-corpus pin, test counts and fingerprint
values: `git show a9cffd85 -- docs/NPC_REDESIGN.md`.*


### N9 — The instrument has never played three of the eleven actions (SHIPPED 2026-07-28 · `55233e15`)

> **Found by N7, 2026-07-28. Sequenced BEFORE N8** — N-IDs are labels, not an order
> (`docs/VERSIONING.md` §4).

**Result (2026-07-28): HYPOTHESIS REJECTED — but the code SHIPPED and was retained**, which is
the case standing amendment 1's refinement was written for: it moved **7 of 8 policy rows** —
`greedy`, the untouched control, is the eighth and is byte-identical. `packages/sim` emitted
`Crew`, `Port` and `Reroll` **zero** times, so no standing policy's economy had ever included
port income, crew dice or a rerolled hand; all three now fire, priced through engine/content
functions throughout (`planReroll` on the sharpest unspent die below `expectedFreshDieFace`;
`planCaptainOverhead` arbitrating **one** die-costed purchase per day — berth -> crew -> port
— on the dullest remaining die, queued last so income actions are never displaced). The
direction was wrong: fleet final credits **50,448 -> 31,205 (−38.1%)** with Tour One
essentially frozen (≤0.3% on every clear rate) and `encountersPerRun` 24.33 -> 24.37 — **the
extra deaths are a thinner purse, not more fights**. `player.crew.length` was **0 at every
percentile** across 8,000 careers at days 21/29/41; it is now **median 2 / p75 3 at day 41** —
the post-state N13 has to grade a hand-bearing cast against.

**Still binds:**

- **Per-verb attribution, four capstones at 1,000 seeds × 120 days** — N12 reads the port
  figure: **Port only** 39,193cr (**−22.3%**, ships +0.5%), **Crew + berths only** 37,888
  (−24.9%, ships +10.9%), **+ Reroll** a further −0.2%, all three shipped 31,205 (−38.1%,
  ships +13.3%).
- **Why the three verbs are ONE change, and why they had never fired.** `rerollsRemaining` is
  seeded only from `dawnDiceModifiers`, whose only live source is the crew roster; crew is
  gated by `crewCapacity = 1 + floor(cabin.strength/10)`, so the junker berths exactly **one**
  and a full three-role roster needs cabin tier 2. **Nothing could have fired them** — the
  blind spot was structural, not an oversight in any one policy. Their named readers, for the
  steps that follow: **`Crew`** is T-1306's dice-progression source, read by `dice.ts`
  `dawnDiceModifiers`; **`Port`** is T-1307's dusk income, read by `port.ts` `portDuskIncome`.
- **Every balance number in this document was produced by that instrument — but this is not a
  blanket invalidation, and the carve-out is on record.** R2d's port re-pricing measured
  *affordability* against the real field and re-ran its reach probe with appended buy actions,
  **so it is not invalidated**. What IS scoped by the blind spot are the numbers the aggregate
  produced: the fleet's income ceiling, its dice distribution and its clear-day medians were
  all measured on a strictly narrower game than the one that ships.

- **THE FINDING THAT OUTRANKS THE VERDICT — the instrument measures CASH, not NET WORTH.**
  `finalCredits` cannot see an asset. The trader's ~13,500cr of port spend is still on its
  balance sheet yielding 65–290/dusk in perpetuity, and the aggregate scores it as a 100% loss.
  So *"the fleet got poorer"* is unambiguously true only of the **crew** arm (wages, ~15,100
  out and ~1,500 back — a genuine operating loss); the **port** arm is balance-sheet conversion
  the instrument structurally cannot read. **`sampleMilestone` records `crew` but not `ports`,
  so port ownership is invisible to every aggregate this project produces.** Same class as R0a
  and R2a. **This must be fixed before N8 re-pins** — the milestone half is now N12's first
  task, the net-worth question stays with N8.
- **The marker HOLD, not a hard block — a judgment call made, reversed, and documented at the
  site.** The overhead first shipped *without* a marker gate, on the argument that crew is a
  throughput purchase. A full capstone refuted it — trader clear 0.916 -> 0.759 and clear day
  21 -> 25, smuggler 0.535 -> 0.210 and day 30 -> 44, fleet ships 571 -> 816 — and the premise
  failed on its own terms: a trader's day is a two-run plan capped at five dice, so the sixth
  die a First Officer grants buys no extra contract. It was restored as a **hold**
  (`spendable` subtracts the outstanding marker) rather than a hard block, **because a hard
  block silences all three verbs for the explorer (clears 0.00) and veteran (0.001) *forever*,
  re-creating the very blind spot this step removes.**
- **Reading `greedy` as a control.** It is untouched here and its row is byte-identical — but
  *the differ reports `greedy` under MOVED when the arm carries `--milestone-days`*, because
  the added `milestones[…]` paths are a shape change. Strip that key and the values are equal.
  **Check the shape/value split before reading a control as broken.**
- **The reroll is arithmetically marginal, not badly played.** Played strictly +EV it can only
  fire when the *sharpest* die is already below the fresh expectation, and
  `P(max of 5d20 < 11) = 0.5⁵ ≈ 3.1%` — verified independently. A career sees ~1.2 charges
  worth ~2 pips: −0.2% credits, +1.7% ships, both inside noise. **The verb is now exercised; it
  is not a lever.** Zero crew walkouts in 280 careers.
- **Out of scope, reported not fixed.** (1) N7's fingerprint over-sensitivity cost **three
  re-runs in one step** here, which is the evidence N7-FP was granted on; closed by N7-FP.
  (2) **The extra-die crew role is near-worthless to trader-shaped policies by construction**:
  their day is a fixed two-run plan capped at five dice, so a sixth die has no queued use. If
  the First Officer is meant to be the strongest hire, something needs a use for the die.
  (3) **Ports are unreachable for two archetypes structurally** — under the marker hold the
  explorer (clears 0.00) and veteran (0.001) never accumulate surplus above debt, so any
  fleet-wide port-ownership criterion is measured on five policies, not seven.
- **Provenance pointers.** Baseline re-pinned to `docs/balance/baseline-n9-shipped.json` (the
  refinement in standing amendment 1); `campaign-degraded` fingerprints re-pinned deliberately
  with **logged entry #5** (trader `467a83d4->2e4f1623`, fighter `b6ef1dc0->620348f8`, explorer
  `90d35d3c->6f4d8c17`, smuggler `b480fc6f->49d98c00`, gambler `de62c310->29fc3a0c`), **greedy
  and veteran unchanged**. `rulesFingerprint` unchanged at `76ac9179…` — the proof no
  engine/content rule moved — while `instrumentFingerprint` moved `34453d51…->37f920ed…` and
  the smoke fixture was re-extracted. **The `balance-targets` tripwire did NOT fire:** trader
  clear day 21 -> 21 at 1,000 seeds, so it still fails its assertion and still passes as
  `it.fails`.
- **Corroborating measurement still cited elsewhere:** at day 41 across 8,000 careers
  `playerShipRating` median AND p75 are both **1** (≥75% of careers never buy a combat
  component) and `playerCargoPods` runs **min 10 / max 11** against a starting 10 — cargo pods
  are effectively never bought, which is why R10 stayed invisible for the whole project.

*Full record: `git show 433ffce3 -- docs/BALANCE-REDESIGN-WORKLIST.md`*

### N8 — Re-pin the baseline against a living field

- Everything above changes the world the player trades in — captains claiming contracts,
  buying ships, dying. **Every balance number in this document moves.** Re-pin at 1,000
  seeds (the R0b standing amendment) and re-read the R-series conclusions against it,
  especially R2.5, whose escalation ladder was designed against a field that took no risk.
- **FIRST TASK — teach the aggregate to see an asset, before re-pinning anything.** N9
  found that `sampleMilestone` records `crew` but not `ports`, so **port ownership is
  invisible to every aggregate this project produces** and `finalCredits` scores a bought
  port as a 100% loss. The policies now buy ports (N9), so re-pinning first would bake a
  blind spot on a live asset class into the yardstick every R-series conclusion is
  re-read against. Same class as R0a and R2a, and both of those had to precede the work
  they graded. A `ports: state.player.ports.length` on the milestone is the minimum;
  consider whether the fleet needs a net-worth figure alongside the cash one, since
  **"the fleet got poorer" is currently unfalsifiable for any purchase of an asset.**
  *2026-07-29: the milestone half of this task is pulled forward into N12's first task
  (the cast starts buying ports there and the sweep must see it); the net-worth question
  stays here.*
- **SECOND PRECONDITION — N10, N11 and N12 land first (owner ruling 2026-07-29, THE
  PARITY LEDGER).** A "living field" whose captains cannot work the contract board, hold
  a rank, or own a port is not the field the player actually ships against. Re-pinning
  before those verbs exist would bake three known absences into the yardstick every
  R-series conclusion is re-read against — the same class of mistake this step's first
  task exists to prevent. **RULING PRECONDITION DISCHARGED (owner, 2026-07-30):** Explore
  and Storylet are recorded EXCLUSIONS and VisitHangout a recorded PARTIAL, so every
  exclusion is now a decision on record and N8's remaining wait is on N12 alone (N10 and
  N11 have landed).
- **The post-N9 re-pin is DONE** — `baseline-n9-shipped.json`, taken fresh at HEAD. N8
  re-pins again on top of the living field; it no longer has to unpick N9.
  *(2026-07-29, doc audit item **OI-12**: this bullet named `baseline-n9-shipped.json` as
  the baseline OF RECORD, which was true when it was written and is now stale by two
  re-pins — N2 and then R2c-follow-up. The current baseline of record is
  `docs/balance/baseline-r2c-explorer-remit.json`, which is what **standing amendment 1**
  names and what `packages/sim/src/__tests__/balance-targets.test.ts:103` reads at runtime.
  **The amendment is authoritative; read it before diffing anything.** The N9 re-pin itself
  genuinely happened and its rule refinement is the reason amendment 1 reads the way it
  does, so it is left on the record here rather than overwritten.)*

---

## The sweep command and the standing discipline (moved with the track, 2026-07-29)

**The sweep command.** 1,000 seeds since R0b — see that step (in the worklist) for why 100 cannot grade this.
Eight shards run in ~2.5 min on a 10-core box; the fleet now includes `trader-degraded` as a
second lens (a fix should hold up for the sloppy pilot too).

```sh
# ×8, one per shard
npm run balance:sweep -w @spacerquest/sim -- --label <label> --seeds 1000 --days 120 \
  --milestone-days 21,29,30,41,60,120 \
  --policies trader,trader-degraded,fighter,explorer,veteran,smuggler,gambler,greedy --shard i/8
npm run balance:sweep -w @spacerquest/sim -- --label <label> --merge

# THEN re-extract the smoke fixture FROM THE CAPSTONE YOU JUST WROTE — not bare.
npm run balance:extract -w @spacerquest/sim -- --aggregate docs/balance/baseline-<label>.json
```

> **BOTH FLAGS ARE LOAD-BEARING, and this block omitted both until 2026-07-29.**
> Copy-pasting the old version cost a re-run in the R2c-follow-up step, twice:
> - **No `--milestone-days`** and the capstone carries no milestone samples, so it is
>   ~7,400 fields SHORT of its predecessor. `balance:diff` reports those as removed
>   paths, which is easy to mistake for diff noise and filter away — that is exactly
>   how it got missed the first time.
> - **A bare `balance:extract`** defaults to `--aggregate docs/balance/baseline-n1.json`,
>   which has no milestones — so it silently rewrites the fixture with
>   `spreadSource: "estimated"` and downgrades a `"harvested"` one. The extractor
>   prints which it did (`spreads harvested` vs `spreads estimated`); read that line.
>   The fixture's own `provenance.spreadSource` is the durable record.

## Sequencing at a glance

```
DONE: R1 ──► R0a ──► R0b ──► R2 ──► R2c ──► R2d ──► N0

NPC PARITY TRACK (in progress — the R-series is PAUSED behind it, see below):
  N0 (copy-on-write) ......................... DONE
   └─► N1 (NPCs own a real ship) ............. DONE  (change accepted, hypothesis disproved)
        ├─► N7 (capstone diff + smoke rig) ... DONE  (accepted; 1.5 s smoke, 2 min capstone)
        │    └─► N9 (the instrument's three unplayed actions) ... DONE  (rejected; found the cash-vs-net-worth gap)
        ├─► N6 (Honor List, 31-way board) ... DONE  (accepted; 6/8 titles frozen until N2)
        └─► N2 (NPCs upgrade + shipyard actor param + ramp re-seed) ... DONE  (accepted)
             └─► N3 (NPCs meet pirates + answer them) ... DONE  (accepted on behaviour;
                  |                                        capstone shared with N4)
                  └─► N4 (archetypes) .......................... DONE  (accepted)
                       └─► N10 (NPCs work the contract board) ... DONE  (change accepted,
                            |                                     hypothesis disproved — the
                            |                                     board is not where the
                            |                                     non-trader floor gets fixed)
                            └─► N11 (NPCs earn deeds + Renown) .. DONE  (change accepted,
                                 |                                hypothesis held; both
                                 |                                Disproves limbs survived —
                                 |                                but a deed pays no credits,
                                 |                                so the floor is still flat)
                                 └─► N12 (NPCs buy ports; the aggregate
                                      learns to see assets FIRST) MUST-HAVE, before N8 ◄── NEXT
                                      └─► N13 (NPC decision surface:
                                           dawn-hand parity) .... MUST-HAVE, gates N5
                                           └─► N5 (proficiency spread)
                                                └─► N8 (re-pin against a living field)
                                                     ▲ N9 MUST LAND FIRST — done
                                                     ▲ N10, N11 done · N12 OUTSTANDING
                                                     ▲ ledger verbs RULED 2026-07-30

WHY N4 SITS BEFORE N10 (owner ruling 2026-07-29, and it is load-bearing rather than
tidy): N10's archetype-driven `pickContract` reads `profile.archetype`, so the field
has to exist — and be measurably distinct — before the board step can key off it. N4
also had to precede the shared N3+N4 capstone, since both move the same hashed rule
sources.

WHY N9 GATES N8: N8 re-pins the baseline that every R-series conclusion gets re-read
against. The instrument that would produce it has never emitted Crew, Port or Reroll
(N7's finding), so re-pinning first would bake a known blind spot into the yardstick.
Same class as R0a/R2a, and both of those had to precede the steps they graded.

WHY N7 MOVED (owner decision 2026-07-28): the doc originally ran it after N4/N5. Every
step from N2 on is graded by diffing a sweep, and at full NPC fidelity that capstone is
projected at ~80 min — unusable as an iteration loop. N7's fingerprinted smoke fixtures
turn it into a seconds-long check, so building it SECOND gives N2–N6 a real fast gate
instead of grading them on faith. N1 first regardless: N7's checkpoints need a world
with ships in it to harvest from.

THEN the R-series resumes, re-read against N8's baseline:
  R2.5 (escalation ladder + demand menu) ──► R4 (predation) ──► R5b (smuggler tariff)

WHY THE PAUSE: R2.5's ladder was designed against a field that takes no risk and never
upgrades. Landing it before N8 would tune the player's world against captains who are
not in it.
R3 (explorer)  — CLOSED 2026-07-29 by the R2c-follow-up (clear rate 0.00 -> 0.777)
R6 (instrument) — any time, goldens-identical
R5a (fighter deeds) — after R2 lands
R7 — ABSORBED into R2.5.  R8/R9 — opportunistic
```

One change per step. One sweep per change. Re-pin the baseline only on an accepted
hypothesis, and append the result under the step before moving on.

**Two standing amendments from the R1/bake-off work (2026-07-28) — since grown to four — binding on
every step in this document and, on resumption, every R step in `BALANCE-REDESIGN-WORKLIST.md`:**

1. **Grade at 1,000 seeds × 120 days, not 100 — DONE (R0b).** The 100-seed arm cannot resolve
   the clear-day target to the ±1 day the [22, 30] band is graded at, and its "0 ships / 0
   cargo" headline was a sampling artifact (19 ships and 17 routes at n=1,000). **Corollary
   for every future step: never report a rate as 0.00 off a small arm — report `< 1/n`, or
   re-run bigger.**
   > **Baseline of record is `docs/balance/baseline-t208-quest-captain-ports.json`** (1,000
   > seeds × 120 days × 8 policies = 8,000 runs, re-pinned at T-208 2026-08-05 — the M19
   > milestone closer, giving the 11 `QUEST_PROFILES` captains a DECLARED HOME PORT
   > (`NpcProfile.homePortSystemId`) in place of the arbitrary `(index % 20) + 1` seed that
   > had frozen six of them at rim systems with no Cantina for an entire career.
   > `rulesFingerprint` moves `cbb087860825aa35` → `2f93098dc9ab15f0`;
   > `instrumentFingerprint` does NOT (unmoved at `5c230e99648cddee`), so the attribution is
   > single-arm. SIX OF TEN ROWS MOVED — fleet, explorer, gambler, greedy, smuggler, veteran;
   > fighter, trader and trader-degraded byte-identical — PREDICTED IN WRITING BEFORE THE RUN
   > (`TASKS.md` T-208) with the channel named: `resolveVisitHangout` seats a co-located Dare
   > dealer with no `isSimulatedCaptain` filter, and the bond hook requires co-location.
   > Movement is small in every headline (fleet `tourOneClearRate` 0.6329 → 0.6348). Gate
   > PASS, 0 invariant violations, nothing tuned in response. `CURRENT_SAVE_VERSION` moves
   > 16 → 17 with `MIGRATIONS[16]`, which re-seeds a carried save's quest captains through the
   > same rule the two loader paths read.
   > Before that: **`docs/balance/baseline-t206-captain-voice.json`** (1,000
   > seeds × 120 days × 8 policies = 8,000 runs, re-pinned at T-206 2026-08-05 — a
   > CONTENT-ONLY capstone shipping the cast's authored VOICE: `tableTalk` and the four
   > `catchphrases` slots for the 27 captains T-205 left on its `VOICE_AUTHORING_PENDING`
   > worklist, which T-206 deletes along with the branch that read it, so voice is now
   > required of all 30 `NPC_PROFILES` unconditionally. `rulesFingerprint` moves
   > `5ae9a5d473827024` → `cbb087860825aa35` (content is hashed wholesale, so authored prose
   > moves it even with no reader until T-207); `instrumentFingerprint` does NOT (unmoved at
   > `5c230e99648cddee`). **EVERY POLICY ROW IS BYTE-IDENTICAL** — `balance:diff` reported
   > "NOTHING MOVED. Every compared field is equal on both sides" — PREDICTED IN WRITING
   > BEFORE THE RUN (`TASKS.md` T-206), where a moved row was pre-committed as a finding to
   > escalate rather than something to re-baseline around. Gate PASS, 0 invariant violations.
   > `CURRENT_SAVE_VERSION` unmoved at 16 (re-read live at `packages/engine/src/save.ts:562`);
   > no persisted shape changed, so no migration is owed.
   > Before that: **`docs/balance/baseline-t204-cantina-rename.json`** (1,000
   > seeds × 120 days × 8 policies = 8,000 runs, re-pinned at T-204 2026-08-05 — a
   > TEXT-ONLY capstone shipping the player-facing "Hangout" → "Cantina" rename (prose string
   > values only; no rule, DC, band, threshold or code path changed). `rulesFingerprint` moves
   > `f33b6af1ee21dffa` → `5ae9a5d473827024` (content is hashed wholesale, so authored prose
   > moves it); `instrumentFingerprint` does NOT (unmoved at `5c230e99648cddee`).
   > **EVERY POLICY ROW IS BYTE-IDENTICAL** — `balance:diff` reported "NOTHING MOVED. Every
   > compared field is equal on both sides" — which was PREDICTED IN WRITING BEFORE THE RUN
   > (`TASKS.md` T-202) and is an INSTRUMENT-GAP NULL RESULT, not a verdict that the new
   > ceiling is balanced: the sim's gambler is the only policy that plans a Dare and it is
   > bounded by `GAMBLER_MAX_DARES_PER_DAY = 2`, below the ruled ceiling, so it plays
   > `1,2,2,2,2,2` hands by tier under BOTH tables. See F-202-1. Gate PASS, 0 invariant
   > violations. Fleet `tourOneClearRate` 0.6329, median final credits 49,839, ships lost 492,
   > encounters/run 22.2482 — all unmoved.
   > Before that: **`docs/balance/baseline-t197-hangout-caps.json`** (1,000 seeds
   > × 120 days × 8 policies = 8,000 runs, re-pinned at T-197 2026-08-05 — the M17
   > MILESTONE CLOSER: all seven Hangout venues went free and two daily caps replaced the
   > die (`docs/DAWN-HAND-REDESIGN.md` §3/§4a/§4b). **Both fingerprints move**, so unlike
   > the T-196a/T-196b pair this is not a clean single-arm attribution — stated in the
   > predictions BEFORE the merge ran, not discovered after. PREDICTED AND HELD: the
   > `gambler` is the largest mover and its credits rise (median 81,667 → 82,965) on the
   > freed best die; `hangoutPlay.failedVisits` stays 0 on every row (4,445 visits at the
   > capstone horizon), which is the mechanical proof both cap mirrors are right. PREDICTED
   > AND CONTRADICTED: the smuggler and trader were predicted to BOTH move over a 120-day
   > horizon; `trader` came back byte-identical and `trader-degraded` moved instead.
   > Fleet `tourOneClearRate` 0.6342 → 0.6329, median final credits UNMOVED at 49,839,
   > ships lost 487 → 492. The fighter row is byte-identical — see the status banner for why
   > that is a NULL RESULT about the instrument rather than a verdict on the pool.
   > Before that: **`docs/balance/baseline-t196b-instruments.json`** (1,000 seeds
   > × 120 days × 8 policies = 8,000 runs, re-pinned at T-196b 2026-08-05 — the M17 arm-2
   > capstone: the eight sim policies and the protocol enumerator stopped treating the nine
   > freed action types as die spends (`docs/DAWN-HAND-REDESIGN.md` §3), so the ruleset is
   > unmoved and only `instrumentFingerprint` changes. PREDICTED BEFORE THE RUN (TASKS.md
   > T-196b) and held: NPC-side rows near-still
   > (`npcSpecialEquipmentPurchasesPerRun` −0.1%), and the BREADTH prediction — seven of
   > eight policy rows move against arm 1's two, with `greedy` the named control that does
   > not. (That prediction's headline read "all eight"; its own pre-registered
   > counter-evidence named `greedy`, so seven is the number it was reaching for and the
   > number that landed. Corrected in TASKS.md T-196b rather than rewritten in place.)
   > Fleet `tourOneClearRate` 0.6305 → 0.6342, median final credits 49,517 → 49,839
   > (+0.7%), ships lost 465 → 487. The task block's own "median credits UP again" guess was
   > CONTRADICTED at row level — five of seven moved rows fall — and the pre-registered
   > prediction that `planCaptainOverhead` losing its throttle would push credits down is
   > what actually held. **The fleet medians rise anyway, and the reason is the row nothing
   > predicted: the FIGHTER carries the arm alone** (clear rate 0.499 → 0.603, median
   > credits 45,551 → 82,671), because it is the policy whose day the dawn hand rationed
   > hardest — a three-planner shopping chain on top of a sign→travel and a combat. Full
   > reconciliation in TASKS.md T-196b's Delivered block.)
   > Before that, `docs/balance/baseline-t196a-free-actions.json` (1,000 seeds
   > × 120 days × 8 policies = 8,000 runs, re-pinned at T-196a 2026-08-04 — the M17 arm-1
   > capstone: nine administrative action types stopped costing a dawn die
   > (`docs/DAWN-HAND-REDESIGN.md` §3), with the instruments deliberately left budgeting for
   > them so T-196b's arm measures the exploitation separately. PREDICTED BEFORE THE RUN and
   > held: NPC-side rows near-still (`npcSpecialEquipmentPurchasesPerRun` +0.1%), and exactly
   > two policy rows move — `explorer` and `smuggler`, the only two that queue `Explore`.
   > Fleet `tourOneClearRate` 0.6320 → 0.6305, median final credits 49,729 → 49,517 (−0.4%),
   > ships lost 436 → 465 (+6.7%), all of the last carried by those two rows.)
   > Before that, `docs/balance/baseline-t199-pacifist.json` (1,000 seeds ×
   > 120 days × 8 policies = 8,000 runs, re-pinned at T-199 2026-08-04 — the F-150-2 capstone:
   > the shared `planPacifistCombat` no longer plays one stance against an unaffordable tribute,
   > `smugglerPolicy` gains the Explore recovery guard T-150 had to back out, and the rim-strand
   > class gets a shared anti-idle move. PREDICTED BEFORE THE RUN and held: all eight rows move
   > except `greedy`, which never reaches the changed planner. Fleet deltas are small —
   > `tourOneClearRate` 0.6310 → 0.6320, median final credits 50,813 → 49,729 (−2.1%), ships lost
   > 411 → 436 (+6.1%, and the `fighter` row alone falls 14 → 8 on its new crippled repair). The
   > change it exists for is `assertNoIncomeStall`: **7 violations → 0** at 1,000 seeds × 35 days).
   > Before that, `docs/balance/baseline-t195-dawn-dice.json` (1,000 seeds ×
   > 120 days × 8 policies = 8,000 runs, re-pinned at T-195 2026-08-04 — the dawn-hand travel-die
   > bake-off; all eight policies moved, a real and intended broad easing — see the standing
   > amendment above for the exact deltas and the two seeded tests flagged for possible re-tuning).
   > Before that, `docs/balance/baseline-t188-orbital-3d.json` (re-pinned at T-188 2026-08-04 —
   > proven inert for T-188's own changes by isolated bisect; its `fleet`/`veteran` movement was
   > T-161's already-accepted `veteranPolicy` fix getting its first capstone). Before that,
   > `docs/balance/baseline-t160-dealer-fix.json` (re-pinned at T-160 2026-08-02 — the F-137-1
   > capstone; the Liar's Dice OPENING FLOOR ships, which moves exactly the `gambler` and
   > `fleet` rows against `t182-reroll-fix` — predicted in writing before the sweep ran).
   > `baseline-t182-reroll-fix` (re-pinned at T-182 2026-08-02 — the F-156-1
   > `spendDie` capstone; `rulesFingerprint` moved, so a capstone was owed, but
   > `balance:diff` from `n13-shipped` reports NOTHING MOVED, so that file and
   > `n13-shipped` describe the same 8,000 careers).
   > `baseline-n13-shipped` (re-pinned at T-156 2026-08-02 — the N13
   > dawn-hand-parity capstone; the cast's checks now spend from a virtual hand, which
   > moves ALL NINE rows against `t150-postfix`, so that file no longer describes HEAD).
   > `baseline-n13-control.json` and `baseline-n13-pre.json` sit beside it as N13's other
   > two ARMS — **grading evidence, explicitly NOT baselines** (the `baseline-n4-control`
   > precedent). `baseline-t150-postfix` (re-pinned at T-150 2026-08-01 — the M4a–M4f
   > post-fix capstone; F-116-1's recovery guard and F-123-3's roaming-dealer stake
   > carry-forward move exactly the `explorer`, `gambler` and `fleet` rows against
   > `t148-roster-ladder`),
   > `baseline-t148-roster-ladder` (re-pinned at T-148 2026-08-01 — M4e added the
   > 42-seat roster, the unlock ladder and the fifteen completion deeds, which moves exactly
   > the `gambler` and `fleet` rows against `t137-liars-dice`),
   > `baseline-t137-liars-dice` (re-pinned at T-137 2026-07-31 — M4d replaced the
   > opposed-d20 Dare with the Liar's Dice scene, which moves exactly the `gambler` and
   > `fleet` rows against `t133-loanband`),
   > `baseline-t131-explore-ap` (re-pinned at T-131 2026-07-31 — owner ruling D1
   > repriced Explore bands 3-4 from calendar days to extra dice, which moved the
   > `explorer`, `smuggler` and `fleet` rows),
   > `baseline-t125-hangout` (re-pinned at T-125 2026-07-30 — T-120…T-124
   > shipped a parameterised Hangout at 14 ports where there was 1, and it moved the
   > `fleet`, `gambler`, `smuggler`, `trader` and `trader-degraded` rows),
   > `baseline-t116-explore`,
   > `baseline-n11-shipped`, `baseline-n10-shipped`, `baseline-t020-registry`,
   > `baseline-n4-shipped`, `baseline-r2c-explorer-remit`, `baseline-n2-final`,
   > `baseline-n9-shipped`, `baseline-r2c-final` and `baseline-vet-1k*` are its
   > predecessors.
   > **`baseline-n4-control.json` sits beside it and is NOT a baseline** — it is N4's
   > control arm (the same capstone with every archetype multiplier set to 1), kept as
   > that step's grading evidence. Presence in `docs/balance/` never makes a file the
   > baseline of record; this pointer and `balance-targets.test.ts`'s path do.
   > **It is also read at runtime by `balance-targets.test.ts`'s band block**, so re-pinning
   > means updating that path in the same commit. **Update this pointer in the same commit that re-pins the baseline** —
   > a stale yardstick silently mis-grades every step that diffs against it.
   >
   > **RULE REFINED 2026-07-28 — re-pin on SHIPPED CODE, not on an accepted hypothesis.**
   > The old wording ("re-pin the baseline only on an accepted hypothesis") was written for
   > R1 and R2's lever, which were **measure-only or never shipped** — for those, re-pinning
   > nothing is right. **N9 is the case it did not anticipate: hypothesis REJECTED, code
   > SHIPPED and retained**, moving 7 of 8 policy rows. Under the old wording the baseline
   > stayed at `r2c-final`, which no longer described HEAD, and N2's differ would have shown
   > N9's deltas tangled with N2's own. **The test is "does the baseline describe HEAD?",
   > not "did we like the answer?"** A verdict is a judgement about a hypothesis; a baseline
   > is a description of the tree.
   >
   > *Provenance:* `baseline-n9-shipped.json` was taken fresh at HEAD and diffed against
   > N9's own shipped arm — **"NO MEASURED VALUE MOVED"**, an independent reproduction of
   > N9's figures from a clean run rather than a copied artefact.
2. **A rejected hypothesis is a result.** R1's was rejected and produced the re-scope that
   this document now runs on. Record outcomes under the step, including the ones that say
   "the premise was wrong". **Two of the four graded steps so far were disproved** (R1, R2's
   lever) and a third was accepted-with-hypothesis-disproved (N1); that ratio is the method
   working, not a problem to fix.
3. **Re-extract the smoke fixture ONCE, at the end of a step** (owner decision 2026-07-28).
   N7's `rulesFingerprint` hashes raw file bytes, so a comment or a `prettier --write`
   stales the fixture — and Part B rule 3 *requires* commenting at definition sites, so this
   fires constantly. N9 paid it **three times in one step**. The mechanism is correct and
   deliberately not being "optimised": stripping comments needs a parser, and a parser that
   mis-parses fails **silently**, in the one direction the whole design exists to prevent.
   So the fix is procedural — finish the code, *then* re-extract. A capstone is 1m46s, not
   the 80 minutes that motivated the rig, so the tax is small if it is paid once.
   *If it still hurts after N2, the option with real data behind it is hashing the
   TypeScript **emit** rather than source bytes — `tsc` re-prints from the AST, so comments
   and formatting normalise away while real code changes still move the hash, and it is the
   same compiler that builds the product rather than a bespoke parser.*
   > **THE MECHANISM ABOVE IS SUPERSEDED BY N7-FP (2026-07-29 · `b7b52116`) — and this
   > amendment predicted its own supersession.** *Flagged by the 2026-07-29 doc audit as
   > item **OI-3**; annotated rather than rewritten, because the cost it records is the
   > evidence that motivated the change.*
   >
   > **The procedural rule stands, unchanged: re-extract ONCE, at the end of a step.** What
   > no longer describes HEAD is its premise. `rulesFingerprint` does not hash raw file
   > bytes any more — the raw-byte hash was **demoted to `docsFingerprint`**, which is
   > informational only and cannot fail a test (`fixtureFreshness` never reads it; its one
   > reader, `fixtureDocsDrift`, returns `string | null` and is explicitly not a
   > `FreshnessProblem`). So a comment or a `prettier --write` no longer stales the fixture
   > at all, and the tax N9 paid three times in one step is gone. The closing paragraph
   > directly above is what shipped: *"hashing the TypeScript **emit** rather than source
   > bytes"* is precisely option C of N7-FP, using the same compiler that builds the
   > product rather than a bespoke parser.
   >
   > Its stated risk — "a parser that mis-parses fails **silently**" — was real, and N7-FP
   > did **not** discharge it: `ts.createSourceFile` recovers from broken syntax and prints
   > the recovered tree without complaint. The audit filed that as **OI-7** and it is now
   > closed by a hard `parseDiagnostics` assertion ahead of the hash. See the **N7-RIG**
   > entry (immediately after N7-FP) for OI-7 and for OI-6/OI-6b.
4. **Close the loop on the step before starting the next one** (added 2026-07-28, after
   this was caught drifting). Landing a step means all four of: the heading carries
   `(SHIPPED <date> · <sha>)`, a `**Result:**` block is appended under it, the sequencing
   diagram above reflects reality, and **anything learned that changes DIRECTION is written
   into the step it affects** — not just recorded under the step that found it. N1 found the
   shipyard API blocks N2 and that NPCs fly on ~4× a player's fuel; both belong in N2's
   entry, and are there.

---

## After N8 — the seam back to the R-series

N8's re-pin ends this track. The R-series in `BALANCE-REDESIGN-WORKLIST.md` then
resumes, re-read against N8's living-field baseline: R2.5 ─► R4 ─► R5b (that
document's "Sequencing at a glance" carries the R-side resumption order). Two things
it owns that this track must not forget:

- **The two known-red `it.fails` tripwires** (`balance-targets`' clear-day band, owned
  by R2.5; `balance-combat-survival`'s Auto-Repair threshold, owned by R2c) live
  there. Flip a tripwire back to `it` only in the commit that fixes its defect.
- **R10 (the 25-credit tier-1 hull cliff)** is R-owned but confounds this track's
  sweeps — it is the root cause of the top-of-field convergence in N2's Result, and it
  shapes every NPC refit outcome until it is fixed.
