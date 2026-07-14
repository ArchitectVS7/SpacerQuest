import { STORYLETS } from '@spacerquest/content';
import type {
  FlagEffect,
  FlagMatcher,
  NumberMatcher,
  StoryletChoiceDefinition,
  StoryletDefinition,
  StoryletEffects,
} from '@spacerquest/content';
import { renownRankIndex } from './deeds.js';
import { check, spendDie } from './dice.js';
import { applyDisposition } from './npc.js';
import {
  decodeFragment,
  fragmentCount,
  grantFragment,
  hasAnyUndecoded,
  hasUndecodedFragment,
} from './nemesis.js';
import { SeededRng } from './rng.js';
import { GameEvent, GameState, PlayerAction, StoryletOffer } from './types.js';

function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

function matchesNumber(value: number, matcher: NumberMatcher | undefined): boolean {
  if (!matcher) return true;
  if (matcher.equals !== undefined && value !== matcher.equals) return false;
  if (matcher.gte !== undefined && value < matcher.gte) return false;
  if (matcher.lte !== undefined && value > matcher.lte) return false;
  return true;
}

function matchesFlag(value: unknown, matcher: FlagMatcher): boolean {
  if (matcher.exists !== undefined) {
    const exists = value !== undefined;
    if (exists !== matcher.exists) return false;
  }
  if (matcher.equals !== undefined && value !== matcher.equals) return false;
  if (matcher.notEquals !== undefined && value === matcher.notEquals) return false;
  if (matcher.gte !== undefined && (typeof value !== 'number' || value < matcher.gte)) return false;
  if (matcher.lte !== undefined && (typeof value !== 'number' || value > matcher.lte)) return false;
  return true;
}

function hasDueSchedule(state: GameState, storyletId: string): boolean {
  return state.storylets.scheduled.some(
    (schedule) => schedule.storyletId === storyletId && schedule.dueDay <= state.day,
  );
}

function isCompletedForNow(state: GameState, storylet: StoryletDefinition): boolean {
  const completedDay = state.storylets.completed[storylet.id];
  if (completedDay === undefined) return false;
  if (storylet.repeat === 'daily') return completedDay === state.day;
  return true;
}

// Exported so engine tests can exercise the trigger MECHANISM directly against
// synthetic StoryletDefinition fixtures (T-1302), without adding fixture-only
// content to the shipped STORYLETS table.
export function triggerMatches(state: GameState, storylet: StoryletDefinition): boolean {
  const trigger = storylet.trigger;

  if (trigger.scheduledOnly && !hasDueSchedule(state, storylet.id)) {
    return false;
  }
  if (trigger.systemIds && !trigger.systemIds.includes(state.player.currentSystemId)) {
    return false;
  }
  if (trigger.eras && !trigger.eras.includes(state.era)) {
    return false;
  }
  if (!matchesNumber(state.day, trigger.day)) {
    return false;
  }
  if (trigger.cargo?.activeContractCargoType !== undefined) {
    if (state.player.activeContract?.cargoType !== trigger.cargo.activeContractCargoType) {
      return false;
    }
  }
  if (trigger.cargo?.activeContractDestination !== undefined) {
    if (state.player.activeContract?.destination !== trigger.cargo.activeContractDestination) {
      return false;
    }
  }
  if (trigger.npc) {
    const npc = state.npcs.find((candidate) => candidate.id === trigger.npc?.id);
    if (!npc) return false;
    if (trigger.npc.inCurrentSystem && npc.currentSystemId !== state.player.currentSystemId) {
      return false;
    }
    if (!matchesNumber(npc.disposition, trigger.npc.disposition)) {
      return false;
    }
  }
  for (const matcher of trigger.flags ?? []) {
    if (!matchesFlag(state.flags[matcher.name], matcher)) {
      return false;
    }
  }
  if (trigger.nemesis) {
    const file = state.player.nemesisFile;
    if (
      trigger.nemesis.minFragments !== undefined &&
      fragmentCount(file) < trigger.nemesis.minFragments
    ) {
      return false;
    }
    if (trigger.nemesis.hasUndecoded === true && !hasAnyUndecoded(file)) {
      return false;
    }
    if (
      trigger.nemesis.hasUndecodedFragmentId !== undefined &&
      !hasUndecodedFragment(file, trigger.nemesis.hasUndecodedFragmentId)
    ) {
      return false;
    }
  }

  // T-1302: gate on the LIVE world era event (state.eraEvent) — the "economy
  // delivers the story" hook (PRD §8.3). A defId pins the event kind; an
  // inAffectedSystem flag requires the ship to be inside the epicentre.
  if (trigger.eraEvent) {
    const event = state.eraEvent;
    if (!event) return false;
    if (trigger.eraEvent.defId !== undefined && event.defId !== trigger.eraEvent.defId) {
      return false;
    }
    if (
      trigger.eraEvent.inAffectedSystem &&
      !event.affectedSystemIds.includes(state.player.currentSystemId)
    ) {
      return false;
    }
  }

  // T-1302: gate on renown rank — the player's registry rank must sit at or
  // above the required minimum in the canonical rank order.
  if (
    trigger.renown &&
    renownRankIndex(state.player.registry.renownRank) < renownRankIndex(trigger.renown.minRank)
  ) {
    return false;
  }

  // T-1302: gate on possessing an EARNED deed.
  if (trigger.deed && !state.player.registry.earned.some((d) => d.id === trigger.deed?.id)) {
    return false;
  }

  return true;
}

