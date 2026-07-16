import { z } from 'zod';
import type {
  GameState,
  GameEvent,
  PlayerAction,
  PlayerState,
  ShipState,
  ComponentState,
  NpcState,
  NpcAction,
  MarketState,
  CargoContract,
  ChartsState,
  DiscoveredPoi,
  LegacyState,
  LoanState,
  CrewMember,
  PortStake,
  NemesisFileState,
  SignalFragmentRecord,
  DeedRegistryState,
  EarnedDeedState,
  StoryletState,
  StoryletScheduleState,
  EncounterState,
  EncounterInterceptorState,
  EraEventState,
  DawnHand,
  PendingTravelState,
  CheckResult,
} from './types.js';

/**
 * T-112a — Load-time validation schemas for the entire {@link GameState}.
 *
 * These Zod schemas mirror the serialized shape produced by
 * `serializeState` (state.ts) so a save can be validated the moment it is read
 * off disk / Steam Cloud, failing with a typed {@link z.ZodError} whose issue
 * paths point at the offending field.
 *
 * SEAM: T-112b's `save.ts` owns the versioned envelope + migration registry and
 * will call {@link validateGameState} once a raw state has been migrated to the
 * current version. This module deliberately knows NOTHING about envelopes.
 *
 * CORRECTNESS BIAS: the schema must accept every state the engine can
 * legitimately produce. Where a nested structure is content-shaped and its exact
 * form is owned by the content package (e.g. storylet choice `requirements`), it
 * is modelled loosely on purpose — see the inline comments — rather than risk
 * rejecting a valid save.
 *
 * T-1002 — DRIFT PROTECTION: every ENGINE-owned state container is `.strict()`,
 * so an unknown nested key fails LOUDLY on load instead of being silently
 * stripped (the old default, which quietly dropped `player.reputation` on a
 * round-trip). Save forward-compat is now owned by the versioned envelope +
 * migration registry (save.ts), not by silent key-dropping. Content-shaped
 * structures (storylet requirements/offers) remain in Zod's default strip mode —
 * content owns their shape; see the "STRICT BOUNDARY" comment below.
 */

// ---------------------------------------------------------------------------
// Enum / literal-union primitives (mirroring @spacerquest/content)
// ---------------------------------------------------------------------------

/** Stat enum values (content: Stat). */
const StatSchema = z.enum(['PILOT', 'GUNS', 'TRADE', 'GRIT', 'GUILE']);

/** DayPhase enum values (types: DayPhase). */
const DayPhaseSchema = z.enum(['DAWN', 'WIRE', 'DAY', 'DUSK']);

/** EraId (content). NOTE: campaign phase, distinct from EraEventState. */
const EraIdSchema = z.enum(['TOUR_ONE', 'VETERAN']);

/** PoiType (content). */
const PoiTypeSchema = z.enum(['beacon', 'derelict']);

/** RenownRankId (content). */
const RenownRankIdSchema = z.enum([
  'LIEUTENANT',
  'COMMANDER',
  'CAPTAIN',
  'COMMODORE',
  'ADMIRAL',
  'TOP_DOG',
  'GRAND_MUFTI',
  'MEGA_HERO',
  'GIGA_HERO',
  // T-1308: capstone rank. Required so a CONQUEROR renownRank and any
  // RenownRankUp/DeedEarned event carrying it survive Zod JSON round-trip.
  'CONQUEROR',
]);

/** AnonymousInterceptorKind (content). */
const AnonymousInterceptorKindSchema = z.enum([
  'PIRATE',
  'PATROL',
  'RIM_PIRATE',
  'BRIGAND',
  'REPTILOID',
]);

/** ShipComponentId (types). */
const ShipComponentIdSchema = z.enum([
  'hull',
  'drives',
  'cabin',
  'lifeSupport',
  'weapons',
  'navigation',
  'robotics',
  'shields',
]);

/** SpecialEquipmentId (types). */
const SpecialEquipmentIdSchema = z.enum([
  'CLOAKER',
  'AUTO_REPAIR',
  'STAR_BUSTER',
  'ARCH_ANGEL',
  'ASTRAXIAL_HULL',
  'TITANIUM_HULL',
  'TRANS_WARP',
]);

/** ShipyardActionKind (types). */
const ShipyardActionKindSchema = z.enum([
  'buy-component-tier',
  'repair',
  'buy-cargo-pods',
  'buy-special-equipment',
]);

/** ShipyardFailureReason (types). */
const ShipyardFailureReasonSchema = z.enum([
  'INSUFFICIENT_CREDITS',
  'AT_MAX_CONDITION',
  'NO_HULL',
  'CAPACITY_EXCEEDED',
  'MUTUALLY_EXCLUSIVE_EQUIPMENT',
  'PREREQUISITE_NOT_MET',
  'INSUFFICIENT_RENOWN',
  'ALREADY_INSTALLED',
]);

/** PowerTier = 1|2|3|4|5 and RouteDangerLevel = 1|2|3|4|5 (content). */
const TierSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);

/** FlagValue = string | number | boolean (content). */
const FlagValueSchema = z.union([z.string(), z.number(), z.boolean()]);

/** Combat/encounter stance. */
const StanceSchema = z.enum(['run', 'talk', 'fight']);

// ---------------------------------------------------------------------------
// Leaf structures
// ---------------------------------------------------------------------------

/** StatBlock = Record<Stat, number> — all five keys are always serialized. */
const StatBlockSchema = z
  .object({
    PILOT: z.number(),
    GUNS: z.number(),
    TRADE: z.number(),
    GRIT: z.number(),
    GUILE: z.number(),
  })
  .strict();

const CheckResultSchema = z
  .object({
    die: z.number(),
    modifier: z.number(),
    total: z.number(),
    dc: z.number(),
    success: z.boolean(),
    margin: z.number(),
    nat20: z.boolean(),
    nat1: z.boolean(),
  })
  .strict();

const DawnHandSchema = z
  .object({
    dice: z.array(z.number()),
    spent: z.array(z.boolean()),
    // T-1306: re-roll charges left today (optional; absent on a legacy save or a
    // hand rolled before crew existed). Serializes mid-day so an unspent charge
    // round-trips.
    rerollsRemaining: z.number().optional(),
  })
  .strict();

