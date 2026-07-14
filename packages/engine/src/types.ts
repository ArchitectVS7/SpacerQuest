import {
  AnonymousInterceptorKind,
  PoiType,
  PowerTier,
  RenownRankId,
  RouteDangerLevel,
  EraId,
  FlagValue,
  Stat,
  StoryletChoiceDefinition,
  StatBlock,
} from '@spacerquest/content';

export interface DawnHand {
  dice: number[];
  spent: boolean[];
}

export interface CheckResult {
  die: number;
  modifier: number;
  total: number;
  dc: number;
  success: boolean;
  margin: number;
  nat20: boolean;
  nat1: boolean;
}

export interface PendingTravelState {
  origin: number;
  destination: number;
  fuelUsed: number;
}

/**
 * A live world economic event (T-107). Transient world weather — a blockade, a
 * plague, a dilithium rush — that re-prices the map. Nothing derivable is stored:
 * the modifiers are always recomputed from content by `defId` (era.ts). This is
 * a DIFFERENT concept from the campaign-phase `era` field ('TOUR_ONE'|'VETERAN').
 */
export interface EraEventState {
  defId: string;
  /** First day the event is active. */
  startedDay: number;
  /** First day the event is NO LONGER active (active while day < endsDay). */
  endsDay: number;
  /** Systems in scope — the epicentre payments/fuel/danger read against. */
  affectedSystemIds: number[];
}

export interface EncounterInterceptorState {
  id: string;
  source: 'named' | 'anonymous';
  name: string;
  shipName: string;
  shipClass?: string;
  homeSystem?: string;
  kind?: AnonymousInterceptorKind;
  rosterIndex?: number;
  profileId?: string;
  stats: StatBlock;
  tier: PowerTier;
  flaw?: string;
  flawDc?: number;
}

export interface EncounterState {
  id: string;
  pendingTravel: PendingTravelState;
  interceptor: EncounterInterceptorState;
  routeDangerLevel: RouteDangerLevel;
  routeDangerChance: number;
  encounterRoll: number;
  round: number;
  /** Hull points the interceptor starts with; each successful fight volley
   *  removes one. Scales with interceptor tier (1-5). Always present. */
  enemyHull: number;
}

export enum DayPhase {
  DAWN = 'DAWN',
  WIRE = 'WIRE',
  DAY = 'DAY',
  DUSK = 'DUSK',
}

export interface EarnedDeedState {
  id: string;
  title: string;
  citation: string;
  day: number;
  eventIndex: number;
}

export interface DeedRegistryState {
  earned: EarnedDeedState[];
  renownRank: RenownRankId;
  /** Cached historical match count per deed id, so deed evaluation stays O(source
   *  events) instead of rescanning the full event log on every call. */
  matchCounts: Record<string, number>;
}

export interface StoryletOffer {
  storyletId: string;
  title: string;
  prose: string;
  choices: readonly {
    id: string;
    label: string;
    prose: string;
    requirements?: StoryletChoiceDefinition['requirements'];
  }[];
  day: number;
  scheduled: boolean;
}

export interface StoryletScheduleState {
  storyletId: string;
  dueDay: number;
  sourceStoryletId: string;
  sourceChoiceId: string;
}

export interface StoryletState {
  available: StoryletOffer[];
  completed: Record<string, number>;
  scheduled: StoryletScheduleState[];
  offeredToday: string[];
}

export interface TradeEvent {
  type: 'TradeEvent';
  characterId: string;
  actionDetails: string;
  action?:
    'buy-fuel' | 'sign-contract' | 'haggle' | 'deliver-cargo' | 'forfeit-cargo' | 'pay-debt-failed';
  success?: boolean;
  amount?: number;
  fuelAmount?: number;
  cost?: number;
  destination?: number;
  cargoType?: number;
  payment?: number;
}

