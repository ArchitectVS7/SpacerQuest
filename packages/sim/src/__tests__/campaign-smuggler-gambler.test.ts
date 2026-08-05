import { beforeAll, describe, expect, it } from 'vitest';
// T-197 · the unlock thresholds are CONTENT; the fixture reads them rather than
// restating a rung number (docs/DAWN-HAND-REDESIGN.md §4b).
import { LIARS_DICE_UNLOCK_GAMES } from '@spacerquest/content';
import {
  DARE_MAX_MOVES_PER_HAND,
  gamblerPolicy,
  parseCliArgs,
  planDareMove,
  reportToJson,
  resolvePolicy,
  runCampaign,
  smugglerPolicy,
  type CampaignStatsReport,
  type SimPolicyName,
} from '../index.js';
import {
  applyPlayerAction,
  createInitialState,
  endDay,
  isLatticeMove,
  legalDareMoves,
  minOpeningQuantity,
  SeededRng,
  startDay,
  wagerBandFor,
  type GameState,
} from '@spacerquest/engine';
import { driveCompetentCampaign, longestZeroIncomeStreak } from './support/campaign-drivers.js';

/** T-135 · A state carrying an OPEN Liar's Dice hand, produced by the REAL open
 *  arm through `startDay` → `applyPlayerAction`. Never by assigning `dareHand`:
 *  the point of the totality test is what a planner meets in play. */
function openGamblerHand(seed: number): GameState {
  const fresh = createInitialState(seed);
  fresh.player.credits = 20_000;
  for (const npc of fresh.npcs) {
    if (npc.currentSystemId === fresh.player.currentSystemId) npc.credits = 20_000;
  }
  const state = startDay(fresh).state;
  const dealer = state.npcs.find(
    (npc) => !npc.dead && npc.currentSystemId === state.player.currentSystemId,
  );
  if (!dealer) throw new Error('fixture: no co-located dealer at the starting port');
  const opened = applyPlayerAction(state, {
    type: 'VisitHangout',
    venue: 'dare',
    opponentId: dealer.id,
    wager: 100,
  }).state;
  if (!opened.dareHand) throw new Error('fixture: the hand did not open');
  return opened;
}

// ---------------------------------------------------------------------------
// T-1601b · The two NET-NEW balance instruments: the SMUGGLER (contraband
// supply → patrol GUILE scans → Smuggler Ray's fence, PRD §7.2/§7.5) and the
// GAMBLER (the Spacers Hangout tables, Spacer's Dare, PRD §6/§7.5). Both pillars
// shipped complete in the engine and content long before this task; neither had
// ever been PLAYED by a policy, so no report could say what a scan costs or what
// the tables pay.
//
// Sibling spec of campaign-policies.test.ts (which keeps the T-201 three) so
// vitest's fork pool runs them in parallel. `COMPETENT_POLICIES` there is
// deliberately untouched.
//
// SWEEP PROVENANCE (2026-07-26). Seeds 1..20 × 300 days were run in `.scratch/`
// for BOTH policies (scripts not committed, per the task-sizing rule):
//   * SMUGGLER — 19 of 20 careers produce at least one patrol scan (seed 20 is
//     the sole exception: it strands early on a rim leg and finishes on 2
//     credits). 20 of 20 sign at least one contraband contract, take pods, and
//     deal with Ray at least once. 18 of 20 clear the Guild marker and finish
//     between 50,000 and 180,000 credits. Worst zero-income streak across the
//     whole sweep: 4 (bar is 5).
//   * GAMBLER — 20 of 20 careers play the tables (36-76 dares over 300 days),
//     every one of them with a NONZERO expected value per dare and ZERO failed
//     visits. 19 of 20 clear the marker. Worst zero-income streak: 5, on seed 19
//     alone, and it is NOT a Hangout problem — it is five consecutive days of a
//     failed `run` stance against one interceptor in the SHARED `planPacifistCombat`
//     the trader and explorer also use (a 'run' is not an income action). Recorded
//     honestly here rather than papered over; the swept seeds this file pins and
//     asserts on are well clear of it.
// Seed 1 is representative for both and is pinned for both — it was NOT chosen
// to dodge anything, and the numbers quoted in each assertion's comment are the
// MEASURED values on it, not hoped-for ones.
//
// Driven ONCE per policy and shared: a 300-day campaign is ~10s and the report is
// a pure function of (seed, days, policy).
// ---------------------------------------------------------------------------

