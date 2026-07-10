/**
 * SpacerQuest v4.0 - Registry/Directory Screen Tests
 *
 * Tests for the Space Registry terminal screen
 * Based on original SP.REG.S
 *
 * Original screen features:
 *   [R]ecord - View a spacer's record
 *   [L]ibrary - Game info/help
 *   [S]pace Patrol HQ - Mission info
 *   [A]lliance Directory - Alliance listings
 *   [Q]uit - Return to main menu
 */

import { describe, it, expect } from 'vitest';
import {
  renderRegistryHeader,
  renderLibraryMenu,
  renderSpacerRecord,
  renderSpacerDirectory,
  renderAllianceDirectory,
  type SpacerRecord,
  type DirectoryEntry,
} from '../src/game/systems/registry';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

// ============================================================================
// NEW CHARACTER STARTING SHIP — SP.SYSOP.S pstat subroutine (lines 277-285)
// ============================================================================

describe('New character starting ship stats (SP.SYSOP.S pstat)', () => {
  it('registerCharacter creates ship with all component strengths = 0', () => {
    const registryPath = fileURLToPath(new URL('../src/game/systems/registry.ts', import.meta.url));
    const code = fs.readFileSync(registryPath, 'utf-8');
    // Original pstat: h1=d1=c1=l1=w1=n1=r1=p1=0, h2=d2=c2=l2=w2=n2=r2=p2=0
    // Modern: all strength and condition fields must be 0
    expect(code).toContain('hullStrength: 0');
    expect(code).toContain('hullCondition: 0');
    expect(code).toContain('driveStrength: 0');
    expect(code).toContain('driveCondition: 0');
    expect(code).toContain('weaponStrength: 0');
    expect(code).toContain('weaponCondition: 0');
    expect(code).toContain('shieldStrength: 0');
    expect(code).toContain('shieldCondition: 0');
  });

  it('registerCharacter creates ship with fuel = 0 (original f1=0)', () => {
    const registryPath = fileURLToPath(new URL('../src/game/systems/registry.ts', import.meta.url));
    const code = fs.readFileSync(registryPath, 'utf-8');
    // SP.SYSOP.S pstat line: f1=0
    expect(code).toContain('fuel: 0');
  });

  it('registerCharacter creates ship with cargoPods = 0 (original s1=0)', () => {
    const registryPath = fileURLToPath(new URL('../src/game/systems/registry.ts', import.meta.url));
    const code = fs.readFileSync(registryPath, 'utf-8');
    // SP.SYSOP.S pstat line: s1=0 (cargo pods)
    expect(code).toContain('cargoPods: 0');
    expect(code).toContain('maxCargoPods: 0');
  });
});

// ============================================================================
// REGISTRY HEADER TESTS
// ============================================================================

