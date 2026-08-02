# Changelog

## 0.5.3
- The focusing arc: prove the game before growing it — no new systems this track
- An outside review of 0.5.2 set the agenda, and its findings are now scheduled: the
  bar's dealer stops calling honest bids (it was losing 19 of 20 challenges it started),
  and a veteran captain stranded at a rim port gets the same rescue the fighter got
- The balance safety net must now prove itself: seeded regressions have to fail the
  gate, and archetype coverage is cross-checked against what the cast can really do
- Rival captains will draw their own dice each dawn — closing the last big gap between
  how you play a day and how they do
- An AI test pilot learns to fly the player's seat, and a browser-level long-haul check
  watches for the crashes scripted tests can't anticipate
- Then everything halts for the first full human playthrough: pacing, dice tension, and
  two open design calls (combat's depth, how long a grudge should last) get judged by
  feel, with the numbers laid out beside the controls

## 0.5.2
- Explore and Socialize redesign arc
- Explore rebuilt: 100 things to find out there, from quiet lore to real salvage, plus
  28 unique fittings — spare tankage, gunner's sight rings, hull doubler plates — that
  change how your ship flies
- Good finds now cost you something. A decent haul lays you up for a day; the best ones
  are paid for in dice on the day you claim them, and you forfeit if your hand can't
  cover it
- All 14 spaceports now have a bar, each with its own regulars, rumors and atmosphere —
  including the business you'd rather not be seen doing
- Liar's Dice comes to the bar: 42 named opponents, three at every port, who bluff and
  needle you differently. Beat them to climb an unlock ladder and earn achievements
- Ports now set their own loan terms, Arcturus-6 first — and the rumor mill finally
  knows which ports have no bar at all
- Telemetry and dev tooling, NPC decision tracking for debug
- Fixed a fighter captain who could get stranded at a rim port and sit idle for weeks
- Balance checks now run on every build and fail it when the economy drifts
- Designed, but not yet built: trinkets that modify the player rather than the ship
- Versioning: patch now marks the work track
- Still to come in this arc: rival captains drawing their own dice each dawn, an AI test
  pilot, and the first full human playthrough



  ┌────────────────────────┬────────────────────────────┬───────┬────────────────────────────────────────────────────────────────┐
  │          Term          │           Where            │ Count │                         What they are                          │
  ├────────────────────────┼────────────────────────────┼───────┼────────────────────────────────────────────────────────────────┤
  │                        │                            │       │ Named rivals who fly real ships and play by the player's rules │
  │ The captains           │ cast.ts → NPC_PROFILES     │ 30    │  — the N-series parity track. Iron Vex, Cargo King, Admiral    │
  │                        │                            │       │ Stern… These are the Honor List.                               │
  ├────────────────────────┼────────────────────────────┼───────┼────────────────────────────────────────────────────────────────┤
  │                        │                            │       │ Same NpcProfile shape, but story-only. Silk Dagger, Lucky      │
  │ Quest cast             │ cast.ts → QUEST_PROFILES   │ 11    │ Seven, Doc Salvage, The Broker… ALL_NPC_PROFILES = 30 + 11 =   │
  │                        │                            │       │ 41.                                                            │
  ├────────────────────────┼────────────────────────────┼───────┼────────────────────────────────────────────────────────────────┤
  │ Pirates (properly:     │ cast.ts →                  │       │ Not people — kinds. PIRATE ×9, PATROL ×11, RIM_PIRATE ×21,     │
  │ anonymous              │ ANONYMOUS_INTERCEPTORS     │ 65    │ BRIGAND ×12, REPTILOID ×12. Unnamed combat-encounter fodder.   │
  │ interceptors)          │                            │       │                                                                │
  ├────────────────────────┼────────────────────────────┼───────┼────────────────────────────────────────────────────────────────┤
  │ Liar's Dice opponents  │ liarsDice.ts →             │ 42    │ 14 ports × 3 seats. Bar patrons who never fly anything — Hob   │
  │                        │ LIARS_DICE_OPPONENTS       │       │ Trellis, Auntie Sorrow, The Duty Clerk.                        │
  └────────────────────────┴────────────────────────────┴───────┴────────────────────────────────────────────────────────────────┘
  
## 0.5.1
- Split the NPC redesign into its own task
- Completed bulk of the NPC base work, discovered two major gaps (Explore, Socialize)

## 0.5.0
- Started the NPC parity track (N-series); N0, N1, N2, N6, N7 and N9 shipped.
  N3–N5, N8 and N10–N14 remain open — see docs/NPC_REDESIGN.md for the status board.
- NPCs now play by the player's rules, owning real ships and upgrading them
- Established versioning standard and lockfile generation
- Added copy-on-write discipline for player and NPC turns
- Updated the Honor List to a real 31-way board
- Extensive balance policy and baseline auditing

## 0.4.0
- Rimward Redesign phase: modernized UI, Starmap, and Combat panes
- Full Storylet engine integration and interactive day lifecycle
- Fuel scarcity overhaul and economy/pacing tuning
- Prepared release checklist and demo builds

## 0.3.0
- Established headless engine core and monorepo scaffold
- Automated balance runner and CI integration
- Extracted the Rimward foundation from the original ruleset

## 0.2.0
- Terminal-only interactive playtest agent and UGT adaptations
- Introduced salvage system, full tribute paths, and early game alignment

## 0.1.0
- Faithful 1:1 recreation of the original 1991 BBS game
- Museum Edition quarantined as the historical reference baseline
