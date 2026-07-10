import {
  ANONYMOUS_INTERCEPTORS,
  AnonymousInterceptorKind,
  NPC_PROFILES,
  ROUTE_DANGER_CHANCE,
  RouteDangerLevel,
  SYSTEM_DANGER_LEVELS,
  distance as systemDistance,
  Stat,
} from '@spacerquest/content';
import {
  EncounterInterceptorState,
  EncounterState,
  GameEvent,
  GameState,
  PlayerAction,
} from '../types.js';
import { SeededRng } from '../rng.js';
import { check, spendDie } from '../dice.js';

function clampDanger(value: number): RouteDangerLevel {
  return Math.max(1, Math.min(5, value)) as RouteDangerLevel;
}

function routeKind(origin: number, destination: number): 'core' | 'rim' | 'andromeda' | 'special' {
  if (origin >= 27 || destination >= 27) return 'special';
  if ((origin >= 21 && origin <= 26) || (destination >= 21 && destination <= 26)) {
    return 'andromeda';
  }
  if ((origin >= 15 && origin <= 20) || (destination >= 15 && destination <= 20)) {
    return 'rim';
  }
  return 'core';
}

function allowedAnonymousKinds(origin: number, destination: number): AnonymousInterceptorKind[] {
  const kind = routeKind(origin, destination);
  if (kind === 'core') return ['PIRATE', 'PATROL', 'BRIGAND'];
  if (kind === 'rim') return ['RIM_PIRATE', 'PIRATE', 'BRIGAND'];
  if (kind === 'andromeda') return ['REPTILOID'];
  return ['PIRATE', 'PATROL', 'RIM_PIRATE', 'BRIGAND', 'REPTILOID'];
}

export function calculateRouteDanger(
  state: GameState,
  origin: number,
  destination: number,
): {
  routeDistance: number;
  routeDangerLevel: RouteDangerLevel;
  routeDangerChance: number;
} {
  const routeDistance = systemDistance(origin, destination);
  const baseDanger = Math.max(
    SYSTEM_DANGER_LEVELS[origin] ?? 1,
    SYSTEM_DANGER_LEVELS[destination] ?? 1,
  );
  const distanceBump = routeDistance >= 8 ? 1 : 0;
  const cargoBump = state.player.activeContract?.destination === destination ? 1 : 0;
  const routeDangerLevel = clampDanger(baseDanger + distanceBump + cargoBump);
  return {
    routeDistance,
    routeDangerLevel,
    routeDangerChance: ROUTE_DANGER_CHANCE[routeDangerLevel],
  };
}

function chooseTargetTier(
  rng: SeededRng,
  playerTier: number,
  routeDangerLevel: RouteDangerLevel,
): RouteDangerLevel {
  const minTier = Math.max(1, playerTier - 1);
  const maxTier = Math.min(5, playerTier + 1);
  const lowBias = Math.max(0, 3 - routeDangerLevel);
  const highBias = Math.max(0, routeDangerLevel - 3);
  const weightedTiers: { tier: RouteDangerLevel; weight: number }[] = [];
  let totalWeight = 0;

  for (let tier = minTier; tier <= maxTier; tier += 1) {
    const weight = 1 + lowBias * (maxTier - tier) + highBias * (tier - minTier);
    weightedTiers.push({ tier: tier as RouteDangerLevel, weight });
    totalWeight += weight;
  }

  let roll = rng.next() * totalWeight;
  for (const weightedTier of weightedTiers) {
    roll -= weightedTier.weight;
    if (roll < 0) {
      return weightedTier.tier;
    }
  }

  const finalTier = weightedTiers[weightedTiers.length - 1];
  if (!finalTier) {
    throw new Error('No tier available for encounter selection');
  }
  return finalTier.tier;
}

function buildNamedCandidates(
  state: GameState,
  tier: RouteDangerLevel,
): EncounterInterceptorState[] {
  return state.npcs.flatMap((npc) => {
    const profile = NPC_PROFILES.find((candidate) => candidate.id === npc.profileId);
    if (!profile || profile.tier !== tier) return [];
    return [
      {
        id: npc.id,
        source: 'named' as const,
        name: npc.name,
        shipName: profile.shipName,
        profileId: profile.id,
        stats: profile.stats,
        tier: profile.tier,
        flaw: profile.flaw,
        flawDc: profile.flawDc,
      },
    ];
  });
}

