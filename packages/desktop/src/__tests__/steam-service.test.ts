// ============================================================================
//  T-1702 · Achievement/presence dispatch — proves "achievements fire from deed
//  events" at the logic level with a fake backend (no Steam client, runs in CI).
// ============================================================================

import { describe, expect, it } from 'vitest';
import type { GameEvent } from '@spacerquest/engine';
import { SteamService, type SteamBackend } from '../steam';

/** An in-memory fake of the native Steam surface that records every call. */
function fakeBackend(): SteamBackend & {
  unlocks: string[];
  presences: Array<{ systemId: number; day: number }>;
  cloud: Map<string, string>;
} {
  const unlocks: string[] = [];
  const presences: Array<{ systemId: number; day: number }> = [];
  const cloud = new Map<string, string>();
  return {
    unlocks,
    presences,
    cloud,
    unlock(id) {
      unlocks.push(id);
    },
    setRichPresence(systemId, day) {
      presences.push({ systemId, day });
    },
    cloudWrite(name, content) {
      cloud.set(name, content);
    },
    cloudRead(name) {
      return cloud.has(name) ? (cloud.get(name) as string) : null;
    },
  };
}

const deedEvent = (deedId: string): GameEvent => ({
  type: 'DeedEarned',
  day: 4,
  deedId,
  title: deedId,
  citation: 'x',
  renownRank: 'LIEUTENANT',
});

describe('SteamService.handleEvents', () => {
  it('unlocks a deed achievement exactly once from a DeedEarned event', () => {
    const backend = fakeBackend();
    const svc = new SteamService(backend);
    svc.handleEvents([deedEvent('first_manifest')]);
    expect(backend.unlocks).toEqual(['DEED_FIRST_MANIFEST']);
  });

  it('does not re-fire an already-unlocked deed (the isActivated/dedupe guard)', () => {
    const backend = fakeBackend();
    const svc = new SteamService(backend);
    svc.handleEvents([deedEvent('first_manifest')]);
    svc.handleEvents([deedEvent('first_manifest')]);
    expect(backend.unlocks).toEqual(['DEED_FIRST_MANIFEST']);
  });

  it('unlocks RANK_CONQUEROR from a RenownRankUp into CONQUEROR', () => {
    const backend = fakeBackend();
    const svc = new SteamService(backend);
    svc.handleEvents([
      {
        type: 'RenownRankUp',
        day: 300,
        previousRank: 'GIGA_HERO',
        newRank: 'CONQUEROR',
        deedCount: 30,
      },
    ]);
    expect(backend.unlocks).toEqual(['RANK_CONQUEROR']);
  });

  it('ignores non-achievement events (no spurious unlocks)', () => {
    const backend = fakeBackend();
    const svc = new SteamService(backend);
    svc.handleEvents([{ type: 'DayAdvanced', day: 2 }]);
    expect(backend.unlocks).toEqual([]);
  });

  it('is a total no-op when Steam is absent (null backend, never throws)', () => {
    const svc = new SteamService(null);
    expect(svc.enabled).toBe(false);
    expect(() => svc.handleEvents([deedEvent('first_manifest')])).not.toThrow();
  });
});

describe('SteamService.updatePresence', () => {
  it('pushes rich presence and de-dupes an unchanged system/day', () => {
    const backend = fakeBackend();
    const svc = new SteamService(backend);
    svc.updatePresence(1, 10);
    svc.updatePresence(1, 10); // unchanged → skipped
    svc.updatePresence(2, 10); // changed → pushed
    expect(backend.presences).toEqual([
      { systemId: 1, day: 10 },
      { systemId: 2, day: 10 },
    ]);
  });

  it('is a no-op when Steam is absent', () => {
    const svc = new SteamService(null);
    expect(() => svc.updatePresence(1, 1)).not.toThrow();
  });
});
