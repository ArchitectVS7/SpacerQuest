/**
 * T-1504 · Deed content validation — the load-time "all validate" guarantee.
 *
 * Mirrors `storyletValidation.ts` exactly: `validateDeeds` collects every
 * structural error in a deed table, and `defineDeeds` throws on any of them, so
 * malformed deed content can never reach a running game (importing
 * `@spacerquest/content` at all fails loudly instead).
 *
 * SCOPE NOTE — what this file deliberately does NOT check: whether a deed's
 * `trigger.eventType` / matcher paths exist in the engine's per-event-type
 * ALLOWLIST (`EVENT_PATHS` / `STATE_PATHS`, engine `deeds.ts`). That allowlist is
 * ENGINE state — content sits upstream of the engine and cannot import it — so
 * the "no deed is silently unearnable" guard lives where the allowlist does, as an
 * engine test (`packages/engine/src/__tests__/deeds.test.ts`). The two checks are
 * complementary: this one proves each deed is well-formed, that one proves each
 * deed can actually fire.
 */

import type { DeedDefinition, FieldMatcher, StateMatcher } from './deeds.js';

function isFiniteInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value);
}

function validateMatcher(
  errors: string[],
  path: string,
  matcher: FieldMatcher | StateMatcher,
): void {
  if (typeof matcher.path !== 'string' || matcher.path.length === 0) {
    errors.push(`${path}.path must be a non-empty string`);
  }
  if (matcher.equals === undefined && matcher.gte === undefined && matcher.lte === undefined) {
    errors.push(`${path} must define at least one condition (equals / gte / lte)`);
  }
  for (const key of ['gte', 'lte'] as const) {
    if (matcher[key] !== undefined && !isFiniteInteger(matcher[key])) {
      errors.push(`${path}.${key} must be a finite integer`);
    }
  }
}

export function validateDeeds(deeds: readonly DeedDefinition[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();

  deeds.forEach((deed, index) => {
    const path = `deeds[${index}](${deed.id})`;

    if (typeof deed.id !== 'string' || deed.id.length === 0) {
      errors.push(`${path}.id must be a non-empty string`);
    }
    if (seen.has(deed.id)) {
      errors.push(`${path}.id is duplicated`);
    }
    seen.add(deed.id);

    if (typeof deed.title !== 'string' || deed.title.length === 0) {
      errors.push(`${path}.title must be a non-empty string`);
    }

    // The citation template is the Registry entry's prose. `{day}` is the ONLY
    // substitution the engine performs (`citationFor`, engine deeds.ts), so a
    // template without it would file a dateless citation in a dated ledger.
    if (typeof deed.citationTemplate !== 'string' || deed.citationTemplate.length === 0) {
      errors.push(`${path}.citationTemplate must be a non-empty string`);
    } else if (!deed.citationTemplate.includes('{day}')) {
      errors.push(`${path}.citationTemplate must contain the {day} placeholder`);
    }

    const trigger = deed.trigger;
    if (!trigger || typeof trigger.eventType !== 'string' || trigger.eventType.length === 0) {
      errors.push(`${path}.trigger.eventType must be a non-empty string`);
      return;
    }

    trigger.match?.forEach((matcher, matcherIndex) =>
      validateMatcher(errors, `${path}.trigger.match[${matcherIndex}]`, matcher),
    );
    trigger.state?.forEach((matcher, matcherIndex) =>
      validateMatcher(errors, `${path}.trigger.state[${matcherIndex}]`, matcher),
    );

    if (trigger.count !== undefined) {
      if (!isFiniteInteger(trigger.count.gte)) {
        errors.push(`${path}.trigger.count.gte must be a finite integer`);
      } else if (trigger.count.gte < 1) {
        errors.push(`${path}.trigger.count.gte must be at least 1`);
      }
    }
  });

  return errors;
}

export function defineDeeds<const T extends readonly DeedDefinition[]>(deeds: T): T {
  const errors = validateDeeds(deeds);
  if (errors.length > 0) {
    throw new Error(`Invalid deed content:\n - ${errors.join('\n - ')}`);
  }
  return deeds;
}
