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
 * below is the ONLY place in the codebase a recovery day-count — or (T-131, owner
 * ruling D1) an EXTRA-DICE COST — is written. The engine's
 * `bandFor`/`recoveryDays`/`apCost` (exploreOutcomes.ts) read it; no row carries
 * an N or an `apCost` of its own, and the type is what enforces that.
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
 *
 * THE END OF THE TRANSITION. Two tasks land here, in this order, and the split
 * matters because only one of them is allowed to touch the engine:
 *
 *  - T-117, the single band-weighted draw — the dedicated ENGINE task F-113-A
 *    asked for, inserted between T-114 and T-115. The `weight` column joins
 *    `EXPLORE_VALUE_BANDS`, the transitional three-leg carrier (`LEGACY_POI_LOOT`
 *    and its two `legacy-contraband-*` rows) is DELETED, and with it the
 *    transitional `contraband` payload kind — findings F-113-A and F-113-B, both
 *    discharged. The sealed-pod carry choice that kind used to arm is re-homed
 *    onto three authored band-1 derelict lore rows (see `DERELICT_POD_EFFECTS`).
 *  - T-115, THE TAIL — content pass 3 of 3 (§5.3), the 33 rows of BANDS 3 AND 4:
 *    14 band-3 items (13 Class A + the `reroll` module), 6 band-3 questline hooks,
 *    5 band-3 NPC rows at `dispositionDelta` 3-4, 6 band-4 items (5 Class A + the
 *    `extra-die` module) and 2 band-4 questlines. Zero engine-source lines.
 *    THE TABLE NOW TOTALS 100 AND EVERY ROW IS AUTHORED.
 *
 * THE LADDER IS NOW VISIBLE END TO END, and it is visible as a RULE: bands 0-1
 * cost nothing beyond the sweep's own die, a band-2 find costs ONE CALENDAR DAY,
 * and a band-3/4 find costs TWO or THREE EXTRA DICE out of the same dawn hand
 * (T-131, owner ruling D1, 2026-07-31) — and no row anywhere says so.
 * `recoveryDays` and `apCost` read the band table and nothing else.
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
   *  T-115: EVERY row in the table carries copy, so the engine's `wireFound !== ''`
   *  guard is now vacuous by shape rather than by review — which is §2.4's
   *  silent-return fix (F-110-B) finally true of the whole table. */
  wireFound: string;
  payload: ExploreOutcomePayload;
}

/**
 * THE FIVE KINDS §2.2 SETTLES — and, from T-117, nothing else.
 *
 * A "DEAD END" is not a sixth kind: it is `{ kind: 'lore' }` with neither
 * optional field — prose and a wire line, no mechanical payoff, `valuePoints: 0`.
 *
 * FINDING F-110-A / F-113-B · DISCHARGED AT T-117. The transitional `contraband`
 * member is DELETED here. It survived T-110 (behaviour-preserving by charter),
 * T-113 and T-114 (content passes: deleting the member makes the engine's
 * exhaustive `case 'contraband':` a `tsc` error, which is engine work a content
 * pass is forbidden). T-117 IS the draw flip — the dedicated engine task F-113-A
 * asked for, inserted between T-114 and T-115 — so the retirement lands with it,
 * exactly where F-113-A said it would. The sealed-pod carry choice it used to arm is NOT deleted with it: it is
 * re-homed onto three authored band-1 derelict lore rows through `effects.flags`,
 * which is the settled route (§2.2, and the `explore-lore-*` precedent T-114 set).
 */
export type ExploreOutcomePayload =
  | { kind: 'salvage'; minCredits: number; maxCredits: number }
  | { kind: 'lore'; fragmentId?: string; effects?: StoryletEffects }
  | { kind: 'unique-item'; itemId: string }
  | { kind: 'questline'; storyletId: string; delayDays: number }
  | { kind: 'npc'; profileId: string; dispositionDelta: number };

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

