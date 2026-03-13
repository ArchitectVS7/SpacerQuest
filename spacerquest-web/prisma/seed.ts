/**
 * SpacerQuest v4.0 - Database Seed Script
 * Populates the database with all star systems and initial configuration
 */

import { PrismaClient, SystemType, AllianceType } from '@prisma/client';

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

async function main() {
  console.log('🚀 SpacerQuest v4.0 - Seeding Database...\n');
  
  // Clear existing data (in development only)
  if (process.env.NODE_ENV === 'development') {
    console.log('📋 Clearing existing data...');
    await prisma.gameLog.deleteMany();
    await prisma.travelState.deleteMany();
    await prisma.duelEntry.deleteMany();
    await prisma.battleRecord.deleteMany();
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
