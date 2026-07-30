import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  degradedTraderPolicy,
  resolvePolicy,
  runCampaign,
  traderPolicy,
  type SimPolicyName,
} from '../index.js';

// ---------------------------------------------------------------------------
// R1 (docs/BALANCE-REDESIGN-WORKLIST.md) · THE HUMAN-PLAUSIBLE PILOT.
//
// `trader-degraded` exists to answer one gating question: is the trader's
// perfect survival record a property of the ENGINE (escape is near-free) or an
// artifact of a sim policy that plays optimally? It is a MEASUREMENT INSTRUMENT,
// so this spec pins the two things a measurement instrument must be:
//
//   1. NON-INVASIVE — adding it changed no shipped policy. The trader and its six
//      fleetmates must still produce byte-identical reports, or the R1 sweep is
//      comparing against a baseline that no longer exists. This is the load-
//      bearing assertion in the file.
//   2. ACTUALLY DEGRADED — it must differ from the trader (else it measures the
//      trader again under another name) while still being a CAPTAIN rather than a
//      random-action generator (else it measures nothing a player would do).
//
// It is deliberately absent from `campaign-policies.test.ts`'s COMPETENT_POLICIES:
// the T-1605b anti-poverty-trap invariant is a promise about what the world offers
// a captain who plays WELL (errata E4), and a policy that flies thin-tanked on
// purpose is not making that claim.
// ---------------------------------------------------------------------------

/** The shipped fleet whose reports are pinned. `trader` first because it is the
 *  row R1 compares the degraded pilot against. */
const UNCHANGED_POLICIES = [
  'trader',
  'fighter',
  'explorer',
  'veteran',
  'smuggler',
  'gambler',
  'greedy',
] as const satisfies readonly SimPolicyName[];

