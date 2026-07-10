/**
 * SpacerQuest v4.0 - Sage / Ancient One Encounter
 *
 * Located at Mizar-9 (System #18)
 * Interactive constellation knowledge quiz
 * Original: SP.DOCK2.S:300-330, text files SP.SAGE and SP.CONS
 */

import { randomInt } from '../utils.js';

/**
 * Constellation chart (A-P) from original SP.CONS
 */
export const CONSTELLATION_MAP: Record<string, string> = {
  A: 'Perseus',
  B: 'Auriga',
  C: 'Orion',
  D: 'Taurus',
  E: 'Cygnus',
  F: 'Aquila',
  G: 'Scorpius',
  H: 'Lyra',
  I: 'Virgo',
  J: 'Bootes',
  K: 'Leo',
  L: 'Gemini',
  M: 'Draco',
  N: 'Hercules',
  O: 'Sagittarius',
  P: 'Pegasus',
};

/**
 * Star-to-constellation mapping from original SP.DOCK2.S:304-316
 *
 * Original ACOS code:
 *   if x=1 j$="ALGOL":k$="A"
 *   if x=2 j$="CAPELLA":k$="B"
 *   ... etc
 */
export const STAR_QUESTIONS: { star: string; answer: string }[] = [
  { star: 'ALGOL', answer: 'A' },
  { star: 'CAPELLA', answer: 'B' },
  { star: 'RIGEL', answer: 'C' },
  { star: 'ALDEBARON', answer: 'D' },
  { star: 'DENEB', answer: 'E' },
  { star: 'ALTAIR', answer: 'F' },
  { star: 'ANTARES', answer: 'G' },
  { star: 'VEGA', answer: 'H' },
  { star: 'SPICA', answer: 'I' },
  { star: 'ARCTURUS', answer: 'J' },
  { star: 'REGULUS', answer: 'K' },
  { star: 'DENEBOLA', answer: 'K' },
  { star: 'POLLUX', answer: 'L' },
];

/**
 * Get a random sage question
 * Original: r=13:gosub rand
 */
export function getRandomSageQuestion(): { star: string; answer: string } {
  const idx = randomInt(0, STAR_QUESTIONS.length - 1);
  return STAR_QUESTIONS[idx];
}

/**
 * Check if the player's answer is correct
 */
export function checkSageAnswer(star: string, playerAnswer: string): boolean {
  const question = STAR_QUESTIONS.find(q => q.star === star);
  if (!question) return false;
  return playerAnswer.toUpperCase() === question.answer;
}

/**
 * Apply sage reward: +1 cabin strength, condition set to 9
 * Original: c1=c1+1:c2=9
 */
export function applySageReward(
  cabinStrength: number,
  _cabinCondition: number
): { cabinStrength: number; cabinCondition: number } {
  return {
    cabinStrength: cabinStrength + 1,
    cabinCondition: 9,
  };
}

/**
 * Sage greeting text from original SP.SAGE
 */
export const SAGE_TEXT =
  `...You are ushered by unseen hands...
.....into the presence of The Ancient One......

The Sage speaks:

'You have been brought here so that
we might rap on the mysteries of the
......Great Constellations......

Answering The Question correctly
Will bring you some small reward'
............................`;

/**
 * Constellation chart display text from original SP.CONS
 */
export const CONSTELLATION_CHART =
  `     ________M_I_L_K_Y___W_A_Y___C_O_N_S_T_E_L_L_A_T_I_O_N_S________
  |[                                                               ]|
  |[  A...Perseus    E...Cygnus     I...Virgo     M...Draco        ]|
  |[  B...Auriga     F...Aquila     J...Bootes    N...Hercules     ]|
  |[  C...Orion      G...Scorpius   K...Leo       O...Sagittarius  ]|
  |[  D...Taurus     H...Lyra       L...Gemini    P...Pegasus      ]|
  |[_______________________________________________________________]|`;
