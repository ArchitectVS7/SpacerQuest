# SpacerQuest v4.0 — Open Items

**Updated:** March 17, 2026
**Consolidates:** Previous plan.md, DESIGN_REVIEW.md, PROJECT_STATUS.md

---

## Critical Bugs

| # | Item | Detail |
|---|------|--------|
| 1 | **BulletinPost field mismatch** | `bulletin-board.ts` screen reads `p.content` but Prisma schema field is `message`. Will crash at runtime when displaying posts. Fix: change screen to read `p.message`. |

---

## Missing Features (Planned, not yet implemented)

| # | Item | Source | Detail |
|---|------|--------|--------|
| 2 | **Same-alliance PvP protection** | plan.md §7.4 | Combat engage route (`combat.ts`) has no check preventing same-alliance members from fighting. ~5 lines needed. |
| 3 | **Bulletin board link in Spacers Hangout** | plan.md §6.4 | Alliance `(A)` menu shows recruitment only — no sub-option to access `(B)ulletin Board`. Screen exists but is unreachable from Hangout UI. |
| 4 | **Public news board in Hangout** | plan.md §6.3 | `(N)ews` option querying `GameLog` entries as BBS-style public posts. Not implemented. |

---

## Design Review Stretch Goals

| # | Item | Detail |
|---|------|--------|
| 5 | **NPC simulation system** | No persistent NPC characters exist. Background jobs operate on real player records only. Seeded NPC `Character` records (flagged `isNpc`) would make the world feel alive for solo play. |
| 6 | **NPC bulletin board posts** | Templated NPC-authored entries for alliance boards. |
| 7 | **Player-initiated alliance raids** | Background takeover job exists but players cannot manually initiate raids. Only DEFCON investment/weakening exists. |
| 8 | **CARRIER_LOSS jail trigger** | `CrimeType.CARRIER_LOSS = 6` exists in jail.ts but nothing sets it. Combat disconnect resolves server-side (by design — see DESIGN_REVIEW §5). Intentionally omitted per "DO NOT IMPLEMENT carrier-loss penalty" guidance. Confirm intent. |

---

## Production Readiness

| # | Item | Detail |
|---|------|--------|
| 9 | **OAuth production endpoints** | Mock OAuth works for dev. Real BBS Portal provider endpoints needed for production. Unused `passport`/`passport-oauth2` packages should be removed. |
| 10 | **Production deployment runbook** | Docker setup works, no ops guide for monitoring, backups, or scaling. |
