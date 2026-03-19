/**
 * SpacerQuest v4.0 - Bot Action Executors
 *
 * Wraps existing game systems for bot use. Each function performs
 * a single game action on behalf of a bot character.
 */

import { Character, Ship, AllianceType } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { BotProfile, BotAction, ComponentName } from './types.js';
import { getTotalCredits, addCredits, subtractCredits } from '../game/utils.js';
import { calculateFuelCost, calculateFuelCapacity } from '../game/systems/travel.js';
import { getFuelPrice, generateCargoContract, calculateCargoPayment, CargoContract } from '../game/systems/economy.js';
import { upgradeShipComponent } from '../game/systems/upgrades.js';
import { repairAllComponents } from '../game/systems/repairs.js';
import { calculateBailCost, releasePlayer, CrimeType } from '../game/systems/jail.js';
import { CRIME_FINE_SMUGGLING, CRIME_FINE_CARRIER, CRIME_FINE_CONDUCT, RESCUE_FUEL_COST, RESCUE_FEE, RESCUE_POINTS_BONUS } from '../game/constants.js';
import { formatBulletinPost } from '../game/systems/bulletin-board.js';
import { buyPort } from '../game/systems/port-ownership.js';

/**
 * Repair all damaged components.
 */
export async function botRepair(characterId: string): Promise<BotAction | null> {
  const result = await repairAllComponents(characterId);
  if (!result.success) return null;

  return {
    type: 'REPAIR',
    detail: `Repaired all components (${result.cost} cr)`,
    creditsSpent: result.cost,
  };
}

/**
 * Buy fuel up to capacity (or as much as affordable).
 */
export async function botBuyFuel(characterId: string): Promise<BotAction | null> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { ship: true },
  });
  if (!character || !character.ship) return null;

  const ship = character.ship;
  const capacity = calculateFuelCapacity(ship.hullStrength, ship.hullCondition);
  const needed = capacity - ship.fuel;
  if (needed <= 0) return null;

  const price = getFuelPrice(character.currentSystem);
  const credits = getTotalCredits(character.creditsHigh, character.creditsLow);
  const affordable = Math.floor(credits / price);
  const unitsToBuy = Math.min(needed, affordable);
  if (unitsToBuy <= 0) return null;

  const cost = unitsToBuy * price;
  const newCredits = subtractCredits(character.creditsHigh, character.creditsLow, cost);
  if (!newCredits.success) return null;

  await prisma.$transaction([
    prisma.ship.update({
      where: { id: ship.id },
      data: { fuel: ship.fuel + unitsToBuy },
    }),
    prisma.character.update({
      where: { id: characterId },
      data: { creditsHigh: newCredits.high, creditsLow: newCredits.low },
    }),
  ]);

  return {
    type: 'BUY_FUEL',
    detail: `Bought ${unitsToBuy} fuel at ${price} cr/unit`,
    creditsSpent: cost,
  };
}

/**
 * Upgrade the highest-priority affordable component.
 */
export async function botUpgrade(characterId: string, profile: BotProfile): Promise<BotAction | null> {
  for (const component of profile.upgradeOrder) {
    const result = await upgradeShipComponent(characterId, component, 'STRENGTH');
    if (result.success) {
      return {
        type: 'UPGRADE',
        detail: `Upgraded ${component} (+10 STR, ${result.cost} cr)`,
        creditsSpent: result.cost,
      };
    }
  }
  return null;
}

/**
 * Accept a cargo contract at current system.
 */
export async function botAcceptCargo(characterId: string): Promise<{ action: BotAction; contract: CargoContract } | null> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { ship: true },
  });
  if (!character || !character.ship) return null;
  if (character.cargoPods > 0) return null; // Already carrying cargo

  const pods = Math.min(character.ship.maxCargoPods, 10); // Reasonable cargo load
  if (pods <= 0) return null;

  const contract = generateCargoContract(character.currentSystem, pods);

  await prisma.character.update({
    where: { id: characterId },
    data: {
      cargoPods: contract.pods,
      cargoType: contract.cargoType,
      cargoPayment: contract.payment,
      destination: contract.destination,
      cargoManifest: contract.description,
    },
  });

  return {
    action: {
      type: 'ACCEPT_CARGO',
      detail: `Loaded ${contract.pods} pods of ${contract.description} → System ${contract.destination}`,
    },
    contract,
  };
}

/**
 * Deliver cargo if at destination.
 */
