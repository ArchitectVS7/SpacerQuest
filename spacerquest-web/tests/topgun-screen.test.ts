/**
 * SpacerQuest v4.0 - Top Gun Screen Tests (SP.REG.S Library option 8)
 *
 * The screen wraps getTopGunRankings() and renders the result as a terminal display.
 * Accessed via Library option 8 (SP.REG.S line 64: if i=8 f$="topgun":goto libshow).
 * Any key returns to library (original: "setint(1):copy f$:setint(''):goto lib1").
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/game/systems/topgun', () => ({
  getTopGunRankings: vi.fn(),
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
