/**
 * SpacerQuest v4.0 - Bot Profiles
 *
 * 20 scripted AI characters with distinct personalities and strategies.
 * Alliance distribution: 4 ASTRO_LEAGUE, 4 SPACE_DRAGONS, 4 WARLORD_CONFED, 4 REBEL_ALLIANCE, 4 NONE.
 */

import { AllianceType } from '@prisma/client';
import { BotProfile } from './types.js';

const FIGHTER_UPGRADES = ['WEAPONS', 'SHIELDS', 'HULL', 'DRIVES', 'ROBOTICS', 'LIFE_SUPPORT', 'NAVIGATION', 'CABIN'] as const;
const TRADER_UPGRADES = ['HULL', 'DRIVES', 'CABIN', 'NAVIGATION', 'SHIELDS', 'LIFE_SUPPORT', 'ROBOTICS', 'WEAPONS'] as const;
const CAUTIOUS_UPGRADES = ['SHIELDS', 'HULL', 'LIFE_SUPPORT', 'DRIVES', 'NAVIGATION', 'WEAPONS', 'ROBOTICS', 'CABIN'] as const;
const BALANCED_UPGRADES = ['DRIVES', 'WEAPONS', 'SHIELDS', 'HULL', 'NAVIGATION', 'LIFE_SUPPORT', 'ROBOTICS', 'CABIN'] as const;

