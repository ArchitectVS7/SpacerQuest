/**
 * T-145 · Liar's Dice roster content validation — the load-time "all 42 load and
 * validate" guarantee (`docs/LIARS-DICE-PROGRESSION_SPEC.md` §8 row 37).
 *
 * Mirrors the blessed `defineDeeds` / `defineSignalFragments` / `defineStorylets`
 * shape exactly: `validateLiarsDiceOpponents` collects every structural error in
 * the table and `defineLiarsDiceOpponents` throws on any of them, so a malformed
 * roster can never reach a running game (importing `@spacerquest/content` at all
 * fails loudly instead). Every rule below names the READER it protects.
 *
 * IT DECIDES NOTHING. This file has no bearing on any outcome: it throws on
 * malformed content and is otherwise inert, which is how `liarsDice.ts` stays pure
 * data under the standing engine/content constraint.
 *
 * SCOPE NOTE — the band check, and why it is resolved HERE rather than through the
 * engine. `bankroll >= wagerBandFor(systemId).min` is §7.5's no-lockout
 * precondition, and `wagerBandFor` is an ENGINE accessor (`hangoutRules.ts`).
 * Content sits upstream of the engine and cannot import it — the same constraint
 * `deedValidation.ts`'s own scope note records for `EVENT_PATHS`. So the band is
 * resolved content-side here, from the same authored rows the engine accessor
 * resolves (`PORT_HANGOUTS[systemId]?.wager ?? DEFAULT_PORT_HANGOUT.wager`,
 * field-wise fallback included), and the loop is CLOSED through the real accessor
 * by an engine test (`packages/engine/src/__tests__/liarsDiceContent.test.ts`).
 * The two checks are complementary: this one proves each row is well-formed, that
 * one proves the row agrees with the band the engine will actually clamp against.
 */

import { ALL_NPC_PROFILES } from './cast.js';
import { DEFAULT_PORT_HANGOUT, PORT_HANGOUTS } from './portHangouts.js';
import { STAR_SYSTEMS } from './systems.js';
import type { LiarsDiceMix, LiarsDiceOpponent } from './liarsDice.js';

/** The longest a rendered catchphrase may be. The pane gives a line one row at the
 *  table; past this it wraps into the bid history. */
const MAX_LINE_LENGTH = 120;

/** The three seats every `hasHangout` port authors. */
const REQUIRED_SEATS: readonly number[] = [1, 2, 3];

/**
 * A dice-count phrase — "four dice", "6 die", "five dice apiece". FORBIDDEN in a
 * catchphrase, because the count moves with the unlock ladder (§4): a line that
 * names it is a lie at tier 2. This is the mechanical trap §2.7 rule 3 exists to
 * catch, which is why it is a regex here rather than a note to the author.
 */
const DICE_COUNT_PHRASE =
  /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|a|an)\s+(?:dice|die|d6s?)\b/i;

/** The `wager` band the ENGINE's `wagerBandFor` will resolve for this port, derived
 *  from the same authored rows with the same field-wise fallback. */
function authoredWagerBand(systemId: number): { min: number; max: number } {
  const fallback = DEFAULT_PORT_HANGOUT.wager ?? { min: 0, max: 0 };
  const row = PORT_HANGOUTS[systemId];
  return row?.wager ?? fallback;
}

function isNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0
  );
}

function validateMix(errors: string[], path: string, mix: Readonly<LiarsDiceMix>): void {
  let total = 0;
  for (const key of ['optimal', 'bad', 'random'] as const) {
    const share = mix[key];
    if (!isNonNegativeInteger(share)) {
      errors.push(`${path}.mix.${key} must be a non-negative integer`);
      return;
    }
    total += share;
  }
  // READER: `resolveMixedArchetype` (engine `liarsDiceRules.ts`) partitions 0..99
  // with cumulative thresholds and NO bound check on the third branch, precisely
  // because this sums to exactly 100. A mix summing to 90 would make the last
  // branch absorb the gap silently; one summing to 110 would make `random`
  // unreachable.
  if (total !== 100) {
    errors.push(`${path}.mix must sum to exactly 100 (got ${total})`);
  }
}

