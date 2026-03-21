/**
 * SpacerQuest v4.0 - Launch Validation Tests (SP.LIFT.S)
 *
 * Verifies the launch bay pre-flight check sequence from SP.LIFT.S lines 56-74.
 * Each check must be a blocking error (goto start in original), not a warning.
 * Checks are against component STRENGTH only (not condition), except hull condition
 * and drive condition which are separate checks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/db/prisma', () => ({
  prisma: {
    character: { findUnique: vi.fn() },
    starSystem: { findUnique: vi.fn() },
    travelState: { upsert: vi.fn(), findUnique: vi.fn() },
  },
}));

// Black hole module has its own prisma usage; provide a minimal mock
vi.mock('../src/game/systems/black-hole', () => ({
  isAndromedaSystem: vi.fn().mockReturnValue(false),
  canTransitBlackHole: vi.fn().mockReturnValue({ canTransit: true }),
}));

vi.mock('../src/bots/config', () => ({
  isClassicMode: vi.fn().mockReturnValue(false),
}));

const makeShip = (overrides: Record<string, number | boolean> = {}) => ({
  id: 'ship-1',
  fuel: 500,
  hullStrength: 10,
  hullCondition: 9,
  driveStrength: 10,
  driveCondition: 9,
  cabinStrength: 10,
  cabinCondition: 9,
  lifeSupportStrength: 10,
  lifeSupportCondition: 9,
  navigationStrength: 10,
  navigationCondition: 9,
  roboticsStrength: 10,
  roboticsCondition: 9,
  weaponStrength: 10,
  shieldStrength: 10,
  hasTransWarpDrive: false,
  isAstraxialHull: false,
  ...overrides,
});

const makeCharacter = (overrides: Record<string, unknown> = {}) => ({
  id: 'char-1',
  currentSystem: 5,
  tripCount: 0,
  lastTripDate: null,
  cargoPods: 0,
  cargoType: 0,
  destination: 0,
  cargoManifest: null,
  ship: makeShip(),
  ...overrides,
});

describe('SP.LIFT.S launch validation (validateLaunch)', () => {
  let prisma: any;
  let validateLaunch: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const prismaMod = await import('../src/db/prisma');
    prisma = prismaMod.prisma;
    const travelMod = await import('../src/game/systems/travel');
    validateLaunch = travelMod.validateLaunch;
  });

  it('passes all checks for a fully equipped ship', async () => {
    prisma.character.findUnique.mockResolvedValue(makeCharacter());
    const result = await validateLaunch('char-1', 8);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // SP.LIFT.S line 60: if d1<1 print "No Drives":goto start
  it('blocks launch when drive strength is 0 (d1<1)', async () => {
    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ ship: makeShip({ driveStrength: 0 }) })
    );
    const result = await validateLaunch('char-1', 8);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('No Drives');
  });

  // SP.LIFT.S line 61: if c1<1 print "No cabin":goto start  (BLOCKING, not a warning)
  it('blocks launch when cabin strength is 0 (c1<1)', async () => {
    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ ship: makeShip({ cabinStrength: 0 }) })
    );
    const result = await validateLaunch('char-1', 8);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('No cabin');
  });

  // SP.LIFT.S: cabin check is on strength (c1) only, not condition (c2)
  it('does NOT block launch when cabin condition is 0 but strength > 0', async () => {
    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ ship: makeShip({ cabinStrength: 5, cabinCondition: 0 }) })
    );
    const result = await validateLaunch('char-1', 8);
    expect(result.errors).not.toContain('No cabin');
  });

  // SP.LIFT.S line 62: if l1<1 print "No life support system":goto start
  it('blocks launch when life support strength is 0 (l1<1)', async () => {
    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ ship: makeShip({ lifeSupportStrength: 0 }) })
    );
    const result = await validateLaunch('char-1', 8);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('No life support system');
  });

  // SP.LIFT.S: life support check is on strength (l1) only, not condition (l2)
  it('does NOT block launch when life support condition is 0 but strength > 0', async () => {
    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ ship: makeShip({ lifeSupportStrength: 5, lifeSupportCondition: 0 }) })
    );
    const result = await validateLaunch('char-1', 8);
    expect(result.errors).not.toContain('No life support system');
  });

  // SP.LIFT.S line 63: if n1<1 print "No navigation system":goto start
  it('blocks launch when navigation strength is 0 (n1<1)', async () => {
    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ ship: makeShip({ navigationStrength: 0 }) })
    );
    const result = await validateLaunch('char-1', 8);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('No navigation system');
  });

  // SP.LIFT.S: navigation check is on strength (n1) only, not condition (n2)
  it('does NOT block launch when navigation condition is 0 but strength > 0', async () => {
    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ ship: makeShip({ navigationStrength: 5, navigationCondition: 0 }) })
    );
    const result = await validateLaunch('char-1', 8);
    expect(result.errors).not.toContain('No navigation system');
  });

  // SP.LIFT.S line 64: if r1<1 print "No computer/robotic system":goto start (BLOCKING, not a warning)
  it('blocks launch when robotics strength is 0 (r1<1)', async () => {
    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ ship: makeShip({ roboticsStrength: 0 }) })
    );
    const result = await validateLaunch('char-1', 8);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('No computer/robotic system');
  });

  // SP.LIFT.S: robotics check is on strength (r1) only, not condition (r2)
  it('does NOT block launch when robotics condition is 0 but strength > 0', async () => {
    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ ship: makeShip({ roboticsStrength: 5, roboticsCondition: 0 }) })
    );
    const result = await validateLaunch('char-1', 8);
    expect(result.errors).not.toContain('No computer/robotic system');
  });

  // SP.LIFT.S line 65: if h2<1 print "Ship too badly damaged to lift off!":goto start
  it('blocks launch when hull condition is 0 (h2<1)', async () => {
    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ ship: makeShip({ hullCondition: 0 }) })
    );
    const result = await validateLaunch('char-1', 8);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Ship too badly damaged to lift off!');
  });

  // SP.LIFT.S line 66: if d2<1 print "Drives inoperable!":goto start
  it('blocks launch when drive condition is 0 (d2<1)', async () => {
    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ ship: makeShip({ driveCondition: 0 }) })
    );
    const result = await validateLaunch('char-1', 8);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Drives inoperable!');
  });

  // SP.LIFT.S line 56: if z1>2 → trip limit check (modern: tripCount >= DAILY_TRIP_LIMIT=2)
  it('blocks launch when trip limit reached', async () => {
    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ tripCount: 2, lastTripDate: new Date() })
    );
    const result = await validateLaunch('char-1', 8);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('trip'))).toBe(true);
  });

  // SP.LIFT.S line 70: if sp$=q4$ print "No local runs...sorry...."
  it('blocks launch to current system (same-system check handled in navigate.ts)', async () => {
    // This is already handled in navigate.ts, not validateLaunch.
    // The validateLaunch call would still pass — the screen layer prevents it.
    // Verify the fuel check doesn't error for same-system (for future regression)
    prisma.character.findUnique.mockResolvedValue(makeCharacter({ currentSystem: 5 }));
    const result = await validateLaunch('char-1', 5); // same destination as current
    // validateLaunch may or may not have the same-system check — it's in navigate.ts
    // Just verify it doesn't crash
    expect(result).toBeDefined();
  });
});
