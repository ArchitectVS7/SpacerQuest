import { defineDeeds, defineRenownRanks } from './deedValidation.js';

export type DeedId = string;

export type RenownRankId =
  | 'LIEUTENANT'
  | 'COMMANDER'
  | 'CAPTAIN'
  | 'COMMODORE'
  | 'ADMIRAL'
  | 'TOP_DOG'
  | 'GRAND_MUFTI'
  | 'MEGA_HERO'
  | 'GIGA_HERO'
  // T-1308: 10th rank appended LAST so Object.keys(RENOWN_RANKS) gives it index 9.
  | 'CONQUEROR';

export interface RenownRankDefinition {
  id: RenownRankId;
  label: string;
  /** The period-voice rank-up line. TWO readers, both printing it VERBATIM (no
   *  substitution of any kind happens on this string — unlike
   *  `DeedDefinition.citationTemplate`, it must never carry a `{…}` placeholder,
   *  a rule `validateRenownRanks` enforces at import time):
   *
   *  1. The engine's rank-up machinery (engine `deeds.ts` `evaluateDeeds`) emits
   *     it as the rank-up WireEntry — it IS the rank-up moment on the Galactic
   *     News Wire, read by the UI wire ticker (`ui/format.ts` wireLines).
   *  2. T-1504c · The Registry's standing rank readout —
   *     `deedRegistry().rankCitation` (`ui/format.ts`) → the
   *     `registry-rank-citation` line in RecordsOverlay (`ui/App.tsx`). Reader (1)
   *     is a one-frame ticker moment, so before this a player who blinked never
   *     saw their own citation; now the current rank's line is always on the
   *     Records → Registry tab. Asserted at two different ranks through the real
   *     cockpit in `ui/e2e/derule.spec.ts`.
   *
   *  T-1308 introduced it as OPTIONAL, carried only by CONQUEROR, with the engine
   *  falling back to a generic "Registry confirms Player as …" line for the other
   *  nine. T-1504a authors all ten, so the field is now REQUIRED and the engine's
   *  fallback branch is gone: content — not the engine — owns every rank's prose,
   *  and the type makes a citation-less rank unrepresentable. */
  citation: string;
}

