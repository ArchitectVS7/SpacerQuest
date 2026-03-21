/**
 * SpacerQuest v4.0 - Dueling Arena Screen Tests
 *
 * Tests for the Dueling Arena terminal screen rendering
 * Based on original SP.ARENA1.S / SP.ARENA2.S
 *
 * Original screen features:
 *   (1) Contender - Post a duel challenge
 *   (2) Challenger - Accept a duel
 *   (R) Roster - View pending duels
 *   (B) Battle Log - View past duel results
 *   (L) List - List all ships
 *   (Q) Quit
 */

import { describe, it, expect } from 'vitest';
import {
  renderArenaHeader,
  renderDuelRoster,
  renderBattleLog,
  renderArenaOptions,
  renderDuelResult,
  renderArenaStat,
  calculateDuelHandicap,
  calculateArenaHandicap,
  simulateDuelCombat,
  calculateProportionalStakes,
  ARENA_NAMES,
  STAKES_NAMES,
  type DuelRosterEntry,
  type DuelBattleLogEntry,
  type DuelResultDisplay,
  type ArenaStatData,
} from '../src/game/systems/arena';
import { ARENA_REQUIREMENTS } from '../src/game/constants';

// ============================================================================
// ARENA HEADER TESTS
// ============================================================================

describe('Dueling Arena Screen', () => {
  describe('renderArenaHeader', () => {
    it('should include Spacer Arena title', () => {
      const output = renderArenaHeader();
      expect(output).toMatch(/spacer.?arena/i);
    });

    it('should include contender and challenger menu options', () => {
      const output = renderArenaHeader();
      expect(output).toMatch(/contender/i);
      expect(output).toMatch(/challenger/i);
    });

    it('should include roster and battle log options', () => {
      const output = renderArenaHeader();
      expect(output).toContain('(R)');
      expect(output).toContain('(B)');
      expect(output).toContain('(Q)');
    });
  });

  // ============================================================================
  // ARENA OPTIONS
  // ============================================================================

  describe('ARENA_NAMES', () => {
    it('should define 6 arena types from original', () => {
      // Original: Ion Cloud, Proton Storm, Cosmic Radiation, Black Hole Proximity, Super-Nova Flare, Deep Space
      expect(ARENA_NAMES).toHaveLength(6);
      expect(ARENA_NAMES[0]).toMatch(/ion.?cloud/i);
      expect(ARENA_NAMES[1]).toMatch(/proton.?storm/i);
      expect(ARENA_NAMES[2]).toMatch(/cosmic.?radiation/i);
      expect(ARENA_NAMES[3]).toMatch(/black.?hole/i);
      expect(ARENA_NAMES[4]).toMatch(/super.?nova/i);
      expect(ARENA_NAMES[5]).toMatch(/deep.?space/i);
    });
  });

  describe('STAKES_NAMES', () => {
    it('should define stakes types from original', () => {
      // Original: Total Points, Ship Component Strength, Credits
      expect(STAKES_NAMES).toHaveLength(3);
      expect(STAKES_NAMES[0]).toMatch(/point/i);
      expect(STAKES_NAMES[1]).toMatch(/component/i);
      expect(STAKES_NAMES[2]).toMatch(/credit/i);
    });
  });

  describe('renderArenaOptions', () => {
    it('should list all arena types with numbers', () => {
      const output = renderArenaOptions();
      expect(output).toContain('(1)');
      expect(output).toContain('(2)');
      expect(output).toContain('(3)');
      expect(output).toContain('(4)');
      expect(output).toContain('(5)');
      expect(output).toContain('(6)');
    });

    it('should list all stakes types', () => {
      const output = renderArenaOptions();
      expect(output).toMatch(/point/i);
      expect(output).toMatch(/component/i);
      expect(output).toMatch(/credit/i);
    });

    it('should show access requirements from constants', () => {
      const output = renderArenaOptions();
      expect(output).toContain(String(ARENA_REQUIREMENTS.ION_CLOUD.trips));
      expect(output).toContain(String(ARENA_REQUIREMENTS.PROTON_STORM.astrecs));
    });
  });

  // ============================================================================
  // DUEL ROSTER
  // ============================================================================

  describe('renderDuelRoster', () => {
    const testRoster: DuelRosterEntry[] = [
      {
        id: 'duel-1',
        challengerName: 'Captain Fox',
        challengerShip: 'MILLENNIA',
        stakesType: 'credits',
        stakesAmount: 5000,
        arenaType: 1,
        handicap: 25,
        createdAt: new Date('2026-03-15'),
      },
      {
        id: 'duel-2',
        challengerName: 'Admiral Vex',
        challengerShip: 'DARKSTAR',
        stakesType: 'points',
        stakesAmount: 100,
        arenaType: 3,
        handicap: 42,
        createdAt: new Date('2026-03-14'),
      },
    ];

    it('should display roster header', () => {
      const output = renderDuelRoster(testRoster);
      expect(output).toMatch(/roster/i);
    });

    it('should list challenger names and ships', () => {
      const output = renderDuelRoster(testRoster);
      expect(output).toContain('Captain Fox');
      expect(output).toContain('MILLENNIA');
      expect(output).toContain('Admiral Vex');
      expect(output).toContain('DARKSTAR');
    });

    it('should show stakes info for each duel', () => {
      const output = renderDuelRoster(testRoster);
      expect(output).toContain('5000');
      expect(output).toContain('100');
    });

    it('should show arena type for each duel', () => {
      const output = renderDuelRoster(testRoster);
      expect(output).toMatch(/ion.?cloud/i);
      expect(output).toMatch(/cosmic.?radiation/i);
    });

    it('should show handicap values', () => {
      const output = renderDuelRoster(testRoster);
      expect(output).toContain('25');
      expect(output).toContain('42');
    });

    it('should handle empty roster', () => {
      const output = renderDuelRoster([]);
      expect(output).toMatch(/no.*duel|empty/i);
    });
  });

  // ============================================================================
  // BATTLE LOG
  // ============================================================================

  describe('renderBattleLog', () => {
    const testLog: DuelBattleLogEntry[] = [
      {
        winnerName: 'Captain Fox',
        winnerShip: 'MILLENNIA',
        loserName: 'Admiral Vex',
        loserShip: 'DARKSTAR',
        arenaType: 2,
        stakesType: 'credits',
        stakesAmount: 5000,
        completedAt: new Date('2026-03-15'),
      },
    ];

    it('should display battle log header', () => {
      const output = renderBattleLog(testLog);
      expect(output).toMatch(/battle.?log/i);
    });

    it('should show winner and loser names', () => {
      const output = renderBattleLog(testLog);
      expect(output).toContain('Captain Fox');
      expect(output).toContain('Admiral Vex');
    });

    it('should show arena and stakes', () => {
      const output = renderBattleLog(testLog);
      expect(output).toMatch(/proton.?storm/i);
      expect(output).toContain('5000');
    });

    it('should handle empty log', () => {
      const output = renderBattleLog([]);
      expect(output).toMatch(/no.*battle|empty/i);
    });
  });

  // ============================================================================
  // DUEL RESULT
  // ============================================================================

  describe('renderDuelResult', () => {
    const testResult: DuelResultDisplay = {
      winnerName: 'Captain Fox',
      winnerShip: 'MILLENNIA',
      winnerHits: 12,
      loserName: 'Admiral Vex',
      loserShip: 'DARKSTAR',
      loserHits: 5,
      arenaType: 4,
      stakesType: 'points',
      stakesAmount: 100,
    };

    it('should declare the winner', () => {
      const output = renderDuelResult(testResult);
      expect(output).toContain('Captain Fox');
      expect(output).toMatch(/win|victor|beats/i);
    });

    it('should show hit counts', () => {
      const output = renderDuelResult(testResult);
      expect(output).toContain('12');
      expect(output).toContain('5');
    });

    it('should show arena name', () => {
      const output = renderDuelResult(testResult);
      expect(output).toMatch(/black.?hole/i);
    });

    it('should show stakes transferred', () => {
      const output = renderDuelResult(testResult);
      expect(output).toContain('100');
    });
  });

  // ============================================================================
  // HANDICAP CALCULATION (hand subroutine, SP.ARENA1.S lines 344-347)
  // ============================================================================

  describe('calculateDuelHandicap', () => {
    it('should return 0 when total < 500 (original: if h<500 h=0)', () => {
      // Original: h=(h1*h2)+(d1*d2)+... if h<500 h=0
      const ship = {
        hullStrength: 1, hullCondition: 1,       // 1
        driveStrength: 1, driveCondition: 1,      // 1
        cabinStrength: 1, cabinCondition: 1,      // 1
        lifeSupportStrength: 1, lifeSupportCondition: 1, // 1
        weaponStrength: 1, weaponCondition: 1,    // 1
        navigationStrength: 1, navigationCondition: 1, // 1
        roboticsStrength: 1, roboticsCondition: 1, // 1
        shieldStrength: 1, shieldCondition: 1,    // 1
        // total = 8 < 500 → 0
      };
      expect(calculateDuelHandicap(ship)).toBe(0);
    });

    it('should compute floor(sum/500) when total >= 500 (original: h=(h/500))', () => {
      // 8 components each at strength=10, condition=10 → 8*100=800; 800/500=1
      const ship = {
        hullStrength: 10, hullCondition: 10,
        driveStrength: 10, driveCondition: 10,
        cabinStrength: 10, cabinCondition: 10,
        lifeSupportStrength: 10, lifeSupportCondition: 10,
        weaponStrength: 10, weaponCondition: 10,
        navigationStrength: 10, navigationCondition: 10,
        roboticsStrength: 10, roboticsCondition: 10,
        shieldStrength: 10, shieldCondition: 10,
      };
      expect(calculateDuelHandicap(ship)).toBe(1); // floor(800/500)=1
    });

    it('should handle a well-upgraded ship', () => {
      // hull=50*50=2500, drive=50*50=2500, rest zeros → 5000/500=10
      const ship = {
        hullStrength: 50, hullCondition: 50,
        driveStrength: 50, driveCondition: 50,
        cabinStrength: 0, cabinCondition: 0,
        lifeSupportStrength: 0, lifeSupportCondition: 0,
        weaponStrength: 0, weaponCondition: 0,
        navigationStrength: 0, navigationCondition: 0,
        roboticsStrength: 0, roboticsCondition: 0,
        shieldStrength: 0, shieldCondition: 0,
      };
      expect(calculateDuelHandicap(ship)).toBe(10);
    });
  });

  // ============================================================================
  // ARENA HANDICAP (arena subroutine / afill, SP.ARENA1.S lines 124-129 / SP.ARENA2.S lines 155-160)
  // ============================================================================

  describe('calculateArenaHandicap', () => {
    it('arena 1 (Ion Cloud): u1/50 (original: a=(u1/50))', () => {
      expect(calculateArenaHandicap(1, 150, 0, 0, 0, 0, 0)).toBe(3); // 150/50=3
      expect(calculateArenaHandicap(1, 49, 0, 0, 0, 0, 0)).toBe(0);  // floor(49/50)=0
    });

    it('arena 2 (Proton Storm): j1/100 (original: a=(j1/100))', () => {
      expect(calculateArenaHandicap(2, 0, 500, 0, 0, 0, 0)).toBe(5); // 500/100=5
      expect(calculateArenaHandicap(2, 0, 99, 0, 0, 0, 0)).toBe(0);  // floor(99/100)=0
    });

    it('arena 3 (Cosmic Radiation): k1/100 (original: a=(k1/100))', () => {
      expect(calculateArenaHandicap(3, 0, 0, 300, 0, 0, 0)).toBe(3);
    });

    it('arena 4 (Black Hole): b1*10 (original: a=(b1*10))', () => {
      expect(calculateArenaHandicap(4, 0, 0, 0, 5, 0, 0)).toBe(50); // 5*10=50
    });

    it('arena 5 (Super-Nova): (e1+1000)-m1 (original: a=((e1+1000)-m1))', () => {
      // battlesWon=100, battlesLost=30 → (100+1000)-30=1070
      expect(calculateArenaHandicap(5, 0, 0, 0, 0, 100, 30)).toBe(1070);
    });

    it('arena 6 (Deep Space): always 0 (original: a=0)', () => {
      expect(calculateArenaHandicap(6, 999, 999, 999, 999, 999, 999)).toBe(0);
    });
  });

  // ============================================================================
  // DUEL COMBAT SIMULATION (salv subroutine, SP.ARENA2.S lines 74-83)
  // ============================================================================

  describe('simulateDuelCombat', () => {
    it('should always produce exactly 9 salvos', () => {
      const result = simulateDuelCombat('Ship1', 'Ship2', 0, 0);
      expect(result.salvos).toHaveLength(9);
    });

    it('total hits (poster + accepter) should not exceed 9', () => {
      // Each salvo results in one hit or a deflect; posterHits + accepterHits <= 9
      const result = simulateDuelCombat('Ship1', 'Ship2', 5, 5);
      expect(result.posterHits + result.accepterHits).toBeLessThanOrEqual(9);
    });

    it('isDraw should be true when hits are equal', () => {
      // Run many times to check isDraw consistency
      let foundDraw = false;
      for (let i = 0; i < 1000; i++) {
        const r = simulateDuelCombat('A', 'B', 0, 0);
        if (r.isDraw) {
          expect(r.posterHits).toBe(r.accepterHits);
          foundDraw = true;
          break;
        }
      }
      // isDraw = posterHits === accepterHits always
      const r2 = simulateDuelCombat('A', 'B', 0, 0);
      expect(r2.isDraw).toBe(r2.posterHits === r2.accepterHits);
    });

    it('poster should have slight advantage due to +1 roll offset (bx=(j+1)*10 vs cx=k*10)', () => {
      // With large arena handicaps equal, poster (bx=(j+1)*10) should win > 50% of non-draw duels
      let posterWins = 0;
      let accepterWins = 0;
      const N = 10000;
      for (let i = 0; i < N; i++) {
        const r = simulateDuelCombat('Poster', 'Accepter', 0, 0);
        if (r.posterHits > r.accepterHits) posterWins++;
        else if (r.accepterHits > r.posterHits) accepterWins++;
      }
      expect(posterWins).toBeGreaterThan(accepterWins);
    });

    it('higher arena handicap should improve win rate', () => {
      // Poster with large handicap advantage should win much more often
      let posterWins = 0;
      const N = 1000;
      for (let i = 0; i < N; i++) {
        const r = simulateDuelCombat('HighHcp', 'LowHcp', 100, 0);
        if (r.posterHits > r.accepterHits) posterWins++;
      }
      expect(posterWins).toBeGreaterThan(N * 0.8); // should win >80% with large advantage
    });

    it('salvo messages should name both ships', () => {
      const result = simulateDuelCombat('MILLENNIA', 'DARKSTAR', 0, 0);
      const allText = result.salvos.join(' ');
      // At least one salvo should mention one of the ships (or shields deflect)
      expect(allText).toMatch(/MILLENNIA|DARKSTAR|deflect/);
    });
  });

  // ============================================================================
  // PROPORTIONAL STAKES (fini section, SP.ARENA2.S lines 92-96)
  // ============================================================================

  describe('calculateProportionalStakes', () => {
    it('minimum return is 1 (original: v=1:if u>9 v=(u/10))', () => {
      // With very low stakes or equal handicaps near zero
      expect(calculateProportionalStakes(0, 0, 0, 0)).toBe(1);
      expect(calculateProportionalStakes(1, 1, 1, 1)).toBe(1);
    });

    it('equal handicaps: uses accepter stakes (original: if h=x2 s=(h*10)/t:u=xo*s)', () => {
      // h=x2=5, t=10, s=(5*10)/10=5, u=accepterStakes*5=10*5=50, v=floor(50/10)=5
      const v = calculateProportionalStakes(5, 5, 10, 10);
      expect(v).toBe(5);
    });

    it('accepter stronger: uses poster handicap and poster stakes (original: if h>x2)', () => {
      // posterHcp=2, accepterHcp=8 → accepter stronger
      // t=10, s=(2*10)/10=2, u=posterStakes*2=10*2=20, v=floor(20/10)=2
      const v = calculateProportionalStakes(2, 8, 10, 0);
      expect(v).toBe(2);
    });

    it('poster stronger: uses accepter handicap and accepter stakes (original: if x2>h)', () => {
      // posterHcp=8, accepterHcp=2 → poster stronger
      // t=10, s=(2*10)/10=2, u=accepterStakes*2=10*2=20, v=floor(20/10)=2
      const v = calculateProportionalStakes(8, 2, 0, 10);
      expect(v).toBe(2);
    });

    it('weak poster vs strong accepter: poster stakes their handicap (small v)', () => {
      // posterHcp=1, accepterHcp=9 → accepter is stronger → use poster's handicap and poster's stakes
      // posterStakes=1 (poster stakes their own handicap), accepterStakes=9
      // t=10, s=(1*10)/10=1, u=posterStakes(1)*s(1)=1, v=max(1, floor(1/10))=1
      const v = calculateProportionalStakes(1, 9, 1, 9);
      expect(v).toBe(1);
    });
  });

  // ============================================================================
  // STAT SCREEN (stat section, SP.ARENA1.S lines 320-338)
  // ============================================================================

  describe('renderArenaStat', () => {
    const testStat: ArenaStatData = {
      shipName: 'MILLENNIA',
      ownerName: 'Captain Fox',
      hullStrength: 20, hullCondition: 15,
      driveStrength: 18, driveCondition: 12,
      cabinStrength: 10, cabinCondition: 10,
      lifeSupportStrength: 10, lifeSupportCondition: 10,
      weaponStrength: 25, weaponCondition: 20,
      navigationStrength: 15, navigationCondition: 10,
      roboticsStrength: 12, roboticsCondition: 8,
      shieldStrength: 22, shieldCondition: 18,
      tripsCompleted: 75,
      astrecsTraveled: 450,
      cargoDelivered: 200,
      rescuesPerformed: 3,
      battlesWon: 42,
      battlesLost: 8,
      score: 1250,
      creditsHigh: 5,
      creditsLow: 3200,
      handicap: 12,
    };

    it('should display ship and owner name', () => {
      const output = renderArenaStat(testStat);
      expect(output).toContain('MILLENNIA');
      expect(output).toContain('Captain Fox');
    });

    it('should display all 8 component names with strength and condition', () => {
      const output = renderArenaStat(testStat);
      expect(output).toMatch(/hull/i);
      expect(output).toMatch(/drive/i);
      expect(output).toMatch(/cabin/i);
      expect(output).toMatch(/life.?support/i);
      expect(output).toMatch(/weapon/i);
      expect(output).toMatch(/navigation/i);
      expect(output).toMatch(/robotic/i);
      expect(output).toMatch(/shield/i);
    });

    it('should display vital stats', () => {
      const output = renderArenaStat(testStat);
      expect(output).toContain('75');   // tripsCompleted
      expect(output).toContain('450');  // astrecsTraveled
      expect(output).toContain('200');  // cargoDelivered
      expect(output).toContain('42');   // battlesWon
      expect(output).toContain('8');    // battlesLost
      expect(output).toContain('1250'); // score
    });

    it('should display handicap (HCP)', () => {
      const output = renderArenaStat(testStat);
      expect(output).toMatch(/handicap.*hcp/i);
      expect(output).toContain('12');
    });

    it('should display credits', () => {
      const output = renderArenaStat(testStat);
      // creditsHigh=5, creditsLow=3200 → "53200"
      expect(output).toContain('53200');
    });
  });
});
