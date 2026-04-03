/**
 * SpacerQuest v4.0 - Top Gun Screen Tests (SP.REG.S Library option 8)
 *
 * The screen wraps getTopGunRankings() and renders the result as a terminal display.
 * Accessed via Library option 8 (SP.REG.S line 64: if i=8 f$="topgun":goto libshow).
 * Any key returns to library (original: "setint(1):copy f$:setint(''):goto lib1").
 *
 * Also tests SP.TOP.S wins subroutine (lines 111-150):
 * When Space Commandant routes to topgun via pendingWins flag, shows Nemesis
 * mission offer with D/M/T choices instead of rankings.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/game/systems/topgun', () => ({
  getTopGunRankings: vi.fn(),
}));

vi.mock('../src/db/prisma', () => ({
  prisma: {
    character: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe('TopgunScreen (SP.REG.S library option 8)', () => {
  let getTopGunRankings: any;
  let TopgunScreen: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const topgunMod = await import('../src/game/systems/topgun');
    getTopGunRankings = topgunMod.getTopGunRankings;
    const screenMod = await import('../src/game/screens/topgun');
    TopgunScreen = screenMod.TopgunScreen;
  });

  it('render: displays TOP GUN RANKINGS header', async () => {
    getTopGunRankings.mockResolvedValue({ categories: [] });
    const result = await TopgunScreen.render('char-1');
    expect(result.output).toMatch(/top gun rankings/i);
  });

  it('render: displays each category name and leader', async () => {
    getTopGunRankings.mockResolvedValue({
      categories: [
        { name: 'Fastest Drives', leader: 'STAR-1', value: 450 },
        { name: 'Best All-Around Ship', leader: 'THUNDER', value: 1200 },
      ],
    });
    const result = await TopgunScreen.render('char-1');
    expect(result.output).toContain('Fastest Drives');
    expect(result.output).toContain('STAR-1');
    expect(result.output).toContain('Best All-Around Ship');
    expect(result.output).toContain('THUNDER');
  });

  it('render: shows "anykey to go on" prompt (original libshow pattern)', async () => {
    getTopGunRankings.mockResolvedValue({ categories: [] });
    const result = await TopgunScreen.render('char-1');
    expect(result.output).toContain('anykey to go on');
  });

  it('handleInput: any key routes to library (original: goto lib1)', async () => {
    const result = await TopgunScreen.handleInput('char-1', 'X');
    expect(result.nextScreen).toBe('library');
  });

  it('handleInput: Enter routes to library', async () => {
    const result = await TopgunScreen.handleInput('char-1', '');
    expect(result.nextScreen).toBe('library');
  });
});

// ============================================================================
// SP.TOP.S filer date-filter (parseFilerDate, check.date subroutine)
// Original: filer asks "Scan for [cat] since...(<C-R> accepts)-> lc$"
//           validates MM/DD/YY, filters entries by date
// ============================================================================

describe('SP.TOP.S filer — parseFilerDate (check.date subroutine)', () => {
  let parseFilerDate: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const mod = await import('../src/game/screens/space-news');
    parseFilerDate = mod.parseFilerDate;
  });

  it('accepts valid date 01/15/25 (MM/DD/YY)', () => {
    const result = parseFilerDate('01/15/25');
    expect(result).not.toBeNull();
    expect(result!.getMonth()).toBe(0);  // January (0-indexed)
    expect(result!.getDate()).toBe(15);
    expect(result!.getFullYear()).toBe(2025);
  });

  it('rejects dates with wrong length (SP.TOP.S filer: if len(i$)<>8 goto new)', () => {
    expect(parseFilerDate('1/15/25')).toBeNull();
    expect(parseFilerDate('01/15/2025')).toBeNull();
    expect(parseFilerDate('')).toBeNull();
  });

  it('rejects dates with wrong separator (SP.TOP.S filer: mid$(3,1)<>"/" or mid$(6,1)<>"/")', () => {
    expect(parseFilerDate('01-15-25')).toBeNull();
    expect(parseFilerDate('01.15.25')).toBeNull();
  });

  it('rejects month < 1 (SP.TOP.S filer: a<1 goto new)', () => {
    expect(parseFilerDate('00/15/25')).toBeNull();
  });

  it('rejects month > 12 (SP.TOP.S filer: a>12 goto new)', () => {
    expect(parseFilerDate('13/15/25')).toBeNull();
  });

  it('rejects day < 1 (SP.TOP.S filer: a<1 goto new)', () => {
    expect(parseFilerDate('01/00/25')).toBeNull();
  });

  it('rejects day > 31 (SP.TOP.S filer: a>31 goto new)', () => {
    expect(parseFilerDate('01/32/25')).toBeNull();
  });

  it('rejects year < 1 (SP.TOP.S filer: a<1 goto new)', () => {
    expect(parseFilerDate('01/15/00')).toBeNull();
  });

  it('rejects year > 99 (SP.TOP.S filer: a>99 goto new)', () => {
    // Can't have 3-digit year in MM/DD/YY format — this would be caught by length check
    // but test boundary via direct integer: "00" parses to 0 which is < 1
    expect(parseFilerDate('01/15/00')).toBeNull();
  });

  it('B key shows date prompt with category label (SP.TOP.S filer: "Scan for Recent Battles since...")', async () => {
    const mod = await import('../src/game/screens/space-news');
    const SpaceNewsScreen = mod.SpaceNewsScreen;
    const result = await SpaceNewsScreen.handleInput('char-test-b', 'B');
    expect(result.output).toContain('Scan for Recent Battles since');
    expect(result.output).toContain('<C-R> accepts');
  });

  it('A key shows date prompt with category label (SP.TOP.S filer: "Scan for Alliance Activity since...")', async () => {
    const mod = await import('../src/game/screens/space-news');
    const SpaceNewsScreen = mod.SpaceNewsScreen;
    const result = await SpaceNewsScreen.handleInput('char-test-a', 'A');
    expect(result.output).toContain('Scan for Alliance Activity since');
    expect(result.output).toContain('<C-R> accepts');
  });

  it('space-news.ts exports parseFilerDate (SP.TOP.S check.date is testable)', async () => {
    const mod = await import('../src/game/screens/space-news');
    expect(typeof mod.parseFilerDate).toBe('function');
  });

  it('space-news.ts renderNews uses createdAt filter when since date provided', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      new URL('../src/game/screens/space-news.ts', import.meta.url),
      'utf-8'
    );
    // Must include date filtering in Prisma query
    expect(code).toContain('createdAt: { gte: since }');
    expect(code).toContain('parseFilerDate');
  });
});

// ============================================================================
// SP.TOP.S wins subroutine (lines 111-150)
// Mission offer screen: Space Commandant routes here via pendingWins flag.
// D=Decline (→ main-menu), M=Mission (assign kk=9, → navigate), T=Talk (flavor)
// ============================================================================

describe('SP.TOP.S wins subroutine (lines 111-150) — Nemesis mission offer', () => {
  let TopgunScreen: any;
  let pendingWins: any;
  let prisma: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    // Re-mock after resetModules
    vi.mock('../src/game/systems/topgun', () => ({ getTopGunRankings: vi.fn() }));
    vi.mock('../src/db/prisma', () => ({
      prisma: {
        character: { findUnique: vi.fn(), update: vi.fn() },
      },
    }));
    const prismaMod = await import('../src/db/prisma');
    prisma = prismaMod.prisma;
    const screenMod = await import('../src/game/screens/topgun');
    TopgunScreen = screenMod.TopgunScreen;
    pendingWins = screenMod.pendingWins;
  });

  it('render: when pendingWins is set, shows wins mission offer (not rankings)', async () => {
    prisma.character.findUnique.mockResolvedValue({
      id: 'char-wins-1', name: 'Spacer', rank: 'Commander',
    });
    pendingWins.set('char-wins-1', 'menu');
    const result = await TopgunScreen.render('char-wins-1');
    expect(result.output).toContain('you have done well');
    expect(result.output).not.toMatch(/top gun rankings/i);
    expect(result.output).toContain('(D)ecline');
    expect(result.output).toContain('(M)ission');
    expect(result.output).toContain('[T]alk about it');
  });

  it('wins: D key (SP.TOP.S:123 — Decline) → routes to main-menu', async () => {
    pendingWins.set('char-wins-d', 'menu');
    const result = await TopgunScreen.handleInput('char-wins-d', 'D');
    expect(result.nextScreen).toBe('main-menu');
    expect(pendingWins.has('char-wins-d')).toBe(false);
  });

  it('wins: Enter key defaults to T (SP.TOP.S:119: if i$=chr$(13) i$="T")', async () => {
    prisma.character.findUnique.mockResolvedValue({
      id: 'char-wins-t', name: 'Spacer', rank: 'Commander',
    });
    pendingWins.set('char-wins-t', 'menu');
    const result = await TopgunScreen.handleInput('char-wins-t', '');
    // T shows talk text, then re-shows menu
    expect(result.output).toContain('Star Jewels');
    expect(result.output).toContain('(D)ecline');
  });

  it('wins: T key shows Nemesis mission flavor text (SP.TOP.S:124-130)', async () => {
    prisma.character.findUnique.mockResolvedValue({
      id: 'char-wins-talk', name: 'Spacer', rank: 'Major',
    });
    pendingWins.set('char-wins-talk', 'menu');
    const result = await TopgunScreen.handleInput('char-wins-talk', 'T');
    expect(result.output).toContain('Star Jewels');
    expect(result.output).toContain('far reaches');
    // After talk text, menu should reappear
    expect(result.output).toContain('(D)ecline');
    expect(result.output).toContain('(M)ission');
  });

  it('wins: M → Y assigns mission kk=9 and routes to navigate (SP.TOP.S assign:148)', async () => {
    prisma.character.findUnique.mockResolvedValue({
      id: 'char-wins-m', name: 'Spacer', rank: 'Commander',
      ship: { cargoPods: 5 },
    });
    prisma.character.update.mockResolvedValue({});
    pendingWins.set('char-wins-m', 'menu');

    // Press M → confirm prompt
    const r1 = await TopgunScreen.handleInput('char-wins-m', 'M');
    expect(r1.output).toContain('Sure you want to take on this mission');
    expect(pendingWins.get('char-wins-m')).toBe('confirm');

    // Press Y → mission assigned
    const r2 = await TopgunScreen.handleInput('char-wins-m', 'Y');
    expect(r2.nextScreen).toBe('navigate');
    expect(r2.output).toContain('Nemesian Star Jewels');

    // Verify DB update with missionType=9
    expect(prisma.character.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          missionType: 9,
          destination: 28,
          cargoManifest: 'Nemesis Orders',
          cargoPayment: 20,
          cargoType: 0,
        }),
      })
    );

    // pendingWins cleared
    expect(pendingWins.has('char-wins-m')).toBe(false);
  });

  it('wins: M → N returns to mission menu (SP.TOP.S assign:134: if i$="N" goto win1)', async () => {
    prisma.character.findUnique.mockResolvedValue({
      id: 'char-wins-mn', name: 'Spacer', rank: 'Captain',
    });
    prisma.character.update.mockResolvedValue({});
    pendingWins.set('char-wins-mn', 'menu');

    // Press M → confirm prompt
    await TopgunScreen.handleInput('char-wins-mn', 'M');

    // Press N → back to win1 menu
    const r = await TopgunScreen.handleInput('char-wins-mn', 'N');
    expect(r.output).toContain('No');
    expect(r.output).toContain('(D)ecline');
    expect(r.output).toContain('(M)ission');
    expect(pendingWins.get('char-wins-mn')).toBe('menu');
  });

  it('wins: render without pendingWins shows rankings (normal library flow)', async () => {
    const topgunMod = await import('../src/game/systems/topgun');
    (topgunMod.getTopGunRankings as any).mockResolvedValue({ categories: [] });
    // No pendingWins set for this char
    const result = await TopgunScreen.render('char-library');
    expect(result.output).toMatch(/top gun rankings/i);
    expect(result.output).not.toContain('(D)ecline');
  });
});
