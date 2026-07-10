/**
 * SpacerQuest v4.0 - Input Validation Schema Tests
 *
 * Tests all Zod schemas used for API request body validation.
 * Covers both valid and invalid inputs.
 */

import { describe, it, expect } from 'vitest';
import {
  createCharacterBody,
  launchBody,
  courseChangeBody,
  engageBody,
  combatActionBody,
  fuelBody,
  allianceInvestBody,
  allianceWithdrawBody,
  wheelBody,
  dareBody,
  rescueBody,
  shipNameBody,
  allianceBody,
  upgradeBody,
  duelChallengeBody,
} from '../src/app/schemas';

// ============================================================================
// CHARACTER CREATION
// ============================================================================

describe('createCharacterBody', () => {
  it('accepts valid name and shipName', () => {
    const result = createCharacterBody.safeParse({ name: 'Ace', shipName: 'Falcon' });
    expect(result.success).toBe(true);
  });

  it('rejects name shorter than 3 characters', () => {
    const result = createCharacterBody.safeParse({ name: 'AB', shipName: 'Falcon' });
    expect(result.success).toBe(false);
  });

  it('rejects name longer than 15 characters', () => {
    const result = createCharacterBody.safeParse({ name: 'A'.repeat(16), shipName: 'Falcon' });
    expect(result.success).toBe(false);
  });

  it('rejects missing shipName', () => {
    const result = createCharacterBody.safeParse({ name: 'Ace' });
    expect(result.success).toBe(false);
  });

  it('rejects non-string name', () => {
    const result = createCharacterBody.safeParse({ name: 123, shipName: 'Falcon' });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// NAVIGATION
// ============================================================================

describe('launchBody', () => {
  it('accepts valid destinationSystemId', () => {
    const result = launchBody.safeParse({ destinationSystemId: 5 });
    expect(result.success).toBe(true);
  });

  it('accepts valid destinationSystemId with cargo contract', () => {
    const result = launchBody.safeParse({
      destinationSystemId: 10,
      cargoContract: { pods: 5, type: 1, payment: 5000 },
    });
    expect(result.success).toBe(true);
  });

  it('rejects destinationSystemId below 1', () => {
    const result = launchBody.safeParse({ destinationSystemId: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects destinationSystemId above 28', () => {
    const result = launchBody.safeParse({ destinationSystemId: 29 });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer destinationSystemId', () => {
    const result = launchBody.safeParse({ destinationSystemId: 5.5 });
    expect(result.success).toBe(false);
  });

  it('rejects missing destinationSystemId', () => {
    const result = launchBody.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('courseChangeBody', () => {
  it('accepts valid newSystemId', () => {
    const result = courseChangeBody.safeParse({ newSystemId: 14 });
    expect(result.success).toBe(true);
  });

  it('rejects newSystemId out of range', () => {
    expect(courseChangeBody.safeParse({ newSystemId: 0 }).success).toBe(false);
    expect(courseChangeBody.safeParse({ newSystemId: 29 }).success).toBe(false);
  });
});

// ============================================================================
// COMBAT
// ============================================================================

describe('engageBody', () => {
  it('accepts attack: true', () => {
    expect(engageBody.safeParse({ attack: true }).success).toBe(true);
  });

  it('accepts attack: false', () => {
    expect(engageBody.safeParse({ attack: false }).success).toBe(true);
  });

  it('rejects non-boolean attack', () => {
    expect(engageBody.safeParse({ attack: 'yes' }).success).toBe(false);
  });

  it('rejects missing attack', () => {
    expect(engageBody.safeParse({}).success).toBe(false);
  });
});

describe('combatActionBody', () => {
  it('accepts FIRE action', () => {
    expect(combatActionBody.safeParse({ action: 'FIRE' }).success).toBe(true);
  });

  it('accepts RETREAT action', () => {
    expect(combatActionBody.safeParse({ action: 'RETREAT' }).success).toBe(true);
  });

  it('accepts SURRENDER action', () => {
    expect(combatActionBody.safeParse({ action: 'SURRENDER' }).success).toBe(true);
  });

  it('rejects invalid action', () => {
    expect(combatActionBody.safeParse({ action: 'RUN' }).success).toBe(false);
  });

  it('accepts optional round and enemy', () => {
    const result = combatActionBody.safeParse({
      action: 'FIRE',
      round: 3,
      enemy: { weaponStrength: 20 },
    });
    expect(result.success).toBe(true);
  });

  it('rejects round < 1', () => {
    expect(combatActionBody.safeParse({ action: 'FIRE', round: 0 }).success).toBe(false);
  });
});

// ============================================================================
// ECONOMY
// ============================================================================

describe('fuelBody', () => {
  it('accepts valid units', () => {
    expect(fuelBody.safeParse({ units: 100 }).success).toBe(true);
  });

  it('rejects zero units', () => {
    expect(fuelBody.safeParse({ units: 0 }).success).toBe(false);
  });

  it('rejects negative units', () => {
    expect(fuelBody.safeParse({ units: -5 }).success).toBe(false);
  });

  it('rejects non-integer units', () => {
    expect(fuelBody.safeParse({ units: 10.5 }).success).toBe(false);
  });
});

describe('wheelBody (Wheel of Fortune)', () => {
  it('accepts valid bet', () => {
    const result = wheelBody.safeParse({ betNumber: 7, betAmount: 500, rolls: 5 });
    expect(result.success).toBe(true);
  });

  it('rejects betNumber outside 1-20', () => {
    expect(wheelBody.safeParse({ betNumber: 0, betAmount: 100, rolls: 3 }).success).toBe(false);
    expect(wheelBody.safeParse({ betNumber: 21, betAmount: 100, rolls: 3 }).success).toBe(false);
  });

  it('rejects betAmount outside 1-1000', () => {
    expect(wheelBody.safeParse({ betNumber: 5, betAmount: 0, rolls: 3 }).success).toBe(false);
    expect(wheelBody.safeParse({ betNumber: 5, betAmount: 1001, rolls: 3 }).success).toBe(false);
  });

  it('rejects rolls outside 3-7', () => {
    expect(wheelBody.safeParse({ betNumber: 5, betAmount: 100, rolls: 2 }).success).toBe(false);
    expect(wheelBody.safeParse({ betNumber: 5, betAmount: 100, rolls: 8 }).success).toBe(false);
  });
});

describe('dareBody (Spacer\'s Dare)', () => {
  it('accepts valid dare', () => {
    expect(dareBody.safeParse({ rounds: 5, multiplier: 2 }).success).toBe(true);
  });

  it('rejects rounds outside 3-10', () => {
    expect(dareBody.safeParse({ rounds: 2, multiplier: 1 }).success).toBe(false);
    expect(dareBody.safeParse({ rounds: 11, multiplier: 1 }).success).toBe(false);
  });

  it('rejects multiplier outside 1-3', () => {
    expect(dareBody.safeParse({ rounds: 5, multiplier: 0 }).success).toBe(false);
    expect(dareBody.safeParse({ rounds: 5, multiplier: 4 }).success).toBe(false);
  });
});

describe('rescueBody', () => {
  it('accepts valid targetId', () => {
    expect(rescueBody.safeParse({ targetId: 'abc-123' }).success).toBe(true);
  });

  it('rejects empty targetId', () => {
    expect(rescueBody.safeParse({ targetId: '' }).success).toBe(false);
  });

  it('rejects missing targetId', () => {
    expect(rescueBody.safeParse({}).success).toBe(false);
  });
});

// ============================================================================
// CHARACTER MANAGEMENT
// ============================================================================

describe('shipNameBody', () => {
  it('accepts valid ship name', () => {
    expect(shipNameBody.safeParse({ shipName: 'Falcon' }).success).toBe(true);
  });

  it('rejects ship name < 3 chars', () => {
    expect(shipNameBody.safeParse({ shipName: 'AB' }).success).toBe(false);
  });

  it('rejects ship name > 15 chars', () => {
    expect(shipNameBody.safeParse({ shipName: 'A'.repeat(16) }).success).toBe(false);
  });
});

describe('allianceBody', () => {
  it('accepts all valid alliance symbols', () => {
    for (const sym of ['NONE', '+', '@', '&', '^']) {
      expect(allianceBody.safeParse({ alliance: sym }).success).toBe(true);
    }
  });

  it('rejects invalid alliance symbol', () => {
    expect(allianceBody.safeParse({ alliance: 'X' }).success).toBe(false);
  });
});

// ============================================================================
// SHIP
// ============================================================================

describe('upgradeBody', () => {
  it('accepts valid upgrade request', () => {
    expect(upgradeBody.safeParse({ component: 'hull', upgradeType: 'STRENGTH' }).success).toBe(true);
    expect(upgradeBody.safeParse({ component: 'weapons', upgradeType: 'CONDITION' }).success).toBe(true);
  });

  it('rejects invalid upgradeType', () => {
    expect(upgradeBody.safeParse({ component: 'hull', upgradeType: 'POWER' }).success).toBe(false);
  });

  it('rejects empty component', () => {
    expect(upgradeBody.safeParse({ component: '', upgradeType: 'STRENGTH' }).success).toBe(false);
  });
});

// ============================================================================
// DUELING
// ============================================================================

describe('duelChallengeBody', () => {
  it('accepts valid duel challenge', () => {
    const result = duelChallengeBody.safeParse({
      stakesType: 'CREDITS',
      stakesAmount: 5000,
      arenaType: 1,
    });
    expect(result.success).toBe(true);
  });

  it('accepts challenge with optional targetId', () => {
    const result = duelChallengeBody.safeParse({
      targetId: 42,
      stakesType: 'CREDITS',
      stakesAmount: 1000,
      arenaType: 3,
    });
    expect(result.success).toBe(true);
  });

  it('rejects arenaType outside 1-6', () => {
    expect(duelChallengeBody.safeParse({
      stakesType: 'CREDITS', stakesAmount: 100, arenaType: 0,
    }).success).toBe(false);
    expect(duelChallengeBody.safeParse({
      stakesType: 'CREDITS', stakesAmount: 100, arenaType: 7,
    }).success).toBe(false);
  });

  it('rejects negative stakesAmount', () => {
    expect(duelChallengeBody.safeParse({
      stakesType: 'CREDITS', stakesAmount: -1, arenaType: 1,
    }).success).toBe(false);
  });

  it('rejects missing stakesType', () => {
    expect(duelChallengeBody.safeParse({
      stakesAmount: 100, arenaType: 1,
    }).success).toBe(false);
  });

  it('rejects invalid stakesType values', () => {
    expect(duelChallengeBody.safeParse({
      stakesType: 'invalid', stakesAmount: 100, arenaType: 1,
    }).success).toBe(false);
    expect(duelChallengeBody.safeParse({
      stakesType: 'credits', stakesAmount: 100, arenaType: 1,
    }).success).toBe(false); // must be uppercase
  });

  it('accepts all valid stakesType values', () => {
    for (const type of ['POINTS', 'CREDITS', 'COMPONENTS']) {
      expect(duelChallengeBody.safeParse({
        stakesType: type, stakesAmount: 100, arenaType: 1,
      }).success).toBe(true);
    }
  });
});

// ============================================================================
// ALLIANCE
// ============================================================================

describe('allianceInvestBody', () => {
  it('accepts DEFCON investment', () => {
    const result = allianceInvestBody.safeParse({ type: 'DEFCON', systemId: 5, levels: 3 });
    expect(result.success).toBe(true);
  });

  it('accepts INVEST type', () => {
    const result = allianceInvestBody.safeParse({ type: 'INVEST', amount: 5000 });
    expect(result.success).toBe(true);
  });

  it('rejects invalid type', () => {
    expect(allianceInvestBody.safeParse({ type: 'RAID' }).success).toBe(false);
  });

  it('rejects levels > 10', () => {
    expect(allianceInvestBody.safeParse({ type: 'DEFCON', levels: 11 }).success).toBe(false);
  });
});

describe('allianceWithdrawBody', () => {
  it('accepts valid withdrawal', () => {
    expect(allianceWithdrawBody.safeParse({ amount: 1000 }).success).toBe(true);
  });

  it('rejects zero amount', () => {
    expect(allianceWithdrawBody.safeParse({ amount: 0 }).success).toBe(false);
  });

  it('rejects missing amount', () => {
    expect(allianceWithdrawBody.safeParse({}).success).toBe(false);
  });
});