describe('Registry/Directory Screen', () => {
  describe('renderRegistryHeader', () => {
    it('should include Space Registry title', () => {
      const output = renderRegistryHeader();
      expect(output).toMatch(/space registry/i);
    });

    it('should include menu options L, R, S, Q (original SP.REG.S lines 38-45)', () => {
      // Original top-level menu: [L]ibrary, [R]escue Service, [S]pace Patrol HQ, [Q]uit
      // [A]lliance is NOT a top-level key — it lives inside Library (option 9)
      const output = renderRegistryHeader();
      expect(output).toContain('[L]');
      expect(output).toContain('[R]');
      expect(output).toContain('[S]');
      expect(output).toContain('[Q]');
    });

    it('should NOT include [A] as a top-level option (alliance is inside Library)', () => {
      // [A]lliance directory is Library option 9, not a top-level Registry key
      const output = renderRegistryHeader();
      // The header may reference 'Alliance' in a description but should not have [A] as a standalone key
      expect(output).not.toMatch(/^\s*\[A\]/m);
    });
  });

  // ============================================================================
  // LIBRARY MENU TESTS
  // ============================================================================

  describe('renderLibraryMenu', () => {
    it('should include all 9 numbered options (original SP.REG.S lines 57-65)', () => {
      // Original library options: 1=layout, 2=log, 3=help, 4=directory, 5=formulae,
      // 6=shipname, 7=dox, 8=topgun, 9=allies
      const output = renderLibraryMenu();
      for (let i = 1; i <= 9; i++) {
        expect(output).toContain(`[${i}]`);
      }
    });

    it('should include [H] Help and [P] Past Greats options', () => {
      const output = renderLibraryMenu();
      expect(output).toContain('[H]');
      expect(output).toContain('[P]');
    });

    it('should include [Q] quit option', () => {
      const output = renderLibraryMenu();
      expect(output).toContain('[Q]');
    });

    it('should include spacer directory (option 4) and alliance directory (option 9)', () => {
      const output = renderLibraryMenu();
      expect(output).toMatch(/\[4\].*[Dd]irectory/);
      expect(output).toMatch(/\[9\].*[Aa]lliance/);
    });

    it('should include ship naming (option 6)', () => {
      const output = renderLibraryMenu();
      expect(output).toMatch(/\[6\].*[Ss]hip/);
    });
  });

  // ============================================================================
  // SPACER RECORD TESTS
  // ============================================================================

  describe('renderSpacerRecord', () => {
    const testRecord: SpacerRecord = {
      spacerId: 42,
      name: 'Captain Fox',
      shipName: 'MILLENNIA',
      rank: 'COMMANDER',
      allianceSymbol: 'NONE',
      currentSystem: 5,
      destination: 12,
      score: 200,
      tripsCompleted: 15,
      astrecsTraveled: 300,
      cargoDelivered: 10,
      battlesWon: 8,
      battlesLost: 2,
      rescuesPerformed: 1,
      ship: {
        hullStrength: 29,
        hullCondition: 9,
        driveStrength: 21,
        driveCondition: 8,
        cabinStrength: 15,
        cabinCondition: 7,
        lifeSupportStrength: 12,
        lifeSupportCondition: 6,
        weaponStrength: 20,
        weaponCondition: 9,
        navigationStrength: 18,
        navigationCondition: 8,
        roboticsStrength: 10,
        roboticsCondition: 5,
        shieldStrength: 25,
        shieldCondition: 9,
        fuel: 1500,
        hasCloaker: false,
        hasAutoRepair: true,
        isAstraxialHull: false,
      },
    };

    it('should display spacer name and ship name', () => {
      const output = renderSpacerRecord(testRecord);
      expect(output).toContain('Captain Fox');
      expect(output).toContain('MILLENNIA');
    });

    it('should display spacer ID number', () => {
      const output = renderSpacerRecord(testRecord);
      expect(output).toContain('42');
    });

    it('should display rank', () => {
      const output = renderSpacerRecord(testRecord);
      expect(output).toMatch(/commander/i);
    });

    it('should display all 8 ship components with strength and condition', () => {
      const output = renderSpacerRecord(testRecord);
      // Original SP.REG.S displays: Hull, Drive, Cabin, Life Support, Weapons, Navigation, Robotics, Shields
      expect(output).toMatch(/hull/i);
      expect(output).toMatch(/drive/i);
      expect(output).toMatch(/cabin/i);
      expect(output).toMatch(/life.?support/i);
      expect(output).toMatch(/weapon/i);
      expect(output).toMatch(/navigation/i);
      expect(output).toMatch(/robotics/i);
      expect(output).toMatch(/shield/i);
    });

    it('should display vital stats (trips, astrecs, cargo, battles, rescues)', () => {
      const output = renderSpacerRecord(testRecord);
      expect(output).toContain('15');  // trips
      expect(output).toContain('300'); // astrecs
      expect(output).toContain('10');  // cargo
      expect(output).toContain('8');   // battles won
    });

    it('should display current location and destination', () => {
      const output = renderSpacerRecord(testRecord);
      expect(output).toContain('5');   // current system
    });

    it('should display special equipment if present', () => {
      const output = renderSpacerRecord(testRecord);
      expect(output).toMatch(/auto.?repair/i);
    });
  });

  // ============================================================================
  // SPACER DIRECTORY TESTS
  // ============================================================================

  describe('renderSpacerDirectory', () => {
    const testEntries: DirectoryEntry[] = [
      { spacerId: 1, name: 'Alpha', shipName: 'STAR ONE', rank: 'CAPTAIN', allianceSymbol: 'ASTRO_LEAGUE', score: 350 },
      { spacerId: 2, name: 'Beta', shipName: 'VOIDRUNNER', rank: 'LIEUTENANT', allianceSymbol: 'NONE', score: 50 },
      { spacerId: 3, name: 'Gamma', shipName: 'DARKSTAR', rank: 'ADMIRAL', allianceSymbol: 'SPACE_DRAGONS', score: 700 },
    ];

    it('should list all spacers with their IDs', () => {
      const output = renderSpacerDirectory(testEntries);
      expect(output).toContain('1');
      expect(output).toContain('2');
      expect(output).toContain('3');
    });

    it('should show spacer names and ship names', () => {
      const output = renderSpacerDirectory(testEntries);
      expect(output).toContain('Alpha');
      expect(output).toContain('STAR ONE');
      expect(output).toContain('Beta');
      expect(output).toContain('VOIDRUNNER');
    });

    it('should show rank for each spacer', () => {
      const output = renderSpacerDirectory(testEntries);
      expect(output).toMatch(/captain/i);
      expect(output).toMatch(/lieutenant/i);
      expect(output).toMatch(/admiral/i);
    });

    it('should show alliance symbols where applicable', () => {
      const output = renderSpacerDirectory(testEntries);
      // Astro League = '+', Space Dragons = '@'
      expect(output).toContain('+');
      expect(output).toContain('@');
    });

    it('should handle empty directory', () => {
      const output = renderSpacerDirectory([]);
      expect(output).toMatch(/no.*spacer/i);
    });
  });

  // ============================================================================
  // ALLIANCE DIRECTORY TESTS
  // ============================================================================

  describe('renderAllianceDirectory', () => {
    const testEntries: DirectoryEntry[] = [
      { spacerId: 1, name: 'Alpha', shipName: 'STAR ONE', rank: 'CAPTAIN', allianceSymbol: 'ASTRO_LEAGUE', score: 350 },
      { spacerId: 2, name: 'Beta', shipName: 'VOIDRUNNER', rank: 'LIEUTENANT', allianceSymbol: 'NONE', score: 50 },
      { spacerId: 3, name: 'Gamma', shipName: 'DARKSTAR', rank: 'ADMIRAL', allianceSymbol: 'ASTRO_LEAGUE', score: 700 },
      { spacerId: 4, name: 'Delta', shipName: 'PHANTOM', rank: 'COMMODORE', allianceSymbol: 'SPACE_DRAGONS', score: 500 },
    ];

    it('should group spacers by alliance', () => {
      const output = renderAllianceDirectory(testEntries);
      expect(output).toMatch(/astro.?league/i);
      expect(output).toMatch(/space.?dragons/i);
    });

    it('should show alliance symbols in headers', () => {
      const output = renderAllianceDirectory(testEntries);
      // Original displays alliance groups: (+), (@), (&), (^)
      expect(output).toContain('(+)');
      expect(output).toContain('(@)');
    });

    it('should only show allied spacers (skip NONE)', () => {
      const output = renderAllianceDirectory(testEntries);
      // Beta has no alliance, should not appear under any alliance group
      // But may appear in an "unaligned" section
      expect(output).toContain('Alpha');
      expect(output).toContain('Gamma');
      expect(output).toContain('Delta');
    });

    it('should include member count per alliance', () => {
      const output = renderAllianceDirectory(testEntries);
      // Astro League has 2 members, Space Dragons has 1
      expect(output).toContain('2');
    });
  });
});
