# TODO — open work harvested out of completed task blocks

Every entry here came out of a `TASKS.md` block that has been (or is about to be) pruned. The
bracketed `harvested:` marker at the end of each entry is load-bearing provenance — an
automated step greps for those literal strings before anything is deleted. **Never reword a
marker.** Reword the prose freely.

Items substantial enough to be their own work item live in `TASKS.md` as `T-163`+ instead; this
file carries the smaller findings, gaps, deferrals and notes.

Sections are by kind, matching the triage tag each item was harvested with. When adding a new
item, put it in the section where comparable work already lives.

---

## Defects — filed, not fixed

- **FLAKE · `e2e/visual-identity.spec.ts:269` ("the wire cap reserves its own space and never
  overlaps the ticker") fails intermittently on the FIRST geometry assertion**
  (`capBox.x + capBox.width <= trackBox.x + 1`, spec line 285). Measured by T-252 (2026-08-06):
  **1 failure in 4 repeats on the working tree, and 1 flaky in 6 repeats on a STASHED baseline**
  — i.e. it reproduces with T-252's diff removed, so it is pre-existing and motion-unrelated. It
  passes on Playwright's retry every time, so the suite reports it as `flaky`, not `failed`, and a
  normal `npx playwright test` run stays green (207 passed, 1 flaky). Signature: the two
  `boundingBox()` reads are taken immediately after `expect(cap).toBeVisible()`, with no wait for
  the wire's own layout to settle after the ticker text mounts — a measurement race, not a
  geometry regression (the same assertion is deterministic once the row has laid out). Likely fix:
  await a stable box (`toHaveBoundingBox`-style poll, or wait for `.wire-track` to report non-zero
  width twice in a row) before measuring, rather than widening the `+ 1` tolerance — **never widen
  the tolerance, that is the assertion**.
  *Deferral analysis (Bug Discovery Policy rule 3):* (a) OUT OF SCOPE for T-252 — it is a
  measurement race in the T-217 wire-cap geometry spec, proven to reproduce without T-252's diff,
  and T-252 touches neither the wire nor any layout rule (`.ticker`'s only motion is the AMBIENT
  `tick` loop, deliberately unscaled and identical at every tier). (b) NO DEBT ROLL-UP — nothing in
  T-252 or T-251 builds on or routes around wire geometry, and no test was adjusted to accommodate
  it; the fix is local to one spec's measurement discipline and will not get harder for having
  waited. [found: T-252 gate run]

- **Three NPC/Hangout defects ride the still-unruled cast question**, all re-measured at T-150
  (2026-08-01) and all three still open: (1) the `executeSocialize` faucet mints
  **+3.44cr/captain-day = 0.22%** of terminal NPC wealth against no counterparty — deferred by
  owner ruling D3 as <0.3% and not worth breaking `resolveNpcDay`'s single-NPC-mutation model;
  (2) T-149's `hasHangout` gate fixed the FICTION and not the VERB — the off-Hangout Socialize
  share is unmoved at **37.97%**; (3) the 150cr socialize ante
  (`packages/engine/src/npc.ts:1831`'s undocumented inline `+ 50` over `NPC_BROKE_CREDITS = 100`)
  locks out **17.49%** of live captain-days, five-sixths of that from the inline `+ 50` rather
  than the named floor — explicitly deferred with the cast question by owner ruling (D3 row,
  2026-07-31). [harvested: T-130/hangout-npc-deferred-defects]

- **F-150-2 — `smugglerPolicy` carries a byte-identical copy of F-116-1's unguarded Explore
  loop** (**3,891 of 23,192** Explores queued on a recovery dawn). The fix was written,
  MEASURED, and deliberately backed out: it re-seeds that policy's stream onto a pre-existing
  five-day stall in the SHARED `planPacifistCombat`, tripping the poverty-trap invariant, and
  root-fixing that means editing a planner five policies share (moves every fingerprint). Pinned
  by an explicit tripwire test so it cannot be closed by accident; recorded in
  `docs/EXPLORE_REDESIGN.md` §10.3 and marked **Do NOT touch** by T-157/T-158. Full scope and the
  tripwire's path are carried by the `TASKS.md` entry harvested from T-150.
  [harvested: T-130/f-150-2-smuggler-explore-loop]

- **Off-Hangout Socialize share measured at 37.97%** — T-149's `hasHangout` gate fixed the
  FICTION, not the VERB: NPCs still socialize where no Hangout exists, only with re-flavored
  text. Deferred alongside the VisitHangout parity row (`docs/HANGOUT_REDESIGN.md` §11.4),
  unruled. [harvested: T-150/socialize-verb-off-hangout]

- **The 150cr socialize ante** (`npc.ts:1831`'s undocumented inline `+ 50` over
  `NPC_BROKE_CREDITS = 100`) locks out 17.49% of live captain-days, five-sixths of that
  attributable to the inline `+ 50`. Deferred with the cast question and re-measured at T-150;
  still unruled. [harvested: T-150/socialize-ante-150cr]

- **F-137-1 and F-137-2 — the Liar's Dice dealer volunteers a certain loss.** F-137-1
  (`docs/LIARS-DICE_REDESIGN.md` §16.2): the baseline planner's opening claim is guaranteed true
  by construction (15,235/15,235) and the dealer's terminal fallback is CHALLENGE, so the house
  volunteers a certain loss on 90.48% of its decisions and loses 94.68% of them; gambler
  `finalCredits.median` 56,686 → 94,798 (+67.2%). F-137-2 (§16.6): §7.5's interceptor lift GREW
  (gambler wronged-captain share 29.28% → 47.50%) as a symptom of F-137-1, while the lift over
  *uniform* slipped 2.956× → 2.623×. **Was carried verbatim by T-160, which is now DONE and pruned (2026-08-06 harvest; see the Completed ledger in `TASKS.md`)** — this entry is now the sole live carrier,
  with the call sites (`planDareMove` branch (b) at `packages/sim/src/index.ts:~3593-3607`,
  `dealerMove`'s fallback at `packages/engine/src/liarsDiceRules.ts:~345-350`) — this entry is a
  provenance anchor, not a second filing. [harvested: T-137/F-137-1-F-137-2]

- **F-148-1 · archetype ordering is INVERTED — `optimal` is the softest seat in the game.**
  Player win rate 84.69% vs `optimal` (n 42,494) vs 68.78% vs `bad` (n 9,054), z = −30.76
  (replicated in Arm 1 at z = −12.88); `optimal` (84.69%) is softer than the *undesigned* roaming
  dealer (76.91%). REPORTED, NOT FIXED (`docs/LIARS-DICE-PROGRESSION_SPEC.md` §12.2/§12.9).
  Mechanism traced to F-137-1's guaranteed-true opener, not to `archetypeMove`. Partially owned:
  T-160 carried the post-fix archetype-ordering re-check in its Accept clause and said a
  surviving inversion is a distinct finding; T-160 is now DONE and pruned, and its re-check was
  discharged by T-175 (ruling LD-25). F-148-1 itself is still closed by no task.
  [harvested: T-148/F-148-1]

- **F-148-3 · the roster is the softer AND richer pool, which is backwards for a gauntlet.**
  Pool A supplies 57.04% of hands and 60.23% of the money, at a win rate 5.5 pp higher and an
  EV/hand 14% higher than pool B; a fixed roster of named characters with authored bankrolls
  reads as the *challenge* content but measures as the *easy* content. REPORTED, NOT FIXED
  (`docs/LIARS-DICE-PROGRESSION_SPEC.md` §12.9). Shares F-148-1's root and recommendation (close
  F-137-1 first, then re-read) — but unlike F-148-1 it is named in NO task's Accept, including
  T-160's. [harvested: T-148/F-148-3]

- **F-151-1 · `packages/content/src/components.ts:164` prose says the GRIT-1 life-support save is
  "9+ (55%)".** It is 60% (12/20); 55% is the GRIT-0 figure (the `"9+"` and the GRIT-4
  `"6+ (75%)"` are both correct). Found independently by all four T-151 reviewers; filed, not
  fixed, because T-151 touched no content source. VERIFIED STILL PRESENT at that exact line. It
  is a comment, so the fix moves no fingerprint, band, threshold or golden.
  [harvested: T-151/F-151-1]

- **F-151-8 · `TASKS.md`'s M6 header prose says player stats are "rolled once at character
  creation."** They are hard-coded literals (`state.ts:147-153`); nothing rolls them. OPEN — a
  prose correction for the owner, and the same wrong framing must not be copied into any
  successor doc. [harvested: T-151/F-151-8]

- **F-151-3 · `applyUniqueItem` (`packages/engine/src/exploreOutcomes.ts:226-231`) dispatches on
  `item.class` with `if`/`else`**, and the `never` guard sits only on the inner `delta.element`
  switch, so a third class arm would fall through silently. The spec marks this "CLOSED by this
  spec" only in the sense that §7 makes the `switch (item.class)` + `never` default conversion a
  prerequisite commit for candidate A — with the verdict at C, that refactor is unscheduled and
  the latent fall-through remains in shipped code. [harvested: T-151/F-151-3-latent]

- **F-153-1 · the `deep` job's nightly cron in `.github/workflows/sweep-gate.yml` has never fired
  and cannot fire from this branch.** GitHub schedules `cron:` only from the repository's DEFAULT
  branch, and `git ls-tree origin/main --name-only .github/workflows/` answers `ci.yml` and
  `e2e-flake.yml` only. `gh run list --workflow=sweep-gate.yml` shows three runs (30704361829,
  30704751032, 30704784303), all `redesign/explore-hangout` / event `push`. The PUSH half of
  T-152's wiring is proven live; the SCHEDULED half is inert until this branch merges to `main`
  (zero-line fix — the file merges as-is). Re-check when `redesign/explore-hangout` merges: the
  first `schedule`-event run in `gh run list --workflow=sweep-gate.yml` closes it.
  [harvested: T-153/F-153-1]
  **T-163 annotation — F-153-1 must NOT be assumed closed by T-163.** T-163 confirms the `deep`
  job's nightly `cron:` in `.github/workflows/sweep-gate.yml` is UNCHANGED and is not fixable by a
  trigger widening: `cron:` fires only on the default branch regardless of `push.branches: ['**']`.
  Recorded as an accepted cost in `docs/TESTING-STRATEGY.md` Part H. No new backlog entry is owed —
  only this correction. [harvested: T-163/f-153-1-cron]

- **F-157-2's upstream remainder is STILL LIVE at HEAD and its named repair can no longer fire.**
  `docs/NPC_REDESIGN.md`'s PARITY LEDGER `| VisitHangout |` row still reads "Three defects found
  while ruling it, all still true" quoting `+4.86cr/captain-day` and `95.91%`, and the same
  ruling-time figures are restated in the body (the `executeSocialize` is a pure FAUCET / 95.91%
  paragraphs), while `docs/HANGOUT_REDESIGN.md` §11.4 re-measured them at `+3.44cr / captain-day`
  (0.22% of NPC wealth) and `37.97%`, plus a newly-quantified `17.49%` ante lockout. T-157
  deliberately left the row unedited because THE RULING option (A) would have re-written it — but
  the owner closed via option (B), so nothing ever repaired the prose.
  `packages/sim/src/balance/coverage.ts` and `docs/TESTING-STRATEGY.md` Part G were fixed; the
  ledger prose was not. [harvested: T-157/npc-redesign-stale-magnitudes]

- **The live `--brain anthropic` leg has never been run**, so `packages/sim/src/pilot-anthropic.ts`
  — the only file T-154 shipped that talks to the real API — is unvalidated: its
  `output_config: { effort, format: { type: 'json_schema', schema } }` request shape, its
  `enum`-of-candidate-ids schema, its `cache_control: { type: 'ephemeral' }` prompt-cache claim and
  its per-step `usage` cost ledger. A 400 on any of them is a **T-154 defect, not an environment
  problem**. OWNER-GATED — needs an `ANTHROPIC_API_KEY`: re-run
  `npm run pilot -- --brain anthropic --seed 1 --days 30`, then a second run at the same seed to
  characterise divergence, and confirm `cache_read_input_tokens` goes non-zero from ~step 2. Still
  live per `packages/sim/PILOT.md` §8 and as finding **F-155-1**. T-155 re-filed it unchanged and
  adds: the file has NO test coverage BY DESIGN (`packages/sim/src/__tests__/pilot.test.ts` states
  it deliberately does not import it), the second run must be at the SAME seed so divergence is
  characterised honestly, and if `cache_read_input_tokens` stays zero the caching claim in that
  file's header is FALSE and that is a SECOND finding. Single filing — do not double-file.
  [harvested: T-154/f-155-1-live-anthropic-leg] [harvested: T-155/F-155-1]

- **T-160's `quantity.max` fix is asserted only at the one tier where the fix is invisible.**
  `packages/sim/src/protocol.ts:611` now advertises the dare `quantity.max` as `hand.maxQuantity`
  instead of a hardcoded `8`, but the sole assertion
  (`packages/sim/src/__tests__/protocol.test.ts:710`) runs against `openDareHand()` (line 171,
  `createInitialState(9)`, tier 0, `dicePerSide = 4`) where `hand.maxQuantity` **is** 8 — a
  regression to the literal `8` passes it unchanged, so the guard is vacuous against the exact
  defect it was written for (`docs/LESSONS.md` L-016). The only tier ≥ 1 protocol-domain tests in
  that file (`protocol.test.ts:1590` and `:1613`, T-168) cover the VisitHangout wager band, not the
  dare quantity ceiling. Needs an advertised-bounds assertion on a hand at a tier where
  `maxQuantity` is 10 or 12. [harvested: T-160/protocol-quantity-max-vacuous-at-tier-0]

- **The advertised opening-floor refusal branch in the same test NEVER EXECUTES.** The "…and the
  advertised floor is REAL: a claim one under it is refused" check is guarded by
  `if (minOpeningQuantity(leanestFaceCount) > 1)` at
  `packages/sim/src/__tests__/protocol.test.ts:714`; `leanestFaceCount` is the min over all six
  faces of the player's dice count, and the tier-0 fixture holds 4 dice over 6 faces, so by
  pigeonhole some face always has count 0, `minOpeningQuantity(0) === 1`, and the branch is dead.
  The opening floor's refusal is therefore unasserted **at the protocol seam** (it IS covered
  engine-side by the T-160 block in `packages/engine/src/__tests__/liarsDice.test.ts`). Either
  drive the check from a hand that covers all six faces, or assert the branch's non-vacuity.
  [harvested: T-160/protocol-opening-floor-refusal-branch-unreachable]

- **Stale directive comment in `packages/engine/src/actions/travel.ts:122-126`.** It still reads
  "NOT YET RE-CAPSTONED … implement now, run the balance sweep + re-pin later. Do not commit this
  past the gate until that capstone lands; `balance-smoke.test.ts` / `balance-targets.test.ts` are
  EXPECTED to report a stale fixture until then." That capstone landed inside T-195 itself
  (`docs/balance/baseline-t195-dawn-dice.json`), and the baseline of record has since moved on
  (`baseline-t199-pacifist.json`, then T-196a's). The paragraph now instructs a reader to withhold
  a commit for a re-pin that already happened, and licenses a stale-fixture failure that should no
  longer be tolerated. Delete or rewrite it to record the capstone as done.
  [harvested: T-195/travel-ts-stale-capstone-directive]

---

## Gaps — checks, coverage and measurements that do not exist

- **Two of the three NPC-side VisitHangout defects T-101 ruled DEFERRED
  (`docs/HANGOUT_REDESIGN.md` §5) are still unfixed:** the `executeSocialize` faucet's mint
  (`packages/engine/src/npc.ts`, `NPC_SOCIALIZE_WIN_CREDITS = 150` /
  `NPC_SOCIALIZE_LOSS_CREDITS = 50` in `packages/content/src/ideals.ts`) paid against no
  counterparty, and the 150cr ante (`npc.ts:1831`'s inline `+ 50` over
  `NPC_BROKE_CREDITS = 100`) that locks out destitute captains. The third (`hasHangout` gate)
  shipped at T-149 but fixed the fiction, not the verb — the off-Hangout Socialize share is
  unmoved at 37.97%. All three ride the still-unruled owner cast question, and are mirrored in
  `TASKS.md`'s standing "Deliberately deferred" list with T-150's re-measured numbers.
  [harvested: T-101/hangout-npc-defects-two-of-three]

- **No automated check enforces the dusk credit-mutation ordering invariant** that
  `packages/engine/src/day.ts:1222` asserts in prose ("The T-111 RECOVERY PAYOUT immediately
  above is the LAST credit mutation of the dusk"). T-102's directives D2 and D4 both had to
  hand-fix invariant comments that a code change had falsified (D2: `dice.ts`'s "nothing here or
  at any call site changes" comment; D4: `day.ts:1039–1043`'s floor comment). Write the check: a
  test in `packages/engine/src/__tests__/day.test.ts` that fails if any credit mutation is
  inserted after the subsistence floor block in the dusk sequence, so the next insertion is
  caught by CI rather than by a reader trusting a comment. [harvested: T-102/dusk-ordering-check]

- **Write the check that closes T-114's §4.4 rule ("a committed find the player cannot see is a
  trap"):** an exhaustive test that EVERY `ExploreOutcomePayload` kind produces a non-null line
  from `explorationOutcome` in `packages/ui/src/format.ts`. Today only per-kind examples exist
  (`packages/ui/src/__tests__/format-modules.test.ts`,
  `packages/ui/src/__tests__/format-recovery.test.ts`), so a newly added payload kind with no UI
  clause would ship silently. The content-side counterpart already exists
  (`packages/engine/src/__tests__/exploreContent.test.ts` asserts every row's `wireFound` is
  non-empty and unique); the UI-side exhaustive counterpart does not.
  [harvested: T-114/explore-ui-clause-exhaustive-check]

- **Explore's re-pricing levers (`EXPLORATION_FUEL_COST` 80, `EXPLORATION_NAV_DC` 12) remain an
  UNRULED owner call.** T-116 deliberately did not tune them, and `docs/EXPLORE_REDESIGN.md`
  §10.4 re-asks the Explore parity-ledger row still unruled. Currently carried only inside the
  T-157 UAT pre-brief and the R-series/PARITY-LEDGER row in `TASKS.md`; it must survive T-116's
  deletion. [harvested: T-116/explore-repricing-owner-call]

- **The "engine contains no port-specific branch" guarantee is verified only by hand.** T-120's
  Accept was a manual `grep` for `Sun-3` / `systemId === 1` in
  `packages/engine/src/actions/hangout.ts`, and T-123's was a manual
  `git diff --stat HEAD -- packages/engine/src ':!packages/engine/src/__tests__'`. No automated
  check exists — `packages/engine/src/__tests__/hangoutRules.test.ts` and
  `packages/engine/src/__tests__/hangoutContent.test.ts` assert content shape and accessor
  behaviour, not the absence of a port id in the resolver. Write the check: a test (natural home:
  `hangoutRules.test.ts`) that scans `packages/engine/src/actions/hangout.ts` for a port id
  literal or port-specific branch and fails if one appears.
  [harvested: T-120/hangout-engine-no-port-id-check]

- **F-150-1 — the 0.25 named-pool gate + `DISPOSITION_DECAY_INTERVAL_DAYS = 3`, read together.**
  T-125's lever 1 was never pulled: `packages/engine/src/actions/travel.ts:394` and
  `packages/engine/src/content/disposition.ts` mean three quarters of interceptions cannot see
  disposition at all and 69.56% of the rest are inert draws. Already carried by T-158's Accept
  (recorded owner ruling required) and by `docs/HANGOUT_REDESIGN.md` §11.3's levers-not-pulled
  table — this entry is the provenance anchor, not a second filing.
  [harvested: T-125/f-150-1-ruling]

- **Write the two-arm differential-probe recipe into `docs/BALANCE-POLICY.md`.** It exists
  nowhere as a check or a policy today (grep of `docs/BALANCE-POLICY.md` and
  `docs/TESTING-STRATEGY.md` finds no `worktree`/`node_modules` rule): each arm in its own
  `git worktree` with its **own** `node_modules` and its own `tsc -b` output, plus the N/N
  fidelity-channel MATCH and a byte-identical control policy set as the validity proof. Until it
  is written down, the knowledge lives only in `docs/HANGOUT_REDESIGN.md` §10.1.
  [harvested: T-125/two-arm-probe-recipe]

- **The two vacated PARITY LEDGER rows — Explore and VisitHangout (`docs/NPC_REDESIGN.md:228`,
  `:229`) — are STILL DEFERRED and UNRULED.** T-130 ruled them deferred until T-150's re-ask;
  T-150 (2026-08-01) made the re-ask against the finished systems with fresh numbers beside each
  row (`docs/HANGOUT_REDESIGN.md` §11.4, `docs/EXPLORE_REDESIGN.md` §10.4) and both rows remain
  the owner's call. This is what un-gates **N8**; no N-series task status has been changed.
  [harvested: T-130/parity-ledger-rows-unruled]

- **Two Liar's Dice channels the T-137 capstone left structurally unmeasured, picked up by no
  open block** (`docs/LIARS-DICE_REDESIGN.md` §16.8 items 3 and 4): the Peek
  (`DARE_PEEK_DC = 12`) has never been exercised by any arm, so whoever gives the baseline
  planner a Peek owes the measurement; and the **player-side** RAISE BOTH is 0 by construction
  (§12.5), measured only dealer-side at 23.18% of dealer raises. §16.8 items 2, 5 and 6 were carried by T-160,
  now DONE and pruned — they are discharged; items 3 and 4 (the Peek `DARE_PEEK_DC = 12` and the
  player-side RAISE BOTH channels) remain open and are carried by this entry.
  [harvested: T-137/liars-dice-unmeasured-channels]

- **Write the check that enforces the `T-144 §4.6` two-call-site rule for `liarsDiceTier`.**
  Today it is enforced only by source comments (`packages/engine/src/liarsDiceRules.ts:171`,
  `packages/engine/src/actions/hangout.ts:343`, `packages/ui/src/format.ts:452`/`:507`); nothing
  in `npm test` or lint fails when a third call site is added, even though the spec calls a third
  call site a bug. [harvested: T-146/liars-dice-tier-callsite-guard]

- **A casual-dice policy is missing, so every ladder-pacing number in
  `docs/LIARS-DICE-PROGRESSION_SPEC.md` §12.1 is an UPPER BOUND with nothing to interpolate
  against.** `planDare` has exactly one call site (`gamblerPolicy`), so seven of the eight
  shipped sweep policies play **zero** hands. A casual-dice policy sitting between 1.415
  hands/day and zero would turn §12.1's analytic read-across (`day 80/k`) into a measurement
  instead of an extrapolation. Stated as a bounded limitation, owned by nobody.
  [harvested: T-148/casual-dice-policy]

- **The 150cr socialize ante in `executeSocialize`** (`packages/engine/src/npc.ts`, the
  `npc.credits < NPC_BROKE_CREDITS + 50` guard, originally cited as `npc.ts:1831`'s inline `+ 50`
  over `NPC_BROKE_CREDITS = 100`) locks destitute captains out of the verb entirely. T-149
  explicitly deferred it — "the 150cr socialize ante rides the T-150 parity-ledger re-ask
  instead" — and T-150 re-measured it at **17.49% of live captain-days** but left it **STILL
  DEFERRED — UNRULED, owner's call**. Nothing has closed it; it is carried only by the
  Explore/VisitHangout parity-ledger rows (`docs/HANGOUT_REDESIGN.md` §11.4,
  `docs/NPC_REDESIGN.md`), which also un-gate **N8**. [harvested: T-149/socialize-ante-lockout]

- **T-149 fixed the FICTION, not the VERB:** NPCs still *perform* Socialize at
  `hasHangout: false` ports — `hasBar` selects prose only, and both branches pay the identical
  `NPC_SOCIALIZE_WIN_CREDITS`/`NPC_SOCIALIZE_LOSS_CREDITS`. T-150 re-measured off-Hangout
  Socialize at **37.97%** and the faucet at **+3.44cr/captain-day = 0.22%** of terminal NPC
  wealth. Whether the verb itself should be gated at bar-less ports rides the same unruled
  VisitHangout parity-ledger row (`docs/HANGOUT_REDESIGN.md` §11.4,
  `docs/EXPLORE_REDESIGN.md` §10.4, `docs/NPC_REDESIGN.md`).
  [harvested: T-149/socialize-verb-off-hangout]

- **F-150-1, with T-150's full measurement** — the **0.25 named-pool interceptor gate**
  (`travel.ts:389`, `actions/travel.ts`) and **`DISPOSITION_DECAY_INTERVAL_DAYS = 3`**
  (`content/disposition.ts`) read together, written up in `docs/HANGOUT_REDESIGN.md` §11.3 with a
  levers-not-pulled table. OPEN as a DESIGN QUESTION for the owner (T-125's own ruling), NEITHER
  CONSTANT CHANGED by T-150. Measured: named share 25.07% vs analytic 25.00%, inertness 71.52%,
  wronged-captain share 9.61% vs uniform 4.075% (2.358x lift); cast sits at exactly 0 on 96.52%
  of live captain-days, a standing survives a median 3 days, decay outruns interaction 1.53:1.
  Scheduled for a recorded ruling at T-158. [harvested: T-150/F-150-1]

- **The two vacated PARITY LEDGER rows (does the cast get the Explore verb / VisitHangout?) were
  RE-ASKED by T-150 against the systems as they now are** — write-ups at
  `docs/HANGOUT_REDESIGN.md` §11.4 and `docs/EXPLORE_REDESIGN.md` §10.4, ledger in
  `docs/NPC_REDESIGN.md` — and BOTH ROWS ARE LEFT UNRULED (owner's call, not T-150's). N8 and the
  N-series resumption un-gate on the owner's ruling, not on T-150; no N-series task's status was
  changed. [harvested: T-150/parity-ledger-re-asks-unruled]

- **F-140-1 (reported, not fixed; `docs/BALANCE-TELEMETRY_SPEC.md` §7.3):** a §3
  `NpcDecisionTrace` entry carries no seed and no policy, so a merged multi-shard JSONL cannot
  attribute a decision back to the career that produced it — a per-policy view is impossible.
  T-142 mitigated it in the report only (grouping by archetype × kind, file-level attribution
  parsed from `traces-<label>-shard<i>of<N>.jsonl`, stated in the page's caveat list); the
  emit-side remainder is adding seed/policy to the §3 shape if a per-policy view is ever wanted.
  [harvested: T-140/F-140-1]

- **`docs/TELEMETRY-REPORT_SPEC.md` §3's "aggregates already carry this via the smoke/capstone
  convention" — CLOSED at T-183 (2026-08-04).** The parenthetical now carries a dated correction
  (`docs/TELEMETRY-REPORT_SPEC.md:68-77`) saying it was false when written (F-142-1) and is true
  since T-183, where `packages/sim/src/balance/sweep.ts`'s `mergeShards` stamps
  `rulesFingerprint`/`instrumentFingerprint`/`gitCommit` onto the merged aggregate at write time.
  Pre-T-183 aggregates carry no stamp, are deliberately never rewritten, and correctly render
  `unknown`. [harvested: T-142/telemetry-spec-3-parenthetical]

- **F-143-1 residual: `docs/DEV-CONTROL-PANEL_SPEC.md` §1's command-inventory table is still
  stale against the real parsers** — it omits `sweep.ts`'s `--trace-npc-decisions` (T-140) and
  presents `balance:diff` as flag-only when `parseDiffArgs` requires two POSITIONAL paths
  ("Expected exactly two aggregate paths"). T-143 chose to add a correction note in the new §7.1
  rather than edit §1, so a reader of §1 alone is still misled; fold §7.1's corrections back into
  the §1 table. [harvested: T-143/spec-s1-table-stale]

- **F-151-5 · `StatBlockSchema` (`schema.ts:174-182`) has NO numeric bounds.** Safe only while
  nothing writes `player.stats`; it becomes a real save-validation hole the instant anything
  does. ESCALATED by `docs/PLAYER-TRINKETS_SPEC.md` §10 as a save-validation question, not a
  trinket question — still unruled (§11). [harvested: T-151/F-151-5]
  **PARKED BY RULING (owner, 2026-08-05).** `docs/PLAYER-TRINKETS_SPEC.md` §12.3 ruled **W1**,
  which parks BOTH F-151-5 and F-151-6: neither is due, and nothing in `TASKS.md` will still say so
  once the T-179 block is deleted. The trigger that makes both immediately due again is anything
  that opens `player.stats` for writes. [harvested: T-179/f151-5-6-parked-by-ruling]

- **F-151-6 · no existing test pins `player.stats` across a run**, so a missing clamp or a
  double-applied delta would be caught by nothing. Any task that ever writes `player.stats` must
  add that pin (named as a deliverable of the `(engine)` row in
  `docs/PLAYER-TRINKETS_SPEC.md` §13). [harvested: T-151/F-151-6]
  Parked by the same 2026-08-05 owner ruling recorded on the F-151-5 entry above
  (`docs/PLAYER-TRINKETS_SPEC.md` §12.3, W1); due the moment anything writes `player.stats`.

- **Three of the eight T-1604a invariants — `inv_blocked_from_legal_non_increasing`,
  `inv_protocol_errors_non_increasing`, `inv_dice_bounds` — are protocol-seam statements a sweep
  cannot observe.** They are declared `disposition: 'not-observable'` in
  `SWEEP_INVARIANT_DISPOSITIONS` (`packages/sim/src/balance/gate.ts`) with T-154/T-155 named as
  owner in the `why` string. Neither T-154's nor T-155's block in `TASKS.md` mentions them or
  names them in its Accept, so once T-152's block is deleted the only record of that ownership is
  a comment string inside `gate.ts`. Either add protocol-seam invariant coverage to T-155's
  Accept (the pilot runs against `packages/sim/src/protocol-stdio.ts`, the one seam that CAN
  observe them) or schedule it as its own task.
  [harvested: T-152/protocol-seam-invariants-unowned]

- **The D.2a norm ("every gate on the headline verb needs a non-empty fallback") has no automated
  check for policies outside `GATE_COMPETENT_POLICIES`.** It is documented at
  `docs/BALANCE-POLICY.md` D.2a, but `assertNoIncomeStall` in
  `packages/sim/src/balance/gate.ts` returns `[]` for `veteran` and `greedy` by design, which is
  exactly how F-159-1 sat unmeasured behind a stale "6-8 days" exemption comment. **T-161 made
  the membership call and it was NO:** with the relaxation landed the veteran's worst streak
  falls 31 → 13 but 197 of 200 seeds are still ≥ 5 (mechanism F-161-1), and seeds 1..60 — the
  exact CI `gate` sample — still hold five stalling veteran seeds (1, 18, 26, 34, 58), so it
  stays exempt on a re-justified note. That leaves the SECOND option as the live one and it is
  now the only one: write a check that every gated policy filter carries one of D.2a's two
  fallback shapes regardless of gate membership. T-161 is exactly the case for it — the
  relaxation was the last missing instance and nothing but a human audit found it.
  [harvested: T-159/d2a-check-for-gate-excluded-policies]

- **No fresh CI run was ever captured on the post-T-159 tree.** The T-153 session does not push
  and `origin/redesign/explore-hangout` is behind local, so the newest remote run of
  `.github/workflows/sweep-gate.yml` predates T-159's fix. The green claim rests on runner log
  30704784303 (which was RED) plus a local dry run of the exact CI invocation. A real green push
  run of the `gate` job on the post-T-159 tree is still unobserved.
  [harvested: T-153/no-fresh-ci-run-post-T-159]

- **The cast wealth FLOOR did not move for the FOURTH consecutive step** — at N13/T-156
  `npcCredits.p10` at day 120 reads **126 → 127**, and N10, N11 and N13 each left it where it was.
  N13's named structural cause is **N4's verb payout asymmetry**: in `NPC_CHECK_DCS` the Trade
  check carries no credit consequence, i.e. the poorest captains are exactly the ones whose verb
  outcomes a die cannot reach. `docs/NPC_REDESIGN.md`'s N13 Result calls this "the sharpened
  question N13 hands on" and says it should be read beside N12's before either is graded. No task
  carries it. [harvested: T-156/npc-p10-floor-fourth-time]

- **`SWEEP_INVARIANT_DISPOSITIONS` still names pruned task ids as the owner of three invariants.**
  In `packages/sim/src/balance/gate.ts` the three `disposition: 'not-observable'` entries
  (`inv_blocked_from_legal_non_increasing`, `inv_protocol_errors_non_increasing`, `inv_dice_bounds`)
  carry `why` strings reading "OWNED BY T-154/T-155" — blocks about to be deleted. T-154 in fact
  DISCHARGED them (`blockedFromLegal`, `protocolErrors` and `diceBoundsViolations` are measured off
  the pilot JSONL and the CLI exits non-zero if any is nonzero), so the `why` strings should be
  rewritten to name the shipped mechanism (`npm run pilot`, `packages/sim/src/pilot-cli.ts`) rather
  than a task id, and the matching entry above
  (`[harvested: T-152/protocol-seam-invariants-unowned]`) closed or re-pointed at the same time.
  [harvested: T-154/sweep-invariant-ownership-pointer]

- **No check catches a sequencing gate that is stated only in prose.** T-155's `after:` field read
  `after: T-154` alone, while the T-158 human-UAT gate existed ONLY as prose in T-154's
  resequencing note. `/orchestrate` selects on the `after:` field and never reads prose, so the
  owner's "the pilot's first real run waits for UAT" ruling was never machine-enforced — it was
  masked only by T-158 happening to halt the run first. Nothing like this exists today: `scripts/`
  holds only `check-signoff.mjs`, `prose-scan.mjs`, `tag-rc.mjs` and `verify-clean-clone.mjs`, and
  neither `scripts/` nor `.github/workflows/` parses `TASKS.md` `after:` fields at all. Write the
  check: flag any block whose prose names a blocking task id that is absent from its own `after:`
  field. [harvested: T-155/after-field-gate-check]

- **The labels F-199-1 and F-199-2 carry TWO different meanings, and the code comments use the
  SWAPPED assignment** — so whoever picks these up must keep the ids verbatim AND reconcile the
  swap rather than assume one reading. In the T-199 planner table, F-199-1 = the trader rim strand
  and F-199-2 = the fighter strand (both CLOSED by T-199); in the OPEN findings, F-199-1 = the
  veteran anti-idle wiring and F-199-2 = the fighter marker netting. But
  `packages/sim/src/index.ts:6434` labels the netting hole "F-199-1", and
  `packages/sim/src/index.ts:5623` says "F-199-1 stays filed" about the netting backout. Sites that
  point at `TASKS.md` for these definitions and will DANGLE once the T-199 block is deleted:
  `packages/sim/src/index.ts:2971`, `:5615`, `:6439`;
  `packages/sim/src/__tests__/campaign-smuggler-gambler.test.ts:741`;
  `packages/sim/src/__tests__/campaign-degraded.test.ts:1097`; `docs/EXPLORE_REDESIGN.md:1739`.
  [harvested: T-199/f199-id-collision]

- **T-199's remote Sweep-gate green is UNCONFIRMED.** Its Accept criterion — "the Sweep gate CI
  check on `redesign/explore-hangout` is confirmed green after this lands" — is discharged only by
  a LOCAL re-run of the exact CI invocation (`--label ci-gate --seeds 60 --days 35`, both shards +
  merge, 3 × exit 0, 420 rows, 0 violations). No remote run id is recorded for the green; the only
  recorded run id is the FAILING one, 30935230550 (`assertNoIncomeStall · smuggler · seed 20`,
  shard 2/2). Same class as this file's "No fresh CI run was ever captured on the post-T-159 tree"
  entry: confirm the remote `.github/workflows/sweep-gate.yml` run on the branch HEAD.
  [harvested: T-199/t199-remote-sweep-gate-unconfirmed]

- **Nine of the long-haul move table's verbs never fired on the committed wide run.** The committed
  run (`LONGHAUL_SEEDS=1,2,3,4,5 LONGHAUL_DAYS=35`) exercised **36 distinct verbs**, and the report
  NAMES the nine unfired verbs rather than implying coverage it does not have. Open remainder:
  either widen seeds/days until each unfired verb is exercised, or record per verb why it is
  unreachable under the driver's move table (`packages/ui/e2e/support/longhaul.ts`). Artifacts:
  `docs/playtests/results/T-162-longhaul-runs.json` and `T-162-run-console.txt`.
  [harvested: T-162/longhaul-unfired-verbs]

- **CI evidence for T-163 is still OWED after the push**, per `docs/ENGINEERING-POLICY.md` §3 (the
  CI-evidence rule). The T-163 block explicitly states no run has happened yet — acceptance was
  satisfied LOCALLY, by the parsed-workflow assertions in
  `packages/ui/src/__tests__/ci-workflow.test.ts` plus its negative control. Confirm with
  `gh run list --branch redesign/explore-hangout --workflow ci.yml`, then
  `gh run view <id> --log | grep -n 'Run e2e'`, and quote it verbatim. Nothing elsewhere in
  `TASKS.md` or this file records this evidence, so it is lost if the block is pruned.
  [harvested: T-163/t163-ci-evidence]

- **The F-151-9 demonstration fixture is knowingly WEAKER than a real rig, and the remainder is
  unclaimed.** The §2.3(b) rig "ran in a scratch tree and committed no per-arm aggregate"
  (`packages/sim/src/__tests__/support/gate-fixtures.ts:264`), so `TRINKET_RIG_MEDIANS` replays
  only the ONE published measure (median final credits) through `trinketRigArms()`, which makes
  every other field equal across arms by construction (`gate-fixtures.ts:289-297`). It is weaker in
  the safe direction and is paired with a real-`cleanRows()` leg, but when T-174 produces a rig
  that DOES commit per-arm aggregates, that aggregate should replace or augment the transcribed
  table so the predicate is proven against whole per-policy blocks.
  [harvested: T-167/trinket-rig-fixture-weaker-than-real-rig]

- **F-168-1 · the high-tier tables are a strong faucet, and the number is now measurable.**
  Status: REPORTED, NOT FIXED, per §12.9's house discipline. With the effective band reachable, the
  gambler's `expectedValuePerDare` is **+875.72** over 1,000 careers × 120 days (was +210.57 on the
  pre-fix control arm), `finalCredits.median` rises **80,244 → 115,612 (+44.1%)**, and
  `renownRanks.GIGA_HERO` appears on that row for the first time (134 careers; fleet 214 → 348).
  Mechanism: `preHandWagerBand` removes the tier-0 pin, so a veteran stakes ×4.35 more per hand at a
  measured 61.99% win rate (107,862 won / 66,151 lost over 174,013 hands). Recommendation: do NOT
  retune `LIARS_DICE_RAISED_CEILING_MULT` or `LIARS_DICE_UNLOCK_GAMES` off this — §12.9 already
  ruled both untouchable here. [found: T-168 capstone,
  `docs/LIARS-DICE-PROGRESSION_SPEC.md` §12.11.3] **Two pointers must be re-read before anyone acts
  on the numbers.** The original filing blamed the hot win rate on "the still-open archetype
  inversion, F-160-1 (`docs/LIARS-DICE_REDESIGN.md` §17.8)" and left it "for the same owner call as
  F-148-1 / F-148-3 / F-160-1" — but F-160-1 was CLOSED at T-175 (ruling LD-25 in
  `docs/LIARS-DICE-DECISIONS.md` changed `optimal`'s planner), so the 61.99% / +875.72 figures
  predate that change. And `docs/LIARS-DICE-PROGRESSION_SPEC.md` §12.11.3 item 1 says F-168-1 "is
  filed as **F-168-1** in `TASKS.md`" — that pointer must be re-aimed at this entry.
  [harvested: T-168/F-168-1]

- **Write the check that `computeDocsFingerprint` never reads `docs/**`.** T-220's own draft note
  claimed `docsFingerprint` moves "because docs moved" and that was WRONG: `computeDocsFingerprint`
  (`packages/sim/src/balance/rules-fingerprint.ts:658`) hashes the raw bytes of the same rule and
  instrument SOURCES, comments included, and never looks at `docs/**`. The existing case at
  `packages/sim/src/__tests__/balance-rig.test.ts:512` ("the docs fingerprint moves on BOTH, which
  is what keeps the edit traceable") only pins that source comment/constant edits move it — a change
  that started hashing `docs/**` would still pass. Add a `fakeRepo` case where a `docs/**` file is
  added or edited and the fingerprint must NOT move.
  [harvested: T-220/docsfingerprint-scope-check]

- **The whole-report hash "no career changed" proof is done BY HAND, for the third time.**
  `packages/sim/src/__tests__/campaign-degraded.test.ts` RE-PIN LOG entry 30 (T-173) records a
  SHAPE-ONLY re-pin of all seven whole-report hashes, but the proof was run locally rather than
  asserted: the stripped hashes (trader `baf0ce4ea567da8e`, fighter `acfa7bcc4800e969`, explorer
  `19c9bf4ab6ad2f94`, veteran `f649dc33cd51a01e`, smuggler `d9b36d370ba59822`, gambler
  `4e89e7dad776577d`, greedy `bad42225b0cc469f` = entry 29) live only in a comment. Entries
  11/N11/T-022, 12/N12/T-030 and 30/T-173 are the same manual proof three times. Write the check: a
  helper in `campaign-degraded.test.ts` that deletes the newly-added report keys and recomputes the
  hash, asserting it equals the prior entry's value, so a "no career changed" claim cannot be
  asserted without machine proof. [harvested: T-173/strip-proof-not-asserted]

- **`productVersion` / `saveSchemaVersion` are deliberately NOT stamped onto the
  `BaselineAggregate`**, so the telemetry report's `productVersion` column still reads `unknown` for
  an aggregate. Named as a follow-up both in T-183's block and in `docs/BALANCE-RIG-DECISIONS.md`
  BR-58's last bullet, but filed nowhere as work.
  [harvested: T-183/aggregate-productversion-stamp]

- **Write the check that `### T-<id>` headings in `TASKS.md` are unique.** T-183's block was
  originally filed as `T-175`, colliding with the earlier `T-175` (F-160-1, line 886), and was
  renumbered on 2026-08-03; T-184's block records the same collision class again (F-160-2, line
  911). Verified no such check exists today — `scripts/` holds only `check-signoff.mjs`,
  `prose-scan.mjs`, `tag-rc.mjs` and `verify-clean-clone.mjs`, and none of them parses task ids.
  [harvested: T-183/tasks-id-uniqueness-check]

- **`packages/ui/e2e/ship-diagram.spec.ts` asserts the NOMINAL (undamaged) render only** — it checks
  `data-damaged="0"` / `data-condition="9"` on every `[data-region]` and never exercises the damaged
  or critical branch. Reaching a damaged component through the UI alone is a probabilistic multi-day
  combat/hazard route with no deterministic hook in `packages/ui/e2e/support/career.ts`, so those
  branches are covered by `packages/ui/src/__tests__/ship-diagram.test.ts` only. Remainder: add a
  deterministic damage hook to `e2e/support/career.ts` so the diagram's damaged/critical flags are
  proved through the UI as well as in the unit test.
  [harvested: T-189/ship-diagram-damaged-e2e]

- **The rendered Port Ledger rack markup has NO unit coverage** — verified: no
  `@testing-library/react` anywhere in the repo's `package.json` files.
  `packages/ui/src/__tests__/port-ledger-fascia.test.ts` covers only the pure `ledgerFascia`
  selector in `packages/ui/src/format.ts`; every assertion about the rack's DOM (chamfer
  `clip-path`, `.lb-rail`, `[data-glyph]`, bolt heads) lives only in
  `packages/ui/e2e/port-ledger.spec.ts`. Any UI restyle therefore has no fast render-level safety
  net. [harvested: T-191/ui-render-unit-gap]

- **Write the check that enforces "a changing React `key` may never wrap an input".** T-191 observed
  the rule by hand (only `<b class="lb-tick">` and the decorative `<i class="lb-sweep">` are keyed;
  the wrappers holding `fuel-amount` / `debt-amount` are not), but nothing mechanically catches a
  regression: the existing fill-then-buy flows in `packages/ui/e2e/manifest-trade.spec.ts` (lines
  73, 133, 196, 203) and `packages/ui/e2e/progression.spec.ts` fill and submit without a key-moving
  event landing mid-entry. Needed: an e2e that types into `fuel-amount`, forces `data-fuel-key` to
  move while the field is focused, and asserts the typed value and caret survive.
  [harvested: T-191/keyed-input-guard]

- **Write the check that pins T-195's claim that "`travelPreview` cannot silently disagree with the
  resolver once a die is known".** Verified absent: the
  `describe('travelPreview (T-1401 export pack)')` block in
  `packages/engine/src/__tests__/economy.test.ts` (lines 331-369) only ever calls the two-arg form
  `travelPreview(state, dest)` and asserts the UNDISCOUNTED `jumpFuelCost(...)`; the optional `die`
  parameter added at `packages/engine/src/actions/travel.ts:242` is never exercised. Add a case
  asserting that for several die values `travelPreview(state, dest, die).fuelCost` equals exactly
  what `resolveTravel` charges, i.e.
  `Math.max(1, Math.round(baseFuelCost * (1 - navDieFuelDiscount(die))))` (`travel.ts:255` vs
  `travel.ts:677`). [harvested: T-195/preview-resolver-die-agreement-test]

- **Write the property test for the safety property the whole T-195 bake-off rests on.**
  `navDieFuelDiscount` / `navDieEvasionFactor` (`packages/engine/src/actions/travel.ts:134` and
  `:142`) are asserted to be monotonic benefits only in a code comment; a grep of
  `packages/engine/src`, `packages/sim/src` and `packages/ui/src` found no test pinning
  `navDieFuelDiscount(1) === 0`, `navDieEvasionFactor(1) === 1`, the endpoints at die 20
  (`NAV_DIE_FUEL_DISCOUNT_MAX = 0.15`, `NAV_DIE_EVASION_MAX = 0.2`), or monotonicity across 1..20.
  The only existing reference, `packages/engine/src/__tests__/actions.test.ts:84`, merely relies on
  `navDieFuelDiscount(1) === 0` in passing while pinning something else. Without it, a future edit
  could reintroduce a drain and only the 8,000-row sweep would notice.
  [harvested: T-195/nav-die-monotonicity-property-test]

- **A field-removal sweep that trusts `tsc` can silently miss shorthand-property call sites.**
  T-196a's compile-error sweep (dropping `spendDie` from nine action shapes in
  `packages/engine/src/types.ts` + `packages/engine/src/schema.ts`) produced 184 `TS2353` errors,
  but FOUR shorthand-property call sites did NOT error — TypeScript skips the excess-property check
  on a shorthand key inside a contextually-typed union return — and they were found only by a
  follow-up grep. Nothing in the repo catches this today (grep for "shorthand" hits only
  `TASKS.md`). Write the check: either a lint rule or a documented mandatory grep step in the
  compile-error-sweep procedure, so a field-removal sweep that relies on `tsc` cannot leave
  shorthand sites behind. [harvested: T-196a/tsc-shorthand-property-blindspot]

- **F-196b-2 (filed, not fixed): `fuelStarvationDays` rises on three of eight rows in the arm-2
  capstone** — `trader` mean 0.056 → 0.074 / max 5 → 15, `trader-degraded` mean 0.687 → 0.818 /
  max 114 → 107, `explorer` mean 0.001 → 0.045 / max 1 → 41. Fleet-wide the metric IMPROVES
  (1.0939 → 1.0620) and no invariant fails (gate 0 violations at 8,000 rows; `assertNoIncomeStall`
  clean over seeds 1..300 × 120 days), so it was not tuned — BALANCE-POLICY Part B forbids retuning
  a constant with no failing check to aim at. Mechanism: with the yard and the refuel no longer
  rationed by the hand, the explorer sweeps more and the trader flies more legs per day, both closer
  to the tank's edge. **WATCH ITEM:** if a later arm shows the trader's or explorer's starvation
  mean continuing to climb, this is the entry to start from. [harvested: T-196b/F-196b-2]

- **Write the seeded regression for F-196b-1.** Smuggler seeds **42** (6 consecutive zero-income
  days) and **216** (8 days, limit 5) were caught only by the 8,000-row capstone sweep gate and are
  NOT pinned locally. The same file, `packages/sim/src/__tests__/campaign-smuggler-gambler.test.ts`,
  already pins the T-199/F-150-2 poverty-trap seeds (20, 970, 3, plus the F-199-1/F-199-2 table)
  explicitly so "the next person to move a shared planner finds out locally instead of from a GitHub
  Actions run" — F-196b-1's two seeds should be added to that ledger at the sweep gate's own 35-day
  horizon, or at 120 days if 35 does not reproduce them. [harvested: T-196b/pin-f196b1-seeds]

- **`docs/DAWN-HAND-REDESIGN.md` never recorded T-196c as shipped.** It has "SHIPPED, PART 1 —
  T-196a", "SHIPPED, PART 2 — T-196b" and "SHIPPED, PART 3 — T-197", but line 26 still reads "the
  cockpit still gates the buttons on an armed die — that is T-196c" and line 45 still reads "Still
  open: the cockpit still gates the buttons on an armed die (T-196c)". Both are false as of
  2026-08-05 and become unverifiable once the T-196c block leaves `TASKS.md`. Add the missing
  cockpit PART (nine freed creators in `packages/ui/src/store.ts`, the `armed`/`dieArmed` gates and
  "Pick a die first" copy dropped in `packages/ui/src/App.tsx`, coverage at
  `packages/ui/src/__tests__/free-actions.test.ts`) and clear the two stale "still open" sentences.
  [harvested: T-196c/dawn-hand-doc-t196c-shipped]

- **CI evidence for T-200's opening-marker fix is still OWED after the push**, per
  `docs/ENGINEERING-POLICY.md` §3 (the CI-evidence rule). T-200's CORRECTION block states that
  `packages/desktop/e2e/packaged.spec.ts` was NOT run as a full packaged build locally (mac/win
  packaging is expensive and platform-bound) and is only "expected to resolve identically — CI will
  confirm". Only `packages/desktop/e2e/shell.spec.ts` (8/8) was verified locally via
  `npx playwright test e2e/shell.spec.ts` from `packages/desktop`. Confirm the `Package (mac)` and
  `Package (win)` matrix jobs in `.github/workflows/ci.yml` are green on the branch HEAD (the
  failing precedent is run 31011441324, commit `aeadf5b7`) and quote the run verbatim.
  [harvested: T-200/t200-packaged-ci-evidence]

- **Eight open questions are named-not-decided in `docs/design/T-201-dawn-hand-roll.md` §7** and must
  be ruled before or inside the implementation task: **Q1** day-1 ordering (marker → roll →
  walkthrough vs. suppress the roll on day 1); **Q2** whether the beat fires on save-load and career
  import (`bootKey` is bumped by `newGame` `store.ts:1287`, `endDay` `:2389`, `loadSlot` `:2502`,
  career import `:2634`); **Q3** the stand-down set (`succession` / `combatAftermath`, and whether a
  folded Liar's Dice hand or a `patrolScan` joins it); **Q5** the
  floor/re-roll beat; **Q6** whether the `.sweep` boot wipe survives the day turn; **Q7** the "DAWN
  HAND" label copy (owner placeholder, explicitly TBD — the dock already reads `Dawn Hand … DAY n`
  at `App.tsx:5691–5704`); **Q8** whether sound is in scope (`sound.play('dawn')` fires unstaged
  after the state commit, `store.ts:2404`); **Q9** whether the hex tiles tumble in 3D.
  **Q4 (the third motion tier) was RULED and SHIPPED by T-252 (2026-08-06)** — Cinematic / Snappy /
  Instant on one `--motion-scale` knob, every existing beat retrofitted, completeness enforced by a
  scan test. Reasoning: **UI-31** in `docs/UI-PRESENTATION-DECISIONS.md` §4. A dawn-hand beat MUST
  take a `--dur-*` token off that knob or `packages/ui/src/__tests__/motion-tiers.test.ts` fails.
  [harvested: T-201/dawn-roll-open-questions]

- **The pre-floor die face is not observable by the UI (Q5 / §7).** The crew floor is applied INSIDE
  the engine by `rollDawnHand` (`packages/engine/src/day.ts:188`), so dramatising "a die lands below
  the floor and is lifted" requires surfacing it — engine work plus a `DawnRoll` event-shape change
  — which crosses the engine-owns-rules line and must be its own task if wanted at all. It is also
  the one branch that would make a capstone / `balance:extract` owed.
  [harvested: T-201/pre-floor-face-not-observable]

- **Write the check that the dawn hand renders N dice, not 5.** §3.7 records that hand size is
  parameterised — 5 base, up to 7 with a First Officer (`packages/engine/src/day.ts:170–187`,
  `App.tsx:5659–5660`, `dawnHandModifiers` at `packages/ui/src/format.ts:973`) — and that any layout
  hard-coding five positions "is a bug the day the player hires a First Officer". No test currently
  covers a 6- or 7-die dawn hand render; add one to `packages/ui` before the ceremony is built.
  [harvested: T-201/hand-size-n-render-check]

- **Write the missing check for the FIFTH `LIARS_DICE_ROUNDS_PER_DAY` site.** T-202's C-2 found five
  content/doc sites, not the four its spec named — `docs/DAWN-HAND-REDESIGN.md` §4b's own table (now
  headed `CONFIRMED TABLE (owner, 2026-08-05 — R3)` at line 287, with the
  `| Tier | Games played | Rounds/day |` grid) is the fifth — but test 4 of
  `packages/sim/src/__tests__/pacing-brief-figures.test.ts` (verified at lines ~380-436) still
  asserts only the four original sites and its own failure messages still read "All FOUR sites move
  in ONE edit". Extend that test to also require §4b's `CONFIRMED TABLE (owner, 2026-08-05 — R3)`
  heading and the ruled numbers, and update the four-site wording to five, so the
  sites-move-together property covers the site that was missed rather than the four that were named.
  [harvested: T-202/pacing-brief-fifth-site]

- **The "DATA ONLY" constraint on content is verified only by an ad-hoc delivery-time grep**
  (`git diff packages/content/src/cast.ts | grep '^+' | grep -c 'if ('` = 0). No test or lint rule
  enforces that `packages/content/src` carries no control flow — `eslint.config.mjs` has no
  content-scoped rule and no content-purity test exists. Write the check so CE-1/CE-2 survive an
  author who does not run the grep. [harvested: T-206/content-data-only-check]

- **Nothing gates a minimum CONTRAST RATIO on the cockpit's surface boundaries** — the root defect
  the T-186 bake-off found and no check pins. All three T-186 reviewers independently measured
  panel-against-background at **1.04:1** and pane borders at **1.36:1**, both under the 3:1 floor at
  which a boundary is perceivable at all. `packages/ui/src/__tests__/visual-identity.test.ts` (the
  GATED one) asserts hue/achromaticity and the two ruled edits, not ratios;
  `packages/ui/e2e/visual-identity.spec.ts` measures luminance **ordering** only (`luminance()`
  defined at :50, used at :190/:212/:255) and never a ratio — and T-218 filed that spec as MANUAL,
  outside `npm test`. Because T-218 moved separation onto the `--bevel`/`--recess` shadow pair
  rather than a coloured hairline, the check must measure the RENDERED boundary, not a pair of
  tokens. [harvested: T-186/contrast-floor-check]

- **`.slot.ready` — ruled edit 1 of T-218, at `packages/ui/src/theme.css:1912-1928` — has no live
  call site in the shipped cockpit.** M17 removed the die COST from signing a manifest offer
  (`App.tsx:4840-4841`), so the sign row now reads `SIGN · FREE · click to sign` and the
  check-clearing badge is currently dead CSS. The ruled edit is applied anyway, and
  `packages/ui/e2e/visual-identity.spec.ts` measures it only through a probe node built from the
  real stylesheet — labelled in place as the weaker claim it is. M17 is explicitly a reversible: if
  it is reversed, re-prove the badge with a real click and upgrade the e2e assertion off the probe.
  [harvested: T-218/slot-ready-dead-css]

---

## Notes — bounded limitations, deferrals and standing pointers

- **`docs/EXPLORE_REDESIGN.md` §7 deliberately did NOT settle four things**, per T-100's Delivered
  note: Explore's fuel cost (`EXPLORATION_FUEL_COST = 80`), nav DC
  (`EXPLORATION_NAV_DC = 12`), whether NPCs get the Explore verb, and the manifest version.
  Version is discharged (0.5.3, owner 2026-08-02). The other three are STILL LIVE: re-pricing is
  an R-series owner call per `docs/EXPLORE_REDESIGN.md` §10.4, and the vacated PARITY LEDGER row
  remains UNRULED (gates N8). Both are also carried in `TASKS.md`'s "Deliberately deferred"
  section and in T-158's pre-UAT brief. [harvested: T-100/explore-s7-unsettled]

- **F-101-2 (`docs/HANGOUT_REDESIGN.md` §7): `clientele` ranks, never spawns** — NPC movement is
  not port-aware, so a port whose concept is "a room full of patrol captains" is realizable only
  when the sim happens to have moved such captains there. Ruled a BOUNDARY (working as ruled),
  with a named remainder: making NPC movement port-aware is a cast-sim change sitting behind the
  same owner deferral as §5. Not carried in `TASKS.md`'s standing deferred list — it lives only in
  `docs/HANGOUT_REDESIGN.md` §7 and `docs/0.5.2-REVIEW.md`'s finding table.
  [harvested: T-101/f-101-2-port-aware-npc-movement]

- **F-110-B's residue: `resolveExploreOutcome` in `packages/engine/src/exploreOutcomes.ts` still
  wraps its `WireEntry` push in `if (outcome.wireFound !== '')`**, and its comment still says
  "the legacy rows carry no copy". Every `legacy-` row is now retired
  (`grep -n "wireFound: ''" packages/content/src/exploration.ts` returns nothing) and
  `packages/engine/src/__tests__/exploreContent.test.ts` asserts every row in `EXPLORE_OUTCOMES`
  speaks, so the guard is dead code behind a stale comment — the T-115 note in that test already
  calls it "vacuous rather than load-bearing". Either delete the guard and the
  `an empty wireFound emits no line — the legacy rows stay dark (F-110-B)` test at
  `packages/engine/src/__tests__/exploreOutcomes.test.ts:459`, or re-comment the guard as a
  deliberate belt-and-braces. [harvested: T-110/vacuous-wirefound-guard]

- **Two of the four house-voice rules are unenforced.** T-113 claimed all four are "asserted, not
  just described", but only three are machine-checked in
  `packages/engine/src/__tests__/exploreContent.test.ts` (the `Player` subject via
  `row.wireFound.startsWith('Player')`, `{name}` at most once, and non-empty/mutually-distinct
  copy). Missing: "a salvage row names what was stripped, never the credit figure (the amount
  rides `SalvageRecovered`)" and "a lore row's copy is the second line on a new fragment and the
  only line on a repeat". Write the missing assertions there, or amend the claim.
  [harvested: T-113/house-voice-two-rules-unasserted]

- **F-113-C's remainder is still an owner call and is NOT closed by T-114.** T-114 measured
  explorer median final credits 9,094 → 34,234 and smuggler 4,841 → 5,650 on the
  `campaign-degraded` window and deliberately re-priced nothing, handing the verdict to T-116.
  T-116 delivered the measurement (Explore is still a net loss; paired sign count 101/120 →
  85/120; `docs/EXPLORE_REDESIGN.md` §9) and explicitly left "the pricing lever remains an owner
  call", alongside its own unfixed `F-116-1`. If T-116's block is pruned later, that remainder
  must survive with it. [harvested: T-114/f-113-c-explore-repricing-owner-call]

- **The `ContrabandFound` event variant was KEPT DELIBERATELY** in
  `packages/engine/src/types.ts` and `packages/engine/src/schema.ts` even though T-117 deleted
  its only emitter (the `contraband` member of `ExploreOutcomePayload` and the engine's
  `case 'contraband':`). It was kept because removing an event shape is save/schema surface and
  would have dragged a version bump into a content pass. Remainder: delete the variant (and its
  `_covEvContrabandFound` coverage assertion in `packages/engine/src/schema.ts`) at the next
  `CURRENT_SAVE_VERSION` bump. The zero-count guard in
  `packages/engine/src/__tests__/exploreOutcomes.test.ts` (`contrabandEvents` counted, asserted
  at zero) should outlive it until then so a re-emission cannot pass silently.
  [harvested: T-117/contraband-event-variant]

- **F-113-C's final measurement is recorded but not acted on:** on the `campaign-degraded` window
  (5 seeds × 40 days) the explorer's median final credits go **34,234 → 10,553** (smuggler 5,650
  → 5,844). Deliberately not tuned around — 25% of boards are now dead ends, 42% open a multi-day
  recovery, and §5.5's ~447cr per board is mostly permanent items, hooks and standing a
  final-credits figure cannot see inside 40 days. T-116 confirmed Explore is still a net loss
  with the gap narrowed rather than closed, and left the pricing lever as an open owner call;
  this measurement is the explorer-side evidence for that still-open call.
  [harvested: T-115/explore-pricing-owner-call]

