/**
 * Off-lane exploration — points of interest & the OUTCOME ROWS (T-111a, T-110).
 *
 * The `Explore` action burns a die on a PILOT nav check to leave the trade lane
 * and chart a point of interest (PRD §7.2). This file is PURE DATA — the POI
 * *types*, their discovery flavor, the weighted discovery table, and every
 * payoff a board can yield, expressed as a typed row. The engine owns the seeded
 * rolls, the nav-check math, and what each payload KIND means.
 *
 * T-110 · THE VALUE-HEADED OUTCOME ROW (docs/EXPLORE_REDESIGN.md §2). A payoff is
 * a content row — one shared header (`id`, `valuePoints`, `pools`, `wireFound`)
 * plus one discriminated `payload` the engine resolves generically. Authoring the
 * 74th explore outcome is a row here, never an engine branch. There is NO
 * predicate on a row and NO per-row day-count: conditions belong on the storylet
 * a `questline` row points at (§2.5), and the recovery clock is derived by an
 * engine rule from `valuePoints` (§3b, T-111).
 *
 * T-111 · THE VALUE BANDS (docs/EXPLORE_REDESIGN.md §5.2). `EXPLORE_VALUE_BANDS`
 * below is the ONLY place in the codebase a recovery day-count is written. The
 * engine's `bandFor`/`recoveryDays` (exploreOutcomes.ts) read it; no row carries
 * an N of its own, and the type is what enforces that.
 *
 * T-113 · THE SPINE — pass 1 of 3 of the 100-row table (§5.3). The 34 rows of
 * bands 0 and 1 are authored below: 14 dead ends and 20 low finds (12 salvage,
 * 8 lore-with-fragment). THIS PASS ESTABLISHES THE HOUSE VOICE, and the next two
 * follow it. The rules that make it a house voice rather than a taste are:
 *
 *  - third person, past tense, the LITERAL subject `Player` (the wire's own
 *    convention — `wire.ts` treats the string 'Player' as the player actor);
 *  - `{name}` is substituted with `String.replace`, which replaces the FIRST
 *    occurrence only, so a row uses it AT MOST ONCE;
 *  - EVERY authored row carries non-empty copy (finding F-110-B lands here):
 *    §2.4's "never charged 80 fuel for total silence" is a property of the rows,
 *    not of a branch, and it is why the dead ends read as findings rather than
 *    as nothing;
 *  - a salvage row says WHAT WAS STRIPPED and never the credit figure — the
 *    amount rides the `SalvageRecovered` event and the UI formats it;
 *  - a lore row's copy is the SECOND line on a new fragment (the grant emits its
 *    own generic line first) and the ONLY line on a repeat, because
 *    `grantFragment` dedupes silently. Both readings have to work.
 *
 * NO ROW IN THIS PASS CAN OPEN A RECOVERY: bands 0-1 are `recoveryDays: 0`
 * throughout (§5.3), which is a consequence of the band table, never of a row.
 *
 * T-114 · THE MIDDLE — pass 2 of 3 (§5.3). The 33 rows of BAND 2 are authored
 * below, in the five kinds §5.2 permits that band: 14 mid salvage rows (credit
 * bands inside the authored 240-700cr, midpoints averaging 475cr against §5.5's
 * 470cr band-2 credit-equivalent), 8 unique items (7 Class A against the band's
 * +1 strength / +20 maxFuel ceiling, 1 Class B granting the `floor 3` tally-
 * slate), 6 NPC introductions, 3 questline hooks, and 2 lore rows carrying
 * `effects` rather than a fragment. The house voice above is UNCHANGED and every
 * band-2 row follows it.
 *
 * EVERY ROW IN THIS PASS OPENS A ONE-DAY RECOVERY, and — the same way — that is a
 * consequence of the band table (band 2 is `recoveryDays: 1`), never of a row.
 * The player-visible size of that is recorded as the T-114 half of finding
 * F-113-C and is measured, not tuned around: a successful board now also costs
 * the NEXT day's Explore, because the fifth typed refusal
 * (`recovery-in-progress`) is live.
 */

import { BEACON_FRAGMENT_POOL, DERELICT_FRAGMENT_POOL } from './nemesis.js';
import type { DiceBenefit, ExploreModuleContentId } from './crew.js';
import type { StoryletEffects } from './storylets.js';

/** The two kinds of point of interest exploration can surface. */
export type PoiType = 'beacon' | 'derelict';

export interface PoiKindDefinition {
  type: PoiType;
  /** Flavor names, chosen deterministically at discovery from the seeded roll. */
  names: readonly string[];
  /** Period-voice discovery wire copy. `{name}` is resolved by the engine. */
  wireDiscovered: string;
}

// BALANCE: foundation/rules/ carries NO exploration constants — the legacy game
// had no off-lane exploration action (grep 'explor' over foundation confirms).
// The values below are chosen for T-111a and flagged here as a deliberate
// divergence from canon:
//
//  - Nav DC sits one pip above the Tour-One PILOT baseline (+1), so a starter
//    spacer needs a mid-or-better hand die to thread it — exploration is a
//    gamble, not a freebie.
//  - The fuel burn matches the PRD §7.2 sample turn ("reaching it burns 80
//    fuel and a die"): off-lane detours cost real range.
export const EXPLORATION_NAV_DC = 12;
export const EXPLORATION_FUEL_COST = 80;

/**
 * T-110 · Which POI type a successful nav check surfaces, as an ordered weighted
 * table. The engine walks it cumulatively off one `rng.next()` and takes the
 * first entry it lands in — so which types EXIST, and how often, is content.
 * (This replaces `BEACON_DISCOVERY_CHANCE`, the last place the engine had to
 * name a POI type in a ternary.) The chances are the shipped near-even split, so
 * both types surface readily across a seed sweep; they must sum to 1.
 */
export const POI_DISCOVERY_TABLE: readonly { type: PoiType; chance: number }[] = [
  { type: 'beacon', chance: 0.5 },
  { type: 'derelict', chance: 0.5 },
];

export const POI_KINDS: Readonly<Record<PoiType, PoiKindDefinition>> = {
  beacon: {
    type: 'beacon',
    names: [
      'a pre-Confederation distress beacon',
      'a derelict nav-beacon, still transmitting',
      'an unlisted relay buoy',
      'a silent Confederation marker beacon',
    ],
    wireDiscovered: 'Player charted {name} off the lane.',
  },
  derelict: {
    type: 'derelict',
    names: [
      'a gutted freighter hulk',
      'a drifting warship derelict',
      'an ice-locked colony barge',
      'a shattered survey vessel',
    ],
    wireDiscovered: 'Player boarded {name} adrift off the lane.',
  },
};

// --- The outcome rows (T-110, docs/EXPLORE_REDESIGN.md §2) ---

/**
 * ONE PAYOFF a boarded POI can yield. The engine reads `payload.kind` and
 * nothing else about the row's identity — adding an outcome is adding a row.
 */
export interface ExploreOutcomeDefinition {
  /** Stable content id. The ONLY thing a save ever stores about an outcome. */
  id: string;
  /** 0..100 — THE ladder axis (§5). The ONLY tuning dial an author writes per row. */
  valuePoints: number;
  /** Which POI types can surface this row. */
  pools: readonly PoiType[];
  /** Period-voice line; `{name}` is resolved by the engine, the POI_KINDS precedent.
   *  Empty string ⇒ no line (the legacy rows only; see LEGACY_POI_LOOT). */
  wireFound: string;
  payload: ExploreOutcomePayload;
}