/**
 * T-117 · THE SEALED POD, RE-HOMED (F-110-A discharged).
 *
 * `flags['signal.contraband.pending']` is the supply line for the
 * `derelict.sealed-pod` carry-choice storylet (`storylets.ts`), which is the only
 * way a pod ever enters the hold. Until T-117 it was armed by the transitional
 * `contraband` payload kind on the derelict contraband leg (0.40 chance × 50% of
 * boards ≈ 20% of successful boards). Deleting that kind with the draw flip would
 * have deleted the pod with it, so the flag is re-homed here — as `effects.flags`
 * on ALREADY-AUTHORED band-1 derelict lore rows, which is the settled route T-114
 * established with `explore-lore-roll-of-the-lost`.
 *
 * NO ROW IS ADDED FOR IT. §5.3's per-band counts (14/20/33/25/8) are fixed and
 * asserted, so a fourth "pod row" would be authoring against the ladder.
 *
 * THE THREE ARE CHOSEN ON FICTION, and each has to answer "why would this find
 * put a sealed pod in front of the captain?":
 *
 *  - `frag-nemesis-02` — the crew lift a CARGO MANIFEST off the purser's station.
 *    A manifest is the document that says what is aboard; reading one on a dead
 *    ship is exactly how a crew learns a hold holds something the paper does not.
 *    (The pod storylet's own prose opens "No manifest" — the two read together.)
 *  - `frag-nemesis-04` — a BURN SCHEDULE with all figures and no destination.
 *    Paperwork written not to be filed. A ship flying unfiled burns was carrying
 *    something it did not want logged, and it is still bolted in the hold.
 *  - `frag-nemesis-07` — a withdrawn Confederation survey file STOWED WELL AWAY
 *    FROM THE LOG. The row's own copy already says this ship hid things, and
 *    where one thing was hidden the crew look for the next.
 *
 * The other two derelict fragments are deliberately NOT on this list: a Reptiloid
 * choral pattern on a dead bus (`-03`) and the wreck's own flight log (`-06`) are
 * finds about listening and reading, not about cargo, and hanging a pod off them
 * would be arming a number rather than authoring a scene.
 *
 * BALANCE: three of the eleven derelict rows in band 1 ⇒ measured **20% → 4.4%**
 * of successful boards arm the pod. That is a deliberate, large fall and it is
 * REPORTED, not tuned around: the old rate was a leg that fired independently of
 * everything else on the board, and a single weighted draw cannot reproduce an
 * independent leg (§2.4). What it must do is keep the pillar SUPPLIED, and
 * `campaign-smuggler-gambler.test.ts`'s `podsTaken > 0` over a 300-day career is
 * the tripwire that says whether it does.
 *
 * A LOOKUP, NOT A BRANCH. The rows below read this table by key; content never
 * decides an outcome with an `if`.
 */
const DERELICT_POD_EFFECTS: Readonly<Record<string, StoryletEffects | undefined>> = {
  'frag-nemesis-02': { flags: [{ name: 'signal.contraband.pending', value: true }] },
  'frag-nemesis-04': { flags: [{ name: 'signal.contraband.pending', value: true }] },
  'frag-nemesis-07': { flags: [{ name: 'signal.contraband.pending', value: true }] },
};

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
    payload: { kind: 'lore' as const, fragmentId, effects: DERELICT_POD_EFFECTS[fragmentId] },
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

