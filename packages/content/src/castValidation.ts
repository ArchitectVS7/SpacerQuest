/**
 * T-205 · Named-captain VOICE validation — the load-time "every simulated captain
 * has something to say" guarantee for the two fields T-205 adds to `NpcProfile`:
 * `tableTalk` (drawn from when a roaming captain deals a Liar's Dice hand) and
 * `catchphrases` (drawn from when a captain turns up as a named combat
 * interceptor through the grudge weighting in `packages/engine/src/actions/travel.ts`).
 *
 * Mirrors the blessed `defineDeeds` / `defineLiarsDiceOpponents` shape exactly:
 * `validateNpcVoices` / `validateQuestVoices` collect every structural error in the
 * table and `defineNpcProfiles` / `defineQuestProfiles` throw on any of them, so a
 * malformed cast can never reach a running game (importing `@spacerquest/content`
 * at all fails loudly instead). Every rule below names the READER it protects.
 *
 * IT DECIDES NOTHING. This file has no bearing on any outcome: it throws on
 * malformed content and is otherwise inert, which is how `cast.ts` stays pure data
 * under the standing engine/content constraint. The two new fields are likewise
 * inert until T-207 renders them — the `LIARS_DICE_UNLOCK_GAMES` precedent
 * (`liarsDice.ts`), where content shipped one task ahead of its reader.
 *
 * SCOPE NOTE — this validator covers the VOICE FIELDS ONLY. The other invariant
 * the cast carries, the hand-curated ARCHETYPE DISTRIBUTION (trader 6 · fighter 6 ·
 * explorer 5 · veteran 5 · gambler 4 · smuggler 4), stays where it already lives,
 * in `packages/engine/src/__tests__/npc.test.ts`, because it resolves each
 * archetype through the ENGINE's `ARCHETYPE_INTENT_MULTIPLIERS` — content sits
 * upstream of the engine and cannot import it. `docs/TESTING-STRATEGY.md` Part I
 * makes that hosting permanent, and `__tests__/contentPackageBoundary.test.ts`
 * enforces it. The two checks are complementary: this one proves each captain is
 * well-voiced, that one proves the roster is well-composed.
 */

import type { BattleCatchphrases, NpcProfile } from './cast.js';

/** The longest a rendered bark may be, and the same number and the same reason as
 *  `liarsDiceValidation.ts`'s `MAX_LINE_LENGTH`: a line gets one row at the table,
 *  and past this it wraps into the bid history. The combat readout is narrower
 *  still, so this is a ceiling, not a target. */
const MAX_BARK_LENGTH = 120;

/** "A few", per the ask. A captain is met REPEATEDLY (unlike a fixed roster seat,
 *  which carries exactly one `tableTalk` string), so one line would be a tic and
 *  five would be a monologue to review 30 times. */
const TABLE_TALK_RANGE = { min: 2, max: 4 } as const;

/** Barks, not paragraphs. One is enough for a slot to be live; three is enough to
 *  stop a rematch reading like a replay. */
const CATCHPHRASE_RANGE = { min: 1, max: 3 } as const;

/** The four slots, in the order a fight visits them. Exported because T-207's UI
 *  needs the same list and a second hand-written copy would be the thing that
 *  drifts. */
export const CATCHPHRASE_SLOTS: readonly (keyof BattleCatchphrases)[] = [
  'enter',
  'duringBattle',
  'win',
  'loss',
];

/**
 * A dice-count phrase — "four dice", "6 die", "five dice apiece". FORBIDDEN in
 * `tableTalk`, because the count moves with the unlock ladder
 * (`LIARS_DICE_UNLOCK_GAMES`): a line that names it is a lie at tier 2.
 *
 * DELIBERATELY DUPLICATED from `liarsDiceValidation.ts`'s
 * `LIARS_DICE_DICE_COUNT_PHRASE` rather than imported, and the reason is a real
 * cycle, not tidiness: that file does a RUNTIME `import { ALL_NPC_PROFILES } from
 * './cast.js'`, so importing it from here would close
 * `cast.ts -> castValidation.ts -> liarsDiceValidation.ts -> cast.ts` and put a
 * TDZ hazard on module load. Both constants are exported and
 * `__tests__/castValidation.test.ts` asserts their sources are identical, so the
 * duplication is pinned rather than trusted — a test file is a leaf and adds no
 * edge to the module graph.
 */
