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
  /** T-1308: optional period-voice rank-up line. When present, the engine's
   *  rank-up machinery (engine `deeds.ts` `evaluateDeeds`) emits THIS text as the
   *  WireEntry instead of the generic "Registry confirms Player as …" line.
   *  T-1504 DIVERGENCE: every one of the 10 ranks now carries a citation (the
   *  task's "rank citation texts for all 10 ranks" deliverable), so the rank-up
   *  wire IS the citation for EVERY rank — the generic "Registry confirms Player
   *  as …" fallback in `evaluateDeeds` is now unreachable in normal play and kept
   *  only as a defensive default. This SUPERSEDES T-1308's "only CONQUEROR carries
   *  one, every other rank stays byte-identical" carve-out: the rank-up wires for
   *  COMMANDER..GIGA_HERO changed with this task (golden fixtures regenerated,
   *  the deeds.test Commander-line assertion updated to the new citation).
   *  LIEUTENANT is the starting rank and is never ranked-up INTO, so its citation
   *  is data-only and never emits. */
  citation?: string;
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
export const RENOWN_RANKS = {
  // T-1504: every rank carries a period-voice citation (the rank-up wire reader in
  // engine `evaluateDeeds` emits it verbatim). LIEUTENANT is the starting rank and
  // is never crossed INTO, so its line is data-only completeness.
  LIEUTENANT: {
    id: 'LIEUTENANT',
    label: 'Lieutenant',
    citation:
      "Registry opens a file on Player and stamps the Lieutenant's berth — a name the lanes will learn to know.",
  },
  COMMANDER: {
    id: 'COMMANDER',
    label: 'Commander',
    citation:
      'Registry raises Player to Commander: the first deeds are logged, and the Guild is watching now.',
  },
  CAPTAIN: {
    id: 'CAPTAIN',
    label: 'Captain',
    citation:
      'Registry confirms Player as Captain — a hold, a route, and a reputation that arrives before the ship does.',
  },
  COMMODORE: {
    id: 'COMMODORE',
    label: 'Commodore',
    citation:
      'Registry names Player Commodore; lesser captains trim their lanes when this manifest comes through.',
  },
  ADMIRAL: {
    id: 'ADMIRAL',
    label: 'Admiral',
    citation:
      'Registry seats Player among the Admirals — the deeds are many, and the frontier keeps count.',
  },
  TOP_DOG: {
    id: 'TOP_DOG',
    label: 'Top Dog',
    citation:
      'Registry marks Player Top Dog of the lanes: there is no berth this captain cannot claim.',
  },
  GRAND_MUFTI: {
    id: 'GRAND_MUFTI',
    label: 'Grand Mufti',
    citation:
      'Registry elevates Player to Grand Mufti — a name spoken with the weight of law in every port.',
  },
  MEGA_HERO: {
    id: 'MEGA_HERO',
    label: 'Mega Hero',
    citation:
      'Registry enters Player as a Mega Hero of the spaceways; the wire runs the deeds like scripture.',
  },
  GIGA_HERO: {
    id: 'GIGA_HERO',
    label: 'Giga Hero',
    citation:
      'Registry crowns Player a Giga Hero — a legend the rim tells across every dark between the stars.',
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
  // T-1308 authored this above the then-17-deed set (defined-but-unreached).
  // T-1504 fills the headroom: the authored deed set is now >= 30 (see DEEDS
  // below), so this threshold is REACHABLE THROUGH PLAY — the long-veteran sim
  // (packages/sim conqueror.test.ts) earns 30 deeds and crosses into CONQUEROR.
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

export const DEEDS: readonly DeedDefinition[] = [
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

  // ==========================================================================
  // T-1504 · New-verb deeds. These take the deed count from 17 to 34, filling the
  // headroom below the CONQUEROR threshold (30) so the rank becomes reachable
  // through play. Each field-matches on paths the engine whitelists in
  // `EVENT_PATHS` (engine deeds.ts) — the NAMED READER wiring for these deeds; a
  // matcher on any un-whitelisted path silently never fires, so the whitelist and
  // this set move together. Appended at the END to preserve the definitionIndex
  // tie-break order every existing deed/golden fixture relies on.
  // ==========================================================================

  // --- Gambling (Dare venue, HangoutEvent) ---
  {
    // `wager gte 1` is what distinguishes a RESOLVED wager (always carries a
    // positive wager) from a typed-fail HangoutEvent (no wager set) — so a
    // malformed die never earns the deed.
    id: 'first_wager',
    title: 'First Wager',
    citationTemplate: 'On day {day}, this captain laid coin on the table and let the dice decide.',
    trigger: {
      eventType: 'HangoutEvent',
      match: [
        { path: 'venue', equals: 'dare' },
        { path: 'wager', gte: 1 },
      ],
    },
  },
  {
    id: 'dare_winner',
    title: 'Dare Winner',
    citationTemplate: 'On day {day}, the table paid out and the house wore the loss.',
    trigger: {
      eventType: 'HangoutEvent',
      match: [
        { path: 'venue', equals: 'dare' },
        { path: 'playerWon', equals: true },
      ],
    },
  },
  {
    id: 'high_roller',
    title: 'High Roller',
    citationTemplate:
      'By day {day}, five wagers laid deep marked this captain a name at the table.',
    trigger: {
      eventType: 'HangoutEvent',
      match: [
        { path: 'venue', equals: 'dare' },
        { path: 'wager', gte: 1 },
      ],
      count: { gte: 5 },
    },
  },

  // --- Smuggling (Contraband, cargo type 10) ---
  {
    // Contraband cargo is type 10 (cargo.ts). Signing a contraband contract needs
    // no engine change — `action` and `cargoType` are already whitelisted.
    id: 'contraband_signed',
    title: 'Off the Books',
    citationTemplate: 'On day {day}, this captain signed a run the manifest would never name.',
    trigger: {
      eventType: 'TradeEvent',
      match: [
        { path: 'action', equals: 'sign-contract' },
        { path: 'cargoType', equals: 10 },
      ],
    },
  },
  {
    id: 'contraband_run',
    title: 'Clean Delivery, Dirty Cargo',
    citationTemplate: 'On day {day}, illicit cargo reached its buyer and no patrol was the wiser.',
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
    // ContrabandScan only fires when a PATROL scans a player carrying illicit
    // cargo (engine actions/patrol.ts) — a `caught: false` scan is a genuine
    // smuggler's evasion, never earnable with a clean hold.
    id: 'smuggler_clean',
    title: 'Slipped the Scan',
    citationTemplate: 'On day {day}, a patrol ran its scan and found a hold that told no tales.',
    trigger: {
      eventType: 'ContrabandScan',
      match: [{ path: 'caught', equals: false }],
    },
  },

  // --- Lending (Penny Wise, LoanEvent) ---
  {
    id: 'first_loan',
    title: 'On the Book',
    citationTemplate: 'On day {day}, this captain took Penny Wise coin and a due date with it.',
    trigger: {
      eventType: 'LoanEvent',
      match: [{ path: 'kind', equals: 'borrowed' }],
    },
  },
  {
    // `cleared` is set true only on the 'repaid' LoanEvent that nulls the loan.
    id: 'loan_cleared',
    title: 'Debt to No One',
    citationTemplate: 'On day {day}, the last of the loan was paid and the book closed clean.',
    trigger: {
      eventType: 'LoanEvent',
      match: [{ path: 'cleared', equals: true }],
    },
  },

  // --- Exploration (POIs, salvage) ---
  {
    id: 'first_poi',
    title: 'Off the Charts',
    citationTemplate: 'On day {day}, this captain logged a point the star charts had missed.',
    trigger: {
      eventType: 'PoiDiscovered',
    },
  },
  {
    id: 'salvager',
    title: 'Salvager',
    citationTemplate: 'On day {day}, a boarded hulk gave up its coin to a patient hand.',
    trigger: {
      eventType: 'SalvageRecovered',
    },
  },
  {
    id: 'pathfinder',
    title: 'Pathfinder',
    citationTemplate:
      'By day {day}, five discoveries had made this captain a chart the others lack.',
    trigger: {
      eventType: 'PoiDiscovered',
      count: { gte: 5 },
    },
  },

  // --- Property (ports as purchasable stakes, PortEvent) ---
  {
    id: 'landlord',
    title: 'Landlord',
    citationTemplate: 'On day {day}, this captain bought a berth to own instead of rent.',
    trigger: {
      eventType: 'PortEvent',
      match: [{ path: 'kind', equals: 'purchased' }],
    },
  },
  {
    id: 'rentier',
    title: 'Rentier',
    citationTemplate:
      'On day {day}, the launch fees of an owned berth first paid this captain to sleep.',
    trigger: {
      eventType: 'PortEvent',
      match: [{ path: 'kind', equals: 'income' }],
    },
  },
  {
    id: 'port_baron',
    title: 'Port Baron',
    citationTemplate:
      'By day {day}, two berths flew this captain’s flag — a small empire of gantries.',
    trigger: {
      eventType: 'PortEvent',
      match: [{ path: 'kind', equals: 'purchased' }],
      count: { gte: 2 },
    },
  },

  // --- Combat depth ---
  {
    id: 'void_veteran',
    title: 'Void Veteran',
    citationTemplate: 'By day {day}, three interceptors had learned this ship shoots back.',
    trigger: {
      eventType: 'EncounterResolved',
      match: [{ path: 'resolution', equals: 'defeated' }],
      count: { gte: 3 },
    },
  },

  // --- Era-event tie-ins (storylet-fed, like beacon_keeper) ---
  // These count deeds are advanced ONLY by a StoryletDeedProgress effect naming
  // them, emitted from the T-1504 era-tied storylets (content storylets.ts) — the
  // reader that ties a live era event (blockade / famine / fuel crisis) to a Deed.
  {
    id: 'war_profiteer',
    title: 'War Profiteer',
    citationTemplate:
      'On day {day}, a blockade turned this captain’s hold into the only price in the band.',
    trigger: {
      eventType: 'StoryletDeedProgress',
      count: { gte: 1 },
    },
  },
  {
    id: 'crisis_courier',
    title: 'Crisis Courier',
    citationTemplate:
      'On day {day}, this captain ran the lanes a crisis had emptied and got through anyway.',
    trigger: {
      eventType: 'StoryletDeedProgress',
      count: { gte: 1 },
    },
  },
];
