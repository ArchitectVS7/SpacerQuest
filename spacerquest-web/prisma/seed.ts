/**
 * SpacerQuest v4.0 - Database Seed Script
 * Populates the database with all star systems and initial configuration
 */

import { PrismaClient, SystemType, AllianceType, NpcType } from '@prisma/client';

const prisma = new PrismaClient();

// All 28 Star Systems from original SpacerQuest v3.4
const STAR_SYSTEMS = [
  // Core Systems (1-14) - Milky Way
  { id: 1, name: 'Sun-3', type: 'CORE', x: 0, y: 0, z: 0, features: { fuelPrice: 8 } },
  { id: 2, name: 'Aldebaran-1', type: 'CORE', x: 1, y: 0, z: 0, features: {} },
  { id: 3, name: 'Altair-3', type: 'CORE', x: 2, y: 0, z: 0, features: {} },
  { id: 4, name: 'Arcturus-6', type: 'CORE', x: 3, y: 0, z: 0, features: {} },
  { id: 5, name: 'Deneb-4', type: 'CORE', x: 4, y: 0, z: 0, features: {} },
  { id: 6, name: 'Denebola-5', type: 'CORE', x: 5, y: 0, z: 0, features: {} },
  { id: 7, name: 'Fomalhaut-2', type: 'CORE', x: 6, y: 0, z: 0, features: {} },
  { id: 8, name: 'Mira-9', type: 'CORE', x: 7, y: 0, z: 0, features: { fuelPrice: 4 } },
  { id: 9, name: 'Pollux-7', type: 'CORE', x: 8, y: 0, z: 0, features: {} },
  { id: 10, name: 'Procyon-5', type: 'CORE', x: 9, y: 0, z: 0, features: {} },
  { id: 11, name: 'Regulus-6', type: 'CORE', x: 10, y: 0, z: 0, features: {} },
  { id: 12, name: 'Rigel-8', type: 'CORE', x: 11, y: 0, z: 0, features: {} },
  { id: 13, name: 'Spica-3', type: 'CORE', x: 12, y: 0, z: 0, features: {} },
  { id: 14, name: 'Vega-6', type: 'CORE', x: 13, y: 0, z: 0, features: { fuelPrice: 6, malignaAccess: true } },
  
  // Rim Stars (15-20)
  { id: 15, name: 'Antares-5', type: 'RIM', x: 14, y: 0, z: 0, features: { shieldRepair: true } },
  { id: 16, name: 'Capella-4', type: 'RIM', x: 15, y: 0, z: 0, features: { gemBonus: true } },
  { id: 17, name: 'Polaris-1', type: 'RIM', x: 16, y: 0, z: 0, features: { wiseOne: true } },
  { id: 18, name: 'Mizar-9', type: 'RIM', x: 17, y: 0, z: 0, features: { sage: true } },
  { id: 19, name: 'Achernar-5', type: 'RIM', x: 18, y: 0, z: 0, features: { navRepair: true } },
  { id: 20, name: 'Algol-2', type: 'RIM', x: 19, y: 0, z: 0, features: { noRepairs: true } },
  
  // Andromeda Galaxy (21-26) - Access via black hole
  { id: 21, name: 'NGC-44', type: 'ANDROMEDA', x: 44, y: 22, z: 0, features: { cargo: 'Dragonium Ore', cargoValue: 1000 } },
  { id: 22, name: 'NGC-55', type: 'ANDROMEDA', x: 55, y: 33, z: 11, features: { cargo: 'Merusian Liquor', cargoValue: 4000 } },
  { id: 23, name: 'NGC-66', type: 'ANDROMEDA', x: 66, y: 44, z: 22, features: { cargo: 'Mystium Ore', cargoValue: 3000 } },
  { id: 24, name: 'NGC-77', type: 'ANDROMEDA', x: 77, y: 55, z: 33, features: { cargo: 'Oreganol Herbs', cargoValue: 2000 } },
  { id: 25, name: 'NGC-88', type: 'ANDROMEDA', x: 88, y: 66, z: 44, features: { cargo: 'Sonolide Crystal', cargoValue: 5000 } },
  { id: 26, name: 'NGC-99', type: 'ANDROMEDA', x: 99, y: 77, z: 55, features: { cargo: 'Infernum Spice', cargoValue: 6000 } },
  
  // Special Locations (27-28)
  { id: 27, name: 'MALIGNA', type: 'SPECIAL', x: 13, y: 33, z: 99, features: { rogueStar: true, mission: 'MALIGNA_ABLATION' } },
  { id: 28, name: 'NEMESIS', type: 'SPECIAL', x: 0, y: 0, z: 0, features: { starJewels: true, mission: 'NEMESIS_RETRIEVAL' } },
];

// Original NPC Roster from SpacerQuest v3.4 data files
// Field mapping from SP.FIGHT1.S: input #1,p3$\p4$\p5$\p6$\p7$
//   then: input #1,p3,p4,p5,p6,p7,p8,s7,s8,p9,s9,bl,bw,s3,s4,s5
// p3$=shipClass, p4$=commander, p5$=shipName, p7$=homeSystem
// p3=homeSystemId, p4=rosterIndex, p5=creditValue, p6=fuelCapacity
// p7=weaponStr, p8=weaponCond, s7=shieldStr, s8=shieldCond
// p9=hullCond, s9=lifeSupportCond, bl=battlesLost, bw=battlesWon
// s3=driveStr, s4=driveCond, s5=hullStr

