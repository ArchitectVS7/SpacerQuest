/**
 * SpacerQuest v4.0 - Combat Display System
 *
 * Renders combat terminal screens during battles
 * Ported from original SP.FIGHT1.S / SP.FIGHT2.S
 *
 * Original screen layout:
 *   - Sensor detection alert with enemy info
 *   - Status bar: Ship Name[F:fuel]___Weaponry:[val]__Shields:[val]__B/F:[val]
 *   - Round-by-round combat log with damage reports
 *   - Post-battle summary with loot and damage totals
 */

// ============================================================================
// TYPES
// ============================================================================

export interface CombatDisplayState {
  shipName: string;
  fuel: number;
  weaponPower: number;
  shieldPower: number;
  battleFactor: number;
}

export interface RoundDisplayData {
  round: number;
  battleAdvantage: 'PLAYER' | 'ENEMY' | 'EVEN';
  playerDamageDealt: number;
  enemyDamageDealt: number;
  playerShieldHit: boolean;
  enemyShieldHit: boolean;
  combatLog: string[];
}

export interface PostBattleData {
  result: 'VICTORY' | 'DEFEAT' | 'RETREAT' | 'SURRENDER';
  rounds: number;
  playerName: string;
  playerShip: string;
  enemyName: string;
  enemyClass: string;
  lootCredits: number;
  lootFuel: number;
  damagesTaken: { component: string; conditionLost: number }[];
  scoreChange: number;
}

// ============================================================================
// ENCOUNTER ALERT
// ============================================================================

/**
 * Render the encounter detection alert
 *
 * Original from SP.FIGHT1.S:
 *   "Sensors Detect: [class] [name] commanded by [commander]"
 */
export function renderEncounterAlert(enemy: {
  enemyType: string;
  enemyClass: string;
  enemyName: string;
  enemyCommander: string;
}): string {
  const typeLabel = getEnemyTypeLabel(enemy.enemyType);
  let out = '';
  out += '\x1b[31;1m=========================================\x1b[0m\r\n';
  out += '\x1b[33;1m  !! ALERT - SENSOR DETECTION !!        \x1b[0m\r\n';
  out += '\x1b[31;1m=========================================\x1b[0m\r\n\r\n';
  out += `  \x1b[31mSensors detect ${typeLabel} vessel!\x1b[0m\r\n\r\n`;
  out += `  Class:     \x1b[37;1m${enemy.enemyClass}\x1b[0m\r\n`;
  out += `  Ship:      ${enemy.enemyName}\r\n`;
  out += `  Commander: ${enemy.enemyCommander}\r\n`;
  out += '\r\n';
  return out;
}

function getEnemyTypeLabel(type: string): string {
  switch (type) {
    case 'PIRATE': return 'Pirate';
    case 'PATROL': return 'Space Patrol';
    case 'RIM_PIRATE': return 'Rim Pirate';
    case 'BRIGAND': return 'Brigand';
    case 'REPTILOID': return 'Reptiloid';
    default: return 'Unknown';
  }
}

// ============================================================================
// BATTLE STATUS BAR
// ============================================================================

/**
 * Render the battle status bar
 *
 * Original from SP.FIGHT1.S:
 *   Ship Name[F:XXXX]___Weaponry:[XXX]__Shields:[XXX]__B/F:[XXX]
 */
export function renderBattleStatusBar(state: CombatDisplayState): string {
  let out = '';
  out += `\x1b[36m${state.shipName}\x1b[0m`;
  out += ` [F:${state.fuel}]`;
  out += `  W:${state.weaponPower}`;
  out += `  S:${state.shieldPower}`;
  out += `  B/F:${state.battleFactor}`;
  out += '\r\n';
  return out;
}

// ============================================================================
// COMBAT ROUND DISPLAY
// ============================================================================

/**
 * Render a single combat round
 *
 * Original from SP.FIGHT1.S:
 *   "Round # N......Battle Advantage: [ship]"
 *   "Speed Advantage: [ship]"
 *   Damage notifications
 */
