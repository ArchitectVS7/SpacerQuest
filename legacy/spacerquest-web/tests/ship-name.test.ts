/**
 * SpacerQuest v4.0 - Ship Naming Screen Tests (SP.REG.S shipname subroutine)
 *
 * Tests for the terminal ship naming screen (Library option 6).
 *
 * Original SP.REG.S shipname subroutine (lines 98-129):
 *   - Length: 3-15 chars
 *   - No "THE " prefix (or exact "THE")
 *   - No alliance symbol suffix (+/@/&/^) — must visit Spacers Hangout first
 *   - Confirm Y/N before saving
 *   - Q/empty = "No changes made" → library
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('../src/db/prisma', () => ({
  prisma: {
    character: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe('ShipNameScreen (SP.REG.S shipname subroutine)', () => {
  let prisma: any;
  let ShipNameScreen: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const prismaMod = await import('../src/db/prisma');
    prisma = prismaMod.prisma;
    const mod = await import('../src/game/screens/ship-name');
    ShipNameScreen = mod.ShipNameScreen;
  });

  const CHARACTER_ID = 'char-1';

  function mockCharacter(shipName: string | null) {
    prisma.character.findUnique.mockResolvedValue({ shipName });
    prisma.character.update.mockResolvedValue({ shipName });
  }

  // ── render ─────────────────────────────────────────────────────────────────

  it('render: shows current ship name', async () => {
    mockCharacter('STARBLAZER');
    const result = await ShipNameScreen.render(CHARACTER_ID);
    expect(result.output).toContain('STARBLAZER');
  });

  it('render: shows "(unnamed)" when ship has no name', async () => {
    mockCharacter(null);
    const result = await ShipNameScreen.render(CHARACTER_ID);
    expect(result.output).toContain('unnamed');
  });

  it('render: shows input prompt', async () => {
    mockCharacter('VOIDRUNNER');
    const result = await ShipNameScreen.render(CHARACTER_ID);
    expect(result.output).toContain('Enter the new name');
  });

  // ── Q/empty → no changes ─────────────────────────────────────────────────

  it('Q input: returns "No changes made" and routes to library (SP.REG.S line 108)', async () => {
    mockCharacter('STARBLAZER');
    const result = await ShipNameScreen.handleInput(CHARACTER_ID, 'Q');
    expect(result.output).toContain('No changes made');
    expect(result.nextScreen).toBe('library');
  });

  it('empty input: returns "No changes made" and routes to library', async () => {
    mockCharacter('STARBLAZER');
    const result = await ShipNameScreen.handleInput(CHARACTER_ID, '');
    expect(result.output).toContain('No changes made');
    expect(result.nextScreen).toBe('library');
  });

  // ── length validation ─────────────────────────────────────────────────────

  it('2-char name: rejected with "3-15 characters" (SP.REG.S line 110)', async () => {
    mockCharacter('STARBLAZER');
    const result = await ShipNameScreen.handleInput(CHARACTER_ID, 'AB');
    expect(result.output).toContain('3-15 characters');
    expect(result.nextScreen).toBeUndefined();
  });

  it('16-char name: rejected with "3-15 characters"', async () => {
    mockCharacter('STARBLAZER');
    const result = await ShipNameScreen.handleInput(CHARACTER_ID, 'A'.repeat(16));
    expect(result.output).toContain('3-15 characters');
    expect(result.nextScreen).toBeUndefined();
  });

  it('3-char name: accepted (minimum length)', async () => {
    mockCharacter('STARBLAZER');
    const result = await ShipNameScreen.handleInput(CHARACTER_ID, 'ACE');
    // Should NOT reject with length error
    expect(result.output).not.toContain('3-15 characters');
  });

  it('15-char name: accepted (maximum length)', async () => {
    mockCharacter('STARBLAZER');
    const result = await ShipNameScreen.handleInput(CHARACTER_ID, 'A'.repeat(15));
    expect(result.output).not.toContain('3-15 characters');
  });

  // ── "THE " prefix check ───────────────────────────────────────────────────

  it('"THE STAR" rejected: "No \'THE\' allowed!" (SP.REG.S line 112)', async () => {
    mockCharacter('STARBLAZER');
    const result = await ShipNameScreen.handleInput(CHARACTER_ID, 'THE STAR');
    expect(result.output).toMatch(/No.*THE.*allowed/i);
    expect(result.nextScreen).toBeUndefined();
  });

  it('"THE" (3 chars) rejected: no THE prefix (SP.REG.S instr check)', async () => {
    mockCharacter('STARBLAZER');
    const result = await ShipNameScreen.handleInput(CHARACTER_ID, 'THE');
    expect(result.output).toMatch(/No.*THE.*allowed/i);
    expect(result.nextScreen).toBeUndefined();
  });

  it('"THEORY" not rejected: only "THE " prefix blocked', async () => {
    mockCharacter('STARBLAZER');
    const result = await ShipNameScreen.handleInput(CHARACTER_ID, 'THEORY');
    expect(result.output).not.toMatch(/No.*THE.*allowed/i);
  });

  // ── alliance symbol suffix check ─────────────────────────────────────────

  it.each(['+', '@', '&', '^'])(
    'name ending with "%s" rejected: "Seek out the Spacers Hangout" (SP.REG.S lines 115-121)',
    async (symbol) => {
      mockCharacter('STARBLAZER');
      const result = await ShipNameScreen.handleInput(CHARACTER_ID, `STAR${symbol}`);
      expect(result.output).toContain('Spacers Hangout');
      expect(result.nextScreen).toBeUndefined();
    }
  );

  it('name not ending in alliance symbol: proceeds normally', async () => {
    mockCharacter('STARBLAZER');
    const result = await ShipNameScreen.handleInput(CHARACTER_ID, 'VOIDRUNNER');
    expect(result.output).not.toContain('Spacers Hangout');
  });

  // ── confirmation flow ─────────────────────────────────────────────────────

  it('valid name: shows confirmation prompt (SP.REG.S lines 125-126)', async () => {
    mockCharacter('STARBLAZER');
    const result = await ShipNameScreen.handleInput(CHARACTER_ID, 'VOIDRUNNER');
    expect(result.output).toContain('Henceforth');
    expect(result.output).toContain('VOIDRUNNER');
    expect(result.output).toContain('[Y]/(N)');
    expect(result.nextScreen).toBeUndefined(); // stays in screen for Y/N
  });

  it('Y after valid name: saves to DB and routes to library (SP.REG.S line 128-129)', async () => {
    mockCharacter('STARBLAZER');
    // Enter name
    await ShipNameScreen.handleInput(CHARACTER_ID, 'VOIDRUNNER');
    // Confirm Y
    const result = await ShipNameScreen.handleInput(CHARACTER_ID, 'Y');
    expect(prisma.character.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ shipName: 'VOIDRUNNER' }),
      })
    );
    expect(result.nextScreen).toBe('library');
  });

  it('Enter (default) after valid name: saves and routes to library', async () => {
    mockCharacter('STARBLAZER');
    await ShipNameScreen.handleInput(CHARACTER_ID, 'VOIDRUNNER');
    const result = await ShipNameScreen.handleInput(CHARACTER_ID, '');
    expect(prisma.character.update).toHaveBeenCalled();
    expect(result.nextScreen).toBe('library');
  });

  it('N after valid name: re-prompts for new name (SP.REG.S line 127: goto shipname)', async () => {
    mockCharacter('STARBLAZER');
    // Enter name
    await ShipNameScreen.handleInput(CHARACTER_ID, 'VOIDRUNNER');
    // Reject with N
    const result = await ShipNameScreen.handleInput(CHARACTER_ID, 'N');
    expect(result.output).toContain('No');
    expect(result.output).toContain('Enter the new name'); // re-prompt
    expect(result.nextScreen).toBeUndefined();
    expect(prisma.character.update).not.toHaveBeenCalled();
  });
});

// ============================================================================
// SP.YARD.S alliance ship-name suffix — hull replacement parity
// SP.YARD.S:323: if b=1 s1=0:gosub shipname
//   → before prompt, reads zn (alliance suffix) from right$(nz$,2)
//   → after confirmation, appends: if zn=1 nz$=nz$+"-+" etc.
//
// Modern architecture: allianceSymbol stored separately in Character.allianceSymbol
// (NOT embedded in shipName), so hull replacement can NEVER strip the suffix.
// SP.YARD.S parity: upgrades.ts purchaseShipComponent does NOT modify allianceSymbol.
// ============================================================================

describe('SP.YARD.S alliance suffix after hull replacement parity', () => {
  it('upgrades.ts purchaseShipComponent does not modify allianceSymbol (suffix always preserved)', () => {
    const upgradesCode = fs.readFileSync(
      path.join(__dirname, '../src/game/systems/upgrades.ts'),
      'utf-8'
    );
    // purchaseShipComponent should never touch allianceSymbol
    expect(upgradesCode).not.toContain('allianceSymbol');
  });

  it('schema stores allianceSymbol as separate field on Character (not embedded in shipName)', () => {
    const schemaCode = fs.readFileSync(
      path.join(__dirname, '../prisma/schema.prisma'),
      'utf-8'
    );
    expect(schemaCode).toContain('allianceSymbol');
    expect(schemaCode).toContain('shipName');
    // shipName and allianceSymbol are distinct fields — suffix cannot be lost on rename
    const allianceSymbolLine = schemaCode.split('\n').find(l => l.includes('allianceSymbol') && l.includes('AllianceType'));
    expect(allianceSymbolLine).toBeDefined();
  });

  it('ship-name.ts notes architectural deviation: allianceSymbol is separate (SP.YARD.S zn preservation)', () => {
    const shipNameCode = fs.readFileSync(
      path.join(__dirname, '../src/game/screens/ship-name.ts'),
      'utf-8'
    );
    // Comment in ship-name.ts documents the architectural equivalence
    expect(shipNameCode).toContain('allianceSymbol');
  });
});
