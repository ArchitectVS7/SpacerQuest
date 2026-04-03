/**
 * SpacerQuest v4.0 - Black Hole Hub Screen Tests (SP.BLACK.S:29-89)
 *
 * Tests for BlackHoleHubScreen: Astraxial hull offer, destination selection,
 * launch confirmation, and state transitions.
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
    starSystem: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    travelState: {
      upsert: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

const makeShip = (overrides: Record<string, unknown> = {}) => ({
  id: 'ship-1',
  fuel: 1000,
  maxCargoPods: 100,
  hullStrength: 15,
  hullCondition: 9,
  hullName: 'Reliable Hull',
  driveStrength: 30,
  driveCondition: 9,
  driveName: 'Pulse Engines',
  cabinStrength: 10,
  cabinCondition: 9,
  cabinName: 'Mk II Cabin',
  lifeSupportStrength: 12,
  lifeSupportCondition: 9,
  lifeSupportName: 'LSS Chrysalis',
  weaponStrength: 20,
  weaponCondition: 9,
  weaponName: 'Laser',
  navigationStrength: 25,
  navigationCondition: 9,
  navigationName: 'Nav Mk II',
  roboticsStrength: 15,
  roboticsCondition: 9,
  roboticsName: 'Robotics Mk II',
  shieldStrength: 30,
  shieldCondition: 9,
  shieldName: 'Aegis Shield',
  isAstraxialHull: false,
  ...overrides,
});

const makeCharacter = (overrides: Record<string, unknown> = {}) => ({
  id: 'char-1',
  name: 'Pilot',
  shipName: 'Starfire',
  creditsHigh: 15,
  creditsLow: 0,
  missionType: 0,
  cargoManifest: null,
  cargoPods: 0,
  currentSystem: 28, // Black hole
  score: 10500,
  isConqueror: true,
  destination: 0,
  ship: makeShip(),
  ...overrides,
});

describe('BlackHoleHubScreen (SP.BLACK.S:29-89)', () => {
  let prisma: any;
  let BlackHoleHubScreen: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const prismaMod = await import('../src/db/prisma');
    prisma = prismaMod.prisma;
    vi.resetModules();
    const mod = await import('../src/game/screens/black-hole-hub');
    BlackHoleHubScreen = mod.BlackHoleHubScreen;

    // Default mock for starSystem lookup
    prisma.starSystem.findUnique.mockResolvedValue({ name: 'Black Hole' });
    prisma.starSystem.update.mockResolvedValue(undefined);
    prisma.travelState.upsert.mockResolvedValue(undefined);
    prisma.$transaction.mockImplementation(async (ops: any[]) => {
      for (const op of ops) await op;
    });
  });

  // ── Render ────────────────────────────────────────────────────────────────

  it('redirects to main-menu when not at system 28 (SP.BLACK.S on nocar)', async () => {
    prisma.character.findUnique.mockResolvedValue(makeCharacter({ currentSystem: 5 }));
    const result = await BlackHoleHubScreen.render('char-1');
    expect(result.nextScreen).toBe('main-menu');
  });

  it('renders Astraxial hull offer when player lacks Astraxial hull (SP.BLACK.S:33-35)', async () => {
    prisma.character.findUnique.mockResolvedValue(makeCharacter());
    const result = await BlackHoleHubScreen.render('char-1');
    expect(result.output).toContain('Interested?');
    expect(result.output).toContain('[Y]/(N)');
  });

  it('shows black hole ASCII art in the offer (SP.BLACK.S:33 copy"sp.hole")', async () => {
    prisma.character.findUnique.mockResolvedValue(makeCharacter());
    const result = await BlackHoleHubScreen.render('char-1');
    // Art uses spaced letters: "B L A C K" and "H O L E"
    expect(result.output).toContain('B L A C K');
    expect(result.output).toContain('H O L E');
  });

  it('skips offer and shows androm menu when already Astraxial (SP.BLACK.S:32)', async () => {
    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ ship: makeShip({ isAstraxialHull: true, hullName: 'Astraxial-*!' }) })
    );
    const result = await BlackHoleHubScreen.render('char-1');
    expect(result.output).toContain('NGC-44');
    expect(result.output).toContain('NGC-99');
    expect(result.output).not.toContain('Interested?');
  });

  it('skips offer when hull name starts with Astrax (SP.BLACK.S:32 left$(h1$,6)="Astrax")', async () => {
    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ ship: makeShip({ hullName: 'Astraxial-*!', isAstraxialHull: false }) })
    );
    const result = await BlackHoleHubScreen.render('char-1');
    expect(result.output).toContain('NGC-44');
  });

  // ── Offer: N → linkback ───────────────────────────────────────────────────

  it('N at offer returns to main-menu (SP.BLACK.S:36 goto linkback)', async () => {
    prisma.character.findUnique.mockResolvedValue(makeCharacter());
    await BlackHoleHubScreen.render('char-1');

    prisma.character.findUnique.mockResolvedValue(makeCharacter());
    const result = await BlackHoleHubScreen.handleInput('char-1', 'N');
    expect(result.output).toContain('No');
    expect(result.nextScreen).toBe('main-menu');
  });

  // ── Offer: Y → eligibility checks ────────────────────────────────────────

  it('Y with driveStrength<25 shows drive error and goes to menu (SP.BLACK.S:38)', async () => {
    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ ship: makeShip({ driveStrength: 20 }) })
    );
    await BlackHoleHubScreen.render('char-1');

    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ ship: makeShip({ driveStrength: 20 }) })
    );
    const result = await BlackHoleHubScreen.handleInput('char-1', 'Y');
    expect(result.output).toContain('>24 str');
    expect(result.output).toContain('NGC-44');
  });

  it('Y with no isConqueror shows restriction and goes to menu (SP.BLACK.S:40-42)', async () => {
    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ isConqueror: false })
    );
    await BlackHoleHubScreen.render('char-1');

    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ isConqueror: false })
    );
    const result = await BlackHoleHubScreen.handleInput('char-1', 'Y');
    expect(result.output).toContain('Rim Stars Space Authority');
    expect(result.output).toContain('NGC-44');
  });

  it('Y with no LSS Chrysalis shows restriction and goes to menu (SP.BLACK.S:40-42)', async () => {
    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ ship: makeShip({ lifeSupportName: 'LSS Model 7A' }) })
    );
    await BlackHoleHubScreen.render('char-1');

    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ ship: makeShip({ lifeSupportName: 'LSS Model 7A' }) })
    );
    const result = await BlackHoleHubScreen.handleInput('char-1', 'Y');
    expect(result.output).toContain('Rim Stars Space Authority');
  });

  it('Y with insufficient credits shows error and goes to menu (SP.BLACK.S:48 g1<10)', async () => {
    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ creditsHigh: 5, creditsLow: 0 })  // 50,000 < 100,000
    );
    await BlackHoleHubScreen.render('char-1');

    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ creditsHigh: 5, creditsLow: 0 })
    );
    const result = await BlackHoleHubScreen.handleInput('char-1', 'Y');
    expect(result.output).toContain('Not enough credits');
    expect(result.output).toContain('NGC-44');
  });

  it('eligible Y shows purchase confirmation screen (SP.BLACK.S stt section)', async () => {
    prisma.character.findUnique.mockResolvedValue(makeCharacter());
    await BlackHoleHubScreen.render('char-1');

    prisma.character.findUnique.mockResolvedValue(makeCharacter());
    const result = await BlackHoleHubScreen.handleInput('char-1', 'Y');
    expect(result.output).toContain('100,000 cr');
    expect(result.output).toContain('Purchase it?');
  });

  // ── Purchase confirm: N ───────────────────────────────────────────────────

  it('N at purchase_confirm returns to menu (SP.BLACK.S:50 goto gogo)', async () => {
    prisma.character.findUnique.mockResolvedValue(makeCharacter());
    await BlackHoleHubScreen.render('char-1');
    prisma.character.findUnique.mockResolvedValue(makeCharacter());
    await BlackHoleHubScreen.handleInput('char-1', 'Y'); // offer → purchase_confirm

    prisma.character.findUnique.mockResolvedValue(makeCharacter());
    const result = await BlackHoleHubScreen.handleInput('char-1', 'N');
    expect(result.output).toContain('No');
    expect(result.output).toContain('NGC-44');
  });

  // ── Purchase confirm: Y → purchase ───────────────────────────────────────

  it('Y at purchase_confirm calls $transaction with hull and credit updates (SP.BLACK.S:51-56)', async () => {
    prisma.character.findUnique.mockResolvedValue(makeCharacter());
    await BlackHoleHubScreen.render('char-1');
    prisma.character.findUnique.mockResolvedValue(makeCharacter());
    await BlackHoleHubScreen.handleInput('char-1', 'Y'); // offer → purchase_confirm

    prisma.character.findUnique.mockResolvedValue(makeCharacter());
    prisma.character.update.mockResolvedValue(undefined);
    prisma.ship.update.mockResolvedValue(undefined);
    // Re-fetch after purchase
    prisma.character.findUnique
      .mockResolvedValueOnce(makeCharacter()) // for handleInput
      .mockResolvedValueOnce(makeCharacter({ // re-fetch after purchase
        creditsHigh: 5, creditsLow: 0,
        ship: makeShip({ hullName: 'Astraxial-*!', hullStrength: 29, fuel: 2900, maxCargoPods: 190, isAstraxialHull: true }),
      }));

    const result = await BlackHoleHubScreen.handleInput('char-1', 'Y');
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(result.output).toContain('190 pods');
    expect(result.output).toContain('NGC-44');
  });

  it('purchase sets hullName=Astraxial-*!, hullStrength=29, fuel=2900, maxCargoPods=190 (SP.BLACK.S:53-54)', async () => {
    prisma.character.findUnique.mockResolvedValue(makeCharacter());
    await BlackHoleHubScreen.render('char-1');
    prisma.character.findUnique.mockResolvedValue(makeCharacter());
    await BlackHoleHubScreen.handleInput('char-1', 'Y');

    prisma.character.findUnique.mockResolvedValue(makeCharacter());
    prisma.character.update.mockResolvedValue(undefined);
    prisma.ship.update.mockResolvedValue(undefined);
    prisma.character.findUnique
      .mockResolvedValueOnce(makeCharacter())
      .mockResolvedValueOnce(null); // simplified re-fetch

    await BlackHoleHubScreen.handleInput('char-1', 'Y');

    // Check the ship.update call had correct values
    expect(prisma.$transaction).toHaveBeenCalled();
    const txnCalls = prisma.$transaction.mock.calls[0][0];
    // Transaction array contains character.update + ship.update
    // We check ship.update was called with correct data by inspecting mock directly
    // Since $transaction is mocked to call each op, check ship.update
    const shipUpdateCalls = prisma.ship.update.mock.calls;
    const relevantCall = shipUpdateCalls.find(
      (call: any) => call[0]?.data?.hullName === 'Astraxial-*!'
    );
    expect(relevantCall).toBeTruthy();
    expect(relevantCall[0].data.hullStrength).toBe(29);
    expect(relevantCall[0].data.fuel).toBe(2900);
    expect(relevantCall[0].data.maxCargoPods).toBe(190);
    expect(relevantCall[0].data.isAstraxialHull).toBe(true);
  });

  // ── Menu phase ────────────────────────────────────────────────────────────

  it('shows 6 NGC systems in androm menu (SP.BLACK.S:154-159)', async () => {
    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ ship: makeShip({ isAstraxialHull: true }) })
    );
    const result = await BlackHoleHubScreen.render('char-1');
    for (let i = 1; i <= 6; i++) {
      const ngcNames = ['NGC-44', 'NGC-55', 'NGC-66', 'NGC-77', 'NGC-88', 'NGC-99'];
      expect(result.output).toContain(ngcNames[i - 1]);
    }
  });

  it('Q at menu returns to main-menu (SP.BLACK.S:67 goto linkback)', async () => {
    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ ship: makeShip({ isAstraxialHull: true }) })
    );
    await BlackHoleHubScreen.render('char-1');

    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ ship: makeShip({ isAstraxialHull: true }) })
    );
    const result = await BlackHoleHubScreen.handleInput('char-1', 'Q');
    expect(result.nextScreen).toBe('main-menu');
  });

  it('? at menu re-displays androm menu (SP.BLACK.S:68 goto gogo)', async () => {
    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ ship: makeShip({ isAstraxialHull: true }) })
    );
    await BlackHoleHubScreen.render('char-1');

    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ ship: makeShip({ isAstraxialHull: true }) })
    );
    const result = await BlackHoleHubScreen.handleInput('char-1', '?');
    expect(result.output).toContain('NGC-44');
    expect(result.output).toContain('NGC-99');
  });

  it('X at menu shows ship stats (SP.BLACK.S:69 gosub shipstat)', async () => {
    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ ship: makeShip({ isAstraxialHull: true }) })
    );
    await BlackHoleHubScreen.render('char-1');

    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ ship: makeShip({ isAstraxialHull: true }) })
    );
    const result = await BlackHoleHubScreen.handleInput('char-1', 'X');
    expect(result.output).toContain("Ship's Name");
    expect(result.output).toContain('Hull');
  });

  it('invalid key at menu shows Outta Range! (SP.BLACK.S:71)', async () => {
    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ ship: makeShip({ isAstraxialHull: true }) })
    );
    await BlackHoleHubScreen.render('char-1');

    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ ship: makeShip({ isAstraxialHull: true }) })
    );
    const result = await BlackHoleHubScreen.handleInput('char-1', '7');
    expect(result.output).toContain('Outta Range!');
  });

  // ── Launch confirm phase ──────────────────────────────────────────────────

  it('selecting 1-6 shows destination locked + [L]aunch prompt (SP.BLACK.S:74-79)', async () => {
    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ ship: makeShip({ isAstraxialHull: true }) })
    );
    await BlackHoleHubScreen.render('char-1');

    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ ship: makeShip({ isAstraxialHull: true }) })
    );
    const result = await BlackHoleHubScreen.handleInput('char-1', '3');
    expect(result.output).toContain('NGC-66');
    expect(result.output).toContain('[L]aunch');
    expect(result.output).toContain('(A)bort');
  });

  it('A at launch_confirm returns to menu (SP.BLACK.S:79 goto gogo)', async () => {
    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ ship: makeShip({ isAstraxialHull: true }) })
    );
    await BlackHoleHubScreen.render('char-1');
    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ ship: makeShip({ isAstraxialHull: true }) })
    );
    await BlackHoleHubScreen.handleInput('char-1', '2'); // select NGC-55

    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ ship: makeShip({ isAstraxialHull: true }) })
    );
    const result = await BlackHoleHubScreen.handleInput('char-1', 'A');
    expect(result.output).toContain('Aborting');
    expect(result.output).toContain('NGC-44');
  });

  it('L at launch_confirm sets missionType=10 and initiates travel (SP.BLACK.S:85 kk=10)', async () => {
    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ ship: makeShip({ isAstraxialHull: true }) })
    );
    await BlackHoleHubScreen.render('char-1');
    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ ship: makeShip({ isAstraxialHull: true }) })
    );
    await BlackHoleHubScreen.handleInput('char-1', '1'); // select NGC-44 (system 21)

    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ ship: makeShip({ isAstraxialHull: true }) })
    );
    prisma.character.update.mockResolvedValue(undefined);
    prisma.ship.update.mockResolvedValue(undefined);

    const result = await BlackHoleHubScreen.handleInput('char-1', 'L');

    // missionType=10 and destination=21 should be set
    const charUpdate = prisma.character.update.mock.calls.find(
      (call: any) => call[0]?.data?.missionType === 10
    );
    expect(charUpdate).toBeTruthy();
    expect(charUpdate[0].data.destination).toBe(21); // NGC-44 = system 21
    expect(result.nextScreen).toBe('main-menu');
  });

  it('L at launch_confirm shows launch cinematic (SP.BLACK.S:80-84)', async () => {
    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ ship: makeShip({ isAstraxialHull: true }) })
    );
    await BlackHoleHubScreen.render('char-1');
    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ ship: makeShip({ isAstraxialHull: true }) })
    );
    await BlackHoleHubScreen.handleInput('char-1', '1');

    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ ship: makeShip({ isAstraxialHull: true }) })
    );
    prisma.character.update.mockResolvedValue(undefined);
    prisma.ship.update.mockResolvedValue(undefined);

    const result = await BlackHoleHubScreen.handleInput('char-1', 'L');
    expect(result.output).toContain('successfully launched');
    expect(result.output).toContain('NGC-44');
  });

  it('L with insufficient fuel shows error (fuel check before launch)', async () => {
    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ ship: makeShip({ isAstraxialHull: true, fuel: 0, driveStrength: 1, driveCondition: 1 }) })
    );
    await BlackHoleHubScreen.render('char-1');
    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ ship: makeShip({ isAstraxialHull: true, fuel: 0, driveStrength: 1, driveCondition: 1 }) })
    );
    await BlackHoleHubScreen.handleInput('char-1', '1');

    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ ship: makeShip({ isAstraxialHull: true, fuel: 0, driveStrength: 1, driveCondition: 1 }) })
    );
    const result = await BlackHoleHubScreen.handleInput('char-1', 'L');
    expect(result.output).toContain('Insufficient fuel');
    expect(result.output).toContain('NGC-44');
  });

  // ── NGC → system ID mapping ───────────────────────────────────────────────

  it('selection 1 maps to system 21 (NGC-44), selection 6 to system 26 (NGC-99)', async () => {
    const ngcMap: Record<number, number> = { 1: 21, 2: 22, 3: 23, 4: 24, 5: 25, 6: 26 };
    for (const [sel, sysId] of Object.entries(ngcMap)) {
      vi.clearAllMocks();
      const mod = await import('../src/game/screens/black-hole-hub');
      const screen = mod.BlackHoleHubScreen;
      const prismaMod = await import('../src/db/prisma');
      const p = prismaMod.prisma as any;

      p.character.findUnique.mockResolvedValue(
        makeCharacter({ ship: makeShip({ isAstraxialHull: true }) })
      );
      p.starSystem.findUnique.mockResolvedValue({ name: 'Black Hole' });
      p.starSystem.update.mockResolvedValue(undefined);
      p.travelState.upsert.mockResolvedValue(undefined);
      p.$transaction.mockImplementation(async (ops: any[]) => { for (const op of ops) await op; });

      await screen.render('char-1');
      p.character.findUnique.mockResolvedValue(
        makeCharacter({ ship: makeShip({ isAstraxialHull: true }) })
      );
      await screen.handleInput('char-1', String(sel)); // select dest

      p.character.findUnique.mockResolvedValue(
        makeCharacter({ ship: makeShip({ isAstraxialHull: true }) })
      );
      p.character.update.mockResolvedValue(undefined);
      p.ship.update.mockResolvedValue(undefined);
      await screen.handleInput('char-1', 'L');

      const charUpdate = p.character.update.mock.calls.find(
        (call: any) => call[0]?.data?.missionType === 10
      );
      expect(charUpdate?.[0].data.destination).toBe(sysId);
    }
  });
});