// T-1306 · Crew member (types.ts CrewMember). `.strict()` — an unknown key inside
// a crew member fails loudly on load, per the T-1002 drift-protection law.
const CrewMemberSchema = z
  .object({
    roleId: z.string(),
    hiredDay: z.number(),
  })
  .strict();

// T-1307 · Port stake (types.ts PortStake). `.strict()` — an unknown key inside a
// port stake fails loudly on load, per the T-1002 drift-protection law.
const PortStakeSchema = z
  .object({
    systemId: z.number(),
    purchaseDay: z.number(),
  })
  .strict();

const PendingTravelStateSchema = z
  .object({
    origin: z.number(),
    destination: z.number(),
    fuelUsed: z.number(),
  })
  .strict();

const ComponentStateSchema = z
  .object({
    strength: z.number(),
    condition: z.number(),
  })
  .strict();

const ShipStateSchema = z
  .object({
    fuel: z.number(),
    maxFuel: z.number(),
    cargoPods: z.number(),
    hull: ComponentStateSchema,
    drives: ComponentStateSchema,
    weapons: ComponentStateSchema,
    shields: ComponentStateSchema,
    navigation: ComponentStateSchema,
    lifeSupport: ComponentStateSchema,
    robotics: ComponentStateSchema,
    cabin: ComponentStateSchema,
    hasTransWarpDrive: z.boolean().optional(),
    hasCloaker: z.boolean().optional(),
    hasAutoRepair: z.boolean().optional(),
    hasStarBuster: z.boolean().optional(),
    hasArchAngel: z.boolean().optional(),
    isAstraxialHull: z.boolean().optional(),
    hasTitaniumHull: z.boolean().optional(),
  })
  .strict();

const CargoContractSchema = z
  .object({
    destination: z.number(),
    cargoType: z.number(),
    payment: z.number(),
    pods: z.number(),
    haggled: z.boolean().optional(),
  })
  .strict();

const DiscoveredPoiSchema = z
  .object({
    id: z.string(),
    type: PoiTypeSchema,
    systemId: z.number(),
    name: z.string(),
    day: z.number(),
  })
  .strict();

const ChartsStateSchema = z
  .object({
    visitedSystemIds: z.array(z.number()),
    discoveredPois: z.array(DiscoveredPoiSchema),
  })
  .strict();

const SignalFragmentRecordSchema = z
  .object({
    fragmentId: z.string(),
    source: z.enum(['derelict', 'beacon', 'wise-one', 'sage', 'npc']),
    day: z.number(),
    decoded: z.boolean(),
  })
  .strict();

const NemesisFileStateSchema = z
  .object({
    fragments: z.array(SignalFragmentRecordSchema),
  })
  .strict();

const LegacyStateSchema = z
  .object({
    successionCount: z.number(),
  })
  .strict();

// T-1304 · Penny Wise loan state (types.ts LoanState). `.strict()` — an unknown
// key inside a loan fails loudly on load, per the T-1002 drift-protection law.
const LoanStateSchema = z
  .object({
    lender: z.string(),
    principal: z.number(),
    outstanding: z.number(),
    dailyRate: z.number(),
    borrowedDay: z.number(),
    dueDay: z.number(),
    status: z.enum(['active', 'defaulted']),
  })
  .strict();

const EarnedDeedStateSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    citation: z.string(),
    day: z.number(),
    eventIndex: z.number(),
  })
  .strict();

const DeedRegistryStateSchema = z
  .object({
    earned: z.array(EarnedDeedStateSchema),
    renownRank: RenownRankIdSchema,
    matchCounts: z.record(z.string(), z.number()),
  })
  .strict();

// T-1002 STRICT BOUNDARY: the schemas from here through `StoryletOfferSchema`
// mirror CONTENT-owned shapes (storylet choice requirements / offers), not the
// engine's own state containers. Content authors the exact form and may add
// fields the engine schema doesn't model, so these deliberately stay in Zod's
// default STRIP mode — `.strict()` here would reject legitimate content-shaped
// saves. Every ENGINE-owned state container (Player/Ship/Npc/… above and below)
// is `.strict()` so unknown nested keys fail loudly instead of being silently
// dropped; this content boundary is one of exactly TWO runtime-strip
// exceptions. The other is the GameEventSchema union below: event variants
// stay in strip mode at RUNTIME for forward-compat (an old engine can load a
// save whose events carry fields it doesn't know), but unlike this content
// boundary they are fully covered by COMPILE-TIME keyof guards (see the
// per-variant assertions at the bottom of this file), so interface/schema
// drift still fails `tsc` even though it would not fail at load time.
// NumberMatcher (content) — used inside storylet choice requirements.
const NumberMatcherSchema = z.object({
  equals: z.number().optional(),
  gte: z.number().optional(),
  lte: z.number().optional(),
});

// StoryletChoiceDefinition['requirements'] (content). Modelled explicitly but
// kept optional-heavy to match the content shape exactly.
const StoryletChoiceRequirementsSchema = z.object({
  credits: NumberMatcherSchema.optional(),
  spendDie: z.literal(true).optional(),
  statCheck: z
    .object({
      stat: StatSchema,
      dc: z.number(),
    })
    .optional(),
});

const StoryletOfferChoiceSchema = z.object({
  id: z.string(),
  label: z.string(),
  prose: z.string(),
  requirements: StoryletChoiceRequirementsSchema.optional(),
});

const StoryletOfferSchema = z.object({
  storyletId: z.string(),
  title: z.string(),
  prose: z.string(),
  choices: z.array(StoryletOfferChoiceSchema),
  day: z.number(),
  scheduled: z.boolean(),
});

const StoryletScheduleStateSchema = z
  .object({
    storyletId: z.string(),
    dueDay: z.number(),
    sourceStoryletId: z.string(),
    sourceChoiceId: z.string(),
  })
  .strict();

const StoryletStateSchema = z
  .object({
    available: z.array(StoryletOfferSchema),
    completed: z.record(z.string(), z.number()),
    scheduled: z.array(StoryletScheduleStateSchema),
    offeredToday: z.array(z.string()),
  })
  .strict();

const EraEventStateSchema = z
  .object({
    defId: z.string(),
    startedDay: z.number(),
    endsDay: z.number(),
    affectedSystemIds: z.array(z.number()),
  })
  .strict();