// --- T-115 · BAND 3 — the real-effect items (§4, §5.2) ----------------------
//
// 14 rows, `valuePoints` 31-60, and the CEILING they are authored against is
// §5.2's band-3 column, transcribed onto `EXPLORE_VALUE_BANDS` below: +6
// component strength / +40 maxFuel / +1 cargo pod for Class A, `reroll` for
// Class B. T-131 (D1): a band-3 find costs the ship TWO EXTRA DICE out of the
// same dawn hand, paid at claim — it no longer costs calendar days. That is the
// ladder showing through as a rule rather than as a per-row dial; the number lives
// in `EXPLORE_VALUE_BANDS.apCost` and nowhere else.
//
// 13 CLASS A + 1 CLASS B (`item-marked-ephemeris`, §4.2's item 2 of 3, in
// `EXPLORE_ITEMS` since T-112 and granted by no row until now).
//
// THE FIRST CARGO PODS IN THE TABLE ARE HERE. §5.2 puts pods at bands 3-4 and
// T-114 reasoned that a ceiling column nothing ever touches is a narrower band
// wearing its label, so two rows grant `cargoPods: +1` — clamped by the SHIPYARD's
// own `maxCargoPodsForShip`, never by a pod ceiling written a second time. All
// three `ShipElementDelta` element classes are exercised in this band.
//
// BALANCE: §5.5 prices band 3 at ~1,200cr credit-equivalent, estimated off the
// `CREW_ROLES` hire prices as the in-game market comparable. The Class-A grants
// here are 5-6x band 2's (`+1 strength` → `+5/+6`; `+20 maxFuel` → `+40`), which
// is the same multiple, and the Class-B `reroll` is `crew-navigator`'s 2,500cr
// benefit with no `dailyWage` attached. Nothing here is a fresh judgement about
// what an item is worth: the ceilings are §5.2 verbatim and the mix reaches them.
const BAND3_ITEM_ROWS: readonly ExploreOutcomeDefinition[] = [
  {
    id: 'explore-item-survey-array',
    valuePoints: 31,
    pools: ['beacon', 'derelict'],
    wireFound:
      "Player's crew stripped a deep-survey array off {name} and spent three days marrying it to their own charts.",
    payload: { kind: 'unique-item', itemId: 'item-survey-array' },
  },
  {
    id: 'explore-item-long-tanks',
    valuePoints: 33,
    pools: ['beacon', 'derelict'],
    wireFound:
      "Player's crew cut a pair of long-range tanks out of the wreck and plumbed them the length of the spine.",
    payload: { kind: 'unique-item', itemId: 'item-long-tanks' },
  },
  {
    id: 'explore-item-torque-frames',
    valuePoints: 35,
    pools: ['beacon', 'derelict'],
    wireFound:
      "Player's crew recovered a set of drive torque frames and shimmed them into their own mounts.",
    payload: { kind: 'unique-item', itemId: 'item-torque-frames' },
  },
  {
    id: 'explore-item-belt-loader',
    valuePoints: 37,
    pools: ['beacon', 'derelict'],
    wireFound:
      "Player's crew freed a belt-loader arm from the wreck and bolted it over their own hold.",
    payload: { kind: 'unique-item', itemId: 'item-belt-loader' },
  },
  {
    id: 'explore-item-armoured-glacis',
    valuePoints: 39,
    pools: ['beacon', 'derelict'],
    wireFound:
      "Player's crew cut an armoured glacis plate off a warship frame and welded it across their own bow.",
    payload: { kind: 'unique-item', itemId: 'item-armoured-glacis' },
  },
  {
    id: 'explore-item-recirculators',
    valuePoints: 41,
    pools: ['beacon', 'derelict'],
    wireFound:
      "Player's crew found a full bank of air recirculators sealed against the cold and carried every one across.",
    payload: { kind: 'unique-item', itemId: 'item-recirculators' },
  },
  {
    id: 'explore-item-laid-rails',
    valuePoints: 43,
    pools: ['beacon', 'derelict'],
    wireFound:
      "Player's crew unshipped a pair of laid gun rails from {name} and spent a day getting them true.",
    payload: { kind: 'unique-item', itemId: 'item-laid-rails' },
  },
  {
    id: 'explore-item-yard-crawler',
    valuePoints: 45,
    pools: ['beacon', 'derelict'],
    wireFound:
      "Player's crew coaxed a yard crawler out of its cradle and taught it their own hull's frames.",
    payload: { kind: 'unique-item', itemId: 'item-yard-crawler' },
  },
  {
    id: 'explore-item-pod-cradles',
    valuePoints: 47,
    pools: ['beacon', 'derelict'],
    wireFound:
      "Player's crew cut a set of cargo pod cradles free of the wreck and hung them under their own keel.",
    payload: { kind: 'unique-item', itemId: 'item-pod-cradles' },
  },
  {
    id: 'explore-item-field-coils',
    valuePoints: 49,
    pools: ['beacon', 'derelict'],
    wireFound:
      "Player's crew salvaged a set of shield field coils out of {name}, still cased in their shipping grease.",
    payload: { kind: 'unique-item', itemId: 'item-field-coils' },
  },
  {
    id: 'explore-item-deep-tanks',
    valuePoints: 51,
    pools: ['beacon', 'derelict'],
    wireFound:
      "Player's crew opened the wreck's deep bunkerage, found it sound, and cut the whole run out to carry home.",
    payload: { kind: 'unique-item', itemId: 'item-deep-tanks' },
  },
  {
    id: 'explore-item-lighter-hull',
    valuePoints: 53,
    pools: ['beacon', 'derelict'],
    wireFound:
      "Player's crew towed an intact cargo lighter out of the wreck's belly and racked it as a pod of their own.",
    payload: { kind: 'unique-item', itemId: 'item-lighter-hull' },
  },
  {
    id: 'explore-item-pilot-plate',
    valuePoints: 55,
    pools: ['beacon', 'derelict'],
    wireFound:
      "Player's crew lifted a pilot's armoured deck plate out of {name} and set it under their own station.",
    payload: { kind: 'unique-item', itemId: 'item-pilot-plate' },
  },
  {
    // CLASS B, §4.2's item 2 of 3. `item-marked-ephemeris` grants
    // `{ kind: 'reroll' }` — band 3's whole `classB` column — and it is the
    // navigator's 2,500cr benefit found rather than hired, so it draws no wage.
    id: 'explore-item-marked-ephemeris',
    valuePoints: 58,
    pools: ['beacon', 'derelict'],
    wireFound:
      "Player's crew found an astrogator's ephemeris aboard {name}, every page marked up in a dead woman's hand.",
    payload: { kind: 'unique-item', itemId: 'item-marked-ephemeris' },
  },
];

