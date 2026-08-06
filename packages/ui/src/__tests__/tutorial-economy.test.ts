import { describe, expect, it } from 'vitest';
import { createInitialState, startDay, type GameState } from '@spacerquest/engine';
import { SOCIAL_PLAYS_PER_DAY } from '@spacerquest/content';
import { ONBOARDING_PROMPTS } from '../format';
import { WALKTHROUGH_STEPS, walkthroughCardCopy, armedWalkthrough } from '../walkthrough';

// ---------------------------------------------------------------------------
// T-194 · THE TUTORIAL TEACHES THE TWO-CLASS ECONOMY, PINNED AS BEHAVIOUR.
//
// THE FINDING THIS DEFENDS. M17 (docs/DAWN-HAND-REDESIGN.md §3) freed ten
// administrative verbs in the engine (T-196a), taught the instruments (T-196b)
// and un-gated the cockpit's buttons (T-196c) — but the TUTORIAL kept telling
// players that signing a contract, buying fuel and topping the tank each cost a
// die. Both files carried an explicit "STALE COPY … OWNED BY T-194" marker while
// that was true. Copy that contradicts the rules is worse than no copy: it
// teaches a player to hoard a resource they are not spending.
//
// PROSE CANNOT BE ASSERTED WORD FOR WORD without freezing the writing, so what is
// pinned here is the CLAIM the prose is not allowed to make: no sentence anywhere
// in either registry may price a FREED verb in dice. That is a negative control
// with real teeth — it fails on any of the four original lines, and it keeps
// failing for any future rewrite that reintroduces the same error in new words.
//
// MUTATION-CHECKED, not merely written: restoring the pre-T-194 w3 `what` ("The
// armed die pays for the signature") or the pre-T-194 `first-sign` body ("assign
// a die to a manifest offer") turns the negative control red. Confirmed, reverted.
// ---------------------------------------------------------------------------

/** The verbs M17 FREED. A sentence that names one of these must not, in the same
 *  breath, price it in dice. */
const FREED_VERB =
  /\b(sign|signs|signed|signing|signature|contract|manifest|offer|job|fuel|depot|shipyard|yard|hire|hires|hiring|dismiss|berth|port stake)\b/i;

/** Phrasings that PRICE something in dice. Deliberately narrow: it must match a
 *  claim that a die is what pays, not any mention of a die at all — "arm a die",
 *  "costs no die" and "extra dice as a toll" are all legitimate things to say. */
const DIE_PRICE =
  /\b(costs? (a|an|another|one|the) die|spends? (a|an|another|one|the) die|takes? (a|an|another|one|the) die|a die too|die pays|pays for the|assign (a|an|another|one|the) die|commit (a|an|another|one|the) die|wager a die|(each|every|one) die is (one|an|a single) action|(a|one) die (buys|pays for|prices))\b/i;

/** Split a body into sentences, so the control judges a CLAIM rather than a
 *  paragraph that happens to contain two unrelated words. */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

interface Line {
  where: string;
  text: string;
}

function career(seed = 1): GameState {
  return startDay(createInitialState(seed)).state;
}

/** Every player-facing string in both tutorial registries, including the three
 *  DYNAMIC walkthrough substitutions (`walkthroughCardCopy`), which are exactly
 *  where a stale die claim could hide from a scan of the static table. */
function tutorialLines(): Line[] {
  const lines: Line[] = [];
  for (const step of WALKTHROUGH_STEPS) {
    lines.push({ where: `${step.id}.what`, text: step.what });
    lines.push({ where: `${step.id}.why`, text: step.why });
  }
  const record = { ...armedWalkthrough(), lastPayment: 2500 };
  const dryTank = (() => {
    const game = career();
    return { ...game, player: { ...game.player, ship: { ...game.player.ship, fuel: 0 } } };
  })();
  const pinned = (() => {
    const game = career();
    return {
      ...game,
      player: {
        ...game.player,
        recovery: {
          poiId: 'p',
          systemId: game.player.currentSystemId,
          outcomeId: 'salvage.deep',
          startedDay: game.day,
          dueDay: game.day + 2,
        },
      },
    };
  })();
  const rimPort = (() => {
    const game = career();
    return { ...game, player: { ...game.player, currentSystemId: 15 } };
  })();
  for (const [name, game] of [
    ['fresh', career()],
    ['dry-tank', dryTank],
    ['salvage-pinned', pinned],
    ['rim-port', rimPort],
  ] as const) {
    for (const step of WALKTHROUGH_STEPS) {
      const copy = walkthroughCardCopy(record, step, game);
      lines.push({ where: `${step.id}.what@${name}`, text: copy.what });
      lines.push({ where: `${step.id}.why@${name}`, text: copy.why });
    }
  }
  for (const prompt of ONBOARDING_PROMPTS) {
    lines.push({ where: `${prompt.id}.title`, text: prompt.title });
    lines.push({ where: `${prompt.id}.body`, text: prompt.body });
  }
  return lines;
}

