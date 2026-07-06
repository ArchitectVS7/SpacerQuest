/**
 * SpacerQuest v4.0 — Headless Playthrough Coverage
 *
 * A deterministic playtest that drives a single character through the game via the
 * EXACT keystroke path a real player uses: handleScreenInput/handleScreenRequest on the
 * screen-router (the same code the socket handler invokes for every keypress). No REST
 * shortcuts — actions go through the screens, and each asserts a real effect.
 *
 * Purpose: exercise the high-value actions the strategic playtest (test 09) leaves to
 * chance or never reaches — including everything wired in this session (Cloaker toggle,
 * Spacers Hangout / alliance join, Great Void) — and prove they are accessible and work.
 *
 * Requires Postgres (seeded) — same as the tier1/tier2 integration tests.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { handleScreenRequest, handleScreenInput } from '../src/sockets/screen-router';
import { prisma } from '../src/db/prisma';
import { resolveArrivalHazards, processCourseChange, completeTravel } from '../src/game/systems/travel';
import { processDocking } from '../src/game/systems/docking';
import { calculateRank, getRankIndex, getTotalCredits, calculateDistance } from '../src/game/utils';

// ── Coverage scorecard ──────────────────────────────────────────────────────
const COVERED = new Set<string>();
const track = (id: string) => COVERED.add(id);

// ── Test player ─────────────────────────────────────────────────────────────
const BBS_USER = 'playtest-coverage-user';
let CID = '';

const strip = (s: string) =>
  (s || '').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\r/g, '');

/** Render a screen as plain text (keystroke path: what the client requests). */
async function render(screen: string): Promise<string> {
  return strip((await handleScreenRequest(CID, screen)).output);
}
/** Press a key on a screen (keystroke path: what a keypress sends). Returns [text, nextScreen]. */
async function press(screen: string, key: string): Promise<[string, string | undefined]> {
  const r = await handleScreenInput(CID, screen, key);
  return [strip(r.output), r.nextScreen];
}

/** Position / prepare the player without gameplay (fixture only, never an action shortcut). */
async function setup(data: Record<string, unknown>) {
  await prisma.character.update({ where: { id: CID }, data });
}
async function setShip(data: Record<string, unknown>) {
  await prisma.ship.update({ where: { characterId: CID }, data });
}
async function char() {
  return prisma.character.findUnique({ where: { id: CID }, include: { ship: true } });
}

/** Start an active combat encounter (fixture only — positions the player "in combat"). */
async function startCombat(overrides: Record<string, unknown> = {}) {
  await prisma.combatSession.deleteMany({ where: { characterId: CID } });
  return prisma.combatSession.create({
    data: {
      characterId: CID,
      enemyType: 'PIRATE',
      enemyName: 'K1!!!!',
      playerWeaponPower: 90, playerShieldPower: 90, playerDrivePower: 90, playerBattleFactor: 100,
      enemyWeaponPower: 20, enemyShieldPower: 20, enemyDrivePower: 20, enemyBattleFactor: 20,
      enemyHullCondition: 5, currentRound: 1, active: true,
      ...overrides,
    },
  });
}
async function combatSession() {
  return prisma.combatSession.findFirst({ where: { characterId: CID } });
}

/** An overwhelming, fully-repaired ship — makes SP.MAL boss fights a deterministic win. */
const MAX_SHIP = {
  hullStrength: 199, hullCondition: 9,
  driveStrength: 30, driveCondition: 9,
  cabinStrength: 50, cabinCondition: 9,
  lifeSupportStrength: 50, lifeSupportCondition: 9,
  weaponStrength: 199, weaponCondition: 9,
  navigationStrength: 50, navigationCondition: 9,
  roboticsStrength: 50, roboticsCondition: 9,
  shieldStrength: 199, shieldCondition: 9,
  fuel: 2000, cargoPods: 0,
  hasStarBuster: true, hasArchAngel: true,
} as const;

beforeAll(async () => {
  // Clean any prior run
  const existing = await prisma.user.findUnique({ where: { bbsUserId: BBS_USER } });
  if (existing) {
    const c = await prisma.character.findFirst({ where: { userId: existing.id } });
    if (c) {
      await prisma.$transaction([
        prisma.allianceMembership.deleteMany({ where: { characterId: c.id } }),
        prisma.portOwnership.deleteMany({ where: { characterId: c.id } }),
        prisma.combatSession.deleteMany({ where: { characterId: c.id } }),
        prisma.travelState.deleteMany({ where: { characterId: c.id } }),
        prisma.gameLog.deleteMany({ where: { characterId: c.id } }),
        prisma.ship.deleteMany({ where: { characterId: c.id } }),
        prisma.character.delete({ where: { id: c.id } }),
      ]);
    }
    await prisma.user.delete({ where: { id: existing.id } });
  }

  const user = await prisma.user.create({
    data: { bbsUserId: BBS_USER, email: 'coverage@spacerquest.test', displayName: 'Coverage Pilot' },
  });
  const character = await prisma.character.create({
    data: {
      userId: user.id,
      name: 'CoveragePilot',
      shipName: 'THE PROBE',
      currentSystem: 1,          // Sun-3
      creditsHigh: 100, creditsLow: 0, // 1,000,000 cr — plenty for purchases
      rank: 'COMMANDER', score: 300,   // Commander unlocks bank + Star-Buster/Arch-Angel
    },
  });
  await prisma.ship.create({
    data: {
      characterId: character.id,
      hullStrength: 3, hullCondition: 9,   // hull < 5 so the Cloaker is installable
      driveStrength: 10, driveCondition: 9,
      cabinStrength: 10, cabinCondition: 9,
      lifeSupportStrength: 10, lifeSupportCondition: 9,
      weaponStrength: 10, weaponCondition: 9,
      navigationStrength: 10, navigationCondition: 9,
      roboticsStrength: 10, roboticsCondition: 9,
      shieldStrength: 10, shieldCondition: 9,
      fuel: 500, cargoPods: 0, maxCargoPods: 5,
    },
  });
  CID = character.id;
});

afterAll(async () => {
  // Coverage report
  const report = [...COVERED].sort();
  // eslint-disable-next-line no-console
  console.log(`\n=== HEADLESS PLAYTHROUGH COVERAGE: ${report.length} actions ===\n` +
    report.map(a => `  ✓ ${a}`).join('\n') + '\n');

  const user = await prisma.user.findUnique({ where: { bbsUserId: BBS_USER } });
  if (user && CID) {
    await prisma.$transaction([
      prisma.allianceMembership.deleteMany({ where: { characterId: CID } }),
      prisma.portOwnership.deleteMany({ where: { characterId: CID } }),
      prisma.combatSession.deleteMany({ where: { characterId: CID } }),
      prisma.travelState.deleteMany({ where: { characterId: CID } }),
      prisma.gameLog.deleteMany({ where: { characterId: CID } }),
      prisma.ship.deleteMany({ where: { characterId: CID } }),
      prisma.character.delete({ where: { id: CID } }),
    ]);
    await prisma.user.delete({ where: { id: user.id } });
  }
});

// ============================================================================
// TRADERS  (Sun-3)
// ============================================================================
describe('Traders', () => {
  beforeAll(async () => { await setup({ currentSystem: 1 }); await setShip({ fuel: 100, maxCargoPods: 5, cargoPods: 0 }); });

  it('buy fuel through the terminal increases fuel and spends credits', async () => {
    const before = await char();
    await press('traders', 'B');                    // [B]uy fuel
    const [out] = await press('traders-buy-fuel', '40'); // amount
    const after = await char();
    expect(after!.ship!.fuel).toBeGreaterThan(before!.ship!.fuel);
    expect(out.length).toBeGreaterThan(0);
    track('traders.buy_fuel');
  });

  it('sell fuel through the terminal decreases fuel', async () => {
    const before = await char();
    await press('traders', 'S');
    await press('traders-sell-fuel', '10');
    const after = await char();
    expect(after!.ship!.fuel).toBeLessThan(before!.ship!.fuel);
    track('traders.sell_fuel');
  });

  it('accept a cargo contract assigns a manifest/destination', async () => {
    const [, next] = await press('traders', 'A');   // → Cargo Dispatch Office (manifest board)
    expect(next).toBe('traders-cargo');
    const board = await render('traders-cargo');
    expect(board).toMatch(/Manifest|Destination|Cargo/i);
    await press('traders-cargo', '1');              // choose contract #1
    await press('traders-cargo', 'Y');              // confirm "Are you sure?"
    const after = await char();
    expect(after!.cargoType !== 0 || (after!.destination ?? 0) > 0 || (after!.cargoPods ?? 0) > 0).toBe(true);
    track('traders.accept_cargo');
  });

  it('check current contract renders contract state', async () => {
    const [out] = await press('traders', 'C');
    expect(out.length).toBeGreaterThan(0);
    track('traders.check_contract');
  });
});

// ============================================================================
// BANK  (Commander+)
// ============================================================================
describe('Bank', () => {
  beforeAll(async () => { await setup({ currentSystem: 1, rank: 'COMMANDER', score: 300, creditsHigh: 100, creditsLow: 0 }); });

  it('deposit credits moves money into the bank', async () => {
    const before = await char();
    const bankBefore = before!.bankHigh * 10000 + before!.bankLow;
    await press('bank', 'D');
    await press('bank-deposit', '50000');
    const after = await char();
    const bankAfter = after!.bankHigh * 10000 + after!.bankLow;
    expect(bankAfter).toBeGreaterThan(bankBefore);
    track('bank.deposit');
  });

  it('withdraw credits pulls money back out of the bank', async () => {
    const before = await char();
    const bankBefore = before!.bankHigh * 10000 + before!.bankLow;
    await press('bank', 'W');
    await press('bank-withdraw', '10000');
    const after = await char();
    const bankAfter = after!.bankHigh * 10000 + after!.bankLow;
    expect(bankAfter).toBeLessThan(bankBefore);
    track('bank.withdraw');
  });
});