const EncounterInterceptorStateSchema = z
  .object({
    id: z.string(),
    source: z.enum(['named', 'anonymous']),
    name: z.string(),
    shipName: z.string(),
    shipClass: z.string().optional(),
    homeSystem: z.string().optional(),
    kind: AnonymousInterceptorKindSchema.optional(),
    rosterIndex: z.number().optional(),
    profileId: z.string().optional(),
    stats: StatBlockSchema,
    tier: TierSchema,
    flaw: z.string().optional(),
    flawDc: z.number().optional(),
  })
  .strict();

const EncounterStateSchema = z
  .object({
    id: z.string(),
    pendingTravel: PendingTravelStateSchema,
    interceptor: EncounterInterceptorStateSchema,
    routeDangerLevel: TierSchema,
    routeDangerChance: z.number(),
    encounterRoll: z.number(),
    round: z.number(),
    enemyHull: z.number(),
  })
  .strict();

const NpcActionSchema = z
  .object({
    type: z.enum(['Trade', 'Travel', 'Combat', 'Patrol', 'Socialize', 'Idle', 'FlawOverride']),
    details: z.string(),
  })
  .strict();

const NpcStateSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    profileId: z.string(),
    currentSystemId: z.number(),
    credits: z.number(),
    fuel: z.number(),
    disposition: z.number(),
    lastAction: NpcActionSchema.optional(),
  })
  .strict();

const MarketStateSchema = z
  .object({
    manifestBoard: z.array(CargoContractSchema),
    localFuelPrice: z.number(),
    npcClaims: z.number(),
  })
  .strict();

