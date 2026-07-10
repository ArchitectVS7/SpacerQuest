# Rimward — Master Task List

Complete build-out of *Spacer Quest: Rimward* per `docs/PRD-REIMAGINED.md` and
`docs/TECH-STACK.md`, sized for the orchestrator loop.

## Orchestrator protocol

1. **Check out** the first task with `status: TODO` whose `after:` tasks are all DONE. Set it `IN-PROGRESS`.
2. **Plan** — delegate to the Fable planner with: the task block below, plus pointers to `docs/PRD-REIMAGINED.md`, `docs/TECH-STACK.md`, and the files named in the task. Nothing else.
3. **Code** — delegate to the coder named in `coder:` (Opus by default; Fable where flagged — those tasks have cross-cutting design decisions baked in).
4. **Review** — delegate to the Sonnet reviewer with the diff and the task's acceptance criteria. Criteria are written to be mechanically checkable.
5. On pass: run the gate, commit as `T-0NN: <title>`, set `status: DONE`, update this file in the same commit. On fail: one fix round with the coder, then escalate to Fable if still failing.

**Gate (every task):** `npx tsc -b` clean at root + `npm test` all green. UI tasks additionally require the app to run (`npm run dev` in packages/ui) and, once T-301 lands, the Playwright smoke to pass. Per global rules: UX-facing verification goes through the real UI, never the engine directly.

**Standing constraints** (from TECH-STACK.md — reviewer enforces on every task):
- Engine stays pure: no DOM, no I/O, no `Math.random`/`Date` — all randomness through `SeededRng`.
- Every feature reachable headlessly; UI is a client, never the owner, of a rule.
- All state changes emit typed `GameEvent`s; state survives JSON round-trip.
- Content is data in `packages/content`, never logic.
- Balance numbers come from `foundation/rules/` unless the task says diverge (and then the divergence is commented).

Statuses: `TODO` | `IN-PROGRESS` | `DONE` | `BLOCKED(reason)`

---

## M0 — Infrastructure

### T-001 · CI for the monorepo — `status: DONE` · `coder: opus`
GitHub Actions workflow: on push/PR run `npm ci`, `npx tsc -b`, `npm test` across workspaces. Add ESLint (typescript-eslint, no-floating-promises on) + Prettier with scripts and a lint CI step.
**Accept:** workflow file present and green on the branch; `npm run lint` clean; lint catches an unused import (prove by test-fixture or local demonstration in PR notes).

### T-002 · Headless balance runner (sim package) — `status: DONE` · `coder: opus` · `after: —`
In `packages/sim`: a `runCampaign(seed, days, policy)` harness that drives `advanceDay` with pluggable policies. Ship three naive policies (idle, greedy-trader stub, random-legal-action) and a stats report (credits curve, debt-cleared day, fuel-starvation days, flaw-override rate, wire volume) as JSON to stdout.
**Accept:** `npm run sim -- --seed 1 --days 100 --policy greedy` prints a stats JSON; same seed twice → byte-identical output; a vitest asserts determinism.

---

## M1 — Engine core (the rules of the game)

### T-101 · Starmap coordinates & real distance — `status: DONE` · `coder: opus`
Add 2D coordinates to `content/systems.ts` (port from `foundation/cast/npc-roster.seed.ts`), replace all `|id difference|` distance math (travel, manifest generation) with `calculateDistance` per `foundation/rules/utils.ts`. Export a `distance(a, b)` helper from content or engine.
**Accept:** the two marked "v0 simplification" comments are gone; manifest payments and fuel costs shift accordingly; tests updated + a test that Sun-3→Vega-6 distance matches the foundation formula on the seeded coordinates.

### T-102 · Interactive day lifecycle — `status: DONE` · `coder: fable` · `after: —`
Refactor the batch `advanceDay(state, actions[])` into `startDay(state)` → `applyPlayerAction(state, action)` (any number, dice permitting) → `endDay(state)` (dusk: NPCs, wire, debt). Keep `advanceDay` as a thin composition so sim/tests still batch. Determinism must hold: same seed + same action sequence = same state regardless of call granularity.
**Accept:** existing tests pass unchanged via the composed `advanceDay`; new test proves step-wise vs batch equivalence on a 10-day scripted run; RNG state serializes mid-day.