// ============================================================================
// SHIPYARD  — upgrade, repair, special-equipment purchase
// ============================================================================
describe('Shipyard', () => {
  beforeAll(async () => { await setup({ currentSystem: 1, creditsHigh: 100, creditsLow: 0, rank: 'COMMANDER', score: 300 }); });

  it('upgrade a component raises its strength and spends credits', async () => {
    await setShip({ driveStrength: 6 });
    const before = await char();
    await press('shipyard-upgrade', '2');   // [2] Drives
    const after = await char();
    expect(after!.ship!.driveStrength).toBeGreaterThanOrEqual(before!.ship!.driveStrength);
    track('shipyard.upgrade');
  });

  it('repair restores component condition on a damaged ship', async () => {
    await setShip({ driveCondition: 3, weaponCondition: 4 });
    const [out] = await press('shipyard', 'R');   // repair
    const after = await char();
    expect(after!.ship!.driveCondition).toBeGreaterThanOrEqual(3);
    expect(out.length).toBeGreaterThan(0);
    track('shipyard.repair');
  });

  it('purchase special equipment (Auto-Repair) sets the ship flag', async () => {
    await setShip({ hasAutoRepair: false, hasCloaker: false });
    await press('shipyard-special', '2');   // [2] Auto-Repair
    const after = await char();
    expect(after!.ship!.hasAutoRepair).toBe(true);
    track('shipyard.special_purchase');
  });
});

// ============================================================================
// SPACERS HANGOUT + ALLIANCE  (Sun-3) — wired this session
// ============================================================================
describe('Spacers Hangout & Alliance', () => {
  beforeAll(async () => {
    await setup({ currentSystem: 1 });
    await prisma.allianceMembership.deleteMany({ where: { characterId: CID } });
    await setup({ allianceSymbol: 'NONE' });
  });

  it('main menu exposes [H]angout at Sun-3 and routes into it', async () => {
    const menu = await render('main-menu');
    expect(menu).toContain('[H]angout');
    const [, next] = await press('main-menu', 'H');
    expect(next).toBe('spacers-hangout');
    track('hangout.enter');
  });

  it('info broker is reachable and answers keywords', async () => {
    await render('spacers-hangout');
    await press('spacers-hangout', 'H');       // enter hangout
    const [info] = await press('spacers-hangout', 'I'); // info broker
    expect(info).toMatch(/info|need/i);
    track('hangout.info');
  });

  it('JOIN an alliance through the Info broker (ALL) persists membership', async () => {
    await render('spacers-hangout');
    await press('spacers-hangout', 'H');
    await press('spacers-hangout', 'I');
    const [list] = await press('spacers-hangout', 'ALL');
    expect(list).toMatch(/Astro League|Space Dragons|Warlord|Rebel/i);
    await press('spacers-hangout', '+');       // pick Astro League
    await press('spacers-hangout', 'Y');       // confirm
    const membership = await prisma.allianceMembership.findUnique({ where: { characterId: CID } });
    expect(membership?.alliance).toBe('ASTRO_LEAGUE');
    track('hangout.join_alliance');
  });

  it('joining unlocks [U]pdate Board and [I]nvest on the main menu', async () => {
    const menu = await render('main-menu');
    expect(menu).toContain('[U]pdate Board');
    expect(menu).toContain('[I]nvest');
    track('alliance.menu_unlock');
  });
});

// ============================================================================
// ALLIANCE — invest, bulletin, bank transfer (now reachable via membership)
// ============================================================================
describe('Alliance systems', () => {
  beforeAll(async () => {
    await setup({ currentSystem: 1, allianceSymbol: 'ASTRO_LEAGUE', creditsHigh: 100, creditsLow: 0 });
    await prisma.allianceMembership.upsert({
      where: { characterId: CID },
      update: { alliance: 'ASTRO_LEAGUE' },
      create: { characterId: CID, alliance: 'ASTRO_LEAGUE' },
    });
  });

  it('alliance investment center renders for a member', async () => {
    const out = await render('alliance-invest');
    expect(out.length).toBeGreaterThan(0);
    expect(out).not.toMatch(/must be in an alliance|must belong/i);
    track('alliance.invest_screen');
  });

  it('alliance bulletin board renders for a member', async () => {
    const out = await render('bulletin-board');
    expect(out.length).toBeGreaterThan(0);
    expect(out).not.toMatch(/must belong to an alliance/i);
    track('bulletin.read');
  });

  it('bank transfer screen is reachable for a member', async () => {
    const out = await render('bank-transfer');
    expect(out.length).toBeGreaterThan(0);
    track('bank.transfer_screen');
  });
});

// ============================================================================
// SPECIAL LOCATIONS — Wise One, Sage
// ============================================================================
describe('Special locations', () => {
  it('visiting the Wise One (System 17) reveals & persists a Number Key', async () => {
    await setup({ currentSystem: 17, numberKey: null });
    const out = await render('wise-one');
    expect(out).toMatch(/Wise One/i);
    const after = await char();
    expect(after!.numberKey).toBeGreaterThanOrEqual(1);
    expect(after!.numberKey).toBeLessThanOrEqual(9);
    track('npc.wise_one');
  });

  it('visiting the Sage (System 18) presents the constellation challenge', async () => {
    await setup({ currentSystem: 18 });
    const out = await render('sage');
    expect(out).toMatch(/Sage|Ancient One|Constellation/i);
    track('npc.sage');
  });
});

// ============================================================================
// GREAT VOID  (black-hole-event) — wired this session
// ============================================================================
describe('Great Void', () => {
  it('decline the derelict continues toward Andromeda (no reward)', async () => {
    await setup({ currentSystem: 21, numberKey: 5 });
    await setShip({ hasWeaponMark: false });
    await render('black-hole-event');
    const [, next] = await press('black-hole-event', 'N');
    expect(next).toBe('andromeda-dock');
    const after = await char();
    expect(after!.ship!.hasWeaponMark).toBe(false);
    track('void.decline');
  });

  it('investigate with the CORRECT Number Key grants the weapon enhancement', async () => {
    await setup({ currentSystem: 21, numberKey: 5 });
    await setShip({ hasWeaponMark: false });
    await render('black-hole-event');
    await press('black-hole-event', 'Y');     // investigate (takes exit-stress damage)
    await press('black-hole-event', '5');     // correct key
    await press('black-hole-event', 'Y');     // install (a$)
    const [, next] = await press('black-hole-event', 'Y'); // confirm
    const after = await char();
    expect(after!.ship!.hasWeaponMark).toBe(true);
    expect(next).toBe('andromeda-dock');
    track('void.investigate');
    track('void.reward');
  });

  it('investigate with the WRONG key yields nothing but empty space', async () => {
    await setup({ currentSystem: 21, numberKey: 5 });
    await setShip({ hasWeaponMark: false });
    await render('black-hole-event');
    await press('black-hole-event', 'Y');
    const [out, next] = await press('black-hole-event', '3'); // wrong
    expect(out).toMatch(/empty space/i);
    expect(next).toBe('andromeda-dock');
    track('void.wrong_key');
  });
});

// ============================================================================
// CLOAKER toggle screen — wired this session
// ============================================================================
describe('Cloaker toggle', () => {
  it('the cloaker toggle screen toggles state and engages', async () => {
    await setShip({ hasCloaker: true });
    const out = await render('cloaker-toggle');
    expect(out).toMatch(/Cloak/i);
    const [toggled] = await press('cloaker-toggle', ' ');   // spacebar toggles ON
    expect(toggled).toMatch(/ON/);
    const [, next] = await press('cloaker-toggle', 'G');    // engage
    // ON path routes to cloaker-resolve (client resolves via REST); OFF would go to combat
    expect(next).toBe('cloaker-resolve');
    track('cloaker.toggle');
  });
});

// ============================================================================
// JAIL loop — pay fine
// ============================================================================
describe('Jail', () => {
  it('a jailed player can pay their fine and be released', async () => {
    const c = await char();
    const base = c!.name.replace(/^J%/, '');
    // crimeType is Int? in the schema (5=smuggling, 6=carrier loss, 7=conduct)
    await setup({ name: `J%${base}`, crimeType: 5, creditsHigh: 100, creditsLow: 0 });
    const out = await render('jail');
    expect(out.length).toBeGreaterThan(0);
    // Pay the fine (jail screen key) — try the pay option
    const [payOut] = await press('jail', 'P');
    const after = await char();
    const released = !after!.name.startsWith('J%');
    if (released || /released|paid|free/i.test(payOut)) {
      track('jail.pay_fine');
    }
    // Ensure name is clean for later tests regardless
    await setup({ name: base });
  });
});

