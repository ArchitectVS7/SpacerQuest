import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEEDS, RENOWN_RANKS, type RenownRankId } from '@spacerquest/content';
import type { GameEvent, GameState } from '@spacerquest/engine';

// The sink is mocked so `unlock` can be observed (and made to throw) without a
// shell. `storage.ts` performs the one-time localStorage import in its MODULE
// BODY, so mocking it also keeps this suite free of that side effect.
const sent: string[] = [];
let sinkThrows = false;
/** T-1702b · Every presence pair the mocked sink was handed, in order. */
const presence: string[] = [];
let presenceThrows = false;
vi.mock('../storage', () => ({
  unlockAchievement: (apiName: string) => {
    sent.push(apiName);
    if (sinkThrows) throw new Error('bridge exploded');
  },
  setRichPresence: (system: string, day: number) => {
    presence.push(`${system}|${day}`);
    if (presenceThrows) throw new Error('bridge exploded');
  },
}));

import {
  ACHIEVEMENT_MANIFEST,
  CONQUEROR_API_NAME,
  achievementsForEvents,
  achievementsForState,
  deedApiName,
  presenceLine,
  resetSentForTests,
  syncPresence,
  unlock,
} from '../steam';
// T-1702b · The cockpit's copy of the partner-site rich-presence sentence. Held
// against the doc below so the two cannot drift.
import { richPresenceLine } from '../format';

// ---------------------------------------------------------------------------
// T-1702a · The Steam achievement mirror.
//
// The mapping is a PURE function of the engine's event stream and of a loaded
// career's Registry, so it is fully testable here — the e2e proves it reaches a
// real Steam pipe through a real Electron window; this proves the mapping itself
// is complete, collision-free and honest, which an e2e cannot reach without
// playing forty-five different careers.
//
// The load-bearing test is the COMPLETENESS one: `ACHIEVEMENT_MANIFEST.length`
// is pinned to `DEEDS.length + 1`, so a deed added by a later content task
// cannot be silently left out of the mirror. Same precedent (and same purpose)
// as the `EVENT_PATHS` guard in `packages/engine/src/__tests__/deeds.test.ts`.
// ---------------------------------------------------------------------------

/** The shape `main.ts` validates before anything reaches the native layer.
 *  Duplicated here so the two ends of the wire are pinned independently. */
const SAFE_ACHIEVEMENT = /^[A-Z][A-Z0-9_]{0,63}$/;

function deedEarned(deedId: string): GameEvent {
  return {
    type: 'DeedEarned',
    day: 12,
    deedId,
    title: 'irrelevant to the mapping',
    citation: 'irrelevant to the mapping',
    renownRank: 'CAPTAIN',
  };
}

function rankUp(newRank: RenownRankId): GameEvent {
  return {
    type: 'RenownRankUp',
    day: 12,
    previousRank: 'ADMIRAL',
    newRank,
    deedCount: 38,
  };
}

/** Just enough `GameState` for the backfill — it reads exactly one sub-object,
 *  which is what keeps it a pure function of the Registry. */
function stateWith(earnedIds: string[], renownRank: RenownRankId): GameState {
  return {
    player: {
      registry: {
        earned: earnedIds.map((id) => ({
          id,
          title: id,
          citation: id,
          day: 1,
          eventIndex: 0,
        })),
        renownRank,
        matchCounts: {},
      },
    },
  } as unknown as GameState;
}

beforeEach(() => {
  sent.length = 0;
  sinkThrows = false;
  presence.length = 0;
  presenceThrows = false;
  resetSentForTests();
});

describe('T-1702a · the manifest mirrors the WHOLE Deed set', () => {
  it('has one row per Deed plus the Conqueror capstone', () => {
    // THE GUARD. A deed added to `packages/content/src/deeds.ts` without a
    // corresponding achievement would be a silently unmirrored Deed — which is
    // exactly the failure a hand-authored table produces. The mapping is
    // derived, so this can only fail if the derivation itself is broken.
    expect(ACHIEVEMENT_MANIFEST).toHaveLength(DEEDS.length + 1);
  });

  it('clears the Accept’s "≥30-Deed set" floor', () => {
    expect(DEEDS.length).toBeGreaterThanOrEqual(30);
    expect(ACHIEVEMENT_MANIFEST.length).toBeGreaterThanOrEqual(31);
  });

  it('every API name is unique and valid on the wire', () => {
    const names = ACHIEVEMENT_MANIFEST.map((a) => a.apiName);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(SAFE_ACHIEVEMENT);
  });

  it('the Conqueror capstone is present and collides with no deed', () => {
    const conqueror = ACHIEVEMENT_MANIFEST.find((a) => a.apiName === CONQUEROR_API_NAME);
    expect(conqueror).toBeDefined();
    expect(conqueror!.displayName).toBe(RENOWN_RANKS.CONQUEROR.label);
    // CONQUEROR is a RANK, not a Deed — so nothing in `DEEDS` may derive to it.
    expect(DEEDS.map((d) => deedApiName(d.id))).not.toContain(CONQUEROR_API_NAME);
  });

  it('carries the Deed’s own title and citation, with no placeholder left in', () => {
    const first = ACHIEVEMENT_MANIFEST.find((a) => a.apiName === deedApiName(DEEDS[0].id));
    expect(first!.displayName).toBe(DEEDS[0].title);
    // Every description is prose a store page can show: a literal `{day}` on a
    // public product page is a visible bug, and every row is non-empty.
    for (const row of ACHIEVEMENT_MANIFEST) {
      expect(row.description).not.toContain('{');
      expect(row.description.length).toBeGreaterThan(0);
      expect(row.displayName.length).toBeGreaterThan(0);
    }
  });
});

