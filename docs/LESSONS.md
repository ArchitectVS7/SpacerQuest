# Lessons

This file holds one entry per **defect CLASS**, never one per task. Before adding an entry,
check whether an existing one already describes the same failure mode and strengthen that
one instead — note the second occurrence and sharpen the rule. Every entry names the check
that now makes the mistake impossible; when a check has become permanent and its rule
obvious, the entry is deleted, because **the check is the real memory** and this file is only
the part of it a person still has to read. Decisions live in their own documents and are
indexed at the bottom — pointers only, never content.

---

## Standards

- When a spec adds a content field or a venue, name its reader in the same spec and walk every authored row through that reader in a test.
- Player-visible copy is validated at the content layer — non-empty, mutually distinct and template-safe for every shipped row — never left to a silent resolver-side guard.
- Every switch over a typed union is exhaustive by compilation — a `never` default in the engine, no `default` and no trailing return in `format.ts` — so a new or removed member fails `tsc` rather than silently no-opping or rendering nothing.
- A value-scaled mechanic knob lives on the band/tier table and is read through a helper; authored rows never carry the key, and a content-shape test asserts its absence.
- Before writing a state field, check whether a sync/recompute function owns it; if so store the delta as a separate term folded inside that one chokepoint, and assert it through a real `applyPlayerAction`.
- Before deleting or renaming a content id a persisted save can reference, prove by a load-path test that the stale id degrades to a typed no-mutation refusal — otherwise it is a migration, not a content edit.
- Before deleting or re-pointing a content leg that supplies a deed, check the deed's trigger probability against the replacement rows; a red coverage run is root-caused, never fixed by widening the sample or lowering the threshold.
- Content that names an entity id is validated against the LIVE seeded state and against the context the content places it in — membership of the definition table is not reachability.
- A seeded draw consumes a fixed number of rng values regardless of table shape; a content edit inside a band must never re-phase the stream.
- Renormalise weights over the entries actually present after filtering, and assert both the resulting distribution and the content invariant that no bucket is empty.
- Never chain off `.find(...)!` on a large `as const` collection — bind the found entry to a named const and assert it explicitly; when it breaks after content is added, fix the binding, never widen the type.
- When a policy or enumerator plans an action, it applies the exact filter set the resolver accepts, read through the engine's own accessor — `legalActions` passing is not proof, because the campaign runner never calls it.
- When fixing a loop, guard or shared helper, enumerate every sibling call site and fix or tripwire each; where two call-site conventions have diverged, commit the caller list as a manifest a test rescans from source.
- A helper that returns a modified copy of a shared state record copies the WHOLE input — spread, then override — never a literal listing today's fields, and preserves an optional field's true absence.
- When a constant moves into content behind an accessor, move every mirror of it in the same change and pin each with a test that reads the accessor, never a restated literal.
- A selector that picks one global winner among mount-scoped candidates must be mount-aware; whenever a feature's reach widens, re-run the specs that assert each candidate fires in its own scope.
- Any test that quantifies over a derived, enumerated or scanned set must prove it is non-vacuous: assert the set non-empty, pin its cardinality to the source in both directions, name every location inspected in the failure message, and count skips as failures — and an audit driver's all-clear counter sheet is such a set, so pin a verb-breadth floor beside the counter assertions.
- To prove content is authored, assert against the shape a generator would have produced — and that the generator itself is gone from the source — never merely against the fallback default value.
- Any test asserting an input is ACCEPTED must, in the same test, assert a deliberately invalid input is REJECTED, and any concurrency claim is asserted with a barrier a serial implementation cannot satisfy; a normaliser feeding an equality or determinism check asserts both its ignore-set and a deliberately mutated field that still diverges.
- Information the player or an AI must not have is structurally unavailable — absent from the function's declared inputs and absent from the DOM — and is proved at that boundary, never on outputs alone.
- A precondition or absence guarantee stated in prose — a doc comment, a docstring, an Accept clause — is not a check; land a test that exercises the violating case at the consuming boundary.
- A known-failing balance target stays an `it.fails` tripwire across every baseline re-pin, and the re-pin is explicitly re-read against it in the delivery note.
- Instrument-shape changes get their own commit, with the fixture re-extracted and the baseline re-pinned there; a capstone commit adds no instrument field.
- When a tool's flag can be dropped without failing and the loss is invisible to every fingerprint, assert the SHIPPED artifact's provenance value as its own test; the remedy is re-running the tool, never editing the assertion.
- `npm run format:check` is a mandatory, non-optional gate step on every task — a formatting-red tree is a failed gate, not a cleanup to do later.
- Every source under a hashed root is either hashed or listed in its NON_INSTRUMENT map with a written reason; there is no third, silent state.
- Any type that carries a delta carries the sample sizes of both sides as non-optional fields, and a test regexes the rendered output for both counts alongside the delta.
- A generator that claims self-contained output has a test asserting the rendered string matches none of `https?://`, `<script`, `<link`, `@import`, `url(`.
- Any locally-bound HTTP server passes the host explicitly, pairs it with a `Host`-header allowlist, and has a test that reads back the actually-bound address.
- New private workspaces omit `version` entirely; when a repo-wide invariant test fires on a new file, remove the offending declaration rather than loosening the invariant.
- Any engine flavor string that reaches the player and asserts a venue or facility is gated on the same content flag the UI reads, via one content lookup — never a per-system id ladder.
- Every policy branch that gates the headline income verb carries a non-empty fallback RUNG — a full-tank second-pass relaxation, then `planHomewardBurn`, then `planStrandedExplore` queued last — so no day resolves to a bare `Wait`; `assertNoIncomeStall` covers only `GATE_COMPETENT_POLICIES`, so a branch in `veteran` or `greedy` is invisible to CI.
- When a change to a shared planner moves which seeds strand, pin every offending seed as a `longestZeroIncomeStreak` test at the CI sweep's own 35-day horizon rather than naming it in a delivery note.
- A fix that could satisfy an invariant by RECLASSIFICATION is cross-checked with a variant that changes no classification, before it is graded as having removed the behaviour.
- A shared-helper extraction lands as a PROVEN-INERT step (fingerprint byte-identical to its pin) before any behaviour is wired through it.
- A named repro case that no longer reproduces is REPORTED, never claimed as fixed; discharge the clause by pinning the seed as a regression bar at the horizon that found it.
- A fix for a measured defect is not done until the exact measurement that found it is re-run and passes; state the before/after numbers rather than asserting the branch was sufficient.
- Any registry-plus-composer pair needs a totality guard proving the composer reaches every member the registry exports.
- A table that claims a check covers a requirement is itself tested: every mapped row resolves to a real exported symbol, and every unmapped row carries a null coverage plus a named owning task — never a loose analogue mapped in to make the table read complete.
- Every measured figure quoted from a document carries a resolvable pin checked against the live file in both directions, and is transcribed from the source document, never from a summary of it; a figure that justifies an exemption or a threshold and has no document behind it is pinned by a live measurement test instead.
- A test constant that depends on a live rule — a winning seed, a hardcoded claim, a "this always passes" fixture — is derived at run time from that rule and asserted legal and minimal, never pinned as a literal.
- Narrow a CI workflow by `paths`, never by branch name; a job-level "already covered by the push run" skip is valid only when the push trigger covers every branch that skip applies to, and the trigger array is asserted whole so a re-added allowlist goes red.
- A human-gate checkpoint's ruling cells are machine-asserted EMPTY while the gate is open and NON-EMPTY only by the closing pass; the run that authors the brief never grades the ruling.
- In an npm-workspace CLI, anchor every user-supplied relative path on the repo root so input and default output share one base — and run the documented command verbatim before accepting the docs.
- A UI handler derives engine state from the authoritative post-action state, never from the presence or absence of a notice or refusal message.
- Feedback that can legitimately repeat carries a monotonic identity attribute bumped at one choke point, so a repeat is observable in the DOM.
- A test exercising a failure path CAPTURES the tool's human-readable output and asserts on it, never letting production-shaped failure text escape into the shared run log.
- When one value is recorded in more than one file, one runtime-read site is the authority, a test reads every other site and fails on disagreement, and a totality pass over the tree catches the site nobody remembered; take the count from the test, never from a task block.
- A check that encodes a numeric or lexical PROXY for the property it cares about is replaced with the property, never re-pinned — task ids are not monotonic in this repo.
- A zero, a null diff or an unreached threshold measured by an instrument is a fact about the instrument until re-measured on the rig and at the horizon the thing was derived against.
- A pre-committed criterion and a declined finding both ship as live assertions that recompute their derivation from shipped symbols — no literal thresholds — carrying both rates, both `n` and the SE in the failure message.
- A standing bar is stated on a cut whose marginals are pinned lossless and non-empty with `n` on every cell, never on an aggregate whose level moves with the sweep window or with cell weights.
- An instrument that asserts a policy is good plays to TERMINATION against the SHIPPED counterparty with engine-drawn inputs; a model-coherence test is renamed to say that is all it proves.
- When an AI prices an opponent's public action, the probability model is conditioned on the constraint that action implies, and calibrated by bucket before any argmax is trusted.
- A new instrument field is proved inert byte-identically — deep-equal, stringify-equal, key ABSENT — with the degraded fingerprints re-pinned and a strip-the-keys ledger entry, before any number from it is argued from; a field describing the measurement joins `IGNORED_PATHS` in the same commit.
- Before declaring a move dominated, derive its EV in every currency the game pays out and record the crossover as a formula over live constants, never as a measured take-rate.
- A price the UI quotes is compared to the resolver's own delta and the port's own row, never to a literal or a view-side re-derivation.
- Audio is verified by spectrum inside 150 Hz – 4 kHz, never by peak amplitude at the destination; mix raises go inside the shared envelope, never into a persisted mixer default.
- No audio-graph construction happens at module load; every node defers behind the first real gesture, guarded by a console-cleanliness test.
- Any always-on subsystem carries a plain-boot test — load autosave, no New Game, no day end — not just a fresh-career one.
- An instructional overlay is click-through except its own controls, any stow inside its rails is force-open, and both are proved by an e2e case that boots a real first-time player and performs the instructed action.
- Sequenced-flow progress is a monotone one-shot flag folded from events; no predicate over mutable game state that can flip back.
- Global first-run UI state is handled in every e2e helper family in the same commit — `packages/ui/e2e/support/career.ts` and `packages/desktop/e2e/support/cockpit.ts` — and a green local gate is never evidence for the desktop suite.
- When a test asserts on the FIRST occurrence of anything, every setup action the harness performs happens before the observer is installed.
- Any change that adds chrome to a column ends its spec by driving a control below the fold; height parity is measured against a stashed baseline; anything reporting a spent resource lives outside every collapsible container.
- Every new animation is railed behind `prefers-reduced-motion` and asserted in both directions via computed `animation-name`, with `emulateMedia` followed by `page.reload()`.
- A UI projection that picks from an authored pool is a pure function of a stable domain id, with a test asserting two calls on one state return the same line.
- A variety, detector or reachability test varies the axis the value is KEYED on, and a red one is widened or re-derived through its own documented procedure — never weakened, shrunk or re-thresholded.
- A "nothing changed" arm is proved with a whole-object `toEqual`, and a new nullable field is nulled explicitly on the negative arm.
- When a change removes the scarce resource that was incidentally bounding a loop, the loop's real bound is re-derived and charged per iteration.
- Any check that reads repository history fails loudly rather than skipping, and its CI job checks out with `fetch-depth: 0`.
- A retired exemption, waiver or generator is pinned ABSENT from the module namespace, not merely deleted.
- Where a shared constant must be duplicated to avoid a module-init cycle, both copies are exported and pinned equal in a test file.

---

## Failed patterns

