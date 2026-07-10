/**
 * SpacerQuest v4.0 - Tier 2 Integration Tests: Bulletin Board System
 *
 * These tests verify that the bulletin board system is actually WIRED into
 * screens and routes, not just that the pure logic functions work in isolation.
 *
 * Tests cover:
 * 1. Screen registration (bulletin-board in screen router)
 * 2. Bulletin board screen wiring (imports, logic, input handlers)
 * 3. Alliance routes wiring (GET/POST/DELETE /api/alliance/board)
 * 4. App registration (registerAllianceRoutes imported and called)
 * 5. Hangout integration (bulletin board is linked via alliance menu)
 * 6. Pure logic tests (canAccessBoard, validateMessage, formatBulletinPost)
 */

import { describe, it, expect } from 'vitest';

// ============================================================================
// 1. SCREEN REGISTRATION
// ============================================================================

describe('Bulletin Board Screen Registration', () => {
  it('bulletin-board screen is registered in the screen router', async () => {
    const { screens } = await import('../src/sockets/screen-router');

    expect(screens['bulletin-board']).toBeDefined();
  });

  it('bulletin-board screen has required render and handleInput functions', async () => {
    const { screens } = await import('../src/sockets/screen-router');

    expect(screens['bulletin-board'].render).toBeTypeOf('function');
    expect(screens['bulletin-board'].handleInput).toBeTypeOf('function');
  });
});

// ============================================================================
// 2. BULLETIN BOARD SCREEN WIRING
// ============================================================================

describe('Bulletin Board Screen Wiring', () => {
  it('screen imports ALLIANCE_BOARD_NAMES and BOARD_HEADER from bulletin-board system', async () => {
    const fs = await import('fs');
    const screenCode = fs.readFileSync(
      new URL('../src/game/screens/bulletin-board.ts', import.meta.url),
      'utf-8'
    );

    expect(screenCode).toContain('ALLIANCE_BOARD_NAMES');
    expect(screenCode).toContain('BOARD_HEADER');
    expect(screenCode).toContain('bulletin-board.js');
  });

  it('screen imports validateMessage and formatBulletinPost', async () => {
    const fs = await import('fs');
    const screenCode = fs.readFileSync(
      new URL('../src/game/screens/bulletin-board.ts', import.meta.url),
      'utf-8'
    );

    expect(screenCode).toContain('validateMessage');
    expect(screenCode).toContain('formatBulletinPost');
  });

  it('render checks alliance membership and redirects non-members to main-menu', async () => {
    const fs = await import('fs');
    const screenCode = fs.readFileSync(
      new URL('../src/game/screens/bulletin-board.ts', import.meta.url),
      'utf-8'
    );

    // Must check membership exists and alliance is not NONE
    expect(screenCode).toContain('allianceMembership.findUnique');
    expect(screenCode).toContain('AllianceType.NONE');

    // Non-members must be redirected to main-menu (screen is now globally accessible)
    expect(screenCode).toContain("nextScreen: 'main-menu'");
  });

  it('render queries prisma.bulletinPost.findMany', async () => {
    const fs = await import('fs');
    const screenCode = fs.readFileSync(
      new URL('../src/game/screens/bulletin-board.ts', import.meta.url),
      'utf-8'
    );

    expect(screenCode).toContain('prisma.bulletinPost.findMany');
  });

  it('handleInput has R, W, K, Q cases', async () => {
    const fs = await import('fs');
    const screenCode = fs.readFileSync(
      new URL('../src/game/screens/bulletin-board.ts', import.meta.url),
      'utf-8'
    );

    expect(screenCode).toContain("case 'R':");
    expect(screenCode).toContain("case 'W':");
    expect(screenCode).toContain("case 'K':");
    expect(screenCode).toContain("case 'Q':");
  });

  it('W case uses pendingWrite Map for multi-step input', async () => {
    const fs = await import('fs');
    const screenCode = fs.readFileSync(
      new URL('../src/game/screens/bulletin-board.ts', import.meta.url),
      'utf-8'
    );

    expect(screenCode).toContain('pendingWrite');
    expect(screenCode).toContain('.set(characterId');
    expect(screenCode).toContain('.get(characterId');
  });

  it('W case calls validateMessage and formatBulletinPost', async () => {
    const fs = await import('fs');
    const screenCode = fs.readFileSync(
      new URL('../src/game/screens/bulletin-board.ts', import.meta.url),
      'utf-8'
    );

    expect(screenCode).toContain('validateMessage(message)');
    expect(screenCode).toContain('formatBulletinPost(');
  });

  it('W case creates post via prisma.bulletinPost.create', async () => {
    const fs = await import('fs');
    const screenCode = fs.readFileSync(
      new URL('../src/game/screens/bulletin-board.ts', import.meta.url),
      'utf-8'
    );

    expect(screenCode).toContain('prisma.bulletinPost.create');
  });

  it('K case uses pendingKill Map for confirmation', async () => {
    const fs = await import('fs');
    const screenCode = fs.readFileSync(
      new URL('../src/game/screens/bulletin-board.ts', import.meta.url),
      'utf-8'
    );

    expect(screenCode).toContain('pendingKill');
  });

  it('K case calls prisma.bulletinPost.deleteMany', async () => {
    const fs = await import('fs');
    const screenCode = fs.readFileSync(
      new URL('../src/game/screens/bulletin-board.ts', import.meta.url),
      'utf-8'
    );

    expect(screenCode).toContain('prisma.bulletinPost.deleteMany');
  });
});