function validateLines(errors: string[], path: string, opponent: LiarsDiceOpponent): void {
  const lines = opponent.lines;
  if (typeof lines !== 'object' || lines === null) {
    errors.push(`${path}.lines must be an object with tableTalk/win/lose`);
    return;
  }
  for (const key of ['tableTalk', 'win', 'lose'] as const) {
    const line = lines[key];
    // READERS: `DareHandStarted.opponentLine` (tableTalk, rendered at open by the
    // Liar's Dice pane) and `DareHandResolved.opponentLine` (win/lose, rendered at
    // the reveal). An empty line renders as a blank row at the table.
    if (typeof line !== 'string' || line.length === 0) {
      errors.push(`${path}.lines.${key} must be a non-empty string`);
      continue;
    }
    if (line.length > MAX_LINE_LENGTH) {
      errors.push(`${path}.lines.${key} must be <= ${MAX_LINE_LENGTH} chars (got ${line.length})`);
    }
    // The lines are printed VERBATIM — there is no interpolation step anywhere on
    // their path — so a `{captain}` would reach the player as literal braces. The
    // same rule the renown citations keep.
    if (line.includes('{') || line.includes('}')) {
      errors.push(`${path}.lines.${key} must not contain a {…} placeholder`);
    }
    if (DICE_COUNT_PHRASE.test(line)) {
      errors.push(
        `${path}.lines.${key} must not name a dice count — the count moves with the unlock ladder`,
      );
    }
  }
}

