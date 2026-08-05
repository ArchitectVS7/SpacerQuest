import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  startDay,
  type EncounterState,
  type GameEvent,
  type GameState,
} from '@spacerquest/engine';
import { ANONYMOUS_INTERCEPTORS, NPC_PROFILES, QUEST_PROFILES } from '@spacerquest/content';
import { combatAftermathSummary, encounterReadout } from '../format';

// ---------------------------------------------------------------------------
// T-207 · A NAMED CAPTAIN'S COMBAT VOICE (`docs/HANGOUT_REDESIGN.md`;
// `format.ts`'s `EncounterReadout.enterLine`/`battleLine` and
// `CombatAftermath.opponentLine`).
//
// THE RULE. A NAMED interceptor — one of the 30 captains the player Meets,
// Befriends and Insults at a Hangout, drawn back as an interceptor through the
// grudge weighting in `actions/travel.ts` — says something arriving, occasionally
// mid-fight, and once at the resolution. Which of `win` / `loss` they say is not
// the ENGINE's resolution restated: it is that resolution read from the CAPTAIN's
// side of it, which inverts twice (a player who flees leaves the captain holding
// the field; a "miracle burn" leaves the captain alive but beaten).
//
// THE LOAD-BEARING HALF IS THE NEGATIVE ONE. `AnonymousInterceptorProfile` was
// deliberately NOT given catchphrases by T-205 — 65 anonymous pirates and patrols
// are noise with a name — so an anonymous encounter must gain exactly nothing from
// this task, at every round and at every resolution. The suite below proves that
// with a whole-object `toEqual` rather than a handful of `toBeNull`s, so a future
// field added without a null default on the anonymous arm fails here too. The DOM
// half of that claim is not asserted (this is a node-env projection suite, as
// `liars-dice-pane.test.ts` explains): it holds structurally, because all three
// new elements in `App.tsx` are `null &&` guards and nothing was appended to
// `CombatAftermath.lines`.
//
// EVERY EXPECTATION IS DERIVED FROM CONTENT. A literal quote here would be a
// second copy of an authored line that passes while the cockpit prints something
// else.
// ---------------------------------------------------------------------------

const CAPTAIN = 'npc-iron-vex'; // cast index 0.
const ANON = 'anon-patrol-4'; // "Capt.Brutus" — a NAME string, but `source:'anonymous'`.
const VOICE = NPC_PROFILES.find((p) => p.id === CAPTAIN)!.catchphrases!;

/** A live day-1 career, driven through the engine's own day loop. */
function career(seed = 1): GameState {
  return startDay(createInitialState(seed)).state;
}

/** The encounter frame every fixture shares. `encounterReadout` reads
 *  `game.encounter` and nothing else, so a structural clone with a poked
 *  encounter is the whole experiment — the `withDisposition` precedent for
 *  sweeping a pure display projection. */
function withEncounter(game: GameState, interceptor: EncounterState['interceptor'], round: number) {
  const clone = JSON.parse(JSON.stringify(game)) as GameState;
  clone.encounter = {
    id: `enc-1-0-1-2-${interceptor.id}`,
    pendingTravel: { origin: 1, destination: 2, fuelUsed: 2 },
    interceptor,
    routeDangerLevel: 3,
    routeDangerChance: 0.3,
    encounterRoll: 0.1,
    round,
    enemyHull: 3,
  };
  return clone;
}

/** A NAMED interceptor, built the way `buildNamedCandidates` builds one
 *  (`actions/travel.ts`) rather than invented — `id === profileId` is the same
 *  identity `createInitialState` establishes and `shipLostToLabel` relies on. */
function named(game: GameState, profileId: string, round = 1): GameState {
  const profile = NPC_PROFILES.find((p) => p.id === profileId)!;
  const npc = game.npcs.find((n) => n.id === profileId)!;
  return withEncounter(
    game,
    {
      id: npc.id,
      source: 'named',
      name: npc.name,
      shipName: profile.shipName,
      profileId: profile.id,
      stats: profile.stats,
      tier: profile.tier,
      flaw: profile.flaw,
      flawDc: profile.flawDc,
    },
    round,
  );
}

