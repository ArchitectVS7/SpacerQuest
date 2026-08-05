// ---------------------------------------------------------------------------
// T-1504 · The deed-hunter policy. Its ONLY consumer is `deed-coverage.test.ts`
// (T-1504d), which carries both play-level acceptances off a single drive:
//   - `it('every authored deed is earned through play …')`  — no deed unearnable;
//   - `it('a long veteran career reaches CONQUEROR …')`      — the capstone rank
//                                                              climbed by playing.
// Both need the same thing: a competent career that ALSO exercises the verbs the
// shipped `veteranPolicy` never touches (gambling, lending, exploration, ports,
// crew, smuggling). It lives here rather than being copy-pasted into both specs.
//
// HONESTY BAR (the project's playtest rule): this is a POLICY, not a script. It
// only ever returns legal `PlayerAction`s that the caller feeds to
// `applyPlayerAction`. It never writes `state.flags`, `state.eraEvent`,
// `player.credits`, `player.registry`, `currentSystemId`, `activeContract`, or
// any other state field — every deed it collects is earned by the engine's own
// deed machinery reacting to real action events.
//
// WHY WRAP `veteranPolicy` RATHER THAN EDIT IT: the shipped veteran is the
// endgame balance instrument and the T-114a pinned-seed reachability proof. A
// 25,000cr port spend or a daily crew wage measurably degrades its documented
// 500-day ASTRAXIAL_HULL climb (see the comments on `portBuyingVeteranPolicy` /
// `crewHiringVeteranPolicy` in campaign-reach.test.ts, which established this
// wrap-don't-edit precedent). So the extra verbs ride ONLY on dice the veteran
// left unspent, and the shipped policy is untouched.
//
// !! THE PINNED SEEDS DEPEND ON THIS FILE, BYTE FOR BYTE !!
// `deed-coverage.test.ts` pins seeds 2 and 3 and quotes measured day numbers
// (CONQUEROR on day 102, the last deed on day 286). Those are a function of the
// exact action stream this policy emits. ANY change that alters which actions
// are returned, in which order, or on which dice invalidates every pin and every
// day number in that file's comments — re-run the `.scratch/` 200-seed hunt and
// re-pin, and say so in the Delivered note. Comment edits and additive exports
// that do not touch the returned actions are safe.
// ---------------------------------------------------------------------------
import {
  CREW_ROLES,
  DARE_MAX_WAGER,
  EXPLORATION_FUEL_COST,
  LOAN_MAX_PRINCIPAL,
  PURCHASABLE_PORTS_BY_SYSTEM,
  STAR_SYSTEMS,
  STORYLETS,
  distance,
  isPurchasablePort,
} from '@spacerquest/content';
import {
  crewCapacity,
  liarsDiceOpponentsAt,
  loanBandFor,
  venueOffered,
  wagerBandFor,
  type GameState,
  type PlayerAction,
} from '@spacerquest/engine';
import type { StoryletDefinition } from '@spacerquest/content';
import { traderPolicy, veteranPolicy, type SimPolicy } from '../../index.js';

/**
 * Every deed id this policy STEERS FOR — i.e. every id it passes to `need(…)`.
 *
 * WHY IT EXISTS: content's `DeedId` is `export type DeedId = string`, so a deed
 * id written inline here is an unchecked literal. Rename a deed in
 * `content/deeds.ts` and this policy would silently stop steering for it — the
 * errand it gates just never fires again — while `deed-coverage.test.ts` either
 * still passes for unrelated reasons or fails somewhere opaque. Listing the ids
 * once, and typing `need` to this union (below), turns a rename into a COMPILE
 * error here; `deed-coverage.test.ts` additionally asserts every entry is a real
 * authored deed, which catches a rename that changes only the content side.
 *
 * The values are exactly the literals that were inline before — this list adds a
 * check, it does not change which ids the policy tests.
 */
