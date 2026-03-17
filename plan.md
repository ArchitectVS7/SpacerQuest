# SpacerQuest v4.0 — Open Items

**Updated:** March 17, 2026
**Consolidates:** Previous plan.md, DESIGN_REVIEW.md, PROJECT_STATUS.md

---

## Critical Bugs

| # | Item | Detail |
|---|------|--------|
| 1 | ~~**BulletinPost field mismatch**~~ | **DONE.** Fixed in prior commit — screen now reads `p.message` matching Prisma schema. |

---

## Missing Features (Planned, not yet implemented)

| # | Item | Source | Detail |
|---|------|--------|--------|
| 2 | ~~**Same-alliance PvP protection**~~ | plan.md §7.4 | **DONE.** Added to duel challenge and accept routes in `social.ts`. PvP lives in the duel system, not `combat.ts` (which is PvE encounter generation). |
| 3 | ~~**Bulletin board link in Spacers Hangout**~~ | plan.md §6.4 | **DONE.** `(B)ulletin Board` option added to Alliance `(A)` sub-menu in `spacers-hangout.ts`. |
| 4 | **Public news board in Hangout** | plan.md §6.3 | `(N)ews` option querying `GameLog` entries as BBS-style public posts. Not implemented. |

---

## Design Review Stretch Goals

| # | Item | Detail |
|---|------|--------|
| 5 | **NPC encounter roster (original fidelity)** | Current `generateEncounter()` creates ephemeral random stat blocks. The original game used a **persistent NPC roster** (~65 NPCs across 5 data files: PIRATES, SP.PAT, SP.RIMPIR, SP.BRIGAND, SP.REPTILE). NPCs were selected randomly from the roster, had alliance affiliations, and their battle stats persisted after combat. **Agreed approach:** Seed the original roster and rework encounter generation to select from it, matching the original's `position #1,256,po` lookup pattern. Add a generation system to expand the roster over time. NPCs do **not** get full Character records at this stage — they remain a separate lightweight model. |
| 6 | **NPC bulletin board posts** | Templated NPC-authored entries for alliance boards. |
| 7 | **Player-initiated alliance raids** | Background takeover job exists but players cannot manually initiate raids. Only DEFCON investment/weakening exists. |
| 8 | **CARRIER_LOSS jail trigger** | `CrimeType.CARRIER_LOSS = 6` exists in jail.ts but nothing sets it. Combat disconnect resolves server-side (by design — see DESIGN_REVIEW §5). Intentionally omitted per "DO NOT IMPLEMENT carrier-loss penalty" guidance. Confirm intent. |

---

## Production Readiness

| # | Item | Detail |
|---|------|--------|
| 9 | **OAuth production endpoints** | Mock OAuth works for dev. Real BBS Portal provider endpoints needed for production. Unused `passport`/`passport-oauth2` packages should be removed. |
| 10 | **Production deployment runbook** | Docker setup works, no ops guide for monitoring, backups, or scaling. |

---

## Future Mods

Items below are deferred design work — beyond the original game's scope but of interest for the project's evolution.

| # | Item | Detail |
|---|------|--------|
| 11 | **Bot players (full Character records for NPCs)** | Promote NPCs from the lightweight encounter roster to full `Character` records (flagged `isNpc`). This would allow NPCs to appear in leaderboards, own ports, accumulate score, hold alliance memberships as first-class members, and participate in all systems that real players do. Design step: define which Character fields are meaningful for bots, how bot "sessions" are simulated, and how bot density scales with real player count. |
| 12 | **NPC alliance distribution tuning** | The original roster's alliance distribution is preserved as-is for now. A future pass could rebalance NPC alliance membership to create intentional faction asymmetry — e.g., more Warlord NPCs in rim systems, more Patrol in core systems — to give each region a distinct factional character. |
| 13 | **NPC life simulation** | The original game only persisted NPC battle stats. A richer simulation could have NPCs travel between systems, trade cargo, earn promotions, post on bulletin boards, and accumulate wealth — making the world feel populated even with few real players. Scope and tick frequency TBD. Depends on item 11 (bot players). |