describe('T-194 · NEGATIVE CONTROL — no tutorial line prices a FREED verb in dice', () => {
  it('has real lines to judge (the control is not looping zero times)', () => {
    const lines = tutorialLines();
    expect(lines.length).toBeGreaterThan(50);
    // The regex pair is live, proved on the four strings this task deleted.
    const stale = [
      'Click an offer on the Manifest Board to sign it. The armed die pays for the signature.',
      'Arm another die, click your destination on the starmap, then Confirm jump. Short on fuel? Buy some at the depot first — that costs a die too.',
      'Your hold is empty — assign a die to a manifest offer to take a job.',
      'Each die is one action: sign a job, buy fuel, make a jump, sweep off-lane, sit at a table.',
    ];
    for (const line of stale) {
      const offending = sentences(line).filter((s) => FREED_VERB.test(s) && DIE_PRICE.test(s));
      expect(offending.length, `the control failed to catch: ${line}`).toBeGreaterThan(0);
    }
  });

  it('no walkthrough step and no onboarding prompt makes the claim', () => {
    const offences: string[] = [];
    for (const { where, text } of tutorialLines()) {
      for (const sentence of sentences(text)) {
        if (FREED_VERB.test(sentence) && DIE_PRICE.test(sentence)) {
          offences.push(`${where}: ${sentence}`);
        }
      }
    }
    expect(offences).toEqual([]);
  });

  it('no cockpit TOOLTIP prices an action in dice for a verb M17 freed', async () => {
    // The registries above are only half the teaching surface: the hover `title`
    // on a control is the other half, and it is where the four stalest strings in
    // the cockpit were hiding — all three `SOCIAL_TITLES` and BOTH lending
    // buttons still said "(spends a die)" long after T-197 freed them. Scanned as
    // SOURCE because these are literals in JSX, not entries in a table.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const SRC = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..');
    const APP = fs.readFileSync(path.join(SRC, 'App.tsx'), 'utf8');
    const titleLines = APP.split('\n').filter((l) => /title=|: '|: `/.test(l));
    expect(titleLines.length).toBeGreaterThan(20);
    const priced = titleLines.filter((l) => /spends? (a|an|one) die/i.test(l));
    expect(priced).toEqual([]);
    // The control is live: the exact strings this task deleted still trip it.
    expect(
      ["      meet: 'Give your name to the table (spends a die)',"].filter((l) =>
        /spends? (a|an|one) die/i.test(l),
      ),
    ).toHaveLength(1);
  });

  it('the two "STALE COPY … OWNED BY T-194" markers are gone from both files', async () => {
    // Leaving a marker that says the copy is a lie, on copy that has been fixed,
    // would itself be a lie. Read as source rather than as text, so a rename
    // cannot hide one.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const SRC = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..');
    for (const file of ['format.ts', 'walkthrough.ts']) {
      expect(fs.readFileSync(path.join(SRC, file), 'utf8')).not.toContain('OWNED BY T-194');
    }
  });
});

describe('T-194 · POSITIVE — the split is actually taught, and demonstrated', () => {
  it('at least one walkthrough step and one prompt name Free Actions as costing no die', () => {
    const freeClaim = /\b(free action|costs? no die|is free|are free|never touch the hand)\b/i;
    expect(
      WALKTHROUGH_STEPS.filter((s) => freeClaim.test(s.what) || freeClaim.test(s.why)).map(
        (s) => s.id,
      ).length,
    ).toBeGreaterThan(0);
    expect(ONBOARDING_PROMPTS.filter((p) => freeClaim.test(p.body)).length).toBeGreaterThan(0);
  });

  it('the FREE step and the MAIN step are still back to back, so the contrast is felt', () => {
    // The Accept's "demonstrate, don't just state": w3 signs a contract (Free) and
    // w4 makes the jump (Main) with the SAME die still armed. Reordering them
    // would leave the copy true and the lesson gone.
    const ids = WALKTHROUGH_STEPS.map((s) => s.id);
    expect(ids.indexOf('w4-make-the-jump')).toBe(ids.indexOf('w3-take-contract') + 1);
    const w3 = WALKTHROUGH_STEPS[ids.indexOf('w3-take-contract')];
    const w4 = WALKTHROUGH_STEPS[ids.indexOf('w4-make-the-jump')];
    expect(`${w3.what} ${w3.why}`).toMatch(/free/i);
    expect(`${w4.what} ${w4.why}`).toMatch(/main action/i);
  });

  it('w2 no longer asserts that nothing acts until a die is armed — it is false since M17', () => {
    const w2 = WALKTHROUGH_STEPS.find((s) => s.id === 'w2-assign-die')!;
    expect(w2.why).not.toContain('Nothing in the cockpit will take an action until a die is armed');
    expect(`${w2.what} ${w2.why}`).toMatch(/main action/i);
  });
});

describe('T-194 · the social pool is taught at the Cantina, and NOWHERE else', () => {
  it('first-hangout interpolates SOCIAL_PLAYS_PER_DAY from content', () => {
    const prompt = ONBOARDING_PROMPTS.find((p) => p.id === 'first-hangout')!;
    expect(prompt.body).toContain(String(SOCIAL_PLAYS_PER_DAY));
    expect(prompt.body).toMatch(/social play/i);
  });

  it('no other prompt and no walkthrough step front-loads it', () => {
    const pool = /social play/i;
    expect(ONBOARDING_PROMPTS.filter((p) => pool.test(p.body)).map((p) => p.id)).toEqual([
      'first-hangout',
    ]);
    expect(
      WALKTHROUGH_STEPS.filter((s) => pool.test(`${s.what} ${s.why}`)).map((s) => s.id),
    ).toEqual([]);
  });
});

describe('T-194 · the onboarding id sequence is a frozen contract', () => {
  it('is exactly the order e2e/onboarding.spec.ts walks, so a copy pass cannot break it', () => {
    expect(ONBOARDING_PROMPTS.map((p) => p.id)).toEqual([
      'first-encounter',
      'dawn-roll',
      'first-sign',
      'first-jump',
      'first-hangout',
      'first-loan',
      'first-contraband',
      'first-port',
      'first-explore',
    ]);
  });
});