// --- T-115 · BAND 3 — the deep questline hooks (§2.2, §2.5) -----------------
//
// 6 rows, `delayDays` 1-5. The shape is T-114's exactly: a `storyletId` and a
// `delayDays` and NOTHING else, turned into a real `StoryletEffects.schedule` by
// the same `applyEffects` a played choice uses. Every target is a `scheduledOnly`
// storylet with a `wireResolution`, authored in `storylets.ts` under the
// `explore.*` prefix, and the ids are re-exported below by `.flatMap` rather than
// transcribed.
//
// BALANCE: these hooks pay in choices, not in a fixed sum. A band-3 hook's
// episode offers a larger decision than band 2's — a faction to cross, a berth to
// give up, a debt to take on — which is the honest shape of a ~1,200cr
// credit-equivalent that cannot be a credit figure without becoming a salvage row.
const BAND3_QUESTLINE_ROWS: readonly ExploreOutcomeDefinition[] = [
  {
    id: 'explore-quest-long-orbit',
    valuePoints: 32,
    pools: ['beacon', 'derelict'],
    wireFound:
      'Player found a lifeboat still on its long orbit, dry of air, with a course laid for a system nobody settles.',
    payload: { kind: 'questline', storyletId: 'explore.long-orbit.lifeboat', delayDays: 2 },
  },
  {
    id: 'explore-quest-quarantine-seal',
    valuePoints: 36,
    pools: ['beacon', 'derelict'],
    wireFound:
      'Player cut through a quarantine seal on {name} that had been welded shut from the inside.',
    payload: { kind: 'questline', storyletId: 'explore.quarantine.seal', delayDays: 3 },
  },
  {
    id: 'explore-quest-witness-tape',
    valuePoints: 40,
    pools: ['beacon', 'derelict'],
    wireFound:
      'Player recovered a witness recording naming three captains, two of whom are still flying.',
    payload: { kind: 'questline', storyletId: 'explore.witness.tape', delayDays: 4 },
  },
  {
    id: 'explore-quest-bonded-crate',
    valuePoints: 46,
    pools: ['beacon', 'derelict'],
    wireFound:
      'Player found a bonded crate aboard {name} addressed to an Astro League office that closed a decade ago.',
    payload: { kind: 'questline', storyletId: 'explore.bonded.crate', delayDays: 1 },
  },
  {
    id: 'explore-quest-charted-lane',
    valuePoints: 52,
    pools: ['beacon', 'derelict'],
    wireFound:
      "Player copied a lane out of the find's astrogation stack that appears on no Confederation chart.",
    payload: { kind: 'questline', storyletId: 'explore.charted.lane', delayDays: 5 },
  },
  {
    id: 'explore-quest-last-transmission',
    valuePoints: 57,
    pools: ['beacon', 'derelict'],
    wireFound:
      'Player recovered the last transmission off {name} and found it addressed, by name, to a living captain.',
    payload: { kind: 'questline', storyletId: 'explore.last.transmission', delayDays: 2 },
  },
];

// --- T-115 · BAND 3 — the standing that a real find buys (§2.2, §5.2) -------
//
// 5 rows, `dispositionDelta` 3-4 — against band 2's 1-2. THE LADDER HAS TO SHOW
// THROUGH HERE: a band-2 row is an INTRODUCTION (a pip of standing for a civil
// exchange over the wire); a band-3 row is a DEBT (the captain hands over
// something they could have kept and sold). The delta is the only dial that
// difference has, so it moves.
//
// Every `profileId` is resolved by the validator against BOTH `ALL_NPC_PROFILES`
// and the live `createInitialState().npcs` roster, because `applyEffects`'s
// disposition arm silently `continue`s on a roster miss.
const BAND3_NPC_ROWS: readonly ExploreOutcomeDefinition[] = [
  {
    id: 'explore-npc-void-runner',
    valuePoints: 34,
    pools: ['beacon', 'derelict'],
    wireFound:
      "Player passed Void Runner the whole of the find's lane data and would not be argued into a price.",
    payload: { kind: 'npc', profileId: 'npc-void-runner', dispositionDelta: 3 },
  },
  {
    id: 'explore-npc-the-phantom',
    valuePoints: 42,
    pools: ['beacon', 'derelict'],
    wireFound:
      "Player found the Phantom's own ident buried in the wreck's logs and wiped it before anyone else read it.",
    payload: { kind: 'npc', profileId: 'npc-the-phantom', dispositionDelta: 4 },
  },
  {
    id: 'explore-npc-nebula-rose',
    valuePoints: 48,
    pools: ['beacon', 'derelict'],
    wireFound:
      "Player carried a locker of personal effects off {name} and set it in Nebula Rose's hands unopened.",
    payload: { kind: 'npc', profileId: 'npc-nebula-rose', dispositionDelta: 4 },
  },
  {
    id: 'explore-npc-stellar-monk',
    valuePoints: 54,
    pools: ['beacon', 'derelict'],
    wireFound:
      "Player read the dead crew's names into the wire for the Stellar Monk and let the channel run to the end of it.",
    payload: { kind: 'npc', profileId: 'npc-stellar-monk', dispositionDelta: 3 },
  },
  {
    id: 'explore-npc-void-whisper',
    valuePoints: 60,
    pools: ['beacon', 'derelict'],
    wireFound:
      'Player handed Void Whisper a signal recovered off the find that no receiver in the Confederation admits to hearing.',
    payload: { kind: 'npc', profileId: 'npc-void-whisper', dispositionDelta: 4 },
  },
];

