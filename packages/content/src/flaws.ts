/**
 * Flaw definitions — pure data, per TECH-STACK.md content/ charter.
 *
 * A flaw only comes into play when the day's intended action "touches" it
 * (PRD §6: flaws override optimal play *when a decision touches the flaw*,
 * not on a blanket daily roll). `triggers` lists the intent categories that
 * touch the flaw; the engine rolls d20 vs the character's own flawDc and on
 * a failure the flaw chooses the day.
 */
export type FlawTrigger = 'Trade' | 'Travel' | 'Combat' | 'Patrol';

export interface FlawDef {
  triggers: FlawTrigger[];
  /** Wire-ready past-tense fragment, rendered after the character's name. */
  detail: string;
  /** Credit delta applied when the character succumbs. */
  credits?: number;
  /** Fuel delta when succumbing; 'drain' empties the tank. */
  fuel?: number | 'drain';
}

export const FLAWS: Record<string, FlawDef> = {
  Bloodthirsty: {
    triggers: ['Combat', 'Patrol'],
    detail: 'went on a rampage, attacking everything in sight.',
    fuel: -200,
  },
  Vengeful: { triggers: ['Combat', 'Trade'], detail: 'abandoned the job to hunt an old enemy.' },
  Cowardly: {
    triggers: ['Combat', 'Patrol'],
    detail: 'panicked and fled the system, burning reserves.',
    fuel: 'drain',
  },
  'Compulsive Gambler': {
    triggers: ['Trade'],
    detail: "gambled the day's profits away at the nearest Hangout table.",
    credits: -500,
  },
  Overcautious: {
    triggers: ['Combat', 'Travel'],
    detail: 'aborted the run at the first sensor ghost and returned to port.',
  },
  Greedy: {
    triggers: ['Trade'],
    detail: 'succumbed to greed and stole cargo from a weaker ship.',
    credits: 1000,
  },
  Reckless: {
    triggers: ['Travel', 'Combat'],
    detail: 'pushed the drives far past the safety line.',
    fuel: -100,
  },
  Miserly: {
    triggers: ['Trade'],
    detail: 'refused to spend a single credit, letting the contract lapse.',
  },
  Cruel: { triggers: ['Combat'], detail: 'kept firing long after the enemy struck their colors.' },
  'Savior Complex': {
    triggers: ['Travel', 'Patrol'],
    detail: 'dropped everything to answer a mayday no one else could hear.',
    fuel: -50,
  },
  Chaotic: {
    triggers: ['Trade', 'Travel', 'Combat', 'Patrol'],
    detail: 'did something no one could explain, least of all themselves.',
  },
  Rigid: {
    triggers: ['Trade', 'Travel'],
    detail: 'refused to deviate from the filed flight plan, whatever it cost.',
  },
  Paranoid: {
    triggers: ['Trade', 'Travel'],
    detail: 'scrapped the deal, convinced it was a setup.',
  },
  Slothful: { triggers: ['Trade', 'Patrol'], detail: 'never left the docking cradle all day.' },
  Prideful: {
    triggers: ['Combat', 'Trade'],
    detail: 'turned down good credits rather than be seen hauling junk.',
  },
  Treacherous: {
    triggers: ['Trade', 'Combat'],
    detail: 'sold out a partner mid-contract.',
    credits: 500,
  },
  Wanderlust: {
    triggers: ['Trade', 'Travel'],
    detail: 'abandoned the contract to chase an unmapped beacon.',
    fuel: -50,
  },
  Pacifist: {
    triggers: ['Combat', 'Patrol'],
    detail: 'powered down weapons and refused the engagement.',
  },
  Zealous: {
    triggers: ['Trade', 'Travel', 'Combat', 'Patrol'],
    detail: 'dropped the job to preach the Signal to anyone who would listen.',
  },
  Manipulative: {
    triggers: ['Trade'],
    detail: 'walked away owning both sides of the deal.',
    credits: 500,
  },
  Hoarder: {
    triggers: ['Trade'],
    detail: 'bought out the entire lot and sold none of it.',
    credits: -500,
  },
  Distracted: {
    triggers: ['Trade', 'Travel', 'Combat', 'Patrol'],
    detail: 'lost the whole day charting something beautiful and useless.',
  },
  Relentless: {
    triggers: ['Patrol', 'Combat'],
    detail: 'pursued a fleeing mark far beyond the patrol line.',
    fuel: -100,
  },
  Vain: {
    triggers: ['Trade', 'Combat'],
    detail: "spent the day's takings on a new hull polish.",
    credits: -300,
  },
  Enigmatic: {
    triggers: ['Travel'],
    detail: 'vanished from all traffic registers for a full day.',
  },
  Arrogant: {
    triggers: ['Combat', 'Trade'],
    detail: 'refused backup and took the hard way, on principle.',
  },
  Perfectionist: {
    triggers: ['Trade'],
    detail: 'voided the contract over a scuffed cargo pod seal.',
  },
  Possessive: {
    triggers: ['Trade', 'Combat'],
    detail: 'started a fight over salvage rights no one else claimed.',
  },
};
