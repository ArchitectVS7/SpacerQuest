/**
 * SpacerQuest v4.0 - SP.MAL Battle Engine
 *
 * Pure simulation of the SP.MAL.S combat engine for special missions:
 *   kk=3 (missionType=3) = Maligna (red star siege)
 *   kk=4 (missionType=4) = Star System Raid (alliance conquest)
 *   kk=9 (missionType=9) = Nemesis battle
 *
 * All formulas are direct translations from SP.MAL.S.
 *
 * === BATTLE OVERVIEW ===
 *
 * Each round (armvar):
 *   1. Calculate penetration: wj = max(0, player_weapon - enemy_shields)
 *   2. Player attacks (malbegin/fbegin): consume fuel, damage enemy shields/layers
 *   3. Enemy counterattacks (malfite): damage player shields/components
 *   4. Check victory: battle ends when enemy innerShield2 (s9) <= 0 (player wins)
 *      or player lifeSupport (l2) <= 0 (player loses)
 *
 * Deviation: original had interactive Y/N prompts for kk=4/9 per round.
 * Web version runs all rounds automatically (kk=3 already auto-ran in original).
 */

export type MalignaMissionType = 3 | 4 | 9;  // Maligna | Raid | Nemesis

// ============================================================================
// ENEMY PARAMETERS
// ============================================================================

export interface EnemyBattleParams {
  weaponStrength: number;    // p7
  weaponCondition: number;   // p8 (charge)
  shieldStrength: number;    // s7
  shieldCondition: number;   // s8
  innerShield1: number;      // p9
  innerShield2: number;      // s9 — reaches 0 = player wins
  fuel: number;              // p6
  name: string;              // p5$
}

/**
 * Initialize enemy battle parameters by mission type.
 * SP.MAL.S lines 57-79.
 *
 * @param missionType 3=Maligna, 4=Raid, 9=Nemesis
 * @param defconLevel Star system DEFCON level (for missionType=4 raids; o7 in original)
 */
export function initEnemyStats(missionType: MalignaMissionType, defconLevel = 1): EnemyBattleParams {
  if (missionType === 3) {
    // SP.MAL.S lines 73-74: Maligna (red star)
    return { weaponStrength: 10, weaponCondition: 60, shieldStrength: 10, shieldCondition: 15, innerShield1: 12, innerShield2: 12, fuel: 2000, name: 'MALIGNA' };
  }
  if (missionType === 9) {
    // SP.MAL.S lines 77-78: Nemesis
    return { weaponStrength: 25, weaponCondition: 10, shieldStrength: 25, shieldCondition: 10, innerShield1: 30, innerShield2: 40, fuel: 2000, name: 'NEMESIS' };
  }
  // missionType === 4: Star System Raid — SP.MAL.S lines 58-59
  // o7 = defconLevel; if o7<1: use minimum stats
  const o7 = Math.max(0, defconLevel);
  if (o7 < 1) {
    return { weaponStrength: 1, weaponCondition: 10, shieldStrength: 1, shieldCondition: 10, innerShield1: 9, innerShield2: 9, fuel: 100, name: 'STAR SYSTEM' };
  }
  return {
    weaponStrength: 10 * o7,
    weaponCondition: 10,
    shieldStrength: 10 * o7,
    shieldCondition: 10,
    innerShield1: 9,
    innerShield2: 9,
    fuel: o7 * 100,
    name: 'STAR SYSTEM',
  };
}

// ============================================================================
// PLAYER WEAPON / SHIELD EFFECTIVENESS
// ============================================================================

/**
 * Calculate player weapon effectiveness (k8, x8).
 * SP.MAL.S lines 82-83, 87.
 *
 * k8 = w1 + 18 if STAR-BUSTER (line 82)
 * k8 += 150 if alien-enhanced weapon (left$(w1$,1)="?") (line 83)
 * x8 = k8 * w2 (if both > 0) (line 87)
 */
export function calcPlayerWeapon(weaponStrength: number, weaponCondition: number, hasStarBuster: boolean, hasWeaponMark = false): { k8: number; x8: number } {
  let k8 = weaponStrength;
  if (hasStarBuster) k8 = weaponStrength + 18;  // SP.MAL.S line 82
  if (hasWeaponMark) k8 = k8 + 150;            // SP.MAL.S line 83: if left$(w1$,1)="?" k8=(k8+150)
  const x8 = k8 > 0 && weaponCondition > 0 ? k8 * weaponCondition : k8;  // line 87
  return { k8, x8 };
}

/**
 * Calculate player shield effectiveness (k9, x9).
 * SP.MAL.S lines 84, 88.
 *
 * k9 = p1 + 18 if ARCH-ANGEL++
 * x9 = k9 * p2 (if both > 0)
 */
