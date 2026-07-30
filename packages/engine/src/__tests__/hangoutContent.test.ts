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
 * EXTENSION CONTRACT. T-124 adds ids to `AUTHORED_PORTS` and
 * `MECHANICALLY_DEVIANT_PORTS` and changes nothing else in this file — T-123
 * appended its five and ADDED the three describe blocks its own Accept clause
 * names (the hostile port, the exotic ports, and the tone/number correlation
 * §6.1 asks for), all of them quantified over `AUTHORED_PORTS` so that T-124's
 * four inherit every rule without an edit. Every assertion is written against the engine
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
 * §6.3 passes 1 and 2 — Sun-3 (authored at T-120, mechanically the default row by
 * §2.3), the four T-122 authors and the five T-123 authors (4, 5, 11, 12, 14) over
 * T-121's baselines. T-124 appends 6, 7, 9, 13; the closing check at T-124 is
 * cardinality 14.
 */
const AUTHORED_PORTS = [1, 2, 3, 4, 5, 8, 10, 11, 12, 14] as const;

/** The ports whose rows must carry a real mechanical deviation. Sun-3 is excluded
 *  by §2.3 (its tuple is fixed to the default) and Altair-3 by its own design —
 *  it is the deliberate numeric mean, and its distinctness is `clientele` alone. */
const MECHANICALLY_DEVIANT_PORTS = [2, 4, 5, 8, 10, 11, 12, 14] as const;

/** T-123's measurably HOSTILE port — Arcturus-6, §6.2's strict garrison. Named,
 *  because the Accept clause turns on it. */
const THE_HOSTILE_PORT = 4;
/** T-123's measurably EXOTIC port — Regulus-6, §6.3's high table and the F-101-1
 *  measurement target. */
const THE_EXOTIC_PORT = 11;
/** Its opposite pole on the stakes axis — Rigel-8's underbelly, §6.2's "low `min`,
 *  high ceiling". */
const THE_WIDEST_BAND_PORT = 12;
/** Deneb-4 — the one port whose venue set is narrowed by something OTHER than
 *  hostility, so the venue-set axis is exercised twice for two different reasons. */
const THE_NO_MEET_PORT = 5;

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

/** The venues a port actually runs, in the resolver's switch order. */
function offeredVenues(systemId: number): HangoutVenueId[] {
  return ALL_VENUES.filter((venue) => venueOffered(systemId, venue));
}

/**
 * Which of §6.1's mechanical axes this port moves off the DEFAULT row (Sun-3's
 * resolved values, never a restated literal). Governance is §6.1's sixth axis and
 * is not counted separately — it is the four below acting jointly, which is what
 * §6.2 says it is. Returns the axis NAMES so a failure says which ones moved.
 */