- **The `it.fails` clear-day tripwire is still correctly RED on T-116's capstone:** trader median
  debt-clear day 21 against the `[22, 30]` band at n = 987, and it was deliberately NOT converted
  to `it`. Already owned by R2.5 (`docs/BALANCE-REDESIGN-WORKLIST.md:96`) and pinned at
  `packages/sim/src/__tests__/balance-targets.test.ts:225` — recorded so T-116's confirming n is
  not the last trace of it. [harvested: T-116/trader-clear-day-21]

- **Write the check that enforces T-123's "never a restated literal" rule for hangout tests** —
  today it is only a convention. T-123 had to repair T-121's "a Dare plays at Vega-6" test (its
  100cr stake literal broke when Vega-6's authored floor of 250 clamped it up; restated as
  `wagerBandFor(14).min`). No lint rule or meta-test currently catches a new hangout assertion
  that hard-codes an authored number instead of reading `venueParamsFor` / `wagerBandFor` /
  `venueOffered` — so the next content pass rediscovers it by going red.
  [harvested: T-123/accessor-not-literal-guard]

- **The `it.fails` clear-day tripwire is still correctly RED** — trader `debtClearedDay.median`
  **21** against `[22, 30]` at **n = 987**, unmoved from T-116 and N11. Lives at
  `packages/sim/src/__tests__/balance-targets.test.ts:225`; self-enforcing (it fails loudly if
  the number ever enters band), so this is a known-open balance defect, not a lost one.
  [harvested: T-125/trader-clear-day-tripwire]

