import { DEEDS, RENOWN_DEED_THRESHOLDS, RENOWN_RANKS } from '@spacerquest/content';
import { rankForDeedCount, type GameState } from '@spacerquest/engine';
import { beforeAll, describe, expect, it } from 'vitest';
import { driveCompetentCampaign } from './support/campaign-drivers.js';
import { deedHunterPolicy, HUNTER_TARGET_DEED_IDS } from './support/deed-hunter.js';

// ---------------------------------------------------------------------------
// T-1504d · Deed coverage + CONQUEROR reachability, PROVEN THROUGH PLAY.
//
// This file discharges two acceptances off ONE pair of drives:
//   (1) no authored deed is unearnable — every id in `DEEDS` is earned by the
//       engine's own deed machinery during honest headless play;
//   (2) the CONQUEROR capstone (T-1308) is reached by a long career, not set by
//       fiat — the deferral `campaign-reach.test.ts` recorded is now closed.
//
// HONESTY BAR. The drive is `driveCompetentCampaign(deedHunterPolicy, seed, 300)`
// — the same startDay → applyPlayerAction* → endDay loop `runCampaign` uses. The
// policy only ever returns legal `PlayerAction`s (see the HONESTY BAR block at
// the top of `support/deed-hunter.ts`); nothing here or there writes
// `player.registry`, `renownRank`, `credits`, `flags`, or any other state field.
// Every deed below was credited by `evaluateDeeds`, and every rank by
// `rankForDeedCount`, reacting to real action events.
//
// PINNED, NOT HUNTED. There is deliberately NO `for (seed = 1; seed <= N)` loop
// and no early break in this file — the acceptance is explicit that CI never
// re-runs the hunt. The hunt was run once, out of tree, in throwaway `.scratch/`
// scripts; the seeds it found are pinned below with their provenance.
//
// ================= SWEEP PROVENANCE (re-pinned 2026-07-26, T-1505a) ========
// RE-PIN (seeds [2,3] → [1,7]; the CONQUEROR `it` moves 2 → 1). MECHANISM:
//        T-1505a authors two systemIds-only NPC fragment scenes at CORE ports
//        (`npc.rust-bucket.scrap-sliver` at Fomalhaut-2/7, `npc.void-whisper.
//        psalm-shard` at Mira-9/8). `deedHunterPolicy` answers offered storylets
//        and spends dawn dice, so a career docking at 7 or 8 now plays an extra
//        card and diverges from there. Seeds 2 and 3 still reach CONQUEROR but no
//        longer land the long-pole `slipped_the_scan` inside 300 days.
// RE-SWEEP: seeds 1..16 of this exact driver, 300-day horizon, run in .scratch/
//        against a freshly built dist/, stopped at the fourth total seed. Seeds
//        1, 7, 8 and 16 are each INDIVIDUALLY total (44/44); every other seed in
//        the range misses only `slipped_the_scan` (the same long pole as before,
//        so the slate's difficulty profile is unchanged). Seeds 1 and 7 are the
//        cheapest total pair.
// MEASURED (re-pin): seed 1 — CONQUEROR on day 53, last deed on day 218.
//                    seed 7 — CONQUEROR on day 47, last deed on day 217.
//        The 300-day horizon still leaves >80 days of headroom past the binding
//        last deed, so it is unchanged.
// ONLY THE SEEDS MOVED. No assertion was widened, banded, or dropped.
//
// ================= ORIGINAL SWEEP PROVENANCE (2026-07-26) ==================
// SWEEP: seeds 1..200, horizon 300 days, driver
//        `driveCompetentCampaign(deedHunterPolicy, seed, 300)` — byte-identical
//        to the drive this file runs (the `.scratch/` script imports the same
//        `support/deed-hunter.ts` module, so the action stream is the same one).
//        Run against a freshly built `dist/` (`npx tsc -b`), because
//        `packages/sim` has no vitest alias config and resolves
//        `@spacerquest/engine` / `@spacerquest/content` through `package.json#main`.
// RESULT: union over the 200 seeds = 44/44 authored deeds. See the Delivered
//        note in TASKS.md for the full per-deed hit-count table; the long pole is
//        `slipped_the_scan` (the patrol scan survived with illicit cargo still in
//        the hold), which is why the hunter's "stay dirty" branch exists at all.
// WHY THESE TWO SEEDS: both seed 2 and seed 3 are INDIVIDUALLY total — each earns
//        all 44 inside 300 days — so either alone would satisfy criterion (1).
//        Two are pinned rather than one because a single total seed cannot
//        distinguish "the slate is broadly earnable" from "one lucky career";
//        two independent total careers make an accidental regression far less
//        likely to slip through. They are the cheapest such pair (seed 1 is 43/44
//        even at a 500-day horizon — it never lands `slipped_the_scan`).
// MEASURED FACTS pinned in the assertions below:
//        seed 2 — CONQUEROR crossed on day 102; last deed (`slipped_the_scan`)
//                 earned on day 286; ~8.6s to drive 300 days.
//        seed 3 — CONQUEROR crossed on day 57; last deed (`mercy_runner`) earned
//                 on day 282; ~8.0s to drive 300 days.
// HORIZON: 300 days, not 500. Measured: 500 days changes no outcome on either
//        pinned seed (still 44/44, still CONQUEROR) and costs ~3x the wall time.
//        300 leaves 14 days of headroom past seed 2's last deed, which is the
//        binding one.
// ONLY THE SEED AND HORIZON ARE PINNED. No assertion below is widened, banded,
//        or dropped: the deed target set is DERIVED from `DEEDS` (so a deed added
//        later with no coverage reds this test — that is the point), and the
//        per-seed check asserts the measured TOTAL, not a `>= n` floor.
// ==========================================================================
// ---------------------------------------------------------------------------

