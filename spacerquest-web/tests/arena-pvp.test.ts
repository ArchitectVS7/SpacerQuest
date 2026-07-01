/**
 * SpacerQuest v4.0 — Single-Player Arena (async PvP with bots)
 *
 * Drives the human side through the EXACT keystroke path (handleScreenInput on the
 * arena screen) and the bot side through the real decision model (botConsiderOpenDuels),
 * asserting real DB effects: DuelEntry lifecycle, escrowed/transferred stakes, score &
 * battle records. Bot decisions are made deterministic via an injected rng.
 *
 * Requires Postgres (seeded) — same as the other integration tests.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { handleScreenRequest, handleScreenInput } from '../src/sockets/screen-router';
import { prisma } from '../src/db/prisma';
import { createDuelChallenge, resolveDuel, expireStaleDuels } from '../src/game/systems/duel';
import { calculateDuelHandicap } from '../src/game/systems/arena';
import { botConsiderOpenDuels } from '../src/bots/bot-arena';
import { getProfileBySlug } from '../src/bots/profiles';
import { getTotalCredits } from '../src/game/utils';

const strip = (s: string) => (s || '').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\r/g, '');
const render = async (cid: string, screen: string) => strip((await handleScreenRequest(cid, screen)).output);
const press = async (cid: string, screen: string, key: string): Promise<[string, string | undefined]> => {
  const r = await handleScreenInput(cid, screen, key);
  return [strip(r.output), r.nextScreen];
};

/** A scripted rng: returns the given values in order, then a constant tail. */
const scriptRng = (vals: number[], tail = 0.5) => {
  let i = 0;
  return () => (i < vals.length ? vals[i++] : tail);
};

const STRONG_SHIP = {
  hullStrength: 120, hullCondition: 9, driveStrength: 40, driveCondition: 9,
  cabinStrength: 40, cabinCondition: 9, lifeSupportStrength: 40, lifeSupportCondition: 9,
  weaponStrength: 120, weaponCondition: 9, navigationStrength: 40, navigationCondition: 9,
  roboticsStrength: 40, roboticsCondition: 9, shieldStrength: 120, shieldCondition: 9,
  fuel: 500, cargoPods: 0, maxCargoPods: 5,
};
const WEAK_SHIP = {
  hullStrength: 10, hullCondition: 9, driveStrength: 10, driveCondition: 9,
  cabinStrength: 10, cabinCondition: 9, lifeSupportStrength: 10, lifeSupportCondition: 9,
  weaponStrength: 10, weaponCondition: 9, navigationStrength: 10, navigationCondition: 9,
  roboticsStrength: 10, roboticsCondition: 9, shieldStrength: 10, shieldCondition: 9,
  fuel: 500, cargoPods: 0, maxCargoPods: 5,
};

let PLAYER = '';   // human, driven via keystrokes
let OPP = '';      // opponent contender, posts challenges the human/bot answer

async function makeSpacer(bbs: string, name: string, ship: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const existing = await prisma.user.findUnique({ where: { bbsUserId: bbs } });
  if (existing) {
    const c = await prisma.character.findFirst({ where: { userId: existing.id } });
    if (c) {
      await prisma.duelEntry.deleteMany({ where: { OR: [{ challengerId: c.id }, { contenderId: c.id }] } });
      await prisma.ship.deleteMany({ where: { characterId: c.id } });
      await prisma.character.delete({ where: { id: c.id } });
    }
    await prisma.user.delete({ where: { id: existing.id } });
  }
  const user = await prisma.user.create({ data: { bbsUserId: bbs, email: `${bbs}@sq.test`, displayName: name } });
  const ch = await prisma.character.create({
    data: {
      userId: user.id, name, shipName: `${name}-SHIP`, currentSystem: 1,
      creditsHigh: 500, creditsLow: 0, rank: 'COMMANDER', score: 300,
      allianceSymbol: 'NONE', ...extra,
    },
  });
  await prisma.ship.create({ data: { characterId: ch.id, ...(ship as any) } });
  return ch.id;
}
async function char(id: string) {
  return prisma.character.findUnique({ where: { id }, include: { ship: true } });
}
async function clearDuels() {
  await prisma.duelEntry.deleteMany({ where: { OR: [{ challengerId: PLAYER }, { contenderId: PLAYER }, { challengerId: OPP }, { contenderId: OPP }] } });
}

beforeAll(async () => {
  PLAYER = await makeSpacer('arena-pvp-player', 'ArenaPilot', STRONG_SHIP);
  OPP = await makeSpacer('arena-pvp-opp', 'RivalPilot', WEAK_SHIP);
});
afterAll(async () => {
  for (const bbs of ['arena-pvp-player', 'arena-pvp-opp']) {
    const u = await prisma.user.findUnique({ where: { bbsUserId: bbs } });
    if (!u) continue;
    const c = await prisma.character.findFirst({ where: { userId: u.id } });
    if (c) {
      await prisma.duelEntry.deleteMany({ where: { OR: [{ challengerId: c.id }, { contenderId: c.id }] } });
      await prisma.gameLog.deleteMany({ where: { characterId: c.id } });
      await prisma.ship.deleteMany({ where: { characterId: c.id } });
      await prisma.character.delete({ where: { id: c.id } });
    }
    await prisma.user.delete({ where: { id: u.id } });
  }
});
beforeEach(clearDuels);

