/**
 * SpacerQuest v4.0 - SP.BAR.S Fidelity Tests
 *
 * Verifies the Spacers Hangout screen implementation matches SP.BAR.S.
 * Tests cover:
 * 1. Menu structure (original: G/D/I/Q only)
 * 2. Info broker — interactive keyword input
 * 3. Drink counter (dz) — gates hint display
 * 4. hd counter — "have another drink" after 4 unknowns
 * 5. Brig listing and two-step bail confirmation
 * 6. Alliance via Info → ALL keyword path
 * 7. Smuggling completion (gain section) check in render
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { calculateSmugglingContract } from '../src/game/systems/economy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hangoutCode = fs.readFileSync(
  path.join(__dirname, '../src/game/screens/spacers-hangout.ts'),
  'utf-8'
);

// ============================================================================
// 1. MENU STRUCTURE — SP.BAR.S:52
// Original: "(G)amble (D)rinks (I)nfo [Q]uit" — no A or N
// ============================================================================

describe('SP.BAR.S Menu Structure', () => {
  it('hangout menu contains original G/D/I/Q options', () => {
    // Original SP.BAR.S:52
    expect(hangoutCode).toContain("(G)");
    expect(hangoutCode).toContain("(D)");
    expect(hangoutCode).toContain("(I)");
    expect(hangoutCode).toContain("[Q]");
  });

  it('case G routes to pub (gambling)', () => {
    // SP.BAR.S:57 — link"sp.game"
    expect(hangoutCode).toContain("case 'G':");
    expect(hangoutCode).toContain("nextScreen: 'pub'");
  });

  it('case D increments drink counter (dz)', () => {
    // SP.BAR.S:58 — dz=dz+1
    expect(hangoutCode).toContain("case 'D':");
    expect(hangoutCode).toContain('drinkCount');
    expect(hangoutCode).toContain('Slurp! Guzzle! Barf!');
  });

  it('case Q exits to main-menu', () => {
    // SP.BAR.S:55 — "Leaving": goto linker
    expect(hangoutCode).toContain("case 'Q':");
    expect(hangoutCode).toContain("nextScreen: 'main-menu'");
    expect(hangoutCode).toContain('Leaving');
  });
});

// ============================================================================
// 2. INFO BROKER — SP.BAR.S:59,61-96
// Original: interactive text input "What info do you need?"
// ============================================================================

describe('SP.BAR.S Info Broker', () => {
  it('case I sets pendingInfoInput and prompts "What info do you need?"', () => {
    // SP.BAR.S:65 — input@2 "What info do you need? "
    expect(hangoutCode).toContain("case 'I':");
    expect(hangoutCode).toContain('pendingInfoInput');
    expect(hangoutCode).toContain('What info do you need?');
  });

  it('drink counter is reset to 0 when entering info', () => {
    // SP.BAR.S:64 — dz=0
    // After entering info, drinkCount is set to 0
    expect(hangoutCode).toContain('drinkCount.set(characterId, 0)');
  });

  it('info handler processes keyword WIS → "Try Polaris-1"', () => {
    // SP.BAR.S:68 — if instr("WIS",i$) print"Try Polaris-1"
    expect(hangoutCode).toContain('Try Polaris-1');
  });

  it('info handler processes keyword SAG → "Try Mizar-9"', () => {
    // SP.BAR.S:69
    expect(hangoutCode).toContain('Try Mizar-9');
  });

  it('info handler processes keyword WEA → "Star Buster is the Big Gun"', () => {
    // SP.BAR.S:75
    expect(hangoutCode).toContain('Star Buster is the Big Gun');
  });

  it('info handler processes keyword SHI → "ARCH-ANGEL Shield is the best"', () => {
    // SP.BAR.S:76
    expect(hangoutCode).toContain('ARCH-ANGEL Shield is the best');
  });

  it('info handler processes keyword COO → MALIGNA coordinates', () => {
    // SP.BAR.S:84 — "MALIGNA's coordinates are 13-33-99"
    expect(hangoutCode).toContain("MALIGNA's coordinates are 13-33-99");
  });

  it('info handler processes keyword BAT → B/F definition', () => {
    // SP.BAR.S:87 — "B/F = Hull/Rank/Drives/#Trips/Life/#Wins"
    expect(hangoutCode).toContain('B/F = Hull/Rank/Drives/#Trips/Life/#Wins');
  });

  it('info handler processes keyword RAI → routes to raid screen', () => {
    // SP.BAR.S:67 — if instr("RAI",i$) goto raid
    expect(hangoutCode).toContain("nextScreen: 'raid'");
    expect(hangoutCode).toContain("action: 'raid'");
  });

  it('info handler processes keyword ALL → alliance sub-menu', () => {
    // SP.BAR.S:71 — if instr("ALL",i$) goto nfm
    expect(hangoutCode).toContain("action: 'nfm'");
    expect(hangoutCode).toContain('Looking for an alliance with someone');
  });

  it('info handler processes keyword SMU → smuggling info', () => {
    // SP.BAR.S:91 — if instr("SMU",i$) goto smug
    expect(hangoutCode).toContain("action: 'smug'");
    expect(hangoutCode).toContain('Smuggling pays big bucks');
  });

  it('unknown info queries increment hd counter', () => {
    // SP.BAR.S:95 — hd=hd+1
    expect(hangoutCode).toContain('infoHdCount');
    expect(hangoutCode).toContain("Don't know what you're talking about");
  });

  it('hd counter >4 triggers "have another drink" message', () => {
    // SP.BAR.S:95 — "if hd>4 hd=0: print '...have another drink...spacer!'"
    expect(hangoutCode).toContain("Why don't you have another drink");
  });
});

// ============================================================================
// 3. DRINK COUNTER (dz) — SP.BAR.S:62-64
// ============================================================================

describe('SP.BAR.S Drink Counter', () => {
  it('drinkCount Map is defined as module state', () => {
    // SP.BAR.S:27 — ee=0:dz=0:yt=0
    expect(hangoutCode).toContain('drinkCount = new Map');
  });

  it('info display shows first hint row when dz > 4', () => {
    // SP.BAR.S:62 — if dz>4 print chr$(7);"ALL MAL GIR WIN..."
    expect(hangoutCode).toContain('dz > 4');
    expect(hangoutCode).toContain('ALL MAL GIR WIN WEA SHI PIR FIR RAI STA RIM GEM SAG');
  });

  it('info display shows second hint row when dz > 8', () => {
    // SP.BAR.S:63 — if dz>8 print chr$(7);"DRI ROB NAV..."
    expect(hangoutCode).toContain('dz > 8');
    expect(hangoutCode).toContain('DRI ROB NAV LIF HUL COO CLO RAN BAT SPA SMU CHR WIS');
  });
});

// ============================================================================
// 4. BRIG VIEWING AND BAIL — SP.BAR.S:300-379
// ============================================================================

describe('SP.BAR.S Brig and Bail', () => {
  it('case B shows brig listing using crimeType query', () => {
    // SP.BAR.S:307-318
    expect(hangoutCode).toContain("case 'B':");
    expect(hangoutCode).toContain('crimeType');
    expect(hangoutCode).toContain('locked up');
  });

  it('brig shows "The Brig is vacant right now" when empty', () => {
    // SP.BAR.S:327
    expect(hangoutCode).toContain('The Brig is vacant right now');
  });

  it('brig shows scurvy lot message when prisoners exist', () => {
    // SP.BAR.S:326
    expect(hangoutCode).toContain("That's the scurvy lot of them");
  });

  it('brig sub-menu has L/B/Q options', () => {
    // SP.BAR.S:331 — "(L)ook 'em over again  (B)ail out convict  (Q)uit"
    expect(hangoutCode).toContain("(L)ook 'em over again  (B)ail out convict  (Q)uit");
    expect(hangoutCode).toContain('inBrigMenu');
  });

  it('bail flow has first confirmation step "Bail out this miscreant?"', () => {
    // SP.BAR.S:345 — "Bail out this miscreant? [Y]/(N)"
    expect(hangoutCode).toContain('Bail out this miscreant?');
    expect(hangoutCode).toContain("confirm_bail");
  });

  it('bail flow has second confirmation step "Bail is set at X cr...pay it?"', () => {
    // SP.BAR.S:350 — "Bail is set at i$,000 cr......pay it? [Y]/(N)"
    expect(hangoutCode).toContain('Bail is set at');
    expect(hangoutCode).toContain("confirm_payment");
  });

  it('bail execution calls calculateBailCost and releasePlayer', () => {
    // SP.BAR.S:365 — lw=len(j$):lw=lw-2:j$=right$(j$,lw)
    expect(hangoutCode).toContain('calculateBailCost');
    expect(hangoutCode).toContain('releasePlayer');
  });

  it('empty cell returns "That cell is empty!" message', () => {
    // SP.BAR.S:343
    expect(hangoutCode).toContain('That cell is empty!');
  });

  it('bail completion shows "The prisoner is free to go"', () => {
    // SP.BAR.S:375 — "Bail paid for iq$ j$....The prisoner is free to go"
    expect(hangoutCode).toContain('The prisoner is free to go');
  });

  it('pendingBailPrompt state variable exists', () => {
    expect(hangoutCode).toContain('pendingBailPrompt');
  });
});

// ============================================================================
// 5. ALLIANCE VIA INFO → ALL — SP.BAR.S:98-160
// ============================================================================

describe('SP.BAR.S Alliance (via Info → ALL)', () => {
  it('alliance selection symbols +/@/&/^ are handled', () => {
    // SP.BAR.S:142-146
    expect(hangoutCode).toContain("case '+':");
    expect(hangoutCode).toContain("case '@':");
    expect(hangoutCode).toContain("case '&':");
    expect(hangoutCode).toContain("case '^':");
  });

  it('pendingAllianceSwitch Map is used for join confirmation', () => {
    // SP.BAR.S:139-157 — asks [Y]/(N) before joining
    expect(hangoutCode).toContain('pendingAllianceSwitch');
    expect(hangoutCode).toContain('new Map');
  });

  it('Y case executes switch: zeros credits, deletes ports, upserts membership', () => {
    // SP.BAR.S:116 — g1=0:g2=0:gosub crfix
    expect(hangoutCode).toContain("case 'Y':");
    expect(hangoutCode).toContain('creditsHigh: 0');
    expect(hangoutCode).toContain('creditsLow: 0');
    expect(hangoutCode).toContain('portOwnership.deleteMany');
    expect(hangoutCode).toContain('allianceMembership.upsert');
  });

  it('N case cancels alliance switch', () => {
    expect(hangoutCode).toContain("case 'N':");
    expect(hangoutCode).toContain('pendingAllianceSwitch.delete(characterId)');
  });

  it('canJoinAlliance is called for rank and size checks', () => {
    // SP.BAR.S:99,166
    expect(hangoutCode).toContain('canJoinAlliance');
  });

  it('joining prompts "Join [alliance]? (Y)es (N)o"', () => {
    // SP.BAR.S:156
    expect(hangoutCode).toContain('Join ${allianceInfo.name}? (Y)es (N)o');
  });

  it('switching costs all credits and port ownership', () => {
    // SP.BAR.S:110-111
    expect(hangoutCode).toContain('all your credits to switch alliances');
  });
});

// ============================================================================
// 6. SMUGGLING COMPLETION (GAIN) — SP.BAR.S:45-46, 247-264
// ============================================================================

describe('SP.BAR.S Smuggling Completion (Gain)', () => {
  it('render checks for completed smuggling mission (missionType 5, cargoType < 1)', () => {
    // SP.BAR.S:45 — "if (q2<1) and (kk=5) print 'They're waiting for you in back!': goto gain"
    expect(hangoutCode).toContain('missionType === 5');
    expect(hangoutCode).toContain('cargoType < 1');
  });

  it('gain1: successful delivery shows cargo invoice and pay message', () => {
    // SP.BAR.S:255-258
    expect(hangoutCode).toContain("They're waiting for you in back!");
    expect(hangoutCode).toContain("You hand over the cargo invoice");
    expect(hangoutCode).toContain("smuggled goods");
    expect(hangoutCode).toContain("cargoPayment");
  });

  it('gain2: failed delivery shows "Where\'s da goods?" message', () => {
    // SP.BAR.S:250-252
    expect(hangoutCode).toContain("Where's da goods");
    expect(hangoutCode).toContain("Ya gotta learn to deliver");
  });

  it('gain section resets mission state: missionType=0, cargoType=0, etc.', () => {
    // SP.BAR.S:263-264 — q1=0:q2=0:q3=0:q5=0:q6=0:q2$="":q4$="" kk=0
    expect(hangoutCode).toContain('missionType: 0');
    expect(hangoutCode).toContain('cargoType: 0');
    expect(hangoutCode).toContain('cargoPods: 0');
    expect(hangoutCode).toContain('cargoPayment: 0');
    expect(hangoutCode).toContain('cargoManifest: null');
  });
});

// ============================================================================
// SP.BAR.S:32-37 — Sun-3 Entry Sub-Menu (H/B/Q)
// Original: "if sp$<>"Sun-3" goto hanger"
//           "print Spacers: [H]angout  (B)rig  (Q)uit:"
// ============================================================================

describe('SP.BAR.S Sun-3 Entry Sub-Menu (lines 32-37)', () => {
  it('render shows Sun-3 entry sub-menu with H/B/Q options', () => {
    // SP.BAR.S line 33: "Spacers: [H]angout  (B)rig  (Q)uit:"
    expect(hangoutCode).toContain('inSun3EntryMenu');
    expect(hangoutCode).toContain('[H]');
    expect(hangoutCode).toContain('(B)rig');
    expect(hangoutCode).toContain('(Q)uit');
  });

  it('entry sub-menu is set in render before showing hangout (inSun3EntryMenu.add)', () => {
    // The render function must set inSun3EntryMenu BEFORE returning sub-menu output
    expect(hangoutCode).toContain('inSun3EntryMenu.add(characterId)');
  });

  it('handleInput Priority 0 handles inSun3EntryMenu state before other flows', () => {
    // Must be checked before smuggling/bail/brig states
    const priority0Idx = hangoutCode.indexOf('inSun3EntryMenu.has(characterId)');
    const smugIdx = hangoutCode.indexOf('Priority 1: Smuggling');
    expect(priority0Idx).toBeGreaterThan(0);
    expect(priority0Idx).toBeLessThan(smugIdx);
  });

  it("entry sub-menu Q key returns nextScreen: 'main-menu'", () => {
    // SP.BAR.S line 35: "if i$='Q' print 'Leaving': goto linker"
    const entryBlock = hangoutCode.slice(
      hangoutCode.indexOf('inSun3EntryMenu.has(characterId)'),
      hangoutCode.indexOf('Priority 1: Smuggling'),
    );
    expect(entryBlock).toContain("nextScreen: 'main-menu'");
  });

  it('entry sub-menu B key calls showBrig', () => {
    // SP.BAR.S line 34: "if i$='B' print 'Visiting The Brig': goto brig"
    const entryBlock = hangoutCode.slice(
      hangoutCode.indexOf('inSun3EntryMenu.has(characterId)'),
      hangoutCode.indexOf('Priority 1: Smuggling'),
    );
    expect(entryBlock).toContain('showBrig(characterId)');
  });

  it('entry sub-menu H key calls renderHangoutContent', () => {
    // SP.BAR.S: default (H/Enter) → goto hanger then begin
    const entryBlock = hangoutCode.slice(
      hangoutCode.indexOf('inSun3EntryMenu.has(characterId)'),
      hangoutCode.indexOf('Priority 1: Smuggling'),
    );
    expect(entryBlock).toContain('renderHangoutContent(characterId)');
  });

  it('render skips entry sub-menu when kk=5 (smuggling mission: if kk=5 goto begin)', () => {
    // SP.BAR.S line 30: "if kk=5 goto begin" — skips sub-menu
    // Modern: missionType === 5 → renderHangoutContent directly
    expect(hangoutCode).toContain('missionType === 5');
    const renderBlock = hangoutCode.slice(
      hangoutCode.indexOf('render: async'),
      hangoutCode.indexOf('handleInput: async'),
    );
    // Should call renderHangoutContent early for smuggling
    expect(renderBlock).toContain('renderHangoutContent(characterId)');
  });

  it('renderHangoutContent is a module-level helper function', () => {
    expect(hangoutCode).toContain('async function renderHangoutContent(');
  });
});

// ============================================================================
// calculateSmugglingContract (SP.BAR.S smug subroutine lines 213-245)
// ============================================================================

describe('calculateSmugglingContract (SP.BAR.S:213-245)', () => {
  // SP.BAR.S:227 — if i>14: "Space Patrol snooping about...Nothing here!"
  it('roll > 14 returns intercepted (Space Patrol snooping)', () => {
    const result = calculateSmugglingContract(1, 5, 5, 5, 15);
    expect(result.intercepted).toBe(true);
  });

  it('roll = 20 returns intercepted', () => {
    const result = calculateSmugglingContract(1, 5, 5, 5, 20);
    expect(result.intercepted).toBe(true);
  });

  // SP.BAR.S:225 — if i=sp i=20 (same system → snooping)
  it('roll matching current system is rerouted to 20 → intercepted', () => {
    // Current system = 5, roll = 5 → redirected to 20 → intercepted
    const result = calculateSmugglingContract(5, 5, 5, 5, 5);
    expect(result.intercepted).toBe(true);
  });

  it('roll <= 14 and not current system returns valid contract', () => {
    const result = calculateSmugglingContract(1, 5, 5, 5, 7);
    expect(result.intercepted).toBe(false);
    expect(result.destinationSystemId).toBe(7);
    expect(result.distance).toBeGreaterThan(0);
    expect(result.fuelRequired).toBeGreaterThan(0);
    expect(result.payment).toBeGreaterThan(0);
  });

  // SP.BAR.S:233 — x=(14000+(100*y))-(h1*500); if x<1 x=500
  it('payment formula: 14000 + 100*distance - h1*500', () => {
    // System 1 to system 10 = distance 9; hullStrength=5
    // payment = 14000 + 100*9 - 5*500 = 14000 + 900 - 2500 = 12400
    const result = calculateSmugglingContract(1, 5, 5, 5, 10);
    expect(result.payment).toBe(12400);
  });

  it('payment clamped to 500 when formula gives negative result', () => {
    // hullStrength=30, distance=1: 14000 + 100 - 30*500 = 14100 - 15000 = -900 → 500
    const result = calculateSmugglingContract(1, 30, 5, 5, 2);
    expect(result.payment).toBe(500);
    expect(result.lowPayWarning).toBe(true);
  });

  it('smuggling contract setup guard fields are present in screen code', () => {
    // SP.BAR.S:216 — if s1<10 "not enough cargo pods"
    expect(hangoutCode).toContain('cargoPods < 10');
    // SP.BAR.S:215 — if (z1>2) or (nj>2) → syndicate closed
    expect(hangoutCode).toContain('tripCount > 2');
    // SP.BAR.S:217-218 — if q1>0 and q2$="Contraband"
    expect(hangoutCode).toContain("'Contraband'");
    // SP.BAR.S:223 — if ye>0 i=20 (already got a contract this session)
    expect(hangoutCode).toContain('smugYe');
    // SP.BAR.S:241-244 — contract fields set on acceptance
    expect(hangoutCode).toContain('missionType: 5');
    expect(hangoutCode).toContain("cargoManifest: 'Contraband'");
  });
});