// T-1308 · Conqueror capstone. DIVERGENCE from foundation (git ref f2f95fa9):
// foundation/lore/User-Manual.md tops the renown ladder at GIGA_HERO — 9 ranks,
// which saturates because GIGA_HERO needs only 15 of the 17 authored deeds and a
// competent ~300-day run reaches it. PRD-REIMAGINED §5.2/§9 name "Conqueror" as
// the CAREER CAPSTONE and win over foundation, so this 10th rank is authored
// above GIGA_HERO with a deed threshold (30) that sits in the headroom T-1504a
// fills (see the threshold's own comment below for the measured day a real
// career crosses it). CONQUEROR's two intended readers: (a) the unique capstone
// wire moment — DELIVERED in engine `deeds.ts` via the `citation` branch, and as
// of T-1504d proven to fire FROM PLAY rather than only from a hand-constructed
// state (`packages/sim/src/__tests__/deed-coverage.test.ts` asserts this rank's
// citation reaches the wire on the same day the pinned career's rank-up lands);
// (b) the Nemesis-crossing stake gate — DELIVERED by T-1505b, which discharges
// the contract this block deliberately left unstubbed (so no fake reader could
// game the reader-consumption signal). The rank is exported as
// `CROSSING_REQUIRED_RANK` (content nemesis.ts) and consumed by engine
// `quoteCrossingStake`, whose ladder refuses a sub-capstone captain with
// `NemesisCrossing{kind:'stake-refused', reason:'not-conqueror'}` — the only
// thing that can set `nemesis.crossing.unlocked` and lift T-1101's NEMESIS gate.
// Asserted BOTH WAYS (GIGA_HERO refuses, CONQUEROR passes, everything else held
// equal) in `packages/engine/src/__tests__/crossing.test.ts`.
// T-1504a (authored) / T-1504c (validated + surfaced) · Rank citations for ALL
// TEN ranks. DIVERGENCE from foundation (git ref f2f95fa9):
// foundation/lore/User-Manual.md §Appendix A is a bare nine-row point-threshold
// table (Lieutenant 0-149 … Giga Hero 2,700+) with no rank-up prose at all — it
// prints a rank name off a point total — so these lines are authored Rimward
// content in the same period voice as the storylets, not a port of any
// foundation string. They complete the divergence recorded at the CONQUEROR
// block above: the ladder is now ten named moments rather than one capstone plus
// nine copies of a generic clerk's line. CONQUEROR's text is unchanged
// (byte-identical to T-1308's) so the capstone assertion that pins it stays green.
//
// T-1504c added the `defineRenownRanks` wrapper (content stays DATA — the wrapper
// is a load-time shape guard, the same precedent as `defineDeeds` /
// `defineStorylets`) and the second reader: the Registry's standing rank-citation
// line, so the text is no longer only a one-frame wire moment. See the `citation`
// doc comment above for both readers.
//
// VOICE LADDER — keep it if you edit. Each line opens with a Registry verb that
// escalates with the rank (opens / confirms / raises / enters / seats / stamps /
// elevates / files / writes / seals), carrying the name from a dock clerk's note
// to a galaxy-wide seal. `Player` is the wire convention, not a bug: GameState
// holds no captain name and engine `wire.ts` reports the player actor as the
// literal 'Player'. NEVER introduce a `{…}` placeholder — these are emitted
// verbatim by both readers, and `validateRenownRanks` rejects braces outright.
export const RENOWN_RANKS = defineRenownRanks({
  LIEUTENANT: {
    id: 'LIEUTENANT',
    label: 'Lieutenant',
    citation:
      'Registry opens a file on Player, Lieutenant: licensed to haul, cleared to leave, and nothing yet written under the name.',
  },
  COMMANDER: {
    id: 'COMMANDER',
    label: 'Commander',
    citation:
      // T-1504c voice pass, KEPT AS AUTHORED — and the one line here with a known
      // coupling, flagged rather than silently edited. "one deed on the board"
      // states RENOWN_DEED_THRESHOLDS.COMMANDER (1) in PROSE, and prose cannot be
      // re-derived at runtime. If COMMANDER stops being the one-deed rank, THIS
      // LINE GOES STALE and must be reworded (e.g. "the file has its first
      // entry") in the same change. No other rank citation names a number.
      //
      // T-1603b RESOLVED THE FLAG WITHOUT MOVING THE LINE: the canonical rescale
      // held COMMANDER at 1 precisely so this prose stays true (see the threshold
      // table's own comment). The coupling is still live for any future rescale,
      // which is why the warning stays.
      'Registry confirms Player as Commander — one deed on the board, and the port clerks have stopped asking how the name is spelled.',
  },
  CAPTAIN: {
    id: 'CAPTAIN',
    label: 'Captain',
    citation:
      'Registry raises Player to Captain. The file is thick enough now that the dock master reads the name before the manifest.',
  },
  COMMODORE: {
    id: 'COMMODORE',
    label: 'Commodore',
    citation:
      'Registry enters Player as Commodore — a record other captains ask after when they want to know who flew it.',
  },
  ADMIRAL: {
    id: 'ADMIRAL',
    label: 'Admiral',
    citation:
      'Registry seats Player at Admiral. The lanes between the fourteen know that transponder before it announces itself.',
  },
  TOP_DOG: {
    id: 'TOP_DOG',
    label: 'Top Dog',
    citation:
      'Registry stamps Player as Top Dog: no hand at these tables plays a longer game, and every dock from core to rim knows it.',
  },
  GRAND_MUFTI: {
    id: 'GRAND_MUFTI',
    label: 'Grand Mufti',
    citation:
      'Registry elevates Player to Grand Mufti — a name carrying the weight the old charters kept for whole fleets.',
  },
  MEGA_HERO: {
    id: 'MEGA_HERO',
    label: 'Mega Hero',
    citation:
      'Registry files Player as Mega Hero. The wire runs the name with no station tag attached; there is only the one.',
  },
  GIGA_HERO: {
    id: 'GIGA_HERO',
    label: 'Giga Hero',
    citation:
      'Registry writes Player as Giga Hero — a ledger the archivists copy out by hand before the originals wear through.',
  },
  CONQUEROR: {
    id: 'CONQUEROR',
    label: 'Conqueror',
    citation:
      'Registry seals the Conqueror rank: the frontier keeps one name now, and it is Player.',
  },
} as const satisfies Record<RenownRankId, RenownRankDefinition>);