// Discriminator for game events
export type GameEvent =
  | { type: 'DawnRoll'; day: number; hand: number[] }
  | {
      type: 'StatCheck';
      actor: string;
      stat: Stat;
      dc: number;
      result: CheckResult;
      /** Where the check came from. The `npc-*` contexts (T-1201) tag NPC
       *  day-resolution rolls so readers (the wire in day.ts / ui format.ts,
       *  and T-1202's deeper surface) can discriminate per-verb without
       *  stringly-parsing `actor`. */
      actionContext?:
        | 'haggle'
        | 'storylet'
        | 'npc-trade'
        | 'npc-travel'
        | 'npc-combat'
        | 'npc-patrol'
        | 'npc-socialize'
        // T-1207: an interceptor's post-kill retreat PILOT roll. Discriminated
        // from `npc-combat` (enemy pressure / run-pursuit) so the wire scanner
        // (wire.ts classifyCheck) routes a nat-20 here to the "miracle burn"
        // retreat bucket instead of the generic combat bucket.
        | 'retreat';
    }
  | { type: 'FlawCheck'; npcId: string; flaw: string; die: number; dc: number; resisted: boolean }
  | { type: 'NpcAction'; npcId: string; actionDetails: string }
  | {
      /** A same-system NPC took a job off the player's manifest board at dusk
       *  (T-106 contract competition). */
      type: 'ContractClaimed';
      day: number;
      npcId: string;
      cargoType: number;
      destination: number;
      payment: number;
    }
  | {
      /** Per-NPC disposition toward the player moved. Clamped to [-10, +10]. */
      type: 'DispositionChanged';
      day: number;
      npcId: string;
      delta: number;
      disposition: number;
      reason: 'tribute' | 'defeat' | 'player-fled' | 'decay' | 'storylet' | 'contract-sniped';
    }
  | {
      /** A bonded NPC intervened at dusk on the player's behalf (T-106 bond hook). */
      type: 'BondIntervention';
      day: number;
      npcId: string;
      kind: 'fuel-gift' | 'drive-off';
      amount?: number;
    }
  | { type: 'WireEntry'; day: number; message: string }
  | {
      /** A world economic event began at dusk; active from the next dawn (T-107). */
      type: 'EraEventStarted';
      day: number;
      defId: string;
      name: string;
      endsDay: number;
      affectedSystemIds: number[];
    }
  | {
      /** A world economic event expired at the day boundary (T-107). */
      type: 'EraEventEnded';
      day: number;
      defId: string;
      name: string;
    }
  | { type: 'DayAdvanced'; day: number }
  | {
      type: 'DeedEarned';
      day: number;
      deedId: string;
      title: string;
      citation: string;
      renownRank: RenownRankId;
    }
  | {
      type: 'RenownRankUp';
      day: number;
      previousRank: RenownRankId;
      newRank: RenownRankId;
      deedCount: number;
    }
  | {
      type: 'ActionBlocked';
      day: number;
      actionType: 'Trade' | 'Travel' | 'Shipyard' | 'Storylet' | 'Explore';
      // 'destination-locked' (T-1101): a Travel to a sealed system (Andromeda /
      // special) before the 'nemesis.crossing.unlocked' flag lifts it.
      reason: 'active-encounter' | 'destination-locked';
    }
  | {
      /** An Explore nav check succeeded and charted a point of interest
       *  (T-111a). The reward (loot/fragments) is attached in T-111b. */
      type: 'PoiDiscovered';
      day: number;
      poiId: string;
      poiType: PoiType;
      systemId: number;
      name: string;
    }
  | {
      /**
       * An Explore attempt produced nothing (T-111a). Two distinct classes:
       *  - RESOLVED fails — `nav-check` / `insufficient-fuel`: a real detour was
       *    attempted, so the die IS spent (and fuel burned, for nav-check).
       *  - MALFORMED-input fails (T-1003) — `no-die` / `invalid-die-index` /
       *    `die-already-spent`: the Explore action named no usable die, so there
       *    was nothing to spend. NO die is spent and NO fuel is burned; these
       *    replace the raw `Error`s that used to crash the UGT adapter, keeping
       *    the typed-fail-event convention (every player-possible input is an
       *    event, never a throw).
       */
      type: 'ExplorationFailed';
      day: number;
      systemId: number;
      reason:
        'nav-check' | 'insufficient-fuel' | 'no-die' | 'invalid-die-index' | 'die-already-spent';
    }
  | {
      /** A boarded POI's loot roll yielded salvage — real credits (T-111b). */
      type: 'SalvageRecovered';
      day: number;
      poiId: string;
      systemId: number;
      amount: number;
    }
  | {
      /** A boarded POI's loot roll yielded a sealed Contraband pod (T-111b). The
       *  carrying choice is surfaced as the `derelict.sealed-pod` storylet. */
      type: 'ContrabandFound';
      day: number;
      poiId: string;
      systemId: number;
    }
  | {
      /** A Signal Fragment entered the Nemesis file (T-111b). Fired only when the
       *  fragment was actually NEW — a duplicate grant emits nothing. */
      type: 'FragmentAcquired';
      day: number;
      fragmentId: string;
      source: SignalFragmentRecord['source'];
      /** Running fragment count after the grant (== decoded-lore index length). */
      fragmentCount: number;
      /** The POI the fragment was looted from, when applicable. */
      poiId?: string;
    }
  | {
      /** The Sage decoded a held fragment into lore (T-111b). Fired only when a
       *  held, still-undecoded fragment was actually decoded. */
      type: 'FragmentDecoded';
      day: number;
      fragmentId: string;
    }
  | { type: 'StoryletOffered'; day: number; storyletId: string; scheduled: boolean }
  | {
      type: 'StoryletChoiceResolved';
      day: number;
      storyletId: string;
      choiceId: string;
      success?: boolean;
    }
  | {
      type: 'StoryletChoiceBlocked';
      day: number;
      storyletId: string;
      choiceId: string;
      reason: 'not-available' | 'unknown-choice' | 'insufficient-credits' | 'missing-die';
    }
  | {
      type: 'StoryletEffectApplied';
      day: number;
      storyletId: string;
      choiceId: string;
      effect:
        | 'credits'
        | 'fuel'
        | 'flag'
        | 'flag-cleared'
        | 'active-contract-cleared'
        | 'manifest-contract-added'
        | 'disposition'
        | 'fragment-granted'
        | 'fragment-decoded';
      amount?: number;
      flag?: string;
      value?: FlagValue;
      npcId?: string;
      cargoType?: number;
      destination?: number;
      fragmentId?: string;
    }
  | {
      type: 'StoryletScheduled';
      day: number;
      storyletId: string;
      choiceId: string;
      scheduledStoryletId: string;
      dueDay: number;
    }
  | {
      type: 'StoryletDeedProgress';
      day: number;
      storyletId: string;
      choiceId: string;
      deedId: string;
      amount: number;
    }
  | {
      type: 'TravelEvent';
      characterId: string;
      origin: number;
      destination: number;
      fuelUsed: number;
      success: boolean;
      interrupted?: boolean;
      resumedFromEncounterId?: string;
      /** T-1102: the jump was refused because the tank could not cover the
       *  per-distance cost — the "typed fail" of the fuel-scarcity overhaul (a
       *  cross-map hop is unaffordable on a starter tank). READER: the UI
       *  jump-command handler in store.ts, which surfaces the dry-tank notice. */
      insufficientFuel?: boolean;
    }
  | TradeEvent
  | { type: 'DebtPayment'; characterId: string; amount: number; remaining: number }
  | { type: 'DebtDue'; day: number; outstanding: number }
  | {
      /** T-113b: the decisive Day-30 Tour One resolution (PRD §5.1). Emitted
       *  exactly once, at the dusk of day 30 (after the player's final actions),
       *  forced regardless of the player's system or normal storylet
       *  eligibility. `outcome` branches the veteran unlock (cleared) from the
       *  guild-consequence continuation (unpaid). Debt survives on the unpaid
       *  path — the game continues indebted, never soft-locked. */
      type: 'TourOneResolved';
      day: number;
      outcome: 'cleared' | 'unpaid';
      /** Debt still owed at resolution — 0 on the cleared path. */
      debtOutstanding: number;
    }
  | {
      type: 'CombatEvent';
      characterId: string;
      targetId: string;
      stance: 'run' | 'talk' | 'fight';
      fuelUsed: number;
      success: boolean;
      insufficientFuel?: boolean;
      enemyHullRemaining?: number;
    }
  | { type: 'EncounterStarted'; encounter: EncounterState }
  | {
      type: 'EncounterRound';
      encounterId: string;
      round: number;
      stance: 'run' | 'talk' | 'fight';
      continues: boolean;
      success: boolean;
      fuelUsed: number;
      insufficientFuel?: boolean;
    }
  | {
      type: 'TributeDemanded';
      encounterId: string;
      round: number;
      amount: number;
      refused: boolean;
      affordable: boolean;
      /** A natural-20 talk check waves the ship through free of charge. */
      waived?: boolean;
    }
  | {
      type: 'TributePaid';
      encounterId: string;
      round: number;
      amount: number;
      creditsRemaining: number;
    }
  | {
      type: 'EnemyCounterAction';
      encounterId: string;
      round: number;
      interceptorId: string;
      pressure: 'between-rounds' | 'day-end';
      check: CheckResult;
      success: boolean;
    }
  | {
      type: 'ComponentDamaged';
      encounterId: string;
      component: ShipComponentId;
      previousCondition: number;
      newCondition: number;
      amount: number;
      /** T-1205: how many condition points the player's shields absorbed off the
       *  raw hit. 0 for a junker (no mitigation); a fully-absorbed hit reports
       *  amount 0 with `mitigated` === the raw damage. READER: wire.ts prose and
       *  the ui damage log (format.ts). */
      mitigated?: number;
    }
  | {
      type: 'ShipLost';
      day: number;
      encounterId: string;
      interceptorId: string;
      // T-1205: 'life-support-failure' — life support driven to condition 0 (now
      // reachable via seeded combat damage) failed its dusk survival check in
      // day.ts. 'combat-defeat' is the hull-to-0 killing blow in combat.ts.
      reason: 'combat-defeat' | 'life-support-failure';
      component?: ShipComponentId;
    }
  | {
      /** T-1205: life support has been driven to condition 0 and faced its dusk
       *  survival check. `survived: true` is a scare (no state change);
       *  `survived: false` precedes a ShipLost{reason:'life-support-failure'} +
       *  succession. This is the named reader for the `lifeSupport` component.
       *  READER: wire.ts prose + ui damage/obituary log (format.ts). */
      type: 'LifeSupportCritical';
      day: number;
      component: 'lifeSupport';
      survived: boolean;
    }
  | {
      /** T-108: the successor claims the license. Fired immediately after
       *  ShipLost. Carries the estate summary — the wire obituary is a separate
       *  WireEntry emitted alongside. */
      type: 'LegacySuccession';
      day: number;
      successionCount: number;
      inheritedCredits: number;
      debtOutstanding: number;
      previousShipLostTo: string;
    }
  | {
      type: 'EncounterResolved';
      encounterId: string;
      /** 'interceptor-fled': a bonded NPC drove the interceptor off at dusk
       *  (T-106 bond hook) — travel completes as if the threat was beaten.
       *  'interceptor-escaped' (T-1207): a cracked-drive interceptor won its own
       *  opposed PILOT retreat roll off a LOST fight (PRD §7.4 "miracle burn") —
       *  it flees alive under its own power. The player still won the field, so
       *  travel completes (unlike 'escaped', which is the PLAYER fleeing). */
      resolution:
        'escaped' | 'talked-down' | 'defeated' | 'interceptor-fled' | 'interceptor-escaped';
      round: number;
      interceptorId: string;
    }
  | ShipyardEvent
  | ShipyardFail;

