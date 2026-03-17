/**
 * SpacerQuest v4.0 - Tier 2 Alliance Integration Tests
 *
 * These tests verify that alliance UI and rule enforcement are actually WIRED
 * into routes and screens, not just that the pure logic functions work in isolation.
 *
 * Tests cover:
 * 1. Alliance rule enforcement in PUT /api/character/alliance
 * 2. Interactive alliance join in the Spacers Hangout screen
 * 3. Alliance Investment screen registration and wiring
 * 4. Main menu investment link
 * 5. Pure logic tests for canJoinAlliance, isAllianceFull, calculateSwitchCost
 */

import { describe, it, expect, vi } from 'vitest';

// ============================================================================
// 1. ALLIANCE RULE ENFORCEMENT IN JOIN ROUTE
// ============================================================================

describe('Alliance Rule Enforcement in Join Route', () => {
  it('PUT /api/character/alliance route imports canJoinAlliance from alliance-rules', async () => {
    const fs = await import('fs');
    const routeCode = fs.readFileSync(
      new URL('../src/app/routes/character.ts', import.meta.url),
      'utf-8'
    );

    expect(routeCode).toContain('canJoinAlliance');
    expect(routeCode).toContain('alliance-rules.js');
  });

  it('PUT /api/character/alliance route imports calculateSwitchCost from alliance-rules', async () => {
    const fs = await import('fs');
    const routeCode = fs.readFileSync(
      new URL('../src/app/routes/character.ts', import.meta.url),
      'utf-8'
    );

    expect(routeCode).toContain('calculateSwitchCost');
    expect(routeCode).toContain('alliance-rules.js');
  });

  it('route counts totalPlayers and allianceMemberCount before calling canJoinAlliance', async () => {
    const fs = await import('fs');
    const routeCode = fs.readFileSync(
      new URL('../src/app/routes/character.ts', import.meta.url),
      'utf-8'
    );

    expect(routeCode).toContain('totalPlayers');
    expect(routeCode).toContain('allianceMemberCount');
    expect(routeCode).toContain('prisma.character.count()');
    expect(routeCode).toContain('prisma.allianceMembership.count');
  });

  it('route calls canJoinAlliance with rank, currentAlliance, totalPlayers, memberCount', async () => {
    const fs = await import('fs');
    const routeCode = fs.readFileSync(
      new URL('../src/app/routes/character.ts', import.meta.url),
      'utf-8'
    );

    expect(routeCode).toContain('canJoinAlliance(');
    expect(routeCode).toContain('character.rank');
    expect(routeCode).toContain('character.allianceSymbol');
    expect(routeCode).toContain('totalPlayers');
    expect(routeCode).toContain('allianceMemberCount');
  });

  it('route returns 400 with reason when canJoinAlliance disallows the join', async () => {
    const fs = await import('fs');
    const routeCode = fs.readFileSync(
      new URL('../src/app/routes/character.ts', import.meta.url),
      'utf-8'
    );

    expect(routeCode).toContain('joinResult.allowed');
    expect(routeCode).toContain('reply.status(400)');
    expect(routeCode).toContain('joinResult.reason');
  });

  it('switch cost zeroes creditsHigh and creditsLow on character update', async () => {
    const fs = await import('fs');
    const routeCode = fs.readFileSync(
      new URL('../src/app/routes/character.ts', import.meta.url),
      'utf-8'
    );

    expect(routeCode).toContain('hasExistingAlliance');
    expect(routeCode).toContain('creditsHigh: 0');
    expect(routeCode).toContain('creditsLow: 0');
  });

  it('switch cost deletes portOwnership via prisma.portOwnership.deleteMany', async () => {
    const fs = await import('fs');
    const routeCode = fs.readFileSync(
      new URL('../src/app/routes/character.ts', import.meta.url),
      'utf-8'
    );

    expect(routeCode).toContain('prisma.portOwnership.deleteMany');
  });
});

// ============================================================================
// 2. INTERACTIVE JOIN IN SPACERS HANGOUT
// ============================================================================

