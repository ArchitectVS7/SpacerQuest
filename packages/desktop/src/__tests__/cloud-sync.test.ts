// ============================================================================
//  T-1702 · Steam Cloud round-trip — byte-exact write→clear→read of the T-1002
//  seed-carrying `sq.save.v1` envelope, with an in-memory fake cloud (CI, no Steam).
// ============================================================================
//
// The ONLY engine use here is OFFLINE save-fixture construction (createInitialState →
// startDay → createSave), the same sanctioned allowance the electron specs stand on.

import { describe, expect, it } from 'vitest';
import { createInitialState, startDay, createSave, loadSave } from '@spacerquest/engine';
import type { SteamBackend } from '../steam';
import { CLOUD_SAVE_FILE } from '../steam';
import { SAVE_KEY, importEnvelopeFromCloud, syncEnvelopeToCloud } from '../cloud-sync';

/** In-memory fake of the native Steam cloud + achievements. */
function fakeBackend(): SteamBackend & { cloud: Map<string, string> } {
  const cloud = new Map<string, string>();
  return {
    cloud,
    unlock() {},
    setRichPresence() {},
    cloudWrite(name, content) {
      cloud.set(name, content);
    },
    cloudRead(name) {
      return cloud.has(name) ? (cloud.get(name) as string) : null;
    },
  };
}

/** A real, seed-carrying T-1002 envelope (createSave output). */
function buildEnvelope(seed: number): string {
  return createSave(startDay(createInitialState(seed)).state, seed);
}

describe('Steam Cloud round-trip for the save envelope', () => {
  it('write → clear local → import restores the exact same blob, seed intact', () => {
    const backend = fakeBackend();
    const seed = 4242;
    const envelope = buildEnvelope(seed);
    const store: Record<string, string> = { [SAVE_KEY]: envelope };

    // Mirror to cloud on autosave.
    syncEnvelopeToCloud(store, backend);
    expect(backend.cloud.get(CLOUD_SAVE_FILE)).toBe(envelope);

    // Fresh machine: local envelope absent.
    delete store[SAVE_KEY];
    const imported = importEnvelopeFromCloud(store, backend);

    expect(imported).toBe(true);
    // Byte-exact restoration.
    expect(store[SAVE_KEY]).toBe(envelope);
    // And it re-parses to a valid state with the seed intact.
    const loaded = loadSave(store[SAVE_KEY]);
    expect(loaded.seed).toBe(seed);
    expect(loaded.state.day).toBeGreaterThanOrEqual(1);
  });

  it('local present → local wins (cloud copy is NOT adopted)', () => {
    const backend = fakeBackend();
    const localEnvelope = buildEnvelope(1);
    const cloudEnvelope = buildEnvelope(2);
    backend.cloud.set(CLOUD_SAVE_FILE, cloudEnvelope);
    const store: Record<string, string> = { [SAVE_KEY]: localEnvelope };

    const imported = importEnvelopeFromCloud(store, backend);
    expect(imported).toBe(false);
    expect(store[SAVE_KEY]).toBe(localEnvelope);
  });

  it('no cloud copy → import is a no-op returning false', () => {
    const backend = fakeBackend();
    const store: Record<string, string> = {};
    expect(importEnvelopeFromCloud(store, backend)).toBe(false);
    expect(store[SAVE_KEY]).toBeUndefined();
  });

  it('null backend (Steam absent) → both helpers are no-ops, store untouched', () => {
    const store: Record<string, string> = { [SAVE_KEY]: 'local-blob' };
    expect(() => syncEnvelopeToCloud(store, null)).not.toThrow();
    expect(importEnvelopeFromCloud(store, null)).toBe(false);
    expect(store[SAVE_KEY]).toBe('local-blob');
  });

  it('sync with no local envelope writes nothing to cloud', () => {
    const backend = fakeBackend();
    const store: Record<string, string> = {};
    syncEnvelopeToCloud(store, backend);
    expect(backend.cloud.has(CLOUD_SAVE_FILE)).toBe(false);
  });
});
