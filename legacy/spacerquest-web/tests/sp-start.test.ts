/**
 * SpacerQuest v4.0 - SP.START Module Fidelity Tests
 *
 * Verifies the SP.START.S implementation in main-menu.ts and bank.ts:
 *
 * 1. Conqueror detection (val.start, lines 121-128):
 *    - When score >= 10000, player is marked as Conqueror and shown message
 *    - isConqueror flag is set before showing conqueror message
 *
 * 2. Financial Section rank gate (SP.LINK.S finan, lines 89-98):
 *    - Lieutenants cannot access the Financial Section (bank)
 *    - "Space Patrol rank of Commander or higher Required" message shown
 *    - Commander+ rank can access the bank
 *
 * 3. Jail check (vlst, line 132):
 *    - Players with J% prefix in name are routed to jail on login
 *
 * Original source: SP.START.S (val.start, vlst, hailstart, main1)
 * Modern files:
 *   - src/game/screens/main-menu.ts (val.start, vlst, hailstart)
 *   - src/game/screens/bank.ts (Financial Section rank gate via SP.LINK.S)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Rank } from '@prisma/client';

// ============================================================================
// MOCKS — top-level so all describe blocks share the same mock instances
// ============================================================================

vi.mock('../src/db/prisma', () => ({
  prisma: {
    character: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    user: { update: vi.fn() },
    allianceMembership: { findUnique: vi.fn(), deleteMany: vi.fn() },
    combatSession: { findFirst: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    battleRecord: { deleteMany: vi.fn() },
    travelState: { deleteMany: vi.fn() },
    gameLog: { deleteMany: vi.fn(), createMany: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    portOwnership: { deleteMany: vi.fn() },
    ship: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('../src/game/systems/jail', () => ({
  isJailed: vi.fn().mockReturnValue(false),
}));

vi.mock('../src/game/systems/extra-curricular', () => ({
  applyVandalism: vi.fn().mockResolvedValue({ vandalized: false, guardConsumed: false }),
}));

vi.mock('../src/bots/config', () => ({
  isClassicMode: vi.fn().mockReturnValue(false),
}));

vi.mock('../src/game/systems/economy', () => ({
  getSystemName: vi.fn().mockReturnValue('Sun-3'),
}));

// ============================================================================
// HELPERS
// ============================================================================

function makeShip(overrides: Record<string, unknown> = {}) {
  return {
    fuel: 500,
    hullStrength: 10, hullCondition: 9,
    driveStrength: 10, driveCondition: 9,
    cabinStrength: 10, cabinCondition: 9,
    lifeSupportStrength: 10, lifeSupportCondition: 9,
    weaponStrength: 10, weaponCondition: 9,
    navigationStrength: 10, navigationCondition: 9,
    roboticsStrength: 10, roboticsCondition: 9,
    shieldStrength: 10, shieldCondition: 9,
    cargoPods: 0, cargoType: 0,
    hasShipGuard: false, hasTransWarpDrive: false,
    isAstraxialHull: false,
    ...overrides,
  };
}

function makeCharacter(overrides: Record<string, unknown> = {}) {
  return {
    id: 'char-1',
    userId: 'user-1',
    name: 'TestSpacer',
    shipName: 'Nova Star',
    rank: Rank.COMMANDER,
    score: 300,
    creditsHigh: 1, creditsLow: 5000,
    bankHigh: 0, bankLow: 0,
    currentSystem: 1,
    isLost: false,
    isConqueror: false,
    allianceSymbol: 'NONE',
    tripCount: 0,
    tripsCompleted: 10,
    battlesWon: 5,
    battlesLost: 2,
    astrecsTraveled: 50,
    cargoDelivered: 8,
    rescuesPerformed: 1,
    cargoPods: 0,
    cargoManifest: null,
    destination: 0,
    portOwnership: null,
    ship: makeShip(),
    user: { isAdmin: false },
    extraCurricularMode: null,
    ...overrides,
  };
}

// ============================================================================
// CONQUEROR DETECTION (SP.START.S val.start lines 121-128)
// ============================================================================

describe('SP.START val.start — Conqueror detection', () => {
  let prisma: any;
  let MainMenuScreen: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const prismaMod = await import('../src/db/prisma');
    prisma = prismaMod.prisma;
    const mod = await import('../src/game/screens/main-menu');
    MainMenuScreen = mod.MainMenuScreen;
    // Default: alliance lookup and combat session return nothing
    prisma.allianceMembership.findUnique.mockResolvedValue(null);
    prisma.combatSession.findFirst.mockResolvedValue(null);
    prisma.character.update.mockResolvedValue({});
    prisma.user.update.mockResolvedValue({});
    prisma.$transaction.mockResolvedValue([]);
  });

  it('SP.START val.start line 124: shows Conqueror message when score >= 10000', async () => {
    // Original: if s2<10000 goto vlst
    //           print "Hail Conqueror of Spacer Quest!...can you do it again?"
    const char = makeCharacter({ score: 10000, isConqueror: false });
    prisma.character.findUnique.mockResolvedValue(char);

    const result = await MainMenuScreen.render('char-1');
    expect(result.output).toContain('Hail Conqueror');
  });

  it('SP.START val.start: sets user.hasConquered=true when score >= 10000', async () => {
    const char = makeCharacter({ score: 10000, isConqueror: false });
    prisma.character.findUnique.mockResolvedValue(char);

    await MainMenuScreen.render('char-1');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ hasConquered: true }),
      })
    );
  });

  it('SP.START val.start: does NOT trigger for score < 10000', async () => {
    const char = makeCharacter({ score: 9999, isConqueror: false });
    prisma.character.findUnique.mockResolvedValue(char);

    const result = await MainMenuScreen.render('char-1');
    expect(result.output).not.toContain('Hail Conqueror');
    expect(prisma.character.update).not.toHaveBeenCalled();
  });

  it('SP.START val.start: does NOT re-trigger when already isConqueror=true', async () => {
    // Once marked, the check is skipped so player can see normal menu
    const char = makeCharacter({ score: 10000, isConqueror: true });
    prisma.character.findUnique.mockResolvedValue(char);

    const result = await MainMenuScreen.render('char-1');
    expect(result.output).not.toContain('Hail Conqueror');
    expect(prisma.character.update).not.toHaveBeenCalled();
  });

  it('SP.START val.start: score exactly 10000 triggers Conqueror (boundary)', async () => {
    const char = makeCharacter({ score: 10000, isConqueror: false });
    prisma.character.findUnique.mockResolvedValue(char);

    const result = await MainMenuScreen.render('char-1');
    expect(result.output).toContain('Hail Conqueror');
  });

  it('SP.START val.start: score 15000 (well above threshold) triggers Conqueror', async () => {
    const char = makeCharacter({ score: 15000, isConqueror: false });
    prisma.character.findUnique.mockResolvedValue(char);

    const result = await MainMenuScreen.render('char-1');
    expect(result.output).toContain('Hail Conqueror');
  });
});

// ============================================================================
// FINANCIAL SECTION RANK GATE (SP.LINK.S finan, lines 89-98)
// ============================================================================

describe('SP.LINK.S finan — Financial Section rank gate', () => {
  let prisma: any;
  let BankScreen: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const prismaMod = await import('../src/db/prisma');
    prisma = prismaMod.prisma;
    const mod = await import('../src/game/screens/bank');
    BankScreen = mod.BankScreen;
  });

  it('SP.LINK.S finan line 92: blocks Lieutenant from Financial Section', async () => {
    // Original: if (pp$="") or (left$(pp$,4)="Lieu") goto fink
    // fink: print "Space Patrol rank of Commander or higher"
    const char = makeCharacter({ rank: Rank.LIEUTENANT });
    prisma.character.findUnique.mockResolvedValue(char);

    const result = await BankScreen.render('char-1');
    expect(result.output).toContain('Commander or higher');
    expect(result.nextScreen).toBe('main-menu');
  });

  it('SP.LINK.S finan line 96: shows correct block message for Lieutenant', async () => {
    const char = makeCharacter({ rank: Rank.LIEUTENANT });
    prisma.character.findUnique.mockResolvedValue(char);

    const result = await BankScreen.render('char-1');
    expect(result.output).toContain('Required for admittance into the Financial Section');
  });

  it('SP.LINK.S finan: Commander can access Financial Section', async () => {
    // Original: if NOT (pp$="" or left(pp$,4)="Lieu") → allowed
    const char = makeCharacter({ rank: Rank.COMMANDER });
    prisma.character.findUnique.mockResolvedValue(char);

    const result = await BankScreen.render('char-1');
    expect(result.output).not.toContain('Commander or higher');
    expect(result.output).toContain('FIRST GALACTIC BANK');
    expect(result.nextScreen).toBeUndefined();
  });

  it('SP.LINK.S finan: Captain can access Financial Section', async () => {
    const char = makeCharacter({ rank: Rank.CAPTAIN });
    prisma.character.findUnique.mockResolvedValue(char);

    const result = await BankScreen.render('char-1');
    expect(result.output).toContain('FIRST GALACTIC BANK');
  });

  it('SP.LINK.S finan: Admiral can access Financial Section', async () => {
    const char = makeCharacter({ rank: Rank.ADMIRAL });
    prisma.character.findUnique.mockResolvedValue(char);

    const result = await BankScreen.render('char-1');
    expect(result.output).toContain('FIRST GALACTIC BANK');
  });

  it('SP.LINK.S finan: Giga Hero can access Financial Section', async () => {
    const char = makeCharacter({ rank: Rank.GIGA_HERO });
    prisma.character.findUnique.mockResolvedValue(char);

    const result = await BankScreen.render('char-1');
    expect(result.output).toContain('FIRST GALACTIC BANK');
  });

  it('SP.LINK.S finan: missing character is blocked (returns to main-menu)', async () => {
    prisma.character.findUnique.mockResolvedValue(null);

    const result = await BankScreen.render('char-missing');
    expect(result.nextScreen).toBe('main-menu');
  });
});

// ============================================================================
// JAIL CHECK (SP.START.S vlst, line 132)
// ============================================================================

describe('SP.START vlst — Jail check on login', () => {
  it('SP.START vlst line 132: source checks isJailed before rendering menu', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/game/screens/main-menu.ts', import.meta.url),
      'utf-8'
    );
    // Original: if left$(na$,2)="J%" link "sp.end","jail"
    expect(code).toContain('isJailed');
    expect(code).toContain("nextScreen: 'jail'");
  });
});

// ============================================================================
// BANK RANK GATE — source code structure checks
// ============================================================================

describe('Bank rank gate — source code structure', () => {
  it('bank.ts contains the SP.LINK.S finan rank check', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/game/screens/bank.ts', import.meta.url),
      'utf-8'
    );
    // Must reference the rank gate
    expect(code).toContain('LIEUTENANT');
    expect(code).toContain('Commander or higher');
    expect(code).toContain('Financial Section');
  });

  it('bank.ts rank check routes back to main-menu on block (SP.LINK.S: goto linker)', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/game/screens/bank.ts', import.meta.url),
      'utf-8'
    );
    expect(code).toContain("nextScreen: 'main-menu'");
  });
});

// ============================================================================
// CONQUEROR DETECTION — source code structure check
// ============================================================================

describe('Conqueror detection — source code structure', () => {
  it('main-menu.ts contains isConqueror detection at score >= 10000', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/game/screens/main-menu.ts', import.meta.url),
      'utf-8'
    );
    // SP.START.S val.start: if s2<10000 goto vlst
    expect(code).toContain('score >= 10000');
    expect(code).toContain('isConqueror');
    expect(code).toContain('Hail Conqueror');
  });

  it('main-menu.ts sets user.hasConquered=true and deletes character when conqueror is detected', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/game/screens/main-menu.ts', import.meta.url),
      'utf-8'
    );
    expect(code).toContain('hasConquered: true');
    expect(code).toContain('character.delete');
  });
});

// ============================================================================
// SP.END grite subroutine — CONQUEST + HERO GameLog writes (lines ~355-362)
// ============================================================================

describe('SP.END grite — CONQUEST and HERO GameLog entries on conquest', () => {
  let prisma: any;
  let MainMenuScreen: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const prismaMod = await import('../src/db/prisma');
    prisma = prismaMod.prisma;
    const mod = await import('../src/game/screens/main-menu');
    MainMenuScreen = mod.MainMenuScreen;
    prisma.allianceMembership.findUnique.mockResolvedValue(null);
    prisma.combatSession.findFirst.mockResolvedValue(null);
    prisma.user.update.mockResolvedValue({});
    prisma.$transaction.mockResolvedValue([]);
    prisma.gameLog.createMany.mockResolvedValue({ count: 2 });
  });

  it('SP.END grite: writes CONQUEST GameLog entry on conquest (sp.great)', async () => {
    // Original: open #1,"sp.great":append #1:print #1, da$+":_"+pp$+"_"+a1$+"_"+nz$+"_CONQUERED_SPACER_QUEST!"
    const char = makeCharacter({ score: 10000, isConqueror: false, name: 'BoldSpacer', shipName: 'Pegasus', rank: Rank.ADMIRAL });
    prisma.character.findUnique.mockResolvedValue(char);

    await MainMenuScreen.render('char-1');

    expect(prisma.gameLog.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ type: 'CONQUEST', message: expect.stringContaining('CONQUERED_SPACER_QUEST!') }),
        ]),
      })
    );
  });

  it('SP.END grite: writes HERO GameLog entry on conquest (sp.hero)', async () => {
    // Original: open #1,"sp.hero":append #1:print #1, da$+": "+pp$+"_"+a1$+"/"+nz$+"___Victorious Hero!"
    const char = makeCharacter({ score: 10000, isConqueror: false, name: 'BoldSpacer', shipName: 'Pegasus', rank: Rank.ADMIRAL });
    prisma.character.findUnique.mockResolvedValue(char);

    await MainMenuScreen.render('char-1');

    expect(prisma.gameLog.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ type: 'HERO', message: expect.stringContaining('Victorious Hero!') }),
        ]),
      })
    );
  });

  it('SP.END grite: CONQUEST message includes player name and ship (pp$, a1$, nz$)', async () => {
    const char = makeCharacter({ score: 10000, isConqueror: false, name: 'BoldSpacer', shipName: 'Pegasus', rank: Rank.ADMIRAL });
    prisma.character.findUnique.mockResolvedValue(char);

    await MainMenuScreen.render('char-1');

    const call = prisma.gameLog.createMany.mock.calls[0][0];
    const conquestEntry = call.data.find((d: any) => d.type === 'CONQUEST');
    expect(conquestEntry.message).toContain('BoldSpacer');
    expect(conquestEntry.message).toContain('Pegasus');
  });

  it('SP.END grite: HERO message includes player name/ship with slash separator (a1$+"/"+nz$)', async () => {
    const char = makeCharacter({ score: 10000, isConqueror: false, name: 'BoldSpacer', shipName: 'Pegasus', rank: Rank.ADMIRAL });
    prisma.character.findUnique.mockResolvedValue(char);

    await MainMenuScreen.render('char-1');

    const call = prisma.gameLog.createMany.mock.calls[0][0];
    const heroEntry = call.data.find((d: any) => d.type === 'HERO');
    expect(heroEntry.message).toContain('BoldSpacer/Pegasus');
  });

  it('SP.END grite: writes both entries before character deletion', async () => {
    // Entries must be written BEFORE $transaction deletes the character
    const char = makeCharacter({ score: 10000, isConqueror: false });
    prisma.character.findUnique.mockResolvedValue(char);

    const callOrder: string[] = [];
    prisma.gameLog.createMany.mockImplementation(() => { callOrder.push('createMany'); return Promise.resolve({ count: 2 }); });
    prisma.$transaction.mockImplementation(() => { callOrder.push('$transaction'); return Promise.resolve([]); });

    await MainMenuScreen.render('char-1');

    expect(callOrder.indexOf('createMany')).toBeLessThan(callOrder.indexOf('$transaction'));
  });

  it('SP.END grite: does NOT write logs when score < 10000', async () => {
    const char = makeCharacter({ score: 9999, isConqueror: false });
    prisma.character.findUnique.mockResolvedValue(char);

    await MainMenuScreen.render('char-1');

    expect(prisma.gameLog.createMany).not.toHaveBeenCalled();
  });
});

// ============================================================================
// SP.START.S G key — Hall of Fame (copy"sp.great")
// SP.START.S S key — Space Heroes (copy"sp.hero")
// ============================================================================

describe('SP.START G/H keys — Hall of Fame and Space Heroes (space-news.ts)', () => {
  it('space-news.ts has (G)reat menu option for Hall of Fame (SP.START.S: if i$="G" copy"sp.great")', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/game/screens/space-news.ts', import.meta.url),
      'utf-8'
    );
    expect(code).toContain("'G'");
    expect(code).toContain('(G)');
    expect(code).toContain('Hall of Fame');
  });

  it('space-news.ts has (H)eroes menu option for Space Heroes (SP.START.S: if i$="S" copy"sp.hero")', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/game/screens/space-news.ts', import.meta.url),
      'utf-8'
    );
    expect(code).toContain("'H'");
    expect(code).toContain('(H)');
    expect(code).toContain('Space Heroes');
  });

  it('space-news.ts G key queries CONQUEST log type (sp.great = CONQUEST entries)', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/game/screens/space-news.ts', import.meta.url),
      'utf-8'
    );
    expect(code).toContain("'CONQUEST'");
    expect(code).toContain('Hall of Fame');
  });

  it('space-news.ts H key queries HERO log type (sp.hero = HERO entries)', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/game/screens/space-news.ts', import.meta.url),
      'utf-8'
    );
    expect(code).toContain("'HERO'");
    expect(code).toContain('Space Heroes');
  });

  it('main-menu.ts writes CONQUEST type to GameLog on conquest (sp.great → CONQUEST)', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/game/screens/main-menu.ts', import.meta.url),
      'utf-8'
    );
    expect(code).toContain("type: 'CONQUEST'");
    expect(code).toContain('CONQUERED_SPACER_QUEST!');
  });

  it('main-menu.ts writes HERO type to GameLog on conquest (sp.hero → HERO)', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/game/screens/main-menu.ts', import.meta.url),
      'utf-8'
    );
    expect(code).toContain("type: 'HERO'");
    expect(code).toContain('Victorious Hero!');
  });
});

// ============================================================================
// SP.START.S portf — Port Fuel Prices display (lines 217-249)
// ============================================================================

describe('SP.START.S portf — Port Fuel Prices display', () => {
  it('shows system number column (# per original portf header)', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/game/screens/port-fuel-prices.ts', import.meta.url),
      'utf-8'
    );
    // Original header: " #   Port               Owner                  A Fuel Sell  Buy"
    expect(code).toContain('#   Port');
  });

  it('shows fuel-in-storage column (m9 in original)', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/game/screens/port-fuel-prices.ts', import.meta.url),
      'utf-8'
    );
    expect(code).toContain('fuelStored');
    expect(code).toContain('fuelStr');
  });

  it('shows "(for sale)" when no owner (original: if m5$="" lo$="_____(for sale)_____")', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/game/screens/port-fuel-prices.ts', import.meta.url),
      'utf-8'
    );
    expect(code).toContain('for sale');
  });

  it('displays sell price (m5) and buy price (m5/2) separately', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/game/screens/port-fuel-prices.ts', import.meta.url),
      'utf-8'
    );
    // sell = port.fuelPrice, buy = floor(fuelPrice/2)
    expect(code).toContain('port.fuelPrice / 2');
    expect(code).toContain('sellStr');
    expect(code).toContain('buyStr');
  });

  it('shows "?" for sell/buy when price is 0 (original: if m5<1 lq$="?")', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/game/screens/port-fuel-prices.ts', import.meta.url),
      'utf-8'
    );
    expect(code).toContain("'   ?'");
    expect(code).toContain("'  ?'");
  });
});

// ============================================================================
// SP.LINK.S rescue subroutine (lines 84-86) — RESCUE GameLog on self-rescue
// ============================================================================

describe('SP.LINK.S rescue — RESCUE GameLog entry on successful self-rescue', () => {
  let prisma: any;
  let RescueSelfScreen: any;

  const makeCharacter = (overrides: Record<string, unknown> = {}) => ({
    id: 'char-rescue',
    userId: 'user-1',
    name: 'LostSpacer',
    shipName: 'Wanderer',
    score: 1500,  // sc = floor(1500/150) = 10 → cost = 10000 cr
    creditsHigh: 1,
    creditsLow: 5000,  // total = 15000 > 10000 cost
    isLost: true,
    lostLocation: 5,
    rank: 'COMMANDER',
    ...overrides,
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    const prismaMod = await import('../src/db/prisma');
    prisma = prismaMod.prisma;
    const mod = await import('../src/game/screens/rescue-self');
    RescueSelfScreen = mod.RescueSelfScreen;
    prisma.character.update.mockResolvedValue({});
    prisma.gameLog.create.mockResolvedValue({});
  });

  it('SP.LINK.S rescue lines 84-86: writes RESCUE GameLog when self-rescue succeeds', async () => {
    // Original: open #1,"sp.great":append #1:print #1, da$+" : The "+sp$+" Rescue Service rescued "+nz$:close
    const char = makeCharacter();
    prisma.character.findUnique.mockResolvedValue(char);

    await RescueSelfScreen.handleInput('char-rescue', 'Y');

    expect(prisma.gameLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'RESCUE',
          characterId: 'char-rescue',
          message: expect.stringContaining('Rescue Service rescued'),
        }),
      })
    );
  });

  it('SP.LINK.S rescue: RESCUE log message includes ship name (nz$)', async () => {
    const char = makeCharacter({ shipName: 'Wanderer' });
    prisma.character.findUnique.mockResolvedValue(char);

    await RescueSelfScreen.handleInput('char-rescue', 'Y');

    const call = prisma.gameLog.create.mock.calls[0][0];
    expect(call.data.message).toContain('Wanderer');
  });

  it('SP.LINK.S rescue: does NOT write RESCUE log when player declines rescue (N)', async () => {
    const char = makeCharacter();
    prisma.character.findUnique.mockResolvedValue(char);

    await RescueSelfScreen.handleInput('char-rescue', 'N');

    expect(prisma.gameLog.create).not.toHaveBeenCalled();
  });

  it('SP.LINK.S rescue: does NOT write RESCUE log when player lacks credits', async () => {
    // cost = floor(1500/150)*1000 = 10000 cr; player has only 500 cr
    const char = makeCharacter({ creditsHigh: 0, creditsLow: 500 });
    prisma.character.findUnique.mockResolvedValue(char);

    await RescueSelfScreen.handleInput('char-rescue', 'Y');

    expect(prisma.gameLog.create).not.toHaveBeenCalled();
  });
});
