import { Stat } from '@spacerquest/content';
import { GameState, GameEvent, PlayerAction } from '../types.js';
import { SeededRng } from '../rng.js';
import { check, spendDie } from '../dice.js';
import { completePendingTravel } from './travel.js';

/** Fuel gates (UGT Finding 2's lesson): NOTHING in combat that burns fuel is
 *  free when the tank is short — no free volleys AND no free getaways. */
export const RUN_FUEL_COST = 10;
export const FIGHT_FUEL_COST = 50;

export function resolveCombat(
  state: GameState,
  action: Extract<PlayerAction, { type: 'Combat' }>,
  _rng: SeededRng,
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const nextState = JSON.parse(JSON.stringify(state)) as GameState;

  if (nextState.encounter && action.targetId !== nextState.encounter.interceptor.id) {
    throw new Error('Combat target must be the active encounter interceptor');
  }

  if (action.spendDie === undefined) {
    throw new Error('Must spend a die for combat stance');
  }

  const { die, hand } = spendDie(nextState.player.dawnHand!, action.spendDie);
  nextState.player.dawnHand = hand;

  const targetId = action.targetId;
  const stats = nextState.player.stats;

  if (nextState.encounter) {
    const encounter = nextState.encounter;
    const dc = 10 + encounter.interceptor.tier;
    const round = encounter.round;
    const resolveSuccess = (resolution: 'escaped' | 'talked-down' | 'defeated'): void => {
      events.push({
        type: 'EncounterRound',
        encounterId: encounter.id,
        round,
        stance: action.stance,
        continues: false,
        success: true,
        fuelUsed:
          action.stance === 'run' ? RUN_FUEL_COST : action.stance === 'fight' ? FIGHT_FUEL_COST : 0,
      });
      events.push({
        type: 'EncounterResolved',
        encounterId: encounter.id,
        resolution,
        round,
        interceptorId: encounter.interceptor.id,
      });
      nextState.encounter = null;
      completePendingTravel(nextState, encounter, events);
    };

    if (action.stance === 'run') {
      if (nextState.player.ship.fuel < RUN_FUEL_COST) {
        events.push({
          type: 'CombatEvent',
          characterId: 'player',
          targetId,
          stance: 'run',
          fuelUsed: 0,
          success: false,
          insufficientFuel: true,
        });
        events.push({
          type: 'EncounterRound',
          encounterId: encounter.id,
          round,
          stance: 'run',
          continues: true,
          success: false,
          fuelUsed: 0,
          insufficientFuel: true,
        });
        return { state: nextState, events };
      }

      nextState.player.ship.fuel -= RUN_FUEL_COST;
      const result = check(die, stats[Stat.PILOT], dc);
      events.push({ type: 'StatCheck', actor: 'Player', stat: Stat.PILOT, dc, result });
      events.push({
        type: 'CombatEvent',
        characterId: 'player',
        targetId,
        stance: 'run',
        fuelUsed: RUN_FUEL_COST,
        success: result.success,
      });

      if (result.success) {
        resolveSuccess('escaped');
      } else {
        nextState.encounter.round += 1;
        events.push({
          type: 'EncounterRound',
          encounterId: encounter.id,
          round,
          stance: 'run',
          continues: true,
          success: false,
          fuelUsed: RUN_FUEL_COST,
        });
      }
      return { state: nextState, events };
    }

    if (action.stance === 'talk') {
      const result = check(die, stats[Stat.TRADE], dc);
      events.push({ type: 'StatCheck', actor: 'Player', stat: Stat.TRADE, dc, result });
      events.push({
        type: 'CombatEvent',
        characterId: 'player',
        targetId,
        stance: 'talk',
        fuelUsed: 0,
        success: result.success,
      });

      if (result.success) {
        resolveSuccess('talked-down');
      } else {
        nextState.encounter.round += 1;
        events.push({
          type: 'EncounterRound',
          encounterId: encounter.id,
          round,
          stance: 'talk',
          continues: true,
          success: false,
          fuelUsed: 0,
        });
      }
      return { state: nextState, events };
    }

    if (nextState.player.ship.fuel < FIGHT_FUEL_COST) {
      events.push({
        type: 'CombatEvent',
        characterId: 'player',
        targetId,
        stance: 'fight',
        fuelUsed: 0,
        success: false,
        insufficientFuel: true,
      });
      events.push({
        type: 'EncounterRound',
        encounterId: encounter.id,
        round,
        stance: 'fight',
        continues: true,
        success: false,
        fuelUsed: 0,
        insufficientFuel: true,
      });
      return { state: nextState, events };
    }

    nextState.player.ship.fuel -= FIGHT_FUEL_COST;
    const result = check(die, stats[Stat.GUNS], dc);
    events.push({ type: 'StatCheck', actor: 'Player', stat: Stat.GUNS, dc, result });
    events.push({
      type: 'CombatEvent',
      characterId: 'player',
      targetId,
      stance: 'fight',
      fuelUsed: FIGHT_FUEL_COST,
      success: result.success,
    });

    if (result.success) {
      resolveSuccess('defeated');
    } else {
      nextState.encounter.round += 1;
      events.push({
        type: 'EncounterRound',
        encounterId: encounter.id,
        round,
        stance: 'fight',
        continues: true,
        success: false,
        fuelUsed: FIGHT_FUEL_COST,
      });
    }
    return { state: nextState, events };
  }

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
        insufficientFuel: true,
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
      result,
    });

    events.push({
      type: 'CombatEvent',
      characterId: 'player',
      targetId,
      stance: 'run',
      fuelUsed: RUN_FUEL_COST,
      success: result.success,
    });
  } else if (action.stance === 'talk') {
    const result = check(die, stats[Stat.TRADE], 14); // Stub DC
    events.push({
      type: 'StatCheck',
      actor: 'Player',
      stat: Stat.TRADE,
      dc: 14,
      result,
    });

    events.push({
      type: 'CombatEvent',
      characterId: 'player',
      targetId,
      stance: 'talk',
      fuelUsed: 0,
      success: result.success,
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
        insufficientFuel: true,
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
      result,
    });

    events.push({
      type: 'CombatEvent',
      characterId: 'player',
      targetId,
      stance: 'fight',
      fuelUsed: FIGHT_FUEL_COST,
      success: result.success,
    });
  }

  return { state: nextState, events };
}
