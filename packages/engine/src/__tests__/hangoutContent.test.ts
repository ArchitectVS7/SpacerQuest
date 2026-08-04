import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ALL_NPC_PROFILES,
  DEFAULT_PORT_HANGOUT,
  PORT_HANGOUTS,
  STAR_SYSTEMS,
  isSimulatedCaptain,
  type HangoutTone,
  type HangoutVenueId,
  type NpcArchetype,
  type PortHangout,
} from '@spacerquest/content';
import {
  loanBandFor,
  portHangoutFor,
  venueOffered,
  venueParamsFor,
  wagerBandFor,
} from '../hangoutRules.js';

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
 * EXTENSION CONTRACT, HONOURED AND NOW CLOSED. T-124 added its four ids to
 * `AUTHORED_PORTS` and `MECHANICALLY_DEVIANT_PORTS` and RESTRUCTURED NOTHING —
 * every block T-122 and T-123 wrote is quantified over `AUTHORED_PORTS`, so the
 * last four inherited every rule for free, exactly as the contract promised. What
 * T-124 ADDS is the two describe blocks its own Accept clause names: the closing
 * enumeration (the table is fourteen, the enumeration is pinned to the table, and
 * no row is a placeholder) and the tonal spread against §6.1's register axis.
 * Every assertion is written against the engine
 * accessors (`wagerBandFor` / `venueParamsFor` / `venueOffered` / `portHangoutFor`)
 * and against `DEFAULT_PORT_HANGOUT`, never against a restated literal, so an
 * authored number can move without this file needing an edit — and a number that
 * moves at Sol-3 fails loudly instead.
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
 * §6.3 passes 1, 2 and 3 — Sol-3 (authored at T-120, mechanically the default row
 * by §2.3), the four T-122 authors, the five T-123 authors (4, 5, 11, 12, 14) and
 * the four T-124 authors (6, 7, 9, 13) over T-121's baselines. THE TABLE IS NOW
 * CLOSED AT FOURTEEN, and the T-124 block below pins this list against
 * `PORT_HANGOUTS`'s own key set rather than leaving it a hand-maintained literal.
 */
const AUTHORED_PORTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;

/** The ports whose rows must carry a real mechanical deviation. Sol-3 is excluded
 *  by §2.3 (its tuple is fixed to the default) and Altair-3 by its own design —
 *  it is the deliberate numeric mean, and its distinctness is `clientele` alone. */
