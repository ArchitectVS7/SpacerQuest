# Foundation — What Rimward Inherits

The curated extraction from 35 years of Spacer Quest: the balance mathematics,
the character roster, and the lore bible. This directory is a **specification,
not a library** — the TypeScript files are reference implementations lifted
verbatim from the Museum Edition (`legacy/spacerquest-web/`) and are not meant
to compile standalone (some import Prisma or app modules). Their value is the
formulas, tables, and comments, which cite the 1991 source line-by-line.

When the new game implements a system, this is the authority on how the
original computed it — and the starting point for deliberately diverging.

## `rules/` — balance formulas and tables

| File | Origin | What's in it |
|---|---|---|
| `constants.ts` | `src/game/constants.ts` | The single balance authority: 469 lines of tuned constants — cargo types and rates, all 28 star system names, fuel buy/sell prices per system, rank thresholds, upgrade prices, combat limits, alliance symbols. Every value cites its 1991 source line. |
| `economy.ts` | `src/game/systems/economy.ts` | The trading engine: daily 4-offer manifest board generation, distance-scaled delivery bonuses, wrong-destination penalties, fuel arbitrage, smuggling contracts, port ownership. The strongest system in the original — Rimward's manifest board descends directly from this. |
| `combat.ts` | `src/game/systems/combat.ts` | Encounter matchmaking bands, per-round Battle Factor from component strength×condition, tribute escalation, surrender/retreat paths, the fuel-per-attack cost and malfunction gate (the mechanic UGT playtesting identified as the game's most interesting tension — promoted to a design pillar in Rimward). |
| `travel.ts` | `src/game/systems/travel.ts` | Fuel cost as f(hull, distance), course-change costs, navigation checks, hazard checkpoints. |
| `upgrades.ts` | `src/game/systems/upgrades.ts` | The 8-component ship model, tiered shipyard pricing, the Roscoe strength push, the 7 special-equipment items and their mutual-exclusion rules. |
| `utils.ts` | `src/game/utils.ts` | Shared math the above depend on (distance, component power, probability rolls, credit handling). |
| `schema.prisma` | `prisma/schema.prisma` | The data model: Character, the 8 ship components as strength/condition pairs, and the canonical enums (Rank, AllianceType, BattleResult). |

## `cast/` — the characters

| File | Origin | What's in it |
|---|---|---|
| `profiles.ts` | `src/bots/profiles.ts` | The 20 simulated-player personalities (Silk Dagger, Cargo King, Rattlesnake, Doc Salvage, Wild Card, Stellar Monk...) with ships, and aggression/caution/greed decision biases. These are the founding cast of Rimward's d20 NPC roster — the biases are the embryo of the Ideal/Bond/Flaw system. |
| `types.ts` | `src/bots/types.ts` | The BotProfile shape the profiles conform to. |
| `npc-roster.seed.ts` | `prisma/seed.ts` | The world seed: all 28 star systems with coordinates, and the original's full 65-NPC combat roster (pirates, patrols, rim pirates, brigands, Reptiloids) with stat blocks — raw material for Rimward's five power tiers. |

## `lore/` — the bible

| File | What's in it |
|---|---|
| `PRD.md` | The Museum Edition's master spec — §5 is the reverse-engineered 1991 rules bible, the deepest single record of how the original worked. |
| `User-Manual.md` | The in-character reproduction of the 1991 player manual: onboarding, every feature, strategy notes, the rank ladder, the 65-NPC roster, command reference. Best source for the original's *voice*. |
| `GAME-ACTIONS.md` | All 188 catalogued player actions — the complete verb list of the original game. |
| `ARENA_DESIGN.md` | Design analysis of the original's asynchronous PvP arena (post your ship, rivals fight it while you're away). Parked for a future Rimward Season — do not lose this. |

## What was deliberately NOT extracted

The 54 terminal screens (`screens/`, ~13.6k lines), the socket/screen router,
the server/API layer, the daily-tick jobs, and the alliance/gambling/jail
mini-screens. Their game rules are already captured in `lore/PRD.md` §5 and
`lore/GAME-ACTIONS.md`; their implementations are BBS control flow that
Rimward exists to replace. If a rule turns out to live only in a screen file,
recover it from `legacy/spacerquest-web/src/game/screens/` and record it here.