export type ShipComponentId =
  'hull' | 'drives' | 'cabin' | 'lifeSupport' | 'weapons' | 'navigation' | 'robotics' | 'shields';

export type SpecialEquipmentId =
  | 'CLOAKER'
  | 'AUTO_REPAIR'
  | 'STAR_BUSTER'
  | 'ARCH_ANGEL'
  | 'ASTRAXIAL_HULL'
  | 'TITANIUM_HULL'
  | 'TRANS_WARP';

export type ShipyardActionKind =
  'buy-component-tier' | 'repair' | 'buy-cargo-pods' | 'buy-special-equipment';

export type ShipyardFailureReason =
  | 'INSUFFICIENT_CREDITS'
  | 'AT_MAX_CONDITION'
  | 'NO_HULL'
  | 'CAPACITY_EXCEEDED'
  | 'MUTUALLY_EXCLUSIVE_EQUIPMENT'
  | 'PREREQUISITE_NOT_MET'
  | 'INSUFFICIENT_RENOWN'
  | 'ALREADY_INSTALLED';

export interface ShipyardEvent {
  type: 'ShipyardEvent';
  action: ShipyardActionKind;
  cost: number;
  component?: ShipComponentId;
  tier?: number;
  repairMode?: 'all' | 'single';
  quantity?: number;
  equipment?: SpecialEquipmentId;
}