export async function botDeliverCargo(characterId: string): Promise<BotAction | null> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
  });
  if (!character || character.cargoPods === 0) return null;

  const contract: CargoContract = {
    pods: character.cargoPods,
    cargoType: character.cargoType,
    origin: 0,
    destination: character.destination,
    payment: character.cargoPayment,
    description: character.cargoManifest || 'Cargo',
  };

  const result = calculateCargoPayment(contract, character.currentSystem);

  const newCredits = addCredits(character.creditsHigh, character.creditsLow, result.total);

  await prisma.character.update({
    where: { id: characterId },
    data: {
      creditsHigh: newCredits.high,
      creditsLow: newCredits.low,
      cargoPods: 0,
      cargoType: 0,
      cargoPayment: 0,
      destination: 0,
      cargoManifest: null,
      cargoDelivered: { increment: contract.pods },
      score: { increment: 2 },
    },
  });

  return {
    type: 'DELIVER_CARGO',
    detail: `Delivered ${contract.pods} pods for ${result.total} cr`,
    creditsEarned: result.total,
  };
}

/**
 * Pay jail fine if imprisoned.
 */
export async function botPayFine(characterId: string): Promise<BotAction | null> {
  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character || character.crimeType === null) return null;

  const fineMap: Record<number, number> = {
    5: CRIME_FINE_SMUGGLING,
    6: CRIME_FINE_CARRIER,
    7: CRIME_FINE_CONDUCT,
  };
  const fine = fineMap[character.crimeType] || 1000;

  const credits = getTotalCredits(character.creditsHigh, character.creditsLow);
  if (credits < fine) return null;

  const newCredits = subtractCredits(character.creditsHigh, character.creditsLow, fine);
  if (!newCredits.success) return null;

  await prisma.character.update({
    where: { id: characterId },
    data: {
      crimeType: null,
      creditsHigh: newCredits.high,
      creditsLow: newCredits.low,
    },
  });

  return {
    type: 'PAY_FINE',
    detail: `Paid ${fine} cr fine`,
    creditsSpent: fine,
  };
}

/**
 * Join preferred alliance if not already a member.
 */
export async function botJoinAlliance(characterId: string, preferredAlliance: AllianceType): Promise<BotAction | null> {
  if (preferredAlliance === AllianceType.NONE) return null;

  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character) return null;
  if (character.allianceSymbol !== AllianceType.NONE) return null; // Already in one
  if (character.score < 50) return null; // Needs some experience

  await prisma.character.update({
    where: { id: characterId },
    data: { allianceSymbol: preferredAlliance },
  });

  await prisma.allianceMembership.upsert({
    where: { characterId },
    update: { alliance: preferredAlliance },
    create: { characterId, alliance: preferredAlliance },
  });

  return {
    type: 'JOIN_ALLIANCE',
    detail: `Joined ${preferredAlliance}`,
  };
}

/**
 * Invest credits in alliance.
 */
export async function botInvestAlliance(characterId: string, profile: BotProfile): Promise<BotAction | null> {
  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character || character.allianceSymbol === AllianceType.NONE) return null;

  const credits = getTotalCredits(character.creditsHigh, character.creditsLow);
  if (credits < 10000) return null;

  // Invest 10% of credits
  const investment = Math.min(Math.floor(credits * 0.1), 50000);
  const newCredits = subtractCredits(character.creditsHigh, character.creditsLow, investment);
  if (!newCredits.success) return null;

  const membership = await prisma.allianceMembership.findUnique({ where: { characterId } });
  if (!membership) return null;

  const investCredits = addCredits(membership.creditsHigh, membership.creditsLow, investment);

  await prisma.$transaction([
    prisma.character.update({
      where: { id: characterId },
      data: { creditsHigh: newCredits.high, creditsLow: newCredits.low },
    }),
    prisma.allianceMembership.update({
      where: { characterId },
      data: { creditsHigh: investCredits.high, creditsLow: investCredits.low },
    }),
  ]);

  return {
    type: 'INVEST_ALLIANCE',
    detail: `Invested ${investment} cr in ${character.allianceSymbol}`,
    creditsSpent: investment,
  };
}

/**
 * Occasionally bail out another player if rich and generous
 */
