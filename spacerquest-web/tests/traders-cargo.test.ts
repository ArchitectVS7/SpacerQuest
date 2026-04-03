/**
 * SpacerQuest v4.0 - Traders Cargo Office Tests
 *
 * Tests for SP.CARGO.S cargo dispatch office:
 *   - Space Commandant promotion prompt (lines 32-38)
 *   - Daily upod half-capacity penalty (line 290)
 */

import { describe, it, expect } from 'vitest';
import { calculateUpod } from '../src/game/systems/economy';
import * as fs from 'fs';
import * as path from 'path';

const cargoScreenCode = fs.readFileSync(
  path.join(__dirname, '../src/game/screens/traders-cargo.ts'),
  'utf-8'
);

// ============================================================================
// SP.CARGO.S:32-38 — Space Commandant promotion prompt
// ============================================================================

describe('SP.CARGO.S Space Commandant promotion prompt (lines 32-38)', () => {
  it('checks w1+p1>=50 condition (weaponStrength + shieldStrength)', () => {
    // Original: if ((w1+p1)<50) goto stt0
    expect(cargoScreenCode).toContain('weaponStrength + ship.shieldStrength');
    expect(cargoScreenCode).toContain('>= 50');
  });

  it('guards against missionType===9 (kk=9 skip in original)', () => {
    // Original: if ((w1+p1)<50) or (kk=9) goto stt0
    expect(cargoScreenCode).toContain('missionType !== 9');
  });

  it('guards against LSS Chrysalis life support (left$(l1$,5)="LSS C")', () => {
    // Original: if (left$(l1$,5)="LSS C") goto stt0
    expect(cargoScreenCode).toContain("lifeSupportName?.startsWith('LSS C')");
  });

  it('guards against Astro hull (left$(h1$,3)="Ast")', () => {
    // Original: if (left$(h1$,3)="Ast") goto stt0
    expect(cargoScreenCode).toContain("hullName?.startsWith('Ast')");
  });

  it('shows Space Commandant message when conditions met', () => {
    // Original: print "The Space Commandant wishes to speak to you [Y]/(N):"
    expect(cargoScreenCode).toContain('Space Commandant wishes to speak to you');
  });

  it('uses pendingCommandant state to track prompt (once-per-render)', () => {
    // pendingCommandant Set prevents re-prompt on Y/N handler re-entry
    expect(cargoScreenCode).toContain('pendingCommandant');
  });

  it('navigates to topgun screen on Y response (link "sp.top","wins")', () => {
    // Original: if i$<>"N" print"Yes":link"sp.top","wins"
    expect(cargoScreenCode).toContain("nextScreen: 'topgun'");
  });

  it('falls through to manifest board on N response (print "Not now")', () => {
    // Original: print"Not now" → goto stt0 (manifest board)
    // The commandant handler calls TradersCargoScreen.render() after clearing pending
    expect(cargoScreenCode).toContain('TradersCargoScreen.render(characterId)');
  });
});

// ============================================================================
// SP.CARGO.S upod subroutine daily penalty (line 290)
// Original: y=h2+1:if (t$=da$) and (t1>0) and (jc<1) y=y/2
// ============================================================================

describe('SP.CARGO.S upod — calculateUpod (line 290 daily penalty)', () => {
  it('upod: no halve on first visit (halve=false)', () => {
    // s1=10 pods, h1=5 strength, h2=4 condition → y=5, x=50 → upod=5
    const result = calculateUpod(10, 5, 4, false);
    expect(result).toBe(5); // floor(10 * 5 / 10)
  });

  it('upod: halves effective capacity on second visit same day (t$=da$, t1>0, jc<1)', () => {
    // Same as above but halve=true → y=2.5, x=25 → upod=2
    const result = calculateUpod(10, 5, 4, true);
    expect(result).toBe(2); // floor(floor(10 * 2.5) / 10) = floor(25/10) = 2
  });

  it('upod: returns 1 when no cargo pods (s1<1)', () => {
    expect(calculateUpod(0, 5, 4, false)).toBe(1);
  });

  it('upod: returns 1 when no hull strength (h1<1)', () => {
    expect(calculateUpod(10, 0, 4, false)).toBe(1);
  });

  it('upod: returns 1 when hull condition=0 (h2<1)', () => {
    expect(calculateUpod(10, 5, 0, false)).toBe(1);
  });

  it('upod: minimum result is 1 (x<10 → x=10 → x/10=1)', () => {
    // 1 pod, h2=1 → y=2, x=1*2=2 < 10 → x=10 → upod=1
    expect(calculateUpod(1, 5, 1, false)).toBe(1);
  });

  it('traders-cargo.ts applies halving when manifestDate===today and tripCount>0', () => {
    // Source code check
    expect(cargoScreenCode).toContain('manifestDate === today && character.tripCount > 0');
    expect(cargoScreenCode).toContain('Math.floor(character.ship.maxCargoPods / 2)');
  });

  it('traders-cargo.ts applies daily penalty to both pod check and contract signing', () => {
    // Both the "No servicable cargo pods!" gate and contract-signing upod must use halve
    const halfCount = (cargoScreenCode.match(/Math\.floor\(.*maxCargoPods\s*\/\s*2\)/g) || []).length;
    expect(halfCount).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================================
// SP.CARGO.S:31 — "if q1>0 goto board" redirect check
// ============================================================================

describe('SP.CARGO.S:31 — q1>0 redirect to traders (board)', () => {
  it('render-time check redirects if cargoPods > 0 (no missionType exception)', () => {
    // Original: if q1>0 print "You have a valid contract": goto board
    // Modern code must use: character.cargoPods > 0 (no extra condition)
    // The old "missionType !== 99" exception has been removed — 99 is not a valid missionType.
    expect(cargoScreenCode).toContain('if (character.cargoPods > 0)');
    expect(cargoScreenCode).not.toContain('missionType !== 99');
  });
});

// ============================================================================
// SP.CARGO.S:106 — pz$="" on contract signing (raidDocument clear)
// ============================================================================

describe('SP.CARGO.S:106 — pz$="" clears raidDocument on contract signing', () => {
  it('contract signing update includes raidDocument: null (SP.CARGO.S:106 pz$="")', () => {
    // Original: q1=x:ee=1:pz$="" — clear raid document on contract sign
    expect(cargoScreenCode).toContain('raidDocument: null');
  });

  it('raidDocument null is set in the Y confirmation handler (contract-signing path)', () => {
    // The raidDocument: null must be in the block that writes to prisma on contract acceptance
    const confirmBlock = cargoScreenCode.indexOf("key === 'Y'");
    const raidClearIdx = cargoScreenCode.indexOf('raidDocument: null');
    expect(raidClearIdx).toBeGreaterThan(confirmBlock);
  });
});
