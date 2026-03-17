# SpacerQuest v4.0 — Open Items

**Updated:** March 17, 2026
**Consolidates:** Previous plan.md, DESIGN_REVIEW.md, PROJECT_STATUS.md

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
