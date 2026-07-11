import {
  FLAWS,
  Stat,
  RUN_FUEL_COST,
  FIGHT_FUEL_COST,
  TRIBUTE_BASE_MULTIPLIER,
  TRIBUTE_MAX,
} from '@spacerquest/content';
import { GameState, GameEvent, PlayerAction, EncounterState, ShipComponentId } from '../types.js';
import { SeededRng } from '../rng.js';
import { check, spendDie } from '../dice.js';
import { completePendingTravel } from './travel.js';
import { applyDisposition } from '../npc.js';
import { applySuccession } from '../legacy.js';

// Combat balance numbers are data — sourced from @spacerquest/content
// (see packages/content/src/combat.ts for values, foundation citation, and the
// intentional round-cap divergence). Re-exported here so existing engine/sim
// importers of these names keep resolving through the engine surface.
export { RUN_FUEL_COST, FIGHT_FUEL_COST, TRIBUTE_BASE_MULTIPLIER, TRIBUTE_MAX };

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
  if (!flawDef || !flawDef.refusesTribute) return false;

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
  resolution: 'escaped' | 'talked-down' | 'defeated' | 'interceptor-fled',
): void {
  events.push({
    type: 'EncounterResolved',
    encounterId: encounter.id,
    resolution,
    round: encounter.round,
    interceptorId: encounter.interceptor.id,
  });
  state.encounter = null;

  // T-106 disposition: named interceptors remember how it ended.
  // - defeated: a grudge (-3) — you shot their ship out from under them.
  // - escaped: the player fled and the interceptor keeps the field (+1) —
  //   relief, no blood spilled, no grudge formed (documented design call).
  // - interceptor-fled (driven off by a bonded third party): no change; their
  //   quarrel is with the rescuer, not the player.
  if (encounter.interceptor.source === 'named') {
    if (resolution === 'defeated') {
      applyDisposition(state, encounter.interceptor.id, -3, 'defeat', events);
    } else if (resolution === 'escaped') {
      applyDisposition(state, encounter.interceptor.id, 1, 'player-fled', events);
    }
  }

  if (resolution === 'escaped') {
    state.player.currentSystemId = encounter.pendingTravel.origin;
    return;
  }

  completePendingTravel(state, encounter, events);
}

/** T-106 bond hook: a bonded NPC drives the interceptor off at dusk — the
 *  encounter resolves before the dusk free attack and pending travel
 *  completes. Exposed for day.ts (endDay). */