export const CAST_DICE_COUNT_PHRASE =
  /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|a|an)\s+(?:dice|die|d6s?)\b/i;

/**
 * THE T-206 WORKLIST, and the reason this validator can be strict TODAY.
 *
 * T-205 is the schema task: it ships the two fields, the rules below, and THREE
 * worked examples (Iron Vex, Cargo King, Solar Flare — one fighter, one trader,
 * one gambler, so the example proves voice differentiation rather than a
 * template). The remaining 27 captains are T-206's authoring pass.
 *
 * Without this set, `defineNpcProfiles` would throw on 27 unauthored rows at
 * import — i.e. `import '@spacerquest/content'` would throw, and every suite in
 * the repository would be red. With it, the coverage rule is LIVE and unconditional
 * for every captain not named here, which is what "fails loudly on any of the 30
 * missing a slot" has to mean while the roster is half-authored.
 *
 * IT CANNOT ROT SILENTLY. Three rules hold it honest: an id here that is not on
 * the roster is an error; a captain here who HAS been authored is an error naming
 * the fix; and a `QUEST_PROFILES` id here is an error (their voice is optional by
 * design, so waiving them would be meaningless).
 *
 * T-206'S JOB, stated so it is mechanical: author a captain, delete their id from
 * this set. When the set is empty, DELETE IT and the one `waived` branch in
 * `validateNpcVoices` that reads it — the rule underneath is already the final
 * rule, and an empty waiver left in place is an invitation to refill it.
 */
export const VOICE_AUTHORING_PENDING: ReadonlySet<string> = new Set([
  'npc-admiral-stern',
  'npc-nova-blitz',
  'npc-black-tide',
  'npc-frost-helm',
  'npc-atlas-prime',
  'npc-crimson-ace',
  'npc-zero-risk',
  'npc-neon-fox',
  'npc-warp-hound',
  'npc-gold-rush',
  'npc-star-gazer',
  'npc-the-warden',
  'npc-nebula-rose',
  'npc-the-phantom',
  'npc-crash-override',
  'npc-the-chef',
  'npc-junk-lord',
  'npc-iron-clad',
  'npc-stellar-drift',
  'npc-void-runner',
  'npc-crimson-hawk',
  'npc-neon-shade',
  'npc-dust-devil',
  'npc-star-chaser',
  'npc-rogue-star',
  'npc-plasma-burn',
  'npc-comet-tail',
]);

/** Own type guard rather than a bare `Array.isArray`, which narrows a typed value
 *  to `any[]` and would erase `readonly string[]` for every read below — the trap
 *  `liarsDiceValidation.ts` records at its own array guard. */
