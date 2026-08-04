# The native LLM pilot — driving the player's seat over the protocol seam (T-154)

A driver that puts a model in the **player's** chair and has it pick one action per
step off the engine's own `legal-actions` enumerator, in-repo, with no dependency
on the external UGT package. It is the Tier-2 half of `docs/TESTING-STRATEGY.md`
Part D.

- **Pure core** — `src/pilot.ts`. Candidate enumeration, the decision gate, the day
  loop, the JSONL shape, the `actionSequence` normaliser, and four deterministic
  brains (`first-legal`, `random`, `scripted`, `recorded`). No I/O, no clock, no
  `Math.random`; the transport and the clock are injected.
- **Live brain** — `src/pilot-anthropic.ts`. The only file in the repo that talks
  to the Anthropic API. Nothing else imports it, and no test does.
- **CLI** — `src/pilot-cli.ts`. argv, the transport wiring, the JSONL file, the
  exit code. Same pure/IO split as `balance/sweep.ts`.

---

## 1. How to invoke a run

From the repo root:

```sh
# Deterministic smoke run — no API calls, no key, costs nothing. Three verbs (§7).
npm run pilot -- --seed 1 --days 30

# The deterministic COVERAGE run — same cost, ~87 distinct verbs over 5 seeds (§7).
npm run pilot -- --brain random --seed 1,2,3,4,5 --days 30

# The live Tier-2 pass.
ANTHROPIC_API_KEY=... npm run pilot -- --brain anthropic --seed 1 --days 30

# Byte-exact replay of a previous run's decisions.
npm run pilot -- --brain recorded --replay test-results/pilot/<runId>.jsonl --seed 1

# The same-seed determinism check (T-155). Exits 1 on divergence, naming the step.
npm run pilot -- --compare test-results/pilot/<runA>.jsonl test-results/pilot/<runB>.jsonl
```

**Every path flag anchors on the repo root** (T-155, finding F-155-2), so the commands
above work verbatim from the repo root even though `npm run pilot` executes with its
cwd inside `packages/sim/`. Absolute paths pass through untouched.

An `ant auth login` profile works with **no environment variable set** — the client
is constructed zero-arg and the SDK resolves `ANTHROPIC_API_KEY`, then
`ANTHROPIC_AUTH_TOKEN`, then the active profile. Never hardcode a key.

Other flags: `--seed` is repeatable or comma-separated, `--days` (default 30),
`--out <dir>` (default `test-results/pilot`, already gitignored),
`--max-steps-per-day`, `--edition full|demo`, `--help`.

`--compare` is a **mode, not a flag**: it takes two trails and nothing else, and
throws if a run flag is passed alongside it. Silently ignoring `--brain anthropic`
there would print a determinism verdict while the operator believed a paid run had
happened — the same class of mistake the `--brain` throw below guards.

`--brain first-legal` is the **default** so an accidental invocation costs nothing.
An unrecognised `--brain` is an error rather than a silent fall-back to the free
brain — a typo that quietly ran offline would report "the pilot passed" about a
pass that never called a model.

The CLI **exits non-zero** when `illegalAttempts`, `blockedFromLegal`,
`protocolErrors` or `diceBoundsViolations` is non-zero on any run.

---

## 2. What this does NOT cover: the UI

**This is a protocol/state-level driver. It cannot see UI-only bugs by
construction, and it must never be treated as covering `packages/ui/`.**

That is not a hedge, it is a measured finding. The UGT after-action report's
addendum (`/Users/vs7/Dev/Games/_UGT Universal Game Tester/AFTER-ACTION-REPORT.md`
§6, 2026-07-31) records a same-day independent assessment of a sibling game whose
testing tier was structurally the same shape as this one — an HTTP bridge driving
the state layer rather than the real DOM. **The single best bug in that game's
registry, a client-crashing type error in `useWorldSync.ts` that broke first load
for every player, was caught only by an out-of-band real-browser Playwright audit
run outside the bridge-driven path.** The bridge-driven tier would have missed it.
The report's conclusion is the rule this file adopts verbatim: *an HTTP/stdio
bridge is fine for cheap state fuzzing, but it must never be the tier a game trusts
as its UI-regression acceptance gate — that has to be the browser/Playwright shape,
without exception, even for a game whose "UI" is text.*

Our own T-1604a campaign was also protocol-driven, so this is not hypothetical for
this repo either. `docs/TESTING-STRATEGY.md` Part D carries the same warning beside
the Tier-2 definition.

**A real browser/DOM-level check is a distinct, still-open need.** It is not
covered by T-154, not covered by this driver, and not something a green pilot run
says anything about.

---

## 3. The no-fabrication guarantee, stated mechanically

1. Before the model is asked anything, `enumerateCandidates` reads the
   `legal-actions` response and builds a list of **concrete, fully-parameterised**
   moves. Every parameter is filled from that spec's own declared `ParamSpec`
   domain — a `die-index`/`system-id`/`contract-index`/`enum` choice, a `fixed`
   value echoed back, or a point on a deterministic ladder inside an `int` band.