/** See SWEEP PROVENANCE above. Explicit and fixed — never a hunt range. */
const PINNED_SEEDS = [1, 7] as const;
/** See SWEEP PROVENANCE above. */
const HORIZON = 300;

/** Every authored deed id. DERIVED, never hand-listed. */
const ALL_DEED_IDS = DEEDS.map((deed) => deed.id);

/** seed → the career it produced. Driven once and shared by both `it`s, so the
 *  CONQUEROR proof does not pay for a second 300-day campaign. */
const RUNS = new Map<number, GameState>();

function earnedIds(state: GameState): Set<string> {
  return new Set(state.player.registry.earned.map((deed) => deed.id));
}

beforeAll(() => {
  for (const seed of PINNED_SEEDS) {
    RUNS.set(seed, driveCompetentCampaign(deedHunterPolicy, seed, HORIZON));
  }
}, 120000);

describe('T-1504d deed coverage + Conqueror reachability (pinned seeds)', () => {
  it('the hunter steers for deed ids that actually exist', () => {
    // DRIFT GUARD. `DeedId` is `string`, so the ids inside `deed-hunter.ts`'s
    // `need(…)` calls are unchecked against content. If a deed is renamed there,
    // the policy silently stops steering for it and the pins rot for a reason no
    // assertion would name. The union type in the hunter catches a typo at
    // compile time; this catches a content-side rename.
    const unknown = HUNTER_TARGET_DEED_IDS.filter((id) => !ALL_DEED_IDS.includes(id));
    expect(unknown, `deed-hunter steers for non-existent deeds: ${unknown.join(', ')}`).toEqual([]);
  });

  it('every authored deed is earned through play across the pinned seeds', () => {
    const union = new Set<string>();
    for (const seed of PINNED_SEEDS) {
      const state = RUNS.get(seed)!;

      // The stronger, MEASURED fact: each pinned seed is individually total.
      // Asserted as the exact total rather than a `>= n` band — the sweep says
      // these careers earn the whole slate, so pin the whole slate.
      const missingForSeed = ALL_DEED_IDS.filter((id) => !earnedIds(state).has(id));
      expect(
        missingForSeed,
        `seed ${seed} failed to earn ${missingForSeed.length} deed(s): ${missingForSeed.join(', ')}`,
      ).toEqual([]);

      for (const id of earnedIds(state)) union.add(id);
    }

    const missing = ALL_DEED_IDS.filter((id) => !union.has(id));
    expect(
      missing,
      `deeds never earned across seeds ${PINNED_SEEDS.join('/')}: ${missing.join(', ')}`,
    ).toEqual([]);

    // HONESTY: nothing in the drive assigned a rank. The rank each career ended
    // on is exactly what `rankForDeedCount` returns for the number of deeds it
    // actually banked — if a test (or the policy) had poked `renownRank`, this
    // would disagree.
    for (const seed of PINNED_SEEDS) {
      const state = RUNS.get(seed)!;
      expect(rankForDeedCount(state.player.registry.earned.length)).toBe(
        state.player.registry.renownRank,
      );
    }
  }, 30000);

  it('a long veteran career reaches CONQUEROR through play, not by fiat', () => {
    // T-1308 deferred this proof: the capstone rank was reachable only from a
    // hand-constructed state (`engine/__tests__/deeds.test.ts`). This is the
    // first time it is shown to arrive out of a real career.
    const seed = 1; // T-1505a re-pin (was 2) — see SWEEP PROVENANCE above.
    const state = RUNS.get(seed)!;

    expect(state.player.registry.renownRank).toBe('CONQUEROR');
    // The rank is a function of the EARNED COUNT — imported from content, never
    // a literal 30, so T-1603's threshold rescale moves this assertion with it.
    expect(state.player.registry.earned.length).toBeGreaterThanOrEqual(
      RENOWN_DEED_THRESHOLDS.CONQUEROR,
    );

    // THROUGH PLAY, not computed at the horizon: the crossing itself was logged
    // on a specific day by `evaluateDeeds` (engine deeds.ts). `eventLog` is
    // unbounded (day.ts only ever pushes), so the whole 300-day log is here.
    const rankUps = state.eventLog.filter(
      (event): event is Extract<typeof event, { type: 'RenownRankUp' }> =>
        event.type === 'RenownRankUp' && event.newRank === 'CONQUEROR',
    );
    expect(
      rankUps.length,
      `no RenownRankUp{newRank:'CONQUEROR'} in seed ${seed}'s log`,
    ).toBeGreaterThanOrEqual(1);
    expect(
      rankUps[0].day,
      `CONQUEROR crossed on day ${rankUps[0]?.day} (sweep measured day 53)`,
    ).toBeLessThanOrEqual(HORIZON);
    // The crossing was an ASCENT — the previous rank sits below the capstone.
    expect(rankUps[0].previousRank).not.toBe('CONQUEROR');
    expect(rankUps[0].deedCount).toBeGreaterThanOrEqual(RENOWN_DEED_THRESHOLDS.CONQUEROR);

    // READER of `RENOWN_RANKS.CONQUEROR.citation` (T-1308's intended reader (a)):
    // the capstone's authored period-voice line IS the rank-up wire, emitted at
    // engine `deeds.ts` alongside the RenownRankUp. Compared against the imported
    // content string, never a literal — and until now that branch had only ever
    // been proven from a constructed state.
    //
    // T-1308's OTHER reader — (b), the Nemesis-crossing stake gate — is still not
    // asserted here, but it is no longer a deferral: T-1505b DELIVERED it
    // (`CROSSING_REQUIRED_RANK` → engine `quoteCrossingStake`), and it is asserted
    // both ways in `packages/engine/src/__tests__/crossing.test.ts`. This test
    // remains the proof of reader (a) — the capstone citation reaching the wire
    // from unguided play — and deliberately does not duplicate (b)'s ladder.
    const citations = state.eventLog.filter(
      (event): event is Extract<typeof event, { type: 'WireEntry' }> =>
        event.type === 'WireEntry' && event.message === RENOWN_RANKS.CONQUEROR.citation,
    );
    expect(
      citations.length,
      'the CONQUEROR citation never reached the wire during play',
    ).toBeGreaterThanOrEqual(1);
    expect(citations[0].day).toBe(rankUps[0].day);
  }, 30000);
});