/**
 * The renown ladder's deed thresholds. `rankForDeedCount` (engine `deeds.ts`)
 * walks `RENOWN_RANK_ORDER` and takes the LAST rank whose threshold the earned
 * count meets, so the values below MUST be non-decreasing in declaration order —
 * a non-monotone table selects the wrong rank silently. `deeds.test.ts` asserts
 * the monotonicity from content, with no literals, so any future rescale is
 * caught by the build rather than by a player.
 *
 * CANONICAL (T-1603b, 2026-07-26) — the rescale T-1504a recommended and T-1603a
 * measured, now set. See `docs/balance/TUNING-T-1603.md` §4 (deed pacing) for the
 * before/after `renownRanks` histograms these numbers are graded against.
 *
 * WHY THEY MOVED. The previous table (0,1,2,3,5,7,9,12,15,30) was calibrated for
 * the ORIGINAL 17-deed slate; T-1504a grew the slate to 44 without rescaling it,
 * and T-1603a measured the consequence over 3,500 careers
 * (`docs/balance/BASELINE-T-1603a.md` §5, Flag 1):
 *   - the fleet's 5th deed landed on day 4 (median) — an opening cutscene, not a
 *     progression;
 *   - 1,798 of 3,500 THIRTY-FIVE-DAY careers ended at GIGA_HERO, the 9th of ten
 *     ranks, and two smugglers reached the CONQUEROR capstone before day 35;
 *   - by day 120, 475 of 700 careers sat at GIGA_HERO and 8 at CONQUEROR.
 * PRD-REIMAGINED §5.1 ends Tour One on "your FIRST rank earned" and §5.2 makes
 * the Registry a career-long climb; a ladder finished during the tutorial serves
 * neither.
 *
 * WHAT THEY TARGET, and what was measured after (100 seeds x 35 days x
 * trader/smuggler/gambler/fighter, the cheap cut in memo §3):
 *   - day-35 renown spans CAPTAIN..MEGA_HERO with the mode at ADMIRAL (rank 5 of
 *     10) instead of GIGA_HERO (rank 9). Measured: CAPTAIN 21 · COMMODORE 60 ·
 *     ADMIRAL 139 · TOP_DOG 72 · GRAND_MUFTI 79 · MEGA_HERO 27 · COMMANDER 2;
 *   - ZERO of 400 35-day careers reach GIGA_HERO or CONQUEROR (target: <10% and
 *     0 respectively). GIGA_HERO (31) now sits above the ~28 deeds the best
 *     Tour One career banks, so the top of the ladder is a veteran's rank;
 *   - CONQUEROR stays reachable THROUGH PLAY: `deed-coverage.test.ts`'s pinned
 *     seeds 1 and 6 each earn all 44 authored deeds inside 300 days, so the
 *     capstone keeps 6 deeds of headroom below the binding measured total.
 *
 * KNOWN SECOND-ORDER EFFECT, deliberately accepted and recorded here rather than
 * discovered later. `engine/tier.ts` derives `player.tier` from
 * `floor(renownRankIndex(rank)/2)+1`, and `player.tier` is the ONLY input to
 * encounter matchmaking (`chooseTargetTier` / `selectEncounterInterceptor`,
 * `actions/travel.ts`). Slowing the ladder therefore delays the player's power
 * band: a median day-30 career now matches at tier 3 rather than tier 5. That is
 * the intended direction (a tutorial graduate should not be dragging tier-5
 * hunters), and it makes Tour One materially kinder — measured on the same cut,
 * smuggler's debt-cleared rate rose 55% → 76% and fighter's 45% → 48%. The
 * TRADER median debt-clear day, which is T-1603b's binding acceptance, was
 * UNCHANGED at day 23 (target band [22, 30]). Every combat/parity distribution in
 * BASELINE-T-1603a §3 moved with the tier band, so T-1603c's baseline is
 * TUNING-T-1603's after-tables, not T-1603a's.
 *
 * SAVE COMPAT — A MIGRATION IS OWED, AND WAS WRITTEN (v7 → v8, `engine/save.ts`).
 * No `GameState` field is added or removed, so the first instinct is that no
 * migration is needed. That is WRONG here, and the reasoning is worth keeping:
 * `registry.renownRank` is a DERIVED value that happens to be persisted, and this
 * rescale changed the rule that derives it — so every existing save carries a rank
 * its deed count no longer buys (a stored GIGA_HERO with 15 deeds should now read
 * ADMIRAL). `deserializeState` (state.ts) does recompute the rank, but `loadSave`
 * does NOT go through it — it runs `migrate` → `validateGameState`, and that is
 * the path the shipped UI store takes. Left unmigrated, the next deed a returning
 * player earned would drive `evaluateDeeds` from GIGA_HERO down to ADMIRAL and emit
 * that DEMOTION as a `RenownRankUp` carrying a promotion citation on the wire.
 * The v7 → v8 migration recomputes the rank and resyncs the `player.tier` band
 * derived from it; both directions are asserted in
 * `packages/engine/src/__tests__/save.test.ts`. The demotion itself is deliberate:
 * the rank is a FUNCTION of the deed count, never an independently stored fact.
 *
 * READERS (unchanged by the rescale, restated because this comment replaces the
 * INTERIM note that carried them): `rankForDeedCount` → `registry.renownRank` →
 * (a) the rank-up wire + Registry rank-citation readout (`RENOWN_RANKS.citation`,
 * `ui/format.ts` → RecordsOverlay), (b) `renownRankIndex` → `engine/tier.ts`
 * `rankTier` → `player.tier` → encounter matchmaking, (c) `CROSSING_REQUIRED_RANK`
 * (content `nemesis.ts`) → `quoteCrossingStake`'s CONQUEROR gate.
 */