interface NpcSeedData {
  type: NpcType;
  shipClass: string;
  commander: string;
  shipName: string;
  homeSystem: string;
  alliance: AllianceType;
  rosterIndex: number;
  creditValue: number;
  fuelCapacity: number;
  weaponStrength: number;
  weaponCondition: number;
  shieldStrength: number;
  shieldCondition: number;
  hullCondition: number;
  lifeSupportCond: number;
  driveStrength: number;
  driveCondition: number;
  hullStrength: number;
}

// PIRATES file (9 core pirates) - encountered during cargo runs (kk=1)
// These start as "Junk" class derelicts; SP.PATPIR transforms them into
// Maligna-class ships with stats based on their K-number prefix.
// Original values from SP.PATPIR.S:71-79
const PIRATES: NpcSeedData[] = [
  { type: 'PIRATE' as NpcType, shipClass: 'Maligna Bat', commander: 'K)(akj', shipName: 'K1++++', homeSystem: 'Pollux-7', alliance: 'ASTRO_LEAGUE' as AllianceType, rosterIndex: 1, creditValue: 500, fuelCapacity: 70, weaponStrength: 14, weaponCondition: 9, shieldStrength: 16, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 20, driveCondition: 9, hullStrength: 16 },
  { type: 'PIRATE' as NpcType, shipClass: 'Maligna Cat', commander: 'K)(ych', shipName: 'K2@@@@', homeSystem: 'Denebola-5', alliance: 'SPACE_DRAGONS' as AllianceType, rosterIndex: 2, creditValue: 500, fuelCapacity: 80, weaponStrength: 16, weaponCondition: 9, shieldStrength: 18, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 17, driveCondition: 9, hullStrength: 17 },
  { type: 'PIRATE' as NpcType, shipClass: 'Maligna Rat', commander: 'K)(sfy', shipName: 'K3####', homeSystem: 'Denebola-5', alliance: 'NONE' as AllianceType, rosterIndex: 3, creditValue: 500, fuelCapacity: 90, weaponStrength: 18, weaponCondition: 9, shieldStrength: 20, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 18, driveCondition: 9, hullStrength: 18 },
  { type: 'PIRATE' as NpcType, shipClass: 'Maligna Tat', commander: 'K)(sdf', shipName: 'K4$$$$', homeSystem: 'Aldebaran-1', alliance: 'NONE' as AllianceType, rosterIndex: 4, creditValue: 500, fuelCapacity: 95, weaponStrength: 22, weaponCondition: 9, shieldStrength: 22, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 19, driveCondition: 9, hullStrength: 19 },
  { type: 'PIRATE' as NpcType, shipClass: 'Maligna Vat', commander: 'K)(ssf', shipName: 'K5%%%%', homeSystem: 'Altair-3', alliance: 'NONE' as AllianceType, rosterIndex: 5, creditValue: 500, fuelCapacity: 120, weaponStrength: 24, weaponCondition: 9, shieldStrength: 24, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 20, driveCondition: 9, hullStrength: 20 },
  { type: 'PIRATE' as NpcType, shipClass: 'Maligna Wat', commander: 'K)(dfy', shipName: 'K6^^^^', homeSystem: 'Altair-3', alliance: 'REBEL_ALLIANCE' as AllianceType, rosterIndex: 6, creditValue: 500, fuelCapacity: 130, weaponStrength: 26, weaponCondition: 9, shieldStrength: 26, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 22, driveCondition: 9, hullStrength: 21 },
  { type: 'PIRATE' as NpcType, shipClass: 'Maligna Xat', commander: 'K)(dsh', shipName: 'K7&&&&', homeSystem: 'Pollux-7', alliance: 'WARLORD_CONFED' as AllianceType, rosterIndex: 7, creditValue: 500, fuelCapacity: 140, weaponStrength: 28, weaponCondition: 9, shieldStrength: 28, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 24, driveCondition: 9, hullStrength: 20 },
  { type: 'PIRATE' as NpcType, shipClass: 'Maligna Yat', commander: 'K)(ech', shipName: 'K8****', homeSystem: 'Aldebaran-1', alliance: 'NONE' as AllianceType, rosterIndex: 8, creditValue: 500, fuelCapacity: 150, weaponStrength: 30, weaponCondition: 9, shieldStrength: 30, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 26, driveCondition: 9, hullStrength: 20 },
  { type: 'PIRATE' as NpcType, shipClass: 'Maligna Zat', commander: 'K)(chy', shipName: 'K9((((', homeSystem: 'Denebola-5', alliance: 'NONE' as AllianceType, rosterIndex: 9, creditValue: 500, fuelCapacity: 160, weaponStrength: 32, weaponCondition: 9, shieldStrength: 32, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 30, driveCondition: 9, hullStrength: 22 },
];