const NEW_POLICIES = ['smuggler', 'gambler'] as const satisfies readonly SimPolicyName[];

const REPORT_SEED = 1;
const REPORT_DAYS = 300;
/** T-196b · The smuggler's own pinned seed for the CONTRABAND-ENFORCEMENT metrics,
 *  mirroring `campaign-policies.test.ts`'s `FIGHTER_METRIC_SEED`. Everything else
 *  in this file still runs on `REPORT_SEED`. PINNED NOT STEERED — no assertion in
 *  the test that uses it was altered.
 *
 *  MECHANISM: the eight policies stopped budgeting a die for the nine M17 Free
 *  Actions (docs/DAWN-HAND-REDESIGN.md §3), so the smuggler's day plan changed
 *  shape and with it the route it flies. On seed 1 it now runs its contraband
 *  CLEAN — 4 signed and 4 delivered, but `scans` 9 -> 0, so the enforcement half
 *  of the acceptance has nothing to observe. A patrol scan is a per-jump roll
 *  against a dirty hold, and this career's dirty stretch fell from 151 days to 22.
 *
 *  RE-SWEEP (seeds 1..20, `runCampaign(seed, 300, 'smuggler')`): NINETEEN of the
 *  twenty land every signal this test asserts — seed 1 is the sole exception, and
 *  the scan pipeline is therefore more reachable after M17, not less. Seed 2 is the
 *  first qualifier and is what the comments below quote: 3 contraband contracts
 *  signed, 2 delivered, 12 pods taken, 126 dirty days, 6 scans (4 caught / 2
 *  evaded), 2,000 credits in fines, 4 pods seized, 1 fence sale, 259 rep days. */
const SMUGGLER_ENFORCEMENT_SEED = 2;
const REPORTS = new Map<string, CampaignStatsReport>();
const reportFor = (policy: (typeof NEW_POLICIES)[number], seed = REPORT_SEED) =>
  REPORTS.get(`${policy}:${seed}`)!;

beforeAll(() => {
  for (const policy of NEW_POLICIES) {
    REPORTS.set(`${policy}:${REPORT_SEED}`, runCampaign(REPORT_SEED, REPORT_DAYS, policy));
  }
  REPORTS.set(
    `smuggler:${SMUGGLER_ENFORCEMENT_SEED}`,
    runCampaign(SMUGGLER_ENFORCEMENT_SEED, REPORT_DAYS, 'smuggler'),
  );
}, 150000);

