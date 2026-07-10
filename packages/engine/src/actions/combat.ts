import { FLAWS, Stat } from '@spacerquest/content';
import { GameState, GameEvent, PlayerAction, EncounterState, ShipComponentId } from '../types.js';
import { SeededRng } from '../rng.js';
import { check, spendDie } from '../dice.js';
import { completePendingTravel } from './travel.js';

/** Fuel gates (UGT Finding 2's lesson): NOTHING in combat that burns fuel is
 *  free when the tank is short — no free volleys AND no free getaways. */
export const RUN_FUEL_COST = 10;
export const FIGHT_FUEL_COST = 50;
export const TRIBUTE_BASE_MULTIPLIER = 1000;
export const TRIBUTE_MAX = 10_000;

const DAMAGE_COMPONENTS: readonly ShipComponentId[] = [
  'shields',
  'drives',
  'weapons',
  'hull',
  'navigation',
  'lifeSupport',
  'robotics',
  'cabin',
];

function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

function tributeForRound(round: number): number {
  return Math.min(round * TRIBUTE_BASE_MULTIPLIER, TRIBUTE_MAX);
}

function enemyRefusesTribute(
  encounter: EncounterState,
  rng: SeededRng,
  events: GameEvent[],
): boolean {
  const flaw = encounter.interceptor.flaw;
  if (!flaw) return false;

  const flawDef = FLAWS[flaw];
  if (!flawDef || !(flawDef.triggers as string[]).includes('Combat')) return false;

  const dc = encounter.interceptor.flawDc ?? 10;
  const die = rng.d20();
  const resisted = die >= dc;
  events.push({
    type: 'FlawCheck',
    npcId: encounter.interceptor.id,
    flaw,
    die,
    dc,
    resisted,
  });
  return !resisted;
}

function damageComponentForRound(round: number): ShipComponentId {
  return DAMAGE_COMPONENTS[(round - 1) % DAMAGE_COMPONENTS.length] ?? 'hull';
}

function resolveEncounter(
  state: GameState,
  encounter: EncounterState,
  events: GameEvent[],
  resolution: 'escaped' | 'talked-down' | 'defeated',
): void {
  events.push({
    type: 'EncounterResolved',
    encounterId: encounter.id,
    resolution,
    round: encounter.round,
    interceptorId: encounter.interceptor.id,
  });
  state.encounter = null;

  if (resolution === 'escaped') {
    state.player.currentSystemId = encounter.pendingTravel.origin;
    return;
  }

  completePendingTravel(state, encounter, events);
}

function applyEnemyPressure(
  state: GameState,
  encounter: EncounterState,
  rng: SeededRng,
  pressure: 'between-rounds' | 'day-end',
  events: GameEvent[],
): void {
  const round = encounter.round;
  const die = rng.d20();
  const dc = 10 + state.player.stats[Stat.GRIT];
  const result = check(die, encounter.interceptor.stats[Stat.GUNS], dc);

  events.push({
    type: 'StatCheck',
    actor: encounter.interceptor.name,
    stat: Stat.GUNS,
    dc,
    result,
  });
  events.push({
    type: 'EnemyCounterAction',
    encounterId: encounter.id,
    round,
    interceptorId: encounter.interceptor.id,
    pressure,
    check: result,
    success: result.success,
  });

  if (result.success) {
    const component = damageComponentForRound(round);
    const target = state.player.ship[component];
    const previousCondition = target.condition;
    target.condition = Math.max(0, target.condition - 1);
    events.push({
      type: 'ComponentDamaged',
      encounterId: encounter.id,
      component,
      previousCondition,
      newCondition: target.condition,
      amount: previousCondition - target.condition,
    });

    if (component === 'hull' && target.condition === 0) {
      events.push({
        type: 'ShipLost',
        day: state.day,
        encounterId: encounter.id,
        interceptorId: encounter.interceptor.id,
        reason: 'combat-defeat',
        component,
      });
      state.encounter = null;
      return;
    }
  }

  if (state.encounter) {
    state.encounter.round = round + 1;
  }
}

function continueEncounter(
  state: GameState,
  encounter: EncounterState,
  rng: SeededRng,
  events: GameEvent[],
): void {
  applyEnemyPressure(state, encounter, rng, 'between-rounds', events);
}

export function applyEncounterDuskPressure(state: GameState, rng: SeededRng): GameEvent[] {
  if (!state.encounter) return [];
  const events: GameEvent[] = [];
  applyEnemyPressure(state, state.encounter, rng, 'day-end', events);
  return events;
}