### L-001 · A content field with no reader ships invisible
T-101 specced `HangoutProse` (`houseName`, `roomLine`, `flavour`) and three social venues as part of the parameter surface without naming who renders them. Findings F-101-4 and F-101-6 then recorded that after three content passes authored 14 houses, 14 room lines and 28 flavour lines, NOTHING read any of them — a port's identity reached the player through `wager` and `venues` alone, `App.tsx` printed only `"Spacers Hangout · {systemName}"`, and grep found no consumer of `prose` outside content. The voice was dark at all 14 ports until T-132.
**Enforced by:** `packages/ui/src/__tests__/hangout-pane.test.ts` ("authors a house name at every port the engine opens a Hangout at"; venue-for-venue agreement with the engine) + `packages/ui/e2e/hangout.spec.ts` ("the house speaks"; meet/befriend/insult each dispatchable)
**Rule:** When a spec adds a content field or a venue, name its reader in the same spec and walk EVERY authored row through that reader in a test — otherwise the content pass is graded on differentiation the player cannot see.

### L-002 · A content row with empty player-facing copy is a silent-outcome bug
T-110's 12 `legacy-` rows shipped `wireFound: ''` while `resolveExploreOutcome` guarded on non-empty, so a boarded POI could cost 80 fuel and a die and emit no line at all (F-110-B). The guard hid the gap instead of failing on it. T-113 re-authored the same class: legacy Explore rows carrying empty copy, closed by authoring non-empty, mutually distinct copy on every row so the engine's `wireFound !== ''` guard is vacuous rather than load-bearing.
T-206 shows the same class one level up, where the copy is present but interchangeable: 245 lines across 27 captains (5 slots each) in `packages/content/src/cast.ts`, under an Accept criterion — "not a copy-pasted template — a spot-check comparing two captains' lines must show real voice difference" — that is unfalsifiable as prose, and that a renamed paste (`Deal me in.` vs `Deal me in!`) passes on any eyeball review AND on a bare distinctness check.
**Enforced by:** `packages/engine/src/__tests__/exploreContent.test.ts` — 'EVERY row in the table SPEAKS — non-empty copy, distinct, and {name} at most once' + `packages/content/src/__tests__/castValidation.test.ts` (global raw uniqueness, NORMALIZED uniqueness — lowercased, punctuation stripped, whitespace collapsed — a per-author signature token, and a named hardest-pair spot-check)
**Rule:** Player-visible copy is validated at the content layer — non-empty, mutually distinct, template-safe for every shipped row — never left to a silent resolver-side guard; a row that can be selected and say nothing is a bug, not a null case. Distinctness is not variety: a "not a template / real voice" criterion is MECHANIZED before it is claimed, and when the signature-token check goes red the fix is to author a line that earns a signature word, never to lower the floor.

### L-003 · A union member with no handler is silence
Four occurrences of one class. **Engine side (T-110):** `resolveExploreOutcome` resolves one arm per kind, and without an exhaustive `never` default a new content-supplied kind would be silently swallowed; the check demonstrably bites — deleting the `contraband` member turns the `case 'contraband':` into a compile error (F-113-B). **UI side:** `hangoutFailNoticeFrom` had no arm for `'venue-not-offered'`, so a social-venue refusal rendered NOTHING (F-123-1, unreachable only by accident until Deneb-4 omitted `meet`); `explorationFailNoticeFrom` switched inline, handled five of six shipped reasons and fell through to `return null` on `'recovery-in-progress'` — silence since T-111 — while its docstring claimed full coverage (T-131); and `loanFailNoticeFrom` had a `default` arm, so it was not silent but answered an absent credit desk with "Penny Wise turned that request down", a sentence about a lender who considered and declined, at a port with no lender (T-132).
**Enforced by:** `npm run typecheck` (engine `never` defaults) + `packages/ui/src/format.ts` `explorationFailExplanation` / `hangoutFailExplanation` / `loanFailExplanation` (exhaustive, no `default`, no trailing return) + `packages/ui/src/__tests__/exploration-notice.test.ts` and `hangout-pane.test.ts` (literal `as const` reason arrays; every reason renders a distinct visible line)
**Fifth occurrence, the same hole wearing a different syntax (T-185).** `setVolume`'s persistence-key ternary chain ended `: KEY_AMBIENT`, so adding the `music` bus to `MixerBus` would have written the music level into `sq.vol.ambient` with **no type error at all** — a total `Record<MixerBus, string>` replaced it, and omission is now a `tsc -b` failure. `CAPTAIN_OUTCOME` (T-207) is the same choice made up front: a total `Record<CombatAftermath['resolution'], 'win'|'loss'>` rather than a `switch`, so a sixth resolution arm cannot fall through a `default` and quote the wrong half of a captain's voice.
**Rule:** Every dispatch over a typed union is total BY COMPILATION — a `never` default in the engine, no `default` and no trailing return in `format.ts`, and a total `Record<Union, T>` in place of any ternary chain whose final `else` is one arbitrary member — so a new or removed member fails `tsc` rather than silently no-opping, rendering nothing, or routing to the wrong arm; the store-side function is only the FINDER of the event.

### L-004 · A tuning knob duplicated onto authored rows drifts from its band table
T-111 made recovery length derive from `EXPLORE_VALUE_BANDS` rather than a per-row `recoveryDays`, so authored rows cannot disagree with the ladder. T-131 added `apCost` on identical terms and the same test caught it — a band-level rule that an authored row could silently shadow with a per-row constant, with nothing structural stopping one band from charging calendar days AND extra dice at once.
**Enforced by:** `packages/engine/src/__tests__/exploreContent.test.ts` — "NO authored row carries a recoveryDays or apCost key, and both are its BAND's": asserts `Object.keys(row)` excludes both, that each reader's value equals the band value, that no band has both non-zero, and that the ladder is exactly `[0, 0, 0, 2, 3]`
**Rule:** A value-scaled mechanic knob lives on the band/tier table and is read through a helper; authored rows never carry the key, and a content-shape test asserts its absence — a comment is not enforcement.

### L-005 · A delta written onto a DERIVED field is erased at the next recompute
T-112 had to implement a `{ maxFuel: +40 }` unique-item grant, but `maxFuel` is derived: `syncMaxFuel` recomputes it from the hull at the end of EVERY `applyPlayerAction` and again on load, so a value written onto `ship.maxFuel` would be wiped inside the same action. It ships instead as a stored `bonusMaxFuel` folded in at that one chokepoint, so there is still exactly one place `maxFuel` is decided, and a dead hull still holds nothing.
**Enforced by:** `packages/engine/src/__tests__/uniqueItem.test.ts`
**Rule:** Before writing a state field, check whether a sync/recompute function owns it; if so, store the delta as a separate term folded inside that single chokepoint, and assert it through a real `applyPlayerAction`, not a direct call to the sync function.

### L-006 · A deleted content id is a save-drift case, not a delete
T-114 deleted `legacy-salvage-derelict` and T-117 deleted the `legacy-contraband-*` rows while in-flight saves could still hold those ids in `player.recovery.outcomeId`. Both retirements were safe only because the stored id resolves to `RecoveryAbandoned{unknown-outcome}` and mutates nothing — which is what let two tasks retire rows with no save-version bump.
**Enforced by:** `packages/engine/src/__tests__/recovery.test.ts` — describe 'T-111 · a stored outcome id that no longer resolves' ("clears the slot as unknown-outcome and mutates nothing else"; "an IN-FLIGHT save holding the retired legacy-salvage-derelict is safe")
**Rule:** Before deleting or renaming a content id a persisted save can reference, prove by a load-path test that the stale id degrades to a typed no-mutation refusal — otherwise it is a migration, not a content edit.

### L-007 · Retiring or diluting a content leg can make a deed arithmetically unreachable
In T-113, retiring `legacy-salvage-derelict` would have made the `rich_hulk` deed (fires on a `SalvageRecovered` of 400cr+) unreachable, and merely diluting its leg with six authored rows cut it to missed-by-21-of-24 careers and dropped whole-slate careers to one — turning `deed-coverage.test.ts` red for a reason no wider sample could fix. The red run was root-caused rather than dismissed, which is what surfaced F-113-D.
**Enforced by:** `packages/sim/src/__tests__/deed-coverage.test.ts` + `packages/engine/src/__tests__/exploreContent.test.ts` ("the rich_hulk deed keeps its supply under the WEIGHTED DRAW")
**Rule:** Before deleting or re-pointing a content leg that supplies a deed, check the deed's trigger probability against the replacement rows; a red deed-coverage run is root-caused, never fixed by widening the sample or lowering the threshold.

### L-008 · A real id is not a reachable id
T-114 authored 6 NPC-introduction rows whose `profileId` had to be checked against BOTH `ALL_NPC_PROFILES` and the live `createInitialState().npcs` roster, because `applyEffects`'s disposition arm does `state.npcs.find(...)` and silently `continue`s on a miss. T-124 found the sharper form (F-124-1): a `clientele.regulars` entry naming a QUEST captain is permanently dead content — the eleven quest-frozen captains take no turn in the dusk loop and sit at their day-1 system for a whole career, and `rankClientele` returns its input unchanged on an empty intersection, so the row looks authored, passes every well-formedness check and ranks nobody forever. Both thematically obvious regulars hit it exactly and would have shipped dead.
**T-208 — the same class with no id at all, and no symptom either.** `createInitialState` seeded all 41 cast profiles with `currentSystemId: (index % 20) + 1`, so the 11 `QUEST_PROFILES` (indices 30–40) landed at systems 11–20+1 and **six of eleven** were frozen forever at rim systems with `hasHangout` absent — Doc Salvage at Antares-5, Wild Card at Capella-4, Smuggler Ray at Polaris-1, Stellar Monk at Mizar-9, Void Whisper at Achernar-5, The Broker at Algol-2 — unreachable at a bar in every career on every seed. No test could fail, because arithmetic always produces a legal-looking number.
**Enforced by:** `packages/engine/src/__tests__/exploreContent.test.ts` ("every npc row names a profile the CAST table and the LIVE roster both hold") + `packages/engine/src/__tests__/hangoutContent.test.ts:314` + `packages/content/src/castValidation.ts` `validateQuestHomePorts` (called from `defineQuestProfiles`) with `packages/content/src/__tests__/castValidation.test.ts`
**Rule:** Content that names OR PLACES an entity is validated against the LIVE seeded state and against the CAPABILITY FLAG the content's context actually needs (`STAR_SYSTEMS[id].hasHangout === true`), never against membership of a definition table, never against a numeric id range that merely correlates with the flag, and never derived from array-index arithmetic — placement gameplay depends on is DECLARED per record and checked at import.

### L-009 · A draw's rng cost must not depend on how much content an author wrote
T-117: the legacy `drawLegacyLoot` short-circuited the uniform pick when a leg held a single id, so the number of rng draws — and therefore the phase of the whole day's stream — depended on how many ids an author happened to write on that leg. `drawOutcome` replaced it with a flat two draws, always.
**Enforced by:** `packages/engine/src/__tests__/exploreOutcomes.test.ts` — 'consumes EXACTLY two rng draws, always — even for a one-row band'
**Rule:** A seeded draw consumes a fixed number of rng values regardless of table shape; a content edit inside a band must never re-phase the stream.

### L-010 · A weighted draw over a filtered subset must renormalise over what is actually present
T-117: `drawOutcome` filters `EXPLORE_OUTCOMES` by pool before drawing a band, so a band with no row in that pool would silently hand its share (15% or 3%) to whichever band came last in the cumulative walk, and §5.3's sweep sizing would describe a table that does not exist.
**Enforced by:** `packages/engine/src/__tests__/exploreOutcomes.test.ts` — 'honours the §5.2 band weights within sampling error'; `packages/engine/src/__tests__/exploreContent.test.ts` — 'EVERY BAND HAS A ROW IN EVERY POOL'
**Rule:** Renormalise weights over the entries actually present after filtering, and assert both the resulting distribution and the content invariant that no bucket is empty.