describe('T-1601b smuggler & gambler policies', () => {
  it('both new policies are wired into resolvePolicy and the CLI', () => {
    // GUARDS A SILENT FAILURE: `resolvePolicy` falls through to
    // `randomLegalActionPolicy` for any name it does not recognise, so a missing
    // branch would not throw — it would quietly run the random policy and report
    // zeros for every metric below.
    const smuggler = resolvePolicy('smuggler');
    expect(smuggler.policy).toBe(smugglerPolicy);
    expect(smuggler.name).toBe('smuggler');
    expect(smuggler.dawnBlind).toBe(false);

    const gambler = resolvePolicy('gambler');
    expect(gambler.policy).toBe(gamblerPolicy);
    expect(gambler.name).toBe('gambler');
    expect(gambler.dawnBlind).toBe(false);

    // And a player can actually ASK for them: `npm run sim -- --policy smuggler`.
    expect(parseCliArgs(['--policy', 'smuggler']).policy).toBe('smuggler');
    expect(parseCliArgs(['--policy', 'gambler']).policy).toBe('gambler');
  });

  it('each new policy is deterministic given a seed (byte-identical reruns)', () => {
    for (const policy of NEW_POLICIES) {
      const first = reportToJson(runCampaign(3, 120, policy));
      const second = reportToJson(runCampaign(3, 120, policy));
      expect(second).toBe(first);
    }
  }, 60000);

  it.each(NEW_POLICIES)(
    '%s renders a fully-populated 300-day stats report without crashing',
    (policy) => {
      const report = reportFor(policy);

      expect(report.policy).toBe(policy);
      expect(report.days).toBe(300);
      expect(report.creditsCurve).toHaveLength(300);
      expect(report.daily).toHaveLength(300);
      expect(typeof report.wireVolume).toBe('number');
      expect(Number.isFinite(report.flawOverrideRate)).toBe(true);
      expect(typeof report.fuelStarvationDays).toBe('number');
      expect(typeof report.deedCount).toBe('number');
      expect(Array.isArray(report.deedsEarned)).toBe(true);
      expect(typeof report.renownRank).toBe('string');
      expect(report.routeDiversity).toHaveLength(3);
      for (const window of report.routeDiversity) {
        expect(window.sampleCount).toBeGreaterThan(0);
      }
      expect(typeof report.finalState.day).toBe('number');
      expect(typeof report.finalState.credits).toBe('number');
      expect(typeof report.finalState.debt).toBe('number');
      expect(typeof report.finalState.fuel).toBe('number');
      expect(typeof report.finalState.systemId).toBe('number');
      expect(report.daily.filter((day) => day.fuelStarved).length).toBe(report.fuelStarvationDays);

      // The T-1601a blocks still render on the new policies...
      expect(typeof report.loanUsage.loansTaken).toBe('number');
      expect(typeof report.fragments.acquired).toBe('number');
      expect(typeof report.equipmentUse.componentTiersBought).toBe('number');

      // ...and so do the two T-1601b blocks. Derived report fields, not
      // GameState: no save migration is involved, and their JSON survival rides
      // the byte-identical `reportToJson` determinism test above.
      for (const value of Object.values(report.smuggling)) {
        expect(typeof value).toBe('number');
      }
      for (const value of Object.values(report.hangoutPlay)) {
        expect(typeof value).toBe('number');
      }
      expect(Number.isFinite(report.hangoutPlay.expectedValuePerDare)).toBe(true);

      // Poverty-trap invariant on this real 300-day trajectory.
      expect(longestZeroIncomeStreak(report.daily)).toBeLessThan(5);
    },
    60000,
  );

  it('the smuggler runs contraband, gets scanned by patrols, and deals with Ray', () => {
    // T-196b: on `SMUGGLER_ENFORCEMENT_SEED`, not `REPORT_SEED` — see that
    // constant for the re-pin's mechanism and its seeds 1..20 re-sweep.
    const report = reportFor('smuggler', SMUGGLER_ENFORCEMENT_SEED);
    const smuggling = report.smuggling;

    // SUPPLY. Both of the pillar's sources are live: contraband CONTRACTS (only a
    // port with `allowsContraband` issues cargo type 10, so this also proves the
    // policy actually reaches the rim) and sealed PODS off Explore loot. Measured
    // on seed 2: 3 contraband contracts signed, 2 delivered, 12 pods taken.
    expect(smuggling.contrabandContractsSigned).toBeGreaterThan(0);
    expect(smuggling.podsTaken).toBeGreaterThan(0);
    expect(smuggling.contrabandDelivered).toBeGreaterThanOrEqual(0);
    // ...and the hold is dirty for a large part of the career, which is the
    // exposure the scan rolls against. Measured on seed 2: 126 of 300 days.
    expect(smuggling.daysCarryingIllicit).toBeGreaterThan(0);

    // ENFORCEMENT — THE ACCEPTANCE'S "scan outcomes nonzero" (PRD §7.2).
    // Measured on seed 2: 6 scans, 4 caught, 2 evaded.
    expect(smuggling.scans).toBeGreaterThan(0);
    expect(smuggling.scansCaught + smuggling.scansEvaded).toBe(smuggling.scans);
    expect(smuggling.scansCaught).toBeGreaterThan(0);

    // A CATCH IS REALLY CONSUMED, not merely counted: every caught scan levies a
    // fine and confiscates at least one of the two illicit sources (guaranteed,
    // because `isCarryingIllicit` is what gated the scan in the first place).
    // Measured on seed 2: 2,000 credits in fines, 4 pods seized.
    expect(smuggling.finesPaid).toBeGreaterThan(0);
    expect(smuggling.contractsConfiscated + smuggling.podsConfiscated).toBeGreaterThanOrEqual(
      smuggling.scansCaught,
    );

    // THE FENCE FLOW (PRD §7.5's third out). Both `fence.ray.*` storylets are
    // `repeat: 'never'`, so 2 is the content-imposed maximum. Measured on seed 2:
    // 1 sale — and the rep flag it sets is READ by the scan DC
    // (CONTRABAND_FENCE_REP_SCAN_PENALTY) for the rest of the career, which is
    // what `fenceRepDays` measures. Measured on seed 2: 259 of 300 days.
    expect(smuggling.fenceSales).toBeGreaterThan(0);
    expect(smuggling.fenceRepDays).toBeGreaterThan(0);
  }, 60000);

  it('the gambler plays the Hangout tables with a nonzero expected value', () => {
    const report = reportFor('gambler');
    const play = report.hangoutPlay;

    // Measured on seed 1: 44 dares over 300 days, 22 won and 22 lost, 21,063
    // credits staked, 109 credits net.
    expect(play.dares).toBeGreaterThan(0);
    expect(play.daresWon + play.daresLost).toBe(play.dares);
    expect(play.wagered).toBeGreaterThan(0);
    expect(play.visits).toBeGreaterThanOrEqual(play.dares + play.socialBeats);

    // THE ACCEPTANCE METRIC. Measured on seed 1: +2.48 credits per dare.
    expect(Number.isFinite(play.expectedValuePerDare)).toBe(true);
    expect(play.expectedValuePerDare).not.toBe(0);
    expect(play.expectedValuePerDare * play.dares).toBeCloseTo(play.netCredits, 6);

    // PROOF THE POLICY'S GUARDS ARE THE ENGINE'S GUARDS: `planDare` mirrors
    // `resolveVisitHangout` plus day.ts's hangout/encounter gates (a `hasHangout`
    // system, a co-located dealer, a die in hand, a purse above the reserve), so
    // it never burns a die on a typed refusal — no 'no-opponent', no 'no-hangout',
    // no spent-die fail, over 300 days of play.
    expect(play.failedVisits).toBe(0);

    // T-135 · THE SAME PROOF, NOW STRONGER. A `Dare` move outside the lattice is
    // refused with `HangoutEvent{failReason:'illegal-dare-move'}` and lands in
    // `failedVisits` too, so the zero above is now also the proof that
    // `planDareMove` mirrors the engine's `legalDareMoves` rather than restating
    // §5.1's arithmetic.
    //
    // AND THE TRIPWIRE IS UNTRIPPED. §12.4 proves the continuation loop's
    // `DARE_MAX_MOVES_PER_HAND` bound unreachable (the bid lattice caps a hand at
    // ~15 player actions), which is precisely why a non-zero count here is a bug
    // to fail on rather than a number to swallow.
    expect(play.dareGuardHits).toBe(0);
  }, 60000);

  it('T-135 · the gambler plays every hand to completion — no dusk timeout folds', () => {
    // THE REAL PROOF that the runner's continuation loop works. A `timeout-fold`
    // means the day ended with a hand still open: the policy planned an opening
    // `VisitHangout{venue:'dare'}` from the dawn state and then never answered the
    // dealer, so `endDay` forfeited the seed. Before the loop existed that was
    // EVERY hand, and the measured EV would have been "the gambler folds every
    // time" — a measurement of nothing.
    for (let seed = 1; seed <= 3; seed += 1) {
      const report = runCampaign(seed, 120, 'gambler');
      const play = report.hangoutPlay;
      expect(play.dares).toBeGreaterThan(0);
      expect(play.failedVisits).toBe(0);
      expect(play.dareGuardHits).toBe(0);
      // `daresWon + daresLost === dares` holds only if every hand SETTLED.
      expect(play.daresWon + play.daresLost).toBe(play.dares);
    }
  }, 120000);

  it('T-135 · planDareMove is TOTAL over the scene’s reachable states (§12.4)', () => {
    // (a) no hand → null; the loop's condition is already false.
    expect(planDareMove(createInitialState(1))).toBeNull();

    const state = openGamblerHand(1);
    // (b) a hand with NO bid: an opening bid is always legal — any held face is in
    // 1..6, T-160's floor `own(F*) + 1` is in `1..dicePerSide + 1` ⊆ `1..2 ×
    // dicePerSide` = `1..maxQuantity`, and an opening bid costs no ante, so
    // neither headroom nor credits can refuse it.
    const opening = planDareMove(state);
    expect(opening).not.toBeNull();
    expect(opening).toMatchObject({ type: 'Dare', move: 'bid' });
    expect(legalDareMoves(state.dareHand!, 'player', state.player.credits)).toContain(
      (opening as { move: string }).move,
    );
    // T-160 · …and it EXCEEDS what the player holds by exactly one, which is the
    // engine's opening floor and the fix for F-137-1. The old assertion here read
    // "it is TRUTHFUL: the claim is exactly what the player holds" — that WAS the
    // defect (`resolveChallenge` counts the face across all the dice in play, so a
    // claim at or under `own(face)` could not be false), and it is now refused by
    // `isLatticeMove`. The planner still makes the SMALLEST claim the lattice
    // permits; it is not bluffing.
    const face = (opening as { face: number }).face;
    const quantity = (opening as { quantity: number }).quantity;
    const own = state.dareHand!.playerDice.filter((d) => d === face).length;
    expect(quantity).toBe(minOpeningQuantity(own));
    expect(quantity).toBeGreaterThan(own);
    expect(quantity).toBeLessThanOrEqual(state.dareHand!.maxQuantity);
    // And the claim is a REAL claim: it is not true by construction any more.
    expect(
      isLatticeMove(null, 'bid', own, face, state.dareHand!.maxQuantity, own),
      'a claim of exactly what the player holds is now refused at its source',
    ).toBe(false);

    // (c) a hand with a standing bid, at the LATTICE CEILING and with ZERO
    // headroom — the tightest reachable corner, where every raise is illegal.
    const cornered: GameState = {
      ...state,
      player: { ...state.player, credits: 0 },
      dareHand: {
        ...state.dareHand!,
        bid: { quantity: 8, face: 6 },
        bidder: 'dealer',
        potPlayer: wagerBandFor(state.dareHand!.systemId).max,
      },
    };
    const cornerMove = planDareMove(cornered);
    expect(cornerMove).not.toBeNull();
    const legal = legalDareMoves(cornered.dareHand!, 'player', cornered.player.credits);
    expect(legal).toEqual(['challenge', 'fold']);
    expect(legal).toContain((cornerMove as { move: string }).move);

    // …and the whole hand plays out through the REAL loop, driven only by the
    // planner, reaching a settlement rather than a dusk forfeit.
    let live = state;
    let guard = 0;
    while (live.dareHand && guard < DARE_MAX_MOVES_PER_HAND) {
      guard += 1;
      const move = planDareMove(live)!;
      expect(move).not.toBeNull();
      const step = applyPlayerAction(live, move);
      // A planner that mirrors the engine never earns a typed refusal.
      expect(step.events.some((e) => e.type === 'HangoutEvent' && e.failReason)).toBe(false);
      live = step.state;
    }
    expect(live.dareHand).toBeNull();
    expect(guard).toBeLessThan(DARE_MAX_MOVES_PER_HAND);
  });

  it('neither new policy triggers a poverty trap across a seed sweep', () => {
    // The same three-seed-per-policy sweep the T-201 policies are held to. Both
    // policies took REAL fixes to get here rather than a seed re-anchoring: the
    // smuggler drops its Explore credit floor on a day whose board offered nothing
    // both fundable and navigable (it was idling at rim ports with a full tank),
    // and the gambler heads for the nearest Hangout when the board is empty
    // (Travel is itself an income action). See the policy comments in index.ts for
    // the measurements behind each.
    for (const policy of NEW_POLICIES) {
      for (let seed = 1; seed <= 3; seed += 1) {
        const report = runCampaign(seed, 120, policy);
        expect(longestZeroIncomeStreak(report.daily)).toBeLessThan(5);
      }
    }
  }, 120000);

  it('both new policies end a real 120-day career solvent, not merely instrumented', () => {
    // Report-shaped assertions can be satisfied by a policy that limps; these read
    // the actual end STATE off the headless driver. Measured on seed 1 at 120
    // days: smuggler 17,880 credits, gambler 90,263 — both with the Guild marker
    // cleared.
    const smuggler = driveCompetentCampaign(smugglerPolicy, 1, 120);
    expect(smuggler.player.credits).toBeGreaterThan(0);
    expect(smuggler.player.debt).toBe(0);

    const gambler = driveCompetentCampaign(gamblerPolicy, 1, 120);
    expect(gambler.player.credits).toBeGreaterThan(0);
    expect(gambler.player.debt).toBe(0);
  }, 60000);
});