export const RENOWN_DEED_THRESHOLDS = {
  LIEUTENANT: 0,
  // HELD AT 1 ON PURPOSE. `RENOWN_RANKS.COMMANDER.citation` states this number in
  // PROSE ("one deed on the board") and prose cannot be re-derived at runtime —
  // see the flag on that citation. Keeping the first-deed promotion also keeps
  // the opening reward intact, so the rescale costs no string edit and no golden.
  COMMANDER: 1,
  // The Tour One band. T-1603a §5 measures the fleet at a median 14 deeds by day
  // 30 (p25 10, p75 19), so 5/9/13/17 spreads a competent tutorial career across
  // CAPTAIN..TOP_DOG with the mode at ADMIRAL instead of collapsing it onto one
  // rank. Spacing is a flat 4 here because the deed supply is dense early.
  CAPTAIN: 5,
  COMMODORE: 9,
  ADMIRAL: 13,
  TOP_DOG: 17,
  // The veteran band. T-1603a §6 measures a 120-day career at a median 19 deeds
  // and a MAXIMUM of 28 — the authored slate saturates long before a career does
  // (four fifths of it is earned in the first quarter). So the spacing widens to
  // 4/5/5 here: past TOP_DOG each rank costs more than the last, and GIGA_HERO
  // (31) deliberately sits ABOVE the 28 a saturating career banks, making the top
  // two ranks the property of a captain who goes hunting for the rarer deeds.
  //
  // HANDED FORWARD, not tuned away: no threshold rescale can make the ladder both
  // slow at day 30 and still climbing at day 120, because only ~5 deeds separate
  // the two medians. The remaining half of Flag 1 is a DEED SUPPLY problem (the
  // slate has no late-career earnables), which is content authoring and outside
  // T-1603b's scope line. Recorded in TUNING-T-1603 §6 (handed to T-1603c).
  GRAND_MUFTI: 21,
  MEGA_HERO: 26,
  GIGA_HERO: 31,
  // T-1308 authored this above the then-17-deed set, so it was defined-but-
  // unreached. T-1504a fills the headroom (the deed slate below is 44), so the
  // capstone is STRUCTURALLY reachable: earning the authored slate selects
  // CONQUEROR, asserted in `packages/engine/src/__tests__/deeds.test.ts` (which
  // also proves the crossing emits this rank's citation verbatim).
  //
  // T-1504d DELIVERED the remaining half — reachability THROUGH PLAY, with no
  // test setting a rank or pushing an earned record. `packages/sim/src/__tests__/
  // deed-coverage.test.ts` drives `deedHunterPolicy` for 300 days on pinned seeds
  // 1 and 6 (T-1603b re-pinned these from 1 and 7 — this rescale moves the tier
  // band, so every 300-day trajectory diverges; see that file's SWEEP PROVENANCE):
  // each career earns ALL 44 authored deeds inside the horizon (the last on days
  // 209 and 170), crossing this threshold on the way (days 87 and 88), with a real
  // `RenownRankUp` in the event log carrying this rank's citation on the wire.
  //
  // CANONICAL (T-1603b): 30 → 38. Sized off that measurement, not off a feel —
  // 38 keeps SIX deeds of headroom below the 44 each pinned seed actually banks,
  // so the capstone is earned with room to spare rather than demanding a
  // near-perfect checklist, while sitting 7 above GIGA_HERO so the last rung is
  // the longest. It remains ≤ `DEEDS.length`, which `deeds.test.ts` asserts from
  // content so growing or shrinking the slate cannot strand the capstone.
  CONQUEROR: 38,
} as const satisfies Record<RenownRankId, number>;

export interface FieldMatcher {
  path: string;
  equals?: string | number | boolean;
  gte?: number;
  lte?: number;
}

export interface StateMatcher {
  path: string;
  equals?: string | number | boolean;
  gte?: number;
  lte?: number;
}

export interface DeedTrigger {
  eventType: string;
  match?: readonly FieldMatcher[];
  count?: { gte: number };
  state?: readonly StateMatcher[];
}

export interface DeedDefinition {
  id: DeedId;
  title: string;
  citationTemplate: string;
  trigger: DeedTrigger;
}

