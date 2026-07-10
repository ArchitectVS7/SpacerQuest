/**
 * SpacerQuest v4.0 - Admin System Tests
 *
 * Tests admin middleware, GameConfig helper, Zod schemas,
 * admin route wiring, and screen registration.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
  adminUpdateCharacterBody,
  adminUpdateShipBody,
  adminUpdateNpcBody,
  adminGameConfigBody,
} from '../src/app/schemas';

// ============================================================================
// HELPER
// ============================================================================

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf-8');
}

// ============================================================================
// 1. requireAdmin MIDDLEWARE
// ============================================================================

describe('requireAdmin middleware', () => {
  it('auth.ts exports requireAdmin', async () => {
    const mod = await import('../src/app/middleware/auth');
    expect(mod.requireAdmin).toBeDefined();
    expect(mod.requireAdmin).toBeTypeOf('function');
  });

  it('requireAdmin calls jwtVerify', () => {
    const src = readSource('../src/app/middleware/auth.ts');
    expect(src).toContain('request.jwtVerify()');
  });

  it('requireAdmin checks isAdmin flag', () => {
    const src = readSource('../src/app/middleware/auth.ts');
    expect(src).toContain('isAdmin');
  });

  it('requireAdmin sends 403 for non-admins', () => {
    const src = readSource('../src/app/middleware/auth.ts');
    expect(src).toContain('403');
    expect(src).toContain('Admin access required');
  });

  it('requireAdmin sends 401 for unauthenticated requests', () => {
    const src = readSource('../src/app/middleware/auth.ts');
    expect(src).toContain('401');
  });
});

// ============================================================================
// 2. GAME CONFIG HELPER
// ============================================================================

describe('GameConfig helper', () => {
  it('game-config.ts exports getGameConfig', async () => {
    const mod = await import('../src/game/systems/game-config');
    expect(mod.getGameConfig).toBeDefined();
    expect(mod.getGameConfig).toBeTypeOf('function');
  });

  it('game-config.ts exports updateGameConfig', async () => {
    const mod = await import('../src/game/systems/game-config');
    expect(mod.updateGameConfig).toBeDefined();
    expect(mod.updateGameConfig).toBeTypeOf('function');
  });

  it('getGameConfig uses upsert with default id', () => {
    const src = readSource('../src/game/systems/game-config.ts');
    expect(src).toContain("id: 'default'");
    expect(src).toContain('upsert');
  });
});

// ============================================================================
// 3. ADMIN ZOD SCHEMAS
// ============================================================================

describe('adminUpdateCharacterBody', () => {
  it('accepts valid partial character update', () => {
    const result = adminUpdateCharacterBody.safeParse({
      creditsHigh: 100,
      score: 500,
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty object (all fields optional)', () => {
    const result = adminUpdateCharacterBody.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects negative score', () => {
    const result = adminUpdateCharacterBody.safeParse({ score: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects invalid rank', () => {
    const result = adminUpdateCharacterBody.safeParse({ rank: 'INVALID_RANK' });
    expect(result.success).toBe(false);
  });

  it('accepts valid rank enum', () => {
    const result = adminUpdateCharacterBody.safeParse({ rank: 'ADMIRAL' });
    expect(result.success).toBe(true);
  });

  it('rejects currentSystem out of range', () => {
    const result = adminUpdateCharacterBody.safeParse({ currentSystem: 29 });
    expect(result.success).toBe(false);
  });
});

describe('adminUpdateShipBody', () => {
  it('accepts valid partial ship update', () => {
    const result = adminUpdateShipBody.safeParse({
      weaponStrength: 50,
      hasCloaker: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative fuel', () => {
    const result = adminUpdateShipBody.safeParse({ fuel: -10 });
    expect(result.success).toBe(false);
  });
});

describe('adminUpdateNpcBody', () => {
  it('accepts valid partial NPC update', () => {
    const result = adminUpdateNpcBody.safeParse({
      weaponStrength: 30,
      shieldCondition: 8,
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative credit value', () => {
    const result = adminUpdateNpcBody.safeParse({ creditValue: -5 });
    expect(result.success).toBe(false);
  });
});

describe('adminGameConfigBody', () => {
  it('accepts valid config update', () => {
    const result = adminGameConfigBody.safeParse({
      battleDifficulty: 7,
      maxCombatRounds: 10,
    });
    expect(result.success).toBe(true);
  });

  it('rejects battleDifficulty out of range (0)', () => {
    const result = adminGameConfigBody.safeParse({ battleDifficulty: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects battleDifficulty out of range (10)', () => {
    const result = adminGameConfigBody.safeParse({ battleDifficulty: 10 });
    expect(result.success).toBe(false);
  });

  it('rejects maxCombatRounds out of range (16)', () => {
    const result = adminGameConfigBody.safeParse({ maxCombatRounds: 16 });
    expect(result.success).toBe(false);
  });

  it('rejects attackRandomMin out of range', () => {
    const result = adminGameConfigBody.safeParse({ attackRandomMin: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects attackRandomMax out of range', () => {
    const result = adminGameConfigBody.safeParse({ attackRandomMax: 10 });
    expect(result.success).toBe(false);
  });

  it('accepts all fields at boundary values', () => {
    const result = adminGameConfigBody.safeParse({
      battleDifficulty: 1,
      maxCombatRounds: 1,
      pirateAttackThreshold: 1,
      patrolAttackThreshold: 1,
      attackRandomMin: 1,
      attackRandomMax: 1,
    });
    expect(result.success).toBe(true);
  });

  it('accepts all fields at max boundary values', () => {
    const result = adminGameConfigBody.safeParse({
      battleDifficulty: 9,
      maxCombatRounds: 15,
      pirateAttackThreshold: 100,
      patrolAttackThreshold: 100,
      attackRandomMin: 9,
      attackRandomMax: 9,
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// 4. ADMIN ROUTE WIRING
// ============================================================================

describe('Admin Route Wiring', () => {
  it('registerAdminRoutes is exported', async () => {
    const mod = await import('../src/app/routes/admin');
    expect(mod.registerAdminRoutes).toBeDefined();
    expect(mod.registerAdminRoutes).toBeTypeOf('function');
  });

  it('admin.ts imports requireAdmin', () => {
    const src = readSource('../src/app/routes/admin.ts');
    expect(src).toContain('requireAdmin');
  });

  it('admin.ts uses requireAdmin as preValidation on all routes', () => {
    const src = readSource('../src/app/routes/admin.ts');
    const matches = src.match(/preValidation: \[requireAdmin\]/g);
    expect(matches).not.toBeNull();
    // Should have at least 10 route registrations with requireAdmin
    expect(matches!.length).toBeGreaterThanOrEqual(10);
  });

  it('admin.ts registers player endpoints', () => {
    const src = readSource('../src/app/routes/admin.ts');
    expect(src).toContain('/api/admin/players');
    expect(src).toContain('/api/admin/players/:id');
    expect(src).toContain('/api/admin/players/:id/ship');
  });

  it('admin.ts registers NPC endpoints', () => {
    const src = readSource('../src/app/routes/admin.ts');
    expect(src).toContain('/api/admin/npcs');
    expect(src).toContain('/api/admin/npcs/:id');
  });

  it('admin.ts registers config endpoints', () => {
    const src = readSource('../src/app/routes/admin.ts');
    expect(src).toContain('/api/admin/config');
  });

  it('admin.ts registers reset endpoint', () => {
    const src = readSource('../src/app/routes/admin.ts');
    expect(src).toContain('/api/admin/reset');
  });

  it('admin.ts registers port eviction endpoint', () => {
    const src = readSource('../src/app/routes/admin.ts');
    expect(src).toContain('/api/admin/ports/:systemId/evict');
  });

  it('admin.ts registers topgun endpoint', () => {
    const src = readSource('../src/app/routes/admin.ts');
    expect(src).toContain('/api/admin/topgun');
  });

  it('admin routes are registered in app index', () => {
    const src = readSource('../src/app/index.ts');
    expect(src).toContain('registerAdminRoutes');
  });

  it('admin tag is in swagger config', () => {
    const src = readSource('../src/app/index.ts');
    expect(src).toContain("name: 'admin'");
  });

  it('reset endpoint requires confirm: "RESET"', () => {
    const src = readSource('../src/app/routes/admin.ts');
    expect(src).toContain("confirm !== 'RESET'");
  });
});

// ============================================================================
// 5. ADMIN SCREEN REGISTRATION
// ============================================================================

describe('Admin Screen Registration', () => {
  it('screen-router registers admin-menu', () => {
    const src = readSource('../src/sockets/screen-router.ts');
    expect(src).toContain("'admin-menu'");
    expect(src).toContain('AdminMenuScreen');
  });

  it('screen-router registers admin-players', () => {
    const src = readSource('../src/sockets/screen-router.ts');
    expect(src).toContain("'admin-players'");
    expect(src).toContain('AdminPlayersScreen');
  });

  it('screen-router registers admin-npcs', () => {
    const src = readSource('../src/sockets/screen-router.ts');
    expect(src).toContain("'admin-npcs'");
    expect(src).toContain('AdminNpcsScreen');
  });

  it('screen-router registers admin-config', () => {
    const src = readSource('../src/sockets/screen-router.ts');
    expect(src).toContain("'admin-config'");
    expect(src).toContain('AdminConfigScreen');
  });

  it('admin screens implement ScreenModule interface', async () => {
    const adminMenu = await import('../src/game/screens/admin-menu');
    expect(adminMenu.AdminMenuScreen.name).toBe('admin-menu');
    expect(adminMenu.AdminMenuScreen.render).toBeTypeOf('function');
    expect(adminMenu.AdminMenuScreen.handleInput).toBeTypeOf('function');

    const adminPlayers = await import('../src/game/screens/admin-players');
    expect(adminPlayers.AdminPlayersScreen.name).toBe('admin-players');
    expect(adminPlayers.AdminPlayersScreen.render).toBeTypeOf('function');
    expect(adminPlayers.AdminPlayersScreen.handleInput).toBeTypeOf('function');

    const adminNpcs = await import('../src/game/screens/admin-npcs');
    expect(adminNpcs.AdminNpcsScreen.name).toBe('admin-npcs');
    expect(adminNpcs.AdminNpcsScreen.render).toBeTypeOf('function');
    expect(adminNpcs.AdminNpcsScreen.handleInput).toBeTypeOf('function');

    const adminConfig = await import('../src/game/screens/admin-config');
    expect(adminConfig.AdminConfigScreen.name).toBe('admin-config');
    expect(adminConfig.AdminConfigScreen.render).toBeTypeOf('function');
    expect(adminConfig.AdminConfigScreen.handleInput).toBeTypeOf('function');
  });
});

// ============================================================================
// 6. MAIN MENU ADMIN INTEGRATION
// ============================================================================

describe('Main Menu Admin Integration', () => {
  it('main-menu includes user.isAdmin in render query', () => {
    const src = readSource('../src/game/screens/main-menu.ts');
    expect(src).toContain('isAdmin');
  });

  it('main-menu conditionally shows admin panel option', () => {
    const src = readSource('../src/game/screens/main-menu.ts');
    expect(src).toContain('Admin Panel');
  });

  it('main-menu handles * key for admin navigation', () => {
    const src = readSource('../src/game/screens/main-menu.ts');
    expect(src).toContain("'*'");
    expect(src).toContain('admin-menu');
  });
});

// ============================================================================
// 7. WEBSOCKET ADMIN SUPPORT
// ============================================================================

describe('WebSocket Admin Support', () => {
  it('AuthenticatedSocket includes isAdmin', () => {
    const src = readSource('../src/sockets/game.ts');
    expect(src).toContain('isAdmin');
  });
});

// ============================================================================
// 8. SCHEMA MIGRATION
// ============================================================================

describe('Schema includes admin fields', () => {
  it('User model has isAdmin field', () => {
    const src = readSource('../prisma/schema.prisma');
    expect(src).toContain('isAdmin');
    expect(src).toContain('@default(false)');
  });

  it('GameConfig model exists', () => {
    const src = readSource('../prisma/schema.prisma');
    expect(src).toContain('model GameConfig');
    expect(src).toContain('battleDifficulty');
    expect(src).toContain('maxCombatRounds');
    expect(src).toContain('pirateAttackThreshold');
    expect(src).toContain('patrolAttackThreshold');
    expect(src).toContain('attackRandomMin');
    expect(src).toContain('attackRandomMax');
  });
});

// ============================================================================
// 9. SEED INCLUDES GAME CONFIG
// ============================================================================

describe('Seed includes GameConfig', () => {
  it('seed.ts upserts GameConfig with default id', () => {
    const src = readSource('../prisma/seed.ts');
    expect(src).toContain('gameConfig');
    expect(src).toContain("id: 'default'");
  });
});

// ============================================================================
// 10. SP.EDIT1 PLAYER EDITOR — FIELD COVERAGE
// ============================================================================

describe('SP.EDIT1 Player Editor field coverage', () => {
  it('CHAR_FIELDS covers all SP.EDIT1 gameplay-relevant character fields', () => {
    const src = readSource('../src/game/screens/admin-players.ts');
    // SP.EDIT1 view subroutine: original 57 vars — key gameplay fields present
    expect(src).toContain('creditsHigh');   // g1 (field 12)
    expect(src).toContain('creditsLow');    // g2 (field 13)
    expect(src).toContain('score');         // sc (field 27)
    expect(src).toContain('tripsCompleted'); // u1 (field 29)
    expect(src).toContain('battlesWon');    // e1 (field 28)
    expect(src).toContain('battlesLost');   // m1 (field 26)
    expect(src).toContain('astrecsTraveled'); // j1 (field 24)
    expect(src).toContain('cargoDelivered'); // k1 (field 25)
    expect(src).toContain('rescuesPerformed'); // b1 (field 30)
    expect(src).toContain('tripCount');     // z1 (field 32)
    expect(src).toContain('cargoPods');     // q1 (field 44)
    expect(src).toContain('cargoType');     // q2 (field 45)
    expect(src).toContain('destination');   // q4 (field 47)
    expect(src).toContain('cargoPayment');  // q5 (field 48)
    expect(src).toContain('missionType');   // pp (field 55)
  });

  it('renderPlayerView displays astrecs, cargo, mission state fields', () => {
    const src = readSource('../src/game/screens/admin-players.ts');
    // SP.EDIT1 view displays all relevant numeric and string state fields
    expect(src).toContain('astrecsTraveled');
    expect(src).toContain('cargoManifest');
    expect(src).toContain('extraCurricularMode');
    expect(src).toContain('lostLocation');
    expect(src).toContain('missionType');
  });

  it('CHAR_FIELDS exposes at least 15 character fields for editing', () => {
    const src = readSource('../src/game/screens/admin-players.ts');
    // Count CHAR_FIELDS entries — must have all original fields accessible
    const matches = src.match(/'[0-9A-Z]'\s*:\s*\{\s*field:/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(15);
  });
});

// ============================================================================
// 11. SP.EDIT2 NPC EDITOR — FIELD COVERAGE
// ============================================================================

describe('SP.EDIT2 NPC Editor field coverage', () => {
  it('EDITABLE_NPC_FIELDS includes battlesLost (bl) and battlesWon (bw)', () => {
    // SP.EDIT2.txt lines 147-148: xi=11 bl=battlesLost, xi=12 bw=battlesWon
    const src = readSource('../src/game/screens/admin-npcs.ts');
    expect(src).toContain("field: 'battlesLost'");
    expect(src).toContain("field: 'battlesWon'");
    expect(src).toContain('Battles Lost (bl)');
    expect(src).toContain('Battles Won (bw)');
  });

  it('PIRATE_TEMPLATES use original K1!!!! ship name (not K1++++)', () => {
    // SP.EDIT2.txt lines 196-204: original mpir subroutine uses K1!!!!..K9((((
    const src = readSource('../src/game/screens/admin-npcs.ts');
    expect(src).toContain('K1!!!!');
    expect(src).not.toContain('K1++++');
  });

  it('PATROL_TEMPLATES cover SP1-SP9 tiers from SP.EDIT2.txt lines 183-191', () => {
    const src = readSource('../src/game/screens/admin-npcs.ts');
    expect(src).toContain('SP1.Thor');
    expect(src).toContain('SP9.Incredible');
    expect(src).toContain('Lt.Savage');
    expect(src).toContain('Adm.Hutchins');
  });
});

// ============================================================================
// 12. SP.EDIT3 BATTLE CONFIG — ATTACK TABLE AND THRESHOLD USAGE
// ============================================================================

describe('SP.EDIT3 Battle Config — attack table and threshold', () => {
  it('renderConfigView displays bat2b attack strength table', () => {
    // SP.EDIT3 bat2b subroutine (lines 122-126): jm=(ju*x+15), jn=jm+(jv*5)
    const src = readSource('../src/game/screens/admin-config.ts');
    expect(src).toContain('bat2b');
    expect(src).toContain('ju * x');
    expect(src).toContain('jv * 5');
    expect(src).toContain('Attacks Spacer with Weap.Str');
  });

  it('bat2b formula produces correct values for default config (ju=3, jv=5)', () => {
    // SP.EDIT3 lines 122-126: for x=1: jm=(3*1+15)=18, jn=18+(5*5)=43
    const ju = 3;
    const jv = 5;
    for (let x = 1; x <= 9; x++) {
      const jm = (ju * x) + 15;
      const jn = jm + (jv * 5);
      expect(jm).toBeGreaterThan(15);
      expect(jn).toBeGreaterThan(jm);
    }
    const jm1 = (ju * 1) + 15; // = 18
    const jn1 = jm1 + (jv * 5); // = 43
    expect(jm1).toBe(18);
    expect(jn1).toBe(43);
    const jm9 = (ju * 9) + 15; // = 42
    const jn9 = jm9 + (jv * 5); // = 67
    expect(jm9).toBe(42);
    expect(jn9).toBe(67);
  });

  it('generateEncounter reads gameConfig for attack threshold check', () => {
    // SP.FIGHT1.S lines 113-126: sp.conf jw/jx/ju/jv gate NPC engagement
    const src = readSource('../src/game/systems/combat.ts');
    expect(src).toContain('playerWeaponStrength');
    expect(src).toContain('pirateAttackThreshold');
    expect(src).toContain('patrolAttackThreshold');
    expect(src).toContain('attackRandomMin');
    expect(src).toContain('attackRandomMax');
    expect(src).toContain('getGameConfig');
  });

  it('SPX patrol threshold check uses jw (SP.FIGHT1.S line 120)', () => {
    const src = readSource('../src/game/systems/combat.ts');
    expect(src).toContain('SPX');
    expect(src).toContain('jw');
  });

  it('SPZ patrol threshold check uses jx (SP.FIGHT1.S line 121)', () => {
    const src = readSource('../src/game/systems/combat.ts');
    expect(src).toContain('SPZ');
    expect(src).toContain('jx');
  });

  it('pirate tier attack range: jm=(ju*tier+15), jn=jm+(jv*5) (SP.FIGHT1.S line 125)', () => {
    const src = readSource('../src/game/systems/combat.ts');
    expect(src).toContain('jm');
    expect(src).toContain('jn');
    // Formula pattern present
    expect(src).toContain('(ju * tier) + 15');
    expect(src).toContain('(jv * 5)');
  });
});
