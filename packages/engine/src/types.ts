import {
  AnonymousInterceptorKind,
  PowerTier,
  RenownRankId,
  RouteDangerLevel,
  Stat,
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
}

export interface EncounterState {
  id: string;
  pendingTravel: PendingTravelState;
  interceptor: EncounterInterceptorState;
  routeDangerLevel: RouteDangerLevel;
  routeDangerChance: number;
  encounterRoll: number;
  round: number;
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

export interface TradeEvent {
  type: 'TradeEvent';
  characterId: string;
  actionDetails: string;
  action?: 'buy-fuel' | 'sign-contract' | 'haggle' | 'deliver-cargo' | 'pay-debt-failed';
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
      actionContext?: 'haggle';
    }
  | { type: 'FlawCheck'; npcId: string; flaw: string; die: number; dc: number; resisted: boolean }
  | { type: 'NpcAction'; npcId: string; actionDetails: string }
  | { type: 'WireEntry'; day: number; message: string }
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
      actionType: 'Trade' | 'Travel' | 'Shipyard';
      reason: 'active-encounter';
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
    }
  | TradeEvent
  | { type: 'DebtPayment'; characterId: string; amount: number; remaining: number }
  | { type: 'DebtDue'; day: number; outstanding: number }
  | {
      type: 'CombatEvent';
      characterId: string;
      targetId: string;
      stance: string;
      fuelUsed: number;
      success: boolean;
      insufficientFuel?: boolean;
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
      type: 'EncounterResolved';
      encounterId: string;
      resolution: 'escaped' | 'talked-down' | 'defeated';
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
  | { type: 'Wait' };

export type NpcActionType = 'Trade' | 'Travel' | 'Combat' | 'Patrol' | 'FlawOverride';

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
}

export interface GameState {
  day: number;
  rngState: number; // Storing the seed state to resume
  dayPhase: DayPhase;
  dayEventCount: number;
  player: PlayerState;
  market: MarketState;
  npcs: NpcState[];
  encounter: EncounterState | null;
  eventLog: GameEvent[];
}