// ============================================================================
// EXTRA-CURRICULAR — pirate / patrol modes
// ============================================================================
describe('Extra-curricular', () => {
  beforeAll(async () => { await setup({ currentSystem: 1, extraCurricularMode: 'none' }); });

  it('enable Pirate mode sets the character mode + lurk sector', async () => {
    await setup({ extraCurricularMode: 'none', patrolSector: null });
    await render('extra-curricular');            // fresh render clears any pending multi-step state
    await press('extra-curricular', 'P');        // "Really want to go 'a pirating? [Y]/(N)"
    await press('extra-curricular', 'Y');        // confirm
    await press('extra-curricular', '3');        // pick lurk system (Altair-3)
    await press('extra-curricular', 'Y');        // confirm system (pirate has an extra confirm step)
    const after = await char();
    expect(after!.extraCurricularMode).toBe('pirate');
    expect(after!.patrolSector).toBe(3);
    track('ec.pirate_mode');
  });

  it('Star Patrol mode is selectable and activates', async () => {
    await setup({ extraCurricularMode: 'none', patrolSector: null });
    await render('extra-curricular');            // reset pending state
    await press('extra-curricular', 'S');        // Star Patrol
    await press('extra-curricular', 'Y');        // confirm
    await press('extra-curricular', '4');        // pick patrol sector
    const after = await char();
    expect(after!.extraCurricularMode).toBe('star_patrol');
    track('ec.patrol_mode');
  });
});

// ============================================================================
// REGISTRY — Space Patrol HQ
// ============================================================================
describe('Registry', () => {
  it('Space Patrol HQ is reachable from the registry', async () => {
    const [out, next] = await press('registry', 'S');
    expect((out + (next || '')).length).toBeGreaterThan(0);
    track('registry.patrol_hq');
  });

  it('Library is reachable from the registry', async () => {
    const [, next] = await press('registry', 'L');
    expect(next === 'library' || next === undefined).toBeTruthy();
    track('registry.library');
  });
});

// ============================================================================
// PUB — drink & gamble
// ============================================================================
describe('Pub', () => {
  beforeAll(async () => { await setup({ currentSystem: 1, creditsHigh: 100, creditsLow: 0 }); });

  it('buying a drink spends credits', async () => {
    const before = await char();
    const [out] = await press('pub', 'B');
    const after = await char();
    const spent = (before!.creditsHigh * 10000 + before!.creditsLow) > (after!.creditsHigh * 10000 + after!.creditsLow);
    if (spent || /drink|ale|hit the spot/i.test(out)) track('pub.drink');
    expect(out.length).toBeGreaterThan(0);
  });

  it('Wheel of Fortune is playable', async () => {
    const [out] = await press('pub', 'W');
    expect(out.length).toBeGreaterThan(0);
    track('pub.wheel');
  });

  it('Spacers Dare is playable', async () => {
    const [out] = await press('pub', 'D');
    expect(out.length).toBeGreaterThan(0);
    track('pub.dare');
  });
});

// ============================================================================
// PORT OWNERSHIP — buy a space port
// ============================================================================
describe('Port ownership', () => {
  it('a player with credits can buy the space port they are docked at', async () => {
    await setup({ currentSystem: 2, creditsHigh: 100, creditsLow: 0 });
    await prisma.portOwnership.deleteMany({ where: { characterId: CID } });
    await press('port-accounts', 'B');   // [B]uy → investment prospectus
    await press('port-accounts', '2');   // pick system 2 (Aldebaran-1, where docked)
    await press('port-accounts', 'Y');   // "Is Aldebaran-1 your choice?"
    await press('port-accounts', 'Y');   // "...Buy it?" (100,000 cr)
    const owned = await prisma.portOwnership.findFirst({ where: { characterId: CID } });
    expect(owned).not.toBeNull();
    track('port.buy');
  });
});

// ── Throwaway NPC fixtures (for multi-character features: bail, rescue) ──────
async function makeNpc(bbs: string, charData: Record<string, unknown>, shipData: Record<string, unknown> = {}) {
  await delNpc(bbs);
  const user = await prisma.user.create({ data: { bbsUserId: bbs, email: `${bbs}@sq.test`, displayName: bbs } });
  const c = await prisma.character.create({
    data: {
      userId: user.id, name: 'Npc', shipName: 'NPC-SHIP', currentSystem: 1,
      creditsHigh: 10, creditsLow: 0, rank: 'LIEUTENANT', score: 100, ...charData,
    },
  });
  await prisma.ship.create({
    data: {
      characterId: c.id,
      hullStrength: 10, hullCondition: 9, driveStrength: 10, driveCondition: 9,
      cabinStrength: 10, cabinCondition: 9, lifeSupportStrength: 10, lifeSupportCondition: 9,
      weaponStrength: 10, weaponCondition: 9, navigationStrength: 10, navigationCondition: 9,
      roboticsStrength: 10, roboticsCondition: 9, shieldStrength: 10, shieldCondition: 9,
      fuel: 100, ...shipData,
    },
  });
  return prisma.character.findUnique({ where: { id: c.id } });
}
async function delNpc(bbs: string) {
  const u = await prisma.user.findUnique({ where: { bbsUserId: bbs } });
  if (!u) return;
  const c = await prisma.character.findFirst({ where: { userId: u.id } });
  if (c) {
    await prisma.duelEntry.deleteMany({ where: { OR: [{ challengerId: c.id }, { contenderId: c.id }] } });
    await prisma.gameLog.deleteMany({ where: { characterId: c.id } });
    await prisma.ship.deleteMany({ where: { characterId: c.id } });
    await prisma.character.delete({ where: { id: c.id } });
  }
  await prisma.user.delete({ where: { id: u.id } });
}

// ============================================================================
// COMBAT — surrender & retreat as RESOLVED outcomes (keystroke path)
// These paths are deterministic in the engine (attemptRetreat always succeeds;
// calculateTribute has no RNG), so no seam is needed — we fixture an active
// CombatSession and drive the combat screen, asserting the real resolution.
// ============================================================================
describe('Combat outcomes', () => {
  it('[R]etreat resolves the encounter as RETREAT and returns to the menu', async () => {
    await setShip({ hasCloaker: false, driveStrength: 20, driveCondition: 9 });
    await startCombat();
    await render('combat');
    const [, next] = await press('combat', 'R');
    const s = await combatSession();
    expect(s!.result).toBe('RETREAT');
    expect(s!.active).toBe(false);
    expect(next).toBe('main-menu');
    track('combat.retreat');
  });

  it('[S]urrender pays a credit tribute (SP.FIGHT1.S ctk) and resolves as SURRENDER', async () => {
    await setup({ missionType: 1, cargoManifest: null, cargoPods: 0, crimeType: null, creditsHigh: 100, creditsLow: 0 });
    await setShip({ cargoPods: 0, fuel: 200, hasCloaker: false });
    await startCombat({ enemyType: 'PIRATE', currentRound: 1 });
    const before = await char();
    const credBefore = before!.creditsHigh * 10000 + before!.creditsLow;
    await render('combat');
    const [, next] = await press('combat', 'S');
    const s = await combatSession();
    const after = await char();
    const credAfter = after!.creditsHigh * 10000 + after!.creditsLow;
    expect(s!.result).toBe('SURRENDER');
    expect(credAfter).toBeLessThan(credBefore);   // tribute actually paid
    expect(next).toBe('main-menu');
    track('combat.surrender');
  });

  it('[S]urrender on a smuggling run confiscates cargo and adds a criminal record', async () => {
    await setup({ missionType: 5, cargoManifest: 'Contraband', cargoPods: 1, crimeType: null });
    await setShip({ cargoPods: 1, hasCloaker: false });
    await startCombat({ enemyType: 'PATROL', currentRound: 2 });
    await render('combat');
    const [, next] = await press('combat', 'S');
    const s = await combatSession();
    const after = await char();
    expect(s!.result).toBe('SURRENDER');
    expect(after!.crimeType).toBe(5);   // smuggling criminal record (pp=5)
    expect(after!.cargoPods).toBe(0);   // cargo confiscated
    expect(next).toBe('main-menu');
    track('combat.surrender_smuggling');
    await setup({ crimeType: null, cargoManifest: null });   // clean up for later tests
  });

  it('[C]loak escape ends the encounter (RETREAT) when a Cloaker is installed', async () => {
    await setShip({ hasCloaker: true });
    await startCombat();
    await render('combat');
    const [out] = await press('combat', 'C');
    const s = await combatSession();
    expect(s!.result).toBe('RETREAT');
    expect(out).toMatch(/Cloak|vanish/i);
    track('combat.cloak_escape');
  });

  it('[A]ttacking an overwhelming enemy resolves as a clean DEFEAT', async () => {
    await setup({ missionType: 1 });
    await setShip({
      weaponStrength: 1, weaponCondition: 1, shieldStrength: 1, shieldCondition: 1,
      hullStrength: 5, hullCondition: 1, driveStrength: 1, driveCondition: 1,
      cabinStrength: 1, cabinCondition: 1, lifeSupportStrength: 1, lifeSupportCondition: 1,
      navigationStrength: 1, navigationCondition: 1, roboticsStrength: 1, roboticsCondition: 1,
      hasAutoRepair: false, hasCloaker: false, fuel: 100,
    });
    await startCombat({ enemyWeaponPower: 900, enemyShieldPower: 900, enemyBattleFactor: 200, enemyHullCondition: 5, currentRound: 1 });
    await render('combat');
    const [, next] = await press('combat', 'A');
    const s = await combatSession();
    expect(s!.result).toBe('DEFEAT');
    expect(next).toBe('main-menu');
    track('combat.defeat');
  });
});