const PlayerStateSchema = z
  .object({
    credits: z.number(),
    debt: z.number(),
    debtDueDay: z.number(),
    // T-1304: the Penny Wise loan (or null). Nullable, non-optional — every
    // v3+ save serializes the key (v2 saves backfill it via the migration).
    loan: LoanStateSchema.nullable(),
    // T-1306: hired crew (the dice-progression source). Non-optional — every v4+
    // save serializes the key (v3 saves backfill it via the migration).
    crew: z.array(CrewMemberSchema),
    // T-1307: owned port stakes (purchasable property). Non-optional — every v5+
    // save serializes the key (v4 saves backfill it via the migration).
    ports: z.array(PortStakeSchema),
    stats: StatBlockSchema,
    tier: TierSchema,
    currentSystemId: z.number(),
    dawnHand: DawnHandSchema.optional(),
    ship: ShipStateSchema,
    registry: DeedRegistryStateSchema,
    charts: ChartsStateSchema,
    nemesisFile: NemesisFileStateSchema,
    legacy: LegacyStateSchema,
    // `activeContract?: CargoContract | null` — absent, null, or a contract.
    activeContract: CargoContractSchema.nullable().optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// GameEvent — discriminated union on `type` (types.ts: GameEvent)
// ---------------------------------------------------------------------------
// Every stored event variant is mirrored precisely. These variants deliberately
// stay in Zod's default STRIP mode at RUNTIME (the second strip exception — see
// the STRICT BOUNDARY comment above): unknown keys on an event are dropped, not
// rejected, so an older engine can still load a save whose events carry fields
// it doesn't know about (forward-compat for the append-only eventLog).
//
// DRIFT PROTECTION here is therefore COMPILE-TIME, not runtime: every variant
// below is paired with its `GameEvent` interface member by a keyof AssertEqual
// guard at the bottom of this file. Adding a field to a GameEvent variant in
// types.ts without mirroring it here fails `tsc` — it can never again be
// silently stripped on load without the build breaking first. A genuinely new
// event `type` needs a new variant here (the discriminator-set guard catches a
// missing one).

const GameEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('DawnRoll'), day: z.number(), hand: z.array(z.number()) }),
  z.object({
    type: z.literal('StatCheck'),
    actor: z.string(),
    stat: StatSchema,
    dc: z.number(),
    result: CheckResultSchema,
    actionContext: z
      .enum([
        'haggle',
        'storylet',
        'npc-trade',
        'npc-travel',
        'npc-combat',
        'npc-patrol',
        'npc-socialize',
        // T-1207: interceptor post-kill retreat roll (see types.ts StatCheck).
        'retreat',
        // T-1303: the player's Spacer's Dare GUILE roll (see types.ts StatCheck).
        'gamble',
      ])
      .optional(),
  }),
  z.object({
    type: z.literal('FlawCheck'),
    npcId: z.string(),
    flaw: z.string(),
    die: z.number(),
    dc: z.number(),
    resisted: z.boolean(),
  }),
  z.object({ type: z.literal('NpcAction'), npcId: z.string(), actionDetails: z.string() }),
  z.object({
    type: z.literal('ContractClaimed'),
    day: z.number(),
    npcId: z.string(),
    cargoType: z.number(),
    destination: z.number(),
    payment: z.number(),
  }),
  z.object({
    type: z.literal('DispositionChanged'),
    day: z.number(),
    npcId: z.string(),
    delta: z.number(),
    disposition: z.number(),
    reason: z.enum([
      'tribute',
      'defeat',
      'player-fled',
      'decay',
      'storylet',
      'contract-sniped',
      // T-1303 Hangout beats.
      'dare',
      'befriend',
      'insult',
      'meet',
      // T-1304 Penny Wise loan default.
      'loan-default',
      // T-1305 named-patrol grudge on a caught contraband scan.
      'contraband-caught',
    ]),
  }),
  z.object({
    type: z.literal('BondIntervention'),
    day: z.number(),
    npcId: z.string(),
    kind: z.enum(['fuel-gift', 'drive-off']),
    amount: z.number().optional(),
  }),
  z.object({
    type: z.literal('WireEntry'),
    day: z.number(),
    message: z.string(),
    // T-1401: the typed wire-line provenance (types.ts WireEntryKind). REQUIRED so
    // the compile-time keyof guard (_covEvWireEntry) keeps schema↔interface in
    // lockstep; a v5 save's kind-less WireEntry is backfilled by the v5→v6 save
    // migration (save.ts) before it reaches this validator.
    kind: z.enum(['flaw-override', 'npc', 'plain']),
  }),
  z.object({
    type: z.literal('EraEventStarted'),
    day: z.number(),
    defId: z.string(),
    name: z.string(),
    endsDay: z.number(),
    affectedSystemIds: z.array(z.number()),
  }),
  z.object({
    type: z.literal('EraEventEnded'),
    day: z.number(),
    defId: z.string(),
    name: z.string(),
  }),
  z.object({ type: z.literal('DayAdvanced'), day: z.number() }),
  z.object({
    type: z.literal('DeedEarned'),
    day: z.number(),
    deedId: z.string(),
    title: z.string(),
    citation: z.string(),
    renownRank: RenownRankIdSchema,
  }),
  z.object({
    type: z.literal('RenownRankUp'),
    day: z.number(),
    previousRank: RenownRankIdSchema,
    newRank: RenownRankIdSchema,
    deedCount: z.number(),
  }),
  z.object({
    type: z.literal('ActionBlocked'),
    day: z.number(),
    actionType: z.enum(['Trade', 'Travel', 'Shipyard', 'Storylet', 'Explore', 'VisitHangout']),
    // 'destination-locked' added by T-1101; 'no-hangout' by T-1303 (a VisitHangout
    // at an un-flagged system). Serialized in eventLog, so the schema must accept
    // them or loadSave would reject a save containing the event.
    reason: z.enum(['active-encounter', 'destination-locked', 'no-hangout']),
  }),
  z.object({
    type: z.literal('PoiDiscovered'),
    day: z.number(),
    poiId: z.string(),
    poiType: PoiTypeSchema,
    systemId: z.number(),
    name: z.string(),
  }),
  z.object({
    type: z.literal('ExplorationFailed'),
    day: z.number(),
    systemId: z.number(),
    reason: z.enum([
      'nav-check',
      'insufficient-fuel',
      'no-die',
      'invalid-die-index',
      'die-already-spent',
    ]),
  }),
  z.object({
    type: z.literal('SalvageRecovered'),
    day: z.number(),
    poiId: z.string(),
    systemId: z.number(),
    amount: z.number(),
  }),
  z.object({
    type: z.literal('ContrabandFound'),
    day: z.number(),
    poiId: z.string(),
    systemId: z.number(),
  }),
  z.object({
    type: z.literal('FragmentAcquired'),
    day: z.number(),
    fragmentId: z.string(),
    source: z.enum(['derelict', 'beacon', 'wise-one', 'sage', 'npc']),
    fragmentCount: z.number(),
    poiId: z.string().optional(),
  }),
  z.object({
    type: z.literal('FragmentDecoded'),
    day: z.number(),
    fragmentId: z.string(),
  }),
  z.object({
    // T-1303 · a player Hangout visit (see types.ts HangoutEvent). Serialized in
    // eventLog, so a mid-day save round-trips it; the drift guard below keeps this
    // in lockstep with the interface.
    type: z.literal('HangoutEvent'),
    day: z.number(),
    venue: z.enum(['dare', 'meet', 'befriend', 'insult', 'rumor']),
    opponentId: z.string().optional(),
    wager: z.number().optional(),
    playerWon: z.boolean().optional(),
    creditsDelta: z.number().optional(),
    success: z.boolean().optional(),
    rumors: z.array(z.string()).optional(),
    failReason: z
      .enum(['no-die', 'invalid-die-index', 'die-already-spent', 'no-opponent'])
      .optional(),
  }),
  z.object({
    // T-1304 · a Penny Wise lending beat (see types.ts LoanEvent). Serialized in
    // eventLog, so a mid-day save round-trips it; the drift guard below keeps this
    // in lockstep with the interface.
    type: z.literal('LoanEvent'),
    day: z.number(),
    kind: z.enum(['borrowed', 'accrued', 'repaid', 'defaulted', 'failed']),
    lender: z.string().optional(),
    principal: z.number().optional(),
    dailyRate: z.number().optional(),
    dueDay: z.number().optional(),
    interest: z.number().optional(),
    amountPaid: z.number().optional(),
    outstanding: z.number().optional(),
    cleared: z.boolean().optional(),
    failReason: z
      .enum([
        'no-die',
        'invalid-die-index',
        'die-already-spent',
        'already-has-loan',
        'no-loan',
        'insufficient-credits',
      ])
      .optional(),
  }),
  z.object({
    // T-1306 · a dawn-die re-roll (see types.ts DiceRerolled). Serialized in
    // eventLog; the drift guard below keeps this in lockstep with the interface.
    type: z.literal('DiceRerolled'),
    day: z.number(),
    dieIndex: z.number().optional(),
    previous: z.number().optional(),
    result: z.number().optional(),
    rerollsRemaining: z.number().optional(),
    failReason: z
      .enum(['no-hand', 'invalid-die-index', 'die-already-spent', 'no-charge'])
      .optional(),
  }),
  z.object({
    // T-1306 · a crew hire/dismiss/wage beat (see types.ts CrewEvent). Serialized
    // in eventLog; the drift guard below keeps this in lockstep with the interface.
    type: z.literal('CrewEvent'),
    day: z.number(),
    kind: z.enum(['hired', 'dismissed', 'wage', 'failed']),
    roleId: z.string().optional(),
    cost: z.number().optional(),
    amount: z.number().optional(),
    berths: z.number().optional(),
    crewCount: z.number().optional(),
    failReason: z
      .enum([
        'no-die',
        'invalid-die-index',
        'die-already-spent',
        'no-berth',
        'insufficient-credits',
        'already-hired',
        'unknown-role',
        'not-hired',
      ])
      .optional(),
  }),
  z.object({
    // T-1307 · a port-stake beat (see types.ts PortEvent). Serialized in eventLog;
    // the drift guard below keeps this in lockstep with the interface.
    type: z.literal('PortEvent'),
    day: z.number(),
    kind: z.enum(['purchased', 'income', 'failed']),
    systemId: z.number().optional(),
    cost: z.number().optional(),
    income: z.number().optional(),
    portCount: z.number().optional(),
    failReason: z
      .enum([
        'no-die',
        'invalid-die-index',
        'die-already-spent',
        'not-at-port',
        'not-purchasable',
        'already-owned',
        'insufficient-credits',
      ])
      .optional(),
  }),
  z.object({
    type: z.literal('StoryletOffered'),
    day: z.number(),
    storyletId: z.string(),
    scheduled: z.boolean(),
  }),
  z.object({
    type: z.literal('StoryletChoiceResolved'),
    day: z.number(),
    storyletId: z.string(),
    choiceId: z.string(),
    success: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('StoryletChoiceBlocked'),
    day: z.number(),
    storyletId: z.string(),
    choiceId: z.string(),
    reason: z.enum(['not-available', 'unknown-choice', 'insufficient-credits', 'missing-die']),
  }),
  z.object({
    type: z.literal('StoryletEffectApplied'),
    day: z.number(),
    storyletId: z.string(),
    choiceId: z.string(),
    effect: z.enum([
      'credits',
      'fuel',
      'flag',
      'flag-cleared',
      'active-contract-cleared',
      'manifest-contract-added',
      'disposition',
      'fragment-granted',
      'fragment-decoded',
    ]),
    amount: z.number().optional(),
    flag: z.string().optional(),
    value: FlagValueSchema.optional(),
    npcId: z.string().optional(),
    cargoType: z.number().optional(),
    destination: z.number().optional(),
    fragmentId: z.string().optional(),
  }),
  z.object({
    type: z.literal('StoryletScheduled'),
    day: z.number(),
    storyletId: z.string(),
    choiceId: z.string(),
    scheduledStoryletId: z.string(),
    dueDay: z.number(),
  }),
  z.object({
    type: z.literal('StoryletDeedProgress'),
    day: z.number(),
    storyletId: z.string(),
    choiceId: z.string(),
    deedId: z.string(),
    amount: z.number(),
  }),
  z.object({
    type: z.literal('TravelEvent'),
    characterId: z.string(),
    origin: z.number(),
    destination: z.number(),
    fuelUsed: z.number(),
    success: z.boolean(),
    interrupted: z.boolean().optional(),
    resumedFromEncounterId: z.string().optional(),
    // T-1102: dry-tank refusal flag on the travel event.
    insufficientFuel: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('TradeEvent'),
    characterId: z.string(),
    actionDetails: z.string(),
    action: z
      .enum([
        'buy-fuel',
        'sign-contract',
        'haggle',
        'deliver-cargo',
        'forfeit-cargo',
        'pay-debt-failed',
      ])
      .optional(),
    success: z.boolean().optional(),
    amount: z.number().optional(),
    fuelAmount: z.number().optional(),
    cost: z.number().optional(),
    destination: z.number().optional(),
    cargoType: z.number().optional(),
    payment: z.number().optional(),
  }),
  z.object({
    type: z.literal('DebtPayment'),
    characterId: z.string(),
    amount: z.number(),
    remaining: z.number(),
  }),
  z.object({ type: z.literal('DebtDue'), day: z.number(), outstanding: z.number() }),
  z.object({
    type: z.literal('TourOneResolved'),
    day: z.number(),
    outcome: z.enum(['cleared', 'unpaid']),
    debtOutstanding: z.number(),
  }),
  z.object({
    type: z.literal('CombatEvent'),
    characterId: z.string(),
    targetId: z.string(),
    stance: StanceSchema,
    fuelUsed: z.number(),
    success: z.boolean(),
    insufficientFuel: z.boolean().optional(),
    enemyHullRemaining: z.number().optional(),
  }),
  z.object({ type: z.literal('EncounterStarted'), encounter: EncounterStateSchema }),
  z.object({
    type: z.literal('EncounterRound'),
    encounterId: z.string(),
    round: z.number(),
    stance: StanceSchema,
    continues: z.boolean(),
    success: z.boolean(),
    fuelUsed: z.number(),
    insufficientFuel: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('TributeDemanded'),
    encounterId: z.string(),
    round: z.number(),
    amount: z.number(),
    refused: z.boolean(),
    affordable: z.boolean(),
    waived: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('TributePaid'),
    encounterId: z.string(),
    round: z.number(),
    amount: z.number(),
    creditsRemaining: z.number(),
  }),
  z.object({
    type: z.literal('EnemyCounterAction'),
    encounterId: z.string(),
    round: z.number(),
    interceptorId: z.string(),
    pressure: z.enum(['between-rounds', 'day-end']),
    check: CheckResultSchema,
    success: z.boolean(),
  }),
  z.object({
    type: z.literal('ComponentDamaged'),
    encounterId: z.string(),
    component: ShipComponentIdSchema,
    previousCondition: z.number(),
    newCondition: z.number(),
    amount: z.number(),
    // T-1205: shield-absorbed points off the raw hit (optional; absent on legacy
    // saves, 0 on a junker hit).
    mitigated: z.number().optional(),
  }),
  z.object({
    type: z.literal('ShipLost'),
    day: z.number(),
    encounterId: z.string(),
    interceptorId: z.string(),
    // T-1205 adds 'life-support-failure'; serialized in eventLog, so the schema
    // must accept it or loadSave would reject a save carrying the event.
    reason: z.enum(['combat-defeat', 'life-support-failure']),
    component: ShipComponentIdSchema.optional(),
  }),
  z.object({
    type: z.literal('LifeSupportCritical'),
    day: z.number(),
    component: z.literal('lifeSupport'),
    survived: z.boolean(),
  }),
  z.object({
    type: z.literal('LegacySuccession'),
    day: z.number(),
    successionCount: z.number(),
    inheritedCredits: z.number(),
    debtOutstanding: z.number(),
    previousShipLostTo: z.string(),
  }),
  z.object({
    type: z.literal('EncounterResolved'),
    encounterId: z.string(),
    resolution: z.enum([
      'escaped',
      'talked-down',
      'defeated',
      'interceptor-fled',
      // T-1207: interceptor won its opposed post-kill retreat roll (miracle burn).
      'interceptor-escaped',
    ]),
    round: z.number(),
    interceptorId: z.string(),
  }),
  z.object({
    type: z.literal('ShipyardEvent'),
    action: ShipyardActionKindSchema,
    cost: z.number(),
    component: ShipComponentIdSchema.optional(),
    tier: z.number().optional(),
    repairMode: z.enum(['all', 'single']).optional(),
    quantity: z.number().optional(),
    equipment: SpecialEquipmentIdSchema.optional(),
  }),
  z.object({
    type: z.literal('ShipyardFail'),
    action: ShipyardActionKindSchema,
    reason: ShipyardFailureReasonSchema,
    component: ShipComponentIdSchema.optional(),
    tier: z.number().optional(),
    repairMode: z.enum(['all', 'single']).optional(),
    quantity: z.number().optional(),
    equipment: SpecialEquipmentIdSchema.optional(),
    conflictingEquipment: SpecialEquipmentIdSchema.optional(),
    prerequisite: z.string().optional(),
    requiredRank: RenownRankIdSchema.optional(),
    cost: z.number().optional(),
    credits: z.number().optional(),
    maxPods: z.number().optional(),
  }),
  // T-1305 · patrol contraband scan beats (see types.ts GameEvent).
  z.object({
    type: z.literal('ContrabandScan'),
    encounterId: z.string(),
    interceptorId: z.string(),
    caught: z.boolean(),
    check: CheckResultSchema,
  }),
  z.object({
    type: z.literal('ContrabandConfiscated'),
    encounterId: z.string(),
    fine: z.number(),
    creditsRemaining: z.number(),
    confiscatedContract: z.boolean(),
    confiscatedPod: z.boolean(),
  }),
]);

