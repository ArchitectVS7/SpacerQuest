/**
 * SpacerQuest v4.0 - Route Wiring Integration Tests
 *
 * These tests verify that ALL routes properly call their corresponding
 * game systems — not just that routes compile, but that the wiring is
 * actually present in source.
 *
 * Tests cover:
 * 1. Navigation routes import and use travel.js / hazards.js
 * 2. Combat routes import and use combat.js, and manage CombatSession
 * 3. Economy routes import economy.js, combat.js (smuggling), jail.js, alliance.js
 * 4. Character routes import alliance-rules.js and jail.js
 * 5. Alliance routes import bulletin-board.js
 * 6. Ship routes import upgrades.js and repairs.js
 * 7. All route files import prisma and requireAuth
 * 8. App index registers all route handler functions
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

// ============================================================================
// HELPERS
// ============================================================================

function readRoute(relativePath: string): string {
  return readFileSync(
    new URL(relativePath, import.meta.url),
    'utf-8'
  );
}

// ============================================================================
// 1. NAVIGATION ROUTES
// ============================================================================

describe('Navigation Route Wiring', () => {
  it('registerNavigationRoutes is exported', async () => {
    const mod = await import('../src/app/routes/navigation');
    expect(mod.registerNavigationRoutes).toBeDefined();
    expect(mod.registerNavigationRoutes).toBeTypeOf('function');
  });

  it('navigation.ts imports from travel.js', () => {
    const src = readRoute('../src/app/routes/navigation.ts');
    expect(src).toContain('travel.js');
  });

  it('navigation.ts uses validateLaunch from travel.js', () => {
    const src = readRoute('../src/app/routes/navigation.ts');
    expect(src).toContain('validateLaunch');
  });

  it('navigation.ts uses startTravel from travel.js', () => {
    const src = readRoute('../src/app/routes/navigation.ts');
    expect(src).toContain('startTravel');
  });

  it('navigation.ts uses getTravelProgress from travel.js', () => {
    const src = readRoute('../src/app/routes/navigation.ts');
    expect(src).toContain('getTravelProgress');
  });

  it('navigation.ts /arrive endpoint imports from hazards.js', () => {
    const src = readRoute('../src/app/routes/navigation.ts');
    expect(src).toContain('hazards.js');
  });

  it('navigation.ts /arrive endpoint calls checkHazardTrigger', () => {
    const src = readRoute('../src/app/routes/navigation.ts');
    expect(src).toContain('checkHazardTrigger');
  });

  it('navigation.ts /arrive endpoint calls generateHazard', () => {
    const src = readRoute('../src/app/routes/navigation.ts');
    expect(src).toContain('generateHazard');
  });

  it('navigation.ts /arrive checks both quarter and half travel marks', () => {
    const src = readRoute('../src/app/routes/navigation.ts');
    expect(src).toContain('quarterMark');
    expect(src).toContain('halfMark');
  });

  it('navigation.ts /arrive applies and persists hazard damage via prisma.ship.update', () => {
    const src = readRoute('../src/app/routes/navigation.ts');
    expect(src).toContain('hazard.newCondition');
    expect(src).toContain('prisma.ship.update');
  });

  it('navigation.ts /arrive includes hazards in response', () => {
    const src = readRoute('../src/app/routes/navigation.ts');
    expect(src).toContain('hazards:');
  });
});

// ============================================================================
// 2. COMBAT ROUTES
// ============================================================================

describe('Combat Route Wiring', () => {
  it('registerCombatRoutes is exported', async () => {
    const mod = await import('../src/app/routes/combat');
    expect(mod.registerCombatRoutes).toBeDefined();
    expect(mod.registerCombatRoutes).toBeTypeOf('function');
  });

  it('combat.ts /engage imports generateEncounter from combat.js', () => {
    const src = readRoute('../src/app/routes/combat.ts');
    expect(src).toContain('combat.js');
    expect(src).toContain('generateEncounter');
  });

  it('combat.ts /engage imports calculateBattleFactor from combat.js', () => {
    const src = readRoute('../src/app/routes/combat.ts');
    expect(src).toContain('calculateBattleFactor');
  });

  it('combat.ts /engage imports calculateEnemyBattleFactor from combat.js', () => {
    const src = readRoute('../src/app/routes/combat.ts');
    expect(src).toContain('calculateEnemyBattleFactor');
  });

  it('combat.ts /action imports processCombatRound from combat.js', () => {
    const src = readRoute('../src/app/routes/combat.ts');
    expect(src).toContain('processCombatRound');
  });

  it('combat.ts /action imports attemptRetreat from combat.js', () => {
    const src = readRoute('../src/app/routes/combat.ts');
    expect(src).toContain('attemptRetreat');
  });

  it('combat.ts /engage creates CombatSession via prisma.combatSession.upsert', () => {
    const src = readRoute('../src/app/routes/combat.ts');
    expect(src).toContain('prisma.combatSession.upsert');
  });

  it('combat.ts /action updates CombatSession round counter', () => {
    const src = readRoute('../src/app/routes/combat.ts');
    expect(src).toContain('currentRound');
    // updateMany is used to advance the round
    expect(src).toContain('prisma.combatSession.updateMany');
  });

  it('combat.ts /action marks CombatSession inactive on combat end', () => {
    const src = readRoute('../src/app/routes/combat.ts');
    // active: false is set when combat ends (shield destruction)
    expect(src).toContain('active: false');
    expect(src).toContain('combatEnded');
    expect(src).toContain("'VICTORY'");
    expect(src).toContain("'DEFEAT'");
  });

  it('combat.ts /action marks CombatSession inactive on successful retreat', () => {
    const src = readRoute('../src/app/routes/combat.ts');
    expect(src).toContain("result: 'RETREAT'");
  });
});

// ============================================================================
// 3. ECONOMY ROUTES
// ============================================================================

describe('Economy Route Wiring', () => {
  it('registerEconomyRoutes is exported', async () => {
    const mod = await import('../src/app/routes/economy');
    expect(mod.registerEconomyRoutes).toBeDefined();
    expect(mod.registerEconomyRoutes).toBeTypeOf('function');
  });

  it('economy.ts /fuel/buy imports getFuelPrice from economy.js', () => {
    const src = readRoute('../src/app/routes/economy.ts');
    expect(src).toContain('economy.js');
    expect(src).toContain('getFuelPrice');
  });

  it('economy.ts /fuel/buy imports calculateFuelBuyCost from economy.js', () => {
    const src = readRoute('../src/app/routes/economy.ts');
    expect(src).toContain('calculateFuelBuyCost');
  });

  it('economy.ts /fuel/sell imports getFuelSellPrice from economy.js', () => {
    const src = readRoute('../src/app/routes/economy.ts');
    expect(src).toContain('getFuelSellPrice');
  });

  it('economy.ts /cargo/accept imports generateCargoContract from economy.js', () => {
    const src = readRoute('../src/app/routes/economy.ts');
    expect(src).toContain('generateCargoContract');
  });

  it('economy.ts /cargo/deliver imports calculateCargoPayment from economy.js', () => {
    const src = readRoute('../src/app/routes/economy.ts');
    expect(src).toContain('calculateCargoPayment');
  });

  it('economy.ts /cargo/deliver checks for smuggling cargo type (cargoType === 10)', () => {
    const src = readRoute('../src/app/routes/economy.ts');
    expect(src).toContain('cargoType === 10');
  });

  it('economy.ts /cargo/deliver imports generateEncounter from combat.js for smuggling', () => {
    const src = readRoute('../src/app/routes/economy.ts');
    expect(src).toContain('combat.js');
    expect(src).toContain('generateEncounter');
  });

  it('economy.ts smuggling uses missionType 5 for patrol encounter', () => {
    const src = readRoute('../src/app/routes/economy.ts');
    // generateEncounter is called with missionType argument 5
    expect(src).toContain(', 5,');
  });

  it('economy.ts smuggling interception calls jailPlayer from jail.js', () => {
    const src = readRoute('../src/app/routes/economy.ts');
    expect(src).toContain('jail.js');
    expect(src).toContain('jailPlayer');
  });

  it('economy.ts smuggling interception returns intercepted: true and success: false', () => {
    const src = readRoute('../src/app/routes/economy.ts');
    expect(src).toContain('intercepted: true');
    expect(src).toContain('success: false');
  });

  it('economy.ts smuggling interception reports confiscated contraband', () => {
    const src = readRoute('../src/app/routes/economy.ts');
    expect(src).toContain('Contraband confiscated');
  });

  it('economy.ts /alliance/invest imports investInAlliance from alliance.js', () => {
    const src = readRoute('../src/app/routes/economy.ts');
    expect(src).toContain('alliance.js');
    expect(src).toContain('investInAlliance');
  });

  it('economy.ts /alliance/invest imports investInDefcon from alliance.js', () => {
    const src = readRoute('../src/app/routes/economy.ts');
    expect(src).toContain('investInDefcon');
  });
});

// ============================================================================
// 4. CHARACTER ROUTES
// ============================================================================

describe('Character Route Wiring', () => {
  it('registerCharacterRoutes is exported', async () => {
    const mod = await import('../src/app/routes/character');
    expect(mod.registerCharacterRoutes).toBeDefined();
    expect(mod.registerCharacterRoutes).toBeTypeOf('function');
  });

  it('character.ts alliance join imports canJoinAlliance from alliance-rules.js', () => {
    const src = readRoute('../src/app/routes/character.ts');
    expect(src).toContain('alliance-rules.js');
    expect(src).toContain('canJoinAlliance');
  });

  it('character.ts alliance join imports calculateSwitchCost from alliance-rules.js', () => {
    const src = readRoute('../src/app/routes/character.ts');
    expect(src).toContain('calculateSwitchCost');
  });

  it('character.ts /jail/pay-fine imports canPayFine from jail.js', () => {
    const src = readRoute('../src/app/routes/character.ts');
    expect(src).toContain('jail.js');
    expect(src).toContain('canPayFine');
  });

  it('character.ts /jail/pay-fine imports payFine from jail.js', () => {
    const src = readRoute('../src/app/routes/character.ts');
    expect(src).toContain('payFine');
  });

  it('character.ts /jail/pay-fine imports releasePlayer from jail.js', () => {
    const src = readRoute('../src/app/routes/character.ts');
    expect(src).toContain('releasePlayer');
  });

  it('character.ts /jail/bail imports calculateBailCost from jail.js', () => {
    const src = readRoute('../src/app/routes/character.ts');
    expect(src).toContain('calculateBailCost');
  });

  it('character.ts /jail/bail deducts credits via subtractCredits', () => {
    const src = readRoute('../src/app/routes/character.ts');
    expect(src).toContain('subtractCredits');
  });

  it('character.ts /jail/bail calls releasePlayer to restore the bailed player name', () => {
    const src = readRoute('../src/app/routes/character.ts');
    // releasePlayer is called with target.name in the bail endpoint
    expect(src).toContain('releasePlayer(target.name)');
  });
});

// ============================================================================
// 5. ALLIANCE ROUTES
// ============================================================================

describe('Alliance Route Wiring', () => {
  it('registerAllianceRoutes is exported', async () => {
    const mod = await import('../src/app/routes/alliance');
    expect(mod.registerAllianceRoutes).toBeDefined();
    expect(mod.registerAllianceRoutes).toBeTypeOf('function');
  });

  it('alliance.ts board GET checks alliance membership before returning posts', () => {
    const src = readRoute('../src/app/routes/alliance.ts');
    expect(src).toContain('allianceMembership.findUnique');
    // Membership check must come before the posts query
    const membershipIdx = src.indexOf('allianceMembership.findUnique');
    const postsIdx = src.indexOf('bulletinPost.findMany');
    expect(membershipIdx).toBeLessThan(postsIdx);
  });

  it('alliance.ts board POST imports validateMessage from bulletin-board.js', () => {
    const src = readRoute('../src/app/routes/alliance.ts');
    expect(src).toContain('bulletin-board.js');
    expect(src).toContain('validateMessage');
  });

  it('alliance.ts board POST imports formatBulletinPost from bulletin-board.js', () => {
    const src = readRoute('../src/app/routes/alliance.ts');
    expect(src).toContain('formatBulletinPost');
  });

  it('alliance.ts board DELETE deletes posts filtered by alliance', () => {
    const src = readRoute('../src/app/routes/alliance.ts');
    expect(src).toContain('bulletinPost.deleteMany');
    expect(src).toContain('membership.alliance');
  });
});

// ============================================================================
// 6. SHIP ROUTES
// ============================================================================

describe('Ship Route Wiring', () => {
  it('registerShipRoutes is exported', async () => {
    const mod = await import('../src/app/routes/ship');
    expect(mod.registerShipRoutes).toBeDefined();
    expect(mod.registerShipRoutes).toBeTypeOf('function');
  });

  it('ship.ts /upgrade imports from upgrades.js', () => {
    const src = readRoute('../src/app/routes/ship.ts');
    expect(src).toContain('upgrades.js');
  });

  it('ship.ts /upgrade calls upgradeShipComponent', () => {
    const src = readRoute('../src/app/routes/ship.ts');
    expect(src).toContain('upgradeShipComponent');
  });

  it('ship.ts /repair imports from repairs.js', () => {
    const src = readRoute('../src/app/routes/ship.ts');
    expect(src).toContain('repairs.js');
  });

  it('ship.ts /repair calls repairAllComponents', () => {
    const src = readRoute('../src/app/routes/ship.ts');
    expect(src).toContain('repairAllComponents');
  });
});

// ============================================================================
// 7. ALL ROUTE FILES IMPORT PRISMA AND REQUIREAUTH
// ============================================================================

describe('Universal Route File Imports', () => {
  const routeFiles: Array<[string, string]> = [
    ['auth', '../src/app/routes/auth.ts'],
    ['character', '../src/app/routes/character.ts'],
    ['navigation', '../src/app/routes/navigation.ts'],
    ['combat', '../src/app/routes/combat.ts'],
    ['economy', '../src/app/routes/economy.ts'],
    ['ship', '../src/app/routes/ship.ts'],
    ['social', '../src/app/routes/social.ts'],
    ['missions', '../src/app/routes/missions.ts'],
    ['alliance', '../src/app/routes/alliance.ts'],
  ];

  for (const [name, path] of routeFiles) {
    it(`${name}.ts imports prisma from db/prisma.js`, () => {
      const src = readRoute(path);
      expect(src).toContain("from '../../db/prisma.js'");
    });
  }

  // requireAuth is used in every route file except those that are fully public;
  // all files in the list above have at least one protected endpoint
  const routeFilesWithAuth: Array<[string, string]> = [
    ['auth', '../src/app/routes/auth.ts'],
    ['character', '../src/app/routes/character.ts'],
    ['navigation', '../src/app/routes/navigation.ts'],
    ['combat', '../src/app/routes/combat.ts'],
    ['economy', '../src/app/routes/economy.ts'],
    ['ship', '../src/app/routes/ship.ts'],
    ['social', '../src/app/routes/social.ts'],
    ['missions', '../src/app/routes/missions.ts'],
    ['alliance', '../src/app/routes/alliance.ts'],
  ];

  for (const [name, path] of routeFilesWithAuth) {
    it(`${name}.ts imports requireAuth from middleware/auth.js`, () => {
      const src = readRoute(path);
      expect(src).toContain("from '../middleware/auth.js'");
    });
  }
});

// ============================================================================
// 8. APP INDEX — ALL ROUTES REGISTERED
// ============================================================================

describe('App Index Route Registration', () => {
  it('app/index.ts imports registerAuthRoutes', () => {
    const src = readRoute('../src/app/index.ts');
    expect(src).toContain('registerAuthRoutes');
  });

  it('app/index.ts imports registerCharacterRoutes', () => {
    const src = readRoute('../src/app/index.ts');
    expect(src).toContain('registerCharacterRoutes');
  });

  it('app/index.ts imports registerNavigationRoutes', () => {
    const src = readRoute('../src/app/index.ts');
    expect(src).toContain('registerNavigationRoutes');
  });

  it('app/index.ts imports registerCombatRoutes', () => {
    const src = readRoute('../src/app/index.ts');
    expect(src).toContain('registerCombatRoutes');
  });

  it('app/index.ts imports registerEconomyRoutes', () => {
    const src = readRoute('../src/app/index.ts');
    expect(src).toContain('registerEconomyRoutes');
  });

  it('app/index.ts imports registerShipRoutes', () => {
    const src = readRoute('../src/app/index.ts');
    expect(src).toContain('registerShipRoutes');
  });

  it('app/index.ts imports registerSocialRoutes', () => {
    const src = readRoute('../src/app/index.ts');
    expect(src).toContain('registerSocialRoutes');
  });

  it('app/index.ts imports registerMissionsRoutes', () => {
    const src = readRoute('../src/app/index.ts');
    expect(src).toContain('registerMissionsRoutes');
  });

  it('app/index.ts imports registerAllianceRoutes', () => {
    const src = readRoute('../src/app/index.ts');
    expect(src).toContain('registerAllianceRoutes');
  });

  it('app/index.ts calls registerAuthRoutes', () => {
    const src = readRoute('../src/app/index.ts');
    expect(src).toContain('registerAuthRoutes(fastify)');
  });

  it('app/index.ts calls registerCharacterRoutes', () => {
    const src = readRoute('../src/app/index.ts');
    expect(src).toContain('registerCharacterRoutes(fastify)');
  });

  it('app/index.ts calls registerNavigationRoutes', () => {
    const src = readRoute('../src/app/index.ts');
    expect(src).toContain('registerNavigationRoutes(fastify)');
  });

  it('app/index.ts calls registerCombatRoutes', () => {
    const src = readRoute('../src/app/index.ts');
    expect(src).toContain('registerCombatRoutes(fastify)');
  });

  it('app/index.ts calls registerEconomyRoutes', () => {
    const src = readRoute('../src/app/index.ts');
    expect(src).toContain('registerEconomyRoutes(fastify)');
  });

  it('app/index.ts calls registerShipRoutes', () => {
    const src = readRoute('../src/app/index.ts');
    expect(src).toContain('registerShipRoutes(fastify)');
  });

  it('app/index.ts calls registerSocialRoutes', () => {
    const src = readRoute('../src/app/index.ts');
    expect(src).toContain('registerSocialRoutes(fastify)');
  });

  it('app/index.ts calls registerMissionsRoutes', () => {
    const src = readRoute('../src/app/index.ts');
    expect(src).toContain('registerMissionsRoutes(fastify)');
  });

  it('app/index.ts calls registerAllianceRoutes', () => {
    const src = readRoute('../src/app/index.ts');
    expect(src).toContain('registerAllianceRoutes(fastify)');
  });
});