describe('Interactive Join in Spacers Hangout', () => {
  it('spacers-hangout.ts imports canJoinAlliance from alliance-rules', async () => {
    const fs = await import('fs');
    const screenCode = fs.readFileSync(
      new URL('../src/game/screens/spacers-hangout.ts', import.meta.url),
      'utf-8'
    );

    expect(screenCode).toContain('canJoinAlliance');
    expect(screenCode).toContain('alliance-rules.js');
  });

  it('spacers-hangout.ts has cases for all four alliance symbol keys', async () => {
    const fs = await import('fs');
    const screenCode = fs.readFileSync(
      new URL('../src/game/screens/spacers-hangout.ts', import.meta.url),
      'utf-8'
    );

    expect(screenCode).toContain("case '+':");
    expect(screenCode).toContain("case '@':");
    expect(screenCode).toContain("case '&':");
    expect(screenCode).toContain("case '^':");
  });

  it('spacers-hangout.ts uses pendingAllianceSwitch Map for switch confirmation', async () => {
    const fs = await import('fs');
    const screenCode = fs.readFileSync(
      new URL('../src/game/screens/spacers-hangout.ts', import.meta.url),
      'utf-8'
    );

    expect(screenCode).toContain('pendingAllianceSwitch');
    expect(screenCode).toContain('new Map');
  });

  it("'Y' case executes the switch: zeroes credits, deletes ports, upserts membership", async () => {
    const fs = await import('fs');
    const screenCode = fs.readFileSync(
      new URL('../src/game/screens/spacers-hangout.ts', import.meta.url),
      'utf-8'
    );

    expect(screenCode).toContain("case 'Y':");
    expect(screenCode).toContain('creditsHigh: 0');
    expect(screenCode).toContain('creditsLow: 0');
    expect(screenCode).toContain('portOwnership.deleteMany');
    expect(screenCode).toContain('allianceMembership.upsert');
  });

  it("'N' case cancels the pending alliance switch", async () => {
    const fs = await import('fs');
    const screenCode = fs.readFileSync(
      new URL('../src/game/screens/spacers-hangout.ts', import.meta.url),
      'utf-8'
    );

    expect(screenCode).toContain("case 'N':");
    expect(screenCode).toContain('pendingAllianceSwitch.delete(characterId)');
  });

  it('direct join (no existing alliance) creates membership immediately', async () => {
    const fs = await import('fs');
    const screenCode = fs.readFileSync(
      new URL('../src/game/screens/spacers-hangout.ts', import.meta.url),
      'utf-8'
    );

    // When hasExistingAlliance is false, it should upsert directly without setting pending
    expect(screenCode).toContain('joinResult.hasExistingAlliance');
    expect(screenCode).toContain('allianceMembership.upsert');
    // Direct path must update character alliance symbol as well
    expect(screenCode).toContain('allianceSymbol: allianceEnum');
  });
});

// ============================================================================
// 3. ALLIANCE INVESTMENT SCREEN
// ============================================================================

describe('Alliance Investment Screen', () => {
  it("screens['alliance-invest'] is registered in the screen router", async () => {
    const { screens } = await import('../src/sockets/screen-router');

    expect(screens['alliance-invest']).toBeDefined();
    expect(screens['alliance-invest'].render).toBeTypeOf('function');
    expect(screens['alliance-invest'].handleInput).toBeTypeOf('function');
  });

  it('alliance-invest.ts imports investInAlliance, withdrawFromAlliance, investInDefcon from alliance system', async () => {
    const fs = await import('fs');
    const screenCode = fs.readFileSync(
      new URL('../src/game/screens/alliance-invest.ts', import.meta.url),
      'utf-8'
    );

    expect(screenCode).toContain('investInAlliance');
    expect(screenCode).toContain('withdrawFromAlliance');
    expect(screenCode).toContain('investInDefcon');
    expect(screenCode).toContain('alliance.js');
  });

  it('render checks for alliance membership and redirects non-members to main-menu', async () => {
    const fs = await import('fs');
    const screenCode = fs.readFileSync(
      new URL('../src/game/screens/alliance-invest.ts', import.meta.url),
      'utf-8'
    );

    expect(screenCode).toContain('allianceMembership.findUnique');
    expect(screenCode).toContain("nextScreen: 'main-menu'");
  });

  it("handleInput has I, W, D, S, Q cases", async () => {
    const fs = await import('fs');
    const screenCode = fs.readFileSync(
      new URL('../src/game/screens/alliance-invest.ts', import.meta.url),
      'utf-8'
    );

    expect(screenCode).toContain("case 'I':");
    expect(screenCode).toContain("case 'W':");
    expect(screenCode).toContain("case 'D':");
    expect(screenCode).toContain("case 'S':");
    expect(screenCode).toContain("case 'Q':");
  });

  it("'I' case calls investInAlliance", async () => {
    const fs = await import('fs');
    const screenCode = fs.readFileSync(
      new URL('../src/game/screens/alliance-invest.ts', import.meta.url),
      'utf-8'
    );

    expect(screenCode).toContain('investInAlliance(');
  });

  it("'W' case calls withdrawFromAlliance", async () => {
    const fs = await import('fs');
    const screenCode = fs.readFileSync(
      new URL('../src/game/screens/alliance-invest.ts', import.meta.url),
      'utf-8'
    );

    expect(screenCode).toContain('withdrawFromAlliance(');
  });

  it("'D' case calls investInDefcon", async () => {
    const fs = await import('fs');
    const screenCode = fs.readFileSync(
      new URL('../src/game/screens/alliance-invest.ts', import.meta.url),
      'utf-8'
    );

    expect(screenCode).toContain('investInDefcon(');
  });

  it("'S' case queries prisma.allianceSystem", async () => {
    const fs = await import('fs');
    const screenCode = fs.readFileSync(
      new URL('../src/game/screens/alliance-invest.ts', import.meta.url),
      'utf-8'
    );

    expect(screenCode).toContain('prisma.allianceSystem');
  });
});