function offerFor(state: GameState, storylet: StoryletDefinition): StoryletOffer {
  return {
    storyletId: storylet.id,
    title: storylet.title,
    prose: storylet.prose,
    choices: storylet.choices.map((choice) => ({
      id: choice.id,
      label: choice.label,
      prose: choice.prose,
      ...(choice.requirements ? { requirements: choice.requirements } : {}),
    })),
    day: state.day,
    scheduled: hasDueSchedule(state, storylet.id),
  };
}

export function eligibleStorylets(state: GameState): StoryletOffer[] {
  return STORYLETS.filter(
    (storylet) => !isCompletedForNow(state, storylet) && triggerMatches(state, storylet),
  ).map((storylet) => offerFor(state, storylet));
}

export function refreshAvailableStorylets(state: GameState): {
  state: GameState;
  events: GameEvent[];
} {
  const nextState = cloneState(state);
  const nextAvailable = eligibleStorylets(nextState);
  const events: GameEvent[] = [];

  nextState.storylets.available = nextAvailable;
  for (const offer of nextAvailable) {
    if (nextState.storylets.offeredToday.includes(offer.storyletId)) {
      continue;
    }
    nextState.storylets.offeredToday.push(offer.storyletId);
    events.push({
      type: 'StoryletOffered',
      day: nextState.day,
      storyletId: offer.storyletId,
      scheduled: offer.scheduled,
    });
  }

  return { state: nextState, events };
}

function spendRequiredDie(
  state: GameState,
  action: Extract<PlayerAction, { type: 'Storylet' }>,
  events: GameEvent[],
  choice: StoryletChoiceDefinition,
): boolean | undefined {
  const statCheck = choice.requirements?.statCheck;
  const requiresDie = choice.requirements?.spendDie || statCheck;
  if (!requiresDie) {
    return undefined;
  }
  if (action.spendDie === undefined || !state.player.dawnHand) {
    return undefined;
  }

  const { die, hand } = spendDie(state.player.dawnHand, action.spendDie);
  state.player.dawnHand = hand;

  if (!statCheck) {
    return undefined;
  }

  const result = check(die, state.player.stats[statCheck.stat], statCheck.dc);
  events.push({
    type: 'StatCheck',
    actor: 'Player',
    stat: statCheck.stat,
    dc: statCheck.dc,
    result,
    actionContext: 'storylet',
  });
  return result.success;
}

function applyFlagEffect(
  state: GameState,
  effect: FlagEffect,
): { eventEffect: GameEvent & { type: 'StoryletEffectApplied' }; mutated: boolean } {
  if ('clear' in effect) {
    if (state.flags[effect.name] === undefined) {
      return {
        eventEffect: {
          type: 'StoryletEffectApplied',
          day: state.day,
          storyletId: '',
          choiceId: '',
          effect: 'flag-cleared',
          flag: effect.name,
        },
        mutated: false,
      };
    }
    delete state.flags[effect.name];
    return {
      eventEffect: {
        type: 'StoryletEffectApplied',
        day: state.day,
        storyletId: '',
        choiceId: '',
        effect: 'flag-cleared',
        flag: effect.name,
      },
      mutated: true,
    };
  }

  const value = 'delta' in effect ? (state.flags[effect.name] ?? 0) : effect.value;
  const nextValue =
    'delta' in effect ? (typeof value === 'number' ? value : 0) + effect.delta : value;
  state.flags[effect.name] = nextValue;
  return {
    eventEffect: {
      type: 'StoryletEffectApplied',
      day: state.day,
      storyletId: '',
      choiceId: '',
      effect: 'flag',
      flag: effect.name,
      value: nextValue,
      ...('delta' in effect ? { amount: effect.delta } : {}),
    },
    mutated: true,
  };
}