/**
 * Report fingerprints for seeds 1..5 × 40 days.
 *
 * WHY A HASH AND NOT A PROPERTY. The R1 refactor threads a `degradation` argument
 * through the trader's whole day plan and adds an optional slip to the shared
 * `dieLedger` every competent policy builds. Any of those touch points could
 * shift a die index, an rng draw order, or an action ordering in a way no
 * hand-written assertion would notice — and the resulting sweep would look
 * entirely plausible while being incomparable to the pinned balance baseline. A
 * whole-report hash is the only assertion that cannot be accidentally satisfied.
 *
 * IF THIS FAILS: a change altered shipped-policy behavior. That is not necessarily
 * wrong — but it invalidates the pinned balance baseline, so re-pin the sweep
 * DELIBERATELY (BALANCE-POLICY.md), never by editing a number here to match.
 *
 * ---------------------------------------------------------------------------
 * RE-PIN LOG. Every move of these numbers is recorded here with its cause, so a
 * later reader can tell a deliberate re-pin from a silent regression.
 *
 * 1. ORIGINAL (755ff2a0, "T-1605: an ordinary jump always arrives") — the values
 *    R1 was measured against, proving R1 changed no shipped policy:
 *      trader 86c444b8ec619187 · fighter 97180262cbc60805
 *      explorer daf1070d7cead726 · veteran 437f73e973337248
 *      smuggler 14d763cf29110467 · gambler 4cd7cdfe4cec356e
 *      greedy d0dbf1836f6246e9
 *
 * 2. R0a — `planPacifistCombat` now asks the engine for the tribute
 *    (`tributeForRound`) instead of estimating it as `min(round*1000, 10_000)`.
 *    See the block comment at that call site for why the estimate was a bug.
 *    MOVED: `trader`, `fighter`. UNCHANGED: the other five — not because they
 *    skip the code (all six competent policies route through
 *    `planPacifistCombat`) but because within THIS window (5 seeds × 40 days)
 *    none of them met an interceptor whose corrected demand crossed the
 *    affordability threshold their decision turns on. The corrected number only
 *    differs when a class multiplier ≠ 1 or a tier gap > 0 is in play. Treat
 *    "unchanged here" as "unchanged in this window", never as "unaffected" —
 *    the 100-seed × 120-day sweep moves more rows than this test does.
 *
 * 3. R2a — `planFighterUpgrade` no longer stops buying at weapons strength 50
 *    (it walks the yard's own tier ladder to 9). See the block comment at that
 *    function for the measurement: the ceiling pinned `player.tier` at 3 and made
 *    the tier-4/5 half of the interceptor roster unreachable.
 *    MOVED: `fighter` (470eb1043295bbc1 → e2395367a39b41fc) and `veteran`
 *    (437f73e973337248 → ecc8c84bb5e09622) — the two policies that share the
 *    wishlist. UNCHANGED: the other five, and here that IS "unaffected" rather
 *    than "unaffected in this window" — the 1,000-seed sweep confirms every other
 *    policy row is byte-identical, which is the control proving the diff is this
 *    function alone.
 *
 * 4. R2c — three changes landed together (see the worklist R2c result): the yard
 *    trade-in ladder is indexed by owned TIER instead of raw strength (it used to
 *    make every mid-ladder upgrade free), a destroyed interceptor now pays wreck
 *    salvage, and the fighter clears the Guild marker before buying kit.
 *    MOVED: ALL SEVEN. Note that even the policies whose BEHAVIOR is unchanged
 *    (trader, gambler, greedy — byte-identical rows in the 1,000-seed sweep) move
 *    here, because `CombatEncounterRecord` gained a `salvageCredits` field and
 *    this fingerprint hashes the whole report JSON, shape included. A moved hash
 *    is therefore NOT by itself evidence of a behavior change at this step; the
 *    sweep is.
 *
 * 5. N9 — the three verbs the instrument had never played. Every competent
 *    policy now spends its spare dull die on the captain's overhead (cabin
 *    berths -> `Crew` hires -> a `Port` stake, all out of the surplus left after
 *    the whole Guild marker is held back) and prepends a `Reroll` when the
 *    sharpest die in the hand is below a fresh one's expectation. See the N9
 *    block comment above `planReroll` in `../index.ts`.
 *      trader   467a83d44e32daf0 -> 2e4f1623f239a489
 *      fighter  b6ef1dc02f374170 -> 620348f8c23055bf
 *      explorer 90d35d3c4836eef0 -> 6f4d8c179c605b65
 *      smuggler b480fc6f603a673b -> 49d98c0014f5623f
 *      gambler  de62c3103de74d72 -> 29fc3a0c3839cdc5
 *    UNCHANGED, and each for its own reason:
 *      * `greedy` (8a150df20e85b2e1) is UNTOUCHED BY DESIGN — it runs
 *        `greedyTraderPolicy`, which N9 never calls into. It is the cautionary
 *        control R0a used for exactly this purpose, and the 1,000-seed capstone
 *        confirms its whole row is byte-identical.
 *      * `veteran` (ece2f5c30e0da953) DOES take the new code path, but is
 *        unchanged IN THIS WINDOW: 5 seeds x 40 days never leaves it solvent
 *        above its 3,000 reserve AND its outstanding marker at once, so the
 *        overhead planner never fires. Read that as "unchanged here", never as
 *        "unaffected" — the capstone moves the veteran row (final credits
 *        6,359 -> 6,172, clear day 100 -> 99).
 *
 * 6. N2 — NPCs upgrade their ships. ALL SEVEN moved, `greedy` included, and that
 *    is the entry worth reading before the next N-step re-pins this table.
 *      trader   2e4f1623f239a489 -> 08b757b5501d8278
 *      fighter  620348f8c23055bf -> 3868e2a61f07d811
 *      explorer 6f4d8c179c605b65 -> 2625825072195040
 *      veteran  ece2f5c30e0da953 -> aebb5d643c7411cc
 *      smuggler 49d98c0014f5623f -> 853f1da76afe73c5
 *      gambler  29fc3a0c3839cdc5 -> 976a6f103338f27a
 *      greedy   8a150df20e85b2e1 -> 2f43b0bfb33f35aa
 *    MECHANISM: not one line of any policy changed. N2 changed the WORLD the
 *    policies play in — the 30 captains got a stat-driven component seed, a
 *    player-shaped fuel tank, and an upgrade decision — and every one of those
 *    reaches the player through the shared dusk rng stream and through contract
 *    competition (`ctx.claimableBoard`, engine `day.ts`).
 *      * `greedy` IS NOT A CONTROL FOR AN NPC-SIDE CHANGE, and this is the entry
 *        that says so. R0a introduced it as the control for POLICY changes — it
 *        runs `greedyTraderPolicy`, which no policy work calls into — and N9
 *        confirmed its row byte-identical for exactly that reason. It shares a
 *        galaxy with the cast, so an N-series change moves it like everything
 *        else. Reading its movement here as "N2 leaked into the policies" would
 *        be a misdiagnosis; the 1,000-seed capstone shows the same thing.
 *
 * 7. R2c-follow-up (doc-audit) — the explorer remits to the Guild. EXACTLY ONE
 *    row moves, and that is the assertion this table is making:
 *      explorer 2625825072195040 -> 2755c18f179a8c8a
 *    MECHANISM: `explorerPolicy` gained the `planDebtPayment` call every other
 *    policy in the fleet already had. It was the only one with NO debt
 *    remittance at all, so it cleared the marker on 0 of 30 seeds and resolved
 *    `unpaid` on 30 of 30 while holding a median 39,866 credits at day 30
 *    against the 25,000 it owed; the flagged principal then compounded to
 *    148,696 by day 120, identical on every seed. With the remittance, at the
 *    1,000-seed capstone: `tourOneClearRate` 0 -> 0.78, `debtClearedDay.median`
 *    never -> 23, end debt 0. It also carries `EXPLORER_DEBT_RESERVE`, held
 *    back so the remittance cannot eat the next refuel — see that constant for
 *    the value sweep and why 6,000 rather than the operating reserve.
 *      * This is a POLICY change, so unlike entry 6 the other six rows are
 *        byte-identical — `greedy` included, back in its R0a role as the
 *        control for policy work. A second row moving here would have meant the
 *        edit leaked out of `explorerPolicy`, and none did.
 *
 * 8. N3 + N4 TOGETHER — and the fact that it is TWO steps in one entry is itself
 *    the record. ALL SEVEN rows move.
 *      trader   08b757b5501d8278 -> e25a0fe4ae77c658
 *      fighter  3868e2a61f07d811 -> aca22292cd206845
 *      explorer 2755c18f179a8c8a -> e4bea4fbe2af563c
 *      veteran  aebb5d643c7411cc -> 6f19055026802305
 *      smuggler 853f1da76afe73c5 -> 0f008671c2f48432
 *      gambler  976a6f103338f27a -> 8262c90a3fa780d7
 *      greedy   2f43b0bfb33f35aa -> aecf1a7e5a7d896b
 *    WHY TWO STEPS SHARE ONE ENTRY: N3 (NPC interdictions, permanent death and
 *    the 30/11 roster split) shipped WITHOUT re-pinning this table, so these
 *    seven rows have been red since that commit. The reopened N4 (the Ideal x
 *    archetype intent blend) then moved them again. Splitting the entry now would
 *    mean inventing an intermediate column nobody measured, so the honest form is
 *    one entry naming both — and the lesson, which entry 6 already tried to teach
 *    the next N-step: RE-PIN THIS TABLE IN THE COMMIT THAT MOVES IT.
 *    MECHANISM: entry 6's, twice over, and again not one line of any policy
 *    changed. N3 gave the cast real encounters and permanent death; N4 changed
 *    what all 30 captains choose to do with a day. Both reach the player through
 *    the shared dusk rng stream and through contract competition.
 *      * `greedy` moving is EXPECTED for the same reason entry 6 gives, and this
 *        is now the third consecutive NPC-side step where it has moved. It is a
 *        control for POLICY changes only. Reading its movement as a leak would be
 *        a misdiagnosis both times.
 *
 * 9. N10 — the shared per-system job pool. ALL SEVEN rows move, and this entry is
 *    re-pinned IN THE COMMIT THAT MOVED IT, which is what entries 6 and 8 both
 *    asked the next N-step to do.
 *      trader   e25a0fe4ae77c658 -> 6e5587cd62fc3923
 *      fighter  aca22292cd206845 -> 6bbda5a92b4f0e6b
 *      explorer e4bea4fbe2af563c -> 46147d5e9ae4fdb9
 *      veteran  6f19055026802305 -> b62056c846949576
 *      smuggler 0f008671c2f48432 -> b90fa5cc5e6c2489
 *      gambler  8262c90a3fa780d7 -> 1ace34c3afb1643b
 *      greedy   aecf1a7e5a7d896b -> 35760632ac51c736
 *    MECHANISM: entry 6's again, and once more not one line of any policy changed.
 *    N10 has TWO distinct routes into these hashes and they are worth separating,
 *    because only the second is behavioural:
 *      * SHAPE. `market.jobPoolClaims` replaced `market.npcClaims` in the state,
 *        and `CampaignStatsReport` gained `contractClaims` while `CampaignDayStats`
 *        gained `boardDepth` / `contractsSniped`. This hash covers the whole report
 *        JSON including its shape, so — exactly as entry 4 records for R2c's
 *        `salvageCredits` — a moved hash here is not by itself evidence of a
 *        behaviour change.
 *      * STREAM. A captain trading away from the player now draws a whole local
 *        board (`generateManifestBoard`) and picks off it (`pickContract`) where
 *        they used to draw one `rollContract`. That is a different number of rng
 *        draws per trading captain, so the shared dusk stream diverges and every
 *        seeded player career re-rolls downstream of the first away-haul.
 *    WHAT THE SWEEP SAYS, since this table cannot: at the 1,000-seed capstone the
 *    player's game barely moves (fleet Tour One clear 0.5199 -> 0.5180, fleet final
 *    credits median 30,425 -> 30,915, deaths/1,000 0.6448 -> 0.6573) while the
 *    CAST's day-120 median wealth goes 21,884 -> 76,049. That asymmetry is the
 *    evidence that this is an NPC-side change; see N10's Result in
 *    docs/NPC_REDESIGN.md.
 *      * `greedy` moving is EXPECTED, for the fourth consecutive NPC-side step.
 *        Entry 6 is the standing explanation and it has not needed amending since.
 *
 * 10. N11/T-021 — the Renown gate becomes reachable. ALL SEVEN rows move, and this
 *    entry is re-pinned IN THE COMMIT THAT MOVED IT (entries 6 and 8's standing
 *    request, honoured for the second consecutive step).
 *      trader   6e5587cd62fc3923 -> eb116ca31928a037
 *      fighter  6bbda5a92b4f0e6b -> 3f5a84bb0a65f91d
 *      explorer 46147d5e9ae4fdb9 -> d865b1b4aadf166c
 *      veteran  b62056c846949576 -> 306775019564eb9d
 *      smuggler b90fa5cc5e6c2489 -> 2dd84772323e6206
 *      gambler  1ace34c3afb1643b -> d3e02794985aafa9
 *      greedy   35760632ac51c736 -> 8a13d3d1802ef6a2
 *    MECHANISM: entry 6's, and again not one line of any policy changed. T-020 gave
 *    the cast a deed registry but nothing read it, so it moved no row here; T-021
 *    makes `considerRefit` ask the yard for rank-gated special equipment, so a
 *    captain who has EARNED the CAPTAIN rung spends 10,000cr on a Star Buster /
 *    Arch Angel instead of on their next component rung. TWO routes into these
 *    hashes, both world-side:
 *      * WHAT THE FIELD FLIES. `hasStarBuster` / `hasArchAngel` feed
 *        `weaponVolleyDamage` and `applyInterceptorHit`, so an armed captain
 *        survives interdictions they used to lose.
 *      * WHAT THE FIELD CAN AFFORD NEXT. The 10,000cr is money not spent on a
 *        component rung, so refuelling, jumping and hauling all shift for that
 *        captain — and a captain who can now fund a jump takes rng draws they
 *        previously skipped (`brokeIdle`), so the shared dusk stream diverges.
 *    THE DIRECT EVIDENCE that this is NPC-side, measured rather than asserted (the
 *    day-loop golden's own note carries the numbers): over the golden's ten-day
 *    window SEVEN gated purchases fire (5x Star Buster, 2x Arch Angel) while ALL 176
 *    non-NPC events in the stream — every player StatCheck, DawnRoll, TradeEvent,
 *    TravelEvent, DeedEarned, RenownRankUp, DebtPayment, StoryletOffered,
 *    DispositionChanged and ContractClaimed — diff BYTE-IDENTICAL.
 *    WHAT THIS TABLE CANNOT SAY, stated so nobody reads a verdict into it: across
 *    these 35 runs (7 policies x 5 seeds x 40 days) player final credits move median
 *    7,370 -> 5,070 and mean 9,511 -> 8,554, deed count median 16 -> 17, and offers
 *    sniped by the cast 282 -> 295 — with the per-policy direction MIXED (trader
 *    12,498 -> 14,600 and greedy 1,280 -> 2,680 up, veteran 9,335 -> 5,070 and
 *    gambler 11,080 -> 7,287 down). Five seeds cannot separate that from stream
 *    noise. T-023 owns the authoritative capstone and the four-limb verdict; do not
 *    tune anything off this window.
 *      * `greedy` moving is EXPECTED, for the fifth consecutive NPC-side step.
 *
 * 11. N11/T-022 — the instrument learns to SEE the Renown gate. ALL SEVEN rows move
 *    and NOT ONE CAREER CHANGED. This is the purest SHAPE-ONLY entry in the log, and
 *    unlike entry 4's `salvageCredits` and entry 9's shape bullet — both of which
 *    asserted "shape only" and left the reader to believe it — this one is PROVEN:
 *      trader   eb116ca31928a037 -> 40c03627bc30e5fa
 *      fighter  3f5a84bb0a65f91d -> 298315eaa3494e41
 *      explorer d865b1b4aadf166c -> 6e4e53ecb734b805
 *      veteran  306775019564eb9d -> f5813a71e402402a
 *      smuggler 2dd84772323e6206 -> 807c06d614d84fb6
 *      gambler  d3e02794985aafa9 -> eb5ab6b0dea7b673
 *      greedy   8a13d3d1802ef6a2 -> 38c0405f24b71b87
 *    MECHANISM: `CampaignStatsReport` gained `npcSpecialEquipmentPurchases` and
 *    `CampaignDayStats` gained `npcSpecialEquipmentBought`. This fingerprint hashes
 *    the whole report JSON, shape included, so seven new keys plus forty per-day
 *    keys move every hash on their own.
 *    THE PROOF, run locally over these exact 35 careers rather than claimed: with
 *    `npcSpecialEquipmentPurchases` deleted from the report and
 *    `npcSpecialEquipmentBought` stripped from every `daily` entry, each policy's
 *    hash is BYTE-IDENTICAL to its entry-10 value above — all seven. Two structural
 *    facts say why that had to hold: `rulesFingerprint` did not move (no engine or
 *    content file is touched by this step), and the new measurement draws NO rng —
 *    it is a state comparison across `endDay` and a `.map` over the sampled field —
 *    so no seeded career can diverge.
 *    WHAT THIS TABLE CANNOT REACH, worth naming so nobody looks for it here: the
 *    other half of T-022 is `MilestoneSample.npcDeedCount` / `npcRenownRank`, and
 *    these runs are made WITHOUT `milestoneDays`, so `milestones` is absent from
 *    every report hashed above and the sampler change cannot touch these numbers.
 *    Its reader is `campaign-renown.test.ts`.
 * ---------------------------------------------------------------------------
 */