/**
 * The five kinds §2.2 settles, plus one transitional sixth.
 *
 * A "DEAD END" is not a sixth kind: it is `{ kind: 'lore' }` with neither
 * optional field — prose and a wire line, no mechanical payoff, `valuePoints: 0`.
 *
 * FINDING F-110-A · `contraband` is TRANSITIONAL and is NOT part of the settled
 * taxonomy. The shipped derelict table arms `flags['signal.contraband.pending']`
 * (the sealed-pod carry choice), and no settled kind emits `ContrabandFound`;
 * routing it through `lore.effects` would emit `StoryletEffectApplied` instead
 * and break pre-existing exploration assertions. T-110 is behaviour-preserving,
 * so the leg survives as an explicit payload kind. T-113 COULD NOT RETIRE IT —
 * see finding F-113-B on `EXPLORE_OUTCOMES` below: deleting the member makes the
 * engine's exhaustive `case 'contraband':` a `tsc` error, which is engine work.
 * It retires with the single band-weighted draw (F-113-A).
 */
export type ExploreOutcomePayload =
  | { kind: 'salvage'; minCredits: number; maxCredits: number }
  | { kind: 'lore'; fragmentId?: string; effects?: StoryletEffects }
  | { kind: 'unique-item'; itemId: string }
  | { kind: 'questline'; storyletId: string; delayDays: number }
  | { kind: 'npc'; profileId: string; dispositionDelta: number }
  | { kind: 'contraband' };

// --- T-113 · BAND 0 — the dead ends (docs/EXPLORE_REDESIGN.md §5.3) ---------
//
// 14 rows, `valuePoints: 0`, `{ kind: 'lore' }` with NEITHER optional field: the
// §2.2 dead end is a SHAPE, not a sixth kind. Prose and a wire line, no
// mechanical payoff — the player still keeps the coordinate, because the POI is
// charted by the verb before any row resolves.
//
// BALANCE: no canon table exists (foundation had no exploration action). The
// 5 beacon / 5 derelict / 4 shared split is the §5.3 row count spread across
// both pools so neither type is disproportionately a dead end.
//
// IDS DO NOT ENCODE THE BAND. An id is the only thing a save stores about an
// outcome (`player.recovery.outcomeId`), so a row that is ever re-banded must
// keep the id it shipped with. Every id below is stable from this commit on.
const DEAD_END_ROWS: readonly ExploreOutcomeDefinition[] = [
  // Beacon-only.
  {
    id: 'explore-deadend-scoured-log',
    valuePoints: 0,
    pools: ['beacon'],
    wireFound: "Player's crew pulled the buoy's log and found it scoured back to its first entry.",
    payload: { kind: 'lore' },
  },
  {
    id: 'explore-deadend-carrier-only',
    valuePoints: 0,
    pools: ['beacon'],
    wireFound: 'Player listened to {name} for a full watch and heard nothing under the carrier.',
    payload: { kind: 'lore' },
  },
  {
    id: 'explore-deadend-salt-fused',
    valuePoints: 0,
    pools: ['beacon'],
    wireFound: "Player's crew cracked the relay housing and found the boards fused to salt.",
    payload: { kind: 'lore' },
  },
  {
    id: 'explore-deadend-wrong-catalogue',
    valuePoints: 0,
    pools: ['beacon'],
    wireFound: 'Player matched the ident against three catalogues and got three different hulls.',
    payload: { kind: 'lore' },
  },
  {
    id: 'explore-deadend-plate-already-open',
    valuePoints: 0,
    pools: ['beacon'],
    wireFound:
      'Player found the access plate on {name} already open, tooled clean, and years cold.',
    payload: { kind: 'lore' },
  },
  // Derelict-only.
  {
    id: 'explore-deadend-stripped-holds',
    valuePoints: 0,
    pools: ['derelict'],
    wireFound: "Player's crew walked {name} bow to stern and found every hold stripped to frames.",
    payload: { kind: 'lore' },
  },
  {
    id: 'explore-deadend-sealed-bridge',
    valuePoints: 0,
    pools: ['derelict'],
    wireFound: "Player's crew could not cut the bridge hatch before the bottled air ran short.",
    payload: { kind: 'lore' },
  },
  {
    id: 'explore-deadend-no-bodies',
    valuePoints: 0,
    pools: ['derelict'],
    wireFound: 'Player logged a wreck with no bodies aboard and no boats missing, and let it be.',
    payload: { kind: 'lore' },
  },
  {
    id: 'explore-deadend-struck-manifest',
    valuePoints: 0,
    pools: ['derelict'],
    wireFound: 'Player pulled a manifest off {name} with every cargo line struck through by hand.',
    payload: { kind: 'lore' },
  },
  {
    id: 'explore-deadend-ice-locked-decks',
    valuePoints: 0,
    pools: ['derelict'],
    wireFound:
      "Player's crew found the lower decks iced solid and turned back at the second frame.",
    payload: { kind: 'lore' },
  },
  // Both pools.
  {
    id: 'explore-deadend-static-wash',
    valuePoints: 0,
    pools: ['beacon', 'derelict'],
    wireFound: 'Player worked the bearing on {name} and got back nothing but a wash of static.',
    payload: { kind: 'lore' },
  },
  {
    id: 'explore-deadend-old-warning',
    valuePoints: 0,
    pools: ['beacon', 'derelict'],
    wireFound: 'Player copied out a warning notice too old to name the thing it warned about.',
    payload: { kind: 'lore' },
  },
  {
    id: 'explore-deadend-someone-elses-mark',
    valuePoints: 0,
    pools: ['beacon', 'derelict'],
    wireFound: "Player found another spacer's chalk mark on the hull and added nothing to it.",
    payload: { kind: 'lore' },
  },
  {
    id: 'explore-deadend-filed-and-left',
    valuePoints: 0,
    pools: ['beacon', 'derelict'],
    wireFound: 'Player filed the bearing, closed the log, and left the find exactly as it lay.',
    payload: { kind: 'lore' },
  },
];