// SP.PAT file (11 patrol ships) - encountered during patrol/raid/smuggling missions
// SP.PATPIR.S:93-103 transforms these based on SP-number prefix
const PATROL: NpcSeedData[] = [
  { type: 'PATROL' as NpcType, shipClass: 'SLOOP', commander: 'Lt.Savage', shipName: 'SP1.Thor', homeSystem: 'Procyon-5', alliance: 'NONE' as AllianceType, rosterIndex: 1, creditValue: 500, fuelCapacity: 80, weaponStrength: 16, weaponCondition: 9, shieldStrength: 15, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 20, driveCondition: 9, hullStrength: 16 },
  { type: 'PATROL' as NpcType, shipClass: 'CUTTER', commander: 'Cmdr.Strong', shipName: 'SP2.Hercules', homeSystem: 'Mira-9', alliance: 'NONE' as AllianceType, rosterIndex: 2, creditValue: 500, fuelCapacity: 90, weaponStrength: 18, weaponCondition: 9, shieldStrength: 17, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 18, driveCondition: 9, hullStrength: 17 },
  { type: 'PATROL' as NpcType, shipClass: 'BARK', commander: 'Como.Brainerd', shipName: 'SP3.Fearless', homeSystem: 'Fomalhaut-2', alliance: 'NONE' as AllianceType, rosterIndex: 3, creditValue: 500, fuelCapacity: 100, weaponStrength: 20, weaponCondition: 9, shieldStrength: 19, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 16, driveCondition: 9, hullStrength: 18 },
  { type: 'PATROL' as NpcType, shipClass: 'BRIGANTINE', commander: 'Capt.Brutus', shipName: 'SP4.Darkover', homeSystem: 'Procyon-5', alliance: 'NONE' as AllianceType, rosterIndex: 4, creditValue: 500, fuelCapacity: 110, weaponStrength: 22, weaponCondition: 9, shieldStrength: 21, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 19, driveCondition: 9, hullStrength: 19 },
  { type: 'PATROL' as NpcType, shipClass: 'CORVETTE', commander: 'Capt.Armand', shipName: 'SP5.Courageous', homeSystem: 'Regulus-6', alliance: 'NONE' as AllianceType, rosterIndex: 5, creditValue: 500, fuelCapacity: 120, weaponStrength: 24, weaponCondition: 9, shieldStrength: 23, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 20, driveCondition: 9, hullStrength: 20 },
  { type: 'PATROL' as NpcType, shipClass: 'DESTROYER', commander: 'Capt.Bouchet', shipName: 'SP6.Firedrake', homeSystem: 'Pollux-7', alliance: 'NONE' as AllianceType, rosterIndex: 6, creditValue: 500, fuelCapacity: 130, weaponStrength: 26, weaponCondition: 9, shieldStrength: 25, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 22, driveCondition: 9, hullStrength: 21 },
  { type: 'PATROL' as NpcType, shipClass: 'CRUISER', commander: 'Capt.Brax', shipName: 'SP7.Victorious', homeSystem: 'Procyon-5', alliance: 'NONE' as AllianceType, rosterIndex: 7, creditValue: 500, fuelCapacity: 140, weaponStrength: 28, weaponCondition: 9, shieldStrength: 27, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 24, driveCondition: 9, hullStrength: 20 },
  { type: 'PATROL' as NpcType, shipClass: 'FRIGATE', commander: 'Adm.Wong', shipName: 'SP8.Meritorious', homeSystem: 'Deneb-4', alliance: 'NONE' as AllianceType, rosterIndex: 8, creditValue: 500, fuelCapacity: 160, weaponStrength: 32, weaponCondition: 9, shieldStrength: 29, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 26, driveCondition: 9, hullStrength: 20 },
  { type: 'PATROL' as NpcType, shipClass: 'BATTLESHIP', commander: 'Adm.Hutchins', shipName: 'SP9.Incredible', homeSystem: 'Aldebaran-1', alliance: 'NONE' as AllianceType, rosterIndex: 9, creditValue: 500, fuelCapacity: 200, weaponStrength: 40, weaponCondition: 9, shieldStrength: 31, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 30, driveCondition: 9, hullStrength: 22 },
  { type: 'PATROL' as NpcType, shipClass: 'DEATHSTAR', commander: 'Adm.Bruiser', shipName: 'SPX.Inferno', homeSystem: 'Arcturus-6', alliance: 'NONE' as AllianceType, rosterIndex: 10, creditValue: 1000, fuelCapacity: 275, weaponStrength: 55, weaponCondition: 9, shieldStrength: 50, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 40, driveCondition: 9, hullStrength: 24 },
  { type: 'PATROL' as NpcType, shipClass: 'INFINITY', commander: 'Adm.Borgia', shipName: 'SPZ.Infinity', homeSystem: 'Altair-3', alliance: 'NONE' as AllianceType, rosterIndex: 11, creditValue: 1000, fuelCapacity: 325, weaponStrength: 65, weaponCondition: 9, shieldStrength: 60, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 50, driveCondition: 9, hullStrength: 30 },
];