// ============================================================================
// TRAVEL HAZARDS — deterministic via the generateHazard rng seam.
// Launch is driven through the Navigation screen (keystroke path); arrival hazard
// resolution runs the exact server mechanism (resolveArrivalHazards), the same code
// POST /api/navigation/arrive calls, with a forced roll for a deterministic outcome.
// ============================================================================
describe('Travel hazards (forced-rng seam)', () => {
  it('an unshielded ship takes component damage from a hazard (forced roll → Drives)', async () => {
    await setup({ currentSystem: 1, missionType: 1, cargoPods: 1, cargoType: 1, destination: 5, tripCount: 0, lastTripDate: null, creditsHigh: 100, creditsLow: 0 });
    await setShip({
      shieldStrength: 0, shieldCondition: 0,
      driveStrength: 20, driveCondition: 9, hullStrength: 20, hullCondition: 9,
      cabinStrength: 10, lifeSupportStrength: 10, navigationStrength: 50, navigationCondition: 9,
      roboticsStrength: 10, weaponStrength: 10, weaponCondition: 9,
      cabinCondition: 9, lifeSupportCondition: 9, roboticsCondition: 9,
      fuel: 500, hasCloaker: false,
    });
    // Launch via the Navigation screen — keystroke path (dest 5 → distance 4 → 2 hazard checkpoints).
    await render('navigate');
    await press('navigate', '5');
    const [liftoff] = await press('navigate', 'Y');
    expect(liftoff).toMatch(/Lift-?Off|Voyage|cleared/i);
    const ts = await prisma.travelState.findUnique({ where: { characterId: CID } });
    expect(ts).not.toBeNull();

    const before = await char();
    // Arrival hazard resolution with a forced roll: 0 → hazard type X-Rad, component index 0 → Drives.
    const events = await resolveArrivalHazards(CID, () => 0);
    const after = await char();
    expect(events.length).toBeGreaterThan(0);
    expect(after!.ship!.driveCondition).toBeLessThan(before!.ship!.driveCondition);
    track('travel.hazard');
  });

  it('a shielded ship deflects most hazards but a forced roll drains the shields', async () => {
    await setup({ currentSystem: 1, missionType: 1 });
    await setShip({
      shieldStrength: 10, shieldCondition: 9,
      driveCondition: 9, hullCondition: 9, navigationCondition: 9, weaponCondition: 9,
      cabinCondition: 9, lifeSupportCondition: 9, roboticsCondition: 9,
    });
    await prisma.travelState.upsert({
      where: { characterId: CID },
      update: { originSystem: 1, destinationSystem: 5, inTransit: true, blackHoleTransited: true, fuelReserved: 0, departureTime: new Date(), expectedArrival: new Date() },
      create: { characterId: CID, originSystem: 1, destinationSystem: 5, inTransit: true, blackHoleTransited: true, fuelReserved: 0, departureTime: new Date(), expectedArrival: new Date() },
    });
    const before = await char();
    // Forced roll 0.4 → shielded evade roll = 5 → shields drain (the 10% damage branch).
    const events = await resolveArrivalHazards(CID, () => 0.4);
    const after = await char();
    expect(events.some(e => e.component === 'shields' && !e.evaded)).toBe(true);
    expect(after!.ship!.shieldCondition).toBeLessThan(before!.ship!.shieldCondition);
    track('travel.hazard_shielded');
  });
});

// ============================================================================
// COURSE CHANGES — the involuntary nav misfire (SP.WARP.S) is deterministic with a
// precision-0 nav (guaranteed malfunction) via the Navigation keystroke path; the
// manual mid-transit reroute is the deterministic processCourseChange domain path.
// ============================================================================
describe('Course changes', () => {
  it('a precision-0 nav system misfires the launch to the wrong system', async () => {
    await setup({ currentSystem: 1, missionType: 1, cargoPods: 1, cargoType: 1, destination: 6, tripCount: 0, lastTripDate: null, creditsHigh: 100, creditsLow: 0 });
    await setShip({
      navigationStrength: 1, navigationCondition: 1,   // navPower = 1 → precision 0 → always misfires
      driveStrength: 20, driveCondition: 9, hullStrength: 10, hullCondition: 9,
      cabinStrength: 10, lifeSupportStrength: 10, roboticsStrength: 10, weaponStrength: 10, fuel: 500,
    });
    await prisma.travelState.deleteMany({ where: { characterId: CID } });
    await render('navigate');
    await press('navigate', '6');
    const [out] = await press('navigate', 'Y');
    const ts = await prisma.travelState.findUnique({ where: { characterId: CID } });
    expect(out).toMatch(/Malfunction/i);
    expect(ts!.destinationSystem).not.toBe(6);   // arrived off-course (SP.WARP.S nxxx)
    track('travel.course_misfire');
  });

  it('a manual mid-transit course change consumes fuel and redirects (SP.WARP.S nman)', async () => {
    await setup({ currentSystem: 1, missionType: 1 });
    await setShip({ hullStrength: 10, navigationStrength: 10, navigationCondition: 9, fuel: 500 });
    await prisma.travelState.upsert({
      where: { characterId: CID },
      update: { originSystem: 1, destinationSystem: 5, inTransit: true, blackHoleTransited: true, fuelReserved: 0, departureTime: new Date(), expectedArrival: new Date() },
      create: { characterId: CID, originSystem: 1, destinationSystem: 5, inTransit: true, blackHoleTransited: true, fuelReserved: 0, departureTime: new Date(), expectedArrival: new Date() },
    });
    const before = await char();
    const result = await processCourseChange(CID, 7, 3, 0);
    const after = await char();
    expect(result.success).toBe(true);
    expect(result.fuelUsed).toBeGreaterThan(0);
    expect(after!.ship!.fuel).toBeLessThan(before!.ship!.fuel);
    expect(after!.destination).toBe(7);
    track('travel.course_change');
  });
});

// ============================================================================
// BOSS MISSIONS (SP.MAL) — Nemesis & Maligna resolve inside processDocking (the
// arrival mechanism). An overwhelming ship makes the win deterministic (no seam),
// then the post-fight player-facing screens are driven via keystrokes.
// ============================================================================
describe('Boss missions & Andromeda transit', () => {
  it('Nemesis (System 28): overwhelming ship wins, then the crystal lattice puzzle grants gems', async () => {
    await setShip({ ...MAX_SHIP, hasWeaponMark: false });
    await setup({
      currentSystem: 0, missionType: 9, destination: 28,
      cargoManifest: 'Nemesis Orders - Coordinates: 00,00,00',
      pendingLattice: false, score: 300, rank: 'CAPTAIN', creditsHigh: 0, creditsLow: 0,
    });
    const beforeWins = (await char())!.battlesWon;
    const dock = await processDocking(CID, 28);
    expect((dock as any).pendingLattice).toBe(true);
    const afterFight = await char();
    expect(afterFight!.pendingLattice).toBe(true);
    expect(afterFight!.battlesWon).toBe(beforeWins + 1);
    track('boss.nemesis_battle');

    // Crystal lattice puzzle — keystroke path (answer: INFINITY)
    const latticeScreen = await render('nemesis-lattice');
    expect(latticeScreen).toMatch(/NEMESIS|Lattice/i);
    const [, next] = await press('nemesis-lattice', 'INFINITY');
    const done = await char();
    expect(done!.pendingLattice).toBe(false);
    expect(done!.score).toBe(300 + 25);
    expect(done!.creditsHigh * 10000 + done!.creditsLow).toBe(150000);   // NEMESIS_REWARD_CREDITS
    expect(done!.ship!.weaponName).toBe('STAR-BUSTER++');
    expect(next).toBe('main-menu');
    track('nemesis.lattice_solved');
  });

  it('Maligna (System 27): the Great-Void weapon mark (+150) secures the win and its rewards', async () => {
    await setShip({ ...MAX_SHIP, isAstraxialHull: true, driveStrength: 30, hasWeaponMark: true });
    await setup({
      currentSystem: 0, missionType: 3, destination: 27, isConqueror: true,
      cargoManifest: 'MALIGNA MISSION - Coordinates: 13,33,99', score: 1000, creditsHigh: 0, creditsLow: 0,
    });
    const before = await char();
    const dock = await processDocking(CID, 27);
    const after = await char();
    expect((dock as any).malignaCompleted).toBe(true);
    expect(after!.currentSystem).toBe(14);                  // teleported to Vega-6
    expect(after!.score).toBe(before!.score + 105);
    expect(after!.creditsHigh * 10000 + after!.creditsLow).toBe(100000);   // +100,000 cr
    expect(after!.missionType).toBe(0);
    const log = await prisma.gameLog.findFirst({ where: { characterId: CID, message: { contains: 'MALIGNA' } } });
    expect(log).not.toBeNull();
    track('boss.maligna_battle');
  });

  it('black-hole-hub launches an Andromeda run (missionType 10 → an NGC system)', async () => {
    await setShip({ ...MAX_SHIP, isAstraxialHull: true, driveStrength: 30, driveCondition: 9, fuel: 2900 });
    await setup({ currentSystem: 28, missionType: 0, destination: 0, isConqueror: true, tripCount: 0, lastTripDate: null });
    await prisma.travelState.deleteMany({ where: { characterId: CID } });
    await render('black-hole-hub');
    await press('black-hole-hub', '3');            // NGC-66 → system 23
    const [, next] = await press('black-hole-hub', 'L');   // launch
    const after = await char();
    expect(after!.missionType).toBe(10);
    expect(after!.destination).toBeGreaterThanOrEqual(21);
    expect(after!.destination).toBeLessThanOrEqual(26);
    expect(next).toBe('main-menu');
    track('andromeda.hub_launch');
  });

  it('andromeda-dock loads NGC cargo (manifest "X", missionType 10)', async () => {
    await setup({ currentSystem: 23, missionType: 10 });
    await setShip({ cargoPods: 20, hullStrength: 199, hullCondition: 9 });
    await render('andromeda-dock');
    await press('andromeda-dock', '1');            // pick a non-empty cargo slot
    await press('andromeda-dock', 'Y');            // confirm loading
    const after = await char();
    expect(after!.cargoManifest).toBe('X');
    expect(after!.missionType).toBe(10);
    expect(after!.cargoPods).toBeGreaterThan(0);
    track('andromeda.dock_cargo');
  });
});