// ============================================================================
// 3. ALLIANCE ROUTES WIRING
// ============================================================================

describe('Alliance Routes Wiring', () => {
  it('registerAllianceRoutes is exported from alliance routes', async () => {
    const routeSource = await import('../src/app/routes/alliance');
    expect(routeSource.registerAllianceRoutes).toBeDefined();
    expect(routeSource.registerAllianceRoutes).toBeTypeOf('function');
  });

  it('GET /api/alliance/board exists and checks membership', async () => {
    const fs = await import('fs');
    const routeCode = fs.readFileSync(
      new URL('../src/app/routes/alliance.ts', import.meta.url),
      'utf-8'
    );

    expect(routeCode).toContain("'/api/alliance/board'");
    expect(routeCode).toContain('allianceMembership.findUnique');
  });

  it('POST /api/alliance/board validates message and creates post', async () => {
    const fs = await import('fs');
    const routeCode = fs.readFileSync(
      new URL('../src/app/routes/alliance.ts', import.meta.url),
      'utf-8'
    );

    expect(routeCode).toContain('validateMessage');
    expect(routeCode).toContain('formatBulletinPost');
    expect(routeCode).toContain('prisma.bulletinPost.create');
  });

  it('DELETE /api/alliance/board deletes all posts for alliance', async () => {
    const fs = await import('fs');
    const routeCode = fs.readFileSync(
      new URL('../src/app/routes/alliance.ts', import.meta.url),
      'utf-8'
    );

    expect(routeCode).toContain('prisma.bulletinPost.deleteMany');
  });

  it('routes import canAccessBoard from bulletin-board system or check membership directly', async () => {
    const fs = await import('fs');
    const routeCode = fs.readFileSync(
      new URL('../src/app/routes/alliance.ts', import.meta.url),
      'utf-8'
    );

    // Routes either import canAccessBoard or perform their own membership check
    const importsCanAccessBoard = routeCode.includes('canAccessBoard');
    const checksMembershipDirectly = routeCode.includes('allianceMembership.findUnique');

    expect(importsCanAccessBoard || checksMembershipDirectly).toBe(true);
  });
});

// ============================================================================
// 4. APP REGISTRATION
// ============================================================================

describe('App Registration', () => {
  it('app/index.ts imports registerAllianceRoutes', async () => {
    const fs = await import('fs');
    const appCode = fs.readFileSync(
      new URL('../src/app/index.ts', import.meta.url),
      'utf-8'
    );

    expect(appCode).toContain('registerAllianceRoutes');
    expect(appCode).toContain('./routes/alliance.js');
  });

  it('app/index.ts calls registerAllianceRoutes', async () => {
    const fs = await import('fs');
    const appCode = fs.readFileSync(
      new URL('../src/app/index.ts', import.meta.url),
      'utf-8'
    );

    expect(appCode).toContain('await registerAllianceRoutes');
  });
});

// ============================================================================
// 5. HANGOUT INTEGRATION
// ============================================================================

describe('Hangout Integration', () => {
  it('spacers-hangout.ts routes to bulletin board from alliance info path', async () => {
    const fs = await import('fs');
    const hangoutCode = fs.readFileSync(
      new URL('../src/game/screens/spacers-hangout.ts', import.meta.url),
      'utf-8'
    );

    // Original SP.BAR.S:71 — alliance is accessed via Info (I) → typing "ALL"
    // inAllianceMenu state tracks when player is in alliance selection sub-menu
    // The (B) key from that sub-menu goes to bulletin-board (SP.TOP.S)
    expect(hangoutCode).toContain('inAllianceMenu');
    expect(hangoutCode).toContain("nextScreen: 'bulletin-board'");

    // Alliance names must appear (for display to player)
    expect(hangoutCode).toContain('Alliance');
  });

  it('bulletin-board Q key routes back to main-menu', async () => {
    const fs = await import('fs');
    const screenCode = fs.readFileSync(
      new URL('../src/game/screens/bulletin-board.ts', import.meta.url),
      'utf-8'
    );

    // Q must return nextScreen: 'main-menu' (screen is now globally accessible)
    expect(screenCode).toContain("nextScreen: 'main-menu'");
  });
});

