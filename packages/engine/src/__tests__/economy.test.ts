import { describe, it, expect } from 'vitest';
import { generateManifestBoard } from '../economy.js';
import { SeededRng } from '../rng.js';
import { ShipState } from '../types.js';

describe('economy', () => {
  it('generates a deterministic manifest board', () => {
    const rng = new SeededRng(12345);
    const originSystem = 1;
    const shipState = {
      fuel: 100,
      cargoPods: 10,
      hull: { strength: 1, condition: 9 },
      drives: { strength: 10, condition: 9 },
    } as ShipState; // Minimal stub

    const board = generateManifestBoard(originSystem, rng, shipState);

    expect(board.length).toBe(4);
    // Deterministic checks
    expect(board[0].destination).not.toBe(originSystem);
    expect(board[0].payment).toBeGreaterThan(0);
    expect(board[0].pods).toBe(10);
  });
});