- **F-150-1 is OPEN as a DESIGN QUESTION for the owner, not a tuning knob** — the **0.25
  named-pool interceptor gate** (`packages/engine/src/actions/travel.ts`) and
  **`DISPOSITION_DECAY_INTERVAL_DAYS = 3`** (`packages/content/src/disposition.ts`) read
  together, with NEITHER constant changed by T-150 (named share 25.07%, inertness 71.52%,
  wronged-captain lift 2.358×, cast at exactly 0 disposition on 96.52% of live captain-days,
  standing survives a median 3 days, decay outruns interaction 1.53:1). Levers-not-pulled table
  in `docs/HANGOUT_REDESIGN.md` §11.3. Already scheduled for a recorded ruling at **T-158** —
  do not drop when the T-130 log is archived. [harvested: T-130/f-150-1-owner-ruling]

- **The `it.fails` clear-day tripwire at `balance-targets.test.ts:225` is still correctly red at
  the T-130 gate** — trader `debtClearedDay.median` **21** against `[22, 30]`, n = 987, unmoved
  from T-116 and N11, deliberately not converted to `it` and no baseline re-chosen. R-owned and
  expected-red; if it ever flips to passing, halt and escalate.
  [harvested: T-130/clear-day-tripwire-red]

- **The `apCost` values shipped by T-131 (band 3 = 2 extra dice, band 4 = 3) are FIRST-PASS
  numbers**, explicitly "to be moved by play" and not re-derived from the bakeoff's EV math
  (`docs/EXPLORE_REDESIGN.md` §3.3; the ladder is pinned by index as `[0, 0, 0, 2, 3]` in
  `packages/engine/src/__tests__/exploreContent.test.ts`). The feel-read is currently carried
  only by T-158's pre-UAT brief item (a) ("UAT is the 'playtest by feel' D1 chose over sim
  pre-validation"); if T-158 closes without an explicit apCost read, these two numbers stay
  untuned. [harvested: T-131/apcost-playtest-tune]