/** An ANONYMOUS interceptor, built the way `buildAnonymousCandidates` builds one. */
function anonymous(game: GameState, anonId: string, round = 1): GameState {
  const raider = ANONYMOUS_INTERCEPTORS.find((i) => i.id === anonId)!;
  return withEncounter(
    game,
    {
      id: raider.id,
      source: 'anonymous',
      name: raider.name,
      shipName: raider.shipName,
      shipClass: raider.shipClass,
      homeSystem: raider.homeSystem,
      kind: raider.kind,
      rosterIndex: raider.rosterIndex,
      stats: raider.stats,
      tier: raider.tier,
    },
    round,
  );
}

function resolvedEvent(
  resolution: 'escaped' | 'talked-down' | 'defeated' | 'interceptor-fled' | 'interceptor-escaped',
  interceptorId: string,
  encounterId = 'enc-1-0-1-2-x',
): GameEvent[] {
  return [{ type: 'EncounterResolved', encounterId, resolution, round: 3, interceptorId }];
}

describe('T-207 · a named interceptor arrives talking', () => {
  it('says an authored ENTER line on the opening round, and only then', () => {
    const readout = encounterReadout(named(career(), CAPTAIN, 1))!;
    expect(VOICE.enter).toContain(readout.enterLine);
    // The enter line owns the opening; the mid-fight bark does not double it up.
    expect(readout.battleLine).toBeNull();
  });

  it('drops a mid-fight bark every OTHER round, never on the opening', () => {
    for (let round = 1; round <= 6; round += 1) {
      const readout = encounterReadout(named(career(), CAPTAIN, round))!;
      if (round === 1) {
        expect(readout.enterLine, `round ${round}`).toBeTruthy();
        expect(readout.battleLine, `round ${round}`).toBeNull();
        continue;
      }
      // Arriving is a one-time beat: no enter line after round 1.
      expect(readout.enterLine, `round ${round}`).toBeNull();
      if (round % 2 === 0) {
        expect(VOICE.duringBattle, `round ${round}`).toContain(readout.battleLine);
      } else {
        expect(readout.battleLine, `round ${round}`).toBeNull();
      }
    }
  });

  it('does not repeat one mid-fight line for a whole long fight', () => {
    // Vacuous if the captain has a single authored line — assert the premise.
    expect(VOICE.duringBattle.length).toBeGreaterThan(1);
    const seen = new Set<string>();
    for (let round = 2; round <= 40; round += 2) {
      seen.add(encounterReadout(named(career(), CAPTAIN, round))!.battleLine!);
    }
    expect(seen.size).toBeGreaterThan(1);
    for (const line of seen) expect(VOICE.duringBattle).toContain(line);
  });

  it('holds each line steady across paints', () => {
    // The anti-`Math.random()` assertion: this projection runs on every render.
    const opening = named(career(), CAPTAIN, 1);
    expect(encounterReadout(opening)!.enterLine).toBe(encounterReadout(opening)!.enterLine);
    const midFight = named(career(), CAPTAIN, 4);
    expect(encounterReadout(midFight)!.battleLine).toBe(encounterReadout(midFight)!.battleLine);
  });

  it('left the history clause exactly where T-307 and T-203 put it', () => {
    const readout = encounterReadout(named(career(), CAPTAIN, 1))!;
    expect(readout.history).toContain('No standing with you');
    expect(readout.history).not.toContain(readout.enterLine!);
  });
});