// SP.RIMPIR file (21 rim pirates) - encountered in Rim Stars (systems 15-20)
const RIM_PIRATES: NpcSeedData[] = [
  { type: 'RIM_PIRATE' as NpcType, shipClass: 'Sailfish', commander: 'RP-Black Bart', shipName: 'Gypsy Lee', homeSystem: 'Antares-5', alliance: 'NONE' as AllianceType, rosterIndex: 1, creditValue: 2000, fuelCapacity: 150, weaponStrength: 20, weaponCondition: 9, shieldStrength: 20, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 20, driveCondition: 9, hullStrength: 20 },
  { type: 'RIM_PIRATE' as NpcType, shipClass: 'Swordfish', commander: 'RP-Blackbeard', shipName: 'Buccaneer', homeSystem: 'Capella-4', alliance: 'NONE' as AllianceType, rosterIndex: 2, creditValue: 2200, fuelCapacity: 165, weaponStrength: 22, weaponCondition: 9, shieldStrength: 22, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 22, driveCondition: 9, hullStrength: 22 },
  { type: 'RIM_PIRATE' as NpcType, shipClass: 'Barracuda', commander: 'RP-Anne Bonny', shipName: 'Red Witch', homeSystem: 'Polaris-1', alliance: 'NONE' as AllianceType, rosterIndex: 3, creditValue: 2800, fuelCapacity: 210, weaponStrength: 28, weaponCondition: 9, shieldStrength: 28, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 28, driveCondition: 9, hullStrength: 20 },
  { type: 'RIM_PIRATE' as NpcType, shipClass: 'Hammerhead', commander: 'RP-Mary Read', shipName: 'Sea Witch', homeSystem: 'Mizar-9', alliance: 'NONE' as AllianceType, rosterIndex: 4, creditValue: 3200, fuelCapacity: 240, weaponStrength: 32, weaponCondition: 9, shieldStrength: 32, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 32, driveCondition: 9, hullStrength: 20 },
  { type: 'RIM_PIRATE' as NpcType, shipClass: 'Moray', commander: 'RP-Long Ben', shipName: 'Marauder', homeSystem: 'Achernar-5', alliance: 'NONE' as AllianceType, rosterIndex: 5, creditValue: 3800, fuelCapacity: 280, weaponStrength: 38, weaponCondition: 9, shieldStrength: 38, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 38, driveCondition: 9, hullStrength: 20 },
  { type: 'RIM_PIRATE' as NpcType, shipClass: 'Moray', commander: 'RP-Henry Morgan', shipName: 'Rascal', homeSystem: 'Algol-2', alliance: 'NONE' as AllianceType, rosterIndex: 6, creditValue: 4200, fuelCapacity: 320, weaponStrength: 42, weaponCondition: 9, shieldStrength: 42, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 42, driveCondition: 9, hullStrength: 20 },
  { type: 'RIM_PIRATE' as NpcType, shipClass: 'Mako', commander: 'RP-Piet Nym', shipName: 'Golden Fleece', homeSystem: 'Antares-5', alliance: 'NONE' as AllianceType, rosterIndex: 7, creditValue: 4800, fuelCapacity: 360, weaponStrength: 48, weaponCondition: 9, shieldStrength: 48, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 48, driveCondition: 9, hullStrength: 20 },
  { type: 'RIM_PIRATE' as NpcType, shipClass: 'Thresher', commander: 'RP-Long J.Silver', shipName: 'Golden Hiney', homeSystem: 'Capella-4', alliance: 'NONE' as AllianceType, rosterIndex: 8, creditValue: 5200, fuelCapacity: 390, weaponStrength: 52, weaponCondition: 9, shieldStrength: 52, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 52, driveCondition: 9, hullStrength: 20 },
  { type: 'RIM_PIRATE' as NpcType, shipClass: 'Marlin', commander: 'RP-Peg-Leg Smith', shipName: 'She Devil', homeSystem: 'Polaris-1', alliance: 'NONE' as AllianceType, rosterIndex: 9, creditValue: 5800, fuelCapacity: 440, weaponStrength: 58, weaponCondition: 9, shieldStrength: 58, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 58, driveCondition: 9, hullStrength: 20 },
  { type: 'RIM_PIRATE' as NpcType, shipClass: 'Orca', commander: "RP-Cap'n Jack", shipName: 'Fancy Dancy', homeSystem: 'Mizar-9', alliance: 'NONE' as AllianceType, rosterIndex: 10, creditValue: 6200, fuelCapacity: 470, weaponStrength: 62, weaponCondition: 9, shieldStrength: 62, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 62, driveCondition: 9, hullStrength: 20 },
  { type: 'RIM_PIRATE' as NpcType, shipClass: 'Manta', commander: 'RP-Lord Tim', shipName: 'Fauntleroy', homeSystem: 'Achernar-5', alliance: 'NONE' as AllianceType, rosterIndex: 11, creditValue: 6800, fuelCapacity: 510, weaponStrength: 68, weaponCondition: 9, shieldStrength: 68, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 68, driveCondition: 9, hullStrength: 20 },
  { type: 'RIM_PIRATE' as NpcType, shipClass: 'Giant Squid', commander: "RP-Cap'n Ahab", shipName: 'Moby Dick', homeSystem: 'Algol-2', alliance: 'NONE' as AllianceType, rosterIndex: 12, creditValue: 7200, fuelCapacity: 540, weaponStrength: 72, weaponCondition: 9, shieldStrength: 72, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 72, driveCondition: 9, hullStrength: 20 },
  { type: 'RIM_PIRATE' as NpcType, shipClass: 'Halibut', commander: 'RP-Dirty Jack', shipName: 'Brass Tack', homeSystem: 'Antares-5', alliance: 'NONE' as AllianceType, rosterIndex: 13, creditValue: 7400, fuelCapacity: 600, weaponStrength: 78, weaponCondition: 9, shieldStrength: 78, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 78, driveCondition: 9, hullStrength: 20 },
  { type: 'RIM_PIRATE' as NpcType, shipClass: 'Flounder', commander: 'RP-Good John', shipName: 'Coppersides', homeSystem: 'Capella-4', alliance: 'NONE' as AllianceType, rosterIndex: 14, creditValue: 7600, fuelCapacity: 620, weaponStrength: 82, weaponCondition: 9, shieldStrength: 82, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 82, driveCondition: 9, hullStrength: 20 },
  { type: 'RIM_PIRATE' as NpcType, shipClass: 'Sea Bass', commander: 'RP-Messy Frank', shipName: 'Silversides', homeSystem: 'Polaris-1', alliance: 'NONE' as AllianceType, rosterIndex: 15, creditValue: 7800, fuelCapacity: 660, weaponStrength: 88, weaponCondition: 9, shieldStrength: 88, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 88, driveCondition: 9, hullStrength: 20 },
  { type: 'RIM_PIRATE' as NpcType, shipClass: 'Lionfish', commander: 'RP-Farragut', shipName: 'Lady Luck', homeSystem: 'Mizar-9', alliance: 'NONE' as AllianceType, rosterIndex: 16, creditValue: 8000, fuelCapacity: 690, weaponStrength: 92, weaponCondition: 9, shieldStrength: 92, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 92, driveCondition: 9, hullStrength: 20 },
  { type: 'RIM_PIRATE' as NpcType, shipClass: 'Tetrapod', commander: 'RP-Van Mere', shipName: "Witch's Brew", homeSystem: 'Achernar-5', alliance: 'NONE' as AllianceType, rosterIndex: 17, creditValue: 8600, fuelCapacity: 740, weaponStrength: 98, weaponCondition: 9, shieldStrength: 98, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 98, driveCondition: 9, hullStrength: 20 },
  { type: 'RIM_PIRATE' as NpcType, shipClass: 'Gastropod', commander: 'RP-Van Slab', shipName: "Devil's Spout", homeSystem: 'Algol-2', alliance: 'NONE' as AllianceType, rosterIndex: 18, creditValue: 9000, fuelCapacity: 770, weaponStrength: 102, weaponCondition: 9, shieldStrength: 102, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 102, driveCondition: 9, hullStrength: 20 },
  { type: 'RIM_PIRATE' as NpcType, shipClass: 'Euchuroidea', commander: 'RP-Innkeeper', shipName: 'Purple Smaze', homeSystem: 'Antares-5', alliance: 'NONE' as AllianceType, rosterIndex: 19, creditValue: 9300, fuelCapacity: 900, weaponStrength: 120, weaponCondition: 9, shieldStrength: 120, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 140, driveCondition: 9, hullStrength: 29 },
  { type: 'RIM_PIRATE' as NpcType, shipClass: 'Starfish', commander: 'RP-Polly Nyces', shipName: 'Moon Snail', homeSystem: 'Capella-4', alliance: 'NONE' as AllianceType, rosterIndex: 20, creditValue: 9600, fuelCapacity: 1100, weaponStrength: 140, weaponCondition: 9, shieldStrength: 140, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 160, driveCondition: 9, hullStrength: 29 },
  { type: 'RIM_PIRATE' as NpcType, shipClass: 'Symbiote', commander: 'RP-Alienator', shipName: 'PREDATOR', homeSystem: 'Algol-2', alliance: 'NONE' as AllianceType, rosterIndex: 21, creditValue: 10000, fuelCapacity: 3000, weaponStrength: 200, weaponCondition: 9, shieldStrength: 160, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 200, driveCondition: 9, hullStrength: 29 },
];