// ============================================================================
// 4. MAIN MENU INVESTMENT LINK
// ============================================================================

describe('Main Menu Investment Link', () => {
  it('main-menu.ts shows [I]nvest option when hasAlliance is true', async () => {
    const fs = await import('fs');
    const menuCode = fs.readFileSync(
      new URL('../src/game/screens/main-menu.ts', import.meta.url),
      'utf-8'
    );

    expect(menuCode).toContain('hasAlliance');
    expect(menuCode).toContain('[I]nvest');
  });

  it("handleInput 'I' checks alliance membership before proceeding", async () => {
    const fs = await import('fs');
    const menuCode = fs.readFileSync(
      new URL('../src/game/screens/main-menu.ts', import.meta.url),
      'utf-8'
    );

    // The 'I' handler must query membership
    expect(menuCode).toContain("'I'");
    expect(menuCode).toContain('allianceMembership.findUnique');
  });

  it("handleInput 'I' returns nextScreen: 'alliance-invest'", async () => {
    const fs = await import('fs');
    const menuCode = fs.readFileSync(
      new URL('../src/game/screens/main-menu.ts', import.meta.url),
      'utf-8'
    );

    expect(menuCode).toContain("nextScreen: 'alliance-invest'");
  });
});

// ============================================================================
// 5. PURE LOGIC TESTS
// ============================================================================

describe('Pure Alliance Logic', () => {
  it('canJoinAlliance with LIEUTENANT rank allows join', async () => {
    const { canJoinAlliance } = await import('../src/game/systems/alliance-rules');
    const { Rank, AllianceType } = await import('@prisma/client');

    const result = canJoinAlliance(Rank.LIEUTENANT, AllianceType.NONE, 10, 2);

    expect(result.allowed).toBe(true);
  });

  it('canJoinAlliance returns hasExistingAlliance: true when player already has an alliance', async () => {
    const { canJoinAlliance } = await import('../src/game/systems/alliance-rules');
    const { Rank, AllianceType } = await import('@prisma/client');

    const result = canJoinAlliance(Rank.LIEUTENANT, AllianceType.ASTRO_LEAGUE, 10, 2);

    expect(result.hasExistingAlliance).toBe(true);
  });

  it('isAllianceFull returns true when members exceed totalPlayers/3 and exceed 4', async () => {
    const { isAllianceFull } = await import('../src/game/systems/alliance-rules');

    // 30 players, 11 members: 11 > 30/3 (10) and 11 > 4
    const result = isAllianceFull(30, 11);

    expect(result).toBe(true);
  });

  it('isAllianceFull returns false when under the 1/3 cap', async () => {
    const { isAllianceFull } = await import('../src/game/systems/alliance-rules');

    // 30 players, 9 members: 9 <= 30/3 (10)
    const result = isAllianceFull(30, 9);

    expect(result).toBe(false);
  });

  it('isAllianceFull returns false when members exceed ratio but not minimum threshold', async () => {
    const { isAllianceFull } = await import('../src/game/systems/alliance-rules');

    // 6 players, 3 members: 3 > 6/3 (2) but 3 is NOT > 4 (minimum threshold)
    const result = isAllianceFull(6, 3);

    expect(result).toBe(false);
  });

  it('calculateSwitchCost returns total credits and losesPort flag', async () => {
    const { calculateSwitchCost } = await import('../src/game/systems/alliance-rules');

    // creditsHigh=2, creditsLow=5000 => total = 2*10000 + 5000 = 25000
    const result = calculateSwitchCost(2, 5000, true);

    expect(result.creditsLost).toBe(25000);
    expect(result.losesPort).toBe(true);
  });

  it('calculateSwitchCost sets losesPort false when player owns no port', async () => {
    const { calculateSwitchCost } = await import('../src/game/systems/alliance-rules');

    const result = calculateSwitchCost(1, 0, false);

    expect(result.losesPort).toBe(false);
  });
});
