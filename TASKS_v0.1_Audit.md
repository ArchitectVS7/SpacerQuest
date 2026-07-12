Tier 1 — the game is not playable as designed

  1. Explore has no UI. At all. Zero hits for "explore" in packages/ui/. The engine ships 193 complete lines — nav check, 80 fuel, beacons, derelicts, loot tables, salvage,
  contraband pods, Signal Fragments — and a human player cannot reach one of them. This kills PRD §7.2 (one of five sample turns) and the Nemesis arc, one of the three career
  objects in §5.2, which now has no acquisition funnel. T-309's Nemesis File pane can only ever render its empty state — and the suite's only Nemesis test asserts that it is
  empty. T-405 is scheduled to build the endgame on top of a funnel with no mouth.

  Root cause: M3 never contained an exploration task. It fell out of the milestone plan, not out of an implementation slip, which is why 12 UI tasks and ~30 reviews sailed past
  it. → Fix code. Needs a new task.

  2. Fuel is not scarce — differentiator #3 is inert. jumpFuelCost caps at min(ty,100)/2, so with the starter drives every jump of distance ≥ 8 costs exactly 50 fuel, forever.
  I verified against the compiled engine:

  dist  1 → 11 fuel      dist  8 → 50 fuel
  dist  7 → 47 fuel      dist 60 → 50 fuel     ← crossing the galaxy
  maxJumpDistance @ 50 fuel = 60               ← the entire map

  My recommendation on the Hangout specifically: build it, don't cut it. It is one action plus one storylet host, and it retroactively gives GUILE, disposition, gambling, the
  rumor table (T-402 already assumes it) and the lender somewhere to live. The rest of that table needs an explicit decision — right now they are in neither the code nor the
  deferred list, which is exactly the quiet-gap category this audit was chartered to find.

  Amend the docs — the doc is simply wrong:
  - shipyard.ts:96 and TASKS.md:129 both document the min(x, 20000) price cap as an "intentional divergence" from a foundation rule that has no cap. Foundation caps at 20,000
  (upgrades.ts:731). The code is faithful; the comment and the T-115 finding are the errors.
  - TASKS.md:43 (T-101) claims "manifest payments and fuel costs shift accordingly." Nothing shifted.
  - T-106's "shared per-system job pool" — there is no pool. NPCs claim from the player's board only when co-located, one claim per dusk.
  - T-201's poverty-trap criterion says "no policy"; the suite scopes it to the three competent policies.

  4. The Rim — the game's namesake — is economically dead. rollContract only ever issues destinations 1–14 (economy.ts:104) and cargo types 1–9 (economy.ts:101). So no contract
  ever routes to a Rim system; the six Rim cargo types (Titanium Ore, Capellan Herbals, Mizarian Liquor…) are never issued; Contraband is never issued. Rim fuel costs 5×, Rim
  danger is 3×, and there is no payday there at all. The sim's own trader policy contains dead code hunting for Rim contracts that cannot exist. PRD §9 calls "one more run to 
  the rim" the original's soul that "is finally the whole point." → Fix code.

  5. Playwright never runs in CI. packages/ui has no test script, so npm test --workspaces --if-present silently skips all 11 specs. playwright.config.ts is written CI-aware
  (forbidOnly, retries, github reporter) for a runner that was never wired up. TASKS.md's Gate explicitly requires the smoke to pass for every UI task; T-301 through T-312 and 
  T-401 all shipped DONE under an unenforced gate. The e2e specs are also outside tsc and eslint. → Fix CI.

  ---
  Tier 2 — designed pillars that are plumbed but dead

  6. NPCs don't run on the player's system. This is differentiator #1 ("a d20 society, not an AI backdrop"). In fact dice.ts:check() is never called by npc.ts. NPC Trade,
  Travel, and Patrol days involve no roll at all — executeTrade always succeeds and always banks the payment. Combat and Socialize use a raw d20 against a hardcoded ≥12/≥14,
  with no stat DC and no StatCheck event. And:

  - CheckResult.margin is computed by the engine, displayed by the UI, and read by no rule anywhere in the codebase. PRD §6's "the margin decides how well it goes" is
  decoration. Every check in the game is binary.
  - Nat-20 and nat-1 never generate a wire story. PRD §6: "A natural 20 or natural 1 always generates a story, and stories go out on the Galactic News Wire." The wire instead
  fires on flaw-overrides plus a flat rng > 0.7. The PRD's own sample wire line is not producible. → Fix code (~15 lines for the nat-20 half).

  7. "They remember" — grudges go nowhere. Nothing reads npc.disposition except the bond hook and storylet triggers. Encounter generation doesn't read it. The tribute DC is 10 
  + interceptor.tier, full stop. PRD §7.4's central beat — "his Flaw makes the DC brutal — this is personal" — reads no history whatsoever; T-104's own worked example
  ("Rattlesnake won't take tribute from someone who insulted him") is unbuilt. Two small edits (a disposition term in chooseTargetTier and in the talk DC) would light up half
  the design.

  8. player.tier is never incremented. Set to 1 at state.ts:92, written nowhere else. Encounter matchmaking bands to [tier−1, tier+1] — so you face tiers 1–2 forever, and 23 of
  the 30 named cast can never intercept you, including Rattlesnake, the star of PRD §7.4.

  9. Six of eight ship components are mechanically dead. Combat reads only player stats and enemy tier. Nothing reads weapons, shields, navigation, robotics, cabin, or
  lifeSupport. ComponentDamaged{component:'shields'} is theatre. The sim's fighter policy buys weapons and shields tiers believing they help. This violates the project's own 
  global playtest rule ("a real player would upgrade their weapons before fighting" — they can, and it does nothing).

  10. Smuggling has no downside. The derelict pod pays +300cr and sets signal.contraband.carrying, which nothing reads. No patrol GUILE check exists, though PRD §7.2 promises
  one explicitly. "Take it" is strictly dominant over "cut it loose" — a fake choice.

  11. Encounters fire 4× less often than foundation, uncommented. ROUTE_DANGER_CHANCE is 0.08 for core systems vs foundation's ENCOUNTER_BASE_CHANCE = 0.30. All 14 core systems
  are danger 1, so combat fires on ~1 jump in 12. This is an undocumented balance divergence, which the standing constraints forbid.

  ---
  Tier 3 — reachability traps (found, but cheap to fix)

  - The Wise One hook is unreachable in real play. It triggers on day === 30 and being at Polaris-1 — a Rim system no contract routes to, a DC-16 jump away — on the exact day
  your 25,000cr marker falls due. It is the sole source of frag-nemesis-01, and the Sage's only decode storylet gates on that exact fragment. Miss it and the Nemesis arc closes
  permanently.
  - Fragments 02–05 (all exploration loot) can never be decoded. Only fragment 01 has a decode storylet.
  - Tier-1 component upgrades are unbuyable through the UI — format.ts:608 invented an inverse (ceil(strength/10)) of a rule the engine owns, so the starter's strength-1 hull
  reads as "tier 1" and only tier 2 is offered. The engine sells tier 1 for 25cr. And shipyard.spec.ts:48 bakes the bug in as the expected result — a green test protecting a
  defect. Worse, buying a tier-1 hull drops max cargo pods from 10 to 0.
  - The manifest shows a check that does not exist. It renders SIGN [17] + TRADE 2 → but sign-contract spends the die and never reads its value. The instrument lies about the
  dice — the precise inverse of differentiator #2 ("the game never fudges").
  - loadSave silently deletes any nested state field the schema doesn't know. Zod strips unknown keys and T-115's drift guard is top-level-only (honestly documented as such).
  T-404 adds "four-faction reputation on GameState" — if it lands under player., every save/load erases it with no error and no failing test. Verified live. Fix this before
  T-404.
  - Storylets cannot trigger on era events. triggerMatches never reads state.eraEvent. This is the root cause of T-401's "documented divergence" and it pre-blocks T-406, whose
  acceptance requires "era events fully written… storylet tie-ins." PRD §8.3's stated authoring principle — storylets "written so the economy delivers it (a contract, a price
  spike, a wire item)" — is structurally inexpressible today.
  - The era never flips TOUR_ONE → VETERAN. Nobody owns the transition; all eight eras:['TOUR_ONE'] gates never expire, and the first eras:['VETERAN'] storylet written for
  T-403/404/405 will silently never fire.
  - The flags namespace is write-only. The guild-pressure beats emit six flags with zero consumers. The unpaid Tour One branch is entirely cosmetic — its prose claims "the
  interest keeps running" (debt never accrues interest) and "your name carries a flag every port clerk can see" (no such flag is read).

  ---
  Where the corrective action is the spec, not the code

  Amend the PRD downward — these are promised and unclaimed by any task:

  ┌───────────────────────────────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────────────────────────────┐
  │                                  PRD promise                                  │                                         Reality                                         │
  ├───────────────────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────┤
  │ The Spacers Hangout as a visitable place (§7 lists "Visit the Hangout" as a   │ NPCs have a Socialize verb. The player does not. This directly contradicts the PRD's    │
  │ core verb; §7.3 is an entire sample turn there; §8.3 names its rumor table;   │ central claim that "the player and the galaxy run on one system."                       │
  │ §9 keeps it)                                                                  │                                                                                         │
  ├───────────────────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────┤
  │ §7.5 "A Bad Day" — its three named outs: the Hangout gamble, Penny Wise the   │ Zero of three exist. Penny Wise is in the cast as a trader; no lending mechanic exists  │
  │ lender, fencing the pod to Smuggler Ray                                       │ anywhere.                                                                               │
  ├───────────────────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────┤
  │                                                                               │ const handSize = 5 hardcoded. No crew, no re-roll, no floor. This is the only           │
  │ "Ship upgrades and crew can add dice, allow one re-roll, or set a floor" (§7) │ progression axis the PRD gives the dice pillar — a Day-200 veteran rolls the same five  │
  │                                                                               │ d20s as a Day-1 nobody.                                                                 │
  ├───────────────────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────┤
  │ Conqueror as the career capstone (§5.2, §9)                                   │ Doesn't exist. T-406 explicitly scopes only 9 ranks. The ladder also saturates —        │
  │                                                                               │ GIGA_HERO needs 15 of 17 deeds and a competent 300-day run gets there.                  │
  ├───────────────────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────┤
  │ Ports as purchasable property (§9)                                            │ Zero code, no task.                                                                     │
  ├───────────────────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────┤
  │ The Reptiloids (§9)                                                           │ Built — and spawnable only on Andromeda routes, i.e. the one place §10 forbids the      │
  │                                                                               │ player to go.                                                                           │
  └───────────────────────────────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────────────────────────────┘

  My recommendation on the Hangout specifically: build it, don't cut it. It is one action plus one storylet host, and it retroactively gives GUILE, disposition, gambling, the
  rumor table (T-402 already assumes it) and the lender somewhere to live. The rest of that table needs an explicit decision — right now they are in neither the code nor the
  deferred list, which is exactly the quiet-gap category this audit was chartered to find.

  Amend the docs — the doc is simply wrong:
  - shipyard.ts:96 and TASKS.md:129 both document the min(x, 20000) price cap as an "intentional divergence" from a foundation rule that has no cap. Foundation caps at 20,000
  (upgrades.ts:731). The code is faithful; the comment and the T-115 finding are the errors.
  - TASKS.md:43 (T-101) claims "manifest payments and fuel costs shift accordingly." Nothing shifted.
  - T-106's "shared per-system job pool" — there is no pool. NPCs claim from the player's board only when co-located, one claim per dusk.
  - T-201's poverty-trap criterion says "no policy"; the suite scopes it to the three competent policies.

  Amend the PRD upward — the code is better than the spec:
  - Legacy/succession is the best-built system in the repo and is more thoughtfully specified than PRD §5.2: cargo forfeiture, scheduled-storylet cancellation, the hand dying
  with the ship. Write those into §5.2.
  - Contract competition — an NPC takes an offer off your board, the wire names them, tomorrow's board is one job shorter — is a more legible "the economy fights back" than
  §2's abstract promise. Promote it to a named mechanic.
  - The anti-poverty-trap discipline (debt as a ledger, never a negative balance; NPC odd-job floors) is real design maturity earned from the Museum Edition's UGT findings. It
  deserves to be a stated PRD principle, not a code comment.
  - Full-screen combat and resolution overlays are diegetic mode-takeovers and are correct; §4's "one screen" absolutism should be amended to bless them.

  ---
  What is genuinely good, and should be protected

  The engineering craft is high. The store is the sole engine caller. quoteShipyard — a pure projection of a purchase's effect that lets the UI gate a button without spending a
  die — is exactly the right pattern and should be the template for the storylet and rank fixes. The Playwright specs are real UX tests that click real buttons; the global "no
  API shortcuts" rule is respected. The Zod GameState schema is genuinely complete — no any, no passthrough. The migration test is real, not theatre. T-304's starmap spec
  imports the engine's own functions to compute its expectation, which is the correct use of the engine in a UX test. And the deed-eval complexity guard pads its log with
  matching events, so a quadratic regression would actually fail it — that is the most rigorous test in the codebase.

  Balance signal for T-503 (not to fix now): the trader clears Tour One on 96% of seeds by day 26, and holds 67k credits by day 100 against a 25k debt. Zero deaths across 1,200
  simulated days. Hull can only be damaged on combat rounds 4, 12, 20… so a never-missing enemy needs 68 rounds to kill you — no single encounter is ever lethal. "Failure
  produces narrative, not repetition" never gets to happen.

  ---
  The one process change that matters

  Individual fixes aside, the durable correction is two clauses added to the standing constraints in TASKS.md, because they would have caught nearly everything above:

  1. A task is not DONE until the feature is reachable by a player through the UI.
  2. Every state field a task adds must name its reader. If nothing reads it, it isn't a feature — it's a receipt.

  ---
  I've made no code changes. If you want, my next step would be to turn this into a docs/AUDIT-2026-07-12.md plus a concrete repair block in TASKS.md — I'd propose roughly:
  T-116 (fuel economy + map coordinates + destination gating), T-117 (make components, equipment, and disposition load-bearing), T-118 (Rim + contraband economy), T-313
  (exploration pane), T-119 (nat-20 wire + margin), and a CI fix — sequenced so the balance pass in T-503 runs against a game whose numbers actually mean something. Want me to
  write that up?