// ============================================================================
// 6. PURE LOGIC TESTS
// ============================================================================

describe('Bulletin Board Pure Logic', () => {
  it('canAccessBoard returns true when player alliance matches board alliance', async () => {
    const { canAccessBoard } = await import('../src/game/systems/bulletin-board');
    const { AllianceType } = await import('@prisma/client');

    expect(canAccessBoard(AllianceType.ASTRO_LEAGUE, AllianceType.ASTRO_LEAGUE)).toBe(true);
    expect(canAccessBoard(AllianceType.SPACE_DRAGONS, AllianceType.SPACE_DRAGONS)).toBe(true);
    expect(canAccessBoard(AllianceType.WARLORD_CONFED, AllianceType.WARLORD_CONFED)).toBe(true);
    expect(canAccessBoard(AllianceType.REBEL_ALLIANCE, AllianceType.REBEL_ALLIANCE)).toBe(true);
  });

  it('canAccessBoard returns false when player has NONE alliance', async () => {
    const { canAccessBoard } = await import('../src/game/systems/bulletin-board');
    const { AllianceType } = await import('@prisma/client');

    expect(canAccessBoard(AllianceType.NONE, AllianceType.ASTRO_LEAGUE)).toBe(false);
    expect(canAccessBoard(AllianceType.NONE, AllianceType.SPACE_DRAGONS)).toBe(false);
  });

  it('canAccessBoard returns false when player alliance does not match board alliance', async () => {
    const { canAccessBoard } = await import('../src/game/systems/bulletin-board');
    const { AllianceType } = await import('@prisma/client');

    expect(canAccessBoard(AllianceType.ASTRO_LEAGUE, AllianceType.SPACE_DRAGONS)).toBe(false);
    expect(canAccessBoard(AllianceType.REBEL_ALLIANCE, AllianceType.WARLORD_CONFED)).toBe(false);
    expect(canAccessBoard(AllianceType.WARLORD_CONFED, AllianceType.ASTRO_LEAGUE)).toBe(false);
  });

  it('validateMessage returns invalid for empty string', async () => {
    const { validateMessage } = await import('../src/game/systems/bulletin-board');

    const result = validateMessage('');
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('validateMessage returns invalid for message exceeding 79 characters', async () => {
    const { validateMessage } = await import('../src/game/systems/bulletin-board');

    const longMessage = 'A'.repeat(80);
    const result = validateMessage(longMessage);
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('validateMessage returns valid for a normal message', async () => {
    const { validateMessage } = await import('../src/game/systems/bulletin-board');

    const result = validateMessage('Hello fellow spacers!');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('validateMessage accepts a message of exactly 79 characters', async () => {
    const { validateMessage } = await import('../src/game/systems/bulletin-board');

    const maxMessage = 'A'.repeat(79);
    const result = validateMessage(maxMessage);
    expect(result.valid).toBe(true);
  });

  it('formatBulletinPost includes the player name and message', async () => {
    const { formatBulletinPost } = await import('../src/game/systems/bulletin-board');

    const formatted = formatBulletinPost('Zephyr', 'Meet at Polaris-1');
    expect(formatted).toContain('Zephyr');
    expect(formatted).toContain('Meet at Polaris-1');
  });

  it('formatBulletinPost includes a date prefix', async () => {
    const { formatBulletinPost } = await import('../src/game/systems/bulletin-board');

    const formatted = formatBulletinPost('Zephyr', 'Alliance attack at dawn!');
    // Date must appear before the player name (format: "date: name: message")
    const colonIndex = formatted.indexOf(':');
    expect(colonIndex).toBeGreaterThan(0);
    expect(formatted).toMatch(/^.+:.+:.+/);
  });
});

// ============================================================================
// CROSS-CUTTING: VERIFY EXPORTS ARE CALLABLE
// ============================================================================

describe('Bulletin Board System Exports', () => {
  it('bulletin-board.ts exports are all defined and callable', async () => {
    const bulletinBoard = await import('../src/game/systems/bulletin-board');

    expect(bulletinBoard.canAccessBoard).toBeTypeOf('function');
    expect(bulletinBoard.validateMessage).toBeTypeOf('function');
    expect(bulletinBoard.formatBulletinPost).toBeTypeOf('function');
    expect(bulletinBoard.ALLIANCE_BOARD_NAMES).toBeTruthy();
    expect(bulletinBoard.BOARD_HEADER).toBeTruthy();
    expect(bulletinBoard.MAX_MESSAGE_LENGTH).toBe(79);
  });
});