### L-011 · A non-null assertion does not survive a growing `as const` tuple
In T-115, adding eight explore episodes to `STORYLETS` widened its `as const` tuple far enough that TypeScript stopped carrying the non-null assertion through the chained access `STORYLETS.find(...)!.wireResolution.wireMessage`, reporting the object as possibly undefined. The fix bound the found storylet to a named const and added an explicit `toBeDefined()` — asserting strictly more than the line it replaced.
**Enforced by:** `npm run typecheck`
**Rule:** Never chain off `.find(...)!` on a large `as const` collection — bind the found entry to a named const and assert it explicitly (the shape `npc-chains.test.ts` and `alliance-arcs.test.ts` already use); when the assertion breaks after content is added, fix the binding, never widen the type or weaken the assertion.

### L-012 · A planner that does not mirror the resolver's guards burns the verb
Four occurrences. T-116/T-150 (F-116-1): `explorerPolicy` queued Explores without consulting `state.player.recovery`, so 3,204 of 23,858 queued Explores landed on a recovery dawn — guaranteed `recovery-in-progress` refusals burning a plan slot each. Both the engine and `legalActions` gated correctly; the gate simply was not on the path `runCampaign` takes, **because the runner never calls `legalActions`**, so any balance number measured over those days was measuring refusals. T-121 (F-121-1): `planDare`, `legalActions` and the deed hunter's `dealerHere` all selected an in-system dealer WITHOUT the resolver's `!npc.dead` guard, invisible while exactly one port had a bar (0 failures over 10 seeds × 120 days) and live the moment reach went 1-of-28 → 14-of-28. T-123: three policy planners went out of step when a port withdrew `borrow`/`repay`, emitting a typed refusal and a different fingerprint.
**Enforced by:** `packages/sim/src/__tests__/campaign-policies.test.ts` (describe 'T-150 · F-116-1 · explorerPolicy never queues an Explore the engine will refuse') + `packages/sim/src/__tests__/campaign-smuggler-gambler.test.ts:238` (dead-dealer selection; driven campaigns asserting `play.failedVisits === 0`)
**Rule:** When a policy or enumerator plans an action, it applies the exact filter set the resolver accepts, read through the engine's own accessor — `legalActions` passing is not proof — and asserts refusal-freedom on a driven campaign with a paired non-vacuous control, because this class stays latent while the affordance is reachable at one place only.

### L-013 · A defect lives at every sibling call site — and the accidentally-safe siblings are what hide it
Two occurrences, two shapes. **All siblings broken (T-150):** after fixing `explorerPolicy`'s unguarded Explore loop (F-116-1), `smugglerPolicy` was found to carry a byte-identical copy of the same defect (F-150-2, 3,891 of 23,192 queued on a recovery dawn) that the original finding never named. **Only one family broken, which is worse (T-182 / F-156-1):** `spendDie` had two divergent caller conventions — six callers assigned its return value back onto the save and were broken, while `actions/crew.ts`, `actions/port.ts`, `actions/hangout.ts` and `actions/dare.ts` mutated `spent[index]` on the live hand and were accidentally safe. The two families disagreed, only one was right, and the safe half is why the bug survived unnoticed from T-1306 to T-182.
**Enforced by:** `packages/sim/src/__tests__/campaign-policies.test.ts` + `packages/engine/src/__tests__/spend-die-rerolls.test.ts` (a caller MANIFEST rescanned from the source tree: every caller in the tree has a case or a documented exemption, and each assign-family caller is driven through `applyPlayerAction`)
**Third occurrence, and the reason a manifest needs two halves (T-196a).** Eight of the ten `spendDie` call sites left the source when the nine M17 Free Actions were freed, and the doc-comment ledger's line numbers went stale with them. A one-directional manifest — "these sites call it" — would have stayed green while a freed verb quietly re-acquired a die spend.
**Rule:** When fixing a loop, guard or shared helper, enumerate every sibling call site — `grep` the sibling policies in `packages/sim/src/index.ts`, or the helper's callers across the tree — and fix or tripwire each before closing the finding; where two call-site conventions have diverged, commit the caller list as a manifest a test RESCANS from source, and assert BOTH halves against live source — the sites that DO call the helper, and the families that must NEVER call it — so a new or reappearing caller in either family goes red instead of silently inheriting the unsafe convention.

### L-014 · An extraction is not behaviour-preserving until every consumer reads the accessor
In T-120 the Hangout wager band and check DCs moved out of `hangout.ts`'s constants into content behind `wagerBandFor` / `venueParamsFor`, but `legalActions` and `packages/ui/src/format.ts`'s `dareWagerBounds` / `hangoutNpcs` still clamped and advertised against the old `DARE_MIN_WAGER` / `DARE_MAX_WAGER` / `BEFRIEND_DC` constants — the UGT harness and the Hangout pane would have offered a band the engine no longer read.
**T-196c — the same shape when the thing that moved is a RULE, not a constant.** All nine verbs freed of their die cost in the engine still read `state.selectedDie` in `packages/ui/src/store.ts`, refused when null, and CLEARED `selectedDie` / wrote `bloomDie` on commit — so buying fuel silently disarmed the die queued for a jump, and `dropDie`'s drag bridge had it in reverse, ARMING a die as a side effect of a free verb. **T-205 — the same shape when the mirror is forced.** `LIARS_DICE_DICE_COUNT_PHRASE` could not be imported into `castValidation.ts` without closing a `cast.ts → castValidation.ts → liarsDiceValidation.ts → cast.ts` init cycle, so the regex shipped as a second copy with nothing but a docblock tying the two together.
**Enforced by:** `packages/sim/src/__tests__/protocol.test.ts:1268` (wager domain asserted equal to `wagerBandFor(portId)` with a non-vacuity check that the port band differs from the global one) + `packages/ui/src/__tests__/liars-dice-pane.test.ts:416` + `packages/ui/src/__tests__/free-actions.test.ts` (a two-sided source-scan manifest of GATED vs FREED creators) + `packages/content/src/__tests__/castValidation.test.ts:307-308` (`.source` and `.flags` of both copies asserted equal)
**Rule:** When a constant or a rule moves, move every mirror of it in the SAME change — sim protocol, UI format, and the store creators that gate on it — stripping the resource READS and the resource WRITES together, and pin each mirror with a test that reads the accessor rather than a restated literal. Where a shared constant genuinely must be duplicated to avoid a module-init cycle, EXPORT both copies and pin them equal in a test file (a test file is a leaf and adds no edge to the module graph); a comment naming the other copy is not enforcement.

### L-015 · A one-global-winner selector is a latent single-scope assumption
T-122 found F-121-2: `activeOnboardingPrompt` picks ONE global winner, and `first-loan` — predicate `hangoutOpen(game) && loan == null`, mounted inside the *closed* Hangout panel — took that slot at every `hasHangout` port, rendering nothing and blocking `first-contraband`, `first-port` and `first-explore`. Latent at 1 of 28 ports, live at 14 of 28 the moment T-121 widened Hangout reach.
**Enforced by:** `packages/ui/e2e/onboarding.spec.ts`
**Rule:** A selector that picks one global winner among mount-scoped candidates must be mount-aware; whenever a feature's reach widens, re-run the specs that assert each candidate fires in its own scope, positive and negative.

