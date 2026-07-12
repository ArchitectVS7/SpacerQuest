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

### T-104 · Multi-round combat — `status: DONE` · `coder: fable` · `after: T-103`
Combat becomes a round-based state machine per PRD §7.4: per-round stance (run/talk/fight), enemy behavior driven by their sheet + flaw (Rattlesnake won't take tribute from someone who insulted him), tribute escalation per `foundation/rules/combat.ts`, component damage on hits, running burns fuel per round, defeat = ship loss trigger (consumed by T-108). Player fuel gates from the current combat.ts carry over per round.
**Accept:** a scripted 3-round fight test with exact expected state; enemy flaw behavior property test; tribute escalation matches foundation constants; defeat emits `ShipLost` event.
**Audit carry-overs from T-103 (2026-07-10):** current encounters have no teeth — 'talk' is free (no tribute cost, making it the dominant stance), the enemy takes no action between rounds, and ending the day mid-encounter carries no consequence. All three are this task's scope; do not ship T-104 without closing them. Also decide deliberately whether 'escaped' should keep completing the pending travel (today fleeing still lands you at your destination), and remove the legacy non-encounter combat path in `actions/combat.ts` (stub DCs 12/14/10, dead design) rather than extending it.

### T-105 · Ship upgrades & shipyard — `status: DONE` · `coder: opus` · `after: T-102`
Shipyard actions: component tier purchases, condition repairs, cargo pod expansion, and the 7 special-equipment items with mutual-exclusion rules — prices from `foundation/rules/upgrades.ts`/`constants.ts` (with the UGT-corrected Roscoe economics; leave Roscoe itself out of v1). Component condition affects the formulas that already read it.
**Accept:** buying each tier/equipment works and is die+credit priced; mutual exclusions enforced with typed fail events; a test that hull-condition change moves manifest `pods`.

### T-106 · NPC simulation v2 — the living galaxy — `status: DONE` · `coder: fable` · `after: T-101, T-102`
NPCs move on the real starmap, take contracts from a shared per-system job pool (competing with the player), refuel with real prices, accumulate/lose credits, and hold per-NPC disposition toward the player (grudges and favors with decay). Bonds get one mechanical hook: a bonded NPC in the player's system may intervene (bail, assist) via their existing action types. Stats/Ideal steer intent weights (replace the current 3-branch if/else with weight tables in content).
**Accept:** 200-day sim shows NPCs distributed over the map, non-degenerate credit spread (no NPC pinned at 0 or infinity), player-visible contract competition (a board offer taken by an NPC emits a wire event); disposition changes on player actions (tribute paid, contract sniped) with tests.

### T-107 · Era events & dynamic economy — `status: DONE` · `coder: opus` · `after: T-106`
Era events as content data (blockade, plague, dilithium rush, patrol crackdown — 6 at launch): trigger windows, region scope, price/danger modifiers, wire announcements, natural expiry. Manifest generation and fuel prices read active modifiers. One era active at a time, seeded schedule.
**Accept:** era definitions live in content as data; a plague era measurably raises Medicinals payments to the afflicted system in a test; sim report (T-002) shows no stable optimal route across 300 days (route-profit variance assertion).

### T-108 · Death & legacy — `status: DONE` · `coder: opus` · `after: T-104`
`ShipLost` resolution per PRD §5.2: successor inherits charts (visited systems + known fragments), half the bank, Deeds, and every NPC disposition; debt survives; ship resets to starter. Emits `LegacySuccession` event with a wire obituary/inheritance line.
**Accept:** full inheritance test (what carries, what resets); game continues playable post-death in a 10-day sim; serialization round-trip mid-succession.

### T-109 · Deeds registry & Renown ranks — `status: DONE` · `coder: opus` · `after: T-102`
Deeds as content data: id, period-voice citation, trigger predicate over events/state (declarative condition DSL kept tiny: event type + count/threshold matchers). ~15 launch Deeds (first delivery, debt cleared, first combat win, Mercy Runner, fuel-fumes arrival, etc.). Renown = f(deeds) climbing the 9 canon ranks (names from `foundation/rules/constants.ts`, thresholds NOT ported — deeds-driven per PRD §8.2).
**Accept:** deeds fire from the event stream exactly once each; rank-up emits a wire entry; registry serializes; a sim run earns ≥3 deeds in 100 days.

### T-110 · Storylet engine — `status: DONE` · `coder: fable` · `after: T-102`
Data-driven storylets in content: trigger (system/cargo/NPC/era/day-range/flag conditions), prose, 2–4 choices with requirements (stat check, credits, die) and effects (credits, fuel, cargo, flags, disposition, deed progress, follow-up storylet scheduling). Engine surfaces eligible storylets as part of day state; choice resolution is a player action. Flags namespace on `GameState`.
**Accept:** schema documented in content README; 3 demo storylets (one cargo-attached, one port, one chained pair) fully playable headless in tests; deterministic eligibility; malformed storylet data fails validation loudly at load, not silently mid-game.

### T-111a · Exploration Action — `status: DONE` · `coder: opus` · `after: T-110`
Add off-lane `Explore` action to `day.ts` and `types.ts` (consumes die + nav check), surfacing seeded points of interest — beacons and derelicts — per PRD §7.2.
**Accept:** discovery deterministic per seed; nav checks respect PILOT modifier; both POI types (beacon, derelict) reachable in a seed sweep.

### T-111b · Signal Fragments & Loot Tables — `status: DONE` · `coder: opus` · `after: T-111a`
Create loot tables for POIs (salvage, contraband, Signal fragment) per PRD §7.2. Fragments are knowledge items on a `nemesisFile` on `PlayerState` that persists through legacy (T-108, per the `types.ts:505` charts-inheritance socket) and feeds the decoded-lore index. Wire in the Wise One (Polaris-1) and Sage (Mizar-9) as storylet-driven fragment brokers (sell/decode).
**Accept:** fragment count monotonically grows a decoded-lore index; fragments survive succession test; at least one derelict storylet uses the T-110 engine; a Wise One or Sage storylet grants/decodes a fragment.

### T-112a · State Validation Schemas — `status: DONE` · `coder: opus` · `after: T-108, T-110`
Write Zod schemas for the entire `GameState` to provide load-time validation.
**Accept:** corrupt JSON fails with typed Zod errors.

### T-112b · Save Envelope & Migrations — `status: DONE` · `coder: opus` · `after: T-112a`
Versioned save envelope `{version, state}` with an explicit migration registry (v1→v2→…). This is the Steam Cloud substrate.
**Accept:** loading a fixture v1 save through a dummy v2 migration works; wrong-version-no-migration fails with typed errors; round-trip property test over a 50-day sim state.

### T-114 · Post-audit repairs (2026-07-10 adversarial review) — `status: DONE` · `coder: opus` · `after: —`
Findings from the audit of T-002/T-101/T-102/T-103/T-105/T-109. (a) `player.score`/`isConqueror` are vestigial — score is never incremented, yet Star-Buster, Arch-Angel, and Astraxial Hull purchases gate on `score >= 150`/Conqueror, making them unreachable in real play (tests mask it by setting score manually); remap those gates to Renown ranks per PRD §8.2 and remove or explicitly deprecate the fields. (b) Convert the throws for trade/travel/shipyard-during-encounter in `day.ts`/`travel.ts` into typed fail events (player-possible acts use the event channel; throws are for malformed actions). (c) Dedupe `rankForDeedCount` (engine/deeds.ts) vs `renownRankForDeedCount` (engine/state.ts). (d) `evaluateDeeds` rescans the full unbounded eventLog three times per day — cache per-deed match counts in the registry before long sims make it quadratic.
**Accept:** all special equipment reachable via renown progression in a sim run (no test sets `score` directly); no `player.score` reads outside save-compat; encounter-blocked actions emit events, not throws (sim policies updated); one rank function; deed evaluation cost independent of eventLog length (test with a 500-day log).

### T-113a · Guild Pressure Storylets — `status: DONE` · `coder: opus` · `after: T-107, T-109, T-110`
Author the guild pressure storylets (Days 10, 20, 25) and the Day-30 Wise One (Polaris-1) hook storylet that opens the Signal (per PRD §5.1) in content.
**Accept:** storylets load cleanly; triggered deterministically on specific days in sim; the Wise One hook fires at day 30 and offers the first Signal fragment.

### T-113b · Tour One Resolution — `status: DONE` · `coder: opus` · `after: T-113a`
Implement the Day-30 resolution check: debt cleared → Deed + veteran-unlock flag; not cleared → guild consequence branch, game continues indebted per PRD. Force the storylet trigger on the cleared-vs-unpaid state.
**Accept:** scripted policy clears debt by day 30 in sim and hits the resolution events (Deed + veteran-unlock flag set); failing policy hits the consequence branch; both paths leave the game playable — no soft-locks (assert dice/actions remain available across 10 post-resolution days).

---

## M2 — Test harnesses

### T-201 · Policy bots that actually play — `status: DONE` · `coder: opus` · `after: T-113b`
Upgrade sim policies to competent play: trader (route+fuel planning), fighter (upgrade-then-hunt), explorer (fragment chaser). These are the balance instruments.
**Accept:** trader clears Tour One debt ≥60% of 50 seeds; each policy's 300-day stats report renders; no policy triggers a poverty-trap (assert: never 5 consecutive days with zero legal income-producing action).

### T-202 · UGT adapter — `status: DONE` · `coder: opus` · `after: T-113b`
A thin protocol layer in sim exposing state-summary + legal-actions + apply-action over stdio/WebSocket, matching what the UGT harness (sibling repo) drives. Document the message schema.
**Accept:** protocol doc; an echo test driving a full day through the adapter; deterministic replay from a logged session.

### T-115 · Second-audit repairs (2026-07-11) — `status: DONE` · `coder: opus` · `after: —`
Findings from the second adversarial audit of the DONE tasks (T-001/T-104/T-105/T-106/T-107/T-112a/T-114). Nine findings, all resolved:
- **(#1, T-001)** CI was red on the branch: `format:check` (a CI step) failed on 12 committed files. Fixed with `npm run format`; branch is prettier-clean.
- **(#2, T-114 clause a)** Renown-gated special equipment was unreachable in real play and masked by tests that set `renownRank` by hand. Added a `planSpecialEquipment` purchase path (wired into the fighter) and a new `veteranPolicy` that earns its way to GIGA_HERO and buys the ASTRAXIAL_HULL through gameplay — proven by a sim test that sets no rank/score.
- **(#3, T-107)** The "no stable optimal route" assertion would pass even if eras did nothing. Added a same-seed A/B control test proving eras flip the top-paying route toward the afflicted system, plus a temporal-churn assertion (dominant route shifts across windows).
- **(#4, T-104)** Combat balance numbers moved out of engine logic into `@spacerquest/content` (`combat.ts`); the tribute round-cap divergence from foundation is now documented as intentional; flaw-behavior and tribute-escalation examples upgraded to seeded property tests.
- **(#5, T-106)** A contract snipe now emits a typed `DispositionChanged{reason:'contract-sniped'}` (applied after dusk decay so the grudge persists), with a test.
- **(#6, T-105)** The `min(hull.strength*1000, 20000)` special-equipment price cap is documented as an intentional divergence and covered by a boundary test.
- **(#7, T-112a)** Added a compile-time schema-drift guard (top-level `keyof GameState` vs `z.infer<GameStateSchema>`); forward-compat preserved (no runtime `.strict()`).
- **(#8, T-114 clause d)** Deed-eval cost guard now pads the log with MATCHING events so a quadratic re-scan would actually fail it.
- **(#9, infra)** CI job carries `timeout-minutes: 15`; redundant sweep trimmed to offset the new veteran run.
**Accept:** `npx tsc -b` clean (incl. the new compile-time guard); `npm run lint` + `npm run format:check` exit 0; `npm test` all green including the veteran earned-play test (reaches GIGA_HERO + installs ASTRAXIAL_HULL with no manual rank), era A/B, snipe disposition, price-cap boundary, property tests, and the rewritten deed-guard.

---

## M3 — UI (the cockpit)

### T-301 · UI app scaffold — `status: DONE` · `coder: opus` · `after: T-102`
Vite + React app in `packages/ui` consuming the engine in-browser. Store holds `GameState` + event stream; screen shell is the one-screen cockpit grid per PRD (starmap / manifest / ship status / wire / hand dock). New game (seed), save/load to localStorage via T-112 envelope when available (temporary raw JSON until then). Playwright boot-smoke test.
**Accept:** `npm run dev` boots to a playable day (dawn roll visible, wait-day button works); smoke test green; no engine imports of anything from ui (enforced by lint rule or dependency check).
**Delivered (2026-07-11):** Vite 6 + React 19 app. A dependency-light module store (`src/store.ts`, `useSyncExternalStore`) is the sole caller of the engine — the UI is a pure client of the rules; it drives `startDay`/`applyPlayerAction`/`endDay` and persists through the T-112 `createSave`/`loadSave` envelope to `localStorage` (corrupt/missing → fresh career). One-screen cockpit grid: bezel, nav-grid starmap (a readable placeholder — 21/28 canon systems share y=0, so the coordinate-accurate fuel-ring/route map is deferred to T-304, noted in code), manifest with die-assign sign flow, ship status, wire ticker from the event log, and the dawn-hand dock. New-game-by-seed. 3 Playwright smoke tests green (boots to a playable Day 1; End Day advances the engine to Day 2 and rolls a fresh unspent hand; die-assign signs a contract and consumes the die). Engine→ui import direction is structurally impossible (engine has no ui dependency); eslint now type-checks `.tsx` too. `tsc -b` builds ui as a composite project (typecheck); Vite bundles separately to `dist-web/`.

### T-302 · CRT aesthetic system — `status: DONE` · `coder: fable` · `after: T-301`
The committed amber-phosphor look per PRD §4: theme tokens, typography, glow/flicker/scanline/curvature layer (CSS/WebGL post-process), boot sequence, consistent panel chrome. Must invoke the frontend-design skill. Motion respects `prefers-reduced-motion`; effects toggleable in settings.
**Accept:** screenshot review against PRD §4 language ("instrument, not wallpaper"); effects toggle works; text contrast ≥ WCAG AA within the aesthetic; no per-frame React re-renders for the effect layer (verify with profiler note).
**Delivered (2026-07-11, frontend-design skill invoked):** "P3 Amber, an instrument you hold" — `src/theme.css`. Design commitments: one phosphor colour with emphasis by **reverse video** (never a second hue); Chakra Petch (display chrome) + IBM Plex Mono (tabular data) pairing; phosphor-persistence motion (spent dice bloom→afterglow, ghosted value changes); the dawn-hand + honest-check block as the signature. Effect layer (scanline/flicker/vignette/curvature) is a static, memoized `<EffectsLayer/>` with pure-CSS animation — **React never re-renders it per frame** (no props change; the toggle only stamps `data-fx` on `:root`). `prefers-reduced-motion` kills the scramble/bloom/ghost/ticker/flicker. Contrast verified: ember 10.85:1, ember-hi 15.69:1, amber 5.63:1 on the tube — all ≥ AA (amber-dim 2.0:1 is used only for hairlines/disabled/decoration; unvisited nav text lifted to amber to stay AA). Effects toggle ("CRT: ON/OFF") persists to `localStorage`.

### T-303 · Dawn hand & check UX — `status: DONE` · `coder: opus` · `after: T-301`
The signature interaction: the morning roll animates in, dice are draggable/assignable to actions, every check shows die + stat + DC + margin explicitly (PRD: "the dice are honest and visible"), nat 1/20 get distinct juice.
**Accept:** Playwright: assign specific die to an action and assert the engine consumed that index; check breakdown visible in DOM; day-end state (all spent) clearly communicated.
**Delivered (2026-07-11):** Dice are click-select (primary, Playwright-driven) and native-drag (accessible parallel) assignable to a manifest contract, either signing it (die-cost, no check) or haggling it (a real TRADE-vs-DC-12 check via the existing engine `haggle` trade action). A reusable `CheckBreakdown` component reads die/stat/modifier/total/DC/margin/verdict straight off the engine's `StatCheck` event — nothing is recomputed in the UI — with distinct nat-20/nat-1 styling. The dawn hand exposes `data-hand-spent` on both the dock and hand nodes and a `day-end` affordance once all five dice are spent. Three new Playwright specs (`e2e/dawn-hand.spec.ts`) drive the real UI end to end — assign a specific die and verify that index spent, haggle and read the full breakdown, exhaust the hand and see day-end — and all 6 e2e tests (3 new + 3 pre-existing smoke) pass. Scope boundary: only the manifest/haggle path produces a check in this single-system cockpit; travel, combat, and storylet checks (T-304/T-307/T-309) will reuse `CheckBreakdown` but are out of scope here, and the morning-roll reveal reuses the T-302 scramble/bloom motion rather than adding a new animation.

### T-304 · Starmap pane — `status: DONE` · `coder: opus` · `after: T-301, T-101`
SVG/canvas starmap from content coordinates: current position, fuel-range ring, route preview with fuel cost + DC before committing, visited/unvisited styling, era-event region badges, NPC presence pips (known ships only).
**Accept:** Playwright: plan and execute a jump entirely via the map; fuel ring matches engine math (assert against computed cost); unreachable systems visibly gated, not clickable-then-error.
**Delivered (2026-07-11):** SVG starmap from content coordinates: current position, a fuel-range ring drawn at the engine's `maxJumpDistance`, and a route preview showing fuel cost + DC + distance *before* committing — every number read from the engine (`jumpFuelCost`/`travelDc`/`maxJumpDistance`), nothing recomputed in the UI. Two new authoritative engine helpers were extracted so the resolver and the preview cannot diverge: `travelDc(routeDistance)` (the ONE source of pilot-check difficulty, now called by both `resolveTravel` and the map) and `maxJumpDistance(drives, fuel, hasTransWarp)` (the ring radius), each with boundary tests in `economy.test.ts`. Unreachable systems carry `data-reachable="0"` and are gated, never clickable-then-error. The travel PILOT check reuses the shared `CheckBreakdown`. Three new Playwright specs (`e2e/starmap.spec.ts`) plan+execute a jump, assert the ring/preview against the imported engine functions, and drain the tank to prove gating — all through the UI. **Committed together with T-307** (see note there): both tasks edit the shared cockpit shell (`App.tsx`, `store.ts`, `format.ts`, `theme.css`) and were no longer cleanly separable, so they ship as one commit rather than faking two atomic ones.

### T-305 · Manifest & trade pane — `status: DONE` · `coder: opus` · `after: T-301`
Manifest board (4 offers with destination/payment/urgency/storylet flags), sign/haggle flows, fuel depot buy, debt ledger with pay-down control and due-day countdown, active-contract tracker.
**Accept:** Playwright: full loop — sign, haggle refusal path, buy fuel, pay debt — through the UI; every failure event (can't sign twice, no renegotiate) surfaces as visible feedback, never silence (UGT Finding 4's lesson).
**Delivered (2026-07-11):** The Port Ledger pane sits beside the Manifest board with an active-contract tracker, a fuel depot (buy consumes the assigned die per PRD §7), and a debt ledger with a pay-down control (a die-free ledger transfer) and due-day countdown that highlights inside 5 days. The manifest board now shows display-only URGENT (destination repriced by the active era event) and STORYLET (cargo keyed to a content storylet) flags, derived from existing engine/content state with no new `CargoContract` field. Every engine refusal — signing a second contract, re-haggling, overpaying debt with no credits — is scanned out of the action's events in the store and surfaced as a visible reverse-video notice (`data-testid="notice"`) instead of a disabled dead click, satisfying UGT Finding 4's lesson. Five new Playwright specs (`e2e/manifest-trade.spec.ts`) drive the full loop — sign, haggle, buy fuel, pay debt, plus both refusal paths — entirely through the UI, and pass alongside the 6 pre-existing smoke/dawn-hand specs. Scope boundary: the starmap/travel pane, its fuel-range ring, and the `CheckBreakdown` multi-pane filtering it needs are T-304's job and are not part of this commit; the trade pane's own check (haggle) continues to use the unfiltered `CheckBreakdown`.

### T-306 · Wire pane — `status: DONE` · `coder: opus` · `after: T-301`
Scrolling news ticker + browsable day-by-day log rendered from `WireEntry`/notable events; NPC names link to a mini dossier (name, ship, disposition hints — not raw stats).
**Accept:** Playwright: a flaw-override headline from dusk appears next dawn; log paginates ≥100 days without jank (virtualized).
**Delivered (2026-07-11):** The Galactic Wire pane keeps its scrolling ticker unchanged and adds a "LOG" toggle opening a browsable day-by-day history, hand-rolled virtualized (fixed-height rows over a single absolutely-positioned viewport window, no external windowing library) so 100+ days render without scanning every row. Entries are grouped by day and tagged by kind (`flaw-override`, `deed`, `renown`, `era`, `poi`, `npc`, `plain`) purely from existing `eventLog`/`WireEntry` data — no new engine state — with flaw-override headlines given the T-302 reverse-video treatment as the load-bearing "always notable" signal. The first NPC name mentioned in any line renders as a link opening a mini dossier (name, ship, last-seen system, and prose disposition/temperament hints derived from authored `NPC_PROFILES` bond/flaw text) that deliberately omits raw stats, flawDc, or tier. A new Playwright spec (`e2e/wire.spec.ts`) drives a real seed to a flaw-override dusk entirely through the UI, confirms the headline reappears in next dawn's log, and asserts the log virtualizes (bounded DOM row count) across 100+ simulated days. Scope boundary: the starmap/travel work landing alongside this in the working tree (T-304 — `maxJumpDistance`, `travelDc`, the coordinate-accurate starmap component, and its Playwright spec) is a separate in-progress task and is intentionally excluded from this commit.

### T-307 · Combat overlay — `status: DONE` · `coder: fable` · `after: T-104, T-303`
Encounter interrupt → full-screen combat instrument: enemy readout (name/ship/tier, known history), per-round stance + die commitment, fuel budget prominently displayed (the PRD's "can I afford to fire?" front and center), tribute negotiation, aftermath summary feeding the wire.
**Accept:** Playwright: scripted-seed encounter fought and fled through the UI; weapons-malfunction state clearly communicated when fuel-gated; combat state survives reload mid-encounter.
**Delivered (2026-07-11):** Full-screen combat instrument that mounts off `game.encounter`: enemy readout (name/ship/tier/history), per-round stance (FIGHT/TALK/RUN) + die commitment, a prominent fuel budget with per-stance costs, tribute preview, and an aftermath summary that dismisses back to the cockpit. A pure client of the engine — `store.combat()` is a single `resolveCombat` call, and every surfaced value comes from typed events: the honest PLAYER roll is the `StatCheck` filtered to `actor:'Player'` (never the enemy counter-attack) fed to the shared `CheckBreakdown`; the fuel-gated `WEAPONS OFFLINE` band and post-fire malfunction come from `CombatEvent.insufficientFuel`; the aftermath is derived from `EncounterResolved`/`TributePaid`/`ShipLost`/`LegacySuccession` (`combatAftermathSummary`). Autosaves each round so a mid-encounter reload restores the fight; a hand-spent stand-down ends the day to prevent a soft-lock. Two new Playwright specs (`e2e/combat.spec.ts`, offline-computed seed fixtures replayed through the real engine) fight+flee+reload and prove the malfunction by an unchanged enemy hull — all through the UI. **Workflow note:** T-304 and T-307 were both left `IN-PROGRESS` and uncommitted with their edits intermingled across the shared cockpit files, so the two-atomic-commits protocol could not be honored; they ship as one combined commit. The orchestrator should serialize tasks that touch `App.tsx` and commit-before-next between them.

### T-308 · Ship & shipyard pane — `status: DONE` · `coder: opus` · `after: T-105, T-301`
Component grid (strength/condition, damage highlighting), shipyard buy/repair flows, special equipment with exclusion explanations, before/after preview of any purchase's effect (fuel curve, pods).
**Accept:** Playwright: buy an upgrade and see the manifest/fuel numbers change; exclusion conflict shows why, disabled not hidden.
**Delivered (2026-07-11):** Ship & Yard pane replacing the old read-only ShipStatus strip: a fuel-curve readout (fuel/jump, range, fuel/max), a full eight-component grid (strength, 5-pip condition, damage highlighting) with per-row Upgrade and single-step Repair, a Repair-all action, a cargo-pods buy control, and a special-equipment list that always renders every item — owned ones tagged INSTALLED, unavailable ones disabled with the engine's typed reason shown inline (never hidden). All of it is a pure client of new engine surface added for this task: `shipyardCost`/`shipyardFailure`/`applyShipyardMutation` were factored out of the old monolithic `resolveShipyard` so the same rule code backs both the real purchase and a new pure `quoteShipyard(state, action)` that projects before→after ship instruments (pods, fuel curve, component strength) without mutating or spending a die; the pane gates every button on `quote.ok` so a die is never wasted on a predictable refusal. The store's single `shipyard()` action is the only mutation path. Three new Playwright specs (`e2e/shipyard.spec.ts`) drive the pane through the UI end-to-end: buying a drives upgrade and watching the fuel-curve numbers change live, an equipment exclusion conflict rendered disabled-with-reason, and a renown-gated item likewise — all pass. **Scope boundary:** the pane covers the acceptance criteria's buy/repair/preview/exclusion surface only; storylet-driven ship events (e.g. Nemesis-triggered damage) and the sound/animation pass for purchases are left to T-309/T-310 respectively.

### T-309 · Storylet & registry UX — `status: DONE` · `coder: opus` · `after: T-110, T-109, T-301`
Storylet presentation (prose panel in-cockpit, choices with visible requirements/costs), Registry of Deeds page in period voice, rank display, Nemesis file (fragments collected, decoded index).
**Accept:** Playwright: play the T-110 demo chain via UI; locked choices show their requirement; earned deed appears in Registry with citation text.
**Delivered (2026-07-11):** A floating "Storylet" launcher (badge-counted, hidden during combat) opens a prose panel presenting one queued offer at a time, paged when several are waiting; each choice shows its authored requirement/cost badge (credits, STAT DC, die) and, when unmet, a visible inline lock that also disables the button — the panel is a pure client of the existing T-110 engine rules, routing every resolution through a single new store action (`resolveStorylet`) that spends a die only for a choice that declares one, and any storylet stat check (any stat, not just PILOT/TRADE) rides the shared `CheckBreakdown` filtered to a new `context="storylet"` so it can't collide with the manifest's haggle check. A new "Records" overlay adds the Registry of Deeds (rank, deed count, next-rank progress, and the earned-deed roll with period-voice citations, all read via a new `deedRegistry()` projection off `game.player.registry` and `content`'s `RENOWN_DEED_THRESHOLDS`) and the Nemesis File (decoded-lore index via the engine's existing `nemesisLoreIndex`/`fragmentCount`, with a silent empty state at zero fragments); a live rank chip was added to the bezel readouts. Three new Playwright specs (`e2e/storylet-registry.spec.ts`) drive the T-110 doc-salvage demo chain and the Guild Auditor storylet entirely through the UI — a locked die-gated choice showing its requirement and unlocking once a die is assigned, the full two-day chain earning the Beacon Keeper deed and bumping rank to Commander (verified in both the bezel and Registry), and the Nemesis file's empty state — and pass alongside all 22 pre-existing specs (25/25 total) plus 243 unit tests. Scope boundary: this is presentation only — no new engine rules were added, the storylet/deed/nemesis mechanics themselves are T-109/T-110/T-111b's; the Tour One onboarding layer that walks a first-time player through their first storylet (contextual prompts, guild-letter framing) is T-311's job, not this one.

### T-310 · Sound design — `status: DONE` · `coder: opus` · `after: T-302`
WebAudio manager: UI relays/keys, drive hum bed, jump/combat/dice one-shots, wire radio crackle, dawn sting. All synthesized or CC0, credited. Master/SFX/ambient sliders, default tasteful, persisted.
**Accept:** audio map documented; mute persists across reload; no autoplay-policy console errors on first interaction; sliders work.
**Delivered (2026-07-11):** A new `sound.ts` module is the sole owner of audio: an all-procedural WebAudio manager (oscillators + a shared noise buffer, zero sample files, documented CC0 in the module header alongside the full cue→bus→trigger audio map) providing relay/key clicks on any pointerdown/keydown, a firm "commit" thunk when a die is spent, and outcome cues — jump whoosh, combat dice rattle, nat20/nat1 flourishes, the combat-start alarm, wire-radio crackle, a warm dawn chord, and a soft fail buzz — derived from the store's existing `GameEvent` stream through a pure, unit-testable `cuesForEvents` mapper (the engine emits nothing new for it). A slow detuned dual-oscillator drive-hum bed runs as an ambient bed across travel and the day boundary. The `AudioContext` is never constructed at module load — it is built and resumed strictly inside the first capture-phase gesture, so the autoplay-policy console warning never fires. A master/SFX/ambient three-slider mixer plus mute, persisted to `localStorage` and reactive via a tiny external store, is exposed through a new "Audio" toggle button and popover panel in `App.tsx`, themed to match the existing CRT amber aesthetic. Three new Playwright specs (`e2e/sound.spec.ts`) drive the mixer through the real UI — first-gesture console cleanliness, mute surviving a hard reload, and the sliders reading/writing their persisted values — and pass alongside all 25 pre-existing UI specs (28/28) plus 214 engine and 29 sim unit tests. **Scope boundary:** every cue is synthesized live in-browser with no third-party audio assets to license or credit beyond the project's own CC0 notice; per-region music beds and a title-screen theme were not called for by the acceptance criteria and are left out.

### T-311 · Onboarding & Tour One presentation — `status: DONE` · `coder: opus` · `after: T-113b, T-303, T-305`
Tour One's teaching layer: contextual first-time prompts (dawn roll, first sign, first jump, first encounter), guild letters as storylet presentation, day-30 resolution ceremony screen. No modal tutorial walls.
**Accept:** Playwright: fresh seed → first delivery completed guided only by visible affordances (assert prompts fired once each, dismissed state persists); resolution screen reachable both branches.
**Delivered (2026-07-12):** A priority-ordered registry of four contextual coach prompts (dawn hand, first sign, first jump, first encounter) — each a pure predicate over existing `GameState` (no new engine field) — is rendered by a single non-modal `OnboardingCallout` anchored to the real affordance it teaches (hand dock, manifest, starmap, or inside the combat overlay), with no backdrop or focus trap so the player can act on the affordance while the callout is up. A shared `nextOnboardingSeen` reconcile in `format.ts` auto-marks a prompt seen the instant its predicate flips false after any store action (the taught action was just performed), and a manual "Got it" dismiss covers the rest; the seen-set is client-only presentation state (`sq.onboarding.v1` in localStorage, wiped on New Game so a fresh career re-teaches) kept out of `GameState` so the engine and save format are untouched. Merchant-Guild storylets (`guild.*`) get a reverse-video letterhead treatment (pure markup/CSS switch on storylet id, same `resolveStorylet` path). The day-30 Tour One resolution is intercepted from the generic storylet launcher by a new full-screen `ResolutionCeremony` component — modelled on the combat overlay — that reads the engine's already-forced `resolution.tour-one.*` offer plus the `veteran.unlocked` flag and earned `tour_one_cleared` deed, presenting the cleared and unpaid branches as distinct unmissable certificates that both resolve through the same `resolveStorylet` action (no soft-lock; acknowledging either unmounts back to a fully playable cockpit). Four new Playwright specs (`e2e/onboarding.spec.ts`) drive a fresh seed through the real UI — the dawn/sign/jump prompts firing once each and dismissed-state persisting across reload, the combat coach firing only inside an encounter, and both resolution-ceremony branches (cleared and unpaid, debt surviving) reached and played through — and pass alongside all 28 pre-existing UI specs (32/32 total), 214 engine and 29 sim unit tests, and a clean typecheck/lint. **Scope boundary:** this is presentation only, teaching Tour One's existing affordances and staging its existing forced resolution — no new engine rule, storylet content, or save-format field was added; save slots, seed entry, and the settings panel (audio/CRT/reduced-motion/text-size) are T-312's job, not this one.

### T-312 · Settings, saves & new-game UX — `status: DONE` · `coder: opus` · `after: T-112b, T-301`
Save slots (3) + autosave-on-dusk, seed entry/display for new game, settings (audio, CRT effects, reduced motion, text size), delete-save confirm.
**Accept:** Playwright: save, mutate, load restores exactly (assert via displayed state); autosave survives hard reload mid-career; deleting asks first.

**Delivered (2026-07-12):** A Settings popover reachable from the control bar (same anchored-popover pattern as the existing Audio panel, Escape-to-close) now surfaces three explicit save slots and the display/accessibility settings the task named. Each slot writes through the engine's own `createSave`/`loadSave` (the exact functions T-112b already proves round-trip exactly), with a lightweight client-only meta blob (day, credits, system, seed, timestamp) cached alongside for the slot list so rendering it never has to parse every envelope; Delete is two-step (asks first, then a distinct confirm button actually removes it). Reduced motion and text size are persisted user overrides layered on top of the existing OS media-query/CRT handling — reduced motion drives both a blanket CSS kill-switch and the JS dawn-scramble/sweep gates, text size zooms the `.tube` root since most sub-elements use hardcoded px. The new-game seed (already enterable) is now also displayed live in the bezel and recovered across a hard reload from a small client-side `sq.save.seed` key, following the same "presentation metadata, not GameState" pattern already used for onboarding-seen and fx — the engine's save format is untouched. Five new Playwright specs (`e2e/settings-saves.spec.ts`) drive save/mutate/load, hard-reload autosave survival, the two-step delete confirm, settings persistence across reload, and seed entry/display, entirely through the real UI controls (no API shortcuts); they pass alongside all 32 pre-existing UI specs (37/37 total), 214 engine and 29 sim unit tests, and a clean typecheck/lint. **Scope boundary:** this is save/settings plumbing only — no new engine rule, storylet, or GameState field was added, and audio's own sliders (already covered by `sound.spec.ts`) were deliberately left in their existing panel rather than duplicated here; Settings just links to them.

---

## M4 — Content (writing tasks — planner supplies voice guide from `foundation/lore/User-Manual.md`)

### T-401 · Storylet batch: cargo & passengers (25) — `status: DONE` · `coder: opus` · `after: T-110`
25 storylets attached to cargo types and passenger contracts (PRD §8.3 register: short, one decision, economy-delivered). Include the plague-relief, false-name passenger, and ticking-crate exemplars from the PRD.
**Accept:** all 25 load and validate; each reachable in a 500-day seed sweep (sim assertion); tone spot-check against PRD sample turns; no storylet dead-ends the day.
**Delivered (2026-07-12):** 25 new storylets appended to `packages/content/src/storylets.ts` (pure data; total is now 37) — 11 cargo-attached beats (one per cargo type 1–9 plus the ticking-crate discovery/aftermath chain) and 14 passenger-fare storylets modelled as flags (`passenger.<slug>.aboard` set by a system-gated board, cleared by a scheduled arrival that always fires and pays out, so no fare can soft-lock). Includes the three PRD exemplars: `cargo.medicinals.plague-relief` (Fomalhaut-2 aid-vs-profiteer choice), the `cargo.ticking-crate.*` chain, and `passenger.false-name.*`. No engine or schema changes. A new `packages/sim/src/__tests__/storylet-coverage.test.ts` drives an 8-seed × 500-day headless sweep through legal `applyPlayerAction` calls only and asserts all 25 new ids are reachable; engine tests assert no duplicate ids and that every storylet (37 total) offers a requirement-free choice. **Scope boundary:** reachability required two documented divergences from the PRD's literal framing (plague-relief delivered as a Medicinals contract since there's no era-event trigger; ticking-crate attached to Dilithium since `rollContract` never issues Contraband) — both noted inline in `storylets.ts`; no engine/schema change was made to avoid them.

### T-402 · Storylet batch: ports & rumors (20) — `status: TODO` · `coder: opus` · `after: T-110`
20 storylets keyed to systems (Algol-2's missing repair shop, Spacers Hangout rumor table, rim character) + Wise One / Sage audience scenes.
**Accept:** as T-401; every core+rim system has ≥1 storylet; Hangout rumors reference real NPC state (at least 3 dynamic slots).

### T-403 · NPC personal chains (6 × 3 episodes) — `status: TODO` · `coder: fable` · `after: T-110, T-106`
Personal arcs for Silk Dagger, Doc Salvage, Wild Card, Rattlesnake, Stellar Monk, The Broker — keyed to Bond/Flaw, 3 episodes each, with an ignore-it-and-the-wire-resolves-it path (PRD §8.1: chains can resolve without you).
**Accept:** each chain completable and abandonable in sim; abandonment produces the wire resolution; disposition consequences asserted; episodes gate on real state (not day count alone).

### T-404 · Alliance arcs: rep + first quests — `status: TODO` · `coder: fable` · `after: T-110, T-107`
Four-faction reputation on `GameState` (actions move it: patrol tribute, smuggling, port deals), one 3-step questline per alliance expressing its playstyle (League patrol writ, Dragons duel circuit entry, Confed port stake, Rebel smuggling lane), cross-faction consequences.
**Accept:** rep moves from organic play in sim (assert nonzero after 100 trader days); each questline completable; joining one measurably shifts the other three dispositions; all content as data.

### T-405 · The Nemesis Signal arc — `status: TODO` · `coder: fable` · `after: T-111b, T-403`
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