export function resolveCombat(
  state: GameState,
  action: Extract<PlayerAction, { type: 'Combat' }>,
  rng: SeededRng,
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const nextState = cloneState(state);

  if (!nextState.encounter) {
    throw new Error('Combat requires an active encounter');
  }

  if (action.targetId !== nextState.encounter.interceptor.id) {
    throw new Error('Combat target must be the active encounter interceptor');
  }

  if (action.spendDie === undefined) {
    throw new Error('Must spend a die for combat stance');
  }

  const { die, hand } = spendDie(nextState.player.dawnHand!, action.spendDie);
  nextState.player.dawnHand = hand;

  const encounter = nextState.encounter;
  const targetId = action.targetId;
  const dc = 10 + encounter.interceptor.tier;
  const fuelUsed =
    action.stance === 'run' ? RUN_FUEL_COST : action.stance === 'fight' ? FIGHT_FUEL_COST : 0;

  if (action.stance === 'run' && nextState.player.ship.fuel < RUN_FUEL_COST) {
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
      round: encounter.round,
      stance: 'run',
      continues: true,
      success: false,
      fuelUsed: 0,
      insufficientFuel: true,
    });
    continueEncounter(nextState, encounter, rng, events);
    return { state: nextState, events };
  }

  if (action.stance === 'fight' && nextState.player.ship.fuel < FIGHT_FUEL_COST) {
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
      round: encounter.round,
      stance: 'fight',
      continues: true,
      success: false,
      fuelUsed: 0,
      insufficientFuel: true,
    });
    continueEncounter(nextState, encounter, rng, events);
    return { state: nextState, events };
  }

  if (fuelUsed > 0) {
    nextState.player.ship.fuel -= fuelUsed;
  }

  const stat =
    action.stance === 'run' ? Stat.PILOT : action.stance === 'talk' ? Stat.TRADE : Stat.GUNS;
  const result = check(die, nextState.player.stats[stat], dc);
  events.push({ type: 'StatCheck', actor: 'Player', stat, dc, result });

  if (action.stance === 'fight' && result.success) {
    const enemyHull = Math.max(1, encounter.enemyHull ?? 1) - 1;
    encounter.enemyHull = enemyHull;
    events.push({
      type: 'CombatEvent',
      characterId: 'player',
      targetId,
      stance: 'fight',
      fuelUsed,
      success: true,
      enemyHullRemaining: enemyHull,
    });
    events.push({
      type: 'EncounterRound',
      encounterId: encounter.id,
      round: encounter.round,
      stance: 'fight',
      continues: enemyHull > 0,
      success: true,
      fuelUsed,
    });

    if (enemyHull <= 0) {
      resolveEncounter(nextState, encounter, events, 'defeated');
    } else {
      continueEncounter(nextState, encounter, rng, events);
    }
    return { state: nextState, events };
  }

  events.push({
    type: 'CombatEvent',
    characterId: 'player',
    targetId,
    stance: action.stance,
    fuelUsed,
    success: result.success,
  });

  if (result.success) {
    events.push({
      type: 'EncounterRound',
      encounterId: encounter.id,
      round: encounter.round,
      stance: action.stance,
      continues: false,
      success: true,
      fuelUsed,
    });
    resolveEncounter(
      nextState,
      encounter,
      events,
      action.stance === 'run' ? 'escaped' : 'talked-down',
    );
    return { state: nextState, events };
  }

  if (action.stance === 'talk') {
    const amount = tributeForRound(encounter.round);
    const refused = enemyRefusesTribute(encounter, rng, events);
    const affordable = nextState.player.credits >= amount;
    events.push({
      type: 'TributeDemanded',
      encounterId: encounter.id,
      round: encounter.round,
      amount,
      refused,
      affordable,
    });

    if (!refused && affordable) {
      nextState.player.credits -= amount;
      events.push({
        type: 'TributePaid',
        encounterId: encounter.id,
        round: encounter.round,
        amount,
        creditsRemaining: nextState.player.credits,
      });
      events.push({
        type: 'EncounterRound',
        encounterId: encounter.id,
        round: encounter.round,
        stance: 'talk',
        continues: false,
        success: false,
        fuelUsed,
      });
      resolveEncounter(nextState, encounter, events, 'talked-down');
      return { state: nextState, events };
    }
  }

  events.push({
    type: 'EncounterRound',
    encounterId: encounter.id,
    round: encounter.round,
    stance: action.stance,
    continues: true,
    success: false,
    fuelUsed,
  });
  continueEncounter(nextState, encounter, rng, events);

  return { state: nextState, events };
}