// ============================================================================
// HUMAN — post as a Contender through the keystroke path
// ============================================================================
describe('Human posts a Contender challenge (keystrokes)', () => {
  it('posts a POINTS duel in the Deep Space arena', async () => {
    await render(PLAYER, 'arena');
    await press(PLAYER, 'arena', '1');      // Contender
    await press(PLAYER, 'arena', '1');      // stakes: (1) Total Points
    await press(PLAYER, 'arena', '6');      // arena: (6) Deep Space (open to all)
    const [out] = await press(PLAYER, 'arena', 'Y'); // write to roster
    expect(out).toMatch(/posted|roster|awaiting/i);
    const duel = await prisma.duelEntry.findFirst({ where: { challengerId: PLAYER, status: 'PENDING' } });
    expect(duel).not.toBeNull();
    expect(duel!.stakesType).toBe('POINTS');
    expect(duel!.arenaType).toBe(6);
    expect(duel!.handicap).toBeGreaterThanOrEqual(1);
  });

  it('posting a CREDITS duel escrows handicap×10,000 credits', async () => {
    const before = await char(PLAYER);
    const escrow = calculateDuelHandicap(before!.ship!) * 10000;
    const credBefore = getTotalCredits(before!.creditsHigh, before!.creditsLow);
    await render(PLAYER, 'arena');
    await press(PLAYER, 'arena', '1');
    await press(PLAYER, 'arena', '3');      // stakes: (3) Credits
    await press(PLAYER, 'arena', '6');
    await press(PLAYER, 'arena', 'Y');
    const after = await char(PLAYER);
    const credAfter = getTotalCredits(after!.creditsHigh, after!.creditsLow);
    expect(credAfter).toBe(credBefore - escrow);
    const duel = await prisma.duelEntry.findFirst({ where: { challengerId: PLAYER, status: 'PENDING' } });
    expect(duel!.stakesType).toBe('CREDITS');
  });

  it('withdrawing a posted CREDITS duel refunds the escrow (keystroke path)', async () => {
    // Post first
    await render(PLAYER, 'arena');
    await press(PLAYER, 'arena', '1'); await press(PLAYER, 'arena', '3');
    await press(PLAYER, 'arena', '6'); await press(PLAYER, 'arena', 'Y');
    const mid = await char(PLAYER);
    const credMid = getTotalCredits(mid!.creditsHigh, mid!.creditsLow);
    // Remove from roster ([3] → confirm Y)
    await render(PLAYER, 'arena');
    await press(PLAYER, 'arena', '3');
    const [out] = await press(PLAYER, 'arena', 'Y');
    expect(out).toMatch(/Removed/i);
    const after = await char(PLAYER);
    const credAfter = getTotalCredits(after!.creditsHigh, after!.creditsLow);
    const escrow = calculateDuelHandicap(after!.ship!) * 10000;
    expect(credAfter).toBe(credMid + escrow);
    const still = await prisma.duelEntry.findFirst({ where: { challengerId: PLAYER, status: 'PENDING' } });
    expect(still).toBeNull();
  });
});

// ============================================================================
// HUMAN — accept a rival's posting and fight it (keystrokes)
// ============================================================================
describe('Human accepts a posted duel and fights (keystrokes)', () => {
  it('accepts the rival\'s POINTS duel, resolves it, and records the result', async () => {
    // Rival posts (the "logged-off contender")
    const post = await createDuelChallenge(OPP, { stakesType: 'POINTS', stakesAmount: 1, arenaType: 6 });
    expect(post.ok).toBe(true);

    const pBefore = await char(PLAYER);
    const oBefore = await char(OPP);
    const winsBefore = pBefore!.battlesWon + pBefore!.battlesLost + oBefore!.battlesWon + oBefore!.battlesLost;

    await render(PLAYER, 'arena');
    const [list] = await press(PLAYER, 'arena', '2');   // Challenger → roster listed
    expect(list).toMatch(/RivalPilot|Rival|DUELING ROSTER/i);
    const [out] = await press(PLAYER, 'arena', '1');    // pick roster entry #1 → accept + resolve
    expect(out).toMatch(/Arena|Salvo|beats|Draw/i);

    const duel = await prisma.duelEntry.findFirst({
      where: { challengerId: OPP, OR: [{ contenderId: PLAYER }, { contenderId: null }] },
      orderBy: { createdAt: 'desc' },
    });
    expect(duel!.status).toBe('COMPLETED');
    // Someone won (or a draw) — the battle actually resolved through the UI
    const pAfter = await char(PLAYER);
    const oAfter = await char(OPP);
    const winsAfter = pAfter!.battlesWon + pAfter!.battlesLost + oAfter!.battlesWon + oAfter!.battlesLost;
    if (duel!.result) {
      expect(winsAfter).toBe(winsBefore + 2);            // one win + one loss recorded
      expect(['VICTORY', 'DEFEAT']).toContain(duel!.result);
    }
  });
});