// ---------------------------------------------------------------------------
// PlayerAction — discriminated union on `type` (types.ts: PlayerAction).
// Not part of GameState (it is engine INPUT), but exported here as a companion
// validator for callers that persist/replay command logs.
// ---------------------------------------------------------------------------

export const PlayerActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('Trade'),
    action: z.enum(['buy-fuel', 'sign-contract', 'haggle', 'pay-debt']),
    contractIndex: z.number().optional(),
    fuelAmount: z.number().optional(),
    amount: z.number().optional(),
    spendDie: z.number().optional(),
  }),
  z.object({
    type: z.literal('Travel'),
    destinationId: z.number(),
    spendDie: z.number().optional(),
  }),
  z.object({
    type: z.literal('Combat'),
    stance: StanceSchema,
    targetId: z.string(),
    spendDie: z.number().optional(),
  }),
  z.object({
    type: z.literal('Shipyard'),
    action: ShipyardActionKindSchema,
    spendDie: z.number(),
    component: ShipComponentIdSchema.optional(),
    tier: z.number().optional(),
    repairMode: z.enum(['all', 'single']).optional(),
    quantity: z.number().optional(),
    equipment: SpecialEquipmentIdSchema.optional(),
  }),
  z.object({
    type: z.literal('Storylet'),
    storyletId: z.string(),
    choiceId: z.string(),
    spendDie: z.number().optional(),
  }),
  z.object({ type: z.literal('Explore'), spendDie: z.number().optional() }),
  z.object({
    // T-1303 · Visit the Spacers Hangout (see types.ts PlayerAction).
    type: z.literal('VisitHangout'),
    venue: z.enum(['dare', 'meet', 'befriend', 'insult', 'rumor', 'borrow', 'repay']),
    opponentId: z.string().optional(),
    wager: z.number().optional(),
    // T-1304: borrow principal / repay amount.
    amount: z.number().optional(),
    spendDie: z.number().optional(),
  }),
  z.object({
    // T-1306 · re-roll one un-spent dawn die (see types.ts PlayerAction).
    type: z.literal('Reroll'),
    dieIndex: z.number(),
  }),
  z.object({
    // T-1306 · hire/dismiss a crew role (see types.ts PlayerAction).
    type: z.literal('Crew'),
    action: z.enum(['hire', 'dismiss']),
    roleId: z.string(),
    spendDie: z.number(),
  }),
  z.object({
    // T-1307 · buy a stake in the local port authority (see types.ts PlayerAction).
    type: z.literal('Port'),
    action: z.literal('buy'),
    systemId: z.number(),
    spendDie: z.number(),
  }),
  z.object({ type: z.literal('Wait') }),
]);

