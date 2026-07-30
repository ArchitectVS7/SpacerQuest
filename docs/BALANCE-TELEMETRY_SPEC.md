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

- The trace shape from §3 is implemented and asserted by a unit test driving `pickIntent`/
  `pickContract` directly and inspecting the emitted entries against a known weight table.
- An untraced sweep run is byte-identical to the pre-change run (goldens, `campaign-degraded`
  pins) — proving the addition is behaviorally inert despite moving `rulesFingerprint`.
- `rulesFingerprint`'s move is the ONLY expected diff in `docs/balance/smoke/tiers.json`
  when re-extracted; state this explicitly in the commit body (the T-110 precedent).
- A `grep` for the trace-sink parameter/callback under `packages/ui` and `packages/desktop`
  returns nothing.
- A dedicated `--trace-npc-decisions` sweep run produces the gitignored JSONL and, if §4(4)'s
  aggregate option is taken, a small committed measurement in `docs/balance/`.