function buildAnonymousCandidates(
  origin: number,
  destination: number,
  tier: RouteDangerLevel,
): EncounterInterceptorState[] {
  const kinds = allowedAnonymousKinds(origin, destination);
  return ANONYMOUS_INTERCEPTORS.filter(
    (interceptor) => interceptor.tier === tier && kinds.includes(interceptor.kind),
  ).map((interceptor) => ({
    id: interceptor.id,
    source: 'anonymous' as const,
    name: interceptor.name,
    shipName: interceptor.shipName,
    shipClass: interceptor.shipClass,
    homeSystem: interceptor.homeSystem,
    kind: interceptor.kind,
    rosterIndex: interceptor.rosterIndex,
    stats: interceptor.stats,
    tier: interceptor.tier,
  }));
}

function chooseOne<T>(rng: SeededRng, candidates: T[]): T {
  if (candidates.length === 0) {
    throw new Error('Cannot choose from an empty encounter candidate list');
  }
  const candidate = candidates[Math.floor(rng.next() * candidates.length)];
  if (candidate === undefined) {
    throw new Error('Encounter candidate selection failed');
  }
  return candidate;
}

export function selectEncounterInterceptor(
  state: GameState,
  origin: number,
  destination: number,
  routeDangerLevel: RouteDangerLevel,
  rng: SeededRng,
): EncounterInterceptorState {
  const playerTier = state.player.tier ?? 1;
  const minTier = Math.max(1, playerTier - 1);
  const maxTier = Math.min(5, playerTier + 1);
  const targetTier = chooseTargetTier(rng, playerTier, routeDangerLevel);
  const namedCandidates = buildNamedCandidates(state, targetTier);
  const anonymousCandidates = buildAnonymousCandidates(origin, destination, targetTier);

  if (namedCandidates.length > 0 || anonymousCandidates.length > 0) {
    const preferNamed = namedCandidates.length > 0 && rng.next() < 0.25;
    const preferred = preferNamed ? namedCandidates : anonymousCandidates;
    const fallback = preferNamed ? anonymousCandidates : namedCandidates;
    return chooseOne(rng, preferred.length > 0 ? preferred : fallback);
  }

  const bandCandidates: EncounterInterceptorState[] = [];
  for (let tier = minTier; tier <= maxTier; tier += 1) {
    bandCandidates.push(
      ...buildNamedCandidates(state, tier as RouteDangerLevel),
      ...buildAnonymousCandidates(origin, destination, tier as RouteDangerLevel),
    );
  }

  if (bandCandidates.length === 0) {
    throw new Error('No encounter interceptors available for tier band');
  }

  return chooseOne(rng, bandCandidates);
}

export function generateEncounter(
  state: GameState,
  origin: number,
  destination: number,
  fuelUsed: number,
  rng: SeededRng,
): EncounterState | null {
  const { routeDangerLevel, routeDangerChance } = calculateRouteDanger(state, origin, destination);
  const encounterRoll = rng.next();
  if (encounterRoll >= routeDangerChance) {
    return null;
  }

  const interceptor = selectEncounterInterceptor(state, origin, destination, routeDangerLevel, rng);
  return {
    id: `enc-${state.day}-${state.dayEventCount}-${origin}-${destination}-${interceptor.id}`,
    pendingTravel: { origin, destination, fuelUsed },
    interceptor,
    routeDangerLevel,
    routeDangerChance,
    encounterRoll,
    round: 1,
    enemyHull: 1,
  };
}

export function completePendingTravel(
  state: GameState,
  encounter: EncounterState,
  events: GameEvent[],
): void {
  const { origin, destination } = encounter.pendingTravel;
  state.player.currentSystemId = destination;
  events.push({
    type: 'TravelEvent',
    characterId: 'player',
    origin,
    destination,
    fuelUsed: 0,
    success: true,
    resumedFromEncounterId: encounter.id,
  });

  if (state.player.activeContract && state.player.activeContract.destination === destination) {
    const contract = state.player.activeContract;
    const payment = contract.payment;
    state.player.credits += payment;
    events.push({
      type: 'TradeEvent',
      characterId: 'player',
      action: 'deliver-cargo',
      success: true,
      destination: contract.destination,
      cargoType: contract.cargoType,
      payment,
      actionDetails: `Delivered cargo! Earned ${payment} credits.`,
    });
    state.player.activeContract = null;
  }
}

