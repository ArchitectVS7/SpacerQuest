import { describe, expect, it } from 'vitest';
import * as contentIndex from '../index.js';
import {
  CAST_DICE_COUNT_PHRASE,
  CATCHPHRASE_SLOTS,
  LIARS_DICE_DICE_COUNT_PHRASE,
  NPC_PROFILES,
  QUEST_PROFILES,
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
 * `rulesFingerprint`. The AUTHORED LINES in `cast.ts` are — that capstone was
 * batched into T-206 and PAID there (`baseline-t206-captain-voice.json`), per the
 * Standing constraints' "re-extract once" rule.
 *
 * T-206 · THE WAIVER IS GONE. T-205 ran the coverage rule with a
 * `VOICE_AUTHORING_PENDING` set carrying the 27 unauthored captains; T-206
 * authored all 27 and deleted the set, the `waived` branch and the three hygiene
 * rules that policed it, so every assertion below now describes the UNCONDITIONAL
 * rule. Section 2 pins the completion, and section 7's slot records what the
 * removed waiver-hygiene suite covered so a reader does not read its absence as
 * dropped coverage.
 *
 * FIXTURES ARE ALWAYS CLONES. Every negative case below is built by copying the
 * REAL roster and replacing one entry, never by mutating `NPC_PROFILES` (which is
 * a live exported array) and never by passing a one-row array.
 */

/** The captain every single-row negative case is built on. */
const AUTHORED_ID = 'npc-iron-vex';
/** A SECOND captain, so a case that needs two distinct rows has one. Authored like
 *  all 30 since T-206 — it was T-205's waived example. */
const SECOND_ID = 'npc-nova-blitz';

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
    // A cheap anchor: the completion assertion below is only meaningful against the
    // roster size every other test in this repo assumes.
    expect(NPC_PROFILES).toHaveLength(30);
  });
});

// ---------------------------------------------------------------------------
// 2 · T-206 finished the job — all 30 voiced, and the worklist is gone
// ---------------------------------------------------------------------------

