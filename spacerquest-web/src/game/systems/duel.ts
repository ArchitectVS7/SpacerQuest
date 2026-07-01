/**
 * SpacerQuest v4.0 - Dueling Arena — shared duel lifecycle
 *
 * The single source of truth for POSTING, ACCEPTING and RESOLVING arena duels,
 * extracted from the REST handlers in routes/social.ts so that all three callers —
 * the REST API, the human keystroke screen (arena.ts), and the bot arena phase
 * (bots/bot-arena.ts) — run the identical, faithful SP.ARENA1.S/SP.ARENA2.S logic.
 *
 * The original arena is inherently ASYNCHRONOUS: a Contender posts a challenge and
 * logs off; a Challenger who arrives later fights the Contender's STORED ship stats.
 * Resolution therefore operates purely on persisted DB rows — no participant need be
 * "present" — which is exactly what makes it portable to single-player-with-bots.
 *
 * DB naming is SWAPPED relative to the original (documented in arena.ts):
 *   DuelEntry.challenger = the POSTER   (original Contender, bx side, +1 salvo edge)
 *   DuelEntry.contender  = the ACCEPTER (original Challenger, cx side)
 */

import { prisma } from '../../db/prisma.js';
import {
  calculateDuelHandicap,
  calculateArenaHandicap,
  simulateDuelCombat,
  calculateProportionalStakes,
  ARENA_NAMES,
} from './arena.js';
import { ARENA_REQUIREMENTS } from '../constants.js';
import { getTotalCredits, subtractCredits, addCredits } from '../utils.js';

export type StakesType = 'POINTS' | 'COMPONENTS' | 'CREDITS';

/**
 * Credit stakes are denominated in the original's g1 "high" units (1 unit = 10,000 cr):
 * escrow = handicap × 10,000, and the proportional transfer v is likewise ×10,000
 * (SP.ARENA1.S:144 "0,000" suffix; SP.ARENA2.S spo3). Keeping escrow and transfer in the
 * same units is what makes the credit economy net out to a symmetric ±v transfer.
 */
export const DUEL_CREDIT_UNIT = 10000;

// ── Shared eligibility helpers ──────────────────────────────────────────────

/** Check an entrant meets the arena's stat gate (chk / are2, SP.ARENA1.S:119-122 / SP.ARENA2.S:146-152). */
export function arenaRequirementError(
  arenaType: number,
  c: { tripsCompleted: number; astrecsTraveled: number; cargoDelivered: number; rescuesPerformed: number },
): string | null {
  if (arenaType === 1 && c.tripsCompleted < ARENA_REQUIREMENTS.ION_CLOUD.trips)
    return `${ARENA_NAMES[0]} Arena Closed!...Need more space trips`;
  if (arenaType === 2 && c.astrecsTraveled < ARENA_REQUIREMENTS.PROTON_STORM.astrecs)
    return `${ARENA_NAMES[1]} Arena Closed!...Need more astrecs travelled`;
  if (arenaType === 3 && c.cargoDelivered < ARENA_REQUIREMENTS.COSMIC_RADIATION.cargo)
    return `${ARENA_NAMES[2]} Arena Closed!...Need more cargo delivered`;
  if (arenaType === 4 && c.rescuesPerformed < ARENA_REQUIREMENTS.BLACK_HOLE.rescues)
    return `${ARENA_NAMES[3]} Arena Closed!...Need more rescues`;
  return null;
}

function shipComponentStrengthTotal(ship: {
  driveStrength: number; cabinStrength: number; lifeSupportStrength: number;
  weaponStrength: number; navigationStrength: number; roboticsStrength: number; shieldStrength: number;
}): number {
  return ship.driveStrength + ship.cabinStrength + ship.lifeSupportStrength +
    ship.weaponStrength + ship.navigationStrength + ship.roboticsStrength + ship.shieldStrength;
}

// ============================================================================
// POST — become a Contender (SP.ARENA1.S cont/liab/arena/duet)
// ============================================================================

export interface CreateDuelInput {
  stakesType: StakesType;
  stakesAmount: number;
  arenaType: number;
  /** Optional specific opponent (real character id). null/undefined = open to Anyone (xn=0). */
  targetCharacterId?: string | null;
}
export type CreateDuelResult =
  | { ok: true; duelId: string; handicap: number }
  | { ok: false; error: string };