// --- T-115 · BAND 4 — the top of the table (§4, §5.2) -----------------------
//
// 6 unique-item rows, `valuePoints` 61-100, `apCost` 3 (T-131/D1 — it was N = 6
// until the ruling retired the day cost). This band is 3% of successful
// boards and its rows are the rarest content in the game, which is why the ceiling
// is REACHED rather than approached: +10 component strength / +80 maxFuel / +1 pod
// for Class A, `extra-die` for Class B. 5 CLASS A + 1 CLASS B
// (`item-berth-couch`, §4.2's item 3 of 3).
//
// FINDING F-114-B · CLOSED BY AUTHORING, not by a ceiling change. T-114 reported
// that band 2's `+1` Class-A strength ceiling sits below its own readers'
// granularity — `navBonus` divides component strength by `NAV_BONUS_DIVISOR = 10`,
// so `navigation +1` yields `+0` to a PILOT check — and recommended the question
// to T-115. The answer is that the ceiling was never the problem: §5.2 already
// authorises `+10` here, and `item-lane-computer` below is the FIRST perceptible
// component grant in the whole table, worth exactly `+1` to every PILOT check the
// captain ever rolls again. Band 2's granularity is band 2's, by design — the
// ladder is supposed to have a tier where a component grant is a rounding error
// and a tier where it is a permanent bonus. NOTHING IN §5.2 IS CHANGED.
//
// BALANCE: §5.5 prices band 4 at ~3,500cr credit-equivalent, estimated off
// `crew-second`'s 3,000cr extra-die hire plus the wage it never charges.
const BAND4_ITEM_ROWS: readonly ExploreOutcomeDefinition[] = [
  {
    id: 'explore-item-lane-computer',
    valuePoints: 61,
    pools: ['beacon', 'derelict'],
    wireFound:
      "Player's crew brought a Confederation lane computer off {name} intact, cradle, coolant loop and all.",
    payload: { kind: 'unique-item', itemId: 'item-lane-computer' },
  },
  {
    id: 'explore-item-bunker-run',
    valuePoints: 68,
    pools: ['beacon', 'derelict'],
    wireFound:
      "Player's crew spent six days cutting a capital bunkerage out of the wreck and rebuilding it around their own tanks.",
    payload: { kind: 'unique-item', itemId: 'item-bunker-run' },
  },
  {
    id: 'explore-item-capital-belt',
    valuePoints: 76,
    pools: ['beacon', 'derelict'],
    wireFound:
      "Player's crew unpicked a capital armour belt plate by plate and stitched every one onto their own hull.",
    payload: { kind: 'unique-item', itemId: 'item-capital-belt' },
  },
  {
    id: 'explore-item-spinal-mount',
    valuePoints: 84,
    pools: ['beacon', 'derelict'],
    wireFound:
      "Player's crew cut a spinal gun mount free of {name} and spent a week teaching their own frames to carry it.",
    payload: { kind: 'unique-item', itemId: 'item-spinal-mount' },
  },
  {
    id: 'explore-item-fleet-tender',
    valuePoints: 92,
    pools: ['beacon', 'derelict'],
    wireFound:
      "Player's crew walked a fleet tender's whole repair shop across, deck robots and racking together.",
    payload: { kind: 'unique-item', itemId: 'item-fleet-tender' },
  },
  {
    // CLASS B, §4.2's item 3 of 3 and the top of the item set on the ladder.
    // `item-berth-couch` grants `{ kind: 'extra-die' }` — band 4's whole `classB`
    // column, and the game's most expensive crew benefit (`crew-second`, 3,000cr)
    // found instead of hired. The existing hand cap still binds it.
    id: 'explore-item-berth-couch',
    valuePoints: 100,
    pools: ['beacon', 'derelict'],
    wireFound:
      "Player's crew cut a staff pilot's berth-couch out of {name} and mounted it beside their own board.",
    payload: { kind: 'unique-item', itemId: 'item-berth-couch' },
  },
];

// --- T-115 · BAND 4 — the two questlines at the top of the ladder -----------
//
// 2 rows. Same shape as every other questline row; what makes them band 4 is the
// weight of the decision the episode puts in front of the captain, and the three
// extra dice the find costs out of the dawn hand before it is even opened
// (T-131/D1 — it was six calendar days until the ruling retired the day cost).
const BAND4_QUESTLINE_ROWS: readonly ExploreOutcomeDefinition[] = [
  {
    id: 'explore-quest-cold-fleet',
    valuePoints: 65,
    pools: ['beacon', 'derelict'],
    wireFound:
      'Player charted a whole squadron of hulls off {name}, moored in line abreast and cold for forty years.',
    payload: { kind: 'questline', storyletId: 'explore.cold.fleet', delayDays: 3 },
  },
  {
    id: 'explore-quest-nemesis-berth',
    valuePoints: 88,
    pools: ['beacon', 'derelict'],
    wireFound:
      'Player found a berth aboard the find made up for someone who never boarded, and a name on the locker they know.',
    payload: { kind: 'questline', storyletId: 'explore.nemesis.berth', delayDays: 4 },
  },
];

