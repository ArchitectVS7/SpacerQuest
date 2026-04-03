/**
 * SpacerQuest v4.0 - Social Routes
 */

import { FastifyInstance } from 'fastify';
import { prisma } from '../../db/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { rescueBody, duelChallengeBody } from '../schemas.js';

export async function registerSocialRoutes(fastify: FastifyInstance) {
  // Get spacer directory
  fastify.get('/api/social/directory', async (_request, _reply) => {
    const spacers = await prisma.character.findMany({
      select: {
        spacerId: true,
        name: true,
        shipName: true,
        rank: true,
        allianceSymbol: true,
        score: true,
      },
      orderBy: { score: 'desc' },
      take: 100,
    });

    return {
      spacers: spacers.map(s => ({
        id: s.spacerId,
        name: s.name,
        shipName: s.shipName,
        rank: s.rank,
        alliance: s.allianceSymbol,
        score: s.score,
      })),
    };
  });

  // Get Top Gun rankings - Full category list from original
  fastify.get('/api/social/topgun', async (_request, _reply) => {
    const topgunSystem = await import('../../game/systems/topgun.js');
    return topgunSystem.getTopGunRankings();
  });

  // Get high score leaderboard
  fastify.get('/api/social/leaderboard', async (_request, _reply) => {
    const scores = await prisma.character.findMany({
      select: {
        name: true,
        score: true,
        rank: true,
      },
      orderBy: { score: 'desc' },
      take: 20,
    });

    return {
      scores: scores.map((s, i) => ({
        rank: i + 1,
        name: s.name,
        score: s.score,
        characterRank: s.rank,
      })),
    };
  });

  // Get battle log
  fastify.get('/api/social/battles', {
    preValidation: [requireAuth],
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };

    const character = await prisma.character.findFirst({ where: { userId } });

    if (!character) {
      return reply.status(404).send({ error: 'Character not found' });
    }

    const battles = await prisma.battleRecord.findMany({
      where: { characterId: character.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return { battles };
  });

  // List lost ships for rescue service
  fastify.get('/api/social/lost-ships', {
    preValidation: [requireAuth],
  }, async (_request, _reply) => {
    const lostShips = await prisma.character.findMany({
      where: { isLost: true },
      select: {
        id: true,
        name: true,
        shipName: true,
        lostLocation: true,
        updatedAt: true,
      },
    });

    return {
      lostShips: lostShips.map(s => ({
        id: s.id,
        name: s.name,
        shipName: s.shipName || 'unnamed',
        lostLocation: s.lostLocation,
        lostAt: s.updatedAt,
      })),
    };
  });

  // Perform rescue
  fastify.post('/api/economy/rescue', {
    preValidation: [requireAuth],
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const body = rescueBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.issues[0]?.message || 'Invalid input' });
    }
    const { targetId } = body.data;

    const rescuer = await prisma.character.findFirst({
      where: { userId },
      include: { ship: true },
    });

    if (!rescuer || !rescuer.ship) {
      return reply.status(400).send({ error: 'Character or ship not found' });
    }

    const { validateRescueAttempt, calculateRescueRewards } = await import('../../game/systems/rescue.js');
    const validation = validateRescueAttempt({
      fuel: rescuer.ship.fuel,
      isLost: rescuer.isLost,
    });

    if (!validation.canRescue) {
      return reply.status(400).send({ error: validation.reason });
    }

    const target = await prisma.character.findUnique({ where: { id: targetId } });
    if (!target || !target.isLost) {
      return reply.status(400).send({ error: 'Target is not lost in space' });
    }

    const rewards = calculateRescueRewards();

    const { addCredits } = await import('../../game/utils.js');

    // Update rescuer: +credits, -fuel, +score, +rescue count
    const { high, low } = addCredits(rescuer.creditsHigh, rescuer.creditsLow, rewards.creditsFee);
    await prisma.character.update({
      where: { id: rescuer.id },
      data: {
        creditsHigh: high,
        creditsLow: low,
        score: { increment: rewards.scoreBonus },
        rescuesPerformed: { increment: 1 },
      },
    });

    await prisma.ship.update({
      where: { id: rescuer.ship.id },
      data: { fuel: rescuer.ship.fuel - rewards.fuelCost },
    });

    // Update rescued character: no longer lost
    await prisma.character.update({
      where: { id: targetId },
      data: {
        isLost: false,
        lostLocation: null,
      },
    });

    // Log the rescue
    await prisma.gameLog.create({
      data: {
        type: 'RESCUE',
        characterId: rescuer.id,
        message: `${rescuer.name} rescued ${target.name} from near system ${target.lostLocation}`,
        metadata: {
          rescuerId: rescuer.id,
          targetId: target.id,
          location: target.lostLocation,
        },
      },
    });

    return {
      success: true,
      message: `Rescued ${target.name}! Salvage fee: ${rewards.creditsFee} cr`,
      rewards,
    };
  });

  // Challenge to duel
  fastify.post('/api/duel/challenge', {
    preValidation: [requireAuth],
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const body = duelChallengeBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.issues[0]?.message || 'Invalid input' });
    }
    const { targetId, stakesType, stakesAmount, arenaType } = body.data;

    const character = await prisma.character.findFirst({
      where: { userId },
      include: { ship: true },
    });

    if (!character || !character.ship) {
      return reply.status(400).send({ error: 'No ship found' });
    }

    // Same-alliance PvP protection: prevent targeting alliance members
    if (targetId) {
      const target = await prisma.character.findFirst({ where: { spacerId: targetId } });
      if (target && character.allianceSymbol !== 'NONE' && character.allianceSymbol === target.allianceSymbol) {
        return reply.status(400).send({ error: 'You cannot duel a member of your own alliance' });
      }
    }

    // Enforce arena requirements
    const { ARENA_REQUIREMENTS } = await import('../../game/constants.js');

    if (arenaType === 1 && character.tripsCompleted < ARENA_REQUIREMENTS.ION_CLOUD.trips) {
      return reply.status(400).send({ error: `Ion Cloud arena requires ${ARENA_REQUIREMENTS.ION_CLOUD.trips} trips completed` });
    }
    if (arenaType === 2 && character.astrecsTraveled < ARENA_REQUIREMENTS.PROTON_STORM.astrecs) {
      return reply.status(400).send({ error: `Proton Storm arena requires ${ARENA_REQUIREMENTS.PROTON_STORM.astrecs} astrecs traveled` });
    }
    if (arenaType === 3 && character.cargoDelivered < ARENA_REQUIREMENTS.COSMIC_RADIATION.cargo) {
      return reply.status(400).send({ error: `Cosmic Radiation arena requires ${ARENA_REQUIREMENTS.COSMIC_RADIATION.cargo} cargo deliveries` });
    }
    if (arenaType === 4 && character.rescuesPerformed < ARENA_REQUIREMENTS.BLACK_HOLE.rescues) {
      return reply.status(400).send({ error: `Black Hole arena requires ${ARENA_REQUIREMENTS.BLACK_HOLE.rescues} rescues` });
    }

    // SP.ARENA1.S line 70: pp=8 → "You are already a Contender" — reject if already has pending duel
    const existingChallenge = await prisma.duelEntry.findFirst({
      where: { challengerId: character.id, status: 'PENDING' },
    });
    if (existingChallenge) {
      return reply.status(400).send({ error: 'You are already a Contender' });
    }

    // Calculate handicap
    const h = character.ship.hullStrength * character.ship.hullCondition;
    const d = character.ship.driveStrength * character.ship.driveCondition;
    const c = character.ship.cabinStrength * character.ship.cabinCondition;
    const l = character.ship.lifeSupportStrength * character.ship.lifeSupportCondition;
    const w = character.ship.weaponStrength * character.ship.weaponCondition;
    const n = character.ship.navigationStrength * character.ship.navigationCondition;
    const r = character.ship.roboticsStrength * character.ship.roboticsCondition;
    const p = character.ship.shieldStrength * character.ship.shieldCondition;

    const handicap = Math.floor((h + d + c + l + w + n + r + p) / 500);

    // Must have adequate handicap (SP.ARENA1.S line 68: if h<1 → "Inadequate for dueling!")
    if (handicap < 1) {
      return reply.status(400).send({ error: `${character.shipName || character.name} Inadequate for dueling!` });
    }

    // Validate stakes for POINTS type (SP.ARENA1.S line 104: if s2<150 → "Not enough points!")
    if (stakesType === 'POINTS' && character.score < 150) {
      return reply.status(400).send({ error: 'Not enough points! (minimum 150 required)' });
    }

    // Validate ship has component strength for COMPONENTS type (SP.ARENA1.S line 96)
    if (stakesType === 'COMPONENTS') {
      const ship = character.ship!;
      const totalStr = ship.driveStrength + ship.cabinStrength + ship.lifeSupportStrength +
        ship.weaponStrength + ship.navigationStrength + ship.roboticsStrength + ship.shieldStrength;
      if (totalStr < 1) {
        return reply.status(400).send({ error: 'Ship has no component strength to wager' });
      }
    }

    // Deduct credits immediately for CREDITS type (SP.ARENA1.S line 152: if x4=3 g1=g1-h)
    if (stakesType === 'CREDITS') {
      const { getTotalCredits, subtractCredits } = await import('../../game/utils.js');
      if (getTotalCredits(character.creditsHigh, character.creditsLow) < handicap) {
        return reply.status(400).send({ error: 'Insufficient credits to post this duel' });
      }
      const result = subtractCredits(character.creditsHigh, character.creditsLow, handicap);
      await prisma.character.update({
        where: { id: character.id },
        data: { creditsHigh: result.high, creditsLow: result.low },
      });
    }

    // Create duel entry
    const duel = await prisma.duelEntry.create({
      data: {
        challengerId: character.id,
        contenderId: targetId ? String(targetId) : null,
        stakesType,
        stakesAmount,
        arenaType,
        handicap,
      },
    });

    return {
      success: true,
      duel: {
        id: duel.id,
        stakesType: duel.stakesType,
        stakesAmount: duel.stakesAmount,
        arenaType: duel.arenaType,
        handicap: duel.handicap,
        status: duel.status,
      },
    };
  });

  // Accept duel challenge
  fastify.post('/api/duel/accept/:duelId', {
    preValidation: [requireAuth],
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { duelId } = request.params as { duelId: string };

    const character = await prisma.character.findFirst({
      where: { userId },
      include: { ship: true },
    });

    if (!character || !character.ship) {
      return reply.status(400).send({ error: 'No ship found' });
    }

    const duel = await prisma.duelEntry.findUnique({
      where: { id: duelId },
      include: {
        challenger: { include: { ship: true } },
      },
    });

    if (!duel) {
      return reply.status(404).send({ error: 'Duel not found' });
    }

    if (duel.status !== 'PENDING') {
      return reply.status(400).send({ error: 'Duel is not pending' });
    }

    if (duel.contenderId && duel.contenderId !== character.id) {
      return reply.status(400).send({ error: 'This duel is not for you' });
    }

    // Same-alliance PvP protection
    if (character.allianceSymbol !== 'NONE' && character.allianceSymbol === duel.challenger.allianceSymbol) {
      return reply.status(400).send({ error: 'You cannot duel a member of your own alliance' });
    }

    // Can't challenge your own ship (iss2a, SP.ARENA2.S line 52)
    if (character.id === duel.challengerId) {
      return reply.status(400).send({ error: "Can't challenge own ship!" });
    }

    // SP.ARENA1.S line 72: pp=9 → "Only 1 challenge per visit"
    const existingAccepted = await prisma.duelEntry.findFirst({
      where: { contenderId: character.id, status: 'ACCEPTED' },
    });
    if (existingAccepted) {
      return reply.status(400).send({ error: 'Only 1 challenge per visit' });
    }

    const { calculateDuelHandicap, calculateArenaHandicap, ARENA_NAMES } = await import('../../game/systems/arena.js');
    const { getTotalCredits } = await import('../../game/utils.js');
    const { ARENA_REQUIREMENTS: areReqs } = await import('../../game/constants.js');

    // Accepter must meet arena requirements (chk subroutine, SP.ARENA2.S lines 146-152)
    const arenaType = duel.arenaType;
    if (arenaType === 1 && character.tripsCompleted < areReqs.ION_CLOUD.trips) {
      return reply.status(400).send({ error: `${ARENA_NAMES[0]} Arena Closed!...Need more space trips` });
    }
    if (arenaType === 2 && character.astrecsTraveled < areReqs.PROTON_STORM.astrecs) {
      return reply.status(400).send({ error: `${ARENA_NAMES[1]} Arena Closed!...Need more astrecs travelled` });
    }
    if (arenaType === 3 && character.cargoDelivered < areReqs.COSMIC_RADIATION.cargo) {
      return reply.status(400).send({ error: `${ARENA_NAMES[2]} Arena Closed!...Need more cargo delivered` });
    }
    if (arenaType === 4 && character.rescuesPerformed < areReqs.BLACK_HOLE.rescues) {
      return reply.status(400).send({ error: `${ARENA_NAMES[3]} Arena Closed!...Need more rescues` });
    }

    // Stakes-type validation for accepter (iss2a, SP.ARENA2.S lines 54-55)
    const accepterHandicap = calculateDuelHandicap(character.ship);
    if (duel.stakesType === 'POINTS' && character.score < 150) {
      return reply.status(400).send({ error: 'Need more total points (minimum 150)' });
    }
    if (duel.stakesType === 'CREDITS' && getTotalCredits(character.creditsHigh, character.creditsLow) < accepterHandicap) {
      return reply.status(400).send({ error: 'Insufficient credits to accept this duel' });
    }
    if (duel.stakesType === 'COMPONENTS') {
      const ship = character.ship;
      const totalStr = ship.driveStrength + ship.cabinStrength + ship.lifeSupportStrength +
        ship.weaponStrength + ship.navigationStrength + ship.roboticsStrength + ship.shieldStrength;
      if (totalStr < 1) {
        return reply.status(400).send({ error: 'Ship has no component strength to wager' });
      }
    }

    // Accepter must have adequate handicap (h<1 check, SP.ARENA1.S line 68)
    if (accepterHandicap < 1) {
      return reply.status(400).send({ error: `${character.shipName || character.name} Inadequate for dueling!` });
    }

    // Deduct credits from accepter immediately if CREDITS type (parallel to contender's deduction)
    if (duel.stakesType === 'CREDITS' || duel.stakesType === 'credits') {
      const { subtractCredits } = await import('../../game/utils.js');
      const result = subtractCredits(character.creditsHigh, character.creditsLow, accepterHandicap);
      if (!result.success) {
        return reply.status(400).send({ error: 'Insufficient credits to accept this duel' });
      }
      await prisma.character.update({
        where: { id: character.id },
        data: { creditsHigh: result.high, creditsLow: result.low },
      });
    }

    // Accept the duel
    await prisma.duelEntry.update({
      where: { id: duelId },
      data: {
        contenderId: character.id,
        status: 'ACCEPTED',
      },
    });

    return {
      success: true,
      message: 'Duel accepted! Prepare for combat.',
      duel: {
        id: duel.id,
        challenger: duel.challenger.name,
        contender: character.name,
        stakesType: duel.stakesType,
        stakesAmount: duel.stakesAmount,
        arenaType: duel.arenaType,
      },
    };
  });

  // Resolve duel (simulate combat)
  fastify.post('/api/duel/resolve/:duelId', {
    preValidation: [requireAuth],
  }, async (request, reply) => {
    const { duelId } = request.params as { duelId: string };

    const duel = await prisma.duelEntry.findUnique({
      where: { id: duelId },
      include: {
        challenger: { include: { ship: true } },
        contender: { include: { ship: true } },
      },
    });

    if (!duel || !duel.challenger.ship || !duel.contender?.ship) {
      return reply.status(404).send({ error: 'Duel not found or ships missing' });
    }

    if (duel.status !== 'ACCEPTED') {
      return reply.status(400).send({ error: 'Duel is not ready to resolve' });
    }

    const {
      calculateArenaHandicap,
      calculateDuelHandicap,
      simulateDuelCombat,
      calculateProportionalStakes,
    } = await import('../../game/systems/arena.js');

    // NOTE: DB naming is SWAPPED from original:
    //   duel.challenger = person who POSTED (original's Contender, bx side, "poster")
    //   duel.contender  = person who ACCEPTED (original's Challenger, cx side, "accepter")

    const posterShip = duel.challenger.ship;
    const accepterShip = duel.contender.ship;
    const poster = duel.challenger;
    const accepter = duel.contender;

    // Calculate arena handicaps for each player (afill, SP.ARENA2.S lines 154-161)
    const posterArenaHcp = calculateArenaHandicap(
      duel.arenaType,
      poster.tripsCompleted,
      poster.astrecsTraveled,
      poster.cargoDelivered,
      poster.rescuesPerformed,
      poster.battlesWon,
      poster.battlesLost
    );
    const accepterArenaHcp = calculateArenaHandicap(
      duel.arenaType,
      accepter.tripsCompleted,
      accepter.astrecsTraveled,
      accepter.cargoDelivered,
      accepter.rescuesPerformed,
      accepter.battlesWon,
      accepter.battlesLost
    );

    // Run 9-salvo combat (salv subroutine, SP.ARENA2.S lines 74-83)
    const combat = simulateDuelCombat(
      poster.shipName || poster.name,
      accepter.shipName || accepter.name,
      posterArenaHcp,
      accepterArenaHcp
    );

    // Handle draw: stakes cancelled (SP.ARENA2.S line 91)
    if (combat.isDraw) {
      await prisma.duelEntry.update({
        where: { id: duelId },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      await prisma.gameLog.create({
        data: {
          type: 'DUEL',
          message: `Duel Draw: ${poster.name} and ${accepter.name} — stakes cancelled`,
          metadata: { duelId, salvos: combat.salvos },
        },
      });
      return {
        success: true,
        result: {
          draw: true,
          salvos: combat.salvos,
          message: 'Battle a Draw!...stakes cancelled!',
        },
      };
    }

    // Determine winner: poster wins if posterHits > accepterHits
    const posterWon = combat.posterHits > combat.accepterHits;
    const winner = posterWon ? poster : accepter;
    const loser = posterWon ? accepter : poster;

    // Calculate proportional stakes (fini, SP.ARENA2.S lines 92-96)
    const posterHandicap = duel.handicap; // stored at post time (x2 in original)
    const accepterHandicap = calculateDuelHandicap(accepterShip);

    // Compute each player's stakes amount for proportional formula
    let posterStakes: number;
    let accepterStakes: number;
    if (duel.stakesType === 'POINTS') {
      // x3=((s2/h)/10) for poster; xo=((s2/h)/10) for accepter
      posterStakes = posterHandicap > 0 ? Math.max(1, Math.floor(poster.score / posterHandicap / 10)) : 1;
      accepterStakes = accepterHandicap > 0 ? Math.max(1, Math.floor(accepter.score / accepterHandicap / 10)) : 1;
    } else {
      // CREDITS / COMPONENTS: x3=h, xo=h (each stakes their own handicap)
      posterStakes = Math.max(1, posterHandicap);
      accepterStakes = Math.max(1, accepterHandicap);
    }

    const v = calculateProportionalStakes(posterHandicap, accepterHandicap, posterStakes, accepterStakes);

    // Update winner: +battlesWon, +10 score (s2=s2+10, SP.ARENA2.S line 105)
    await prisma.character.update({
      where: { id: winner.id },
      data: {
        battlesWon: { increment: 1 },
        score: { increment: 10 },
      },
    });

    // Update loser: +battlesLost
    await prisma.character.update({
      where: { id: loser.id },
      data: { battlesLost: { increment: 1 } },
    });

    // Apply stakes transfer (spo3 / compfx, SP.ARENA2.S lines 99-130)
    const { subtractCredits, addCredits } = await import('../../game/utils.js');

    if (duel.stakesType === 'CREDITS' || duel.stakesType === 'credits') {
      // Transfer v * 10,000 raw credits (v is in g1-units where 1 g1 = 10,000 cr)
      const creditTransfer = v * 10000;
      const loserResult = subtractCredits(loser.creditsHigh, loser.creditsLow, creditTransfer);
      if (loserResult.success) {
        const winnerResult = addCredits(winner.creditsHigh, winner.creditsLow, creditTransfer);
        await prisma.character.update({
          where: { id: loser.id },
          data: { creditsHigh: loserResult.high, creditsLow: loserResult.low },
        });
        await prisma.character.update({
          where: { id: winner.id },
          data: { creditsHigh: winnerResult.high, creditsLow: winnerResult.low },
        });
      }
    } else if (duel.stakesType === 'COMPONENTS' || duel.stakesType === 'components') {
      // compfx / cost (SP.ARENA2.S lines 117-139):
      //   For v iterations: pick random component 1-7 (drive..shield, no hull)
      //   Original cost: if m=1 j=j-1:k=k+1 / if m=0 j=j+1:k=k-1 (STRENGTH only, no condition)
      //   Winner's component strength +1; loser's component strength -1, clamped 0-199
      const componentStrKeys = [
        'driveStrength', 'cabinStrength', 'lifeSupportStrength',
        'weaponStrength', 'navigationStrength', 'roboticsStrength', 'shieldStrength',
      ] as const;

      const loserShip = loser.id === poster.id ? posterShip : accepterShip;
      const winnerShip = winner.id === poster.id ? posterShip : accepterShip;
      const loserShipUpdates: Record<string, number> = {};
      const winnerShipUpdates: Record<string, number> = {};
      let lastIdx = -1;

      // Original SP.ARENA2.S compfx (lines 118-129): iterate a=0..v times (no cap at 7)
      // r=7: pick 1-7, skip if same as last pick (x=y check), repeat for full v iterations
      for (let i = 0; i < v; i++) {
        // Original: if x=y goto cpfx (skip if same as last pick, not a full dedup)
        let idx: number;
        do { idx = Math.floor(Math.random() * componentStrKeys.length); }
        while (idx === lastIdx);
        lastIdx = idx;

        const strKey = componentStrKeys[idx];
        const loserShipRec = loserShip as unknown as Record<string, number>;
        const winnerShipRec = winnerShip as unknown as Record<string, number>;

        const loserStr = loserShipRec[strKey] ?? 0;
        loserShipUpdates[strKey] = Math.max(0, (loserShipUpdates[strKey] ?? loserStr) - 1);

        const winnerStr = winnerShipRec[strKey] ?? 0;
        winnerShipUpdates[strKey] = Math.min(199, (winnerShipUpdates[strKey] ?? winnerStr) + 1);
      }

      const loserShipId = loser.id === poster.id ? posterShip.id : accepterShip.id;
      const winnerShipId = winner.id === poster.id ? posterShip.id : accepterShip.id;
      if (Object.keys(loserShipUpdates).length > 0) {
        await prisma.ship.update({ where: { id: loserShipId }, data: loserShipUpdates });
      }
      if (Object.keys(winnerShipUpdates).length > 0) {
        await prisma.ship.update({ where: { id: winnerShipId }, data: winnerShipUpdates });
      }
    } else if (duel.stakesType === 'POINTS' || duel.stakesType === 'points') {
      // Transfer v score points: winner+v, loser-v (spo3 for points, SP.ARENA2.S lines 99, 112-115)
      await prisma.character.update({
        where: { id: winner.id },
        data: { score: { increment: v } },
      });
      await prisma.character.update({
        where: { id: loser.id },
        data: { score: { decrement: v } },
      });
    }

    // Mark duel as completed
    await prisma.duelEntry.update({
      where: { id: duelId },
      data: {
        status: 'COMPLETED',
        result: posterWon ? 'VICTORY' : 'DEFEAT',
        completedAt: new Date(),
      },
    });

    // Log the duel (dlog, SP.ARENA2.S lines 106-109)
    await prisma.gameLog.create({
      data: {
        type: 'DUEL',
        message: `Duel: ${winner.name} [${posterWon ? combat.posterHits : combat.accepterHits}] beats ${loser.name} [${posterWon ? combat.accepterHits : combat.posterHits}]`,
        metadata: {
          duelId,
          winnerId: winner.id,
          loserId: loser.id,
          stakesType: duel.stakesType,
          stakesTransferred: v,
          salvos: combat.salvos,
        },
      },
    });

    return {
      success: true,
      result: {
        winner: winner.name,
        loser: loser.name,
        winnerHits: posterWon ? combat.posterHits : combat.accepterHits,
        loserHits: posterWon ? combat.accepterHits : combat.posterHits,
        stakesTransferred: v,
        salvos: combat.salvos,
      },
    };
  });
}