function deviationAxes(systemId: number): string[] {
  const axes: string[] = [];
  if (offeredVenues(systemId).length !== offeredVenues(SUN_3).length) axes.push('venues');
  if (JSON.stringify(wagerBandFor(systemId)) !== JSON.stringify(wagerBandFor(SUN_3))) {
    axes.push('wager');
  }
  if (ALL_VENUES.some((v) => venueParamsFor(systemId, v).dc !== venueParamsFor(SUN_3, v).dc)) {
    axes.push('dc');
  }
  if (
    ALL_VENUES.some((v) => {
      const here = venueParamsFor(systemId, v);
      const base = venueParamsFor(SUN_3, v);
      return (
        here.dispositionOnSuccess !== base.dispositionOnSuccess ||
        here.dispositionOnFailure !== base.dispositionOnFailure
      );
    })
  ) {
    axes.push('disposition');
  }
  const clientele = portHangoutFor(systemId).clientele;
  if ((clientele?.archetypes?.length ?? 0) > 0 || (clientele?.regulars?.length ?? 0) > 0) {
    axes.push('clientele');
  }
  return axes;
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

// ---------------------------------------------------------------------------
// T-123 · THE ACCEPT CLAUSE, MADE MECHANICAL. "At least one port is measurably
// hostile and one measurably exotic on their PARAMETERS, asserted against the
// spec's axes."
//
// EVERY ASSERTION BELOW IS THRESHOLD-FREE. Nothing here says "the DC must be at
// least 16" or "the floor must be at least 500" — those would be numbers a later
// pass would have to edit, and a test that has to be edited to stay true is not a
// pin. Instead each claim is either RELATIVE TO THE DEFAULT ROW (read through
// Sun-3's resolved values) or RELATIVE TO THE OTHER AUTHORED PORTS (a per-axis
// maximum). An authored number can therefore move freely as long as the port's
// IDENTITY survives — which is the property §6 actually asks for.
// ---------------------------------------------------------------------------
describe('T-123 · the hostile port is hostile on its PARAMETERS', () => {
  const others = AUTHORED_PORTS.filter((id) => id !== THE_HOSTILE_PORT);

  it('Arcturus-6 is strictly harsher than the DEFAULT row on every hostility axis', () => {
    // §6.2's strict garrison, stated as five independent comparisons rather than
    // as a score: harder to charm, dearer to insult, dearer to beat at the table,
    // colder to a stranger, and running fewer beats than the default house.
    expect(venueParamsFor(THE_HOSTILE_PORT, 'befriend').dc).toBeGreaterThan(
      venueParamsFor(SUN_3, 'befriend').dc,
    );
    expect(venueParamsFor(THE_HOSTILE_PORT, 'insult').dispositionOnSuccess).toBeLessThan(
      venueParamsFor(SUN_3, 'insult').dispositionOnSuccess,
    );
    expect(venueParamsFor(THE_HOSTILE_PORT, 'dare').dispositionOnFailure).toBeLessThan(
      venueParamsFor(SUN_3, 'dare').dispositionOnFailure,
    );
    expect(venueParamsFor(THE_HOSTILE_PORT, 'meet').dispositionOnSuccess).toBeLessThan(
      venueParamsFor(SUN_3, 'meet').dispositionOnSuccess,
    );
    expect(offeredVenues(THE_HOSTILE_PORT).length).toBeLessThan(offeredVenues(SUN_3).length);
  });

  it('…and no other authored port is harsher on ANY of those axes — this is the "measurably"', () => {
    // The maximality check. A port that merely deviates is not the hostile port;
    // the hostile port is the one at the harsh END of every axis at once. Reports
    // the offender by house name, because this is the assertion a later content
    // pass is most likely to break by accident.
    for (const id of others) {
      expect(
        venueParamsFor(id, 'befriend').dc,
        `${portName(id)} is at least as hard to charm as the hostile port`,
      ).toBeLessThan(venueParamsFor(THE_HOSTILE_PORT, 'befriend').dc);
      expect(
        venueParamsFor(id, 'insult').dispositionOnSuccess,
        `${portName(id)} punishes an insult at least as hard as the hostile port`,
      ).toBeGreaterThan(venueParamsFor(THE_HOSTILE_PORT, 'insult').dispositionOnSuccess);
      expect(
        venueParamsFor(id, 'dare').dispositionOnFailure,
        `${portName(id)} punishes beating the house at least as hard as the hostile port`,
      ).toBeGreaterThan(venueParamsFor(THE_HOSTILE_PORT, 'dare').dispositionOnFailure);
      expect(
        venueParamsFor(id, 'meet').dispositionOnSuccess,
        `${portName(id)} is at least as cold to a stranger as the hostile port`,
      ).toBeGreaterThan(venueParamsFor(THE_HOSTILE_PORT, 'meet').dispositionOnSuccess);
      expect(
        offeredVenues(id).length,
        `${portName(id)} runs no more beats than the hostile port`,
      ).toBeGreaterThan(offeredVenues(THE_HOSTILE_PORT).length);
    }
  });

  it('it is the ONLY authored port that withholds the credit desk (§2.2 ruling 5)', () => {
    // The one bit of per-port lending control the spec grants: whether the desk is
    // there. The BAND stays global, which is why no assertion here touches it.
    expect(venueOffered(THE_HOSTILE_PORT, 'borrow')).toBe(false);
    expect(venueOffered(THE_HOSTILE_PORT, 'repay')).toBe(false);
    for (const id of others) {
      expect(venueOffered(id, 'borrow'), `${portName(id)} withholds 'borrow' too`).toBe(true);
      expect(venueOffered(id, 'repay'), `${portName(id)} withholds 'repay' too`).toBe(true);
    }
  });
});

describe('T-123 · the exotic ports are exotic on their PARAMETERS', () => {
  it('Regulus-6 is the high table: a band strictly outside the default envelope at BOTH ends', () => {
    const band = wagerBandFor(THE_EXOTIC_PORT);
    const base = wagerBandFor(SUN_3);
    expect(band.min).toBeGreaterThan(base.min);
    expect(band.max).toBeGreaterThan(base.max);
    // NOT asserted as unique: Vega-6's outfitting band (§6.3's long room) is also
    // raised at both ends, and that is correct — two rich rooms are allowed. What
    // makes the high table THE high table is the floor, pinned in the next test.
  });

  it('…it has the highest FLOOR of any authored port, and it names regulars', () => {
    for (const id of AUTHORED_PORTS.filter((p) => p !== THE_EXOTIC_PORT)) {
      expect(
        wagerBandFor(id).min,
        `${portName(id)} deals no cheaper than the high table`,
      ).toBeLessThan(wagerBandFor(THE_EXOTIC_PORT).min);
    }
    // F-101-2: `regulars` ranks and never spawns, so this is an assertion about the
    // ROW, not about who is in the room on a given day.
    expect((portHangoutFor(THE_EXOTIC_PORT).clientele?.regulars ?? []).length).toBeGreaterThan(0);
  });

  it('Rigel-8 is the opposite pole: the WIDEST band span in the galaxy', () => {
    // §6.2's underbelly — "a low `min`, a high ceiling". The span is the claim, not
    // the floor: Mira-9's dive still has the lowest floor in the game (T-122), and
    // a dive has no ceiling worth the name. Recorded in §6.3's corrected axis note.
    const span = (id: number) => wagerBandFor(id).max - wagerBandFor(id).min;
    for (const id of AUTHORED_PORTS.filter((p) => p !== THE_WIDEST_BAND_PORT)) {
      expect(span(id), `${portName(id)} deals at least as wide a spread`).toBeLessThan(
        span(THE_WIDEST_BAND_PORT),
      );
    }
    // …and its floor is genuinely below the default one, so the span is bought at
    // the bottom end and not only at the top.
    expect(wagerBandFor(THE_WIDEST_BAND_PORT).min).toBeLessThan(wagerBandFor(SUN_3).min);
  });

  it('the venue-set axis is exercised for a reason other than hostility — Deneb-4 seats no stranger', () => {
    // §6.1's named "a room that will not seat a stranger". Without this the whole
    // venue-set axis would be a synonym for the garrison, and §6.4's distinctness
    // rule would be carrying it alone.
    expect(venueOffered(THE_NO_MEET_PORT, 'meet')).toBe(false);
    expect(venueOffered(THE_NO_MEET_PORT, 'borrow')).toBe(true);
    expect(venueOffered(THE_NO_MEET_PORT, 'repay')).toBe(true);
    // It is the only port that withholds 'meet', so the axis reads unambiguously.
    for (const id of AUTHORED_PORTS.filter((p) => p !== THE_NO_MEET_PORT)) {
      if (id === THE_HOSTILE_PORT) continue; // the garrison seats you, coldly (delta 0)
      expect(venueOffered(id, 'meet'), `${portName(id)} also withholds 'meet'`).toBe(true);
    }
  });
});

describe('T-123 · tone correlates with the numbers (§6.1)', () => {
  // §6.1: "A port that is tagged `dangerous` but sits at default DCs and default
  // deltas has failed T-123's acceptance, and the assertion that catches it is a
  // check that the tone tag CORRELATES WITH THE NUMERIC AXES — not a check on the
  // tag." Quantified over ALL authored ports so T-124 inherits it unchanged.
  const withTone = (tone: HangoutTone) =>
    AUTHORED_PORTS.filter((id) => portHangoutFor(id).prose.tone === tone);

  it('a port that is not `everyday` moves at least TWO of the mechanical axes', () => {
    for (const id of AUTHORED_PORTS) {
      if (portHangoutFor(id).prose.tone === 'everyday') continue;
      const axes = deviationAxes(id);
      expect(
        axes.length,
        `${portName(id)} is tagged non-everyday but moves ${axes.join('+')}`,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it('a `dangerous` port is harsher than the default on at least one CONSEQUENCE axis', () => {
    for (const id of withTone('dangerous')) {
      const harsher =
        venueParamsFor(id, 'insult').dispositionOnSuccess <
          venueParamsFor(SUN_3, 'insult').dispositionOnSuccess ||
        venueParamsFor(id, 'dare').dispositionOnFailure <
          venueParamsFor(SUN_3, 'dare').dispositionOnFailure ||
        venueParamsFor(id, 'befriend').dc > venueParamsFor(SUN_3, 'befriend').dc;
      expect(harsher, `${portName(id)} is tagged dangerous but costs nothing`).toBe(true);
    }
  });

  it('an `exotic` port is unusual on stakes, on clientele or on its venue set', () => {
    for (const id of withTone('exotic')) {
      const band = wagerBandFor(id);
      const base = wagerBandFor(SUN_3);
      const unusual =
        band.min > base.min ||
        band.max > base.max ||
        (portHangoutFor(id).clientele?.regulars ?? []).length > 0 ||
        offeredVenues(id).length < offeredVenues(SUN_3).length;
      expect(unusual, `${portName(id)} is tagged exotic but reads as an everyday bar`).toBe(true);
    }
  });

  it('NON-VACUITY — the register spread actually contains a dangerous and an exotic port', () => {
    // Without this the three rules above pass on an empty set, which is exactly how
    // a tone-correlation check dies quietly.
    expect(withTone('dangerous').length).toBeGreaterThan(0);
    expect(withTone('exotic').length).toBeGreaterThan(0);
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
