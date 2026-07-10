/**
 * SpacerQuest v4.0 - Wise One Encounter
 *
 * Located at Polaris-1 (System #17)
 * Original: SP.DOCK2.S:332-334, text file SP.WISE
 */

import { randomInt } from '../utils.js';

/**
 * Flavor text from original SP.WISE file
 */
export const WISE_ONE_TEXT =
  `...In the murky dark you stumble forward...
......into the presence of The Wise One......

The Wise One mumbles:

'A special weapon enhancement effective
against planet defenses has been reported
to have been found on alien ship derelicts
adrift in The Great Void. Having the
courage to leave the singularity of
purpose may yet achieve a quest!........'`;

/**
 * Generate a random Number Key (1-9)
 * Original: r=9:gosub rand:kn=x
 */
export function generateNumberKey(): number {
  return randomInt(1, 9);
}
