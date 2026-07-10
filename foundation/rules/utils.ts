/**
 * SpacerQuest v4.0 - Utility Functions
 * 
 * Core utility functions used throughout the game
 */

import { Rank, AllianceType } from '@prisma/client';
import {
  RANK_HONORARIA,
  ALLIANCE_SYMBOLS,
  NAME_MIN_LENGTH,
  NAME_MAX_LENGTH,
  RESERVED_PREFIXES,
  RESERVED_SUFFIXES,
} from './constants.js';

// ============================================================================
// CREDIT HANDLING
// ============================================================================

/**
 * Convert credits to display string (handles high/low split)
 * Original: g$=str$(g2):if g1 g$=str$(g1)+right$("000"+str$(g2),4)
 */
export function formatCredits(high: number, low: number): string {
  if (high <= 0) {
    return low.toString();
  }
  return `${high},${String(low).padStart(4, '0')}`;
}

/**
 * Add credits to high/low split
 */
export function addCredits(
  high: number,
  low: number,
  amount: number
): { high: number; low: number } {
  let newHigh = high;
  let newLow = low + amount;
  
  while (newLow >= 10000) {
    newHigh++;
    newLow -= 10000;
  }
  
  return { high: newHigh, low: newLow };
}

/**
 * Subtract credits from high/low split
 */
export function subtractCredits(
  high: number,
  low: number,
  amount: number
): { high: number; low: number; success: boolean } {
  let total = high * 10000 + low;
  
  if (total < amount) {
    return { high, low, success: false };
  }
  
  total -= amount;
  const newHigh = Math.floor(total / 10000);
  const newLow = total % 10000;
  
  return { high: newHigh, low: newLow, success: true };
}

/**
 * Get total credits as single number
 */
export function getTotalCredits(high: number, low: number): number {
  return high * 10000 + low;
}

// ============================================================================
// RANK SYSTEM
// ============================================================================

/**
 * Calculate rank from score
 *
 * Source formula: sc = floor(score/150), rank fires at sc > N
 * Thresholds (score): Lieutenant=0, Commander=150, Captain=300,
 * Commodore=450, Admiral=750, Top Dog=1200, Grand Mufti=1650,
 * Mega Hero=2250, Giga Hero=2700.
 */
export function calculateRank(score: number): Rank {
  if (score >= 2700) return Rank.GIGA_HERO;
  if (score >= 2250) return Rank.MEGA_HERO;
  if (score >= 1650) return Rank.GRAND_MUFTI;
  if (score >= 1200) return Rank.TOP_DOG;
  if (score >= 750) return Rank.ADMIRAL;
  if (score >= 450) return Rank.COMMODORE;
  if (score >= 300) return Rank.CAPTAIN;
  if (score >= 150) return Rank.COMMANDER;
  return Rank.LIEUTENANT;
}

/**
 * Get honorarium amount for rank
 */
export function getHonorarium(rank: Rank): number {
  return RANK_HONORARIA[rank as keyof typeof RANK_HONORARIA] || 0;
}

/**
 * Get rank index for comparison
 */
export function getRankIndex(rank: Rank): number {
  const ranks = Object.values(Rank);
  return ranks.indexOf(rank);
}

// ============================================================================
// ALLIANCE HANDLING
// ============================================================================

/**
 * Get alliance symbol character
 */
export function getAllianceSymbol(alliance: AllianceType): string {
  return ALLIANCE_SYMBOLS[alliance as keyof typeof ALLIANCE_SYMBOLS] || '';
}

/**
 * Append alliance symbol to name
 */
export function appendAllianceSymbol(name: string, alliance: AllianceType): string {
  const symbol = getAllianceSymbol(alliance);
  if (!symbol) return name;
  return `${name}-${symbol}`;
}

/**
 * Remove alliance symbol from name
 */
export function removeAllianceSymbol(name: string): string {
  return name.replace(/[-+@&^]$/, '');
}

// ============================================================================
// NAME VALIDATION
// ============================================================================

/**
 * Validate character/ship name
 */