export function renderCombatRound(round: RoundDisplayData): string {
  const advantage = round.battleAdvantage === 'PLAYER' ? 'You' :
                    round.battleAdvantage === 'ENEMY' ? 'Enemy' : 'Even';

  let out = '';
  out += `\r\n\x1b[33mRound #${round.round}\x1b[0m - Battle Advantage: \x1b[37;1m${advantage}\x1b[0m\r\n`;

  for (const msg of round.combatLog) {
    out += `  ${msg}\r\n`;
  }

  if (round.playerShieldHit) {
    out += '  \x1b[36mYour shields absorb incoming fire\x1b[0m\r\n';
  }
  if (round.enemyShieldHit) {
    out += '  \x1b[36mEnemy shields deflect your attack\x1b[0m\r\n';
  }

  return out;
}

// ============================================================================
// COMBAT ACTIONS
// ============================================================================

/**
 * Render combat action choices
 *
 * Original from SP.FIGHT1.S:
 *   "Continue Attack? (Y)/(N):"
 *   Retreat/Surrender options
 */
export function renderCombatActions(hasCloaker: boolean): string {
  let out = '';
  out += '\x1b[37;1m-----------------------------------------\x1b[0m\r\n';
  out += '  (A) Continue Attack\r\n';
  out += '  (R) Attempt Retreat\r\n';
  out += '  (S) Surrender / Pay Tribute\r\n';
  if (hasCloaker) {
    out += '  (C) Activate Cloaker\r\n';
  }
  out += '\x1b[37;1m-----------------------------------------\x1b[0m\r\n';
  out += '\x1b[32mCombat Action:\x1b[0m ';
  return out;
}

// ============================================================================
// DAMAGE REPORT
// ============================================================================

/**
 * Render damage report for components hit
 *
 * Original from SP.FIGHT2.S:
 *   Lists each component that was damaged with asterisk notation
 */
export function renderDamageReport(
  damages: { component: string; conditionLost: number }[]
): string {
  if (damages.length === 0) {
    return '  \x1b[32mAll systems intact - no damage taken.\x1b[0m\r\n';
  }

  let out = '  \x1b[31mDamage Report:\x1b[0m\r\n';
  for (const d of damages) {
    out += `    \x1b[31m*\x1b[0m ${d.component}: -${d.conditionLost} condition\r\n`;
  }
  return out;
}

// ============================================================================
// POST-BATTLE SUMMARY
// ============================================================================

/**
 * Render the post-battle summary screen
 *
 * Original from SP.FIGHT2.S:
 *   Battle result, rounds fought, loot/damage summary, score change
 */
export function renderPostBattleSummary(data: PostBattleData): string {
  let out = '';
  out += '\x1b[36;1m=========================================\x1b[0m\r\n';

  switch (data.result) {
    case 'VICTORY':
      out += '\x1b[32;1m  VICTORY!\x1b[0m\r\n';
      break;
    case 'DEFEAT':
      out += '\x1b[31;1m  DEFEAT - You have lost the battle.\x1b[0m\r\n';
      break;
    case 'RETREAT':
      out += '\x1b[33;1m  RETREAT - You escaped the battle.\x1b[0m\r\n';
      break;
    case 'SURRENDER':
      out += '\x1b[33;1m  SURRENDER - Tribute paid.\x1b[0m\r\n';
      break;
  }

  out += '\x1b[36;1m=========================================\x1b[0m\r\n\r\n';

  out += `  ${data.playerName} (${data.playerShip}) vs ${data.enemyName} (${data.enemyClass})\r\n`;
  out += `  Rounds: ${data.rounds}\r\n\r\n`;

  if (data.lootCredits > 0) {
    out += `  \x1b[32mLoot: ${data.lootCredits} credits\x1b[0m\r\n`;
  }
  if (data.lootFuel > 0) {
    out += `  \x1b[32mSalvaged Fuel: ${data.lootFuel} units\x1b[0m\r\n`;
  }

  out += '\r\n';
  out += renderDamageReport(data.damagesTaken);

  out += `\r\n  Score: ${data.scoreChange >= 0 ? '+' : ''}${data.scoreChange}\r\n`;

  out += '\x1b[36;1m=========================================\x1b[0m\r\n';
  return out;
}
