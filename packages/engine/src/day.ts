import { CARGO_TYPES, NPC_PROFILES, STAR_SYSTEMS, Stat } from '@spacerquest/content';
import { DayPhase, GameState, GameEvent, PlayerAction } from './types.js';
import { SeededRng } from './rng.js';
import { rollDawnHand } from './dice.js';
import { applyDisposition, resolveNpcDay } from './npc.js';
import { generateManifestBoard, localFuelPrice } from './economy.js';
import { advanceEraSchedule } from './era.js';
import { resolveTrade } from './actions/trade.js';
import { resolveTravel } from './actions/travel.js';
import {
  applyEncounterDuskPressure,
  resolveCombat,
  resolveInterceptorFled,
} from './actions/combat.js';
import { resolveShipyard } from './actions/shipyard.js';
import { resolveExploration } from './actions/exploration.js';
import { evaluateDeeds } from './deeds.js';
import { refreshAvailableStorylets, resolveStoryletChoice } from './storylets.js';

function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

function appendEvents(state: GameState, events: GameEvent[]): void {
  state.eventLog.push(...events);
}

export function startDay(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let nextState = cloneState(state);

  if (nextState.dayPhase !== DayPhase.DAWN) {
    throw new Error('startDay requires DAWN phase');
  }

  const dayRng = new SeededRng(nextState.rngState).fork(`day-${nextState.day}`);
  nextState.storylets.offeredToday = [];

  // Generate manifest board and price the local depot from canon tables.
  // T-106 contract competition: every job an NPC claimed off the board at the
  // previous dusk drains today's generation pool by one (floor of 1 — a port
  // never goes completely dark).
  const claimedJobs = nextState.market.npcClaims ?? 0;
  const boardSize = Math.max(1, 4 - claimedJobs);
  const manifestBoard = generateManifestBoard(
    nextState.player.currentSystemId,
    dayRng.fork('market'),
    nextState.player.ship,
    boardSize,
    nextState.eraEvent,
  );
  nextState.market = {
    manifestBoard,
    localFuelPrice: localFuelPrice(nextState.player.currentSystemId, nextState.eraEvent),
    npcClaims: 0,
  };

  // Roll player hand
  const handSize = 5;
  const playerHand = rollDawnHand(dayRng.fork('player-hand'), handSize);
  nextState.player.dawnHand = playerHand;

  events.push({
    type: 'DawnRoll',
    day: nextState.day,
    hand: [...playerHand.dice],
  });

  const refreshed = refreshAvailableStorylets(nextState);
  nextState = refreshed.state;
  events.push(...refreshed.events);
  events.push(...evaluateDeeds(nextState, events));

  nextState.rngState = dayRng.getState();
  nextState.dayPhase = DayPhase.DAY;
  nextState.dayEventCount = events.length;
  appendEvents(nextState, events);

  return { state: nextState, events };
}

export function applyPlayerAction(
  state: GameState,
  action: PlayerAction,
): { state: GameState; events: GameEvent[] } {
  const nextState = cloneState(state);

  if (nextState.dayPhase !== DayPhase.DAY) {
    throw new Error('applyPlayerAction requires DAY phase');
  }

  if (action.type === 'Wait') {
    const refreshed = refreshAvailableStorylets(nextState);
    const events = refreshed.events;
    refreshed.state.dayEventCount = nextState.dayEventCount + events.length;
    appendEvents(refreshed.state, events);
    return { state: refreshed.state, events };
  }

  if (nextState.encounter && action.type !== 'Combat') {
    // Trade/Travel/Shipyard during an active encounter are player-possible acts,
    // not malformed input — surface a typed ActionBlocked event instead of
    // throwing. Refusals are logged (ShipyardFail precedent): the event is
    // appended to the event log, but no die is spent, dayEventCount is not
    // bumped, and no other state changes.
    const blocked: GameEvent = {
      type: 'ActionBlocked',
      day: nextState.day,
      actionType: action.type,
      reason: 'active-encounter',
    };
    appendEvents(nextState, [blocked]);
    return { state: nextState, events: [blocked] };
  }

  const dayRng = new SeededRng(nextState.rngState);
  const actionEventIndex = nextState.dayEventCount;

  let result: { state: GameState; events: GameEvent[] };
  if (action.type === 'Trade') {
    result = resolveTrade(nextState, action, dayRng.fork(`action-trade-${actionEventIndex}`));
  } else if (action.type === 'Travel') {
    result = resolveTravel(nextState, action, dayRng.fork(`action-travel-${actionEventIndex}`));
  } else if (action.type === 'Shipyard') {
    dayRng.fork(`action-shipyard-${actionEventIndex}`);
    result = resolveShipyard(nextState, action);
  } else if (action.type === 'Combat') {
    result = resolveCombat(nextState, action, dayRng.fork(`action-combat-${actionEventIndex}`));
  } else if (action.type === 'Explore') {
    result = resolveExploration(
      nextState,
      action,
      dayRng.fork(`action-explore-${actionEventIndex}`),
    );
  } else {
    result = resolveStoryletChoice(
      nextState,
      action,
      dayRng.fork(`action-storylet-${actionEventIndex}`),
    );
  }

  let resolvedState = result.state;
  resolvedState.rngState = dayRng.getState();
  resolvedState.dayPhase = DayPhase.DAY;
  const deedEvents = evaluateDeeds(resolvedState, result.events);
  const refreshed = refreshAvailableStorylets(resolvedState);
  resolvedState = refreshed.state;
  const events = [...result.events, ...deedEvents, ...refreshed.events];
  resolvedState.dayEventCount = actionEventIndex + events.length;
  appendEvents(resolvedState, events);

  return { state: resolvedState, events };
}

