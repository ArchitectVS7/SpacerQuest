import {
  AnonymousInterceptorKind,
  PowerTier,
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

// Discriminator for game events
export type GameEvent =
  | { type: 'DawnRoll'; day: number; hand: number[] }
  | { type: 'StatCheck'; actor: string; stat: Stat; dc: number; result: CheckResult }
  | { type: 'FlawCheck'; npcId: string; flaw: string; die: number; dc: number; resisted: boolean }
  | { type: 'NpcAction'; npcId: string; actionDetails: string }
  | { type: 'WireEntry'; day: number; message: string }
  | { type: 'DayAdvanced'; day: number }
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
  | { type: 'TradeEvent'; characterId: string; actionDetails: string }
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
    };

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
