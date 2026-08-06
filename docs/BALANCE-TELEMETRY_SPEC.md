# Balance Telemetry — spec for NPC captain decision tracing

**Spec only. No engine, content, sim, or UI source file is touched by this document.**
Written outside the 0.5.2 Explore/Hangout track (which owns `TASKS.md` while it runs) so
it is ready to schedule the moment that track's M4 checkpoint clears. Companion:
`docs/PLAYTEST-TELEMETRY_SPEC.md` (human playtest logging) — the two share a trace-entry
shape (§3) so one analysis pipeline can read both.

## 0. What problem this solves

Balance sweeps already run thousands of simulated games (`packages/sim/src/balance/sweep.ts`,
8,000 runs in ~207s sharded) and already produce bulk-processable aggregate JSON
(`docs/balance/baseline-*.json`). What they do **not** currently expose is *why* an NPC
captain did what it did on a given day — only the outcome. The ask: "are the NPCs behaving
according to our desired archetypes" is exactly what N4's own design comment already
names as the goal (`packages/engine/src/npc.ts:582-585`: *"the archetype effect is
SEPARABLE, so N4 could be graded"*) — this spec is the instrument that grades it directly,
instead of inferring it from aggregate outcomes.

## 1. Scope: which "NPC" this is about

Two systems in this codebase could answer to "NPC decision" and only one is in scope:

- **`SimPolicy`** (`packages/sim/src/index.ts:766`) simulates the **player character**
  under a named archetype (trader, fighter, gambler, explorer, …) for balance sweeps. Its
  decisions already ARE its return value — full visibility exists today via
  `aggregate.ts`'s per-archetype breakdown. **Not this spec's subject.**
- **`resolveNpcDay` / `pickIntent` / `pickContract`** (`packages/engine/src/npc.ts`) is the
  actual AI driving the 30 NPC captains — their daily verb choice and job-claim choice.
  **This is what "NPC captains" means here**, and it is the subject of this spec.

## 2. Audited finding: the weighting is computed, then discarded

Read end to end before writing this spec, per the project's own audit-first convention.

**`pickIntent`** (`npc.ts:600-632`) builds a full weighted distribution over
`NPC_INTENT_TYPES` — `IDEAL_WEIGHTS[profile.ideal] × ARCHETYPE_INTENT_MULTIPLIERS[profile.archetype]`,
further scaled by a poverty-pressure multiplier when `credits < NPC_POVERTY_CREDITS` — then
samples one intent from it with `rng.next() * total`. The `weighted` array and the roll are
local variables. The function returns exactly one `NpcIntentType | 'Idle'`. **Every other
candidate and its weight is gone the instant the function returns.**

**`pickContract`** (`npc.ts:1373-1494`) is described in its own comment as *"a score...
rather than a filter chain"* — each archetype scores candidate jobs on the board. Only the
winning claim survives into `NpcDayResult.claimedContractIndex` / `claimedFromPool`
(`npc.ts:542-559`). The losing candidates and their scores are equally discarded.

**Consequence:** a trace layer that only reads existing return values (`NpcDayResult.events`,
the claim fields) can show **what** an NPC did, never **why** relative to what it didn't do.
Answering "is the Justice idealist actually idling instead of trading" needs the discarded
distribution, not just the sampled outcome. This is the central design question the
implementation task inherits — it cannot be solved sim-side alone.

## 3. The trace entry shape

One entry per NPC decision point:

```
NpcDecisionTrace {
  day: number
  npcId: string
  archetype: NpcArchetype
  ideal: <profile.ideal's type>
  kind: 'intent' | 'contract'
  candidates: Array<{ option: string; weight: number }>   // the discarded distribution
  roll: number | null                                      // rng.next() * total, when sampled
  chosen: string                                            // the same value the function returns today
}
```

Shared field names (`day`, an entry `kind`, a discriminated payload) should match whatever
shape `docs/PLAYTEST-TELEMETRY_SPEC.md` settles on for its own entries, so both trace
streams can be concatenated into one analysis pass without a translation layer.

## 4. Design questions the implementation task must settle

**(1) How the trace escapes the function — two candidate designs, not yet chosen:**

- **(a) Callback injection.** `pickIntent`/`pickContract` gain an optional trace-sink
  parameter, default `undefined`, emitting only when supplied. Cheapest to wire, but it
  changes both functions' signatures — an `packages/engine/src` code change regardless of
  whether it's ever invoked.
- **(b) Always return the distribution.** Widen `NpcIntentType | 'Idle'` and the contract
  claim result into a small struct that always carries the candidates/weights, and let the
  **caller** (inside `resolveNpcDay`, still engine-side) decide whether to forward it
  anywhere. Marginally more invasive to the return type, but keeps the function's job
  ("compute this decision") separate from "does anyone want to know why" — arguably the
  cleaner seam, and it avoids a callback parameter threading through engine internals.

Pick one and record the reason; do not build both.

**(2) `rulesFingerprint` moves either way.** `docs/balance/smoke/README.md`'s own rule: the
fingerprint "hashes CODE, not bytes" and "every change to code ... still moves the hash" —
comments are the only exempted category. Either design above edits
`packages/engine/src/npc.ts`, so **this WILL move `rulesFingerprint`, even though it changes
no NPC's behavior.** This is not a bug to route around (per the standing constraint: "never
edit a fingerprint... to make a test pass") — it is a real, one-time, deliberate cost to
accept and batch into a single capstone alongside whatever task lands this, same as every
other engine-touching task in this track.

**(3) Who supplies the sink, and where the flag lives.** Only `packages/sim`'s sweep/campaign
runner passes a trace collector, gated behind an explicit flag (e.g. `--trace-npc-decisions`)
on `sweep.ts`, off by default — the routine 8,000-run capstone must not slow down or change
shape. **The shipped game never supplies one**: a `grep` for the trace parameter under
`packages/ui` and `packages/desktop` must return nothing, asserted by a test.

**(4) Output location and format.** JSONL, one line per `NpcDecisionTrace`, following the
existing raw-row convention: `.scratch/balance/traces-<label>-shard<i>of<N>.jsonl`,
**gitignored** — same reasoning as `.scratch/balance/rows-<label>-shard<i>of<N>.json`
today ("raw ... records are not a repo artifact"). An aggregated summary (e.g., "% of
Trade-weighted days a given archetype actually chose Trade," a measurable N4 grading
statistic) MAY be folded into `aggregate.ts`'s committed output as a measure-only addition,
same shape as R6/R8/R9 in `docs/BALANCE-REDESIGN-WORKLIST.md`.

**(5) Performance.** Trace collection must be provably free when the flag is off (no
allocation on the hot path) — assert with a benchmark or an explicit before/after wall-clock
comparison on an untraced sweep, not by inspection.

## 5. Non-goals

- No UI surface. Sweep/campaign-only.
- Does not change any NPC's decision, only what is observable about it — byte-identical
  goldens on an untraced run is a hard accept criterion for the implementation task, same as
  every other extraction in this codebase.
- Does not cover `SimPolicy` (player-side simulated archetypes) — already fully observable
  today.
- Does not implement anything. This document settles design; it modifies no source file.

## 6. Suggested acceptance shape for the implementation task

**The third bullet below is MACHINE-CHECKED as of T-166**, by
`packages/sim/src/__tests__/smoke-reextraction.test.ts`. That suite reads
`3468ef5f` and its parent out of git and asserts this bullet against the
precedent's real diff, then asserts the same rule over a live re-extraction of
`docs/balance/smoke/tiers.json`. This criterion is therefore enforced, not
remembered — which is the point, because it was written wrong twice (see below).

- The trace shape from §3 is implemented and asserted by a unit test driving `pickIntent`/
  `pickContract` directly and inspecting the emitted entries against a known weight table.
- An untraced sweep run is byte-identical to the pre-change run (goldens, `campaign-degraded`
  pins) — proving the addition is behaviorally inert despite moving `rulesFingerprint`.
- The re-extraction moves `productVersion`, the fingerprints and `provenance` — and
  nothing else; every recorded measurement (checkpoints, tier spreads, seed lists)
  and `saveSchemaVersion` are byte-identical, and any fingerprint beyond
  `rulesFingerprint` that moves is named in the commit body with the file that
  moved it. **(Reworded by owner ruling on F-140-3, §7.7(A), 2026-08-01 — see
  that section for why the original wording was unsatisfiable even by the T-110
  precedent it cited. AMENDED AGAIN 2026-08-04, T-166: the 2026-08-01 wording —
  "fingerprints and `provenance` only" — was itself ONE FIELD SHORT. `3468ef5f`
  also moved `productVersion`, which is neither a fingerprint nor `provenance`;
  §7.7's own evidence block lists it, and the reword still omitted it. The
  corrected set above is now asserted against that commit by
  `packages/sim/src/__tests__/smoke-reextraction.test.ts`, so a third wrong
  transcription fails the suite instead of surviving in a doc.)**
- A `grep` for the trace-sink parameter/callback under `packages/ui` and `packages/desktop`
  returns nothing.
- A dedicated `--trace-npc-decisions` sweep run produces the gitignored JSONL and, if §4(4)'s
  aggregate option is taken, a small committed measurement in `docs/balance/`.

## 7. Implementation ruling — T-140

This section is written BY the implementation task, not for it. §4 asked for two
questions to be settled and the reason recorded; here are the answers as shipped.

**§7.7 is the exception: it is a question, not an answer.** One acceptance clause in
§6 is not met, the implementation cannot honestly rule on its own deviation, and the
task is `BLOCKED` on an owner ruling rather than closed. Read §7.7 before treating
anything here as final.

### 7.1 §4(1): design **(a), callback injection**

`pickIntent` and `pickContract` each gained an optional trailing trace-sink
parameter (`NpcDecisionEvidenceSink`), defaulting to `undefined`. Identity
(`day`, `npcId`, `archetype`, `ideal`) is bound once per captain-day inside
`resolveNpcDay`, which forwards a closure to both. `NpcDayContext` carries the
outer `NpcDecisionTraceSink`; `endDay` gained an `EndDayOptions` parameter that
defaults to `{}`.

Four reasons, in the order they decide the question:

1. **§4(5) decides it.** "Provably free when the flag is off (no allocation on
   the hot path)" is a hard clause, and (b) cannot honour it: always returning
   the distribution means materialising a `{option, weight}` array per decision
   on every captain-day whether or not anyone asked. Under (a) every allocation
   sits inside a `trace?.(...)` argument list — which short-circuits before its
   arguments are evaluated — so an untraced day allocates exactly what it
   allocated before T-140. That is an argument, not a measurement, and §4(5)
   explicitly refuses arguments; **§7.5 carries the measurement** that backs it.
