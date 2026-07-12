import { z } from 'zod';
import type {
  GameState,
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
// dropped; this content boundary is the deliberate exception.
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
// Every stored event variant is mirrored precisely. Zod strips unknown keys, so
// a future task adding a field to an existing event will not reject old/new
// saves; a genuinely new event `type` would need a new variant here.

const GameEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('DawnRoll'), day: z.number(), hand: z.array(z.number()) }),
  z.object({
    type: z.literal('StatCheck'),
    actor: z.string(),
    stat: StatSchema,
    dc: z.number(),
    result: CheckResultSchema,
    actionContext: z.enum(['haggle', 'storylet']).optional(),
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
    reason: z.enum(['tribute', 'defeat', 'player-fled', 'decay', 'storylet', 'contract-sniped']),
  }),
  z.object({
    type: z.literal('BondIntervention'),
    day: z.number(),
    npcId: z.string(),
    kind: z.enum(['fuel-gift', 'drive-off']),
    amount: z.number().optional(),
  }),
  z.object({ type: z.literal('WireEntry'), day: z.number(), message: z.string() }),
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
    actionType: z.enum(['Trade', 'Travel', 'Shipyard', 'Storylet', 'Explore']),
    // 'destination-locked' added by T-1101; serialized in eventLog, so the schema
    // must accept it or loadSave would reject a save containing the event.
    reason: z.enum(['active-encounter', 'destination-locked']),
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
  }),
  z.object({
    type: z.literal('ShipLost'),
    day: z.number(),
    encounterId: z.string(),
    interceptorId: z.string(),
    reason: z.literal('combat-defeat'),
    component: ShipComponentIdSchema.optional(),
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
    resolution: z.enum(['escaped', 'talked-down', 'defeated', 'interceptor-fled']),
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
void _covNemesis;
void _covFragment;
void _covDeedRegistry;
void _covEarnedDeed;
void _covStorylet;
void _covStoryletSchedule;
void _covEncounter;
void _covInterceptor;
void _covEraEvent;

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