// ---------------------------------------------------------------------------
// GameState — the root schema
// ---------------------------------------------------------------------------

// T-1002: `.strict()` is the DELIBERATE replacement for Zod's default silent
// forward-compat stripping. The versioned save envelope + migration registry
// (save.ts) now own compatibility, so an unknown key is a schema-drift BUG (a new
// GameState field with no schema entry — verified live: `player.reputation` was
// silently stripped to `undefined` on round-trip) that must fail loudly on load,
// not be dropped. This is enforced at every engine-owned state-container level,
// not just the root, so nested drift surfaces too.
export const GameStateSchema = z
  .object({
    day: z.number(),
    rngState: z.number(),
    dayPhase: DayPhaseSchema,
    dayEventCount: z.number(),
    era: EraIdSchema,
    flags: z.record(z.string(), FlagValueSchema),
    storylets: StoryletStateSchema,
    player: PlayerStateSchema,
    market: MarketStateSchema,
    npcs: z.array(NpcStateSchema),
    encounter: EncounterStateSchema.nullable(),
    eraEvent: EraEventStateSchema.nullable(),
    lastEraEventEndedDay: z.number(),
    eventLog: z.array(GameEventSchema),
  })
  .strict();

/** Zod's inferred type. Structurally equal to {@link GameState}. */
export type GameStateSchemaType = z.infer<typeof GameStateSchema>;

// ---------------------------------------------------------------------------
// Compile-time schema-drift guard (T-112a, extended by T-1002).
//
// The schemas now run in `.strict()` mode, so an unknown key fails LOUDLY at
// load time (runtime). These type-level checks are the complementary developer
// guard: they fail `tsc` the moment an interface's keys and its schema's
// inferred keys diverge, forcing the schema to be updated in lockstep — before a
// drift ever reaches a save. `keyof` compares key NAMES only, which is robust to
// the optional/readonly modifier differences between the hand-written interfaces
// and Zod's inference.
//
// T-1002 extends the original top-level-only guard to EVERY engine-owned nested
// state container. This is the named prerequisite for T-1503 (adding
// `reputation` to PlayerState) and for every M12/M13 task that adds a state
// field: the new key must appear in the matching schema or `tsc` fails here.
// Content-shaped structures (StoryletOffer / requirements) are intentionally
// excluded — content owns their shape and they stay in Zod strip mode.
type AssertEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

const _schemaCoversGameState: AssertEqual<keyof GameState, keyof GameStateSchemaType> = true;
const _covPlayer: AssertEqual<keyof PlayerState, keyof z.infer<typeof PlayerStateSchema>> = true;
const _covShip: AssertEqual<keyof ShipState, keyof z.infer<typeof ShipStateSchema>> = true;
const _covComponent: AssertEqual<keyof ComponentState, keyof z.infer<typeof ComponentStateSchema>> =
  true;
