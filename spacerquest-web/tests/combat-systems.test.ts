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

  describe('Component Damage Cascade', () => {
    it('should damage components in specific order: Cabin -> Nav -> Drives -> Shields -> LifeSupport', () => {
      const ship: ShipStats = {
        weaponStrength: 10, weaponCondition: 5,
        shieldStrength: 10, shieldCondition: 1,
        cabinStrength: 10, cabinCondition: 2,
        roboticsStrength: 10, roboticsCondition: 5,
        lifeSupportStrength: 10, lifeSupportCondition: 3,
        navigationStrength: 10, navigationCondition: 4,
        driveStrength: 10, driveCondition: 2,
        hasAutoRepair: false,
      };

      // 1st damage: Cabin (2 -> 1)
      let result = applySystemDamage(ship, 1);
      expect(result.updatedShip.cabinCondition).toBe(1);
      expect(result.updatedShip.navigationCondition).toBe(4); // Nav undisturbed

      // 2nd damage: Cabin (1 -> 0)
      result = applySystemDamage(result.updatedShip, 1);
      expect(result.updatedShip.cabinCondition).toBe(0);

      // 3rd damage: Nav (4 -> 3)
      result = applySystemDamage(result.updatedShip, 1);
      expect(result.updatedShip.navigationCondition).toBe(3);
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
  });
});