2. **(b) does not avoid a sink, it moves it up.** A §3 entry needs `day`,
   `npcId`, `archetype` and `ideal`. `pickContract` is handed only the archetype
   and is called from `executeTrade`, not from `resolveNpcDay`, so (b) costs *two*
   return-type widenings (`pickContract` and `executeTrade`) and **still** needs a
   sink field on `NpcDayContext` for the forwarding. Strictly more engine surface,
   not less.
3. **Inertness is easier to prove.** An optional trailing parameter leaves every
   existing call site and every existing assertion — ~10 `pickIntent` calls in
   `npc.test.ts`, ~15 `pickContract` assertions in `livingGalaxy.test.ts`, ~120
   `endDay` calls across the suites — literally unchanged. (b) rewrites all of
   them, and every rewritten assertion is a place inertness could hide.
4. **The accept criterion is written in (a)'s language**: "a `grep` for the
   trace-sink **parameter** under `packages/ui` and `packages/desktop` returns
   nothing". Under (b) there is no parameter and the criterion is vacuous.

The counter-argument §4(1) raises against (a) — it changes signatures and so moves
`rulesFingerprint` — does not discriminate: (b) edits the same file and moves it
too, and §4(2) accepts that cost either way. Neither design was cheaper on the
fingerprint §4(1) did **not** anticipate, `instrumentFingerprint`; see F-140-3 and
§7.6.