// ---------------------------------------------------------------------------
// T-150 · F-123-3 — THE DEALER'S PURSE IS CARRIED FORWARD ACROSS THE DAY'S HANDS.
//
// APPLICABILITY WAS CHECKED, NOT ASSUMED. M4d/M4e replaced the HAND (the single
// opposed-GUILE check became the full Liar's Dice bid/raise/challenge resolver);
// they did not touch the DEALER PICK, which still runs once off the dawn state.
// T-145 fixed the ROSTER half (a broke roster seat is a hard 'opponent-broke'
// refusal) and deliberately left the ROAMING half, where the engine merely clamps
// the seed to the dealer's purse — so `planDare`'s own parameter doc and
// `docs/LIARS-DICE_REDESIGN.md` §16 both record the roaming case as surviving the
// redesign. It does. T-150 threads the queued stake through the roaming pick.
//
// `planDare` is module-private, so both arms go through the exported policy.
// ---------------------------------------------------------------------------

/** A dawn state at the starting Hangout port with EXACTLY ONE fundable roaming
 *  seat, every roster purse at that port zeroed, and the player's bankroll sized
 *  so the wager lands on the port's `band.min` — which makes the dealer's purse
 *  the only thing that can decide whether a second hand is planned. */
function oneRoamingDealerDawn(seed: number, dealerCredits: number): GameState {
  const fresh = createInitialState(seed);
  const port = fresh.player.currentSystemId;
  // T-197 · THE CAPTAIN IS SEATED AT UNLOCK TIER 1, AND THAT IS LOAD-BEARING RATHER
  // THAN COSMETIC (docs/DAWN-HAND-REDESIGN.md §4b). The rounds-per-day cap allows a
  // TIER-0 captain exactly ONE open, so on a fresh career the cap — not the
  // dealer's purse — would be what stops the second hand. The starved arm below
  // would then pass for the wrong reason and the rich CONTROL could never reach two
  // hands at all, making the whole test vacuous. One rung up (`gamesPlayed >=
  // LIARS_DICE_UNLOCK_GAMES[0]`) buys two rounds, which restores the purse rule as
  // the only binding constraint — which is exactly what this fixture's docstring
  // has always claimed. The threshold is READ from content, never restated.
  fresh.player.liarsDiceGamesPlayed = LIARS_DICE_UNLOCK_GAMES[0];
  // bankroll = credits − GAMBLER_RESERVE (3,000); wager = max(band.min,
  // min(band.max, ⌊bankroll × 0.1⌋)). At 3,200 credits that is ⌊20⌋ → clamped up
  // to band.min, and the purse still funds a SECOND hand — so the player's side
  // is never the binding constraint in either arm.
  fresh.player.credits = 3_200;
  fresh.player.ship.fuel = fresh.player.ship.maxFuel;
  let seated = false;
  for (const npc of fresh.npcs) {
    if (npc.dead || npc.currentSystemId !== port) continue;
    if (!seated) {
      npc.credits = dealerCredits;
      seated = true;
    } else {
      npc.credits = 0;
    }
  }
  if (!seated) throw new Error('fixture: no co-located roaming captain at the starting port');
  // Pool A out of the picture — a roster seat out-banking the field would take the
  // chair and the arms would measure the wrong pool.
  for (const id of Object.keys(fresh.liarsDicePurses)) fresh.liarsDicePurses[id] = 0;
  return startDay(fresh).state;
}