export async function createDuelChallenge(
  characterId: string,
  input: CreateDuelInput,
): Promise<CreateDuelResult> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { ship: true },
  });
  if (!character || !character.ship) return { ok: false, error: 'No ship found' };

  // Same-alliance protection for a targeted challenge
  if (input.targetCharacterId) {
    const target = await prisma.character.findUnique({ where: { id: input.targetCharacterId } });
    if (target && character.allianceSymbol !== 'NONE' && character.allianceSymbol === target.allianceSymbol) {
      return { ok: false, error: 'You cannot duel a member of your own alliance' };
    }
  }

  const reqErr = arenaRequirementError(input.arenaType, character);
  if (reqErr) return { ok: false, error: reqErr };

  // SP.ARENA1.S:70 — pp=8 → "You are already a Contender"
  const existing = await prisma.duelEntry.findFirst({
    where: { challengerId: characterId, status: 'PENDING' },
  });
  if (existing) return { ok: false, error: 'You are already a Contender' };

  // SP.ARENA1.S:68 — if h<1 "Inadequate for dueling!"
  const handicap = calculateDuelHandicap(character.ship);
  if (handicap < 1) return { ok: false, error: `${character.shipName || character.name} Inadequate for dueling!` };

  // Stakes validation (liab, SP.ARENA1.S:104-108)
  if (input.stakesType === 'POINTS' && character.score < 150) {
    return { ok: false, error: 'Not enough points! (minimum 150 required)' };
  }
  if (input.stakesType === 'COMPONENTS' && shipComponentStrengthTotal(character.ship) < 1) {
    return { ok: false, error: 'Ship has no component strength to wager' };
  }
  if (input.stakesType === 'CREDITS') {
    const escrow = handicap * DUEL_CREDIT_UNIT;
    if (getTotalCredits(character.creditsHigh, character.creditsLow) < escrow) {
      return { ok: false, error: 'Insufficient credits to post this duel' };
    }
    // SP.ARENA1.S:152 — if x4=3 g1=g1-h  (escrow handicap×10,000 cr at post time)
    const r = subtractCredits(character.creditsHigh, character.creditsLow, escrow);
    await prisma.character.update({
      where: { id: characterId },
      data: { creditsHigh: r.high, creditsLow: r.low },
    });
  }

  const duel = await prisma.duelEntry.create({
    data: {
      challengerId: characterId,
      contenderId: input.targetCharacterId ?? null,
      stakesType: input.stakesType,
      stakesAmount: input.stakesAmount,
      arenaType: input.arenaType,
      handicap,
    },
  });

  return { ok: true, duelId: duel.id, handicap };
}

// ============================================================================
// ACCEPT — become a Challenger (SP.ARENA2.S issue/iss2a)
// ============================================================================

export type AcceptDuelResult =
  | { ok: true; accepterHandicap: number }
  | { ok: false; error: string };