// --- T-113 · BAND 1 — the low salvage rows (§5.2, §5.5) ---------------------
//
// 12 rows, 6 per pool, `valuePoints` 1-10 and credit bands inside §5.2's
// authored band-1 range of 40-260cr. The mean of the twelve row midpoints is
// 140cr, against the 150cr credit-equivalent §5.5 assigns band 1 — which is what
// makes "the distribution matches the ladder" an assertion rather than a
// restatement. `valuePoints` rank-orders the same way mid-credits do, so the
// one dial an author writes is not decorative.
//
// BALANCE: the beacon ladder is the SHIPPED beacon band (40-180) widened at the
// top; the derelict ladder is the same range biased upward, because a boarded
// hulk is a bigger haul than a buoy. The shipped derelict band (120-520) is NOT
// reproduced here: 240-700 is band 2, and band 2 is T-114's pass. The temporary
// income dip that follows is finding F-113-C, recorded rather than tuned around.
const SALVAGE_ROWS: readonly ExploreOutcomeDefinition[] = [
  {
    id: 'explore-salvage-beacon-power-cells',
    valuePoints: 1,
    pools: ['beacon'],
    wireFound: "Player's crew pulled the beacon's power cells while they still held a charge.",
    payload: { kind: 'salvage', minCredits: 40, maxCredits: 90 },
  },
  {
    id: 'explore-salvage-beacon-signal-boards',
    valuePoints: 2,
    pools: ['beacon'],
    wireFound: "Player's crew unshipped a rack of signal boards from {name}.",
    payload: { kind: 'salvage', minCredits: 50, maxCredits: 110 },
  },
  {
    id: 'explore-salvage-beacon-antenna-array',
    valuePoints: 3,
    pools: ['beacon'],
    wireFound: "Player's crew cut the antenna array free and stowed it in sections.",
    payload: { kind: 'salvage', minCredits: 60, maxCredits: 130 },
  },
  {
    id: 'explore-salvage-beacon-transponder',
    valuePoints: 4,
    pools: ['beacon'],
    wireFound: "Player's crew lifted a working Confederation transponder out of the housing.",
    payload: { kind: 'salvage', minCredits: 80, maxCredits: 160 },
  },
  {
    id: 'explore-salvage-beacon-station-bladder',
    valuePoints: 5,
    pools: ['beacon'],
    wireFound: "Player's crew siphoned a station-keeping bladder dry and carried the drums across.",
    payload: { kind: 'salvage', minCredits: 100, maxCredits: 200 },
  },
  {
    id: 'explore-salvage-beacon-signal-core',
    valuePoints: 7,
    pools: ['beacon'],
    wireFound: "Player's crew brought the whole signal core off {name}, mounts and all.",
    payload: { kind: 'salvage', minCredits: 120, maxCredits: 240 },
  },
  {
    id: 'explore-salvage-derelict-galley-stores',
    valuePoints: 3,
    pools: ['derelict'],
    wireFound: "Player's crew cleared the galley stores off {name} before the ice took them.",
    payload: { kind: 'salvage', minCredits: 60, maxCredits: 140 },
  },
  {
    id: 'explore-salvage-derelict-hull-plate',
    valuePoints: 5,
    pools: ['derelict'],
    wireFound: "Player's crew cut a run of sound hull plate off the wreck and lashed it down.",
    payload: { kind: 'salvage', minCredits: 90, maxCredits: 180 },
  },
  {
    id: 'explore-salvage-derelict-shielded-cabling',
    valuePoints: 6,
    pools: ['derelict'],
    wireFound: "Player's crew stripped a hundred metres of shielded cabling out of the spine.",
    payload: { kind: 'salvage', minCredits: 110, maxCredits: 210 },
  },
  {
    id: 'explore-salvage-derelict-drive-parts',
    valuePoints: 8,
    pools: ['derelict'],
    wireFound: "Player's crew broke a drive assembly down and carried out the serviceable half.",
    payload: { kind: 'salvage', minCredits: 130, maxCredits: 230 },
  },
  {
    id: 'explore-salvage-derelict-strongbox',
    valuePoints: 9,
    pools: ['derelict'],
    wireFound: "Player's crew cut a purser's strongbox out of the deck plates aboard {name}.",
    payload: { kind: 'salvage', minCredits: 150, maxCredits: 250 },
  },
  {
    id: 'explore-salvage-derelict-sealed-hold',
    valuePoints: 10,
    pools: ['derelict'],
    wireFound: "Player's crew found one hold still sealed and shifted the whole lot across.",
    payload: { kind: 'salvage', minCredits: 170, maxCredits: 260 },
  },
];

// --- T-113 · BAND 1 — the lore rows that carry a Signal Fragment ------------
//
// 8 rows, one per entry of each fragment pool, ids DERIVED from the pools by
// `.map` so a pool edit can never leave a fragment with no row to reach it (the
// property the content-integrity suite has asserted since T-110). The prose is
// authored per fragment below, keyed by the same id — a lookup table, not a
// branch.
//
// The pools OVERLAP on `frag-nemesis-02` and `grantFragment` dedupes silently
// (finding F-100-2), so a repeat draw emits no `FragmentAcquired` at all. The
// row's own line is then the ONLY thing the player gets for 80 fuel and a die,
// which is exactly the silence §2.4 said the header's prose closes. Each line is
// therefore written to describe the FIND, not the file: it reads correctly
// whether or not the fragment was already held.
const BEACON_FRAGMENT_COPY: Readonly<Record<string, string>> = {
  'frag-nemesis-02':
    "Player's crew copied a cargo manifest out of the beacon's buffer — a route no port ever filed.",
  'frag-nemesis-05':
    "Player's crew held the channel open long enough to record a human voice reading out a name.",
  'frag-nemesis-08':
    "Player's crew logged the old carrier clean off {name} for once — header block and all.",
};

const DERELICT_FRAGMENT_COPY: Readonly<Record<string, string>> = {
  'frag-nemesis-02': "Player's crew lifted a water-ruined cargo manifest off the purser's station.",
  'frag-nemesis-03': "Player's crew found a Reptiloid choral pattern still cycling on a dead bus.",
  'frag-nemesis-04':
    "Player's crew recovered a burn schedule from the nav locker — all figures, no destination.",
  'frag-nemesis-06':
    "Player's crew pulled the wreck's own flight log and read the last forty entries twice.",
  'frag-nemesis-07':
    'Player found a withdrawn Confederation survey file stowed aboard {name}, well away from the log.',
};

/** Row id for a fragment-bearing lore row. The DRAW TABLE and the ROWS are both
 *  derived from this, so the two can never drift apart. */
function fragmentRowId(pool: PoiType, fragmentId: string): string {
  return `explore-lore-${pool}-${fragmentId}`;
}

const FRAGMENT_LORE_ROWS: readonly ExploreOutcomeDefinition[] = [
  ...BEACON_FRAGMENT_POOL.map((fragmentId) => ({
    id: fragmentRowId('beacon', fragmentId),
    // BALANCE: every fragment sits at the same point on the ladder. A fragment's
    // worth is the FILE it completes, not the row it came off — pricing one
    // above another would be a second dial pretending to be the first.
    valuePoints: 6,
    pools: ['beacon'] as const,
    wireFound: BEACON_FRAGMENT_COPY[fragmentId],
    payload: { kind: 'lore' as const, fragmentId },
  })),
  ...DERELICT_FRAGMENT_POOL.map((fragmentId) => ({
    id: fragmentRowId('derelict', fragmentId),
    valuePoints: 6,
    pools: ['derelict'] as const,
    wireFound: DERELICT_FRAGMENT_COPY[fragmentId],
    payload: { kind: 'lore' as const, fragmentId },
  })),
];

