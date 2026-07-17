import { CARGO_TYPES } from './cargo.js';
import { NPC_PROFILES } from './cast.js';
import { DEEDS, RENOWN_RANKS } from './deeds.js';
import { ERA_EVENTS_BY_ID } from './eraEvents.js';
import { FACTION_IDS } from './factions.js';
import { FRAGMENT_SOURCES, SIGNAL_FRAGMENTS } from './nemesis.js';
import { Stat } from './stats.js';
import { STAR_SYSTEMS } from './systems.js';
import type {
  FlagEffect,
  FlagMatcher,
  NumberMatcher,
  StoryletDefinition,
  StoryletEffects,
} from './storylets.js';

const FLAG_NAME_PATTERN = /^[a-z][a-z0-9_.-]*$/;

function isFiniteInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value);
}

function validateInteger(errors: string[], path: string, value: unknown): void {
  if (!isFiniteInteger(value)) {
    errors.push(`${path} must be a finite integer`);
  }
}

function validateNumberMatcher(
  errors: string[],
  path: string,
  matcher: NumberMatcher | undefined,
): void {
  if (!matcher) {
    return;
  }

  const keys = ['equals', 'gte', 'lte'] as const;
  if (!keys.some((key) => matcher[key] !== undefined)) {
    errors.push(`${path} must define at least one numeric condition`);
  }
  for (const key of keys) {
    if (matcher[key] !== undefined) {
      validateInteger(errors, `${path}.${key}`, matcher[key]);
    }
  }
}

function validateFlagName(errors: string[], path: string, name: string): void {
  if (!FLAG_NAME_PATTERN.test(name)) {
    errors.push(`${path} must match ${FLAG_NAME_PATTERN}`);
  }
}

function validateFlagMatcher(errors: string[], path: string, matcher: FlagMatcher): void {
  validateFlagName(errors, `${path}.name`, matcher.name);
  if (matcher.gte !== undefined) validateInteger(errors, `${path}.gte`, matcher.gte);
  if (matcher.lte !== undefined) validateInteger(errors, `${path}.lte`, matcher.lte);
  if (
    matcher.exists === undefined &&
    matcher.equals === undefined &&
    matcher.notEquals === undefined &&
    matcher.gte === undefined &&
    matcher.lte === undefined
  ) {
    errors.push(`${path} must define at least one flag condition`);
  }
}

function validateFlagEffect(errors: string[], path: string, effect: FlagEffect): void {
  validateFlagName(errors, `${path}.name`, effect.name);
  if ('delta' in effect) {
    validateInteger(errors, `${path}.delta`, effect.delta);
  }
}

function validateEffects(
  errors: string[],
  path: string,
  effects: StoryletEffects | undefined,
  storyletIds: ReadonlySet<string>,
): void {
  if (!effects) {
    return;
  }

  if (effects.credits !== undefined) validateInteger(errors, `${path}.credits`, effects.credits);
  if (effects.fuel !== undefined) validateInteger(errors, `${path}.fuel`, effects.fuel);

  const contract = effects.cargo?.addManifestContract;
  if (contract) {
    validateInteger(errors, `${path}.cargo.addManifestContract.destination`, contract.destination);
    validateInteger(errors, `${path}.cargo.addManifestContract.cargoType`, contract.cargoType);
    validateInteger(errors, `${path}.cargo.addManifestContract.payment`, contract.payment);
    validateInteger(errors, `${path}.cargo.addManifestContract.pods`, contract.pods);
    if (!STAR_SYSTEMS[contract.destination]) {
      errors.push(`${path}.cargo.addManifestContract.destination is not a valid system ID`);
    }
    if (!CARGO_TYPES[contract.cargoType]) {
      errors.push(`${path}.cargo.addManifestContract.cargoType is not a valid cargo ID`);
    }
  }

  effects.flags?.forEach((effect, index) =>
    validateFlagEffect(errors, `${path}.flags[${index}]`, effect),
  );

  effects.disposition?.forEach((effect, index) => {
    if (!NPC_PROFILES.some((npc) => npc.id === effect.npcId)) {
      errors.push(`${path}.disposition[${index}].npcId is not a valid NPC ID`);
    }
    validateInteger(errors, `${path}.disposition[${index}].delta`, effect.delta);
  });

  // T-1503: reputation effect — each entry's faction must be a known galactic
  // power and its delta a finite integer (mirrors the disposition check).
  effects.reputation?.forEach((effect, index) => {
    if (!FACTION_IDS.includes(effect.faction)) {
      errors.push(`${path}.reputation[${index}].faction is not a valid faction ID`);
    }
    validateInteger(errors, `${path}.reputation[${index}].delta`, effect.delta);
  });

  effects.deedProgress?.forEach((effect, index) => {
    if (!DEEDS.some((deed) => deed.id === effect.deedId)) {
      errors.push(`${path}.deedProgress[${index}].deedId is not a valid deed ID`);
    }
    validateInteger(errors, `${path}.deedProgress[${index}].amount`, effect.amount);
  });

  effects.schedule?.forEach((schedule, index) => {
    if (!storyletIds.has(schedule.storyletId)) {
      errors.push(`${path}.schedule[${index}].storyletId is not a valid storylet ID`);
    }
    validateInteger(errors, `${path}.schedule[${index}].delayDays`, schedule.delayDays);
    if (schedule.delayDays < 0) {
      errors.push(`${path}.schedule[${index}].delayDays must be non-negative`);
    }
  });

  if (effects.grantFragment !== undefined && !SIGNAL_FRAGMENTS[effects.grantFragment]) {
    errors.push(`${path}.grantFragment is not a valid Signal Fragment ID`);
  }
  if (effects.decodeFragment !== undefined && !SIGNAL_FRAGMENTS[effects.decodeFragment]) {
    errors.push(`${path}.decodeFragment is not a valid Signal Fragment ID`);
  }
  if (effects.fragmentSource !== undefined) {
    // T-1302: a source only means something alongside an actual grant, and must
    // be one of the known source literals (mirrored from the engine's serialized
    // SignalFragmentRecord['source']).
    if (effects.grantFragment === undefined) {
      errors.push(`${path}.fragmentSource is set but there is no grantFragment to source`);
    }
    if (!FRAGMENT_SOURCES.includes(effects.fragmentSource)) {
      errors.push(`${path}.fragmentSource is not a valid fragment source`);
    }
  }
}

