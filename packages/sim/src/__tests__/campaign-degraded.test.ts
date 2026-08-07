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
 *
 * 12. N12/T-030 — the instrument learns to SEE PORTS. ALL SEVEN rows move and NOT
 *    ONE CAREER CHANGED. Entry 11's shape-only form, repeated deliberately: the
 *    claim is PROVEN below rather than asserted.
 *      trader   40c03627bc30e5fa -> f3e01b2a843c1c0f
 *      fighter  298315eaa3494e41 -> dc6ca4fbcce58659
 *      explorer 6e4e53ecb734b805 -> 616ad4c19c3f60b9
 *      veteran  f5813a71e402402a -> f701430cfe32f7cb
 *      smuggler 807c06d614d84fb6 -> abbaf33b67be9f19
 *      gambler  eb5ab6b0dea7b673 -> fbb8b4df794fa5f4
 *      greedy   38c0405f24b71b87 -> 0f2ff82982dcbf2d
 *    MECHANISM: `CampaignStatsReport` gained exactly ONE key, `portsOwned` — the
 *    player's stake count at the horizon, read off the final state as a STOCK. No
 *    per-day key was added (a stake is a holding, not an event), so unlike entry 11
 *    this is seven new keys and not seven plus forty. This fingerprint hashes the
 *    whole report JSON, shape included, so one key per report moves every hash on
 *    its own.
 *    THE PROOF, run locally over these exact 35 careers rather than claimed: with
 *    `portsOwned` deleted from the report, each policy's hash is BYTE-IDENTICAL to
 *    its entry-11 value above — all seven, no exceptions. Two structural facts say
 *    why that had to hold: `rulesFingerprint` did not move (this step touches no
 *    engine and no content file — it adds no `ports` field to `NpcState`, precisely
 *    so that it would not), and the new measurement draws NO rng — it is
 *    `state.player.ports.length` and a `.map` over the sampled field — so no seeded
 *    career can diverge.
 *    WHAT THIS TABLE CANNOT REACH, for the same reason entry 11 records: the other
 *    half of T-030 is `MilestoneSample.player.ports` / `npcPortCount`, and these
 *    runs are made WITHOUT `milestoneDays`, so `milestones` is absent from every
 *    report hashed above and the sampler change cannot touch these numbers. Its
 *    reader is `campaign-ports.test.ts`.
 *      * `greedy` moving is EXPECTED, and here for the SHAPE reason of entries 4
 *        and 11 rather than the world-side reason of entry 6 — no policy and no
 *        NPC behaviour changed at this step at all.
 *
 * 13. T-111 — the multi-day committed recovery. EXACTLY TWO ROWS MOVE, and unlike
 *    entries 11 and 12 this is a REAL BEHAVIOUR CHANGE, not a report-shape one.
 *    `rulesFingerprint` moves with it (engine + content are both touched), which
 *    is the honest tell and is stated plainly rather than buried.
 *      explorer 616ad4c19c3f60b9 -> 765d376ac547518d
 *      smuggler abbaf33b67be9f19 -> 1425c6406f18b25c
 *      trader / fighter / veteran / gambler / greedy — ALL UNCHANGED.
 *
 *    MECHANISM, and why the split falls exactly where it does. T-111 makes a
 *    band-2+ explore find occupy calendar days: the payoff is deferred to the dusk
 *    of `dueDay`, the Explore VERB is refused while the slot is open, and
 *    `legalActions` stops advertising Explore for the same span. Only a policy
 *    that actually flies off-lane sweeps can feel any of that — `explorer` by
 *    charter and `smuggler` because its route play reaches for Explore too. The
 *    five that never sweep are byte-identical, which is the control: a shape
 *    change (entries 11/12) moves all seven; a verb change moves the callers.
 *
 *    MEASURED over these exact runs (5 seeds x 40 days each), before -> after:
 *      explorer  final credits  median 20,587 -> 25,013   mean 19,343 -> 24,910
 *      smuggler  final credits  median  4,899 ->  9,802   mean  5,007 -> 10,159
 *      fragments acquired (sum) explorer 30 -> 25, smuggler 31 -> 28
 *      fuel starvation days 0 -> 0 and subsistence days 0 -> 0 in both (the verb
 *      refusal does not strand anyone — the point of refusing the VERB rather than
 *      silently downgrading the outcome).
 *    THE DIRECTION IS UP, WHICH IS NOT A BUG AND IS WORTH NAMING: a refused sweep
 *    is 80 fuel and a die NOT spent, so a committed captain hauls instead, and the
 *    deferred salvage still arrives. Fewer boards is why the fragment counts fall.
 *
 *    WHAT THIS TABLE CANNOT SAY, and deliberately does not: five seeds cannot
 *    separate that credit shift from stream noise, and there is no
 *    `recoveriesOpened`/`recoveriesPaid` key in `CampaignStatsReport` — adding one
 *    would move all seven hashes for a shape reason unrelated to the rule. T-116
 *    owns the recovery measurement and the verdict; do not tune anything off this
 *    window.
 *
 * 14. T-113 — the Explore content pass 1 of 3 (bands 0-1). EXACTLY THE SAME TWO
 *    ROWS MOVE, for the same structural reason as entry 13 and by the same
 *    control: only a policy that flies off-lane sweeps can feel a change to what
 *    a board yields.
 *      explorer 765d376ac547518d -> 9110009d148f6c4a
 *      smuggler 1425c6406f18b25c -> 459ee18f292bf2c9
 *      trader / fighter / veteran / gambler / greedy — ALL UNCHANGED.
 *
 *    MECHANISM. Two content edits reach a board (docs/EXPLORE_REDESIGN.md §5.3
 *    pass 1): both FRAGMENT legs now draw the eight authored `explore-lore-*` rows
 *    instead of the retired legacy ones — same pools, same order, same chance, so
 *    per-fragment probability is unchanged and the only new thing is that the row
 *    SPEAKS — and the BEACON salvage leg now holds six authored band-1 rows where
 *    it held one, so a fired beacon salvage leg consumes one further index draw
 *    and re-phases the legs after it. The DERELICT salvage leg is untouched
 *    (finding F-113-D in content `exploration.ts`), so half of every board is
 *    byte-identical to entry 13.
 *
 *    MEASURED over these exact runs (5 seeds x 40 days each), before -> after:
 *      explorer  final credits  median 25,013 -> 9,094   mean 24,910 -> 14,818
 *      smuggler  final credits  median  9,802 -> 4,841   mean 10,159 ->  9,003
 *      fragments acquired (sum) explorer 25 -> 21, smuggler 28 -> 27
 *      fuel starvation days 0 -> 0 and subsistence days 0 -> 0 in both.
 *    THE DIRECTION IS DOWN, WHICH IS EXPECTED AND IS FINDING F-113-C: §5.2 authors
 *    band-1 salvage at 40-260cr, below the shipped beacon band's top, and band 2's
 *    240-700 does not exist until T-114. This is a SPEC-SEQUENCED income dip, it is
 *    recorded rather than tuned around (re-pricing Explore is R-series and an owner
 *    call), and five seeds cannot separate its size from stream noise in any case.
 *    T-116 owns the measurement and the verdict.
 *
 * 15. T-114 — the Explore content pass 2 of 3 (band 2). EXACTLY THE SAME TWO
 *    ROWS MOVE, for the third time and by the same control: only a policy that
 *    flies off-lane sweeps can feel a change to what a board yields.
 *      explorer 9110009d148f6c4a -> 735e77e304bc46fc
 *      smuggler 459ee18f292bf2c9 -> e3319430951ceca6
 *      trader / fighter / veteran / gambler / greedy — ALL UNCHANGED, byte for
 *      byte. That five of seven are identical is the evidence that a verb-yield
 *      change moved the CALLERS and not the world; a report-shape change (entries
 *      11/12) moves all seven.
 *
 *    MECHANISM. Three CONTENT edits reach a board (docs/EXPLORE_REDESIGN.md §5.3
 *    pass 2), and no rule changed:
 *      (1) `legacy-salvage-derelict` is DELETED and the DERELICT salvage leg is
 *          re-pointed at the 14 authored derelict salvage rows (6 band-1 +
 *          8 band-2, 240-700cr). This closes F-113-D: P(SalvageRecovered >= 400),
 *          the `rich_hulk` trigger, goes 0.302 -> 0.384 over that leg.
 *      (2) The BEACON salvage leg becomes the 31-id "find" leg, carrying the
 *          band-2 items, NPC introductions, questline hooks and effect-bearing
 *          lore alongside salvage.
 *      (3) EVERY band-2 row is `recoveryDays: 1`, so a successful board now
 *          commits the ship and the fifth typed refusal
 *          (`recovery-in-progress`) costs the NEXT day's Explore as well.
 *
 *    MEASURED over these exact runs (5 seeds x 40 days each), before -> after:
 *      explorer  final credits  median  9,094 -> 34,234   mean 14,818 -> 30,514
 *      smuggler  final credits  median  4,841 ->  5,650   mean  9,003 ->  6,104
 *      fragments acquired (sum) explorer 21 -> 26, smuggler 27 -> 18
 *      fuel starvation days 0 -> 0 and subsistence days 0 -> 0 in both.
 *    THE DIRECTION IS UP FOR THE EXPLORER, which is F-113-C's temporary dip
 *    reversing exactly as §5.2 sequenced it: band 2's 240-700cr is the shipped
 *    derelict band widened, and the beacon leg now yields permanent items rather
 *    than only coin. NOTHING WAS TUNED TO PRODUCE IT and nothing is tuned in
 *    response: five seeds cannot separate a credit shift of this size from stream
 *    noise, re-pricing Explore is R-series and an owner call, and T-116 owns the
 *    measurement and the verdict.
 *
 * 16. T-117 + T-115 · THE SINGLE BAND-WEIGHTED DRAW, AND THE 33 ROWS OF BANDS 3-4
 *     (2026-07-30). Two tasks, one commit — see TASKS.md F-117-A: splitting them
 *     would mean re-deriving every fixture twice for one behaviour change.
 *      explorer 735e77e304bc46fc -> 2537a7aa5185d3fd
 *      smuggler e3319430951ceca6 -> edab634b451035f3
 *      trader / fighter / veteran / gambler / greedy — ALL UNCHANGED, byte for
 *      byte. Exactly the two sweeping policies move, for the third entry running,
 *      which is the control that says an Explore change moved the CALLERS and not
 *      the world.
 *
 *    MECHANISM, and unlike entries 14 and 15 this one is a RULE change rather
 *    than a content one — it is the flip §2.4 specified, T-110 deferred, and
 *    finding F-113-A recorded as unowned through two content passes. A board no
 *    longer walks three INDEPENDENT legs; it draws ONE band-weighted row out of
 *    the now-100-row table (engine `drawOutcome`, reading the new `weight` column
 *    on `EXPLORE_VALUE_BANDS`). Four things follow, all of them predicted by the
 *    spec rather than discovered here:
 *      (1) A LUCKY BOARD NO LONGER COMPOUNDS. §2.4 is explicit that the flip is
 *          not behaviour-preserving: salvage AND a fragment AND a pod on one
 *          board was a property of independent legs, and one row cannot do it.
 *      (2) THE DRAW COST IS A FLAT TWO rng CALLS, so every board re-phases.
 *      (3) THE 14 BAND-0 DEAD ENDS ARE DRAWABLE FOR THE FIRST TIME, at 25% of
 *          boards. A quarter of successful boards now pay prose and nothing else,
 *          which is the ladder's own design and the single biggest contributor to
 *          the credit fall below.
 *      (4) 42% OF BOARDS OPEN A RECOVERY (bands 2-4 by weight, against band 2
 *          alone before), so the fifth typed refusal costs the sweeping policies
 *          more days of the verb than it did.
 *
 *    MEASURED over these exact runs (5 seeds x 40 days each), before -> after:
 *      explorer  final credits  median 34,234 -> 10,553   mean 30,514 -> 15,693
 *      smuggler  final credits  median  5,650 ->  5,844   mean  6,104 ->  6,337
 *      fragments acquired (sum) explorer 26 -> 17, smuggler 18 -> 12
 *    THE DIRECTION IS DOWN FOR THE EXPLORER ON CREDITS, and that is expected
 *    rather than alarming: §5.5 prices the ladder at ~447cr of VALUE per
 *    successful board, of which only bands 1-2 are credits at all — bands 3 and 4
 *    are permanent items, questline hooks and standing, none of which a
 *    final-credits figure can see, and a 40-day window is short enough that a
 *    six-day recovery is a large fraction of it. NOTHING WAS TUNED TO PRODUCE
 *    THIS AND NOTHING IS TUNED IN RESPONSE: five seeds cannot separate a shift of
 *    this size from stream noise, re-pricing Explore is R-series and an owner
 *    call, and T-116 owns the measurement and the verdict.
 *
 * 17. T-121 · THE REACH CHANGE — A BAR AT ALL FOURTEEN CORE SPACEPORTS
 *     (2026-07-30, docs/HANGOUT_REDESIGN.md §4). `hasHangout` goes from 1 of 28
 *     systems to 14 of 28. THREE ROWS MOVE, and they are exactly the three
 *     policies that transact at a Hangout:
 *      trader   f3e01b2a843c1c0f -> 1b4e953468311f40
 *      smuggler edab634b451035f3 -> faa0c778be299406
 *      gambler  fbb8b4df794fa5f4 -> 8950ea1dfd8d318e
 *      fighter / explorer / veteran / greedy — ALL UNCHANGED, byte for byte.
 *      That control is the evidence the change is REACH and nothing else: the
 *      four policies that never open the Hangout verb are untouched, while the
 *      two that borrow (trader, smuggler) and the one that plays (gambler) all
 *      re-phase. Note the inversion of entries 14-16's control — an EXPLORE
 *      change moves the two sweepers; a HANGOUT change moves these three.
 *
 *    MECHANISM, and it is a CONTENT change with no rule edit: `hasHangout: true`
 *    on ids 2-14 plus a baseline `PORT_HANGOUTS` row apiece (mechanically
 *    identical to Sol-3's, so no parameter moved). Three of §4.1's four
 *    mechanisms fire here — `planDare` is legal on most docked days instead of
 *    only at Sol-3; `planLoanBorrow` / `planLoanRepay` stop being routing-gated,
 *    so the §7.5 bad-day out is available on the day the bad day happens; and the
 *    trader's home-run preference collapses toward a no-op at 14 of 28
 *    destinations. Two sim-side edits ride along, both of which make the policy
 *    agree with an engine rule rather than change one: `planDare` now clamps with
 *    the PORT's band (`wagerBandFor`) instead of the global content constants,
 *    which is arithmetically inert while every row inherits the default band; and
 *    F-121-1 adds the resolver's `!npc.dead` guard to the dealer pick (see below).
 *
 *    MEASURED over these exact runs (5 seeds x 40 days each), before -> after:
 *      trader    final credits  median 14,600 -> 16,667   mean 13,882 -> 15,508
 *      smuggler  final credits  median  5,844 ->  7,492   mean  6,337 ->  6,440
 *      gambler   final credits  median  7,287 ->  6,672   mean 10,894 ->  6,739
 *      loans taken (sum)  trader 6 -> 7, smuggler 5 -> 9, gambler 10 -> 11
 *      loan DEFAULTS      trader 4 -> 0, smuggler 3 -> 0 (unchanged 0 for gambler)
 *      interest accrued   trader 10,975 -> 1,107; smuggler 4,500 -> 1,628
 *      dares played       gambler 50 -> 218; wagered 15,976 -> 51,680
 *      dare net credits   gambler +1,680 -> -2,120
 *
 *    THE HEADLINE IS THAT THE DESK STOPPED BEING A TRAP AND THE TABLES STOPPED
 *    BEING FREE MONEY, and neither was tuned to produce it. Defaults fall to zero
 *    because a captain can now REPAY where it stands rather than only where it
 *    started — the interest collapse is the same fact seen from the ledger side
 *    (a loan is cleared in days rather than carried to term). The gambler's dare
 *    count quadruples and its net turns NEGATIVE over this window, which is the
 *    law of large numbers arriving at a table the policy could previously only
 *    visit a handful of times: `expectedValuePerDare` over the wider 10-seed x
 *    120-day measurement falls 198.62 -> 101.02 and stays firmly positive, so the
 *    -2,120 here is a five-seed forty-day sample, not a sign flip in the verb.
 *    NOTHING IS TUNED IN RESPONSE: five seeds cannot separate shifts of this size
 *    from stream noise, and T-125 owns the milestone's single capstone, its
 *    measurement and its verdict.
 *
 *    F-121-1, FOUND BY THIS MEASUREMENT AND FIXED HERE. `planDare`
 *    (`sim/index.ts`), `legalActions` (`sim/protocol.ts`) and the deed hunter's
 *    `dealerHere` all picked an in-system dealer WITHOUT the resolver's N3
 *    `!npc.dead` guard, so all three could name a dead captain the engine then
 *    typed-fails with 'no-opponent'. Latent while one port had a bar (0 failures
 *    over 10 seeds x 120 days); live after the reach change (2 failures, seed 7,
 *    day 75, `npc-black-tide`), which is exactly the drift
 *    `hangoutPlay.failedVisits === 0` exists to catch. All three now mirror the
 *    engine. The repair is INERT over this 40-day window — the three hashes above
 *    are identical with and without it — and restores `failedVisits` to 0 at 120.
 *
 * 18. T-122 · HANGOUT CONTENT PASS 1 OF 3 — THE CORE WORLDS (2026-07-30,
 *     docs/HANGOUT_REDESIGN.md §6.3). Four ports gain authored parameters over
 *     T-121's baseline rows. EXACTLY ONE ROW MOVES:
 *      gambler  8950ea1dfd8d318e -> f10a74640899d867
 *      trader / smuggler / fighter / explorer / veteran / greedy — ALL UNCHANGED,
 *      byte for byte.
 *
 *    THAT CONTROL IS THE HEADLINE RESULT OF THE TASK, and it is a sharper control
 *    than entry 17's. T-121 moved three rows because REACH moved three verbs
 *    (borrow, repay, dare). T-122 moves only the STAKES and the DISPOSITION
 *    DELTAS, so only the policy that plays a hand can feel it. The trader and the
 *    smuggler still borrow and repay at the same fourteen desks — the loan band is
 *    GLOBAL by §2.2 ruling 5, no port narrowed its `venues`, and `borrow`/`repay`
 *    read no `venueParams` at all — so their streams are untouched to the byte.
 *
 *    MECHANISM, and it is CONTENT with no rule edit and no sim edit. Ids 2, 3, 8
 *    and 10 in `content/portHangouts.ts` become authored rows:
 *      - Aldebaran-1 (2) band 25/1000 -> 50/750; Mira-9 (8) -> 5/200; Procyon-5
 *        (10) -> 100/500. `planDare` sizes every stake through `wagerBandFor`
 *        (T-121's edit), so the gambler now bets a different amount at three of
 *        the fourteen ports it visits, and each differently-sized hand re-phases
 *        that seed's rng stream from the moment it is played.
 *      - Mira-9's dare deltas go 2/-2 -> 3/-1 and Procyon-5's failure arm -2 ->
 *        -3. Those feed `applyDisposition` on the dealer, which is read downstream
 *        by the interception and tribute-DC checks — a second, slower channel into
 *        the same stream.
 *      - Altair-3 (3) is the DELIBERATE NUMERIC MEAN: default band, default DCs,
 *        default deltas, distinct on `clientele` alone. `rankClientele` has exactly
 *        one reader — the Hangout pane (`ui/format.ts`) — and `planDare` picks the
 *        richest in-system dealer without consulting it, so no clientele authored
 *        here can move a sim number. That is why the four authored `clientele`
 *        lists appear nowhere in the deltas below.
 *      - `befriend.dc` and the `befriend`/`insult`/`meet` deltas moved at three
 *        ports and are invisible to every policy: the sim issues exactly three
 *        venues (borrow, repay, dare). See F-101-4 — those venues have no player
 *        UI either.
 *
 *    MEASURED over these exact runs (5 seeds x 40 days each), before -> after:
 *      gambler   final credits  median  6,672 ->  6,849   mean 6,739 -> 7,158
 *      dares played       218 -> 220     wagered  51,680 -> 52,005
 *      dare net credits   -2,120 -> -1,927
 *      failed Hangout visits 0 -> 0 (unchanged, as the invariant requires)
 *      trader/smuggler final credits, loans and interest — IDENTICAL, as the
 *      unchanged hashes already say.
 *    The gambler plays two more hands for 325cr more staked: the narrowed bands
 *    at three ports very nearly cancel out (a raised floor at Aldebaran-1 and
 *    Procyon-5 against a collapsed ceiling at Mira-9), which is what a pass of
 *    EVERYDAY bars is supposed to look like — the exotic and dangerous bands are
 *    T-123's. NOTHING WAS TUNED TO PRODUCE THIS AND NOTHING IS TUNED IN RESPONSE:
 *    five seeds cannot separate a shift of this size from stream noise, and T-125
 *    owns the milestone's single capstone, its measurement and its verdict.
 *
 * 19. T-123 · HANGOUT CONTENT PASS 2 OF 3 — THE EXOTIC AND THE DANGEROUS
 *     (2026-07-30, docs/HANGOUT_REDESIGN.md §6.3 pass 2). Five more ports gain
 *     authored parameters, and for the first time a port NARROWS ITS VENUE SET.
 *     EXACTLY TWO ROWS MOVE:
 *      trader   1b4e953468311f40 -> 7ee040b0931caff9
 *      gambler  f10a74640899d867 -> 40fa56c309b70e74
 *      smuggler / fighter / explorer / veteran / greedy — ALL UNCHANGED, byte for
 *      byte. `smuggler` staying put is the sharp control here: it borrows and
 *      repays at the same desks the trader does, so its identity says the trader's
 *      move is about WHERE the desk is and not about lending in general — within
 *      this window the smuggler's routes never put it at Arcturus-6 with a marker
 *      to settle.
 *
 *    MECHANISM, and it is CONTENT plus a POLICY MIRROR — no engine line changed
 *    (`git diff --stat HEAD -- packages/engine/src ':!.../__tests__'` prints
 *    nothing). Two independent channels, and they are separated by measurement
 *    below rather than asserted:
 *      (a) THE BANDS. Arcturus-6 100/400, Deneb-4 25/2000, Regulus-6 500/3000,
 *          Rigel-8 10/3000, Vega-6 250/1500. `planDare` sizes every stake through
 *          `wagerBandFor` (T-121's edit), so the gambler now bets a different
 *          amount at five more of the fourteen ports it visits and each
 *          differently-sized hand re-phases that seed's rng stream. Two of the
 *          five bands reach 3,000 — three times the galaxy's old ceiling — which
 *          is why this pass moves the gambler much further than T-122's did.
 *      (b) THE WITHDRAWN DESK. Arcturus-6's row omits `borrow` and `repay`
 *          (§6.2's strict garrison), so `resolveVisitHangout` typed-refuses a
 *          lending action there. `planLoanBorrow` / `planLoanRepay` and the two
 *          "head home to settle up" preferences now mirror that gate through
 *          `isLendingDeskSystem` (`sim/index.ts`) — the F-121-1 idiom, a policy
 *          guard made equal to an engine guard, not a new rule.
 *
 *    THE DECOMPOSITION, measured over these exact runs rather than reasoned about.
 *    With the content rows in and the sim mirror REVERTED, the trader hashes
 *    4519a706ae2dc8a2 and takes 9 loans; with the mirror it hashes 7ee040b0931caff9
 *    and takes 7. So the mirror is LOAD-BEARING, not cosmetic — and the direct
 *    evidence is the refusal count: driven headlessly over 5 seeds x 40 days the
 *    trader emits ONE `LoanEvent{failReason:'venue-not-offered'}` without the
 *    mirror and ZERO with it. That one refusal is a die slot taken out of the day's
 *    ledger for an act the house never offered, which is exactly the drift
 *    `hangoutPlay.failedVisits === 0` exists to forbid. Widened to 10 seeds x 120
 *    days across ALL SEVEN policies with the mirror in: zero refusals of either
 *    event variant. The gambler's hash is IDENTICAL with and without the mirror,
 *    which is the control saying the `venueOffered(...,'dare')` guards added to
 *    `planDare` and to the "go where the tables are" preference are arithmetically
 *    inert today (all fourteen ports deal) and landed while provably so.
 *
 *    MEASURED over these exact runs (5 seeds x 40 days each), before -> after:
 *      trader    final credits  median 16,667 -> 16,667   mean 15,508 -> 14,809
 *      trader    loans taken 7 -> 7, cleared 7 -> 7, defaults 0 -> 0,
 *                interest accrued 1,107 -> 1,236
 *      gambler   final credits  median  6,849 ->  6,314   mean  7,158 -> 11,453
 *      gambler   dares played 220 -> 236, wagered 52,005 -> 62,305,
 *                dare net credits -1,927 -> +2,573
 *      gambler   loans taken 5 -> 5, interest 1,400 -> 1,400 (its lending is
 *                untouched — only its stakes moved)
 *      failed Hangout visits 0 -> 0 for every policy, as the invariant requires.
 *    The gambler stakes 20% more for sixteen more hands and its dare net flips
 *    sign; the wide 3,000-ceiling bands are the whole of it. NOTHING WAS TUNED TO
 *    PRODUCE THIS AND NOTHING IS TUNED IN RESPONSE: five seeds cannot separate a
 *    shift of this size from stream noise (the mean/median divergence in the
 *    gambler row — mean up 60%, median down 8% — is itself the signature of one
 *    seed running hot), re-pricing the Dare is R-owned per §8, and T-125 owns the
 *    milestone's single capstone, its measurement and its verdict.
 *
 * 20. T-124 · HANGOUT CONTENT PASS 3 OF 3 — THE LAST FOUR, AND THE HUMOUR
 *     (2026-07-30, docs/HANGOUT_REDESIGN.md §6.3 pass 3). The final four ports
 *     gain authored parameters and the fourteen-port table CLOSES. EXACTLY ONE
 *     ROW MOVES:
 *      gambler  40fa56c309b70e74 -> 0c0c4fc26124fbc0
 *      trader / smuggler / fighter / explorer / veteran / greedy — ALL UNCHANGED,
 *      byte for byte.
 *
 *    THE ONE-ROW CONTROL IS SHARPER HERE THAN AT ENTRY 19, and it is the result
 *    the task is really reporting. T-123 moved TWO rows because it withdrew a
 *    credit desk, and the trader felt that through `isLendingDeskSystem`. T-124
 *    narrows a venue set too — Spica-3 (13) omits `insult` — but ALL FOUR of its
 *    ports keep `borrow` and `repay`, so no lending guard can see this pass and
 *    the trader and the smuggler are untouched to the byte. The narrowing itself
 *    is invisible to every policy for a second, independent reason: the
 *    instrument issues exactly three venues (`dare` / `borrow` / `repay`) and the
 *    cockpit issues the same three (F-101-4, F-123-1), so `insult` is a venue no
 *    driver has ever asked for. That the gambler's hash moves ANYWAY, and moves
 *    alone, says the pass reached the simulation through its BANDS and through
 *    nothing else.
 *
 *    MECHANISM, and it is CONTENT with no rule edit and NO SIM EDIT — unlike
 *    entry 19 there is no policy mirror to decompose, because there is nothing
 *    for a policy to mirror. `git diff --stat HEAD -- packages/engine/src
 *    ':!.../__tests__'` prints nothing, and so does the same command over
 *    `packages/sim/src ':!.../__tests__'`. Three channels, in descending order of
 *    effect:
 *      (a) THE BANDS. Denebola-5 20/300, Fomalhaut-2 15/1200, Pollux-7 75/900,
 *          Spica-3 200/1800. `planDare` sizes every stake through `wagerBandFor`
 *          (T-121's edit), so the gambler bets a different amount at the last
 *          four of the fourteen ports it visits and each differently-sized hand
 *          re-phases that seed's rng stream from the moment it is played. This
 *          is the whole of the delta below.
 *      (b) THE DISPOSITION ARMS. Denebola-5's dare-failure arm is an AUTHORED
 *          ZERO (-2 -> 0, the softest in the game), Pollux-7's dare-success arm
 *          is +2 -> +1 and Spica-3's pair is +2/-2 -> +3/-5. Those feed
 *          `applyDisposition` on the dealer, read downstream by the interception
 *          and tribute-DC checks — the same second, slower channel entry 18
 *          described.
 *      (c) NOTHING ELSE. The `befriend` DCs (11 / 10 / 14) and the `meet` and
 *          `insult` deltas moved at three ports and are invisible to every
 *          policy and to the player alike; the four `clientele` lists are read
 *          only by the Hangout pane. `venueOffered(..., 'dare')` is still true at
 *          all fourteen ports, so the dare guards entry 19 added to `planDare`
 *          and to the "go where the tables are" preference remain arithmetically
 *          inert, exactly as they were when they landed.
 *
 *    MEASURED over these exact runs (5 seeds x 40 days each), before -> after:
 *      gambler   final credits  median  6,314 ->  6,314   mean 11,453 -> 9,880
 *      gambler   dares played 236 -> 234, wagered 62,305 -> 63,563,
 *                dare net credits +2,573 -> +5,473
 *      gambler   loans taken 5 -> 5, interest 1,400 -> 1,400 (unchanged — only
 *                its stakes moved, which is (a) and (b) and not lending)
 *      trader    median 16,667, mean 14,809, loans 7, interest 1,236 — IDENTICAL
 *      smuggler  median  7,492, mean  6,440, loans 9, interest 1,628 — IDENTICAL
 *      failed Hangout visits 0 -> 0 for every policy, as the invariant requires;
 *      re-confirmed at 10 seeds x 120 days across all seven policies: zero
 *      refusals of either event variant, with a THIRD narrowed port in the table.
 *    THE MEDIAN DOES NOT MOVE AT ALL while the mean falls 14% — the exact inverse
 *    of entry 19's signature, and the same explanation: one seed. The gambler
 *    stakes 1,258cr more across two FEWER hands and its dare net doubles;
 *    `expectedValuePerDare` over the wider 10-seed x 120-day measurement is
 *    151.82 (T-121 measured 101.02), so the verb is firmly positive and moving in
 *    the direction the widened bands predict. NOTHING WAS TUNED TO PRODUCE THIS
 *    AND NOTHING IS TUNED IN RESPONSE: five seeds cannot separate a shift of this
 *    size from stream noise, re-pricing the Dare is R-owned per §8, and T-125 —
 *    the very next task — owns the milestone's single capstone, its sweep, its
 *    re-pinned baseline and its verdict.
 *
 * 21. T-131 — OWNER RULING D1: bands 3-4 of the Explore ladder pay in DICE, not
 *    days. EXACTLY THE SAME TWO ROWS MOVE that entries 15 and 16 moved, and for
 *    the same structural reason: only a policy that flies off-lane sweeps can
 *    feel a change to what a board costs or yields.
 *      explorer 2537a7aa5185d3fd -> cfe5aa73ce12c16f
 *      smuggler faa0c778be299406 -> 50d24df7e9891d8f
 *      trader / fighter / veteran / gambler / greedy — ALL UNCHANGED, byte for
 *      byte. Five of seven identical is again the evidence that a verb-cost
 *      change moved the CALLERS and not the world.
 *
 *    MECHANISM. ONE CONTENT edit and ONE ENGINE rule, and no sim edit at all:
 *      (1) `EXPLORE_VALUE_BANDS` bands 3 and 4 go `recoveryDays` 3/6 -> 0 and
 *          gain `apCost` 2/3.
 *      (2) `claimOutcome` (engine `exploreOutcomes.ts`) grows a third branch: an
 *          `apCost` row spends that many MORE dice from the same dawn hand,
 *          lowest-value first, and resolves TODAY; a hand that cannot cover it
 *          FORFEITS the find with the new typed
 *          `ExplorationFailed{reason:'insufficient-dice'}`.
 *    THREE CHANNELS REACH A CAMPAIGN, in descending order of effect:
 *      (a) THE PAYOUT MOVES FORWARD. A band-3/4 find used to be delivered at the
 *          dusk of dueDay, and only if the captain was still parked — so most of
 *          them were forfeited by the §3.3(a) location predicate the moment the
 *          policy travelled. They now pay on the day of the board, which is why
 *          the explorer's mean and median both RISE.
 *      (b) THE HAND SHRINKS on the day of a band-3/4 board (1 + 2 or 1 + 3 dice
 *          off one action), so the rest of that day is played with fewer dice and
 *          every subsequent action re-phases that seed's stream.
 *      (c) THE `recovery-in-progress` REFUSAL FIRES FAR LESS. The slot is now
 *          opened on 24% of successful boards instead of 42%, so the day AFTER a
 *          good find is no longer spent held on station.
 *
 *    MEASURED over these exact runs (5 seeds x 40 days each), before -> after:
 *      explorer  final credits  median 10,553 -> 18,383   mean 15,693 -> 18,359
 *      smuggler  final credits  median  7,492 ->  5,653   mean  6,440 ->  6,193
 *      fragments acquired (sum) explorer 17 -> 16, smuggler 9 -> 9
 *      fuel starvation days 0 -> 0 in both; subsistence days explorer 0 -> 1,
 *      smuggler 0 -> 0.
 *    THE DIRECTION IS UP FOR THE EXPLORER AND FLAT-TO-DOWN FOR THE SMUGGLER,
 *    which is what (a) and (b) predict — the explorer boards often enough to
 *    collect the top of the ladder it was previously losing, and the smuggler
 *    boards rarely enough that the shorter hand is the only channel it feels.
 *    NOTHING IS TUNED IN RESPONSE. The `apCost` numbers 2 and 3 are the owner's
 *    first-pass values and D1 is explicit that they move by PLAYTEST, not by
 *    fitting a five-seed campaign sample; five seeds cannot separate a shift of
 *    this size from stream noise in any case, and the milestone's own sweep
 *    capstone (`t131-explore-ap`, 8,000 rows) is what the eventual read is taken
 *    against.
 *
 *    THE BAND-2 SENTINEL AT THE TOP OF THIS FILE IS UNMODIFIED AND STILL GREEN:
 *    'every band-2 row is recoveryDays: 1'. D1 left band 2 alone deliberately and
 *    that assertion is how this file proves it.
 *
 * 22. T-133 — OWNER RULING D7: THE PER-PORT LOAN BAND. EXACTLY ONE ROW MOVES,
 *    AND IT MOVES BACK TO A HASH THIS FILE HAS SEEN BEFORE:
 *      trader   7ee040b0931caff9 -> 1b4e953468311f40
 *      fighter / explorer / veteran / smuggler / gambler / greedy — ALL
 *      UNCHANGED, byte for byte.
 *
 *    READ THE NEW TRADER HASH AGAINST ENTRY 19. `1b4e953468311f40` is precisely
 *    the value entry 19 moved the trader AWAY from when Arcturus-6 withdrew its
 *    credit desk. T-133 gives the desk back — owner ruling D7 makes the PRINCIPAL
 *    BAND a content field, so a garrison expresses tight credit with a 1,000cr
 *    ceiling instead of an absence — and the trader lands exactly where it stood
 *    before the withdrawal. A revert-shaped hash is the strongest available
 *    statement that the channel is the one entry 19 named and that nothing else
 *    came with it.
 *
 *    MECHANISM. ONE CONTENT edit, ONE ENGINE rule and ONE SIM mirror:
 *      (1) `PortHangout` gains `loanBand`, `DEFAULT_PORT_HANGOUT` carries
 *          `[LOAN_MIN_PRINCIPAL, LOAN_MAX_PRINCIPAL]` (imported, never restated),
 *          and Arcturus-6's row re-adds `borrow`/`repay` alongside a 250/1000
 *          band.
 *      (2) `loanBandFor` (engine `hangoutRules.ts`) beside `wagerBandFor`, and
 *          `resolveVisitHangout`'s borrow arm clamps against it instead of
 *          against the two globals. `git diff --stat HEAD -- packages/engine/src
 *          ':!*__tests__*'` prints 2 files, +33/-7 — no new branch, one accessor.
 *      (3) `planLoanBorrow` and `legalActions` read the same accessor, the
 *          F-121-1 "the policy's guards are the engine's guards" idiom applied to
 *          an AMOUNT rather than to a gate.
 *    TWO CHANNELS COULD REACH A CAMPAIGN, and the decomposition below says only
 *    one of them did:
 *      (a) THE DESK REACH, restored. `isLendingDeskSystem(4,'borrow')` is true
 *          again, so the trader plans loans and repayments at Arcturus-6 as it
 *          did before T-123 and its "head home to settle up" preference sees a
 *          fourteenth desk again. THIS IS THE WHOLE OF THE DELTA.
 *      (b) THE CLAMP. Arithmetically INERT in this window, and MEASURED rather
 *          than assumed: re-running these exact five seeds with Arcturus-6's
 *          `loanBand.max` temporarily widened to `LOAN_MAX_PRINCIPAL` reproduces
 *          `1b4e953468311f40` for the trader and leaves all six other rows
 *          untouched. So no policy's shortfall at that port ever exceeded 1,000cr
 *          over 5 seeds x 40 days — the ceiling is authored content that no
 *          campaign in this sample has yet paid for. The clamp itself is driven
 *          for real in the engine suite (`hangout.test.ts`, T-133 block) and
 *          through the terminal in `ui/e2e/hangout.spec.ts`.
 *
 *    MEASURED over these exact runs (5 seeds x 40 days each), before -> after:
 *      trader    final credits  median 16,667 -> 16,667   mean 14,809 -> 15,508
 *      trader    loans taken 7 -> 7, cleared 7 -> 7, defaults 0 -> 0,
 *                interest accrued 1,236 -> 1,107, principal borrowed 12,813
 *      smuggler  median 5,653, mean 6,193, loans 8, interest 1,602 — IDENTICAL
 *      gambler   median 6,314, mean 9,880, loans 5, interest 1,400 — IDENTICAL
 *      failed Hangout visits 0 -> 0 for every policy, as the invariant requires;
 *      re-confirmed at 10 seeds x 120 days across all seven policies: 40 loans
 *      taken, ZERO refusals of either event variant.
 *    The trader borrows the same seven times for slightly less total interest,
 *    because the desk it needed is once again the desk it was standing next to.
 *    NOTHING WAS TUNED TO PRODUCE THIS AND NOTHING IS TUNED IN RESPONSE: the
 *    1,000cr ceiling is a first-pass CONTENT call, D7 is explicit that a band
 *    moves by playtest rather than by fitting a five-seed sample, and T-150 —
 *    which already depends on this task — owns the read.
 *
 *    F-123-2 IS CLOSED BY THIS ENTRY. `lending-property.test.ts` used to assert
 *    that a captain stranded at the desk-less garrison stayed stranded; every
 *    travelable port now runs a desk, and the test asserts the positive — that
 *    the SHALLOWEST band in the galaxy still clears a strand.
 *
 * 23. T-135 — OWNER RULING D2: THE SPACER'S DARE BECOMES LIAR'S DICE. ALL SEVEN
 *    ROWS MOVE, and the decomposition below shows that SIX of them move for a
 *    reason that has nothing to do with the game:
 *      trader    1b4e953468311f40 -> 9709fd22ff55bb3d
 *      fighter   dc6ca4fbcce58659 -> 13b4155d3d53e543
 *      explorer  cfe5aa73ce12c16f -> 0854b356ac9c8bce
 *      veteran   f701430cfe32f7cb -> a0fee7f62c2167e3
 *      smuggler  50d24df7e9891d8f -> e68b33db4f6149b4
 *      gambler   0c0c4fc26124fbc0 -> 45dfa017875d0619
 *      greedy    0f2ff82982dcbf2d -> 56df4d82dab33e08
 *
 *    TWO CHANNELS, SEPARATED BY MEASUREMENT RATHER THAN BY ARGUMENT. This
 *    fingerprint hashes the WHOLE report JSON, and `HangoutPlayStats` gained one
 *    new key — `dareGuardHits`, the runner's continuation-loop tripwire, which
 *    §12.4 proves unreachable and which is therefore 0 on every row. Re-running
 *    these exact five seeds and stripping `"dareGuardHits":0` from the hashed JSON
 *    reproduces the OLD pin EXACTLY for six of the seven:
 *      trader / fighter / explorer / veteran / smuggler / greedy — stripped hash
 *      === the pre-T-135 value, byte for byte.
 *    So for those six the ONLY delta is a report key. That is exactly what should
 *    be true: `planDare` is called by `gamblerPolicy` and by nothing else
 *    (`packages/sim/src/index.ts`, one call site), so no other policy has ever sat
 *    at a table and none of them can feel a change to what happens there.
 *
 *    THE GAMBLER IS THE ONE REAL MOVE. Its stripped hash is 67423e42356a1e61 —
 *    still not the old value, and correctly so: `VisitHangout{venue:'dare'}` now
 *    OPENS a multi-turn scene instead of resolving one opposed GUILE roll, and the
 *    runner plays the hand out through `planDareMove`. `planDare` itself is
 *    UNCHANGED (same guards, same `wagerBandFor` stake sizing, same
 *    `ledger.takeBest()`), and so is the gambler's two-hand loop — per §12.2, the
 *    fix is a bounded continuation loop in the runner, never a policy rewrite.
 *
 *    MEASURED over these exact runs (5 seeds x 40 days, gambler): 223 hands, 194
 *    won, 29 lost, 87,126 wagered, +70,715 net, ZERO failed visits and ZERO
 *    `dareGuardHits`. Over 10 seeds x 120 days: 1,204 hands, 93.9% player win
 *    rate, +689cr EV per hand, again zero refusals and zero guard hits.
 *
 *    THE WIN RATE IS A REPORTED FINDING, NOT A TUNED NUMBER (F-135-1, see the
 *    Delivered note and `docs/LIARS-DICE_REDESIGN.md` §1.3). Its cause was traced
 *    rather than shrugged at: the baseline opener bids `(own(F*), F*)` — a claim
 *    about dice it actually holds, so `actual >= quantity` is guaranteed — and the
 *    dealer's §9.8 challenge test (`surplus > 1.5 - guile*0.15`) fires on a
 *    two-of-a-kind opening whenever the dealer holds none of that face, which it
 *    then loses by construction. Both halves are the specified policies,
 *    implemented verbatim. §1.3 forbids retuning any constant in this spec to
 *    reproduce an old figure, and T-137 is the named owner of the win-rate / EV /
 *    fold-rate read, so nothing here was touched in response.
 *
 *    (Entries 24 and 25 — T-145's two-pool candidate set and T-146's unlock ladder
 *    — moved the gambler row alone and are recorded at that row rather than here.)
 *
 * 26. T-150 — TWO POLICY GUARDS, AND THE CONTAINMENT IS THE POINT. EXACTLY TWO
 *    ROWS MOVE, one per guard, and the five that must not move do not:
 *      explorer  0854b356ac9c8bce -> d83421a02caaaffc   (F-116-1)
 *      gambler   63a80b1611bbded0 -> 37cb7e36ce127d96   (F-123-3)
 *      trader / trader-degraded / fighter / veteran / smuggler / greedy —
 *      BYTE-IDENTICAL, re-measured on these exact five seeds x 40 days.
 *
 *    THE CAUSES, ONE PER ROW, STATED BEFORE THE NUMBERS.
 *
 *    EXPLORER — F-116-1 (docs/EXPLORE_REDESIGN.md §9.7, closed in §10). Its
 *    Explore loop tested credits, projected fuel and the die ledger and never
 *    `state.player.recovery`, so on a day with an open salvage op it queued a verb
 *    `actions/exploration.ts:52` was certain to refuse with
 *    `ExplorationFailed{'recovery-in-progress'}`. `sim/protocol.ts` already
 *    withheld the verb on exactly that condition, but `runCampaign` never calls
 *    `legalActions`, so that gate was not on the sim's path. The guard is one term
 *    added to the loop condition; it removes plans, never adds them, so a die that
 *    used to be thrown at a guaranteed refusal is now spent on the rest of the day
 *    and every subsequent day re-phases. Scoped to the Explore QUEUE and not to
 *    the policy: the contract run, refuel, captain's overhead, yard buy and debt
 *    remittance all still run on a recovery day.
 *
 *    GAMBLER — F-123-3 (docs/HANGOUT_REDESIGN.md §7, closed in §11.2). `planDare`
 *    picked the richest ROAMING dealer off the dawn purse once per day, so with
 *    `GAMBLER_MAX_DARES_PER_DAY = 2` the first hand could drain that dealer and the
 *    second was clamped by the engine to a sub-floor — or zero — stake. T-145 had
 *    already fixed the ROSTER half (a broke roster seat is a hard 'opponent-broke'
 *    refusal); the roaming half was deliberately left and is what moves here. The
 *    caller now carries a per-dealer committed-stake map forward, worst case being
 *    that the dealer LOSES every stake queued against them — the identical
 *    convention it already applied to the player's own purse. The pre-existing
 *    `dealer.credits < band.min` guard then closes both the zero-stake and the
 *    sub-floor case with no new downstream check.
 *
 *    WHY THE OTHER FIVE CANNOT MOVE, and this is the containment claim: the
 *    Explore guard is a term inside `explorerPolicy`'s own loop, and `planDare` is
 *    called by `gamblerPolicy` and by nothing else (one call site in
 *    `packages/sim/src/index.ts`). No shared helper, no engine file and no content
 *    file is touched by either edit — `git diff --stat` over `packages/engine/src`,
 *    `packages/content/src` and `packages/ui/src` is zero files and zero lines.
 *    The five unmoved rows are the proof, not the assumption.
 *
 *    THE SMUGGLER'S UNMOVED ROW IS ITSELF A FINDING (F-150-2). `smugglerPolicy`
 *    carries a byte-identical copy of the explorer's Explore loop with the same
 *    missing guard. The fix was written and MEASURED, and then BACKED OUT: adding
 *    it re-seeds that policy's stream onto a pre-existing stall in the SHARED
 *    `planPacifistCombat` — seed 3, Sirius-16, days 45-49, one interceptor
 *    escalating rounds 2 -> 10 while the tribute climbs 2,000 -> 10,000 against a
 *    1,071-credit purse, so `canPay` is false every dawn and the policy plays five
 *    consecutive `run` stances. A `run` is not an income action, so
 *    `longestZeroIncomeStreak` reaches 5 and the poverty-trap invariant in
 *    `campaign-smuggler-gambler.test.ts` goes red. The stall is NOT an Explore
 *    problem (the policy returns at `if (state.encounter)` long before that loop,
 *    and `player.recovery` is null on all five days) — the same pathology that
 *    file's header already records at seed 19 of the T-1601b 300-day sweep. Root-
 *    fixing it means editing a planner five policies share, which would move every
 *    row above and destroy this very containment claim. Filed for a task allowed
 *    to do that, pinned by a tripwire test, and NOT silently dropped.
 *
 *    NO BAND, THRESHOLD, GOLDEN OR CONSTANT WAS EDITED. The two pins below are
 *    re-derived because the input to the hash changed, which is the only admissible
 *    reason for a re-pin. *
 *    ENTRY 27 (T-156 / N13 — THE NPC VIRTUAL HAND). ALL SEVEN ROWS MOVE, and for
 *    once that is the correct result rather than a containment failure. Every
 *    earlier entry could name one policy or one helper as the channel; this one
 *    cannot, because the change is not in a policy at all — it is in the WORLD the
 *    policies are played against. `packages/engine/src/npcHand.ts` deals each of
 *    the thirty captains a five-die virtual hand at dusk and spends it at
 *    `npc.ts`'s two check sites, so every captain's rng stream, verb outcome,
 *    contract claim, refit and encounter re-phases. The cast writes the shared job
 *    pool the player's manifest board is sized from (`jobPoolClaims`), so a
 *    different cast day is a different board on the next dawn — for EVERY policy,
 *    with no shared planner involved. A row that had NOT moved would be the
 *    finding here: it would mean that policy is not reading the live world.
 *
 *    THE THREADING WAS PROVED INERT FIRST, exactly as entry 26's rewire was. With
 *    the die ledger threaded through all seven `npc.ts` call sites but
 *    `allocateVirtualDie` still returning the same `rng.d20()`, all four day-loop
 *    golden hashes were unmoved, the engine battery stayed green, and a full
 *    1,000-seed x 120-day x 8-policy sweep produced raw shard rows BYTE-IDENTICAL
 *    to the same sweep at the parent commit. Only then was the deal switched on.
 *
 *    NO BAND, THRESHOLD, GOLDEN OR CONSTANT WAS EDITED TO REACH THIS. The seven
 *    pins are re-derived because the input to the hash changed — the only
 *    admissible reason — and the calibration was chosen for mean-neutrality at the
 *    roster's median stat before the capstone was taken, not after a red band.
 *
 *    ENTRY 28 (T-160 — THE OPENING FLOOR, `docs/LIARS-DICE_REDESIGN.md` §16.2
 *    shape (b), fixing finding F-137-1). EXACTLY ONE ROW MOVES: `gambler`.
 *
 *    WHAT MOVED. An opening Liar's Dice claim must now EXCEED what the bidder
 *    holds of the claimed face (`isLatticeMove`'s `bid` arm + the new
 *    `minOpeningQuantity`). F-137-1 measured the hole it closes: 100.00% of the
 *    baseline planner's opening bids were TRUE BY CONSTRUCTION, because
 *    `resolveChallenge` counts the face across all the dice in play, so a claim at
 *    or under `own(face)` cannot be false. `planDareMove` branch (b) opens at the
 *    engine's new floor as the minimum legal adaptation — the RULE moved under the
 *    planner; the planner was not taught to bluff.
 *
 *    WHY THE OTHER SIX CANNOT MOVE, and this is the containment claim: the engine
 *    rule is only reachable through an OPEN Liar's Dice hand, a hand only opens on
 *    `VisitHangout{venue:'dare'}`, and `planDare` is queued by `gamblerPolicy` and
 *    by nothing else (one call site in `packages/sim/src/index.ts`). No other
 *    policy ever sits at a table, so no other policy's rng stream can re-phase.
 *    The six unmoved rows are the proof, not the assumption — and this is the same
 *    containment shape entry 26 made and entry 27 could not.
 *
 *    NO BAND, THRESHOLD, GOLDEN OR CONSTANT WAS EDITED. The one pin below is
 *    re-derived because the input to the hash changed, which is the only
 *    admissible reason for a re-pin. The task that made the change owns an 8,000-
 *    row capstone re-pin in the same commit, and PREDICTED this row (and `fleet`)
 *    as the only movers before the sweep ran.
 *
 *    ENTRY 29 (T-161 — THE VETERAN'S FULL-TANK RELAXATION, fixing finding
 *    F-159-1). EXACTLY ONE ROW MOVES: `veteran`.
 *
 *    WHAT MOVED. `veteranPolicy`'s contract filter gained the T-1104 full-tank
 *    second pass — `if (reachable.length === 0) reachable =
 *    signableWithin(ship.maxFuel)` — the branch `traderPolicy`, `smugglerPolicy`,
 *    `gamblerPolicy`, `explorerPolicy` and (from entry 27's sibling task, T-159)
 *    `fighterPolicy` have all carried for some time. The veteran was the LAST
 *    un-relaxed filter in `index.ts`. Parked at a rim port where every leg on the
 *    board exceeds 0.6 of the tank, the filter came back empty, `idx` fell through
 *    to -1, and the grinder signed nothing and never travelled; refuel, repair,
 *    yard, overhead and debt still queued, so the ship looked busy while earning
 *    nothing (none of those is an `isIncomeAction`).
 *
 *    PROVED INERT FIRST, as entries 26 and 27 were. The inline filter chain was
 *    extracted to a `signableWithin(cap)` closure shaped exactly like the
 *    trader's and called once at the old cap; with the relaxation NOT yet added
 *    this fingerprint came back as `8db1029399f20ed8` — the pre-T-161 value, byte
 *    for byte — with the whole suite green. Only then was the second pass added.
 *
 *    WHY THE OTHER SIX CANNOT MOVE, and this is the containment claim: the edit
 *    is inside `veteranPolicy` and touches nothing shared. `signableWithin` is a
 *    local closure, not the planner five policies share, and no other policy
 *    calls into the veteran. The six unmoved rows are the proof, not the
 *    assumption — verified by running this suite before the re-pin and confirming
 *    exactly one failing row: `trader`, `fighter`, `explorer`, `smuggler`,
 *    `gambler` and `greedy` all came back byte for byte.
 *
 *    NO BAND, THRESHOLD, GOLDEN OR CONSTANT WAS EDITED. `rulesFingerprint` did
 *    NOT move (`fbcfe11ab7772555` before and after) — the change is sim-side, so
 *    `docs/balance/smoke/tiers.json`'s capstone branch never fires and the
 *    documented remedy is a plain re-extract, which is what was done. One
 *    seed-pin moved for the same re-phasing reason and is documented at its own
 *    site: `campaign-reach.test.ts`'s T-1307 port-purchase seed (3 -> 8), swept
 *    over seeds 1..80 and WIDENED rather than re-thresholded.
 * ---------------------------------------------------------------------------
 */
// Entry 28 (T-195): ALL SEVEN re-derived together, not one-by-one — the cause is
// shared, not per-policy. `resolveTravel` now applies `navDieFuelDiscount`/
// `navDieEvasionFactor` (0-15% fuel discount, 0-20% encounter-evasion, both keyed
// off the travel die) to EVERY jump every policy makes, so every career re-phases
// (different fuel remaining, different encounter timing) from day 1 regardless of
// archetype. This is the bake-off's own headline finding stated again here: ALL
// EIGHT sim policies moved in the capstone diff (`docs/NPC_REDESIGN.md`'s T-195
// standing amendment carries the exact deltas — tourOneClearRate +12.6%, credits
// +40.5%, ships lost -27.1% fleet-wide). Nothing here was tuned to hit a target;
// these are simply what the new formula produces on these exact seeds.
//
// Entry 29 (T-199 — F-150-2, F-199-1, F-199-2). THREE ROWS MOVE: `trader`,
// `explorer`, `smuggler`. Four do NOT: `fighter`, `veteran`, `gambler`, `greedy`.
//
// THE PREDICTION WAS WRITTEN BEFORE THE RUN, and it was WIDER than the result.
// The prediction named `planPacifistCombat`'s six callers — `planTraderDay` (so
// trader AND trader-degraded), `smugglerPolicy`, `gamblerPolicy`, `fighterPolicy`,
// `explorerPolicy`, `veteranPolicy` — as movers, with `greedy` (which never
// reaches that planner) as the only guaranteed-unmoved row. `greedy` held. But
// `fighter`, `veteran` and `gambler` also came back byte for byte, and the honest
// reading of that is entry 2's, restated: they are UNCHANGED IN THIS WINDOW, not
// unaffected. All three call the changed planner; none happened to meet its branch
// (an open encounter whose tribute the purse cannot cover, with fuel for a getaway)
// inside seeds 1..5 × 40 days, and the fighter's other two changes need a rim
// strand this window never enters. Each moves plainly at sweep scale — the capstone
// diff is the evidence, and it is cited per row below.
//
// WHAT MOVED, in the order the change was made:
//   1. `planPacifistCombat` (SHARED — this is why four rows move at once) no
//      longer plays exactly one stance against an unaffordable tribute. It keeps
//      the getaway first, on the same die as before, and queues the plea behind it
//      on the next die: `canPay` compares the purse to the DEMAND, but
//      `resolveTalk` charges a margin-discounted `paid` and waives the toll
//      outright on a natural 20, so the old code was refusing a deal the engine
//      might still have closed. The one-action-per-day cap that used to forbid the
//      second stance was justified by a crash both batch drivers have guarded
//      against since T-1205 / T-1603c.
//   2. `smugglerPolicy`'s Explore loop gained `state.player.recovery === null`
//      (F-150-2, the twin of F-116-1) — the fix T-150 wrote, measured and backed
//      out because it re-seeded onto (1). With (1) fixed it is safe, and the
//      tripwire that pinned the omission is deleted in the same change.
//   3. The anti-idle rim-strand rules (F-199-1 / F-199-2): `fighterPolicy`'s T-159
//      homeward burn extracted to a shared `planHomewardBurn` (proved INERT first —
//      the `fighter` row came back byte-identical to entry 27's value with only the
//      extraction applied) and wired into `traderPolicy` and `smugglerPolicy`; a
//      new `planStrandedExplore` behind it; and `planCrippledRepair` given to
//      `fighterPolicy`, the last policy in the file without it.
//
// MEASURED EFFECT, and it is the reason the change exists — `balance:sweep
// --seeds 1000 --days 35`, `assertNoIncomeStall` violations: SEVEN before (trader
// 371/571, fighter 74/747/916, smuggler 20/677) and ZERO after, all four shards
// exit 0. Seed 20 is the one that took the "Sweep gate" CI check red.
//
// NO BAND, THRESHOLD, GOLDEN OR CONSTANT WAS EDITED, and TWO further fixes were
// written, measured and BACKED OUT rather than paid for. (a) `veteranPolicy` was
// NOT given the anti-idle move even though it has the same hole: wiring it moved
// `balance-combat-survival.test.ts`'s "preparation pays off when outgunned" band
// from 0.5333 to 0.4801 against a bar of 0.50. (b) `fighterPolicy`'s marker payment
// was NOT netted against the yard spend it queues moments earlier, even though that
// arithmetic hole is real: netting it cost median final credits 79,494 -> 5,877 and
// the debt-clear rate 0.580 -> 0.510 (a smaller payment leaves a COMPOUNDING marker
// open longer, and this policy withholds special equipment while `debt > 0`). Both
// are carried open in TASKS.md under F-199-1 / F-199-2 rather than shipped at that
// price. Two seed-pins
// moved for the re-phasing reason and are documented at their own sites:
// `campaign-reach.test.ts`'s T-1307 port-purchase seed (8 -> 4, swept over seeds
// 1..80 and WIDENED, not re-thresholded) and this task's own capstone re-extract.
//
// Entry 30 (T-173 — the capstone instrument learns to SEE HANGOUT AND DISPOSITION).
// ALL SEVEN ROWS MOVE AND NOT ONE CAREER CHANGED. Entries 11 and 12's shape-only
// form for the third time, and as there the claim is PROVEN below rather than
// asserted.
//
// MECHANISM. `CampaignStatsReport` gained exactly ONE key — `disposition`
// (`DispositionStats`: standing moves by reason, the dusk-sampled live-captain-day
// figures, and the standing spans) — and `CombatEncounterRecord` gained FIVE:
// `interceptorId`, `interceptorSource`, `interceptorDisposition`,
// `namedPoolDispositions`, `namedPoolReconstructed`. No per-day key was added.
// This fingerprint hashes the whole report JSON, shape included, so those keys
// move every hash on their own — and `disposition` sits between `hangoutPlay` and
// `tourOne`, so even the key ORDER of every report differs.
//
// THE PROOF, run locally over these exact 35 careers rather than claimed: with
// `disposition` deleted from the report and the five new keys stripped from every
// `combatEncounters` entry, each policy's hash is BYTE-IDENTICAL to its entry-29
// value — all seven, no exceptions:
//   trader   937f3a09339d5f5a -> stripped baf0ce4ea567da8e (= entry 29)
//   fighter  a45b2209bd026fdb -> stripped acfa7bcc4800e969 (= entry 29)
//   explorer 33c508ce7e9ab818 -> stripped 19c9bf4ab6ad2f94 (= entry 29)
//   veteran  25293f6a22c22404 -> stripped f649dc33cd51a01e (= entry 29)
//   smuggler edbb11a2cfd6a885 -> stripped d9b36d370ba59822 (= entry 29)
//   gambler  6b5ca9f45514024c -> stripped 4e89e7dad776577d (= entry 29)
//   greedy   d17a5e39f79918c6 -> stripped bad42225b0cc469f (= entry 29)
// Two structural facts say why that had to hold: `rulesFingerprint` did not move
// (T-173 touches ZERO lines under `packages/engine/src` and `packages/content/src`
// — deliberately, since putting the pool or the standing onto `EncounterStarted`
// would have moved it), and the new measurement draws NO rng — it is a filter over
// the pre-action roster, a `.map` over dispositions and a dusk-state read — so no
// seeded career can diverge.
//
// WHAT THIS TABLE CANNOT REACH, for the same reason entries 11 and 12 record: the
// other half of T-173 is `MilestoneSample.npcDisposition`, and these runs are made
// WITHOUT `milestoneDays`, so `milestones` is absent from every report hashed here
// and the sampler change cannot touch these numbers. Its reader is
// `campaign-disposition.test.ts`.
//   * `greedy` moving is EXPECTED, and here for the SHAPE reason of entries 4, 11
//     and 12 rather than a world-side one — no policy and no NPC behaviour changed
//     at this step at all.
//
// ENTRY 32 (T-196b — THE INSTRUMENTS LEARN THE FREE ACTIONS). SIX OF THE SEVEN
// ROWS IN THIS TABLE MOVE, AND THE ONE THAT DOES NOT IS THE PROOF THE CAUSE IS
// WHAT IT SAYS. (This table carries seven policies; the 8,000-row capstone carries
// eight — it adds `trader-degraded` — and reports SEVEN OF EIGHT moved, the same
// result counted over the same one control. Do not read the two counts as a
// disagreement.)
//
// THE CAUSE, STATED BEFORE THE NUMBERS. T-196a freed nine administrative action
// types in the ENGINE (`docs/DAWN-HAND-REDESIGN.md` §3) and deliberately left every
// instrument budgeting a die for them — which is why entry 31 moved only the two
// rows that queue an `Explore`. T-196b is the other arm: the eight sim policies in
// `packages/sim/src/index.ts` stop counting the nine against the dawn hand
// (`planRefuel`, `planCrippledRepair`, `planCaptainOverhead`, `planFighterUpgrade`
// and `planSpecialEquipment` lose their `DieLedger` entirely; every sign→travel
// pair is gated on the TRAVEL die alone; the veteran's broker_shark gate falls
// `>= 3` to `>= 2`). Every policy's DAY PLAN therefore changes shape, so unlike
// entry 31 the breadth here is the whole fleet — that contrast IS the control-arm
// result the task was built to measure.
//
// `greedy` IS THE CONTROL AND IT CAME BACK BYTE-IDENTICAL (`d17a5e39f79918c6`,
// unchanged since entry 30). `greedyTraderPolicy`'s only T-196b edit is deleting a
// residual `spendDie: 0` from its `buy-fuel` — dead payload that zod already
// stripped before the engine saw it — so a row whose PLAN did not change did not
// move, while the six whose plans did, all did. No engine or content file is
// touched by this task, so `rulesFingerprint` is unmoved at `55414694d7187afc`;
// what moves is `instrumentFingerprint`, and that is the honest name for it.
//
// MEASURED over these exact five seeds × 40 days, before -> after (summed):
//     policy     credits            deeds      component tiers
//     trader     108,267 -> 131,747   78 ->  75    10 -> 10
//     fighter     55,035 ->  49,399   68 ->  64    44 -> 37
//     explorer   146,960 ->  69,158  114 -> 107    15 -> 13
//     veteran     34,032 ->  39,414   64 ->  68     6 -> 23
//     smuggler    51,950 ->  67,246  120 -> 115    18 -> 18
//     gambler    142,830 -> 109,312   95 ->  90    10 ->  8
//     greedy       7,280 ->   7,280   36 ->  36     0 ->  0   (control, unmoved)
//     fuel-starvation days: 0 -> 0 on EVERY row, before and after.
//
// CREDITS FALL ON THREE OF THE SIX MOVED ROWS — `fighter`, `explorer`, `gambler` —
// AND THAT IS PREDICTED, NOT A REGRESSION. (`trader`, `veteran` and `smuggler` all
// RISE; read the count off the table above, not off this sentence.) The single
// largest mechanism behind the three that fall is `planCaptainOverhead` losing its
// throttle: it was documented as firing only on a day the working plan left a die
// spare, and it now fires on every day where `spendable > 0`. Berth tiers, crew
// hires and port stakes are all SPENDING, and a port stake is a NET CREDIT LOSS
// inside any window shorter than its 154–1,043-dusk payback (`planPortStake`) — so
// more shopping inside a 40-day window reads as poorer, exactly as that planner's
// own comment warns.
//
// THE VETERAN IS THE VISIBLE FACE OF THE SHOPPING, NOT OF THE CREDIT FALL, and the
// distinction matters because the row is cited in both places: its component tiers
// go 6 -> 23 across these five seeds — the un-throttled chain, plainly — while its
// CREDITS RISE 34,032 -> 39,414. It is evidence for how much more the fleet buys,
// never evidence that buying more made a row poorer.
//
// THE FALL COUNT WAS FOUR BEFORE F-196b-1 CLOSED, AND THE PRE-FIX TABLE IS KEPT
// HERE so the "four of six" figure quoted in TASKS.md T-196b's pre-registered
// predictions can be checked against the tree as it stood when they were written.
// Both Explore loops now charge their credit bound PER SWEEP (F-196b-1, TASKS.md);
// with that term forced to 0 in both loops, these same five seeds × 40 days give
// `explorer` 146,960 -> 100,842 and `smuggler` 51,950 -> 39,162 (deeds 120 -> 112,
// tiers 18 -> 16), every other row byte-identical to the table above. So the fall
// was fighter/explorer/smuggler/gambler — FOUR — until the fix moved the smuggler
// from −12,788 to +15,296: a policy that stops sweeping its purse into the fuel
// pump keeps more of it. The fix is the whole difference between the two counts,
// and it is a bug closure, not a tuning.
// NOTHING WAS TUNED IN RESPONSE, and no band or threshold was moved to absorb it;
// where a seed pin went stale it was re-derived from a widened sweep with the
// re-sweep recorded beside it (`campaign-policies.test.ts` FIGHTER_METRIC_SEED
// 2 -> 6, `campaign-smuggler-gambler.test.ts`'s new SMUGGLER_ENFORCEMENT_SEED,
// `sweep-gate.test.ts`'s veteran bar re-measured against its own deleted-branch
// control). The 8,000-row capstone diff against
// `docs/balance/baseline-t196a-free-actions.json` is the powered read.
// ENTRY 33 (T-197 — THE HANGOUT GOES FREE, AND TWO DAILY CAPS REPLACE THE DIE).
// ONLY TWO OF THE SEVEN ROWS MOVE — `smuggler` and `gambler` — AND THAT NARROWNESS
// IS THE RESULT, not a disappointment. Entry 32's breadth (six of seven) was the
// signature of a change to every policy's day plan; this task changes only the
// three planners that touch a Hangout, so only the two policies that CALL them can
// feel it. Five rows coming back byte-identical is the cross-check that nothing
// leaked.
//
// THE CAUSE, STATED BEFORE THE NUMBERS. `docs/DAWN-HAND-REDESIGN.md` §3 (as amended
// 2026-08-04) freed all seven Hangout venues in the ENGINE, and §4a/§4b added the
// two daily caps that replaced the die. On the INSTRUMENT side that is three edits:
// `planLoanBorrow` and `planLoanRepay` lose their `DieLedger` (borrow/repay are
// free and outside both caps), and `planDare` loses its `ledger.takeBest()` while
// gaining a mirror of §4b's rounds cap — plus the gambler's table loop, whose bound
// is now `min(GAMBLER_MAX_DARES_PER_DAY, liarsDiceRoundsRemaining(state))` because
// a planner pure over the dawn state cannot see the hands the same day already
// queued (the F-116-1 / F-150-2 class, guarded before it could bite).
//
// UNLIKE ENTRY 32 THIS IS NOT A CLEAN SINGLE-ARM ATTRIBUTION, and it is said here
// rather than left for the capstone to discover: T-196a/T-196b were a control-arm
// PAIR (engine only, then instrument only), so each moved exactly one fingerprint.
// T-197 moves BOTH — `rulesFingerprint` (engine + content: the freed resolver, the
// two caps, `SOCIAL_PLAYS_PER_DAY`, `LIARS_DICE_ROUNDS_PER_DAY`) and
// `instrumentFingerprint` (the three planners above). The two rows below therefore
// carry a mixed cause by design, and no arithmetic here can split them.
//
// MEASURED over these exact five seeds × 40 days, before -> after (summed):
//     policy     credits              deeds
//     trader     131,747 -> 131,747    75 ->  75   (unmoved)
//     fighter     49,399 ->  49,399    64 ->  64   (unmoved)
//     explorer    69,158 ->  69,158   107 -> 107   (unmoved)
//     veteran     39,414 ->  39,414    68 ->  68   (unmoved)
//     smuggler    67,246 ->  67,190   115 -> 115   (MOVED)
//     gambler    109,312 -> 127,628    90 ->  93   (MOVED)
//     greedy       7,280 ->   7,280    36 ->  36   (control, unmoved)
//     `hangoutPlay.failedVisits`: 0 on EVERY row, before and after — the mechanical
//     proof that both new cap mirrors are correct. A policy that planned an open
//     past the day's rounds, or a social beat past the pool, would earn a typed
//     refusal and show up here. NONE DOES.
//
// WHY THE TRADER DID NOT MOVE, even though it calls `planLoanBorrow`. The planner's
// preconditions (a Hangout system, no live loan, a real shortfall) are unchanged
// and the trader clears its shortfalls out of income over these five seeds — so the
// borrow never fires, the die it used to take was never taken, and there is nothing
// for the freeing to change. `hangoutPlay.visits` is 0 on that row, which is the
// same fact measured a second way.
//
// ENTRY 34 (T-208 — THE ELEVEN QUEST CAPTAINS GET A HOME PORT).
// TWO OF THE SEVEN ROWS MOVE — `gambler` and `greedy` — and this time the mover
// list is the finding, because ONE OF THE TWO IS THE CONTROL ROW.
//
// THE CAUSE, STATED BEFORE THE NUMBERS. `createInitialState` used to seed all 41
// roster records at `(index % 20) + 1`. `QUEST_PROFILES` occupy indices 30-40, so
// six of the eleven landed on RIM systems (15-20) — and a quest captain NEVER
// MOVES (the only two writers of `currentSystemId` sit behind `day.ts`'s
// `isSimulatedCaptain` gate, which they never pass), so those six sat there for
// the whole career, at ports with no Cantina. T-208 replaced that seed with the
// core port each captain's own content declares (`NpcProfile.homePortSystemId`).
// NO POLICY, PLANNER OR RULE CHANGED — only where eleven records stand on day 1.
//
// WHY THAT REACHES A CAREER AT ALL, in exactly two places, both of which read a
// roster record's POSITION without asking whether it is simulated:
//   (a) `resolveVisitHangout` (`engine/actions/hangout.ts`) picks its Dare dealer
//       and social target from `npcs.filter(n => !n.dead && n.currentSystemId ===
//       player.currentSystemId)` — no `isSimulatedCaptain` filter. Quest captains
//       ARE seatable dealers wherever they sit, and they carry a fixed 5,000cr
//       purse. Moving five of them onto core ports puts more dealers where the
//       gambler actually plays: `hangoutPlay.visits` 281 -> 301 over these seeds.
//   (b) the BOND HOOK (`day.ts`) requires `npc.currentSystemId ===
//       player.currentSystemId`. Doc Salvage is the game's only `fuel-gift` hook
//       and is a quest captain; he moved from Antares-5 (15) to Sol-3 (1), so the
//       fuel-gift now has to land at the home port instead of at that rim system.
//       That is the whole of the `greedy` delta — see below.
//
// MEASURED over these exact five seeds x 40 days, before -> after (summed):
//     policy     credits              deeds
//     trader     131,747 -> 131,747    75 ->  75   (unmoved)
//     fighter     49,399 ->  49,399    64 ->  64   (unmoved)
//     explorer    69,158 ->  69,158   107 -> 107   (unmoved)
//     veteran     39,414 ->  39,414    68 ->  68   (unmoved)
//     smuggler    67,190 ->  67,190   115 -> 115   (unmoved)
//     gambler    127,628 -> 147,288    93 ->  93   (MOVED)
//     greedy       7,280 ->   7,640    36 ->  37   (MOVED — the control row)
//     `hangoutPlay.failedVisits`: 0 on EVERY row, before and after. Nothing plans
//     a Hangout beat the resolver then refuses; the extra gambler visits are real
//     opens against real dealers, not queued refusals.
//
// THE CONTROL ROW MOVED, AND THAT IS NOT A LEAK — it is (b), isolated. `greedy`
// has `hangoutPlay.visits` 0 before and after, so channel (a) cannot be its cause.
// Diffing its five reports, ONLY SEED 1 differs at all; the other four are
// byte-identical. On seed 1 the divergence begins on DAY 7 with the player's fuel
// reading 136 before and 86 after — a 50-unit gap, and 50 is exactly Doc Salvage's
// `bondHook.fuelAmount`. The greedy trader was standing at Antares-5 (15) that
// day, which is where the old arbitrary seed had parked Doc; he is at Sol-3 now,
// so the mayday goes unanswered and the career diverges from there. One captain,
// one port, one seed — the narrowest possible confirmation that the ONLY thing
// this task changed is where eleven records stand.
//
// AND THE SAME MECHANISM, MEASURED A SECOND WAY: `campaign-reach.test.ts`'s
// T-1204 bond-reachability test re-pinned its seed after a fresh 1..30 sweep, and
// found NINE qualifying seeds against the previous sweep's eight. Doc Salvage at
// the home port is slightly EASIER to reach than Doc Salvage at a rim system —
// which is the answer to the obvious worry that this row's delta means the hook
// got harder to fire. It did not. NOTHING WAS TUNED IN RESPONSE to either number.
//
// ENTRY 35 (T-168 — THE RAISED TIER-4/5 CEILING IS FINALLY STAKED INTO, F-148-4).
// ALL SEVEN ROWS MOVE, AND SIX OF THEM MOVE FOR A REPORT-SHAPE REASON ONLY —
// entries 11, 12, 23 and 30's form for the fifth time, and as there the claim is
// PROVEN below rather than asserted.
//
// TWO CHANNELS, SEPARATED BY MEASUREMENT RATHER THAN BY ARGUMENT.
//   (a) SHAPE. `HangoutPlayStats` gained THREE keys — `handsAboveBaseCeiling`,
//       `handsAboveRaisedCeiling`, `maxSeedWager` — folded from `DareHandStarted`
//       (the only event carrying both a `systemId` and the SEATED stake). This
//       fingerprint hashes the whole report JSON, shape included, so three keys at
//       0 move every hash on their own.
//   (b) WORLD. `planDare` now sizes its stake off the engine's `preHandWagerBand`
//       (§4.6a item 3) instead of raw `wagerBandFor` — the TIER-0 band — so a
//       gambler past rung 4 can at last REQUEST into the raised ceiling. Only a
//       policy that sits at a table can feel this, and `planDare` is called by
//       `gamblerPolicy` and by nothing else (`packages/sim/src/index.ts`, one call
//       site).
//
// THE STRIP PROOF, run locally over these exact 35 careers rather than claimed.
// Removing `,"handsAboveBaseCeiling":N,"handsAboveRaisedCeiling":N,"maxSeedWager":N`
// from the hashed JSON reproduces the entry-34 pin BYTE FOR BYTE on six of seven:
//   trader   415c1e1225f8f63d -> stripped 4b4115a7c2486def (= entry 34)
//   fighter  79a7cfe6a1012fe7 -> stripped 57afc68979f9ae48 (= entry 34)
//   explorer c3f5d6d237147058 -> stripped d5f410e252951823 (= entry 34)
//   veteran  38fc08a73fcbe506 -> stripped d43d2c45794576e7 (= entry 34)
//   smuggler 1a7bc4df42683373 -> stripped ea0faad190ef6152 (= entry 34)
//   greedy   fbcbcbe637e127b9 -> stripped 18404cd9bdb2257e (= entry 34)
// So for those six the ONLY delta is a report key, and channel (b) provably did not
// reach them. Their `hangoutPlay.visits` is 0 before and after, which is the same
// fact measured a second way.
//
// THE GAMBLER IS THE ONE REAL MOVE, and correctly so: stripped it is
// b88a50aa25a4a918, still not the entry-34 value. Measured over these exact five
// seeds x 40 days: 299 dares (unchanged in COUNT — the rounds cap and
// `GAMBLER_MAX_DARES_PER_DAY` still bound how many hands are played, and this task
// changed only how big they are), 221,225 wagered, +63,923 net, and **64 of the 299
// hands SEATED above the port's tier-0 ceiling** against a structural 0 before.
// `maxSeedWager` 4,785. `hangoutPlay.failedVisits` is 0 on every row before and
// after — the mechanical proof that the wider ask is still an ask the resolver
// accepts, not a stake it clamps into a refusal.
//
// `handsAboveRaisedCeiling` IS 0 IN THIS WINDOW, AND THAT IS EXPECTED RATHER THAN A
// MISS. It counts stakes above the TIER-4 ceiling, which only tier 5's removed
// clamp can reach, and rung 5 opens at 80 settled hands (`LIARS_DICE_UNLOCK_GAMES`)
// — roughly 60 are played in 40 days. The 120-day arms in
// `campaign-smuggler-gambler.test.ts` are where that field is proven non-zero, and
// the 1,000-seed capstone is where it is measured.
//
// NO BAND, THRESHOLD, GOLDEN OR CONSTANT WAS EDITED. Both `rulesFingerprint` (the
// new `preHandWagerBand` accessor in `engine/liarsDiceRules.ts`) and
// `instrumentFingerprint` (`sim/index.ts`) move, so this task owes a capstone;
// `sim/protocol.ts`'s half of the fix is classified non-instrument and contributes
// to neither.
//
// ENTRY 36 (T-175 PHASE A — THE ARCHETYPE-ORDERING INSTRUMENT, F-160-1). ALL SEVEN
// ROWS MOVE, AND ALL SEVEN MOVE FOR A REPORT-SHAPE REASON ONLY — entries 11, 12,
// 23, 30 and 35's form for the sixth time, and as there the claim is PROVEN below
// rather than asserted. This is the "extract behaviour-preserving BEFORE adding
// behaviour" step: NO RULE CHANGED IN THIS ENTRY.
//
// THE CAUSE, STATED BEFORE THE NUMBERS. F-160-1 needs Liar's Dice hands split by
// `pool × archetype × tier`, and none of the three rode any event: they lived only
// on `state.dareHand`, which is gone by the time a reader sees the stream. Two
// additive changes:
//   (a) ENGINE. `DareHandResolved` gains three OPTIONAL fields — `opponentKind`,
//       `opponentArchetype`, `dicePerSide` — each a copy of an ALREADY-FROZEN hand
//       field, emitted at the one existing emission site (`actions/dare.ts`). No
//       dice, cost, legality or probability is touched. Optional for the STRIP-mode
//       reason `DareHandStarted.dicePerSide` and `opponentRead` are optional, so
//       `CURRENT_SAVE_VERSION` does NOT move (`docs/VERSIONING.md` §2).
//   (b) INSTRUMENT. `HangoutPlayStats` gains `dareCells` (48 zero-filled cells) and
//       `dareTierDisagreements`. This fingerprint hashes the whole report JSON,
//       shape included, so a new key moves every hash on its own.
//
// THE STRIP PROOF, RUN LOCALLY over these exact 35 careers rather than claimed.
// Deleting `dareCells` and `dareTierDisagreements` from the hashed `hangoutPlay`
// reproduces the entry-35 pin BYTE FOR BYTE on ALL SEVEN — including `gambler`,
// the one row that actually sits at a table, which is the strongest available
// statement that the three new event fields are mathematically inert:
//   trader   9ec397b9c42bffd7 -> stripped 415c1e1225f8f63d (= entry 35)
//   fighter  895057933d261134 -> stripped 79a7cfe6a1012fe7 (= entry 35)
//   explorer 523aaca0e611dbfb -> stripped c3f5d6d237147058 (= entry 35)
//   veteran  4759d8528de00678 -> stripped 38fc08a73fcbe506 (= entry 35)
//   smuggler a6b263d9a730db48 -> stripped 1a7bc4df42683373 (= entry 35)
//   gambler  060e8c648721135a -> stripped 14648e63aaebf2a9 (= entry 35)
//   greedy   ab18b51b762e4367 -> stripped fbcbcbe637e127b9 (= entry 35)
// Unlike entry 35, there is no "one real move": zero careers changed, which is what
// "prove it inert first" means here.
//
// NO BAND, THRESHOLD, GOLDEN OR CONSTANT WAS EDITED. `rulesFingerprint` MOVES (the
// three event fields land in hashed engine sources) even though nothing behaves
// differently — inertness is proved by ROWS, not by a hash, exactly as
// `baseline-t206-captain-voice.json` proved it when prose alone moved the same
// fingerprint. `instrumentFingerprint` moves too (`sim/index.ts`).
//
// ENTRY 37 (T-175 PHASE C — `optimal` READS THE CLAIM, F-160-1). EXACTLY ONE ROW
// MOVES: `gambler`. This is the REAL behaviour change entry 36 was the inert
// preparation for.
//
// WHAT MOVED, IN ONE LINE. `archetypeMove`'s `optimal` branch computed its belief
// that the standing claim is true as `probAtLeast(q - own(face), dicePerSide)` —
// the UNCONDITIONED Binomial, i.e. as though the claimant had said nothing. It had.
// `probClaimTrue` now reads the claimant's support off the claim through
// `creditedClaimSupport`, which is `minOpeningQuantity` read backwards and carries
// no free parameter. The raise valuations are UNCHANGED.
//
// WHY THE OTHER SIX CANNOT MOVE, and this is the containment claim — entry 28's
// shape exactly, because it is the same reachability argument: `archetypeMove` is
// called from ONE site (`packages/engine/src/actions/dare.ts`, the roster arm of
// the policy dispatch), reachable only through an OPEN Liar's Dice hand; a hand
// only opens on `VisitHangout{venue:'dare'}`; and `planDare` is queued by
// `gamblerPolicy` and by nothing else (one call site in `packages/sim/src/index.ts`).
// No other policy ever sits at a table. THE SIX UNMOVED ROWS ARE THE PROOF, NOT THE
// ASSUMPTION — this suite was run before the re-pin and reported exactly one
// failing row.
//
// MEASURED over these exact five seeds × 40 days, before -> after:
//     dares played              299  ->    285
//     player win rate at the table  63.21%  ->  51.58%
//     hangoutPlay.netCredits    +63,923  ->     -263
//     wagered                   221,225  ->  110,896
//     credits at day 40         154,027  ->   74,088
//     deeds                          93  ->       95
// The wager total falls BECAUSE the win rate did, not independently: a poorer
// gambler seats smaller stakes (the engine clamps every stake to what both sides
// can cover), so `wagered` is a consequence and not a second change.
//
// THE TABLES STOP BEING A MONEY PRINTER, AND THAT IS THE POINT RATHER THAN A
// REGRESSION. F-160-1's whole finding is that the archetype labelled `optimal` was
// the SOFTEST seat in the game; a policy that stops losing on purpose necessarily
// takes credits off the only policy that plays it. Nothing was tuned toward a
// target — see `docs/LIARS-DICE-DECISIONS.md` LD-25 for the five candidate reads
// that were measured and the four that were rejected.
//
// NO BAND, THRESHOLD, GOLDEN OR CONSTANT WAS EDITED. `rulesFingerprint` moves
// again (a rule changed, which is the honest name for it), so this task owes a
// capstone and predicted `gambler` + `fleet` as its only movers before the run.
//
// A SECOND, SMALLER CHANGE RIDES IN THIS ENTRY, AND IT IS NAMED RATHER THAN
// FOLDED IN SILENTLY: `gamblerPolicy` gained T-199's two shared anti-idle rungs
// (`planHomewardBurn`, `planStrandedExplore`). It was the ONLY competent policy
// without them, and the rule change above re-phased two of the 1,000 capstone
// seeds onto a rim strand it could not leave — seed 819 at system 17 for days
// 45-49 and seed 485 at system 18 for days 80-84, both on a FULL TANK and the
// second on 67,913 credits, which is not a poverty trap and was never about
// money. `assertNoIncomeStall` caught both. `smugglerPolicy`'s own note states the
// precedent this follows verbatim — "a defect this change moved rather than
// caused, but moved INTO the sample, which makes it this change's to close" — so
// it was closed here rather than filed and gated around. The gate is green on its
// own terms, not on a widened one: no invariant, band or limit was touched.
//
// THE WIRING IS INERT OVER THIS FINGERPRINT'S OWN WINDOW, measured rather than
// assumed: with it added and the rule change already in, `gambler` came back at
// `34553710b65b777a` — byte-identical to the value measured before the wiring.
// Neither rung fires inside seeds 1..5 × 40 days, because neither seed strands.
// So the number below attributes to the RULE alone, and the wiring's effect is
// visible only at capstone scale.
//
// ENTRY 38 (T-176 — THE CHALLENGER-WON SPLIT INSTRUMENT, F-160-2). ALL SEVEN ROWS
// MOVE, AND ALL SEVEN MOVE FOR A REPORT-SHAPE REASON ONLY — entries 11, 12, 23, 30,
// 35 and 36's form for the seventh time. THE CLAIM HERE IS STRONGER THAN ENTRY 36'S:
// entry 36 added three OPTIONAL ENGINE EVENT FIELDS and had to prove those inert by
// rows; this entry touches NO engine or content source at all. `rulesFingerprint`
// is PREDICTED UNMOVED and the only lines under `packages/engine/src` are a comment
// retarget, which `hashSemantic` strips before hashing (N7-FP).
//
// THE CAUSE, STATED BEFORE THE NUMBERS. F-160-2's re-derived criterion (C3',
// `docs/LIARS-DICE_REDESIGN.md` §18) compares the two challenger rows AT MATCHED
// EVIDENCE, which needs settled CHALLENGE hands cut by
// `pool × challenger × dicePerSide × k`. None of that rode any counter:
// `HangoutPlayStats` gains `dareChallengeCells` (108 zero-filled cells),
// `dareChallengeSplit` (16), and `dareChallengeDisagreements`. This fingerprint
// hashes the whole report JSON, shape included, so three new keys move every hash
// on their own.
//
// THE STRIP PROOF, RUN LOCALLY over these exact 35 careers rather than claimed.
// Deleting the three new keys from the hashed `hangoutPlay` reproduces the entry-37
// pin BYTE FOR BYTE on ALL SEVEN — including `gambler`, the one row that actually
// sits at a table and therefore the only row a challenge counter can even reach:
//   trader   19589e0d6205df26 -> stripped 9ec397b9c42bffd7 (= entry 37)
//   fighter  2a5311c8f715659c -> stripped 895057933d261134 (= entry 37)
//   explorer 2eb09d1ba5f0dd09 -> stripped 523aaca0e611dbfb (= entry 37)
//   veteran  a606099314d8f6d8 -> stripped 4759d8528de00678 (= entry 37)
//   smuggler 0259248059be5eaf -> stripped a6b263d9a730db48 (= entry 37)
//   gambler  d1d0c11b6c0d6a49 -> stripped 34553710b65b777a (= entry 37)
//   greedy   99e6a7d50b02558e -> stripped ab18b51b762e4367 (= entry 37)
// Zero careers changed. A COUNTER CANNOT CHANGE BEHAVIOUR — `planDareMove`'s inputs
// did not move by one byte, and the instrument reads the HIDDEN dice off the
// settlement event, which the planner never sees.
//
// NO BAND, THRESHOLD, GOLDEN OR CONSTANT WAS EDITED. `instrumentFingerprint` moves
// (`sim/index.ts`); `rulesFingerprint` does NOT.
//
// ENTRY 39 (T-224 — THE DEAD-ZONE SUBCUT INSTRUMENT, F-222-1). ALL SEVEN ROWS
// MOVE, AND ALL SEVEN MOVE FOR A REPORT-SHAPE REASON ONLY — the same shape-only
// proof pattern as entries 36 and 38.
//
// THE CAUSE, STATED BEFORE THE NUMBERS. T-224 needs the exact share of shipped
// Liar's Dice hands seated inside the bounded-band dead zone. The existing
// `dareCells` split had no stake/headroom subcut, so `DareCellStats` gains four
// raw counters: `deadZoneHands`, `deadZonePlayerWon`, `deadZoneNetCredits` and
// `deadZoneBids`. This is an INSTRUMENT addition only. It reads `DareHandStarted`
// and `DareHandResolved` events the sim already consumed; no engine, content or
// policy source moved.
//
// THE STRIP PROOF, RUN LOCALLY over these exact 35 careers rather than claimed.
// Deleting the four new `deadZone*` keys from every `dareCells` cell reproduces
// the entry-38 pin BYTE FOR BYTE on ALL SEVEN:
//   trader   19589e0d6205df26 -> stripped 19589e0d6205df26 (= entry 38)
//   fighter  2a5311c8f715659c -> stripped 2a5311c8f715659c (= entry 38)
//   explorer 2eb09d1ba5f0dd09 -> stripped 2eb09d1ba5f0dd09 (= entry 38)
//   veteran  a606099314d8f6d8 -> stripped a606099314d8f6d8 (= entry 38)
//   smuggler 0259248059be5eaf -> stripped 0259248059be5eaf (= entry 38)
//   gambler  d1d0c11b6c0d6a49 -> stripped d1d0c11b6c0d6a49 (= entry 38)
//   greedy   99e6a7d50b02558e -> stripped 99e6a7d50b02558e (= entry 38)
//
// Zero careers changed. The new numbers are a lens on hands that already happened,
// not a lever. `instrumentFingerprint` moves (`sim/index.ts`); `rulesFingerprint`
// does NOT.
//
// ENTRY 40 (T-225 — THE TIER-5 STAKE-DISTRIBUTION INSTRUMENT, F-222-2). ALL SEVEN
// ROWS MOVE, AND ALL SEVEN MOVE FOR A REPORT-SHAPE REASON ONLY — the same
// shape-only proof pattern as entry 39.
//
// THE CAUSE, STATED BEFORE THE NUMBERS. T-225 needs the tier-5 stake distribution
// with `n` on every port: how often the shipped game reaches `k <= 4`, how often it
// reaches PAST `k <= 4`, and whether the fully dissolved `k = u` gate ever appears.
// `HangoutPlayStats` gains `dareTier5StakeCells`, a zero-filled port table folded
// from the same `DareHandStarted` and `DareHandResolved` events the instrument
// already consumes. No engine, content or policy source moved.
//
// THE STRIP PROOF, RUN LOCALLY over these exact 35 careers rather than claimed.
// Deleting `hangoutPlay.dareTier5StakeCells` reproduces the entry-39 pin BYTE FOR
// BYTE on ALL SEVEN:
//   trader   8c76952ed7c82fa6 -> stripped 8c76952ed7c82fa6 (= entry 39)
//   fighter  5c965a1bfdbd2a21 -> stripped 5c965a1bfdbd2a21 (= entry 39)
//   explorer 3952dd7db75e4a7d -> stripped 3952dd7db75e4a7d (= entry 39)
//   veteran  1347dcd80b841eff -> stripped 1347dcd80b841eff (= entry 39)
//   smuggler 692839a1c388bca2 -> stripped 692839a1c388bca2 (= entry 39)
//   gambler  8ca64a2e89bfc271 -> stripped 8ca64a2e89bfc271 (= entry 39)
//   greedy   955fad1f7dce22ff -> stripped 955fad1f7dce22ff (= entry 39)
//
// Zero careers changed. The new table reports the opening-gate consequence of
// stakes that already seated; it cannot feed back into any planner or resolver.
// `instrumentFingerprint` moves (`sim/index.ts`); `rulesFingerprint` does NOT.
//
const PINNED_FINGERPRINTS: Record<(typeof UNCHANGED_POLICIES)[number], string> = {
  // Entry 17: re-derived — the Penny Wise desk is now reachable at 14 of 28 ports,
  // so the trader borrows and repays on the day it needs to rather than on the day
  // it gets home. Entry 19: re-derived again — Arcturus-6 withdraws its desk, and
  // the policy's lending guards now mirror the engine's `venueOffered` gate rather
  // than queueing an action the resolver refuses. Entry 22: re-derived a THIRD
  // time, and back to entry 17's value — owner ruling D7 restores that desk against
  // a tight `loanBand`, so the withdrawal channel is exactly undone and the band
  // itself is provably inert over these seeds.
  // Entry 23: re-derived — the new `dareGuardHits` report key ONLY (see above).
  // Entry 27 (T-156): re-derived — the NPC virtual hand (see the header).
  // Entry 29 (T-199): re-derived — the shared pacifist-combat planner and the
  // trader's new anti-idle rim move (see the header).
  // Entry 30 (T-173): re-derived — REPORT SHAPE ONLY, no career changed (see
  // the header's entry 30 for the strip proof against the value above).
  // ENTRY 32 (T-196b): re-derived — the trader's own day plan changed. Its
  // sign→travel pair is gated on the travel die alone, its second run needs
  // `ledger.remaining() >= 1` instead of `>= 2`, and `planRefuel` /
  // `planCrippledRepair` / `planCaptainOverhead` take no die at all (see the
  // header's entry 32). Credits over these five seeds RISE, 108,267 -> 131,747.
  // ENTRY 35 (T-168): re-derived — REPORT SHAPE ONLY, no career changed (see
  // the header's entry 35 for the strip proof against the value above).
  // ENTRY 36 (T-175): re-derived — REPORT SHAPE ONLY, no career changed (see
  // the header's entry 36 for the strip proof against the value above).
  // ENTRY 38 (T-176): re-derived — REPORT SHAPE ONLY, no career changed (see
  // the header's entry 38 for the strip proof against the value above).
  // ENTRY 39 (T-224): re-derived — REPORT SHAPE ONLY, no career changed (see
  // the header's entry 39 for the strip proof against the value above).
  trader: '0fb72ea43697417b',
  // Entry 27 (T-159): re-derived — and the ONLY row that moves, which is the
  // cross-check that this was a fighter change and nothing else: `trader`,
  // `explorer`, `veteran`, `smuggler`, `gambler` and `greedy` all came back byte
  // for byte.
  //
  // THE CAUSE, STATED BEFORE THE NUMBER. `fighterPolicy` gained the two branches
  // it was missing at its contract-signing path: (a) the T-1104 full-tank
  // relaxation the other four gated policies have always carried, and (b) an
  // explicit anti-idle homeward burn for the harder corner where NO leg on the
  // board fits even a full tank. Both only ever fire on a day the fighter would
  // otherwise have taken no income action at all, so they cannot displace a run —
  // but a day that used to be a `Wait` is now a sign+travel or a repositioning
  // jump, and from there the career re-phases (different port, different board,
  // different dusk rng draws).
  //
  // MEASURED across these exact five seeds x 40 days, before -> after:
  //     zero-income days (all seeds)   4  ->  1
  //     longest zero-income streak     1  ->  1   (this sample never held a
  //                                                stalled seed; the strand is
  //                                                seeds 35/54/75/80/115/181)
  //     credits at day 40, summed  21,657 -> 23,386
  //     deeds, summed                 60  ->  56
  //     fuel-starvation days           0  ->  0
  // Deeds fall and two seeds' Tour One balances end slightly higher: that is
  // re-phasing, not a regression, and NOTHING WAS TUNED IN RESPONSE. On the sample
  // that is actually powered — the 420-row CI gate at 60 seeds x 35 days — the
  // whole rate table is unchanged to four decimals except `board-depth-mean`
  // (3.7822 -> 3.7820), and every invariant went from one violation to zero.
  // Entry 27 (T-156): re-derived — the NPC virtual hand (see the header).
  // Entry 29 (T-199): UNCHANGED IN THIS WINDOW, not unaffected — and it was
  // PREDICTED to move. `fighterPolicy` gained `planCrippledRepair` and the shared
  // anti-idle Explore, and it calls the changed `planPacifistCombat`; none of the
  // three fires inside seeds 1..5 x 40 days. It moves plainly at sweep scale (100
  // seeds x 120 days: median final credits 68,691 -> 79,494, debt-clear rate
  // 0.570 -> 0.580, worst zero-income streak 9 -> 1).
  // Entry 30 (T-173): re-derived — REPORT SHAPE ONLY, no career changed (see
  // the header's entry 30 for the strip proof against the value above).
  // ENTRY 32 (T-196b): re-derived — same cause, plus the fighter's own three-way
  // shopping chain (`planSpecialEquipment` -> `planFighterUpgrade` ->
  // `planCaptainOverhead`) now nets a running `committed` credit total, because all
  // three can fire on one day where the die used to ration them apart. Component
  // tiers over the five seeds fall 44 -> 37 and credits 55,035 -> 49,399: the yard
  // buys are no longer double-funded out of the same dawn balance, which is the
  // netting working, not a lost capability.
  // ENTRY 35 (T-168): re-derived — REPORT SHAPE ONLY, no career changed (see
  // the header's entry 35 for the strip proof against the value above).
  // ENTRY 36 (T-175): re-derived — REPORT SHAPE ONLY, no career changed (see
  // the header's entry 36 for the strip proof against the value above).
  // ENTRY 38 (T-176): re-derived — REPORT SHAPE ONLY, no career changed (see
  // the header's entry 38 for the strip proof against the value above).
  fighter: '4b26343444aa57b8',
  // Entry 16: re-derived — T-117's single band-weighted draw replaces the
  // three-leg carrier and T-115 fills bands 3-4, so every board this policy
  // takes re-phases. Entry 21: re-derived again — owner ruling D1 makes bands 3-4
  // pay dice at claim instead of days, so the finds this policy used to open and
  // then lose to the location predicate are now collected on the day.
  // Entry 26 (T-150): re-derived a THIRD time — F-116-1's recovery guard. The
  // policy no longer queues an Explore on a day whose dawn carries an open salvage
  // op, so the die that used to buy a guaranteed refusal is spent elsewhere.
  // Entry 27 (T-156): re-derived — the NPC virtual hand (see the header).
  // Entry 29 (T-199): re-derived — the shared pacifist-combat planner ONLY; no
  // line inside `explorerPolicy` moved.
  // Entry 30 (T-173): re-derived — REPORT SHAPE ONLY, no career changed (see
  // the header's entry 30 for the strip proof against the value above).
  //
  // ENTRY 31 (T-196a): re-derived — M17 freed nine administrative action types from
  // the dawn hand (`docs/DAWN-HAND-REDESIGN.md` §3), and `explorerPolicy` is ONE OF
  // ONLY TWO rows in this table that move (the other is `smuggler`). NOT ONE LINE OF
  // `explorerPolicy` CHANGED — its `ledger.takeWorst()`/`takeBest()` day budget is
  // deliberately untouched at this arm. What changed is downstream, in the engine: a
  // refuel / signature / yard order no longer consumes from the hand, so the dice
  // still standing when the day's `Explore` resolves are different, and `Explore` is
  // the one verb that reads the REST of the hand at resolve time (`exploreOutcomes.ts`
  // `payExtraDiceClaim` charges a band-3/4 find's `apCost` out of the remaining dice,
  // and forfeits the find when the hand is too thin — T-131's ruling D1).
  //
  // THAT IS ALSO THE CROSS-CHECK, and it is the reason this table earns its keep here:
  // exactly the two policies that queue an `Explore` moved, and the five that never do
  // (`trader`, `trader-degraded` via its arm, `fighter`, `veteran`, `gambler`,
  // `greedy`) came back BYTE-IDENTICAL. The 8,000-row capstone
  // (`docs/balance/baseline-t196a-free-actions.json`) independently reports the same
  // split on a completely different sample.
  //
  // MEASURED over these exact five seeds × 40 days, before -> after:
  //     final credits, summed   123,556 -> 146,960
  //     deeds, summed               111 ->     114
  //     seeds clearing the marker     5 ->       4
  //     fuel-starvation days          0 ->       0
  // Credits up and one seed's marker slipping past day 40 is RE-PHASING, not a
  // regression, and NOTHING WAS TUNED IN RESPONSE.
  //
  // ENTRY 32 (T-196b): re-derived — and this time the cause is INSIDE
  // `explorerPolicy`: its tier-3 drives buy and its sign→travel pair both stopped
  // taking a die, so the Explore loop below them is handed MORE dice on a fuelled
  // day, and `drivesCost` now nets into `planCaptainOverhead`. Credits over the five
  // seeds fall 146,960 -> 69,158 and deeds 114 -> 107, which is the overhead
  // throttle coming off (the header's entry 32 states the mechanism) plus F-196b-1's
  // per-sweep credit charge on the Explore loop below it — the loop's REAL bound
  // finally applied per iteration instead of once (see the finding in TASKS.md). It
  // caps no iteration count and moves no floor.
  // ENTRY 35 (T-168): re-derived — REPORT SHAPE ONLY, no career changed (see
  // the header's entry 35 for the strip proof against the value above).
  // ENTRY 36 (T-175): re-derived — REPORT SHAPE ONLY, no career changed (see
  // the header's entry 36 for the strip proof against the value above).
  // ENTRY 38 (T-176): re-derived — REPORT SHAPE ONLY, no career changed (see
  // the header's entry 38 for the strip proof against the value above).
  explorer: '9b6a0808650ddc38',
  // Entry 27 (T-156): re-derived — the NPC virtual hand (see the header).
  //
  // Entry 29 (T-161): re-derived, and the ONLY row that moves — which is the
  // cross-check that this was a veteran change and nothing else: `trader`,
  // `fighter`, `explorer`, `smuggler`, `gambler` and `greedy` all came back byte
  // for byte.
  //
  // THE CAUSE, STATED BEFORE THE NUMBER. `veteranPolicy` gained the T-1104
  // full-tank relaxation at its contract filter (finding F-159-1) — the branch
  // the other five gated policies already carried, and the last one missing in
  // this file. It fires only on a day where NOTHING fits the SIGN_FUEL_FRACTION
  // re-flight margin, i.e. a day the veteran would otherwise have signed nothing
  // at all, so it cannot displace a run; but a day that used to be a Wait is now
  // a sign+travel, and from there the career re-phases (different port, different
  // board, different dusk rng draws).
  //
  // MEASURED across these exact five seeds x 40 days, before -> after:
  //     zero-income days (all seeds)   159  ->  149
  //     longest zero-income streak      36  ->   10
  //     credits at day 40, summed   18,373  -> 34,322
  //     deeds, summed                   64  ->   77
  //     fuel-starvation days             0  ->    0
  // Deeds and credits both RISE here, which is the honest direction for a policy
  // that used to strand: a veteran that keeps flying keeps earning and keeps
  // banking deeds. NOTHING WAS TUNED IN RESPONSE. On the powered sample — seeds
  // 1..200 x 35 days — the worst zero-income streak falls 31 -> 13; the COUNT of
  // seeds at or over the stall limit barely moves (198 -> 197) because the
  // residual is a different, separately-filed defect (F-161-1, the un-split
  // storylet branch), and no threshold was touched to hide that.
  // Entry 29 (T-199): UNCHANGED IN THIS WINDOW, not unaffected — `veteranPolicy`
  // calls the changed `planPacifistCombat` but never met its branch inside seeds
  // 1..5 x 40 days. Every veteran-specific edit in that task was reverted (see the
  // header's F-199-1 residual), so this row has no second reason to move.
  // Entry 30 (T-173): re-derived — REPORT SHAPE ONLY, no career changed (see
  // the header's entry 30 for the strip proof against the value above).
  // ENTRY 32 (T-196b): re-derived, and the LOUDEST row in the table — component
  // tiers over the five seeds go 6 -> 23. The veteran's yard chain (cargo pods,
  // `planFighterUpgrade`, `planSpecialEquipment`) used to compete with its own
  // haggle/sign/travel for the same five dice and now does not; the pod buy's price
  // is netted forward through `yardCommitted` so the three cannot spend the same
  // credits. Its broker_shark gate also falls `>= 3` to `>= 2` (sign is free, so
  // only haggle and travel still cost dice). Credits RISE, 34,032 -> 39,414, and
  // deeds 64 -> 68 — a grinder that can shop and fly on the same day earns more.
  // ENTRY 35 (T-168): re-derived — REPORT SHAPE ONLY, no career changed (see
  // the header's entry 35 for the strip proof against the value above).
  // ENTRY 36 (T-175): re-derived — REPORT SHAPE ONLY, no career changed (see
  // the header's entry 36 for the strip proof against the value above).
  // ENTRY 38 (T-176): re-derived — REPORT SHAPE ONLY, no career changed (see
  // the header's entry 38 for the strip proof against the value above).
  veteran: 'f76319af5dfa2ec2',
  // Entry 16: re-derived (Explore); entry 17: re-derived again, same desk reach
  // as the trader. Entry 21: re-derived a third time — the same D1 ruling, felt
  // through the shorter hand on a band-3/4 board rather than through the payout.
  // Entry 27 (T-156): re-derived — the NPC virtual hand (see the header).
  // Entry 29 (T-199): re-derived — the shared planner, F-150-2's Explore recovery
  // guard, and the anti-idle rim move.
  // Entry 30 (T-173): re-derived — REPORT SHAPE ONLY, no career changed (see
  // the header's entry 30 for the strip proof against the value above).
  //
  // ENTRY 31 (T-196a): re-derived — the second and last row M17's arm 1 moves, for the
  // reason spelled out at `explorer` above (this policy also queues an `Explore`, and
  // `Explore` is the verb that reads the rest of the hand at resolve time). No line of
  // `smugglerPolicy` changed. MEASURED over these five seeds × 40 days, before ->
  // after: final credits, summed 57,498 -> 51,950; deeds, summed 126 -> 120;
  // fuel-starvation days 0 -> 0. Credits fall here where `explorer`'s rise — the two
  // directions are re-phasing on a five-seed sample, not a trend; the 8,000-row
  // capstone puts both rows within a percent or two of their previous medians.
  //
  // ENTRY 32 (T-196b): re-derived — and again the cause moves INSIDE the policy:
  // its two yard-tier branches, its drive repair, its stranded refit and its
  // sign→travel pair all stopped taking a die, and a new `yardCommitted` running
  // total threads that spend into the refuel, the repair, the overhead, the Explore
  // floor and the marker payment so one day's credits cannot fund five purchases.
  // Its Explore loop also carries F-196b-1's per-sweep credit charge — the finding
  // this task's own capstone gate caught and closed (TASKS.md), without which the
  // policy grew a zero-income tail it has never had. Credits over the five seeds
  // RISE 51,950 -> 67,246 and deeds fall 120 -> 115: a policy that stops sweeping
  // its purse into the fuel pump keeps more of it. No constant was touched.
  // ENTRY 33 (T-197): re-derived — one of only TWO rows that move. `smugglerPolicy`
  // calls `planLoanBorrow` / `planLoanRepay`, both of which lost their `DieLedger`
  // (docs/DAWN-HAND-REDESIGN.md §3: the desk is free, and outside both daily caps —
  // the single-active-loan slot and the player's credits were always its real
  // bounds). On the days it does visit the desk the die it used to surrender is now
  // left in the hand for the rest of the day's plan, and the career re-phases from
  // there. A SMALL move, and honestly so: credits 67,246 -> 67,190 over the five
  // seeds, deeds unchanged at 115. The tables are untouched on this row — the
  // smuggler never opens a Dare.
  // ENTRY 35 (T-168): re-derived — REPORT SHAPE ONLY, no career changed (see
  // the header's entry 35 for the strip proof against the value above).
  // ENTRY 36 (T-175): re-derived — REPORT SHAPE ONLY, no career changed (see
  // the header's entry 36 for the strip proof against the value above).
  // ENTRY 38 (T-176): re-derived — REPORT SHAPE ONLY, no career changed (see
  // the header's entry 38 for the strip proof against the value above).
  smuggler: 'c688e3bfe233858f',
  // Entry 17: re-derived — the tables are open on most docked days now, not only
  // when the route passes Sol-3. Entry 18: re-derived again — three of the
  // fourteen ports now deal in their OWN wager band, so the stake this policy puts
  // down (and every hand after it) re-phases. The only row entry 18 moves.
  // Entry 19: re-derived a third time — five more authored bands, two of them
  // reaching 3,000, so the stakes move much further than pass 1's did.
  // Entry 20: re-derived a FOURTH time — the last four authored bands close the
  // table at fourteen, so every port this policy deals at now has a band of its
  // own and there is no default-band port left for a stake to inherit. The only
  // row entry 20 moves, and the only row it CAN move: pass 3 withdraws no credit
  // desk, so nothing reaches the lending policies at all.
  // Entry 23: re-derived a FIFTH time, and the only row entry 23 moves for a
  // reason of its own — the Dare is now a Liar's Dice hand the runner plays out.
  // Entry 24 (T-145): re-derived a SIXTH time, and again the only row that moves,
  // for a reason of its own. `planDare`'s candidate set now spans BOTH pools — the
  // in-system roaming captains AND the port's three fixed roster opponents
  // (docs/LIARS-DICE-PROGRESSION_SPEC.md §8 row 38), because without it no sweep
  // row and no deed-coverage career would ever play a roster hand and the whole
  // milestone would be unmeasured. The SELECTION RULE is unchanged (richest,
  // first-wins on a tie, roaming considered first so a tie still goes to a
  // captain), but the roster's authored bankrolls are 3-8x a port's wager ceiling,
  // so at most ports a roster seat is now the richest counterparty and the policy
  // deals there instead. That re-phases every hand this policy plays. Measured
  // over 300 days on seed 1: 446 dares, 186 of them against pool A for +199,617 cr
  // — inside §2.6's 280,800 cr lifetime roster cap, as the zero-sum rule requires.
  // Nothing was widened to make this pass; the input to the fingerprint changed.
  //
  // Entry 25 (T-146): re-derived a SEVENTH time, and once more the ONLY row that
  // moves — `planDare` is still called by `gamblerPolicy` and by nothing else, so
  // no other policy has ever sat at a table and none of them can feel the ladder.
  //
  // THE CAUSE, STATED BEFORE THE NUMBER, because a re-pin without one is exactly
  // the thing the standing constraint forbids: `player.liarsDiceGamesPlayed` now
  // increments at every settled hand and drives a five-rung unlock ladder
  // (`docs/LIARS-DICE-PROGRESSION_SPEC.md` §4). The gambler plays 49-70 hands per
  // seed over 40 days, so EVERY fingerprint seed crosses rungs 1 (5 games, 5 dice
  // a side), 2 (10, 6 dice — the hard cap), 3 (20, "Read the Table", one optional
  // string on one event) and 4 (40, the wager ceiling x3). Rung 5 (80) is not
  // reached at this length. Three of those four change what actually happens at
  // the table, so every hand from the sixth on re-phases.
  //
  // THE REWIRE ITSELF WAS PROVED INERT FIRST, which is what separates a rule
  // change from a regression. With the tier pinned at 0 and every call site
  // already moved off its constant and onto the hand's frozen field, this exact
  // fingerprint came back as `f08a7285a5a7179f` — the pre-T-146 value, byte for
  // byte — along with all four day-loop golden hashes and the whole battery. Only
  // then was the tier switched on. The N3 `combatRules.ts` extract-before-add
  // discipline, and the reason this entry can name a cause rather than a guess.
  //
  // MEASURED across these exact five seeds x 40 days, tier pinned vs. ladder live:
  //     hands      299  ->  284
  //     won        247  ->  229      (82.6% -> 80.6%)
  //     wagered  139,868 -> 108,440
  //     net      109,380 ->  61,134  (EV/hand 366 -> 215)
  //     dareGuardHits  0 ->  0       (on every row, at six dice as at four)
  // The win rate and EV FELL, which is the honest direction and worth recording:
  // the baseline opener claims `(own(F*), F*)` — dice it actually holds, so the
  // claim is true by construction — and a bigger hand makes that opening claim a
  // smaller share of the dice in play, so the dealer believes it less often and the
  // free wins F-135-1 named get rarer. NOTHING WAS TUNED IN RESPONSE. T-148 owns
  // the ladder-pacing read; §1.3 forbids retuning a spec constant to reproduce an
  // old figure, and no constant was touched.
  //
  // Entry 26 (T-150): re-derived an EIGHTH time, and once more the only row that
  // moves for a reason of its own — F-123-3's roaming-dealer stake carry-forward.
  // `planDare` is still called by `gamblerPolicy` alone, so no other policy can
  // feel it. The second hand of a day is no longer planned against a dealer the
  // first hand would have drained below the port's floor.
  // Entry 27 (T-156): re-derived — the NPC virtual hand (see the header).
  // Entry 28 (T-160): re-derived a NINTH time, and once again the ONLY row that
  // moves — the opening floor is reachable only through a hand only `planDare`
  // opens (see the header).
  // Entry 29 (T-199): UNCHANGED IN THIS WINDOW, not unaffected — `gamblerPolicy`
  // calls the changed `planPacifistCombat` and was PREDICTED to move; it did not,
  // because it never met that planner's unaffordable-tribute branch inside seeds
  // 1..5 x 40 days. A wider window would be expected to move it.
  // Entry 30 (T-173): re-derived — REPORT SHAPE ONLY, no career changed (see
  // the header's entry 30 for the strip proof against the value above).
  // ENTRY 32 (T-196b): re-derived, and for once NOT for a `planDare` reason — the
  // gambler's sign→travel pair lost its sign die and its refuel/repair/overhead
  // planners lost theirs, exactly like every other row. The tables are untouched by
  // this task (Hangout is T-197's). Credits 142,830 -> 109,312 over the five seeds.
  // ENTRY 33 (T-197): re-derived, and back to being a `planDare` reason after entry
  // 32's detour. THREE things changed for this row at once and they pull in
  // opposite directions, which is why the note names all three rather than the net:
  //   (a) the open is FREE — `planDare` no longer takes the BEST die off the
  //       ledger, so the sharpest die stays available to the rest of the day;
  //   (b) §4b's ROUNDS CAP now bounds the tables, and at tier 0 it is ONE open per
  //       day against `GAMBLER_MAX_DARES_PER_DAY = 2` — so early days lose a hand;
  //   (c) the loop bound carries the day's allowance forward, so the second hand is
  //       never planned into a refusal (`failedVisits` stays 0).
  // Credits over these five seeds RISE, 109,312 -> 127,628, and deeds 90 -> 93 —
  // the freed die outweighs the early-tier round the cap takes away. NOTHING WAS
  // TUNED IN RESPONSE: `LIARS_DICE_ROUNDS_PER_DAY` is content, it ships at §4b's
  // suggested shape, and the capstone (not this fingerprint) is where its effect is
  // judged.
  // ENTRY 34 (T-208): re-derived — the LOUDER of the two rows, and the only one
  // whose cause is channel (a). Five quest captains moved onto core ports the
  // gambler plays at, and `resolveVisitHangout` seats a co-located NPC as the Dare
  // dealer without asking whether they are simulated — so there are simply more
  // tables. `hangoutPlay.visits` 281 -> 301, credits 127,628 -> 147,288, deeds
  // UNCHANGED at 93 (the extra hands pay, they do not unlock anything new).
  // ENTRY 35 (T-168): re-derived, and THE ONE REAL MOVE in this entry —
  // `planDare` sizes its stake off the EFFECTIVE band, so 64 of these 299 hands now
  // seat above the port's tier-0 ceiling (structurally 0 before, F-148-4). Its
  // stripped hash is b88a50aa25a4a918, still not the entry-34 value, which is what
  // separates it from the six shape-only rows. See the header's entry 35.
  // ENTRY 36 (T-175): re-derived — REPORT SHAPE ONLY, no career changed (see
  // the header's entry 36 for the strip proof against the value above).
  // ENTRY 37 (T-175): re-derived — THE ONE REAL MOVE. `optimal` reads the standing
  // claim instead of ignoring it, so the only policy that sits at a table plays a
  // different game (see the header's entry 37 for the six-figure before/after).
  // ENTRY 38 (T-176): re-derived — REPORT SHAPE ONLY, no career changed (see
  // the header's entry 38 for the strip proof against the value above).
  gambler: 'e840f8e26945ebc2',
  // Entry 27 (T-156): re-derived — the NPC virtual hand (see the header).
  // Entry 30 (T-173): re-derived — REPORT SHAPE ONLY, no career changed (see
  // the header's entry 30 for the strip proof against the value above).
  // ENTRY 32 (T-196b): UNCHANGED, and deliberately the control — see the header's
  // entry 32. `greedyTraderPolicy`'s only edit deletes a dead `spendDie: 0` that
  // zod already stripped, so its careers are bit-for-bit what they were.
  // ENTRY 34 (T-208): re-derived, AND IT IS NO LONGER THE CONTROL — for the first
  // time in this table the greedy row moves, on ONE of its five seeds, through the
  // bond hook rather than through anything it does itself. See the header's entry
  // 34 for the day-7 / 50-fuel isolation that pins the cause to Doc Salvage's move
  // off Antares-5. Credits 7,280 -> 7,640, deeds 36 -> 37.
  // ENTRY 35 (T-168): re-derived — REPORT SHAPE ONLY, and the control row is BACK
  // to being a control: it never sits at a table, so channel (b) cannot reach it
  // (see the header's entry 35 for the strip proof against the value above).
  // ENTRY 36 (T-175): re-derived — REPORT SHAPE ONLY, no career changed (see
  // the header's entry 36 for the strip proof against the value above).
  // ENTRY 38 (T-176): re-derived — REPORT SHAPE ONLY, no career changed (see
  // the header's entry 38 for the strip proof against the value above).
  greedy: 'c986ffbfee89b86f',
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
