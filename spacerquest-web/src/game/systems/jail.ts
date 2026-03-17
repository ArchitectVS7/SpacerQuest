/**
 * SpacerQuest v4.0 - Jail / Brig / Crime System
 *
 * Implements the crime and punishment system from the original game.
 * Original sources: SP.END.S:233-271, SP.BAR.S:300-379, SP.FIGHT1.S:247-253
 *
 * Crime mechanics:
 * - Players caught smuggling (pp=5) get name prefixed with J%
 * - On login, J% prefix redirects to jail screen
 * - Players can pay fines to Admiral Juris P. Magnus for release
 * - Other players can bail out jailed spacers for double the fine
 */

import { subtractCredits } from '../utils.js';

// ============================================================================
// CRIME TYPES
// ============================================================================

export enum CrimeType {
  SMUGGLING = 5,      // pp=5: Caught smuggling contraband
  CARRIER_LOSS = 6,   // pp=6: Modem disconnect during battle
  CONDUCT = 7,        // pp=7: Conduct against spirit of game
}

/**
 * Fine amounts per crime type (in credits)
 * Original: SP.END.S:248-254
 *   if pp<6 ... a=1  (1,000 cr)
 *   if pp=6 ... a=10 (10,000 cr)
 *   if pp=7 ... a=20 (20,000 cr)
 */
export const CRIME_FINES: Record<CrimeType, number> = {
  [CrimeType.SMUGGLING]: 1000,
  [CrimeType.CARRIER_LOSS]: 10000,
  [CrimeType.CONDUCT]: 20000,
};

/**
 * Bail costs are double the fine
 * Original: SP.BAR.S:348-349
 *   i$="2" (2,000 for smuggling)
 *   if pp=6 i$="20" (20,000 for carrier loss)
 */
export const BAIL_MULTIPLIER = 2;

// ============================================================================
// JAIL STATE
// ============================================================================

/**
 * Check if player is jailed (name prefixed with J%)
 * Original: SP.START.S:132 - if left$(na$,2)="J%" link "sp.end","jail"
 */
export function isJailed(name: string): boolean {
  return name.startsWith('J%');
}

/**
 * Jail a player by prefixing their name with J%
 * Original: SP.FIGHT1.S:252 - na$="J%"+na$
 */
export function jailPlayer(name: string): string {
  if (isJailed(name)) return name;
  return `J%${name}`;
}

/**
 * Release a player by removing J% prefix
 * Original: SP.BAR.S:365 - lw=len(j$):lw=lw-2:j$=right$(j$,lw)
 */
export function releasePlayer(name: string): string {
  if (!isJailed(name)) return name;
  return name.slice(2);
}

/**
 * Calculate bail cost for a crime type
 */
export function calculateBailCost(crimeType: CrimeType): number {
  return CRIME_FINES[crimeType] * BAIL_MULTIPLIER;
}

// ============================================================================
// FINE PAYMENT
// ============================================================================

/**
 * Check if player can afford to pay fine
 * Original: SP.END.S:260-263
 *   if (a=1) and (g2<1000) ... "Not enough credits!"
 *   if (a=10) and (g1<1) ... "Not enough credits!"
 *   if (a=20) and (g1<2) ... "Not enough credits!"
 */
export function canPayFine(
  creditsHigh: number,
  creditsLow: number,
  crimeType: CrimeType
): boolean {
  const fine = CRIME_FINES[crimeType];
  const totalCredits = creditsHigh * 10000 + creditsLow;
  return totalCredits >= fine;
}

/**
 * Pay a fine and return updated credits
 * Original: SP.END.S:268-269
 *   if a=1 g2=g2-a (deduct 1000 from low)
 *   if a>1 g1=g1-a (deduct 10 or 20 from high)
 */
export function payFine(
  creditsHigh: number,
  creditsLow: number,
  crimeType: CrimeType
): { success: boolean; creditsHigh: number; creditsLow: number } {
  const fine = CRIME_FINES[crimeType];

  if (!canPayFine(creditsHigh, creditsLow, crimeType)) {
    return { success: false, creditsHigh, creditsLow };
  }

  const result = subtractCredits(creditsHigh, creditsLow, fine);
  return {
    success: true,
    creditsHigh: result.high,
    creditsLow: result.low,
  };
}

/**
 * Release message from Admiral Juris P. Magnus
 */
export const RELEASE_MESSAGE =
  `Spacer...The debt is paid!....The prisoner is released!

                             Admiral Juris P. Magnus, Esq
                                 Space Provost Marshall`;