// --- T-114 · BAND 2 — the mid salvage rows (§5.2, §5.5) ---------------------
//
// 14 rows, 6 beacon / 8 derelict, `valuePoints` 11-30 and credit bands inside
// §5.2's authored band-2 range of 240-700cr. The mean of the fourteen row
// midpoints is 475cr against the 470cr credit-equivalent §5.5 assigns band 2.
// The band's FLOOR and CEILING are both reached (240 on the lowest beacon row,
// 700 on the top five), because a table that never touches either end is a
// narrower band wearing §5.2's label.
//
// `valuePoints` rank-orders mid-credits across the WHOLE authored salvage set,
// band 1 and band 2 together: band 1's top row sits at 10 vp / 215cr mid, and
// the lowest row here is 11 vp / 280cr mid. The pairwise property in
// `exploreContent.test.ts` checks every pair, so the two passes have to agree.
//
// BALANCE: 240-700 is the SHIPPED derelict band (120-520) widened at both ends,
// exactly as §5.2's provenance note says. The derelict half of this pass is what
// restores the `rich_hulk` deed's 400cr trigger after F-113-D staged it here:
// over the re-pointed 14-id derelict salvage leg, P(SalvageRecovered >= 400) is
// 0.384, against 0.302 for the `legacy-salvage-derelict` row it replaces.
const BAND2_SALVAGE_ROWS: readonly ExploreOutcomeDefinition[] = [
  {
    id: 'explore-salvage-beacon-fusion-stack',
    valuePoints: 11,
    pools: ['beacon'],
    wireFound:
      "Player's crew cut the beacon's fusion stack out of its cradle over two long shifts.",
    payload: { kind: 'salvage', minCredits: 240, maxCredits: 320 },
  },
  {
    id: 'explore-salvage-derelict-machine-shop',
    valuePoints: 12,
    pools: ['derelict'],
    wireFound: "Player's crew emptied the wreck's machine shop of every tool still worth a hand.",
    payload: { kind: 'salvage', minCredits: 250, maxCredits: 370 },
  },
  {
    id: 'explore-salvage-beacon-optics-bench',
    valuePoints: 13,
    pools: ['beacon'],
    wireFound:
      "Player's crew unbolted a survey optics bench from {name} and floated it across piece by piece.",
    payload: { kind: 'salvage', minCredits: 260, maxCredits: 420 },
  },
  {
    id: 'explore-salvage-derelict-cargo-cranes',
    valuePoints: 14,
    pools: ['derelict'],
    wireFound: "Player's crew unshipped a pair of cargo cranes from {name} and swung them aboard.",
    payload: { kind: 'salvage', minCredits: 270, maxCredits: 470 },
  },
  {
    id: 'explore-salvage-derelict-reactor-shielding',
    valuePoints: 15,
    pools: ['derelict'],
    wireFound:
      "Player's crew cut the reactor shielding into carryable plates and hauled it out through the spine.",
    payload: { kind: 'salvage', minCredits: 280, maxCredits: 520 },
  },
  {
    id: 'explore-salvage-beacon-cryo-drum',
    valuePoints: 16,
    pools: ['beacon'],
    wireFound:
      "Player's crew thawed a cryo drum of sealed instrument stock out of the buoy's belly.",
    payload: { kind: 'salvage', minCredits: 300, maxCredits: 560 },
  },
  {
    id: 'explore-salvage-derelict-medical-bay',
    valuePoints: 17,
    pools: ['derelict'],
    wireFound: "Player's crew stripped the medical bay to the bulkheads, cabinets and all.",
    payload: { kind: 'salvage', minCredits: 320, maxCredits: 600 },
  },
  {
    id: 'explore-salvage-derelict-lifeboat',
    valuePoints: 18,
    pools: ['derelict'],
    wireFound:
      "Player's crew freed an unlaunched lifeboat from its clamps and towed it home behind them.",
    payload: { kind: 'salvage', minCredits: 340, maxCredits: 640 },
  },
  {
    id: 'explore-salvage-beacon-pressure-hull',
    valuePoints: 19,
    pools: ['beacon'],
    wireFound:
      "Player's crew took a whole pressure hull section, ring frames and all, and lashed it under the keel.",
    payload: { kind: 'salvage', minCredits: 360, maxCredits: 680 },
  },
  {
    id: 'explore-salvage-derelict-bonded-hold',
    valuePoints: 20,
    pools: ['derelict'],
    wireFound:
      "Player's crew burned the bonded hold open and shifted every crate in it before the shift ended.",
    payload: { kind: 'salvage', minCredits: 400, maxCredits: 700 },
  },
  {
    id: 'explore-salvage-beacon-relay-mast',
    valuePoints: 22,
    pools: ['beacon'],
    wireFound:
      "Player's crew felled the relay mast off {name} and stowed it in four numbered lengths.",
    payload: { kind: 'salvage', minCredits: 460, maxCredits: 700 },
  },
  {
    id: 'explore-salvage-derelict-drive-core',
    valuePoints: 23,
    pools: ['derelict'],
    wireFound: "Player's crew walked the whole drive core out of {name} on jacks, a metre an hour.",
    payload: { kind: 'salvage', minCredits: 520, maxCredits: 700 },
  },
  {
    id: 'explore-salvage-beacon-instrument-vault',
    valuePoints: 25,
    pools: ['beacon'],
    wireFound:
      "Player's crew cracked a Confederation instrument vault open and carried out every rack in it.",
    payload: { kind: 'salvage', minCredits: 580, maxCredits: 700 },
  },
  {
    id: 'explore-salvage-derelict-flag-bridge',
    valuePoints: 28,
    pools: ['derelict'],
    wireFound:
      "Player's crew emptied a flag bridge of its fittings and left the frames bare behind them.",
    payload: { kind: 'salvage', minCredits: 640, maxCredits: 700 },
  },
];

// --- T-114 · BAND 2 — the low unique items (§4, §5.2) -----------------------
//
// 8 rows, and the CEILING they are authored against is §5.2's band-2 column,
// transcribed onto `EXPLORE_VALUE_BANDS` below and asserted by the validator:
// +1 component strength / +20 maxFuel for Class A, `floor <= 3` for Class B, and
// NO `cargoPods` (pods are bands 3-4). Exactly one Class-B row ships here — §4.2
// places item 1 of 3 at band 2 and items 2-3 at bands 3-4, which are T-115's.
//
// FINDING F-114-B · THE CLASS-A STRENGTH CEILING AT THIS BAND IS BELOW ITS OWN
// READERS' GRANULARITY, and it is reported rather than raised. Every engine
// reader of component strength divides before it becomes a bonus — `navBonus`
// by `NAV_BONUS_DIVISOR = 10`, so `navigation +1` yields +0 to a PILOT check —
// so a `+1 strength` grant is perceptible only when it happens to cross a
// divisor boundary the ship was already sitting on. The `maxFuel +20` arm is the
// only unconditionally perceptible Class-A grant at this tier, which is why the
// mix leans on it (3 of 7). BIASING THE MIX INSIDE THE CEILING IS AUTHORING;
// RAISING THE CEILING WOULD NOT BE. Recommend the ceiling question go to
// T-115/T-116 or the owner.
const BAND2_ITEM_ROWS: readonly ExploreOutcomeDefinition[] = [
  {
    id: 'explore-item-trim-tanks',
    valuePoints: 17,
    pools: ['beacon', 'derelict'],
    wireFound:
      "Player's crew found a set of auxiliary trim tanks still sound and plumbed them into the ship's own run.",
    payload: { kind: 'unique-item', itemId: 'item-trim-tanks' },
  },
  {
    id: 'explore-item-bladder-rig',
    valuePoints: 18,
    pools: ['beacon', 'derelict'],
    wireFound:
      "Player's crew recovered a salvaged bladder rig off {name} and slung it along the spine.",
    payload: { kind: 'unique-item', itemId: 'item-bladder-rig' },
  },
  {
    id: 'explore-item-ullage-pods',
    valuePoints: 19,
    pools: ['beacon', 'derelict'],
    wireFound:
      "Player's crew freed a cluster of ullage pods from the wreckage and welded them to the tank farm.",
    payload: { kind: 'unique-item', itemId: 'item-ullage-pods' },
  },
  {
    id: 'explore-item-sight-rings',
    valuePoints: 20,
    pools: ['beacon', 'derelict'],
    wireFound:
      "Player's crew lifted a gunner's sight rings out of a dead turret and fitted them to their own.",
    payload: { kind: 'unique-item', itemId: 'item-sight-rings' },
  },
  {
    id: 'explore-item-drift-compass',
    valuePoints: 21,
    pools: ['beacon', 'derelict'],
    wireFound:
      "Player's crew carried off a drift compass that still swung true after all the cold years.",
    payload: { kind: 'unique-item', itemId: 'item-drift-compass' },
  },
  {
    id: 'explore-item-scrubber-cores',
    valuePoints: 22,
    pools: ['beacon', 'derelict'],
    wireFound:
      "Player's crew found a crate of spare scrubber cores, sealed and dry, and racked them in the plant.",
    payload: { kind: 'unique-item', itemId: 'item-scrubber-cores' },
  },
  {
    id: 'explore-item-hull-doublers',
    valuePoints: 24,
    pools: ['beacon', 'derelict'],
    wireFound:
      "Player's crew cut a stack of hull doubler plates free and stitched them over the ship's worn frames.",
    payload: { kind: 'unique-item', itemId: 'item-hull-doublers' },
  },
  {
    // THE ONE CLASS-B ROW OF THIS PASS (§4.2 item 1 of 3), and the top of the
    // item set on the ladder. `item-tally-slate` grants `{ kind: 'floor', floor:
    // 3 }`, which is inside band 2's `floor <= 3` column and goes completely
    // inert the day a quartermaster (floor 5) is aboard — floors take MAX.
    id: 'explore-item-tally-slate',
    valuePoints: 26,
    pools: ['beacon', 'derelict'],
    wireFound:
      "Player's crew brought a gunnery tally-slate off {name} — old Confederation issue, and still counting.",
    payload: { kind: 'unique-item', itemId: 'item-tally-slate' },
  },
];