export function resolveInterceptorFled(state: GameState, events: GameEvent[]): void {
  if (!state.encounter) return;
  resolveEncounter(state, state.encounter, events, 'interceptor-fled');
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
      // T-108: ShipLost is the trigger — succession resolves immediately while
      // the encounter still carries its origin (where the wreck is towed).
      events.push(
        ...applySuccession(state, {
          encounter,
          interceptorId: encounter.interceptor.id,
        }),
      );
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

  // Talk is the credit-cost corner of the triangle: a deal always costs the
  // round's tribute (or a nat-20 waiver). Handled ahead of the generic check so
  // the flaw-refusal roll fires first (Repair A).
  if (action.stance === 'talk') {
    return resolveTalk(nextState, encounter, targetId, die, dc, rng, events);
  }

  const stat = action.stance === 'run' ? Stat.PILOT : Stat.GUNS;
  const result = check(die, nextState.player.stats[stat], dc);
  events.push({ type: 'StatCheck', actor: 'Player', stat, dc, result });

  if (action.stance === 'fight' && result.success) {
    const enemyHull = Math.max(1, encounter.enemyHull) - 1;
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
    // Only a successful run reaches here (talk is handled above, a fight win
    // returned earlier); a clean getaway escapes without completing travel.
    events.push({
      type: 'EncounterRound',
      encounterId: encounter.id,
      round: encounter.round,
      stance: action.stance,
      continues: false,
      success: true,
      fuelUsed,
    });
    resolveEncounter(nextState, encounter, events, 'escaped');
    return { state: nextState, events };
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

/** Talk resolution: tribute always has a price. See Repair A for the full
 *  decision table (flaw refusal → nat-20 waiver → pay → unaffordable → refuse). */
function resolveTalk(
  state: GameState,
  encounter: EncounterState,
  targetId: string,
  die: number,
  dc: number,
  rng: SeededRng,
  events: GameEvent[],
): { state: GameState; events: GameEvent[] } {
  const round = encounter.round;
  const amount = tributeForRound(round);

  // 1. Flaw refusal FIRST: some interceptors want blood, not credits. Talking
  //    cannot resolve — the enemy presses on and the tribute escalates.
  if (enemyRefusesTribute(encounter, rng, events)) {
    const affordable = state.player.credits >= amount;
    events.push({
      type: 'CombatEvent',
      characterId: 'player',
      targetId,
      stance: 'talk',
      fuelUsed: 0,
      success: false,
    });
    events.push({
      type: 'TributeDemanded',
      encounterId: encounter.id,
      round,
      amount,
      refused: true,
      affordable,
    });
    events.push({
      type: 'EncounterRound',
      encounterId: encounter.id,
      round,
      stance: 'talk',
      continues: true,
      success: false,
      fuelUsed: 0,
    });
    continueEncounter(state, encounter, rng, events);
    return { state, events };
  }

  // 2. Talk stat check.
  const result = check(die, state.player.stats[Stat.TRADE], dc);
  events.push({ type: 'StatCheck', actor: 'Player', stat: Stat.TRADE, dc, result });
  const affordable = state.player.credits >= amount;
  events.push({
    type: 'CombatEvent',
    characterId: 'player',
    targetId,
    stance: 'talk',
    fuelUsed: 0,
    success: result.success,
  });

  // Natural 20: the interceptor waves you through free of charge.
  if (result.nat20) {
    events.push({
      type: 'TributeDemanded',
      encounterId: encounter.id,
      round,
      amount,
      refused: false,
      affordable,
      waived: true,
    });
    events.push({
      type: 'EncounterRound',
      encounterId: encounter.id,
      round,
      stance: 'talk',
      continues: false,
      success: true,
      fuelUsed: 0,
    });
    resolveEncounter(state, encounter, events, 'talked-down');
    return { state, events };
  }

  // Non-nat-20 success: the interceptor accepts this round's tribute.
  if (result.success) {
    events.push({
      type: 'TributeDemanded',
      encounterId: encounter.id,
      round,
      amount,
      refused: false,
      affordable,
    });

    if (affordable) {
      state.player.credits -= amount;
      events.push({
        type: 'TributePaid',
        encounterId: encounter.id,
        round,
        amount,
        creditsRemaining: state.player.credits,
      });
      // T-106 disposition: a named interceptor who got paid remembers the
      // easy mark fondly (+2).
      if (encounter.interceptor.source === 'named') {
        applyDisposition(state, encounter.interceptor.id, 2, 'tribute', events);
      }
      events.push({
        type: 'EncounterRound',
        encounterId: encounter.id,
        round,
        stance: 'talk',
        continues: false,
        success: true,
        fuelUsed: 0,
      });
      resolveEncounter(state, encounter, events, 'talked-down');
      return { state, events };
    }

    // Deal struck but the tank of credits is empty — no payment, encounter runs on.
    events.push({
      type: 'EncounterRound',
      encounterId: encounter.id,
      round,
      stance: 'talk',
      continues: true,
      success: true,
      fuelUsed: 0,
    });
    continueEncounter(state, encounter, rng, events);
    return { state, events };
  }

  // Failure: they refuse to bargain this round — no tribute is demanded, and the
  // price escalates for the next attempt.
  events.push({
    type: 'EncounterRound',
    encounterId: encounter.id,
    round,
    stance: 'talk',
    continues: true,
    success: false,
    fuelUsed: 0,
  });
  continueEncounter(state, encounter, rng, events);
  return { state, events };
}
