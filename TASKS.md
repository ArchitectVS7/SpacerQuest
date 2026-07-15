# Rimward — Master Task List v1.1

Finish the build-out of *Spacer Quest: Rimward* per `docs/PRD-REIMAGINED.md` and
`docs/TECH-STACK.md`. This list supersedes `TASKS_v0.2.md` (M10–M13, T-1001–T-1310,
all DONE and verified by the truth audit of 2026-07-14: zero false Delivered claims).
It carries the 21 open tasks forward unchanged (IDs stable, satisfied prerequisites
stripped) and adds M18, a small cleanup milestone closing the audit's four
precision findings before the UI build begins. The engine layer is complete; what
remains is making it visible to a player (M14), filling content to launch quantity
(M15), hardening (M16), and shipping (M17).

## Orchestrator protocol

1. **Check out** the first task with `status: TODO` whose `after:` tasks are all DONE. Set it `IN-PROGRESS`.
2. **Plan** — delegate to the Fable planner with: the task block below, plus pointers to `docs/PRD-REIMAGINED.md`, `docs/TECH-STACK.md`, `TASKS_v0.2.md` (for the Delivered notes of the engine work each task surfaces), and the files named in the task. Nothing else.
3. **Code** — delegate to the coder named in `coder:` (Opus by default; Fable where flagged — those tasks have cross-cutting design decisions baked in).
4. **Review** — delegate to the Sonnet reviewer with the diff and the task's acceptance criteria. Criteria are written to be mechanically checkable AND to prove integration (reachable by a player; consumed by a named reader).
5. On pass: run the gate, commit as `T-1NNN: <title>`, set `status: DONE`, update this file in the same commit. On fail: one fix round with the coder, then escalate to Fable if still failing.

