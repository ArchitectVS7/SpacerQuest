import { describe, expect, it } from 'vitest';
import { createInitialState, type DareHandState, type EncounterState } from '@spacerquest/engine';
import type { CockpitState } from '../store';
import { BAND_HIGH_HZ, BAND_LOW_HZ, MOODS, moodBandHz, moodForState, type Mood } from '../music';

// ---------------------------------------------------------------------------
// T-185 · THE SCORE'S TWO PURE HALVES.
//
// `music.ts` is split so the interesting part is testable without WebAudio: the
// mood TABLE and the mood RULE are pure, and the scheduler that reads them is
// not. Everything below exercises the pure half in the node environment this
// suite runs in — no `window`, no `AudioContext`, and (crucially) no import of
// `store.ts` at runtime, because `music.ts` takes `CockpitState` as a TYPE-ONLY
// import. That is what makes this file cheap enough to be worth having.
//
// The audible-band assertion is the one that matters most and is the least
// obvious. T-185's investigation measured the existing ambient bed at -39.9 dB
// across 20-100 Hz and -112.7 dB across 100-150 Hz — all of its energy below the
// range a laptop or monitor speaker reproduces, which is why a bed that read as
// 0.25 peak in the meter was heard by nobody. A score written in that same
// region would be exactly as inaudible, so the band is a real constraint on the
// mood table and it is asserted here rather than left in a comment.
// ---------------------------------------------------------------------------

const ALL_MOODS: Mood[] = ['drift', 'tension', 'table'];

/**
 * A cockpit state carrying only what `moodForState` reads.
 *
 * A cast rather than a full `CockpitState`: building the real thing means the
 * store's whole boot (save reads, onboarding, slot enumeration), and this is a
 * test of a PURE FUNCTION OF FOUR FIELDS. The cast is what keeps it that. If
 * `moodForState` ever grows a fifth input, the type error here is the reminder.
 */
function cockpit(patch: {
  encounter?: EncounterState | null;
  dareHand?: DareHandState | null;
  dareReveal?: unknown;
  dareBeats?: unknown[];
}): CockpitState {
  const game = createInitialState(1);
  game.encounter = patch.encounter ?? null;
  game.dareHand = patch.dareHand ?? null;
  return {
    game,
    dareReveal: patch.dareReveal ?? null,
    dareBeats: patch.dareBeats ?? [],
  } as unknown as CockpitState;
}

/** The two engine handles the rule reads, shaped enough to be truthy. */
const AN_ENCOUNTER = { round: 1 } as unknown as EncounterState;
const A_DARE_HAND = { dealerId: 'x' } as unknown as DareHandState;

describe('T-185 · moodForState — the whole "which music" rule, as a truth table', () => {
  it('a quiet cockpit drifts', () => {
    expect(moodForState(cockpit({}))).toBe('drift');
  });

  it('a live encounter is tension', () => {
    expect(moodForState(cockpit({ encounter: AN_ENCOUNTER }))).toBe('tension');
  });

  it('an open Liar’s Dice hand is the table', () => {
    expect(moodForState(cockpit({ dareHand: A_DARE_HAND }))).toBe('table');
  });

  it('the table holds through the reveal timeline, after the hand has closed', () => {
    // `dareReveal` and `dareBeats` are the presentation fields the Hangout pane
    // is still rendering when the engine's hand is already null. The player is
    // watching the table; the music must not have left it.
    expect(moodForState(cockpit({ dareReveal: { won: true } }))).toBe('table');
    expect(moodForState(cockpit({ dareBeats: [{ kind: 'bid' }] }))).toBe('table');
  });

  it('a fight outranks a card table', () => {
    // Both true at once is reachable: an encounter can open with a Hangout
    // reveal still on screen. Priority is stated in the rule, so it is pinned.
    const both = cockpit({
      encounter: AN_ENCOUNTER,
      dareHand: A_DARE_HAND,
      dareReveal: { won: false },
      dareBeats: [{ kind: 'bid' }],
    });
    expect(moodForState(both)).toBe('tension');
  });

  it('falls back to drift the moment the scene is cleared', () => {
    // The store clears all three on selection / travel / a new day. There is no
    // second rule here that has to remember to reset — this asserts that.
    const cleared = cockpit({
      encounter: null,
      dareHand: null,
      dareReveal: null,
      dareBeats: [],
    });
    expect(moodForState(cleared)).toBe('drift');
  });

  it('is pure — the same state answers the same way, and nothing is mutated', () => {
    const s = cockpit({ dareHand: A_DARE_HAND });
    const before = JSON.stringify(s.game.encounter) + String(s.dareBeats.length);
    expect(moodForState(s)).toBe(moodForState(s));
    expect(JSON.stringify(s.game.encounter) + String(s.dareBeats.length)).toBe(before);
  });
});

describe('T-185 · the mood table is complete and playable', () => {
  it('every mood has a row', () => {
    // `Object.keys` rather than the literal list, so a fourth mood added to the
    // union without a row fails HERE and not in a silent `undefined` at play time.
    expect(Object.keys(MOODS).sort()).toEqual([...ALL_MOODS].sort());
  });

  for (const mood of ALL_MOODS) {
    it(`${mood} · tempo, density and levels are in range`, () => {
      const p = MOODS[mood];
      expect(p.bpm).toBeGreaterThan(0);
      expect(p.density).toBeGreaterThan(0);
      expect(p.density).toBeLessThanOrEqual(1);
      expect(p.mode.length).toBeGreaterThan(0);
      expect(p.mode[0]).toBe(0); // every mode starts on its root
      expect(p.bassEvery).toBeGreaterThan(0);
      expect(p.cutoffHz).toBeGreaterThan(0);
      for (const level of [p.bassLevel, p.padLevel, p.leadLevel]) {
        expect(level).toBeGreaterThan(0);
        // Under the one-shot cues by design — the score is a bed, not the
        // feedback. A level that crept above this is a mix regression.
        expect(level).toBeLessThanOrEqual(0.2);
      }
    });

    it(`${mood} · every voice fundamental is inside the audible band`, () => {
      const { lowHz, highHz } = moodBandHz(mood);
      expect(lowHz).toBeGreaterThanOrEqual(BAND_LOW_HZ);
      expect(highHz).toBeLessThanOrEqual(BAND_HIGH_HZ);
      expect(highHz).toBeGreaterThan(lowHz);
    });
  }

  it('the table is frozen — a mood cannot be retuned at run time', () => {
    expect(Object.isFrozen(MOODS)).toBe(true);
    for (const mood of ALL_MOODS) expect(Object.isFrozen(MOODS[mood])).toBe(true);
  });

  it('the three moods are actually different music', () => {
    // A guard against a copy-paste row: if two moods share a tempo AND a mode,
    // the "the music changed" claim the owner playtest checks is not true.
    const shapes = ALL_MOODS.map((m) => `${MOODS[m].bpm}|${MOODS[m].mode.join(',')}`);
    expect(new Set(shapes).size).toBe(ALL_MOODS.length);
  });
});