export function calcPlayerShield(shieldStrength: number, shieldCondition: number, hasArchAngel: boolean): { k9: number; x9: number } {
  let k9 = shieldStrength;
  if (hasArchAngel) k9 = shieldStrength + 18;  // SP.MAL.S line 84
  const x9 = k9 > 0 && shieldCondition > 0 ? k9 * shieldCondition : k9;  // line 88
  return { k9, x9 };
}

// ============================================================================
// BATTLE RESULT
// ============================================================================

export interface MalignaBattleResult {
  playerWon: boolean;   // true when s9 <= 0 (mallose)
  playerLost: boolean;  // true when l2 <= 0 (malwin)
  rounds: number;       // kg

  // Final player state for DB update
  fuelRemaining: number;
  lifeSupportCond: number;    // l2
  cargoPods: number;          // s1
  driveCondition: number;     // d2
  cabinCondition: number;     // c2
  navigationCondition: number; // n2
  roboticsCondition: number;  // r2
  hullCondition: number;      // h2
  weaponEffective: number;    // final x8 (used to back-calc w2)
  shieldEffective: number;    // final x9 (used to back-calc p2)

  // Derived final weapon/shield conditions from mc5 recalculation
  finalWeaponCondition: number; // w2
  finalShieldCondition: number; // p2
  weaponDestroyed: boolean;     // w1$=jk$
  shieldDestroyed: boolean;     // p1$=jk$

  log: string[];  // battle narration
}

// ============================================================================
// BATTLE SIMULATION
// ============================================================================

interface BattleState {
  // Player
  x8: number;       // player weapon effectiveness
  x9: number;       // player shield effectiveness
  w1: number;       // weapon strength (for fuel calc)
  p1: number;       // shield strength (for p2 recalc at end)
  fuel: number;     // f1
  l2: number;       // life support condition
  s1: number;       // cargo pods
  d2: number;       // drive condition
  c2: number;       // cabin condition
  n2: number;       // navigation condition
  r2: number;       // robotics condition
  h2: number;       // hull condition
  roboticsForBC: number;  // r2 for battle computer check

  // Enemy
  y8: number;       // enemy weapon attack = p7 * p8
  y9: number;       // enemy outer shields = s7 * s8
  p9: number;       // enemy inner shield 1
  s9: number;       // enemy inner shield 2 (win condition)
  p6: number;       // enemy fuel
  p7: number;       // enemy weapon strength (for wg calc)
}

const MAX_ROUNDS = 100;

/**
 * Run the full SP.MAL battle simulation.
 * Implements armvar/malbegin/fbegin/malfite/mbcp from SP.MAL.S.
 *
 * @param rng Optional injectable random function for testing (default: Math.random)
 */
