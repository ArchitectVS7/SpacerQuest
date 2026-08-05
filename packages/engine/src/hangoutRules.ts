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
  SOCIAL_PLAYS_PER_DAY,
  Stat,
} from '@spacerquest/content';
import { GameState, NpcState, PlayerAction, PlayerState } from './types.js';

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
const DEFAULT_LOAN_BAND = DEFAULT_PORT_HANGOUT.loanBand ?? { min: 0, max: 0 };
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

/**
 * The port's Dare stake band. The engine clamps a requested wager into this AND
 * down to what both sides can cover — that second clamp is the resolver's, and it
 * is a rule, not a parameter (§3.1 row 9).
 *
 * T-135 · FINDING F-134-3 — `band.max` NOW CARRIES TWO MEANINGS, and both are
 * live:
 *   1. the ceiling on a Dare SEED (its original job), and
 *   2. the per-side ceiling on TOTAL EXPOSURE for a whole Liar's Dice hand — seed
 *      plus every ante that side pays (`liarsDiceRules.ts` `headroomFor`,
 *      `docs/LIARS-DICE_REDESIGN.md` §4.3).
 * They are consistent (the second contains the first), but a content author
 * retuning a band for a prose reason now also decides how many raises a hand at
 * that port can hold. Said here and on `HangoutVenueParams` so neither reader can
 * miss it.
 */
export function wagerBandFor(systemId: number): { min: number; max: number } {
  return portHangoutFor(systemId).wager ?? DEFAULT_WAGER;
}

/**
 * T-133 (owner ruling D7) · The port's Penny Wise PRINCIPAL band. The engine
 * clamps a requested principal into this in `resolveVisitHangout`'s `borrow` arm,
 * exactly as it clamps a requested stake into `wagerBandFor` — same shape, same
 * `??` resolution against the default row, same "content owns the instance, the
 * engine owns the clamp" split.
 *
 * WHAT IT DOES NOT REACH. `LOAN_DAILY_RATE`, `LOAN_TERM_DAYS` and `LENDER_ID` stay
 * global: there is still ONE lender of record and one `LoanState` slot, so a port
 * decides how DEEP the desk will go, never what it charges. That is the whole of
 * D7's narrowing of §2.2 ruling 5, and it is why a per-port band is a clamp rather
 * than a second counterparty.
 *
 * A row that omits `loanBand` reads `[LOAN_MIN_PRINCIPAL, LOAN_MAX_PRINCIPAL]`,
 * because the default row is BUILT from those two constants — which is what makes
 * this extraction inert at the thirteen ports that do not author one.
 */
export function loanBandFor(systemId: number): { min: number; max: number } {
  return portHangoutFor(systemId).loanBand ?? DEFAULT_LOAN_BAND;
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
    // T-135 · the Liar's Dice fold arm. The ten authored `dare` rows omit it and
    // inherit `DARE_FOLD_DISPOSITION` field-wise, which is exactly the property
    // this resolution order exists for — M4d authors no new port numbers.
    dispositionOnFold: row?.dispositionOnFold ?? fallback?.dispositionOnFold ?? 0,
  };
}

/**
 * GUILE score of the NPC behind a state id (via its profile — `NpcState` carries
 * no stat block, only a `profileId`). Falls back to 0 for an unknown profile, the
 * same defensive idiom `npcArchetype` below uses.
 *
 * T-135 moved this here from `actions/hangout.ts`, where it was module-private,
 * BEHAVIOUR-IDENTICAL: `actions/dare.ts` needs the dealer's GUILE to feed
 * `dealerMove`, and a second lookup in the resolver would be a second definition
 * of the same rule. It sits beside `npcArchetype` because they are the same shape
 * of read.
 */
export function npcGuile(npc: NpcState): number {
  return ALL_NPC_PROFILES.find((p) => p.id === npc.profileId)?.stats[Stat.GUILE] ?? 0;
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

// ---------------------------------------------------------------------------
// T-197 · THE TWO DAILY CAPS THAT REPLACED THE DIE
// (`docs/DAWN-HAND-REDESIGN.md` §4a/§4b, owner-ruled 2026-08-04)
//
// All seven Hangout venues are Free Actions now, so the dawn die no longer
// throttles any of them. Two bounds ride that freeing, and BOTH live here as
// rules rather than in the resolver: the resolver enforces them, the cockpit
// explains them before the click, and `sim/protocol.ts` declines to advertise an
// action they would refuse. Three readers, one definition.
// ---------------------------------------------------------------------------

/**
 * T-197 · The three venues the social pool bounds (§4a): `meet`, `befriend`,
 * `insult` — the disposition movers with no other bound. `rumor` is read-only,
 * `borrow`/`repay` are ledger-bounded, and `dare` has §4b's rounds cap instead.
 *
 * Typed as `HangoutVenueId[]`, so removing or renaming a venue in content fails
 * `tsc` here rather than silently emptying the pool.
 */
export const SOCIAL_POOL_VENUES: readonly HangoutVenueId[] = ['meet', 'befriend', 'insult'];

/** T-197 · Does this venue draw from the social pool (§4a)? ONE predicate, read by
 *  the resolver's decrement, the cockpit's disabled-reason and the protocol
 *  enumerator's venue filter. */
export function isSocialPoolVenue(venue: HangoutVenueId): boolean {
  return SOCIAL_POOL_VENUES.includes(venue);
}

/** T-197 · Social plays left today (§4a), floored at 0 — a corrupt save carrying a
 *  negative counter reads as "spent out", never as a negative allowance. */
export function socialPlaysRemaining(state: GameState): number {
  return Math.max(0, state.player.socialPlaysRemaining);
}

/**
 * T-197 · WHAT BOTH CAPS READ AT THE START OF A DAY (§4a, §4b) — the ONE
 * definition of the two dawn values, so `createInitialState`, `day.ts`'s NEXT DAY
 * PREP chokepoint and the v15->v16 migration cannot drift apart. Two shapes exist
 * for two call idioms (this one for an object literal being built, the mutating
 * {@link resetDailyHangoutCaps} for a player already in hand), and the second is
 * defined in terms of the first so there is still only one place the numbers live.
 *
 * A NEW DAY HAS SPENT NOTHING AND OPENED NOTHING, and both values are ABSOLUTE
 * rather than deltas: nothing carries over. An unspent pool is not a saving, which
 * is what makes "a relationship costs real time across days" (§4a) true rather
 * than merely slow.
 */
export function freshDailyHangoutCaps(): Pick<
  PlayerState,
  'socialPlaysRemaining' | 'dareRoundsToday'
> {
  return { socialPlaysRemaining: SOCIAL_PLAYS_PER_DAY, dareRoundsToday: 0 };
}

/**
 * T-197 · THE DAWN RESET FOR BOTH CAPS (§4a, §4b), applied to a player already in
 * hand. `day.ts` calls this at its existing chokepoint; the v15->v16 migration
 * reads the same values through {@link freshDailyHangoutCaps}. That is the
 * `emptyDeedRegistry` / `seedLiarsDicePurses` house rule — "a migration CALLS a
 * rule, it never restates one" — discharged for a rule that did not exist before
 * this task.
 *
 * Mutates in place: every caller owns a fresh or already-cloned player (`day.ts`
 * writes into `nextState`, never into the state it was handed).
 */
export function resetDailyHangoutCaps(player: PlayerState): void {
  Object.assign(player, freshDailyHangoutCaps());
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
 * what keeps T-120's extraction inert at Sol-3.
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