export function endDay(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const nextState = cloneState(state);

  if (nextState.dayPhase !== DayPhase.DAY) {
    throw new Error('endDay requires DAY phase');
  }

  const dayRng = new SeededRng(nextState.rngState);

  // Set all dice to spent if player didn't use them (day is over)
  if (nextState.player.dawnHand) {
    for (let i = 0; i < nextState.player.dawnHand.spent.length; i++) {
      nextState.player.dawnHand.spent[i] = true;
    }
  }

  // T-106 bond hook — ONE mechanical intervention per dusk. Rule: the
  // bonded-to-player NPC (disposition >= +5) sharing the player's system with
  // the HIGHEST disposition (id as tiebreak) may act, rolling d20 + their
  // GRIT (seeded): DC 12 to drive an active interceptor off before the dusk
  // free attack, DC 8 to answer a dry-tank mayday with a 50-fuel transfer.
  // An intervention IS the rescuer's dusk action — helping the player costs
  // them their own day, so they skip the NPC loop below.
  let intervenedNpcId: string | null = null;
  const rescuer = nextState.npcs
    .filter(
      (npc) => npc.disposition >= 5 && npc.currentSystemId === nextState.player.currentSystemId,
    )
    .sort((a, b) => b.disposition - a.disposition || a.id.localeCompare(b.id))[0];
  if (rescuer) {
    const rescuerProfile = NPC_PROFILES.find((p) => p.id === rescuer.profileId);
    const grit = rescuerProfile?.stats[Stat.GRIT] ?? 0;
    if (nextState.encounter) {
      const rescueRng = dayRng.fork(`bond-rescue-${rescuer.id}`);
      if (rescueRng.d20() + grit >= 12) {
        const interceptorName = nextState.encounter.interceptor.name;
        events.push({
          type: 'BondIntervention',
          day: nextState.day,
          npcId: rescuer.id,
          kind: 'drive-off',
        });
        resolveInterceptorFled(nextState, events);
        events.push({
          type: 'WireEntry',
          day: nextState.day,
          message: `${rescuer.name} drove ${interceptorName} off your tail.`,
        });
        intervenedNpcId = rescuer.id;
        rescuer.lastAction = {
          type: 'Combat',
          details: `spent the day driving ${interceptorName} off a friend's tail`,
        };
        events.push({
          type: 'NpcAction',
          npcId: rescuer.id,
          actionDetails: rescuer.lastAction.details,
        });
      }
    } else if (nextState.player.ship.fuel === 0 && rescuer.fuel >= 100) {
      const giftRng = dayRng.fork(`bond-gift-${rescuer.id}`);
      if (giftRng.d20() + grit >= 8) {
        rescuer.fuel -= 50;
        nextState.player.ship.fuel = Math.min(nextState.player.ship.maxFuel, 50);
        events.push({
          type: 'BondIntervention',
          day: nextState.day,
          npcId: rescuer.id,
          kind: 'fuel-gift',
          amount: 50,
        });
        events.push({
          type: 'WireEntry',
          day: nextState.day,
          message: `${rescuer.name} answered your mayday and transferred 50 fuel.`,
        });
        intervenedNpcId = rescuer.id;
        rescuer.lastAction = {
          type: 'Trade',
          details: `spent the day answering a mayday at ${
            STAR_SYSTEMS[rescuer.currentSystemId]?.name ?? `system ${rescuer.currentSystemId}`
          }`,
        };
        events.push({
          type: 'NpcAction',
          npcId: rescuer.id,
          actionDetails: rescuer.lastAction.details,
        });
      }
    }
  }

  if (nextState.encounter) {
    events.push(
      ...applyEncounterDuskPressure(
        nextState,
        dayRng.fork(`encounter-dusk-${nextState.encounter.id}-${nextState.encounter.round}`),
      ),
    );
  }

  // 3. DUSK (NPC Actions). NPCs sharing the player's system compete for the
  // player's manifest board — at most one job is claimed per dusk (texture
  // stays cheap; the loss is legible on the wire and in tomorrow's board).
  const npcOrder = dayRng.shuffle([...nextState.npcs]);
  let boardClaimSpent = false;

  for (const npc of npcOrder) {
    // The bond-hook rescuer already spent their day intervening.
    if (npc.id === intervenedNpcId) continue;
    const npcRng = dayRng.fork(`npc-${npc.id}`);
    const canClaim =
      !boardClaimSpent &&
      npc.currentSystemId === nextState.player.currentSystemId &&
      nextState.market.manifestBoard.length > 0;
    const {
      npc: updatedNpc,
      events: npcEvents,
      claimedContractIndex,
    } = resolveNpcDay(npc, npcRng, {
      day: nextState.day,
      claimableBoard: canClaim ? nextState.market.manifestBoard : null,
      eraEvent: nextState.eraEvent,
    });

    if (claimedContractIndex !== undefined) {
      boardClaimSpent = true;
      const [claimed] = nextState.market.manifestBoard.splice(claimedContractIndex, 1);
      if (claimed) {
        nextState.market.npcClaims = (nextState.market.npcClaims ?? 0) + 1;
        const cargoName = CARGO_TYPES[claimed.cargoType]?.name ?? 'cargo';
        const destinationName =
          STAR_SYSTEMS[claimed.destination]?.name ?? `system ${claimed.destination}`;
        events.push({
          type: 'ContractClaimed',
          day: nextState.day,
          npcId: updatedNpc.id,
          cargoType: claimed.cargoType,
          destination: claimed.destination,
          payment: claimed.payment,
        });
        events.push({
          type: 'WireEntry',
          day: nextState.day,
          message: `${updatedNpc.name} undercut you on the ${cargoName} run to ${destinationName}.`,
        });
      }
    }

    const npcIndex = nextState.npcs.findIndex((n) => n.id === npc.id);
    if (npcIndex !== -1) {
      nextState.npcs[npcIndex] = updatedNpc;
    }
    events.push(...npcEvents);
  }

  // Grudges and favors fade: each dusk every non-neutral disposition moves
  // one step toward 0 (T-106).
  for (const npc of nextState.npcs) {
    if (npc.disposition !== 0) {
      applyDisposition(nextState, npc.id, npc.disposition > 0 ? -1 : 1, 'decay', events);
    }
  }

  // Generate daily wire entries from notable events
  for (const npc of nextState.npcs) {
    if (npc.lastAction) {
      // Flaw overrides are ALWAYS notable. Other actions are semi-randomly notable.
      if (npc.lastAction.type === 'FlawOverride' || dayRng.next() > 0.7) {
        events.push({
          type: 'WireEntry',
          day: nextState.day,
          message: `${npc.name} ${npc.lastAction.details}`,
        });
      }
    }
  }

  // The Guild calls its marker (enforcement/consequences are story-layer work;
  // the engine's job is to surface the fact as an event).
  if (nextState.player.debt > 0 && nextState.day === nextState.player.debtDueDay) {
    events.push({
      type: 'DebtDue',
      day: nextState.day,
      outstanding: nextState.player.debt,
    });
  }

  events.push(...evaluateDeeds(nextState, events));

  // T-107 era scheduler: the world's economic weather turns at dusk. One event
  // active at a time; seeded onset after a cooldown; natural expiry at the day
  // boundary. Runs before the day increment so the next dawn's board and fuel
  // prices already read the new modifiers.
  const eraResult = advanceEraSchedule(
    {
      eraEvent: nextState.eraEvent,
      lastEraEventEndedDay: nextState.lastEraEventEndedDay,
      currentDay: nextState.day,
    },
    dayRng.fork('era-schedule'),
  );
  nextState.eraEvent = eraResult.eraEvent;
  nextState.lastEraEventEndedDay = eraResult.lastEraEventEndedDay;
  events.push(...eraResult.events);

  // 4. NEXT DAY PREP
  const nextDay = nextState.day + 1;
  nextState.day = nextDay;
  nextState.rngState = dayRng.getState();
  nextState.dayPhase = DayPhase.DAWN;
  nextState.dayEventCount = 0;
  events.push({ type: 'DayAdvanced', day: nextDay });
  appendEvents(nextState, events);

  return { state: nextState, events };
}

export function advanceDay(
  state: GameState,
  playerActions: PlayerAction[],
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const dawn = startDay(state);
  let nextState = dawn.state;
  events.push(...dawn.events);

  for (const action of playerActions) {
    const result = applyPlayerAction(nextState, action);
    nextState = result.state;
    events.push(...result.events);
  }

  const dusk = endDay(nextState);
  events.push(...dusk.events);

  return { state: dusk.state, events };
}
