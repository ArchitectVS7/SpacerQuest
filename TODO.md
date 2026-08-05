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
  *uniform* slipped 2.956× → 2.623×. **Already carried verbatim by the open TODO block T-160**
  with the call sites (`planDareMove` branch (b) at `packages/sim/src/index.ts:~3593-3607`,
  `dealerMove`'s fallback at `packages/engine/src/liarsDiceRules.ts:~345-350`) — this entry is a
  provenance anchor, not a second filing. [harvested: T-137/F-137-1-F-137-2]

- **F-148-1 · archetype ordering is INVERTED — `optimal` is the softest seat in the game.**
  Player win rate 84.69% vs `optimal` (n 42,494) vs 68.78% vs `bad` (n 9,054), z = −30.76
  (replicated in Arm 1 at z = −12.88); `optimal` (84.69%) is softer than the *undesigned* roaming
  dealer (76.91%). REPORTED, NOT FIXED (`docs/LIARS-DICE-PROGRESSION_SPEC.md` §12.2/§12.9).
  Mechanism traced to F-137-1's guaranteed-true opener, not to `archetypeMove`. Partially owned:
  **T-160** carries the post-fix archetype-ordering re-check in its Accept clause and says a
  surviving inversion is a distinct finding — but F-148-1 itself is closed by no task.
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
  (§12.5), measured only dealer-side at 23.18% of dealer raises. §16.8 items 2, 5 and 6 are
  already carried by T-160; 3 and 4 are not.
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

- **F-151-6 · no existing test pins `player.stats` across a run**, so a missing clamp or a
  double-applied delta would be caught by nothing. Any task that ever writes `player.stats` must
  add that pin (named as a deliverable of the `(engine)` row in
  `docs/PLAYER-TRINKETS_SPEC.md` §13). [harvested: T-151/F-151-6]

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
  16-of-18 credit-starvation residual behind it, at `docs/BALANCE-POLICY.md` D.2a.

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

---

## Next-pass candidates

- **Write the check that would have caught F-151-3 as a class.** There is no exhaustiveness
  enforcement configured today (verified — `eslint.config.mjs` at the repo root contains no
  `@typescript-eslint/switch-exhaustiveness-check` or equivalent, and `applyUniqueItem`'s
  `if`/`else` dispatch passes `npm run lint` unflagged). Add the rule (or an equivalent typed
  test) so a discriminated-union dispatch cannot silently gain a fall-through arm.
  [harvested: T-151/write-exhaustiveness-lint]
