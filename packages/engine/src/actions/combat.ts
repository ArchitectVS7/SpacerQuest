import { Stat } from '@spacerquest/content';
import { GameState, GameEvent, PlayerAction } from '../types.js';
import { SeededRng } from '../rng.js';
import { check, spendDie } from '../dice.js';

/** Fuel gates (UGT Finding 2's lesson): NOTHING in combat that burns fuel is
 *  free when the tank is short — no free volleys AND no free getaways. */
export const RUN_FUEL_COST = 10;
export const FIGHT_FUEL_COST = 50;

export function resolveCombat(
  state: GameState,
  action: Extract<PlayerAction, { type: 'Combat' }>,
  _rng: SeededRng
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const nextState = JSON.parse(JSON.stringify(state)) as GameState;

  if (action.spendDie === undefined) {
    throw new Error('Must spend a die for combat stance');
  }

  const { die, hand } = spendDie(nextState.player.dawnHand!, action.spendDie);
  nextState.player.dawnHand = hand;

  const targetId = action.targetId;
  const stats = nextState.player.stats;

  if (action.stance === 'run') {
    if (nextState.player.ship.fuel < RUN_FUEL_COST) {
      // Dry tanks: the burn never happens, the escape auto-fails.
      events.push({
        type: 'CombatEvent',
        characterId: 'player',
        targetId,
        stance: 'run',
        fuelUsed: 0,
        success: false,
        insufficientFuel: true
      });
      return { state: nextState, events };
    }

    nextState.player.ship.fuel -= RUN_FUEL_COST;

    const result = check(die, stats[Stat.PILOT], 12); // Stub DC
    events.push({
      type: 'StatCheck',
      actor: 'Player',
      stat: Stat.PILOT,
      dc: 12,
      result
    });

    events.push({
      type: 'CombatEvent',
      characterId: 'player',
      targetId,
      stance: 'run',
      fuelUsed: RUN_FUEL_COST,
      success: result.success
    });
  } else if (action.stance === 'talk') {
    const result = check(die, stats[Stat.TRADE], 14); // Stub DC
    events.push({
      type: 'StatCheck',
      actor: 'Player',
      stat: Stat.TRADE,
      dc: 14,
      result
    });

    events.push({
      type: 'CombatEvent',
      characterId: 'player',
      targetId,
      stance: 'talk',
      fuelUsed: 0,
      success: result.success
    });
  } else if (action.stance === 'fight') {
    if (nextState.player.ship.fuel < FIGHT_FUEL_COST) {
      // Weapons Malfunction! No fuel, no volley, no check.
      events.push({
        type: 'CombatEvent',
        characterId: 'player',
        targetId,
        stance: 'fight',
        fuelUsed: 0,
        success: false,
        insufficientFuel: true
      });
      return { state: nextState, events };
    }

    nextState.player.ship.fuel -= FIGHT_FUEL_COST;

    const result = check(die, stats[Stat.GUNS], 10); // Stub DC
    events.push({
      type: 'StatCheck',
      actor: 'Player',
      stat: Stat.GUNS,
      dc: 10,
      result
    });

    events.push({
      type: 'CombatEvent',
      characterId: 'player',
      targetId,
      stance: 'fight',
      fuelUsed: FIGHT_FUEL_COST,
      success: result.success
    });
  }

  return { state: nextState, events };
}