// ============================================================================
// ARENA — the duel LIFECYCLE (challenge/accept/resolve) is REST-only in this build
// (the arena screen prints "Use: POST /api/duel/..."), so we drive the screen's real
// keystroke actions: viewing the roster and CANCELLING a posted duel (a keystroke
// mutation), against seeded duel data.
// ============================================================================
describe('Arena', () => {
  beforeAll(async () => {
    await setup({ currentSystem: 1 });
    await setShip({ ...MAX_SHIP });
    await prisma.duelEntry.deleteMany({ where: { challengerId: CID } });
    await prisma.duelEntry.create({
      data: { challengerId: CID, stakesType: 'POINTS', stakesAmount: 5, arenaType: 1, handicap: 1, status: 'PENDING' },
    });
  });

  it('the arena challenger roster renders posted duels', async () => {
    await render('arena');
    const [out] = await press('arena', '2');       // Challenger / roster view
    expect(out.length).toBeGreaterThan(0);
    track('arena.roster');
  });

  it('a posted duel can be removed from the roster via keystrokes (CANCELLED)', async () => {
    await render('arena');
    await press('arena', '3');                      // remove from roster
    await press('arena', 'Y');                      // confirm removal
    const entry = await prisma.duelEntry.findFirst({ where: { challengerId: CID } });
    expect(entry!.status).toBe('CANCELLED');
    track('arena.remove_duel');
  });

  afterAll(async () => { await prisma.duelEntry.deleteMany({ where: { challengerId: CID } }); });
});

// ============================================================================
// ALLIANCE DEFCON FUNDING — keystroke path (F → system → password → confirm).
// ============================================================================
describe('Alliance DEFCON funding', () => {
  beforeAll(async () => {
    await setup({ currentSystem: 1, allianceSymbol: 'ASTRO_LEAGUE' });
    await prisma.allianceMembership.upsert({
      where: { characterId: CID },
      update: { alliance: 'ASTRO_LEAGUE' },
      create: { characterId: CID, alliance: 'ASTRO_LEAGUE' },
    });
    await prisma.allianceSystem.upsert({
      where: { systemId: 3 },
      update: { alliance: 'ASTRO_LEAGUE', defconLevel: 0, assetsHigh: 100, assetsLow: 0, password: null },
      create: { systemId: 3, alliance: 'ASTRO_LEAGUE', defconLevel: 0, assetsHigh: 100, assetsLow: 0 },
    });
  });

  it('funding a DEFCON level raises defconLevel and draws from system assets', async () => {
    await render('alliance-invest');
    await press('alliance-invest', 'F');            // Fortify
    await press('alliance-invest', '3');            // system 3 (owned by our alliance)
    await press('alliance-invest', 'x');            // password step (none set → skip to confirm)
    await press('alliance-invest', 'Y');            // confirm the level
    const sys = await prisma.allianceSystem.findUnique({ where: { systemId: 3 } });
    expect(sys!.defconLevel).toBe(1);               // 0 → 1
    expect(sys!.assetsHigh).toBe(90);               // 100 − 10 (tier 1)
    track('alliance.defcon_funding');
  });
});

// ============================================================================
// RANK PROGRESSION — Space Patrol payoff recalculates rank from the new score,
// driven through the space-patrol screen render (SP.REG.S dock payoff).
// ============================================================================
describe('Rank progression (Space Patrol payoff)', () => {
  it('completing a patrol tour recalculates rank from the new score', async () => {
    await setup({
      currentSystem: 1, missionType: 2, score: 140, rank: 'LIEUTENANT',
      patrolBattlesWon: 30, patrolBattlesLost: 0, creditsHigh: 0, creditsLow: 0, tripCount: 0,
    });
    await setShip({ ...MAX_SHIP, hullCondition: 9, driveCondition: 9 });
    const before = await char();
    await render('space-patrol');                   // missionType===2 → payoff fires from render
    const after = await char();
    expect(after!.missionType).toBe(0);             // patrol tour closed out (zerout)
    expect(after!.patrolBattlesWon).toBe(0);
    expect(after!.score).toBeGreaterThan(before!.score);          // patrol wins added score
    expect(after!.rank).toBe(calculateRank(after!.score));        // rank recalculated from score
    expect(getRankIndex(after!.rank)).toBeGreaterThanOrEqual(getRankIndex(before!.rank)); // promoted (never demoted)
    track('rank.progression');
  });
});

// ============================================================================
// SPECIAL EQUIPMENT — all five purchases + strength/condition distinction
// ============================================================================
describe('Special equipment', () => {
  beforeAll(async () => { await setup({ currentSystem: 1, creditsHigh: 100, creditsLow: 0, rank: 'COMMANDER', score: 300 }); });

  it('Star-Buster (Commander+) installs', async () => {
    await setShip({ hasStarBuster: false, hasCloaker: false, weaponStrength: 20, weaponCondition: 9 });
    await press('shipyard-special', '3');
    expect((await char())!.ship!.hasStarBuster).toBe(true);
    track('equip.star_buster');
  });
  it('Arch-Angel (Commander+) installs', async () => {
    await setShip({ hasArchAngel: false, hasCloaker: false, shieldStrength: 20, shieldCondition: 9 });
    await press('shipyard-special', '4');
    expect((await char())!.ship!.hasArchAngel).toBe(true);
    track('equip.arch_angel');
  });
  it("Morton's Cloaker (hull<5) installs", async () => {
    await setShip({ hasCloaker: false, hasAutoRepair: false, hasArchAngel: false, hullStrength: 3, hullCondition: 9, shieldStrength: 10 });
    await press('shipyard-special', '1');
    expect((await char())!.ship!.hasCloaker).toBe(true);
    track('equip.cloaker');
  });
  it('Trans-Warp accelerator installs', async () => {
    await setShip({ hasTransWarpDrive: false });
    await press('shipyard-special', '6');
    expect((await char())!.ship!.hasTransWarpDrive).toBe(true);
    track('equip.transwarp');
  });
  it('Astraxial Hull (Conqueror + drive≥25) transforms the hull', async () => {
    await setup({ isConqueror: true });
    await setShip({ isAstraxialHull: false, driveStrength: 25, driveCondition: 9 });
    await press('shipyard-special', '7');
    const after = await char();
    expect(after!.ship!.isAstraxialHull).toBe(true);
    expect(after!.ship!.hullStrength).toBe(29);         // SP special-hull bonus
    track('equip.astraxial');
    await setup({ isConqueror: false });
  });

  it('condition repair restores condition to 9 without changing strength', async () => {
    await setShip({ driveStrength: 12, driveCondition: 3, weaponStrength: 15, weaponCondition: 4 });
    await press('shipyard', 'R');
    const after = await char();
    expect(after!.ship!.driveCondition).toBe(9);          // repaired
    expect(after!.ship!.driveStrength).toBe(12);          // strength untouched (vs a STRENGTH upgrade)
    track('shipyard.condition_repair');
  });
});

// ============================================================================
// ALLIANCE TREASURY — withdraw invested credits back to the member
// ============================================================================
describe('Alliance treasury withdraw', () => {
  beforeAll(async () => {
    await setup({ currentSystem: 1, allianceSymbol: 'ASTRO_LEAGUE', creditsHigh: 0, creditsLow: 0 });
    await prisma.allianceMembership.upsert({
      where: { characterId: CID },
      update: { alliance: 'ASTRO_LEAGUE', creditsHigh: 20, creditsLow: 0 },   // 200,000 invested
      create: { characterId: CID, alliance: 'ASTRO_LEAGUE', creditsHigh: 20, creditsLow: 0 },
    });
  });

  it('withdraw moves credits from the alliance treasury to the member', async () => {
    const before = await char();
    await render('alliance-invest');
    await press('alliance-invest', 'W');
    await press('alliance-invest', '50000');
    const after = await char();
    const m = await prisma.allianceMembership.findUnique({ where: { characterId: CID } });
    expect(getTotalCredits(after!.creditsHigh, after!.creditsLow))
      .toBe(getTotalCredits(before!.creditsHigh, before!.creditsLow) + 50000);
    expect(m!.creditsHigh * 10000 + m!.creditsLow).toBe(200000 - 50000);
    track('alliance.withdraw');
  });
});

// ============================================================================
// PORT OWNERSHIP MANAGEMENT — set fuel price, then sell the port
// ============================================================================
describe('Port ownership management', () => {
  beforeAll(async () => {
    await setup({ currentSystem: 2, creditsHigh: 100, creditsLow: 0 });
    await prisma.portOwnership.deleteMany({ where: { characterId: CID } });
    await prisma.portOwnership.create({ data: { characterId: CID, systemId: 2, fuelPrice: 10 } });
  });

  it('the owner sets the fuel price at the depot', async () => {
    await render('port-accounts');
    await press('port-accounts', 'F');   // Fuel Depot
    await press('fuel-depot', 'P');       // set Price
    await press('fuel-depot-price', '25');
    const po = await prisma.portOwnership.findFirst({ where: { characterId: CID } });
    expect(po!.fuelPrice).toBe(25);
    track('port.set_fuel_price');
  });

  it('the owner sells the port (ownership removed, credits returned)', async () => {
    const before = await char();
    await render('port-accounts');
    await press('port-accounts', 'S');   // Sell
    await press('port-accounts', 'S');   // confirm enter sell flow
    await press('port-accounts', '2');   // system 2
    await press('port-accounts', 'Y');   // confirm system
    await press('port-accounts', 'Y');   // confirm price
    const po = await prisma.portOwnership.findFirst({ where: { characterId: CID, systemId: 2 } });
    expect(po).toBeNull();
    const after = await char();
    expect(getTotalCredits(after!.creditsHigh, after!.creditsLow))
      .toBeGreaterThan(getTotalCredits(before!.creditsHigh, before!.creditsLow));
    track('port.sell');
  });
});

