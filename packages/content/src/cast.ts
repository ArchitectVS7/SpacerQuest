import { StatBlock } from './stats.js';

export interface NpcProfile {
  id: string;
  name: string;
  shipName: string;
  stats: StatBlock;
  ideal: string;
  bond: string;
  flaw: string;
  /** Resist the flaw on d20 >= flawDc (disciplined = low, volatile = high). */
  flawDc: number;
  /** Power tier: 1 = mudlark, 5 = legend (PRD §6). */
  tier: 1 | 2 | 3 | 4 | 5;
}

export const NPC_PROFILES: NpcProfile[] = [
  // The Original 20
  {
    id: 'npc-iron-vex', name: 'Iron Vex', shipName: 'Hammerfall',
    stats: { PILOT: 2, GUNS: 4, TRADE: 0, GRIT: 3, GUILE: 0 },
    ideal: 'Dominance', bond: 'Loyal to the Warlord Confed', flaw: 'Bloodthirsty',
    flawDc: 14, tier: 3,
  },
  {
    id: 'npc-silk-dagger', name: 'Silk Dagger', shipName: 'Whisper',
    stats: { PILOT: 3, GUNS: 3, TRADE: 1, GRIT: 1, GUILE: 4 },
    ideal: 'Perfection', bond: 'Loyal to the Space Dragons', flaw: 'Vengeful',
    flawDc: 12, tier: 4,
  },
  {
    id: 'npc-cargo-king', name: 'Cargo King', shipName: 'Fat Profit',
    stats: { PILOT: 1, GUNS: 0, TRADE: 5, GRIT: 1, GUILE: 2 },
    ideal: 'Wealth', bond: 'Loyal to the Astro League', flaw: 'Cowardly',
    flawDc: 13, tier: 3,
  },
  {
    id: 'npc-lucky-seven', name: 'Lucky Seven', shipName: 'Jackpot',
    stats: { PILOT: 2, GUNS: 1, TRADE: 2, GRIT: 0, GUILE: 4 },
    ideal: 'Thrill', bond: 'No loyalties, only the next hand', flaw: 'Compulsive Gambler',
    flawDc: 16, tier: 2,
  },
  {
    id: 'npc-admiral-stern', name: 'Admiral Stern', shipName: 'Iron Curtain',
    stats: { PILOT: 3, GUNS: 3, TRADE: 2, GRIT: 4, GUILE: 0 },
    ideal: 'Order', bond: 'Protects the Astro League', flaw: 'Overcautious',
    flawDc: 10, tier: 5,
  },
  {
    id: 'npc-rattlesnake', name: 'Rattlesnake', shipName: 'Fang',
    stats: { PILOT: 2, GUNS: 3, TRADE: 3, GRIT: 2, GUILE: 1 },
    ideal: 'Profit', bond: 'Loyal to the Warlord Confed', flaw: 'Greedy',
    flawDc: 14, tier: 3,
  },
  {
    id: 'npc-nova-blitz', name: 'Nova Blitz', shipName: 'Supernova',
    stats: { PILOT: 4, GUNS: 3, TRADE: 0, GRIT: 2, GUILE: 1 },
    ideal: 'Glory', bond: 'Loyal to the Rebel Alliance', flaw: 'Reckless',
    flawDc: 15, tier: 3,
  },
  {
    id: 'npc-penny-wise', name: 'Penny Wise', shipName: 'Thrift Star',
    stats: { PILOT: 1, GUNS: 0, TRADE: 4, GRIT: 2, GUILE: 2 },
    ideal: 'Efficiency', bond: 'Loyal to their credits', flaw: 'Miserly',
    flawDc: 12, tier: 2,
  },
  {
    id: 'npc-black-tide', name: 'Black Tide', shipName: 'Undertow',
    stats: { PILOT: 2, GUNS: 4, TRADE: 0, GRIT: 4, GUILE: 2 },
    ideal: 'Power', bond: 'Rules the Space Dragons', flaw: 'Cruel',
    flawDc: 12, tier: 5,
  },
  {
    id: 'npc-doc-salvage', name: 'Doc Salvage', shipName: 'Patchwork',
    stats: { PILOT: 3, GUNS: 0, TRADE: 2, GRIT: 4, GUILE: 1 },
    ideal: 'Preservation', bond: 'Loyal to the Astro League', flaw: 'Savior Complex',
    flawDc: 15, tier: 2,
  },
  {
    id: 'npc-wild-card', name: 'Wild Card', shipName: 'Chaos Theory',
    stats: { PILOT: 3, GUNS: 2, TRADE: 2, GRIT: 1, GUILE: 3 },
    ideal: 'Chaos', bond: 'Hates the Astro League', flaw: 'Chaotic',
    flawDc: 17, tier: 3,
  },
  {
    id: 'npc-frost-helm', name: 'Frost Helm', shipName: 'Glacier',
    stats: { PILOT: 3, GUNS: 2, TRADE: 3, GRIT: 3, GUILE: 0 },
    ideal: 'Logic', bond: 'Loyal to the Rebel Alliance', flaw: 'Rigid',
    flawDc: 10, tier: 3,
  },
  {
    id: 'npc-smuggler-ray', name: 'Smuggler Ray', shipName: 'Ghost Runner',
    stats: { PILOT: 4, GUNS: 1, TRADE: 3, GRIT: 0, GUILE: 4 },
    ideal: 'Freedom', bond: 'Loyal to the Space Dragons', flaw: 'Paranoid',
    flawDc: 13, tier: 3,
  },
  {
    id: 'npc-atlas-prime', name: 'Atlas Prime', shipName: 'Titan Haul',
    stats: { PILOT: 1, GUNS: 2, TRADE: 4, GRIT: 3, GUILE: 0 },
    ideal: 'Industry', bond: 'Loyal to the Warlord Confed', flaw: 'Slothful',
    flawDc: 12, tier: 3,
  },
  {
    id: 'npc-crimson-ace', name: 'Crimson Ace', shipName: 'Red Baron',
    stats: { PILOT: 5, GUNS: 4, TRADE: 0, GRIT: 2, GUILE: 1 },
    ideal: 'Excellence', bond: 'Loyal to the Rebel Alliance', flaw: 'Prideful',
    flawDc: 13, tier: 4,
  },
  {
    id: 'npc-zero-risk', name: 'Zero Risk', shipName: 'Safe Haven',
    stats: { PILOT: 2, GUNS: 1, TRADE: 4, GRIT: 1, GUILE: 2 },
    ideal: 'Survival', bond: 'Loyal to the Astro League', flaw: 'Cowardly',
    flawDc: 15, tier: 2,
  },
  {
    id: 'npc-neon-fox', name: 'Neon Fox', shipName: 'Trickster',
    stats: { PILOT: 3, GUNS: 1, TRADE: 3, GRIT: 1, GUILE: 5 },
    ideal: 'Advantage', bond: 'Loyal to no one', flaw: 'Treacherous',
    flawDc: 14, tier: 4,
  },
  {
    id: 'npc-warp-hound', name: 'Warp Hound', shipName: 'Lightchaser',
    stats: { PILOT: 5, GUNS: 0, TRADE: 1, GRIT: 3, GUILE: 1 },
    ideal: 'Discovery', bond: 'Loyal to the Rebel Alliance', flaw: 'Wanderlust',
    flawDc: 14, tier: 3,
  },
  {
    id: 'npc-gold-rush', name: 'Gold Rush', shipName: 'Vault Breaker',
    stats: { PILOT: 1, GUNS: 2, TRADE: 5, GRIT: 2, GUILE: 2 },
    ideal: 'Opulence', bond: 'Loyal to the Warlord Confed', flaw: 'Greedy',
    flawDc: 15, tier: 4,
  },
  {
    id: 'npc-stellar-monk', name: 'Stellar Monk', shipName: 'Zen Drifter',
    stats: { PILOT: 3, GUNS: 0, TRADE: 3, GRIT: 4, GUILE: 2 },
    ideal: 'Balance', bond: 'Loyal to the Space Dragons', flaw: 'Pacifist',
    flawDc: 8, tier: 3,
  },
  // The 10 New Cast Members
  {
    id: 'npc-void-whisper', name: 'Void Whisper', shipName: 'Dark Psalm',
    stats: { PILOT: 2, GUNS: 2, TRADE: 0, GRIT: 5, GUILE: 3 },
    ideal: 'Ascension', bond: 'Loyal to the Nemesis Signal', flaw: 'Zealous',
    flawDc: 14, tier: 4,
  },
  {
    id: 'npc-the-broker', name: 'The Broker', shipName: 'Information Age',
    stats: { PILOT: 1, GUNS: 0, TRADE: 5, GRIT: 1, GUILE: 5 },
    ideal: 'Knowledge', bond: 'Owns everyone\'s secrets', flaw: 'Manipulative',
    flawDc: 12, tier: 4,
  },
  {
    id: 'npc-rust-bucket', name: 'Rust Bucket', shipName: 'Junk Heap',
    stats: { PILOT: 2, GUNS: 1, TRADE: 3, GRIT: 4, GUILE: 1 },
    ideal: 'Utility', bond: 'Protects their stash', flaw: 'Hoarder',
    flawDc: 13, tier: 1,
  },
  {
    id: 'npc-star-gazer', name: 'Star Gazer', shipName: 'Observatory',
    stats: { PILOT: 4, GUNS: 0, TRADE: 1, GRIT: 2, GUILE: 1 },
    ideal: 'Truth', bond: 'Loyal to the cosmos', flaw: 'Distracted',
    flawDc: 15, tier: 1,
  },
  {
    id: 'npc-the-warden', name: 'The Warden', shipName: 'Lockdown',
    stats: { PILOT: 3, GUNS: 4, TRADE: 0, GRIT: 4, GUILE: 0 },
    ideal: 'Justice', bond: 'Hunts for the Astro League', flaw: 'Relentless',
    flawDc: 13, tier: 4,
  },
  {
    id: 'npc-nebula-rose', name: 'Nebula Rose', shipName: 'Stardust',
    stats: { PILOT: 2, GUNS: 1, TRADE: 4, GRIT: 1, GUILE: 4 },
    ideal: 'Beauty', bond: 'Loves high society', flaw: 'Vain',
    flawDc: 12, tier: 3,
  },
  {
    id: 'npc-the-phantom', name: 'The Phantom', shipName: 'Ectoplasm',
    stats: { PILOT: 5, GUNS: 2, TRADE: 0, GRIT: 3, GUILE: 4 },
    ideal: 'Mystery', bond: 'Loyal to the unknown', flaw: 'Enigmatic',
    flawDc: 10, tier: 5,
  },
  {
    id: 'npc-crash-override', name: 'Crash Override', shipName: 'Syntax Error',
    stats: { PILOT: 3, GUNS: 1, TRADE: 2, GRIT: 1, GUILE: 5 },
    ideal: 'Control', bond: 'Loyal to the datastream', flaw: 'Arrogant',
    flawDc: 13, tier: 3,
  },
  {
    id: 'npc-the-chef', name: 'The Chef', shipName: 'Bistro',
    stats: { PILOT: 2, GUNS: 1, TRADE: 4, GRIT: 3, GUILE: 2 },
    ideal: 'Flavor', bond: 'Feeds the rim', flaw: 'Perfectionist',
    flawDc: 12, tier: 2,
  },
  {
    id: 'npc-junk-lord', name: 'Junk Lord', shipName: 'Scrap Iron',
    stats: { PILOT: 1, GUNS: 3, TRADE: 3, GRIT: 4, GUILE: 1 },
    ideal: 'Possession', bond: 'Ruler of the scrap yards', flaw: 'Possessive',
    flawDc: 13, tier: 3,
  },
];
