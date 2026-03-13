/**
 * SpacerQuest v4.0 - Utility Functions
 *
 * Core utility functions used throughout the game
 */
import { Rank, AllianceType } from '@prisma/client';
/**
 * Convert credits to display string (handles high/low split)
 * Original: g$=str$(g2):if g1 g$=str$(g1)+right$("000"+str$(g2),4)
 */
export declare function formatCredits(high: number, low: number): string;
/**
 * Add credits to high/low split
 */
export declare function addCredits(high: number, low: number, amount: number): {
    high: number;
    low: number;
};
/**
 * Subtract credits from high/low split
 */
export declare function subtractCredits(high: number, low: number, amount: number): {
    high: number;
    low: number;
    success: boolean;
};
/**
 * Get total credits as single number
 */
export declare function getTotalCredits(high: number, low: number): number;
/**
 * Calculate rank from score
 *
 * Original PRD thresholds:
 * - Lieutenant: 0
 * - Commander: 150
 * - Captain: 300
 * - Commodore: 450
 * - Admiral: 600
 * - Top Dog: 900
 * - Grand Mufti: 1100
 * - Mega Hero: 1350
 * - Giga Hero: 2700
 */
export declare function calculateRank(score: number): Rank;
/**
 * Get honorarium amount for rank
 */
export declare function getHonorarium(rank: Rank): number;
/**
 * Get rank index for comparison
 */
export declare function getRankIndex(rank: Rank): number;
/**
 * Get alliance symbol character
 */
export declare function getAllianceSymbol(alliance: AllianceType): string;
/**
 * Append alliance symbol to name
 */
export declare function appendAllianceSymbol(name: string, alliance: AllianceType): string;
/**
 * Remove alliance symbol from name
 */
export declare function removeAllianceSymbol(name: string): string;
/**
 * Validate character/ship name
 */
export declare function validateName(name: string): {
    valid: boolean;
    error?: string;
};
/**
 * Calculate distance between two star systems
 * Original: if sp>x y=(sp-x): if sp<x y=(x-sp)
 */
export declare function calculateDistance(origin: number, destination: number): number;
/**
 * Roll a d100 (percentile dice)
 */
export declare function rollD100(): number;
/**
 * Roll dice with specified sides
 */
export declare function rollDice(sides: number): number;
/**
 * Check if event occurs based on probability
 */
export declare function checkProbability(chance: number): boolean;
/**
 * Random integer between min and max (inclusive)
 */
export declare function randomInt(min: number, max: number): number;
/**
 * Get current date string (MM/DD/YY format like original)
 */
export declare function getDateString(): string;
/**
 * Get current time string (HH:MM:SS format)
 */
export declare function getTimeString(): string;
/**
 * Check if date has changed (for daily reset)
 */
export declare function isDayDifferent(date1: Date | null, date2?: Date): boolean;
/**
 * Calculate component power (strength × condition)
 */
export declare function calculateComponentPower(strength: number, condition: number): number;
/**
 * Calculate damage percentage from condition
 * Original: x=10-(x+1): x=x*10
 */
export declare function calculateDamagePercent(condition: number): number;
/**
 * Get condition from damage percentage
 */
export declare function conditionFromDamage(damagePercent: number): number;
/**
 * Pad string to fixed width (for terminal display)
 */
export declare function padString(str: string, length: number, char?: string): string;
/**
 * Center string in fixed width
 */
export declare function centerString(str: string, length: number, char?: string): string;
/**
 * Truncate string with ellipsis
 */
export declare function truncateString(str: string, maxLength: number): string;
/**
 * Create horizontal line
 */
export declare function horizontalLine(char: string, length: number): string;
/**
 * Create box border
 */
export declare function createBoxBorder(width: number, char?: string): string;
//# sourceMappingURL=utils.d.ts.map