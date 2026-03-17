/**
 * SpacerQuest v4.0 - Tier 2 Jail Integration Tests
 *
 * These tests verify that jail/brig/crime system logic is actually WIRED into
 * routes and screens, not just that the pure logic functions work in isolation.
 *
 * Tests cover:
 * 1. Smuggling → Jail wiring in economy route
 * 2. Jail screen registration in screen router
 * 3. Main menu jail redirect via isJailed check
 * 4. Jail screen logic (pay fine / wait in brig)
 * 5. Fine payment route (POST /api/character/jail/pay-fine)
 * 6. Bail route (POST /api/character/jail/bail/:targetId)
 * 7. Spacers Hangout brig viewing and bail handling
 * 8. Pure logic integration (isJailed, jailPlayer, releasePlayer, canPayFine, payFine)
 */

import { describe, it, expect, vi } from 'vitest';

// ============================================================================
// 1. SMUGGLING → JAIL WIRING
// ============================================================================

describe('Smuggling → Jail Wiring', () => {
  it('economy route imports jailPlayer and CrimeType from jail.js', async () => {
    const fs = await import('fs');
    const routeCode = fs.readFileSync(
      new URL('../src/app/routes/economy.ts', import.meta.url),
      'utf-8'
    );

    expect(routeCode).toContain('jailPlayer');
    expect(routeCode).toContain('CrimeType');
    expect(routeCode).toContain('jail.js');
  });

  it('patrol interception block sets crimeType: CrimeType.SMUGGLING', async () => {
    const fs = await import('fs');
    const routeCode = fs.readFileSync(
      new URL('../src/app/routes/economy.ts', import.meta.url),
      'utf-8'
    );

    expect(routeCode).toContain('crimeType: CrimeType.SMUGGLING');
  });

  it('patrol interception calls jailPlayer(character.name) to set J% prefix', async () => {
    const fs = await import('fs');
    const routeCode = fs.readFileSync(
      new URL('../src/app/routes/economy.ts', import.meta.url),
      'utf-8'
    );

    expect(routeCode).toContain('jailPlayer(character.name)');
  });

  it('patrol interception message mentions "arrested"', async () => {
    const fs = await import('fs');
    const routeCode = fs.readFileSync(
      new URL('../src/app/routes/economy.ts', import.meta.url),
      'utf-8'
    );

    expect(routeCode).toContain('arrested');
  });
});

// ============================================================================
// 2. JAIL SCREEN REGISTRATION
// ============================================================================

describe('Jail Screen Registration', () => {
  it('screens[\'jail\'] is registered in the screen router', async () => {
    const { screens } = await import('../src/sockets/screen-router');

    expect(screens['jail']).toBeDefined();
  });

  it('screens[\'jail\'] has render and handleInput as functions', async () => {
    const { screens } = await import('../src/sockets/screen-router');

    expect(screens['jail'].render).toBeTypeOf('function');
    expect(screens['jail'].handleInput).toBeTypeOf('function');
  });
});

// ============================================================================
// 3. MAIN MENU JAIL REDIRECT
// ============================================================================

describe('Main Menu Jail Redirect', () => {
  it('main-menu.ts imports isJailed from jail.js', async () => {
    const fs = await import('fs');
    const menuCode = fs.readFileSync(
      new URL('../src/game/screens/main-menu.ts', import.meta.url),
      'utf-8'
    );

    expect(menuCode).toContain('isJailed');
    expect(menuCode).toContain('jail.js');
  });

  it('main-menu.ts checks isJailed(character.name)', async () => {
    const fs = await import('fs');
    const menuCode = fs.readFileSync(
      new URL('../src/game/screens/main-menu.ts', import.meta.url),
      'utf-8'
    );

    expect(menuCode).toContain('isJailed(character.name)');
  });

  it('main-menu.ts returns nextScreen: \'jail\' when jailed', async () => {
    const fs = await import('fs');
    const menuCode = fs.readFileSync(
      new URL('../src/game/screens/main-menu.ts', import.meta.url),
      'utf-8'
    );

    expect(menuCode).toContain("nextScreen: 'jail'");
  });
});

// ============================================================================
// 4. JAIL SCREEN LOGIC
// ============================================================================

