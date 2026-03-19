/**
 * SpacerQuest v4.0 - Bot Decision Engine
 *
 * Evaluates bot state and returns prioritized actions for each trip.
 */

import { Character, Ship } from '@prisma/client';
import { BotProfile, BotAction, ComponentName, RngFunction } from './types.js';
import { getTotalCredits } from '../game/utils.js';
import { calculateFuelCost, calculateFuelCapacity } from '../game/systems/travel.js';
import { COMPONENT_PRICES, CORE_SYSTEMS, WOF_MAX_BET } from '../game/constants.js';
import { calculateUpgradeMultiplier } from '../game/systems/upgrades.js';
import { getFuelPrice } from '../game/systems/economy.js';
import { isEnhancedMode } from './config.js';

export interface BotState {
  character: Character & { ship: Ship | null };
  profile: BotProfile;
}

export interface TripPlan {
  portActions: PlannedAction[];
  destination: number;
  destinationReason: string;
}

export interface PlannedAction {
  type: 'REPAIR' | 'BUY_FUEL' | 'UPGRADE' | 'ACCEPT_CARGO' | 'GAMBLE' | 'PAY_FINE' | 'POST_BULLETIN' | 'MANAGE_PORT' | 'CHALLENGE_DUEL' | 'RESCUE_PLAYER';
  priority: number;
  detail: string;
}

/**
 * Plan port actions and destination for one trip.
 */
export function planTrip(
  state: BotState,
  rng: RngFunction = Math.random,
): TripPlan {
  const { character, profile } = state;
  const ship = character.ship!;
  const credits = getTotalCredits(character.creditsHigh, character.creditsLow);

  const portActions: PlannedAction[] = [];

  // 1. SURVIVAL — always first
  if (character.crimeType !== null) {
    portActions.push({ type: 'PAY_FINE', priority: 100, detail: 'Pay jail fine' });
  }

  if (needsRepair(ship)) {
    portActions.push({ type: 'REPAIR', priority: 90, detail: 'Repair damaged components' });
  }

  // Minimum fuel check — need fuel for at least 1 system hop
  const minFuel = calculateFuelCost(ship.driveStrength, ship.driveCondition, 1);
  if (ship.fuel < minFuel * 2) {
    portActions.push({ type: 'BUY_FUEL', priority: 85, detail: 'Emergency fuel purchase' });
  }

  // 2. UPGRADE — if cautious or upgrade-focused
  if (profile.caution > 0.5 || profile.upgradePriority > 0.6) {
    const upgradeAction = planUpgrade(state, credits);
    if (upgradeAction) {
      portActions.push(upgradeAction);
    }
  }

  // 3. ECONOMY
  // Cargo
  if (profile.tradeFocus > rng() && ship.maxCargoPods > 0 && character.cargoPods === 0) {
    portActions.push({ type: 'ACCEPT_CARGO', priority: 50, detail: 'Accept cargo contract' });
  }

  // Gambling
  if (profile.gamblingLust > rng() && credits > WOF_MAX_BET * 2) {
    portActions.push({ type: 'GAMBLE', priority: 30, detail: 'Wheel of Fortune' });
  }

  // Fuel top-up at cheap systems
  const cheapFuelSystems = [1, 8]; // Sun-3=8cr, Mira-9=4cr
  const fuelCapacity = calculateFuelCapacity(ship.hullStrength, ship.hullCondition);
  if (cheapFuelSystems.includes(character.currentSystem) && ship.fuel < fuelCapacity * 0.5) {
    portActions.push({ type: 'BUY_FUEL', priority: 40, detail: 'Cheap fuel top-up' });
  }

  // Enhanced Actions
  if (isEnhancedMode()) {
    // 5% chance to post bulletin if allied
    if (character.allianceSymbol !== 'NONE' && rng() < 0.05) {
      portActions.push({ type: 'POST_BULLETIN', priority: 15, detail: 'Post Alliance Bulletin' });
    }
    // Manage Port
    if (profile.greed > 0.6 && credits > 500000 && rng() < 0.1) {
      portActions.push({ type: 'MANAGE_PORT', priority: 25, detail: 'Purchase Port' });
    }
    // Arena duel
    if (profile.aggression > 0.7 && rng() < 0.05) {
      portActions.push({ type: 'CHALLENGE_DUEL', priority: 20, detail: 'Arena Duel' });
    }
    // Rescue
    if (profile.aggression <= 0.5 && ship.fuel >= 50 && rng() < 0.1) {
      portActions.push({ type: 'RESCUE_PLAYER', priority: 45, detail: 'Rescue Stranded Player' });
    }
  }

  // Sort by priority descending
  portActions.sort((a, b) => b.priority - a.priority);

  // 4. CHOOSE DESTINATION
  const destination = chooseDestination(state, rng);

  return {
    portActions,
    destination: destination.systemId,
    destinationReason: destination.reason,
  };
}

