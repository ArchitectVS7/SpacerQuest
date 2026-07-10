/**
 * SpacerQuest v4.0 - Rescue Service System
 *
 * Implements the rescue service for lost ships
 * Ported from original SP.REG.S lines 368-415
 *
 * Original mechanics:
 *   - Lost ships appear in rescue registry
 *   - Rescuer needs 50+ fuel
 *   - Rescuer cannot be lost themselves
 *   - Rescue pays 1000 cr from Rescue Service
 *   - Rescuer gains +11 score points
 *   - 50 fuel consumed
 */

import {
  RESCUE_FEE,
  RESCUE_FUEL_COST,
  RESCUE_POINTS_BONUS,
} from '../constants';

// ============================================================================
// TYPES
// ============================================================================

export interface LostShip {
  id: string;
  name: string;
  shipName: string;
  lostLocation: number;
  lostAt: Date;
}

export interface RescueValidation {
  canRescue: boolean;
  reason?: string;
}

export interface RescueRewards {
  creditsFee: number;
  fuelCost: number;
  scoreBonus: number;
}

// ============================================================================
// RESCUE VALIDATION
// ============================================================================

/**
 * Validate that a player can perform a rescue
 *
 * Original from SP.REG.S:
 *   - Must have 50+ fuel
 *   - Must not be lost themselves
 */
export function validateRescueAttempt(rescuer: {
  fuel: number;
  isLost: boolean;
}): RescueValidation {
  if (rescuer.isLost) {
    return {
      canRescue: false,
      reason: 'You are lost in space yourself! Cannot rescue others.',
    };
  }

  if (rescuer.fuel < RESCUE_FUEL_COST) {
    return {
      canRescue: false,
      reason: `Need at least ${RESCUE_FUEL_COST} fuel units for rescue (have ${rescuer.fuel})`,
    };
  }

  return { canRescue: true };
}

// ============================================================================
// RESCUE REWARDS
// ============================================================================

/**
 * Calculate rescue rewards
 *
 * Original from SP.REG.S:
 *   g2=g2+1000  (1000 cr from Rescue Service)
 *   s2=s2+11    (+11 score points)
 *   f1=f1-50    (-50 fuel consumed)
 *   b1=b1+1     (+1 rescue count)
 */
export function calculateRescueRewards(): RescueRewards {
  return {
    creditsFee: RESCUE_FEE,
    fuelCost: RESCUE_FUEL_COST,
    scoreBonus: RESCUE_POINTS_BONUS,
  };
}

// ============================================================================
// RESCUE SCREEN RENDERER
// ============================================================================

/**
 * Render the rescue service terminal screen
 *
 * Original from SP.REG.S:
 *   Lists lost ships with format: [#]. [name] Lost near [system]
 *   Shows rescue fee and instructions
 */
export function renderRescueScreen(lostShips: LostShip[], _rescuerName: string): string {
  let output = '';

  output += '\x1b[36;1m=========================================\x1b[0m\r\n';
  output += '\x1b[33;1m         RESCUE SERVICE                  \x1b[0m\r\n';
  output += '\x1b[36;1m=========================================\x1b[0m\r\n\r\n';

  if (lostShips.length === 0) {
    output += '\x1b[32mNo lost ships reported. All spacers accounted for.\x1b[0m\r\n';
    return output;
  }

  output += `\x1b[37mSalvage fee: ${RESCUE_FEE} cr (paid by Rescue Service)\x1b[0m\r\n`;
  output += `\x1b[37mFuel required: ${RESCUE_FUEL_COST} units\x1b[0m\r\n`;
  output += `\x1b[37mScore bonus: +${RESCUE_POINTS_BONUS} points\x1b[0m\r\n\r\n`;

  output += '\x1b[33mLost Ships:\x1b[0m\r\n';
  output += '\x1b[36m-----------------------------------------\x1b[0m\r\n';

  lostShips.forEach((ship, index) => {
    output += `  ${index + 1}. \x1b[37;1m${ship.name}\x1b[0m`;
    output += ` (${ship.shipName})`;
    output += ` - Lost near system ${ship.lostLocation}\r\n`;
  });

  output += '\x1b[36m-----------------------------------------\x1b[0m\r\n';
  output += '\r\nEnter # of spacer to rescue, or [Q]uit: ';

  return output;
}
