/**
 * SpacerQuest v4.0 - SP.LINK Module Fidelity Tests
 *
 * Verifies the main menu (SP.LINK.txt) implementation:
 * - X key: Ship Stats display (lines 39, 163-185)
 * - Z key: Player Statz display (lines 40, 114-136)
 * - 0 key: Rescue Service routing (lines 41, 59-87)
 * - Lost-in-space guard (line 45: if ap>0)
 * - Self-rescue cost formula (line 61: xo=20000:if sc<20 xo=(sc*1000))
 */

import { describe, it, expect } from 'vitest';
import { calculateSelfRescueCost } from '../src/game/constants';

// ============================================================================
// SELF-RESCUE COST FORMULA (SP.LINK.txt line 61)
// ============================================================================

describe('calculateSelfRescueCost', () => {
  it('returns sc*1000 when sc < 20 (SP.LINK.txt line 61)', () => {
    // sc = floor(score/150)
    // score=150 → sc=1 → cost=1000
    expect(calculateSelfRescueCost(150)).toBe(1000);
  });

  it('scales with score up to the cap', () => {
    // score=300 → sc=2 → cost=2000
    expect(calculateSelfRescueCost(300)).toBe(2000);
    // score=750 → sc=5 → cost=5000
    expect(calculateSelfRescueCost(750)).toBe(5000);
    // score=2700 → sc=18 → cost=18000
    expect(calculateSelfRescueCost(2700)).toBe(18000);
  });

  it('caps at 20000 when sc >= 20 (SP.LINK.txt line 61)', () => {
    // score=3000 → sc=20 → cost=20000
    expect(calculateSelfRescueCost(3000)).toBe(20000);
    // score=9999 → sc>>20 → still capped at 20000
    expect(calculateSelfRescueCost(9999)).toBe(20000);
  });

  it('returns 0 for a new player with no score', () => {
    // score=0 → sc=0 → cost=0 (no rescue needed for a new player anyway)
    expect(calculateSelfRescueCost(0)).toBe(0);
  });
});

// ============================================================================
// MAIN MENU X KEY (Ship Stats) — SP.LINK.txt line 39
// ============================================================================

describe('Main Menu X key (Ship Stats)', () => {
  it('main-menu source handles X key for ship stats', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/game/screens/main-menu.ts', import.meta.url),
      'utf-8'
    );
    expect(code).toContain("key === 'X'");
    expect(code).toContain("Ship's Stats");
  });

  it('main-menu menu display includes [X] Ship Stats option', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/game/screens/main-menu.ts', import.meta.url),
      'utf-8'
    );
    expect(code).toContain('[X] Ship');
  });
});

// ============================================================================
// MAIN MENU Z KEY (Player Statz) — SP.LINK.txt line 40
// ============================================================================

describe('Main Menu Z key (Player Statz)', () => {
  it('main-menu source handles Z key for player statz', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/game/screens/main-menu.ts', import.meta.url),
      'utf-8'
    );
    expect(code).toContain("key === 'Z'");
    expect(code).toContain('Statz');
  });

  it('statz display includes all required fields from original', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/game/screens/main-menu.ts', import.meta.url),
      'utf-8'
    );
    // SP.LINK.txt lines 119-135: all stat fields
    expect(code).toContain('shipName');
    expect(code).toContain('rank');
    expect(code).toContain('tripsCompleted');
    expect(code).toContain('battlesWon');
    expect(code).toContain('battlesLost');
    expect(code).toContain('astrecsTraveled');
    expect(code).toContain('cargoDelivered');
    expect(code).toContain('rescuesPerformed');
    expect(code).toContain('score');
    expect(code).toContain('tripCount');
  });
});

// ============================================================================
// MAIN MENU 0 KEY (Rescue Service) — SP.LINK.txt lines 41, 59-87
// ============================================================================