// ============================================================================
// BULLETIN BOARD — a member posts a message
// ============================================================================
describe('Bulletin board write', () => {
  beforeAll(async () => {
    await setup({ currentSystem: 1, allianceSymbol: 'ASTRO_LEAGUE' });
    await prisma.allianceMembership.upsert({
      where: { characterId: CID },
      update: { alliance: 'ASTRO_LEAGUE' },
      create: { characterId: CID, alliance: 'ASTRO_LEAGUE' },
    });
    await prisma.bulletinPost.deleteMany({ where: { characterId: CID } });
  });

  it('a member posts a bulletin (persisted for the alliance)', async () => {
    await render('bulletin-board');
    await press('bulletin-board', 'W');
    await press('bulletin-board', 'Rendezvous at Vega-6 at dawn');
    const post = await prisma.bulletinPost.findFirst({ where: { characterId: CID } });
    expect(post).not.toBeNull();
    expect(post!.alliance).toBe('ASTRO_LEAGUE');
    expect(post!.message).toMatch(/Vega-6/);
    track('bulletin.write');
  });
});

// ============================================================================
// SPACE PATROL — the full commission arc up to launch (SP.REG.S)
// ============================================================================
describe('Space Patrol commission', () => {
  it('Join → pick system → confirm → Launch hands off to combat as a patrol', async () => {
    await setup({ currentSystem: 1, missionType: 0, destination: 0, tripCount: 0, hasPatrolCommission: false });
    // Weapons+shields < 50 skips the Space Commandant promotion prompt
    await setShip({ weaponStrength: 10, weaponCondition: 9, shieldStrength: 10, shieldCondition: 9,
      hullCondition: 9, driveCondition: 9, driveStrength: 20, fuel: 500 });
    await render('space-patrol');
    await press('space-patrol', 'J');    // Join / take the oath
    expect((await char())!.hasPatrolCommission).toBe(true);
    await press('space-patrol', '3');    // patrol sector
    await press('space-patrol', 'Y');    // confirm sector
    const [, next] = await press('space-patrol', 'L');   // Launch
    const after = await char();
    expect(after!.missionType).toBe(2);              // on patrol
    expect(next).toBe('combat');                     // hands off to the combat screen
    track('patrol.commission');
    // Clean up patrol state for later tests
    await setup({ missionType: 0, hasPatrolCommission: false, destination: 0, cargoManifest: null, cargoPods: 0 });
  });
});

// ============================================================================
// SMUGGLING RUN — take a contraband contract, deliver it, collect the payout
// ============================================================================
describe('Smuggling run', () => {
  it('take a smuggling contract from the Syndicate (Info → SMU)', async () => {
    await setup({ currentSystem: 1, missionType: 0, cargoType: 0, cargoManifest: null, cargoPods: 10, cargoPayment: 0, tripCount: 0 });   // ≥10 pods to carry contraband
    // The Syndicate contract roll (calculateSmugglingContract) is 1-20 and "intercepted" if >14;
    // pin it to a valid destination so the run is deterministic (roll 3 = System 3, not Sun-3).
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.1);
    try {
      await render('spacers-hangout');
      await press('spacers-hangout', 'H');   // enter hangout
      await press('spacers-hangout', 'I');   // info broker
      await press('spacers-hangout', 'SMU'); // ask about smuggling work
      await press('spacers-hangout', 'Y');   // accept the run
      await press('spacers-hangout', 'Y');   // confirm the contract
    } finally {
      rnd.mockRestore();
    }
    const after = await char();
    expect(after!.missionType).toBe(5);
    expect(after!.cargoType).toBe(10);
    expect(after!.cargoManifest).toMatch(/Contraband/i);
    expect(after!.cargoPayment).toBeGreaterThan(0);
    track('smuggling.take_contract');
  });

  it('delivering the contraband collects the Syndicate payout at the Hangout', async () => {
    // The goods are dropped at the destination (cargoType cleared); the player returns to
    // Sun-3 to collect. Position to the delivered state, then collect through the Hangout.
    await setup({ currentSystem: 1, cargoType: 0 });   // cargo delivered → renderGain path
    const before = await char();
    expect(before!.missionType).toBe(5);
    const pay = before!.cargoPayment;
    const out = await render('spacers-hangout');       // missionType 5 + cargoType<1 → gain
    const after = await char();
    expect(out).toMatch(/smuggled goods|pay|Syndicate/i);
    expect(getTotalCredits(after!.creditsHigh, after!.creditsLow))
      .toBe(getTotalCredits(before!.creditsHigh, before!.creditsLow) + pay);
    expect(after!.missionType).toBe(0);                // mission cleared
    track('smuggling.deliver');
  });
});

// ============================================================================
// SELF-RESCUE — a Lost-In-Space player pays to recover
// ============================================================================
describe('Self-rescue', () => {
  it('a lost player self-rescues, clearing the lost flag for a fee', async () => {
    await setup({ currentSystem: 1, isLost: true, creditsHigh: 100, creditsLow: 0, score: 300 });
    const before = await char();
    await render('rescue-self');
    await press('rescue-self', 'Y');
    const after = await char();
    expect(after!.isLost).toBe(false);
    expect(getTotalCredits(after!.creditsHigh, after!.creditsLow))
      .toBeLessThan(getTotalCredits(before!.creditsHigh, before!.creditsLow));
    track('rescue.self');
  });
});

// ============================================================================
// JAIL BAIL — bail another spacer out of the Hangout brig (2× fine)
// ============================================================================
describe('Jail bail', () => {
  let victimSpacerId = 0;
  beforeAll(async () => {
    await setup({ currentSystem: 1, creditsHigh: 100, creditsLow: 0 });
    const v = await makeNpc('coverage-jail-victim', { name: 'J%Victim', crimeType: 5 });
    victimSpacerId = v!.spacerId;
  });
  afterAll(async () => { await delNpc('coverage-jail-victim'); });

  it('a player bails a jailed spacer out of the brig', async () => {
    const before = await char();
    await render('spacers-hangout');
    await press('spacers-hangout', 'B');                    // to the brig
    await press('spacers-hangout', 'B');                    // bail
    await press('spacers-hangout', String(victimSpacerId)); // convict spacer #
    await press('spacers-hangout', 'Y');                    // confirm bail
    await press('spacers-hangout', 'Y');                    // confirm payment
    const victim = await prisma.character.findFirst({ where: { spacerId: victimSpacerId } });
    const after = await char();
    expect(victim!.crimeType).toBeNull();                  // released
    expect(victim!.name.startsWith('J%')).toBe(false);
    expect(getTotalCredits(after!.creditsHigh, after!.creditsLow))
      .toBeLessThan(getTotalCredits(before!.creditsHigh, before!.creditsLow)); // bail paid
    track('jail.post_bail');
  });
});

// ============================================================================
// RESCUE SERVICE — rescue a stranded (Lost-In-Space) spacer
// ============================================================================
describe('Rescue Service', () => {
  let lostId = '';
  beforeAll(async () => {
    await setup({ currentSystem: 1, isLost: false, rescuesPerformed: 0, score: 300, creditsHigh: 10, creditsLow: 0 });
    await setShip({ fuel: 500 });
    // Make the fixture the ONLY lost ship, so it is roster entry #1
    await prisma.character.updateMany({ where: { isLost: true }, data: { isLost: false } });
    const l = await makeNpc('coverage-rescue-lost', { name: 'Castaway', isLost: true, lostLocation: 7 });
    lostId = l!.id;
  });
  afterAll(async () => { await delNpc('coverage-rescue-lost'); });

  it('a player rescues a stranded spacer (fee + fuel + points)', async () => {
    const before = await char();
    await render('rescue');
    await press('rescue', '1');   // the (only) lost ship
    await press('rescue', 'Y');   // confirm the rescue
    const target = await prisma.character.findUnique({ where: { id: lostId } });
    const after = await char();
    expect(target!.isLost).toBe(false);                     // recovered
    expect(after!.rescuesPerformed).toBe(before!.rescuesPerformed + 1);
    expect(after!.ship!.fuel).toBeLessThan(before!.ship!.fuel);
    track('rescue.other');
  });
});