2. The model is given ids and labels. Its answer is constrained at the API by a
   `json_schema` whose `actionId` is an **enum of exactly those ids**.
3. `resolveDecision` maps the answer to a candidate or refuses it. There is **no
   code path anywhere that constructs a `PlayerAction` field from a model-supplied
   value.** An unmapped answer is rejected and logged, never coerced.
4. `assertCandidateIsLegal` then re-checks every filled parameter against the live
   spec immediately before dispatch — belt and braces against a future
   *enumerator* bug, so a mis-filled parameter becomes a logged rejection rather
   than an action the engine was never offered.

Rejection reasons are typed: `unknown-candidate-id`, `unparseable`, `refusal`,
`brain-error`, `illegal-candidate`. After `maxBrainRetries` (default 2) the driver
falls back to a deterministic legal candidate — preferring **end-day** — and marks
the step `fellBack: true`. The fallback is **recorded, never silent**; that is
T-1604a's P4 finding applied here before it could recur.

`packages/sim/src/__tests__/pilot.test.ts` proves this with a **spy transport**:
four hostile brains (unknown id, prose, a thrown error, and a candidate mutated out
of its domain) each produce logged rejections and **zero `apply-action` requests
reaching the engine**.

---

## 4. What is pinned and what is not

| Thing | Pinned? |
| --- | --- |
| Seed and engine rng | **Yes** — serialized inside `GameState` (`state.rngState`), per PROTOCOL.md's replay contract. |
| Candidate enumeration and ordering | **Yes** — spec order, then declared choice order; caps fire deterministically. |
| The day loop and the fallback rule | **Yes.** |
| `first-legal`, `scripted`, `recorded`, `random` brains | **Yes** — `random` is seeded (`SeededRng`, decorrelated from the engine's stream by a fixed salt), so it is deterministic *across processes*, not merely within one. |
| Model id, effort, prompt template, system brief | **Recorded** per run (`run-start`, and `brain.model` on every step). |
| `runId`, `run-start.startedAt`, `brain.latencyMs` | **No — wall-clock, and normalised away** by `actionSequence()`. See below. |
| **LLM sampling** | **No.** |

Two live runs of the same seed **may diverge**, and that is documented here rather
than passed over. `--brain recorded` exists precisely for that: replaying a prior
run's JSONL reproduces the same action sequence byte for byte against the same
seed, which is what makes a finding re-checkable after the fact.

**Two determinism checks, and they are not interchangeable.** The in-process test in
`pilot.test.ts` pins **both** `runId` and the clock and asserts two runs produce
byte-identical JSONL. Two *separate `node` processes* cannot do that — `pilot-cli.ts`
builds `runId` from `Date.now()` — so `--compare` normalises through `actionSequence()`
first, dropping exactly the three volatile fields above and keeping the step ordinal,
the chosen `specType`/id, the action sent, the response type **and the engine's state
delta**. Keeping the delta is what makes the claim *"the same seed produced the same
game"* rather than *"the brain named the same ids"*. If either check ever fails, the
fix is to isolate the volatile field — never to loosen the assertion, and never to
widen what the normaliser drops.

**Confirmed by running it** (T-155, 2026-08-04): two independent processes at seed 7,
30 days, `--brain random` produced the identical action sequence
`sha256 b5df9dbc…` while their raw files differed, and replaying trail A through
`--brain recorded` produced that same digest a third time. Evidence:
`docs/playtests/T-155-pilot-validation.md`.

---

## 5. The three counters, and where they come from

`balance/gate.ts` `SWEEP_INVARIANT_DISPOSITIONS` records three UGT predicates as
`not-observable` by the sweep and names **T-154/T-155** as owning each. This driver
is what makes them observable:

| Counter | UGT predicate | Why the sweep cannot see it |
| --- | --- | --- |
| `blockedFromLegal` | `inv_blocked_from_legal_non_increasing` | "The sim policies form actions directly, never off the `legal-actions` enumerator", so there is no *blocked from a legal pick* event to count. Here it counts `action-result`s whose `events` carry an `ActionBlocked` — detected by scanning `events`, **not** by an error code (PROTOCOL.md § apply-action). **Must be 0**: that is the enumerator-parity claim. |
| `protocolErrors` | `inv_protocol_errors_non_increasing` | The sweep never calls `handleMessage`; a campaign produces no protocol responses at all. Here it counts `type: 'error'` responses. **Must be 0.** |
| `diceBoundsViolations` | `inv_dice_bounds` | `diceLeft` is on neither `CampaignDayStats` nor `CampaignStatsReport`. Here every summary is checked: hand size within content's `MAX_DAWN_HAND_SIZE` (imported, never restated), `spent` aligned with `dice`, every face a d20 face, and every `diceRemaining` index inside the hand. **Must be 0.** |

---

## 6. The JSONL schema

One JSON object per line, in emission order, flushed per line so a crashed run
still leaves a readable trail.

```jsonc
// header
{"type":"run-start","runId":"anthropic-s1-d30-…","seed":1,"edition":"full","days":30,
 "brain":"anthropic","model":"claude-opus-5","startedAt":1785713205792,
 "engineNote":"protocol seam (handleMessage reducer); protocol/state level only, not the UI"}

// one per decision
{"type":"step","n":12,"day":4,"phase":"DAY",
 "candidateCount":37,"truncated":false,
 "chosen":{"id":"a07","label":"Travel {destinationId=2, spendDie=0}","specType":"Travel",
           "specIndex":3,"note":"Only destinations the current tank can reach are listed; …"},
 "action":{"type":"Travel","destinationId":2,"spendDie":0},
 "lifecycle":null,
 "brain":{"kind":"anthropic","model":"claude-opus-5","reason":"…","latencyMs":1420,
          "meta":{"usage":{"input_tokens":…,"output_tokens":…,"cache_read_input_tokens":…},
                  "stopReason":"end_turn"}},
 "rejected":[],                       // [{"raw":"…","reason":"unknown-candidate-id"}] when not
 "fellBack":false,
 "response":"action-result","events":[…],
 "blocked":false,"blockReason":null,
 "before":{"day":4,"phase":"DAY","credits":1000,"debt":25000,"fuel":300,"systemId":1,
           "diceRemaining":[0,1,2,3,4]},
 "after":{"day":4,"phase":"DAY","credits":1000,"debt":25000,"fuel":272,"systemId":2,
          "diceRemaining":[1,2,3,4]},
 "delta":{"credits":0,"debt":0,"fuel":-28,"diceSpent":1,"systemChanged":true}}

// day-loop transitions the brain does not choose
{"type":"lifecycle","n":1,"day":4,"transition":"start-day","response":"state-summary",
 "before":{…},"after":{…}}
// `forced-end-day` means the per-day step cap fired — a stuck day, said out loud

// a typed protocol error (must never appear)
{"type":"protocol-error","n":88,"day":9,"request":"apply-action","code":"apply-failed","message":"…"}

// footer
{"type":"run-summary","runId":"…","stepsApplied":150,"illegalAttempts":0,"fallbacks":0,
 "blockedFromLegal":0,"protocolErrors":0,"diceBoundsViolations":0,
 "daysPlayed":30,"finalDay":31,"stoppedBy":"days","brain":"anthropic",
 "model":"claude-opus-5","seed":1}
```

`stoppedBy` is `days`, `stop-signal` (PROTOCOL.md's
`{ actions: [], canWait: false, lifecycle: [] }` — a Nemesis crossing or an expired
demo licence) or `protocol-error`.

---

## 7. Deliberate omissions

- **No stdio-subprocess transport.** PROTOCOL.md § Transports is explicit that
  stdio and WebSocket are the *same reducer* behind bytes, and `runStdioAdapter`
  already has its own coverage in `src/__tests__/protocol.test.ts`. Spawning a
  subprocess would add flake and prove nothing new. The transport is an injected
  interface, so a subprocess shell is a five-line addition if it is ever wanted —
  and the injectability is also what makes the "nothing illegal was dispatched"
  test possible at all.
- **No browser/DOM tier.** See §2. That is a separate, still-open need, owned by
  `T-162`.
- **The `first-legal` brain is a smoke check, not a coverage pass** — and T-155
  measured how narrow. Over 5 seeds × 30 days it touches **5 distinct `specType`s**,
  and at seed 1 it touches **three**: it signs a contract and abandons it 75 times
  each and does nothing else for a month, spending its whole hand every day on a loop
  worth exactly 0 credits. Its `stepsApplied` is a flat `150` on every seed, which is
  the signature of a fixed point of the enumerator's ordering rather than a player.
  It proves the loop is sound and the counters are clean; it says nothing about verb
  breadth. **Do not run a volume/audit leg on it** — a spotless record over a game
  nobody played is `docs/TESTING-STRATEGY.md` Part A's green-but-hollow failure one
  level up. `--brain random` is the free breadth leg (87 distinct `specType`s over
  the same seeds and the same ~2 s), and the live brain is the judgement leg.

---

## 8. Scope note

**T-154 built this driver. T-155 (2026-08-04) is where it was run for real.** The
result is on record at `docs/playtests/T-155-pilot-validation.md` and it is a partial
pass, deliberately: **three deterministic legs green** (300 sim-days over 2 brains × 5
seeds × 30 days with every counter at zero and zero forced end-days; same-seed
determinism across two independent processes; recorded-replay identity) and **the live
`--brain anthropic` leg BLOCKED and never run** for want of credentials — so
`pilot-anthropic.ts`'s request shape, its prompt-cache claim and its cost ledger are
still unvalidated against the real API (finding **F-155-1**).

So: a green *deterministic* pilot run is now evidence that the driver is sound and
that the seed it walked produced only legal, non-blocked actions. It is **not** yet
evidence that the LLM pilot works, and it is **never** evidence about the UI.