// --- T-114 · BAND 2 — the NPC introductions (§2.2, §5.2) --------------------
//
// 6 rows, `dispositionDelta` 1-2: an INTRODUCTION moves standing a pip or two,
// never a chain's worth. Every `profileId` is a real id from `ALL_NPC_PROFILES`
// (cast.ts) — the validator resolves each one against BOTH that table and the
// live `createInitialState().npcs` roster, because `applyEffects`'s disposition
// arm silently `continue`s on a roster miss, so "the id exists in the cast" is
// not the same claim as "the effect lands".
//
// The six are chosen for FICTION rather than for coverage: each is a captain a
// wreck or a buoy could plausibly put you next to.
const BAND2_NPC_ROWS: readonly ExploreOutcomeDefinition[] = [
  {
    id: 'explore-npc-doc-salvage',
    valuePoints: 11,
    pools: ['beacon', 'derelict'],
    wireFound:
      'Player raised Doc Salvage on the wreck channel and traded bearings until the watch turned.',
    payload: { kind: 'npc', profileId: 'npc-doc-salvage', dispositionDelta: 2 },
  },
  {
    id: 'explore-npc-rust-bucket',
    valuePoints: 12,
    pools: ['beacon', 'derelict'],
    wireFound:
      'Player found Rust Bucket already tied alongside and split the find rather than argue it.',
    payload: { kind: 'npc', profileId: 'npc-rust-bucket', dispositionDelta: 2 },
  },
  {
    id: 'explore-npc-junk-lord',
    valuePoints: 13,
    pools: ['beacon', 'derelict'],
    wireFound:
      "Player logged the find's ident to the Junk Lord's board and got a civil answer back for once.",
    payload: { kind: 'npc', profileId: 'npc-junk-lord', dispositionDelta: 1 },
  },
  {
    id: 'explore-npc-star-gazer',
    valuePoints: 14,
    pools: ['beacon', 'derelict'],
    wireFound:
      'Player passed Star Gazer a clean copy of the sky log off {name} and asked nothing for it.',
    payload: { kind: 'npc', profileId: 'npc-star-gazer', dispositionDelta: 1 },
  },
  {
    id: 'explore-npc-the-broker',
    valuePoints: 15,
    pools: ['beacon', 'derelict'],
    wireFound:
      'Player left a sealed note in the drop for the Broker, the way the old hands say it is done.',
    payload: { kind: 'npc', profileId: 'npc-the-broker', dispositionDelta: 1 },
  },
  {
    id: 'explore-npc-smuggler-ray',
    valuePoints: 16,
    pools: ['beacon', 'derelict'],
    wireFound:
      "Player found Smuggler Ray's mark cut into the frame of {name} and added their own beneath it.",
    payload: { kind: 'npc', profileId: 'npc-smuggler-ray', dispositionDelta: 2 },
  },
];

// --- T-114 · BAND 2 — the first questline hooks (§2.2, §2.5) ----------------
//
// 3 rows. A questline row carries a `storyletId` and a `delayDays` and NOTHING
// ELSE: the engine turns it into a real `StoryletEffects.schedule` through the
// same `applyEffects` a played choice uses, and the storylet's OWN
// `StoryletTrigger` decides whether it is offerable (§2.5). There is no
// predicate here and there must never be one.
//
// Each target is a `scheduledOnly` storylet authored in `storylets.ts` under the
// `explore.*` id prefix, and each carries a `wireResolution` so a hook the player
// never plays resolves on the wire through the existing `resolveAbandonedChains`
// sweep instead of leaving a dangling scheduled entry. The ids are re-exported
// below as `EXPLORE_SCHEDULED_STORYLET_IDS` — DERIVED from these rows, never
// transcribed — so `defineStorylets` can see that an explore outcome is a
// legitimate scheduler that is not itself a storylet.
const BAND2_QUESTLINE_ROWS: readonly ExploreOutcomeDefinition[] = [
  {
    id: 'explore-quest-cold-berth',
    valuePoints: 27,
    pools: ['beacon', 'derelict'],
    wireFound: 'Player found one berth aboard {name} still warm, and its occupant still breathing.',
    payload: { kind: 'questline', storyletId: 'explore.cold-berth.survivor', delayDays: 2 },
  },
  {
    id: 'explore-quest-signal-debt',
    valuePoints: 29,
    pools: ['beacon', 'derelict'],
    wireFound:
      'Player pulled a salvage claim out of the buffer, filed against a ship that never came back for it.',
    payload: { kind: 'questline', storyletId: 'explore.signal-debt.claim', delayDays: 3 },
  },
  {
    id: 'explore-quest-black-ledger',
    valuePoints: 30,
    pools: ['beacon', 'derelict'],
    wireFound:
      "Player recovered a courier's ledger from the find with a rendezvous still three days out.",
    payload: { kind: 'questline', storyletId: 'explore.black-ledger.courier', delayDays: 1 },
  },
];

// --- T-114 · BAND 2 — the lore rows that carry EFFECTS ----------------------
//
// 2 rows exercising the SECOND optional field of the `lore` payload
// (`effects?: StoryletEffects`), which no row in the tree exercised before this
// pass — so `resolveExploreOutcome`'s `payload.effects !== undefined` arm was
// dead code until now. NEITHER row carries a `fragmentId`: the eight
// fragment-bearing rows are derived from the pools at band 1, and a second row
// per fragment would duplicate that coverage without adding a fragment.
//
// BALANCE: the effects are modest against a 470cr band-2 credit-equivalent — a
// recorded flag plus a single point of standing with the power the find
// concerns. No credits: a `lore` row paying credits would be a salvage row
// wearing a different kind.
const BAND2_LORE_EFFECT_ROWS: readonly ExploreOutcomeDefinition[] = [
  {
    id: 'explore-lore-roll-of-the-lost',
    valuePoints: 21,
    pools: ['beacon', 'derelict'],
    wireFound:
      "Player copied out the find's roll of the lost and filed it with the Confederation registry.",
    payload: {
      kind: 'lore',
      effects: {
        flags: [{ name: 'explore.roll-of-the-lost.filed', value: true }],
        reputation: [{ faction: 'confederation', delta: 1 }],
      },
    },
  },
  {
    id: 'explore-lore-rebel-cache',
    valuePoints: 23,
    pools: ['beacon', 'derelict'],
    wireFound:
      'Player charted a rebel cache off a dead-drop aboard {name} and left the coordinates where they lay.',
    payload: {
      kind: 'lore',
      effects: {
        flags: [{ name: 'explore.rebel-cache.charted', value: true }],
        reputation: [{ faction: 'rebels', delta: 1 }],
      },
    },
  },
];

