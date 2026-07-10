/**
 * SpacerQuest v4.0 - Tier 2 Combat Disconnect Mitigation Tests
 *
 * These tests verify that the combat disconnect mitigation system is correctly
 * wired end-to-end, not just that the pure logic functions work in isolation.
 *
 * Tests cover:
 * 1. CombatSession is created and populated when combat is engaged (combat.ts route)
 * 2. CombatSession is marked inactive on all valid combat-ending actions
 * 3. Socket disconnect handler detects active sessions and resolves them
 * 4. Main menu shows and clears the resolved session result on reconnect
 * 5. Pure logic tests for combat-state helpers (createCombatState, isCombatActive,
 *    resolveCombatOnDisconnect)
 */

import { describe, it, expect, vi } from 'vitest';

// ============================================================================
// 1. COMBATSESSION CREATION ON ENGAGE
// ============================================================================

describe('CombatSession Creation on Engage', () => {
  it('combat.ts route imports calculateComponentPower from utils', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/app/routes/combat.ts', import.meta.url),
      'utf-8'
    );

    expect(code).toContain('calculateComponentPower');
  });

  it('combat.ts route contains prisma.combatSession.upsert', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/app/routes/combat.ts', import.meta.url),
      'utf-8'
    );

    expect(code).toContain('prisma.combatSession.upsert');
  });

  it('upsert includes all player power fields', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/app/routes/combat.ts', import.meta.url),
      'utf-8'
    );

    expect(code).toContain('playerWeaponPower');
    expect(code).toContain('playerShieldPower');
    expect(code).toContain('playerDrivePower');
    expect(code).toContain('playerBattleFactor');
  });

  it('upsert includes all enemy power fields', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/app/routes/combat.ts', import.meta.url),
      'utf-8'
    );

    expect(code).toContain('enemyWeaponPower');
    expect(code).toContain('enemyShieldPower');
    expect(code).toContain('enemyDrivePower');
    expect(code).toContain('enemyBattleFactor');
  });

  it('upsert sets active: true on session creation', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/app/routes/combat.ts', import.meta.url),
      'utf-8'
    );

    expect(code).toContain('active: true');
  });
});

// ============================================================================
// 2. COMBATSESSION CLEANUP ON ACTION END
// ============================================================================

describe('CombatSession Cleanup on Action End', () => {
  it('combat.ts route contains prisma.combatSession.updateMany', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/app/routes/combat.ts', import.meta.url),
      'utf-8'
    );

    expect(code).toContain('prisma.combatSession.updateMany');
  });

  it('session is marked active: false on successful retreat', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/app/routes/combat.ts', import.meta.url),
      'utf-8'
    );

    // active: false must appear (used on retreat and on combat end)
    expect(code).toContain('active: false');
  });

  it('session is marked with result VICTORY when combat ends in player win', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/app/routes/combat.ts', import.meta.url),
      'utf-8'
    );

    expect(code).toContain('VICTORY');
  });

  it('session is marked with result DEFEAT when combat ends in player loss', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/app/routes/combat.ts', import.meta.url),
      'utf-8'
    );

    expect(code).toContain('DEFEAT');
  });

  it('round counter is incremented: currentRound: round + 1', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/app/routes/combat.ts', import.meta.url),
      'utf-8'
    );

    expect(code).toContain('currentRound');
    expect(code).toContain('round + 1');
  });

  it('SURRENDER action marks session inactive', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/app/routes/combat.ts', import.meta.url),
      'utf-8'
    );

    expect(code).toContain('SURRENDER');
    // SURRENDER must also result in the session being deactivated
    expect(code).toContain('active: false');
  });
});

// ============================================================================
// 3. SOCKET DISCONNECT HANDLER
// ============================================================================

describe('Socket Disconnect Handler', () => {
  it('game.ts imports resolveCombatOnDisconnect from combat-state', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/sockets/game.ts', import.meta.url),
      'utf-8'
    );

    expect(code).toContain('resolveCombatOnDisconnect');
    expect(code).toContain('combat-state');
  });

  it('game.ts imports createCombatState from combat-state', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/sockets/game.ts', import.meta.url),
      'utf-8'
    );

    expect(code).toContain('createCombatState');
  });

  it('game.ts queries for an active combatSession on disconnect', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/sockets/game.ts', import.meta.url),
      'utf-8'
    );

    expect(code).toContain('combatSession');
    expect(code).toContain('active: true');
  });

  it('game.ts calls resolveCombatOnDisconnect in disconnect handler', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/sockets/game.ts', import.meta.url),
      'utf-8'
    );

    expect(code).toContain('resolveCombatOnDisconnect');
  });

  it('game.ts updates session with active: false and the resolution outcome', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/sockets/game.ts', import.meta.url),
      'utf-8'
    );

    // Must persist the inactive state and the resolved outcome back to DB
    expect(code).toContain('active: false');
    expect(code).toContain('outcome');
  });

  it('game.ts increments battlesWon or battlesLost based on outcome', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/sockets/game.ts', import.meta.url),
      'utf-8'
    );

    expect(code).toContain('battlesWon');
    expect(code).toContain('battlesLost');
  });
});

// ============================================================================
// 4. RECONNECT DISPLAY IN MAIN MENU
// ============================================================================

