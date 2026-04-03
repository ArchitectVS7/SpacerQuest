import { describe, it, expect } from 'vitest';
import {
  attemptRetreat,
  applySystemDamage,
  calculateLoot,
  processCombatRound,
  calculateBattleFactor,
  calculateEnemyBattleFactor,
  enemyDemandsTribute,
  calculateSalvage,
  applySalvage,
  calculateTribute,
  applyAutoRepair,
  applyShieldRecharge,
  checkEnemySpeedChase,
  calculateDefeatConsequences,
  Enemy,
  SalvageResult,
} from '../src/game/systems/combat';
import { ShipStats } from '../src/game/systems/combat';
import { Rank } from '@prisma/client';

describe('Combat System Alignments', () => {
  describe('Retreat Mechanics', () => {
    // Original SP.FIGHT1.S:210-211: if i$="N" print"...Retreating..."\:x=y:goto spgo
    // Player retreat is ALWAYS successful — no probability check in the original.
    // Speed (drive power) only affects enemy retreat/attack behavior, not player's.
    it('should always succeed when player retreats (regardless of drive power)', () => {
      const result1 = attemptRetreat(150, 100, false);
      const result2 = attemptRetreat(100, 100, false);
      const result3 = attemptRetreat(80, 200, false);
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result3.success).toBe(true);
    });

    it('should always succeed with cloaker', () => {
      const result = attemptRetreat(50, 200, true);
      expect(result.success).toBe(true);
      expect(result.message).toMatch(/cloak/i);
    });

    it('should return retreat message on success', () => {
      const result = attemptRetreat(100, 100, false);
      expect(result.success).toBe(true);
      expect(result.message).toBeTruthy();
    });
  });

  // SP.FIGHT1.S sfff subroutine (lines 396-436):
  //   r=7:gosub rand:x=x+1
  //   if x=3 goto sfa2 (Nav); if x=5 goto sfa3 (Drives); if x=7 goto sfa4 (Robotics)
  //   default (x=2,4,6,8) → sfa1 (Cabin)
  //   Cascade: Cabin → Nav → Drives → Robotics → Weapon → Hull
  describe('Component Damage Cascade (SP.FIGHT1.S sfff)', () => {
    const ship: ShipStats = {
      weaponStrength: 10, weaponCondition: 5,
      shieldStrength: 10, shieldCondition: 1,
      cabinStrength: 10, cabinCondition: 2,
      roboticsStrength: 10, roboticsCondition: 5,
      lifeSupportStrength: 10, lifeSupportCondition: 3,
      navigationStrength: 10, navigationCondition: 4,
      driveStrength: 10, driveCondition: 2,
      hullStrength: 10, hullCondition: 5,
      hasAutoRepair: false,
    };

    it('roll=1 (x=2, even) → starts at Cabin: Cabin (2->1), Nav undisturbed', () => {
      const result = applySystemDamage(ship, 1, 1); // roll=1 → x=2 → cabin
      expect(result.updatedShip.cabinCondition).toBe(1);
      expect(result.updatedShip.navigationCondition).toBe(4);
    });

    it('roll=2 (x=3, odd) → starts at Nav: Nav (4->3), Cabin undisturbed', () => {
      const result = applySystemDamage(ship, 1, 2); // roll=2 → x=3 → nav
      expect(result.updatedShip.navigationCondition).toBe(3);
      expect(result.updatedShip.cabinCondition).toBe(2); // cabin undisturbed
    });

    it('roll=4 (x=5, odd) → starts at Drives: Drives (2->1)', () => {
      const result = applySystemDamage(ship, 1, 4); // roll=4 → x=5 → drives
      expect(result.updatedShip.driveCondition).toBe(1);
      expect(result.updatedShip.cabinCondition).toBe(2); // cabin undisturbed
    });

    it('roll=6 (x=7, odd) → starts at Robotics: Robotics (5->4)', () => {
      const result = applySystemDamage(ship, 1, 6); // roll=6 → x=7 → robotics
      expect(result.updatedShip.roboticsCondition).toBe(4);
      expect(result.updatedShip.cabinCondition).toBe(2); // cabin undisturbed
    });

    it('cascade: when cabin=0 and roll starts at cabin, cascades to Nav', () => {
      const zeroCabin = { ...ship, cabinCondition: 0 };
      const result = applySystemDamage(zeroCabin, 1, 1); // roll=1 → cabin → cascade to nav
      expect(result.updatedShip.navigationCondition).toBe(3); // 4→3
      expect(result.updatedShip.cabinCondition).toBe(0); // still 0
    });

    it('cascade: when cabin=0 and nav=0 and roll starts at cabin, cascades to Drives', () => {
      const depleted = { ...ship, cabinCondition: 0, navigationCondition: 0 };
      const result = applySystemDamage(depleted, 1, 1);
      expect(result.updatedShip.driveCondition).toBe(1); // 2→1
    });

    it('weapon and hull are reachable in cascade (sfff sfa5/sfa6)', () => {
      const almostDead = { ...ship, cabinCondition: 0, navigationCondition: 0, driveCondition: 0, roboticsCondition: 0 };
      const result = applySystemDamage(almostDead, 1, 1);
      expect(result.updatedShip.weaponCondition).toBe(4); // 5→4
    });
  });

  // SP.FIGHT1.S:306-328 begin subroutine — e6/e9 damage formula + Lucky Shot + BC malfunction
  describe('processCombatRound — battle factor damage formula (SP.FIGHT1.S:311)', () => {
    const baseEnemy: Enemy = {
      type: 'PIRATE', class: 'SPX', name: 'T', commander: 'C', system: 1,
      weaponStrength: 1, weaponCondition: 1,   // y8=1
      shieldStrength: 5, shieldCondition: 10,  // y9=50
      driveStrength: 1, driveCondition: 1,
      hullStrength: 10, hullCondition: 5,
      battleFactor: 0, fuel: 100,
    };

    it('e6 = playerWeaponPower + playerBF penetrates e9 = enemyShieldPower + enemyBF (SP.FIGHT1.S:311)', () => {
      // e6 = 40×9 + 100 = 460; e9 = 5×10 + 0 = 50 → damage = 410
      const round = processCombatRound(100, 40, 9, 20, 5, false, baseEnemy, 1, 10, 5);
      expect(round.playerDamage).toBeGreaterThan(0);
      expect(round.isLuckyShot).toBe(false);
    });

    it('enemyBF (jg) adds to enemy defense: high enemyBF blocks player attack', () => {
      const strongEnemy = { ...baseEnemy, battleFactor: 500 };
      // e6 = 25 + 10 = 35; e9 = 50 + 500 = 550 → shields deflect
      const round = processCombatRound(10, 5, 5, 20, 5, false, strongEnemy, 1, 0, 0, 4); // luckyShotRoll=4≠3
      expect(round.playerDamage).toBe(0);
      expect(round.isLuckyShot).toBe(false);
    });

    it('BC malfunction (r2<1): player damage halved when roboticsCondition=0 (SP.FIGHT1.S:323)', () => {
      // baseEnemy shieldPower = 5×10 = 50; enemyBF=0 → e9=50
      // e6 = 10×5 + 50 = 100 → damage = 100-50=50; r2=0 → halved → floor(50/2)=25
      const round = processCombatRound(50, 10, 5, 20, 5, false, baseEnemy, 1, 10, 0);
      expect(round.playerDamage).toBe(25); // floor(50/2)=25
      expect(round.combatLog.some(m => m.includes('Malfunction'))).toBe(true);
    });
  });

  // SP.FIGHT1.S:313-318 Lucky Shot (r=5:gosub rand:if x<>3)
  describe('Lucky Shot (SP.FIGHT1.S:313-318)', () => {
    const enemy: Enemy = {
      type: 'PIRATE', class: 'SPX', name: 'T', commander: 'C', system: 1,
      weaponStrength: 1, weaponCondition: 1,
      shieldStrength: 5, shieldCondition: 10,  // y9=50
      driveStrength: 1, driveCondition: 1,
      hullStrength: 10, hullCondition: 5,
      battleFactor: 500,  // high enemyBF ensures e9 > e6 → shields deflect
      fuel: 100,
    };

    it('fires when roll=3, r1>=10, r2>=1 (1/5 probability gate)', () => {
      // e6 = 25+10=35; e9 = 50+500=550 → deflected → lucky shot
      // a=(r1*r2)/10 = (10*5)/10=5; a=(5+10)/2=7.5→7
      const round = processCombatRound(10, 5, 5, 20, 5, false, enemy, 1, 10, 5, 3);
      expect(round.isLuckyShot).toBe(true);
      expect(round.playerDamage).toBeGreaterThan(0);
      expect(round.combatLog.some(m => m.includes('Lucky Shot'))).toBe(true);
    });

    it('does NOT fire when roll≠3 (only roll=3 triggers lucky shot)', () => {
      for (const roll of [1, 2, 4, 5] as const) {
        const round = processCombatRound(10, 5, 5, 20, 5, false, enemy, 1, 10, 5, roll);
        expect(round.isLuckyShot).toBe(false);
        expect(round.playerDamage).toBe(0);
      }
    });

    it('does NOT fire when r2<1 (roboticsCondition=0)', () => {
      const round = processCombatRound(10, 5, 5, 20, 5, false, enemy, 1, 10, 0, 3);
      expect(round.isLuckyShot).toBe(false);
    });

    it('does NOT fire when r1<10 (roboticsStrength<10)', () => {
      const round = processCombatRound(10, 5, 5, 20, 5, false, enemy, 1, 9, 5, 3);
      expect(round.isLuckyShot).toBe(false);
    });

    it('damage formula: a=((r1*r2)/10 + playerBF)/2, capped at e6/2 when a>e6>1 (SP.FIGHT1.S:316-317)', () => {
      // r1=20, r2=9: a=(20*9)/10=18; a=(18+10)/2=14; e6=25+10=35; 14<35 → no cap → damage=14
      const round = processCombatRound(10, 5, 5, 20, 5, false, enemy, 1, 20, 9, 3);
      expect(round.playerDamage).toBe(14);
    });

    it('isLuckyShot=false when shields do NOT deflect (direct hit path, not lucky shot)', () => {
      const weakEnemy = { ...enemy, battleFactor: 0 };
      // e6=25+10=35; e9=50+0=50 → still deflects! playerBF too small
      // Use stronger weapon: e6=900+10=910 > e9=550 → direct hit
      const round = processCombatRound(10, 30, 30, 20, 5, false, weakEnemy, 1, 10, 5, 3);
      expect(round.isLuckyShot).toBe(false);
      expect(round.playerDamage).toBeGreaterThan(0);
    });
  });

  describe('Loot from Victory', () => {
    it('should calculate loot based on enemy class/type', () => {
      const enemy1 = { class: 'SPX' } as Enemy;
      const enemy2 = { type: 'RIM_PIRATE' } as Enemy;
      
      expect(calculateLoot(enemy1, 100)).toBe(500 + 10); // 500 base + 10 bf bonus
      expect(calculateLoot(enemy2, 200)).toBe(3000 + 20); // 3000 base + 20 bf bonus
    });
  });

  describe('Auto-Repair Module', () => {
    it('should repair +1 condition to components per round when active', () => {
      const enemy = {
        weaponStrength: 10, weaponCondition: 5,
        shieldStrength: 10, shieldCondition: 5,
        battleFactor: 100,
      } as Enemy;

      const round = processCombatRound(100, 10, 5, 10, 5, true, enemy, 1);
      expect(round.playerRepairs).toBe(1);
      expect(round.combatLog.some(log => log.includes('Auto-Repair'))).toBe(true);
    });
  });

  // ============================================================================
  // BATTLE FACTOR FORMULA (ranfix routine — SP.FIGHT1.S:471-491)
  // ============================================================================

  describe('Battle Factor Formula', () => {
    // Baseline ship: all support components at strength=10, condition=5
    // ranfix for each: floor((5+1)*10/10) = 6
    // 5 support components × 6 = 30
    // battlesWon=0: expContrib=0 → supportSum=30
    // r9 = floor(30/5) = 6
    // weapon: 10*5=50, shield: 10*5=50 → weaponPower+shieldPower+r9 = 50+50+6 = 106 + rankBonus
    const baseShip: ShipStats = {
      weaponStrength: 10, weaponCondition: 5,
      shieldStrength: 10, shieldCondition: 5,
      cabinStrength: 10, cabinCondition: 5,
      roboticsStrength: 10, roboticsCondition: 5,
      lifeSupportStrength: 10, lifeSupportCondition: 5,
      navigationStrength: 10, navigationCondition: 5,
      driveStrength: 10, driveCondition: 5,
      hullStrength: 0, hullCondition: 0, // hull at 0 strength = 0 contribution
      hasAutoRepair: false,
    };

    it('should compute support component contribution using (condition+1)*strength/10 — not condition*strength/10', () => {
      // With condition=5, strength=10:
      //   correct: floor((5+1)*10/10) = 6
      //   wrong (old): floor(5*10/10) = 5
      // Total for 5 support components:
      //   correct: 30 → r9 = 6
      //   wrong: 25 → r9 = 5
      const bf = calculateBattleFactor(baseShip, Rank.LIEUTENANT, 0);
      // weapon(50) + shield(50) + r9(6) + rankBonus(0) = 106
      expect(bf).toBe(106);
    });

    it('should give non-zero r9 even when all support conditions are 0 (ranfix: r9=10 if sum<=4)', () => {
      // With condition=0, strength=10:
      //   (0+1)*10/10 = 1 per component → supportSum = 5 > 4 → r9 = floor(5/5) = 1
      // (NOT 0 as old formula would give: 0*10/10=0 → sum=0 → old would give r9=10 anyway)
      const damagedShip: ShipStats = {
        ...baseShip,
        cabinCondition: 0, roboticsCondition: 0,
        lifeSupportCondition: 0, navigationCondition: 0, driveCondition: 0,
      };
      const bf = calculateBattleFactor(damagedShip, Rank.LIEUTENANT, 0);
      // weapon(50) + shield(50) + r9(1) + rankBonus(0) = 101
      expect(bf).toBe(101);
    });

    it('should use r9=10 floor when support sum is 4 or less (ranfix: if a<5 r9=10)', () => {
      // With strength=1, condition=0: (0+1)*1/10 = 0 per component → supportSum = 0 ≤ 4 → r9 = 10
      const weakShip: ShipStats = {
        ...baseShip,
        weaponStrength: 1, weaponCondition: 1,   // weapon: 1
        shieldStrength: 1, shieldCondition: 1,   // shield: 1
        cabinStrength: 1, cabinCondition: 0,
        roboticsStrength: 1, roboticsCondition: 0,
        lifeSupportStrength: 1, lifeSupportCondition: 0,
        navigationStrength: 1, navigationCondition: 0,
        driveStrength: 1, driveCondition: 0,
      };
      const bf = calculateBattleFactor(weakShip, Rank.LIEUTENANT, 0);
      // weapon(1) + shield(1) + r9(10) + rankBonus(0) = 12
      expect(bf).toBe(12);
    });

    it('should include battlesWon in r9 via e1 added directly (not /10) — ranfix: x=e1:gosub rfox', () => {
      // Original: x=e1:gosub rfox → rfox does y=y+x (no division)
      // With 100 battles won: expContrib = 100 (direct)
      // supportSum = 28 + 100 = 128 → r9 = floor(128/5) = 25 (vs floor(28/5)=5 without battles)
      const bfWithExp = calculateBattleFactor(baseShip, Rank.LIEUTENANT, 100);
      const bfNoExp = calculateBattleFactor(baseShip, Rank.LIEUTENANT, 0);
      expect(bfWithExp).toBeGreaterThan(bfNoExp);
      // supportSum = 30 (5 support @ 6 each) + 100 = 130 → r9 = floor(130/5) = 26
      // weapon(50) + shield(50) + r9(26) + rankBonus(0) = 126
      expect(bfWithExp).toBe(126);
    });
  });

  // ============================================================================
  // TRIBUTE SYSTEM (SP.FIGHT1.S:227-230)
  // ============================================================================

  describe('Tribute Demand', () => {
    // Original SP.FIGHT1.S:227-228: kc=(kg*1000):if kg>12 kc=10000
    // Tribute rises 1000 per round. Round 12 = 12,000. Round 13+ = 10,000 (fixed).

    it('should demand round * 1000 credits for rounds 1-12', () => {
      const t1 = enemyDemandsTribute(1, 50000);
      const t5 = enemyDemandsTribute(5, 50000);
      expect(t1.tributeDemanded).toBe(1000);
      expect(t5.tributeDemanded).toBe(5000);
    });

    it('should demand 12,000 at round 12 (not capped — kg>12 check is exclusive)', () => {
      const t12 = enemyDemandsTribute(12, 50000);
      expect(t12.tributeDemanded).toBe(12000);
    });

    it('should cap tribute at 10,000 for round 13+ (original: if kg>12 kc=10000)', () => {
      const t13 = enemyDemandsTribute(13, 50000);
      const t20 = enemyDemandsTribute(20, 50000);
      expect(t13.tributeDemanded).toBe(10000);
      expect(t20.tributeDemanded).toBe(10000);
    });

    it('should NOT demand 20,000 at any round — original max demand is 12,000 (round 12)', () => {
      for (let round = 1; round <= 50; round++) {
        const t = enemyDemandsTribute(round, 100000);
        expect(t.tributeDemanded).toBeLessThanOrEqual(12000);
      }
    });

    it('should cap demand at player available credits', () => {
      const t = enemyDemandsTribute(5, 2000); // demand=5000 but player only has 2000
      expect(t.tributeDemanded).toBe(2000);
    });
  });

  // ============================================================================
  // SALVAGE SYSTEM (SP.FIGHT2.S:139-193)
  // ============================================================================

  describe('Salvage System', () => {
    it('should return a valid salvage result with component or nothing', () => {
      // Run many times to cover randomness
      const components = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const result = calculateSalvage('PIRATE', 2, 5, 'P1-TestShip', 3);
        expect(result).toHaveProperty('component');
        expect(result).toHaveProperty('amount');
        expect(result).toHaveProperty('description');
        expect(typeof result.requiresConfirmation).toBe('boolean');
        expect(typeof result.isDefective).toBe('boolean');
        components.add(result.component);
      }
      // Should find at least 2 different results over 100 rolls
      expect(components.size).toBeGreaterThanOrEqual(2);
    });

    it('should return patrol salvage with fixed amount of 1 (FIGHT2.S:142)', () => {
      for (let i = 0; i < 50; i++) {
        const result = calculateSalvage('PATROL', 2, 5, 'SPX-Guard1', 3);
        if (result.component !== 'nothing' && result.component !== 'gold') {
          expect(result.amount).toBe(1);
        }
      }
    });

    it('should produce rim/reptiloid salvage from the rim component pool', () => {
      const rimComponents = new Set<string>();
      for (let i = 0; i < 200; i++) {
        const result = calculateSalvage('RIM_PIRATE', 2, 3, 'RimShip', 5);
        rimComponents.add(result.component);
      }
      // Rim salvage should never produce gold, cabin, or weaponDefective
      expect(rimComponents.has('gold')).toBe(false);
      expect(rimComponents.has('cabin')).toBe(false);
      expect(rimComponents.has('weaponDefective')).toBe(false);
    });

    it('should mark weapon beam intensifier (x=5) as requiring confirmation', () => {
      // We can't control randomness, but verify the flag when it appears
      for (let i = 0; i < 500; i++) {
        const result = calculateSalvage('PIRATE', 1, 0, 'P3-Ship', 3);
        if (result.component === 'weapon' && result.description.includes('Beam Intensifier')) {
          expect(result.requiresConfirmation).toBe(true);
          expect(result.isDefective).toBe(false);
          return; // Found it, test passes
        }
      }
      // It's probabilistic; if we didn't find it in 500 tries that's still ok
    });

    it('should mark defective weapon (x=9) as defective and requiring confirmation', () => {
      for (let i = 0; i < 500; i++) {
        const result = calculateSalvage('PIRATE', 1, 0, 'P3-Ship', 3);
        if (result.component === 'weaponDefective') {
          expect(result.requiresConfirmation).toBe(true);
          expect(result.isDefective).toBe(true);
          return;
        }
      }
    });

    it('should return gold with credit amount as multiples of 10000 (FIGHT2.S:147)', () => {
      for (let i = 0; i < 500; i++) {
        const result = calculateSalvage('PIRATE', 1, 0, 'P3-Ship', 3);
        if (result.component === 'gold') {
          expect(result.amount).toBeGreaterThanOrEqual(10000);
          expect(result.amount % 10000).toBe(0);
          return;
        }
      }
    });
  });

  describe('Apply Salvage', () => {
    const baseShipComponents = {
      driveStrength: 50,
      cabinStrength: 30,
      lifeSupportStrength: 20,
      weaponStrength: 40,
      navigationStrength: 35,
      roboticsStrength: 25,
      shieldStrength: 45,
    };

    it('should increase drive strength on drive salvage', () => {
      const salvage: SalvageResult = {
        component: 'drive', amount: 3, description: 'Drive: Relay Matrix +3',
        requiresConfirmation: false, isDefective: false,
      };
      const updates = applySalvage(salvage, baseShipComponents);
      expect(updates.driveStrength).toBe(53);
    });

    it('should cap LSS at 50 (FIGHT2.S:186)', () => {
      const salvage: SalvageResult = {
        component: 'lifeSupport', amount: 40, description: 'LSS +40',
        requiresConfirmation: false, isDefective: false,
      };
      const updates = applySalvage(salvage, baseShipComponents);
      expect(updates.lifeSupportStrength).toBe(50);
    });

    it('should cap all components at 199 (FIGHT2.S:52)', () => {
      const salvage: SalvageResult = {
        component: 'drive', amount: 200, description: 'Drive +200',
        requiresConfirmation: false, isDefective: false,
      };
      const updates = applySalvage(salvage, baseShipComponents);
      expect(updates.driveStrength).toBe(199);
    });

    it('should reduce weapon strength for defective weapon', () => {
      const salvage: SalvageResult = {
        component: 'weaponDefective', amount: 5, description: 'Defective -5',
        requiresConfirmation: true, isDefective: true,
      };
      const updates = applySalvage(salvage, baseShipComponents);
      expect(updates.weaponStrength).toBe(35);
    });

    it('should not go below 0 for defective weapon', () => {
      const salvage: SalvageResult = {
        component: 'weaponDefective', amount: 100, description: 'Defective -100',
        requiresConfirmation: true, isDefective: true,
      };
      const updates = applySalvage(salvage, baseShipComponents);
      expect(updates.weaponStrength).toBe(0);
    });

    it('should return empty object for gold (credits, not ship component)', () => {
      const salvage: SalvageResult = {
        component: 'gold', amount: 30000, description: 'Gold +30000',
        requiresConfirmation: false, isDefective: false,
      };
      const updates = applySalvage(salvage, baseShipComponents);
      expect(Object.keys(updates)).toHaveLength(0);
    });

    it('should return empty object for nothing', () => {
      const salvage: SalvageResult = {
        component: 'nothing', amount: 0, description: 'Nothing',
        requiresConfirmation: false, isDefective: false,
      };
      const updates = applySalvage(salvage, baseShipComponents);
      expect(Object.keys(updates)).toHaveLength(0);
    });
  });

  // ============================================================================
  // FULL TRIBUTE SYSTEM (SP.FIGHT1.S:222-271)
  // ============================================================================

  describe('Full Tribute System (calculateTribute)', () => {
    it('should confiscate plans & fuel for alliance raid (kk=4)', () => {
      const result = calculateTribute(4, 'PATROL', 3, 50000, 1000, 10, 'Spices', 0);
      expect(result.path).toBe('ALLIANCE_RAID');
      expect(result.fuelLost).toBe(500); // half of 1000
      expect(result.cargoLost).toBe(true);
      expect(result.creditsLost).toBe(0);
      expect(result.criminalRecord).toBe(false);
    });

    it('should confiscate cargo and add criminal record for smuggling (kk=5)', () => {
      const result = calculateTribute(5, 'PATROL', 3, 50000, 500, 10, 'Contraband', 0);
      expect(result.path).toBe('SMUGGLING');
      expect(result.cargoLost).toBe(true);
      expect(result.criminalRecord).toBe(true);
      expect(result.creditsLost).toBe(0);
    });

    it('should confiscate cargo for rim pirate #21 (sk=3, pz=21)', () => {
      const result = calculateTribute(1, 'RIM_PIRATE', 3, 50000, 500, 10, 'Titanium Ore', 0, 21);
      expect(result.path).toBe('RIM_CONFISCATION');
      expect(result.cargoLost).toBe(true);
      expect(result.criminalRecord).toBe(false);
    });

    it('should demand credit tribute for standard encounter', () => {
      const result = calculateTribute(1, 'PIRATE', 5, 50000, 500, 10, 'Goods', 0);
      expect(result.path).toBe('CREDIT_TRIBUTE');
      expect(result.creditsLost).toBe(5000); // round 5 * 1000
      expect(result.cargoLost).toBe(false);
    });

    it('should cap credit tribute at 10000', () => {
      const result = calculateTribute(1, 'PIRATE', 15, 50000, 500, 10, 'Goods', 0);
      expect(result.path).toBe('CREDIT_TRIBUTE');
      expect(result.creditsLost).toBeLessThanOrEqual(10000);
    });

    it('should double tribute for high-ranked pirates (rosterIdx > 10)', () => {
      const result = calculateTribute(1, 'PIRATE', 3, 50000, 500, 10, 'Goods', 0, 15);
      expect(result.path).toBe('CREDIT_TRIBUTE');
      expect(result.creditsLost).toBe(6000); // 3000 * 2
    });

    it('should take cargo when credits insufficient (ckc path)', () => {
      const result = calculateTribute(1, 'PIRATE', 5, 100, 500, 10, 'Dry Goods', 0);
      expect(result.path).toBe('INSUFFICIENT_CREDITS');
      expect(result.cargoLost).toBe(true);
      expect(result.creditsLost).toBe(0);
    });

    it('should take storage pods when no cargo and credits insufficient', () => {
      const result = calculateTribute(1, 'PIRATE', 5, 100, 500, 0, null, 20);
      expect(result.path).toBe('INSUFFICIENT_CREDITS');
      expect(result.storagePodsTaken).toBe(20);
      expect(result.cargoLost).toBe(false);
    });

    it('should drain fuel as last resort when no cargo, no pods, no credits', () => {
      const result = calculateTribute(1, 'PIRATE', 5, 100, 300, 0, null, 0);
      expect(result.path).toBe('INSUFFICIENT_CREDITS');
      expect(result.fuelLost).toBe(300);
      expect(result.cargoLost).toBe(false);
      expect(result.storagePodsTaken).toBe(0);
    });

    it('should double tribute for Reptiloid encounter (sk=4) — original FIGHT1.S:228: if (sk=4) or (pz>10)', () => {
      // REPTILOID = sk=4 in original. Round 3: kc=3000 * 2 = 6000.
      const result = calculateTribute(10, 'REPTILOID', 3, 50000, 500, 10, 'Goods', 0);
      expect(result.path).toBe('CREDIT_TRIBUTE');
      expect(result.creditsLost).toBe(6000); // 3000 * 2
    });

    it('should halve tribute for Brigand encounter (sk=5) — original FIGHT1.S:227: if sk=5 kc=(kc/2)', () => {
      // Brigand = sk=5 in original. Round 4: kc=4000, halved to 2000.
      const result = calculateTribute(1, 'BRIGAND', 4, 50000, 500, 10, 'Goods', 0);
      expect(result.path).toBe('CREDIT_TRIBUTE');
      expect(result.creditsLost).toBe(2000); // 4000 / 2
    });
  });

  describe('Hull in Player Battle Factor — SP.FIGHT1.S ranfix line 478', () => {
    it('should include hull contribution in r9 — original: a=(h2+1)*h1:gosub rfix', () => {
      // Ship with hull strength=10, condition=5: hullContrib = floor((5+1)*10/10) = 6
      // All other support at 0. supportSum = 6. r9 = floor(6/5) = 1.
      const shipWithHull: ShipStats = {
        weaponStrength: 0, weaponCondition: 0,
        shieldStrength: 0, shieldCondition: 0,
        cabinStrength: 0, cabinCondition: 0,
        roboticsStrength: 0, roboticsCondition: 0,
        lifeSupportStrength: 0, lifeSupportCondition: 0,
        navigationStrength: 0, navigationCondition: 0,
        driveStrength: 0, driveCondition: 0,
        hullStrength: 10, hullCondition: 5,
        hasAutoRepair: false,
      };
      const shipNoHull: ShipStats = { ...shipWithHull, hullStrength: 0, hullCondition: 0 };
      const bfWithHull = calculateBattleFactor(shipWithHull, Rank.LIEUTENANT, 0);
      const bfNoHull = calculateBattleFactor(shipNoHull, Rank.LIEUTENANT, 0);
      // With hull: supportSum=6 → r9=1 (sum>4). Without: supportSum=0 → r9=10.
      // So BF with hull (r9=1) < BF without hull (r9=10) due to minimum floor
      // But the point is hull participates in the ranfix formula
      expect(bfWithHull).toBe(1); // 0+0+r9(1)+0
      expect(bfNoHull).toBe(10); // 0+0+r9(10)+0
    });

    it('should include trip count bonus (u1>49 → r9 += u1/50) — original FIGHT1.S:479', () => {
      const ship: ShipStats = {
        weaponStrength: 0, weaponCondition: 0,
        shieldStrength: 0, shieldCondition: 0,
        cabinStrength: 0, cabinCondition: 0,
        roboticsStrength: 0, roboticsCondition: 0,
        lifeSupportStrength: 0, lifeSupportCondition: 0,
        navigationStrength: 0, navigationCondition: 0,
        driveStrength: 0, driveCondition: 0,
        hullStrength: 0, hullCondition: 0,
        hasAutoRepair: false,
      };
      // tripCount=100: tripContrib = floor(100/50) = 2, supportSum=2 ≤ 4 → r9=10 (floor)
      // tripCount=250: tripContrib = floor(250/50) = 5, supportSum=5 > 4 → r9=floor(5/5)=1
      const bfTrip100 = calculateBattleFactor(ship, Rank.LIEUTENANT, 0, 100);
      const bfTrip250 = calculateBattleFactor(ship, Rank.LIEUTENANT, 0, 250);
      const bfNoTrip = calculateBattleFactor(ship, Rank.LIEUTENANT, 0, 0);
      expect(bfNoTrip).toBe(10); // r9=10 (sum=0)
      expect(bfTrip100).toBe(10); // supportSum=2 ≤ 4, r9=10 (floor)
      expect(bfTrip250).toBe(1);  // supportSum=5 > 4, r9=floor(5/5)=1
    });
  });

  describe('Crime Count in Enemy Battle Factor — SP.FIGHT1.S ranfix line 491', () => {
    it('should add crimeCount*5 to enemy jg — original: jg=jg+(z1*5)', () => {
      const enemy: Enemy = {
        type: 'PIRATE',
        class: 'P1',
        name: 'Test',
        commander: 'Test',
        system: 1,
        weaponStrength: 0, weaponCondition: 0,
        shieldStrength: 0, shieldCondition: 0,
        driveStrength: 0, driveCondition: 0,
        hullStrength: 0, hullCondition: 0,
        battleFactor: 0,
        fuel: 100,
        npcRosterId: 1,
        creditValue: 0,
        alliance: null,
      };
      const bfNoCrime = calculateEnemyBattleFactor(enemy, 0);
      const bfCrime3 = calculateEnemyBattleFactor(enemy, 3);
      // No crime: supportSum=0, jg=10. Crime=3: jg=10+(3*5)=25.
      expect(bfNoCrime).toBe(10); // 0+0+10
      expect(bfCrime3).toBe(25);  // 0+0+10+(3*5)=25
    });
  });

  // ============================================================================
  // POST-BATTLE: AUTO-REPAIR (SP.FIGHT2.S:41-64)
  // ============================================================================

  describe('applyAutoRepair (SP.FIGHT2.S:41-64)', () => {
    it('should increment condition +1 for each non-zero-strength component below 9', () => {
      const ship = {
        driveStrength: 10, driveCondition: 5,
        cabinStrength: 8, cabinCondition: 3,
        lifeSupportStrength: 10, lifeSupportCondition: 7,
        weaponStrength: 20, weaponCondition: 4,
        navigationStrength: 10, navigationCondition: 6,
        roboticsStrength: 5, roboticsCondition: 2,
        shieldStrength: 15, shieldCondition: 8,
      };
      const { updates, messages } = applyAutoRepair(ship);
      expect(updates.driveCondition).toBe(6);
      expect(updates.cabinCondition).toBe(4);
      expect(updates.lifeSupportCondition).toBe(8);
      expect(updates.weaponCondition).toBe(5);
      expect(updates.navigationCondition).toBe(7);
      expect(updates.roboticsCondition).toBe(3);
      expect(updates.shieldCondition).toBe(9);
      expect(messages).toHaveLength(7);
    });

    it('should not repair a component at condition 9 (already maxed)', () => {
      const ship = {
        driveStrength: 10, driveCondition: 9,
        cabinStrength: 0, cabinCondition: 0,
        lifeSupportStrength: 10, lifeSupportCondition: 9,
        weaponStrength: 10, weaponCondition: 9,
        navigationStrength: 10, navigationCondition: 9,
        roboticsStrength: 10, roboticsCondition: 9,
        shieldStrength: 10, shieldCondition: 9,
      };
      const { updates } = applyAutoRepair(ship);
      expect(Object.keys(updates)).toHaveLength(0);
    });

    it('should not repair a component with zero strength (junk/not installed)', () => {
      // SP.FIGHT2.S fixr: if x<1 return (strength=0 → skip repair)
      const ship = {
        driveStrength: 0, driveCondition: 5,
        cabinStrength: 0, cabinCondition: 3,
        lifeSupportStrength: 0, lifeSupportCondition: 2,
        weaponStrength: 0, weaponCondition: 4,
        navigationStrength: 0, navigationCondition: 6,
        roboticsStrength: 0, roboticsCondition: 2,
        shieldStrength: 0, shieldCondition: 8,
      };
      const { updates } = applyAutoRepair(ship);
      expect(Object.keys(updates)).toHaveLength(0);
    });

    it('should produce human-readable messages for each repaired component', () => {
      const ship = {
        driveStrength: 10, driveCondition: 4,
        cabinStrength: 10, cabinCondition: 5,
        lifeSupportStrength: 10, lifeSupportCondition: 6,
        weaponStrength: 10, weaponCondition: 7,
        navigationStrength: 10, navigationCondition: 8,
        roboticsStrength: 0, roboticsCondition: 3,
        shieldStrength: 10, shieldCondition: 9,
      };
      const { messages } = applyAutoRepair(ship);
      expect(messages).toContain('Drives: 4→5');
      expect(messages).toContain('Cabin: 5→6');
      expect(messages).toContain('Nav: 8→9');
      // robotics: strength=0, no repair
      expect(messages.some(m => m.startsWith('Robotics'))).toBe(false);
      // shields: already at 9, no repair
      expect(messages.some(m => m.startsWith('Shields'))).toBe(false);
    });
  });

  // ============================================================================
  // POST-BATTLE: SHIELD RECHARGER (SP.FIGHT2.S:66-75)
  // ============================================================================

  describe('applyShieldRecharge (SP.FIGHT2.S:66-75)', () => {
    it('should recharge shields spending shieldStrength fuel per +1 condition', () => {
      // Shield strength=10, condition=5, fuel=500
      // 4 recharges needed (5→9), costs 4*10=40 fuel
      const result = applyShieldRecharge(10, 5, 500);
      expect(result.shieldCondition).toBe(9);
      expect(result.fuel).toBe(460);
    });

    it('should stop recharging when fuel insufficient', () => {
      // Shield strength=100, condition=3, fuel=250
      // Can only do 2 recharges (250/100=2), stops at condition=5
      const result = applyShieldRecharge(100, 3, 250);
      expect(result.shieldCondition).toBe(5);
      expect(result.fuel).toBe(50);
    });

    it('should not recharge if shield condition already at 9', () => {
      const result = applyShieldRecharge(10, 9, 1000);
      expect(result.shieldCondition).toBe(9);
      expect(result.fuel).toBe(1000);
    });

    it('should not recharge if no fuel', () => {
      const result = applyShieldRecharge(10, 5, 0);
      expect(result.shieldCondition).toBe(5);
      expect(result.fuel).toBe(0);
    });

    it('should not recharge if shieldStrength is 0', () => {
      // No shields installed — shieldStrength=0 → guard prevents divide/loop
      const result = applyShieldRecharge(0, 5, 1000);
      expect(result.shieldCondition).toBe(5);
      expect(result.fuel).toBe(1000);
    });
  });

  // ============================================================================
  // checkEnemySpeedChase (SP.FIGHT1.S spedck/spedo)
  // ============================================================================

  describe('checkEnemySpeedChase (SP.FIGHT1.S speed:/spedo:)', () => {
    it('player tied speed: no chase', () => {
      // x=d1*d2=20, y=s3*s4=20 → tied → no chase
      const result = checkEnemySpeedChase(4, 5, 4, 5, 50, 9);
      expect(result.enemyFaster).toBe(false);
      expect(result.enemyChases).toBe(false);
      expect(result.enemyRetreats).toBe(false);
    });

    it('player faster speed: no chase', () => {
      // x=d1*d2=30, y=s3*s4=20 → player faster → no chase
      const result = checkEnemySpeedChase(6, 5, 4, 5, 50, 9);
      expect(result.enemyFaster).toBe(false);
      expect(result.enemyChases).toBe(false);
    });

    it('enemy faster with shields AND weapon: guaranteed chase', () => {
      // y=s3*s4=40 > x=d1*d2=20; y9>0 and y8>0 → guaranteed chase
      const result = checkEnemySpeedChase(4, 5, 8, 5, 50, 9);
      expect(result.enemyFaster).toBe(true);
      expect(result.enemyChases).toBe(true);
      expect(result.enemyRetreats).toBe(false);
    });

    it('enemy faster, no shields (y9=0): 1/3 chance (roll=1 → chases)', () => {
      // y9=0 → no guaranteed chase; roll=1 → chases
      const result = checkEnemySpeedChase(4, 5, 8, 5, 50, 0, 1);
      expect(result.enemyFaster).toBe(true);
      expect(result.enemyChases).toBe(true);
    });

    it('enemy faster, no shields (y9=0): roll=2 → enemy retreats', () => {
      const result = checkEnemySpeedChase(4, 5, 8, 5, 50, 0, 2);
      expect(result.enemyFaster).toBe(true);
      expect(result.enemyChases).toBe(false);
      expect(result.enemyRetreats).toBe(true);
    });

    it('enemy faster, no weapon (y8=0): roll=1 → chases', () => {
      // y8=0 → no guaranteed chase; but 1/3 chance still applies
      const result = checkEnemySpeedChase(4, 5, 8, 5, 0, 9, 1);
      expect(result.enemyFaster).toBe(true);
      expect(result.enemyChases).toBe(true);
    });

    it('enemy faster, no weapon (y8=0): roll=3 → enemy retreats', () => {
      const result = checkEnemySpeedChase(4, 5, 8, 5, 0, 9, 3);
      expect(result.enemyFaster).toBe(true);
      expect(result.enemyChases).toBe(false);
      expect(result.enemyRetreats).toBe(true);
    });

    it('drive condition 0 makes speed 0: tied → no chase', () => {
      // Drive condition 0 → x=d1*0=0, y=s3*0=0 → tied
      const result = checkEnemySpeedChase(10, 0, 10, 0, 50, 9);
      expect(result.enemyFaster).toBe(false);
    });
  });
});