const dareActions = (plan: readonly { type: string }[]) =>
  plan.filter(
    (a): a is { type: 'VisitHangout'; venue: string; opponentId?: string; wager?: number } =>
      a.type === 'VisitHangout' && (a as { venue?: string }).venue === 'dare',
  );

describe('T-150 · F-123-3 · the gambler never queues a hand its dealer cannot cover', () => {
  it('stops at one hand when the first stake would drain the only dealer below the port floor', () => {
    for (let seed = 1; seed <= 3; seed += 1) {
      const band = wagerBandFor(createInitialState(seed).player.currentSystemId);

      // THE F-123-3 SCENARIO. The sole dealer can cover ONE minimum stake and no
      // more: `band.min <= credits < 2 × band.min`. Before the fix the dawn read
      // said "richer than band.min" twice and the second hand was clamped by the
      // engine to a sub-floor (or zero) stake.
      const starved = oneRoamingDealerDawn(seed, band.min + Math.floor(band.min * 0.6));
      const starvedPlan = gamblerPolicy({
        state: starved,
        dayIndex: 0,
        rng: new SeededRng(seed).fork('policy').fork(`day-${starved.day}`).fork('index-0'),
      });
      const starvedDares = dareActions(starvedPlan);
      expect(starvedDares).toHaveLength(1);
      expect(starvedDares[0].wager).toBeGreaterThanOrEqual(band.min);

      // THE NON-VACUOUS CONTROL. Identical state, the same dealer made rich: TWO
      // hands. This is what proves the arm above is measuring the purse rule and
      // not some unrelated refusal (no die left, no venue, no bankroll).
      const rich = oneRoamingDealerDawn(seed, 500_000);
      const richPlan = gamblerPolicy({
        state: rich,
        dayIndex: 0,
        rng: new SeededRng(seed).fork('policy').fork(`day-${rich.day}`).fork('index-0'),
      });
      expect(dareActions(richPlan)).toHaveLength(2);
    }
  }, 30000);

  it('holds at campaign scale: every queued dare clears its port floor', () => {
    // The PROPERTY, over real careers. `wager` is what the policy ASKS for; the
    // engine re-clamps it against both purses, so this asserts the ask is never
    // itself worthless — which is the whole of F-123-3.
    let queued = 0;
    for (let seed = 1; seed <= 5; seed += 1) {
      let state = createInitialState(seed);
      for (let dayIndex = 0; dayIndex < 120; dayIndex += 1) {
        const rng = new SeededRng(seed)
          .fork('policy')
          .fork(`day-${state.day}`)
          .fork(`index-${dayIndex}`);
        const dawn = startDay(state);
        let dayState = dawn.state;
        const actions = gamblerPolicy({ state: dayState, dayIndex, rng });
        const floor = wagerBandFor(dayState.player.currentSystemId).min;
        for (const dare of dareActions(actions)) {
          queued += 1;
          expect(dare.wager ?? 0).toBeGreaterThan(0);
          expect(dare.wager ?? 0).toBeGreaterThanOrEqual(floor);
        }
        for (const action of actions) {
          if (action.type === 'Combat' && !dayState.encounter) continue;
          if (action.type === 'Dare' && !dayState.dareHand) continue;
          dayState = applyPlayerAction(dayState, action).state;
          let dareGuard = 0;
          while (dayState.dareHand && dareGuard < DARE_MAX_MOVES_PER_HAND) {
            dareGuard += 1;
            const move = planDareMove(dayState);
            if (!move) break;
            dayState = applyPlayerAction(dayState, move).state;
          }
        }
        state = endDay(dayState).state;
      }
    }
    // NON-VACUOUS: hands must actually have been queued, or the loop above asserts
    // nothing at all.
    expect(queued).toBeGreaterThan(0);
  }, 180000);
});

