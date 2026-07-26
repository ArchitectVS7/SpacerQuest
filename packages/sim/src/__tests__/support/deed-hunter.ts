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
  isPurchasablePort,
} from '@spacerquest/content';
import { crewCapacity, type GameState, type PlayerAction } from '@spacerquest/engine';
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
/** Sun-3 — the only `hasHangout` system (content systems.ts), so the only place
 *  a Dare or the Penny Wise desk exists. */
const HANGOUT_SYSTEM = 1;

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
  return state.npcs.find(
    (npc) => npc.currentSystemId === state.player.currentSystemId && npc.credits >= minCredits,
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
 * head is only ever offered on a day the ship happens to share Sun-3 with Doc —
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
    // Sun-3 offer and the trader leaves Sun-3 on day 1.)
    const offer = pickOffer(state, need);
    if (offer) actions.unshift(offer);

    // A Penny Wise advance at the ceiling is a legitimate Tour One out (PRD §7.5)
    // and doubles as the `first_marker` / `deep_water` acquisition. Taken early so
    // the whole principal can be traded on before the marker falls due.
    if (
      !state.player.loan &&
      state.day <= TOUR_ONE_LAST_DAY - 5 &&
      STAR_SYSTEMS[state.player.currentSystemId]?.hasHangout === true
    ) {
      const die = take();
      if (die !== undefined) {
        actions.push({
          type: 'VisitHangout',
          venue: 'borrow',
          amount: LOAN_MAX_PRINCIPAL,
          spendDie: die,
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

  const atHangout = STAR_SYSTEMS[state.player.currentSystemId]?.hasHangout === true;
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
  // Sun-3 (system 1) is the ONLY `hasHangout` system, and the shipped veteran
  // never flies anywhere without a contract to deliver — so a career left to
  // itself passes the tables perhaps twice in three hundred days and the Dare /
  // Penny Wise deeds go begging. When Hangout business is outstanding the hunter
  // makes a DELIBERATE ERRAND of it, exactly as the shipped explorer flies
  // straight to Polaris-1 for the Wise One (T-1310):
  //   - away from Sun-3 with a free hold → refuel and fly there;
  //   - at Sun-3 → spend the day AT THE TABLES (a standalone day, the same idiom
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
  // of clearing the one it has. Flying to Sun-3 to stare at an unaffordable
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
          errand.push({
            type: 'Trade',
            action: 'buy-fuel',
            fuelAmount: units,
            spendDie: spare.shift()!,
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
            spendDie: spare.shift()!,
          });
        }
      }
      if (wantsLoan && spare.length > 0) {
        const loan = state.player.loan;
        if (!loan) {
          errand.push({
            type: 'VisitHangout',
            venue: 'borrow',
            amount: LOAN_MAX_PRINCIPAL,
            spendDie: spare.shift()!,
          });
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
            spendDie: spare.shift()!,
          });
        }
      }
      if (errand.length > 0) return errand;
    }
  }

  // --- Property (T-1307) --------------------------------------------------
  // A controlling stake in the core port under the ship, while flush enough that
  // the 25,000 never strands it. Two stakes total (the `landlord` deed).
  const here = state.player.currentSystemId;
  if (
    state.player.ports.length < MAX_PORTS &&
    isPurchasablePort(here) &&
    !state.player.ports.some((port) => port.systemId === here) &&
    state.player.credits >= PURCHASABLE_PORTS_BY_SYSTEM[here].purchasePrice + PORT_HEADROOM
  ) {
    const die = take();
    if (die !== undefined) {
      actions.push({ type: 'Port', action: 'buy', systemId: here, spendDie: die });
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
        actions.push({ type: 'Crew', action: 'hire', roleId: role.id, spendDie: die });
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
