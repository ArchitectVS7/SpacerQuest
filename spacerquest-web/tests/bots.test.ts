/**
 * SpacerQuest v4.0 - Bot Player Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AllianceType, Rank } from '@prisma/client';

// ============================================================================
// Config Tests
// ============================================================================

describe('Bot Config', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('getBotCount returns 20 by default', async () => {
    vi.stubEnv('BOT_COUNT', '');
    const { getBotCount } = await import('../src/bots/config.js');
    expect(await getBotCount()).toBe(20);
  });

  it('getBotCount accepts 0, 5, 10, 20', async () => {
    const { getBotCount } = await import('../src/bots/config.js');

    vi.stubEnv('BOT_COUNT', '0');
    expect(await getBotCount()).toBe(0);

    vi.stubEnv('BOT_COUNT', '5');
    expect(await getBotCount()).toBe(5);

    vi.stubEnv('BOT_COUNT', '10');
    expect(await getBotCount()).toBe(10);

    vi.stubEnv('BOT_COUNT', '20');
    expect(await getBotCount()).toBe(20);
  });

  it('getBotCount defaults to 20 for invalid values', async () => {
    const { getBotCount } = await import('../src/bots/config.js');

    vi.stubEnv('BOT_COUNT', '7');
    expect(await getBotCount()).toBe(20);

    vi.stubEnv('BOT_COUNT', 'abc');
    expect(await getBotCount()).toBe(20);
  });

  it('isClassicMode returns false by default', async () => {
    vi.stubEnv('CLASSIC_MODE', '');
    const { isClassicMode } = await import('../src/bots/config.js');
    expect(isClassicMode()).toBe(false);
  });

  it('isClassicMode returns true when set', async () => {
    vi.stubEnv('CLASSIC_MODE', 'true');
    const { isClassicMode } = await import('../src/bots/config.js');
    expect(isClassicMode()).toBe(true);
  });
});

// ============================================================================
// Profile Tests
// ============================================================================

describe('Bot Profiles', () => {
  it('has exactly 20 profiles', async () => {
    const { BOT_PROFILES } = await import('../src/bots/profiles.js');
    expect(BOT_PROFILES).toHaveLength(20);
  });

  it('all profiles have unique slugs', async () => {
    const { BOT_PROFILES } = await import('../src/bots/profiles.js');
    const slugs = BOT_PROFILES.map(p => p.slug);
    expect(new Set(slugs).size).toBe(20);
  });

  it('all profiles have unique names', async () => {
    const { BOT_PROFILES } = await import('../src/bots/profiles.js');
    const names = BOT_PROFILES.map(p => p.name);
    expect(new Set(names).size).toBe(20);
  });

  it('alliance distribution is 4-4-4-4-4', async () => {
    const { BOT_PROFILES } = await import('../src/bots/profiles.js');
    const counts: Record<string, number> = {};
    for (const p of BOT_PROFILES) {
      counts[p.preferredAlliance] = (counts[p.preferredAlliance] || 0) + 1;
    }
    expect(counts[AllianceType.ASTRO_LEAGUE]).toBe(4);
    expect(counts[AllianceType.SPACE_DRAGONS]).toBe(4);
    expect(counts[AllianceType.WARLORD_CONFED]).toBe(4);
    expect(counts[AllianceType.REBEL_ALLIANCE]).toBe(4);
    expect(counts[AllianceType.NONE]).toBe(4);
  });

  it('all weights are between 0 and 1', async () => {
    const { BOT_PROFILES } = await import('../src/bots/profiles.js');
    for (const p of BOT_PROFILES) {
      expect(p.aggression).toBeGreaterThanOrEqual(0);
      expect(p.aggression).toBeLessThanOrEqual(1);
      expect(p.caution).toBeGreaterThanOrEqual(0);
      expect(p.caution).toBeLessThanOrEqual(1);
      expect(p.greed).toBeGreaterThanOrEqual(0);
      expect(p.greed).toBeLessThanOrEqual(1);
      expect(p.tradeFocus).toBeGreaterThanOrEqual(0);
      expect(p.tradeFocus).toBeLessThanOrEqual(1);
      expect(p.gamblingLust).toBeGreaterThanOrEqual(0);
      expect(p.gamblingLust).toBeLessThanOrEqual(1);
      expect(p.upgradePriority).toBeGreaterThanOrEqual(0);
      expect(p.upgradePriority).toBeLessThanOrEqual(1);
    }
  });

  it('all profiles have 8 components in upgradeOrder', async () => {
    const { BOT_PROFILES } = await import('../src/bots/profiles.js');
    for (const p of BOT_PROFILES) {
      expect(p.upgradeOrder).toHaveLength(8);
    }
  });

  it('getProfileBySlug finds profiles', async () => {
    const { getProfileBySlug } = await import('../src/bots/profiles.js');
    const profile = getProfileBySlug('iron-vex');
    expect(profile).toBeDefined();
    expect(profile!.name).toBe('Iron Vex');
  });

  it('getProfileForBot matches by name', async () => {
    const { getProfileForBot } = await import('../src/bots/profiles.js');
    const profile = getProfileForBot('[BOT] Cargo King');
    expect(profile).toBeDefined();
    expect(profile!.slug).toBe('cargo-king');
  });
});

// ============================================================================
// Decision Engine Tests
// ============================================================================

describe('Decision Engine', () => {
  it('planTrip returns port actions and destination', async () => {
    const { planTrip } = await import('../src/bots/decision-engine.js');
    const { BOT_PROFILES } = await import('../src/bots/profiles.js');

    const seededRng = () => 0.5; // Deterministic

    const mockCharacter = {
      id: 'test-char',
      userId: 'test-user',
      spacerId: 1,
      name: 'Test Bot',
      shipName: 'Test Ship',
      allianceSymbol: AllianceType.NONE,
      creditsHigh: 1,
      creditsLow: 0,
      bankHigh: 0,
      bankLow: 0,
      rank: Rank.LIEUTENANT,
      score: 0,
      promotions: 0,
      tripsCompleted: 0,
      astrecsTraveled: 0,
      cargoDelivered: 0,
      battlesWon: 0,
      battlesLost: 0,
      rescuesPerformed: 0,
      currentSystem: 1,
      tripCount: 0,
      lastTripDate: new Date(),
      missionType: 0,
      cargoPods: 0,
      cargoType: 0,
      cargoPayment: 0,
      destination: 0,
      cargoManifest: null,
      isBot: true,
      isConqueror: false,
      isLost: false,
      lostLocation: null,
      patrolSector: null,
      extraCurricularMode: null,
      crimeType: null,
      sageVisited: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      ship: {
        id: 'test-ship',
        characterId: 'test-char',
        hullStrength: 5, hullCondition: 9,
        driveStrength: 5, driveCondition: 9,
        cabinStrength: 1, cabinCondition: 9,
        lifeSupportStrength: 5, lifeSupportCondition: 9,
        weaponStrength: 1, weaponCondition: 9,
        navigationStrength: 5, navigationCondition: 9,
        roboticsStrength: 1, roboticsCondition: 9,
        shieldStrength: 1, shieldCondition: 9,
        fuel: 50,
        cargoPods: 0,
        maxCargoPods: 1,
        hasCloaker: false,
        hasAutoRepair: false,
        hasStarBuster: false,
        hasArchAngel: false,
        isAstraxialHull: false,
        hasShipGuard: false,
        damageFlags: [],
        updatedAt: new Date(),
      },
    } as any;

    const profile = BOT_PROFILES[0]; // Iron Vex

    const plan = planTrip({ character: mockCharacter, profile }, seededRng);

    expect(plan).toBeDefined();
    expect(plan.destination).toBeGreaterThan(0);
    expect(plan.destinationReason).toBeDefined();
    expect(Array.isArray(plan.portActions)).toBe(true);
  });

  it('bot with cargo heads to delivery destination', async () => {
    const { planTrip } = await import('../src/bots/decision-engine.js');
    const { BOT_PROFILES } = await import('../src/bots/profiles.js');

    const cargoBot = {
      id: 'cargo-bot',
      userId: 'u',
      spacerId: 1,
      name: 'Test',
      shipName: 'Ship',
      allianceSymbol: AllianceType.NONE,
      creditsHigh: 1, creditsLow: 0,
      bankHigh: 0, bankLow: 0,
      rank: Rank.LIEUTENANT,
      score: 0, promotions: 0,
      tripsCompleted: 0, astrecsTraveled: 0,
      cargoDelivered: 0, battlesWon: 0, battlesLost: 0,
      rescuesPerformed: 0,
      currentSystem: 1, tripCount: 0,
      lastTripDate: new Date(),
      missionType: 1,
      cargoPods: 5,
      cargoType: 1,
      cargoPayment: 5000,
      destination: 8,
      cargoManifest: 'Titanium Ore',
      isBot: true, isConqueror: false, isLost: false,
      lostLocation: null, patrolSector: null,
      extraCurricularMode: null, crimeType: null,
      sageVisited: false,
      createdAt: new Date(), updatedAt: new Date(),
      ship: {
        id: 's',
        characterId: 'cargo-bot',
        hullStrength: 10, hullCondition: 9,
        driveStrength: 10, driveCondition: 9,
        cabinStrength: 5, cabinCondition: 9,
        lifeSupportStrength: 5, lifeSupportCondition: 9,
        weaponStrength: 5, weaponCondition: 9,
        navigationStrength: 5, navigationCondition: 9,
        roboticsStrength: 5, roboticsCondition: 9,
        shieldStrength: 5, shieldCondition: 9,
        fuel: 500,
        cargoPods: 5, maxCargoPods: 10,
        hasCloaker: false, hasAutoRepair: false,
        hasStarBuster: false, hasArchAngel: false,
        isAstraxialHull: false, hasShipGuard: false,
        damageFlags: [],
        updatedAt: new Date(),
      },
    } as any;

    const profile = BOT_PROFILES[2]; // Cargo King
    const plan = planTrip({ character: cargoBot, profile }, () => 0.5);

    expect(plan.destination).toBe(8); // Should head to cargo destination
    expect(plan.destinationReason).toBe('Cargo delivery');
  });

  it('damaged bot prioritizes repair', async () => {
    const { planTrip } = await import('../src/bots/decision-engine.js');
    const { BOT_PROFILES } = await import('../src/bots/profiles.js');

    const damagedBot = {
      id: 'damaged',
      userId: 'u',
      spacerId: 1,
      name: 'Test',
      shipName: 'Ship',
      allianceSymbol: AllianceType.NONE,
      creditsHigh: 1, creditsLow: 0,
      bankHigh: 0, bankLow: 0,
      rank: Rank.LIEUTENANT,
      score: 0, promotions: 0,
      tripsCompleted: 0, astrecsTraveled: 0,
      cargoDelivered: 0, battlesWon: 0, battlesLost: 0,
      rescuesPerformed: 0,
      currentSystem: 1, tripCount: 0,
      lastTripDate: new Date(),
      missionType: 0,
      cargoPods: 0, cargoType: 0, cargoPayment: 0,
      destination: 0, cargoManifest: null,
      isBot: true, isConqueror: false, isLost: false,
      lostLocation: null, patrolSector: null,
      extraCurricularMode: null, crimeType: null,
      sageVisited: false,
      createdAt: new Date(), updatedAt: new Date(),
      ship: {
        id: 's',
        characterId: 'damaged',
        hullStrength: 5, hullCondition: 0, // DAMAGED
        driveStrength: 5, driveCondition: 9,
        cabinStrength: 1, cabinCondition: 9,
        lifeSupportStrength: 5, lifeSupportCondition: 9,
        weaponStrength: 1, weaponCondition: 9,
        navigationStrength: 5, navigationCondition: 9,
        roboticsStrength: 1, roboticsCondition: 9,
        shieldStrength: 1, shieldCondition: 9,
        fuel: 50,
        cargoPods: 0, maxCargoPods: 1,
        hasCloaker: false, hasAutoRepair: false,
        hasStarBuster: false, hasArchAngel: false,
        isAstraxialHull: false, hasShipGuard: false,
        damageFlags: [],
        updatedAt: new Date(),
      },
    } as any;

    const profile = BOT_PROFILES[0]; // Any profile
    const plan = planTrip({ character: damagedBot, profile }, () => 0.5);

    const repairAction = plan.portActions.find(a => a.type === 'REPAIR');
    expect(repairAction).toBeDefined();
    expect(repairAction!.priority).toBe(90);
  });
});

// ============================================================================
// End Turn Validation Tests
// ============================================================================

describe('End Turn Validation', () => {
  it('validates trip count', async () => {
    vi.stubEnv('CLASSIC_MODE', 'false');
    const { validateEndTurn } = await import('../src/game/systems/end-turn.js');

    const result = validateEndTurn(1);
    expect(result.canEnd).toBe(false);
    expect(result.reason).toContain('1 trip(s) remaining');
  });

  it('allows end turn at 3 trips', async () => {
    vi.stubEnv('CLASSIC_MODE', 'false');
    const { validateEndTurn } = await import('../src/game/systems/end-turn.js');

    const result = validateEndTurn(3);
    expect(result.canEnd).toBe(true);
  });

  it('blocks in classic mode', async () => {
    vi.stubEnv('CLASSIC_MODE', 'true');
    // Need fresh import to pick up env change
    const mod = await import('../src/game/systems/end-turn.js');
    // Note: isClassicMode reads env at call time, so this should work
    const result = mod.validateEndTurn(3);
    // This depends on whether isClassicMode is evaluated at import or call time
    // Since it reads process.env directly, it should be 'true' now
    expect(result.canEnd).toBe(false);
    expect(result.reason).toContain('Classic mode');
  });
});

// ============================================================================
// Daily Tick Fix Verification
// ============================================================================

describe('Daily Tick Rank Thresholds', () => {
  it('uses correct calculateRank thresholds from utils', async () => {
    const { calculateRank } = await import('../src/game/utils.js');

    // Verify the correct thresholds (not the stale ones)
    expect(calculateRank(0)).toBe(Rank.LIEUTENANT);
    expect(calculateRank(150)).toBe(Rank.COMMANDER);
    expect(calculateRank(300)).toBe(Rank.CAPTAIN);
    expect(calculateRank(450)).toBe(Rank.COMMODORE);
    expect(calculateRank(750)).toBe(Rank.ADMIRAL);     // Was 600 in stale version
    expect(calculateRank(1200)).toBe(Rank.TOP_DOG);    // Was 900 in stale version
    expect(calculateRank(1650)).toBe(Rank.GRAND_MUFTI); // Was 1100 in stale version
    expect(calculateRank(2250)).toBe(Rank.MEGA_HERO);   // Was 1350 in stale version
    expect(calculateRank(2700)).toBe(Rank.GIGA_HERO);

    // Verify edge cases that would have been wrong with stale thresholds
    expect(calculateRank(600)).toBe(Rank.COMMODORE); // Stale: Admiral
    expect(calculateRank(749)).toBe(Rank.COMMODORE); // Stale: Admiral
    expect(calculateRank(900)).toBe(Rank.ADMIRAL);    // 900 is between 750 (Admiral) and 1200 (Top Dog)
  });
});
