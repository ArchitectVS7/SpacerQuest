/**
 * SpacerQuest v4.0 - Bot Player Types
 */

import { AllianceType } from '@prisma/client';

export type ComponentName = 'WEAPONS' | 'SHIELDS' | 'HULL' | 'DRIVES' | 'ROBOTICS' | 'LIFE_SUPPORT' | 'NAVIGATION' | 'CABIN';

export interface BotProfile {
  slug: string;
  name: string;
  shipName: string;
  description: string;
  preferredAlliance: AllianceType;

  // Behavioral weights (0.0 - 1.0)
  aggression: number;
  greed: number;
  caution: number;
  gamblingLust: number;
  tradeFocus: number;
  upgradePriority: number;

  // Ship upgrade priority order
  upgradeOrder: ComponentName[];

  // Combat: retreat if ownBF / enemyBF is below this ratio
  combatRetreatThreshold: number;
}

export type BotActionType =
  | 'REPAIR'
  | 'BUY_FUEL'
  | 'UPGRADE'
  | 'ACCEPT_CARGO'
  | 'GAMBLE'
  | 'TRAVEL'
  | 'FIGHT'
  | 'RETREAT'
  | 'SURRENDER'
  | 'DELIVER_CARGO'
  | 'JOIN_ALLIANCE'
  | 'INVEST_ALLIANCE'
  | 'PAY_FINE'
  | 'POST_BAIL'
  | 'POST_BULLETIN'
  | 'MANAGE_PORT'
  | 'CHALLENGE_DUEL'
  | 'RESCUE_PLAYER';

export interface BotAction {
  type: BotActionType;
  detail: string;
  creditsSpent?: number;
  creditsEarned?: number;
}

export interface BotTurnResult {
  characterId: string;
  botName: string;
  actions: BotAction[];
  creditsEarned: number;
  creditsSpent: number;
  battlesWon: number;
  battlesLost: number;
  tripsCompleted: number;
  notableEvents: string[];
}

export interface BotRunSummary {
  botsProcessed: number;
  totalBattles: number;
  totalCargoDelivered: number;
  events: string[];
}

export type RngFunction = () => number;