### 7.2 §4(4): the optional committed aggregate is **DECLINED, deliberately**

The JSONL half is implemented (`.scratch/balance/traces-<label>-shard<i>of<N>.jsonl`,
gitignored). The optional "fold a summary statistic into `aggregate.ts`'s committed
output" half is **not**, for two reasons:

- `balance/aggregate.ts` is INSTRUMENT-hashed. Adding a measure changes the shape
  of every committed baseline artefact and owes a capstone, which T-140 is not
  taking (it takes a re-extraction of `docs/balance/smoke/tiers.json` and nothing
  more).
- The statistic §4(4) names — *"% of Trade-weighted days a given archetype actually
  chose Trade"* — is precisely what the report generator scheduled after this task
  computes over the JSONL. Computing it twice, in two places, would make one of
  them the stale copy.

Recorded here so the option reads as decided rather than forgotten.

### 7.3 Three findings the shape produces, reported not fixed

- **F-140-1.** A §3 entry carries no seed and no policy, so a merged multi-shard
  JSONL cannot attribute a decision back to the career that produced it. §3 is the
  settled shape and this task implements it rather than reopening it; the §4(4)
  statistics do not need attribution, but a per-policy view would. Filed against
  the report generator, not against the spec.
- **F-140-2.** For `kind: 'contract'`, `option`/`chosen` are BOARD INDICES (§3
  defines `chosen` as "the same value the function returns today", and that value
  is an index) and the board itself is not recorded. An entry is therefore
  interpretable as *"which of the offers presented that day"*, never *"which
  cargo"*. Noted at the emit site in `npc.ts`.