describe('T-206 · every simulated captain is authored and the waiver is retired', () => {
  it('all 30 captains carry `tableTalk`', () => {
    expect(NPC_PROFILES.filter((profile) => profile.tableTalk !== undefined)).toHaveLength(30);
  });

  it('all 30 captains carry `catchphrases`', () => {
    expect(NPC_PROFILES.filter((profile) => profile.catchphrases !== undefined)).toHaveLength(30);
  });

  it('`VOICE_AUTHORING_PENDING` is no longer exported at all', () => {
    // THE anti-refill assertion. T-205's worklist named its own exit condition
    // ("when the set is empty, DELETE IT"), and an empty waiver left in place is an
    // invitation to refill it. Asserting on the module namespace — rather than on
    // the set's size — means reintroducing the symbol is a visible failure here
    // rather than a quiet regression that exempts a future captain.
    expect('VOICE_AUTHORING_PENDING' in contentIndex).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3 · The Accept criterion: it fails LOUDLY on any of the 30 missing a slot
// ---------------------------------------------------------------------------

describe('T-205 · a missing or empty slot on any of the 30 is an error', () => {
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

  it('a partial `catchphrases` object is malformed on any captain', () => {
    // Optional presence (the quest roster) excuses an unvoiced captain, never one
    // voiced for three of the four moments a fight has.
    const errors = validateNpcVoices(
      rosterWith(SECOND_ID, {
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
  it('rejects `tableTalk` with no `catchphrases`', () => {
    const errors = validateNpcVoices(
      rosterWith(SECOND_ID, { tableTalk: ['A line.', 'Another line.'], catchphrases: undefined }),
    );
    expect(errors.some((error) => error.includes('half a voice'))).toBe(true);
  });

  it('rejects `catchphrases` with no `tableTalk`', () => {
    const errors = validateNpcVoices(
      rosterWith(SECOND_ID, {
        tableTalk: undefined,
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
// 7 · (was: waiver hygiene)
//
// T-206 DELETED THIS SUITE WITH THE THING IT TESTED. It covered the three rules
// that kept `VOICE_AUTHORING_PENDING` honest while the roster was half-authored —
// a stale id on the set, an authored captain still on it, and a quest id on it.
// All three rules are gone because the set is gone (T-206 authored the last 27),
// so this is not dropped coverage: what replaces it is section 2's unconditional
// "all 30 are voiced, and the symbol is no longer exported" pair, which is
// strictly stronger — the waiver cannot rot if it cannot exist.
// ---------------------------------------------------------------------------

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
// 10 · Thirty VOICES, not one template — T-206's Accept, mechanized
// ---------------------------------------------------------------------------

/** Every authored line a captain owns, across all five slots. */
function linesOf(profile: NpcProfile): string[] {
  const lines = [...(profile.tableTalk ?? [])];
  for (const slot of CATCHPHRASE_SLOTS) {
    lines.push(...(profile.catchphrases?.[slot] ?? []));
  }
  return lines;
}

/** Lowercased, stripped of punctuation, whitespace collapsed — so `Deal me in.`
 *  and `Deal me in!` are the SAME line for the duplicate check below. */
function normalize(line: string): string {
  return line
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Distinct 4+ letter words across all of a captain's lines. Shared by the
 *  signature-token rule and the named spot-check so both read the same way. */
function words(profile: NpcProfile): Set<string> {
  return new Set(
    linesOf(profile)
      .join(' ')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length >= 4),
  );
}

describe('T-206 · the 30 captains are 30 voices, not one template', () => {
  const authored = NPC_PROFILES.filter((profile) => profile.tableTalk !== undefined);

  it('no line is repeated anywhere across all 30 captains', () => {
    // The single strongest anti-copy-paste guard: ~200 lines, all distinct. A
    // captain built by pasting another captain's slot fails here immediately.
    const lines = authored.flatMap(linesOf);
    expect(lines.length).toBeGreaterThan(150);
    expect(new Set(lines).size).toBe(lines.length);
  });

  it("no line is a punctuation-only variant of another captain's line", () => {
    // The rename-only template that raw uniqueness would let through: "Deal me in."
    // for one captain and "Deal me in!" for the next is one line, not two.
    const normalized = authored.flatMap((profile) => linesOf(profile).map(normalize));
    const seen = new Map<string, number>();
    for (const line of normalized) seen.set(line, (seen.get(line) ?? 0) + 1);
    const repeated = [...seen.entries()].filter(([, count]) => count > 1).map(([line]) => line);
    expect(repeated).toEqual([]);
  });

  it('every captain owns at least one word no other captain uses', () => {
    // The mechanical form of "a spot-check comparing two captains' lines must show
    // real voice difference" (T-206's Accept). A captain whose every word is drawn
    // from the shared pool is a captain assembled from the house template.
    //
    // IF THIS GOES RED, GIVE THE CAPTAIN A LINE THAT EARNS A SIGNATURE WORD — never
    // lower the length floor and never delete the check, which is the same move as
    // widening a band to clear a gate.
    const byCaptain = new Map(authored.map((profile) => [profile.id, words(profile)]));
    const unsigned: string[] = [];
    for (const [id, own] of byCaptain) {
      const elsewhere = new Set<string>();
      for (const [otherId, other] of byCaptain) {
        if (otherId !== id) for (const word of other) elsewhere.add(word);
      }
      if ([...own].every((word) => elsewhere.has(word))) unsigned.push(id);
    }
    expect(
      unsigned,
      `${unsigned.join(', ')} share every word with the rest of the roster — those captains read ` +
        `as the house template rather than as themselves. Write them a line only they would say.`,
    ).toEqual([]);
  });

  it('Iron Clad and Iron Vex do not collapse into each other', () => {
    // THE NAMED SPOT-CHECK, and the hardest pair on the roster: same ideal
    // (Dominance), same faction (Warlord Confed), same archetype (fighter). Vex is
    // eager and bloodthirsty; Iron Clad is immovable and does not chase. If any two
    // captains were going to be written once and pasted twice, it is these two.
    const vex = words(profileFor('npc-iron-vex'));
    const clad = words(profileFor('npc-iron-clad'));
    const shared = [...vex].filter((word) => clad.has(word));
    // Function words alone will overlap; a template would overlap far harder.
    expect(shared.length).toBeLessThan(Math.min(vex.size, clad.size) / 2);
    expect(linesOf(profileFor('npc-iron-vex'))).not.toEqual(linesOf(profileFor('npc-iron-clad')));
  });
});
