-- CreateEnum
CREATE TYPE "Rank" AS ENUM ('LIEUTENANT', 'COMMANDER', 'CAPTAIN', 'COMMODORE', 'ADMIRAL', 'TOP_DOG', 'GRAND_MUFTI', 'MEGA_HERO', 'GIGA_HERO');

-- CreateEnum
CREATE TYPE "AllianceType" AS ENUM ('NONE', 'ASTRO_LEAGUE', 'SPACE_DRAGONS', 'WARLORD_CONFED', 'REBEL_ALLIANCE');

-- CreateEnum
CREATE TYPE "SystemType" AS ENUM ('CORE', 'RIM', 'ANDROMEDA', 'SPECIAL');

-- CreateEnum
CREATE TYPE "NpcType" AS ENUM ('PIRATE', 'PATROL', 'RIM_PIRATE', 'BRIGAND', 'REPTILOID');

-- CreateEnum
CREATE TYPE "BattleResult" AS ENUM ('VICTORY', 'DEFEAT', 'RETREAT', 'SURRENDER');

-- CreateEnum
CREATE TYPE "DuelStatus" AS ENUM ('PENDING', 'ACCEPTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LogType" AS ENUM ('VISITOR', 'BATTLE', 'TRADE', 'PORT_FEE', 'PROMOTION', 'ACHIEVEMENT', 'ALLIANCE', 'DUEL', 'MISSION', 'SYSTEM', 'RESCUE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "bbsUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "spacerId" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "shipName" TEXT,
    "allianceSymbol" "AllianceType" NOT NULL DEFAULT 'NONE',
    "creditsHigh" INTEGER NOT NULL DEFAULT 0,
    "creditsLow" INTEGER NOT NULL DEFAULT 1000,
    "bankHigh" INTEGER NOT NULL DEFAULT 0,
    "bankLow" INTEGER NOT NULL DEFAULT 0,
    "rank" "Rank" NOT NULL DEFAULT 'LIEUTENANT',
    "score" INTEGER NOT NULL DEFAULT 0,
    "promotions" INTEGER NOT NULL DEFAULT 0,
    "tripsCompleted" INTEGER NOT NULL DEFAULT 0,
    "astrecsTraveled" INTEGER NOT NULL DEFAULT 0,
    "cargoDelivered" INTEGER NOT NULL DEFAULT 0,
    "battlesWon" INTEGER NOT NULL DEFAULT 0,
    "battlesLost" INTEGER NOT NULL DEFAULT 0,
    "rescuesPerformed" INTEGER NOT NULL DEFAULT 0,
    "currentSystem" INTEGER NOT NULL DEFAULT 1,
    "tripCount" INTEGER NOT NULL DEFAULT 0,
    "lastTripDate" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "missionType" INTEGER NOT NULL DEFAULT 0,
    "cargoPods" INTEGER NOT NULL DEFAULT 0,
    "cargoType" INTEGER NOT NULL DEFAULT 0,
    "cargoPayment" INTEGER NOT NULL DEFAULT 0,
    "destination" INTEGER NOT NULL DEFAULT 0,
    "cargoManifest" TEXT,
    "isConqueror" BOOLEAN NOT NULL DEFAULT false,
    "isLost" BOOLEAN NOT NULL DEFAULT false,
    "lostLocation" INTEGER,
    "patrolSector" INTEGER,
    "crimeType" INTEGER,
    "sageVisited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ship" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "hullStrength" INTEGER NOT NULL DEFAULT 0,
    "hullCondition" INTEGER NOT NULL DEFAULT 0,
    "driveStrength" INTEGER NOT NULL DEFAULT 0,
    "driveCondition" INTEGER NOT NULL DEFAULT 0,
    "cabinStrength" INTEGER NOT NULL DEFAULT 0,
    "cabinCondition" INTEGER NOT NULL DEFAULT 0,
    "lifeSupportStrength" INTEGER NOT NULL DEFAULT 0,
    "lifeSupportCondition" INTEGER NOT NULL DEFAULT 0,
    "weaponStrength" INTEGER NOT NULL DEFAULT 0,
    "weaponCondition" INTEGER NOT NULL DEFAULT 0,
    "navigationStrength" INTEGER NOT NULL DEFAULT 0,
    "navigationCondition" INTEGER NOT NULL DEFAULT 0,
    "roboticsStrength" INTEGER NOT NULL DEFAULT 0,
    "roboticsCondition" INTEGER NOT NULL DEFAULT 0,
    "shieldStrength" INTEGER NOT NULL DEFAULT 0,
    "shieldCondition" INTEGER NOT NULL DEFAULT 0,
    "fuel" INTEGER NOT NULL DEFAULT 0,
    "cargoPods" INTEGER NOT NULL DEFAULT 0,
    "maxCargoPods" INTEGER NOT NULL DEFAULT 0,
    "hasCloaker" BOOLEAN NOT NULL DEFAULT false,
    "hasAutoRepair" BOOLEAN NOT NULL DEFAULT false,
    "hasStarBuster" BOOLEAN NOT NULL DEFAULT false,
    "hasArchAngel" BOOLEAN NOT NULL DEFAULT false,
    "isAstraxialHull" BOOLEAN NOT NULL DEFAULT false,
    "damageFlags" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortOwnership" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "systemId" INTEGER NOT NULL,
    "purchaseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fuelPrice" INTEGER NOT NULL DEFAULT 25,
    "fuelStored" INTEGER NOT NULL DEFAULT 3000,
    "fuelCapacity" INTEGER NOT NULL DEFAULT 20000,
    "bankCreditsHigh" INTEGER NOT NULL DEFAULT 0,
    "bankCreditsLow" INTEGER NOT NULL DEFAULT 0,
    "defconLevel" INTEGER NOT NULL DEFAULT 0,
    "dailyLandingFees" INTEGER NOT NULL DEFAULT 0,
    "dailyFuelSales" INTEGER NOT NULL DEFAULT 0,
    "lastFeeCollection" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortOwnership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllianceMembership" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "alliance" "AllianceType" NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creditsHigh" INTEGER NOT NULL DEFAULT 0,
    "creditsLow" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AllianceMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllianceSystem" (
    "id" TEXT NOT NULL,
    "systemId" INTEGER NOT NULL,
    "alliance" "AllianceType" NOT NULL,
    "ownerCharacterId" TEXT,
    "defconLevel" INTEGER NOT NULL DEFAULT 1,
    "lastTakeoverAttempt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AllianceSystem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StarSystem" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "coordinates" JSONB NOT NULL DEFAULT '{"x":0,"y":0,"z":0}',
    "type" "SystemType" NOT NULL DEFAULT 'CORE',
    "features" JSONB NOT NULL DEFAULT '{}',
    "portOwner" TEXT,
    "fuelPrice" INTEGER NOT NULL DEFAULT 25,
    "fuelStored" INTEGER NOT NULL DEFAULT 3000,
    "allianceControl" "AllianceType" NOT NULL DEFAULT 'NONE',
    "defconLevel" INTEGER NOT NULL DEFAULT 1,
    "visitCount" INTEGER NOT NULL DEFAULT 0,
    "lastActivity" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StarSystem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NpcRoster" (
    "id" TEXT NOT NULL,
    "type" "NpcType" NOT NULL,
    "shipClass" TEXT NOT NULL,
    "commander" TEXT NOT NULL,
    "shipName" TEXT NOT NULL,
    "homeSystem" TEXT NOT NULL,
    "alliance" "AllianceType" NOT NULL DEFAULT 'NONE',
    "rosterIndex" INTEGER NOT NULL,
    "creditValue" INTEGER NOT NULL,
    "fuelCapacity" INTEGER NOT NULL,
    "weaponStrength" INTEGER NOT NULL,
    "weaponCondition" INTEGER NOT NULL,
    "shieldStrength" INTEGER NOT NULL,
    "shieldCondition" INTEGER NOT NULL,
    "hullCondition" INTEGER NOT NULL,
    "lifeSupportCond" INTEGER NOT NULL,
    "driveStrength" INTEGER NOT NULL,
    "driveCondition" INTEGER NOT NULL,
    "hullStrength" INTEGER NOT NULL,
    "battlesLost" INTEGER NOT NULL DEFAULT 0,
    "battlesWon" INTEGER NOT NULL DEFAULT 0,
    "isOriginal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NpcRoster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BattleRecord" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "enemyType" TEXT NOT NULL,
    "enemyName" TEXT NOT NULL,
    "enemyClass" TEXT,
    "systemId" INTEGER NOT NULL,
    "npcRosterId" TEXT,
    "result" "BattleResult" NOT NULL,
    "rounds" INTEGER NOT NULL,
    "battleFactor" INTEGER NOT NULL,
    "lootCredits" INTEGER NOT NULL DEFAULT 0,
    "damageTaken" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BattleRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuelEntry" (
    "id" TEXT NOT NULL,
    "challengerId" TEXT NOT NULL,
    "contenderId" TEXT,
    "stakesType" TEXT NOT NULL,
    "stakesAmount" INTEGER NOT NULL,
    "arenaType" INTEGER NOT NULL,
    "handicap" INTEGER NOT NULL,
    "status" "DuelStatus" NOT NULL DEFAULT 'PENDING',
    "result" "BattleResult",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "DuelEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameLog" (
    "id" TEXT NOT NULL,
    "type" "LogType" NOT NULL,
    "characterId" TEXT,
    "systemId" INTEGER,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CombatSession" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "npcRosterId" TEXT,
    "playerWeaponPower" INTEGER NOT NULL,
    "playerShieldPower" INTEGER NOT NULL,
    "playerDrivePower" INTEGER NOT NULL,
    "playerBattleFactor" INTEGER NOT NULL,
    "enemyWeaponPower" INTEGER NOT NULL,
    "enemyShieldPower" INTEGER NOT NULL,
    "enemyDrivePower" INTEGER NOT NULL,
    "enemyBattleFactor" INTEGER NOT NULL,
    "enemyHullCondition" INTEGER NOT NULL DEFAULT 5,
    "currentRound" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "result" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CombatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BulletinPost" (
    "id" TEXT NOT NULL,
    "alliance" "AllianceType" NOT NULL,
    "authorName" TEXT NOT NULL,
    "characterId" TEXT,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BulletinPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelState" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "originSystem" INTEGER NOT NULL,
    "destinationSystem" INTEGER NOT NULL,
    "departureTime" TIMESTAMP(3) NOT NULL,
    "expectedArrival" TIMESTAMP(3) NOT NULL,
    "fuelReserved" INTEGER NOT NULL,
    "inTransit" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TravelState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_bbsUserId_key" ON "User"("bbsUserId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_bbsUserId_idx" ON "User"("bbsUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_token_idx" ON "Session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Character_spacerId_key" ON "Character"("spacerId");

-- CreateIndex
CREATE INDEX "Character_userId_idx" ON "Character"("userId");

-- CreateIndex
CREATE INDEX "Character_spacerId_idx" ON "Character"("spacerId");

-- CreateIndex
CREATE INDEX "Character_allianceSymbol_idx" ON "Character"("allianceSymbol");

-- CreateIndex
CREATE INDEX "Character_rank_idx" ON "Character"("rank");

-- CreateIndex
CREATE UNIQUE INDEX "Ship_characterId_key" ON "Ship"("characterId");

-- CreateIndex
CREATE INDEX "Ship_characterId_idx" ON "Ship"("characterId");

-- CreateIndex
CREATE UNIQUE INDEX "PortOwnership_characterId_key" ON "PortOwnership"("characterId");

-- CreateIndex
CREATE UNIQUE INDEX "PortOwnership_systemId_key" ON "PortOwnership"("systemId");

-- CreateIndex
CREATE INDEX "PortOwnership_systemId_idx" ON "PortOwnership"("systemId");

-- CreateIndex
CREATE INDEX "PortOwnership_characterId_idx" ON "PortOwnership"("characterId");

-- CreateIndex
CREATE UNIQUE INDEX "AllianceMembership_characterId_key" ON "AllianceMembership"("characterId");

-- CreateIndex
CREATE INDEX "AllianceMembership_alliance_idx" ON "AllianceMembership"("alliance");

-- CreateIndex
CREATE INDEX "AllianceMembership_characterId_idx" ON "AllianceMembership"("characterId");

-- CreateIndex
CREATE UNIQUE INDEX "AllianceSystem_systemId_key" ON "AllianceSystem"("systemId");

-- CreateIndex
CREATE INDEX "AllianceSystem_alliance_idx" ON "AllianceSystem"("alliance");

-- CreateIndex
CREATE INDEX "AllianceSystem_systemId_idx" ON "AllianceSystem"("systemId");

-- CreateIndex
CREATE UNIQUE INDEX "StarSystem_name_key" ON "StarSystem"("name");

-- CreateIndex
CREATE INDEX "StarSystem_type_idx" ON "StarSystem"("type");

-- CreateIndex
CREATE INDEX "NpcRoster_type_idx" ON "NpcRoster"("type");

-- CreateIndex
CREATE INDEX "NpcRoster_alliance_idx" ON "NpcRoster"("alliance");

-- CreateIndex
CREATE INDEX "NpcRoster_isOriginal_idx" ON "NpcRoster"("isOriginal");

-- CreateIndex
CREATE INDEX "BattleRecord_characterId_idx" ON "BattleRecord"("characterId");

-- CreateIndex
CREATE INDEX "BattleRecord_createdAt_idx" ON "BattleRecord"("createdAt");

-- CreateIndex
CREATE INDEX "BattleRecord_result_idx" ON "BattleRecord"("result");

-- CreateIndex
CREATE INDEX "BattleRecord_npcRosterId_idx" ON "BattleRecord"("npcRosterId");

-- CreateIndex
CREATE INDEX "DuelEntry_challengerId_idx" ON "DuelEntry"("challengerId");

-- CreateIndex
CREATE INDEX "DuelEntry_status_idx" ON "DuelEntry"("status");

-- CreateIndex
CREATE INDEX "DuelEntry_contenderId_idx" ON "DuelEntry"("contenderId");

-- CreateIndex
CREATE INDEX "GameLog_type_idx" ON "GameLog"("type");

-- CreateIndex
CREATE INDEX "GameLog_createdAt_idx" ON "GameLog"("createdAt");

-- CreateIndex
CREATE INDEX "GameLog_characterId_idx" ON "GameLog"("characterId");

-- CreateIndex
CREATE UNIQUE INDEX "CombatSession_characterId_key" ON "CombatSession"("characterId");

-- CreateIndex
CREATE INDEX "CombatSession_characterId_idx" ON "CombatSession"("characterId");

-- CreateIndex
CREATE INDEX "CombatSession_active_idx" ON "CombatSession"("active");

-- CreateIndex
CREATE INDEX "CombatSession_npcRosterId_idx" ON "CombatSession"("npcRosterId");

-- CreateIndex
CREATE INDEX "BulletinPost_alliance_idx" ON "BulletinPost"("alliance");

-- CreateIndex
CREATE INDEX "BulletinPost_createdAt_idx" ON "BulletinPost"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TravelState_characterId_key" ON "TravelState"("characterId");

-- CreateIndex
CREATE INDEX "TravelState_characterId_idx" ON "TravelState"("characterId");

-- CreateIndex
CREATE INDEX "TravelState_inTransit_idx" ON "TravelState"("inTransit");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ship" ADD CONSTRAINT "Ship_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortOwnership" ADD CONSTRAINT "PortOwnership_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllianceMembership" ADD CONSTRAINT "AllianceMembership_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BattleRecord" ADD CONSTRAINT "BattleRecord_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BattleRecord" ADD CONSTRAINT "BattleRecord_npcRosterId_fkey" FOREIGN KEY ("npcRosterId") REFERENCES "NpcRoster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuelEntry" ADD CONSTRAINT "DuelEntry_challengerId_fkey" FOREIGN KEY ("challengerId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuelEntry" ADD CONSTRAINT "DuelEntry_contenderId_fkey" FOREIGN KEY ("contenderId") REFERENCES "Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameLog" ADD CONSTRAINT "GameLog_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CombatSession" ADD CONSTRAINT "CombatSession_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CombatSession" ADD CONSTRAINT "CombatSession_npcRosterId_fkey" FOREIGN KEY ("npcRosterId") REFERENCES "NpcRoster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelState" ADD CONSTRAINT "TravelState_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