// SP.BRIGAND file (12 brigands) - encountered during smuggling runs (kk=5)
const BRIGANDS: NpcSeedData[] = [
  { type: 'BRIGAND' as NpcType, shipClass: 'N1.Sloop', commander: 'Cruncher', shipName: 'Big Mac', homeSystem: 'Sun-3', alliance: 'NONE' as AllianceType, rosterIndex: 1, creditValue: 1000, fuelCapacity: 100, weaponStrength: 9, weaponCondition: 9, shieldStrength: 9, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 14, driveCondition: 9, hullStrength: 9 },
  { type: 'BRIGAND' as NpcType, shipClass: 'N1.Sloop', commander: 'Chomper', shipName: 'Nugget', homeSystem: 'Aldebaran-1', alliance: 'NONE' as AllianceType, rosterIndex: 2, creditValue: 1000, fuelCapacity: 100, weaponStrength: 10, weaponCondition: 9, shieldStrength: 10, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 10, driveCondition: 9, hullStrength: 10 },
  { type: 'BRIGAND' as NpcType, shipClass: 'N1.Sloop', commander: 'Stomper', shipName: 'Fish Stix', homeSystem: 'Altair-3', alliance: 'NONE' as AllianceType, rosterIndex: 3, creditValue: 1000, fuelCapacity: 100, weaponStrength: 11, weaponCondition: 9, shieldStrength: 11, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 11, driveCondition: 9, hullStrength: 11 },
  { type: 'BRIGAND' as NpcType, shipClass: 'N1.Sloop', commander: 'Bruiser', shipName: 'Fries', homeSystem: 'Arcturus-6', alliance: 'NONE' as AllianceType, rosterIndex: 4, creditValue: 1000, fuelCapacity: 100, weaponStrength: 12, weaponCondition: 9, shieldStrength: 12, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 12, driveCondition: 9, hullStrength: 12 },
  { type: 'BRIGAND' as NpcType, shipClass: 'N1.Sloop', commander: 'Bonker', shipName: 'Pop Tart', homeSystem: 'Deneb-4', alliance: 'NONE' as AllianceType, rosterIndex: 5, creditValue: 1000, fuelCapacity: 100, weaponStrength: 13, weaponCondition: 9, shieldStrength: 13, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 13, driveCondition: 9, hullStrength: 13 },
  { type: 'BRIGAND' as NpcType, shipClass: 'N1.Sloop', commander: 'Blaster', shipName: 'Twinkie', homeSystem: 'Denebola-5', alliance: 'NONE' as AllianceType, rosterIndex: 6, creditValue: 1000, fuelCapacity: 100, weaponStrength: 14, weaponCondition: 9, shieldStrength: 14, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 14, driveCondition: 9, hullStrength: 14 },
  { type: 'BRIGAND' as NpcType, shipClass: 'N1.Sloop', commander: 'Bumper', shipName: 'Ho-Ho', homeSystem: 'Fomalhaut-2', alliance: 'NONE' as AllianceType, rosterIndex: 7, creditValue: 1000, fuelCapacity: 100, weaponStrength: 15, weaponCondition: 9, shieldStrength: 15, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 15, driveCondition: 9, hullStrength: 15 },
  { type: 'BRIGAND' as NpcType, shipClass: 'N1.Sloop', commander: 'Buster', shipName: 'Jelly Bean', homeSystem: 'Mira-9', alliance: 'NONE' as AllianceType, rosterIndex: 8, creditValue: 1000, fuelCapacity: 100, weaponStrength: 16, weaponCondition: 9, shieldStrength: 16, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 16, driveCondition: 9, hullStrength: 16 },
  { type: 'BRIGAND' as NpcType, shipClass: 'N1.Sloop', commander: 'Booster', shipName: 'Jube-Jube', homeSystem: 'Pollux-7', alliance: 'NONE' as AllianceType, rosterIndex: 9, creditValue: 1000, fuelCapacity: 100, weaponStrength: 17, weaponCondition: 9, shieldStrength: 17, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 17, driveCondition: 9, hullStrength: 17 },
  { type: 'BRIGAND' as NpcType, shipClass: 'N1.Sloop', commander: 'Bugster', shipName: 'Taco', homeSystem: 'Procyon-5', alliance: 'NONE' as AllianceType, rosterIndex: 10, creditValue: 1000, fuelCapacity: 100, weaponStrength: 18, weaponCondition: 9, shieldStrength: 18, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 18, driveCondition: 9, hullStrength: 18 },
  { type: 'BRIGAND' as NpcType, shipClass: 'N1.Sloop', commander: 'Bammer', shipName: 'Chips', homeSystem: 'Regulus-6', alliance: 'NONE' as AllianceType, rosterIndex: 11, creditValue: 1000, fuelCapacity: 100, weaponStrength: 19, weaponCondition: 9, shieldStrength: 19, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 19, driveCondition: 9, hullStrength: 19 },
  { type: 'BRIGAND' as NpcType, shipClass: 'N1.Sloop', commander: 'Bummer', shipName: 'McDLT', homeSystem: 'Rigel-8', alliance: 'NONE' as AllianceType, rosterIndex: 12, creditValue: 1000, fuelCapacity: 100, weaponStrength: 20, weaponCondition: 9, shieldStrength: 20, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 20, driveCondition: 9, hullStrength: 20 },
];

