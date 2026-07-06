/**
 * SpacerQuest v4.0 - End Turn System
 *
 * Validates that the player can end their turn, then runs all bot turns.
 */

import { isClassicMode } from '../../bots/config.js';
import { runAllBotTurns } from '../../bots/bot-runner.js';
import { BotRunSummary } from '../../bots/types.js';

export interface EndTurnValidation {
  canEnd: boolean;
  reason?: string;
}

export function validateEndTurn(tripCount: number): EndTurnValidation {
  if (isClassicMode()) {
    return { canEnd: false, reason: 'Classic mode — wait for next day' };
  }

  // Daily trips are an ALLOWANCE, not a quota: a player is never forced to spend
  // all of them before ending the turn (tripCount is unused here on purpose —
  // kept in the signature since callers still pass it and the DAILY_TRIP_LIMIT
  // CAP on *launching* a 4th trip lives separately in travel launch validation).
  return { canEnd: true };
}

export async function executeEndTurn(characterId: string): Promise<BotRunSummary> {
  return runAllBotTurns(characterId);
}