export interface ShipyardFail {
  type: 'ShipyardFail';
  action: ShipyardActionKind;
  reason: ShipyardFailureReason;
  component?: ShipComponentId;
  tier?: number;
  repairMode?: 'all' | 'single';
  quantity?: number;
  equipment?: SpecialEquipmentId;
  conflictingEquipment?: SpecialEquipmentId;
  prerequisite?: string;
  requiredRank?: RenownRankId;
  cost?: number;
  credits?: number;
  maxPods?: number;
}

// Player actions
export type PlayerAction =
  | {
      type: 'Trade';
      action: 'buy-fuel' | 'sign-contract' | 'haggle' | 'pay-debt';
      contractIndex?: number;
      fuelAmount?: number;
      amount?: number;
      spendDie?: number;
    }
  | { type: 'Travel'; destinationId: number; spendDie?: number }
  | { type: 'Combat'; stance: 'run' | 'talk' | 'fight'; targetId: string; spendDie?: number }
  | {
      type: 'Shipyard';
      action: ShipyardActionKind;
      spendDie: number;
      component?: ShipComponentId;
      tier?: number;
      repairMode?: 'all' | 'single';
      quantity?: number;
      equipment?: SpecialEquipmentId;
    }
  | { type: 'Storylet'; storyletId: string; choiceId: string; spendDie?: number }
  | { type: 'Explore'; spendDie?: number }
  | { type: 'Wait' };