export const BOT_PROFILES: BotProfile[] = [
  {
    slug: 'iron-vex', name: 'Iron Vex', shipName: 'Hammerfall',
    description: 'Berserker',
    preferredAlliance: AllianceType.WARLORD_CONFED,
    aggression: 0.95, greed: 0.4, caution: 0.2, gamblingLust: 0.1, tradeFocus: 0.2, upgradePriority: 0.7,
    upgradeOrder: [...FIGHTER_UPGRADES],
    combatRetreatThreshold: 0.3,
  },
  {
    slug: 'silk-dagger', name: 'Silk Dagger', shipName: 'Whisper',
    description: 'Stealth Assassin',
    preferredAlliance: AllianceType.SPACE_DRAGONS,
    aggression: 0.8, greed: 0.6, caution: 0.5, gamblingLust: 0.2, tradeFocus: 0.3, upgradePriority: 0.6,
    upgradeOrder: [...FIGHTER_UPGRADES],
    combatRetreatThreshold: 0.5,
  },
  {
    slug: 'cargo-king', name: 'Cargo King', shipName: 'Fat Profit',
    description: 'Pure Trader',
    preferredAlliance: AllianceType.ASTRO_LEAGUE,
    aggression: 0.1, greed: 0.3, caution: 0.8, gamblingLust: 0.1, tradeFocus: 0.95, upgradePriority: 0.5,
    upgradeOrder: [...TRADER_UPGRADES],
    combatRetreatThreshold: 0.8,
  },
  {
    slug: 'lucky-seven', name: 'Lucky Seven', shipName: 'Jackpot',
    description: 'Gambler',
    preferredAlliance: AllianceType.NONE,
    aggression: 0.3, greed: 0.9, caution: 0.2, gamblingLust: 0.95, tradeFocus: 0.3, upgradePriority: 0.2,
    upgradeOrder: [...BALANCED_UPGRADES],
    combatRetreatThreshold: 0.6,
  },
  {
    slug: 'admiral-stern', name: 'Admiral Stern', shipName: 'Iron Curtain',
    description: 'Cautious Commander',
    preferredAlliance: AllianceType.ASTRO_LEAGUE,
    aggression: 0.4, greed: 0.2, caution: 0.95, gamblingLust: 0.05, tradeFocus: 0.6, upgradePriority: 0.9,
    upgradeOrder: [...CAUTIOUS_UPGRADES],
    combatRetreatThreshold: 0.7,
  },
  {
    slug: 'rattlesnake', name: 'Rattlesnake', shipName: 'Fang',
    description: 'Aggressive Trader',
    preferredAlliance: AllianceType.WARLORD_CONFED,
    aggression: 0.7, greed: 0.7, caution: 0.4, gamblingLust: 0.3, tradeFocus: 0.7, upgradePriority: 0.5,
    upgradeOrder: [...BALANCED_UPGRADES],
    combatRetreatThreshold: 0.5,
  },
  {
    slug: 'nova-blitz', name: 'Nova Blitz', shipName: 'Supernova',
    description: 'Glory Seeker',
    preferredAlliance: AllianceType.REBEL_ALLIANCE,
    aggression: 0.85, greed: 0.5, caution: 0.3, gamblingLust: 0.4, tradeFocus: 0.2, upgradePriority: 0.8,
    upgradeOrder: [...FIGHTER_UPGRADES],
    combatRetreatThreshold: 0.4,
  },
  {
    slug: 'penny-wise', name: 'Penny Wise', shipName: 'Thrift Star',
    description: 'Miser',
    preferredAlliance: AllianceType.NONE,
    aggression: 0.2, greed: 0.1, caution: 0.9, gamblingLust: 0, tradeFocus: 0.8, upgradePriority: 0.7,
    upgradeOrder: [...CAUTIOUS_UPGRADES],
    combatRetreatThreshold: 0.8,
  },
  {
    slug: 'black-tide', name: 'Black Tide', shipName: 'Undertow',
    description: 'Pirate Lord',
    preferredAlliance: AllianceType.SPACE_DRAGONS,
    aggression: 0.9, greed: 0.8, caution: 0.3, gamblingLust: 0.3, tradeFocus: 0.1, upgradePriority: 0.6,
    upgradeOrder: [...FIGHTER_UPGRADES],
    combatRetreatThreshold: 0.35,
  },
  {
    slug: 'doc-salvage', name: 'Doc Salvage', shipName: 'Patchwork',
    description: 'Rescue Specialist',
    preferredAlliance: AllianceType.ASTRO_LEAGUE,
    aggression: 0.3, greed: 0.3, caution: 0.7, gamblingLust: 0.1, tradeFocus: 0.5, upgradePriority: 0.8,
    upgradeOrder: [...CAUTIOUS_UPGRADES],
    combatRetreatThreshold: 0.6,
  },
  {
    slug: 'wild-card', name: 'Wild Card', shipName: 'Chaos Theory',
    description: 'Unpredictable',
    preferredAlliance: AllianceType.NONE,
    aggression: 0.5, greed: 0.5, caution: 0.5, gamblingLust: 0.7, tradeFocus: 0.5, upgradePriority: 0.5,
    upgradeOrder: [...BALANCED_UPGRADES],
    combatRetreatThreshold: 0.5,
  },
  {
    slug: 'frost-helm', name: 'Frost Helm', shipName: 'Glacier',
    description: 'Methodical',
    preferredAlliance: AllianceType.REBEL_ALLIANCE,
    aggression: 0.5, greed: 0.3, caution: 0.85, gamblingLust: 0.1, tradeFocus: 0.7, upgradePriority: 0.9,
    upgradeOrder: [...CAUTIOUS_UPGRADES],
    combatRetreatThreshold: 0.7,
  },
  {
    slug: 'smuggler-ray', name: 'Smuggler Ray', shipName: 'Ghost Runner',
    description: 'Smuggler',
    preferredAlliance: AllianceType.SPACE_DRAGONS,
    aggression: 0.4, greed: 0.9, caution: 0.4, gamblingLust: 0.4, tradeFocus: 0.6, upgradePriority: 0.4,
    upgradeOrder: [...BALANCED_UPGRADES],
    combatRetreatThreshold: 0.55,
  },
  {
    slug: 'atlas-prime', name: 'Atlas Prime', shipName: 'Titan Haul',
    description: 'Heavy Hauler',
    preferredAlliance: AllianceType.WARLORD_CONFED,
    aggression: 0.3, greed: 0.4, caution: 0.7, gamblingLust: 0.1, tradeFocus: 0.9, upgradePriority: 0.6,
    upgradeOrder: [...TRADER_UPGRADES],
    combatRetreatThreshold: 0.7,
  },
  {
    slug: 'crimson-ace', name: 'Crimson Ace', shipName: 'Red Baron',
    description: 'Duelist',
    preferredAlliance: AllianceType.REBEL_ALLIANCE,
    aggression: 0.9, greed: 0.5, caution: 0.4, gamblingLust: 0.5, tradeFocus: 0.2, upgradePriority: 0.7,
    upgradeOrder: [...FIGHTER_UPGRADES],
    combatRetreatThreshold: 0.4,
  },
  {
    slug: 'zero-risk', name: 'Zero Risk', shipName: 'Safe Haven',
    description: 'Ultra-Cautious',
    preferredAlliance: AllianceType.ASTRO_LEAGUE,
    aggression: 0.1, greed: 0.1, caution: 0.95, gamblingLust: 0, tradeFocus: 0.9, upgradePriority: 0.95,
    upgradeOrder: [...CAUTIOUS_UPGRADES],
    combatRetreatThreshold: 0.9,
  },
  {
    slug: 'neon-fox', name: 'Neon Fox', shipName: 'Trickster',
    description: 'Opportunist',
    preferredAlliance: AllianceType.NONE,
    aggression: 0.6, greed: 0.7, caution: 0.5, gamblingLust: 0.6, tradeFocus: 0.6, upgradePriority: 0.4,
    upgradeOrder: [...BALANCED_UPGRADES],
    combatRetreatThreshold: 0.5,
  },
  {
    slug: 'warp-hound', name: 'Warp Hound', shipName: 'Lightchaser',
    description: 'Explorer',
    preferredAlliance: AllianceType.REBEL_ALLIANCE,
    aggression: 0.5, greed: 0.4, caution: 0.6, gamblingLust: 0.2, tradeFocus: 0.4, upgradePriority: 0.6,
    upgradeOrder: [...BALANCED_UPGRADES],
    combatRetreatThreshold: 0.55,
  },
  {
    slug: 'gold-rush', name: 'Gold Rush', shipName: 'Vault Breaker',
    description: 'Credit Maximizer',
    preferredAlliance: AllianceType.WARLORD_CONFED,
    aggression: 0.4, greed: 0.85, caution: 0.5, gamblingLust: 0.5, tradeFocus: 0.8, upgradePriority: 0.5,
    upgradeOrder: [...TRADER_UPGRADES],
    combatRetreatThreshold: 0.6,
  },
  {
    slug: 'stellar-monk', name: 'Stellar Monk', shipName: 'Zen Drifter',
    description: 'Balanced Sage',
    preferredAlliance: AllianceType.SPACE_DRAGONS,
    aggression: 0.5, greed: 0.3, caution: 0.7, gamblingLust: 0.2, tradeFocus: 0.5, upgradePriority: 0.7,
    upgradeOrder: [...BALANCED_UPGRADES],
    combatRetreatThreshold: 0.6,
  },
];

export function getProfileBySlug(slug: string): BotProfile | undefined {
  return BOT_PROFILES.find(p => p.slug === slug);
}

export function getProfileForBot(botName: string): BotProfile | undefined {
  // Bot display names are "[BOT] Name" — extract name and match
  const name = botName.replace('[BOT] ', '');
  return BOT_PROFILES.find(p => p.name === name);
}
