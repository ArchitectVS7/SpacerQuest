import { describe, it, expect } from 'vitest';
import { distance } from '@spacerquest/content';
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

  it('prices manifests from non-core origins with starmap distance', () => {
    const rng = new SeededRng(12345);
    const originSystem = 21;
    const shipState = {
      fuel: 100,
      cargoPods: 10,
      hull: { strength: 1, condition: 9 },
      drives: { strength: 10, condition: 9 },
    } as ShipState; // Minimal stub

    const board = generateManifestBoard(originSystem, rng, shipState);

    expect(distance(21, 5)).toBe(46);
    expect(board[0]).toMatchObject({
      destination: 5,
      cargoType: 9,
      pods: 10,
      payment: 5390,
    });
  });
});