export function simulateMalignaBattle(
  missionType: MalignaMissionType,
  defconLevel: number,
  player: {
    weaponStrength: number;
    weaponCondition: number;
    shieldStrength: number;
    shieldCondition: number;
    hasStarBuster: boolean;
    hasArchAngel: boolean;
    hasWeaponMark?: boolean;  // SP.MAL.S line 83: if left$(w1$,1)="?" k8=(k8+150)
    fuel: number;
    lifeSupportCond: number;
    cargoPods: number;
    driveCondition: number;
    cabinCondition: number;
    navigationCondition: number;
    roboticsCondition: number;
    hullCondition: number;
    roboticsCondForBC?: number;  // if separate from battle robotics track
  },
  rng: () => number = Math.random
): MalignaBattleResult {
  const enemy = initEnemyStats(missionType, defconLevel);
  const { k8, x8: initX8 } = calcPlayerWeapon(player.weaponStrength, player.weaponCondition, player.hasStarBuster, player.hasWeaponMark ?? false);
  const { k9, x9: initX9 } = calcPlayerShield(player.shieldStrength, player.shieldCondition, player.hasArchAngel);

  const state: BattleState = {
    x8: initX8,
    x9: initX9,
    w1: k8,  // adjusted weapon strength (including STAR-BUSTER bonus)
    p1: k9,  // adjusted shield strength
    fuel: player.fuel,
    l2: player.lifeSupportCond,
    s1: player.cargoPods,
    d2: player.driveCondition,
    c2: player.cabinCondition,
    n2: player.navigationCondition,
    r2: player.roboticsCondition,
    h2: player.hullCondition,
    roboticsForBC: player.roboticsCondForBC ?? player.roboticsCondition,

    y8: enemy.weaponStrength * enemy.weaponCondition,    // SP.MAL.S line 89
    y9: enemy.shieldStrength * enemy.shieldCondition,    // SP.MAL.S line 89
    p9: enemy.innerShield1,
    s9: enemy.innerShield2,
    p6: enemy.fuel,
    p7: enemy.weaponStrength,
  };

  const log: string[] = [];
  let rounds = 0;

  /** Random 1..r (SP.MAL.S rand subroutine lines 438-442) */
  const rand = (r: number): number => Math.max(1, Math.min(r, Math.floor(rng() * (r + 1))));

  // ── Main battle loop ─────────────────────────────────────────────────────
  // SP.MAL.S armvar (line 91) — continues while (s9>0) AND (l2>0)
  while (rounds < MAX_ROUNDS && state.s9 > 0 && state.l2 > 0) {
    rounds++;

    // SP.MAL.S lines 93-98
    const wj = state.x8 > state.y9 ? state.x8 - state.y9 : 0;
    const wk = state.y8 > state.x9 ? state.y8 - state.x9 : 0;

    // Weapon/shield condition zeroing (lines 97-98)
    if (state.x8 < 1) { state.x8 = 0; }
    if (state.x9 < 1) { state.x9 = 0; }

    // ── Player attack phase ───────────────────────────────────────────────
    // SP.MAL.S malbegin (kk=3) / fbegin (kk=4,9): lines 145-220
    // Battle computer check (line 120): if r2<1, robot BC malfunction
    if (state.roboticsForBC < 1) {
      log.push(`Round ${rounds}: Battle Computer malfunctioning!`);
    } else {
      const wf = state.w1 > 1 ? Math.floor(state.w1 / 2) : 1;  // fuel cost per weapon fire

      if (state.x8 < 1) {
        log.push(`Round ${rounds}: Weapon Malfunction!`);
      } else if (state.fuel < wf) {
        log.push(`Round ${rounds}: Not enough fuel to charge weapon!`);
      } else {
        state.fuel -= wf;
        if (state.fuel < 1) state.fuel = 0;

        // Determine attack value x (SP.MAL.S lines 151-168)
        let x = 0;
        let attacked = false;
        if (wj > 0) {
          // Direct penetration
          x = wj;
          attacked = true;
        } else if (state.x8 > 0) {
          // Random chance (r=12, hit if x>3)
          const rval = rand(12);
          if (rval > 3) {
            x = rval;
            attacked = true;
          }
        }

        if (attacked && x > 0) {
          if (state.y9 < 1) {
            // Shields already gone — damage inner layers
            // SP.MAL.S malfail (lines 163-174) / ffail (lines 202-213)
            if (x > 1) x = Math.floor(x / 2);
            if (x < 1) x = 1;
            if (state.p9 > 0) {
              const dmg = Math.min(x, state.p9);
              state.p9 -= dmg;
              if (state.p9 < 0) state.p9 = 0;
              log.push(`Round ${rounds}: ${enemy.name} Inner Shield Hit! -${dmg}`);
            } else if (state.y8 > 0) {
              const dmg = Math.min(x, state.y8);
              state.y8 -= dmg;
              if (state.y8 < 0) state.y8 = 0;
              log.push(`Round ${rounds}: ${enemy.name} Weapons Damaged! -${dmg}`);
            } else if (state.s9 > 0) {
              const dmg = Math.min(x, state.s9);
              state.s9 -= dmg;
              if (state.s9 < 0) state.s9 = 0;
              log.push(`Round ${rounds}: ${enemy.name} Core Blasted! -${dmg}`);
            }
          } else {
            // Damage outer shields
            // SP.MAL.S malbigg/fbigg: lines 159-162 / 197-201
            const dmg = Math.min(x, state.y9);
            state.y9 -= dmg;
            if (state.y9 < 0) state.y9 = 0;
            log.push(`Round ${rounds}: ${enemy.name} Force Field Damaged! -${dmg}`);
          }
        } else if (!attacked && state.x8 > 0) {
          log.push(`Round ${rounds}: ${enemy.name}'s Force Field Deflects attack`);
        }
      }
    }

    // ── Enemy attack phase ────────────────────────────────────────────────
    // SP.MAL.S malfite (lines 221-276)
    const wg = state.p7 > 1 ? Math.floor(state.p7 / 2) : 1;

    if (state.y8 < 1) {
      // SP.MAL.S line 225
      log.push(`Round ${rounds}: ${enemy.name} Weaponry Malfunction!`);
    } else if (state.p6 < wg) {
      // SP.MAL.S line 226
      log.push(`Round ${rounds}: ${enemy.name} out of fuel for weapons!`);
    } else {
      state.p6 -= wg;
      if (state.p6 < 1) state.p6 = 0;

      // Determine enemy attack value (SP.MAL.S lines 228-235)
      let ex = 0;
      let eAttacked = false;
      if (wk > 0) {
        ex = wk;
        eAttacked = state.y8 > 0;
      } else if (state.y8 > 0) {
        // Random chance (r=6, hit if x>3) — SP.MAL.S line 229
        const rval = rand(6);
        if (rval > 3) {
          ex = rval;
          eAttacked = true;
        }
      }

      if (!eAttacked) {
        // SP.MAL.S line 234: shields deflect or no hit
        if (state.x9 > 0) {
          log.push(`Round ${rounds}: Your shields deflect ${enemy.name}'s attack`);
        } else {
          log.push(`Round ${rounds}: ${enemy.name}'s attack misses`);
        }
      } else if (eAttacked && ex > 0) {
        if (state.x9 > 0) {
          // Damage player outer shields — SP.MAL.S malgen (lines 239-243)
          const dmg = Math.min(ex, state.x9);
          state.x9 -= dmg;
          if (state.x9 < 0) state.x9 = 0;
          log.push(`Round ${rounds}: Your shields weakening! -${dmg}`);
        } else {
          // Shields gone — damage player components — SP.MAL.S galfail (lines 245-264)
          if (ex > 10) ex = Math.floor(ex / 10);
          if (ex < 1) ex = 1;
          // Damage sequence: cargo pods, drive, cabin, navigation, robotics, hull, weapon, life support
          const targets: Array<{ key: keyof BattleState; label: string }> = [
            { key: 's1', label: 'Pods Damaged!' },
            { key: 'd2', label: 'Drive Hit!' },
            { key: 'c2', label: 'Cabin Hit!' },
            { key: 'n2', label: 'Navigation Hit!' },
            { key: 'r2', label: 'Robotics Hit!' },
            { key: 'h2', label: 'Hull Hit!' },
            { key: 'x8', label: 'Weapon Hit!' },
            { key: 'l2', label: 'Life Support Hit!' },
          ];
          let hitSomething = false;
          for (const target of targets) {
            const val = state[target.key] as number;
            if (val > 0) {
              const dmg = Math.min(ex, val);
              (state[target.key] as number) -= dmg;
              if ((state[target.key] as number) < 0) (state[target.key] as number) = 0;
              log.push(`Round ${rounds}: ${target.label} -${dmg}`);
              hitSomething = true;
              break;
            }
          }
          if (!hitSomething) {
            log.push(`Round ${rounds}: Attack hits nothing`);
          }
        }
      }
    }

    // ── Floor all values (mbcp, lines 277-282) ───────────────────────────
    if (state.x8 < 0) state.x8 = 0;
    if (state.x9 < 0) state.x9 = 0;
    if (state.y8 < 0) state.y8 = 0;
    if (state.y9 < 0) state.y9 = 0;
    if (state.p9 < 0) state.p9 = 0;
    if (state.s9 < 0) state.s9 = 0;
    if (state.h2 < 0) state.h2 = 0;
    if (state.d2 < 0) state.d2 = 0;
    if (state.c2 < 0) state.c2 = 0;
    if (state.l2 < 0) state.l2 = 0;
    if (state.n2 < 0) state.n2 = 0;
    if (state.r2 < 0) state.r2 = 0;
    if (state.s1 < 0) state.s1 = 0;
  }

  // ── mc5: recalculate weapon/shield conditions after battle (lines 288-293) ──
  // w2=0:if (w1>0) and (x8>w1) w2=(x8/w1); if w2>9 w2=9; if w2<1 w2=0
  let finalW2 = 0;
  if (state.w1 > 0 && state.x8 > state.w1) {
    finalW2 = state.x8 / state.w1;
  }
  if (finalW2 > 9) finalW2 = 9;
  if (finalW2 < 1) finalW2 = 0;

  let finalP2 = 0;
  if (state.p1 > 0 && state.x9 > state.p1) {
    finalP2 = state.x9 / state.p1;
  }
  if (finalP2 > 9) finalP2 = 9;
  if (finalP2 < 1) finalP2 = 0;

  const playerWon = state.s9 <= 0 && state.l2 > 0;
  const playerLost = state.l2 <= 0;

  if (playerWon) {
    log.push(`Battle over after ${rounds} rounds — ${enemy.name} defeated!`);
  } else if (playerLost) {
    log.push(`Battle over after ${rounds} rounds — your ship is destroyed!`);
  } else {
    log.push(`Battle ended after max rounds (${rounds})`);
  }

  return {
    playerWon,
    playerLost,
    rounds,
    fuelRemaining: state.fuel,
    lifeSupportCond: state.l2,
    cargoPods: state.s1,
    driveCondition: state.d2,
    cabinCondition: state.c2,
    navigationCondition: state.n2,
    roboticsCondition: state.r2,
    hullCondition: state.h2,
    weaponEffective: state.x8,
    shieldEffective: state.x9,
    finalWeaponCondition: finalW2,
    finalShieldCondition: finalP2,
    weaponDestroyed: finalW2 === 0,
    shieldDestroyed: finalP2 === 0,
    log,
  };
}
