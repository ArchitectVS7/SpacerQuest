import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ALL_NPC_PROFILES,
  DEFAULT_PORT_HANGOUT,
  PORT_HANGOUTS,
  type HangoutTone,
  type HangoutVenueId,
  type NpcArchetype,
  type PortHangout,
} from '@spacerquest/content';
import { portHangoutFor, venueOffered, venueParamsFor, wagerBandFor } from '../hangoutRules.js';

/**
 * T-122 … T-124 · THE CONTENT VALIDATOR for the authored Hangout port table
 * (`docs/HANGOUT_REDESIGN.md` §6.3, §6.4). Three things are asserted here and
 * nowhere else: that every authored row is WELL-FORMED (a house name, a room line
 * and a flavour line for every venue it offers), that no two authored ports share
 * a MECHANICAL AXIS VECTOR (§6.4's set-cardinality rule), and that the content
 * file carries no placeholder text.
 *
 * WHY IT LIVES IN THE ENGINE SUITE. `packages/content` has no test runner at all —
 * the `exploreContent.test.ts` precedent, restated because it has not changed.
 * Giving content a runner is real infra and belongs to a task chartered for it.
 *
 * EXTENSION CONTRACT. T-123 and T-124 add ids to `AUTHORED_PORTS` and change
 * nothing else in this file. Every assertion is written against the engine
 * accessors (`wagerBandFor` / `venueParamsFor` / `venueOffered` / `portHangoutFor`)
 * and against `DEFAULT_PORT_HANGOUT`, never against a restated literal, so an
 * authored number can move without this file needing an edit — and a number that
 * moves at Sun-3 fails loudly instead.
 */

/** The seven, in the resolver's own switch order. */
const ALL_VENUES: readonly HangoutVenueId[] = [
  'dare',
  'meet',
  'befriend',
  'insult',
  'rumor',
  'borrow',
  'repay',
];

const SUN_3 = 1;

/**
 * §6.3 pass 1 — Sun-3 (authored at T-120, mechanically the default row by §2.3),
 * plus the four T-122 authors over T-121's baselines. T-123 appends 4, 5, 11, 12,
 * 14; T-124 appends 6, 7, 9, 13; the closing check at T-124 is cardinality 14.
 */
const AUTHORED_PORTS = [1, 2, 3, 8, 10] as const;

/** The ports whose rows must carry a real mechanical deviation. Sun-3 is excluded
 *  by §2.3 (its tuple is fixed to the default) and Altair-3 by its own design —
 *  it is the deliberate numeric mean, and its distinctness is `clientele` alone. */
const MECHANICALLY_DEVIANT_PORTS = [2, 8, 10] as const;

/** Altair-3 — §6.3's "one port must be the mean". Named rather than spelled inline
 *  so the assertion that pins it reads as a decision, not an accident. */
const THE_MEAN_PORT = 3;

const ALL_TONES: readonly HangoutTone[] = ['everyday', 'exotic', 'dangerous', 'comic'];
const ALL_ARCHETYPES: readonly NpcArchetype[] = [
  'trader',
  'fighter',
  'explorer',
  'smuggler',
  'gambler',
  'veteran',
];

/** The §6.4 axis vector, built from the RESOLVED values so that an omitted field
 *  and an explicitly-restated default collapse to the same point — otherwise a
 *  port could "differ" by restating a number it did not change. `clientele` is
 *  read off the row (it has no numeric resolution) and sorted, so ordering is not
 *  mistaken for identity. */
function axisVector(systemId: number): string {
  const row = portHangoutFor(systemId);
  return JSON.stringify({
    venues: ALL_VENUES.filter((venue) => venueOffered(systemId, venue)),
    wager: wagerBandFor(systemId),
    params: Object.fromEntries(ALL_VENUES.map((venue) => [venue, venueParamsFor(systemId, venue)])),
    clientele: {
      regulars: [...(row.clientele?.regulars ?? [])].sort(),
      archetypes: [...(row.clientele?.archetypes ?? [])].sort(),
    },
  });
}

function portName(systemId: number): string {
  return `${systemId} (${portHangoutFor(systemId).prose.houseName})`;
}

