# T-155 · Pilot validation run — is the Tier-2 driver trustworthy?

**Date:** 2026-08-04
**Task:** T-155 (validate only — the game's rules, constants and content were not
touched; the only production change is to the pilot's own CLI, see finding F-155-2).

T-154 built the native LLM pilot. This task is where it is either proven trustworthy
at volume or told not to be trusted. `packages/sim/PILOT.md` §8 said, in its own
words, *"do not treat a green pilot run as evidence about the game until then."* This
document is the "then", and it is deliberately not a clean bill of health: **three of
the four legs are green and one is blocked.**

---

## 1. Method + provenance

Every action in every run below was formed **only** from a `LegalActionSpec` the
engine's own `legal-actions` enumerator advertised, filled from that spec's declared
`ParamSpec` domains by `enumerateCandidates`, re-checked by `assertCandidateIsLegal`,
and dispatched as an `apply-action` through the same pure `handleMessage` reducer the
UI drives (`packages/sim/src/protocol-stdio.ts` → `protocol.ts`). No action was
constructed from a brain-supplied value at any point; there is no code path that can.

| Provenance | Value |
| --- | --- |
| Game commit | `ddd0b8e6` (`TASKS.md: re-scope M17 dawn-hand tasks at the 2026-08-04 owner review pass`) |
| Node | `v24.13.1` |
| Driver | `packages/sim/src/pilot.ts` (pure), `pilot-cli.ts` (argv/IO), `pilot-anthropic.ts` (live brain — **not exercised**, see Leg D) |
| Brains run | `random` (seeded uniform, added by this task), `first-legal` (T-154's smoke brain), `recorded` (replay) |
| Level | **Protocol/state seam only.** Says nothing about `packages/ui/` — see §6. |
| Committed evidence | `docs/playtests/results/T-155-pilot-runs.json` (per-run summaries, verb histograms, both classes of digest) and `docs/playtests/results/T-155-run-console.txt` (the full CLI transcript, verbatim) |
| Full JSONL trails | **Not committed**, per the T-1604a precedent (that campaign withheld its 11,646-line trail, citing an earlier branch that committed a 19,844-line JSON as the thing not to repeat). They live under `test-results/`, which `.gitignore:2` already excludes. Both digests are recorded so a re-run can be *proved* to match. |

### Reproduce

All commands run from the **repo root**. They work verbatim as written — which they
did not before this task; see F-155-2.

```sh
# Leg A · volume. 5 seeds x 30 days on each brain. ~2 s total, no API calls, no key.
npm run pilot -- --brain random --seed 1,2,3,4,5 --days 30 --out test-results/pilot/T-155-volume-random
npm run pilot -- --brain first-legal --seed 1,2,3,4,5 --days 30 --out test-results/pilot/T-155-volume-firstlegal

# Leg B · same-seed determinism, TWO INDEPENDENT node processes.
npm run pilot -- --brain random --seed 7 --days 30 --out test-results/pilot/T-155-det-a
npm run pilot -- --brain random --seed 7 --days 30 --out test-results/pilot/T-155-det-b
npm run pilot -- --compare test-results/pilot/T-155-det-a/<runId>.jsonl \
                           test-results/pilot/T-155-det-b/<runId>.jsonl

# Leg C · the reproducibility lever — replay Leg B's trail and compare it to its source.
npm run pilot -- --brain recorded --replay test-results/pilot/T-155-det-a/<runId>.jsonl \
                 --seed 7 --days 30 --out test-results/pilot/T-155-replay
npm run pilot -- --compare test-results/pilot/T-155-det-a/<runId>.jsonl \
                           test-results/pilot/T-155-replay/<runId>.jsonl

# Leg D · the live pass. NOT RUN — no credentials in this environment. See §5.
ANTHROPIC_API_KEY=... npm run pilot -- --brain anthropic --seed 1 --days 30 --out test-results/pilot/T-155-live

# The claims above, as re-runnable checks rather than as this document.
npx vitest run packages/sim/src/__tests__/pilot.test.ts
```

---

## 2. Leg A — volume · **PASS**

**300 simulated days: 2 brains × 5 seeds × 30 days.** The task floor is ≥30 days ×
≥3 seeds; this clears it 3.3× over on each brain. Both invocations exited `0`, which
the CLI only does when all four counters are zero on **every** seed.

| Brain | Seed | Days | Steps applied | illegal | fallbacks | blockedFromLegal | protocolErrors | diceBounds | forced-end-days | distinct verbs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `random` | 1 | 30 | 230 | 0 | 0 | 0 | 0 | 0 | 0 | 36 |
| `random` | 2 | 30 | 200 | 0 | 0 | 0 | 0 | 0 | 0 | 37 |
| `random` | 3 | 30 | 232 | 0 | 0 | 0 | 0 | 0 | 0 | 34 |
| `random` | 4 | 30 | 208 | 0 | 0 | 0 | 0 | 0 | 0 | 31 |
| `random` | 5 | 30 | 243 | 0 | 0 | 0 | 0 | 0 | 0 | 38 |
| `first-legal` | 1 | 30 | 150 | 0 | 0 | 0 | 0 | 0 | 0 | 3 |
| `first-legal` | 2 | 30 | 150 | 0 | 0 | 0 | 0 | 0 | 0 | 3 |
| `first-legal` | 3 | 30 | 150 | 0 | 0 | 0 | 0 | 0 | 0 | 5 |
| `first-legal` | 4 | 30 | 150 | 0 | 0 | 0 | 0 | 0 | 0 | 3 |
| `first-legal` | 5 | 30 | 150 | 0 | 0 | 0 | 0 | 0 | 0 | 3 |

- **Zero illegal or fabricated actions accepted**, on all ten runs. `illegalAttempts`
  counts every answer the driver refused; `blockedFromLegal` counts every action the
  driver *did* dispatch that came back carrying an `ActionBlocked`. Both are 0, and
  the second is the enumerator-parity claim: everything the enumerator advertised,
  the engine accepted.
- **Zero crashes and zero hangs.** No `protocol-error` entry in any trail
  (`stoppedBy: 'days'` on all ten), and **zero `forced-end-day` transitions** — the
  per-day step cap never fired, so no run burned a day stuck in a loop.
- **Zero fallbacks.** Every step was decided, not defaulted.

### 2a. The number that makes the rest of this leg mean anything

A clean sheet is worth exactly as much as the game that was played under it. Here are
the two brains' verb histograms over the same 5 seeds × 30 days, side by side:

| Verb (`specType`) | `random` | `first-legal` |
| --- | --- | --- |
| `Shipyard/buy-component-tier` | 265 | 0 |
| `Wait` | 157 | 0 |
| `end-day` | 150 | 150 |
| `VisitHangout` | 147 | 0 |
| `Trade/pay-debt` | 114 | 0 |
| `Storylet/*` (71 distinct choices) | 105 | 0 |
| `Trade/buy-fuel` | 47 | 60 |
| `Trade/sign-contract` | 45 | 345 |
| `Dare` | 43 | 0 |
| `Trade/abandon-contract` | 41 | 344 |
| `Combat` | 40 | 0 |
| `Travel` | 40 | 1 |
| `Trade/haggle` | 29 | 0 |
| `Shipyard/buy-cargo-pods` | 18 | 0 |
| `Shipyard/repair` | 18 | 0 |
| `Explore` | 3 | 0 |
| `Shipyard/buy-special-equipment` | 1 | 0 |
| **distinct `specType`s** | **87** | **5** |

**`first-legal` at seed 1 signs a contract and abandons it, 75 times each, and does
nothing else for thirty days.** Its `stepsApplied` is `150` on every single seed — a
flat, seed-independent number, which is the signature of a brain that is a fixed point
of the enumerator's ordering rather than a player. Reporting "300 sim-days, zero
illegal actions" off *that* would have been `docs/TESTING-STRATEGY.md` Part A's
green-but-hollow failure one level up: a spotless record over a game nobody played.
PILOT.md §7 already said so about this brain; T-155 measured it.

That is why this task added the seeded `random` brain (`pilot.ts` `randomBrain`)
rather than running the volume leg on `first-legal`. It reaches Travel, Explore, Dare,
Combat, VisitHangout, all four shipyard verbs, five trade-desk verbs, Wait, and 71
distinct storylet choices — in the same thirty days, for the same ~0.4 s per seed.
`pilot.test.ts` now asserts a floor on that breadth so it cannot silently regress.

**One thing checked and cleared while reading the above.** The sign/abandon
oscillation costs a die each way and moves nothing: over 150 such steps, `credits`,
`debt` and `fuel` deltas summed to exactly `0` and `diceSpent` summed to `150`. It is
a dumb brain burning its hand, not a credit faucet. Recorded because a 150-step loop
in an audit trail deserves to be dismissed with a number rather than an assumption.

**One honest bound on this leg.** `truncated: true` rides on 148–176 of each random
run's ~250 steps: the `DEFAULT_TOTAL_CANDIDATE_CAP` of 60 fires often, so the brain
chose from a representative sample of the legal space, not all of it. That is the cap
working as designed (`pilot.ts` — "coverage beats depth", the round-robin fill that
keeps every advertised verb represented), and it is *recorded per step* rather than
silent, which was T-1604a's P3 finding. But it means this leg proves *every action
taken was legal*, not *every legal action was taken*. The latter is not a claim any
run of this driver makes.

---

## 3. Leg B — same-seed determinism, two independent processes · **PASS**

Two separate `node` processes, same seed, same brain, same horizon.

```
a  248 steps  sha256 b5df9dbc89525896cb9d5ec5fc380969205ce809350fbafc894c6d402e5ffe16
b  248 steps  sha256 b5df9dbc89525896cb9d5ec5fc380969205ce809350fbafc894c6d402e5ffe16
IDENTICAL — the two runs produced the same action sequence.
```

**This check would have been wrong if it had been a `diff` of the two files, and the
distinction is the point of the task.** The two raw JSONL files are *not* byte-identical
and never can be:

```
557927c6…  test-results/pilot/T-155-det-a/random-s7-d30-1785864217214.jsonl
7a24334a…  test-results/pilot/T-155-det-b/random-s7-d30-1785864218161.jsonl
```

`pilot-cli.ts` builds `runId` from `Date.now()`, and `run-start.startedAt` and every
step's `brain.latencyMs` are wall-clock readings. A naive file digest would report a
divergence that says nothing whatsoever about determinism — and, worse, a future
reader might "fix" it by pinning the clock in the CLI and think the harder claim had
been proved. The existing in-process test (`pilot.test.ts`, T-154) gets byte-identity
only because it pins **both** `runId` and `now`, a luxury two separate processes do
not have.

So `--compare` normalises through `actionSequence()` (`pilot.ts`), which keeps the
step ordinal, day, phase, chosen `specType` and id, the action sent, the protocol
response type, **and the engine's state delta** — and drops exactly the three volatile
fields named above. Including the delta is deliberate: the claim is *the same seed
produced the same game*, not merely *the brain named the same ids*. And because a
normaliser that dropped too much would pass forever, `pilot.test.ts` asserts **both**
halves: two trails differing only in `runId`/`startedAt`/`latencyMs` normalise equal,
and a single mutated action parameter still diverges at the right index.

---

## 4. Leg C — the reproducibility lever · **PASS**

Leg B's trail `det-a` was fed back through `--brain recorded` at the same seed, and
the replay's action sequence compared to its source:

```
a  248 steps  sha256 b5df9dbc…   (random,   seed 7)
b  248 steps  sha256 b5df9dbc…   (recorded, seed 7, replaying a)
IDENTICAL — the two runs produced the same action sequence.
```

`recordedBrain`'s docstring calls itself *"THE REPRODUCIBILITY LEVER (T-155)"*. This
is that claim cashed. It matters because it is what bounds the one leg that is
genuinely unpinned: an LLM run cannot be re-rolled to the same answers, but its trail
replays exactly, so a finding made in a live run stays re-checkable after the fact.

---

## 5. Leg D — the live Anthropic brain · **BLOCKED, not skipped**

**Not run. No result is claimed for it, and no substitute was run in its place.**

`ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` are both unset in this environment and
there is no `ant` binary on `PATH` (both checks are in the committed console
transcript). Credentials were not sourced from anywhere else: a Claude Code OAuth
token exists in the macOS keychain and was deliberately **not** touched — that is a
personal subscription credential, not the sanctioned auth path `pilot-anthropic.ts`
documents, and harvesting it would make the run's provenance a lie.

**What this leaves unproven, precisely:**

1. `packages/sim/src/pilot-anthropic.ts` **has never executed against the live API.**
   Not by this task, and not by any test — `pilot.test.ts` states in its own header
   that it deliberately does not import that file.
2. Its request shape is therefore unvalidated end-to-end: `output_config: { effort,
   format: { type: 'json_schema', schema } }` as siblings, the `enum`-of-candidate-ids
   schema, and the `cache_control: { type: 'ephemeral' }` system block. A 400 on any
   of those would be a **T-154 defect**, not an environment problem.
3. The caching claim in that file's header — *"watch `cache_read_input_tokens` go
   non-zero from about step 2"* — is unmeasured.
4. The **cost ledger** the same header says T-155 would build off the per-step `usage`
   does not exist, because there are no `usage` records to build it from.

Filed as **F-155-1** in `TASKS.md` with the owner named. Consequently this task is
**not** being marked `DONE`: three green deterministic legs are real evidence that the
*driver* is sound, and they are not evidence that the *LLM pilot* is, which is what
the task's title claims. The gap is stated rather than papered over, per the task's
own instruction that a run must not "silently pass on a lucky match."

### What IS bounded about the nondeterminism, even unrun

| Thing | Pinned? | Evidence |
| --- | --- | --- |
| Seed and engine RNG | **Yes** — serialized in `GameState.rngState` | Legs B and C |
| Candidate enumeration, ordering and cap behaviour | **Yes** | Leg B; `pilot.test.ts` "assigns stable ids" |
| The day loop and the fallback rule | **Yes** | Legs A–C, zero fallbacks and zero forced end-days |
| `randomBrain` | **Yes** — seeded (`SeededRng`), decorrelated from the engine's stream by a fixed salt, no `Math.random`, no clock | Leg B, two processes |
| `runId`, `startedAt`, `brain.latencyMs` | **No — and normalised away**, with the reason stated in §3 | `pilot.test.ts`, both halves |
| **LLM sampling** | **No.** | — |

The last row is bounded three ways, none of which depend on the model behaving: the
`json_schema` `enum` makes an out-of-set answer **structurally impossible at the API**;
`resolveDecision` + `assertCandidateIsLegal` **reject rather than coerce** anything
unmapped, so a fabricated action cannot reach the engine even if the API contract
changed under us; and `--brain recorded` **replays any live trail exactly** (Leg C),
so an unpinned run is still re-checkable. What is *not* bounded is whether two live
runs of the same seed agree — they may not, and that is a property of sampling, not a
defect to be fixed.

---

## 6. What this run says nothing about: the UI

**This is a protocol/state-level driver. It cannot see UI-only bugs by construction,
and nothing in this document is evidence about `packages/ui/`.**

Restated here rather than assumed known, because a green run report is exactly the
artifact someone cites later for more than it covers. The citation is PILOT.md §2 and
the UGT after-action report's addendum (§6, 2026-07-31): a same-day independent
assessment of a sibling game found that its HTTP-bridge-driven tier — structurally the
same shape as this one — missed the single worst bug in its registry, a client-crashing
type error that broke first load for every player, caught only by an out-of-band real
browser audit. **`T-162` is the open owner of that gap.** It complements this task and
does not substitute for it, nor the reverse.

---

## 7. Findings

| # | Finding | Status |
| --- | --- | --- |
| **F-155-1** | The live `--brain anthropic` leg has never run. `pilot-anthropic.ts`'s request shape, its prompt-cache claim and its cost ledger are all unvalidated against the real API. Needs an `ANTHROPIC_API_KEY` from the owner. | **OPEN** — blocks T-155's own closure |
| **F-155-2** | The pilot CLI resolved relative `--out`/`--replay` paths against `process.cwd()`, which for an npm workspace script is `packages/sim/` — while the *default* output directory is built from the repo root. PILOT.md §1's own documented replay command could therefore never find the file its own documented run had just written. | **FIXED** in this task — `resolveFromRepoRoot` in `pilot-cli.ts`, with a regression test |
| **F-155-3** | T-154's Delivered note in `TASKS.md` claimed three deterministic brains including a `random` one. `pilot.ts` shipped `firstLegalBrain` / `scriptedBrain` / `recordedBrain`, and `pilot-cli.ts`'s `BRAIN_NAMES` never listed `random`. The note described a brain that did not exist. | **FIXED** in this task — dated correction on T-154's note; the brain the note described now exists and is wired into `resolveBrain` |

None of the three is a game-rules defect. **No gameplay constant, content instance,
balance band, fingerprint or persisted save shape was touched by this task.**
