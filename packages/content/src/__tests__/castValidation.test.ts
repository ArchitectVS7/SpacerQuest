import { describe, expect, it } from 'vitest';
import {
  CAST_DICE_COUNT_PHRASE,
  CATCHPHRASE_SLOTS,
  LIARS_DICE_DICE_COUNT_PHRASE,
  NPC_PROFILES,
  QUEST_PROFILES,
  VOICE_AUTHORING_PENDING,
  defineNpcProfiles,
  validateNpcVoices,
  validateQuestVoices,
  type BattleCatchphrases,
  type NpcProfile,
} from '../index.js';

/**
 * T-205 · THE VOICE VALIDATOR for the two fields this task adds to `NpcProfile` —
 * `tableTalk` (a roaming captain dealing a Liar's Dice hand) and `catchphrases`
 * (a captain drawn as a named combat interceptor).
 *
 * WHY IT LIVES HERE, beside the rows: `docs/TESTING-STRATEGY.md` Part I — a
 * validator whose assertions read only `@spacerquest/content` lives in this
 * package; a validator that has to resolve a row THROUGH THE ENGINE stays in
 * `packages/engine/src/__tests__/` because content may never depend on the engine
 * (`contentPackageBoundary.test.ts` enforces that edge). Nothing below imports an
 * engine symbol. The cast's OTHER invariant, the hand-curated archetype
 * distribution, is the engine-hosted case and stays in `npc.test.ts`.
 *
 * IT COSTS NO CAPSTONE: `__tests__` is in `HASHED_ROOT_IGNORED_DIRECTORIES`
 * (`packages/sim/src/balance/rules-fingerprint.ts`), so nothing here is hashed into
 * `rulesFingerprint`. The AUTHORED LINES in `cast.ts` are — that capstone is
 * batched into T-206 per the Standing constraints' "re-extract once" rule.
 *
 * FIXTURES ARE ALWAYS CLONES. Every negative case below is built by copying the
 * REAL roster and replacing one entry, never by mutating `NPC_PROFILES` (which is
 * a live exported array) and never by passing a one-row array — a short array
 * would make the waiver-hygiene rule fire 27 times and drown the assertion under
 * test.
 */

/** An id that is NOT on the T-206 worklist, so the coverage rule is live for it. */
const AUTHORED_ID = 'npc-iron-vex';
/** An id that IS on the worklist, so presence is excused for it. */
const WAIVED_ID = 'npc-nova-blitz';

function profileFor(id: string): NpcProfile {
  const found = NPC_PROFILES.find((profile) => profile.id === id);
  if (found === undefined) {
    throw new Error(`test fixture drift: no profile '${id}'`);
  }
  return found;
}

/** The real roster with ONE captain replaced by a patched copy. */
function rosterWith(id: string, patch: Partial<NpcProfile>): NpcProfile[] {
  return NPC_PROFILES.map((profile) =>
    profile.id === id ? { ...profile, ...patch } : { ...profile },
  );
}

/** The real roster with ONE captain's catchphrase slot patched. */
function rosterWithSlot(
  id: string,
  slot: keyof BattleCatchphrases,
  value: readonly string[] | undefined,
): NpcProfile[] {
  const base = profileFor(id).catchphrases;
  if (base === undefined) {
    throw new Error(`test fixture drift: '${id}' has no catchphrases to patch`);
  }
  const patched: Record<string, readonly string[] | undefined> = { ...base };
  patched[slot] = value;
  return rosterWith(id, { catchphrases: patched as unknown as BattleCatchphrases });
}

// ---------------------------------------------------------------------------
// 1 · The shipped content
// ---------------------------------------------------------------------------

describe('T-205 · the shipped cast validates', () => {
  it('every simulated captain passes `validateNpcVoices`', () => {
    // Importing the package at all already proves this (the `defineNpcProfiles`
    // wrapper throws at module load); asserting it makes the guarantee legible.
    expect(validateNpcVoices(NPC_PROFILES)).toEqual([]);
  });

  it('every quest captain passes `validateQuestVoices`', () => {
    expect(validateQuestVoices(QUEST_PROFILES)).toEqual([]);
  });

  it('the roster is still 30 captains', () => {
    // A cheap anchor: the two-set partition below is only meaningful against the
    // roster size every other test in this repo assumes.
    expect(NPC_PROFILES).toHaveLength(30);
  });
});

// ---------------------------------------------------------------------------
// 2 · The T-205/T-206 split is airtight — no captain can fall between the sets
// ---------------------------------------------------------------------------