const MECHANICALLY_DEVIANT_PORTS = [2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;

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
/** T-124's Spica-3 — §6.1's third and last venue-set expression, "a house that
 *  tolerates no insults". Named for the same reason the two above are. */
const THE_NO_INSULT_PORT = 13;
/** T-124's Denebola-5 — the FORGIVING pole of §6.1's consequence axis, and the
 *  mirror of `THE_HOSTILE_PORT`. The comic register is authored here. */
const THE_FORGIVING_PORT = 6;

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
    // T-133 · the credit axis. Without it a port distinguished ONLY by its loan
    // band would read as a §6.4 collision, and Arcturus-6 — which traded its
    // venue-set deviation for a band under owner ruling D7 — would silently drop
    // an axis it still has.
    loanBand: loanBandFor(systemId),
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
 * Which of §6.1's mechanical axes this port moves off the DEFAULT row (Sol-3's
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
  // T-133 (owner ruling D7): a port may narrow the DEPTH of its credit desk. This
  // is the axis that replaced Arcturus-6's withdrawn desk, so it counts toward the
  // ≥2-axes rule the tone block applies to every non-`everyday` port.
  if (JSON.stringify(loanBandFor(systemId)) !== JSON.stringify(loanBandFor(SUN_3))) {
    axes.push('loanBand');
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

  it('Sol-3 is still the DEFAULT row plus prose (§2.3, unchanged by any content pass)', () => {
    expect(PORT_HANGOUTS[SUN_3]?.wager).toBeUndefined();
    expect(PORT_HANGOUTS[SUN_3]?.venueParams).toBeUndefined();
    expect(PORT_HANGOUTS[SUN_3]?.clientele).toBeUndefined();
    expect(wagerBandFor(SUN_3)).toEqual(DEFAULT_PORT_HANGOUT.wager);
    for (const venue of ALL_VENUES) {
      expect(venueParamsFor(SUN_3, venue)).toEqual({
        dc: DEFAULT_PORT_HANGOUT.venueParams?.[venue]?.dc,
        dispositionOnSuccess: DEFAULT_PORT_HANGOUT.venueParams?.[venue]?.dispositionOnSuccess,
        dispositionOnFailure: DEFAULT_PORT_HANGOUT.venueParams?.[venue]?.dispositionOnFailure,
        // T-135 · the fourth arm (the Liar's Dice fold). Read off the default row
        // like its three siblings, so this stays a statement that Sol-3 inherits
        // whatever the default authors rather than a re-recorded literal.
        dispositionOnFold: DEFAULT_PORT_HANGOUT.venueParams?.[venue]?.dispositionOnFold,
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
      // F-124-1 · …and a real id is not enough. A QUEST_PROFILES captain sits
      // FROZEN at their day-1 system for an entire career (`isSimulatedCaptain`,
      // content/cast.ts; `day.ts:758` skips them in the dusk loop), so naming one
      // as a regular at a port they did not happen to start at is content that can
      // never rank — silently, because `rankClientele` returns the input unchanged
      // when the intersection is empty. Only a SIMULATED captain can walk into a
      // room they were not born in.
      expect(
        isSimulatedCaptain(profileId),
        `${portName(id)} names the frozen quest captain '${profileId}' as a regular`,
      ).toBe(true);
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
// Sol-3's resolved values) or RELATIVE TO THE OTHER AUTHORED PORTS (a per-axis
// maximum). An authored number can therefore move freely as long as the port's
// IDENTITY survives — which is the property §6 actually asks for.
// ---------------------------------------------------------------------------
describe('T-123 · the hostile port is hostile on its PARAMETERS', () => {
  const others = AUTHORED_PORTS.filter((id) => id !== THE_HOSTILE_PORT);

  it('Arcturus-6 is strictly harsher than the DEFAULT row on every hostility axis', () => {
    // §6.2's strict garrison, stated as five independent comparisons rather than
    // as a score: harder to charm, dearer to insult, dearer to beat at the table,
    // colder to a stranger, and — T-133, owner ruling D7 — fronting less credit
    // than any other house. The fifth comparison used to be "runs fewer beats than
    // the default"; the garrison's desk came BACK under D7 and the tightness moved
    // into the band, so the axis moved with it rather than being dropped.
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
    expect(loanBandFor(THE_HOSTILE_PORT).max).toBeLessThan(loanBandFor(SUN_3).max);
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
        loanBandFor(id).max,
        `${portName(id)} fronts no more credit than the hostile port`,
      ).toBeGreaterThan(loanBandFor(THE_HOSTILE_PORT).max);
    }
  });

  it('T-133 · every port runs a credit desk, and it is the ONLY one that runs a TIGHT one', () => {
    // §2.2 ruling 5 AS AMENDED BY OWNER RULING D7. The original ruling gave a port
    // one bit of lending control — whether the desk existed — and kept the band
    // global; Arcturus-6 was the one row that used that bit. D7 inverts the
    // arrangement: the desk is open everywhere, and what a port owns is the
    // PRINCIPAL BAND. The rate, the term and the lender are still global, so
    // nothing here touches them.
    expect(venueOffered(THE_HOSTILE_PORT, 'borrow')).toBe(true);
    expect(venueOffered(THE_HOSTILE_PORT, 'repay')).toBe(true);
    // Strictly inside the galaxy's band — stated as a comparison, never against a
    // literal, so the authored ceiling can move.
    expect(loanBandFor(THE_HOSTILE_PORT).min).toBeGreaterThanOrEqual(loanBandFor(SUN_3).min);
    expect(loanBandFor(THE_HOSTILE_PORT).max).toBeLessThan(loanBandFor(SUN_3).max);
    for (const id of others) {
      expect(venueOffered(id, 'borrow'), `${portName(id)} withholds 'borrow'`).toBe(true);
      expect(venueOffered(id, 'repay'), `${portName(id)} withholds 'repay'`).toBe(true);
      // …and every other desk is the DEFAULT desk: the deviation is one port's.
      expect(loanBandFor(id), `${portName(id)} authored a loan band of its own`).toEqual(
        loanBandFor(SUN_3),
      );
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

// ---------------------------------------------------------------------------
// T-124 · THE CLOSE. "All 14 core ports carry authored, distinct content,
// asserted by a test that enumerates them and fails on any placeholder; the tonal
// spread is asserted against the spec's axes."
//
// The two blocks below are the only structural additions pass 3 makes. Everything
// else T-124 needed was already quantified over `AUTHORED_PORTS` by T-122 and
// T-123, which is what the extension contract at the top of this file promised.
// ---------------------------------------------------------------------------
describe('T-124 · the table closes at fourteen', () => {
  it('the enumeration IS the table — not a hand-maintained list beside it', () => {
    // Without this, a future row dropped from `AUTHORED_PORTS` would silently
    // shrink every `it.each` above and nothing would go red. The list is pinned to
    // `PORT_HANGOUTS`'s own key set, in both directions, and to §6.4's fourteen.
    const keys = Object.keys(PORT_HANGOUTS)
      .map(Number)
      .sort((a, b) => a - b);
    expect([...AUTHORED_PORTS]).toEqual(keys);
    expect(AUTHORED_PORTS.length).toBe(14);
  });

  it('no row is a T-121 BASELINE row — every house has a name someone wrote', () => {
    // The teeth the Accept clause asks for. The "not the DEFAULT house name" check
    // in the T-122 block does NOT catch a baseline row: `baselineHangout` generated
    // `the <system> Hangout` per port, so a baseline row already had a house name
    // of its own and passed that assertion while carrying no authored voice at all.
    // This is the shape assertion that catches it, stated against `STAR_SYSTEMS`
    // rather than against a list of the fourteen generated strings.
    for (const id of AUTHORED_PORTS) {
      const prose = portHangoutFor(id).prose;
      expect(
        prose.houseName,
        `port ${id} still carries the generated baseline house name`,
      ).not.toBe(`the ${STAR_SYSTEMS[id]?.name} Hangout`);
      expect((prose.roomLine ?? '').trim().length, `port ${id} has no room line`).toBeGreaterThan(
        0,
      );
      expect(
        Object.keys(prose.flavour).length,
        `port ${id} has no flavour lines at all`,
      ).toBeGreaterThan(0);
    }
  });

  it('§6.4 · the set of axis vectors has cardinality exactly FOURTEEN', () => {
    // The closing check §6.4 names. Same helper and same collision report as the
    // T-122 block, restated at the closing number so the milestone has one
    // assertion that says "fourteen" out loud.
    const byVector = new Map<string, number[]>();
    for (const id of AUTHORED_PORTS) {
      byVector.set(axisVector(id), [...(byVector.get(axisVector(id)) ?? []), id]);
    }
    const collisions = [...byVector.values()]
      .filter((ids) => ids.length > 1)
      .map((ids) => ids.map(portName).join(' == '));
    expect(collisions, 'ports sharing an axis vector').toEqual([]);
    expect(new Set(AUTHORED_PORTS.map(axisVector)).size).toBe(14);
  });
});

describe('T-124 · the tonal spread (§6.1)', () => {
  const withTone = (tone: HangoutTone) =>
    AUTHORED_PORTS.filter((id) => portHangoutFor(id).prose.tone === tone);

  it('every one of §6.1’s four registers is represented', () => {
    // The Accept clause's "the tonal spread is asserted against the spec's axes".
    // Reports the MISSING registers by name rather than a bare count, because that
    // is the only useful thing a failure here can say.
    const missing = ALL_TONES.filter((tone) => withTone(tone).length === 0);
    expect(missing, 'registers with no port').toEqual([]);
    // …and the spread is a spread, not fourteen ports wearing one tag.
    expect(new Set(AUTHORED_PORTS.map((id) => portHangoutFor(id).prose.tone)).size).toBe(
      ALL_TONES.length,
    );
  });

  it('a `comic` port is never harsher than the default — the joke is not at the player’s expense', () => {
    // Stated as the EXACT NEGATION of the `dangerous` predicate in the T-123 block
    // above, over the same four clauses and read through Sol-3's resolved values,
    // so the two registers are graded on one axis set rather than on two invented
    // ones. Threshold-free: nothing here names a number.
    const comic = withTone('comic');
    // NON-VACUITY: the owner asked for the comic register explicitly, so an empty
    // set is a failure of the task and not a vacuous pass.
    expect(comic.length).toBeGreaterThan(0);
    for (const id of comic) {
      expect(
        venueParamsFor(id, 'befriend').dc,
        `${portName(id)} is tagged comic but is harder to charm than the default`,
      ).toBeLessThanOrEqual(venueParamsFor(SUN_3, 'befriend').dc);
      expect(
        venueParamsFor(id, 'insult').dispositionOnSuccess,
        `${portName(id)} is tagged comic but punishes an insult harder than the default`,
      ).toBeGreaterThanOrEqual(venueParamsFor(SUN_3, 'insult').dispositionOnSuccess);
      expect(
        venueParamsFor(id, 'dare').dispositionOnFailure,
        `${portName(id)} is tagged comic but punishes beating the house harder than the default`,
      ).toBeGreaterThanOrEqual(venueParamsFor(SUN_3, 'dare').dispositionOnFailure);
      expect(
        venueParamsFor(id, 'meet').dispositionOnSuccess,
        `${portName(id)} is tagged comic but is colder to a stranger than the default`,
      ).toBeGreaterThanOrEqual(venueParamsFor(SUN_3, 'meet').dispositionOnSuccess);
      // …and it is still a port, not a re-skin: the ≥2-axes rule the T-123 block
      // applies to every non-`everyday` tone, restated here so a failure names the
      // register that broke it.
      const axes = deviationAxes(id);
      expect(
        axes.length,
        `${portName(id)} is tagged comic but moves ${axes.join('+')}`,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it('Denebola-5 is the FORGIVING pole — the strict mirror of the hostile port', () => {
    // The maximality test of the T-123 hostile block, pointed the other way. Two
    // axes rather than five, deliberately: forgiveness is only expressible on the
    // arms that COST something, and `befriend.dc` / `meet` have their own poles
    // elsewhere (Rigel-8's 8, and Denebola-5's own +3 is pinned by the tone check
    // above). Reports the offender by house name.
    expect(portHangoutFor(THE_FORGIVING_PORT).prose.tone).toBe('comic');
    for (const id of AUTHORED_PORTS.filter((p) => p !== THE_FORGIVING_PORT)) {
      expect(
        venueParamsFor(id, 'insult').dispositionOnSuccess,
        `${portName(id)} forgives an insult at least as readily as the forgiving port`,
      ).toBeLessThan(venueParamsFor(THE_FORGIVING_PORT, 'insult').dispositionOnSuccess);
      expect(
        venueParamsFor(id, 'dare').dispositionOnFailure,
        `${portName(id)} minds being beaten at least as little as the forgiving port`,
      ).toBeLessThan(venueParamsFor(THE_FORGIVING_PORT, 'dare').dispositionOnFailure);
    }
  });

  it('the venue-set axis is exercised a SECOND time — Spica-3 tolerates no insults', () => {
    // §6.1's fourth named venue-set shape. Mirrors the Deneb-4 block exactly, so
    // the axis reads unambiguously across both ports that use it.
    expect(venueOffered(THE_NO_INSULT_PORT, 'insult')).toBe(false);
    expect(venueOffered(THE_NO_INSULT_PORT, 'meet')).toBe(true);
    expect(venueOffered(THE_NO_INSULT_PORT, 'borrow')).toBe(true);
    expect(venueOffered(THE_NO_INSULT_PORT, 'repay')).toBe(true);
    for (const id of AUTHORED_PORTS.filter((p) => p !== THE_NO_INSULT_PORT)) {
      expect(venueOffered(id, 'insult'), `${portName(id)} also withholds 'insult'`).toBe(true);
    }
    // …and the two narrowings are two DIFFERENT withholdings, which is what makes
    // the axis expressive rather than a synonym for hostility.
    //
    // T-133 (owner ruling D7) · IT WAS THREE. Arcturus-6's withdrawn credit desk
    // was the third, and it is gone — the garrison runs the desk again against a
    // tight `loanBand` instead of not running it at all. STATED rather than
    // silently dropped, because a set that quietly shrank from three to two is
    // exactly how an axis dies without anyone deciding to retire it: the garrison
    // now withholds NOTHING, and its identity moved to the credit axis pinned in
    // the T-133 block of `hangoutRules.test.ts` and in the hostility block above.
    const withheld = (id: number) => ALL_VENUES.filter((v) => !venueOffered(id, v)).join('+');
    expect(withheld(THE_HOSTILE_PORT)).toBe('');
    expect(new Set([withheld(THE_NO_MEET_PORT), withheld(THE_NO_INSULT_PORT)]).size).toBe(2);
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
    // T-124's four, named so the grep is anchored to the CLOSED table rather than
    // to whatever the file happened to contain when it was written.
    expect(source).toContain('DENEBOLA_5_HANGOUT');
    expect(source).toContain('FOMALHAUT_2_HANGOUT');
    expect(source).toContain('POLLUX_7_HANGOUT');
    expect(source).toContain('SPICA_3_HANGOUT');
    // …and the T-121 baseline-row builder is gone with them. A surviving call
    // would mean an unauthored port slipped back into a table this task closed.
    expect(source).not.toContain('baselineHangout');
    const hits = source
      .split('\n')
      .map((line, i) => [i + 1, line] as const)
      .filter(([, line]) => /\b(TODO|TBD|FIXME|placeholder)\b/i.test(line))
      .map(([n, line]) => `${n}: ${line.trim()}`);
    expect(hits, 'placeholder text in the authored content').toEqual([]);
  });
});