// NOTE: StatBlock is a content-owned `Record<Stat, number>` whose `keyof` is the
// `Stat` ENUM type, not the string-literal union Zod infers — a `keyof` guard
// can't match those, and drift there means adding a stat to the content enum (a
// deliberate content change). Its `.strict()` schema still guards it at runtime.
const _covCheckResult: AssertEqual<keyof CheckResult, keyof z.infer<typeof CheckResultSchema>> =
  true;
const _covDawnHand: AssertEqual<keyof DawnHand, keyof z.infer<typeof DawnHandSchema>> = true;
const _covPendingTravel: AssertEqual<
  keyof PendingTravelState,
  keyof z.infer<typeof PendingTravelStateSchema>
> = true;
const _covNpc: AssertEqual<keyof NpcState, keyof z.infer<typeof NpcStateSchema>> = true;
const _covNpcAction: AssertEqual<keyof NpcAction, keyof z.infer<typeof NpcActionSchema>> = true;
const _covMarket: AssertEqual<keyof MarketState, keyof z.infer<typeof MarketStateSchema>> = true;
const _covCargo: AssertEqual<keyof CargoContract, keyof z.infer<typeof CargoContractSchema>> = true;
const _covCharts: AssertEqual<keyof ChartsState, keyof z.infer<typeof ChartsStateSchema>> = true;
const _covPoi: AssertEqual<keyof DiscoveredPoi, keyof z.infer<typeof DiscoveredPoiSchema>> = true;
const _covLegacy: AssertEqual<keyof LegacyState, keyof z.infer<typeof LegacyStateSchema>> = true;
const _covLoan: AssertEqual<keyof LoanState, keyof z.infer<typeof LoanStateSchema>> = true;
const _covCrew: AssertEqual<keyof CrewMember, keyof z.infer<typeof CrewMemberSchema>> = true;
const _covPortStake: AssertEqual<keyof PortStake, keyof z.infer<typeof PortStakeSchema>> = true;
const _covNemesis: AssertEqual<
  keyof NemesisFileState,
  keyof z.infer<typeof NemesisFileStateSchema>
> = true;
const _covFragment: AssertEqual<
  keyof SignalFragmentRecord,
  keyof z.infer<typeof SignalFragmentRecordSchema>
> = true;
const _covDeedRegistry: AssertEqual<
  keyof DeedRegistryState,
  keyof z.infer<typeof DeedRegistryStateSchema>
> = true;
const _covEarnedDeed: AssertEqual<
  keyof EarnedDeedState,
  keyof z.infer<typeof EarnedDeedStateSchema>
> = true;
const _covStorylet: AssertEqual<keyof StoryletState, keyof z.infer<typeof StoryletStateSchema>> =
  true;
const _covStoryletSchedule: AssertEqual<
  keyof StoryletScheduleState,
  keyof z.infer<typeof StoryletScheduleStateSchema>
> = true;
const _covEncounter: AssertEqual<keyof EncounterState, keyof z.infer<typeof EncounterStateSchema>> =
  true;
const _covInterceptor: AssertEqual<
  keyof EncounterInterceptorState,
  keyof z.infer<typeof EncounterInterceptorStateSchema>
> = true;
const _covEraEvent: AssertEqual<keyof EraEventState, keyof z.infer<typeof EraEventStateSchema>> =
  true;

// ---------------------------------------------------------------------------
// GameEvent variant guards (T-1002 gap fix).
//
// The event union stays in runtime STRIP mode (see the comment above
// GameEventSchema), so these compile-time guards are the ONLY drift protection
// for eventLog entries: one keyof assertion per variant, pairing the interface
// member in types.ts with its schema entry here. `EventVariant`/`SchemaEventVariant`
// select the matching union member by its `type` discriminator; a variant
// missing from the schema union extracts to `never`, whose `keyof` cannot equal
// the interface's keys, so the assertion fails `tsc`.
// ---------------------------------------------------------------------------
type GameEventSchemaType = z.infer<typeof GameEventSchema>;
type EventVariant<T extends GameEvent['type']> = Extract<GameEvent, { type: T }>;
type SchemaEventVariant<T extends GameEvent['type']> = Extract<GameEventSchemaType, { type: T }>;
type AssertEventKeys<T extends GameEvent['type']> = AssertEqual<
  keyof EventVariant<T>,
  keyof SchemaEventVariant<T>
>;

// Discriminator-set guard: the schema union has exactly the same `type` literals
// as the GameEvent union — no missing and no extra variants.
const _covEventTypes: AssertEqual<GameEvent['type'], GameEventSchemaType['type']> = true;