describe('T-205 · the authored set and the T-206 worklist partition the roster', () => {
  const voiced = NPC_PROFILES.filter((profile) => profile.tableTalk !== undefined).map(
    (profile) => profile.id,
  );

  it('T-205 authored exactly the three worked examples', () => {
    expect(voiced.sort()).toEqual(['npc-cargo-king', 'npc-iron-vex', 'npc-solar-flare']);
  });

  it('voiced ∪ pending covers all 30, with no overlap', () => {
    // THE assertion that makes T-206 mechanical: a captain is either authored or
    // on the worklist, never neither (silently unvoiced) and never both.
    const union = new Set([...voiced, ...VOICE_AUTHORING_PENDING]);
    expect(union.size).toBe(NPC_PROFILES.length);
    expect(new Set(NPC_PROFILES.map((profile) => profile.id))).toEqual(union);
    expect(voiced.filter((id) => VOICE_AUTHORING_PENDING.has(id))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3 · The Accept criterion: it fails LOUDLY on any of the 30 missing a slot
// ---------------------------------------------------------------------------

describe('T-205 · a missing or empty slot on an unwaived captain is an error', () => {
  it('names the captain and the slot when `tableTalk` is absent', () => {
    const errors = validateNpcVoices(rosterWith(AUTHORED_ID, { tableTalk: undefined }));
    expect(errors.some((error) => error.includes(AUTHORED_ID) && error.includes('tableTalk'))).toBe(
      true,
    );
  });

  it('names the captain and the slot when `tableTalk` is empty', () => {
    const errors = validateNpcVoices(rosterWith(AUTHORED_ID, { tableTalk: [] }));
    expect(
      errors.some(
        (error) =>
          error.includes(AUTHORED_ID) && error.includes('tableTalk') && error.includes('empty'),
      ),
    ).toBe(true);
  });

  it('names the captain when `catchphrases` is absent entirely', () => {
    const errors = validateNpcVoices(rosterWith(AUTHORED_ID, { catchphrases: undefined }));
    expect(
      errors.some((error) => error.includes(AUTHORED_ID) && error.includes('catchphrases')),
    ).toBe(true);
  });

  it.each(CATCHPHRASE_SLOTS)('names the captain and the slot when `%s` is absent', (slot) => {
    const errors = validateNpcVoices(rosterWithSlot(AUTHORED_ID, slot, undefined));
    expect(
      errors.some(
        (error) =>
          error.includes(AUTHORED_ID) &&
          error.includes(`catchphrases.${slot}`) &&
          error.includes('missing'),
      ),
    ).toBe(true);
  });

  it.each(CATCHPHRASE_SLOTS)('names the captain and the slot when `%s` is empty', (slot) => {
    const errors = validateNpcVoices(rosterWithSlot(AUTHORED_ID, slot, []));
    expect(
      errors.some(
        (error) =>
          error.includes(AUTHORED_ID) &&
          error.includes(`catchphrases.${slot}`) &&
          error.includes('empty'),
      ),
    ).toBe(true);
  });

  it('a partial `catchphrases` object is malformed even for a WAIVED captain', () => {
    // The waiver excuses an unvoiced captain, never one voiced for three of the
    // four moments a fight has.
    const errors = validateNpcVoices(
      rosterWith(WAIVED_ID, {
        tableTalk: ['One line here.', 'And a second line here.'],
        catchphrases: {
          enter: ['Only this slot.'],
        } as unknown as BattleCatchphrases,
      }),
    );
    expect(errors.some((error) => error.includes('catchphrases.win'))).toBe(true);
    expect(errors.some((error) => error.includes('catchphrases.loss'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4 · All-or-nothing
// ---------------------------------------------------------------------------

describe('T-205 · half a voice is refused', () => {
  it('rejects `tableTalk` with no `catchphrases`, even on a waived captain', () => {
    const errors = validateNpcVoices(
      rosterWith(WAIVED_ID, { tableTalk: ['A line.', 'Another line.'] }),
    );
    expect(errors.some((error) => error.includes('half a voice'))).toBe(true);
  });

  it('rejects `catchphrases` with no `tableTalk`, even on a waived captain', () => {
    const errors = validateNpcVoices(
      rosterWith(WAIVED_ID, {
        catchphrases: { enter: ['a'], duringBattle: ['b'], win: ['c'], loss: ['d'] },
      }),
    );
    expect(errors.some((error) => error.includes('half a voice'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5 · Per-line shape
// ---------------------------------------------------------------------------

describe('T-205 · line shape', () => {
  it('rejects a whitespace-only line', () => {
    const errors = validateNpcVoices(
      rosterWith(AUTHORED_ID, { tableTalk: ['A real line.', '   '] }),
    );
    expect(errors.some((error) => error.includes('tableTalk[1]'))).toBe(true);
  });

  it('rejects a line past the 120-char cap', () => {
    const errors = validateNpcVoices(
      rosterWith(AUTHORED_ID, { tableTalk: ['A real line.', 'x'.repeat(121)] }),
    );
    expect(errors.some((error) => error.includes('<= 120 chars'))).toBe(true);
  });

  it('accepts a line exactly at the cap', () => {
    const errors = validateNpcVoices(
      rosterWith(AUTHORED_ID, { tableTalk: ['A real line.', 'x'.repeat(120)] }),
    );
    expect(errors).toEqual([]);
  });

  it('rejects a {…} placeholder, because lines are printed verbatim', () => {
    const errors = validateNpcVoices(
      rosterWith(AUTHORED_ID, { tableTalk: ['A real line.', 'Sit down, {captain}.'] }),
    );
    expect(errors.some((error) => error.includes('placeholder'))).toBe(true);
  });

  it('rejects a duplicated line inside one slot', () => {
    const errors = validateNpcVoices(rosterWith(AUTHORED_ID, { tableTalk: ['Same.', 'Same.'] }));
    expect(errors.some((error) => error.includes('duplicates an earlier line'))).toBe(true);
  });

  it('rejects a `tableTalk` of 1 and of 5', () => {
    expect(
      validateNpcVoices(rosterWith(AUTHORED_ID, { tableTalk: ['Only one.'] })).some((error) =>
        error.includes('must hold 2-4 lines'),
      ),
    ).toBe(true);
    expect(
      validateNpcVoices(
        rosterWith(AUTHORED_ID, { tableTalk: ['a.', 'b.', 'c.', 'd.', 'e.'] }),
      ).some((error) => error.includes('must hold 2-4 lines')),
    ).toBe(true);
  });

  it('rejects a catchphrase slot of 4', () => {
    const errors = validateNpcVoices(rosterWithSlot(AUTHORED_ID, 'win', ['a.', 'b.', 'c.', 'd.']));
    expect(errors.some((error) => error.includes('must hold 1-3 lines'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6 · The dice-count trap, and its deliberate scope
// ---------------------------------------------------------------------------

describe("T-205 · the Liar's Dice dice-count ban", () => {
  it('rejects a dice count in `tableTalk` — the count moves with the unlock ladder', () => {
    const errors = validateNpcVoices(
      rosterWith(AUTHORED_ID, { tableTalk: ['A real line.', 'Four dice apiece, and no crying.'] }),
    );
    expect(errors.some((error) => error.includes('dice count'))).toBe(true);
  });

  it('ALLOWS the same phrase in a combat bark — the rule is scoped on purpose', () => {
    // A catchphrase is never rendered at a Liar's Dice table, so the ladder cannot
    // falsify it. Scoping is the decision; this pins it so a later widening is
    // deliberate.
    const errors = validateNpcVoices(
      rosterWithSlot(AUTHORED_ID, 'enter', ['Four dice apiece, and no crying.']),
    );
    expect(errors).toEqual([]);
  });

  it('uses the same pattern as the 42-seat roster validator', () => {
    // The constant is DUPLICATED rather than imported, to avoid the
    // cast -> castValidation -> liarsDiceValidation -> cast runtime cycle. This is
    // what keeps the duplication honest.
    expect(CAST_DICE_COUNT_PHRASE.source).toBe(LIARS_DICE_DICE_COUNT_PHRASE.source);
    expect(CAST_DICE_COUNT_PHRASE.flags).toBe(LIARS_DICE_DICE_COUNT_PHRASE.flags);
  });
});

// ---------------------------------------------------------------------------
// 7 · Waiver hygiene — the set cannot rot silently
// ---------------------------------------------------------------------------

describe('T-205 · `VOICE_AUTHORING_PENDING` hygiene', () => {
  it('errors when a pending id is not on the roster', () => {
    const short = NPC_PROFILES.filter((profile) => profile.id !== WAIVED_ID);
    const errors = validateNpcVoices(short);
    expect(
      errors.some((error) => error.includes(WAIVED_ID) && error.includes('not an NPC_PROFILES id')),
    ).toBe(true);
  });

  it('errors when a pending captain HAS been authored, and says how to fix it', () => {
    const errors = validateNpcVoices(
      rosterWith(WAIVED_ID, {
        tableTalk: ['A line.', 'Another line.'],
        catchphrases: { enter: ['a'], duringBattle: ['b'], win: ['c'], loss: ['d'] },
      }),
    );
    expect(
      errors.some(
        (error) => error.includes(WAIVED_ID) && error.includes('VOICE_AUTHORING_PENDING'),
      ),
    ).toBe(true);
  });

  it('errors when a QUEST captain id is on the worklist', () => {
    const quest = QUEST_PROFILES.map((profile) => ({ ...profile }));
    const stolen = [...VOICE_AUTHORING_PENDING][0];
    quest[0] = { ...quest[0], id: stolen };
    const errors = validateQuestVoices(quest);
    expect(
      errors.some((error) => error.includes(stolen) && error.includes('must not appear in VOICE')),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 8 · The `defineX` contract
// ---------------------------------------------------------------------------

describe('T-205 · `defineNpcProfiles` throws at import time', () => {
  it('throws with the house message and lists EVERY error, not just the first', () => {
    const broken = rosterWith(AUTHORED_ID, { tableTalk: undefined, catchphrases: undefined });
    expect(() => defineNpcProfiles(broken)).toThrow(/^Invalid NPC profile content:/);
    // Both missing slots are reported in the one throw — the `defineDeeds`
    // contract, so an author fixes the whole row in one pass.
    expect(() => defineNpcProfiles(broken)).toThrow(/tableTalk is missing/);
    expect(() => defineNpcProfiles(broken)).toThrow(/catchphrases is missing/);
  });
});

// ---------------------------------------------------------------------------
// 9 · The quest-captain decision, machine-pinned
// ---------------------------------------------------------------------------

describe('T-205 · quest captains are UNVOICED by design, not by omission', () => {
  it('no `QUEST_PROFILES` row carries `tableTalk` or `catchphrases` today', () => {
    // THE DECISION (T-205): the two fields are OPTIONAL and ABSENT on the eleven
    // quest captains — never a placeholder, never an empty array. They take no
    // simulated turn, are never dealt a roaming Liar's Dice seat and are excluded
    // from the named-interceptor pool, so no surface could draw a line from them.
    // This test pins the current state so that voicing one later (T-208 parks them
    // at Cantinas) is a deliberate, visible change rather than a drift.
    expect(QUEST_PROFILES).toHaveLength(11);
    for (const profile of QUEST_PROFILES) {
      expect(profile.tableTalk).toBeUndefined();
      expect(profile.catchphrases).toBeUndefined();
    }
  });

  it('a quest captain WITH a well-formed voice still validates clean', () => {
    // Presence is never required of them; malformed presence is still caught.
    const quest = QUEST_PROFILES.map((profile) => ({ ...profile }));
    quest[0] = {
      ...quest[0],
      tableTalk: ['A well-formed line.', 'And a second one.'],
      catchphrases: { enter: ['a'], duringBattle: ['b'], win: ['c'], loss: ['d'] },
    };
    expect(validateQuestVoices(quest)).toEqual([]);
  });

  it('a quest captain with a MALFORMED voice is still caught', () => {
    const quest = QUEST_PROFILES.map((profile) => ({ ...profile }));
    quest[0] = { ...quest[0], tableTalk: ['Only one line.'] };
    const errors = validateQuestVoices(quest);
    expect(errors.some((error) => error.includes('half a voice'))).toBe(true);
    expect(errors.some((error) => error.includes('must hold 2-4 lines'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 10 · The worked examples are three VOICES, not one template
// ---------------------------------------------------------------------------

describe('T-205 · the three worked examples are differentiated', () => {
  it('share no identical line in any slot', () => {
    // Cheap, and it guards the standard T-206 inherits: a fighter, a trader and a
    // gambler were chosen precisely so the example cannot be read as a template.
    const authored = NPC_PROFILES.filter((profile) => profile.tableTalk !== undefined);
    const lines: string[] = [];
    for (const profile of authored) {
      lines.push(...(profile.tableTalk ?? []));
      for (const slot of CATCHPHRASE_SLOTS) {
        lines.push(...(profile.catchphrases?.[slot] ?? []));
      }
    }
    expect(new Set(lines).size).toBe(lines.length);
  });
});