export const HUNTER_TARGET_DEED_IDS = [
  // Smuggling (T-1305): the fence ledger, and the patrol scan survived dirty.
  'ray_s_ledger',
  'slipped_the_scan',
  // Gambling (T-1303).
  'dare_first',
  'dare_won',
  'high_roller',
  'table_regular',
  // Lending (T-1304).
  'first_marker',
  'deep_water',
  'bad_paper',
  'paid_in_full',
  // Exploration (T-111a/b).
  'first_chart',
  'derelict_boarder',
  'beacon_chaser',
  'cartographer',
  'rich_hulk',
  'signal_hunter',
  'cold_case',
  // Liar's Dice roster (T-147). The fourteen port clears and the whole-roster
  // capstone. EVERY ONE OF THESE IS READ by the roster-tour errand below — the
  // capstone is the master switch, and each port id is the per-port
  // continue-condition — so the list keeps its contract that it "adds a check, it
  // does not change which ids the policy tests".
  'liars_dice_cleared_sun_3',
  'liars_dice_cleared_aldebaran_1',
  'liars_dice_cleared_altair_3',
  'liars_dice_cleared_arcturus_6',
  'liars_dice_cleared_deneb_4',
  'liars_dice_cleared_denebola_5',
  'liars_dice_cleared_fomalhaut_2',
  'liars_dice_cleared_mira_9',
  'liars_dice_cleared_pollux_7',
  'liars_dice_cleared_procyon_5',
  'liars_dice_cleared_regulus_6',
  'liars_dice_cleared_rigel_8',
  'liars_dice_cleared_spica_3',
  'liars_dice_cleared_vega_6',
  'liars_dice_grand_slam',
] as const;

/** The ids `need(…)` accepts. A typo or a stale rename fails the build. */
type HunterDeedId = (typeof HUNTER_TARGET_DEED_IDS)[number];

/** Dare stake that clears the `high_roller` deed's 250 floor while staying inside
 *  the content wager band (the resolver clamps to DARE_MAX_WAGER anyway). */
const BIG_WAGER = 300;
/** Credits kept back before any discretionary spend, so an appended verb can
 *  never strand the ship the veteran is funding. */
const HUNTER_RESERVE = 6000;
/** Port stakes the hunter will buy (the `landlord` deed needs two). */
const MAX_PORTS = 2;
/** Headroom kept above a 25,000cr port price. Thinner than HUNTER_RESERVE
 *  because by the time a stake is affordable the career is banking six figures,
 *  and a fat reserve simply meant the second stake never got bought. */
const PORT_HEADROOM = 3000;
/** Headroom kept above a loan payoff. The balance grows 5%/dusk on the ceiling
 *  principal, so clearing it EARLY is both the cheap play and what keeps
 *  `paid_in_full` reachable — waiting for a fat reserve let the balance outrun
 *  the purse (measured: 72,000 outstanding by day 300). */
const REPAY_HEADROOM = 2000;
/** The Guild marker's due day (PRD §5.1 / engine day.ts day-30 resolution). */
const TOUR_ONE_LAST_DAY = 30;
/** Sol-3. T-121 gave all fourteen core ports a bar, so this is no longer the only
 *  place a Dare or the Penny Wise desk exists — it is now only the errand's
 *  FALLBACK DESTINATION, the port the hunter flies to when it wants Hangout
 *  business and is not already standing at one. The `atHangout` test below reads
 *  `hasHangout` directly and therefore already fires at any of the fourteen.
 *
 *  DELIBERATELY NOT CHANGED TO "the nearest Hangout" (the option
 *  `docs/HANGOUT_REDESIGN.md` §4.2 floats): a fixed destination keeps the deed
 *  errand deterministic across T-121's before/after measurement, which is the
 *  whole point of the task. Revisit when a port's Hangout actually differs. */
const HANGOUT_SYSTEM = 1;

/**
 * T-147 · systemId → that port's Liar's Dice completion deed.
 *
 * The map is what makes all fourteen ids GENUINELY READ rather than decorative:
 * the tour's per-port continue-condition is `need(ROSTER_PORT_DEED_ID[systemId])`,
 * so a port whose set is already closed is skipped by the registry, not by a
 * beaten-set recount. Local to this support file — it is harness steering, not a
 * rule, and the engine's own `liarsDicePortCleared` remains the only thing that
 * decides a set is closed.
 */
const ROSTER_PORT_DEED_ID: Readonly<Record<number, HunterDeedId>> = {
  1: 'liars_dice_cleared_sun_3',
  2: 'liars_dice_cleared_aldebaran_1',
  3: 'liars_dice_cleared_altair_3',
  4: 'liars_dice_cleared_arcturus_6',
  5: 'liars_dice_cleared_deneb_4',
  6: 'liars_dice_cleared_denebola_5',
  7: 'liars_dice_cleared_fomalhaut_2',
  8: 'liars_dice_cleared_mira_9',
  9: 'liars_dice_cleared_pollux_7',
  10: 'liars_dice_cleared_procyon_5',
  11: 'liars_dice_cleared_regulus_6',
  12: 'liars_dice_cleared_rigel_8',
  13: 'liars_dice_cleared_spica_3',
  14: 'liars_dice_cleared_vega_6',
};