✻ Cogitated for 28m 52s

※ recap: I audited the DONE tasks in TASKS.md against the code and design docs; everything passes its tests, but several designed pillars (exploration, fuel scarcity, 
  disposition, ship components) are built yet unreachable or unread. Next: your go-ahead to write the audit doc and repair tasks. (disable recaps in /config)

** DEV NOTE** 
---
❯ I want to double check on the "No UI" report, as the previous session claimed to have completed ## M3 tasks in the TASKS.md file (T-301 through T-311). Can you verify this   
  before we move forward in redesign? Or is it a matter of something in the UI was crafted, but not wired?                                                                      
---

⏺ Good instinct — let me be precise about what the claim actually is, because "no UI" overstates it. The UI absolutely exists. The claim is narrower: one of the engine's seven 
  player actions — Explore — has no affordance anywhere in the cockpit. Let me verify that directly rather than trust the auditor.

  Verified. Your instinct is right that "no UI" overstates it — here's the precise picture.

  The M3 claims are true. The UI is real.

  T-301 through T-312 all genuinely landed. App.tsx is 2,307 lines, there's a full cockpit — starmap, manifest, port ledger, ship & yard, wire with a virtualized log, combat
  overlay, storylet panel, Registry, settings, saves, sound — and I ran the Playwright suite: 37/37 pass. Nothing in the M3 delivery notes is fabricated.

  But the cockpit has 8 verbs and the engine has 10

  store.ts — the sole caller of the engine — exports exactly these player actions:

  signContract · buyFuel · payDebt · haggleContract · travelTo · combat · shipyard · resolveStorylet · endDay

  That covers Trade (all four sub-actions), Travel, Combat, Shipyard, Storylet. There is no explore() function. Grepping the entire UI package for explor|poi|salvage|derelict
  returns zero hits in any control, handler, or keybinding. It isn't hidden behind a keyboard shortcut — the keydown handlers are Escape-to-close and audio triggers.

  So it's not "crafted but not wired." It's never crafted. The engine's Explore action (day.ts:129) is reachable from the sim (index.ts:800) and from the UGT protocol
  (protocol.ts:488) — but not from the game.

  The tell: the UI is a receiver with no transmitter

  This is what makes it easy to miss. The UI does render exploration's outputs, because other tasks built those:

  - T-306 tags wire lines with a 'poi' kind (format.ts:326) and renders "Beacon return — … logged off the lane." — a line the UI can never cause.
  - T-309 built the whole Nemesis File pane — fragment list, decoded index, empty state.

  So the cockpit looks complete. It has a place to display everything exploration produces. It just has no button to produce any of it. And the tell is sitting in the test
  suite: storylet-registry.spec.ts:108 is titled "the Nemesis file renders its silent empty state at zero fragments" — the only Nemesis assertion in the suite certifies that 
  the feature is empty, because there was no way to make it non-empty through the UI.

  Root cause: the task list, not the coder

  I checked every M3 task block. Not one of T-301…T-312 mentions exploration, POIs, beacons, derelicts, or salvage. The M3 milestone was specced as a list of panes (starmap,
  manifest, wire, combat, ship, storylet, sound, onboarding, settings), and that pane list was never cross-checked against the engine's PlayerAction union.

  Meanwhile T-111a shipped in M1 with acceptance criteria that were headless by construction: "discovery deterministic per seed; nav checks respect PILOT modifier; both POI 
  types reachable in a seed sweep." All true. None of it requires a player.

  So every task passed. T-111a proved exploration works headlessly. T-309 proved the Nemesis pane renders. Nobody owned the sentence "a player can explore," so nobody wrote it,
  and no reviewer's checklist had a line for it.

  What this means for the redesign

  The fix is genuinely small — a die + 80 fuel + a nav check, most naturally as an "off-lane sweep" control on the starmap pane you already built, routed through one new
  explore() in the store. The engine side is done and tested. Call it T-313.

  The bigger point stands though: this is the same failure that produced the four inert special-equipment items and the write-only disposition system. It's worth adding the
  reachability clause to the standing constraints before the redesign work starts, so it can't recur.

  One correction to my earlier report while we're here: I should have said "the Explore action has no UI affordance" rather than letting "no UI" stand — the M3 milestone is
  real work and the delivery notes are honest. The gap is a hole in the plan, not a lie in the log.