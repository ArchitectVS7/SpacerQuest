import { CARGO_TYPES } from './cargo.js';
import { NPC_PROFILES } from './cast.js';
import { DEEDS } from './deeds.js';
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

    validateNumberMatcher(errors, `${path}.trigger.day`, storylet.trigger.day);
    storylet.trigger.flags?.forEach((matcher, flagIndex) =>
      validateFlagMatcher(errors, `${path}.trigger.flags[${flagIndex}]`, matcher),
    );

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
  });

  storylets.forEach((storylet, index) => {
    if (storylet.trigger.scheduledOnly && !scheduledTargets.has(storylet.id)) {
      errors.push(
        `storylets[${index}](${storylet.id}) is scheduledOnly but no storylet schedules it`,
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