// ---------------------------------------------------------------------------
// T-199 · F-150-2 · THE SEEDED REGRESSIONS FOR THE POVERTY TRAP.
//
// These name the exact seeds that went red, so the next person to move a shared
// planner finds out locally instead of from a GitHub Actions run. Seed 20 is the
// one that took the "Sweep gate" check red on `redesign/explore-hangout` for the
// first time (run 30935230550, shard 2/2, `assertNoIncomeStall · smuggler · seed
// 20 · 5 consecutive zero-income days (limit 5)`) — a stall in the SHARED
// `planPacifistCombat`, not in anything the commit that surfaced it had touched.
// Seed 970 is the one that adding the smuggler's Explore recovery guard WOKE, and
// which the shared anti-idle move closes; it is pinned for the same reason.
//
// The horizon is the sweep gate's own (35 days), not 300, because that is the
// window the CI check samples and therefore the window a local run has to match.
// ---------------------------------------------------------------------------
describe('T-199 · the smuggler clears the poverty-trap bar on the seeds that failed', () => {
  it.each([
    [20, 'the CI Sweep-gate failure: five `run` stances against an unaffordable tribute'],
    [970, 'the strand the Explore recovery guard re-seeded onto (F-199-3)'],
  ])('seed %i · %s', (seed) => {
    const report = runCampaign(seed, 35, 'smuggler');
    expect(longestZeroIncomeStreak(report.daily)).toBeLessThan(5);
  });

  it('seed 3 · the case docs/EXPLORE_REDESIGN.md §10.3 names, at its own 120-day horizon', () => {
    // §10.3 recorded a five-day stall here (Sirius-16, days 45-49). It no longer
    // reproduces AT ALL on this tree — T-195's travel-die rules re-seeded every
    // stream long before T-199 touched anything — so this is pinned as a
    // REGRESSION BAR, not as a reproduction: whatever moves next must not put it
    // back.
    const report = runCampaign(3, 120, 'smuggler');
    expect(longestZeroIncomeStreak(report.daily)).toBeLessThan(5);
  });
});

describe('T-199 · F-199-1/F-199-2 · the rim strands the shared anti-idle move closes', () => {
  // Each of these sat at or over the `INCOME_STALL_LIMIT` bar of 5 on the tree
  // before T-199, measured by `balance:sweep --seeds 1000 --days 35` (the map is
  // in TASKS.md). They are pinned by seed so the next shared-planner change has to
  // meet them locally.
  it.each([
    ['trader' as const, 371, 6],
    ['trader' as const, 571, 7],
    ['fighter' as const, 74, 9],
    ['fighter' as const, 747, 26],
    ['fighter' as const, 916, 24],
    ['smuggler' as const, 677, 6],
  ])('%s seed %i (was %i consecutive zero-income days)', (policy, seed, _was) => {
    const report = runCampaign(seed, 35, policy);
    expect(longestZeroIncomeStreak(report.daily)).toBeLessThan(5);
  });
});