function stampEffect(
  event: GameEvent & { type: 'StoryletEffectApplied' },
  storyletId: string,
  choiceId: string,
): GameEvent {
  return { ...event, storyletId, choiceId };
}

function applyEffects(
  state: GameState,
  storyletId: string,
  choiceId: string,
  effects: StoryletEffects | undefined,
): GameEvent[] {
  if (!effects) return [];

  const events: GameEvent[] = [];

  if (effects.credits !== undefined) {
    state.player.credits += effects.credits;
    events.push({
      type: 'StoryletEffectApplied',
      day: state.day,
      storyletId,
      choiceId,
      effect: 'credits',
      amount: effects.credits,
    });
  }

  if (effects.fuel !== undefined) {
    const before = state.player.ship.fuel;
    state.player.ship.fuel = Math.max(
      0,
      Math.min(state.player.ship.maxFuel, state.player.ship.fuel + effects.fuel),
    );
    events.push({
      type: 'StoryletEffectApplied',
      day: state.day,
      storyletId,
      choiceId,
      effect: 'fuel',
      amount: state.player.ship.fuel - before,
    });
  }

  if (effects.cargo?.clearActiveContract && state.player.activeContract) {
    state.player.activeContract = null;
    events.push({
      type: 'StoryletEffectApplied',
      day: state.day,
      storyletId,
      choiceId,
      effect: 'active-contract-cleared',
    });
  }

  const addedContract = effects.cargo?.addManifestContract;
  if (addedContract) {
    state.market.manifestBoard.push(addedContract);
    events.push({
      type: 'StoryletEffectApplied',
      day: state.day,
      storyletId,
      choiceId,
      effect: 'manifest-contract-added',
      cargoType: addedContract.cargoType,
      destination: addedContract.destination,
    });
  }

  for (const flagEffect of effects.flags ?? []) {
    const { eventEffect, mutated } = applyFlagEffect(state, flagEffect);
    if (mutated) {
      events.push(stampEffect(eventEffect, storyletId, choiceId));
    }
  }

  for (const disposition of effects.disposition ?? []) {
    const npc = state.npcs.find((candidate) => candidate.id === disposition.npcId);
    if (!npc) continue;
    // Route through the shared T-106 disposition mover (one clamp, one
    // DispositionChanged emitter), then — mirroring the fuel-effect pattern —
    // report the ACTUAL applied delta, not the requested one, so a clamped
    // change never overstates itself.
    const before = npc.disposition;
    applyDisposition(state, disposition.npcId, disposition.delta, 'storylet', events);
    events.push({
      type: 'StoryletEffectApplied',
      day: state.day,
      storyletId,
      choiceId,
      effect: 'disposition',
      npcId: disposition.npcId,
      amount: npc.disposition - before,
    });
  }

  for (const progress of effects.deedProgress ?? []) {
    events.push({
      type: 'StoryletDeedProgress',
      day: state.day,
      storyletId,
      choiceId,
      deedId: progress.deedId,
      amount: progress.amount,
    });
  }

  for (const schedule of effects.schedule ?? []) {
    const dueDay = state.day + schedule.delayDays;
    state.storylets.scheduled.push({
      storyletId: schedule.storyletId,
      dueDay,
      sourceStoryletId: storyletId,
      sourceChoiceId: choiceId,
    });
    events.push({
      type: 'StoryletScheduled',
      day: state.day,
      storyletId,
      choiceId,
      scheduledStoryletId: schedule.storyletId,
      dueDay,
    });
  }

  // T-111b: grant a Signal Fragment into the Nemesis file. Dedupe keeps the
  // count monotonic — a repeat grant emits nothing.
  // T-1302: the source is now storylet-parameterized (`effects.fragmentSource`),
  // so a grant records its TRUE origin — a derelict courier drop, a beacon, the
  // Wise One broker — instead of always reading 'wise-one'. Defaults to
  // 'wise-one' when omitted, preserving the Day-30 hook.
  if (effects.grantFragment !== undefined) {
    const source = effects.fragmentSource ?? 'wise-one';
    const added = grantFragment(state.player.nemesisFile, effects.grantFragment, source, state.day);
    if (added) {
      events.push({
        type: 'FragmentAcquired',
        day: state.day,
        fragmentId: effects.grantFragment,
        source,
        fragmentCount: fragmentCount(state.player.nemesisFile),
      });
      events.push({
        type: 'StoryletEffectApplied',
        day: state.day,
        storyletId,
        choiceId,
        effect: 'fragment-granted',
        fragmentId: effects.grantFragment,
      });
    }
  }

  // T-111b: the Sage decodes a held fragment into lore. No-op (no event) if the
  // fragment is absent or already decoded.
  if (effects.decodeFragment !== undefined) {
    const decoded = decodeFragment(state.player.nemesisFile, effects.decodeFragment);
    if (decoded) {
      events.push({
        type: 'FragmentDecoded',
        day: state.day,
        fragmentId: effects.decodeFragment,
      });
      events.push({
        type: 'StoryletEffectApplied',
        day: state.day,
        storyletId,
        choiceId,
        effect: 'fragment-decoded',
        fragmentId: effects.decodeFragment,
      });
    }
  }

  return events;
}