describe('T-207 · a named interceptor has a parting word', () => {
  it('quotes the WIN pool when the captain held the field', () => {
    const summary = combatAftermathSummary(resolvedEvent('escaped', CAPTAIN))!;
    expect(VOICE.win).toContain(summary.opponentLine);
  });

  it('quotes the LOSS pool when the wreck drifts', () => {
    const summary = combatAftermathSummary(resolvedEvent('defeated', CAPTAIN))!;
    expect(VOICE.loss).toContain(summary.opponentLine);
  });

  // Every arm of the union, so a sixth resolution cannot be added without landing
  // here. The orientation is the CAPTAIN's, which inverts twice: 'escaped' is the
  // PLAYER fleeing (the captain held the field) and 'interceptor-escaped' is the
  // T-1207 miracle burn off a fight the captain LOST (`types.ts`: "the player still
  // won the field, so travel completes").
  it.each([
    ['escaped', 'win'],
    ['talked-down', 'win'],
    ['defeated', 'loss'],
    ['interceptor-fled', 'loss'],
    ['interceptor-escaped', 'loss'],
  ] as const)('%s reads as a captain %s', (resolution, side) => {
    const summary = combatAftermathSummary(resolvedEvent(resolution, CAPTAIN))!;
    expect(summary.opponentLine).toBeTruthy();
    expect(VOICE[side]).toContain(summary.opponentLine);
    expect(VOICE[side === 'win' ? 'loss' : 'win']).not.toContain(summary.opponentLine);
  });

  it('is stable for the life of the panel', () => {
    const events = resolvedEvent('defeated', CAPTAIN);
    expect(combatAftermathSummary(events)!.opponentLine).toBe(
      combatAftermathSummary(events)!.opponentLine,
    );
  });

  it('is a nothing, not a crash, for a captain with no voiced surface', () => {
    // A QUEST captain reuses `NpcProfile` but is ABSENT from both voice fields by
    // T-205's ruling, and is excluded from the named-interceptor pool by
    // construction — so this can only be reached by a future change, and when it is
    // it must render nothing rather than throw.
    const quest = QUEST_PROFILES[0];
    expect(quest.catchphrases).toBeUndefined();
    expect(combatAftermathSummary(resolvedEvent('defeated', quest.id))!.opponentLine).toBeNull();
    // And an id in no roster at all.
    expect(
      combatAftermathSummary(resolvedEvent('defeated', 'npc-nobody'))!.opponentLine,
    ).toBeNull();
  });
});

describe('T-207 · an anonymous raider gained nothing at all', () => {
  it('reads byte-for-byte as it did before this task', () => {
    const game = anonymous(career(), ANON, 1);
    const raider = ANONYMOUS_INTERCEPTORS.find((i) => i.id === ANON)!;
    // A whole-object `toEqual`, not field-by-field `toBeNull`: a future field
    // added without a null default on the anonymous arm must fail RIGHT HERE.
    expect(encounterReadout(game)).toEqual({
      name: raider.name,
      shipName: raider.shipName,
      shipClass: raider.shipClass,
      tier: raider.tier,
      kindLabel: 'Patrol',
      history: 'Unknown raider — no record on file.',
      enterLine: null,
      battleLine: null,
    });
  });

  it('stays silent at every round — the every-other-round rule does not leak', () => {
    for (let round = 1; round <= 6; round += 1) {
      const readout = encounterReadout(anonymous(career(), ANON, round))!;
      expect(readout.enterLine, `round ${round}`).toBeNull();
      expect(readout.battleLine, `round ${round}`).toBeNull();
    }
  });

  it('has no parting word, and nothing was pushed into the aftermath list', () => {
    const summary = combatAftermathSummary(resolvedEvent('defeated', ANON))!;
    expect(summary.opponentLine).toBeNull();
    // The panel's `<h2>` is `lines[0]` and its `<ul>` is `lines.slice(1)`. Both are
    // exactly what they were: the bark is its own nullable field precisely so this
    // array could not move. That, plus the `null &&` guard in `App.tsx`, is the
    // byte-identical-DOM argument.
    expect(summary.lines).toEqual([
      'Interceptor destroyed — the wreck drifts.',
      'Resolved on round 3.',
    ]);
  });

  it('stays silent on every resolution arm', () => {
    for (const resolution of [
      'escaped',
      'talked-down',
      'defeated',
      'interceptor-fled',
      'interceptor-escaped',
    ] as const) {
      expect(
        combatAftermathSummary(resolvedEvent(resolution, ANON))!.opponentLine,
        resolution,
      ).toBeNull();
    }
  });
});