describe('T-122 · every authored port carries authored content', () => {
  it.each(AUTHORED_PORTS)('port %i has a row whose key is its own systemId', (id) => {
    const row: PortHangout | undefined = PORT_HANGOUTS[id];
    expect(row).toBeDefined();
    expect(row?.systemId).toBe(id);
  });

  it.each(AUTHORED_PORTS)('port %i has a named house, a room line and a valid tone', (id) => {
    const prose = portHangoutFor(id).prose;
    expect(prose.houseName.trim().length).toBeGreaterThan(0);
    // The generic fallback name is what an UNauthored port renders; an authored
    // one must have replaced it.
    expect(prose.houseName).not.toBe(DEFAULT_PORT_HANGOUT.prose.houseName);
    expect(typeof prose.roomLine).toBe('string');
    expect((prose.roomLine ?? '').trim().length).toBeGreaterThan(0);
    expect(ALL_TONES).toContain(prose.tone);
  });

  it.each(AUTHORED_PORTS)(
    'port %i has a non-empty flavour line for every venue it offers',
    (id) => {
      const offered = ALL_VENUES.filter((venue) => venueOffered(id, venue));
      // NON-VACUITY: a port that offered nothing would pass the loop while saying
      // nothing at all.
      expect(offered.length).toBeGreaterThan(0);
      const flavour = portHangoutFor(id).prose.flavour;
      for (const venue of offered) {
        const line = flavour[venue];
        expect(line, `port ${portName(id)} has no flavour line for '${venue}'`).toBeDefined();
        expect((line ?? '').trim().length).toBeGreaterThan(0);
      }
    },
  );

  it('the house names are distinct too — no two authored ports share a voice', () => {
    const names = AUTHORED_PORTS.map((id) => portHangoutFor(id).prose.houseName);
    expect(new Set(names).size).toBe(AUTHORED_PORTS.length);
  });
});

describe('T-122 · §6.4 — no two authored ports share a mechanical axis vector', () => {
  it('the set of serialized axis vectors has cardinality equal to the port count', () => {
    const byVector = new Map<string, number[]>();
    for (const id of AUTHORED_PORTS) {
      const vector = axisVector(id);
      byVector.set(vector, [...(byVector.get(vector) ?? []), id]);
    }
    // Report the COLLIDING ids, not a bare count: a cardinality assertion is
    // unhelpful when it goes red three tasks from now.
    const collisions = [...byVector.values()]
      .filter((ids) => ids.length > 1)
      .map((ids) => ids.map(portName).join(' == '));
    expect(collisions, 'ports sharing an axis vector').toEqual([]);
    expect(byVector.size).toBe(AUTHORED_PORTS.length);
  });

  it.each(MECHANICALLY_DEVIANT_PORTS)(
    'port %i deviates from the default row on at least one MECHANICAL parameter',
    (id) => {
      // Authored prose alone is not an authored port (§6.2: identity lives in the
      // numbers, because prose cannot be relied on to carry it — see F-101-2).
      const bandMoved = JSON.stringify(wagerBandFor(id)) !== JSON.stringify(wagerBandFor(SUN_3));
      const paramsMoved = ALL_VENUES.some(
        (venue) =>
          JSON.stringify(venueParamsFor(id, venue)) !==
          JSON.stringify(venueParamsFor(SUN_3, venue)),
      );
      expect(bandMoved || paramsMoved).toBe(true);
    },
  );

  it('Altair-3 is the deliberate NUMERIC MEAN — every number is the default one', () => {
    // §6.3 asks for one generic port; §6.4 forbids two identical vectors. The
    // resolution taken (and recorded in the row's own comment and in §6.3): the
    // mean port is distinct on `clientele` ALONE, which no sim policy reads, so it
    // stays a clean measurement control. A later pass must not quietly tune it.
    expect(wagerBandFor(THE_MEAN_PORT)).toEqual(wagerBandFor(SUN_3));
    for (const venue of ALL_VENUES) {
      expect(venueParamsFor(THE_MEAN_PORT, venue)).toEqual(venueParamsFor(SUN_3, venue));
    }
    expect(PORT_HANGOUTS[THE_MEAN_PORT]?.wager).toBeUndefined();
    expect(PORT_HANGOUTS[THE_MEAN_PORT]?.venueParams).toBeUndefined();
    // …and its distinctness is real, on the one axis it does move.
    expect((PORT_HANGOUTS[THE_MEAN_PORT]?.clientele?.archetypes ?? []).length).toBeGreaterThan(0);
    expect(axisVector(THE_MEAN_PORT)).not.toBe(axisVector(SUN_3));
  });

  it('Sun-3 is still the DEFAULT row plus prose (§2.3, unchanged by any content pass)', () => {
    expect(PORT_HANGOUTS[SUN_3]?.wager).toBeUndefined();
    expect(PORT_HANGOUTS[SUN_3]?.venueParams).toBeUndefined();
    expect(PORT_HANGOUTS[SUN_3]?.clientele).toBeUndefined();
    expect(wagerBandFor(SUN_3)).toEqual(DEFAULT_PORT_HANGOUT.wager);
    for (const venue of ALL_VENUES) {
      expect(venueParamsFor(SUN_3, venue)).toEqual({
        dc: DEFAULT_PORT_HANGOUT.venueParams?.[venue]?.dc,
        dispositionOnSuccess: DEFAULT_PORT_HANGOUT.venueParams?.[venue]?.dispositionOnSuccess,
        dispositionOnFailure: DEFAULT_PORT_HANGOUT.venueParams?.[venue]?.dispositionOnFailure,
      });
    }
  });
});