export function resolveTravel(
  state: GameState,
  action: Extract<PlayerAction, { type: 'Travel' }>,
  rng: SeededRng,
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const nextState = JSON.parse(JSON.stringify(state)) as GameState;

  // Encounter gating lives in day.ts applyPlayerAction (the only runtime caller),
  // which emits a typed ActionBlocked event before this resolver is reached.
  if (action.spendDie === undefined) {
    throw new Error('Must spend a die to travel');
  }

  const { die, hand } = spendDie(nextState.player.dawnHand!, action.spendDie);
  nextState.player.dawnHand = hand;

  const origin = nextState.player.currentSystemId;
  const destination = action.destinationId;
  const routeDistance = systemDistance(origin, destination);

  // Calculate fuel cost (Legacy math)
  const drives = nextState.player.ship.drives;
  const hasTransWarp = nextState.player.ship.hasTransWarpDrive || false;
  const effectiveStrength = drives.strength + (hasTransWarp ? 10 : 0);
  const af = Math.min(effectiveStrength, 21);
  let fuelCost = 21 - af + (10 - drives.condition);
  if (fuelCost < 1) fuelCost = 1;
  fuelCost = fuelCost * routeDistance;
  const ty = fuelCost + 10;
  const capped = Math.min(ty, 100);
  const fuelRequired = Math.floor(capped / 2);

  // Pilot check
  const travelDc = 8 + Math.floor(routeDistance / 2); // Stub DC based on distance

  const result = check(die, nextState.player.stats[Stat.PILOT], travelDc);
  events.push({
    type: 'StatCheck',
    actor: 'Player',
    stat: Stat.PILOT,
    dc: travelDc,
    result,
  });

  if (nextState.player.ship.fuel >= fuelRequired) {
    nextState.player.ship.fuel -= fuelRequired;

    if (result.success) {
      const encounter = generateEncounter(nextState, origin, destination, fuelRequired, rng);
      if (encounter) {
        nextState.encounter = encounter;
        events.push({
          type: 'TravelEvent',
          characterId: 'player',
          origin,
          destination,
          fuelUsed: fuelRequired,
          success: false,
          interrupted: true,
        });
        events.push({ type: 'EncounterStarted', encounter });
      } else {
        nextState.player.currentSystemId = destination;
        events.push({
          type: 'TravelEvent',
          characterId: 'player',
          origin,
          destination,
          fuelUsed: fuelRequired,
          success: true,
        });

        // Check if they completed a contract
        if (
          nextState.player.activeContract &&
          nextState.player.activeContract.destination === destination
        ) {
          const contract = nextState.player.activeContract;
          const payment = contract.payment;
          nextState.player.credits += payment;
          events.push({
            type: 'TradeEvent',
            characterId: 'player',
            action: 'deliver-cargo',
            success: true,
            destination: contract.destination,
            cargoType: contract.cargoType,
            payment,
            actionDetails: `Delivered cargo! Earned ${payment} credits.`,
          });
          nextState.player.activeContract = null; // Clear contract
        }
      }
    } else {
      events.push({
        type: 'TravelEvent',
        characterId: 'player',
        origin,
        destination,
        fuelUsed: fuelRequired,
        success: false,
      });
      events.push({
        type: 'WireEntry',
        day: nextState.day,
        message: `Player experienced a navigation malfunction en route to system ${destination}.`,
      });
    }
  } else {
    // Not enough fuel
    events.push({
      type: 'TravelEvent',
      characterId: 'player',
      origin,
      destination,
      fuelUsed: 0,
      success: false,
    });
    events.push({
      type: 'WireEntry',
      day: nextState.day,
      message: `Player attempted jump to system ${destination} without enough fuel.`,
    });
  }

  return { state: nextState, events };
}