export type NpcActionType =
  'Trade' | 'Travel' | 'Combat' | 'Patrol' | 'Socialize' | 'Idle' | 'FlawOverride';

export interface NpcAction {
  type: NpcActionType;
  details: string;
}

export interface NpcState {
  id: string;
  name: string;
  profileId: string;
  currentSystemId: number;
  credits: number;
  fuel: number;
  /** Per-NPC standing toward the player, clamped to [-10, +10]; decays one
   *  step toward 0 each dusk. */
  disposition: number;
  lastAction?: NpcAction;
}

export interface ComponentState {
  strength: number; // 1-199
  condition: number; // 0-9
}

export interface ShipState {
  fuel: number;
  maxFuel: number;
  cargoPods: number;
  hull: ComponentState;
  drives: ComponentState;
  weapons: ComponentState;
  shields: ComponentState;
  navigation: ComponentState;
  lifeSupport: ComponentState;
  robotics: ComponentState;
  cabin: ComponentState;
  hasTransWarpDrive?: boolean;
  hasCloaker?: boolean;
  hasAutoRepair?: boolean;
  hasStarBuster?: boolean;
  hasArchAngel?: boolean;
  isAstraxialHull?: boolean;
  hasTitaniumHull?: boolean;
}

/** A point of interest the spacer has charted off the lane (T-111a). Part of
 *  the persistent charts knowledge — it survives death and passes to the
 *  successor. T-111b socket: loot (salvage credits, Contraband pods, Signal
 *  fragments) and the Nemesis file attach to a discovered POI by `id`/`type`. */