- **F-140-3. `instrumentFingerprint` moved, and §6 did not expect it to. THIS
  FINDING IS OPEN — see §7.7.** §6 says `rulesFingerprint`'s move is the ONLY
  expected diff in `docs/balance/smoke/tiers.json`. Three moved:
  `rulesFingerprint 30956ac30326f246 → f36d71f863a8ebe7`,
  `instrumentFingerprint 342e248189f7ac34 → d50b03a8ca4323d8`,
  `docsFingerprint a3ef073897c54166 → c944fdb764c48484`, and
  `provenance.gitCommit` with them. The third is not a separate event —
  `computeDocsFingerprint` is the RAW-byte shadow of the other two, so it moves
  whenever either of them does, and the T-110 precedent §6 cites (`3468ef5f`)
  moved it too. The SECOND is the real deviation: T-110 left
  `instrumentFingerprint` at `313fde95fc5ee9db → 313fde95fc5ee9db` because it never
  touched `packages/sim/src`, and T-140 must. §7.5 and §7.6 EVIDENCE it — what the
  move costs, why no arrangement of §4(1)'s two designs avoids it, and the proof
  that the measurement it names did not in fact change — but they do not CLOSE it.
  Filed against **§6**, whose acceptance shape was written before the threading was
  designed and which §7.7 shows contradicts its own cited precedent, not against the
  implementation. The ruling is the owner's; T-140 is `BLOCKED` until it is made.

### 7.4 What did NOT change

No save-shape change: `CURRENT_SAVE_VERSION` is untouched, `save.ts` and
`schema.ts` are untouched, and no migration is owed. Tracing is observation only —
it draws no rng, reorders no draw, and emits no `GameEvent` (an event would land
in the persisted log and move every golden).

### 7.5 §4(5) and §6's byte-identity clause: MEASURED, not inspected

§4(5) asks for "a benchmark or an explicit before/after wall-clock comparison on an
untraced sweep, **not by inspection**", and §6 asks for an untraced sweep that is
byte-identical to the pre-change run. §7.1's short-circuit argument answers neither:
it is inspection. So both were run.

**Method.** A detached `git worktree` at the pre-change commit
`d85aaf9a9c5f60d8089d6d97a02f9c49f785b99c` beside the working tree, each built with
its own `tsc -b` (the sweep runs against `dist/`, so a shared build would have
measured one tree twice). Identical invocation in both, differing only in `--label`:

```
--seeds 50 --days 120 --shard 1/1 --milestone-days 21,29,41
```

Default policies, so **350 runs / 42,000 simulated days** per tree — a real spread of
careers, not a smoke seed.

**Result 1 — byte identity.** Both row files are 8,052,023 bytes and hash to

```
c0d26f1531936a677ee63bace8fdfe2342dc7e4c0c91ae3dbfb49954c7ca6d47
```

`cmp` reports no difference. This is §6's clause discharged by measurement, and it is
the load-bearing evidence for F-140-3: whatever the instrument hash now says, the
instrument produced the same 8 MB of numbers before and after.

**Result 2 — wall clock.** Three runs per tree, seconds, in order:

| tree | run 1 | run 2 | run 3 | best |
| --- | --- | --- | --- | --- |
| pre-change (`d85aaf9a`) | 67.8 | 67.0 | 73.0 | **67.0** |
| with tracing, flag OFF | 64.3 | 64.1 | 108.1 | **64.1** |

The honest reading is *no measurable cost*, not *4% faster*: the 108.1 outlier is
another process on the box, and that noise band is an order of magnitude wider than
any difference between the trees. What the table rules out is the failure §4(5)
guards against — a flag-off slowdown — since the traced-off tree's best and median
are both under the pre-change tree's.

### 7.6 Why the instrument hash could not be kept still (F-140-3, analysis)

The obvious repair for F-140-3 is to keep `packages/sim/src/index.ts` out of the diff.
It was considered and **rejected**, because every way of doing it is worse than the
hash move it buys:

