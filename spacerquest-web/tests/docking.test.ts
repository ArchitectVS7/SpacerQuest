/**
 * SpacerQuest v4.0 - Docking System Tests
 *
 * Tests for processDocking (SP.DOCK1.S + SP.DOCK2.S)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/db/prisma', () => ({
  prisma: {
    character: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    ship: {
      update: vi.fn(),
    },
    gameLog: {
      create: vi.fn(),
    },
    starSystem: {
      findUnique: vi.fn(),
    },
    allianceSystem: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

const makeCharacter = (overrides: Record<string, unknown> = {}) => ({
  id: 'char-1',
  name: 'TestPilot',
  score: 0,
  creditsHigh: 0,
  creditsLow: 0,
  tripCount: 1,
  missionType: 0,
  destination: 0,
  cargoPods: 0,
  cargoType: 0,
  cargoManifest: null,
  allianceSymbol: 'NONE',
  ship: null,
  ...overrides,
});

const makeShip = (overrides: Record<string, unknown> = {}) => ({
  id: 'ship-1',
  fuel: 500,
  hullStrength: 20,
  hullCondition: 9,
  navigationStrength: 70, // > 60: no fuel penalty
  weaponStrength: 40,
  weaponCondition: 9,
  shieldStrength: 30,     // weapon+shield=70 > 60: no airlock damage
  shieldCondition: 9,
  lifeSupportCondition: 9,
  lifeSupportStrength: 12,
  driveCondition: 9,
  cabinCondition: 9,
  navigationCondition: 9,
  roboticsCondition: 9,
  cargoPods: 0,
  hasStarBuster: false,
  hasArchAngel: false,
  ...overrides,
});

describe('Docking system', () => {
  let prisma: any;
  let processDocking: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const prismaMod = await import('../src/db/prisma');
    prisma = prismaMod.prisma;
    const dockMod = await import('../src/game/systems/docking');
    processDocking = dockMod.processDocking;
  });

  it('returns error when character not found', async () => {
    prisma.character.findUnique.mockResolvedValue(null);
    const result = await processDocking('char-1', 5);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Character not found');
  });

  it('succeeds and logs the docking event', async () => {
    prisma.character.findUnique.mockResolvedValue(makeCharacter({ ship: makeShip() }));
    prisma.gameLog.create.mockResolvedValue(undefined);

    const result = await processDocking('char-1', 5);
    expect(result.success).toBe(true);
    expect(result.message).toContain('System 5');
    expect(prisma.gameLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'SYSTEM',
        characterId: 'char-1',
        systemId: 5,
        message: expect.stringContaining('TestPilot'),
      }),
    });
  });

  it('includes character name in the log message', async () => {
    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ name: 'StarCaptain', ship: makeShip() })
    );
    prisma.gameLog.create.mockResolvedValue(undefined);

    await processDocking('char-1', 10);
    const logCall = prisma.gameLog.create.mock.calls[0][0];
    expect(logCall.data.message).toContain('StarCaptain');
    expect(logCall.data.message).toContain('system 10');
  });

  // ── MALIGNA quest completion (SP.DOCK1.S:103-110) ──────────────────────
  describe('MALIGNA quest completion (system 27)', () => {
    it('awards +105 score, +100,000 cr, and ports to Vega-6 on arrival', async () => {
      // missionType=3 required (SP.MAL kk=3); ship fields needed for battle simulation
      prisma.character.findUnique.mockResolvedValue(
        makeCharacter({
          score: 50, creditsHigh: 0, creditsLow: 0,
          missionType: 3, destination: 27,
          tripsCompleted: 5, tripCount: 1, astrecsTraveled: 100,
          battlesWon: 3, battlesLost: 0,
          ship: makeShip(),
        })
      );
      prisma.gameLog.create.mockResolvedValue(undefined);
      prisma.character.update.mockResolvedValue(undefined);
      prisma.ship.update.mockResolvedValue(undefined);

      const result = await processDocking('char-1', 27);
      expect(result.success).toBe(true);
      expect(result.malignaCompleted).toBe(true);

      // character.update called after battle win (ship.update is first call)
      const updateCall = prisma.character.update.mock.calls[0][0];
      expect(updateCall.data.score).toBe(155);        // 50 + 105 (mallosex+5, Maligna+100)
      expect(updateCall.data.creditsHigh).toBe(10);   // 100,000 = g1+10
      expect(updateCall.data.currentSystem).toBe(14); // Vega-6
      expect(updateCall.data.missionType).toBe(0);
    });

    it('includes heroic message in response', async () => {
      prisma.character.findUnique.mockResolvedValue(
        makeCharacter({
          missionType: 3, destination: 27,
          tripsCompleted: 5, tripCount: 1, astrecsTraveled: 100,
          battlesWon: 3, battlesLost: 0,
          ship: makeShip(),
        })
      );
      prisma.gameLog.create.mockResolvedValue(undefined);
      prisma.character.update.mockResolvedValue(undefined);
      prisma.ship.update.mockResolvedValue(undefined);

      const result = await processDocking('char-1', 27);
      expect(result.message).toContain('heroic');
    });
  });

  // ── Rim port arrival effects (SP.DOCK2.S:47-67) ────────────────────────
  describe('Rim port fuel consumption (SP.DOCK2.S:47-51)', () => {
    it('consumes (61-navStrength) fuel when navStrength <= 60', async () => {
      prisma.character.findUnique.mockResolvedValue(
        makeCharacter({
          tripCount: 1,
          ship: makeShip({ navigationStrength: 50, fuel: 200 }),
        })
      );
      prisma.gameLog.create.mockResolvedValue(undefined);
      prisma.ship.update.mockResolvedValue(undefined);

      const result = await processDocking('char-1', 15);
      expect(result.success).toBe(true);
      // 61-50=11 fuel consumed
      const shipUpdate = prisma.ship.update.mock.calls[0]?.[0];
      expect(shipUpdate?.data?.fuel).toBe(189); // 200-11
      expect(result.message).toContain('11 fuel');
    });

    it('skips fuel consumption when navStrength > 60', async () => {
      prisma.character.findUnique.mockResolvedValue(
        makeCharacter({
          tripCount: 1,
          ship: makeShip({ navigationStrength: 70, fuel: 200 }),
        })
      );
      prisma.gameLog.create.mockResolvedValue(undefined);

      await processDocking('char-1', 15);
      // No ship update for fuel (nav > 60, no airlock damage either since weapon+shield >= 60)
      expect(prisma.ship.update).not.toHaveBeenCalled();
    });

    it('does not go below 0 fuel', async () => {
      prisma.character.findUnique.mockResolvedValue(
        makeCharacter({
          tripCount: 1,
          ship: makeShip({ navigationStrength: 1, fuel: 5 }),
        })
      );
      prisma.gameLog.create.mockResolvedValue(undefined);
      prisma.ship.update.mockResolvedValue(undefined);

      await processDocking('char-1', 15);
      const shipUpdate = prisma.ship.update.mock.calls[0]?.[0];
      expect(shipUpdate?.data?.fuel).toBe(0); // max(0, 5-(61-1))
    });
  });

  describe('Rim port hull damage (SP.DOCK2.S:53-59)', () => {
    it('damages hull condition by (tripCount-3) when tripCount >= 4', async () => {
      prisma.character.findUnique.mockResolvedValue(
        makeCharacter({
          tripCount: 5,
          ship: makeShip({ navigationStrength: 70, hullCondition: 7 }),
        })
      );
      prisma.gameLog.create.mockResolvedValue(undefined);
      prisma.ship.update.mockResolvedValue(undefined);

      await processDocking('char-1', 15);
      const shipUpdate = prisma.ship.update.mock.calls[0]?.[0];
      expect(shipUpdate?.data?.hullCondition).toBe(5); // 7-(5-3)=5
    });

    it('skips hull damage when tripCount < 4', async () => {
      prisma.character.findUnique.mockResolvedValue(
        makeCharacter({
          tripCount: 2,
          ship: makeShip({ navigationStrength: 70 }),
        })
      );
      prisma.gameLog.create.mockResolvedValue(undefined);

      await processDocking('char-1', 15);
      expect(prisma.ship.update).not.toHaveBeenCalled();
    });

    it('zeros hullStrength when hullCondition reaches 0', async () => {
      prisma.character.findUnique.mockResolvedValue(
        makeCharacter({
          tripCount: 7,
          ship: makeShip({ navigationStrength: 70, hullCondition: 3, hullStrength: 20 }),
        })
      );
      prisma.gameLog.create.mockResolvedValue(undefined);
      prisma.ship.update.mockResolvedValue(undefined);

      await processDocking('char-1', 15);
      const shipUpdate = prisma.ship.update.mock.calls[0]?.[0];
      expect(shipUpdate?.data?.hullCondition).toBe(0); // 3-(7-3)=-1 → 0
      expect(shipUpdate?.data?.hullStrength).toBe(0);
    });
  });

  describe('Rim port airlock damage (SP.DOCK2.S:61-67)', () => {
    it('damages life support when weapon+shield < 60', async () => {
      prisma.character.findUnique.mockResolvedValue(
        makeCharacter({
          tripCount: 1,
          ship: makeShip({
            navigationStrength: 70,
            weaponStrength: 20,
            shieldStrength: 20, // 20+20=40 < 60
            lifeSupportCondition: 9,
          }),
        })
      );
      prisma.gameLog.create.mockResolvedValue(undefined);
      prisma.ship.update.mockResolvedValue(undefined);

      await processDocking('char-1', 15);
      const shipUpdate = prisma.ship.update.mock.calls[0]?.[0];
      // tripCount=1 <= 2: x=1; lifeSupportCondition = 9-1 = 8
      expect(shipUpdate?.data?.lifeSupportCondition).toBe(8);
    });

    it('scales airlock damage with tripCount when tripCount > 2', async () => {
      prisma.character.findUnique.mockResolvedValue(
        makeCharacter({
          tripCount: 4,
          ship: makeShip({
            navigationStrength: 70,
            weaponStrength: 10,
            shieldStrength: 10, // 20 < 60
            lifeSupportCondition: 9,
          }),
        })
      );
      prisma.gameLog.create.mockResolvedValue(undefined);
      prisma.ship.update.mockResolvedValue(undefined);

      await processDocking('char-1', 15);
      const shipUpdate = prisma.ship.update.mock.calls[0]?.[0];
      // tripCount=4 > 2: x=4-2=2; hullDamage also fires (4>=4: h2-1=8)
      // Both hullCondition and lifeSupportCondition in same update
      expect(shipUpdate?.data?.lifeSupportCondition).toBe(7); // 9-2
    });

    it('skips airlock damage when weapon+shield >= 60', async () => {
      prisma.character.findUnique.mockResolvedValue(
        makeCharacter({
          tripCount: 1,
          ship: makeShip({
            navigationStrength: 70,
            weaponStrength: 40,
            shieldStrength: 30, // 70 >= 60
          }),
        })
      );
      prisma.gameLog.create.mockResolvedValue(undefined);

      await processDocking('char-1', 15);
      expect(prisma.ship.update).not.toHaveBeenCalled();
    });

    it('skips airlock damage when life support already at 0', async () => {
      prisma.character.findUnique.mockResolvedValue(
        makeCharacter({
          tripCount: 1,
          ship: makeShip({
            navigationStrength: 70,
            weaponStrength: 10,
            shieldStrength: 10,
            lifeSupportCondition: 0, // already destroyed
          }),
        })
      );
      prisma.gameLog.create.mockResolvedValue(undefined);

      await processDocking('char-1', 15);
      // No airlock damage to apply, no hull damage (tripCount=1), no fuel consume (nav=70)
      expect(prisma.ship.update).not.toHaveBeenCalled();
    });
  });

  // ── NEMESIS quest completion (SP.TOP.S gems + SP.MAL.S) ───────────────
  describe('NEMESIS quest completion (system 28)', () => {
    it('awards +25 score, +150,000 cr, and applies gems ship bonuses on victory', async () => {
      // missionType=9 required; strong ship to guarantee Nemesis battle win
      prisma.character.findUnique.mockResolvedValue(
        makeCharacter({
          score: 50, creditsHigh: 0, creditsLow: 0,
          missionType: 9, destination: 28,
          tripsCompleted: 5, tripCount: 1, astrecsTraveled: 100,
          battlesWon: 500, battlesLost: 0, promotions: 10,
          cargoManifest: 'Nemesis Orders - Coordinates: 00,00,00',
          ship: makeShip({
            weaponStrength: 199, weaponCondition: 9,
            shieldStrength: 199, shieldCondition: 9,
            lifeSupportStrength: 12, lifeSupportCondition: 9,
          }),
        })
      );
      prisma.gameLog.create.mockResolvedValue(undefined);
      prisma.character.update.mockResolvedValue(undefined);
      prisma.ship.update.mockResolvedValue(undefined);

      const result = await processDocking('char-1', 28);
      expect(result.success).toBe(true);
      expect(result.nemesisCompleted).toBe(true);

      // SP.MAL.S:319: s2=(s2+q6+5) = score+25 (q6=20 for Nemesis)
      const charUpdate1 = prisma.character.update.mock.calls[0][0];
      expect(charUpdate1.data.score).toBe(75);       // 50+25
      expect(charUpdate1.data.battlesWon).toBe(501); // e1+1
      expect(charUpdate1.data.promotions).toBe(11);  // sc+1
      expect(charUpdate1.data.missionType).toBe(0);
      expect(charUpdate1.data.cargoManifest).toBeNull();

      // SP.TOP.S gems: ship updates
      expect(prisma.ship.update).toHaveBeenCalledWith({
        where: { characterId: 'char-1' },
        data: expect.objectContaining({
          lifeSupportStrength: 62,  // 12+50
          lifeSupportCondition: 9,
          shieldStrength: 25,
          shieldCondition: 9,
          weaponStrength: 25,
          weaponCondition: 2,
          hasStarBuster: true,
          hasArchAngel: true,
        }),
      });

      // SP.TOP.S gems: 150,000 cr honorarium (g1+15 = creditsHigh+15)
      const charUpdate2 = prisma.character.update.mock.calls[1][0];
      expect(charUpdate2.data.creditsHigh).toBe(15); // 150,000 = 15 × 10,000
    });

    it('does not trigger gems if not on Nemesis mission (missionType != 9)', async () => {
      prisma.character.findUnique.mockResolvedValue(
        makeCharacter({
          missionType: 0,  // not on Nemesis mission
          ship: makeShip(),
        })
      );
      prisma.gameLog.create.mockResolvedValue(undefined);

      const result = await processDocking('char-1', 28);
      // Should not set nemesisCompleted
      expect(result.nemesisCompleted).toBeUndefined();
    });

    it('includes message about Star Jewels altering the ship', async () => {
      prisma.character.findUnique.mockResolvedValue(
        makeCharacter({
          score: 0, creditsHigh: 0, creditsLow: 0,
          missionType: 9, destination: 28,
          tripsCompleted: 0, tripCount: 0, astrecsTraveled: 0,
          battlesWon: 500, battlesLost: 0, promotions: 0,
          cargoManifest: 'Nemesis Orders - Coordinates: 00,00,00',
          ship: makeShip({
            weaponStrength: 199, weaponCondition: 9,
            shieldStrength: 199, shieldCondition: 9,
            lifeSupportStrength: 12, lifeSupportCondition: 9,
          }),
        })
      );
      prisma.gameLog.create.mockResolvedValue(undefined);
      prisma.character.update.mockResolvedValue(undefined);
      prisma.ship.update.mockResolvedValue(undefined);

      const result = await processDocking('char-1', 28);
      expect(result.message).toContain('Star Jewels');
      expect(result.message).toContain('150,000');
    });
  });

  // ── Raid completion (SP.DOCK1.S:129-135) ──────────────────────────────
  describe('Raid completion', () => {
    it('sets tripCount=3 after successful raid (original: z1=3)', async () => {
      prisma.character.findUnique.mockResolvedValue(
        makeCharacter({
          missionType: 4,
          destination: 6,
          allianceSymbol: 'ASTRO_LEAGUE',
          score: 10,
          battlesWon: 3, battlesLost: 0,
          tripsCompleted: 5, tripCount: 1, astrecsTraveled: 100,
          // Strong ship to guarantee raid battle win (enemy defcon=1: y8=100, y9=100; x8=360>>100)
          ship: makeShip(),
        })
      );
      prisma.gameLog.create.mockResolvedValue(undefined);
      prisma.ship.update.mockResolvedValue(undefined);
      prisma.starSystem.findUnique.mockResolvedValue({ id: 6, name: 'Denebola-5' });
      prisma.allianceSystem.findUnique.mockResolvedValue({ systemId: 6, alliance: 'SPACE_DRAGONS', defconLevel: 1 });
      prisma.$transaction.mockResolvedValue(undefined);

      await processDocking('char-1', 6);

      // character.update is called within the $transaction array construction — check its call args
      const charUpdateCall = prisma.character.update.mock.calls[0][0];
      expect(charUpdateCall?.data?.tripCount).toBe(3);
      expect(charUpdateCall?.data?.score).toBe(15); // 10+5
    });
  });
});