// ============================================================================
// SP.FIGHT2.S scavx — Malignite weapon enhancement Y/N prompt parity
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';

describe('SP.FIGHT2.S scavx — Malignite weapon enhancement prompt parity', () => {
  const screenCode = fs.readFileSync(
    path.join(__dirname, '../src/game/screens/combat.ts'),
    'utf-8'
  );
  const navCode = fs.readFileSync(
    path.join(__dirname, '../src/app/routes/navigation.ts'),
    'utf-8'
  );

  // SP.FIGHT2.S:158 — "You found a Malignite weapon enhancement."
  it('combat screen shows Malignite enhancement prompt (SP.FIGHT2.S:158)', () => {
    expect(screenCode).toContain('Malignite weapon enhancement');
    expect(screenCode).toContain('Install even if possibly defective');
  });

  // SP.FIGHT2.S:159 — same prompt for both x=5 and x=9 (player doesn't know which)
  it('pendingWeaponEnhancement map defers resolution until Y/N (SP.FIGHT2.S:159)', () => {
    expect(screenCode).toContain('pendingWeaponEnhancement');
    expect(screenCode).toContain('pendingWeaponEnhancement.set(characterId');
    expect(screenCode).toContain('pendingWeaponEnhancement.get(characterId');
  });

  // SP.FIGHT2.S:160 — N + x=5 (beneficial): "Unlucky choice!....it was a [name]"
  it('N on beneficial enhancement shows "Unlucky choice" (SP.FIGHT2.S:160)', () => {
    expect(screenCode).toContain('Unlucky choice!....it was a');
  });

  // SP.FIGHT2.S:161 — N + x=9 (defective): "Smart move!....it was a [name]"
  it('N on defective enhancement shows "Smart move" (SP.FIGHT2.S:161)', () => {
    expect(screenCode).toContain('Smart move!....it was a');
  });

  // SP.FIGHT2.S:163-164 — Y installs: w1=w1+a or w1=w1-a
  it('Y installs enhancement: weapon strength updated in DB (SP.FIGHT2.S:163-164)', () => {
    expect(screenCode).toContain('weaponStrength: newStrength');
  });

  // SP.FIGHT2.S:165 — scav1: item description printed after Y
  it('Y shows item description and enemy name (SP.FIGHT2.S:165 scav1)', () => {
    expect(screenCode).toContain('.....found in wreckage of');
  });

  // ── SP.END.S pirate lurk (lines 86-98) ─────────────────────────────────
  // SP.END.S: player activates pirate mode (pp=1) with target system (q4=sp).
  // When another player enters that system, SP.PATPIR detects the lurk.
  // Modern equivalent: Character WHERE extraCurricularMode='pirate' AND patrolSector=$dest

  it('navigation arrive checks for lurking human pirates (SP.END.S:86-98)', () => {
    expect(navCode).toContain("extraCurricularMode: 'pirate'");
    expect(navCode).toContain('patrolSector: travelDestination');
  });

  it('lurking pirate triggers CombatSession with pirate ship stats', () => {
    expect(navCode).toContain('lurkingPirate?.ship');
    expect(navCode).toContain("enemyType: 'PIRATE'");
    // Battle factor uses player formula (calculateBattleFactor), not NPC formula
    expect(navCode).toContain('pirateBF');
  });

  it('pirate ambush message matches SP.END.S flavour text (lines 93-95)', () => {
    // SP.END.S:93-95: "Your ship lifts off..." / "Auto-Nav settings guide you to..."
    // / "Where you lie in wait to prey upon the trade routes..."
    // Modern: ambush message references the pirate name + ship
    expect(navCode).toContain('springs from cover');
  });
});

