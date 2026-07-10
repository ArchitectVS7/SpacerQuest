-- AlterTable: Add per-system assets tracking (SP.VEST.S o3/o4 variables)
-- o3 = assetsHigh (10,000 cr units), o4 = assetsLow (remainder)
-- Used for hostile takeover cost calculation: y = o3*2 × 10,000 cr
ALTER TABLE "AllianceSystem" ADD COLUMN "assetsHigh" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AllianceSystem" ADD COLUMN "assetsLow" INTEGER NOT NULL DEFAULT 0;