export async function acceptDuelChallenge(
  duelId: string,
  accepterId: string,
): Promise<AcceptDuelResult> {
  const accepter = await prisma.character.findUnique({
    where: { id: accepterId },
    include: { ship: true },
  });
  if (!accepter || !accepter.ship) return { ok: false, error: 'No ship found' };

  const duel = await prisma.duelEntry.findUnique({
    where: { id: duelId },
    include: { challenger: true },
  });
  if (!duel) return { ok: false, error: 'Duel not found' };
  if (duel.status !== 'PENDING') return { ok: false, error: 'Duel is not pending' };

  // Targeted duel not meant for this accepter (iss2a, SP.ARENA2.S:51)
  if (duel.contenderId && duel.contenderId !== accepterId) {
    return { ok: false, error: 'Duel is not with you!' };
  }
  // Can't challenge your own ship (SP.ARENA2.S:52)
  if (accepterId === duel.challengerId) return { ok: false, error: "Can't challenge own ship!" };

  // Same-alliance protection
  if (accepter.allianceSymbol !== 'NONE' && accepter.allianceSymbol === duel.challenger.allianceSymbol) {
    return { ok: false, error: 'You cannot duel a member of your own alliance' };
  }

  // SP.ARENA1.S:72 — pp=9 → "Only 1 challenge per visit"
  const existingAccepted = await prisma.duelEntry.findFirst({
    where: { contenderId: accepterId, status: 'ACCEPTED' },
  });
  if (existingAccepted) return { ok: false, error: 'Only 1 challenge per visit' };

  const reqErr = arenaRequirementError(duel.arenaType, accepter);
  if (reqErr) return { ok: false, error: reqErr };

  const accepterHandicap = calculateDuelHandicap(accepter.ship);
  if (accepterHandicap < 1) {
    return { ok: false, error: `${accepter.shipName || accepter.name} Inadequate for dueling!` };
  }
  if (duel.stakesType === 'POINTS' && accepter.score < 150) {
    return { ok: false, error: 'Need more total points (minimum 150)' };
  }
  if (duel.stakesType === 'COMPONENTS' && shipComponentStrengthTotal(accepter.ship) < 1) {
    return { ok: false, error: 'Ship has no component strength to wager' };
  }
  if (duel.stakesType === 'CREDITS') {
    const escrow = accepterHandicap * DUEL_CREDIT_UNIT;
    if (getTotalCredits(accepter.creditsHigh, accepter.creditsLow) < escrow) {
      return { ok: false, error: 'Insufficient credits to accept this duel' };
    }
    const r = subtractCredits(accepter.creditsHigh, accepter.creditsLow, escrow);
    await prisma.character.update({
      where: { id: accepterId },
      data: { creditsHigh: r.high, creditsLow: r.low },
    });
  }

  await prisma.duelEntry.update({
    where: { id: duelId },
    data: { contenderId: accepterId, status: 'ACCEPTED' },
  });

  return { ok: true, accepterHandicap };
}

// ============================================================================
// RESOLVE — fight the stored ships (SP.ARENA2.S salv/fini/spo3/compfx)
// ============================================================================

export interface DuelResolution {
  draw: boolean;
  posterWon: boolean;
  winnerId: string;
  loserId: string;
  winnerName: string;
  loserName: string;
  winnerHits: number;
  loserHits: number;
  stakesType: string;
  stakesTransferred: number;
  arenaType: number;
  salvos: string[];
  message: string;
}
export type ResolveDuelResult =
  | { ok: true; resolution: DuelResolution }
  | { ok: false; error: string };

const COMPONENT_STR_KEYS = [
  'driveStrength', 'cabinStrength', 'lifeSupportStrength',
  'weaponStrength', 'navigationStrength', 'roboticsStrength', 'shieldStrength',
] as const;