function isLineArray(value: unknown): value is readonly string[] {
  return Array.isArray(value);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

/**
 * One authored slot: an array of barks. READERS (T-207): the Liar's Dice pane at
 * the roaming-captain seat (`tableTalk`) and the combat readout's named-interceptor
 * branch (the four catchphrase slots). Both print a chosen line VERBATIM.
 */
function validateBarkList(
  errors: string[],
  path: string,
  value: unknown,
  range: { readonly min: number; readonly max: number },
  options: { readonly banDiceCount: boolean },
): void {
  if (!isLineArray(value)) {
    errors.push(`${path} must be an array of authored lines`);
    return;
  }
  // An empty slot is the failure this task's Accept names explicitly: the field
  // exists, the type checks, and the captain says nothing at the moment they are
  // supposed to speak. Reported separately from the count rule so the message is
  // the one an author needs.
  if (value.length === 0) {
    errors.push(`${path} must not be empty`);
    return;
  }
  if (value.length < range.min || value.length > range.max) {
    errors.push(`${path} must hold ${range.min}-${range.max} lines (got ${value.length})`);
  }

  const seen = new Set<string>();
  value.forEach((line, index) => {
    const linePath = `${path}[${index}]`;
    if (typeof line !== 'string' || line.trim().length === 0) {
      errors.push(`${linePath} must be a non-empty string`);
      return;
    }
    if (line.length > MAX_BARK_LENGTH) {
      errors.push(`${linePath} must be <= ${MAX_BARK_LENGTH} chars (got ${line.length})`);
    }
    // The lines are printed VERBATIM — there is no interpolation step anywhere on
    // their path — so a `{captain}` would reach the player as literal braces. The
    // same rule the roster lines and the renown citations keep.
    if (line.includes('{') || line.includes('}')) {
      errors.push(`${linePath} must not contain a {…} placeholder`);
    }
    // A slot with the same line twice is a shorter slot pretending otherwise: the
    // draw is uniform, so the duplicate simply doubles that line's odds.
    if (seen.has(line)) {
      errors.push(`${linePath} duplicates an earlier line in ${path}`);
    } else {
      seen.add(line);
    }
    if (options.banDiceCount && CAST_DICE_COUNT_PHRASE.test(line)) {
      errors.push(
        `${linePath} must not name a dice count — the count moves with the unlock ladder`,
      );
    }
  });
}

/**
 * The shape rules, applied to whatever voice a profile carries.
 *
 * `requirePresence` is the ONLY thing the T-206 waiver relaxes. Once a field is
 * present it is validated in full, waived or not — a half-authored captain is the
 * state that would reach a player, and it must never be cheaper than authoring
 * them properly.
 */
function validateVoice(
  errors: string[],
  path: string,
  profile: NpcProfile,
  options: { readonly requirePresence: boolean },
): void {
  const talk: unknown = profile.tableTalk;
  const phrases: unknown = profile.catchphrases;
  const hasTalk = talk !== undefined;
  const hasPhrases = phrases !== undefined;

  if (options.requirePresence) {
    if (!hasTalk) {
      errors.push(`${path}.tableTalk is missing — every simulated captain owes 2-4 lines`);
    }
    if (!hasPhrases) {
      errors.push(
        `${path}.catchphrases is missing — every simulated captain owes enter/duringBattle/win/loss`,
      );
    }
  }

  // ALL OR NOTHING, checked even when waived. Half a voice is worse than none:
  // T-207 would render a captain who enters a fight silently and then quips on the
  // win, which reads as a bug rather than as unfinished content.
  if (hasTalk !== hasPhrases) {
    errors.push(
      `${path} carries half a voice — tableTalk and catchphrases are authored together or not at all`,
    );
  }

  if (hasTalk) {
    validateBarkList(errors, `${path}.tableTalk`, talk, TABLE_TALK_RANGE, { banDiceCount: true });
  }

  if (!hasPhrases) {
    return;
  }
  if (!isRecord(phrases)) {
    errors.push(`${path}.catchphrases must be an object with enter/duringBattle/win/loss`);
    return;
  }
  for (const slot of CATCHPHRASE_SLOTS) {
    const lines = phrases[slot];
    // A partial catchphrase object is malformed regardless of the waiver: the
    // waiver excuses an UNVOICED captain, never a captain voiced for three of the
    // four moments a fight has.
    if (lines === undefined) {
      errors.push(`${path}.catchphrases.${slot} is missing`);
      continue;
    }
    validateBarkList(errors, `${path}.catchphrases.${slot}`, lines, CATCHPHRASE_RANGE, {
      // Scoped deliberately: the dice-count ban protects a Liar's Dice line. A
      // combat bark may say whatever it likes about dice.
      banDiceCount: false,
    });
  }
}

/**
 * The 30 SIMULATED captains (`NPC_PROFILES`). Voice is REQUIRED here — these are
 * the records that can deal a roaming Liar's Dice hand and the only ones the
 * grudge weighting can draw as a named interceptor — except for the ids still on
 * {@link VOICE_AUTHORING_PENDING}, which T-206 is emptying.
 */
export function validateNpcVoices(profiles: readonly NpcProfile[]): string[] {
  const errors: string[] = [];
  const rosterIds = new Set<string>();

  profiles.forEach((profile, index) => {
    const path = `npcProfiles[${index}](${String(profile.id)})`;
    rosterIds.add(profile.id);
    const waived = VOICE_AUTHORING_PENDING.has(profile.id);
    validateVoice(errors, path, profile, { requirePresence: !waived });
    // WAIVER HYGIENE 1 · authoring a captain must SHRINK the worklist. Without
    // this, T-206 could author all 27 and leave a 27-name set behind that exempts
    // the very rows it names, and the next captain added to the roster would
    // inherit an exemption nobody granted.
    if (waived && (profile.tableTalk !== undefined || profile.catchphrases !== undefined)) {
      errors.push(
        `${path} is authored — delete '${profile.id}' from VOICE_AUTHORING_PENDING (T-206)`,
      );
    }
  });

  // WAIVER HYGIENE 2 · a typo'd or stale id here exempts nobody, and would sit in
  // the set forever looking like work outstanding.
  for (const pendingId of VOICE_AUTHORING_PENDING) {
    if (!rosterIds.has(pendingId)) {
      errors.push(`VOICE_AUTHORING_PENDING names '${pendingId}', which is not an NPC_PROFILES id`);
    }
  }

  return errors;
}

/**
 * The 11 QUEST captains (`QUEST_PROFILES`), which reuse `NpcProfile`.
 *
 * PRESENCE IS NEVER REQUIRED — see the decision recorded on `NpcProfile.tableTalk`
 * in `cast.ts`. A quest captain takes no simulated turn (`isSimulatedCaptain`), is
 * never dealt a roaming Liar's Dice seat and is excluded from the named-interceptor
 * pool by construction, so there is no surface that could draw a line from them.
 * MALFORMED presence is still caught, so that if a later task does voice one, it
 * validates on the same terms as the 30.
 */
export function validateQuestVoices(profiles: readonly NpcProfile[]): string[] {
  const errors: string[] = [];

  profiles.forEach((profile, index) => {
    const path = `questProfiles[${index}](${String(profile.id)})`;
    validateVoice(errors, path, profile, { requirePresence: false });
    // WAIVER HYGIENE 3 · waiving a quest captain is meaningless (nothing is
    // required of them), so an id here is a sign somebody mistook the two rosters.
    if (VOICE_AUTHORING_PENDING.has(profile.id)) {
      errors.push(
        `${path} is a quest captain and must not appear in VOICE_AUTHORING_PENDING (their voice is optional by design)`,
      );
    }
  });

  return errors;
}

/** Throws on any structural error, so a malformed cast fails at IMPORT rather than
 *  at the table or mid-fight. The `defineDeeds` / `defineLiarsDiceOpponents`
 *  precedent — every error is listed, not just the first. */
export function defineNpcProfiles(profiles: NpcProfile[]): NpcProfile[] {
  const errors = validateNpcVoices(profiles);
  if (errors.length > 0) {
    throw new Error(`Invalid NPC profile content:\n - ${errors.join('\n - ')}`);
  }
  return profiles;
}

/** The same contract for the quest roster. Separate function, not a flag, because
 *  the two rosters answer a DIFFERENT question about presence and the call site
 *  should say which one it is asking. */
export function defineQuestProfiles(profiles: NpcProfile[]): NpcProfile[] {
  const errors = validateQuestVoices(profiles);
  if (errors.length > 0) {
    throw new Error(`Invalid quest profile content:\n - ${errors.join('\n - ')}`);
  }
  return profiles;
}