**App.tsx serialization rule** (lesson of v0.1's T-304/T-307 collision): tasks that touch `packages/ui/src/App.tsx`, `store.ts`, or `format.ts` must never be concurrently IN-PROGRESS — commit each before starting the next. The M14 chain encodes this as a strict `after:` sequence; do not parallelize it.

**Foundation reference:** the 1991 rules of record live at git ref **`f2f95fa9`** — consult them as `git show f2f95fa9:foundation/rules/<file>` (e.g. `travel.ts`, `upgrades.ts`, `combat.ts`, `constants.ts`). The writing voice guide is `git show f2f95fa9:foundation/lore/User-Manual.md`.

**Gate (every task):** `npx tsc -b` clean at root (including `packages/ui/e2e/`) + `npm run lint` (covering e2e specs) + `npm run format:check` + `npm test` all green. UI tasks additionally require `npm run test:e2e -w @spacerquest/ui` green locally. Per global rules: UX-facing verification goes through the real UI, never the engine directly.

**CI-evidence rule:** review and gate run on the uncommitted diff, so acceptance criteria must be locally checkable — the local equivalent of what CI runs satisfies review. Where a criterion names CI or push-dependent evidence, it is confirmed **after** the commit is pushed and recorded in the task's Delivered note; the CI Playwright job must be green on the branch's most recent pushed commit before the next task starts.

**Standing constraints** (reviewer enforces on every task):
1. Engine stays pure: no DOM, no I/O, no `Math.random`/`Date` — all randomness through `SeededRng`.
2. Every feature reachable headlessly; UI is a client, never the owner, of a rule.
3. All state changes emit typed `GameEvent`s; state survives JSON round-trip. Any task that adds a `GameState` field ships a save migration and a round-trip test in the same commit.
4. Content is data in `packages/content`, never logic.
5. The PRD-REIMAGINED experience wins over foundation numbers. Foundation (`f2f95fa9`) is the reference of record, consulted first; every divergence is commented at the definition site with the PRD rationale. Undocumented divergence is a review failure.
6. A task is not DONE until the feature is **reachable by a player through the UI**. Engine-only tasks must name, in their block, the task that surfaces them — and that task inherits the reachability obligation.
7. Every state field, flag, or event a task adds must **name its reader**, and the acceptance must assert the reader consumes it. If nothing reads it, it isn't a feature — it's a receipt.

**Rebalance fallout rule:** a task whose change breaks an existing green test fixes that test **in the same commit** — leaving it for later is a review failure. Balance thresholds are staged deliberately: interim loose bands (e.g. trader clears ≥50% of seeds) hold until T-1603 asserts the canonical targets; earlier tasks must not enshrine numbers T-1603 will move.

Statuses: `TODO` | `IN-PROGRESS` | `DONE` | `BLOCKED(reason)`

---

## M18 — v0.2 audit cleanups

Small, engine-side truth debt from the 2026-07-14 audit of TASKS_v0.2.md. All four
are cheap; they run first so the baselines the UI and balance work build on are
honest. None changes game behavior except where explicitly stated.

### T-1801 · Honest bond-intervention sim — `status: DONE` · `coder: opus` · `after: —`
The T-1204 acceptance claimed a bond intervention arises "from organic play", but the 300-day disposition sim in `packages/sim/src/__tests__/campaign.test.ts` (~lines 960–1081) hand-steers the player toward Doc Salvage with a scripted fly-to-Doc loop during a bond window and breaks early once both signals fire — the mechanism is real, the "organic" label is not. Either (preferred) make an unguided policy reach the bond hook — a policy that refuels opportunistically will drift into Doc's low-fuel trigger given enough days; widen the sweep horizon or seeds rather than steering — or, if that proves impractical within the task, rename/re-comment the test as a scripted reachability proof and record the overstatement as an errata entry in `docs/BALANCE-POLICY.md` Part C.
**Accept:** the test's name and comments no longer claim organic play unless the play is policy-driven with zero hand-coded steering toward Doc (reviewer checks the loop body); if re-scoped instead, the errata entry is present; the test still asserts ≥1 `BondIntervention` and peak |disposition| ≥5; full suite green.

**Delivered (2026-07-14):** Replaced the scripted fly-to-Doc loop in the T-1204 300-day sim with a genuinely unguided driver — a generic `resolveOffered` helper that answers whatever storylet is on the board by its first choice, with zero NPC-id or chain-id awareness, plus the shipped `veteranPolicy` for the day-to-day career and generic combat handling that fights named interceptors to the death once armed. Doc Salvage's distress-ping/follow-up chain is now walked only as an incidental side effect of playing every offered card, never singled out, and no line of the loop references Doc's id, his storylet chain, or travel toward his system. Re-swept seeds 1..40 at the 300-day horizon and pinned seed 33, the first to land both acceptance signals purely from unguided play: a fuel-gift bond intervention on day 7 and peak |disposition| 5 (a −5 combat grudge) on day 43. Scope boundary: the disposition mechanic itself (T-1204) is unchanged — only the test's steering was removed and the seed re-selected; no game behavior changed.

### T-1802 · Post-flip encounter-damp assertion — `status: DONE` · `coder: opus` · `after: —`
T-1301 flips `state.era` to VETERAN and `generateEncounter` (`packages/engine/src/actions/travel.ts`) only applies `TOUR_ONE_ENCOUNTER_MULTIPLIER = 0.5` while `era === 'TOUR_ONE'` — verified in source, but no test asserts the damp actually drops after the flip; the era gate could regress silently. Add a same-seed A/B (or seeded frequency comparison) proving encounter chance is undamped once the era is VETERAN, alongside the existing Tour One damping test in `encounter.test.ts`.
**Accept:** the new test goes red under a mutation that removes the era condition from the damp (mutation applied, observed red, reverted — recorded in the Delivered note); green otherwise; no fixture churn (the test forks its own rng, perturbing no golden).

**Delivered (2026-07-14):** Added a post-flip (VETERAN) undamped-encounter test in `packages/engine/src/__tests__/encounter.test.ts`, directly after the existing "Tour One damps the encounter chance 0.5x" test and as its mirror. It runs the same 1,000-seed tier-1 core sweep for both eras, each seed forking its own `new SeededRng(seed)` and calling `generateEncounter` directly, so no golden/snapshot fixture is read or written. It pins the VETERAN side to the undamped table band `[0.25, 0.35]` (~0.30) and asserts `veteran > tourOne`. Mutation verification: replaced the era-gated ternary at `travel.ts:282-285` with the unconditional `routeDangerChance * TOUR_ONE_ENCOUNTER_MULTIPLIER`; the test went red (veteran collapsed to 0.15, below the 0.25 floor and no longer > tourOne), then reverted to green. Scope boundary: test-only change — no source or game behavior touched; no new GameState field, event, or migration. The protected reader is `generateEncounter`'s `state.era` read (flipped by the day-30 resolution); the test title/comment name it and the test is the acceptance that the era gate is consumed.

### T-1803 · Action-driven fuel-capacity A/B — `status: DONE` · `coder: opus` · `after: —`
T-1102's hull-upgrade A/B (`economy.test.ts` ~149–153) calls `calculateFuelCapacity` directly rather than exercising the player-facing path. Add an end-to-end test that drives a real Shipyard hull upgrade through `applyPlayerAction` and asserts `maxFuel` rises via the `syncMaxFuel` chokepoint — proving the action→capacity wiring, not just the formula.
**Accept:** the test performs an actual `Shipyard` action on a state that can afford it and asserts `state.player.ship.maxFuel` increased afterward, without calling `calculateFuelCapacity` for the assertion; it goes red if `syncMaxFuel` is removed from `applyPlayerAction` (mutation demonstrated and reverted, recorded in the Delivered note); full suite green.

**Delivered (2026-07-15):** Added the action-path A/B test `'a real Shipyard hull upgrade raises maxFuel via the applyPlayerAction chokepoint (T-1803)'` in `packages/engine/src/__tests__/economy.test.ts`, placed immediately after the formula-only twin `'a hull upgrade raises the fuel ceiling monotonically'` (they now read as an explicit A/B pair: math vs. wiring). It sets `credits = 200000`, calls `startDay` to roll a real dawn hand and enter DAY, asserts `before === 300`, then drives a genuine `applyPlayerAction({ type: 'Shipyard', action: 'buy-component-tier', component: 'hull', tier: 2, spendDie: 0 })` and asserts `hull.strength === 20`, `maxFuel > before`, and `maxFuel === 6000` — never calling `calculateFuelCapacity`, and using `applyPlayerAction` (not `resolveShipyard`, which skips the sync). Protected reader: the `syncMaxFuel` chokepoint at `day.ts:266` — the only `maxFuel` recompute in the action path (`applyShipyardMutation` sets `hull.strength` but not `maxFuel`, and `createInitialState`/`startDay` hard-set 300). Mutation verification: commented out `syncMaxFuel(resolvedState.player.ship)` at `day.ts:266` → the new test went red (`expected 300 to be greater than 300`, `maxFuel` stuck at 300), then restored → full engine suite green (444 tests). The pre-existing twin at `shipyard.test.ts:72` was kept intentionally (a valid separate chokepoint reader), not duplicated blindly. Test-only, pure-engine change: no new GameState fields, events, migrations, or UI surfacing — the Shipyard hull upgrade is already player-reachable in the day loop; this ticket only strengthens test proof.

### T-1804 · Errata + Auto-Repair/life-support design call — `status: DONE` · `coder: opus` · `after: —`
Doc/comment-only truth pass closing the audit's prose findings. Append errata entries to `docs/BALANCE-POLICY.md` Part C: (E5) T-1003's Delivered "all 7 action types" undercounts — `PlayerAction['type']` has 11 members and the `satisfies Record<...>` guard enforces all 11; (E6) T-1101's "engine exports `isGatedDestination`/`GATED_DESTINATION_MIN_ID`" — they are `@spacerquest/content` exports consumed by the engine (`day.ts`), not engine re-exports; (E7) T-1307's era-income "A/B test" is an in-scope-vs-base lever test, not a statistical experiment. Separately, ratify the T-1205/T-1206 interaction as a design call at its definition site: `autoRepairRegen` runs before the `lifeSupportCritical` dusk gate in `day.ts` (~431–467), so the life-support succession path is unreachable whenever Auto-Repair is fitted — extend the ordering comment to state this consequence explicitly, name the covering test (`components.test.ts` ~549), and add a one-line note to T-1603's balance considerations in this file flagging it for the tuning pass (an always-rescue module may be too strong).
**Accept:** three errata entries E5–E7 present in `docs/BALANCE-POLICY.md`; the `day.ts` ordering comment names the unreachable-succession consequence and the covering test; T-1603's block in this file gains the flag; zero behavioral diff (`npm test` untouched-green).

**Delivered (2026-07-15):** Appended three errata entries (E5–E7) to `docs/BALANCE-POLICY.md` Part C correcting stale prose claims: E5 fixes T-1003's "all 7 action types" to the actual 11-member `PlayerAction` union enforced by the `satisfies Record<...>` guard at `packages/sim/src/__tests__/protocol.test.ts:234`; E6 corrects T-1101's misattribution of `isGatedDestination`/`GATED_DESTINATION_MIN_ID` — both are `@spacerquest/content` exports (`systems.ts:176,178`) consumed, not re-exported, by the engine; E7 reframes T-1307's era-income "A/B test" as an in-scope-vs-base lever comparison rather than a statistical experiment. Separately, ratified the T-1205 (Auto-Repair) / T-1206 (life-support) ordering as a ~11-line design-call comment at its definition site in `packages/engine/src/day.ts` (~435–449), stating explicitly that `autoRepairRegen` healing life support 0→1 before the `lifeSupportCritical` dusk gate makes the succession/death path unreachable whenever the module is fitted, naming the covering test (`components.test.ts` ~549) and flagging it as a T-1603 tuning-pass balance lever. The one-line flag on T-1603's block in this file was already present from a prior pass and needed no further edit. Scope boundary: doc/comment-only — zero behavioral or test changes; no code paths, constants, or test assertions were touched, matching the ticket's "zero behavioral diff" acceptance criterion.

---

## M14 — UI: honest instruments

The App.tsx chain (T-1402 → T-1403 → T-1404 → T-1405 → T-1406 → T-1407) is strictly serialized — each a single commit before the next begins. All panes are pure clients: every displayed number reads an engine export or quote.

### T-1401 · Engine export pack for UI truth — `status: TODO` · `coder: opus` · `after: —`
The audit found 11 UI-owned rules — formulas `format.ts`/`App.tsx` reimplement because the engine keeps them private. Export the truth: `componentTierForStrength` (kills the UI's invented `ceil(strength/10)` inverse that makes tier-1 unbuyable — still live at `format.ts:623`), `tributeForRound` (already engine-exported with T-1207's modifiers but ignored by the UI, which reimplements `tributeThisRound` at `format.ts:521` — the pack re-exports and the UI consumes it), `nextRankFor`, `quoteStoryletChoice` (mirroring the blessed `quoteShipyard` pattern), a typed `WireEntry.kind` at the source (kills the string-suffix flaw detection at `format.ts:326`), travel preview in real units (kills the fabricated "jumps" count at `format.ts:70`), and a fuel-affordability quote (the engine charges for fuel it clamps away — warn before commit). No behavior changes; T-1402 is the named consumer.
**Accept:** unit tests per export; `WireEntry` carries `kind`; the sim stats fixture is byte-identical (no behavior change); T-1402 named as consumer in code comments.

### T-1402 · UI de-rule pass — `status: TODO` · `coder: opus` · `after: T-1401`
Replace all 11 UI-owned rules in `format.ts`/`App.tsx` with the T-1401 exports. Remove the phantom TRADE-check display on contract signing (the engine spends the die and never reads its value — the instrument currently lies about the dice, the inverse of PRD differentiator 2); render signing as a die cost. Make tier-1 component purchases buyable, and fix the tier-1-hull→0-pods trap at its true owner (engine or content) in-task. Surface the fuel-overspend warning pre-commit. Fix `shipyard.spec.ts:48`, which currently bakes the tier-1 bug in as expected behavior. Wire/log spec fallout from `WireEntry.kind` is this task's to fix.
**Accept:** Playwright buys a tier-1 component (25cr) through the UI without the pods regression; the manifest sign flow renders no check; storylet locks and rank display asserted against the imported engine exports; a guard test proves `format.ts` imports rather than reimplements the listed formulas.

### T-1403 · Exploration UI — `status: TODO` · `coder: opus` · `after: T-1402`
The audit's single biggest gap: the engine's `Explore` action — nav check, 80 fuel, beacons, derelicts, salvage, contraband pods, Signal Fragments, all built and tested since T-111 — has no UI affordance whatsoever; there is no `explore()` verb in `store.ts`. Add an "off-lane sweep" control on the starmap pane; an `explore()` verb in the store (the missing action); the POI resolution flow (beacon/derelict); salvage/contraband-pod/fragment outcomes surfaced with the nav `CheckBreakdown`. Typed fail events (T-1003's `ExplorationFailed` reasons) render as notices, never silence. Audit note: the Nemesis File pane already renders non-empty entries (`App.tsx` ~1065–1090) — the gap is reaching a fragment through the UI, not rendering one.
**Accept:** Playwright explores through the real UI on a seeded fixture, takes the sealed-pod choice with its risk visible, gains a fragment, and the Nemesis File renders **non-empty** (the empty-state spec is extended, not left as the sole assertion); typed fails render as visible notices.

### T-1404 · Hangout & lending pane — `status: TODO` · `coder: fable` · `after: T-1403`
The Hangout as a visitable place in the cockpit: present-NPC list (from their simulated positions), Spacer's Dare with die commitment and both actors' opposed `CheckBreakdown`s (the honest-dice signature applied to gambling), the rumor table, and Penny Wise's desk — borrow/repay with the interest schedule visible up front, per the "dice are honest" ethos applied to money. The engine side (T-1303 `VisitHangout` venues, T-1304 borrow/repay, typed fails, `quote`-style previews) is complete — this task is pure client.
**Accept:** Playwright — visit, wager a die, read both actors' checks; take and repay a loan entirely through the UI; the pane is offered only where the engine says a Hangout exists; every displayed number traced to an engine export/quote.

### T-1405 · Progression, property & smuggling surfaces — `status: TODO` · `coder: opus` · `after: T-1404`
Surface M13's remaining mechanics: the dawn dock renders variable hand size, the re-roll affordance, and the floor indicator (T-1306); a contraband hold indicator plus the patrol scan surfaced in the encounter overlay with its GUILE breakdown (T-1305); a port-ownership pane with quote-pattern buy preview (`quotePort` exists) and income ledger (T-1307). Dawn-hand spec fallout (5-dice assumptions, including the onboarding "Five dice, once a day" copy) is this task's UI-side responsibility.
**Accept:** Playwright — with a hired crew the dock shows 6 dice and the re-roll works through the UI; a seeded patrol scan renders its GUILE breakdown and consequence; buy a port and watch income tick at dusk.

### T-1406 · Storylet delivery & diegetic shell — `status: TODO` · `coder: fable` · `after: T-1405`
Close the PRD §8.3 drift: storylets should be delivered by the economy — "a contract, a price spike, a wire item — rather than a quest marker" — but the shipped cockpit puts them behind a badge-counted launcher button (`App.tsx` ~384–402). Make storylets open from their manifest lines and wire items, replacing the launcher; fold the audio popover into settings (two popovers to reach a volume slider is the "menu ceremony" PRD §2 forbids); make the toolbar diegetic (inside the bezel / in-fiction). A sweep spec must prove no storylet becomes unreachable by the change.
**Accept:** Playwright — a cargo storylet opens from its manifest line and a wire item opens its storylet; the badge launcher is gone; a sweep spec proves every eligible offer is surfaced somewhere; `sound.spec` updated for settings-hosted sliders.

### T-1407 · Onboarding for the new verbs — `status: TODO` · `coder: opus` · `after: T-1406`
Extend the T-311 coach-prompt registry (currently 4 prompts: combat/hand/manifest/starmap in `format.ts` ~855–877) to the new verbs: explore, Hangout, loan, contraband choice, port purchase — each anchored to its real affordance, non-modal, once-each, persisted (same client-only seen-state pattern).
**Accept:** Playwright — a fresh seed fires each new prompt once, anchored correctly; dismissed state persists across reload; no prompt fires for a verb the current state cannot perform.

---

## M15 — Content (writing tasks — planner supplies voice guide from `git show f2f95fa9:foundation/lore/User-Manual.md`)

### T-1501 · Storylet batch: ports & rumors (20) — `status: TODO` · `coder: opus` · `after: —`
20 storylets keyed to systems (Algol-2's missing repair shop, rim character now that rim systems receive traffic) + Wise One / Sage audience scenes + the Hangout rumor table's authored beats (the host slot T-1303 built). Audit note: ~3 system-keyed port/rumor storylets exist today (`port.sun3.guild-auditor`, `wire.rimward.polaris-signal`, `wire-the-guild`) out of the 152 total — this batch is net-new writing, not relabeling.
**Accept:** all load and validate; every core+rim system has ≥1 storylet reachable in a 500-day sim sweep (rim reachability is now real); the rumor table fills ≥3 dynamic slots from live NPC state; no storylet dead-ends the day.

### T-1502 · NPC personal chains (6 × 3 episodes) — `status: TODO` · `coder: fable` · `after: —`
Personal arcs for Silk Dagger, Doc Salvage, Wild Card, Rattlesnake, Stellar Monk, The Broker — keyed to Bond/Flaw, gating on disposition/bond state that now has teeth (T-1204), with the ignore-it-and-the-wire-resolves-it path (PRD §8.1: chains can resolve without you). Audit note: only Doc Salvage has a chain today (`chain.doc-salvage.distress-ping`/`.follow-up`) — extend it to 3 episodes and author the other five from zero (Silk Dagger, Wild Card, Rattlesnake, Stellar Monk have no storylet mentions at all).
**Accept:** each chain completable and abandonable in sim; abandonment produces the wire resolution; episode gates hit organically (no test sets disposition by hand); disposition consequences asserted.

### T-1503 · Alliance arcs: faction rep + first quests — `status: TODO` · `coder: fable` · `after: —`
Four-faction reputation on `GameState` moved by organic play (patrol tribute, smuggling via T-1305, port deals via T-1307), one 3-step questline per alliance expressing its playstyle (League patrol writ, Dragons duel circuit, Confed port stake, Rebel smuggling lane), cross-faction consequences. Rep is nested state — the exact bug class T-1002 exists to stop. This task redeems the deferrals recorded by name in code: `patrol.ts:106` and `contraband.ts:37` (the `fence.ray.dealt` flag's Rebel-rep consequence), and the confederation-tagged ports in `content/ports.ts` (the Warlord Confederation reader).
**Accept:** rep nonzero after 100 trader days; an explicit nested-rep save round-trip regression test (the T-1002 bug class, by name); each questline completable in sim; joining one measurably shifts the other three dispositions; all content as data; the named code deferrals (`patrol.ts`, `contraband.ts`, `ports.ts`) are consumed and their comments updated.

### T-1504 · Deed & era content pass + Conqueror headroom — `status: TODO` · `coder: opus` · `after: —`
Fill to launch quantity: ≥30 Deeds including new-verb deeds (gambling, smuggling, lending, exploration, property), era-event storylet tie-ins via the now-real era-event trigger (T-1302), rank citation texts for all 10 ranks. Audit note: 17 deeds exist today (need ≥13 more); the 6 era events are already fully written — the era work here is the storylet tie-ins, not the events themselves. Conqueror (threshold 30) becomes reachable exactly when this task lands — its reachability sweep is this task's obligation, per T-1308's deferral.
**Accept:** counts met, all validate; every era reachable and fires ≥1 tied storylet in a seed sweep; no deed unearnable (200-seed sweep earns every deed at least once); a long veteran sim reaches Conqueror through play.

### T-1505 · The Nemesis Signal arc — `status: TODO` · `coder: fable` · `after: T-1403, T-1502`
The career mystery: 12 fragments authored across ≥3 acquisition modes (derelict logs, Sage decodings, NPC-held pieces), the decoded-lore index text, and the endgame — the crossing chain and the v1 ending screen (Andromeda itself stays sealed for the expansion). The crossing lifts T-1101's NEMESIS destination gate via its `nemesis.crossing.unlocked` flag and requires the PRD's stake (ship + bank commitment); Conqueror interacts per T-1308's reader. Audit note: 5 fragments (`frag-nemesis-01..05`) with decode paths exist today — 7 more fragments plus their acquisition/decode paths are net-new.
**Accept:** full arc completable in a scripted long sim AND the acquisition funnel proven once through the real UI (Playwright: explore→fragment→Sage decode); crossing requires the stake; ending reachable and returns to menu cleanly.

---

## M16 — Hardening & balance

### T-1601 · Policy fleet v3 — `status: TODO` · `coder: opus` · `after: —`
Policies learn the new verbs: the explorer explores and decodes, the trader runs the rim and borrows under duress, the fighter uses its now-real equipment; add smuggler/gambler behaviors. The stats report gains loan usage, scan outcomes, Hangout EV, and the T-1004 `fuelStarvationDays`. This task also owns the interim tuning constants deferred to it by name: the lending rate/term band (`content/lending.ts`), the dice-progression extensibility hook (a future die-granting equipment module, per T-1306's deferral), and the guild constants (`content/guild.ts`).
**Accept:** each policy's 300-day report renders with the new metrics nonzero where applicable; trader clears Tour One within the interim band (≥50% of 50 seeds); no shipped policy triggers a poverty-trap (criterion scoped to the competent policies, per the T-1005 errata).

### T-1602 · Tour One E2E — `status: TODO` · `coder: opus` · `after: T-1407`
Playwright: complete Tour One start-to-resolution through the real UI (per global test-intent rules — every step a player keystroke/click, zero engine shortcuts), both resolution branches, plus a death-and-legacy run — under a CI gate that actually executes it (T-1001). Audit note: Tour One is exercised piecemeal today (`onboarding.spec.ts` reaches the day-31 resolution) but no single start-to-resolution career spec exists.
**Accept:** both branch tests green in CI's Playwright job; run report artifact (screens visited, days elapsed); flake rate <2% over 20 CI runs.

### T-1603 · Balance tuning from sim — `status: TODO` · `coder: fable` · `after: T-1601, T-1504`
Run the policy fleet across 500 seeds and tune against PRD targets — now against a game whose numbers bind: fuel scarcity (T-1102), foundation-anchored encounters (T-1103), load-bearing components (T-1205), margin scaling (T-1202). Targets: Tour One clearable by competent play in 25–30 days (not 10, not never), no dominant route (era churn working), combat EV negative below tier parity without preparation, deed pacing. This task owns the canonical values for every constant marked INTERIM: danger tiers 2/4/5 (`content/systems.ts`), port pricing/income (`content/ports.ts`), lending and guild bands, hangout wagers. Balance consideration flagged by the audit (T-1804): Auto-Repair regenerating before the life-support dusk gate makes the life-support death path unreachable whenever the module is fitted — evaluate whether an always-rescue module is too strong.
**Accept:** tuning memo in `docs/balance/` with before/after distributions; median trader debt-clear day in [22, 30]; combat EV negative below tier parity unprepared (testable now that components matter); nonzero death rate across 1,200 sim days (closing the audit's zero-deaths finding); no stable optimal route; all prior tests still green.

### T-1604 · UGT campaign & fix loop — `status: TODO` · `coder: fable` · `after: T-1602`
Point UGT (sibling repo) at Rimward via the repaired adapter (T-1003). Run the autonomous playtest loop per the established memory protocol (no stopping per failure); triage findings into fixes on this list's pattern.
**Accept:** ≥1,000 UGT actions logged; every HIGH finding fixed with a regression test; `ActionBlocked` UI/protocol event parity verified during the campaign; findings report committed to `docs/playtests/`.

### T-1605 · Failure & edge hardening — `status: TODO` · `coder: opus` · `after: T-1602`
Error boundaries with save-preserving recovery, corrupt-save UX (today a corrupt save silently falls back to a fresh career at `store.ts:256` — the player must be told), the anti-poverty-trap invariant extended over the new adversarial states (indebted-to-Penny-Wise, post-confiscation, zero-fuel-rim), performance pass (1,000-day event logs).
**Accept:** invariant property test in CI covering the named adversarial states; forced crash recovers without save loss; corrupt-save path shows a visible notice instead of silently resetting (Playwright); a 1,000-day save loads <2s.

---

## M17 — Ship it

### T-1701 · Electron shell — `status: TODO` · `coder: fable` · `after: T-1602`
Electron wrapper per TECH-STACK lean: local save dir (migrating localStorage saves in), window management, auto-updater stub, mac+win packaging scripts. Keep the web build working.
**Accept:** packaged app runs Tour One on macOS; saves in OS app-data; web build unaffected (CI proves both).

### T-1702 · Steamworks integration — `status: TODO` · `coder: fable` · `after: T-1701`
steamworks.js (or equivalent): achievements mirrored from the ≥30-Deed set including Conqueror, Steam Cloud on the seed-carrying T-1002 envelope, rich presence (current system/day). Graceful no-Steam fallback.
**Accept:** achievements fire from deed events in the Steam dev sandbox; cloud round-trip verified; app runs identically without Steam present.

### T-1703 · Demo build (Tour One) — `status: TODO` · `coder: opus` · `after: T-1702`
Demo configuration: Tour One + 3 post-resolution days, veteran features teased-but-gated — the gate list includes Hangout progression, ports, and Conqueror content — demo-save carries into full game, distinct build flag and Steam depot config.
**Accept:** demo build produces the gate correctly (no veteran content reachable — Playwright proves it); save import works full-side; build size sane (<200MB).

### T-1704 · Release checklist — `status: TODO` · `coder: opus` · `after: T-1603, T-1604, T-1605, T-1702, T-1703`
Final sweep: store-page asset export list, credits (fonts/audio licenses), version stamping, README/press one-pager, tag `v1.0.0-rc1`.
**Accept:** checklist doc complete with every item checked or explicitly waived by the user; RC tag builds green from clean clone.

---

## Deliberately deferred (do not scope-creep into v1)
Async arena PvP (Season 1) · Andromeda region (expansion) · Roscoe upgrade path · gambling games beyond Spacer's Dare · ports-as-property beyond the single-stake mechanic · localization · controller support.