- **"Downgrade instead of forfeit" for a band-3/4 find whose dawn hand cannot cover `apCost` was
  logged as a revisit candidate, NOT built** (`docs/EXPLORE_REDESIGN.md` §3.3, beside the
  `ExplorationFailed{reason:'insufficient-dice'}` ruling). Revisit only if forfeiting reads badly
  in play. [harvested: T-131/forfeit-vs-downgrade]

- **The rejected D1 alternative — the full uniform conversion** (all non-zero bands → same-day
  AP, band 2 folded in, forcing a `player.recovery` schema removal and a save v13→v14 migration)
  — stays logged, not built. Its named revisit trigger: the hybrid's own playtest showing band 2
  (1 day, 42.1% measured collection) still underpriced.
  [harvested: T-131/band2-uniform-conversion-revisit]

- **T-133's Accept line requires "no per-port engine branch (the clamp reads `loanBandFor`, never
  an `if (systemId === ...)`)", but nothing automated enforces it** — the rule lives only in
  comments in `packages/engine/src/hangoutRules.ts`, `packages/engine/src/actions/hangout.ts` and
  `packages/ui/src/format.ts`. Write a guard (test or lint rule) that fails if a hangout/lending
  engine module branches on a literal `systemId`. [harvested: T-133/per-port-branch-guard]