const _covEvDawnRoll: AssertEventKeys<'DawnRoll'> = true;
const _covEvStatCheck: AssertEventKeys<'StatCheck'> = true;
const _covEvFlawCheck: AssertEventKeys<'FlawCheck'> = true;
const _covEvNpcAction: AssertEventKeys<'NpcAction'> = true;
const _covEvContractClaimed: AssertEventKeys<'ContractClaimed'> = true;
const _covEvDispositionChanged: AssertEventKeys<'DispositionChanged'> = true;
const _covEvBondIntervention: AssertEventKeys<'BondIntervention'> = true;
const _covEvWireEntry: AssertEventKeys<'WireEntry'> = true;
const _covEvEraEventStarted: AssertEventKeys<'EraEventStarted'> = true;
const _covEvEraEventEnded: AssertEventKeys<'EraEventEnded'> = true;
const _covEvDayAdvanced: AssertEventKeys<'DayAdvanced'> = true;
const _covEvDeedEarned: AssertEventKeys<'DeedEarned'> = true;
const _covEvRenownRankUp: AssertEventKeys<'RenownRankUp'> = true;
const _covEvActionBlocked: AssertEventKeys<'ActionBlocked'> = true;
const _covEvPoiDiscovered: AssertEventKeys<'PoiDiscovered'> = true;
const _covEvExplorationFailed: AssertEventKeys<'ExplorationFailed'> = true;
const _covEvSalvageRecovered: AssertEventKeys<'SalvageRecovered'> = true;
const _covEvContrabandFound: AssertEventKeys<'ContrabandFound'> = true;
const _covEvFragmentAcquired: AssertEventKeys<'FragmentAcquired'> = true;
const _covEvFragmentDecoded: AssertEventKeys<'FragmentDecoded'> = true;
const _covEvHangoutEvent: AssertEventKeys<'HangoutEvent'> = true;
const _covEvLoanEvent: AssertEventKeys<'LoanEvent'> = true;
const _covEvDiceRerolled: AssertEventKeys<'DiceRerolled'> = true;
const _covEvCrewEvent: AssertEventKeys<'CrewEvent'> = true;
const _covEvPortEvent: AssertEventKeys<'PortEvent'> = true;
const _covEvStoryletOffered: AssertEventKeys<'StoryletOffered'> = true;
const _covEvStoryletChoiceResolved: AssertEventKeys<'StoryletChoiceResolved'> = true;
const _covEvStoryletChoiceBlocked: AssertEventKeys<'StoryletChoiceBlocked'> = true;
const _covEvStoryletEffectApplied: AssertEventKeys<'StoryletEffectApplied'> = true;
const _covEvStoryletScheduled: AssertEventKeys<'StoryletScheduled'> = true;
const _covEvStoryletDeedProgress: AssertEventKeys<'StoryletDeedProgress'> = true;
const _covEvTravelEvent: AssertEventKeys<'TravelEvent'> = true;
const _covEvTradeEvent: AssertEventKeys<'TradeEvent'> = true;
const _covEvDebtPayment: AssertEventKeys<'DebtPayment'> = true;
const _covEvDebtDue: AssertEventKeys<'DebtDue'> = true;
const _covEvTourOneResolved: AssertEventKeys<'TourOneResolved'> = true;
const _covEvCombatEvent: AssertEventKeys<'CombatEvent'> = true;
const _covEvEncounterStarted: AssertEventKeys<'EncounterStarted'> = true;
const _covEvEncounterRound: AssertEventKeys<'EncounterRound'> = true;
const _covEvTributeDemanded: AssertEventKeys<'TributeDemanded'> = true;
const _covEvTributePaid: AssertEventKeys<'TributePaid'> = true;
const _covEvEnemyCounterAction: AssertEventKeys<'EnemyCounterAction'> = true;
const _covEvComponentDamaged: AssertEventKeys<'ComponentDamaged'> = true;
const _covEvShipLost: AssertEventKeys<'ShipLost'> = true;
const _covEvLifeSupportCritical: AssertEventKeys<'LifeSupportCritical'> = true;
const _covEvLegacySuccession: AssertEventKeys<'LegacySuccession'> = true;
const _covEvEncounterResolved: AssertEventKeys<'EncounterResolved'> = true;
const _covEvShipyardEvent: AssertEventKeys<'ShipyardEvent'> = true;
const _covEvShipyardFail: AssertEventKeys<'ShipyardFail'> = true;
const _covEvContrabandScan: AssertEventKeys<'ContrabandScan'> = true;
const _covEvContrabandConfiscated: AssertEventKeys<'ContrabandConfiscated'> = true;

void _schemaCoversGameState;
void _covPlayer;
void _covShip;
void _covComponent;
void _covCheckResult;
void _covDawnHand;
void _covPendingTravel;
void _covNpc;
void _covNpcAction;
void _covMarket;
void _covCargo;
void _covCharts;
void _covPoi;
void _covLegacy;
void _covLoan;
void _covCrew;
void _covPortStake;
void _covNemesis;
void _covFragment;
void _covDeedRegistry;
void _covEarnedDeed;
void _covStorylet;
void _covStoryletSchedule;
void _covEncounter;
void _covInterceptor;
void _covEraEvent;
void _covEventTypes;
void _covEvDawnRoll;
void _covEvStatCheck;
void _covEvFlawCheck;
void _covEvNpcAction;
void _covEvContractClaimed;
void _covEvDispositionChanged;
void _covEvBondIntervention;
void _covEvWireEntry;
void _covEvEraEventStarted;
void _covEvEraEventEnded;
void _covEvDayAdvanced;
void _covEvDeedEarned;
void _covEvRenownRankUp;
void _covEvActionBlocked;
void _covEvPoiDiscovered;
void _covEvExplorationFailed;
void _covEvSalvageRecovered;
void _covEvContrabandFound;
void _covEvFragmentAcquired;
void _covEvFragmentDecoded;
void _covEvHangoutEvent;
void _covEvLoanEvent;
void _covEvDiceRerolled;
void _covEvCrewEvent;
void _covEvPortEvent;
void _covEvStoryletOffered;
void _covEvStoryletChoiceResolved;
void _covEvStoryletChoiceBlocked;
void _covEvStoryletEffectApplied;
void _covEvStoryletScheduled;
void _covEvStoryletDeedProgress;
void _covEvTravelEvent;
void _covEvTradeEvent;
void _covEvDebtPayment;
void _covEvDebtDue;
void _covEvTourOneResolved;
void _covEvCombatEvent;
void _covEvEncounterStarted;
void _covEvEncounterRound;
void _covEvTributeDemanded;
void _covEvTributePaid;
void _covEvEnemyCounterAction;
void _covEvComponentDamaged;
void _covEvShipLost;
void _covEvLifeSupportCritical;
void _covEvLegacySuccession;
void _covEvEncounterResolved;
void _covEvShipyardEvent;
void _covEvShipyardFail;

/**
 * Parse and validate a raw (already-JSON-parsed) value as a {@link GameState}.
 * Throws a typed {@link z.ZodError} on any mismatch — `err.issues[n].path`
 * points at the offending field.
 */
export function validateGameState(raw: unknown): GameState {
  // `parse` throws z.ZodError on failure. Cast through the inferred type: the
  // schema mirrors GameState but Zod's inference uses slightly different
  // optional/readonly modifiers, so a direct assignment is not structurally
  // identical.
  return GameStateSchema.parse(raw) as unknown as GameState;
}

/**
 * Non-throwing variant. Returns Zod's SafeParseReturn — `{ success: true, data }`
 * or `{ success: false, error }` (a ZodError). Convenient for callers that want
 * to branch rather than catch.
 */
export function safeValidateGameState(raw: unknown) {
  return GameStateSchema.safeParse(raw);
}

/** Companion validator for a persisted PlayerAction. Throws a ZodError. */
export function validatePlayerAction(raw: unknown): PlayerAction {
  return PlayerActionSchema.parse(raw);
}