/** How many roster hands the tour will queue on one day, dice permitting. One a
 *  day does not fit 42 wins inside the coverage horizon alongside the rest of the
 *  slate (measured); two does. The stake is the port band's MINIMUM either way,
 *  so the extra hand adds reach, not variance. */
const ROSTER_HANDS_PER_DAY = 2;

/** Indices of dice the planned actions already claim. */
function usedDice(actions: readonly PlayerAction[]): Set<number> {
  const used = new Set<number>();
  for (const action of actions) {
    const die = (action as PlayerAction & { spendDie?: number }).spendDie;
    if (typeof die === 'number') used.add(die);
  }
  return used;
}

/** An unspent dawn-hand die not already claimed by a planned action, or
 *  undefined when the day is fully committed. */
function freeDie(state: GameState, used: Set<number>): number | undefined {
  const hand = state.player.dawnHand;
  if (!hand) return undefined;
  for (let i = 0; i < hand.dice.length; i += 1) {
    if (!hand.spent[i] && !used.has(i)) return i;
  }
  return undefined;
}

/** A solvent NPC actually sitting in the player's system — the Dare needs a real
 *  co-located dealer (engine hangout.ts refuses anything else with a typed fail). */
function dealerHere(state: GameState, minCredits: number): string | undefined {
  // F-121-1 · `!npc.dead` mirrors the resolver's N3 guard; without it the errand
  // can burn a die on a Dare the engine typed-fails with 'no-opponent'. Same
  // repair as `planDare` and `legalActions`.
  return state.npcs.find(
    (npc) =>
      !npc.dead &&
      npc.currentSystemId === state.player.currentSystemId &&
      npc.credits >= minCredits,
  )?.id;
}

const STORYLETS_BY_ID = new Map<string, StoryletDefinition>(
  (STORYLETS as readonly StoryletDefinition[]).map((storylet) => [storylet.id, storylet]),
);

/** A requirement-free choice that does NOT void the run in the hold. The
 *  contract guard is load-bearing: several cargo heads offer a free "sell it off
 *  the books" choice that clears the active contract, and answering those blindly
 *  cost the Tour One clear on every seed measured. */
function safeChoice(
  definition: StoryletDefinition,
): StoryletDefinition['choices'][number] | undefined {
  return definition.choices.find(
    (candidate) =>
      !candidate.requirements &&
      ![candidate.effects, candidate.successEffects, candidate.failureEffects].some(
        (effects) => effects?.cargo?.clearActiveContract,
      ),
  );
}

/** Ray's "wave him off" choice: requirement-free, and it neither clears the
 *  active contract nor drops the sealed pod — so the hold stays illicit and the
 *  patrol scan stays on the table. */
function declineChoice(
  definition: StoryletDefinition | undefined,
): StoryletDefinition['choices'][number] | undefined {
  return definition?.choices.find(
    (candidate) =>
      !candidate.requirements &&
      ![candidate.effects, candidate.successEffects, candidate.failureEffects].some(
        (effects) =>
          effects?.cargo?.clearActiveContract ||
          (effects?.flags ?? []).some(
            (flag) => flag.name === 'signal.contraband.carrying' && 'clear' in flag,
          ),
      ),
  );
}

/** Whether a choice arms a follow-up or credits a deed — the beats worth taking
 *  first when a dawn offers several. Mirrors the storylet-coverage sweep's own
 *  "prefer the choice that schedules a follow-up" rule. */
function advancesAChain(choice: StoryletDefinition['choices'][number]): boolean {
  return [choice.effects, choice.successEffects, choice.failureEffects].some(
    (effects) => (effects?.schedule?.length ?? 0) > 0 || (effects?.deedProgress?.length ?? 0) > 0,
  );
}

/**
 * ONE offered storylet a day, answered with a requirement-free, contract-safe
 * choice — a CHAIN-ADVANCING one by preference. Costs no die and no credits, so it never competes
 * with the Tour One marker, and it is what walks the TOUR_ONE-gated chains (Doc
 * Salvage's distress-ping → follow-up is `beacon_keeper`'s only source, and its
 * head is only ever offered on a day the ship happens to share Sol-3 with Doc —
 * so taking it FIRST, rather than whichever offer sorts earliest, is what makes
 * that deed reachable at all). The shipped `veteranPolicy` already answers offers
 * in phase 2; the lean `traderPolicy` does not, so the hunter does it here.
 *
 * ONE per day is deliberate. Answering every offer a dawn puts up (measured)
 * collapses the Tour One clear — the day's beats compound into enough small
 * credit and fuel costs, and enough shifted action indices, that the marker is
 * never banked. One beat a day walks the chains without derailing the trade run.
 */
