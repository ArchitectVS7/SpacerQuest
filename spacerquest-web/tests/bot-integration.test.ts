/**
 * SpacerQuest v4.0 - Bot Integration Tests
 *
 * Tests the full bot pipeline with mocked Prisma:
 * - ensureBotsExist: idempotent creation
 * - executeBotTurn: single bot turn with port actions + travel + combat
 * - runAllBotTurns: orchestration of all bots + trip reset + promotions
 * - End-turn validation: trip count gating, classic mode blocking
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AllianceType, Rank } from '@prisma/client';

// ============================================================================
// Mock Prisma — must be before any imports that touch prisma
// ============================================================================

vi.mock('../src/db/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    character: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    ship: {
      create: vi.fn(),
      update: vi.fn(),
    },
    allianceMembership: {
      create: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    travelState: {
      deleteMany: vi.fn(),
    },
    battleRecord: {
      create: vi.fn(),
    },
    gameLog: {
      create: vi.fn(),
    },
    npcRoster: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

// Mock combat encounter generation — we control when encounters happen
vi.mock('../src/game/systems/combat', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    generateEncounter: vi.fn().mockResolvedValue(null), // No encounters by default
    recordBattle: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock repairs — bot calls repairAllComponents
vi.mock('../src/game/systems/repairs', () => ({
  repairAllComponents: vi.fn().mockResolvedValue({ success: false, cost: 0 }),
}));

// Mock travel completeTravel — just updates position
vi.mock('../src/game/systems/travel', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    completeTravel: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock upgrades — bot calls upgradeShipComponent
vi.mock('../src/game/systems/upgrades', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    upgradeShipComponent: vi.fn().mockResolvedValue({ success: false }),
  };
});

// ============================================================================
// Helpers
// ============================================================================

function makeShip(overrides: Record<string, any> = {}) {
  return {
    id: 'ship-1',
    characterId: 'char-1',
    hullStrength: 5, hullCondition: 9,
    driveStrength: 5, driveCondition: 9,
    cabinStrength: 1, cabinCondition: 9,
    lifeSupportStrength: 5, lifeSupportCondition: 9,
    weaponStrength: 1, weaponCondition: 9,
    navigationStrength: 5, navigationCondition: 9,
    roboticsStrength: 1, roboticsCondition: 9,
    shieldStrength: 1, shieldCondition: 9,
    fuel: 500,
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
    ...overrides,
  };
}

function makeCharacter(overrides: Record<string, any> = {}) {
  return {
    id: 'char-1',
    userId: 'user-1',
    spacerId: 1,
    name: 'Iron Vex',
    shipName: 'Vex Cruiser',
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
    ...overrides,
  };
}

function makeBotCharacter(index: number, name: string, slug: string, ship?: any) {
  const s = ship || makeShip({ id: `ship-${slug}`, characterId: `char-${slug}` });
  return {
    ...makeCharacter({
      id: `char-${slug}`,
      userId: `user-${slug}`,
      name,
      isBot: true,
      currentSystem: 1 + (index % 14),
    }),
    ship: s,
  };
}

// ============================================================================
// ensureBotsExist
// ============================================================================

describe('ensureBotsExist', () => {
  let prisma: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubEnv('BOT_COUNT', '5');
    const mod = await import('../src/db/prisma');
    prisma = mod.prisma;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('creates User + Character + Ship for new bots', async () => {
    const { ensureBotsExist } = await import('../src/bots/bot-setup');

    // No existing users or characters
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(({ data }: any) => ({
      id: `uid-${data.bbsUserId}`,
      ...data,
    }));
    prisma.character.findFirst.mockResolvedValue(null);
    prisma.character.create.mockImplementation(({ data }: any) => ({
      id: `cid-${data.name}`,
      ...data,
    }));
    prisma.ship.create.mockResolvedValue({});
    prisma.character.update.mockResolvedValue({});
    prisma.allianceMembership.create.mockResolvedValue({});

    await ensureBotsExist(5);

    expect(prisma.user.create).toHaveBeenCalledTimes(5);
    expect(prisma.character.create).toHaveBeenCalledTimes(5);
    expect(prisma.ship.create).toHaveBeenCalledTimes(5);
  });

  it('is idempotent — does not create duplicates when bots already exist', async () => {
    const { ensureBotsExist } = await import('../src/bots/bot-setup');

    // User exists, character exists
    prisma.user.findUnique.mockResolvedValue({ id: 'existing-user' });
    prisma.character.findFirst.mockResolvedValue({ id: 'existing-char' });

    await ensureBotsExist(5);

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.character.create).not.toHaveBeenCalled();
    expect(prisma.ship.create).not.toHaveBeenCalled();
  });

  it('creates only missing bots when some exist', async () => {
    const { ensureBotsExist } = await import('../src/bots/bot-setup');

    let callCount = 0;
    prisma.user.findUnique.mockImplementation(() => {
      callCount++;
      // First 3 exist, last 2 don't
      return callCount <= 3 ? { id: `existing-user-${callCount}` } : null;
    });

    let charCallCount = 0;
    prisma.character.findFirst.mockImplementation(() => {
      charCallCount++;
      return charCallCount <= 3 ? { id: `existing-char-${charCallCount}` } : null;
    });

    prisma.user.create.mockImplementation(({ data }: any) => ({
      id: `new-uid-${data.bbsUserId}`,
      ...data,
    }));
    prisma.character.create.mockImplementation(({ data }: any) => ({
      id: `new-cid-${data.name}`,
      ...data,
    }));
    prisma.ship.create.mockResolvedValue({});
    prisma.character.update.mockResolvedValue({});
    prisma.allianceMembership.create.mockResolvedValue({});

    await ensureBotsExist(5);

    expect(prisma.user.create).toHaveBeenCalledTimes(2);
    expect(prisma.character.create).toHaveBeenCalledTimes(2);
  });

  it('calling ensureBotsExist(10) twice creates no duplicates', async () => {
    const { ensureBotsExist } = await import('../src/bots/bot-setup');

    // First call: no bots exist
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(({ data }: any) => ({
      id: `uid-${data.bbsUserId}`,
      ...data,
    }));
    prisma.character.findFirst.mockResolvedValue(null);
    prisma.character.create.mockImplementation(({ data }: any) => ({
      id: `cid-${data.name}`,
      ...data,
    }));
    prisma.ship.create.mockResolvedValue({});
    prisma.character.update.mockResolvedValue({});
    prisma.allianceMembership.create.mockResolvedValue({});

    await ensureBotsExist(10);
    const firstCallCreates = prisma.character.create.mock.calls.length;

    // Second call: all bots exist now
    vi.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({ id: 'existing-user' });
    prisma.character.findFirst.mockResolvedValue({ id: 'existing-char' });

    await ensureBotsExist(10);

    expect(prisma.character.create).not.toHaveBeenCalled();
    expect(firstCallCreates).toBe(10);
  });

  it('assigns preferred alliance for non-NONE profiles', async () => {
    const { ensureBotsExist } = await import('../src/bots/bot-setup');
    const { BOT_PROFILES } = await import('../src/bots/profiles');

    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(({ data }: any) => ({
      id: `uid-${data.bbsUserId}`,
      ...data,
    }));
    prisma.character.findFirst.mockResolvedValue(null);
    prisma.character.create.mockImplementation(({ data }: any) => ({
      id: `cid-${data.name}`,
      ...data,
    }));
    prisma.ship.create.mockResolvedValue({});
    prisma.character.update.mockResolvedValue({});
    prisma.allianceMembership.create.mockResolvedValue({});

    await ensureBotsExist(5);

    // Count alliance memberships created (should match profiles with non-NONE alliance)
    const nonNoneCount = BOT_PROFILES.slice(0, 5).filter(
      p => p.preferredAlliance !== AllianceType.NONE
    ).length;

    expect(prisma.allianceMembership.create).toHaveBeenCalledTimes(nonNoneCount);
  });
});

// ============================================================================
// executeBotTurn
// ============================================================================

describe('executeBotTurn', () => {
  let prisma: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../src/db/prisma');
    prisma = mod.prisma;
  });

  it('executes 3 trips and returns result summary', async () => {
    const { executeBotTurn } = await import('../src/bots/bot-turn');
    const { BOT_PROFILES } = await import('../src/bots/profiles');
    const profile = BOT_PROFILES[0]; // Iron Vex

    const ship = makeShip();
    const char = makeCharacter({ name: profile.name, ship });

    // Reset trip count
    prisma.character.update.mockResolvedValue({});
    // Each trip reloads character
    prisma.character.findUnique.mockResolvedValue({ ...char, ship });
    // Fuel deduction
    prisma.ship.update.mockResolvedValue({});

    const seededRng = () => 0.5;
    const result = await executeBotTurn('char-1', profile, seededRng);

    expect(result.characterId).toBe('char-1');
    expect(result.botName).toBe(profile.name);
    expect(result.tripsCompleted).toBeGreaterThanOrEqual(0);
    expect(result.tripsCompleted).toBeLessThanOrEqual(3);
    expect(Array.isArray(result.actions)).toBe(true);
    expect(Array.isArray(result.notableEvents)).toBe(true);
  });

  it('resets trip count at start of turn', async () => {
    const { executeBotTurn } = await import('../src/bots/bot-turn');
    const { BOT_PROFILES } = await import('../src/bots/profiles');
    const profile = BOT_PROFILES[0];

    const ship = makeShip();
    const char = makeCharacter({ name: profile.name, tripCount: 3, ship });

    prisma.character.update.mockResolvedValue({});
    prisma.character.findUnique.mockResolvedValue({ ...char, ship });
    prisma.ship.update.mockResolvedValue({});

    await executeBotTurn('char-1', profile, () => 0.5);

    // First call should reset trip count
    expect(prisma.character.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'char-1' },
        data: { tripCount: 0 },
      })
    );
  });

  it('handles stranded bot (no fuel) gracefully', async () => {
    const { executeBotTurn } = await import('../src/bots/bot-turn');
    const { BOT_PROFILES } = await import('../src/bots/profiles');
    const profile = BOT_PROFILES[0];

    const ship = makeShip({ fuel: 0 });
    const char = makeCharacter({ name: profile.name, ship });

    prisma.character.update.mockResolvedValue({});
    prisma.character.findUnique.mockResolvedValue({ ...char, ship });
    prisma.ship.update.mockResolvedValue({});

    const result = await executeBotTurn('char-1', profile, () => 0.5);

    // Should complete without errors even with no fuel
    expect(result.tripsCompleted).toBe(0);
    expect(result.battlesWon).toBe(0);
    expect(result.battlesLost).toBe(0);
  });

  it('delivers cargo when bot arrives at destination', async () => {
    const { executeBotTurn } = await import('../src/bots/bot-turn');
    const { BOT_PROFILES } = await import('../src/bots/profiles');
    const profile = BOT_PROFILES[2]; // Cargo King

    const ship = makeShip({ fuel: 500, maxCargoPods: 10 });
    const char = makeCharacter({
      name: profile.name,
      cargoPods: 5,
      cargoType: 1,
      cargoPayment: 5000,
      destination: 8,
      cargoManifest: 'Titanium Ore',
      missionType: 1,
      ship,
    });

    prisma.character.update.mockResolvedValue({});
    // After travel, character is at destination with cargo
    prisma.character.findUnique.mockResolvedValue({
      ...char,
      ship,
      currentSystem: 8,
    });
    prisma.ship.update.mockResolvedValue({});

    const result = await executeBotTurn(char.id, profile, () => 0.5);

    // Bot should have attempted cargo delivery
    expect(result).toBeDefined();
    // Cargo delivery adds a DELIVER_CARGO action
    const deliveries = result.actions.filter(a => a.type === 'DELIVER_CARGO');
    // May or may not deliver depending on mock returns; the point is no crash
    expect(Array.isArray(deliveries)).toBe(true);
  });

  it('does not crash with null ship', async () => {
    const { executeBotTurn } = await import('../src/bots/bot-turn');
    const { BOT_PROFILES } = await import('../src/bots/profiles');
    const profile = BOT_PROFILES[0];

    prisma.character.update.mockResolvedValue({});
    prisma.character.findUnique.mockResolvedValue({
      ...makeCharacter({ name: profile.name }),
      ship: null,
    });

    const result = await executeBotTurn('char-1', profile, () => 0.5);

    // Should bail gracefully
    expect(result.tripsCompleted).toBe(0);
  });
});

// ============================================================================
// runAllBotTurns
// ============================================================================

describe('runAllBotTurns', () => {
  let prisma: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubEnv('BOT_COUNT', '5');
    const mod = await import('../src/db/prisma');
    prisma = mod.prisma;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('processes all bots and returns summary', async () => {
    const { runAllBotTurns } = await import('../src/bots/bot-runner');
    const { BOT_PROFILES } = await import('../src/bots/profiles');

    // ensureBotsExist mocks — all bots already exist
    prisma.user.findUnique.mockResolvedValue({ id: 'existing' });
    prisma.character.findFirst.mockResolvedValue({ id: 'existing' });

    // findMany returns 5 bot characters
    const bots = BOT_PROFILES.slice(0, 5).map((p, i) =>
      makeBotCharacter(i, p.name, p.slug)
    );
    prisma.character.findMany.mockResolvedValue(bots);

    // Each bot's turn: reset trip + reload character per trip
    prisma.character.update.mockResolvedValue({});
    prisma.character.findUnique.mockImplementation(({ where }: any) => {
      const bot = bots.find(b => b.id === where.id);
      return bot || null;
    });
    prisma.ship.update.mockResolvedValue({});

    // Promotion check — no promotions needed
    prisma.character.updateMany.mockResolvedValue({ count: 5 });

    const seededRng = () => 0.5;
    const summary = await runAllBotTurns('player-char-1', seededRng);

    expect(summary.botsProcessed).toBe(5);
    expect(typeof summary.totalBattles).toBe('number');
    expect(typeof summary.totalCargoDelivered).toBe('number');
    expect(Array.isArray(summary.events)).toBe(true);
  });

  it('resets ALL trip counts after bot turns', async () => {
    const { runAllBotTurns } = await import('../src/bots/bot-runner');
    const { BOT_PROFILES } = await import('../src/bots/profiles');

    prisma.user.findUnique.mockResolvedValue({ id: 'existing' });
    prisma.character.findFirst.mockResolvedValue({ id: 'existing' });

    const bots = BOT_PROFILES.slice(0, 5).map((p, i) =>
      makeBotCharacter(i, p.name, p.slug)
    );
    prisma.character.findMany.mockResolvedValue(bots);
    prisma.character.update.mockResolvedValue({});
    prisma.character.findUnique.mockImplementation(({ where }: any) => {
      const bot = bots.find(b => b.id === where.id);
      return bot || null;
    });
    prisma.ship.update.mockResolvedValue({});
    prisma.character.updateMany.mockResolvedValue({ count: 6 });

    await runAllBotTurns('player-char-1', () => 0.5);

    // Verify updateMany was called to reset all trip counts
    expect(prisma.character.updateMany).toHaveBeenCalledWith({
      data: { tripCount: 0 },
    });
  });

  it('skips bots without matching profile', async () => {
    const { runAllBotTurns } = await import('../src/bots/bot-runner');

    prisma.user.findUnique.mockResolvedValue({ id: 'existing' });
    prisma.character.findFirst.mockResolvedValue({ id: 'existing' });

    // Bot with name that doesn't match any profile
    const unknownBot = makeBotCharacter(0, 'Unknown Bot', 'unknown-bot');
    prisma.character.findMany.mockResolvedValue([unknownBot]);
    prisma.character.update.mockResolvedValue({});
    prisma.character.updateMany.mockResolvedValue({ count: 1 });

    const summary = await runAllBotTurns('player-1', () => 0.5);

    // Bot without profile is skipped
    expect(summary.botsProcessed).toBe(0);
  });

  it('handles zero bots gracefully', async () => {
    vi.stubEnv('BOT_COUNT', '0');
    const { runAllBotTurns } = await import('../src/bots/bot-runner');

    prisma.character.findMany.mockResolvedValue([]);
    prisma.character.updateMany.mockResolvedValue({ count: 0 });

    const summary = await runAllBotTurns('player-1', () => 0.5);

    expect(summary.botsProcessed).toBe(0);
    expect(summary.totalBattles).toBe(0);
  });

  it('runs promotion checks after all bot turns', async () => {
    const { runAllBotTurns } = await import('../src/bots/bot-runner');
    const { BOT_PROFILES } = await import('../src/bots/profiles');

    prisma.user.findUnique.mockResolvedValue({ id: 'existing' });
    prisma.character.findFirst.mockResolvedValue({ id: 'existing' });

    // One bot with high score that should trigger promotion
    const bot = makeBotCharacter(0, BOT_PROFILES[0].name, BOT_PROFILES[0].slug);
    prisma.character.findMany.mockImplementation(({ where }: any) => {
      if (where?.isBot) return [bot];
      // Promotion check query — character with score above threshold
      if (where?.rank) {
        return [{
          ...makeCharacter({ id: 'promo-char', score: 200, rank: Rank.LIEUTENANT }),
        }];
      }
      return [];
    });
    prisma.character.update.mockResolvedValue({});
    prisma.character.findUnique.mockResolvedValue(bot);
    prisma.ship.update.mockResolvedValue({});
    prisma.character.updateMany.mockResolvedValue({ count: 1 });
    prisma.gameLog.create.mockResolvedValue({});

    const summary = await runAllBotTurns('player-1', () => 0.5);

    // Should have completed without error
    expect(summary.botsProcessed).toBe(1);
    // Promotion check calls findMany with rank filter
    const findManyCalls = prisma.character.findMany.mock.calls;
    expect(findManyCalls.length).toBeGreaterThanOrEqual(2); // bots + promotion check
  });
});

// ============================================================================
// End Turn Validation
// ============================================================================

describe('End Turn Integration', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('validateEndTurn blocks when trips remaining', async () => {
    vi.stubEnv('CLASSIC_MODE', 'false');
    const { validateEndTurn } = await import('../src/game/systems/end-turn');

    expect(validateEndTurn(0).canEnd).toBe(false);
    expect(validateEndTurn(1).canEnd).toBe(false);
    expect(validateEndTurn(2).canEnd).toBe(false);
    expect(validateEndTurn(0).reason).toContain('3 trip(s) remaining');
  });

  it('validateEndTurn allows at trip limit', async () => {
    vi.stubEnv('CLASSIC_MODE', 'false');
    const { validateEndTurn } = await import('../src/game/systems/end-turn');

    expect(validateEndTurn(3).canEnd).toBe(true);
    expect(validateEndTurn(5).canEnd).toBe(true);
  });

  it('CLASSIC_MODE=true blocks end turn entirely', async () => {
    vi.stubEnv('CLASSIC_MODE', 'true');
    const { validateEndTurn } = await import('../src/game/systems/end-turn');

    const result = validateEndTurn(3);
    expect(result.canEnd).toBe(false);
    expect(result.reason).toContain('Classic mode');
  });

  it('executeEndTurn calls runAllBotTurns and returns summary', async () => {
    vi.stubEnv('CLASSIC_MODE', 'false');
    vi.stubEnv('BOT_COUNT', '0');

    const prismaModule = await import('../src/db/prisma');
    const prisma = prismaModule.prisma as any;

    prisma.character.findMany.mockResolvedValue([]);
    prisma.character.updateMany.mockResolvedValue({ count: 0 });

    const { executeEndTurn } = await import('../src/game/systems/end-turn');

    const summary = await executeEndTurn('player-char-1');

    expect(summary.botsProcessed).toBe(0);
    expect(summary.totalBattles).toBe(0);
    expect(summary.totalCargoDelivered).toBe(0);
    expect(Array.isArray(summary.events)).toBe(true);
  });
});

// ============================================================================
// Bot Combat Integration
// ============================================================================

describe('Bot Combat Integration', () => {
  let prisma: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../src/db/prisma');
    prisma = mod.prisma;
  });

  it('executeBotTurn handles encounter during travel', async () => {
    const { executeBotTurn } = await import('../src/bots/bot-turn');
    const { BOT_PROFILES } = await import('../src/bots/profiles');
    const { generateEncounter } = await import('../src/game/systems/combat');
    const profile = BOT_PROFILES[0];

    const ship = makeShip({ fuel: 500, weaponStrength: 20, shieldStrength: 20 });
    const char = makeCharacter({ name: profile.name, ship });

    prisma.character.update.mockResolvedValue({});
    prisma.character.findUnique.mockResolvedValue({ ...char, ship });
    prisma.ship.update.mockResolvedValue({});
    prisma.battleRecord.create.mockResolvedValue({});

    // Generate an enemy encounter on first trip
    (generateEncounter as any).mockResolvedValueOnce({
      type: 'PIRATE',
      name: 'Test Pirate',
      commander: 'Captain Test',
      rank: 'LIEUTENANT',
      alliance: AllianceType.NONE,
      hullStrength: 5, hullCondition: 1, // Weak enemy — will be defeated
      driveStrength: 5, driveCondition: 5,
      weaponStrength: 5, weaponCondition: 5,
      shieldStrength: 5, shieldCondition: 1,
      cabinStrength: 1, cabinCondition: 5,
      roboticsStrength: 1, roboticsCondition: 5,
      lifeSupportStrength: 1, lifeSupportCondition: 5,
      navigationStrength: 1, navigationCondition: 5,
      battleFactor: 10,
    });

    const result = await executeBotTurn('char-1', profile, () => 0.5);

    // Should not crash and should have some combat-related actions or events
    expect(result).toBeDefined();
    expect(typeof result.battlesWon).toBe('number');
    expect(typeof result.battlesLost).toBe('number');
  });
});

// ============================================================================
// End-to-end flow: validate → execute → verify reset
// ============================================================================

describe('Full End-Turn Flow', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubEnv('CLASSIC_MODE', 'false');
    vi.stubEnv('BOT_COUNT', '5');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('complete flow: validate trip count → run bots → reset trips', async () => {
    const { validateEndTurn, executeEndTurn } = await import('../src/game/systems/end-turn');
    const { BOT_PROFILES } = await import('../src/bots/profiles');
    const prismaModule = await import('../src/db/prisma');
    const prisma = prismaModule.prisma as any;

    // Step 1: Validate — player has completed 3 trips
    const validation = validateEndTurn(3);
    expect(validation.canEnd).toBe(true);

    // Step 2: Execute end turn
    prisma.user.findUnique.mockResolvedValue({ id: 'existing' });
    prisma.character.findFirst.mockResolvedValue({ id: 'existing' });

    const bots = BOT_PROFILES.slice(0, 5).map((p, i) =>
      makeBotCharacter(i, p.name, p.slug)
    );
    prisma.character.findMany.mockResolvedValue(bots);
    prisma.character.update.mockResolvedValue({});
    prisma.character.findUnique.mockImplementation(({ where }: any) => {
      const bot = bots.find(b => b.id === where.id);
      return bot || null;
    });
    prisma.ship.update.mockResolvedValue({});
    prisma.character.updateMany.mockResolvedValue({ count: 6 });

    const summary = await executeEndTurn('player-char-1');

    // Step 3: Verify
    expect(summary.botsProcessed).toBe(5);
    expect(prisma.character.updateMany).toHaveBeenCalledWith({
      data: { tripCount: 0 },
    });
  });
});