/**
 * Every explore outcome the game can yield — 100 rows, and every one authored.
 *
 * T-113 shipped the 34 rows of bands 0 and 1 (§5.3 pass 1); T-114 added the 33
 * rows of band 2 (pass 2); T-115 adds the 25 rows of band 3 and the 8 of band 4
 * (pass 3). **The table totals 100 and carries no `legacy-` prefixed row at all**,
 * which is what makes "the table totals 100 outcomes" an unambiguous claim rather
 * than a count with an asterisk.
 *
 * FINDING F-113-B · DISCHARGED AT T-117. The two `legacy-contraband-*` rows are
 * deleted with the `contraband` payload kind and the transitional three-leg
 * carrier, all in T-117. See the `ExploreOutcomePayload` header for the
 * retirement and `DERELICT_POD_EFFECTS` for where the sealed pod went.
 *
 * FINDING F-113-D · CLOSED AT T-114, and it stays closed under the weighted draw.
 * The `rich_hulk` deed (content `deeds.ts`) fires on a `SalvageRecovered` of 400cr
 * or more; band 2's derelict salvage rows are what put that trigger back in reach
 * after `legacy-salvage-derelict` (120-520) was retired. Under the single draw the
 * deed's supply is the derelict salvage rows of bands 1-2 taken together, and
 * `exploreContent.test.ts` re-targets the assertion onto exactly that set.
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
  ...BAND3_ITEM_ROWS,
  ...BAND3_QUESTLINE_ROWS,
  ...BAND3_NPC_ROWS,
  ...BAND4_ITEM_ROWS,
  ...BAND4_QUESTLINE_ROWS,
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
 * T-115 adds 18 more Class-A items — 13 at band 3, 5 at band 4 — and gives the
 * two remaining Class-B modules the rows that grant them, so every entry in this
 * table is now reachable through the real Explore verb. The CLASS-B TIER IS STILL
 * EXACTLY THREE (`uniqueItem.test.ts` asserts the cap): §4.2 caps it because each
 * module costs engine work per instance (finding F-100-1), and three authored rows
 * granting three shipped modules is the cap being SPENT, not raised.
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
  // --- T-115 · Class A, band 3 (ceiling +6 strength / +40 maxFuel / +1 pod) ---
  //
  // 13 items, and the band's ceiling is REACHED on all three element classes: +6
  // strength (`item-armoured-glacis`, `item-pilot-plate`), +40 maxFuel
  // (`item-long-tanks`, `item-deep-tanks`) and the table's FIRST +1 cargo pod
  // (`item-pod-cradles`, `item-lighter-hull`). Two items carry a paired delta,
  // which the resolver handles as a list without a branch of its own.
  {
    id: 'item-survey-array',
    name: 'Deep-Survey Array',
    class: 'ship',
    deltas: [{ element: 'component', component: 'navigation', strength: 5 }],
  },
  {
    id: 'item-long-tanks',
    name: 'Long-Range Tankage',
    class: 'ship',
    deltas: [{ element: 'maxFuel', amount: 40 }],
  },
  {
    id: 'item-torque-frames',
    name: 'Drive Torque Frames',
    class: 'ship',
    deltas: [{ element: 'component', component: 'drives', strength: 5 }],
  },
  {
    id: 'item-belt-loader',
    name: 'Belt-Loader Arm',
    class: 'ship',
    deltas: [{ element: 'component', component: 'robotics', strength: 5 }],
  },
  {
    id: 'item-armoured-glacis',
    name: 'Armoured Glacis Plate',
    class: 'ship',
    deltas: [{ element: 'component', component: 'hull', strength: 6 }],
  },
  {
    id: 'item-recirculators',
    name: 'Air Recirculator Bank',
    class: 'ship',
    deltas: [{ element: 'component', component: 'lifeSupport', strength: 6 }],
  },
  {
    id: 'item-laid-rails',
    name: 'Laid Gun Rails',
    class: 'ship',
    deltas: [{ element: 'component', component: 'weapons', strength: 5 }],
  },
  {
    id: 'item-yard-crawler',
    name: 'Yard Crawler',
    class: 'ship',
    deltas: [
      { element: 'component', component: 'robotics', strength: 3 },
      { element: 'component', component: 'hull', strength: 3 },
    ],
  },
  {
    id: 'item-pod-cradles',
    name: 'Cargo Pod Cradles',
    class: 'ship',
    deltas: [{ element: 'cargoPods', amount: 1 }],
  },
  {
    id: 'item-field-coils',
    name: 'Shield Field Coils',
    class: 'ship',
    deltas: [{ element: 'component', component: 'shields', strength: 6 }],
  },
  {
    id: 'item-deep-tanks',
    name: 'Deep Bunkerage',
    class: 'ship',
    deltas: [{ element: 'maxFuel', amount: 40 }],
  },
  {
    id: 'item-lighter-hull',
    name: 'Salvaged Cargo Lighter',
    class: 'ship',
    deltas: [
      { element: 'cargoPods', amount: 1 },
      { element: 'maxFuel', amount: 20 },
    ],
  },
  {
    id: 'item-pilot-plate',
    name: "Pilot's Armoured Deck Plate",
    class: 'ship',
    deltas: [{ element: 'component', component: 'cabin', strength: 6 }],
  },
  // --- T-115 · Class A, band 4 (ceiling +10 strength / +80 maxFuel / +1 pod) ---
  //
  // 5 items, the rarest content in the game. `item-lane-computer` is the FIRST
  // PERCEPTIBLE COMPONENT GRANT IN THE TABLE — `navBonus` divides by
  // `NAV_BONUS_DIVISOR = 10`, so `navigation +10` is the first delta anywhere that
  // buys a whole `+1` on a PILOT check. That is finding F-114-B answered by
  // authoring rather than by moving a ceiling (see `BAND4_ITEM_ROWS`).
  {
    id: 'item-lane-computer',
    name: 'Confederation Lane Computer',
    class: 'ship',
    deltas: [{ element: 'component', component: 'navigation', strength: 10 }],
  },
  {
    id: 'item-bunker-run',
    name: 'Capital Bunkerage Run',
    class: 'ship',
    deltas: [{ element: 'maxFuel', amount: 80 }],
  },
  {
    id: 'item-capital-belt',
    name: 'Capital Armour Belt',
    class: 'ship',
    deltas: [{ element: 'component', component: 'hull', strength: 10 }],
  },
  {
    id: 'item-spinal-mount',
    name: 'Spinal Gun Mount',
    class: 'ship',
    deltas: [{ element: 'component', component: 'weapons', strength: 10 }],
  },
  {
    id: 'item-fleet-tender',
    name: "Fleet Tender's Repair Shop",
    class: 'ship',
    deltas: [
      { element: 'component', component: 'robotics', strength: 10 },
      { element: 'component', component: 'drives', strength: 8 },
      { element: 'cargoPods', amount: 1 },
    ],
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
 * `recoveryDays` key and NO `apCost` key, and MUST NEVER GAIN EITHER. A content
 * author cannot hand-tune one row's recovery clock or its dice cost because there
 * is nowhere to write it — a missing field is a compile error, which is stronger
 * than any test. The mechanically runnable form of the claim, scoped to a FIELD
 * WRITE so that prose mentioning the names does not falsify it:
 * `grep -n 'recoveryDays:' packages/content/src/exploration.ts` and
 * `grep -n 'apCost:' packages/content/src/exploration.ts` must EACH hit only
 * inside `EXPLORE_VALUE_BANDS` (plus the two interface declarations above it).
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
  /** N — calendar days a find in this band takes to recover. 0 ⇒ same-day.
   *  D1 (2026-07-31) narrowed this to BAND 2: bands 3-4 charge `apCost` instead. */
  recoveryDays: number;
  /**
   * T-131 (owner ruling D1, 2026-07-31) · THE EXTRA DICE a find in this band
   * costs AT CLAIM, on top of the sweep's own die, taken from the SAME dawn hand
   * and paid immediately. 0 ⇒ the sweep's die is the whole cost.
   *
   * A BAND MAY NEVER CARRY BOTH `recoveryDays > 0` AND `apCost > 0` — asserted as
   * a content-table test, not left as a comment. A band is drawn AFTER the nav
   * check, with the sweep's die and the fuel already spent, so an `apCost` row can
   * only ever resolve same-day: there is no later dusk with a dawn hand left to
   * charge against.
   *
   * Same discipline as `recoveryDays`: a band-table rule, NEVER a per-row
   * constant. `ExploreOutcomeDefinition` has no `apCost` key, so hand-tuning one
   * row's dice cost is a compile error rather than a review catch.
   */
  apCost: number;
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
  /**
   * T-117 · THE DRAW WEIGHT (§5.1, §5.2) — the sixth and last column, and the one
   * §5.2 reserved for "the task that flips the engine to the single weighted
   * draw". That is T-117, so it lands here with its consumer.
   *
   * F-112-C IS THEREBY DISCHARGED. The finding's rule was "a column with no
   * consumer is a stub", and it is why T-113 and T-114 both refused to add this
   * one. `drawOutcome` (engine `exploreOutcomes.ts`) is the consumer: it groups a
   * pool's rows by band, picks a band weighted by this number, then picks
   * uniformly inside it.
   *
   * THE WEIGHTS SUM TO 100, so a weight reads directly as a percentage of
   * successful boards — but ONLY when every band has a row in the pool being
   * drawn. `drawOutcome` renormalises against the summed weight of the bands
   * actually present, so an empty band cannot silently swallow probability.
   *
   * THERE IS DELIBERATELY NO ROW-LEVEL WEIGHT (§5.1). Rows inside a band are drawn
   * uniformly, which is what makes "no hand-tuned constant per row" enforced by
   * the TYPE rather than by review — and what makes per-row probability
   * (`bandWeight / rowsInBand`) analytically checkable, which is the arithmetic
   * §5.3 does and T-115's reachability sweep is sized from.
   */
  weight: number;
}