describe('T-122 · every authored row is well-formed', () => {
  it.each(AUTHORED_PORTS)('port %i has a reachable, well-ordered wager band', (id) => {
    const band = wagerBandFor(id);
    expect(band.min).toBeGreaterThan(0);
    expect(band.min).toBeLessThanOrEqual(band.max);
    // A floor above the GLOBAL ceiling would be a band the engine can never clamp
    // into, whatever the port declares.
    expect(band.min).toBeLessThanOrEqual(DEFAULT_PORT_HANGOUT.wager?.max ?? 0);
  });

  it.each(AUTHORED_PORTS)('port %i names only real archetypes and real cast regulars', (id) => {
    const clientele = portHangoutFor(id).clientele;
    for (const archetype of clientele?.archetypes ?? []) {
      expect(ALL_ARCHETYPES).toContain(archetype);
    }
    for (const profileId of clientele?.regulars ?? []) {
      // `rankClientele` matches on `profileId`; a typo here would silently rank
      // nobody rather than fail. T-123's Deneb-4 is the first row with regulars.
      expect(ALL_NPC_PROFILES.map((p) => p.id)).toContain(profileId);
    }
  });

  it.each(AUTHORED_PORTS)('port %i offers at least the venues its flavour speaks to', (id) => {
    // The converse of the flavour check above: a line for a venue the port does
    // not run is dead prose the player can never reach.
    const flavour = portHangoutFor(id).prose.flavour;
    for (const venue of Object.keys(flavour) as HangoutVenueId[]) {
      expect(venueOffered(id, venue), `port ${portName(id)} flavours unoffered '${venue}'`).toBe(
        true,
      );
    }
  });
});

describe('T-122 · the content file is placeholder-free', () => {
  it('a grep for TODO / TBD / FIXME / placeholder over portHangouts.ts returns nothing', () => {
    // The Accept clause names a literal grep, so this is a literal file read —
    // comments included, because a placeholder in a comment is still a placeholder.
    // CONSEQUENCE for authors: write "T-123 authors ids 4, 5, …", never
    // "// TODO: T-123 …".
    const contentSrc = join(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
      '..',
      'content',
      'src',
      'portHangouts.ts',
    );
    const source = readFileSync(contentSrc, 'utf8');
    // NON-VACUITY: a bad path, an empty file or a moved table would otherwise make
    // this pass while checking nothing.
    expect(source.length).toBeGreaterThan(1000);
    expect(source).toContain('PORT_HANGOUTS');
    expect(source).toContain('ALDEBARAN_1_HANGOUT');
    const hits = source
      .split('\n')
      .map((line, i) => [i + 1, line] as const)
      .filter(([, line]) => /\b(TODO|TBD|FIXME|placeholder)\b/i.test(line))
      .map(([n, line]) => `${n}: ${line.trim()}`);
    expect(hits, 'placeholder text in the authored content').toEqual([]);
  });
});