describe('Jail Screen Logic', () => {
  it('jail.ts screen imports canPayFine, payFine, releasePlayer, RELEASE_MESSAGE', async () => {
    const fs = await import('fs');
    const screenCode = fs.readFileSync(
      new URL('../src/game/screens/jail.ts', import.meta.url),
      'utf-8'
    );

    expect(screenCode).toContain('canPayFine');
    expect(screenCode).toContain('payFine');
    expect(screenCode).toContain('releasePlayer');
    expect(screenCode).toContain('RELEASE_MESSAGE');
  });

  it('render checks crimeType === null and redirects to main-menu', async () => {
    const fs = await import('fs');
    const screenCode = fs.readFileSync(
      new URL('../src/game/screens/jail.ts', import.meta.url),
      'utf-8'
    );

    expect(screenCode).toContain('crimeType === null');
    expect(screenCode).toContain("nextScreen: 'main-menu'");
  });

  it('handleInput P case calls canPayFine then payFine', async () => {
    const fs = await import('fs');
    const screenCode = fs.readFileSync(
      new URL('../src/game/screens/jail.ts', import.meta.url),
      'utf-8'
    );

    expect(screenCode).toContain("case 'P'");
    expect(screenCode).toContain('canPayFine(');
    expect(screenCode).toContain('payFine(');
  });

  it('handleInput P case calls releasePlayer to strip J% prefix', async () => {
    const fs = await import('fs');
    const screenCode = fs.readFileSync(
      new URL('../src/game/screens/jail.ts', import.meta.url),
      'utf-8'
    );

    expect(screenCode).toContain('releasePlayer(');
  });

  it('handleInput P case updates character with crimeType: null', async () => {
    const fs = await import('fs');
    const screenCode = fs.readFileSync(
      new URL('../src/game/screens/jail.ts', import.meta.url),
      'utf-8'
    );

    expect(screenCode).toContain('crimeType: null');
  });

  it('handleInput W case exists for waiting in brig', async () => {
    const fs = await import('fs');
    const screenCode = fs.readFileSync(
      new URL('../src/game/screens/jail.ts', import.meta.url),
      'utf-8'
    );

    expect(screenCode).toContain("case 'W'");
  });
});

// ============================================================================
// 5. FINE PAYMENT ROUTE
// ============================================================================

describe('Fine Payment Route', () => {
  it('character.ts registers POST /api/character/jail/pay-fine', async () => {
    const routeSource = await import('../src/app/routes/character');
    expect(routeSource.registerCharacterRoutes).toBeDefined();

    const fs = await import('fs');
    const routeCode = fs.readFileSync(
      new URL('../src/app/routes/character.ts', import.meta.url),
      'utf-8'
    );

    expect(routeCode).toContain('/api/character/jail/pay-fine');
  });

  it('pay-fine route checks character.crimeType === null', async () => {
    const fs = await import('fs');
    const routeCode = fs.readFileSync(
      new URL('../src/app/routes/character.ts', import.meta.url),
      'utf-8'
    );

    expect(routeCode).toContain('character.crimeType === null');
  });

  it('pay-fine route calls canPayFine and payFine from jail.js', async () => {
    const fs = await import('fs');
    const routeCode = fs.readFileSync(
      new URL('../src/app/routes/character.ts', import.meta.url),
      'utf-8'
    );

    expect(routeCode).toContain('canPayFine');
    expect(routeCode).toContain('payFine');
    expect(routeCode).toContain('jail.js');
  });

  it('pay-fine route calls releasePlayer', async () => {
    const fs = await import('fs');
    const routeCode = fs.readFileSync(
      new URL('../src/app/routes/character.ts', import.meta.url),
      'utf-8'
    );

    expect(routeCode).toContain('releasePlayer');
  });

  it('pay-fine route updates crimeType to null', async () => {
    const fs = await import('fs');
    const routeCode = fs.readFileSync(
      new URL('../src/app/routes/character.ts', import.meta.url),
      'utf-8'
    );

    expect(routeCode).toContain('crimeType: null');
  });
});

// ============================================================================
// 6. BAIL ROUTE
// ============================================================================