// ── SP.FIGHT1.S:245 ctk4 fuel floor ───────────────────────────────────────
// Original: if f1<2 f1=2   (before f1=int(f1/2))
// Ensures enemy always takes at least 1 fuel even when player has 0 or 1 fuel.
describe('SP.FIGHT1.S:245 — ctk4 fuel floor (if f1<2 f1=2)', () => {
  it('player with 0 fuel: effective fuel clamped to 2, takes 1 fuel', () => {
    const result = calculateTribute(4, 'PATROL', 3, 50000, 0, 0, null, 0);
    expect(result.path).toBe('ALLIANCE_RAID');
    // effectiveFuel = max(0, 2) = 2; fuelTaken = floor(2/2) = 1
    expect(result.fuelLost).toBe(1);
  });

  it('player with 1 fuel: effective fuel clamped to 2, takes 1 fuel', () => {
    const result = calculateTribute(4, 'PATROL', 3, 50000, 1, 0, null, 0);
    expect(result.path).toBe('ALLIANCE_RAID');
    // effectiveFuel = max(1, 2) = 2; fuelTaken = floor(2/2) = 1
    expect(result.fuelLost).toBe(1);
  });

  it('player with 10 fuel: takes half normally (5 fuel)', () => {
    const result = calculateTribute(4, 'PATROL', 3, 50000, 10, 0, null, 0);
    expect(result.fuelLost).toBe(5);
  });

  it('player with 7 fuel: takes floor(7/2)=3 fuel', () => {
    const result = calculateTribute(4, 'PATROL', 3, 50000, 7, 0, null, 0);
    expect(result.fuelLost).toBe(3);
  });
});