function blocked(
  state: GameState,
  action: Extract<PlayerAction, { type: 'Storylet' }>,
  reason: Extract<GameEvent, { type: 'StoryletChoiceBlocked' }>['reason'],
): { state: GameState; events: GameEvent[] } {
  return {
    state,
    events: [
      {
        type: 'StoryletChoiceBlocked',
        day: state.day,
        storyletId: action.storyletId,
        choiceId: action.choiceId,
        reason,
      },
    ],
  };
}

export function resolveStoryletChoice(
  state: GameState,
  action: Extract<PlayerAction, { type: 'Storylet' }>,
  _rng: SeededRng,
): { state: GameState; events: GameEvent[] } {
  const nextState = cloneState(state);
  const offer = nextState.storylets.available.find(
    (candidate) => candidate.storyletId === action.storyletId,
  );
  if (!offer) {
    return blocked(nextState, action, 'not-available');
  }

  const storylets: readonly StoryletDefinition[] = STORYLETS;
  const storylet = storylets.find((candidate) => candidate.id === action.storyletId);
  const choice = storylet?.choices.find((candidate) => candidate.id === action.choiceId);
  if (!storylet || !choice) {
    return blocked(nextState, action, 'unknown-choice');
  }

  if (!matchesNumber(nextState.player.credits, choice.requirements?.credits)) {
    return blocked(nextState, action, 'insufficient-credits');
  }

  const requiresDie = choice.requirements?.spendDie || choice.requirements?.statCheck;
  const hand = nextState.player.dawnHand;
  if (
    requiresDie &&
    (action.spendDie === undefined ||
      !hand ||
      action.spendDie < 0 ||
      action.spendDie >= hand.dice.length ||
      hand.spent[action.spendDie])
  ) {
    return blocked(nextState, action, 'missing-die');
  }

  const events: GameEvent[] = [];
  const success = spendRequiredDie(nextState, action, events, choice);

  events.push(
    ...applyEffects(nextState, storylet.id, choice.id, choice.effects),
    ...applyEffects(
      nextState,
      storylet.id,
      choice.id,
      success === undefined ? undefined : success ? choice.successEffects : choice.failureEffects,
    ),
  );

  nextState.storylets.completed[storylet.id] = nextState.day;
  nextState.storylets.available = nextState.storylets.available.filter(
    (candidate) => candidate.storyletId !== storylet.id,
  );
  nextState.storylets.scheduled = nextState.storylets.scheduled.filter(
    (schedule) => schedule.storyletId !== storylet.id || schedule.dueDay > nextState.day,
  );

  const resolvedEvent: GameEvent = {
    type: 'StoryletChoiceResolved',
    day: nextState.day,
    storyletId: storylet.id,
    choiceId: choice.id,
    ...(success === undefined ? {} : { success }),
  };
  events.push(resolvedEvent);

  return { state: nextState, events };
}