export interface DiscoveredPoi {
  id: string;
  type: PoiType;
  /** System the POI was charted off (the spacer's location at discovery). */
  systemId: number;
  /** Flavor name chosen deterministically from the seeded discovery roll. */
  name: string;
  /** Day the POI was discovered. */
  day: number;
}

export interface ChartsState {
  /** Every system the spacer has personally arrived at — recorded on each
   *  successful arrival (travel completion) and seeded with the starting
   *  system. This is the persistent KNOWLEDGE namespace: it survives death and
   *  passes wholesale to the successor (T-108 legacy).
   *  // T-111 socket: fragments join the charts inheritance */
  visitedSystemIds: number[];
  /** Points of interest charted via the Explore action (T-111a). Also part of
   *  the persistent knowledge that survives death. */
  discoveredPois: DiscoveredPoi[];
}

export interface LegacyState {
  /** How many times the license has passed to a successor — 0 for a first-run
   *  spacer, +1 on every ShipLost succession (T-108). */
  successionCount: number;
}

/** One Signal Fragment held in the Nemesis file (T-111b, PRD §8.1). A knowledge
 *  item keyed by a content fragment id (nemesis.ts). Dedupe key: fragmentId. */
export interface SignalFragmentRecord {
  /** Content fragment id — maps 1:1 to a SIGNAL_FRAGMENTS lore entry. */
  fragmentId: string;
  /** How the fragment entered the file. */
  source: 'derelict' | 'beacon' | 'wise-one' | 'sage' | 'npc';
  /** Day the fragment was acquired. */
  day: number;
  /** Whether the Sage of Mizar-9 has decoded it into lore. */
  decoded: boolean;
}

/** The terminal's Nemesis file — the running collection of Signal Fragments
 *  (PRD §7.2/§8.1). Knowledge is "the one currency death never takes", so this
 *  persists wholesale through succession (T-108). Fragments are deduped by id
 *  and never removed: the fragment count grows monotonically. */
export interface NemesisFileState {
  fragments: SignalFragmentRecord[];
}

export interface PlayerState {
  credits: number;
  /** Outstanding Merchant Guild debt — a ledger entry, NOT negative credits.
   *  Modeling debt as a negative balance recreates the UGT poverty trap
   *  (can't buy fuel, can't earn, can't recover). */
  debt: number;
  debtDueDay: number;
  stats: StatBlock;
  tier: PowerTier;
  currentSystemId: number;
  dawnHand?: DawnHand;
  ship: ShipState;
  registry: DeedRegistryState;
  /** Persistent chart knowledge — survives death (T-108). */
  charts: ChartsState;
  /** The Nemesis file — Signal Fragments (knowledge). Survives death (T-111b). */
  nemesisFile: NemesisFileState;
  /** Legacy/succession bookkeeping — survives death (T-108). */
  legacy: LegacyState;
  activeContract?: CargoContract | null;
}

export interface CargoContract {
  destination: number;
  cargoType: number;
  payment: number;
  pods: number;
  haggled?: boolean;
}

export interface MarketState {
  manifestBoard: CargoContract[];
  localFuelPrice: number;
  /** T-106 contract competition: jobs claimed off the local board by NPCs at
   *  dusk. Each claim removes the offer from the live board immediately AND
   *  shrinks the next dawn's board generation pool by one (the depot's job
   *  pool was drained). Reset to 0 by startDay after it is consumed. */
  npcClaims: number;
}

export interface GameState {
  day: number;
  rngState: number; // Storing the seed state to resume
  dayPhase: DayPhase;
  dayEventCount: number;
  era: EraId;
  flags: Record<string, FlagValue>;
  storylets: StoryletState;
  player: PlayerState;
  market: MarketState;
  npcs: NpcState[];
  encounter: EncounterState | null;
  /** The single active world economic event, or null (T-107). At most one is
   *  ever active; the seeded dusk scheduler owns its lifecycle. */
  eraEvent: EraEventState | null;
  /** Day the previous era event ended — the scheduler's cooldown anchor. 0 when
   *  no era event has ever ended. */
  lastEraEventEndedDay: number;
  eventLog: GameEvent[];
}