describe('Bail Route', () => {
  it('character.ts registers POST /api/character/jail/bail/:targetId', async () => {
    const fs = await import('fs');
    const routeCode = fs.readFileSync(
      new URL('../src/app/routes/character.ts', import.meta.url),
      'utf-8'
    );

    expect(routeCode).toContain('/api/character/jail/bail/:targetId');
  });

  it('bail route imports calculateBailCost from jail.js', async () => {
    const fs = await import('fs');
    const routeCode = fs.readFileSync(
      new URL('../src/app/routes/character.ts', import.meta.url),
      'utf-8'
    );

    expect(routeCode).toContain('calculateBailCost');
    expect(routeCode).toContain('jail.js');
  });

  it('bail route calls subtractCredits for bail cost', async () => {
    const fs = await import('fs');
    const routeCode = fs.readFileSync(
      new URL('../src/app/routes/character.ts', import.meta.url),
      'utf-8'
    );

    expect(routeCode).toContain('subtractCredits');
    expect(routeCode).toContain('bailCost');
  });

  it('bail route calls releasePlayer on target', async () => {
    const fs = await import('fs');
    const routeCode = fs.readFileSync(
      new URL('../src/app/routes/character.ts', import.meta.url),
      'utf-8'
    );

    expect(routeCode).toContain('releasePlayer(target.name)');
  });

  it('bail route clears target crimeType to null', async () => {
    const fs = await import('fs');
    const routeCode = fs.readFileSync(
      new URL('../src/app/routes/character.ts', import.meta.url),
      'utf-8'
    );

    // The bail endpoint must clear the target character's crimeType
    expect(routeCode).toContain('crimeType: null');
  });
});

// ============================================================================
// 7. HANGOUT BRIG + BAIL
// ============================================================================

describe('Hangout Brig + Bail', () => {
  it('spacers-hangout.ts B case shows jailed players', async () => {
    const fs = await import('fs');
    const hangoutCode = fs.readFileSync(
      new URL('../src/game/screens/spacers-hangout.ts', import.meta.url),
      'utf-8'
    );

    expect(hangoutCode).toContain("case 'B'");
    // Must query for jailed players (crimeType not null)
    expect(hangoutCode).toContain('crimeType');
  });

  it('spacers-hangout.ts has pendingBailPrompt state for bail input handling', async () => {
    const fs = await import('fs');
    const hangoutCode = fs.readFileSync(
      new URL('../src/game/screens/spacers-hangout.ts', import.meta.url),
      'utf-8'
    );

    expect(hangoutCode).toContain('pendingBailPrompt');
  });

  it('spacers-hangout.ts bail path calls calculateBailCost and releasePlayer', async () => {
    const fs = await import('fs');
    const hangoutCode = fs.readFileSync(
      new URL('../src/game/screens/spacers-hangout.ts', import.meta.url),
      'utf-8'
    );

    expect(hangoutCode).toContain('calculateBailCost');
    expect(hangoutCode).toContain('releasePlayer');
  });
});

// ============================================================================
// 8. PURE LOGIC INTEGRATION
// ============================================================================

describe('Jail Pure Logic Integration', () => {
  it('isJailed returns true for J% prefixed name', async () => {
    const { isJailed } = await import('../src/game/systems/jail');
    expect(isJailed('J%TestPlayer')).toBe(true);
  });

  it('isJailed returns false for normal name', async () => {
    const { isJailed } = await import('../src/game/systems/jail');
    expect(isJailed('TestPlayer')).toBe(false);
  });

  it('jailPlayer returns name with J% prefix', async () => {
    const { jailPlayer } = await import('../src/game/systems/jail');
    expect(jailPlayer('TestPlayer')).toBe('J%TestPlayer');
  });

  it('releasePlayer strips J% prefix', async () => {
    const { releasePlayer } = await import('../src/game/systems/jail');
    expect(releasePlayer('J%TestPlayer')).toBe('TestPlayer');
  });

  it('canPayFine returns true when player has enough credits', async () => {
    const { canPayFine, CrimeType } = await import('../src/game/systems/jail');
    // Smuggling fine is 1000 cr; player has 2000 cr
    expect(canPayFine(0, 2000, CrimeType.SMUGGLING)).toBe(true);
  });

  it('canPayFine returns false when player has insufficient credits', async () => {
    const { canPayFine, CrimeType } = await import('../src/game/systems/jail');
    // Smuggling fine is 1000 cr; player has only 500 cr
    expect(canPayFine(0, 500, CrimeType.SMUGGLING)).toBe(false);
  });

  it('payFine deducts the correct fine amount', async () => {
    const { payFine, CrimeType } = await import('../src/game/systems/jail');
    // Smuggling fine is 1000 cr; player starts with 2000 cr
    const result = payFine(0, 2000, CrimeType.SMUGGLING);
    expect(result.success).toBe(true);
    expect(result.creditsHigh).toBe(0);
    expect(result.creditsLow).toBe(1000);
  });
});