// SP.REPTILE file (12 reptiloids) - encountered in Andromeda Galaxy (kk=10)
const REPTILOIDS: NpcSeedData[] = [
  { type: 'REPTILOID' as NpcType, shipClass: 'S1-Snake', commander: 'Admiral Assss', shipName: 'SS Anaconda', homeSystem: 'NGC-44', alliance: 'NONE' as AllianceType, rosterIndex: 1, creditValue: 10000, fuelCapacity: 1000, weaponStrength: 10, weaponCondition: 9, shieldStrength: 20, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 120, driveCondition: 9, hullStrength: 29 },
  { type: 'REPTILOID' as NpcType, shipClass: 'S2-Snake', commander: 'Admiral Bssss', shipName: 'SS Bull', homeSystem: 'NGC-55', alliance: 'NONE' as AllianceType, rosterIndex: 2, creditValue: 10000, fuelCapacity: 1000, weaponStrength: 20, weaponCondition: 9, shieldStrength: 30, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 110, driveCondition: 9, hullStrength: 29 },
  { type: 'REPTILOID' as NpcType, shipClass: 'S3-Snake', commander: 'Admiral Cssss', shipName: 'SS Copperhead', homeSystem: 'NGC-66', alliance: 'NONE' as AllianceType, rosterIndex: 3, creditValue: 10000, fuelCapacity: 1000, weaponStrength: 30, weaponCondition: 9, shieldStrength: 40, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 100, driveCondition: 9, hullStrength: 29 },
  { type: 'REPTILOID' as NpcType, shipClass: 'S4-Snake', commander: 'Admiral Dssss', shipName: 'SS Fer-de-Lance', homeSystem: 'NGC-77', alliance: 'NONE' as AllianceType, rosterIndex: 4, creditValue: 10000, fuelCapacity: 1000, weaponStrength: 40, weaponCondition: 9, shieldStrength: 50, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 90, driveCondition: 9, hullStrength: 29 },
  { type: 'REPTILOID' as NpcType, shipClass: 'S5-Snake', commander: 'Admiral Essss', shipName: 'SS Garter', homeSystem: 'NGC-88', alliance: 'NONE' as AllianceType, rosterIndex: 5, creditValue: 10000, fuelCapacity: 1000, weaponStrength: 50, weaponCondition: 9, shieldStrength: 60, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 90, driveCondition: 9, hullStrength: 29 },
  { type: 'REPTILOID' as NpcType, shipClass: 'S6-Snake', commander: 'Admiral Fssss', shipName: 'SS Indigo', homeSystem: 'NGC-99', alliance: 'NONE' as AllianceType, rosterIndex: 6, creditValue: 10000, fuelCapacity: 1000, weaponStrength: 60, weaponCondition: 9, shieldStrength: 70, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 90, driveCondition: 9, hullStrength: 29 },
  { type: 'REPTILOID' as NpcType, shipClass: 'S7-Snake', commander: 'Admiral Gssss', shipName: 'SS Viper', homeSystem: 'NGC-44', alliance: 'NONE' as AllianceType, rosterIndex: 7, creditValue: 10000, fuelCapacity: 1000, weaponStrength: 70, weaponCondition: 9, shieldStrength: 80, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 80, driveCondition: 9, hullStrength: 29 },
  { type: 'REPTILOID' as NpcType, shipClass: 'S8-Snake', commander: 'Admiral Hssss', shipName: 'SS Coral', homeSystem: 'NGC-55', alliance: 'NONE' as AllianceType, rosterIndex: 8, creditValue: 10000, fuelCapacity: 1000, weaponStrength: 80, weaponCondition: 9, shieldStrength: 90, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 100, driveCondition: 9, hullStrength: 29 },
  { type: 'REPTILOID' as NpcType, shipClass: 'S9-Snake', commander: 'Admiral Issss', shipName: 'SS Rattler', homeSystem: 'NGC-66', alliance: 'NONE' as AllianceType, rosterIndex: 9, creditValue: 10000, fuelCapacity: 1000, weaponStrength: 90, weaponCondition: 9, shieldStrength: 100, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 110, driveCondition: 9, hullStrength: 29 },
  { type: 'REPTILOID' as NpcType, shipClass: 'SX-Snake', commander: 'Admiral Kssss', shipName: 'SS Asp', homeSystem: 'NGC-77', alliance: 'NONE' as AllianceType, rosterIndex: 10, creditValue: 10000, fuelCapacity: 1000, weaponStrength: 100, weaponCondition: 9, shieldStrength: 110, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 120, driveCondition: 9, hullStrength: 39 },
  { type: 'REPTILOID' as NpcType, shipClass: 'SY-Snake', commander: 'Admiral Lssss', shipName: 'SS Adder', homeSystem: 'NGC-88', alliance: 'NONE' as AllianceType, rosterIndex: 11, creditValue: 10000, fuelCapacity: 1000, weaponStrength: 110, weaponCondition: 9, shieldStrength: 120, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 130, driveCondition: 9, hullStrength: 39 },
  { type: 'REPTILOID' as NpcType, shipClass: 'SZ-Snake', commander: 'Admiral Mssss', shipName: 'SS Cobra', homeSystem: 'NGC-99', alliance: 'NONE' as AllianceType, rosterIndex: 12, creditValue: 10000, fuelCapacity: 1000, weaponStrength: 120, weaponCondition: 9, shieldStrength: 130, shieldCondition: 9, hullCondition: 9, lifeSupportCond: 9, driveStrength: 140, driveCondition: 9, hullStrength: 39 },
];

