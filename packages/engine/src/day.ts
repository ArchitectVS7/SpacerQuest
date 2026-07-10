import { STAR_SYSTEMS, FUEL_DEFAULT_BUY_PRICE, RIM_FUEL_BUY_PRICE } from '@spacerquest/content';
import { GameState, GameEvent, PlayerAction } from './types.js';
import { SeededRng } from './rng.js';
import { rollDawnHand } from './dice.js';
import { resolveNpcDay } from './npc.js';
import { generateManifestBoard } from './economy.js';
import { resolveTrade } from './actions/trade.js';
import { resolveTravel } from './actions/travel.js';
import { resolveCombat } from './actions/combat.js';

function localFuelPrice(systemId: number): number {
  const system = STAR_SYSTEMS[systemId];
  if (!system) return FUEL_DEFAULT_BUY_PRICE;
  if (system.isRim) return RIM_FUEL_BUY_PRICE;
  return system.fuelBuyPrice ?? FUEL_DEFAULT_BUY_PRICE;
}

export function advanceDay(
  state: GameState,
  playerActions: PlayerAction[],
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let nextState = JSON.parse(JSON.stringify(state)) as GameState;

  // 1. DAWN
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

  // 2. DAY (Player Actions)
  for (const action of playerActions) {
    if (action.type === 'Trade') {
      const result = resolveTrade(nextState, action, dayRng.fork(`action-trade-${events.length}`));
      nextState = result.state;
      events.push(...result.events);
    } else if (action.type === 'Travel') {
      const result = resolveTravel(
        nextState,
        action,
        dayRng.fork(`action-travel-${events.length}`),
      );
      nextState = result.state;
      events.push(...result.events);
    } else if (action.type === 'Combat') {
      const result = resolveCombat(
        nextState,
        action,
        dayRng.fork(`action-combat-${events.length}`),
      );
      nextState = result.state;
      events.push(...result.events);
    } else if (action.type === 'Wait') {
      // Do nothing
    }
  }

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

  // 4. NEXT DAY PREP
  nextState.day += 1;
  nextState.rngState = dayRng.getState();
  nextState.eventLog.push(...events);

  return { state: nextState, events };
}