### T-103 · Encounter system — `status: DONE` · `coder: fable` · `after: T-101, T-102`
Travel can be intercepted: encounter generation rolls against route danger, picks an interceptor from NPCs/anonymous tiers (tier-band matchmaking per PRD §6; the 65-NPC roster in `foundation/cast/npc-roster.seed.ts` becomes the anonymous tier pool in content). Produces an `EncounterState` on `GameState` that blocks further travel until resolved.
**Accept:** deterministic encounters (seeded); tier bands respected in a 500-seed property test; an encounter mid-travel round-trips through JSON; talk/fight/run resolve or continue the encounter.

### T-104 · Multi-round combat — `status: TODO` · `coder: fable` · `after: T-103`
Combat becomes a round-based state machine per PRD §7.4: per-round stance (run/talk/fight), enemy behavior driven by their sheet + flaw (Rattlesnake won't take tribute from someone who insulted him), tribute escalation per `foundation/rules/combat.ts`, component damage on hits, running burns fuel per round, defeat = ship loss trigger (consumed by T-108). Player fuel gates from the current combat.ts carry over per round.
**Accept:** a scripted 3-round fight test with exact expected state; enemy flaw behavior property test; tribute escalation matches foundation constants; defeat emits `ShipLost` event.

### T-105 · Ship upgrades & shipyard — `status: DONE` · `coder: opus` · `after: T-102`
Shipyard actions: component tier purchases, condition repairs, cargo pod expansion, and the 7 special-equipment items with mutual-exclusion rules — prices from `foundation/rules/upgrades.ts`/`constants.ts` (with the UGT-corrected Roscoe economics; leave Roscoe itself out of v1). Component condition affects the formulas that already read it.
**Accept:** buying each tier/equipment works and is die+credit priced; mutual exclusions enforced with typed fail events; a test that hull-condition change moves manifest `pods`.

### T-106 · NPC simulation v2 — the living galaxy — `status: TODO` · `coder: fable` · `after: T-101, T-102`
NPCs move on the real starmap, take contracts from a shared per-system job pool (competing with the player), refuel with real prices, accumulate/lose credits, and hold per-NPC disposition toward the player (grudges and favors with decay). Bonds get one mechanical hook: a bonded NPC in the player's system may intervene (bail, assist) via their existing action types. Stats/Ideal steer intent weights (replace the current 3-branch if/else with weight tables in content).
**Accept:** 200-day sim shows NPCs distributed over the map, non-degenerate credit spread (no NPC pinned at 0 or infinity), player-visible contract competition (a board offer taken by an NPC emits a wire event); disposition changes on player actions (tribute paid, contract sniped) with tests.

### T-107 · Era events & dynamic economy — `status: TODO` · `coder: opus` · `after: T-106`
Era events as content data (blockade, plague, dilithium rush, patrol crackdown — 6 at launch): trigger windows, region scope, price/danger modifiers, wire announcements, natural expiry. Manifest generation and fuel prices read active modifiers. One era active at a time, seeded schedule.
**Accept:** era definitions live in content as data; a plague era measurably raises Medicinals payments to the afflicted system in a test; sim report (T-002) shows no stable optimal route across 300 days (route-profit variance assertion).

### T-108 · Death & legacy — `status: TODO` · `coder: opus` · `after: T-104`
`ShipLost` resolution per PRD §5.2: successor inherits charts (visited systems + known fragments), half the bank, Deeds, and every NPC disposition; debt survives; ship resets to starter. Emits `LegacySuccession` event with a wire obituary/inheritance line.
**Accept:** full inheritance test (what carries, what resets); game continues playable post-death in a 10-day sim; serialization round-trip mid-succession.

### T-109 · Deeds registry & Renown ranks — `status: DONE` · `coder: opus` · `after: T-102`
Deeds as content data: id, period-voice citation, trigger predicate over events/state (declarative condition DSL kept tiny: event type + count/threshold matchers). ~15 launch Deeds (first delivery, debt cleared, first combat win, Mercy Runner, fuel-fumes arrival, etc.). Renown = f(deeds) climbing the 9 canon ranks (names from `foundation/rules/constants.ts`, thresholds NOT ported — deeds-driven per PRD §8.2).
**Accept:** deeds fire from the event stream exactly once each; rank-up emits a wire entry; registry serializes; a sim run earns ≥3 deeds in 100 days.

### T-110 · Storylet engine — `status: TODO` · `coder: fable` · `after: T-102`
Data-driven storylets in content: trigger (system/cargo/NPC/era/day-range/flag conditions), prose, 2–4 choices with requirements (stat check, credits, die) and effects (credits, fuel, cargo, flags, disposition, deed progress, follow-up storylet scheduling). Engine surfaces eligible storylets as part of day state; choice resolution is a player action. Flags namespace on `GameState`.
**Accept:** schema documented in content README; 3 demo storylets (one cargo-attached, one port, one chained pair) fully playable headless in tests; deterministic eligibility; malformed storylet data fails validation loudly at load, not silently mid-game.

### T-111 · Exploration & Signal fragments — `status: TODO` · `coder: opus` · `after: T-110`
Off-lane exploration action: seeded points of interest (beacons, derelicts) discoverable by nav checks, yielding salvage/contraband/Signal fragments per PRD §7.2. Fragments are knowledge items on a `NemesisFile` that persists through legacy (T-108). Wise One (Polaris-1) and Sage (Mizar-9) as storylet-driven fragment brokers.
**Accept:** discovery deterministic per seed; fragment count monotonically grows a decoded-lore index; fragments survive succession test; at least one derelict storylet uses the T-110 engine.

### T-112 · Save versioning — `status: TODO` · `coder: opus` · `after: T-108, T-110`
Versioned save envelope `{version, state}` with an explicit migration registry (v1→v2→…), load-time validation, and a corrupt-save error type. This is the Steam Cloud substrate.
**Accept:** loading a fixture v1 save through a dummy v2 migration works; corrupt JSON and wrong-version-no-migration both fail with typed errors; round-trip property test over a 50-day sim state.

### T-113 · Tour One frame — `status: TODO` · `coder: opus` · `after: T-107, T-109, T-110`
The 30-day arc as engine-level structure: guild pressure storylets at days 10/20/25, day-30 resolution (debt cleared → Deed + veteran unlock flag; not cleared → guild consequence branch, game continues indebted per PRD), and the day-30 Wise One hook storylet that opens the Signal.
**Accept:** scripted policy clears debt by day 30 in sim and hits the resolution events; failing policy hits the consequence branch; both paths leave the game playable (no soft-locks — assert dice/actions remain available in 10 post-resolution days).

---

## M2 — Test harnesses

### T-201 · Policy bots that actually play — `status: TODO` · `coder: opus` · `after: T-113`
Upgrade sim policies to competent play: trader (route+fuel planning), fighter (upgrade-then-hunt), explorer (fragment chaser). These are the balance instruments.
**Accept:** trader clears Tour One debt ≥60% of 50 seeds; each policy's 300-day stats report renders; no policy triggers a poverty-trap (assert: never 5 consecutive days with zero legal income-producing action).

### T-202 · UGT adapter — `status: TODO` · `coder: opus` · `after: T-113`
A thin protocol layer in sim exposing state-summary + legal-actions + apply-action over stdio/WebSocket, matching what the UGT harness (sibling repo) drives. Document the message schema.
**Accept:** protocol doc; an echo test driving a full day through the adapter; deterministic replay from a logged session.

---

## M3 — UI (the cockpit)

### T-301 · UI app scaffold — `status: TODO` · `coder: opus` · `after: T-102`
Vite + React app in `packages/ui` consuming the engine in-browser. Store holds `GameState` + event stream; screen shell is the one-screen cockpit grid per PRD (starmap / manifest / ship status / wire / hand dock). New game (seed), save/load to localStorage via T-112 envelope when available (temporary raw JSON until then). Playwright boot-smoke test.
**Accept:** `npm run dev` boots to a playable day (dawn roll visible, wait-day button works); smoke test green; no engine imports of anything from ui (enforced by lint rule or dependency check).

### T-302 · CRT aesthetic system — `status: TODO` · `coder: fable` · `after: T-301`
The committed amber-phosphor look per PRD §4: theme tokens, typography, glow/flicker/scanline/curvature layer (CSS/WebGL post-process), boot sequence, consistent panel chrome. Must invoke the frontend-design skill. Motion respects `prefers-reduced-motion`; effects toggleable in settings.
**Accept:** screenshot review against PRD §4 language ("instrument, not wallpaper"); effects toggle works; text contrast ≥ WCAG AA within the aesthetic; no per-frame React re-renders for the effect layer (verify with profiler note).

### T-303 · Dawn hand & check UX — `status: TODO` · `coder: opus` · `after: T-301`
The signature interaction: the morning roll animates in, dice are draggable/assignable to actions, every check shows die + stat + DC + margin explicitly (PRD: "the dice are honest and visible"), nat 1/20 get distinct juice.
**Accept:** Playwright: assign specific die to an action and assert the engine consumed that index; check breakdown visible in DOM; day-end state (all spent) clearly communicated.

### T-304 · Starmap pane — `status: TODO` · `coder: opus` · `after: T-301, T-101`
SVG/canvas starmap from content coordinates: current position, fuel-range ring, route preview with fuel cost + DC before committing, visited/unvisited styling, era-event region badges, NPC presence pips (known ships only).
**Accept:** Playwright: plan and execute a jump entirely via the map; fuel ring matches engine math (assert against computed cost); unreachable systems visibly gated, not clickable-then-error.

### T-305 · Manifest & trade pane — `status: TODO` · `coder: opus` · `after: T-301`
Manifest board (4 offers with destination/payment/urgency/storylet flags), sign/haggle flows, fuel depot buy, debt ledger with pay-down control and due-day countdown, active-contract tracker.
**Accept:** Playwright: full loop — sign, haggle refusal path, buy fuel, pay debt — through the UI; every failure event (can't sign twice, no renegotiate) surfaces as visible feedback, never silence (UGT Finding 4's lesson).

### T-306 · Wire pane — `status: TODO` · `coder: opus` · `after: T-301`
Scrolling news ticker + browsable day-by-day log rendered from `WireEntry`/notable events; NPC names link to a mini dossier (name, ship, disposition hints — not raw stats).
**Accept:** Playwright: a flaw-override headline from dusk appears next dawn; log paginates ≥100 days without jank (virtualized).

### T-307 · Combat overlay — `status: TODO` · `coder: fable` · `after: T-104, T-303`
Encounter interrupt → full-screen combat instrument: enemy readout (name/ship/tier, known history), per-round stance + die commitment, fuel budget prominently displayed (the PRD's "can I afford to fire?" front and center), tribute negotiation, aftermath summary feeding the wire.
**Accept:** Playwright: scripted-seed encounter fought and fled through the UI; weapons-malfunction state clearly communicated when fuel-gated; combat state survives reload mid-encounter.

### T-308 · Ship & shipyard pane — `status: TODO` · `coder: opus` · `after: T-105, T-301`
Component grid (strength/condition, damage highlighting), shipyard buy/repair flows, special equipment with exclusion explanations, before/after preview of any purchase's effect (fuel curve, pods).
**Accept:** Playwright: buy an upgrade and see the manifest/fuel numbers change; exclusion conflict shows why, disabled not hidden.

### T-309 · Storylet & registry UX — `status: TODO` · `coder: opus` · `after: T-110, T-109, T-301`
Storylet presentation (prose panel in-cockpit, choices with visible requirements/costs), Registry of Deeds page in period voice, rank display, Nemesis file (fragments collected, decoded index).
**Accept:** Playwright: play the T-110 demo chain via UI; locked choices show their requirement; earned deed appears in Registry with citation text.

### T-310 · Sound design — `status: TODO` · `coder: opus` · `after: T-302`
WebAudio manager: UI relays/keys, drive hum bed, jump/combat/dice one-shots, wire radio crackle, dawn sting. All synthesized or CC0, credited. Master/SFX/ambient sliders, default tasteful, persisted.
**Accept:** audio map documented; mute persists across reload; no autoplay-policy console errors on first interaction; sliders work.

### T-311 · Onboarding & Tour One presentation — `status: TODO` · `coder: opus` · `after: T-113, T-303, T-305`
Tour One's teaching layer: contextual first-time prompts (dawn roll, first sign, first jump, first encounter), guild letters as storylet presentation, day-30 resolution ceremony screen. No modal tutorial walls.
**Accept:** Playwright: fresh seed → first delivery completed guided only by visible affordances (assert prompts fired once each, dismissed state persists); resolution screen reachable both branches.

### T-312 · Settings, saves & new-game UX — `status: TODO` · `coder: opus` · `after: T-112, T-301`
Save slots (3) + autosave-on-dusk, seed entry/display for new game, settings (audio, CRT effects, reduced motion, text size), delete-save confirm.
**Accept:** Playwright: save, mutate, load restores exactly (assert via displayed state); autosave survives hard reload mid-career; deleting asks first.

---

## M4 — Content (writing tasks — planner supplies voice guide from `foundation/lore/User-Manual.md`)

### T-401 · Storylet batch: cargo & passengers (25) — `status: TODO` · `coder: opus` · `after: T-110`
25 storylets attached to cargo types and passenger contracts (PRD §8.3 register: short, one decision, economy-delivered). Include the plague-relief, false-name passenger, and ticking-crate exemplars from the PRD.
**Accept:** all 25 load and validate; each reachable in a 500-day seed sweep (sim assertion); tone spot-check against PRD sample turns; no storylet dead-ends the day.

### T-402 · Storylet batch: ports & rumors (20) — `status: TODO` · `coder: opus` · `after: T-110`
20 storylets keyed to systems (Algol-2's missing repair shop, Spacers Hangout rumor table, rim character) + Wise One / Sage audience scenes.
**Accept:** as T-401; every core+rim system has ≥1 storylet; Hangout rumors reference real NPC state (at least 3 dynamic slots).

### T-403 · NPC personal chains (6 × 3 episodes) — `status: TODO` · `coder: fable` · `after: T-110, T-106`
Personal arcs for Silk Dagger, Doc Salvage, Wild Card, Rattlesnake, Stellar Monk, The Broker — keyed to Bond/Flaw, 3 episodes each, with an ignore-it-and-the-wire-resolves-it path (PRD §8.1: chains can resolve without you).
**Accept:** each chain completable and abandonable in sim; abandonment produces the wire resolution; disposition consequences asserted; episodes gate on real state (not day count alone).

### T-404 · Alliance arcs: rep + first quests — `status: TODO` · `coder: fable` · `after: T-110, T-107`
Four-faction reputation on `GameState` (actions move it: patrol tribute, smuggling, port deals), one 3-step questline per alliance expressing its playstyle (League patrol writ, Dragons duel circuit entry, Confed port stake, Rebel smuggling lane), cross-faction consequences.
**Accept:** rep moves from organic play in sim (assert nonzero after 100 trader days); each questline completable; joining one measurably shifts the other three dispositions; all content as data.

### T-405 · The Nemesis Signal arc — `status: TODO` · `coder: fable` · `after: T-111, T-403`
The career mystery: 12 fragments authored (derelict logs, Sage decodings, NPC-held pieces), the decoded-lore index text, and the endgame: the Nemesis crossing storylet chain — the everything-on-the-table gamble and the v1 ending screen (Andromeda itself stays sealed for the expansion).
**Accept:** full arc completable in a scripted long sim; fragments gated across ≥3 acquisition modes; crossing requires the PRD's stake (ship + bank commitment); ending reachable and returns to menu cleanly.

### T-406 · Deed & era content pass — `status: TODO` · `coder: opus` · `after: T-109, T-107`
Fill to launch quantity: 30 total Deeds, 6 era events fully written (wire copy, storylet tie-ins), rank citation texts for all 9 ranks.
**Accept:** counts met, all validate, each era reachable in seed sweep; no deed unearnable (sim sweep earns every deed at least once across 200 seeds).

---

## M5 — Hardening & balance

### T-501 · Tour One E2E — `status: TODO` · `coder: opus` · `after: T-311, T-305, T-307`
Playwright: complete Tour One start-to-resolution through the real UI (per global test-intent rules — every step a player keystroke/click, zero engine shortcuts), both resolution branches, plus a death-and-legacy run.
**Accept:** both branch tests green in CI; run report artifact (screens visited, days elapsed); flake rate <2% over 20 CI runs.

### T-502 · UGT campaign & fix loop — `status: TODO` · `coder: fable` · `after: T-202, T-501`
Point UGT (sibling repo) at Rimward via T-202. Run the autonomous playtest loop per the established memory protocol (no stopping per failure); triage findings into fixes on this list's pattern.
**Accept:** ≥1,000 UGT actions logged; every HIGH finding fixed with a regression test; findings report committed to `docs/playtests/`.

### T-503 · Balance tuning from sim — `status: TODO` · `coder: fable` · `after: T-201, T-406`
Run the policy fleet across 500 seeds; tune the curves against PRD targets: Tour One clearable by competent play in 25–30 days (not 10, not never), no dominant route (era churn working), combat EV negative below tier parity without preparation, deed pacing.
**Accept:** tuning memo in `docs/balance/` with before/after distributions; all prior tests still green; the UGT Finding-1 assertion enshrined: median debt-clear day in [22, 30] for the trader policy.

### T-504 · Failure & edge hardening — `status: TODO` · `coder: opus` · `after: T-501`
Error boundaries with save-preserving recovery, corrupt-save UX, zero-credit zero-fuel floor audit (assert a legal action always exists — the anti-poverty-trap invariant as a property test over adversarial states), performance pass (1,000-day event logs).
**Accept:** invariant property test in CI; forced crash recovers without save loss; 1,000-day save loads <2s.

---

## M6 — Ship it

### T-601 · Electron shell — `status: TODO` · `coder: fable` · `after: T-501`
Electron wrapper per TECH-STACK lean: local save dir (migrating localStorage saves in), window management, auto-updater stub, mac+win packaging scripts. Keep the web build working.
**Accept:** packaged app runs Tour One on macOS; saves in OS app-data; web build unaffected (CI proves both).

### T-602 · Steamworks integration — `status: TODO` · `coder: fable` · `after: T-601`
steamworks.js (or equivalent): achievements mirrored from Deeds (30), Steam Cloud on the T-112 envelope, rich presence (current system/day). Graceful no-Steam fallback.
**Accept:** achievements fire from deed events in the Steam dev sandbox; cloud round-trip verified; app runs identically without Steam present.

### T-603 · Demo build (Tour One) — `status: TODO` · `coder: opus` · `after: T-602`
Demo configuration: Tour One + 3 post-resolution days, veteran features teased-but-gated, demo-save carries into full game, distinct build flag and Steam depot config.
**Accept:** demo build produces the gate correctly (no veteran content reachable — Playwright proves it); save import works full-side; build size sane (<200MB).

### T-604 · Release checklist — `status: TODO` · `coder: opus` · `after: T-503, T-504, T-602, T-603`
Final sweep: store-page asset export list, credits (fonts/audio licenses), version stamping, README/press one-pager, tag `v1.0.0-rc1`.
**Accept:** checklist doc complete with every item checked or explicitly waived by the user; RC tag builds green from clean clone.

---

## Deliberately deferred (do not scope-creep into v1)
Async arena PvP (Season 1) · Andromeda region (expansion) · Roscoe upgrade path · gambling mini-games beyond storylet references · localization · controller support.