const PINNED_FINGERPRINTS: Record<(typeof UNCHANGED_POLICIES)[number], string> = {
  trader: '40c03627bc30e5fa',
  fighter: '298315eaa3494e41',
  explorer: '6e4e53ecb734b805',
  veteran: 'f5813a71e402402a',
  smuggler: '807c06d614d84fb6',
  gambler: 'eb5ab6b0dea7b673',
  greedy: '38c0405f24b71b87',
};

const FINGERPRINT_SEEDS = [1, 2, 3, 4, 5] as const;
const FINGERPRINT_DAYS = 40;

function fingerprint(policy: SimPolicyName): string {
  const hash = createHash('sha256');
  for (const seed of FINGERPRINT_SEEDS) {
    hash.update(JSON.stringify(runCampaign(seed, FINGERPRINT_DAYS, policy)));
  }
  return hash.digest('hex').slice(0, 16);
}

describe('R1 · trader-degraded is non-invasive', () => {
  it.each(UNCHANGED_POLICIES)(
    'leaves the %s policy byte-identical to the pinned pre-R1 baseline',
    (policy) => {
      expect(fingerprint(policy)).toBe(PINNED_FINGERPRINTS[policy]);
    },
  );
});

describe('R1 · trader-degraded is a degraded captain', () => {
  it('resolves to the degraded policy, not to the random fallthrough', () => {
    // `resolvePolicy` answers an unrecognised name with `randomLegalActionPolicy`
    // (see the note at the smuggler/gambler branches), which would report
    // plausible-looking numbers for an entirely different pilot.
    const resolved = resolvePolicy('trader-degraded');
    expect(resolved.name).toBe('trader-degraded');
    expect(resolved.policy).toBe(degradedTraderPolicy);
    expect(resolved.policy).not.toBe(traderPolicy);
    // Reads the live board and dawn hand, exactly as the trader it degrades does.
    expect(resolved.dawnBlind).toBe(false);
  });

  it('is deterministic for a seed', () => {
    // The slips draw from the per-day policy rng fork, never Math.random — a
    // degraded career has to replay byte-for-byte or the sweep is not evidence.
    const first = runCampaign(3, 60, 'trader-degraded');
    const second = runCampaign(3, 60, 'trader-degraded');
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('actually diverges from the trader it degrades', () => {
    // Measured on seeds 1..5 × 60 days: every seed produces a different career.
    for (const seed of [1, 2, 3, 4, 5]) {
      const clean = runCampaign(seed, 60, 'trader');
      const sloppy = runCampaign(seed, 60, 'trader-degraded');
      expect(JSON.stringify(sloppy)).not.toBe(JSON.stringify(clean));
    }
  });

  it('still flies a career rather than stalling into a poverty trap', () => {
    // NOT the T-1605b invariant (that is scoped to the competent policies) — this
    // is the weaker claim R1 actually needs: the instrument must keep meeting
    // interceptors, or a null result would only mean "it never left port". A pilot
    // that idled would report zero deaths for the wrong reason entirely.
    //
    // Measured over seeds 1..10 × 60 days: 140 encounters, worst zero-income
    // streak 3, mean final credits ~29,000 (the clean trader: 156 encounters,
    // streak 2, ~30,000).
    let encounters = 0;
    let worstZeroIncomeStreak = 0;
    for (let seed = 1; seed <= 10; seed += 1) {
      const report = runCampaign(seed, 60, 'trader-degraded');
      encounters += report.combatEncounters.length;
      let streak = 0;
      for (const day of report.daily) {
        streak = day.incomeActionCount === 0 ? streak + 1 : 0;
        worstZeroIncomeStreak = Math.max(worstZeroIncomeStreak, streak);
      }
    }
    expect(encounters).toBeGreaterThan(100);
    expect(worstZeroIncomeStreak).toBeLessThan(5);
  });
});
