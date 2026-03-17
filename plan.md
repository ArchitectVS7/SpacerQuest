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
| 4 | ~~**Public news board in Hangout**~~ | plan.md §6.3 | **DONE.** `(N)ews` option added to Spacers Hangout. New `space-news` screen displays GameLog entries in BBS-style format matching original SP.TOP.S filer routine (Battle Log, Alliance Transactions, All News categories). |

---

## Design Review Stretch Goals

| # | Item | Detail |
|---|------|--------|
| 5 | ~~**NPC encounter roster (original fidelity)**~~ | **DONE.** Added `NpcRoster` Prisma model with all original BASIC variable mappings. Seeded all 65 original NPCs (9 pirates, 11 patrols, 21 rim pirates, 12 brigands, 12 reptiloids). Rewrote `generateEncounter()` from sync random generation to async DB-backed roster lookup. Added `isNpcFriendly()` for same-alliance greeting check. Updated combat/economy routes and integration tests. |
| 6 | ~~**NPC bulletin board posts**~~ | **DONE.** Added `generateNpcBulletinPosts()` to bulletin-board system with 10 templates adapted from original SP.VEST.S news entries (acquisition, DEFCON, withdrawal, deposit, takeover reports). Integrated into daily tick job. Allied NPCs from the roster post templated messages to their alliance boards. |
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