### L-016 · A green test that quantifies over nothing
Seven occurrences of one class — green while asserting nothing. T-122: an Accept clause named a literal grep over a content file, executed from a test in a different package, so a wrong path, an emptied file or a moved table would pass vacuously. T-124: `AUTHORED_PORTS` / `MECHANICALLY_DEVIANT_PORTS` drive every `it.each` in the file, so a dropped row would quietly stop being tested by every block and nothing would go red. T-124 again: T-121's "the unauthored rows are still BASELINE rows" test would have become a loop over an empty id list once the last four ports were authored — green forever. T-149: flavor tests iterate port sets derived from `STAR_SYSTEMS`, so a content edit flagging the whole rim would have emptied them. T-143: the "panel is not shipped" test greps eight build-output directories, and on a machine where nothing has been built an unrecorded pass would report green having checked nothing. T-153: the clean gate fixture would have reported all-pass while several `EXPECTED_EVENT_RATES` bands were merely SKIPPED for want of sample size. **T-155 — the sharpest form, where the SET is a driver's behaviour rather than a list:** the pilot's volume leg would have reported `illegalAttempts` / `protocolErrors` / `fallbacks` all zero off the `first-legal` brain, which reaches just 5 distinct verbs over 5 seeds × 30 days (three at seed 1) with a flat, seed-independent `stepsApplied: 150`. An all-zero counter sheet over 5 of the 87 `specType`s the engine offers measures the driver, not the system.
**Enforced by:** `packages/engine/src/__tests__/hangoutContent.test.ts:537` (enumeration pinned to the table's key set in both directions plus cardinality) and `:550`; `packages/engine/src/__tests__/hangoutRules.test.ts:265` (inverted to the positive claim with a cardinality guard); `packages/engine/src/__tests__/npc.test.ts` ('has both port sets non-empty, so nothing below can pass vacuously'); `packages/devpanel/src/__tests__/not-shipped.test.ts` (records `absent (not built)` per directory in the assertion message); `packages/sim/src/__tests__/sweep-gate.test.ts` ('the clean sample passes every band, and SKIPS none of them'; 'SKIPPED is a third value, not a quiet pass'); `packages/sim/src/__tests__/pilot.test.ts:393` ('is not first-legal in disguise — it exercises real verb breadth')
**Three further shapes, all of them "green while asserting nothing".** **T-221 — the sample that may never reach its own case:** an escrow-tracking test needed a REACHABLE RAISE, which is a property of the seed, so scanning seeds until one occurs would have passed while never entering the case it claims to guard. **T-208 — the invariance a dead system also satisfies:** asserting the eleven quest captains' `{id → currentSystemId}` byte-identical after a 40-day career is a claim a dusk loop that stopped running entirely would also pass. **T-177 — the zero that stops meaning anything the moment the mechanism changes:** `optimal` never folds because `probClaimTrue` is a POINT read (`pTrue` exactly 0 or 1), and a test asserting "folds 0" would still pass if a later soft read revived the branch at a low fold share.
**Enforced by (additions):** `packages/ui/src/__tests__/liars-dice-pane.test.ts` (`expect(raised).toBe(1)` — the precondition itself asserted) · `packages/engine/src/__tests__/day.test.ts` (`T-208 · quest captains are stationary`, with the ANTI-VACUITY CHECK at :434-441 asserting at least one SIMULATED captain relocated over the same run) · `packages/engine/src/__tests__/liarsDiceArchetypes.test.ts` (describe `T-177 · F-175-2 — OPTIMAL never folds, and that is now a construction`, asserting `probClaimTrue ∈ {0,1}` at every shipped tier width)
**Rule:** Any test that quantifies over a derived, enumerated or scanned set must prove it is non-vacuous — assert the set non-empty, pin its cardinality to the source in both directions, first assert the scanned file is non-trivial and holds the symbols claimed, enumerate every location inspected in the failure message, and count skips as failures; when a task empties the set a test quantifies over, invert it into the positive claim over the new set rather than leaving a loop that can pass over nothing. An audit driver's clean-counter claim is a quantification too, and only as wide as its action breadth: pin a breadth floor in the same file as the counter assertions. Three corollaries: a test that widens its sample until a precondition occurs ASSERTS the precondition was reached; any "X did not change" assertion asserts IN THE SAME RUN that the mechanism which could have changed X was live; and any "this branch never fires" assertion pins the CONSTRUCTION that makes it never fire, not the zero count.

### L-017 · Assert against the generator's shape, not against the fallback constant
The existing "not the DEFAULT house name" check did NOT catch a T-121 baseline row, because `baselineHangout` generated `the <system> Hangout` per port — a name of its own that passed the default check while carrying no authored voice. The teeth came from asserting `houseName !== \`the ${STAR_SYSTEMS[id]?.name} Hangout\`` and from grepping the source for a surviving `baselineHangout` call.
**T-206 — the same rule pointed at a retired WAIVER rather than a retired generator.** T-206 deleted `VOICE_AUTHORING_PENDING`, its 27-id set, the `waived` branch in `validateNpcVoices`, the `rosterIds` set and three waiver-hygiene rules. Nothing would have stopped a future captain being exempted by reintroducing the symbol, and a deletion on its own leaves no signal at all.
**Enforced by:** `packages/engine/src/__tests__/hangoutContent.test.ts:550` + `packages/content/src/__tests__/castValidation.test.ts` (the ANTI-REFILL test: `'VOICE_AUTHORING_PENDING' in contentIndex === false`)
**Rule:** To prove content is authored, assert against the shape a generator would have produced — and that the generator itself is absent from the source — not merely against the fallback default value. Retiring an exemption means deleting the SET **and** the branch that reads it, then pinning its ABSENCE from the module namespace, while leaving the history trail in docblocks (mark resolved, do not wipe).

### L-018 · An acceptance assertion with no negative control passes against a no-op
Three occurrences. **T-143 twice.** (a) Proving every panel flag is a real parsed argument: spawning each CLI with all panel flags and asserting no `Unknown argument:` / `Missing value for` would pass identically against a parser that validated nothing at all. (b) Proving sweep shards launch concurrently: timing-based assertions ("it was faster") pass by luck on a serial implementation. **T-155 — the same hole in a determinism NORMALISER:** `pilot-cli.ts` builds `runId` from `Date.now()`, so two independent processes can never emit byte-identical JSONL and a raw `diff` reports a meaningless divergence; `actionSequence()` therefore normalises `runId`, `startedAt` and `brain.latencyMs` away. A normaliser that drops too much passes forever, so the check is only a check once the ignore-set AND a deliberately mutated field are both asserted — the sequence keeps the step ordinal, the chosen `specType`/id, the action sent, the response type and the engine's state delta, so the claim is "the same seed produced the same *game*".
**Enforced by:** `packages/devpanel/src/__tests__/commands.test.ts` (each accept assertion pairs with a deliberately invalid input asserted rejected) + `packages/devpanel/src/__tests__/sharding.test.ts` (a barrier `SpawnFn` whose children exit only once N are simultaneously live, so a serial implementation deadlocks and times out, plus a real-process overlap check on top) + `packages/sim/src/__tests__/pilot.test.ts:458` ('ignores runId, startedAt and latencyMs') and `:466` ('still diverges when a single action parameter changes')
**Rule:** Any test asserting an input is ACCEPTED must, in the same test, assert a deliberately invalid input is REJECTED; assert concurrency with a barrier a serial implementation cannot satisfy, so the serial case is an outright failure rather than a slower pass. Any normaliser feeding an equality or determinism check needs BOTH halves asserted — the volatile fields ignored, and a deliberately mutated field still diverging — otherwise the check can only ever pass.

### L-019 · Hidden information must be structurally unavailable, proven at the boundary
Three occurrences. T-134 named cheating-AI as a bug class no existing verb guarded against and specified the Liar's Dice dealer as a pure function of its own hidden dice, the current bid and `dealerGuile` — but nothing structural stops a policy from reading the opposing hand. T-135: an outputs-only test passes just as happily for a policy that cheats, so the check had to inspect the function's declared inputs as well as sweep varying hidden dice for move invariance. T-136: a merely CSS-hidden dealer face would have passed a naive visibility check while sitting in the page source.
**Enforced by:** `packages/engine/src/__tests__/liarsDice.test.ts` — describe "the dealer policy cannot read the player's hand", arms "(a) the signature has no channel for hidden player information" and "(b) varying the player's hidden dice never changes the dealer's moves" + `packages/ui/e2e/liars-dice.spec.ts` `expectDealerHidden` (no `data-face` attribute, no `.d6` mounted, and a sweep of the scene's innerHTML for the reveal-only class; takes a `peeked` count so a legitimately Peek-revealed die is not forbidden)
**Rule:** Information the player or an AI must not have is structurally unavailable — absent from the function's declared inputs and absent from the DOM before the reveal frame — and is proved at that boundary by invariance under varying the hidden state, never on outputs alone.

### L-020 · Prose is not enforcement
Two occurrences. T-132/F-101-5: `rankClientele`'s doc comment states its contract explicitly — "the caller passes the ALREADY-FILTERED live in-system, non-dead set" — and the UI caller `hangoutNpcs` filtered on `currentSystemId` only, so the opponent list could offer a dead captain. T-140: an instrument-only `NpcDecisionTraceSink` seam was threaded through `pickIntent`/`pickContract`/`resolveNpcDay`, and the Accept clause asked only for a manual `grep` under `packages/ui` and `packages/desktop` — a sink attached in the cockpit would be a per-captain-per-day allocation on the player's dusk and a diagnostic channel on the save-writing path.
**Enforced by:** `packages/ui/src/__tests__/hangout-pane.test.ts` (exercises a mixed live/dead roster and an all-dead roster) + `packages/ui/src/__tests__/npc-trace-absent.test.ts` (source scan forbidding `npcDecisionTrace`, `NpcDecisionTraceSink`, `NpcDecisionTrace`, `EndDayOptions` in every shipped root)
**Rule:** A precondition or absence guarantee stated in prose — a doc comment, a docstring, an Accept clause — is not a check; land a test that exercises the violating case at the consuming boundary, and never leave an absence to a grep someone has to remember to run.

### L-021 · A re-pin must be re-read against the known-red tripwires, never chosen to make them pass
T-125 re-pinned the baseline of record to an 8,000-row aggregate and re-read the trader clear-day tripwire against it: still RED at `debtClearedDay.median` 21 vs `[22, 30]`, n = 987. It was not converted from `it.fails` to `it`, and the baseline was not selected to move the number into band.
**Enforced by:** `packages/sim/src/__tests__/balance-targets.test.ts:225`
**Rule:** A known-failing balance target stays an `it.fails` tripwire across every baseline re-pin — never converted, never deleted — and the re-pin is explicitly re-read against it in the delivery note.

### L-022 · Do not move `instrumentFingerprint` in the commit that takes the capstone
T-125's five questions needed hangout, disposition and interceptor-source fields the aggregate does not carry; adding them would have moved `instrumentFingerprint` in the same commit that took the capstone and extracted the fixture from it, so the fixture would have recorded numbers measured under a different instrument. The measurement was routed to a gitignored two-arm probe instead.
**The mirror-image discipline, from T-177 and T-219: a fingerprint NON-move is measured, never asserted.** T-177 claimed a comment-only engine edit and proved it by reading `computeRulesFingerprint(repoRoot)` at HEAD before and after (`cabd2112ccf4cefb` both times) rather than reasoning that comments cannot matter. An asserted non-move silently desynchronises the balance fixture from the tree, which is the same failure the freshness check exists to catch.
**Enforced by:** `packages/sim/src/__tests__/balance-smoke.test.ts` ("the fixture describes the ruleset in the working tree / is not stale", via `fixtureFreshness` in `packages/sim/src/balance/checkpoints.ts`), run as `npm run balance:smoke` in the gate
**Rule:** Instrument-shape changes get their own commit, with the fixture re-extracted and the baseline re-pinned there — a capstone commit adds no instrument field — and any task claiming it did NOT move `rulesFingerprint` shows the hash read at HEAD before and after the edit and runs `npm run balance:smoke`.

### L-023 · A dropped tool flag can silently downgrade a shipped fixture
T-146 found F-146-0, a regression T-145 left behind: `balance:extract` was run with NO `--aggregate`, so it defaulted to a baseline carrying no `fleet.milestones`, flipping `docs/balance/smoke/tiers.json`'s `provenance.spreadSource` from `harvested` to `estimated` and replacing harvested tier spreads with synthetic ones — a silent quality regression that survived a whole milestone unnoticed. T-148 made it loud and named why it was invisible: omitting the flag does not fail, and the loss moves none of `rulesFingerprint` / `instrumentFingerprint` / `docsFingerprint`, so the freshness check never trips and a whole milestone can pass green on a degraded rig.
**Enforced by:** `packages/sim/src/__tests__/balance-smoke.test.ts:100` (asserts `provenance.spreadSource === 'harvested'` as its own test, alongside — never instead of — the enum-legal-range assertion)
**Rule:** When a committed fixture records the PROVENANCE of its own data and the tool flag that sets it can be dropped without failing, assert the good value as its own test; the remedy is re-running the extract, never editing the assertion.

### L-024 · An optional format step lets a fingerprint-moving commit land
At T-130 finding V-2 was confirmed: a commit landed with `npm run format:check` RED because the orchestrator's format step was optional. The residue was real, not cosmetic — the standing "run `npm run format` BEFORE the capstone" constraint assumes an already-formatted tree, and `rulesFingerprint` is not formatting-invariant, so a later whitespace reflow of a hashed source silently changes what a capstone hashes.
**Enforced by:** `.github/workflows/ci.yml` (`npm run format:check`) plus the mandatory gate line in the task-list standing constraints
**Rule:** `npm run format:check` is a mandatory, non-optional gate step on every task — a formatting-red tree is a failed gate, not a cleanup to do later.

### L-025 · A new file under a hashed root must declare its fingerprint class
T-157 added `packages/sim/src/balance/coverage.ts`; leaving it unclassified would have moved `instrumentFingerprint`, staled every committed smoke fixture and owed a capstone. It was declared NON-INSTRUMENT with its reason in `SIM_NON_INSTRUMENT_SOURCES`, which is also what satisfies the undeclared-file guard.
**Enforced by:** `packages/sim/src/__tests__/balance-rig.test.ts` — the classification-totality check over `allSourceKeys` / `SIM_NON_INSTRUMENT_SOURCES`
**Rule:** Every source under a hashed root is either hashed or listed in its NON_INSTRUMENT map with a written reason; there is no third, silent state.

### L-026 · A delta without its sample size is a bare delta — enforce it in the type
T-142's before/after view compares aggregates of different size (7 policies/500 seeds vs 8/1,000). A rendered delta with no n beside it invites exactly the Appendix A failure — passed at n=100, failed at n=1,000. Fixed structurally: every `BeforeAfterRow` carries non-optional `beforeSeeds` / `afterSeeds` / `beforeRuns` / `afterRuns` (plus `beforeN` / `afterN` for distributions), so a renderer physically cannot emit a delta without them.
**Enforced by:** `packages/sim/src/__tests__/balance-report.test.ts`
**Rule:** Any type that carries a delta carries the sample sizes of both sides as non-optional fields, and a test regexes the rendered output for both counts alongside the delta.

### L-027 · "Self-contained" output decays silently
T-142's report is specified as self-contained static HTML written to a gitignored path and opened straight from disk; a single CDN font, `<link>`, `@import` or `url(...)` would break that with no visible symptom on the author's machine. The generator emits inline `<style>` + inline `<svg>` and zero JavaScript, with `<title>` as the no-script hover layer.
**Enforced by:** `packages/sim/src/__tests__/balance-report.test.ts`
**Rule:** A generator that claims self-contained output must have a test asserting the rendered string matches none of `https?://`, `<script`, `<link`, `@import`, `url(`.

### L-028 · Node's `listen(port)` without a host publishes to the LAN
The devpanel server spawns processes; omitting the host argument in `listen()` would have exposed it on every interface, and loopback binding alone still would not stop DNS rebinding.
**Enforced by:** `packages/devpanel/src/__tests__/not-shipped.test.ts`
**Rule:** Any locally-bound HTTP server must pass the host explicitly (`listen(port, '127.0.0.1')`), pair it with a `Host`-header allowlist, and have a test that reads back the actually-bound address rather than trusting the call.

### L-029 · A new workspace manifest must not declare a version
`packages/devpanel/package.json` initially declared `0.5.2` and broke the invariant that exactly ONE workspace declares a version in `package-lock.json`; the fix was to drop the field, since a private never-published dev tool has no product version to state, rather than widen the invariant.
**Enforced by:** `packages/ui/src/__tests__/version.test.ts`
**Rule:** New private workspaces omit `version` entirely; when a repo-wide invariant test fires on a new file, remove the offending declaration rather than loosening the invariant.

### L-030 · Engine flavor text is player-facing prose, not debug text
T-149: `executeSocialize` narrated "cleaned up at the {system} Hangout tables" / "bought a round at the {system} Hangout" without ever reading `hasHangout`, so at 18 of 28 ports — six of them reachable by the cast — the wire told the player about a bar the game's own UI says does not exist. `hangoutRumors` interpolates `lastAction.details` VERBATIM into `RUMOR_TEMPLATES.Socialize`.
**Enforced by:** `packages/engine/src/__tests__/npc.test.ts` — describe('T-149 Socialize flavor respects hasHangout')
**Rule:** Any engine flavor string that reaches the player and asserts a venue or facility is gated on the same content flag the UI reads, via one content lookup — never a per-system id ladder.

### L-031 · A gated headline verb with no fallback is a poverty trap
Twice, and the second time at capstone scale. **T-159:** `fighterPolicy`'s contract-signing branch filtered `rankedContracts` to `maxFuel * SIGN_FUEL_FRACTION` (0.6) with no second pass, unlike the four other gated policies that all carried the T-1104 full-tank relaxation. At a rim port where every leg exceeded the margin the filtered set was empty every day, and since `isIncomeAction` counts only sign-contract / Travel / Explore / Combat, the ship queued refuel and debt payments while its zero-income streak climbed to 30 days on seed 35 (limit 5). **T-199 — the residue, found only by widening the sweep:** `npm run balance:sweep -w @spacerquest/sim -- --seeds 1000 --days 35` (4 shards) put `assertNoIncomeStall` red on HEAD with 7 violations across three policies — smuggler (seeds 20, 677), trader (371, 571: a full 240/240 tank, 3,000cr, `reachable` empty even at `maxFuel`, and no anti-idle move at all) and fighter (74, 747, 916: streaks of 9, 26, 24). The day resolved to a bare `Wait`. CI had already sampled one of them and turned the branch red at `assertNoIncomeStall · smuggler · seed 20`.
**Enforced by:** `packages/sim/src/balance/gate.ts` (`assertNoIncomeStall`, line 490, `INCOME_STALL_LIMIT = 5`), run by `npm run balance:sweep` and `.github/workflows/sweep-gate.yml`, covered by `packages/sim/src/__tests__/sweep-gate.test.ts`
**Rule:** Every policy branch that gates the headline income verb carries a non-empty fallback RUNG, not merely a fallback: `planHomewardBurn` first, then `planStrandedExplore` queued last, so no day can resolve to a bare `Wait`. Note the scope — `assertNoIncomeStall` only covers `GATE_COMPETENT_POLICIES`, so `veteran` and `greedy` are not checked by it and a fallback-less branch there is invisible to CI.

### L-032 · A one-branch diagnosis is a hypothesis until the failing measurement is re-run
T-159's brief diagnosed one missing branch. The T-1104 relaxation alone took seed 35 from 32 consecutive zero-income days to 8 — still over the limit of 5 — because after a succession the ship had a 240-unit tank and every leg on offer cost 252–602 fuel, so `reachable` was empty even at `maxFuel` and there was no filter left to relax. Only a second, anti-idle homeward-burn branch closed it (seeds 1..200: longest streak 32 → 19, seeds ≥ 5 six → one).
**Enforced by:** `packages/sim/src/balance/gate.ts` `assertNoIncomeStall`, re-run through the exact CI invocation in `.github/workflows/sweep-gate.yml` (shard 1/2, 2/2, `--merge`), which stays red on a partially fixed policy
**Rule:** A fix for a measured defect is not done until the exact measurement that found it is re-run and passes; state the before/after numbers rather than asserting the branch was sufficient.

### L-033 · An exported predicate the composer never calls silently never runs
Nothing structurally forced `runGate` in `packages/sim/src/balance/sweep.ts` to call every `assert*` that `gate.ts` exports; a tenth invariant added to `gate.ts` but never wired in would have sat green forever.
**T-167 — what the guard's FIRST legitimate exemption is allowed to cost.** A tenth exported `assert*`, `assertVariantsPerturbEveryPolicy`, takes a control aggregate plus N variant arms, so `runGate` can never reach it by construction — a sweep has exactly one arm. The cheap repair would have been an exemption list. Instead the guard was re-cut to PARTITION the exported names on SIGNATURE via a second exported registry, `ARM_LEVEL_ASSERTIONS`, with both counts asserted (9 report-level, 10 exported total) and every name in the second registry owing a seeded-bad fixture that proves it fires.
**Enforced by:** `packages/sim/src/__tests__/sweep-gate.test.ts` — 'runGate reaches EVERY invariant gate.ts exports (the kitchen sink)' + `:642` 'ARM_LEVEL_ASSERTIONS names only real arm-level exports, and each owes a fixture', with the roster counts at `:636-639`
**Rule:** Any registry-plus-composer pair needs a totality guard proving the composer reaches every member the registry exports; when a member genuinely cannot be reached by its composer, repair the guard by partitioning on SIGNATURE into a second NAMED registry — never by adding an exemption list — and make every name in that second registry owe a seeded-bad fixture proving it fires, so the exemption costs a working demonstration rather than buying silence.

### L-034 · A coverage table can claim coverage that does not exist
T-152 wired the T-1604a invariant set into the sweep as a gate, but three of the eight are protocol-seam statements no sweep can observe. Rather than mapping them onto a loosely related assertion to make the coverage table read 8/8, they were recorded as `disposition: 'not-observable'` with `coveredBy: null` and an owning task named in `why`. T-153 then closed the other half of the hole: a `mapped`/`analogue` row naming a non-existent function, or a `not-observable` row quietly carrying a `coveredBy` value, would fake Tier-1 coverage.
**Enforced by:** `packages/sim/src/__tests__/sweep-gate.test.ts` — 'SWEEP_INVARIANT_DISPOSITIONS is honest about all eight UGT predicates' (asserts 8 entries, exactly 3 not-observable, each with `coveredBy: null` and an owner matching the task pattern, and every mapped entry's `coveredBy` resolving to a real exported assert)
**Rule:** A table that claims a check covers a requirement is itself tested: every mapped row resolves to a real exported symbol, and every unmapped row carries a null coverage plus a named owning task — never map a check onto an adjacent assertion to make a coverage table read complete.

### L-035 · A measured figure written into prose is a claim nothing checks
Three occurrences. **T-157, twice:** `ACKNOWLEDGED_COVERAGE_GAPS.gambler`'s evidence quoted the PARITY LEDGER's ruling-time figures `+4.86cr/captain-day` and `95.91%` as "still true" when the re-ask the ledger row itself points at had already re-measured them at `+3.44cr/captain-day` and `37.97%` — the status half of `coverage.ts` was machine-checked, the evidence half was trusted prose. Separately, the Accept clause took "the two most distinctive archetypes" from a SUMMARY document instead of from the two source documents, and was wrong by one row (F-157-1), halting the task for an owner ruling on what was pure transcription. **T-161, the sharper form — a figure with no document behind it at all:** `veteranPolicy`'s exemption note in `packages/sim/src/balance/gate.ts` `GATE_COMPETENT_POLICIES` justified the exclusion with "6-8 consecutive zero-income days" attributed to dice-banking; re-measured over seeds 1..200 × 35 days the pre-fix reality was a 31-day worst streak on 198 of 200 seeds, and the cause was an un-relaxed contract filter (F-159-1), not banking. The number was off by ~4× and only a human audit found it.
**Enforced by:** `packages/sim/src/__tests__/archetype-coverage.test.ts` — 'pins every measured figure an acknowledgement quotes to its live document row'; 'mirrors docs/TESTING-STRATEGY.md Part C, in both directions'; "mirrors docs/NPC_REDESIGN.md's PARITY LEDGER row by row" · `packages/sim/src/__tests__/sweep-gate.test.ts:452` — "the veteran carries the T-1104 full-tank relaxation (F-159-1 regression pin)", a LIVE nine-seed run rather than a hash, which also asserts `GATE_COMPETENT_POLICIES` still excludes `veteran`
**T-166 — the same class where the source is a COMMIT rather than a document, and wrong twice about the same four lines.** §6 of `docs/BALANCE-TELEMETRY_SPEC.md` asserted an Accept criterion — "the `rulesFingerprint` move is the ONLY expected diff" — citing T-110 (`3468ef5f`) as precedent, but it had been transcribed from a summary (`docs/TESTING-STRATEGY.md`) instead of read off the commit; `git show 3468ef5f -- docs/balance/smoke/tiers.json` shows FOUR paths moved. The 2026-08-01 reword to "fingerprints and `provenance` only" was still wrong, because `productVersion` moves too. Nothing had ever read the diff. (`packages/sim/src/__tests__/smoke-reextraction.test.ts` now reads it out of git; the historical misquotes are left intact as the auditable record of why the check exists.)
**Rule:** Every measured figure quoted from a document carries a resolvable pin (document · section · row · value) checked against the live file AND asserted still quoted by the prose, and a criterion that cites a PRECEDENT COMMIT is asserted against that commit's real diff read out of git, never against a doc restating it; and every transcribed constant is asserted equal to the parsed source in BOTH directions — transcribed from the source document, never from a summary of it; where the figure has no document behind it and instead JUSTIFIES an exemption or a threshold, the pin is a live measurement test that fails if the relaxation is removed or the membership call drifts. An empty pin list is a checked claim with a stated reason, never a blank field.

### L-036 · A CI trigger enumerated by branch name is a gate that does not run on the branch that needs it
Twice, a fortnight apart, on the same mechanism. **F-112-D:** T-1605 deleted the travel PILOT check while `starmap.spec.ts` still asserted it, and 7 of 95 specs sat red on `main@74403ab4` from 2026-07-28 until T-112 tripped over them. **F-162-3:** T-195 shipped `navDieFuelDiscount` / `navDieEvasionFactor` without an e2e run, and six specs sat red on `redesign/explore-hangout` until T-162 tripped over them. Root cause both times: `ci.yml` triggered `push` on the hand-maintained list `[main, rimward-redesign]` **and** every job skipped same-repo PRs on the grounds that the push run of the same commit had already tested it — a premise that is false on an unlisted branch, so the commit about to merge got no run at all. Neither change "touched the cockpit", so `ENGINEERING-POLICY.md` §2's local e2e requirement did not fire either. `sweep-gate.yml` showed the rot in progress: someone had hand-added `redesign/explore-hangout` to its list, one branch at a time.
**Enforced by:** `packages/ui/src/__tests__/ci-workflow.test.ts` — 'ci.yml triggers `push` on `**`, or is a declared narrowing'; 'NEGATIVE CONTROL: the pre-fix trigger fails the same check the live one passes'; 'every job carries the IDENTICAL same-repo-PR skip — no duplicate runs' · `.github/workflows/{ci,sweep-gate,e2e-flake}.yml` (`branches: ['**']`)
**Rule:** Narrow a workflow by `paths` — a cost argument, which re-opens itself when the measured thing changes — never by branch name, which is a coverage argument that rots one branch at a time; and a job-level "already covered by the push run" skip is only valid when the push trigger covers every branch that skip applies to. Assert the whole trigger array, not membership, so a re-added allowlist goes red.

### L-037 · A field-by-field rebuild silently drops the next field added to the record
Found at T-156 while reading `dice.ts` for the NPC virtual hand's RNG discipline, filed as F-156-1 and fixed at T-182: `spendDie` (`packages/engine/src/dice.ts`) rebuilt the hand as `{ dice: [...hand.dice], spent: [...hand.spent] }`, dropping `rerollsRemaining` — a field a LATER task (T-1306) added to `DawnHand`. The first die a player spent on any assign-the-returned-hand action wiped the day's crew-granted re-roll charges, and `resolveReroll` in `actions/crew.ts` then refused with `no-rerolls-left` a charge the player had reached and paid for via `packages/content/src/crew.ts` and `EXPLORE_MODULE_DICE_BENEFITS['module-marked-ephemeris']`. The helper's own unit test passed throughout, because it tested the two fields the rebuild happened to list.
**Enforced by:** `packages/engine/src/__tests__/dice.test.ts` (the whole-copy contract — an optional field SURVIVES, and its true absence is PRESERVED rather than coerced to `0`) + `packages/engine/src/__tests__/spend-die-rerolls.test.ts`
**Rule:** A helper that returns a modified copy of a shared state record returns a COMPLETE copy of its input — spread the input, then override — never an explicit literal listing today's fields, so every field a later task adds inherits the contract for free; pin it with a test asserting both that an optional field survives and that its absence stays absent, never with the helper's own field list restated.

### L-038 · A test pin that is true only BECAUSE of the defect
T-160, fixing F-137-1 (the guaranteed-true Liar's Dice opening claim): `liarsDiceAchievements.test.ts`'s header claim that "seed 1 wins" held only because of the defect under test, and 22 hardcoded opening claims across `liarsDice.test.ts` plus the two dealer-blindness variant tables encoded the same guarantee. The suite therefore could not distinguish the fixed rule from the broken one — every one of those pins had to be re-derived from the hand the seed actually rolls before the fix could be graded at all.
**Enforced by:** `packages/engine/src/__tests__/liarsDiceAchievements.test.ts` (`playWonHand` SEARCHES for a winning seed and throws if none wins, instead of pinning seed 1) + `packages/engine/src/__tests__/liarsDice.test.ts:110` (`assertBlindOpenIsLegal` proves the fixed blind-open claim is both legal and exactly `minOpeningQuantity(own)` across all 30 variants, so a later edit cannot re-break it in either direction)
**Rule:** A test constant that depends on a live rule — a winning seed, a hardcoded claim, a "this always passes" fixture — is DERIVED at run time from that rule and asserted legal and minimal, never pinned as a literal; a pin can be true only because of the defect it is supposed to catch.

### L-039 · A human gate whose ruling cells anything can fill is a gate that waives itself
Twice, on the same mechanism. **T-158** halted for two owner rulings (Combat's chosen `executeCombat` branch, and F-150-1). The automated half shipped `docs/playtests/T-158-pre-uat-brief.md` §9 with two EMPTY ruling cells — and a test asserting they STAYED empty, because a filled cell no owner wrote would have been the coder self-waiving a human gate. The closing pass then inverted that test to assert non-empty, once the owner's verbatim text and the 2026-08-03 date had landed. **T-198/T-202** repeated the shape at larger size: three rulings, six cells.
**Enforced by:** `packages/sim/src/__tests__/uat-brief-figures.test.ts:311` and `packages/sim/src/__tests__/pacing-brief-figures.test.ts:437`
**Rule:** A human-gate checkpoint carries its ruling slots as machine-checked cells — asserted EMPTY while the gate is open, flipped to asserted NON-EMPTY (the owner's verbatim text plus a date) only by the closing pass — and the run that AUTHORS the brief never also grades the ruling.

### L-040 · A relative CLI path resolves against the workspace cwd, not the repo root
T-155 / F-155-2: `pilot-cli.ts` resolved relative `--out` / `--replay` paths against `process.cwd()`, which for an npm-workspace script is `packages/sim/`, while its DEFAULT out directory was built from `REPO_ROOT`. The same relative path therefore meant two different directories depending on which flag carried it, so `packages/sim/PILOT.md` §1's own documented `--replay test-results/pilot/<runId>.jsonl` could never find the file its own documented run had just written. Nothing caught it but running the documented command verbatim.
**Enforced by:** `packages/sim/src/__tests__/pilot.test.ts:501` ('anchors every relative path on the repo root, not on the workspace cwd (F-155-2)')
**Rule:** In an npm-workspace CLI, anchor every user-supplied relative path on the repo root (`resolveFromRepoRoot`) so input and default output share one base — and run the documented command verbatim as part of accepting the docs, because a cwd mismatch is invisible to every test that builds its own absolute paths.

### L-041 · A seed-specific finding reported once goes stale at the next shared-planner change
T-199: the Explore guard alone re-seeded every policy's rng stream and woke a dormant 27-day fighter strand on seed 35 — the very seed T-159's commit message reports as fixed — while closing smuggler's. A prototype of the same fix took smuggler's 200-seed worst streak 5 → 1 and still opened that fighter strand. A per-seed note in a delivery report would have been wrong by the next planner edit; the seeds only stay meaningful as executable bars.
**Enforced by:** `packages/sim/src/__tests__/campaign-smuggler-gambler.test.ts` (seeds 20 and 970 at 35 days, seed 3 at 120 days, and the `F-199-1` / `F-199-2` rim-strand table: trader 371/571, fighter 74/747/916, smuggler 677)
**Rule:** When a change to a shared planner moves WHICH seeds strand, pin every offending seed as a `longestZeroIncomeStreak` test at the CI sweep's own horizon (35 days), so the next shared-planner change has to meet them locally — a seed named only in prose is a claim about a stream that the next edit re-phases.

### L-042 · Never infer engine state from a refusal string — read the authoritative flag
T-162 / F-162-1: `resolveTrade`'s `buy-fuel` branch spends the die BEFORE the affordability gate (`packages/engine/src/actions/trade.ts:23`), but `store.ts`'s `buyFuel` inferred the spend from the refusal — `selectedDie: notice ? die : null`, commented "On refusal the engine spent no die". One unaffordable fill left `armed` true at all six of its definitions in `App.tsx`, so manifest SIGN/HAGGLE, shipyard, crew, port, Hangout, `explore-sweep` and `confirm-jump` all rendered ENABLED and every click threw the raw engine string `Die already spent` (`packages/engine/src/dice.ts:241`) at the player. Nine sibling handlers already read `next.player.dawnHand.spent[die]`; `buyFuel` was the one that did not — the L-013 divergent-convention shape, with the correct convention in the majority.
**Enforced by:** `packages/ui/e2e/dead-affordance.spec.ts`, plus the `inv_no_dead_affordance` claim in `packages/ui/e2e/support/longhaul-invariants.ts:175`, run on every push by the `e2e` job
**Rule:** A UI handler derives engine state from the authoritative post-action state (`next.player.dawnHand.spent[die]`), never from the presence or absence of a notice or refusal message — a refusal string is a rendering of an outcome, not a report of what the engine charged.

### L-043 · A repeated identical refusal must still change the DOM
T-162 / F-162-2: the notice banner rendered `{state.notice}` with no identity, so a second refusal whose words matched the first ("Not enough credits to make that payment." twice) produced a byte-identical DOM. The cockpit looked inert rather than refusing again, and the long-haul invariant could not distinguish "no feedback" from "the same feedback twice". Fixed by bumping `CockpitState.noticeKey` at the store's single `set()` choke point whenever a notice is RAISED, carried as the banner's React `key` and as `data-notice-key`.
**Enforced by:** `packages/ui/e2e/dead-affordance.spec.ts:127,137` (asserts `data-notice-key` changes across two identical refusals)
**Rule:** Feedback that can legitimately repeat carries a monotonic identity attribute bumped at one choke point, so a repeat is observable in the DOM and assertable by a test; identical text is otherwise indistinguishable from no response at all.

### L-044 · A negative-path fixture must never print production-shaped failure text into a shared log
T-162 / F-162-5: `reportGate` (`packages/sim/src/balance/sweep.ts:502`) writes `formatGateReport(...)` to stderr unconditionally, and `sweep-gate.test.ts` drives it with deliberately seeded-bad reports (`report.daily[3].credits = -40`). Every GREEN `npm test` therefore emitted `[gate] t153-invariant · shard 1/1 · 104 rows · FAIL` out of a suite where all 37 tests PASSED and the process exited 0. T-162's own fix-round-1 gate believed it, reported `npm test` FAILED, and stopped before `tsc -b`, `lint` and `format:check` ran. The repo's CI evidence step for the gate is a `grep '[gate]'`, so the fixture was a false alarm aimed precisely at the one reader designed to trust it.
**Enforced by:** `packages/sim/src/__tests__/sweep-gate.test.ts:965` — 'the stderr capture is bounded, and a real break still gets its output' (the four `withTempDir` legs capture stderr via `gateOutput()` and assert the printed table instead of emitting it)
**Rule:** A test that exercises a failure path CAPTURES the tool's human-readable output and asserts on it; it never lets production-shaped failure text escape into the shared run log, where a gate reader — human or scripted — will parse it as a real failure.

### L-045 · A value recorded in N places goes stale at every site you did not remember
Seven tasks, one mechanism. **Five** separate files record which aggregate the rig measures, and
`packages/sim/src/__tests__/baseline-pointers.test.ts`'s header records that T-188, T-195 and
T-199 each re-pinned while moving only some of them — three of five were still stale when T-165
arrived (the `docs/NPC_REDESIGN.md` status banner, `docs/balance/smoke/README.md`, and BR-14's own
sentence). The same class had already bitten at T-137. The count itself rots too: T-173, T-195,
T-204 and T-206 all inherited task-block prose saying "all four sites" when T-182 had added a
fifth, and T-195's block first named a baseline file (`t193`) that never existed. T-196a then
found the check's own recency test was a PROXY — `taskNumbers[0] === max(taskNumbers)`, which
demands the banner be ordered oldest-first, the exact opposite of what the extractor needs,
because task ids are not monotonic here (T-196a re-pins after T-199). T-202 found the last shape:
new docs prose that accidentally matches the pointer pattern, where the fix is to reword the
sentence out of pointer shape, **not** to grow `ACKNOWLEDGED_NON_POINTERS`, which is exactly how
the fifth pointer appeared unnoticed in the first place.
**Enforced by:** `packages/sim/src/__tests__/baseline-pointers.test.ts` (the `SITES` list, the
`disagreements()` pure core driven by seeded-bad reading sets, the banner-ordering test asserting
the PROPERTY rather than a proxy, and the totality pass over every `.md` under `docs/`)
**Rule:** When one value is recorded in more than one file, name a single RUNTIME-READ site as the
authority and commit a test that reads every other site and fails on disagreement; take the number
and identity of those sites from the test, never from a task block's prose; give the check a
totality pass that scans the whole tree for the pattern so a new site cannot appear unnoticed; and
when a check encodes a numeric or lexical PROXY for the property it cares about, replace the proxy
with the property rather than re-pinning the proxy.

### L-046 · A zero measured by an instrument is a fact about the instrument
Three tasks, three readings-as-if-the-player. **T-169:** "0 grand slams in 720 careers" was taken
as evidence that `liars_dice_grand_slam` was unreachable and that `planDare` needed a
set-completion preference. The sweep seats the RICHEST candidate, so it never completes a set by
construction; on the deliberate-play rig the same fifteen deeds land in 75–76 of 76 careers.
**T-170:** `RENOWN_DEED_THRESHOLDS.CONQUEROR = 38` was filed as "unreached at 120 days by every
policy" off a 120-day sweep and a 59-deed slate — the 300-day arm it was actually derived against
puts the `gambler` deedCount median at exactly 38 with 579/1,000 careers reaching the rank. The
number was being READ EARLY, and retiring the finding cost a whole task. **T-202:** the sim's
gambler is bounded at `GAMBLER_MAX_DARES_PER_DAY = 2`, below the ruled `[1..6]` ceiling, so a
byte-identical capstone diff could not have exhibited the change at all.
**Enforced by:** `packages/sim/src/__tests__/deed-coverage.test.ts` ("the fifteen set-completion
deeds are reached by DELIBERATE play", plus the deed-hunter drive at a 300-day horizon) +
`packages/engine/src/__tests__/deeds.test.ts:394`
**Rule:** Before ruling content unreachable, a threshold mis-sized, or a ruling safe, re-measure on
the rig and at the HORIZON the thing was derived against, and land the counter-evidence as a
standing assertion derived from the trigger family with a floor far below the measurement — never
hand-listed, never pinned to a seed. A null result from an instrument whose own bound sits below
the quantity in question is reported as "inert to this instrument", never as a verdict.

### L-047 · A ruling that lives only in prose has no red path
Three tasks. **T-176:** T-160's C3 challenger-won criterion sat in
`docs/LIARS-DICE_REDESIGN.md` §17.2/§17.8 and rotted unremarked until T-176 re-derived it.
**T-219:** the task measured F-176-1, baked off four replacements and DECLINED to change
`optimal`'s raise valuation — shipping zero semantic engine lines — so the reason the rule is
correct would have lived only in a doc and could be silently voided by a later edit. **T-220:** all
three anchors C2's 55–70% player-win band rested on had been measured on the risk-free opener
T-160's own bakeoff removed; the band outlived its anchor, and two consecutive tasks moved the
number to 52.90% without anyone re-scoring it.
**Enforced by:** `packages/sim/src/__tests__/campaign-dare-challenges.test.ts`
("T-176 · C3'(c) as a LIVE assertion") · `packages/engine/src/__tests__/liarsDiceArchetypes.test.ts`
(describe `T-219 · F-176-1 — the immediate-challenge assumption IS optimal's raise evidence gate`)
· `packages/sim/src/__tests__/campaign-dare-cells.test.ts` (describe `T-220 · LD-28 — the table's
standing invariants`, computing the ply-1 opening burden from `probAtLeast`, `DARE_MAX_FACE`,
`dicePerSideForTier` and `minOpeningQuantity` rather than from a restated literal)
**Rule:** A criterion a task pre-commits to, and a ruling a task DECLINES to change, both ship as
live assertions that RECOMPUTE the derivation from the shipped functions and constants — no
literal thresholds, and both rates, both `n` and the SE in the failure message — so a later change
to the rule goes RED and RE-OPENS the ruling instead of silently voiding its anchor.

### L-048 · A test that grades a policy by its own objective is self-confirming
T-175 / F-175-1: `liarsDiceArchetypes.test.ts`'s `it('beats BAD head-to-head over 4,000 simulated
hands')` was the ONLY shipped instrument asserting the archetype ordering, and it scored a raise as
"the other side challenges immediately" — exactly the model assumption `archetypeMove`'s `optimal`
branch argmaxes — over a UNIFORM opener answered for ONE ply. Both premises are false in play (the
shipped planner opens at `minOpeningQuantity(own(bestFace))` and challenges selectively via
`SIM_DARE_CHALLENGE_MARGIN`), so the test stayed green through four tasks of a sweep-measured
inversion in which the seat labelled `optimal` was the softest in the game.
**Enforced by:** `packages/engine/src/__tests__/liarsDiceArchetypes.test.ts`
('T-175 · PLAY-LEVEL head-to-head at %i dice: hands run to termination against the shipped
planner') + `packages/sim/src/__tests__/campaign-dare-cells.test.ts` ('T-175 · the archetype
ordering, as a LIVE assertion')
**Rule:** An instrument that asserts a policy is good plays to TERMINATION against the SHIPPED
counterparty with inputs drawn the way the engine actually forces them — never against the
policy's own model assumption or a uniform one-ply stub. A model-coherence test may be kept only
if it is renamed to say that is all it proves.

### L-049 · An unconditioned probability model prices an opponent as if they had said nothing
T-175: `optimal` priced the standing claim with `probAtLeast(q − own(face), dicePerSide)` — the
raw Binomial — even though `minOpeningQuantity(m) = m + 1` forbids a claim at or under what the
claimant holds. Fed that number, its expected-value argmax challenged 93.6% / 92.6% / 91.5% of
decisions and won only 51.2% / 41.3% / 34.2%, losing to `bad`'s one-comparison classifier.
**Enforced by:** `packages/sim/src/__tests__/campaign-dare-cells.test.ts` ('optimal is NOT the
softest roster seat: the player wins no more often against it than against bad')
**Rule:** When an AI prices an opponent's PUBLIC action, condition the probability model on the
constraint that action implies, and calibrate predicted-versus-realised BY BUCKET before trusting
any argmax built on it.

### L-050 · An additive instrument field is not inert until the numbers say so
Two tasks, two halves of one class. **T-176:** `dareChallengeCells` (108 cells),
`dareChallengeSplit` (16 cells) and `dareChallengeDisagreements` were added to `HangoutPlayStats`
purely to measure a split; because the degraded report fingerprint hashes the whole report JSON,
SHAPE included, all seven policy rows moved on shape alone, and only a strip-the-new-keys proof
established that zero careers had changed. **T-183:** stamping `rulesFingerprint` /
`instrumentFingerprint` / `gitCommit` onto `BaselineAggregate` made `diffAggregates` report three
`SHAPE CHANGES` and `identical: false` for two runs that measured the identical thing — breaking
the "NOTHING MOVED" verdict every inertness proof in the repo depends on — and the optional stamp
parameter was only inert because it is a SPREAD, so an unstamped aggregate leaves the keys ABSENT
rather than present-and-`undefined`.
**Enforced by:** `packages/sim/src/__tests__/campaign-degraded.test.ts` (the stripped-fingerprint
ledger entries) + `packages/sim/src/__tests__/aggregate-stamp.test.ts` (deep-equality,
`JSON.stringify` equality, key ABSENCE, and `diffAggregates(unstamped, stamped).identical === true`
with `shapeChanges: []`)
**Rule:** When an instrument type gains a field, prove the omitted case BYTE-IDENTICAL rather than
arguing it — deep-equal, stringify-equal and key-ABSENT, because `?? undefined` writes a key — and
re-pin the degraded fingerprints in the same change with a ledger entry showing they come back
byte-identical with the new keys stripped, BEFORE any measurement from the new instrument is used
as evidence. A field that describes the MEASUREMENT rather than the game joins `IGNORED_PATHS` in
`balance/diff.ts` in the same commit, and the ignoring is made non-silent somewhere the reader
will see it.

### L-051 · A move is only dead once it is priced in EVERY currency the game pays in
T-137 and T-160 both ruled FOLD a "null mechanic" whose "only positive payoff is +1 disposition",
after deriving its dominance in CREDITS alone. T-177 found the framing incomplete rather than
wrong: disposition is a second currency with a measured effect (a 2.4–2.9× interceptor lift on
captain disposition), and once priced, FOLD is a trade that wins at every state where the credit
comparison is not already a tie. The rule was then recorded as a formula over live constants —
`P_false > (LOSS − FOLD)/(LOSS − WIN)` — rather than as the measured 3.51% take rate, because the
take rate is an output and the constants are the input.
**Enforced by:** `packages/engine/src/__tests__/liarsDice.test.ts` (describe `T-177 · the FOLD
ruling — the two currencies partition`)
**Rule:** Before declaring a move dominated or dead, derive its EV in EVERY currency the game
actually pays out, and record the crossover as a formula over the live constants rather than as a
measured take-rate — so retuning any constant re-opens the ruling instead of silently invalidating
it.

### L-052 · The price SHOWN must be bound to the price CHARGED
T-221: T-177 had ruled FOLD a priced purchase, but nothing at the table quoted either arm. A UI
quote asserted against a literal — or against a formula re-derived in the view — would drift from
`settleDareHand` the moment `DARE_FOLD_DISPOSITION` or the escrow rule was retuned, and the player
would be shown a price the engine no longer charges.
**Enforced by:** `packages/ui/src/__tests__/liars-dice-pane.test.ts` (applies the real action and
compares the quoted value to `DareHandResolved`'s own `creditsDelta` / `dispositionDelta` and to
`venueParamsFor(...).dispositionOnFold`) + `packages/ui/e2e/liars-dice.spec.ts`
**Rule:** When the UI quotes a price the engine will charge, the test applies the real action and
compares the quoted value to the RESOLVER's own delta and to the port's own row — never to a
literal typed in the test, and never to a formula the view re-derived.

### L-053 · A bed can be the loudest thing in the mix and still be inaudible
T-185: the ambient drive hum peaked 0.25 at the destination — 5.8× louder than the one-shot cues —
and nobody could hear it. A 57 Hz sine pair behind a 200 Hz lowpass put all of its energy at
−39.9 dB across 20–100 Hz and −112.7 dB across 100–150 Hz, below what laptop, monitor or phone
speakers reproduce. Destination peak level is not audibility. The paired defect (F-185-3) was
fixed the same way it must always be: `CUE_GAIN = 2.2` inside `pluck`, the one envelope every cue
passes through, NOT `DEFAULT_MIXER.sfx` — that value is persisted, so raising it does nothing for
any player who has ever opened Settings.
**Enforced by:** `packages/ui/src/__tests__/music.test.ts:133` — the per-mood "every voice
fundamental is inside the audible band" assertion
**Rule:** Audio is verified by SPECTRUM inside the reproducible band (150 Hz – 4 kHz), never by
peak amplitude at `ctx.destination`; and a mix-level raise goes inside the code path every cue
already passes through, never into a persisted mixer default.

### L-054 · Audio-graph construction at module load is an autoplay violation
T-185: adding a module-scope `sound.setDriveHum(true)` in `packages/ui/src/store.ts` constructed
the `AudioContext` at module load, and Chromium logged the autoplay block eight times. Fixed with
an explicit `if (!unlocked) return` deferral in `startHum`, so `sound.ts`'s header autoplay rule is
ENFORCED rather than merely described.
**Enforced by:** `packages/ui/e2e/sound.spec.ts:25` ("no autoplay-policy console errors on first
interaction") + `packages/ui/e2e/sound-audible.spec.ts:257` (asserts no context exists pre-gesture)
**Rule:** No audio-graph construction may happen at module load; every context and node creation
defers behind the first real `pointerdown` / `keydown`, and a console-cleanliness test guards it.

### L-055 · A subsystem wired only into event entry points is absent on the returning-boot path
T-185 / F-185-1: `sound.setDriveHum(true)` had exactly two call sites, `newGame` and `endDay`.
`init()` and `loadSlot()` never called it, so a captain booting into their autosave measured a peak
of EXACTLY 0.000 and heard only sub-100 ms blips until they happened to end a day. The owner's
entire "zero feedback" session was that path.
**Enforced by:** `packages/ui/e2e/sound-audible.spec.ts:343` ("T-185 regression · a plain boot has
an ambient bed, with no New Game and no day end"), demonstrated RED against the pre-fix tree
**Rule:** Any always-on subsystem needs a PLAIN-BOOT test — load autosave, no New Game, no day end
— not just a fresh-career one; enumerate every entry point that produces a running game, not just
the ones that produce an event.

### L-056 · A tutorial that blocks its own lesson
Two occurrences, two mechanisms. **T-187:** the step-3 walkthrough card sat over the Manifest Board
with `pointer-events: auto` on the whole card, swallowing the very click it was telling the player
to make. **T-190:** turning the manifest header into a stow toggle put a collapse inside the same
step's rails, so a stowed board is a tutorial hiding its own target; the force-open guard
`open = !stowed || walkthroughActive(state.walkthrough)` is load-bearing, not defensive.
**Enforced by:** `packages/ui/e2e/walkthrough.spec.ts` (performs the instructed click with the
overlay up) + `packages/ui/e2e/manifest-object.spec.ts:185` ("the scripted walkthrough force-opens
the board — the stow can never soft-lock it", driven from a genuine first-time boot)
**Rule:** An instructional overlay is click-through except for its own controls, and any
collapse/stow affordance inside a scripted-rails region is force-open while the rails are up —
both proved by an e2e case that BOOTS A REAL FIRST-TIME PLAYER and performs the instructed action,
never by a spec that skips the walkthrough.

### L-057 · Sequenced progress derived from live state can run backwards
T-187: deriving the "contract signed" step-completion from the live predicate
`player.activeContract != null` would have regressed the walkthrough pointer back to step 3 the
moment delivery nulled the contract, re-railing a player who had already advanced.
**Enforced by:** `packages/ui/src/__tests__/walkthrough.test.ts`
**Rule:** Sequenced-flow progress is a one-shot MONOTONE flag folded from events; any predicate
over mutable game state that can flip back is forbidden, and the regression case gets its own
named test.

### L-058 · A helper added to one e2e suite leaves the other suite silently red
Twice, and CI-only both times. **T-189 discovered the first:** T-187 added
`skipFirstTurnWalkthrough` to `packages/ui/e2e/support/career.ts` for all twenty web specs and left
`packages/desktop/e2e` out, so every Electron launch hit the first-turn walkthrough and 6/8 of
`shell.spec.ts` failed on `<div class="body"> intercepts pointer events` — the desktop suite had
been red since `eed2f3fe`. **T-200 repeated it exactly:** a new boot-blocking `OpeningMarker`
overlay was dismissed in `packages/ui/e2e` only, and CI's desktop plus both packaging jobs failed
8/8 on the marker blocking every "New game" click, AFTER the Delivered note had claimed the flows
were unblocked.
**Enforced by:** `.github/workflows/ci.yml` job `desktop` ("Electron desktop e2e",
`xvfb-run -a npm run test:e2e` in `packages/desktop`), with job presence pinned by
`packages/ui/src/__tests__/ci-workflow.test.ts`
**Rule:** Any change that neutralises, or introduces, global first-run UI state ships the handling
in EVERY e2e helper family — `packages/ui/e2e/support/career.ts` AND
`packages/desktop/e2e/support/cockpit.ts` — in the same commit; a green LOCAL gate is never
evidence for the desktop suite, which runs only in CI. When a pointer-interception failure names a
container element, hit-test the live DOM rather than reading the diff.

### L-059 · The harness's own input gets measured as the subject's
T-200: in `packages/desktop/e2e/shell.spec.ts` the standalone T-185 audio test has no `startCareer`
call, so `skipOpeningMarker` had to be added directly — and placing it AFTER the audio-recorder
`addInitScript`/`reload()` broke the test, because the dismiss click is a real `pointerdown` that
`sound.ts`'s capture-phase listener credits as the observed FIRST gesture.
**Enforced by:** `packages/desktop/e2e/shell.spec.ts` (the T-185 audio spec, run by the `desktop`
job in `.github/workflows/ci.yml`)
**Rule:** When a test asserts on the FIRST occurrence of anything, every setup action the harness
performs happens BEFORE the observer is installed.

### L-060 · Chrome that costs height costs the player information
Three passes on the same class. T-189's gate went red on it; **T-190's first styling pass** failed
its own screenshot judgement twice — the board stock read as a pane, and new padding ate ~12px and
pushed the second contract's headline below the fold; **T-191** built to ZERO cost on the shortest
pane in the cockpit (163px of visible body, internally scrolling) and proved it by measuring the
same page with the diff stashed then restored (`.pane.trade .body` scrollHeight 574 → 571,
clientHeight 163 → 163, clientWidth 591 → 591, all five `.lb-head` heights 15px → 15px). T-190 also
found the collapse form of the same defect: `CheckBreakdown` had to be kept OUTSIDE `.mb-sheet`, so
stowing the paper can never hide the outcome of a roll the player just spent a die on.
**Enforced by:** `packages/ui/e2e/manifest-object.spec.ts:165` (stows the board and re-asserts
`check-breakdown` is still visible) and `:249-253` (fills `debt-amount` and clicks `pay-debt` in
the pane below — Playwright `click()` fails on an occluded or offscreen control, so those lines ARE
the below-the-fold assertion) + `packages/ui/e2e/port-ledger.spec.ts` (`click()` on `pay-debt`,
`hover()` on the legitimately-disabled `buy-port`)
**Rule:** Any change that adds chrome to a column ends its spec by DRIVING a control below the fold
at the suite viewport, and where height parity is claimed it is measured against a stashed baseline
rather than asserted. Anything that reports the outcome of a spent resource lives outside every
collapsible container, and a test stows the container and re-asserts the readout is visible.

### L-061 · A reduced-motion assertion without a reload checks a stale kill-switch
T-190 and T-191 both wired animations behind `@media not (prefers-reduced-motion: reduce)`. The
reduced-motion e2e initially proved nothing: the cockpit reads the OS preference ONCE per render
and stamps `data-motion` on `<html>` (`packages/ui/src/App.tsx`, the `resolveMotionTier` effect),
which at the Instant tier is a blanket `animation: none !important` kill-switch — so toggling
`page.emulateMedia({ reducedMotion: ... })` mid-test asserts against the stale attribute rather than
against the media query. Getting this right is what keeps the whole suite honest, since it runs
under `reducedMotion: 'reduce'`, and it is why the reduced path must be INSTANT rather than
"animated then skipped".
**T-252 amendment:** `data-motion` now carries three values (`cinematic|snappy|instant`, UI-31) and
the OS query FORCES `instant`, so the reload rule below is unchanged but the attribute to check is
the tier, not `full`/`reduced`.
**Enforced by:** `packages/ui/e2e/port-ledger.spec.ts` (and its `styles()` helper) +
`packages/ui/e2e/motion-tiers.spec.ts` (all three tiers, chosen through the Settings segment)
**Rule:** Every new animation is railed behind `prefers-reduced-motion` AND asserted in BOTH
directions via computed `animation-name`, with `emulateMedia` followed by `page.reload()` and
`html[data-motion]` checked to flip — never asserted in prose or inferred from the CSS source.

### L-062 · A display projection that repaints must never draw at random
T-207 renders captain barks from `packages/ui/src/format.ts`, which runs on EVERY React paint. A
`Math.random()` pick would have reshuffled a captain's line while the player was still reading it,
and forking the engine RNG would have changed the world by being rendered.
**Enforced by:** `packages/ui/src/__tests__/combat-catchphrases.test.ts` ('holds each line steady
across paints', 'is stable for the life of the panel') + `packages/ui/src/__tests__/
liars-dice-pane.test.ts` ('holds the SAME line for the life of the hand, across paints and across
moves')
**Rule:** Any UI projection that picks from an authored pool is a PURE function of a stable domain
id (a seeded hash), and ships a test asserting two calls on one state return the same line.

### L-063 · A red sample test is widened, never weakened
Four tasks, one temptation. **T-207** found its variety test red at `drawn.size === 1` over 40
seeds — the hand id is `dare-${day}-${dealerId}-${dayEventCount}` and is NOT derived from the world
seed, so 40 seeds all deal their first hand on day 1 at the same event count: a sample of size ONE
dressed up as forty, repaired by driving a real 12-day career with the assertion untouched.
**T-176** found its challenger-split detector vacuous at eight seeds (n = 136 on the player's cell)
and widened to 24 rather than lowering the guard. **T-195** widened a hull-reachability sample
6 → 20 seeds rather than re-thresholding, because at 6 the eased economy produced a coincidental
6-for-6. **T-208** repaired a red reachability pin by re-running the test's own documented re-pin
sweep (seeds 1..30 × 300 days, nine qualifying seeds found) and moving only `CAMPAIGN_SEED`.
**Enforced by:** `packages/ui/src/__tests__/liars-dice-pane.test.ts` ('does not say the same thing
every hand of a career') · `packages/sim/src/__tests__/campaign-dare-challenges.test.ts` ·
`packages/sim/src/__tests__/campaign-reach.test.ts`
**Rule:** A variety, detector or reachability test must vary the axis the value is actually KEYED
on, and when it goes red the repair is to WIDEN the sample or re-derive the pin through the
procedure the test documents — never to weaken the assertion, lower the guard, shrink the sample
back, or move the bar.

### L-064 · A "nothing changed" arm proved field by field lets the next field through
T-207 added `enterLine` / `battleLine` to `EncounterReadout` while the anonymous-interceptor path
had to gain ZERO DOM. Both fields are set explicitly to `null` on the anonymous arm rather than
left to an initialiser, nothing is pushed into `CombatAftermath.lines`, and all three new JSX
blocks are `null &&` guards so React emits nothing — but per-field assertions would have gone
green for a later field added with no null default on that arm.
**Enforced by:** `packages/ui/src/__tests__/combat-catchphrases.test.ts` ('reads byte-for-byte as it
did before this task' — a whole-object `toEqual` on `encounterReadout`, plus the rounds-1..6 sweep
and the `lines` deep-equal)
**Rule:** A new nullable readout field is nulled EXPLICITLY on the negative arm, and the
"nothing changed" claim is proved with a whole-object `toEqual` rather than per-field assertions.

### L-065 · A loop's resource bound must be charged PER ITERATION
T-196b / F-196b-1: the smuggler's and explorer's Explore loops tested `credits - committed >
exploreFloor` a single time BEFORE the first iteration, then swept once per remaining die — asking
"can the purse afford to be exploring today" instead of "can it afford THIS MANY sweeps". It was
survivable only while sign/refuel/yard each took a die and held the loop to one or two iterations;
once T-196b freed all three, a fuelled day handed the loop four dice (320 fuel burned instead of
160) and produced zero-income streaks of 4/6/8 days on seeds the policy had never stalled on. Same
shape as F-116-1 and F-150-2, reached indirectly through the dice the freed actions gave back.
**Enforced by:** `packages/sim/src/balance/gate.ts` (`assertNoIncomeStall`, via
`packages/sim/src/balance/sweep.ts`), run by the "Sweep gate" check in
`.github/workflows/sweep-gate.yml` — it is what failed two of eight capstone shards and surfaced
this defect
**Rule:** When a change removes the scarce resource that was INCIDENTALLY bounding a loop,
re-derive the loop's own bound and charge it per iteration — a single pre-loop affordability test
is an unbounded loop wearing a guard.

### L-066 · A check that reads repository history must fail loudly, and CI must be able to feed it
T-166: `packages/sim/src/__tests__/smoke-reextraction.test.ts` reads commit `3468ef5f` and its
parent out of git, which a default depth-1 CI clone cannot produce. The fix gave only the `test`
job in `.github/workflows/ci.yml` `fetch-depth: 0`, and the test throws a remediation message
naming `git fetch --unshallow` and the workflow rather than skipping.
**Enforced by:** `packages/sim/src/__tests__/smoke-reextraction.test.ts` +
`.github/workflows/ci.yml` (`test` job, `fetch-depth: 0`)
**Rule:** Any check that reads repository history fails loudly — never skips — when the revision is
unreachable, and the CI job that runs it checks out with `fetch-depth: 0`.

---

## Decisions index

- `docs/CONTENT-ENGINE-DECISIONS.md` — where a rule lives, what may be added to a content table, naming, and the authored house voice (`CE-*`).
- `docs/SAVE-FORMAT-DECISIONS.md` — when a `CURRENT_SAVE_VERSION` bump is and is not owed, and what schema drift protection each layer has (`SF-*`).
- `docs/BALANCE-RIG-DECISIONS.md` — fingerprints, capstones, the baseline of record, measurement discipline, fixtures and goldens, the sweep gate and CI, archetype norms, and the owner-gated knobs (`BR-*`).
- `docs/TASK-PROCESS-DECISIONS.md` — task scope by kind, acceptance criteria and amendment, correcting documents, refactors and deferred defects, versioning ceremony, sequencing in `TASKS.md` (`TP-*`).
- `docs/EXPLORE-DECISIONS.md` — the Explore outcome table, recovery and AP cost, the Class-A/Class-B/stat power surfaces, and the verdict of record (`EX-*`).
- `docs/HANGOUT-DECISIONS.md` — Hangout reach, the authored register, venues, the lending desk, and the measured record (`HO-*`).
- `docs/LIARS-DICE-DECISIONS.md` — the Dare scene, its presentation, the fixed roster, the unlock ladder, and the open owner call (`LD-*`).
- `docs/DEV-TOOLING-DECISIONS.md` — NPC decision telemetry, playtest telemetry, the balance report generator, the dev control panel, and the Tier-2 LLM pilot (`DT-*`).
- `docs/TEST-TIER-DECISIONS.md` — the tier map and what may not substitute for what, Tier 3's shape and cadence, e2e repair discipline, and CI trigger breadth (`TT-*`).
- `docs/UI-PRESENTATION-DECISIONS.md` — the cockpit's visual language, the first-turn and dawn-hand ceremonies, motion, the synthesized score, and the UI-state/game-state boundary (`UI-*`).
