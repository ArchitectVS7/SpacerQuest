/**
 * SpacerQuest v4.0 - End Turn System
 *
 * Validates that the player can end their turn, then runs all bot turns.
 */

import { isClassicMode } from '../../bots/config.js';
import { runAllBotTurns } from '../../bots/bot-runner.js';
import { DAILY_TRIP_LIMIT } from '../constants.js';
import { BotRunSummary } from '../../bots/types.js';

export interface EndTurnValidation {
  canEnd: boolean;
  reason?: string;
}

export function validateEndTurn(tripCount: number): EndTurnValidation {
  if (isClassicMode()) {
    return { canEnd: false, reason: 'Classic mode — wait for next day' };
  }

  if (tripCount < DAILY_TRIP_LIMIT) {
    const remaining = DAILY_TRIP_LIMIT - tripCount;
    return { canEnd: false, reason: `You still have ${remaining} trip(s) remaining` };
  }

  return { canEnd: true };
}

export async function executeEndTurn(characterId: string): Promise<BotRunSummary> {
  return runAllBotTurns(characterId);
}