export async function resolveDuel(
  duelId: string,
  rng: () => number = Math.random,
): Promise<ResolveDuelResult> {
  const duel = await prisma.duelEntry.findUnique({
    where: { id: duelId },
    include: {
      challenger: { include: { ship: true } },
      contender: { include: { ship: true } },
    },
  });

  if (!duel || !duel.challenger.ship || !duel.contender?.ship) {
    return { ok: false, error: 'Duel not found or ships missing' };
  }
  if (duel.status !== 'ACCEPTED') return { ok: false, error: 'Duel is not ready to resolve' };

  const poster = duel.challenger;
  const accepter = duel.contender;
  const posterShip = poster.ship!;
  const accepterShip = accepter.ship!;

  // Arena handicaps (afill, SP.ARENA2.S:154-161)
  const posterArenaHcp = calculateArenaHandicap(
    duel.arenaType, poster.tripsCompleted, poster.astrecsTraveled, poster.cargoDelivered,
    poster.rescuesPerformed, poster.battlesWon, poster.battlesLost,
  );
  const accepterArenaHcp = calculateArenaHandicap(
    duel.arenaType, accepter.tripsCompleted, accepter.astrecsTraveled, accepter.cargoDelivered,
    accepter.rescuesPerformed, accepter.battlesWon, accepter.battlesLost,
  );

  // 9-salvo combat (salv, SP.ARENA2.S:74-83)
  const combat = simulateDuelCombat(
    poster.shipName || poster.name,
    accepter.shipName || accepter.name,
    posterArenaHcp, accepterArenaHcp, rng,
  );

  // Draw → stakes cancelled (SP.ARENA2.S:91) — refund escrowed credit stakes to both.
  if (combat.isDraw) {
    await prisma.duelEntry.update({
      where: { id: duelId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    if (duel.stakesType === 'CREDITS') {
      await refundCredits(poster.id, duel.handicap * DUEL_CREDIT_UNIT);
      await refundCredits(accepter.id, calculateDuelHandicap(accepterShip) * DUEL_CREDIT_UNIT);
    }
    await prisma.gameLog.create({
      data: {
        type: 'DUEL',
        message: `Duel Draw: ${poster.name} and ${accepter.name} — stakes cancelled`,
        metadata: { duelId, salvos: combat.salvos },
      },
    });
    return {
      ok: true,
      resolution: {
        draw: true, posterWon: false,
        winnerId: '', loserId: '', winnerName: '', loserName: '',
        winnerHits: combat.posterHits, loserHits: combat.accepterHits,
        stakesType: duel.stakesType, stakesTransferred: 0, arenaType: duel.arenaType,
        salvos: combat.salvos, message: 'Battle a Draw!...stakes cancelled!',
      },
    };
  }

  const posterWon = combat.posterHits > combat.accepterHits;
  const winner = posterWon ? poster : accepter;
  const loser = posterWon ? accepter : poster;

  // Proportional stakes (fini, SP.ARENA2.S:92-96)
  const posterHandicap = duel.handicap;               // x2 (stored at post)
  const accepterHandicap = calculateDuelHandicap(accepterShip); // h
  let posterStakes: number;
  let accepterStakes: number;
  if (duel.stakesType === 'POINTS') {
    posterStakes = posterHandicap > 0 ? Math.max(1, Math.floor(poster.score / posterHandicap / 10)) : 1;
    accepterStakes = accepterHandicap > 0 ? Math.max(1, Math.floor(accepter.score / accepterHandicap / 10)) : 1;
  } else {
    posterStakes = Math.max(1, posterHandicap);
    accepterStakes = Math.max(1, accepterHandicap);
  }
  const v = calculateProportionalStakes(posterHandicap, accepterHandicap, posterStakes, accepterStakes);

  // Winner +1 win +10 score (SP.ARENA2.S:105); loser +1 loss
  await prisma.character.update({
    where: { id: winner.id },
    data: { battlesWon: { increment: 1 }, score: { increment: 10 } },
  });
  await prisma.character.update({
    where: { id: loser.id },
    data: { battlesLost: { increment: 1 } },
  });

  // Stakes transfer (spo3/compfx/cost, SP.ARENA2.S:99-139)
  if (duel.stakesType === 'CREDITS') {
    // Both parties escrowed their own handicap×10,000 (poster at post, accepter at accept).
    // Original settles to a symmetric ±v transfer (SP.ARENA2.S spo3): each escrow is returned,
    // adjusted by the proportional stake v. Net: winner +v×10,000, loser −v×10,000.
    const transfer = v * DUEL_CREDIT_UNIT;
    const winnerEscrow = (winner.id === poster.id ? posterHandicap : accepterHandicap) * DUEL_CREDIT_UNIT;
    const loserEscrow = (loser.id === poster.id ? posterHandicap : accepterHandicap) * DUEL_CREDIT_UNIT;
    const wBack = addCredits(winner.creditsHigh, winner.creditsLow, winnerEscrow + transfer);
    await prisma.character.update({
      where: { id: winner.id },
      data: { creditsHigh: wBack.high, creditsLow: wBack.low },
    });
    const lBack = addCredits(loser.creditsHigh, loser.creditsLow, Math.max(0, loserEscrow - transfer));
    await prisma.character.update({
      where: { id: loser.id },
      data: { creditsHigh: lBack.high, creditsLow: lBack.low },
    });
  } else if (duel.stakesType === 'COMPONENTS') {
    // compfx: v iterations, each shifts a random component STRENGTH +1 winner / -1 loser (SP.ARENA2.S:117-139)
    const loserShip = loser.id === poster.id ? posterShip : accepterShip;
    const winnerShip = winner.id === poster.id ? posterShip : accepterShip;
    const loserUpdates: Record<string, number> = {};
    const winnerUpdates: Record<string, number> = {};
    let lastIdx = -1;
    for (let i = 0; i < v; i++) {
      let idx: number;
      do { idx = Math.floor(rng() * COMPONENT_STR_KEYS.length); } while (idx === lastIdx);
      lastIdx = idx;
      const key = COMPONENT_STR_KEYS[idx];
      const lRec = loserShip as unknown as Record<string, number>;
      const wRec = winnerShip as unknown as Record<string, number>;
      loserUpdates[key] = Math.max(0, (loserUpdates[key] ?? lRec[key] ?? 0) - 1);
      winnerUpdates[key] = Math.min(199, (winnerUpdates[key] ?? wRec[key] ?? 0) + 1);
    }
    if (Object.keys(loserUpdates).length > 0) {
      await prisma.ship.update({ where: { id: loserShip.id }, data: loserUpdates });
    }
    if (Object.keys(winnerUpdates).length > 0) {
      await prisma.ship.update({ where: { id: winnerShip.id }, data: winnerUpdates });
    }
  } else if (duel.stakesType === 'POINTS') {
    await prisma.character.update({ where: { id: winner.id }, data: { score: { increment: v } } });
    await prisma.character.update({ where: { id: loser.id }, data: { score: { decrement: v } } });
  }

  await prisma.duelEntry.update({
    where: { id: duelId },
    data: { status: 'COMPLETED', result: posterWon ? 'VICTORY' : 'DEFEAT', completedAt: new Date() },
  });

  const winnerHits = posterWon ? combat.posterHits : combat.accepterHits;
  const loserHits = posterWon ? combat.accepterHits : combat.posterHits;

  await prisma.gameLog.create({
    data: {
      type: 'DUEL',
      message: `Duel: ${winner.name} [${winnerHits}] beats ${loser.name} [${loserHits}]`,
      metadata: {
        duelId, winnerId: winner.id, loserId: loser.id,
        stakesType: duel.stakesType, stakesTransferred: v, salvos: combat.salvos,
      },
    },
  });

  return {
    ok: true,
    resolution: {
      draw: false, posterWon,
      winnerId: winner.id, loserId: loser.id, winnerName: winner.name, loserName: loser.name,
      winnerHits, loserHits, stakesType: duel.stakesType, stakesTransferred: v,
      arenaType: duel.arenaType, salvos: combat.salvos,
      message: `${winner.name} [${winnerHits}] beats ${loser.name} [${loserHits}]`,
    },
  };
}

async function refundCredits(characterId: string, amount: number): Promise<void> {
  if (amount <= 0) return;
  const c = await prisma.character.findUnique({ where: { id: characterId } });
  if (!c) return;
  const back = addCredits(c.creditsHigh, c.creditsLow, amount);
  await prisma.character.update({
    where: { id: characterId },
    data: { creditsHigh: back.high, creditsLow: back.low },
  });
}

// ============================================================================
// EXPIRY / REFUND (a posting no one takes is withdrawn; zerout refund, SP.ARENA1.S:296-297)
// ============================================================================

/**
 * Cancel a stale PENDING challenge and refund its escrowed credit stake to the poster.
 * Returns true if a duel was cancelled.
 */
export async function cancelDuel(duelId: string, refund = true): Promise<boolean> {
  const duel = await prisma.duelEntry.findUnique({ where: { id: duelId } });
  if (!duel || duel.status !== 'PENDING') return false;
  if (refund && duel.stakesType === 'CREDITS') {
    await refundCredits(duel.challengerId, duel.handicap * DUEL_CREDIT_UNIT);
  }
  await prisma.duelEntry.update({
    where: { id: duelId },
    data: { status: 'CANCELLED' },
  });
  return true;
}

/** Default lifespan of an unanswered posting before it is auto-withdrawn (~3 days). */
export const DUEL_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Withdraw postings no challenger ever took, refunding their escrowed credit stakes
 * (the original's zerout refund, SP.ARENA1.S:296-297). Keeps the roster from filling
 * with abandoned challenges. Returns the number withdrawn.
 */
export async function expireStaleDuels(maxAgeMs: number = DUEL_MAX_AGE_MS, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - maxAgeMs);
  const stale = await prisma.duelEntry.findMany({
    where: { status: 'PENDING', createdAt: { lt: cutoff } },
    select: { id: true },
  });
  let count = 0;
  for (const d of stale) {
    if (await cancelDuel(d.id, true)) count++;
  }
  return count;
}
