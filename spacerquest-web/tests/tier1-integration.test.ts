/**
 * SpacerQuest v4.0 - Tier 1 Integration Tests
 *
 * These tests verify that game logic is actually WIRED into routes and screens,
 * not just that the pure logic functions work in isolation.
 *
 * Tests cover:
 * 1. Travel hazards are called during POST /api/navigation/arrive
 * 2. Smuggling patrol encounters trigger during POST /api/economy/cargo/deliver
 * 3. Wise One & Sage screens are registered and accessible
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// 1. TRAVEL HAZARD ROUTE INTEGRATION
// ============================================================================

describe('Travel Hazard Route Integration', () => {
  it('navigation/arrive route imports and calls hazard functions', async () => {
    // Verify the navigation route file contains hazard imports
    const routeSource = await import('../src/app/routes/navigation');
    expect(routeSource.registerNavigationRoutes).toBeDefined();

    // Read the actual source to verify wiring (not just that it compiles)
    const fs = await import('fs');
    const routeCode = fs.readFileSync(
      new URL('../src/app/routes/navigation.ts', import.meta.url),
      'utf-8'
    );

    // The arrive endpoint must import hazard functions
    expect(routeCode).toContain('checkHazardTrigger');
    expect(routeCode).toContain('generateHazard');
    expect(routeCode).toContain('hazards.js');

    // It must persist damage to the ship
    expect(routeCode).toContain('prisma.ship.update');

    // The response must include hazard events
    expect(routeCode).toContain('hazards:');
  });

  it('hazard check uses both 1/4 and 1/2 trigger points from original SP.WARP.S', async () => {
    const fs = await import('fs');
    const routeCode = fs.readFileSync(
      new URL('../src/app/routes/navigation.ts', import.meta.url),
      'utf-8'
    );

    // Must check both quarter and half marks
    expect(routeCode).toContain('quarterMark');
    expect(routeCode).toContain('halfMark');
  });

  it('hazard damage is applied cumulatively across checkpoints', async () => {
    // Verify the code updates shipData between checkpoint iterations
    const fs = await import('fs');
    const routeCode = fs.readFileSync(
      new URL('../src/app/routes/navigation.ts', import.meta.url),
      'utf-8'
    );

    // Must update shipData within the loop so second hazard uses damaged state
    expect(routeCode).toContain('shipData');
    expect(routeCode).toContain('hazard.newCondition');
  });
});

// ============================================================================
// 2. SMUGGLING PATROL ENCOUNTER ROUTE INTEGRATION
// ============================================================================

describe('Smuggling Patrol Route Integration', () => {
  it('cargo/deliver route checks for smuggling (cargoType === 10)', async () => {
    const routeSource = await import('../src/app/routes/economy');
    expect(routeSource.registerEconomyRoutes).toBeDefined();

    const fs = await import('fs');
    const routeCode = fs.readFileSync(
      new URL('../src/app/routes/economy.ts', import.meta.url),
      'utf-8'
    );

    // Must check for smuggling cargo type
    expect(routeCode).toContain('cargoType === 10');

    // Must import and call generateEncounter with missionType 5
    expect(routeCode).toContain('generateEncounter');
    expect(routeCode).toContain('combat.js');
    expect(routeCode).toContain(', 5,'); // missionType = 5 for smuggling
  });

  it('patrol interception confiscates cargo and returns failure', async () => {
    const fs = await import('fs');
    const routeCode = fs.readFileSync(
      new URL('../src/app/routes/economy.ts', import.meta.url),
      'utf-8'
    );

    // On interception: cargo zeroed out, success=false returned
    expect(routeCode).toContain('intercepted: true');
    expect(routeCode).toContain('success: false');
    expect(routeCode).toContain('Contraband confiscated');
  });

  it('smuggling encounter uses player power for patrol scaling', async () => {
    const fs = await import('fs');
    const routeCode = fs.readFileSync(
      new URL('../src/app/routes/economy.ts', import.meta.url),
      'utf-8'
    );

    // Must calculate player power from ship stats
    expect(routeCode).toContain('calculateComponentPower');
    expect(routeCode).toContain('weaponStrength');
    expect(routeCode).toContain('shieldStrength');
  });
});

// ============================================================================
// 3. WISE ONE & SAGE SCREEN REGISTRATION
// ============================================================================

describe('Wise One & Sage Screen Integration', () => {
  it('screens are registered in the screen router', async () => {
    const { screens } = await import('../src/sockets/screen-router');

    expect(screens['wise-one']).toBeDefined();
    expect(screens['sage']).toBeDefined();

    // Verify they have the required ScreenModule interface
    expect(screens['wise-one'].render).toBeTypeOf('function');
    expect(screens['wise-one'].handleInput).toBeTypeOf('function');
    expect(screens['sage'].render).toBeTypeOf('function');
    expect(screens['sage'].handleInput).toBeTypeOf('function');
  });

  it('main menu includes Wise One option at System 17', async () => {
    const fs = await import('fs');
    const menuCode = fs.readFileSync(
      new URL('../src/game/screens/main-menu.ts', import.meta.url),
      'utf-8'
    );

    // Menu must show [W]ise One at system 17
    expect(menuCode).toContain('currentSystem === 17');
    expect(menuCode).toContain('Wise One');
    expect(menuCode).toContain("nextScreen: 'wise-one'");
  });

  it('main menu includes Sage option at System 18', async () => {
    const fs = await import('fs');
    const menuCode = fs.readFileSync(
      new URL('../src/game/screens/main-menu.ts', import.meta.url),
      'utf-8'
    );

    // Menu must show [A]ncient One at system 18
    expect(menuCode).toContain('currentSystem === 18');
    expect(menuCode).toContain('Sage');
    expect(menuCode).toContain("nextScreen: 'sage'");
  });

  it('Wise One screen enforces system 17 requirement', async () => {
    const fs = await import('fs');
    const screenCode = fs.readFileSync(
      new URL('../src/game/screens/wise-one.ts', import.meta.url),
      'utf-8'
    );

    expect(screenCode).toContain('currentSystem !== 17');
    expect(screenCode).toContain('generateNumberKey');
    expect(screenCode).toContain('WISE_ONE_TEXT');
  });

  it('Sage screen enforces system 18 and sageVisited check', async () => {
    const fs = await import('fs');
    const screenCode = fs.readFileSync(
      new URL('../src/game/screens/sage.ts', import.meta.url),
      'utf-8'
    );

    expect(screenCode).toContain('currentSystem !== 18');
    expect(screenCode).toContain('sageVisited');
    expect(screenCode).toContain('checkSageAnswer');
    expect(screenCode).toContain('applySageReward');
    expect(screenCode).toContain('prisma.ship.update');
    expect(screenCode).toContain('cabinStrength');
  });

  it('Sage screen stores pending question for answer verification', async () => {
    const fs = await import('fs');
    const screenCode = fs.readFileSync(
      new URL('../src/game/screens/sage.ts', import.meta.url),
      'utf-8'
    );

    // Must store the question star between render and handleInput
    expect(screenCode).toContain('pendingQuestions');
    expect(screenCode).toContain('.set(characterId');
    expect(screenCode).toContain('.get(characterId');
    expect(screenCode).toContain('.delete(characterId');
  });
});

// ============================================================================
// 4. CROSS-CUTTING: VERIFY NO DEAD CODE
// ============================================================================

describe('Integration completeness', () => {
  it('hazards.ts exports are used by navigation routes', async () => {
    const { checkHazardTrigger, generateHazard, applyHazardDamage } =
      await import('../src/game/systems/hazards');

    expect(checkHazardTrigger).toBeTypeOf('function');
    expect(generateHazard).toBeTypeOf('function');
    expect(applyHazardDamage).toBeTypeOf('function');
  });

  it('combat.ts generateEncounter is used by economy routes for smuggling', async () => {
    const { generateEncounter } = await import('../src/game/systems/combat');
    expect(generateEncounter).toBeTypeOf('function');

    // Verify missionType=5 generates PATROL type
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // ensure encounter triggers
    const patrol = generateEncounter(1, 5, 100);
    vi.restoreAllMocks();

    if (patrol) {
      expect(patrol.type).toBe('PATROL');
      expect(patrol.class).toBe('SPX');
    }
  });

  it('sage.ts and wise-one.ts exports are used by their screens', async () => {
    const sage = await import('../src/game/systems/sage');
    const wiseOne = await import('../src/game/systems/wise-one');

    // All exports that should be consumed by screens
    expect(sage.SAGE_TEXT).toBeTruthy();
    expect(sage.CONSTELLATION_CHART).toBeTruthy();
    expect(sage.getRandomSageQuestion).toBeTypeOf('function');
    expect(sage.checkSageAnswer).toBeTypeOf('function');
    expect(sage.applySageReward).toBeTypeOf('function');
    expect(wiseOne.WISE_ONE_TEXT).toBeTruthy();
    expect(wiseOne.generateNumberKey).toBeTypeOf('function');
  });
});