export function validateStorylets(storylets: readonly StoryletDefinition[]): string[] {
  const errors: string[] = [];
  const storyletIds = new Set<string>();
  const scheduledTargets = new Set<string>();

  storylets.forEach((storylet, index) => {
    const path = `storylets[${index}](${storylet.id})`;
    if (storyletIds.has(storylet.id)) {
      errors.push(`${path}.id is duplicated`);
    }
    storyletIds.add(storylet.id);
  });

  storylets.forEach((storylet, index) => {
    const path = `storylets[${index}](${storylet.id})`;
    const choiceIds = new Set<string>();

    if (storylet.choices.length < 2 || storylet.choices.length > 4) {
      errors.push(`${path}.choices must contain 2-4 choices`);
    }

    storylet.trigger.systemIds?.forEach((systemId, systemIndex) => {
      validateInteger(errors, `${path}.trigger.systemIds[${systemIndex}]`, systemId);
      if (!STAR_SYSTEMS[systemId]) {
        errors.push(`${path}.trigger.systemIds[${systemIndex}] is not a valid system ID`);
      }
    });

    const cargo = storylet.trigger.cargo;
    if (cargo?.activeContractCargoType !== undefined) {
      validateInteger(
        errors,
        `${path}.trigger.cargo.activeContractCargoType`,
        cargo.activeContractCargoType,
      );
      if (!CARGO_TYPES[cargo.activeContractCargoType]) {
        errors.push(`${path}.trigger.cargo.activeContractCargoType is not a valid cargo ID`);
      }
    }
    if (cargo?.activeContractDestination !== undefined) {
      validateInteger(
        errors,
        `${path}.trigger.cargo.activeContractDestination`,
        cargo.activeContractDestination,
      );
      if (!STAR_SYSTEMS[cargo.activeContractDestination]) {
        errors.push(`${path}.trigger.cargo.activeContractDestination is not a valid system ID`);
      }
    }

    if (storylet.trigger.npc) {
      if (!NPC_PROFILES.some((npc) => npc.id === storylet.trigger.npc?.id)) {
        errors.push(`${path}.trigger.npc.id is not a valid NPC ID`);
      }
      validateNumberMatcher(
        errors,
        `${path}.trigger.npc.disposition`,
        storylet.trigger.npc.disposition,
      );
    }

    // T-1503: reputation trigger — faction must be a known power, and it must
    // carry at least one numeric condition (equals/gte/lte, via NumberMatcher).
    const rep = storylet.trigger.reputation;
    if (rep) {
      if (!FACTION_IDS.includes(rep.faction)) {
        errors.push(`${path}.trigger.reputation.faction is not a valid faction ID`);
      }
      validateNumberMatcher(errors, `${path}.trigger.reputation`, rep);
    }

    validateNumberMatcher(errors, `${path}.trigger.day`, storylet.trigger.day);
    storylet.trigger.flags?.forEach((matcher, flagIndex) =>
      validateFlagMatcher(errors, `${path}.trigger.flags[${flagIndex}]`, matcher),
    );

    const nemesis = storylet.trigger.nemesis;
    if (nemesis) {
      if (
        nemesis.minFragments === undefined &&
        nemesis.hasUndecoded === undefined &&
        nemesis.hasUndecodedFragmentId === undefined
      ) {
        errors.push(`${path}.trigger.nemesis must define at least one condition`);
      }
      if (nemesis.minFragments !== undefined) {
        validateInteger(errors, `${path}.trigger.nemesis.minFragments`, nemesis.minFragments);
        if (nemesis.minFragments < 0) {
          errors.push(`${path}.trigger.nemesis.minFragments must be non-negative`);
        }
      }
      if (
        nemesis.hasUndecodedFragmentId !== undefined &&
        !SIGNAL_FRAGMENTS[nemesis.hasUndecodedFragmentId]
      ) {
        errors.push(
          `${path}.trigger.nemesis.hasUndecodedFragmentId is not a valid Signal Fragment ID`,
        );
      }
    }

    // T-1302: era-event trigger — must define at least one condition and, when
    // pinned, a real ERA_EVENTS defId.
    const eraEvent = storylet.trigger.eraEvent;
    if (eraEvent) {
      if (eraEvent.defId === undefined && eraEvent.inAffectedSystem === undefined) {
        errors.push(`${path}.trigger.eraEvent must define at least one condition`);
      }
      if (eraEvent.defId !== undefined && !ERA_EVENTS_BY_ID[eraEvent.defId]) {
        errors.push(`${path}.trigger.eraEvent.defId is not a valid era-event ID`);
      }
    }

    // T-1302: renown trigger — minRank must be a known renown rank.
    const renown = storylet.trigger.renown;
    if (renown && !(renown.minRank in RENOWN_RANKS)) {
      errors.push(`${path}.trigger.renown.minRank is not a valid renown rank`);
    }

    // T-1302: deed trigger — id must be a known deed.
    const deed = storylet.trigger.deed;
    if (deed && !DEEDS.some((d) => d.id === deed.id)) {
      errors.push(`${path}.trigger.deed.id is not a valid deed ID`);
    }

    storylet.choices.forEach((choice, choiceIndex) => {
      const choicePath = `${path}.choices[${choiceIndex}](${choice.id})`;
      if (choiceIds.has(choice.id)) {
        errors.push(`${choicePath}.id is duplicated within storylet`);
      }
      choiceIds.add(choice.id);

      validateNumberMatcher(
        errors,
        `${choicePath}.requirements.credits`,
        choice.requirements?.credits,
      );
      const check = choice.requirements?.statCheck;
      if (check) {
        if (!Object.values(Stat).includes(check.stat)) {
          errors.push(`${choicePath}.requirements.statCheck.stat is not a valid stat`);
        }
        validateInteger(errors, `${choicePath}.requirements.statCheck.dc`, check.dc);
      }

      for (const effects of [choice.effects, choice.successEffects, choice.failureEffects]) {
        effects?.schedule?.forEach((schedule) => scheduledTargets.add(schedule.storyletId));
      }
      validateEffects(errors, `${choicePath}.effects`, choice.effects, storyletIds);
      validateEffects(errors, `${choicePath}.successEffects`, choice.successEffects, storyletIds);
      validateEffects(errors, `${choicePath}.failureEffects`, choice.failureEffects, storyletIds);
    });

    // T-1502 · abandonment path (PRD §8.1). graceDays must be a non-negative
    // integer, wireMessage a non-empty string, and its effects (if any) must
    // validate through the same rules a choice's effects do.
    const wire = storylet.wireResolution;
    if (wire) {
      validateInteger(errors, `${path}.wireResolution.graceDays`, wire.graceDays);
      if (typeof wire.graceDays === 'number' && wire.graceDays < 0) {
        errors.push(`${path}.wireResolution.graceDays must be non-negative`);
      }
      if (typeof wire.wireMessage !== 'string' || wire.wireMessage.length === 0) {
        errors.push(`${path}.wireResolution.wireMessage must be a non-empty string`);
      }
      validateEffects(errors, `${path}.wireResolution.effects`, wire.effects, storyletIds);
    }
  });

  storylets.forEach((storylet, index) => {
    if (storylet.trigger.scheduledOnly && !scheduledTargets.has(storylet.id)) {
      errors.push(
        `storylets[${index}](${storylet.id}) is scheduledOnly but no storylet schedules it`,
      );
    }
    // T-1502 · a wireResolution only works off a scheduled entry (the dusk sweep
    // reads state.storylets.scheduled), so any storylet carrying one must itself
    // be a scheduled target.
    if (storylet.wireResolution && !scheduledTargets.has(storylet.id)) {
      errors.push(
        `storylets[${index}](${storylet.id}) has a wireResolution but no storylet schedules it`,
      );
    }
  });

  return errors;
}

export function defineStorylets<const T extends readonly StoryletDefinition[]>(storylets: T): T {
  const errors = validateStorylets(storylets);
  if (errors.length > 0) {
    throw new Error(`Invalid storylet content:\n - ${errors.join('\n - ')}`);
  }
  return storylets;
}