describe('T-1702a · achievementsForEvents — the live mapping', () => {
  it('maps a DeedEarned to that deed’s API name', () => {
    expect(achievementsForEvents([deedEarned('debt_first_payment')])).toEqual([
      'DEED_DEBT_FIRST_PAYMENT',
    ]);
  });

  it('maps the CONQUEROR rank-up, and only that rank', () => {
    expect(achievementsForEvents([rankUp('CONQUEROR')])).toEqual([CONQUEROR_API_NAME]);
    // The other nine ranks are pure functions of deed count, so mirroring them
    // would be achievements that unlock as a side effect of achievements the
    // player already holds. A deliberate call — see `steam.ts`'s header.
    for (const rank of ['LIEUTENANT', 'CAPTAIN', 'ADMIRAL', 'GIGA_HERO'] as const) {
      expect(achievementsForEvents([rankUp(rank)])).toEqual([]);
    }
  });

  it('ignores everything else, and keeps event order across a mixed batch', () => {
    expect(achievementsForEvents([{ type: 'DayAdvanced', day: 3 }])).toEqual([]);
    expect(achievementsForEvents([])).toEqual([]);
    expect(
      achievementsForEvents([
        { type: 'DayAdvanced', day: 3 },
        deedEarned('first_manifest'),
        rankUp('CONQUEROR'),
        deedEarned('cold_case'),
      ]),
    ).toEqual(['DEED_FIRST_MANIFEST', CONQUEROR_API_NAME, 'DEED_COLD_CASE']);
  });
});

describe('T-1702a · achievementsForState — the backfill', () => {
  it('mirrors every deed a loaded career already holds', () => {
    // The design point of this module: a career played on the web build, or with
    // Steam closed, or before this feature existed, has its `DeedEarned` events
    // in the past. Without this it would never mirror at all.
    expect(
      achievementsForState(stateWith(['first_manifest', 'first_delivery', 'cold_case'], 'CAPTAIN')),
    ).toEqual(['DEED_FIRST_MANIFEST', 'DEED_FIRST_DELIVERY', 'DEED_COLD_CASE']);
  });

  it('adds the capstone when the loaded career already holds the rank', () => {
    const names = achievementsForState(
      stateWith(['first_manifest', 'first_delivery', 'cold_case'], 'CONQUEROR'),
    );
    expect(names).toHaveLength(4);
    expect(names.at(-1)).toBe(CONQUEROR_API_NAME);
  });

  it('a fresh career mirrors nothing', () => {
    expect(achievementsForState(stateWith([], 'LIEUTENANT'))).toEqual([]);
  });
});

