/**
 * SpacerQuest v4.0 - Bot Turn Execution
 *
 * Executes a single bot's full turn: port actions + 3 trips.
 * Bots travel instantly (no TravelState records).
 */

import { prisma } from '../db/prisma.js';
import { BotProfile, BotAction, BotTurnResult, RngFunction } from './types.js';
import { planTrip } from './decision-engine.js';
import { resolveBotCombat } from './bot-combat.js';
import {
  botRepair,
  botBuyFuel,
  botUpgrade,
  botAcceptCargo,
  botDeliverCargo,
  botPayFine,
  botJoinAlliance,
  botInvestAlliance,
  botPostBail,
  botPostBulletin,
  botManagePort,
  botChallengeDuel,
  botRescuePlayer,
} from './bot-actions.js';
import { calculateFuelCost } from '../game/systems/travel.js';
import { completeTravel } from '../game/systems/travel.js';
import { generateEncounter } from '../game/systems/combat.js';
import { calculateDistance } from '../game/utils.js';

const TRIPS_PER_TURN = 3;

export async function executeBotTurn(
  characterId: string,
  profile: BotProfile,
  rng: RngFunction = Math.random,
): Promise<BotTurnResult> {
  const result: BotTurnResult = {
    characterId,
    botName: profile.name,
    actions: [],
    creditsEarned: 0,
    creditsSpent: 0,
    battlesWon: 0,
    battlesLost: 0,
    tripsCompleted: 0,
    notableEvents: [],
  };

  // Reset trip count for this bot's turn
  await prisma.character.update({
    where: { id: characterId },
    data: { tripCount: 0 },
  });

  for (let trip = 0; trip < TRIPS_PER_TURN; trip++) {
    // Reload character state each trip (state changes between trips)
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true },
    });

    if (!character || !character.ship) break;

    const state = { character: { ...character, ship: character.ship }, profile };
    const plan = planTrip(state, rng);

    // Execute port actions
    for (const action of plan.portActions) {
      const executed = await executePortAction(characterId, profile, action.type);
      if (executed) {
        result.actions.push(executed);
        if (executed.creditsSpent) result.creditsSpent += executed.creditsSpent;
        if (executed.creditsEarned) result.creditsEarned += executed.creditsEarned;
      }
    }

    // Skip travel if destination is current location (stranded)
    if (plan.destination === character.currentSystem) continue;

    // Reload after port actions
    const updated = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true },
    });
    if (!updated || !updated.ship) break;

    // Calculate and deduct fuel
    const distance = calculateDistance(updated.currentSystem, plan.destination);
    const fuelCost = calculateFuelCost(updated.ship.driveStrength, updated.ship.driveCondition, distance);

    if (updated.ship.fuel < fuelCost) continue; // Can't afford this trip

    // Deduct fuel directly (bots skip TravelState)
    await prisma.ship.update({
      where: { id: updated.ship.id },
      data: { fuel: updated.ship.fuel - fuelCost },
    });

    // Increment trip count and astrecs
    await prisma.character.update({
      where: { id: characterId },
      data: {
        tripCount: { increment: 1 },
        astrecsTraveled: { increment: distance },
        lastTripDate: new Date(),
      },
    });

    // Generate encounter during travel
    const enemy = await generateEncounter(
      updated.currentSystem,
      updated.missionType,
      0, // playerPower not used by generateEncounter
    );

    if (enemy) {
      // Re-fetch with latest ship state for combat
      const combatChar = await prisma.character.findUnique({
        where: { id: characterId },
        include: { ship: true },
      });

      if (combatChar && combatChar.ship) {
        const combatResult = await resolveBotCombat(
          { ...combatChar, ship: combatChar.ship },
          profile,
          enemy,
          rng,
        );

        result.actions.push(...combatResult.actions);
        result.creditsEarned += combatResult.creditsEarned;
        result.creditsSpent += combatResult.creditsLost;
        if (combatResult.result === 'VICTORY') result.battlesWon++;
        if (combatResult.result === 'DEFEAT' || combatResult.result === 'SURRENDER') result.battlesLost++;
        if (combatResult.event) result.notableEvents.push(combatResult.event);
      }
    }

    // Complete travel (update position, increment stats)
    await completeTravel(characterId, plan.destination);
    result.tripsCompleted++;

    // Deliver cargo if at destination
    const postTravel = await prisma.character.findUnique({ where: { id: characterId } });
    if (postTravel && postTravel.cargoPods > 0 && postTravel.currentSystem === postTravel.destination) {
      const deliveryAction = await botDeliverCargo(characterId);
      if (deliveryAction) {
        result.actions.push(deliveryAction);
        if (deliveryAction.creditsEarned) result.creditsEarned += deliveryAction.creditsEarned;
        result.notableEvents.push(deliveryAction.detail);
      }
    }
  }

  // Post-turn: alliance actions (once per turn)
  const allianceAction = await botJoinAlliance(characterId, profile.preferredAlliance);
  if (allianceAction) {
    result.actions.push(allianceAction);
    result.notableEvents.push(allianceAction.detail);
  }

  // Invest in alliance if loyal enough
  if (profile.caution > 0.5 && rng() < 0.3) {
    const investAction = await botInvestAlliance(characterId, profile);
    if (investAction) {
      result.actions.push(investAction);
      if (investAction.creditsSpent) result.creditsSpent += investAction.creditsSpent;
    }
  }

  // Occasionally bail out another player if rich and generous
  if (rng() < 0.1) {
    const bailAction = await botPostBail(characterId, profile);
    if (bailAction) {
      result.actions.push(bailAction);
      if (bailAction.creditsSpent) result.creditsSpent += bailAction.creditsSpent;
      result.notableEvents.push(bailAction.detail);
    }
  }

  return result;
}

async function executePortAction(
  characterId: string,
  profile: BotProfile,
  actionType: string,
): Promise<BotAction | null> {
  switch (actionType) {
    case 'REPAIR':
      return botRepair(characterId);
    case 'BUY_FUEL':
      return botBuyFuel(characterId);
    case 'UPGRADE':
      return botUpgrade(characterId, profile);
    case 'ACCEPT_CARGO': {
      const cargoResult = await botAcceptCargo(characterId);
      return cargoResult?.action || null;
    }
    case 'PAY_FINE':
      return botPayFine(characterId);
    case 'POST_BULLETIN':
      return botPostBulletin(characterId, profile);
    case 'MANAGE_PORT':
      return botManagePort(characterId, profile);
    case 'CHALLENGE_DUEL':
      return botChallengeDuel(characterId, profile);
    case 'RESCUE_PLAYER':
      return botRescuePlayer(characterId, profile);
    default:
      return null;
  }
}