// ── SP.FIGHT2.S pirwin:195-220 — player defeat boarding ───────────────────
// Original: if q1>0 → take cargo; elif s1>=2 → take half storage pods; else take half fuel
describe('SP.FIGHT2.S pirwin:195-220 — calculateDefeatConsequences boarding priority', () => {
  it('priority 1: cargo pods taken when player has cargo (q1>0)', () => {
    const result = calculateDefeatConsequences(5, 'Iron Ore', 4, 100, 'Pirate');
    expect(result.cargoLost).toBe(true);
    expect(result.storagePodsLost).toBe(0);
    expect(result.fuelLost).toBe(0);
    expect(result.message).toContain('5 pods');
    expect(result.message).toContain('Iron Ore');
  });

  it('priority 1: cargo message uses fallback "cargo" when manifest is null', () => {
    const result = calculateDefeatConsequences(3, null, 4, 100, 'Brigand');
    expect(result.cargoLost).toBe(true);
    expect(result.message).toContain('cargo');
  });

  it('priority 2: half storage pods taken when no cargo but s1>=2', () => {
    const result = calculateDefeatConsequences(0, null, 6, 100, 'Patrol');
    expect(result.cargoLost).toBe(false);
    // floor(6/2) = 3
    expect(result.storagePodsLost).toBe(3);
    expect(result.fuelLost).toBe(0);
    expect(result.message).toContain('3 storage pods');
  });

  it('priority 2: exactly 2 storage pods — takes 1', () => {
    const result = calculateDefeatConsequences(0, null, 2, 100, 'Reptiloid');
    expect(result.storagePodsLost).toBe(1);
  });

  it('priority 2: 1 storage pod (s1<2) — skips to fuel', () => {
    const result = calculateDefeatConsequences(0, null, 1, 80, 'Pirate');
    expect(result.cargoLost).toBe(false);
    expect(result.storagePodsLost).toBe(0);
    // floor(80/2) = 40
    expect(result.fuelLost).toBe(40);
  });

  it('priority 3: half fuel drained when no cargo and s1<2', () => {
    const result = calculateDefeatConsequences(0, null, 0, 50, 'Brigand');
    expect(result.fuelLost).toBe(25);
    expect(result.cargoLost).toBe(false);
    expect(result.storagePodsLost).toBe(0);
  });

  it('priority 3: player with 1 fuel drains 0 (floor(1/2)=0)', () => {
    const result = calculateDefeatConsequences(0, null, 0, 1, 'Pirate');
    expect(result.fuelLost).toBe(0);
  });

  it('priority 3: player with 0 fuel drains 0', () => {
    const result = calculateDefeatConsequences(0, null, 0, 0, 'Pirate');
    expect(result.fuelLost).toBe(0);
  });
});