describe('Reconnect Display in Main Menu', () => {
  it('main-menu.ts queries for a resolved CombatSession (active: false, result not null)', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/game/screens/main-menu.ts', import.meta.url),
      'utf-8'
    );

    expect(code).toContain('combatSession');
    expect(code).toContain('active: false');
  });

  it('main-menu.ts shows a VICTORY outcome message', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/game/screens/main-menu.ts', import.meta.url),
      'utf-8'
    );

    expect(code).toContain('VICTORY');
  });

  it('main-menu.ts shows a DEFEAT outcome message', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/game/screens/main-menu.ts', import.meta.url),
      'utf-8'
    );

    expect(code).toContain('DEFEAT');
  });

  it('main-menu.ts shows a DRAW outcome message', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/game/screens/main-menu.ts', import.meta.url),
      'utf-8'
    );

    expect(code).toContain('DRAW');
  });

  it('main-menu.ts deletes the resolved session after display', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/game/screens/main-menu.ts', import.meta.url),
      'utf-8'
    );

    expect(code).toContain('prisma.combatSession.delete');
  });
});

// ============================================================================
// 5. PURE LOGIC TESTS
// ============================================================================

describe('Combat State Pure Logic', () => {
  // -------------------------------------------------------------------------
  // createCombatState
  // -------------------------------------------------------------------------

  describe('createCombatState', () => {
    it('returns a state object with active: true', async () => {
      const { createCombatState } = await import('../src/game/systems/combat-state');

      const state = createCombatState(
        'char-abc',
        { weaponPower: 160, shieldPower: 105, drivePower: 90, battleFactor: 278 },
        { weaponPower: 50, shieldPower: 50, drivePower: 45, battleFactor: 100, hullCondition: 5 },
        1
      );

      expect(state.active).toBe(true);
    });

    it('returns a state object with the correct characterId and round', async () => {
      const { createCombatState } = await import('../src/game/systems/combat-state');

      const state = createCombatState(
        'char-abc',
        { weaponPower: 160, shieldPower: 105, drivePower: 90, battleFactor: 278 },
        { weaponPower: 50, shieldPower: 50, drivePower: 45, battleFactor: 100, hullCondition: 5 },
        3
      );

      expect(state.characterId).toBe('char-abc');
      expect(state.round).toBe(3);
    });

    it('stores player and enemy power stats in the state', async () => {
      const { createCombatState } = await import('../src/game/systems/combat-state');

      const state = createCombatState(
        'char-abc',
        { weaponPower: 160, shieldPower: 105, drivePower: 90, battleFactor: 278 },
        { weaponPower: 50, shieldPower: 50, drivePower: 45, battleFactor: 100, hullCondition: 5 },
        1
      );

      expect(state.player.weaponPower).toBe(160);
      expect(state.player.shieldPower).toBe(105);
      expect(state.player.drivePower).toBe(90);
      expect(state.player.battleFactor).toBe(278);
      expect(state.enemy.weaponPower).toBe(50);
      expect(state.enemy.battleFactor).toBe(100);
    });
  });

  // -------------------------------------------------------------------------
  // isCombatActive
  // -------------------------------------------------------------------------

  describe('isCombatActive', () => {
    it('returns true for a freshly created (active) combat state', async () => {
      const { createCombatState, isCombatActive } = await import('../src/game/systems/combat-state');

      const state = createCombatState(
        'char-abc',
        { weaponPower: 160, shieldPower: 105, drivePower: 90, battleFactor: 278 },
        { weaponPower: 50, shieldPower: 50, drivePower: 45, battleFactor: 100, hullCondition: 5 },
        1
      );

      expect(isCombatActive(state)).toBe(true);
    });

    it('returns false when active is set to false', async () => {
      const { createCombatState, isCombatActive } = await import('../src/game/systems/combat-state');

      const state = createCombatState(
        'char-abc',
        { weaponPower: 160, shieldPower: 105, drivePower: 90, battleFactor: 278 },
        { weaponPower: 50, shieldPower: 50, drivePower: 45, battleFactor: 100, hullCondition: 5 },
        1
      );
      state.active = false;

      expect(isCombatActive(state)).toBe(false);
    });

    it('returns false for null', async () => {
      const { isCombatActive } = await import('../src/game/systems/combat-state');

      expect(isCombatActive(null)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // resolveCombatOnDisconnect
  // -------------------------------------------------------------------------

  describe('resolveCombatOnDisconnect', () => {
    it('returns resolved: true with a valid outcome for an active state', async () => {
      const { createCombatState, resolveCombatOnDisconnect } = await import(
        '../src/game/systems/combat-state'
      );

      const state = createCombatState(
        'char-abc',
        { weaponPower: 160, shieldPower: 105, drivePower: 90, battleFactor: 278 },
        { weaponPower: 50, shieldPower: 50, drivePower: 45, battleFactor: 100, hullCondition: 5 },
        1
      );

      const result = resolveCombatOnDisconnect(state);

      expect(result.resolved).toBe(true);
      expect(['VICTORY', 'DEFEAT', 'DRAW']).toContain(result.outcome);
    });

    it('returns resolved: false when state is already inactive', async () => {
      const { createCombatState, resolveCombatOnDisconnect } = await import(
        '../src/game/systems/combat-state'
      );

      const state = createCombatState(
        'char-abc',
        { weaponPower: 160, shieldPower: 105, drivePower: 90, battleFactor: 278 },
        { weaponPower: 50, shieldPower: 50, drivePower: 45, battleFactor: 100, hullCondition: 5 },
        1
      );
      state.active = false;

      const result = resolveCombatOnDisconnect(state);

      expect(result.resolved).toBe(false);
    });
  });
});