export const DEEDS: readonly DeedDefinition[] = defineDeeds([
  {
    id: 'first_manifest',
    title: 'First Manifest',
    citationTemplate: 'On day {day}, the Guild ledger first trusted this captain with a manifest.',
    trigger: {
      eventType: 'TradeEvent',
      match: [
        { path: 'action', equals: 'sign-contract' },
        { path: 'success', equals: true },
      ],
    },
  },
  {
    id: 'first_delivery',
    title: 'First Delivery',
    citationTemplate: 'On day {day}, cargo reached its mark and the port clerks took notice.',
    trigger: {
      eventType: 'TradeEvent',
      match: [
        { path: 'action', equals: 'deliver-cargo' },
        { path: 'success', equals: true },
      ],
    },
  },
  {
    id: 'mercy_runner',
    title: 'Mercy Runner',
    citationTemplate: 'On day {day}, medical cargo made Fomalhaut-2 before hope ran dry.',
    trigger: {
      eventType: 'TradeEvent',
      match: [
        { path: 'action', equals: 'deliver-cargo' },
        { path: 'success', equals: true },
        { path: 'destination', equals: 7 },
        { path: 'cargoType', equals: 4 },
      ],
    },
  },
  {
    id: 'first_jump',
    title: 'First Jump',
    citationTemplate: 'On day {day}, the ship broke orbit and proved the route was real.',
    trigger: {
      eventType: 'TravelEvent',
      match: [{ path: 'success', equals: true }],
    },
  },
  {
    id: 'road_regular',
    title: 'Road Regular',
    citationTemplate: 'By day {day}, five clean jumps had made the spacelanes familiar.',
    trigger: {
      eventType: 'TravelEvent',
      match: [{ path: 'success', equals: true }],
      count: { gte: 5 },
    },
  },
  {
    id: 'rimward_bound',
    title: 'Rimward Bound',
    citationTemplate: 'On day {day}, the registry marked a jump into the Rim Stars.',
    trigger: {
      eventType: 'TravelEvent',
      match: [
        { path: 'success', equals: true },
        { path: 'destination', gte: 15 },
        { path: 'destination', lte: 20 },
      ],
    },
  },
  {
    id: 'fuel_fumes_arrival',
    title: 'Fuel-Fumes Arrival',
    citationTemplate: 'On day {day}, arrival came on fumes and stubborn math.',
    trigger: {
      eventType: 'TravelEvent',
      match: [{ path: 'success', equals: true }],
      state: [{ path: 'player.ship.fuel', lte: 25 }],
    },
  },
  {
    id: 'first_combat_win',
    title: 'First Combat Win',
    citationTemplate: 'On day {day}, an interceptor yielded to superior fire.',
    trigger: {
      eventType: 'EncounterResolved',
      match: [{ path: 'resolution', equals: 'defeated' }],
    },
  },
  {
    id: 'silver_tongue',
    title: 'Silver Tongue',
    citationTemplate: 'On day {day}, a hostile bridge stood down after one better argument.',
    trigger: {
      eventType: 'EncounterResolved',
      match: [{ path: 'resolution', equals: 'talked-down' }],
    },
  },
  {
    id: 'clean_getaway',
    title: 'Clean Getaway',
    citationTemplate: 'On day {day}, the ship outran trouble and left no forwarding vector.',
    trigger: {
      eventType: 'EncounterResolved',
      match: [{ path: 'resolution', equals: 'escaped' }],
    },
  },
  {
    id: 'debt_first_payment',
    title: 'First Debt Payment',
    citationTemplate: 'On day {day}, the Merchant Guild received its first coin back.',
    trigger: {
      eventType: 'DebtPayment',
      match: [{ path: 'amount', gte: 1 }],
    },
  },
  {
    id: 'debt_cleared',
    title: 'Debt Cleared',
    citationTemplate: 'On day {day}, the Guild marker closed with a clean final stamp.',
    trigger: {
      eventType: 'DebtPayment',
      match: [{ path: 'remaining', equals: 0 }],
    },
  },
  {
    // T-113b: earned at the decisive Day-30 Tour One resolution when the Guild
    // marker is cleared (PRD §5.1). Distinct from `debt_cleared` (which fires on
    // the final DebtPayment): this deed marks the ARC's close and the veteran
    // unlock, and only exists on the `cleared` outcome. Renown/rank-up follow
    // through the standard deed→registry machinery.
    id: 'tour_one_cleared',
    title: 'Tour One Complete',
    citationTemplate:
      'On day {day}, the Guild marker closed clean and the veteran lanes opened to this captain.',
    trigger: {
      eventType: 'TourOneResolved',
      match: [{ path: 'outcome', equals: 'cleared' }],
    },
  },
  {
    id: 'broker_shark',
    title: 'Broker Shark',
    citationTemplate: 'On day {day}, a broker learned this captain could count twice.',
    trigger: {
      eventType: 'StatCheck',
      match: [
        { path: 'stat', equals: 'TRADE' },
        { path: 'result.success', equals: true },
        { path: 'actionContext', equals: 'haggle' },
      ],
    },
  },
  {
    id: 'yard_rat',
    title: 'Yard Rat',
    citationTemplate: 'On day {day}, the first yard chit hit the ship account.',
    trigger: {
      eventType: 'ShipyardEvent',
    },
  },
  {
    id: 'cargo_expansion',
    title: 'Cargo Expansion',
    citationTemplate: 'On day {day}, new pods widened the hold and the horizon.',
    trigger: {
      eventType: 'ShipyardEvent',
      match: [{ path: 'action', equals: 'buy-cargo-pods' }],
    },
  },
  {
    // Storylet-fed deed: advanced only by StoryletDeedProgress effects that name
    // it (see the doc-salvage rescue chain), never by a raw runtime event. The
    // engine credits registry.matchCounts[id] by each progress amount and earns
    // the deed once the count meets the threshold.
    id: 'beacon_keeper',
    title: 'Beacon Keeper',
    citationTemplate:
      'On day {day}, an answered mayday earned this captain a quiet line in the beacon-net logs.',
    trigger: {
      eventType: 'StoryletDeedProgress',
      count: { gte: 1 },
    },
  },

  // =========================================================================
  // T-1504 · The launch-quantity deed pass. APPENDED (never re-ordered): the
  // engine sorts same-batch candidates by source-event index and then by
  // DEFINITION INDEX, so inserting among the original 17 would churn the
  // ordering of already-shipped deeds for no gain.
  //
  // DIVERGENCE from foundation (git ref f2f95fa9): there is no foundation
  // number to diverge FROM — foundation has no Deeds/Registry system at all
  // (it scores a point grind, the very thing PRD-REIMAGINED §8.2 replaces with
  // "a Registry of Deeds, each with a citation"). Every deed below is therefore
  // T-1504-original Rimward content in the storylets' period voice.
  //
  // THE ONE HARD RULE for anything added here: a deed matches ONLY against the
  // engine's per-event-type path ALLOWLIST (`EVENT_PATHS` / `STATE_PATHS` in
  // engine `deeds.ts`). A matcher naming a path outside that list makes the
  // deed silently unearnable. `deeds.test.ts` asserts every deed's eventType
  // and every matcher path against the allowlist, so a dead deed fails the
  // build rather than shipping quietly.
  //
  // The slate deliberately spans the NEW VERBS (gambling, smuggling, lending,
  // exploration, property) that had no registry presence, plus career headroom
  // so CONQUEROR (30) is reachable through play with room to spare rather than
  // demanding a near-perfect checklist.
  //
  // BALANCE CONSEQUENCE — read this before adding or removing a deed. The slate
  // size is not cosmetic; it is an input to combat matchmaking:
  //     deeds earned → registry.earned.length → rankForDeedCount (engine deeds.ts)
  //       → registry.renownRank → renownRankIndex → `rankTier` (engine tier.ts,
  //         clamp(1, 5, floor(index / 2) + 1)) → player.tier
  //       → chooseTargetTier / selectEncounterInterceptor (actions/travel.ts)
  // `day.ts` calls `syncPlayerTier` immediately after every `evaluateDeeds`, so
  // enlarging the slate makes the renown ladder climb FASTER, which raises the
  // encounter band EARLIER in a career, which moves every long campaign's economy.
  //
  // THIS IS NOT A FREE CHANGE, and the size of it is measured. Rank is a function
  // of the ABSOLUTE deed count against RENOWN_DEED_THRESHOLDS above, so 27 new
  // deeds (many of them early-career: a first Dare, a first marker, a first chart,
  // a first berth) inflated rank for the same amount of play against thresholds
  // calibrated for the old 17-deed slate. Measured on the T-114a sim driver,
  // seed 3: old slate → solvent at day 500 (~21.6k credits, 16 deeds); new slate
  // → bankrupt from ~day 200 (credits pinned at -40, 20 deeds).
  //
  // DISCHARGED by T-1603b (2026-07-26): RENOWN_DEED_THRESHOLDS above is rescaled
  // to this 44-deed slate, so the ladder measures the same FRACTION of a career it
  // used to and `player.tier` no longer pins at 5 inside the tutorial. The
  // rescale's own comment carries the measurement; `docs/balance/TUNING-T-1603.md`
  // §4 carries the before/after distributions. The BALANCE CONSEQUENCE chain above
  // is still exactly as described — it is the reason a slate change and a
  // threshold change must be considered together, and it stays here as the warning
  // for the next person who adds a deed.
  //
  // Consequences already absorbed by T-1504a: the `replay-golden.ts` protocol
  // goldens were regenerated (two extra DeedEarned entries; rngState UNCHANGED,
  // verified), and the seeds of three long-horizon sim tests were re-pinned —
  // `campaign-reach.test.ts` (T-114a, T-1307 port income) and
  // `alliance-arcs.test.ts` (T-1503 organic mover). Each carries its own re-pin
  // comment pointing back here. NOTE: T-114a's old seed-3 pin was already RED at
  // the pre-T-1504 commit `a5dabd76`, so that one repairs a pre-existing failure
  // rather than covering a new one. No assertion was weakened at any of the sites.
  // =========================================================================

  // --- Gambling: the Spacer's Dare at the Hangout (T-1303, PRD §7) ----------
  {
    // The `wager` matcher is an EXISTENCE guard, not a size gate: a Dare that
    // never happened (a malformed-die / no-opponent HangoutEvent) carries a
    // `failReason` and NO wager, so `gte: 0` refuses it. Every other gambling
    // deed below inherits the same guard through `playerWon` / `wager`.
    id: 'dare_first',
    title: 'First Dare',
    citationTemplate: 'On day {day}, this captain sat down to a Spacer’s Dare and stayed.',
    trigger: {
      eventType: 'HangoutEvent',
      match: [
        { path: 'venue', equals: 'dare' },
        { path: 'wager', gte: 0 },
      ],
    },
  },
  {
    id: 'dare_won',
    title: 'Took the Pot',
    citationTemplate: 'On day {day}, the table paid out and the dealer counted it twice.',
    trigger: {
      eventType: 'HangoutEvent',
      match: [
        { path: 'venue', equals: 'dare' },
        { path: 'playerWon', equals: true },
      ],
    },
  },
  {
    // 250 sits inside the band DARE_MIN_WAGER (25) … DARE_MAX_WAGER (1,000):
    // a deliberate stake, not the house minimum, and not only the ceiling. It is
    // deliberately NOT re-derived from the ceiling — T-1603b raised the cap 500 →
    // 1,000 and left this at 250, because "a stake worth a hold of cargo" is a
    // fixed narrative weight, not a fraction of whatever the house will take. The
    // measured gambler mean stake at the new cap is ~697 credits over 120-day
    // careers, so the deed sits comfortably below the typical serious hand.
    id: 'high_roller',
    title: 'High Roller',
    citationTemplate:
      'On day {day}, a stake worth a hold of cargo rode one hand — and came back doubled.',
    trigger: {
      eventType: 'HangoutEvent',
      match: [
        { path: 'venue', equals: 'dare' },
        { path: 'playerWon', equals: true },
        { path: 'wager', gte: 250 },
      ],
    },
  },
  {
    id: 'table_regular',
    title: 'Table Regular',
    citationTemplate:
      'By day {day}, the Hangout dealers had stopped explaining the rules to this captain.',
    trigger: {
      eventType: 'HangoutEvent',
      match: [
        { path: 'venue', equals: 'dare' },
        { path: 'wager', gte: 0 },
      ],
      count: { gte: 5 },
    },
  },

  // --- Smuggling: Contraband cargo, patrol scans, and Ray's ledger ---------
  {
    id: 'contraband_run',
    title: 'Contraband Run',
    citationTemplate:
      'On day {day}, a load no manifest describes reached its buyer and no one asked a question.',
    trigger: {
      eventType: 'TradeEvent',
      match: [
        { path: 'action', equals: 'deliver-cargo' },
        { path: 'success', equals: true },
        { path: 'cargoType', equals: 10 },
      ],
    },
  },
  {
    id: 'slipped_the_scan',
    title: 'Slipped the Scan',
    citationTemplate:
      'On day {day}, a patrol swept the hold, found paperwork, and waved this ship through.',
    trigger: {
      eventType: 'ContrabandScan',
      match: [{ path: 'caught', equals: false }],
    },
  },
  {
    id: 'known_to_the_league',
    title: 'Known to the League',
    citationTemplate:
      'On day {day}, a League scan found what the manifest denied, and the name went on a list.',
    trigger: {
      eventType: 'ContrabandScan',
      match: [{ path: 'caught', equals: true }],
    },
  },
  {
    // The LOSS side of smuggling, and the consumer that makes the
    // `ContrabandConfiscated` allowlist entry load-bearing rather than a receipt
    // (`deeds.test.ts` asserts every EVENT_PATHS key is named by ≥1 deed, so an
    // unconsumed entry now fails the build). Emitted in the same Travel event
    // batch as `slipped_the_scan`/`known_to_the_league` (actions/patrol.ts), so it
    // reaches evaluateDeeds by the normal action path.
    //
    // `fine` is clamped to `Math.min(credits, CONTRABAND_FINE)`, so a broke
    // captain's seizure levies 0 — `gte: 1` therefore reads "a fine was actually
    // collected", not merely "a scan went badly".
    id: 'run_seized',
    title: 'Run Seized',
    citationTemplate:
      'On day {day}, the hold was opened, the cargo was carried off, and the fine was paid on the spot.',
    trigger: {
      eventType: 'ContrabandConfiscated',
      match: [{ path: 'fine', gte: 1 }],
    },
  },
  {
    // Storylet-fed (the `beacon_keeper` pattern): advanced only by
    // StoryletDeedProgress effects on Smuggler Ray's two fence choices
    // (`fence.ray.sealed-pod` / `fence.ray.contraband-cargo`), never by a raw
    // runtime event. Two authored routes in, so it is not hostage to one.
    id: 'ray_s_ledger',
    title: "Ray's Ledger",
    citationTemplate:
      'On day {day}, the Ghost Runner opened a page for this captain and wrote the name in pencil.',
    trigger: {
      eventType: 'StoryletDeedProgress',
      count: { gte: 1 },
    },
  },

  // --- Lending: the Penny Wise desk (T-1304, PRD §7.5) ---------------------
  {
    id: 'first_marker',
    title: 'First Marker',
    citationTemplate:
      'On day {day}, Penny Wise advanced the credits and named the day they came due.',
    trigger: {
      eventType: 'LoanEvent',
      match: [{ path: 'kind', equals: 'borrowed' }],
    },
  },
  {
    id: 'paid_in_full',
    title: 'Paid in Full',
    citationTemplate: 'On day {day}, the marker cleared and Penny Wise tore the page out herself.',
    trigger: {
      eventType: 'LoanEvent',
      match: [
        { path: 'kind', equals: 'repaid' },
        { path: 'cleared', equals: true },
      ],
    },
  },
  {
    id: 'bad_paper',
    title: 'Bad Paper',
    citationTemplate:
      'On day {day}, the term ran out unpaid, and the collectors started asking after this hull.',
    trigger: {
      eventType: 'LoanEvent',
      match: [{ path: 'kind', equals: 'defaulted' }],
    },
  },
  {
    // LOAN_MAX_PRINCIPAL (lending.ts) is 5000 and the resolver clamps to it, so
    // this is the whole-ceiling advance: the deepest water the desk sells.
    id: 'deep_water',
    title: 'Deep Water',
    citationTemplate:
      'On day {day}, this captain borrowed to the ceiling and flew out owing every credit of it.',
    trigger: {
      eventType: 'LoanEvent',
      match: [
        { path: 'kind', equals: 'borrowed' },
        { path: 'principal', gte: 5000 },
      ],
    },
  },

  // --- Exploration: off-lane charting and salvage (T-111a/b, PRD §7.2) -----
  {
    id: 'first_chart',
    title: 'First Chart',
    citationTemplate: 'On day {day}, this captain left the lane and put something new on a chart.',
    trigger: {
      eventType: 'PoiDiscovered',
    },
  },
  {
    id: 'derelict_boarder',
    title: 'Boarder',
    citationTemplate:
      'On day {day}, a dead hull was boarded and stripped of everything worth carrying.',
    trigger: {
      eventType: 'PoiDiscovered',
      match: [{ path: 'poiType', equals: 'derelict' }],
    },
  },
  {
    id: 'beacon_chaser',
    title: 'Beacon Chaser',
    citationTemplate: 'On day {day}, a beacon still calling into the dark finally got an answer.',
    trigger: {
      eventType: 'PoiDiscovered',
      match: [{ path: 'poiType', equals: 'beacon' }],
    },
  },
  {
    id: 'cartographer',
    title: 'Cartographer',
    citationTemplate:
      'By day {day}, five charted marks off the lanes bore this captain’s survey stamp.',
    trigger: {
      eventType: 'PoiDiscovered',
      count: { gte: 5 },
    },
  },
  {
    // The derelict salvage band is 120-520 credits (exploration.ts POI_LOOT), so
    // 400 is a rich board — reachable, never automatic.
    id: 'rich_hulk',
    title: 'Rich Hulk',
    citationTemplate: 'On day {day}, one dead ship paid better than a season of honest freight.',
    trigger: {
      eventType: 'SalvageRecovered',
      match: [{ path: 'amount', gte: 400 }],
    },
  },

  // --- Property: port stakes (T-1307, PRD §9) -----------------------------
  {
    id: 'port_authority',
    title: 'Port Authority',
    citationTemplate:
      'On day {day}, a controlling stake in a port authority changed hands, and this captain held it.',
    trigger: {
      eventType: 'PortEvent',
      match: [{ path: 'kind', equals: 'purchased' }],
    },
  },
  {
    id: 'landlord',
    title: 'Landlord',
    citationTemplate: 'On day {day}, two ports levied their launch fees in this captain’s name.',
    trigger: {
      eventType: 'PortEvent',
      match: [{ path: 'kind', equals: 'purchased' }],
      count: { gte: 2 },
    },
  },
  {
    id: 'rentier',
    title: 'Rentier',
    citationTemplate:
      'By day {day}, twenty dusks of other spacers’ launch fees had arrived without this captain lifting a finger.',
    trigger: {
      eventType: 'PortEvent',
      match: [{ path: 'kind', equals: 'income' }],
      count: { gte: 20 },
    },
  },

  // --- Career headroom: crew, fat manifests, rim runs, tribute, signals ----
  {
    id: 'signed_the_crew',
    title: 'Signed the Crew',
    citationTemplate: 'On day {day}, a berth was filled and this ship stopped being a one-hander.',
    trigger: {
      eventType: 'CrewEvent',
      match: [{ path: 'kind', equals: 'hired' }],
    },
  },
  {
    id: 'fat_manifest',
    title: 'Fat Manifest',
    citationTemplate:
      'On day {day}, a single delivery paid out five thousand credits and the broker paid it smiling.',
    trigger: {
      eventType: 'TradeEvent',
      match: [
        { path: 'action', equals: 'deliver-cargo' },
        { path: 'success', equals: true },
        { path: 'payment', gte: 5000 },
      ],
    },
  },
  {
    // Systems 15-20 are the Rim band (systems.ts). `rimward_bound` marks the
    // first rim JUMP; this marks a delivery actually completed out there.
    id: 'rim_runner',
    title: 'Rim Runner',
    citationTemplate:
      'On day {day}, cargo was set down past the last patrol buoy and the buyer paid in hard credits.',
    trigger: {
      eventType: 'TradeEvent',
      match: [
        { path: 'action', equals: 'deliver-cargo' },
        { path: 'success', equals: true },
        { path: 'destination', gte: 15 },
      ],
    },
  },
  {
    id: 'toll_paid',
    title: 'Toll Paid',
    citationTemplate:
      'On day {day}, a demand was met in credits rather than fire, and both ships flew on.',
    trigger: {
      eventType: 'TributePaid',
      match: [{ path: 'amount', gte: 1 }],
    },
  },
  {
    id: 'signal_hunter',
    title: 'Signal Hunter',
    citationTemplate:
      'On day {day}, a fragment of something older than the Confederation entered this captain’s file.',
    trigger: {
      eventType: 'FragmentAcquired',
    },
  },
  {
    id: 'cold_case',
    title: 'Cold Case',
    citationTemplate:
      'By day {day}, three separate signals said the same impossible thing, and the file stopped being a curiosity.',
    trigger: {
      eventType: 'FragmentAcquired',
      count: { gte: 3 },
    },
  },
]);