function needsRepair(ship: Ship): boolean {
  return ship.hullCondition === 0 ||
    ship.driveCondition === 0 ||
    ship.lifeSupportCondition === 0 ||
    ship.navigationCondition === 0 ||
    ship.weaponCondition < 3 ||
    ship.shieldCondition < 3;
}

function planUpgrade(state: BotState, credits: number): PlannedAction | null {
  const { profile, character } = state;
  const ship = character.ship!;

  // Cautious bots keep a credit reserve
  const reserve = profile.caution > 0.7 ? credits * 0.5 : credits * 0.2;
  const spendable = credits - reserve;

  const componentFieldMap: Record<ComponentName, string> = {
    HULL: 'hullStrength',
    DRIVES: 'driveStrength',
    CABIN: 'cabinStrength',
    LIFE_SUPPORT: 'lifeSupportStrength',
    WEAPONS: 'weaponStrength',
    NAVIGATION: 'navigationStrength',
    ROBOTICS: 'roboticsStrength',
    SHIELDS: 'shieldStrength',
  };

  for (const component of profile.upgradeOrder) {
    const field = componentFieldMap[component];
    const currentStr = ship[field as keyof Ship] as number;
    const basePrice = COMPONENT_PRICES[component as keyof typeof COMPONENT_PRICES];
    const multiplier = calculateUpgradeMultiplier(currentStr);
    const cost = multiplier * basePrice;

    if (cost <= spendable && currentStr < 200) {
      return {
        type: 'UPGRADE',
        priority: 60,
        detail: `Upgrade ${component} (${currentStr} → ${currentStr + 10}, cost ${cost})`,
      };
    }
  }

  return null;
}

function chooseDestination(
  state: BotState,
  rng: RngFunction,
): { systemId: number; reason: string } {
  const { character, profile } = state;
  const ship = character.ship!;

  // If carrying cargo, go to cargo destination
  if (character.cargoPods > 0 && character.destination > 0) {
    return { systemId: character.destination, reason: 'Cargo delivery' };
  }

  // Aggressive bots prefer rim systems (more encounters)
  if (profile.aggression > 0.7 && rng() < profile.aggression) {
    const rimSystem = Math.floor(rng() * 6) + 15; // 15-20
    if (canReach(ship, character.currentSystem, rimSystem)) {
      return { systemId: rimSystem, reason: 'Hunting in rim stars' };
    }
  }

  // Trade-focused bots prefer systems with good cargo
  if (profile.tradeFocus > 0.7 && rng() < profile.tradeFocus) {
    // Prefer cheap fuel systems to set up trade runs
    const tradeSystems = [1, 8, 14]; // Sun-3, Mira-9, Vega-6
    const target = tradeSystems[Math.floor(rng() * tradeSystems.length)];
    if (target !== character.currentSystem && canReach(ship, character.currentSystem, target)) {
      return { systemId: target, reason: 'Trade run' };
    }
  }

  // Default: random reachable core system
  const reachable = getReachableSystems(ship, character.currentSystem);
  if (reachable.length === 0) {
    // Can't go anywhere — stay put (will be handled by caller)
    return { systemId: character.currentSystem, reason: 'Stranded — no fuel' };
  }

  const idx = Math.floor(rng() * reachable.length);
  return { systemId: reachable[idx], reason: 'Exploring' };
}

function canReach(ship: Ship, origin: number, destination: number): boolean {
  const distance = Math.abs(destination - origin) || 1;
  const fuelNeeded = calculateFuelCost(ship.driveStrength, ship.driveCondition, distance);
  return ship.fuel >= fuelNeeded;
}

function getReachableSystems(ship: Ship, currentSystem: number): number[] {
  const systems: number[] = [];
  for (let i = 1; i <= CORE_SYSTEMS; i++) {
    if (i === currentSystem) continue;
    if (canReach(ship, currentSystem, i)) {
      systems.push(i);
    }
  }
  // Include rim systems if reachable
  for (let i = 15; i <= 20; i++) {
    if (i === currentSystem) continue;
    if (canReach(ship, currentSystem, i)) {
      systems.push(i);
    }
  }
  return systems;
}
