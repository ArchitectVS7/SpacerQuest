-- AlterTable: Add WOF daily win tracking fields (SP.GAME.S lines 47, 53)
-- uh = wofWinsToday (daily win count), ui = 12 (WOF_DAILY_WIN_CAP constant)
ALTER TABLE "Character" ADD COLUMN "wofWinsToday" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Character" ADD COLUMN "wofWinsDate" TEXT;
