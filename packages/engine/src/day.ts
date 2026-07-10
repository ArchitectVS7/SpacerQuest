import { STAR_SYSTEMS, FUEL_DEFAULT_BUY_PRICE, RIM_FUEL_BUY_PRICE } from '@spacerquest/content';
import { DayPhase, GameState, GameEvent, PlayerAction } from './types.js';
import { SeededRng } from './rng.js';
import { rollDawnHand } from './dice.js';
import { resolveNpcDay } from './npc.js';
import { generateManifestBoard } from './economy.js';
import { resolveTrade } from './actions/trade.js';
import { resolveTravel } from './actions/travel.js';
import { resolveCombat } from './actions/combat.js';
import { resolveShipyard } from './actions/shipyard.js';
import { evaluateDeeds } from './deeds.js';

function localFuelPrice(systemId: number): number {
  const system = STAR_SYSTEMS[systemId];
  if (!system) return FUEL_DEFAULT_BUY_PRICE;
  if (system.isRim) return RIM_FUEL_BUY_PRICE;
  return system.fuelBuyPrice ?? FUEL_DEFAULT_BUY_PRICE;
}

function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

function appendEvents(state: GameState, events: GameEvent[]): void {
  state.eventLog.push(...events);
}

export function startDay(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const nextState = cloneState(state);

  if (nextState.dayPhase !== DayPhase.DAWN) {
    throw new Error('startDay requires DAWN phase');
  }

  const dayRng = new SeededRng(nextState.rngState).fork(`day-${nextState.day}`);

  // Generate manifest board and price the local depot from canon tables
  const manifestBoard = generateManifestBoard(
    nextState.player.currentSystemId,
    dayRng.fork('market'),
    nextState.player.ship,
  );
  nextState.market = {
    manifestBoard,
    localFuelPrice: localFuelPrice(nextState.player.currentSystemId),
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
    return { state: nextState, events: [] };
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
  } else {
    result = resolveCombat(nextState, action, dayRng.fork(`action-combat-${actionEventIndex}`));
  }

  const resolvedState = result.state;
  resolvedState.rngState = dayRng.getState();
  resolvedState.dayPhase = DayPhase.DAY;
  const events = [...result.events, ...evaluateDeeds(resolvedState, result.events)];
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

  // 3. DUSK (NPC Actions)
  const npcOrder = dayRng.shuffle([...nextState.npcs]);

  for (const npc of npcOrder) {
    const npcRng = dayRng.fork(`npc-${npc.id}`);
    const { npc: updatedNpc, events: npcEvents } = resolveNpcDay(npc, npcRng, {
      day: nextState.day,
    });

    const npcIndex = nextState.npcs.findIndex((n) => n.id === npc.id);
    if (npcIndex !== -1) {
      nextState.npcs[npcIndex] = updatedNpc;
    }
    events.push(...npcEvents);
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