export async function botPostBail(characterId: string, profile: BotProfile): Promise<BotAction | null> {
  const caller = await prisma.character.findUnique({ where: { id: characterId } });
  if (!caller) return null;

  // Only generous or wealthy bots
  const credits = getTotalCredits(caller.creditsHigh, caller.creditsLow);
  if (credits < 50000) return null; // Needs plenty of spare cash
  if (profile.aggression > 0.8) return null; // Mean bots don't post bail

  // Find a jailed character
  const jailed = await prisma.character.findFirst({
    where: { crimeType: { not: null } },
    orderBy: { score: 'desc' }, // Bail out high score players first
  });

  if (!jailed) return null;

  const bailCost = calculateBailCost(jailed.crimeType as unknown as CrimeType);
  if (credits < bailCost * 2) return null; // Need double the bail to feel safe

  const newCredits = subtractCredits(caller.creditsHigh, caller.creditsLow, bailCost);
  if (!newCredits.success) return null;

  const releasedName = releasePlayer(jailed.name);

  await prisma.$transaction([
    prisma.character.update({
      where: { id: caller.id },
      data: { creditsHigh: newCredits.high, creditsLow: newCredits.low },
    }),
    prisma.character.update({
      where: { id: jailed.id },
      data: { crimeType: null, name: releasedName },
    }),
  ]);

  return {
    type: 'POST_BAIL',
    detail: `Posted ${bailCost} cr bail for ${releasedName}`,
    creditsSpent: bailCost,
  };
}

// ============================================================================
// ENHANCED BOT ACTIONS (Gated by BOT_ENHANCED)
// ============================================================================

/**
 * Post a message to the alliance bulletin board (Enhanced)
 */
export async function botPostBulletin(characterId: string, _profile: BotProfile): Promise<BotAction | null> {
  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character || character.allianceSymbol === 'NONE') return null;

  const msgs = [
    // --- Scans & Recon ---
    `Scouting new systems in Sector ${Math.floor(Math.random() * 14) + 1}.`,
    'Deep space scans indicate unusual radiation pockets near the rim.',
    'Patrols report all clear in the inner core systems.',
    'Hostile activity spotted near Sector 8. Keep your shields up.',
    'Does anyone have updated charts for the Black Hole proximity?',
    'Sensor ghosts reported near Mira-9. Could be pirates running silent.',
    'Just cleared a Pirate blockade at Vega-6. You\'re welcome.',
    'Avoid Fomalhaut-7 unless your navigation is freshly repaired.',
    'Tracking a large Ion Cloud moving through the central trade lanes.',

    // --- Economy & Trade ---
    'Looking to buy high quality Titanium ore at a premium.',
    'Forming up for a trade run to the Rim, watch your six.',
    'Port fees are ridiculous lately. Who owns Sun-3?',
    'Capellan Herbals are finally dropping in price. Stock up now.',
    'If anyone has surplus Raw Dilithium, contact me for a private contract.',
    'Whoever bought out all the Mizarian Liquor before I got there: I will find you.',
    'Running Contraband is getting harder. Too many patrols.',
    'Just secured a massive cargo contract payload. Drinks are on me at the pub.',
    'Does the Space Registry ever restock ship components? Everything is sold out!',
    'Sitting on 15 pods of Titanium. Best offer takes it.',

    // --- Combat & Aggression ---
    'To the coward who ran from me yesterday: I memorized your drive signature.',
    'Anyone else think the Star Patrol is getting a bit too twitchy lately?',
    'Lost 4 shield generators to a stray missile. Need a safe port to repair.',
    'Dueling arena is empty. Is everyone afraid to lose their credits?',
    'Surrendered 10,000 credits to a pirate flagship today. Rough cycle.',
    'Morton\'s Cloaker saved my ship today. Best investment I ever made.',
    'Who is hunting near Polaris? Keep finding debris fields.',
    'Warlord Confed ships spotted harassing merchants. Stay frosty.',
    'Just scored a major victory against a Class Z Pirate. The loot was incredible.',
    'My weapons array is reading 110% efficiency. Ready for anything.',

    // --- Lore & Flavor ---
    'The stars are cold, but the plasma burns hot.',
    'Remember the old Earth saying: "Never fly without rebuy." Wait, wrong millennium.',
    'I swear I saw an active Warp gate out near the edge. Probably just hull-fatigue hallucinations.',
    'Another day, another parsec.',
    'Just paid off my ship loan. Finally flying free.',
    'Has anyone actually beaten the Grand Mufti in a fair fight?',
    'The Sage at the pub keeps talking in riddles. Is he actually helpful?',
    'Lost a comrade in the Proton Storms. Pour one out for a good pilot.',
    'Do the Astro League boys ever do anything besides polish their badges?',
    'Rebel Alliance recruiters are getting aggressive at the docks.',
    
    // --- Ship Maintenance ---
    'Auto-Repair Module is a life saver. Don\'t leave orbit without one.',
    'Anyone know a good mechanic? My navigation keeps pulling to starboard.',
    'Is a Titanium Hull worth the weight? Taking suggestions.',
    'Upgraded to a Trans-Warp Accelerator. Eat my spacedust.',
    `Ship condition holding steady at ${Math.floor(Math.random() * 50 + 50)}%.`,
    'Just spent half a million credits on drive upgrades. Worth every penny.',
    'Robotics systems are glitching again. The loading bots won\'t stop dancing.',
    'Warning: Counterfeit shielding modules being sold at Rim ports.',

    // --- Generic / Status ---
    'Logging off for the sleep cycle. Docked and secure.',
    'Does anyone else hear a low humming noise coming from their life support?',
    'Looking for a reliable wingman for some heavy hazard runs.',
    'Out of fuel, out of luck. Can someone send a tow?',
    'Bailed out a rookie from the local holding cell. Pay it forward.',
    'May your drives stay cool and your weapons stay hot.',
    'First one to 100,000 score points buys the whole pub a round.',
    'Signing off. See you all in the void.'
  ];
  const msg = msgs[Math.floor(Math.random() * msgs.length)];
  const formatted = formatBulletinPost(character.name, msg);

  await prisma.bulletinPost.create({
    data: {
      alliance: character.allianceSymbol,
      authorName: character.name,
      characterId: character.id,
      message: formatted,
    }
  });

  return { type: 'POST_BULLETIN', detail: 'Posted to alliance board', creditsSpent: 0 };
}