1. **`runCampaign` IS the day loop, and the day loop is in `index.ts`.** The sink has
   to reach `endDay`; `endDay` has exactly one caller **on the sweep path**, and that
   caller is `runCampaign` in an instrument-hashed file. (Stated precisely because the
   first draft of this section said "called from exactly one place in the sim", which
   is FALSE — `packages/sim/src/protocol.ts:1156` calls it too, and `protocol.ts` is
   deliberately *not* instrument-hashed. That second caller is the UGT external-client
   adapter; no sweep, smoke or capstone number is produced through it, so it is not a
   route the sink could take. Routing a measurement run through the protocol adapter
   *because* it sits on the cheap side of a hash boundary would be item 2's mistake
   wearing a different hat.) §4(1)'s alternative design (b) does not help: it also
   edits `npc.ts` and it still needs `runCampaign` to hand the collected distributions
   somewhere. There is no arrangement of (a) or (b) in which the instrument is
   untouched.
2. **The one arrangement that would work is ambient state**, e.g. an engine-level
   `withNpcDecisionTrace(sink, () => runCampaign(...))` set from `sweep.ts` (which is
   deliberately NOT instrument-hashed). That keeps the hash still by moving hidden
   mutable state into a deterministic engine whose entire value is seeded
   reproducibility — and it would make inertness *harder* to prove, not easier,
   because an ambient can leak across campaigns and across tests. Choosing a worse
   structure because of which side of a hash boundary it lands on is choosing code to
   control a metric. `docs/VERSIONING.md`'s "the rule that matters most" forbids
   moving a fingerprint to make a test pass; the mirror of it forbids contorting the
   source to keep one from moving.
3. **The rig already prices this.** `rules-fingerprint.ts` states the asymmetry
   directly — a too-NARROW hash is a correctness failure, a too-BROAD one "is only a
   cost", and the remedy for a false positive is a re-measure plus a differ run that
   says nothing moved. §7.5 IS that differ run, done at the row level rather than the
   aggregate level.

**What the move costs, stated plainly so nobody has to re-derive it.**
`rules-fingerprint.ts` reads a moved `instrumentFingerprint` as "the measurement
changed and the old numbers were never about a different game at all" — a harder
sentence than a moved `rulesFingerprint`. Concretely it means every committed
`docs/balance/baseline-*.json` produced before this commit was made by a differently
hashed instrument, and a future reader comparing across the boundary is owed this
section. The mitigation is that the boundary is provably cosmetic: §7.5's identical
sha256, plus the re-extraction of `docs/balance/smoke/tiers.json`, in which the three
fingerprints and `provenance.gitCommit` are the **entire** diff — not one checkpoint
value, seed list, or tier spread moved.

**What the commit body must therefore say.** Not §6's single sentence. It states
three fingerprint moves, names `instrumentFingerprint` as the deviation from §6,
points at this section, and quotes the identical row-file hash as the reason the
deviation is cosmetic. §6 is left as written — it is the record of what was expected
before the threading was designed, and F-140-3 is the record of what was found.

None of the above CLOSES F-140-3. It is the evidence an owner needs in order to close
it, assembled by the party with the conflict of interest; §7.7 is the ruling itself,
and it is not this task's to make.

### 7.7 OWNER RULING OWED on F-140-3 — and the reason it is easy

The T-140 review (fix round 1) declined to wave F-140-3 through, correctly: an
implementation that misses its own acceptance criterion cannot also be the thing that
decides the miss was acceptable. §7.6 was headed "discharged" and TASKS.md's Delivered
note argued the deviation unavoidable — both are a coder self-approving a deviation
from a settled bar, which is exactly the move `docs/VERSIONING.md`'s "the rule that
matters most" exists to prevent. So the finding is re-opened here, stated as a
question, with the two answers an owner can give.

**The fact that decides it — on disk when §6 was written, and not checked.** §6's
bullet cites T-110 as its precedent. T-110 landed at `3468ef5f`, 2026-07-30 09:32; this
spec, §6 included, landed at `87579155` the same day at 12:40, so the precedent was
three hours old and readable. Its actual `docs/balance/smoke/tiers.json` diff moved
**four** fields:

```
-  "productVersion": "0.5.1",          +  "productVersion": "0.5.2",
-  "rulesFingerprint": "b6f27d2b...",  +  "rulesFingerprint": "e58d5afd...",
-  "docsFingerprint":  "a0fc99a8...",  +  "docsFingerprint":  "37ec3ae6...",
-  "gitCommit": "81186739...",         +  "gitCommit": "6d051bb8...",
```