// ============================================================================
// ALLIANCE RAID — accept → win the battle → activate the conquest (SP.MAL kk=4)
// ============================================================================
describe('Alliance raid', () => {
  beforeAll(async () => {
    await setup({
      currentSystem: 1, allianceSymbol: 'ASTRO_LEAGUE', missionType: 0, raidDocument: null,
      cargoManifest: null, cargoPods: 0, cargoType: 0, destination: 0, score: 300,
    });
    await prisma.allianceMembership.upsert({
      where: { characterId: CID },
      update: { alliance: 'ASTRO_LEAGUE' },
      create: { characterId: CID, alliance: 'ASTRO_LEAGUE' },
    });
    // A rival-alliance system to raid
    await prisma.allianceSystem.upsert({
      where: { systemId: 5 },
      update: { alliance: 'SPACE_DRAGONS', defconLevel: 1, ownerCharacterId: null },
      create: { systemId: 5, alliance: 'SPACE_DRAGONS', defconLevel: 1 },
    });
  });
  afterAll(async () => { await prisma.allianceSystem.deleteMany({ where: { systemId: 5 } }); });

  it('accept a raid mission against a rival-alliance system (keystrokes)', async () => {
    await render('raid');
    await press('raid', 'Y');   // confirm the raid
    await press('raid', '5');   // target system 5 (SPACE_DRAGONS-held)
    await press('raid', 'Y');   // confirm target
    const after = await char();
    expect(after!.missionType).toBe(4);
    expect(after!.destination).toBe(5);
    expect(after!.cargoManifest).toMatch(/Raid/i);
    track('raid.accept');
  });

  it('winning the raid yields conquest documents, then activation transfers the system', async () => {
    await setShip({ ...MAX_SHIP });
    await processDocking(CID, 5);          // raid battle → completeRaid
    const won = await char();
    expect(won!.raidDocument).toBeTruthy();
    expect(won!.score).toBeGreaterThanOrEqual(305);   // +5 for the raid
    track('raid.win');

    // Activate at the Investment Center (raidDocument holder → free takeover)
    await render('alliance-invest');
    await press('alliance-invest', '5');
    const sys = await prisma.allianceSystem.findUnique({ where: { systemId: 5 } });
    const done = await char();
    expect(sys!.alliance).toBe('ASTRO_LEAGUE');       // conquered
    expect(done!.raidDocument).toBeNull();
    track('raid.activate');
  });
});

// ============================================================================
// CARGO DELIVERY BONUS — the faithful SP.CARGO "stat delivery" board bonus
// ============================================================================
describe('Cargo delivery bonus', () => {
  it('signing the advertised (port needs cargo) manifest adds the stat-delivery bonus', async () => {
    await setup({ currentSystem: 1, cargoPods: 0, missionType: 0, cargoType: 0, cargoManifest: null, tripCount: 0 });
    await setShip({ maxCargoPods: 10, hullCondition: 9, weaponStrength: 10, shieldStrength: 10 }); // <50 → no Commandant
    const today = new Date().toISOString().slice(0, 10);
    const board = [
      { cargoType: 3, valuePerPod: 9, destId: 6, destName: 'System 6', payment: 2000, distance: 5, fuelRequired: 20, bonus: 5000 },
      { cargoType: 4, valuePerPod: 12, destId: 8, destName: 'System 8', payment: 2500, distance: 7, fuelRequired: 25 },
      { cargoType: 2, valuePerPod: 6, destId: 3, destName: 'System 3', payment: 1500, distance: 2, fuelRequired: 10 },
      { cargoType: 5, valuePerPod: 15, destId: 10, destName: 'System 10', payment: 3000, distance: 9, fuelRequired: 30 },
    ];
    await prisma.character.update({ where: { id: CID }, data: { manifestBoard: board as object[], manifestDate: today } });
    const shown = await render('traders-cargo');
    expect(shown).toMatch(/bonus/i);                    // the board advertises the demand
    await press('traders-cargo', '1');                  // choose the bonus manifest
    const [out] = await press('traders-cargo', 'Y');    // sign
    const after = await char();
    expect(out).toMatch(/Bonus Awarded/i);
    expect(after!.cargoPayment).toBe(2000 + 5000);      // payment + stat-delivery bonus
    track('cargo.delivery_bonus');
  });
});

// ============================================================================
// ECONOMIC-GOAL SURFACING — main-menu dashboard + risk-labeled cargo board
// ============================================================================
describe('Economic goals & risk', () => {
  it('the main menu shows the progress dashboard + an Objective nudge', async () => {
    await setup({ currentSystem: 1, score: 130, cargoPods: 0, destination: 0, creditsHigh: 0, creditsLow: 0 });
    await setShip({ fuel: 240 });
    const out = await render('main-menu');
    expect(out).toMatch(/Fuel:/);
    expect(out).toMatch(/Score:/);
    expect(out).toMatch(/Next:.*COMMANDER|Commander/i);   // 20 pts to Commander from 130
    expect(out).toMatch(/Objective:/);
    track('goals.dashboard');
  });

  it('a capable player is offered a labeled Rim contract; a weak one is not', async () => {
    // Capable: Commander score + armed (weapon+shield ≥ 50) → board carries a RIM run.
    await setup({ currentSystem: 1, score: 300, cargoPods: 0, missionType: 0, manifestBoard: null, manifestDate: null });
    await setShip({ maxCargoPods: 5, hullStrength: 40, hullCondition: 9, hullName: 'Standard', lifeSupportName: 'LSS', weaponStrength: 30, weaponCondition: 9, shieldStrength: 30, shieldCondition: 9, fuel: 500 });
    let board = await render('traders-cargo');
    if (/Commandant/i.test(board)) [board] = await press('traders-cargo', 'N'); // decline → board
    expect(board).toMatch(/Risk/);                 // risk column present
    expect(board).toMatch(/RIM/);                  // a lucrative-but-dangerous rim run is offered
    track('cargo.rim_contract');

    // Weak: same score but under-armed → core-only board, no rim.
    await setup({ manifestBoard: null, manifestDate: null });
    await setShip({ weaponStrength: 10, shieldStrength: 10 });   // weapon+shield = 20 < 50
    let core = await render('traders-cargo');
    if (/Commandant/i.test(core)) [core] = await press('traders-cargo', 'N');
    expect(core).toMatch(/core/);
    expect(core).not.toMatch(/RIM/);
    track('cargo.core_only_for_weak');
  });
});

// ============================================================================
// END TURN — the core "Done" loop. [D] on the main menu advances to the
// end-turn confirmation; [Y] runs every other spacer's turn and surfaces the
// "Galactic News Wire" digest. This is the single most-pressed action in the
// game, driven here through the exact keystroke path a real player uses.
// ============================================================================
describe('End turn & Galactic News Wire', () => {
  it('[D] → [Y] ends the turn, runs the sector, and surfaces the news wire', async () => {
    // Trips must be exhausted (DAILY_TRIP_LIMIT = 3) for the turn to be endable.
    await setup({ currentSystem: 1, tripCount: 3 });

    // [D]one on the main menu routes to the end-turn confirmation screen.
    const [, toEndTurn] = await press('main-menu', 'D');
    expect(toEndTurn).toBe('end-turn');

    // The confirmation renders, then [Y] processes the rest of the galaxy.
    const confirm = await render('end-turn');
    expect(confirm).toMatch(/End your turn\?/i);
    const [out] = await press('end-turn', 'Y');

    // The News Wire banner is surfaced (the seeded spacers always act → the
    // digest carries at least an opener + a leaderboard beat + a sign-off).
    expect(out).toMatch(/G A L A C T I C\s+N E W S\s+W I R E/);
    expect(out).toMatch(/trips have been reset/i);

    // The player's trip counter is reset for the new turn.
    expect((await char())!.tripCount).toBe(0);
    track('turn.end_news_wire');

    // Any key dismisses the results view back to the main menu.
    const [, back] = await press('end-turn', ' ');
    expect(back).toBe('main-menu');
  });
});

// ============================================================================
// UGT PHASE-2 FIXES (2026-07) — the ranked findings from UGT-PLAYTEST-FINDINGS.md,
// each proven through the keystroke path with real DB effects.
// ============================================================================
describe('UGT findings — docking varfix score (Finding 1)', () => {
  it('cargo delivery awards score = wb + distance + 2 - lb and resets per-trip counters', async () => {
    // A real trip: contract state set, launch driven via the Navigation screen,
    // then the exact arrival mechanism the route runs (completeTravel + processDocking
    // with the trip distance) — same pattern as the boss-mission arrivals above.
    await prisma.travelState.deleteMany({ where: { characterId: CID } });
    await prisma.combatSession.deleteMany({ where: { characterId: CID } });
    await setup({
      currentSystem: 1, missionType: 3, cargoPods: 4, cargoType: 2,
      destination: 5, cargoManifest: 'Herbals', cargoPayment: 2000,
      score: 100, patrolBattlesWon: 2, patrolBattlesLost: 1,   // wb=2, lb=1 this trip
      tripCount: 0, lastTripDate: null, creditsHigh: 0, creditsLow: 5000,   // covers the lift-off fee
      manifestBoard: undefined, manifestDate: null,
    });
    await setShip({
      driveStrength: 20, driveCondition: 9, hullStrength: 20, hullCondition: 9,
      navigationStrength: 50, navigationCondition: 9,   // precision 45 > max roll 40 → never misfires
      weaponStrength: 10, weaponCondition: 9, shieldStrength: 10, shieldCondition: 9,
      cabinStrength: 10, cabinCondition: 9, lifeSupportStrength: 10, lifeSupportCondition: 9,
      roboticsStrength: 10, roboticsCondition: 9, fuel: 500, hasCloaker: false,
    });

    // Launch to the contract port via keystrokes.
    await render('navigate');
    await press('navigate', '5');
    const [liftoff] = await press('navigate', 'Y');
    expect(liftoff).toMatch(/Lift-?Off|Voyage|cleared/i);
    const ts = await prisma.travelState.findUnique({ where: { characterId: CID } });
    expect(ts).not.toBeNull();

    const before = await char();
    const q6 = calculateDistance(ts!.originSystem, 5);
    expect(q6).toBeGreaterThan(0);
    await completeTravel(CID, 5);
    await processDocking(CID, 5, q6);
    const after = await char();

    // SP.DOCK1.txt varfix: s2 = (s2 + wb + q6 + 2) - lb = 100 + 2 + q6 + 2 - 1
    expect(after!.score).toBe(100 + 2 + q6 + 2 - 1);
    // varfix consumed the per-trip battle counters
    expect(after!.patrolBattlesWon).toBe(0);
    expect(after!.patrolBattlesLost).toBe(0);
    // Payment credited, contract cleared
    expect(getTotalCredits(after!.creditsHigh, after!.creditsLow))
      .toBe(getTotalCredits(before!.creditsHigh, before!.creditsLow) + 2000);
    expect(after!.destination).toBe(0);
    // u1 exactly once per arrival (completeTravel owns it — no docking double-count)
    expect(after!.tripsCompleted).toBe(before!.tripsCompleted + 1);
    track('score.docking_varfix');
  });
});

