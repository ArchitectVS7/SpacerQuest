/**
 * T-120 · THE HANGOUT RULES — the engine half of ruling 3
 * (`docs/HANGOUT_REDESIGN.md` §2.2, §2.4, §2.6, §3).
 *
 * Content owns the INSTANCE (which venues a port runs, its wager band, its DCs,
 * its disposition deltas, its clientele, its prose — `packages/content/src/
 * portHangouts.ts`). This module owns the RULE that reads it: how a row resolves
 * against the default, and what "offered" and "the house's regulars" mean. The
 * arithmetic that consumes the numbers — the opposed-GUILE dare, the wager clamp,
 * `applyDisposition`, the loan ledger, `spendDie` — stays in
 * `actions/hangout.ts`, unchanged. The `combatRules.ts` / `exploreOutcomes.ts`
 * precedent.
 *
 * RESOLUTION IS FIELD-WISE, NOT ROW-WISE (§2.2 ruling 2). A row that sets its band
 * but omits a DC gets its own band and the default DC. A `hasHangout` port with no
 * row at all resolves to `DEFAULT_PORT_HANGOUT` entire. Nothing here throws and
 * nothing here asserts membership — the same defensive idiom `dice.ts:107-108`
 * uses for a stored content id, and the reason the resolver's never-throws
 * contract survives the extraction without a single guard clause in its switch.
 *
 * WHERE THIS FILE LANDS IN THE FINGERPRINT: `ENGINE_RULE_DIRECTORIES = ['',
 * 'actions']` (`packages/sim/src/balance/rules-fingerprint.ts`), so an engine ROOT
 * module is hashed automatically and needs no `ENGINE_NON_RULE_SOURCES` entry.
 * `balance-rig.test.ts`'s "classifies every engine source" check stays green.
 */

import {
  ALL_NPC_PROFILES,
  DEFAULT_PORT_HANGOUT,
  HangoutVenueId,
  HangoutVenueParams,
  NpcArchetype,
  PORT_HANGOUTS,
  PortHangout,
} from '@spacerquest/content';
import { GameState, NpcState, PlayerAction } from './types.js';

/**
 * COMPILE-TIME PIN between content's `HangoutVenueId` (declared in
 * `portHangouts.ts`, because content must not import engine types) and the engine's
 * own `VisitHangout` venue union. If either gains, loses or renames a member this
 * fails `tsc` — so a port can never offer a venue the resolver cannot switch on,
 * and a renamed venue can never leave a content row silently dead. Same idiom as
 * `exploreOutcomes.ts`'s `ShipComponentId` pin.
 */
type AssertEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
type VisitHangoutVenue = Extract<PlayerAction, { type: 'VisitHangout' }>['venue'];
const _hangoutVenueIdsAgree: AssertEqual<HangoutVenueId, VisitHangoutVenue> = true;
void _hangoutVenueIdsAgree;

/** `DEFAULT_PORT_HANGOUT` is authored fully-resolved, so these two reads need no
 *  fallback of their own. Narrowed once here rather than at every accessor. */
const DEFAULT_VENUES: readonly HangoutVenueId[] = DEFAULT_PORT_HANGOUT.venues ?? [];
const DEFAULT_WAGER = DEFAULT_PORT_HANGOUT.wager ?? { min: 0, max: 0 };
const DEFAULT_VENUE_PARAMS = DEFAULT_PORT_HANGOUT.venueParams ?? {};

/**
 * The port's Hangout row, or the default one wearing the caller's system id.
 * NEVER throws, NEVER asserts membership: a `hasHangout` port that content has not
 * given a row reads as a generic house rather than crashing the day loop
 * (§2.2 ruling 2's rejected alternative).
 */
export function portHangoutFor(systemId: number): PortHangout {
  return PORT_HANGOUTS[systemId] ?? { ...DEFAULT_PORT_HANGOUT, systemId };
}

/** The port's Dare stake band. The engine clamps a requested wager into this AND
 *  down to what both sides can cover — that second clamp is the resolver's, and it
 *  is a rule, not a parameter (§3.1 row 9). */