const ALL_NPCS = [...PIRATES, ...PATROL, ...RIM_PIRATES, ...BRIGANDS, ...REPTILOIDS];

async function main() {
  console.log('🚀 SpacerQuest v4.0 - Seeding Database...\n');
  
  // Clear existing data (in development only)
  if (process.env.NODE_ENV === 'development') {
    console.log('📋 Clearing existing data...');
    await prisma.gameLog.deleteMany();
    await prisma.travelState.deleteMany();
    await prisma.combatSession.deleteMany();
    await prisma.duelEntry.deleteMany();
    await prisma.battleRecord.deleteMany();
    await prisma.npcRoster.deleteMany();
    await prisma.allianceSystem.deleteMany();
    await prisma.allianceMembership.deleteMany();
    await prisma.portOwnership.deleteMany();
    await prisma.ship.deleteMany();
    await prisma.character.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    console.log('✅ Existing data cleared\n');
  }
  
  // Seed Star Systems
  console.log('🌟 Seeding Star Systems...');
  for (const system of STAR_SYSTEMS) {
    await prisma.starSystem.upsert({
      where: { id: system.id },
      update: {
        name: system.name,
        type: system.type as SystemType,
        coordinates: { x: system.x, y: system.y, z: system.z },
        features: system.features,
      },
      create: {
        id: system.id,
        name: system.name,
        type: system.type as SystemType,
        coordinates: { x: system.x, y: system.y, z: system.z },
        features: system.features,
      },
    });
    console.log(`   ✓ ${system.name} (${system.type})`);
  }
  console.log(`✅ Seeded ${STAR_SYSTEMS.length} star systems\n`);
  
  // Seed Alliance Systems (initially uncontrolled)
  console.log('🏛️  Seeding Alliance Systems...');
  for (let i = 1; i <= 14; i++) {
    await prisma.allianceSystem.upsert({
      where: { systemId: i },
      update: {},
      create: {
        systemId: i,
        alliance: AllianceType.NONE,
        defconLevel: 1,
      },
    });
  }
  console.log('✅ Seeded 14 alliance systems\n');

  // Seed NPC Roster (original 65 NPCs from SpacerQuest v3.4)
  console.log('👾 Seeding NPC Roster...');
  for (const npc of ALL_NPCS) {
    await prisma.npcRoster.create({
      data: {
        type: npc.type,
        shipClass: npc.shipClass,
        commander: npc.commander,
        shipName: npc.shipName,
        homeSystem: npc.homeSystem,
        alliance: npc.alliance,
        rosterIndex: npc.rosterIndex,
        creditValue: npc.creditValue,
        fuelCapacity: npc.fuelCapacity,
        weaponStrength: npc.weaponStrength,
        weaponCondition: npc.weaponCondition,
        shieldStrength: npc.shieldStrength,
        shieldCondition: npc.shieldCondition,
        hullCondition: npc.hullCondition,
        lifeSupportCond: npc.lifeSupportCond,
        driveStrength: npc.driveStrength,
        driveCondition: npc.driveCondition,
        hullStrength: npc.hullStrength,
        isOriginal: true,
      },
    });
  }
  console.log(`✅ Seeded ${ALL_NPCS.length} NPCs (${PIRATES.length} pirates, ${PATROL.length} patrol, ${RIM_PIRATES.length} rim pirates, ${BRIGANDS.length} brigands, ${REPTILOIDS.length} reptiloids)\n`);

  // Create initial game log
  console.log('📝 Creating initial game log...');
  await prisma.gameLog.create({
    data: {
      type: 'SYSTEM',
      message: 'SpacerQuest v4.0 database initialized',
      metadata: {
        version: '4.0.0',
        originalVersion: '3.4',
        originalAuthor: 'Firefox',
        originalDate: '1991-05-25',
        systemsCount: STAR_SYSTEMS.length,
        coreSystems: 14,
        rimSystems: 6,
        andromedaSystems: 6,
        specialLocations: 2,
      },
    },
  });
  console.log('✅ Initial game log created\n');
  
  // Summary
  const systemCount = await prisma.starSystem.count();
  const allianceCount = await prisma.allianceSystem.count();
  const npcCount = await prisma.npcRoster.count();
  const logCount = await prisma.gameLog.count();
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  SpacerQuest v4.0 - Database Seeding Complete!');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Star Systems:       ${systemCount}`);
  console.log(`    - Core (Milky Way): 14`);
  console.log(`    - Rim Stars:        6`);
  console.log(`    - Andromeda:        6`);
  console.log(`    - Special:          2`);
  console.log(`  Alliance Systems:   ${allianceCount}`);
  console.log(`  NPC Roster:         ${npcCount}`);
  console.log(`    - Pirates:          ${PIRATES.length}`);
  console.log(`    - Patrol:           ${PATROL.length}`);
  console.log(`    - Rim Pirates:      ${RIM_PIRATES.length}`);
  console.log(`    - Brigands:         ${BRIGANDS.length}`);
  console.log(`    - Reptiloids:       ${REPTILOIDS.length}`);
  console.log(`  Game Logs:          ${logCount}`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('\n  The galaxy is ready for spacers!\n');
  console.log('  Star Systems Seeded:');
  console.log('  Core: Sun-3, Aldebaran-1, Altair-3, Arcturus-6,');
  console.log('        Deneb-4, Denebola-5, Fomalhaut-2, Mira-9,');
  console.log('        Pollux-7, Procyon-5, Regulus-6, Rigel-8,');
  console.log('        Spica-3, Vega-6');
  console.log('  Rim:  Antares-5, Capella-4, Polaris-1, Mizar-9,');
  console.log('        Achernar-5, Algol-2');
  console.log('  Andromeda: NGC-44, NGC-55, NGC-66, NGC-77,');
  console.log('             NGC-88, NGC-99');
  console.log('  Special: MALIGNA, NEMESIS\n');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