// BALANCE: the day counts for BANDS 0-2 are VERBATIM docs/EXPLORE_REDESIGN.md
// §5.2. Bands 0-1 (58% of successful boards under §5.2's weights) recover
// same-day, so the common find behaves exactly like today's instant loot — the
// audit measured a median day-120 captain carrying 27 fuel, and a verb that always
// cost a multi-day commitment on top of an 80-fuel gate would be unusable for the
// captain it is meant to serve.
//
// T-131 · OWNER RULING D1 (`/bakeoff`, 2026-07-31) — BANDS 3 AND 4 NO LONGER PAY
// IN DAYS. The §5.2 columns for them (N = 3 and N = 6) are RETIRED and replaced by
// `apCost` 2 and 3: extra dice charged at claim out of the same dawn hand. Band 2
// is UNTOUCHED (N = 1, `apCost: 0`) — the bakeoff measured 42.1% collection on it
// and the ruling kept it deliberately. Band 4's old "N held at 6 against the day-30
// Tour One marker" reasoning retires with the day cost it justified.
//
// THE TWO NUMBERS (2 and 3) ARE FIRST-PASS, TO BE MOVED BY PLAY. The ruling is
// explicit that this is a playtest, not a re-derivation of the bakeoff's §5.5 EV
// math — so they are not fitted to a credit-equivalent and must not be "corrected"
// toward one. They will move when a playtest says so, per docs/BALANCE-POLICY.md.
//
// The Class-A ceilings and Class-B permissions are VERBATIM §5.2 as well. A
// ceiling of 0 is "not permitted in this band"; an empty `classB` is "no die
// effect at this band at all".
//
// T-117 · THE DRAW WEIGHTS ARE VERBATIM §5.2 TOO — 25/33/24/15/3, summing to 100.
// They are not re-derived from the authored row counts and must never be: the
// weights are the DESIGN of the ladder and the row counts (14/20/33/25/8) are the
// spread §5.3 lays over it. A row the reachability sweep cannot find is a
// content-shape defect to be fixed by moving a row, never by re-cutting a weight
// to flatter a test.
export const EXPLORE_VALUE_BANDS: readonly ExploreValueBand[] = [
  {
    band: 0,
    minValuePoints: 0,
    recoveryDays: 0,
    apCost: 0,
    permittedKinds: ['lore'],
    classACeiling: { strength: 0, maxFuel: 0, cargoPods: 0 },
    classB: [],
    weight: 25,
  },
  {
    band: 1,
    minValuePoints: 1,
    recoveryDays: 0,
    apCost: 0,
    permittedKinds: ['salvage', 'lore'],
    classACeiling: { strength: 0, maxFuel: 0, cargoPods: 0 },
    classB: [],
    weight: 33,
  },
  {
    band: 2,
    minValuePoints: 11,
    recoveryDays: 1,
    apCost: 0,
    // F-114-A · `questline` is here, and §5.2's table cell is corrected in place
    // to match §5.3, §8 and T-114's charter. See the interface header above.
    permittedKinds: ['salvage', 'unique-item', 'npc', 'lore', 'questline'],
    classACeiling: { strength: 1, maxFuel: 20, cargoPods: 0 },
    classB: [{ kind: 'floor', floor: 3 }],
    weight: 24,
  },
  {
    band: 3,
    minValuePoints: 31,
    recoveryDays: 0,
    apCost: 2,
    permittedKinds: ['unique-item', 'questline', 'npc'],
    classACeiling: { strength: 6, maxFuel: 40, cargoPods: 1 },
    classB: [{ kind: 'reroll' }],
    weight: 15,
  },
  {
    band: 4,
    minValuePoints: 61,
    recoveryDays: 0,
    apCost: 3,
    permittedKinds: ['unique-item', 'questline'],
    classACeiling: { strength: 10, maxFuel: 80, cargoPods: 1 },
    classB: [{ kind: 'extra-die' }],
    weight: 3,
  },
];