/**
 * Every explore outcome the game can yield.
 *
 * T-113 shipped the 34 AUTHORED rows of bands 0 and 1 (§5.3 pass 1); T-114 adds
 * the 33 rows of band 2 (§5.3 pass 2), for 67 authored rows plus the two
 * surviving transitional `legacy-contraband-*` rows. T-115 adds bands 3-4 and
 * the table totals 100.
 *
 * FINDING F-113-B · the transitional `contraband` kind SURVIVES this pass.
 * F-110-A assigned its retirement to T-113, but deleting the member from
 * `ExploreOutcomePayload` makes the engine's exhaustive `case 'contraband':` a
 * `tsc` error — engine work, which this task is forbidden. The two rows below
 * therefore stay, which also preserves the sealed-pod carry-choice storylet
 * rather than silently deleting it. Retire it with the draw flip (F-113-A).
 *
 * FINDING F-113-D · CLOSED AT T-114. T-113 staged the derelict salvage leg here
 * rather than re-pointing it, because the `rich_hulk` deed (content `deeds.ts`)
 * fires on a `SalvageRecovered` of 400cr or more and `legacy-salvage-derelict`
 * (120-520) was the only row in the game that could trip it while the authored
 * table topped out at band 1's 260cr. Merely diluting that leg with six authored
 * rows was measured to push the deed out of 21 of 24 careers.
 *
 * BAND 2 REMOVES THE COUPLING, arithmetically rather than by hope. The derelict
 * salvage leg now draws uniformly over the 6 band-1 + 8 band-2 derelict salvage
 * rows, and P(SalvageRecovered >= 400) over that leg is 0.384 — against 0.302 for
 * the single row it replaces. So `legacy-salvage-derelict` is DELETED here and
 * the leg re-pointed, exactly as T-114 was owed. The two `legacy-contraband-*`
 * rows still survive (F-113-B): deleting the union member is engine work.
 */
export const EXPLORE_OUTCOMES: readonly ExploreOutcomeDefinition[] = [
  ...DEAD_END_ROWS,
  ...SALVAGE_ROWS,
  ...FRAGMENT_LORE_ROWS,
  ...BAND2_SALVAGE_ROWS,
  ...BAND2_ITEM_ROWS,
  ...BAND2_NPC_ROWS,
  ...BAND2_QUESTLINE_ROWS,
  ...BAND2_LORE_EFFECT_ROWS,
  {
    id: 'legacy-contraband-beacon',
    valuePoints: 14,
    pools: ['beacon'],
    wireFound: '',
    payload: { kind: 'contraband' },
  },
  {
    id: 'legacy-contraband-derelict',
    valuePoints: 14,
    pools: ['derelict'],
    wireFound: '',
    payload: { kind: 'contraband' },
  },
];

/**
 * T-114 · THE STORYLETS AN EXPLORE OUTCOME CAN SCHEDULE, derived from the rows
 * above by `.flatMap` and never transcribed — so a questline row and the id it
 * points at cannot drift apart.
 *
 * WHY THIS EXPORT EXISTS AT ALL. `storyletValidation.ts` builds its set of
 * "scheduled targets" by walking every storylet's own `effects.schedule`, and
 * then errors on any `scheduledOnly` storylet (or any storylet carrying a
 * `wireResolution`) that nothing schedules. That rule was written when a
 * storylet was the only possible scheduler. An explore `questline` row is a
 * SECOND legitimate scheduler that is not itself a storylet, so the validator
 * takes this list as its other input rather than having the rule weakened.
 *
 * READER: `storylets.ts`, which passes it to `defineStorylets`. The direction of
 * the dependency is deliberate — `exploration.ts` imports nothing from
 * `storylets.ts` at runtime (its `StoryletEffects` import is `import type` and is
 * erased), so `storylets.ts -> exploration.ts -> nemesis.ts` is acyclic.
 */
export const EXPLORE_SCHEDULED_STORYLET_IDS: readonly string[] = EXPLORE_OUTCOMES.flatMap((row) =>
  row.payload.kind === 'questline' ? [row.payload.storyletId] : [],
);

// --- The unique-item table (T-112, docs/EXPLORE_REDESIGN.md §4) -------------

/**
 * T-112 · The ship elements a CLASS-A item can move.
 *
 * DECLARED HERE, NOT IMPORTED FROM THE ENGINE. `ShipComponentId` is an engine
 * type and content must never depend on the engine — the precedent is stated
 * outright in `components.ts` (`HULL_DAMAGE_WEIGHT`). The engine pins the two
 * unions equal with a compile-time `AssertEqual` in `exploreOutcomes.ts`, so a
 * component renamed on either side is a `tsc` failure rather than a dead row.
 */
export type ShipElementComponentId =
  'hull' | 'drives' | 'cabin' | 'lifeSupport' | 'weapons' | 'navigation' | 'robotics' | 'shields';

/**
 * ONE declared delta a Class-A item applies to the ship. The ELEMENT CLASS is the
 * discriminant the engine switches on; the row supplies only its parameters. No
 * row names a rule: `component` deltas clamp to the documented `ComponentState`
 * strength bound, a `maxFuel` delta is realized through the engine's single
 * `syncMaxFuel` chokepoint, and a `cargoPods` delta is clamped by the yard's own
 * `maxCargoPodsForShip`.
 */
export type ShipElementDelta =
  | { element: 'component'; component: ShipElementComponentId; strength: number }
  | { element: 'maxFuel'; amount: number }
  | { element: 'cargoPods'; amount: number };

/**
 * ONE unique item a `{ kind: 'unique-item' }` outcome row can grant, in the two
 * classes §4 names:
 *
 *  - `class: 'ship'` — CLASS A, the workhorse tier: a declared list of ship-element
 *    deltas. Unbounded and pure content; this is where "+2 to PILOT checks"
 *    ambitions are re-authored as `navigation.strength +20`, which the engine's
 *    existing `navBonus` reader already turns into a check bonus.
 *  - `class: 'module'` — CLASS B, the die effect: the row names an
 *    `ExploreModuleContentId` and the module's `DiceBenefit` is looked up from
 *    `EXPLORE_MODULE_DICE_BENEFITS` (crew.ts). Deliberately capped at the three
 *    shipped modules — see that table's header for the cap argument.
 */
export type ExploreItemDefinition =
  | { id: string; name: string; class: 'ship'; deltas: readonly ShipElementDelta[] }
  | { id: string; name: string; class: 'module'; moduleId: ExploreModuleContentId };

/**
 * Every unique item the game can grant.
 *
 * T-112 shipped only the three CLASS-B modules, deliberately: it owned the effect
 * SURFACE, and the `unique-item` outcome ROWS that reach for it are authored by
 * T-113/T-114/T-115 against the §5.2 band ceilings. T-114 lands the first
 * CLASS-A items, seven of them, every one inside band 2's `+1 strength / +20
 * maxFuel` ceiling with NO `cargoPods` delta (pods are bands 3-4). The ceiling is
 * transcribed onto `EXPLORE_VALUE_BANDS` below and the validator checks each row
 * against its own band's column, so an item cannot outgrow the row that grants
 * it. See finding F-114-B on `BAND2_ITEM_ROWS` for the honest limit of `+1`.
 *
 * READERS: the engine's `unique-item` arm (`exploreOutcomes.ts`, by id) and the
 * UI's acquisition line (`ui/format.ts` `explorationOutcome`, for the name only).
 */
export const EXPLORE_ITEMS: readonly ExploreItemDefinition[] = [
  // --- T-114 · Class A, band 2 (the fuel arm) ---
  {
    id: 'item-trim-tanks',
    name: 'Auxiliary Trim Tanks',
    class: 'ship',
    deltas: [{ element: 'maxFuel', amount: 20 }],
  },
  {
    id: 'item-bladder-rig',
    name: 'Salvaged Bladder Rig',
    class: 'ship',
    deltas: [{ element: 'maxFuel', amount: 20 }],
  },
  {
    id: 'item-ullage-pods',
    name: 'Ullage Pod Cluster',
    class: 'ship',
    deltas: [{ element: 'maxFuel', amount: 20 }],
  },
  // --- T-114 · Class A, band 2 (the component arm, four distinct elements) ---
  {
    id: 'item-sight-rings',
    name: "Gunner's Sight Rings",
    class: 'ship',
    deltas: [{ element: 'component', component: 'weapons', strength: 1 }],
  },
  {
    id: 'item-drift-compass',
    name: 'Drift Compass',
    class: 'ship',
    deltas: [{ element: 'component', component: 'navigation', strength: 1 }],
  },
  {
    id: 'item-scrubber-cores',
    name: 'Spare Scrubber Cores',
    class: 'ship',
    deltas: [{ element: 'component', component: 'lifeSupport', strength: 1 }],
  },
  {
    id: 'item-hull-doublers',
    name: 'Hull Doubler Plates',
    class: 'ship',
    deltas: [{ element: 'component', component: 'hull', strength: 1 }],
  },
  // --- T-112 · Class B, the bounded module tier (§4.2) ---
  {
    id: 'item-tally-slate',
    name: 'Gunnery Tally-Slate',
    class: 'module',
    moduleId: 'module-tally-slate',
  },
  {
    id: 'item-marked-ephemeris',
    name: "Astrogator's Marked Ephemeris",
    class: 'module',
    moduleId: 'module-marked-ephemeris',
  },
  {
    id: 'item-berth-couch',
    name: "Staff Pilot's Berth-Couch",
    class: 'module',
    moduleId: 'module-berth-couch',
  },
];