- **T-145 shipped the 3-per-port / 42-opponent baseline only** and explicitly names a remainder
  with no task behind it: "A LATER content pass can grow this toward more opponents per port".
  Growing `packages/content/src/liarsDice.ts` beyond 42 rows is unowned — T-146 (unlock ladder)
  and T-147 (achievement hooks) covered the other two deferrals, this one did not get a task.
  [harvested: T-145/liars-dice-roster-growth]

- **F-116-1's fix is scoped to the Explore QUEUE at dawn, not the policy:** queued Explores
  landing on a recovery dawn went 3,204/23,858 → 0/101,557, but the guaranteed-refusal rate
  against queued Explores only halves 14.46% → 7.85%, leaving a within-day residual (a recovery
  opened mid-day) recorded as a bounded limitation in `docs/EXPLORE_REDESIGN.md` §10.
  [harvested: T-150/explore-within-day-residual]

- **Three known-red `it.fails` tripwires were not touched by T-150 and are still correctly red:**
  `packages/sim/src/__tests__/balance-targets.test.ts:225` ("the trader clears the marker inside
  the target band, not sooner"), `packages/sim/src/__tests__/balance-combat-survival.test.ts:440`
  ("the fleet death rate clears its designed floor") and `:458` ("Auto-Repair no longer switches
  the death path off"). They remain open work owned by the balance redesign, not by T-150.
  [harvested: T-150/known-red-itfails-tripwires]

- **F-140-2 (reported, not fixed; `docs/BALANCE-TELEMETRY_SPEC.md` §7.3, noted at the emit site
  in `packages/engine/src/npc.ts`):** for `kind: 'contract'`, `option`/`chosen` are BOARD INDICES
  and the board itself is not recorded, so an entry means "which offer on that day's board",
  never "which cargo". T-142 labels the axis accordingly rather than fixing the shape; recording
  the board (or the good) at emit time is the unfixed remainder. [harvested: T-140/F-140-2]

- **T-141 shipped the web/browser build of the playtest log as an in-memory buffer only**
  (`packages/ui/src/playtestLog.ts`: module-level `buffer`, drop-oldest at `MAX_ENTRIES`;
  `appendPlaytestLogLine` is a no-op off the desktop shell), because a browser tab has no
  filesystem. Consequence not yet addressed anywhere: a web-build session's log is lost on tab
  close or reload unless the player exports first. Only the desktop shell keeps the append-only
  per-session JSONL under `logs/`. If web playtesting is ever used for real UAT, this needs a
  persistence path or an explicit "desktop-only telemetry" statement in
  `docs/PLAYTEST-TELEMETRY_SPEC.md`. [harvested: T-141/playtest-log-web-inmemory-only]

- **F-140-1 carried into the report and still unresolved upstream:** a trace line carries no seed
  and no policy, so the report groups by archetype × kind only and attribution is FILE-level,
  parsed from the `traces-<label>-shard<i>of<N>.jsonl` filename. The page states this in its
  caveat list rather than fixing it. Belongs to the trace-writer (T-140) side; per-seed/per-policy
  attribution stays impossible until trace lines carry those fields.
  [harvested: T-142/f140-1-attribution-carried]

- **Unruled alternative recorded in `docs/PLAYER-TRINKETS_SPEC.md` §11/§13:** give GUNS and TRADE
  a `navBonus`-shaped component pathway instead of a trinket system — damped and death-reset by
  construction, no `player.stats` write, no save question. Two of the four reviewers
  independently proposed it as smaller and more consistent than trinkets; it is a genuinely
  different answer to the owner's underlying want. [harvested: T-151/navbonus-alternative]

- **`docs/PLAYER-TRINKETS_SPEC.md` §9.4 defers a new PARITY LEDGER row to the owner:** do NPCs
  wear trinkets, and does a trinket-wearing NPC re-derive `NPC_COMPONENT_STAT_AFFINITY` live or
  freeze it at spawn. Deferred alongside the Explore and VisitHangout rows already awaiting the
  same owner. [harvested: T-151/npc-parity-row]

- **F-159-1 — CLOSED by T-161 (2026-08-02).** `veteranPolicy` now carries the T-1104 full-tank
  relaxation (`packages/sim/src/index.ts:4956`). Re-measured seeds 1..200 × 35 days: longest
  zero-income streak **31 → 13**; the nine seeds that each held a 31-day strand fall to 5-10 and
  are pinned live in `packages/sim/src/__tests__/sweep-gate.test.ts`. The stale "6-8 days"
  exemption note in `packages/sim/src/balance/gate.ts` `GATE_COMPETENT_POLICIES` was
  re-justified and re-numbered against the measurement. Full record at
  `docs/BALANCE-POLICY.md` D.2a. [harvested: T-159/F-159-1]

- **F-161-1 (NEW, opened by T-161): `veteranPolicy` takes EVERY offered storylet as a standalone
  day** (`packages/sim/src/index.ts:4936`), where `smugglerPolicy`, `gamblerPolicy` and
  `explorerPolicy` all resolve a die-free choice INLINE and let the trade day continue. On a
  port with a live storylet queue the veteran never reaches its contract block at all — which is
  why **197 of 200 seeds still stall at ≥ 5** even after F-159-1's fix. The ported three-line
  split closes most of it (197 → 18 seeds ≥ 5) but regresses the deed slate:
  `deed-coverage.test.ts`'s "the slate is earnable by a single career" goes **2 → 0** full slates
  over seeds 1..76 × 300 days, because the Liar's Dice ROSTER TOUR errand in
  `__tests__/support/deed-hunter.ts` needs idle days. So it needs a task that owns the
  deed-hunter instrument and may re-pin `deed-coverage.test.ts`. Full record, including the
  16-of-18 credit-starvation residual behind it, at `docs/BALANCE-POLICY.md` D.2a. **Now owned by
  `TASKS.md` T-231**, which carries this finding's provenance marker — this entry is the earlier
  filing, not a second one.

- **Write the check that catches stale CI-state claims in docs:** `docs/TESTING-STRATEGY.md`
  Part D carried "the `gate` job is **red until it lands**" for a day after T-159 landed the fix,
  because the fixing task updated the workflow header but not the prose. Nothing today enforces
  that a task changing a CI job's red/green status updates the Part D bullet — no lesson is
  recorded for this class until such a gate step or checklist item exists.
  [harvested: T-153/doc-ci-state-staleness-check]

- **The other two standing coverage warnings are still owner-gated:** `fighter` (Combat partial)
  and `explorer` (Explore deferred) in `packages/sim/src/balance/coverage.ts`'s
  `ACKNOWLEDGED_COVERAGE_GAPS`. The Explore ledger row's fresh owner ruling is F-150-1, and the
  T-158 block already names both it and Combat's chosen branch — recorded here so pruning T-157
  does not orphan the pointer. [harvested: T-157/explore-parity-warn]

- **Accepted, measured boundary from T-156: the NPC virtual hand runs dry ~3% of the time.**
  **3.09%** of rolling captain-days exhaust the hand and **3.48%** of all allocations are served by
  the documented raw `rng.d20()` fallback (40 seeds × 120 days; 82,393 captain-days, 118,606
  allocations). It is named as **boundary 2** at `packages/engine/src/npcHand.ts`'s definition site.
  Never worse than the pre-N13 draw, but it is a real 3.5% and must be RE-MEASURED if the hand size
  (`DAWN_BASE_HAND_SIZE`) or the per-day check count (`NPC_ENCOUNTER_MAX_ROUNDS`) ever changes.
  [harvested: T-156/npc-hand-exhaustion-fallback]

- **Four entries in this file describe T-160 as a still-open carrier and will dangle the moment its
  block is deleted:** the F-137-1/F-137-2 provenance anchor
  (`[harvested: T-137/F-137-1-F-137-2]`, "**Already carried verbatim by the open TODO block
  T-160**"), the F-148-1 entry (`[harvested: T-148/F-148-1]` — "**T-160** carries the post-fix
  archetype-ordering re-check in its Accept clause … but F-148-1 itself is closed by no task"), the
  F-148-3 entry (`[harvested: T-148/F-148-3]` — "named in NO task's Accept, including T-160's"),
  and the unmeasured-channels entry (`[harvested: T-137/liars-dice-unmeasured-channels]` — "§16.8
  items 2, 5 and 6 are already carried by T-160; 3 and 4 are not", the Peek `DARE_PEEK_DC = 12` and
  player-side RAISE BOTH channels). F-137-1/F-137-2, F-148-1 and §16.8 items 2/5/6 are now
  DISCHARGED (T-160, T-175, T-177); §16.8 items 3 and 4 and F-148-3 are NOT. Re-point or retire
  those four entries when the T-160 block goes.
  **RESOLVED 2026-08-06:** the T-160 block was pruned by that day's harvest and all four entries
  were re-pointed in the same pass — each now states that T-160 is DONE and pruned, names what its
  discharge covered, and names what remains live (§16.8 items 3 and 4, and F-148-3, which is still
  closed by no task). This entry is kept, not deleted, as the record that the prediction was made
  before the prune and honoured after it.
  [harvested: T-160/todo-md-t160-anchors-go-stale-on-prune]

- **Write the check that `path:line` references in `TASKS.md` / `TODO.md` still resolve.** T-199's
  own block named the F-150-2 tripwire at
  `packages/sim/src/__tests__/campaign-policies.test.ts:492` when it was actually at `:505`, and the
  coder had to correct it mid-task. No lint or test catches a stale line reference today —
  `scripts/` holds only `check-signoff.mjs`, `prose-scan.mjs`, `tag-rc.mjs` and
  `verify-clean-clone.mjs`. Precedent for this class of doc-pointer test already exists at
  `packages/sim/src/__tests__/baseline-pointers.test.ts`.
  [harvested: T-199/write-tasks-line-ref-check]
  **Second instance, T-204 — and it widens the check.** T-204's first-draft Delivered note cited its
  probe at `scratchpad/t204-prose-scan.py`, a session-scratchpad path and not a repo path;
  `scratchpad/` is not a directory this repo has, so a reviewer following the citation found nothing
  and an auditable-looking claim was unverifiable. It was fixed by making the artifact real
  (`scripts/prose-scan.mjs`), but nothing mechanical catches the class: the check must flag cited
  repo paths that do not RESOLVE, not only stale line numbers.
  [harvested: T-204/tasks-path-citation-check-t204-instance]

- **T-167 shipped the DETECTOR only; the `fighter` instrument defect it detects is still open.**
  F-151-9 (day-35 median 2,825cr flat under all eight rig variants) is already tracked as `T-174` in
  `TASKS.md` (`status: TODO`, `after: T-198`), whose Accept already names this predicate returning
  zero violations as its exit check, and as `docs/BALANCE-RIG-DECISIONS.md` BR-57's last bullet. No
  new backlog entry is owed so long as T-174 survives the prune — this is recorded only so the
  linkage is not lost with the block. [harvested: T-167/fighter-flat-defect-still-open]

- **`docs/LESSONS.md` L-014's "Enforced by:" pointers have DRIFTED**, found while verifying T-168's
  claims. It cites `packages/sim/src/__tests__/protocol.test.ts:1268` for "wager domain asserted
  equal to `wagerBandFor(portId)` with a non-vacuity check" — line 1268 is now inside a Crew-hire
  test; the real assertion is `packages/sim/src/__tests__/protocol.test.ts:1520` with the
  non-vacuity check at `:1524`. It also cites `packages/ui/src/__tests__/liars-dice-pane.test.ts:416`,
  which now lands in the `T-146 · the scene projection follows the hand's frozen dice count`
  describe; the `T-146 · dareWagerBounds is the EFFECTIVE band for the live tier` describe starts at
  `:439`. T-168 edited both files (it added the tier-4/tier-5 arms to `protocol.test.ts` and
  collapsed `dareWagerBounds`), so it plausibly caused the shift. No check resolves
  `docs/LESSONS.md` "Enforced by:" file:line pointers against the tree — writing one would catch
  this class. [harvested: T-168/lessons-l014-stale-pointers]

- **F-148-1 / F-148-3 / F-160-1 were explicitly left open by T-169 for "the same owner call"** (the
  archetype inversion, `docs/LIARS-DICE_REDESIGN.md` §17.8) and routed to T-175 / T-176 / T-177.
  Those three tasks now read `status: DONE` in `TASKS.md` — confirm each finding was actually
  settled there before this pointer is dropped, since T-169 is the last block that names all three
  together. [harvested: T-169/f148-siblings-owner-call]

- **`optimal`'s claim pricing is bluff-exploitable in principle, and the sim cannot test it.**
  LD-25's `probClaimTrue` / `creditedClaimSupport` point read (a claim of `q` is read as someone
  holding `q − 1`, capped at `dicePerSide`) is maximally credulous. T-175 measured the exposure only
  against counterparties opening +1 / +2 over `minOpeningQuantity(own(bestFace))` and accepted it
  because bluffing loses catastrophically there, but the chosen shape is 8–10 credits/hand behind
  the rejected modal-face-plus-lattice-bound runner-up under those openers. **Trigger to revisit:**
  if any archetype or `planDareMove` / `dealerMove` ever opens ABOVE the engine's floor, re-measure
  `optimal`'s claim pricing before shipping it — the sim's planner cannot test this by construction.
  [harvested: T-175/optimal-bluff-exposure-revisit]

- **The T-160 → HEAD win-rate composition decomposition is NOT computable at HEAD.** F-176-2's trend
  (T-137 94.66% → T-148 80.07% → T-160 61.07% → HEAD 52.90%) invites it, but `dareCells` shipped at
  T-175, after T-160, so that endpoint has no cells. Recorded as `docs/LIARS-DICE_REDESIGN.md` §20.0
  correction 1; §20.4 answers only the decidable within-HEAD form. The named remainder is re-running
  T-160's rule to produce cells if that endpoint decomposition is ever actually wanted.
  [harvested: T-220/t160-head-composition-decomposition]

- **Measurement coverage gap left standing by T-220:** six of the 12 pool × tier `dareCells` cells
  are marked UNDER-POWERED rather than reported as rates, and four of the eight pool × archetype
  cells are structurally empty. LD-28's per-tier reads (`docs/LIARS-DICE_REDESIGN.md` §20.3/§20.3a)
  therefore have no usable low-tier rate; the standing remedy the tests carry is "WIDEN THE SAMPLE —
  never move the bar (N4/N10, `docs/VERSIONING.md`)", which nobody has scheduled.
  [harvested: T-220/dare-cells-low-tier-underpowered]

- **T-185's scripted 6-step audio pass was NOT re-executed** — the `RULED (owner, 2026-08-05): DONE`
  closed it via live play, keeping the scripted pass "for the record, not re-executed". Two asks are
  therefore unconfirmed: step (6) Settings → the new **Music** fader and the Mute button, and the
  request to "report on levels and on whether the score wears well over ten minutes". Every level
  named is a one-constant edit (`CUE_GAIN` in `packages/ui/src/sound.ts:400`, the 171 Hz partial mix
  0.18, `DEFAULT_MIXER` music 0.45). [harvested: T-185/owner-audio-scripted-pass-residue]

- **`setDriveHum`'s `false` branch still has no caller.** F-185-1 observed that "nothing ever called
  `setDriveHum(false)`"; the fix added `sound.setDriveHum(true)` at `packages/ui/src/store.ts:552`
  (module scope) on top of the existing `store.ts:1309` / `store.ts:2405` calls, so the `false`
  branch (`packages/ui/src/sound.ts:695`) is still dead anywhere in the tree. Either wire a stop path
  or drop the parameter. [harvested: T-185/setdrivehum-false-dead-branch]

- **Write a check that a baseline filename quoted in `TASKS.md` prose names a file that exists under
  `docs/balance/`.** T-195's block originally named `docs/balance/baseline-t193-dawn-dice.json`, a
  file that never existed; it was caught only by the human 2026-08-04 review pass.
  `packages/sim/src/__tests__/baseline-pointers.test.ts` enforces the five pointer SITES against
  `BASELINE_OF_RECORD_PATH` but reads no `TASKS.md` prose, so this class is currently unenforced.
  [harvested: T-195/tasks-md-baseline-name-check]

- **The legacy die fail-reasons wait on the next save-version bump.** `CrewEventFailReason` and
  `PortEventFailReason` in `packages/engine/src/types.ts` (and their zod mirrors in
  `packages/engine/src/schema.ts`) still carry `no-die` / `invalid-die-index` / `die-already-spent`,
  now unreachable for the freed actions. They were kept as LEGACY-ONLY because the eventLog is
  persisted inside `GameState` and validated by a `.strict()` schema on load, so deleting a member is
  a save-shape break owing a migration T-196a did not own (`CURRENT_SAVE_VERSION` stays 15).
  Remainder: fold the deletion into the next save-version bump, or rule them permanent.
  `HangoutFailReason`'s copies were resolved at T-197 — still live because `actions/dare.ts`'s PEEK
  raises them — so only the Crew/Port copies remain.
  [harvested: T-196a/legacy-die-fail-reasons-await-save-bump]

- **The T-196a capstone shipped an UNPREDICTED fleet move.**
  `docs/balance/baseline-t196a-free-actions.json` (8,000 rows, PASS · 0 invariant violations) shows
  ships lost **436 → 465 (+6.7%)**, carried entirely by `explorer` 49 → 66 and `smuggler` 46 → 58,
  alongside `tourOneClearRate` 0.6320 → 0.6305 and median final credits 49,729 → 49,517 (−0.4%). It
  was explained by `exploreOutcomes.ts` `payExtraDiceClaim` and accepted inside a passing gate, not
  filed. Worth re-reading across the later re-pins to confirm the two policies' loss rate has not
  compounded. [harvested: T-196a/t196a-ships-lost-rise]

- **`planHomewardBurn` still has NO nav gate**, and whether it should is explicitly out of T-196b's
  scope. A Guard-4 nav gate mirroring `smugglerPolicy`'s `navBeatable` was tried during F-196b-1 and
  reverted on measurement (it changed neither stalled seed's streak). Note `planHomewardBurn` (in
  `packages/sim/src/index.ts`) is a SHARED planner (`fighterPolicy`, `traderPolicy`,
  `smugglerPolicy`, per BR-36/T-175/T-199), so any change to it needs the two-step
  extract-then-wire evidence. [harvested: T-196b/homeward-burn-nav-gate]

- **`docs/design/T-201-dawn-hand-roll.md` pins every file:line against commit `b8343150` and the
  tree has since drifted:** `useDiceRoll` is now `packages/ui/src/App.tsx:5867`, not the `:5785`
  cited in both the doc and T-201's Delivered note. Re-verify the doc's pins (per `LESSONS.md`'s
  resolvable-pin rule) at the start of the implementation task rather than trusting them.
  [harvested: T-201/design-doc-pins-stale]

- **No `tableTalk` / `catchphrases` were authored for any quest captain.** `cast.ts` rules that the
  absence MEANS "no voiced surface" and that a stub is forbidden. T-207's block anticipated that "a
  later task may legitimately voice one", and T-208 has now parked all eleven permanently at
  Cantinas where the table-talk surface renders — so voicing them is a live option that no task
  currently owns. [harvested: T-208/quest-captain-voice]

- **T-193's jsdom-in-vitest pane test is NOT the real-browser tier.** It renders in jsdom under
  vitest and was never a substitute for the Playwright long-horizon tier that T-162/T-237 owes;
  that thread stays open. Already recorded at `docs/TEST-TIER-DECISIONS.md` TT-13a ("This is still
  NOT the real-browser tier T-162/T-237 owes; that one is Playwright, and it remains open") and
  adjacent to this file's `[harvested: T-162/longhaul-unfired-verbs]` entry in the Gaps section.
  Carried here only so that pruning the T-193 block does not erase the pointer.
  [harvested: T-193/real-browser-tier]

---

## Next-pass candidates

- **Write the check that would have caught F-151-3 as a class.** There is no exhaustiveness
  enforcement configured today (verified — `eslint.config.mjs` at the repo root contains no
  `@typescript-eslint/switch-exhaustiveness-check` or equivalent, and `applyUniqueItem`'s
  `if`/`else` dispatch passes `npm run lint` unflagged). Add the rule (or an equivalent typed
  test) so a discriminated-union dispatch cannot silently gain a fall-through arm.
  [harvested: T-151/write-exhaustiveness-lint]