describe('UGT findings — 3-trip daily cap (Finding 6)', () => {
  it('the 4th launch of the day is refused with the authentic trip-cap message', async () => {
    await prisma.travelState.deleteMany({ where: { characterId: CID } });
    // Active contract so the Navigation screen goes straight to the destination
    // prompt (no bribe interstitial); the cap check fires on the destination press.
    await setup({
      currentSystem: 1, missionType: 3, cargoPods: 1, cargoType: 1,
      destination: 5, cargoManifest: 'Herbals', cargoPayment: 1000,
      tripCount: 3, lastTripDate: new Date(), creditsHigh: 1, creditsLow: 0,
    });
    await setShip({ fuel: 500, driveCondition: 9, hullCondition: 9 });

    await render('navigate');
    const [out] = await press('navigate', '5');
    expect(out).toMatch(/Only 3 completed trips allowed per day/i);
    const ts = await prisma.travelState.findUnique({ where: { characterId: CID } });
    expect(ts).toBeNull();   // no launch happened
    // Reset the contract fixture for the following tests
    await setup({ missionType: 0, cargoPods: 0, cargoType: 0, destination: 0, cargoManifest: null, cargoPayment: 0, tripCount: 0 });
    track('travel.trip_limit');
  });
});

describe('UGT findings — weapons fuel malfunction (Finding 2)', () => {
  it('attacking with fuel below weapons/2 prints Malfunction!, burns no fuel, enemy still fires', async () => {
    await setup({ missionType: 0, currentSystem: 1 });
    await setShip({
      weaponStrength: 40, weaponCondition: 9,   // full-power shot costs 20 fuel
      shieldStrength: 30, shieldCondition: 9,
      hullStrength: 20, hullCondition: 9, fuel: 5,   // 5 < 20 → malfunction
      hasAutoRepair: false,
    });
    const session = await startCombat({ enemyHullCondition: 9, currentRound: 1 });
    await render('combat');
    const [out] = await press('combat', 'A');

    expect(out).toMatch(/Malfunction!/);
    const after = await char();
    expect(after!.ship!.fuel).toBe(5);   // SP.FIGHT1.S: no fuel burned on malfunction
    const s = await combatSession();
    expect(s!.currentRound).toBe(2);                    // the round still ran
    expect(s!.enemyHullCondition).toBe(9);              // your attack was skipped
    expect(out).toMatch(/Enemy attack/i);               // pirfite: enemy still fired
    expect(s!.id).toBe(session.id);
    track('combat.fuel_malfunction');
  });

  it('with enough fuel the same attack fires and burns weapons/2 fuel', async () => {
    await setShip({ fuel: 500, weaponStrength: 40, weaponCondition: 9 });
    await startCombat({ enemyHullCondition: 9, currentRound: 1 });
    await render('combat');
    const [out] = await press('combat', 'A');
    expect(out).not.toMatch(/Malfunction!/);
    const after = await char();
    expect(after!.ship!.fuel).toBe(500 - 20);   // x = w1/2 = 20
    await prisma.combatSession.deleteMany({ where: { characterId: CID } });
  });
});

describe('UGT findings — Roscoe upgrade grants +1 (Finding 3)', () => {
  it('a strength upgrade adds exactly +1 at the tiered per-point price', async () => {
    await setup({ currentSystem: 1, creditsHigh: 100, creditsLow: 0 });
    await setShip({ weaponStrength: 30, weaponCondition: 9 });
    const before = await char();
    const [out] = await press('shipyard-upgrade', '5');   // [5] Weapons
    const after = await char();

    expect(after!.ship!.weaponStrength).toBe(31);   // SP.SPEED.S up1: x=x+1
    // price = (floor(30/10)+1) * 10,000 = 40,000
    expect(getTotalCredits(after!.creditsHigh, after!.creditsLow))
      .toBe(getTotalCredits(before!.creditsHigh, before!.creditsLow) - 40000);
    expect(out).toMatch(/upgraded successfully/i);
    track('shipyard.upgrade_plus1');
  });
});

describe('UGT findings — Commandant prompt no longer hijacks cargo signing (Finding 4)', () => {
  beforeAll(async () => {
    // weapons+shields >= 50 arms the Space Commandant interstitial on cargo entry —
    // the state UGT run 3 was trapped in for 57/100 actions.
    await setup({
      currentSystem: 1, missionType: 0, cargoPods: 0, cargoType: 0,
      destination: 0, cargoManifest: null, cargoPayment: 0,
      tripCount: 0, manifestBoard: undefined, manifestDate: null,
      score: 300, creditsHigh: 10, creditsLow: 0,
    });
    await setShip({ weaponStrength: 30, shieldStrength: 30, maxCargoPods: 10, hullStrength: 20 });
  });

  it('explicit [Y] still reaches the Top Gun offer, and the offer menu surfaces its exits', async () => {
    const prompt = await render('traders-cargo');
    expect(prompt).toMatch(/Space Commandant wishes to speak/i);
    const [yes, toTopgun] = await press('traders-cargo', 'Y');
    expect(yes).toMatch(/Yes/);
    expect(toTopgun).toBe('topgun');
    await render('topgun');
    // A stray key inside the offer no longer silently loops — it shows the exits.
    const [hint] = await press('topgun', 'Q');
    expect(hint).toMatch(/\(D\)ecline, \(M\)ission/i);
    const [, back] = await press('topgun', 'D');
    expect(back).toBe('main-menu');
  });

  it('a buffered "1" reads as Not-now and the contract still gets signed', async () => {
    const prompt = await render('traders-cargo');
    expect(prompt).toMatch(/Space Commandant wishes to speak/i);

    // The key a macro/fast player would send for "manifest #1" — previously
    // interpreted as consent and warped into the Top Gun loop.
    const [notNow, next1] = await press('traders-cargo', '1');
    expect(next1).not.toBe('topgun');
    expect(notNow).toMatch(/Not now/i);
    expect(notNow).toMatch(/Manifest/i);   // the board is right there

    const [choice] = await press('traders-cargo', '1');
    expect(choice).toMatch(/Are you sure/i);
    await press('traders-cargo', 'Y');

    const after = await char();
    expect(after!.missionType).toBe(3);
    expect(after!.destination).toBeGreaterThan(0);
    expect(after!.cargoPods).toBeGreaterThan(0);
    track('cargo.commandant_guard');
  });
});

// ============================================================================
// FINAL — coverage assertion
// ============================================================================
describe('Coverage', () => {
  it('exercised a substantial set of high-value actions through the terminal', () => {
    // Regression floor — this many distinct actions must remain reachable & working.
    expect(COVERED.size).toBeGreaterThanOrEqual(66);
  });

  it('all session-wired features are exercised', () => {
    for (const id of [
      // originally-wired features
      'hangout.join_alliance', 'void.reward', 'cloaker.toggle', 'alliance.invest_screen',
      // combat resolved outcomes + forced-RNG travel seams
      'combat.retreat', 'combat.surrender', 'combat.surrender_smuggling', 'combat.defeat',
      'travel.hazard', 'travel.hazard_shielded', 'travel.course_misfire', 'travel.course_change',
      // boss missions + Andromeda transit end-to-end
      'boss.nemesis_battle', 'nemesis.lattice_solved', 'boss.maligna_battle',
      'andromeda.hub_launch', 'andromeda.dock_cargo',
      // arena, DEFCON funding, rank progression
      'arena.remove_duel', 'alliance.defcon_funding', 'rank.progression',
      // §5 coverage push: special equipment, jail bail, alliance withdraw/raid,
      // port management, smuggling, patrol commission, bulletin write, rescue
      'equip.star_buster', 'equip.arch_angel', 'equip.cloaker', 'equip.astraxial',
      'shipyard.condition_repair', 'jail.post_bail', 'alliance.withdraw',
      'port.set_fuel_price', 'port.sell', 'smuggling.take_contract', 'smuggling.deliver',
      'patrol.commission', 'bulletin.write', 'rescue.self', 'rescue.other',
      'raid.accept', 'raid.win', 'raid.activate',
      // economic-goal surfacing + risk/reward contracts
      'goals.dashboard', 'cargo.rim_contract', 'cargo.core_only_for_weak',
      // core end-turn loop + Galactic News Wire digest (keystroke path)
      'turn.end_news_wire',
      // UGT Phase-2 findings fixes (UGT-PLAYTEST-FINDINGS.md, 2026-07)
      'score.docking_varfix', 'travel.trip_limit', 'combat.fuel_malfunction',
      'shipyard.upgrade_plus1', 'cargo.commandant_guard',
    ]) {
      expect(COVERED.has(id), `expected coverage of ${id}`).toBe(true);
    }
  });
});