/** Items keyed by id for O(1) lookup by the engine's `unique-item` arm. A miss is
 *  tolerated by the reader (the `CREW_BY_ID[…]?.benefit` precedent), so a save or
 *  a row naming a retired item mutates nothing. */
export const EXPLORE_ITEM_BY_ID: Record<string, ExploreItemDefinition> = Object.fromEntries(
  EXPLORE_ITEMS.map((item) => [item.id, item]),
);

// --- The value ladder's band table (T-111, docs/EXPLORE_REDESIGN.md §5.2) ---

/**
 * ONE BAND on the value ladder. A band is a half-open range of `valuePoints`
 * starting at `minValuePoints` and running to the next band's start; the engine's
 * `bandFor` walks the ordered list and keeps the LAST satisfied entry.
 *
 * T-113 landed the fourth column, `permittedKinds` (§5.2). T-114 lands the fifth
 * and sixth — `classACeiling` and `classB` — because this pass authors the first
 * `unique-item` rows and is therefore the first with anything to check them
 * against (finding F-112-C, below). §5.2 reserves ONE more, `draw weight`, for
 * the task that flips the engine to the single weighted draw (see F-113-A).
 * Extend this interface when that lands; do not re-invent a second table.
 *
 * FINDING F-114-A · BAND 2 CARRIES `questline`, AND §5.2's TABLE CELL DID NOT SAY
 * SO. Three places in the spec plus T-114's own charter say band 2 authors "the
 * first questline hooks" — §5.3's pass-2 bullet, §8's per-task handoff row, and
 * the task's Accept clause ("every questline outcome resolves into the existing
 * storylet system"). One place said otherwise: §5.2's band-2 `payload kinds
 * permitted` cell, which omitted it. That is an internal collision in the spec,
 * not a test to satisfy: NOTHING WAS RED, and `permittedKinds` has exactly one
 * reader in the whole tree (the content validator) — no engine line reads it, so
 * nothing about a seeded career changes either way. It is closed in the direction
 * the majority of the spec agrees on, and §5.2 is corrected in place, which is
 * the T-113 precedent (F-113-A corrected §2.4 and §8 the same way). The
 * alternative — authoring zero questline rows so the Accept clause is vacuously
 * true — would be metric-gaming.
 *
 * FINDING F-112-C · the two effect-strength columns were attributed to T-112 and
 * are RE-TARGETED to T-114 here. T-112 built the effect SURFACE (the resolver,
 * the module tier, the cockpit readouts) but authored NO `unique-item` outcome
 * rows — the first ones are band-2 rows and land with T-114. A ceiling column
 * added at T-112 would therefore have had zero consumers and nothing to validate
 * against, which is a stub raising a coverage signal rather than a rule. T-114
 * has rows to check, so the columns land with the validator that reads them.
 *
 * F-112-C IS WHY `draw weight` IS STILL ABSENT AT T-113. The weight column has
 * no consumer until the engine draws one weighted row per board, and that flip
 * is engine work this task is forbidden (F-113-A). Adding it here would be the
 * same stub the finding above rejected.
 *
 * THE ENFORCEMENT, stated so it is not lost: `ExploreOutcomeDefinition` has NO
 * `recoveryDays` key and MUST NEVER GAIN ONE. A content author cannot hand-tune
 * one row's recovery clock because there is nowhere to write it — a missing field
 * is a compile error, which is stronger than any test. `grep recoveryDays
 * packages/content/src/exploration.ts` must hit ONLY inside EXPLORE_VALUE_BANDS.
 *
 * IN-REPO PRECEDENT, deliberately copied: `RENOWN_DEED_THRESHOLDS` (deeds.ts) is
 * a content band table and `rankForDeedCount` (engine deeds.ts) is the one-line
 * engine rule that reads it by walking the ordered list and keeping the last
 * satisfied entry. Content owns where the bands sit; the engine owns what a band
 * MEANS.
 */
export interface ExploreValueBand {
  /** Ladder index. Monotone with `minValuePoints`; band 0 is the dead-end floor. */
  band: number;
  /** Inclusive lower bound on `valuePoints`. Rows MUST be ordered ascending. */
  minValuePoints: number;
  /** N — calendar days a find in this band takes to recover. 0 ⇒ same-day. */
  recoveryDays: number;
  /**
   * T-113 · WHICH PAYLOAD KINDS AN AUTHORED ROW IN THIS BAND MAY CARRY (§5.2).
   * Read by the content validator, which is what keeps a 100-row table from
   * quietly acquiring a band-0 unique item. The transitional `contraband` kind
   * appears in NO band, which is the mechanical statement that it is not part of
   * the settled taxonomy: the two rows carrying it are `legacy-` prefixed and are
   * excluded from the authored checks by that prefix.
   */
  permittedKinds: readonly ExploreOutcomePayload['kind'][];
  /**
   * T-114 · THE CLASS-A EFFECT CEILING (§5.2), per ship-element class. An item
   * granted by a row in this band may move a component's `strength` by at most
   * `strength`, `maxFuel` by at most `maxFuel`, and `cargoPods` by at most
   * `cargoPods` — where 0 means "not permitted in this band at all" (pods are
   * bands 3-4). Bands 0 and 1 permit no `unique-item` row, so their ceilings are
   * all 0 and the column is vacuous there by construction rather than by a
   * special case.
   */
  classACeiling: { strength: number; maxFuel: number; cargoPods: number };
  /**
   * T-114 · THE EXACT `DiceBenefit` SHAPES A CLASS-B ITEM IN THIS BAND MAY CARRY
   * (§5.2). An authored `floor` must be <= the permitted floor; `reroll` and
   * `extra-die` are boolean-grained per source (limit L1 in §4.3), so they are
   * either listed or not. EMPTY ⇒ no Class-B item may be granted at this band.
   *
   * The band ordering `floor < reroll < extra-die` is the game's OWN price
   * ordering — `crew-quartermaster` 2,000cr / `crew-navigator` 2,500cr /
   * `crew-second` 3,000cr — not a fresh judgement (§5.2's provenance note).
   */
  classB: readonly DiceBenefit[];
}