// ============================================================================
// BOTS — the async opponents: strategic accept vs. foolish/strategic decline
// ============================================================================
describe('Bot arena decisions (deterministic via injected rng)', () => {
  it('an aggressive bot accepts an open challenge and fights it (strategic/foolish)', async () => {
    // A rival posts an open Deep Space challenge; the PLAYER character acts as the bot here.
    const post = await createDuelChallenge(OPP, { stakesType: 'POINTS', stakesAmount: 1, arenaType: 6 });
    expect(post.ok).toBe(true);
    const ironVex = getProfileBySlug('iron-vex')!;         // aggression 0.95 — a duelist berserker
    // rng: [engage-gate=0 (proceed), perceived-noise=1 (confident)], then salvos default 0.5
    const event = await botConsiderOpenDuels(PLAYER, ironVex, scriptRng([0, 1]));
    expect(event).not.toBeNull();
    expect(event).toMatch(/accepted|WON|lost|draw/i);
    const duel = await prisma.duelEntry.findFirst({ where: { challengerId: OPP }, orderBy: { createdAt: 'desc' } });
    expect(duel!.status).toBe('COMPLETED');
  });

  it('a cautious bot declines a coin-flip challenge (strategic restraint)', async () => {
    const post = await createDuelChallenge(OPP, { stakesType: 'POINTS', stakesAmount: 1, arenaType: 6 });
    expect(post.ok).toBe(true);
    const zeroRisk = getProfileBySlug('zero-risk')!;       // caution 0.95 — ultra-cautious
    // Even passing the engage gate (0) and best-case noise (1), its threshold is unreachable here.
    const event = await botConsiderOpenDuels(PLAYER, zeroRisk, scriptRng([0, 1]));
    expect(event).toBeNull();
    const duel = await prisma.duelEntry.findFirst({ where: { challengerId: OPP }, orderBy: { createdAt: 'desc' } });
    expect(duel!.status).toBe('PENDING');                  // left untouched
  });
});

// ============================================================================
// ECONOMICS — a CREDITS duel is a conservative, symmetric transfer
// ============================================================================
describe('Credit-stakes economics', () => {
  it('a resolved CREDITS duel conserves total credits (escrows returned ± v)', async () => {
    await prisma.character.update({ where: { id: PLAYER }, data: { creditsHigh: 500, creditsLow: 0 } });
    await prisma.character.update({ where: { id: OPP }, data: { creditsHigh: 500, creditsLow: 0 } });
    const p0 = await char(PLAYER), o0 = await char(OPP);
    const totalBefore = getTotalCredits(p0!.creditsHigh, p0!.creditsLow) + getTotalCredits(o0!.creditsHigh, o0!.creditsLow);

    // Rival posts CREDITS; player accepts + resolve via the shared path (both escrow, then settle ±v).
    const post = await createDuelChallenge(OPP, { stakesType: 'CREDITS', stakesAmount: 1, arenaType: 6 });
    expect(post.ok).toBe(true);
    const duelId = (post as any).duelId as string;
    const { acceptDuelChallenge } = await import('../src/game/systems/duel');
    const acc = await acceptDuelChallenge(duelId, PLAYER);
    expect(acc.ok).toBe(true);
    const res = await resolveDuel(duelId, scriptRng([]));   // salvos deterministic-ish (0.5s)
    expect(res.ok).toBe(true);

    const p1 = await char(PLAYER), o1 = await char(OPP);
    const totalAfter = getTotalCredits(p1!.creditsHigh, p1!.creditsLow) + getTotalCredits(o1!.creditsHigh, o1!.creditsLow);
    expect(totalAfter).toBe(totalBefore);                  // zero-sum: no credits created or destroyed
  });
});

// ============================================================================
// EXPIRY — a posting no one takes is withdrawn and refunded
// ============================================================================
describe('Stale posting expiry + refund', () => {
  it('expireStaleDuels withdraws an old CREDITS posting and refunds the escrow', async () => {
    await prisma.character.update({ where: { id: OPP }, data: { creditsHigh: 500, creditsLow: 0 } });
    const before = await char(OPP);
    const escrow = calculateDuelHandicap(before!.ship!) * 10000;
    const post = await createDuelChallenge(OPP, { stakesType: 'CREDITS', stakesAmount: 1, arenaType: 6 });
    const duelId = (post as any).duelId as string;
    // Backdate the posting well past the max age
    await prisma.duelEntry.update({ where: { id: duelId }, data: { createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) } });

    const n = await expireStaleDuels();
    expect(n).toBeGreaterThanOrEqual(1);
    const duel = await prisma.duelEntry.findUnique({ where: { id: duelId } });
    expect(duel!.status).toBe('CANCELLED');
    const after = await char(OPP);
    // Escrow returned
    expect(getTotalCredits(after!.creditsHigh, after!.creditsLow)).toBe(getTotalCredits(before!.creditsHigh, before!.creditsLow));
  });
});