export function validateLiarsDiceOpponents(
  table: Readonly<Record<number, readonly LiarsDiceOpponent[]>>,
): string[] {
  const errors: string[] = [];

  // 1. The port set. READER: `actions/hangout.ts`'s roster branch looks a row up by
  //    the player's CURRENT system, and `hangoutRosterOpponents` lists them in the
  //    pane. A roster at a port with no Hangout is unreachable content; a
  //    `hasHangout` port with no roster is an empty second section in the picker.
  const hangoutPorts = Object.values(STAR_SYSTEMS)
    .filter((system) => system.hasHangout === true)
    .map((system) => system.id)
    .sort((a, b) => a - b);
  const authoredPorts = Object.keys(table)
    .map(Number)
    .sort((a, b) => a - b);
  for (const systemId of hangoutPorts) {
    if (!authoredPorts.includes(systemId)) {
      errors.push(`liarsDiceOpponents is missing the hasHangout port ${systemId}`);
    }
  }
  for (const systemId of authoredPorts) {
    if (!hangoutPorts.includes(systemId)) {
      errors.push(`liarsDiceOpponents[${systemId}] names a port with no Hangout`);
    }
  }

  // 2. Ids and names must be disjoint from the roaming cast. `NpcState.id ===
  //    profile.id` (engine `state.ts`), so a colliding id would make a roster
  //    opponent and a captain indistinguishable to every money-routing branch; a
  //    colliding NAME would make the picker ambiguous and the wire unreadable.
  const profileIds = new Set(ALL_NPC_PROFILES.map((profile) => profile.id));
  const profileNames = new Set(ALL_NPC_PROFILES.map((profile) => profile.name));

  const seenIds = new Map<string, string>();
  const seenNames = new Map<string, string>();

  for (const systemId of authoredPorts) {
    const portPath = `liarsDiceOpponents[${systemId}]`;
    // NOTE the shape of this guard: `Array.isArray` narrows a typed value to
    // `any[]`, which would erase `LiarsDiceOpponent` for the whole loop below and
    // turn every field read into an unchecked `any` access. Testing the lookup and
    // binding separately keeps the declared type.
    if (!Array.isArray(table[systemId])) {
      errors.push(`${portPath} must be an array of opponents`);
      continue;
    }
    const rows: readonly LiarsDiceOpponent[] = table[systemId];
    if (rows.length !== REQUIRED_SEATS.length) {
      errors.push(
        `${portPath} must author exactly ${REQUIRED_SEATS.length} seats (got ${rows.length})`,
      );
    }
    const seatsHere = new Set<number>();

    rows.forEach((opponent, index) => {
      const path = `${portPath}[${index}](${String(opponent?.id)})`;
      if (typeof opponent !== 'object' || opponent === null) {
        errors.push(`${path} must be an object`);
        return;
      }

      // 3. Id shape, uniqueness and disjointness.
      if (typeof opponent.id !== 'string' || !opponent.id.startsWith('ld-')) {
        errors.push(`${path}.id must be a string in the 'ld-' namespace`);
      } else {
        if (profileIds.has(opponent.id)) {
          errors.push(`${path}.id collides with an NPC profile id`);
        }
        const owner = seenIds.get(opponent.id);
        if (owner !== undefined) {
          errors.push(`${path}.id duplicates ${owner}`);
        } else {
          seenIds.set(opponent.id, path);
        }
      }

      // 4. Key/systemId agreement — the `portHangouts.ts` precedent. The record KEY
      //    is what the engine looks a port up by; `row.systemId` is what the row
      //    claims. A mismatch desyncs the two silently.
      if (opponent.systemId !== systemId) {
        errors.push(`${path}.systemId must equal its record key ${systemId}`);
      }

      // 5. Names.
      if (typeof opponent.name !== 'string' || opponent.name.length === 0) {
        errors.push(`${path}.name must be a non-empty string`);
      } else {
        if (profileNames.has(opponent.name)) {
          errors.push(`${path}.name collides with an NPC profile name`);
        }
        const owner = seenNames.get(opponent.name);
        if (owner !== undefined) {
          errors.push(`${path}.name duplicates ${owner}`);
        } else {
          seenNames.set(opponent.name, path);
        }
      }

      // 6. Seats — 1..3 and unique within the port. READER: the pane orders the
      //    house's three rows by seat, and §2.4 derives the archetype from it.
      if (!REQUIRED_SEATS.includes(opponent.seat)) {
        errors.push(`${path}.seat must be 1, 2 or 3`);
      } else if (seatsHere.has(opponent.seat)) {
        errors.push(`${path}.seat ${opponent.seat} is already taken at this port`);
      } else {
        seatsHere.add(opponent.seat);
      }

      // 7. Archetype, and `mix` present IFF 'mixed' — asserted BOTH ways, because
      //    a mix on a concrete row is a silently-unused difficulty dial and a
      //    missing mix on a 'mixed' row would make `resolveMixedArchetype`
      //    unreachable at open.
      const archetypes = ['optimal', 'bad', 'random', 'mixed'];
      if (!archetypes.includes(opponent.archetype)) {
        errors.push(`${path}.archetype must be one of ${archetypes.join(' / ')}`);
      }
      if (opponent.archetype === 'mixed') {
        if (opponent.mix === undefined) {
          errors.push(`${path}.mix is REQUIRED when archetype is 'mixed'`);
        } else {
          validateMix(errors, path, opponent.mix);
        }
      } else if (opponent.mix !== undefined) {
        errors.push(`${path}.mix must be ABSENT unless archetype is 'mixed'`);
      }

      // 8. The bankroll, and §7.5's no-lockout precondition. An opponent whose
      //    authored purse cannot cover the port's own minimum stake could never sit
      //    even once, which would make "broke implies beaten" false and permit a
      //    real completion lockout.
      const band = authoredWagerBand(systemId);
      if (!isNonNegativeInteger(opponent.bankroll) || opponent.bankroll <= 0) {
        errors.push(`${path}.bankroll must be a positive integer`);
      } else if (opponent.bankroll < band.min) {
        errors.push(
          `${path}.bankroll (${opponent.bankroll}) must be >= the port's wager.min (${band.min})`,
        );
      }

      validateLines(errors, path, opponent);
    });
  }

  return errors;
}

/** Throws on any structural error, so a malformed roster fails at IMPORT rather
 *  than at the table. The `defineDeeds` / `defineSignalFragments` precedent. */
export function defineLiarsDiceOpponents(
  table: Readonly<Record<number, readonly LiarsDiceOpponent[]>>,
): Readonly<Record<number, readonly LiarsDiceOpponent[]>> {
  const errors = validateLiarsDiceOpponents(table);
  if (errors.length > 0) {
    throw new Error(`Invalid Liar's Dice roster content:\n  - ${errors.join('\n  - ')}`);
  }
  return table;
}