// BALANCE: the day counts are VERBATIM docs/EXPLORE_REDESIGN.md §5.2. Bands 0-1
// (58% of successful boards under §5.2's weights) recover same-day, so the common
// find behaves exactly like today's instant loot — the audit measured a median
// day-120 captain carrying 27 fuel, and a verb that always cost a multi-day
// commitment on top of an 80-fuel gate would be unusable for the captain it is
// meant to serve. Band 4's N is held at 6 so a day-24 find still reads as a
// legible gamble against the day-30 Tour One marker.
//
// The Class-A ceilings and Class-B permissions are VERBATIM §5.2 as well. A
// ceiling of 0 is "not permitted in this band"; an empty `classB` is "no die
// effect at this band at all".
export const EXPLORE_VALUE_BANDS: readonly ExploreValueBand[] = [
  {
    band: 0,
    minValuePoints: 0,
    recoveryDays: 0,
    permittedKinds: ['lore'],
    classACeiling: { strength: 0, maxFuel: 0, cargoPods: 0 },
    classB: [],
  },
  {
    band: 1,
    minValuePoints: 1,
    recoveryDays: 0,
    permittedKinds: ['salvage', 'lore'],
    classACeiling: { strength: 0, maxFuel: 0, cargoPods: 0 },
    classB: [],
  },
  {
    band: 2,
    minValuePoints: 11,
    recoveryDays: 1,
    // F-114-A · `questline` is here, and §5.2's table cell is corrected in place
    // to match §5.3, §8 and T-114's charter. See the interface header above.
    permittedKinds: ['salvage', 'unique-item', 'npc', 'lore', 'questline'],
    classACeiling: { strength: 1, maxFuel: 20, cargoPods: 0 },
    classB: [{ kind: 'floor', floor: 3 }],
  },
  {
    band: 3,
    minValuePoints: 31,
    recoveryDays: 3,
    permittedKinds: ['unique-item', 'questline', 'npc'],
    classACeiling: { strength: 6, maxFuel: 40, cargoPods: 1 },
    classB: [{ kind: 'reroll' }],
  },
  {
    band: 4,
    minValuePoints: 61,
    recoveryDays: 6,
    permittedKinds: ['unique-item', 'questline'],
    classACeiling: { strength: 10, maxFuel: 80, cargoPods: 1 },
    classB: [{ kind: 'extra-die' }],
  },
];

// --- The TRANSITIONAL three-leg draw (T-111b's shape, kept alive as DATA) ---

/**
 * T-110 · §2.4 is explicit that the single weighted draw is NOT behaviour-
 * preserving on its own: today's three legs are INDEPENDENT, so a lucky board
 * yields salvage AND a fragment AND a pod. The extraction therefore keeps the
 * three-leg draw alive — but as a content table pointing at row ids, not as
 * engine control flow.
 *
 * T-113 · THIS IS NO LONGER "the shipped T-111b table". It is the TRANSITIONAL
 * CARRIER: the leg chances are still the shipped ones verbatim, but every id it
 * addresses is now an AUTHORED row, which is what makes the 34 rows below
 * reachable through the real Explore verb without an engine line.
 *
 * FINDING F-113-A · THE SINGLE BAND-WEIGHTED DRAW IS UNOWNED, and T-115 cannot
 * ship without it. §2.4 pencilled the flip into T-113, but T-113's acceptance is
 * "zero lines changed under packages/engine/src" and §8's per-task handoff row
 * asks only for the rows — so the flip has no owner. It is two engine changes: a
 * `drawOutcome(rows, poiType, rng)` in `exploreOutcomes.ts` reading a new
 * `weight` column on `EXPLORE_VALUE_BANDS`, and one call-site swap in
 * `actions/exploration.ts`.
 *
 * T-114 · STILL UNOWNED, and the gap is now exactly as wide as it was: every
 * authored row except the 14 band-0 dead ends is addressed by a leg after this
 * pass, and those 14 remain undrawable for the same structural reason.
 *
 * TWO CONSEQUENCES CARRIED HERE, stated rather than hidden:
 *   1. The 14 band-0 DEAD ENDS are authored to §5.3 but are NOT DRAWABLE. This
 *      carrier has exactly three named legs and no "nothing else fired" arm, and
 *      inventing one would be the engine branch this task is forbidden.
 *   2. T-115's accept clause — "a seeded sweep finds at least one instance of
 *      every outcome" — is arithmetically impossible under a three-leg draw.
 * Recommended: a dedicated engine task between T-114 and T-115, or T-115's first
 * commit. The extraction it builds on is already done, so it is a draw-function
 * swap plus a fixture re-pin.
 */
export interface LegacyLootLeg {
  /** Probability (0-1) this leg fires on a given board. */
  chance: number;
  /** Rows this leg can yield. Empty ⇒ the leg never fires (and rolls nothing). */
  outcomeIds: readonly string[];
}

export interface LegacyPoiLootTable {
  salvage: LegacyLootLeg;
  fragment: LegacyLootLeg;
  contraband: LegacyLootLeg;
}

// The chances are VERBATIM the shipped T-111b table (beacon 0.55/0.30/0,
// derelict 0.80/0.35/0.40) — T-113 re-points the IDS and re-tunes NOTHING. The
// fragment leg's ids are the fragment pools in POOL ORDER, derived by `.map` and
// never transcribed, because the index a seeded pick lands on is load-bearing;
// per-fragment probability is therefore UNCHANGED by this pass, and the only
// difference on that leg is that a board now also speaks. The beacon's
// contraband leg keeps its zero chance (a beacon leaks signal, not sealed pods).
//
// T-114 · BOTH SALVAGE LEGS ARE NOW AUTHORED, and `legacy-salvage-derelict` is
// gone (F-113-D, closed on `EXPLORE_OUTCOMES` above). The two legs are shaped
// DIFFERENTLY, on purpose:
//
//   - the DERELICT leg stays SALVAGE-ONLY — the 6 band-1 + 8 band-2 derelict
//     salvage rows. The `rich_hulk` deed is calibrated on this leg's credit
//     distribution and nothing else in the game is, so putting a non-credit row
//     on it would dilute an authored deed for no gain.
//   - the BEACON leg is the "find" leg: its 6 band-1 + 6 band-2 beacon salvage
//     rows PLUS the 19 non-salvage band-2 rows (items, NPC introductions,
//     questline hooks, lore-with-effects). No deed is calibrated on the beacon
//     half — which is exactly why T-113 retired `legacy-salvage-beacon` outright
//     — and `drawLegacyLoot` resolves whatever id a leg names without caring what
//     KIND the row is. This is what makes the whole of pass 2 reachable through
//     the real Explore verb without an engine line, and it is the same move T-113
//     made when it re-pointed the fragment legs at authored lore rows.
//
// The consequence authored for: every row on a leg for pool P declares P in its
// own `pools`, which the validator asserts leg by leg.
function authoredSalvageLeg(pool: PoiType): readonly string[] {
  return [...SALVAGE_ROWS, ...BAND2_SALVAGE_ROWS]
    .filter((row) => row.pools.includes(pool))
    .map((row) => row.id);
}

/** The band-2 rows that are not salvage — the items, introductions, hooks and
 *  effect-bearing lore. Derived by `.filter`/`.map`, never transcribed, so a row
 *  added to any of the four blocks above cannot be orphaned off the leg. */
function band2NonSalvageLeg(pool: PoiType): readonly string[] {
  return [...BAND2_ITEM_ROWS, ...BAND2_NPC_ROWS, ...BAND2_QUESTLINE_ROWS, ...BAND2_LORE_EFFECT_ROWS]
    .filter((row) => row.pools.includes(pool))
    .map((row) => row.id);
}

export const LEGACY_POI_LOOT: Readonly<Record<PoiType, LegacyPoiLootTable>> = {
  beacon: {
    salvage: {
      chance: 0.55,
      outcomeIds: [...authoredSalvageLeg('beacon'), ...band2NonSalvageLeg('beacon')],
    },
    fragment: {
      chance: 0.3,
      outcomeIds: BEACON_FRAGMENT_POOL.map((id) => fragmentRowId('beacon', id)),
    },
    contraband: { chance: 0, outcomeIds: ['legacy-contraband-beacon'] },
  },
  derelict: {
    salvage: { chance: 0.8, outcomeIds: authoredSalvageLeg('derelict') },
    fragment: {
      chance: 0.35,
      outcomeIds: DERELICT_FRAGMENT_POOL.map((id) => fragmentRowId('derelict', id)),
    },
    contraband: { chance: 0.4, outcomeIds: ['legacy-contraband-derelict'] },
  },
};