export function wagerBandFor(systemId: number): { min: number; max: number } {
  return portHangoutFor(systemId).wager ?? DEFAULT_WAGER;
}

/**
 * The port's parameters for one venue, resolved FIELD-WISE against the default
 * row. Returns plain numbers (`Required<HangoutVenueParams>`) because the default
 * row supplies all three fields for all seven venues — which is precisely what
 * stops a caller from restating a shipped constant as a `??` fallback.
 *
 * See the table on `HangoutVenueParams` for which venue reads which field; the
 * fields a venue ignores resolve to 0 and are never consumed.
 */
export function venueParamsFor(
  systemId: number,
  venue: HangoutVenueId,
): Required<HangoutVenueParams> {
  const row = portHangoutFor(systemId).venueParams?.[venue];
  const fallback = DEFAULT_VENUE_PARAMS[venue];
  return {
    dc: row?.dc ?? fallback?.dc ?? 0,
    dispositionOnSuccess: row?.dispositionOnSuccess ?? fallback?.dispositionOnSuccess ?? 0,
    dispositionOnFailure: row?.dispositionOnFailure ?? fallback?.dispositionOnFailure ?? 0,
  };
}

/**
 * Does this port run this venue? ONE rule, evaluated identically at every port —
 * not a per-port branch (§2.6). A port with no credit desk simply omits
 * 'borrow'/'repay'; the resolver refuses the action with a typed
 * `'venue-not-offered'` fail BEFORE the die is spent, and `legalActions` never
 * advertises it in the first place.
 */
export function venueOffered(systemId: number, venue: HangoutVenueId): boolean {
  const venues = portHangoutFor(systemId).venues ?? DEFAULT_VENUES;
  return venues.includes(venue);
}

/** Archetype behind an `NpcState` (through its `profileId` — an `NpcState` carries
 *  no archetype of its own). `undefined` for an unknown profile, which then simply
 *  cannot match a clientele tag. */
function npcArchetype(npc: NpcState): NpcArchetype | undefined {
  return ALL_NPC_PROFILES.find((p) => p.id === npc.profileId)?.archetype;
}

/**
 * Order the house's clientele (§2.2 ruling 4). RANK-ONLY, and that is the whole
 * point: the caller passes the ALREADY-FILTERED live in-system, non-dead set, and
 * this reorders it — `regulars` (by `profileId`) first, then `archetypes`, then
 * everyone else, each bucket keeping its incoming order. It NEVER queries for a
 * captain who is not in the passed set, so the resolver's "a dealer is actually
 * co-located and alive" guarantee is untouched and `no-opponent` stays reachable.
 * An empty intersection returns the whole set unchanged — a bar is never empty by
 * content decree.
 *
 * Under `DEFAULT_PORT_HANGOUT`'s empty `clientele` this is the IDENTITY, which is
 * what keeps T-120's extraction inert at Sun-3.
 *
 * `state` is carried for call-site symmetry with the other engine accessors (and
 * because the set handed in is always derived from it); the ranking itself reads
 * only the port row and the NPCs' own `profileId`.
 */
export function rankClientele(
  state: GameState,
  systemId: number,
  npcs: readonly NpcState[],
): NpcState[] {
  void state;
  const clientele = portHangoutFor(systemId).clientele;
  const regulars = clientele?.regulars ?? [];
  const archetypes = clientele?.archetypes ?? [];
  if (regulars.length === 0 && archetypes.length === 0) return [...npcs];

  const regularsOf: NpcState[] = [];
  const preferred: NpcState[] = [];
  const rest: NpcState[] = [];
  for (const npc of npcs) {
    if (regulars.includes(npc.profileId)) {
      regularsOf.push(npc);
      continue;
    }
    const archetype = npcArchetype(npc);
    if (archetype !== undefined && archetypes.includes(archetype)) {
      preferred.push(npc);
      continue;
    }
    rest.push(npc);
  }
  return [...regularsOf, ...preferred, ...rest];
}
