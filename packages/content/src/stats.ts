export enum Stat {
  PILOT = 'PILOT',
  GUNS = 'GUNS',
  TRADE = 'TRADE',
  GRIT = 'GRIT',
  GUILE = 'GUILE'
}

export type StatBlock = Record<Stat, number>;

export interface CharacterSheet {
  stats: StatBlock;
  ideal: string;
  bond: string;
  flaw: string;
  flawDc: number; // Mechanical DC for flaw checks
  tier: 1 | 2 | 3 | 4 | 5; // Power tier (1=mudlark, 5=legend)
}