function pickOffer(
  state: GameState,
  need: (deedId: HunterDeedId) => boolean,
): PlayerAction | undefined {
  let fallback: PlayerAction | undefined;
  for (const offer of state.storylets.available) {
    // STAY DIRTY: once Ray's ledger is written, fencing the next sealed pod (or
    // Contraband run) only empties the hold. `slipped_the_scan` needs the ship to
    // be CARRYING illicit cargo when a patrol interdicts it, so while that deed is
    // outstanding the hunter declines Ray's offers and keeps flying with the pod
    // aboard — the risky branch a fence-everything policy never takes.
    if (
      offer.storyletId.startsWith('fence.ray.') &&
      !need('ray_s_ledger') &&
      need('slipped_the_scan')
    ) {
      continue;
    }
    const definition = STORYLETS_BY_ID.get(offer.storyletId);
    if (!definition) continue;
    const choice = safeChoice(definition);
    if (!choice) continue;
    const action: PlayerAction = {
      type: 'Storylet',
      storyletId: offer.storyletId,
      choiceId: choice.id,
    };
    if (advancesAChain(choice)) return action;
    fallback ??= action;
  }
  return fallback;
}

/** The Tour One phase: the 25,000cr Guild marker is live and the day-30
 *  resolution is still ahead. */
function inTourOne(state: GameState): boolean {
  return state.day <= TOUR_ONE_LAST_DAY && state.flags['tour-one.resolved'] === undefined;
}

/**
 * The composite hunter. Two phases, then a fixed ladder of appended verbs.
 *
 * PHASE 1 — Tour One (days 1-30). Base policy is the LEAN `traderPolicy` and the
 * ONLY thing appended is a Penny Wise advance plus the final marker payment. The
 * 25,000 marker is a real economic wall: clearing it by day 30 is what earns
 * `tour_one_cleared` + `debt_cleared`, and it takes essentially every credit the
 * first month can produce, so no discretionary spending happens here (a hunter
 * that gambled and explored through Tour One never cleared the marker on any
 * seed — measured). Clearing it is also what makes the rest of the slate
 * affordable: an unpaid marker is flagged and compounds at dusk (T-1309), and a
 * hunter dragging that never banks the 25,000 for a port stake.
 *
 * PHASE 2 — Veteran (day 31+). Base policy is the shipped `veteranPolicy`, with
 * the new-verb actions appended on dice it left unspent. Every appended verb is
 * REGISTRY-DRIVEN (the veteran's own idiom): it fires only while the deed it
 * serves is unearned, so a completed career stops spending on it.
 */
