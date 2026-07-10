/**
 * SpacerQuest v4.0 - Bot Arena Participation
 *
 * Makes the 20 simulated spacers real async PvP opponents. The original arena
 * (SP.ARENA1/2.S) worked because a Contender posted a challenge and *logged off*,
 * and whoever dialed in next fought the Contender's stored ship. Our turn structure
 * reproduces that: the player posts a challenge and ends their turn ("logs off"),
 * and during runAllBotTurns ("the other spacers fall in and play their day") bots
 * decide — strategically or foolishly — whether to accept it, and post their own.
 *
 * The decision is personality-driven (BotProfile weights): brave bots overestimate
 * themselves and take bad duels (human-like bravado); cautious bots only take clearly
 * favourable matchups; gamblers dive in regardless. See ARENA_DESIGN.md §5.
 */

import { prisma } from '../db/prisma.js';
import { BotProfile, RngFunction } from './types.js';
import { calculateDuelHandicap, calculateArenaHandicap, ARENA_NAMES } from '../game/systems/arena.js';
import {
  createDuelChallenge, acceptDuelChallenge, resolveDuel, arenaRequirementError, StakesType,
} from '../game/systems/duel.js';
import { getTotalCredits } from '../game/utils.js';

// ── Tuning knobs (Phase 3 can move these to constants.ts) ───────────────────
const OVERCONF_GAIN = 0.35;   // how much aggression tilts a bot's self-estimate
const SPREAD_MIN = 0.05;      // misjudgement noise floor
const SPREAD_MAX = 0.35;      // misjudgement noise for reckless bots
const BASE_THRESHOLD = 0.5;   // perceived-win bar to accept
const AGG_W = 0.25, GAMBLE_W = 0.20, CAUT_W = 0.25; // threshold personality weights
const EDGE = 10;              // the poster's structural +1-salvo advantage (~10 pts)
const LOGISTIC_SCALE = 17;    // maps handicap delta → probability

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/**
 * Estimate the ACCEPTER's true win probability from the two arena handicaps.
 * Duel salvos are poster `(j+1)*10+x5` vs accepter `k*10+a` (j,k∈1..9): the poster
 * carries a structural +1 edge, so the accepter must overcome `EDGE` on top of the
 * raw handicap gap. Logistic on the effective delta is a good closed-form fit.
 */
export function estimateAccepterWinProb(accepterArenaHcp: number, posterArenaHcp: number): number {
  const effectiveDelta = accepterArenaHcp - posterArenaHcp - EDGE;
  return clamp01(1 / (1 + Math.exp(-effectiveDelta / LOGISTIC_SCALE)));
}

/**
 * A bot's *perceived* win probability = truth + personality bias + misjudgement noise.
 * This is where "strategic vs foolish" lives.
 */
export function perceivedWinProb(profile: BotProfile, trueProb: number, rng: RngFunction): number {
  const bias = (profile.aggression - 0.5) * OVERCONF_GAIN;
  const spread = SPREAD_MIN + (SPREAD_MAX - SPREAD_MIN) * profile.aggression * (1 - profile.caution);
  const noise = (rng() * 2 - 1) * spread;
  return clamp01(trueProb + bias + noise);
}

/** Personality-scaled bar a perceived win-prob must clear to accept. */
export function acceptThreshold(profile: BotProfile): number {
  return clamp01(BASE_THRESHOLD - profile.aggression * AGG_W - profile.gamblingLust * GAMBLE_W + profile.caution * CAUT_W);
}

/** How likely this bot even engages with the arena this turn (accept side). */
function engageChance(profile: BotProfile): number {
  return clamp01(0.15 + profile.aggression * 0.5 + profile.gamblingLust * 0.3);
}
/** How likely this bot posts a fresh challenge this turn. */
function postChance(profile: BotProfile): number {
  return clamp01(profile.aggression * 0.35 + profile.gamblingLust * 0.35);
}

// ── Ship / eligibility shape shared with calculateDuelHandicap ──────────────
type CharWithShip = NonNullable<Awaited<ReturnType<typeof loadBot>>>;
async function loadBot(characterId: string) {
  return prisma.character.findUnique({ where: { id: characterId }, include: { ship: true } });
}

/**
 * Choose the arena that best flatters this bot's record (its highest arena handicap
 * among arenas it's eligible for), falling back to Deep Space (6, always open).
 */
function chooseArenaLane(c: CharWithShip): number {
  let best = 6, bestHcp = -1;
  for (let arena = 1; arena <= 6; arena++) {
    if (arenaRequirementError(arena, c)) continue;
    const hcp = calculateArenaHandicap(arena, c.tripsCompleted, c.astrecsTraveled, c.cargoDelivered, c.rescuesPerformed, c.battlesWon, c.battlesLost);
    if (hcp > bestHcp) { bestHcp = hcp; best = arena; }
  }
  return best;
}

/** Pick stakes flavour by personality; cautious bots avoid permanent component loss. */
function chooseStakes(profile: BotProfile): StakesType {
  if (profile.greed > 0.6) return 'CREDITS';
  if (profile.aggression > 0.7 && profile.caution < 0.6) return 'POINTS';
  return 'CREDITS';
}

