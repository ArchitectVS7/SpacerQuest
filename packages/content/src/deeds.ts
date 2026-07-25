import { defineDeeds } from './deedValidation.js';

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
  /** The period-voice rank-up line. The engine's rank-up machinery (engine
   *  `deeds.ts` `evaluateDeeds`) emits THIS text verbatim as the rank-up
   *  WireEntry — it IS the rank-up moment on the Galactic News Wire, read by the
   *  UI wire ticker (`ui/format.ts` wireLines).
   *
   *  T-1308 introduced it as OPTIONAL, carried only by CONQUEROR, with the engine
   *  falling back to a generic "Registry confirms Player as …" line for the other
   *  nine. T-1504 authors all ten, so the field is now REQUIRED and the engine's
   *  fallback branch is gone: content — not the engine — owns every rank's prose,
   *  and the type makes a citation-less rank unrepresentable. */
  citation: string;
}

// T-1308 · Conqueror capstone. DIVERGENCE from foundation (git ref f2f95fa9):
// foundation/lore/User-Manual.md tops the renown ladder at GIGA_HERO — 9 ranks,
// which saturates because GIGA_HERO needs only 15 of the 17 authored deeds and a
// competent ~300-day run reaches it. PRD-REIMAGINED §5.2/§9 name "Conqueror" as
// the CAREER CAPSTONE and win over foundation, so this 10th rank is authored
// above GIGA_HERO with a deed threshold (30) that sits in the headroom T-1504
// fills (its ≥30-deed set + long-veteran sim prove Conqueror is reachable
// THROUGH PLAY). CONQUEROR's two intended readers: (a) the unique capstone
// wire moment — DELIVERED NOW in engine `deeds.ts` via the `citation` branch;
// (b) the Nemesis-crossing stake gate — a DOCUMENTED CONTRACT for T-1505, which
// will make CONQUEROR its prerequisite (T-1101 already seals that crossing
// behind `nemesis.crossing.unlocked`). It is deliberately NOT stubbed here so
// no fake reader games the reader-consumption signal.
// T-1504 · Rank citations for ALL TEN ranks. DIVERGENCE from foundation (git ref
// f2f95fa9): foundation has no rank-up prose at all — it prints a bare rank name
// off a point total — so these lines are authored Rimward content in the same
// period voice as the storylets, not a port of any foundation string. They
// complete the divergence recorded at the CONQUEROR block below: the ladder is
// now ten named moments on the wire rather than one capstone plus nine copies of
// a generic clerk's line. CONQUEROR's text is unchanged (byte-identical to
// T-1308's) so the capstone assertion that pins it stays green.
export const RENOWN_RANKS = {
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
} as const satisfies Record<RenownRankId, RenownRankDefinition>;

export const RENOWN_DEED_THRESHOLDS = {
  LIEUTENANT: 0,
  COMMANDER: 1,
  CAPTAIN: 2,
  COMMODORE: 3,
  ADMIRAL: 5,
  TOP_DOG: 7,
  GRAND_MUFTI: 9,
  MEGA_HERO: 12,
  GIGA_HERO: 15,
  // T-1308 authored this above the then-17-deed set, so it was defined-but-
  // unreached. T-1504 fills the headroom (the deed slate below is > 30), so the
  // capstone is now REACHABLE THROUGH PLAY — proven by the long-veteran sim in
  // `packages/sim/src/__tests__/campaign-reach.test.ts`, which climbs to
  // CONQUEROR without any test setting a rank or pushing an earned record.
  CONQUEROR: 30,
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
    // 250 sits mid-band between DARE_MIN_WAGER (25) and DARE_MAX_WAGER (500):
    // a deliberate stake, not the house minimum, and not only the ceiling.
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
    citationTemplate:
      'On day {day}, two ports levied their launch fees in this captain’s name.',
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