So **§6's bullet contradicts the precedent it cites**, and it does so for reasons that
have nothing to do with T-140's threading design:

- `provenance.gitCommit` is re-stamped from `HEAD` by `checkpoints.ts` on every
  extraction. It moves unconditionally. No re-extraction can ever satisfy "the ONLY
  expected diff".
- `docsFingerprint` is `computeDocsFingerprint`'s raw-byte hash over the *same* sources
  the other two hash semantically. Any code edit that moves `rulesFingerprint` moves
  its bytes too, so it moves in lockstep — for a pure-engine change as much as for
  this one.

T-110's own Delivered note (F-110-C, `TASKS.md`) states the property the precedent
actually established, and states it correctly: the diff is *"fingerprints + `gitCommit`
+ `productVersion` and **every recorded checkpoint number is identical**, which is
itself evidence of inertness."* §6 compressed that into "`rulesFingerprint`'s move is
the ONLY expected diff" — a strictly stronger claim, unsatisfiable by any extraction
this repository has ever taken, including the one it points at. **The defect is a
transcription, not a design bar.**

Read against the precedent's real property, T-140 satisfies it: fingerprints and
`gitCommit` moved, and **not one checkpoint value, seed list or tier spread did** —
plus §7.5's row-level sha256 identity, which is stronger evidence than T-110 offered.
Read against §6's literal words, T-140 fails — as would T-110, and as would every
future task that re-extracts.

**The ruling, for the owner:**

- **(A) ACCEPT the deviation, and repair the acceptance shape.** The bar T-110 set is
  met and exceeded. §6's third bullet is re-worded for *future* tasks to the property
  it meant — *"the re-extraction moves fingerprints and `provenance` only; every
  recorded measurement is byte-identical, and any fingerprint beyond `rulesFingerprint`
  that moves is named in the commit body with the file that moved it"* — and this
  track's remaining fingerprint-moving tasks inherit the repaired wording. **This is
  the recommendation.** Note that under (A) the repaired wording is *stricter* in the
  place that matters (it demands every moved fingerprint be attributed to a file) and
  honest in the place §6 was not.
- **(B) REJECT it, and require an untouched instrument.** This is a live option and
  its cost should be read before it is taken: per §7.6 there is no arrangement of §4's
  design (a) or (b) that reaches `endDay` from `sweep.ts` without editing
  `packages/sim/src/index.ts`. Taking (B) therefore means ruling FOR the ambient-state
  design §7.6(2) rejects — hidden mutable engine state, set from outside, in the one
  subsystem whose value is seeded reproducibility — or else ruling that
  `packages/sim/src/index.ts` be re-classified out of `SIM_INSTRUMENT_DIRECTORIES`,
  which would take the sim's day loop and policies out of the instrument hash
  altogether and is the too-NARROW failure `rules-fingerprint.ts` names as the
  correctness one. Either is a real decision an owner may make; neither is one this
  task may make for them.

Until this is ruled, T-140 is `BLOCKED` in `TASKS.md`, not `DONE`. **§6 is not edited
by this task** — under (A) it is the owner who repairs it, and under (B) it stands and
the implementation changes.

**RULED (owner, 2026-08-01): (A).** The deviation is accepted — T-140 meets the bar
T-110 actually set, exceeds it with §7.5's row-level sha256 identity, and §6's third
bullet is repaired above to the property it meant. T-140 is `DONE`; this track's
remaining fingerprint-moving tasks inherit the repaired wording.

**CLOSED (T-166, 2026-08-04) — the defect CLASS, not just this instance.** The
F-140-3 class is "an Accept criterion cites a precedent commit, and nothing ever
checks the criterion against that commit's diff". It recurred inside its own
remedy: the 2026-08-01 reword above says "fingerprints and `provenance` only",
while the four-field evidence block at the top of this section — written in the
same session — lists `productVersion` too. A rule and its own evidence
disagreed, in one section, for four days, because neither was executable.
`packages/sim/src/__tests__/smoke-reextraction.test.ts` now makes the rule
executable: it reads `3468ef5f^` and `3468ef5f` out of git, asserts the moved set
is exactly `productVersion` + `rulesFingerprint` + `docsFingerprint` +
`provenance.gitCommit` with `checkpoints` byte-identical, and applies the same
classification to a live re-extraction of the committed fixture. The historical
quotations in §7.3 and above are deliberately LEFT AS THEY WERE — they are the
record of what was found, and editing them would destroy the evidence that makes
this ruling auditable.
