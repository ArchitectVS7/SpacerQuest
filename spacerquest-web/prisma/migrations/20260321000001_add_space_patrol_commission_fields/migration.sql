-- Space Patrol HQ commission state (SP.REG.S patrol subroutine)
-- cs: patrol oath taken flag
-- wb: within-mission battles won counter
-- lb: within-mission battles lost counter

ALTER TABLE "Character" ADD COLUMN "hasPatrolCommission" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Character" ADD COLUMN "patrolBattlesWon" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Character" ADD COLUMN "patrolBattlesLost" INTEGER NOT NULL DEFAULT 0;
