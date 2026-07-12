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
  | 'GIGA_HERO';

export interface RenownRankDefinition {
  id: RenownRankId;
  label: string;
}

export const RENOWN_RANKS = {
  LIEUTENANT: { id: 'LIEUTENANT', label: 'Lieutenant' },
  COMMANDER: { id: 'COMMANDER', label: 'Commander' },
  CAPTAIN: { id: 'CAPTAIN', label: 'Captain' },
  COMMODORE: { id: 'COMMODORE', label: 'Commodore' },
  ADMIRAL: { id: 'ADMIRAL', label: 'Admiral' },
  TOP_DOG: { id: 'TOP_DOG', label: 'Top Dog' },
  GRAND_MUFTI: { id: 'GRAND_MUFTI', label: 'Grand Mufti' },
  MEGA_HERO: { id: 'MEGA_HERO', label: 'Mega Hero' },
  GIGA_HERO: { id: 'GIGA_HERO', label: 'Giga Hero' },
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
];