describe('Main Menu 0 key (Rescue Service)', () => {
  it("main-menu source routes '0' to rescue-self screen", async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/game/screens/main-menu.ts', import.meta.url),
      'utf-8'
    );
    expect(code).toContain("key === '0'");
    expect(code).toContain("nextScreen: 'rescue-self'");
  });

  it('rescue-self screen exists in the screen registry', async () => {
    const { screens } = await import('../src/sockets/screen-router');
    expect(screens['rescue-self']).toBeDefined();
    expect(screens['rescue-self'].render).toBeTypeOf('function');
    expect(screens['rescue-self'].handleInput).toBeTypeOf('function');
  });

  it('rescue-self screen blocks rescue when player is not lost', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/game/screens/rescue-self.ts', import.meta.url),
      'utf-8'
    );
    // SP.LINK.txt line 60: if ap<1 print "You have no need for Rescue Service!"
    expect(code).toContain('isLost');
    expect(code).toContain('no need for Rescue Service');
  });

  it('rescue-self screen uses calculateSelfRescueCost formula', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/game/screens/rescue-self.ts', import.meta.url),
      'utf-8'
    );
    expect(code).toContain('calculateSelfRescueCost');
  });

  it('rescue-self clears isLost on successful rescue', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/game/screens/rescue-self.ts', import.meta.url),
      'utf-8'
    );
    // SP.LINK.txt line 80: close:ap=0 — clear lost state
    expect(code).toContain('isLost: false');
  });
});

// ============================================================================
// LOST IN SPACE GUARD — SP.LINK.txt line 45
// ============================================================================

describe('Lost in Space guard (SP.LINK.txt line 45)', () => {
  it("main-menu source checks isLost before allowing navigation", async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/game/screens/main-menu.ts', import.meta.url),
      'utf-8'
    );
    // SP.LINK.txt line 45: if ap>0 print"...Lost In Space!"
    expect(code).toContain('isLost');
    expect(code).toContain('Lost In Space');
  });

  it('lost-in-space notice is shown in menu render when isLost=true', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/game/screens/main-menu.ts', import.meta.url),
      'utf-8'
    );
    expect(code).toContain('lostNotice');
    expect(code).toContain('LOST IN SPACE');
  });

  it('navigation options (B/S/P/T/N) come after the isLost check', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/game/screens/main-menu.ts', import.meta.url),
      'utf-8'
    );
    // The lost-in-space guard must appear before the nav actions table
    const lostGuardPos = code.indexOf('character?.isLost');
    const navActionsPos = code.indexOf("nextScreen: 'bank'");
    expect(lostGuardPos).toBeGreaterThan(0);
    expect(navActionsPos).toBeGreaterThan(lostGuardPos);
  });
});

// ============================================================================
// CARGO DISPATCH GUARDS — SP.LINK.txt lkcargo lines 227-228
// ============================================================================

describe('Cargo Dispatch T key guards (SP.LINK.txt lkcargo)', () => {
  it('T key guard: blocks access when hullStrength < 1 with "A space ship is required!"', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/game/screens/main-menu.ts', import.meta.url),
      'utf-8'
    );
    // SP.LINK.txt line 227: if h1<1 print "A space ship is required!":goto linker
    expect(code).toContain('hullStrength < 1');
    expect(code).toContain('A space ship is required!');
  });

  it('T key guard: blocks access when cargoPods < 1 with "You have no pods"', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/game/screens/main-menu.ts', import.meta.url),
      'utf-8'
    );
    // SP.LINK.txt line 228: if s1<1 print "You have no pods":goto linker
    expect(code).toContain('cargoPods < 1');
    expect(code).toContain('You have no pods');
  });

  it('T key guard: hull check precedes pods check (original order)', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/game/screens/main-menu.ts', import.meta.url),
      'utf-8'
    );
    // SP.LINK.txt line 227 (hull) comes before line 228 (pods)
    const hullCheckPos = code.indexOf('hullStrength < 1');
    const podsCheckPos = code.indexOf('cargoPods < 1');
    expect(hullCheckPos).toBeGreaterThan(0);
    expect(podsCheckPos).toBeGreaterThan(hullCheckPos);
  });
});