export const deedHunterPolicy: SimPolicy = (ctx) => {
  const { state } = ctx;
  const tourOne = inTourOne(state);
  const base = tourOne ? traderPolicy(ctx) : veteranPolicy(ctx);
  // Every appended verb is refused mid-encounter by the day loop (typed
  // ActionBlocked), so don't waste dice planning them during a fight.
  if (state.encounter) return base;

  const actions = [...base];
  const used = usedDice(actions);
  const earned = new Set(state.player.registry.earned.map((deed) => deed.id));
  const need = (id: HunterDeedId): boolean => !earned.has(id);

  const take = (): number | undefined => {
    const die = freeDie(state, used);
    if (die !== undefined) used.add(die);
    return die;
  };

  if (tourOne) {
    // Walk one storylet beat, BEFORE the trade day. Ordering is load-bearing: a
    // storylet is only resolvable while it is still in `storylets.available`, and
    // the day's Travel moves the ship out of the system that offered it — so a
    // beat appended AFTER the trader's plan is refused every time. (This is
    // exactly what kept `beacon_keeper` unreachable: Doc's distress-ping is a
    // Sol-3 offer and the trader leaves Sol-3 on day 1.)
    const offer = pickOffer(state, need);
    if (offer) actions.unshift(offer);

    // A Penny Wise advance at the ceiling is a legitimate Tour One out (PRD §7.5)
    // and doubles as the `first_marker` / `deep_water` acquisition. Taken early so
    // the whole principal can be traded on before the marker falls due.
    //
    // T-133 (owner ruling D7) · …AND WHILE `deep_water` IS STILL OUTSTANDING, AT A
    // DESK THAT ACTUALLY REACHES THE CEILING. A port now carries its own
    // `loanBand` and the engine CLAMPS an over-ask rather than refusing it, so a
    // ceiling advance taken at a tight desk comes back short of `deep_water`'s
    // `principal >= 5000` trigger with the one marker slot spent. The gate is the
    // harness's and it is read through the engine's own accessor; content is not
    // widened and the deed's threshold is not lowered to meet the harness. It is
    // CONDITIONAL on the need, deliberately: once the deed is banked a shallow
    // marker is still a perfectly good Tour One out, and refusing one would make
    // this hunter worse at the rest of the slate for no gain.
    const deskReachesCeiling = loanBandFor(state.player.currentSystemId).max >= LOAN_MAX_PRINCIPAL;
    if (
      !state.player.loan &&
      state.day <= TOUR_ONE_LAST_DAY - 5 &&
      STAR_SYSTEMS[state.player.currentSystemId]?.hasHangout === true &&
      (deskReachesCeiling || !need('deep_water'))
    ) {
      const die = take();
      if (die !== undefined) {
        actions.push({
          type: 'VisitHangout',
          venue: 'borrow',
          amount: LOAN_MAX_PRINCIPAL,
        });
      }
    }
    // Discharge the marker on the last day of the Tour with everything banked
    // (pay-debt costs no die). The engine's day-30 dusk pass then resolves the
    // Tour on the CLEARED branch — `tour_one_cleared` is earned by that
    // resolution, never set here.
    if (state.day === TOUR_ONE_LAST_DAY && state.player.debt > 0 && state.player.credits > 0) {
      actions.push({
        type: 'Trade',
        action: 'pay-debt',
        amount: Math.min(state.player.credits, state.player.debt),
      });
    }
    return actions;
  }

  const here = state.player.currentSystemId;
  const atHangout = STAR_SYSTEMS[here]?.hasHangout === true;
  const flush = state.player.credits >= HUNTER_RESERVE;

  // STAY DIRTY (phase 2). The shipped veteran answers whatever storylet is on
  // offer, which means it fences every sealed pod to Smuggler Ray the moment the
  // offer appears — and a fenced pod is an EMPTY hold, so the patrol scan
  // (`applyPatrolContrabandScan`, gated on `isCarryingIllicit`) never rolls.
  // While `slipped_the_scan` is outstanding and Ray's ledger is already written,
  // drop that one action from the day's plan and keep flying with the pod aboard.
  // Everything else the veteran planned stands.
  if (!need('ray_s_ledger') && need('slipped_the_scan')) {
    for (let i = 0; i < actions.length; i += 1) {
      const action = actions[i];
      if (action.type !== 'Storylet' || !action.storyletId.startsWith('fence.ray.')) continue;
      const decline = declineChoice(STORYLETS_BY_ID.get(action.storyletId));
      // Take Ray's OTHER choice rather than dropping the action: declining still
      // resolves the storylet (so it stops re-offering) but leaves the pod in the
      // hold. Dropping it outright left the veteran's storylet-only day empty, and
      // the unresolved offer then re-proposed itself every dawn — a career that
      // did nothing for 270 days (measured).
      if (decline) actions[i] = { ...action, choiceId: decline.id };
    }
  }

  // --- The Hangout errand (T-1303 gambling + T-1304 lending) ---------------
  // The shipped veteran never flies anywhere without a contract to deliver, and
  // until T-121 Sol-3 was the ONLY `hasHangout` system — so a career left to
  // itself passed the tables perhaps twice in three hundred days and the Dare /
  // Penny Wise deeds went begging. With fourteen core ports now running bars the
  // errand is far less often NEEDED (`atHangout` is true on most docked days), but
  // it is kept because it is what makes the deeds deterministic rather than
  // incidental, and because the errand stops itself the moment the deeds land. When Hangout business is outstanding the hunter
  // makes a DELIBERATE ERRAND of it, exactly as the shipped explorer flies
  // straight to Polaris-1 for the Wise One (T-1310):
  //   - away from Sol-3 with a free hold → refuel and fly there;
  //   - at Sol-3 → spend the day AT THE TABLES (a standalone day, the same idiom
  //     the shipped policies use for storylets) so the errand never has to
  //     scavenge whatever die the veteran's trade day left over.
  // It is registry-driven: once the gambling and lending deeds are in the file
  // the errand stops entirely and the veteran career resumes untouched.
  const wantsDare =
    need('dare_first') || need('dare_won') || need('high_roller') || need('table_regular');
  const wantsLoan =
    need('first_marker') || need('deep_water') || need('bad_paper') || need('paid_in_full');

  // Only make the trip when the errand can actually be transacted on arrival: a
  // Dare needs a stake, the desk needs either no marker (to borrow) or the price
  // of clearing the one it has. Flying to Sol-3 to stare at an unaffordable
  // balance just burned days.
  const loanErrand =
    wantsLoan &&
    (!state.player.loan || state.player.credits >= state.player.loan.outstanding + REPAY_HEADROOM);
  if ((wantsDare || loanErrand) && flush) {
    const hand = state.player.dawnHand;
    const spare: number[] = [];
    if (hand) {
      for (let i = 0; i < hand.dice.length; i += 1) {
        if (!hand.spent[i]) spare.push(i);
      }
    }

    if (!atHangout) {
      // Fly the errand — but only with a free hold (never abandon a signed
      // contract) and only when the hop is actually fundable.
      if (!state.player.activeContract && spare.length > 0) {
        const errand: PlayerAction[] = [];
        const price = state.market.localFuelPrice || 5;
        const room = state.player.ship.maxFuel - state.player.ship.fuel;
        const affordable = Math.floor((state.player.credits - HUNTER_RESERVE / 2) / price);
        const units = Math.max(0, Math.min(room, affordable));
        if (state.player.ship.fuel < 250 && units > 0 && spare.length > 1) {
          // T-196a: the fill costs no die (docs/DAWN-HAND-REDESIGN.md §3), but the
          // spare-die LEDGER is left exactly as it was — this support policy's day
          // budget is not this task's to change, and dropping the shift would move
          // which die carries the pilot check below.
          spare.shift();
          errand.push({
            type: 'Trade',
            action: 'buy-fuel',
            fuelAmount: units,
          });
        }
        // Best remaining die carries the pilot check for the hop.
        let best = spare[0];
        for (const index of spare) {
          if ((hand?.dice[index] ?? 0) > (hand?.dice[best] ?? 0)) best = index;
        }
        errand.push({ type: 'Travel', destinationId: HANGOUT_SYSTEM, spendDie: best });
        return errand;
      }
    } else {
      // At the tables. A Dare needs a solvent dealer whose SIMULATED position is
      // this system (engine hangout.ts refuses anything else with a typed fail);
      // the Penny Wise desk needs no opponent at all.
      const errand: PlayerAction[] = [];
      if (wantsDare && spare.length > 0) {
        const wager = need('high_roller') ? BIG_WAGER : 50;
        const opponentId = dealerHere(state, Math.min(wager, DARE_MAX_WAGER));
        if (opponentId) {
          errand.push({
            type: 'VisitHangout',
            venue: 'dare',
            opponentId,
            wager,
          });
        }
      }
      if (wantsLoan && spare.length > 0) {
        const loan = state.player.loan;
        if (!loan) {
          // T-133 · the same conditional ceiling gate as the Tour One leg above:
          // while `deep_water` is outstanding the hunter holds out for a desk that
          // sells the whole 5,000, because a tight desk would clamp the ask and
          // spend the marker slot on a marker that cannot earn the deed.
          if (
            loanBandFor(state.player.currentSystemId).max >= LOAN_MAX_PRINCIPAL ||
            !need('deep_water')
          ) {
            errand.push({
              type: 'VisitHangout',
              venue: 'borrow',
              amount: LOAN_MAX_PRINCIPAL,
            });
          }
        } else if (
          // Hold the FIRST marker until the engine's own dusk sweep flips it to
          // 'defaulted' — that is what makes `bad_paper` reachable, since a policy
          // that always repays on time never touches the consequence branch — then
          // clear it as soon as the credits are there.
          (loan.status === 'defaulted' || !need('bad_paper')) &&
          state.player.credits >= loan.outstanding + REPAY_HEADROOM
        ) {
          errand.push({
            type: 'VisitHangout',
            venue: 'repay',
            amount: loan.outstanding,
          });
        }
      }
      if (errand.length > 0) return errand;
    }
  }

  // --- The roster tour (T-147 Liar's Dice set completion) ------------------
  // The fourteen port clears and the whole-roster capstone need 42 WINS over the
  // AUTHORED seats — a finite gauntlet the shipped veteran never touches, because
  // it only ever flies where a contract pays. So the tour is a deliberate errand
  // in the same shape as the Hangout errand above: fly to the nearest port that
  // still owes seats, then spend the day at that house's own table.
  //
  // IT IS REGISTRY-DRIVEN, twice over: the capstone deed is the master switch (a
  // career that has banked it stops touring entirely) and each port's own deed is
  // the per-port continue-condition. So a completed tour costs nothing and the
  // veteran career resumes untouched — the same self-stopping property the
  // Hangout errand has.
  //
  // THE TWO SEAT GUARDS MIRROR THE ENGINE, so `hangoutPlay.failedVisits === 0`
  // stays honest rather than becoming a tolerance:
  //   · a seat already in `liarsDiceBeaten` is skipped — a rematch is legal and
  //     pays, but it writes nothing and closes no set (T-145 §6.2 step 1);
  //   · a seat whose live purse has fallen to zero is skipped — the engine
  //     refuses it with `HangoutEvent{failReason:'opponent-broke'}` and would burn
  //     no die but log a failed visit. It can never strand the tour: BROKE IMPLIES
  //     BEATEN (the theorem in `actions/hangout.ts`), so a broke seat is one the
  //     first guard would have skipped anyway.
  // The stake is the port band's MINIMUM, deliberately: the deed needs a WIN, not
  // a big pot, and pool A is zero-sum, so a fat wager only adds variance.
  const tourWanted = need('liars_dice_grand_slam');
  const unbeatenSeatsAt = (systemId: number): string[] => {
    if (STAR_SYSTEMS[systemId]?.hasHangout !== true) return [];
    if (!venueOffered(systemId, 'dare')) return [];
    if (!need(ROSTER_PORT_DEED_ID[systemId])) return [];
    const beaten = new Set(state.player.liarsDiceBeaten);
    return liarsDiceOpponentsAt(systemId)
      .filter((seat) => !beaten.has(seat.id) && (state.liarsDicePurses[seat.id] ?? 0) > 0)
      .map((seat) => seat.id);
  };

  if (tourWanted && flush) {
    const hand = state.player.dawnHand;
    const spare: number[] = [];
    if (hand) {
      for (let i = 0; i < hand.dice.length; i += 1) {
        if (!hand.spent[i] && !used.has(i)) spare.push(i);
      }
    }
    const seatsHere = unbeatenSeatsAt(here);

    if (seatsHere.length > 0) {
      // AT a house that still owes seats — sit down, on dice the veteran left
      // unspent, and let the rest of its day stand.
      //
      // APPENDED-AND-UNSHIFTED, NOT RETURNED STANDALONE, and the difference is
      // measured rather than stylistic. A standalone tables-day (the shape the
      // Hangout errand uses, for the four one-off gambling deeds) is fine when it
      // happens twice a career; this errand runs on the order of thirty days, and
      // making each of those a non-travelling day starved the deeds that live
      // downstream of FLYING — a patrol only scans a ship in transit, and a
      // derelict is only boarded off a lane. Measured over seeds 1..65 at the
      // coverage horizon: standalone tables-days left `slipped_the_scan` earned by
      // ONE career in sixty-five, against fourteen before. Riding the veteran's
      // spare dice costs the tour a little speed and costs the rest of the slate
      // nothing.
      //
      // UNSHIFTED so the hands are played BEFORE the day's Travel: a
      // `VisitHangout` resolves against `currentSystemId` AT EXECUTION TIME, so a
      // dare queued behind a jump would sit down at the wrong house and typed-fail
      // with `no-opponent`. Same ordering rule, and the same reason, as the Tour
      // One storylet beat above. (`gamblerPolicy` puts its dares at the front of
      // the plan for exactly this reason.)
      const wager = wagerBandFor(here).min;
      const sitDowns: PlayerAction[] = [];
      for (const opponentId of seatsHere.slice(0, ROSTER_HANDS_PER_DAY)) {
        const die = take();
        if (die === undefined) break;
        sitDowns.push({ type: 'VisitHangout', venue: 'dare', opponentId, wager });
      }
      actions.unshift(...sitDowns);
    } else if (
      // NOT at such a house, and the veteran has nowhere of its own to be — fly to
      // the nearest port that still owes seats. Guarded on BOTH "no signed
      // contract" (never abandon a run) and "the day plans no jump of its own"
      // (never fight the veteran for the ship), so this only ever fills a day the
      // career was going to spend docked.
      !state.player.activeContract &&
      !actions.some((action) => action.type === 'Travel') &&
      spare.length > 0
    ) {
      // NEAREST, not a fixed hub like the Hangout errand's HANGOUT_SYSTEM: this
      // leg runs fourteen times rather than once, so a hub-and-spoke tour would
      // spend the horizon on fuel. Ties break to the lower systemId, so the tour
      // is deterministic.
      let destination: number | undefined;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const systemId of Object.keys(ROSTER_PORT_DEED_ID).map(Number)) {
        if (systemId === here || unbeatenSeatsAt(systemId).length === 0) continue;
        const hops = distance(here, systemId);
        if (hops < bestDistance) {
          bestDistance = hops;
          destination = systemId;
        }
      }
      if (destination !== undefined) {
        const price = state.market.localFuelPrice || 5;
        const room = state.player.ship.maxFuel - state.player.ship.fuel;
        const affordable = Math.floor((state.player.credits - HUNTER_RESERVE / 2) / price);
        const units = Math.max(0, Math.min(room, affordable));
        if (state.player.ship.fuel < 250 && units > 0 && spare.length > 1) {
          const fuelDie = take();
          if (fuelDie !== undefined) {
            actions.push({
              type: 'Trade',
              action: 'buy-fuel',
              fuelAmount: units,
            });
            spare.splice(spare.indexOf(fuelDie), 1);
          }
        }
        // Best remaining die carries the pilot check for the hop.
        let best = spare[0];
        for (const index of spare) {
          if ((hand?.dice[index] ?? 0) > (hand?.dice[best] ?? 0)) best = index;
        }
        if (best !== undefined && !used.has(best)) {
          used.add(best);
          actions.push({ type: 'Travel', destinationId: destination, spendDie: best });
        }
      }
    }
  }

  // --- Property (T-1307) --------------------------------------------------
  // A controlling stake in the core port under the ship, while flush enough that
  // the 25,000 never strands it. Two stakes total (the `landlord` deed).
  if (
    state.player.ports.length < MAX_PORTS &&
    isPurchasablePort(here) &&
    !state.player.ports.some((port) => port.systemId === here) &&
    state.player.credits >= PURCHASABLE_PORTS_BY_SYSTEM[here].purchasePrice + PORT_HEADROOM
  ) {
    const die = take();
    if (die !== undefined) {
      actions.push({ type: 'Port', action: 'buy', systemId: here });
    }
  }

  // --- Crew (T-1306) ------------------------------------------------------
  if (state.player.crew.length < crewCapacity(state.player.ship)) {
    const hired = new Set(state.player.crew.map((member) => member.roleId));
    const role = CREW_ROLES.find(
      (r) => !hired.has(r.id) && state.player.credits >= HUNTER_RESERVE + r.hirePrice,
    );
    if (role) {
      const die = take();
      if (die !== undefined) {
        actions.push({ type: 'Crew', action: 'hire', roleId: role.id });
      }
    }
  }

  // --- Exploration (T-111a/b) ---------------------------------------------
  // ONE off-lane sweep a day, and only while an exploration deed is still
  // outstanding, the purse is above the working reserve, and the tank can carry
  // the 80-fuel detour ON TOP of whatever jump the veteran already planned.
  // (An unbounded explore-with-every-spare-die version of this bankrupted the
  // hunter within 60 days — a dry, broke ship stops travelling, which starves
  // every OTHER deed. Exploration is the career's credit sink, so it rides last
  // and smallest.)
  const wantsExplore =
    need('first_chart') ||
    need('derelict_boarder') ||
    need('beacon_chaser') ||
    need('cartographer') ||
    need('rich_hulk') ||
    need('signal_hunter') ||
    need('cold_case') ||
    // A derelict board is also the only PLAYER-SIDE source of a sealed Contraband
    // pod, and carrying one is what puts a patrol scan on the board at all — so
    // keep sweeping while `slipped_the_scan` is outstanding.
    need('slipped_the_scan');
  const jumpReserve = actions.some((action) => action.type === 'Travel') ? 150 : 0;
  if (wantsExplore && flush && state.player.ship.fuel - jumpReserve >= EXPLORATION_FUEL_COST) {
    const die = take();
    if (die !== undefined) actions.push({ type: 'Explore', spendDie: die });
  }

  return actions;
};