/**
 * Purchase an available port (Enhanced)
 */
export async function botManagePort(characterId: string, profile: BotProfile): Promise<BotAction | null> {
  // Only wealthy/investor bots buy ports
  if (profile.greed < 0.6) return null;
  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character) return null;
  
  const total = getTotalCredits(character.creditsHigh, character.creditsLow);
  if (total < 500000) return null;

  const res = await buyPort(characterId, character.currentSystem);
  if (res.success) {
    return { type: 'MANAGE_PORT', detail: `Purchased Port ${character.currentSystem}`, creditsSpent: 500000 };
  }
  return null;
}

/**
 * Challenge to a duel in the arena (Enhanced)
 */
export async function botChallengeDuel(characterId: string, profile: BotProfile): Promise<BotAction | null> {
  if (profile.aggression < 0.7) return null;
  const character = await prisma.character.findUnique({ where: { id: characterId }, include: { ship: true } });
  if (!character || !character.ship) return null;

  // Don't spam duels, check if one already exists
  const existing = await prisma.duelEntry.findFirst({ where: { challengerId: characterId, status: 'PENDING' } });
  if (existing) return null;

  const stakesAmount = 1000 + Math.floor(Math.random() * 4000);

  await prisma.duelEntry.create({
    data: {
      challengerId: character.id,
      stakesType: 'Credits',
      stakesAmount,
      arenaType: 6, // Deep Space
      handicap: 0,
    }
  });

  return { type: 'CHALLENGE_DUEL', detail: 'Posted Arena Duel Challenge' };
}

/**
 * Rescue a stranded player (Enhanced)
 */
export async function botRescuePlayer(characterId: string, profile: BotProfile): Promise<BotAction | null> {
  // Generous / non-aggressive bots do rescues
  if (profile.aggression > 0.5) return null;
  const rescuer = await prisma.character.findUnique({ where: { id: characterId }, include: { ship: true } });
  if (!rescuer || !rescuer.ship || rescuer.ship.fuel < RESCUE_FUEL_COST) return null;

  // Find a lost player
  const lostPlayer = await prisma.character.findFirst({
    where: { isBot: false, ship: { fuel: 0 }, updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    include: { ship: true }
  });
  if (!lostPlayer || !lostPlayer.ship) return null;

  // Execute rescue
  const newCredits = addCredits(rescuer.creditsHigh, rescuer.creditsLow, RESCUE_FEE);
  await prisma.$transaction([
    prisma.ship.update({ where: { id: rescuer.ship.id }, data: { fuel: rescuer.ship.fuel - RESCUE_FUEL_COST } }),
    prisma.character.update({ 
      where: { id: rescuer.id }, 
      data: { score: rescuer.score + RESCUE_POINTS_BONUS, creditsHigh: newCredits.high, creditsLow: newCredits.low }
    }),
    prisma.ship.update({ where: { id: lostPlayer.ship.id }, data: { fuel: 10 } }),
    prisma.gameLog.create({ 
      data: { 
        type: 'SYSTEM', 
        message: `${rescuer.name} rescued ${lostPlayer.name} with an emergency fuel tow!`, 
        characterId: lostPlayer.id 
      } 
    })
  ]);

  return { type: 'RESCUE_PLAYER', detail: `Rescued ${lostPlayer.name}`, creditsEarned: RESCUE_FEE };
}