// ============================================================================
// ACCEPT side — consider open postings and fight one
// ============================================================================

export async function botConsiderOpenDuels(
  characterId: string,
  profile: BotProfile,
  rng: RngFunction,
): Promise<string | null> {
  if (rng() > engageChance(profile)) return null;

  const bot = await loadBot(characterId);
  if (!bot || !bot.ship) return null;

  const botHcp = calculateDuelHandicap(bot.ship);
  if (botHcp < 1) return null;

  // "Only 1 challenge per visit" (SP.ARENA1.S:72)
  const alreadyAccepted = await prisma.duelEntry.findFirst({ where: { contenderId: characterId, status: 'ACCEPTED' } });
  if (alreadyAccepted) return null;

  // Open postings not by this bot, either open-to-anyone or targeted at this bot.
  const open = (await prisma.duelEntry.findMany({
    where: {
      status: 'PENDING',
      challengerId: { not: characterId },
      OR: [{ contenderId: null }, { contenderId: characterId }],
    },
    include: { challenger: true },
    orderBy: { createdAt: 'asc' },
    take: 12,
  })) ?? [];

  const threshold = acceptThreshold(profile);
  const botCredits = getTotalCredits(bot.creditsHigh, bot.creditsLow);

  for (const duel of open) {
    // Same-alliance protection
    if (bot.allianceSymbol !== 'NONE' && bot.allianceSymbol === duel.challenger.allianceSymbol) continue;
    // Eligibility: arena requirement + affordability + stakes gates
    if (arenaRequirementError(duel.arenaType, bot)) continue;
    if (duel.stakesType === 'POINTS' && bot.score < 150) continue;
    if (duel.stakesType === 'CREDITS' && botCredits < botHcp) continue;
    // Cautious bots refuse to gamble permanent component strength
    if (duel.stakesType === 'COMPONENTS' && profile.caution > 0.7) continue;

    // Strategic assessment: my arena handicap vs the posting's
    const botArenaHcp = calculateArenaHandicap(duel.arenaType, bot.tripsCompleted, bot.astrecsTraveled, bot.cargoDelivered, bot.rescuesPerformed, bot.battlesWon, bot.battlesLost);
    const posterArenaHcp = calculateArenaHandicap(duel.arenaType, duel.challenger.tripsCompleted, duel.challenger.astrecsTraveled, duel.challenger.cargoDelivered, duel.challenger.rescuesPerformed, duel.challenger.battlesWon, duel.challenger.battlesLost);
    const trueProb = estimateAccepterWinProb(botArenaHcp, posterArenaHcp);
    const perceived = perceivedWinProb(profile, trueProb, rng);
    if (perceived < threshold) continue;

    // Commit: accept then resolve (async fight against the poster's stored ship)
    const accepted = await acceptDuelChallenge(duel.id, characterId);
    if (!accepted.ok) continue;
    const resolved = await resolveDuel(duel.id, rng);
    if (!resolved.ok) continue;

    const r = resolved.resolution;
    const arena = ARENA_NAMES[duel.arenaType - 1] || 'Deep Space';
    if (r.draw) {
      return `${profile.name} dueled ${duel.challenger.name} to a draw in the ${arena} Arena`;
    }
    const wonByBot = r.winnerId === characterId;
    return wonByBot
      ? `${profile.name} accepted ${duel.challenger.name}'s ${arena} duel and WON (${r.winnerHits}-${r.loserHits})`
      : `${profile.name} accepted ${duel.challenger.name}'s ${arena} duel and lost (${r.loserHits}-${r.winnerHits})`;
  }

  return null;
}

// ============================================================================
// POST side — become a Contender
// ============================================================================

export async function botMaybePostDuel(
  characterId: string,
  profile: BotProfile,
  rng: RngFunction,
): Promise<string | null> {
  if (rng() > postChance(profile)) return null;

  const bot = await loadBot(characterId);
  if (!bot || !bot.ship) return null;
  if (calculateDuelHandicap(bot.ship) < 1) return null;

  // One Contender posting at a time (SP.ARENA1.S:70)
  const existing = await prisma.duelEntry.findFirst({ where: { challengerId: characterId, status: 'PENDING' } });
  if (existing) return null;

  const arenaType = chooseArenaLane(bot);
  const stakesType = chooseStakes(profile);
  const result = await createDuelChallenge(characterId, { stakesType, stakesAmount: 1, arenaType });
  if (!result.ok) return null;

  const arena = ARENA_NAMES[arenaType - 1] || 'Deep Space';
  return `${profile.name} posted a ${arena} Arena challenge (${stakesType.toLowerCase()} at stake)`;
}

/**
 * A bot's full arena turn: consider accepting an open posting, then maybe post one.
 * Returns human-readable notable events for the end-turn digest.
 */
export async function botArenaPhase(
  characterId: string,
  profile: BotProfile,
  rng: RngFunction = Math.random,
): Promise<string[]> {
  const events: string[] = [];
  const accepted = await botConsiderOpenDuels(characterId, profile, rng);
  if (accepted) events.push(accepted);
  const posted = await botMaybePostDuel(characterId, profile, rng);
  if (posted) events.push(posted);
  return events;
}
