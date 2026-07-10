import { Stat } from '@spacerquest/content';
import { GameState, GameEvent, PlayerAction } from '../types.js';
import { SeededRng } from '../rng.js';
import { check, spendDie } from '../dice.js';

export function resolveTravel(
  state: GameState,
  action: Extract<PlayerAction, { type: 'Travel' }>,
  _rng: SeededRng
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const nextState = JSON.parse(JSON.stringify(state)) as GameState;

  if (action.spendDie === undefined) {
    throw new Error('Must spend a die to travel');
  }

  const { die, hand } = spendDie(nextState.player.dawnHand!, action.spendDie);
  nextState.player.dawnHand = hand;

  const origin = nextState.player.currentSystemId;
  const destination = action.destinationId;

  // Deliberate v0 simplification: distance = |id difference|, not the 2D
  // coordinates in the seed data. Revisit when the starmap lands
  // (TECH-STACK.md deferred decisions).
  const distance = Math.max(1, Math.abs(destination - origin));

  // Calculate fuel cost (Legacy math)
  const drives = nextState.player.ship.drives;
  const hasTransWarp = nextState.player.ship.hasTransWarpDrive || false;
  const effectiveStrength = drives.strength + (hasTransWarp ? 10 : 0);
  const af = Math.min(effectiveStrength, 21);
  let fuelCost = (21 - af) + (10 - drives.condition);
  if (fuelCost < 1) fuelCost = 1;
  fuelCost = fuelCost * distance;
  const ty = fuelCost + 10;
  const capped = Math.min(ty, 100);
  const fuelRequired = Math.floor(capped / 2);

  // Pilot check
  const travelDc = 8 + Math.floor(distance / 2); // Stub DC based on distance

  const result = check(die, nextState.player.stats[Stat.PILOT], travelDc);
  events.push({
    type: 'StatCheck',
    actor: 'Player',
    stat: Stat.PILOT,
    dc: travelDc,
    result
  });

  if (nextState.player.ship.fuel >= fuelRequired) {
    nextState.player.ship.fuel -= fuelRequired;

    if (result.success) {
      nextState.player.currentSystemId = destination;
      events.push({
        type: 'TravelEvent',
        characterId: 'player',
        origin,
        destination,
        fuelUsed: fuelRequired,
        success: true
      });

      // Check if they completed a contract
      if (nextState.player.activeContract && nextState.player.activeContract.destination === destination) {
        const payment = nextState.player.activeContract.payment;
        nextState.player.credits += payment;
        events.push({
          type: 'TradeEvent',
          characterId: 'player',
          actionDetails: `Delivered cargo! Earned ${payment} credits.`
        });
        nextState.player.activeContract = null; // Clear contract
      }

    } else {
      events.push({
        type: 'TravelEvent',
        characterId: 'player',
        origin,
        destination,
        fuelUsed: fuelRequired,
        success: false
      });
      events.push({
        type: 'WireEntry',
        day: nextState.day,
        message: `Player experienced a navigation malfunction en route to system ${destination}.`
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
      success: false
    });
    events.push({
      type: 'WireEntry',
      day: nextState.day,
      message: `Player attempted jump to system ${destination} without enough fuel.`
    });
  }

  return { state: nextState, events };
}