describe('T-1702a · unlock — deduped, guarded, and never fatal', () => {
  it('sends each name once per session, however often it is offered', () => {
    // The backfill runs on boot AND on every slot load, so without this a long
    // career re-sends its whole set several times a sitting.
    unlock(['DEED_FIRST_MANIFEST', 'DEED_FIRST_DELIVERY']);
    unlock(['DEED_FIRST_MANIFEST', 'DEED_COLD_CASE']);
    expect(sent).toEqual(['DEED_FIRST_MANIFEST', 'DEED_FIRST_DELIVERY', 'DEED_COLD_CASE']);
  });

  it('drops names the manifest does not define, so a typo cannot reach the native layer', () => {
    unlock(['NOT_AN_ACHIEVEMENT', 'DEED_FIRST_MANIFEST']);
    expect(sent).toEqual(['DEED_FIRST_MANIFEST']);
  });

  it('NEVER THROWS when the sink throws — an achievement is not worth an action', () => {
    sinkThrows = true;
    expect(() => unlock(['DEED_FIRST_MANIFEST', 'DEED_COLD_CASE'])).not.toThrow();
    // Both were still attempted: one bad send must not abort the batch.
    expect(sent).toEqual(['DEED_FIRST_MANIFEST', 'DEED_COLD_CASE']);
  });

  it('an empty batch is a no-op', () => {
    unlock([]);
    expect(sent).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// T-1702b · Rich presence — the second thing this module mirrors, and it adds
// no rule either: both values are engine state that already round-trips.
// ---------------------------------------------------------------------------

/** Just enough `GameState` for presence — it reads exactly two fields, which is
 *  what keeps `presenceLine` a pure function of the career's position. */
function gameAt(currentSystemId: number, day: number): GameState {
  return { day, player: { currentSystemId } } as unknown as GameState;
}

describe('T-1702b · presenceLine — pure, and total over any state', () => {
  it('reads the current system’s authored name and the current day', () => {
    expect(presenceLine(gameAt(1, 1))).toEqual({ system: 'Sun-3', day: 1 });
    expect(presenceLine(gameAt(2, 12))).toEqual({ system: 'Aldebaran-1', day: 12 });
  });

  it('an unknown system id falls back rather than throwing', () => {
    // `systemName`'s own `System-N` fallback. Presence runs on the path of every
    // action, so a lookup miss must never be able to cost a player their turn.
    expect(presenceLine(gameAt(9999, 3))).toEqual({ system: 'System-9999', day: 3 });
  });
});

describe('T-1702b · syncPresence — deduped, guarded, and never fatal', () => {
  it('publishes once per distinct system|day pair, however often it is called', () => {
    // `store.ts` calls this from its ONE state-update choke point, so it fires on
    // every UI-only patch (a die selected, a pane opened). The dedupe is what
    // makes that free.
    syncPresence(gameAt(1, 1));
    syncPresence(gameAt(1, 1));
    syncPresence(gameAt(1, 1));
    expect(presence).toEqual(['Sun-3|1']);
  });

  it('republishes when the day moves and when the system moves', () => {
    syncPresence(gameAt(1, 1));
    syncPresence(gameAt(1, 2));
    syncPresence(gameAt(2, 2));
    expect(presence).toEqual(['Sun-3|1', 'Sun-3|2', 'Aldebaran-1|2']);
  });

  it('NEVER THROWS when the sink throws — a friends-list line is not worth an action', () => {
    presenceThrows = true;
    expect(() => syncPresence(gameAt(1, 1))).not.toThrow();
    expect(presence).toEqual(['Sun-3|1']);
  });

  it('resetSentForTests clears the presence dedupe too, so suites cannot leak', () => {
    syncPresence(gameAt(1, 1));
    resetSentForTests();
    syncPresence(gameAt(1, 1));
    expect(presence).toEqual(['Sun-3|1', 'Sun-3|1']);
  });
});

// ---------------------------------------------------------------------------
// The partner-site table is a DELIVERABLE, so it is tested like one.
// ---------------------------------------------------------------------------

describe('T-1702a · docs/STEAM-ACHIEVEMENTS.md is the manifest, row for row', () => {
  const doc = readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
      '..',
      '..',
      'docs',
      'STEAM-ACHIEVEMENTS.md',
    ),
    'utf8',
  );

  /** Every `| \`API\` | display | description |` row in the table. */
  const rows = [...doc.matchAll(/^\| `([A-Z0-9_]+)` \| (.+?) \| (.+?) \|$/gm)].map((m) => ({
    apiName: m[1],
    displayName: m[2],
    description: m[3],
  }));

  it('lists exactly the manifest, in order, with the same prose', () => {
    // Without this the file rots the first time a Deed is added, and the
    // "mirror" stops being actionable on the Steamworks backend — which is where
    // a human has to type these rows in by hand.
    expect(rows).toEqual(ACHIEVEMENT_MANIFEST.map((a) => ({ ...a })));
  });

  // T-1702b ------------------------------------------------------------------

  it('documents the rich-presence token in the exact shape the cockpit renders', () => {
    // The partner-site token is the ONE piece of this feature no code can create,
    // and the string a friend reads comes from it — so the doc and
    // `format.ts`'s `richPresenceLine` must not be able to drift. The token text
    // is `Day {#day} — {#system}`; `richPresenceLine('Sol', 1)` is
    // `Day 1 — Sol`. Same words, same order, same separator.
    const line = richPresenceLine('{#system}', Number.NaN).replace('NaN', '{#day}');
    expect(doc).toContain(line);
    expect(doc).toContain('#Status_InSystem');
    // …and the three keys the shell actually sets.
    for (const key of ['`system`', '`day`', '`steam_display`']) {
      expect(doc).toContain(key);
    }
  });

  it('documents the Steam Cloud configuration this code requires', () => {
    // Auto-Cloud staying OFF is not a preference: the game drives the API
    // directly (`packages/desktop/src/cloud.ts`, Decision A), and both at once
    // would double-write the same files.
    expect(doc).toMatch(/Auto-Cloud/);
    expect(doc).toMatch(/sq\.save\.v1/);
  });
});