export function validateName(name: string): { valid: boolean; error?: string } {
  if (!name || name.length < NAME_MIN_LENGTH) {
    return { valid: false, error: `Name must be at least ${NAME_MIN_LENGTH} characters` };
  }
  
  if (name.length > NAME_MAX_LENGTH) {
    return { valid: false, error: `Name must be no more than ${NAME_MAX_LENGTH} characters` };
  }
  
  const upperName = name.toUpperCase();
  for (const prefix of RESERVED_PREFIXES) {
    if (upperName.startsWith(prefix)) {
      return { valid: false, error: `Name cannot start with '${prefix}'` };
    }
  }

  for (const suffix of RESERVED_SUFFIXES) {
    if (upperName.endsWith(suffix)) {
      return { valid: false, error: `Name cannot end with '${suffix}'` };
    }
  }

  return { valid: true };
}

// ============================================================================
// DISTANCE CALCULATION
// ============================================================================

/**
 * Calculate distance between two star systems
 * Original: if sp>x y=(sp-x): if sp<x y=(x-sp)
 */
export function calculateDistance(origin: number, destination: number): number {
  if (origin === destination) return 1;
  return Math.abs(destination - origin);
}

// ============================================================================
// RANDOM UTILITIES
// ============================================================================

/**
 * Roll a d100 (percentile dice)
 */
export function rollD100(): number {
  return Math.floor(Math.random() * 100) + 1;
}

/**
 * Roll dice with specified sides
 */
export function rollDice(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

/**
 * Check if event occurs based on probability
 */
export function checkProbability(chance: number): boolean {
  return Math.random() < chance;
}

/**
 * Random integer between min and max (inclusive)
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ============================================================================
// TIME UTILITIES
// ============================================================================

/**
 * Get current date string (MM/DD/YY format like original)
 */
export function getDateString(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const year = String(now.getFullYear()).slice(-2);
  return `${month}/${day}/${year}`;
}

/**
 * Get current time string (HH:MM:SS format)
 */
export function getTimeString(): string {
  const now = new Date();
  return now.toTimeString().split(' ')[0];
}

/**
 * Check if date has changed (for daily reset)
 */
export function isDayDifferent(date1: Date | null, date2: Date = new Date()): boolean {
  if (!date1) return true;
  
  return date1.getDate() !== date2.getDate() ||
         date1.getMonth() !== date2.getMonth() ||
         date1.getFullYear() !== date2.getFullYear();
}

// ============================================================================
// COMPONENT UTILITIES
// ============================================================================

/**
 * Calculate component power (strength × condition)
 */
export function calculateComponentPower(strength: number, condition: number): number {
  if (strength < 1 || condition < 1) return 0;
  return strength * condition;
}

/**
 * Calculate damage percentage from condition
 * Original: x=10-(x+1): x=x*10
 */
export function calculateDamagePercent(condition: number): number {
  const damage = 10 - (condition + 1);
  return damage * 10;
}

/**
 * Get condition from damage percentage
 */
export function conditionFromDamage(damagePercent: number): number {
  return Math.max(0, 9 - Math.floor(damagePercent / 10));
}

// ============================================================================
// FORMATTING
// ============================================================================

/**
 * Pad string to fixed width (for terminal display)
 */
export function padString(str: string, length: number, char: string = ' '): string {
  if (str.length >= length) return str;
  return str + char.repeat(length - str.length);
}

/**
 * Center string in fixed width
 */
export function centerString(str: string, length: number, char: string = ' '): string {
  const padding = length - str.length;
  const leftPad = Math.floor(padding / 2);
  const rightPad = padding - leftPad;
  return char.repeat(leftPad) + str + char.repeat(rightPad);
}

/**
 * Truncate string with ellipsis
 */
export function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

// ============================================================================
// ASCII ART UTILITIES
// ============================================================================

/**
 * Create horizontal line
 */
export function horizontalLine(char: string, length: number): string {
  return char.repeat(length);
}

/**
 * Create box border
 */
export function createBoxBorder(width: number, char: string = '-'): string {
  return char.repeat(width);
}
