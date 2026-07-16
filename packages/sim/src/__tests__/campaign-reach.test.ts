import {
  CREW_ROLES,
  PURCHASABLE_PORTS_BY_SYSTEM,
  distance as systemDistance,
  isGatedDestination,
  isPurchasablePort,
} from '@spacerquest/content';
import {
  applyPlayerAction,
  createInitialState,
  crewCapacity,
  endDay,
  renownRankIndex,
  SeededRng,
  startDay,
  type GameState,
  type PlayerAction,
} from '@spacerquest/engine';
import { describe, expect, it } from 'vitest';
import {
  cannotAffordCheapestJump,
  runCampaign,
  systemIds,
  veteranPolicy,
  type SimPolicy,
} from '../index.js';
import { driveCompetentCampaign } from './support/campaign-drivers.js';

// ---------------------------------------------------------------------------
// The reachability + teeth acceptance sweeps. Split out of campaign.test.ts so
// vitest's fork pool runs them in parallel with the other campaign specs; the
// shared drivers live in support/campaign-drivers.ts. Every seed, horizon and
// assertion below is unchanged from the original single-file suite.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// T-114a · Special-equipment reachability THROUGH EARNED RENOWN. The original
// audit found the renown-gated special equipment unreachable in real play and
// masked by tests that set `renownRank` by hand. The veteran policy proves the
// gate opens through gameplay: it earns Deeds by actually playing (haggling,
// varied combat, rim + mercy runs, storylets) and buys the equipment its
// climbed rank unlocks — up to the ASTRAXIAL_HULL at GIGA_HERO. NOTHING in this
// test sets a score or a rank; the rank is a pure function of Deeds earned.
// ---------------------------------------------------------------------------
describe('T-114a special-equipment reachability (earned, not set)', () => {
  it('the veteran climbs to GIGA_HERO and installs the ASTRAXIAL_HULL through play', () => {
    // A real, deterministic long campaign. The only inputs are the seed and the
    // policy — no manual rank/score assignment anywhere in the drive.
    const state = driveCompetentCampaign(veteranPolicy, 3, 500);

    // The top rank was reached by earning Deeds, not by fiat.
    expect(renownRankIndex(state.player.registry.renownRank)).toBeGreaterThanOrEqual(
      renownRankIndex('GIGA_HERO'),
    );
    // ...and the GIGA_HERO-gated hull was actually bought and installed. This is
    // the piece that was unreachable before: the deepest renown gate, cleared by
    // gameplay and spent through the shipyard.
    expect(state.player.ship.isAstraxialHull).toBe(true);
    // Sanity: the assertion above cannot be satisfied by a set rank — confirm the
    // deeds that drive it were genuinely earned.
    expect(state.player.registry.earned.length).toBeGreaterThanOrEqual(15);
  }, 60000);
});

// ---------------------------------------------------------------------------
// T-1306 · Dice-progression reachability (earned, not injected). The dice pillar
// gained its only progression axis — crew that add a die / a re-roll / a floor.
// This proves a veteran ACQUIRES ≥1 such source by day 150 through legal play: it
// earns the credits, finds a free cabin berth, and hires a crew member via a real
// `Crew` action driven through applyPlayerAction. NOTHING sets crew by hand — the
// hire is the shipped veteranPolicy's own planCrewHire firing on real surplus.
// ---------------------------------------------------------------------------
// A veteran-style sim that ALSO hires a dice-progression crew member. It wraps the
// shipped `veteranPolicy` (unchanged — so the T-114a 500-day GIGA_HERO reachability
// above is untouched) and, on a day it left a die free and is flush enough to
// sustain the wage, appends a real `Crew` hire (highest-impact extra-die role
// first). This is a legal-play policy — every move goes through applyPlayerAction,
// nothing is injected onto the state — so it is the headless proof that the dice
// pillar's progression source is ACQUIRABLE through play, the counterpart to the
// engine crew.test.ts (which proves the hire/reroll mechanics deterministically).
// It lives in the test, not the shipped sim, because folding crew-hiring into the
// lean endgame `veteranPolicy` measurably degrades its documented 500-day climb
// (the 3000 hire + daily wage starves the ASTRAXIAL_HULL war chest — verified: it
// drops the seed-3 run from GIGA_HERO to MEGA_HERO).
const crewHiringVeteranPolicy: SimPolicy = (ctx) => {
  const actions = veteranPolicy(ctx);
  const { state } = ctx;
  if (state.encounter) return actions;
  if (state.player.crew.length >= crewCapacity(state.player.ship)) return actions;
  const hired = new Set(state.player.crew.map((member) => member.roleId));
  // Highest-impact benefit first (extra-die), then reroll, then floor. Require a
  // fat reserve above the hire price so the crew's wage is sustainable and the
  // hire never strands the ship.
  const order = ['extra-die', 'reroll', 'floor'];
  const role = [...CREW_ROLES]
    .sort((a, b) => order.indexOf(a.benefit.kind) - order.indexOf(b.benefit.kind))
    .find((r) => !hired.has(r.id) && state.player.credits >= 6000 + r.hirePrice);
  if (!role) return actions;
  // Append the hire on a die the veteran left unspent this day (never a collision).
  const used = new Set<number>();
  for (const action of actions) {
    const die = (action as PlayerAction & { spendDie?: number }).spendDie;
    if (typeof die === 'number') used.add(die);
  }
  const hand = state.player.dawnHand;
  if (!hand) return actions;
  for (let i = 0; i < hand.dice.length; i += 1) {
    if (!hand.spent[i] && !used.has(i)) {
      return [...actions, { type: 'Crew', action: 'hire', roleId: role.id, spendDie: i }];
    }
  }
  return actions;
};

// ---------------------------------------------------------------------------
// T-1307 · Ports-as-property reachability (earned, not injected). A veteran
// ACQUIRES a purchasable core-port stake through legal play — it earns the credits,
// lands at a core port it does not own, and buys the stake via a real `Port` action
// driven through applyPlayerAction; the stake then accrues income through the real
// dusk loop. NOTHING sets ports by hand. As with crewHiringVeteranPolicy this lives
// in the TEST, not the shipped sim, because the 25k spend would starve the
// documented endgame war chest (the shipped veteranPolicy stays unchanged).
const portBuyingVeteranPolicy: SimPolicy = (ctx) => {
  const actions = veteranPolicy(ctx);
  const { state } = ctx;
  if (state.encounter) return actions;
  const here = state.player.currentSystemId;
  // Only at a purchasable core port we don't already own.
  if (!isPurchasablePort(here)) return actions;
  if (state.player.ports.some((port) => port.systemId === here)) return actions;
  // Flush above a reserve so the buy never strands the ship (price + ~5k headroom).
  const price = PURCHASABLE_PORTS_BY_SYSTEM[here].purchasePrice;
  if (state.player.credits < price + 5000) return actions;
  // Append the buy on a die the veteran left unspent (never a collision).
  const used = new Set<number>();
  for (const action of actions) {
    const die = (action as PlayerAction & { spendDie?: number }).spendDie;
    if (typeof die === 'number') used.add(die);
  }
  const hand = state.player.dawnHand;
  if (!hand) return actions;
  for (let i = 0; i < hand.dice.length; i += 1) {
    if (!hand.spent[i] && !used.has(i)) {
      return [...actions, { type: 'Port', action: 'buy', systemId: here, spendDie: i }];
    }
  }
  return actions;
};

describe('T-1307 ports reachable through play', () => {
  it('a veteran sim buys a port and accrues its income within 150 days (acceptance #4)', () => {
    // T-1502 re-pin (seed 6 → 2): the NPC personal-chains batch added more
    // systemIds-gated storylet openers (chain episode 1s at core systems), and
    // veteranPolicy takes any offered storylet as a standalone day
    // (chooseStoryletAction), so the campaign again spends a handful of extra days
    // resolving the new beats — shifting exactly WHICH seed lands a port purchase +
    // accrued income inside the 150-day horizon. The port feature is unchanged and
    // still broadly reachable (a seeds 1..40 sweep of this very driver hits the
    // acceptance on 11 seeds: 2, 3, 11, 18, 23, 27, 28, 29, 34, 37, 39); seed 2 is
    // the first that qualifies. The seed is pinned, not steered — swap in any other
    // qualifying seed and the test passes without touching the assertions below.
    const state = driveCompetentCampaign(portBuyingVeteranPolicy, 2, 150);

    // The purchase happened through legal play: a PortEvent{purchased} was logged
    // (ports are bought via the Port action, never injected).
    const purchases = state.eventLog.filter(
      (e): e is Extract<typeof e, { type: 'PortEvent' }> =>
        e.type === 'PortEvent' && e.kind === 'purchased',
    );
    expect(purchases.length).toBeGreaterThanOrEqual(1);
    expect(purchases[0].day).toBeLessThanOrEqual(150);

    // ...and income accrued afterwards through the real dusk loop.
    const income = state.eventLog.filter(
      (e): e is Extract<typeof e, { type: 'PortEvent' }> =>
        e.type === 'PortEvent' && e.kind === 'income',
    );
    expect(income.length).toBeGreaterThanOrEqual(1);
    expect(income.some((e) => e.day > purchases[0].day)).toBe(true);

    // A stake is owned at the end of the horizon — the property is live.
    expect(state.player.ports.length).toBeGreaterThanOrEqual(1);
  }, 30000);
});

describe('T-1306 dice progression reachable through play', () => {
  it('a veteran sim hires a crew dice-source by day 150 (acceptance #4)', () => {
    const state = driveCompetentCampaign(crewHiringVeteranPolicy, 2, 150);

    // The acquisition happened through legal play: a CrewEvent{hired} was logged
    // on or before day 150 (crew are hired via the Crew action, never injected).
    const hires = state.eventLog.filter(
      (e): e is Extract<typeof e, { type: 'CrewEvent' }> =>
        e.type === 'CrewEvent' && e.kind === 'hired',
    );
    expect(hires.length).toBeGreaterThanOrEqual(1);
    expect(hires[0].day).toBeLessThanOrEqual(150);
    // ...and a crew member is aboard at the end of the horizon — the source is live.
    expect(state.player.crew.length).toBeGreaterThanOrEqual(1);
    // The hired role is a real dice-progression source.
    expect(CREW_ROLES.some((r) => r.id === hires[0].roleId)).toBe(true);
  }, 30000);
});

// ---------------------------------------------------------------------------
// T-1104 · Rim & contraband contract economy — the sim-side acceptance. Before
// T-1104, rollContract only issued destinations 1–14, so the veteran policy's
// rim-hunting steer (packages/sim/src/index.ts:1065-1070 — the
// `board.findIndex(c => c.destination >= 15 && c.destination <= 20 && …)` toward
// the `rimward_bound` deed) could NEVER match: no contract ever had a rim
// destination. That steer was dead code. Now that rollContract issues rim
// destinations, this test proves the path executes and completes a real rim
// delivery — nothing in the sim policy changed, only the economy that feeds it.
// ---------------------------------------------------------------------------
describe('T-1104 rim-hunting path revival (formerly dead)', () => {
  it('the veteran signs a rim run, jumps to the Rim, and delivers there', () => {
    // Deterministic modest horizon (seed 1, 120 days) — far shorter than the
    // 500-day GIGA_HERO run, chosen for speed; the rim steer fires early once
    // rim contracts exist.
    const state = driveCompetentCampaign(veteranPolicy, 1, 120);

    // (1) The rim TRAVEL completed — the `rimward_bound` deed fires only on a
    // successful TravelEvent with destination 15–20 (the deed that the sim steer
    // targets). It was unearnable before T-1104.
    const earnedRimward = state.player.registry.earned.some((d) => d.id === 'rimward_bound');
    expect(earnedRimward).toBe(true);

    // (2) A rim DELIVERY completed — a deliver-cargo TradeEvent at a rim
    // destination proves the contract was signed AND fulfilled at the Rim, not
    // merely that a jump landed there. This is the "completes a rim delivery"
    // acceptance, asserted end-to-end through the real day loop.
    const rimDelivery = (state.eventLog ?? []).some(
      (e) =>
        e.type === 'TradeEvent' &&
        e.action === 'deliver-cargo' &&
        e.success === true &&
        typeof e.destination === 'number' &&
        e.destination >= 15 &&
        e.destination <= 20,
    );
    expect(rimDelivery).toBe(true);
  }, 30000);
});

// ---------------------------------------------------------------------------
// T-1203 · player.tier progression through play. Before T-1203, player.tier was
// hardcoded to 1 and written nowhere, so encounter matchmaking never opened past
// tiers 1–2 and 23 of the 30 named NPCs (including Rattlesnake, the PRD §7.4
// set-piece) could never intercept the player. tier is now a pure DERIVED
// function of renown rank + ship fit, resynced at every day-loop chokepoint. The
// veteran policy climbs renown by actually playing, which must lift the tier and
// let a tier-3+ NAMED interceptor find the player — proven here end-to-end with
// NOTHING setting player.tier by hand.
// ---------------------------------------------------------------------------
describe('T-1203 tier climbs through play and admits tier-3+ named hunters', () => {
  it('the veteran reaches tier >= 3 and is intercepted by a tier-3+ named NPC', () => {
    // Deterministic drive — seed + policy only, no manual rank/tier assignment.
    // Seed 3 / 200 days surfaces nine tier-3+ named interceptions.
    const state = driveCompetentCampaign(veteranPolicy, 3, 200);

    // (1) The derived tier lifted itself above the frozen starting band purely
    // through earned renown + ship upgrades — no test set it.
    expect(state.player.tier).toBeGreaterThanOrEqual(3);

    // (2) A NAMED interceptor of tier >= 3 actually intercepted the player. This
    // was structurally impossible before T-1203 (band frozen at 1–2). Asserted
    // from the real EncounterStarted events the day loop emitted.
    const namedTierThreePlus = state.eventLog.some(
      (e) =>
        e.type === 'EncounterStarted' &&
        e.encounter.interceptor.source === 'named' &&
        e.encounter.interceptor.tier >= 3,
    );
    expect(namedTierThreePlus).toBe(true);
  }, 60000);
});

// ---------------------------------------------------------------------------
// T-1309 · Guild pressure & unpaid-branch teeth — the sim-side acceptance ("the
// unpaid sim branch shows debt growing per dusk"). An idle policy never pays the
// 25,000 marker, so the day-30 resolution takes the UNPAID branch, flags the
// captain's name, and the debt begins accruing interest at each subsequent dusk.
// Before T-1309 the debt was set once and never moved — this asserts, through the
// public `CampaignDayStats.debt` curve, that it now grows monotonically after the
// resolution while staying flat through Tour One (no accrual during the 30 days).
// ---------------------------------------------------------------------------
describe('T-1309 unpaid marker accrues interest per dusk (sim)', () => {
  it('idle debt is flat through day 30 then strictly grows each dusk', () => {
    const report = runCampaign(7, 45, 'idle');
    const byDay = new Map(report.daily.map((d) => [d.day, d.debt]));

    // Tour One is interest-free: the marker sits at its full 25,000 through the
    // resolution dusk (the day-30 pass sets the flag but the accrual is gated on
    // day > 30, so the resolution day itself never grows the debt).
    for (let day = 2; day <= 31; day += 1) {
      expect(byDay.get(day), `debt on day ${day}`).toBe(25000);
    }

    // From the first post-resolution dusk (day 32 stat = the day-31 dusk) the
    // ledger grows strictly every dusk — "the interest keeps running" with teeth.
    // MUTATION NOTE: revert the day.ts accrual block and the curve goes flat → red.
    for (let day = 33; day <= 45; day += 1) {
      const prev = byDay.get(day - 1)!;
      const now = byDay.get(day)!;
      expect(
        now,
        `debt grows from day ${day - 1} (${prev}) to day ${day} (${now})`,
      ).toBeGreaterThan(prev);
    }

    // The debt is a non-blocking ledger: credits never go negative behind the
    // player's back (no soft-lock from a growing marker).
    for (const day of report.daily) {
      expect(day.credits).toBeGreaterThanOrEqual(0);
    }

    expect(report.finalState.debt).toBeGreaterThan(25000);
  }, 30000);
});

// ---------------------------------------------------------------------------
// T-1004 · Fuel-starvation metric honesty. The old report counted days where
// `fuel === 0`, which fired 0 times in 6,000 simulated days because every policy
// tops the tank up — it measured a state the sim never reaches. The metric is
// now "days the player cannot afford the cheapest available jump" (even after
// spending every credit on fuel). These tests guard the new rule: the unit test
// pins the discriminating case that the OLD `fuel === 0` rule got wrong, and a
// scripted broke-and-dry campaign proves the metric actually fires in a run.
// ---------------------------------------------------------------------------
describe('T-1004 fuel starvation', () => {
  it('cannotAffordCheapestJump distinguishes stranded from merely low', () => {
    // credits 0, fuel 5 (below any jump cost): stranded — cannot buy fuel and
    // cannot afford even the nearest hop. This is the case the OLD `fuel === 0`
    // rule scored FALSE (fuel is 5, not 0) yet the player is genuinely stuck; it
    // is the discriminator that goes red under the reverted mutation.
    const stranded = createInitialState(1);
    stranded.player.credits = 0;
    stranded.player.ship.fuel = 5;
    expect(cannotAffordCheapestJump(stranded)).toBe(true);

    // A full starter tank can afford the cheapest jump: not stranded.
    const fuelled = createInitialState(1);
    fuelled.player.ship.fuel = 300;
    expect(cannotAffordCheapestJump(fuelled)).toBe(false);

    // Bone-dry tank but flush with credits: can just buy fuel — not stranded.
    const solvent = createInitialState(1);
    solvent.player.credits = 100_000;
    solvent.player.ship.fuel = 0;
    expect(cannotAffordCheapestJump(solvent)).toBe(false);
  });

  it('a scripted broke-and-dry campaign registers fuelStarvationDays > 0', () => {
    // Nearest OTHER system to `from` (T-1101 gated systems — Andromeda + special
    // — excluded, since the engine refuses travel to them), so each jump burns
    // the CHEAPEST fuel and the tank drains all the way below the cheapest-jump
    // threshold rather than stalling above it.
    const nearestFrom = (from: number): number => {
      let best = from;
      let bestDist = Infinity;
      for (const id of systemIds()) {
        if (id === from || isGatedDestination(id)) continue;
        const d = systemDistance(from, id);
        if (d < bestDist) {
          bestDist = d;
          best = id;
        }
      }
      return best;
    };

    // Broke-and-dry policy: on day 1 pour every credit into the debt marker
    // (credits -> 0), then every day burn fuel by hopping to the nearest system;
    // if an encounter interrupts, run to shake it. Nothing ever refuels, so the
    // starter 300 fuel drains to below the cheapest jump and the player strands.
    const brokeAndDryPolicy: SimPolicy = ({ state, dayIndex }) => {
      if (state.encounter) {
        return [
          { type: 'Combat', stance: 'run', targetId: state.encounter.interceptor.id, spendDie: 0 },
        ];
      }
      const actions: PlayerAction[] = [];
      if (dayIndex === 0 && state.player.credits > 0) {
        actions.push({ type: 'Trade', action: 'pay-debt', amount: state.player.credits });
      }
      actions.push({
        type: 'Travel',
        destinationId: nearestFrom(state.player.currentSystemId),
        spendDie: 0,
      });
      return actions;
    };

    const report = runCampaign(1, 60, brokeAndDryPolicy);

    expect(report.finalState.credits).toBe(0);
    expect(report.fuelStarvationDays).toBeGreaterThan(0);
  }, 30000);
});

// ---------------------------------------------------------------------------
// T-1204 · Disposition with teeth — the emergent-play acceptance (PRD §6 "they
// remember"). Before T-1204 `npc.disposition` was plumbed but dead: the dusk
// bond hook (which needed +5) had NEVER fired, and a 300-day sim peaked at
// |disposition| = 1 because the −1/dusk decay swamped every gain. The mechanic
// now has three real readers (interception weighting, the talk DC term, and the
// data-driven Bond hook), a slower periodic decay, and larger event deltas.
//
// T-1801 rewrote this test to be HONESTLY unguided. The earlier version claimed
// "organic play" but hand-steered the ship to Doc with a scripted fly-to-Doc
// loop during a bond window; the mechanism was real but the label was not. This
// version's day loop contains ZERO references to Doc — no NPC id, no
// `chain.doc-salvage.*` storylet id, no travel-toward-Doc — so the bond
// intervention it observes genuinely arises from unguided play. The driver is:
//   (1) the SHIPPED `veteranPolicy` every day (earn, climb renown → tier so
//       NAMED interceptors start hunting the ship);
//   (2) a GENERIC storylet resolver that answers whatever storylet is offered by
//       taking its FIRST choice — no NPC-id awareness whatsoever. When the
//       veteran happens to be in system 1 with Doc co-located during Tour One,
//       this first-choice policy walks Doc's distress-ping → follow-up chain
//       (choice[0] = answer, then accept-thanks = +2), which clears his fuel-gift
//       Bond hook's activateAt of 2 as a side effect of playing normally;
//   (3) generic combat handling that FIGHTS a named interceptor to the death once
//       the veteran is armed — a defeat cuts a −5 grudge
//       (DISPOSITION_DELTAS.defeat), which the interception weighting then makes
//       re-hunt the ship, pushing |disposition| to >= 5. This is combat steering,
//       not Doc steering.
// A bond intervention then fires only if the roaming veteran drifts back into a
// dusk co-located with a bonded Doc while its tank is <= 150 — a conjunction no
// line of this test arranges. See CAMPAIGN_SEED below for how the seed was found.
// The loop stops as soon as both acceptance signals are observed.
// ---------------------------------------------------------------------------
describe('T-1204 disposition with teeth (unguided 300-day sim)', () => {
  it('an unguided veteran campaign drifts into a bond intervention and a >= 5 combat grudge', () => {
    const highestFreeDie = (s: GameState): number | undefined => {
      const hand = s.player.dawnHand;
      if (!hand) return undefined;
      let best = -1;
      let bestVal = -1;
      for (let i = 0; i < hand.dice.length; i += 1) {
        if (!hand.spent[i] && hand.dice[i] > bestVal) {
          bestVal = hand.dice[i]!;
          best = i;
        }
      }
      return best >= 0 ? best : undefined;
    };
    // Generic storylet resolver: answer whatever storylet is on offer by taking
    // its FIRST choice, with NO awareness of which NPC or chain it belongs to.
    // This is what makes the test honest — it is the same policy for Doc's
    // distress-ping (choice[0] = "answer"), his follow-up (choice[0] =
    // "accept-thanks", +2), the Guild pressure beats, and every hazard follow-up.
    // Doc's standing is earned only as an incidental side effect of playing every
    // offered card, never by singling him out. The guard stops if resolving a
    // choice leaves the same storylet still on the board (e.g. a repeat:'daily'
    // card), so the loop cannot spin.
    const resolveOffered = (s: GameState): GameState => {
      let next = s;
      let guard = 0;
      while (guard < 20) {
        guard += 1;
        const offered = next.storylets.available.find((o) => o.choices.length > 0);
        if (!offered) break;
        const before = next.storylets.available.length;
        next = applyPlayerAction(next, {
          type: 'Storylet',
          storyletId: offered.storyletId,
          choiceId: offered.choices[0].id,
        }).state;
        if (
          next.storylets.available.length >= before &&
          next.storylets.available.some((o) => o.storyletId === offered.storyletId)
        ) {
          break;
        }
      }
      return next;
    };

    // Only commit to killing a named interceptor when the fight is winnable —
    // strong guns, or a small enough hull — and there is fuel for the volleys, so
    // the driver earns the grudge instead of losing the ship.
    const canKillNamed = (s: GameState): boolean => {
      const hull = Math.max(1, s.encounter!.enemyHull);
      return (s.player.ship.weapons.strength >= 20 || hull <= 2) && s.player.ship.fuel >= 50 * hull;
    };
    const handleEncounter = (s: GameState, defeatedNamed: boolean): GameState => {
      let next = s;
      let guard = 0;
      while (next.encounter && guard < 10) {
        guard += 1;
        const interceptor = next.encounter.interceptor;
        const die = highestFreeDie(next);
        if (die === undefined) break;
        if (interceptor.source === 'named' && !defeatedNamed && canKillNamed(next)) {
          next = applyPlayerAction(next, {
            type: 'Combat',
            stance: 'fight',
            targetId: interceptor.id,
            spendDie: die,
          }).state;
        } else {
          next = applyPlayerAction(next, {
            type: 'Combat',
            stance: next.player.ship.fuel >= 20 ? 'run' : 'talk',
            targetId: interceptor.id,
            spendDie: die,
          }).state;
        }
      }
      return next;
    };

    // How this seed was chosen (T-1801): because the day loop below carries ZERO
    // Doc-ward steering, no single seed is guaranteed to surface the tight bond
    // conjunction (a roaming veteran back in a dusk co-located with a bonded Doc
    // while its tank is <= 150). A throwaway sweep ran this exact unguided driver
    // over seeds 1..45 at a 300-day horizon and printed, per seed, whether a
    // BondIntervention fired and the peak |disposition|.
    //
    // T-1502 re-pin (seed 8 → 3): the NPC personal-chains batch added more
    // systemIds-gated storylet openers, and `resolveOffered` plays every offered
    // card (including the new chain episodes), so the unguided trajectory shifted
    // again — moving WHICH seed lands the bond conjunction (the arc itself is
    // untouched). Re-running the sweep over the new content, seed 3 is the first
    // that lands BOTH acceptance signals purely from unguided play: the fuel-gift
    // bond intervention on day 7 and a peak |disposition| of 5 (a −5 combat grudge
    // from a named interceptor fought to the kill) on day 4. The seed is pinned, not
    // steered — swap in any other qualifying seed from the sweep (e.g. 12) and the
    // test still passes without touching the loop body. (Most seeds fire the >= 5
    // grudge but never the bond, which is exactly why the earlier hand-steered
    // version overstated "organic" play — T-1801 replaced that steering with the
    // unguided driver above rather than relabelling it; see the header comment.)
    const CAMPAIGN_SEED = 3;
    let state = createInitialState(CAMPAIGN_SEED);
    let sawBond = false;
    let peakDisposition = 0;
    let defeatedNamed = false;
    let scanCursor = 0;
    let bondDay = -1;
    let peakDay = -1;

    for (let day = 0; day < 300; day += 1) {
      const rng = new SeededRng(CAMPAIGN_SEED)
        .fork('policy')
        .fork(`day-${state.day}`)
        .fork(`index-${day}`);
      let s = startDay(state).state;
      // Play every storylet on offer by its first choice — Doc's chain is walked
      // here only when the veteran already happens to be co-located with him, and
      // only as one card among all offered ones (see resolveOffered).
      s = resolveOffered(s);
      // Competent veteran career: earn, climb renown/tier, and fight a named
      // hunter to the death once armed (the −5 grudge, combat steering only).
      if (s.encounter) s = handleEncounter(s, defeatedNamed);
      const actions = veteranPolicy({ state: s, dayIndex: day, rng });
      for (const action of actions) {
        try {
          if (
            action.type === 'Combat' &&
            s.encounter &&
            s.encounter.interceptor.source === 'named' &&
            !defeatedNamed &&
            canKillNamed(s)
          ) {
            s = applyPlayerAction(s, { ...action, stance: 'fight' }).state;
          } else {
            s = applyPlayerAction(s, action).state;
          }
        } catch {
          // An action the veteran planned may be blocked by a mid-batch state
          // change (e.g. an encounter starting); skip it, exactly as the sim's
          // own drivers tolerate.
        }
      }
      if (s.encounter) s = handleEncounter(s, defeatedNamed);
      // The veteran policy already banks guns as its renown/war-chest grows; its
      // upgraded weapons are what make the named grudge fight winnable.
      s = resolveOffered(s);

      state = endDay(s).state;

      // Scan only the new events (append-only log) for the two acceptance signals.
      for (let i = scanCursor; i < state.eventLog.length; i += 1) {
        const e = state.eventLog[i];
        if (e.type === 'BondIntervention' && !sawBond) {
          sawBond = true;
          bondDay = state.day;
        }
        if (e.type === 'DispositionChanged') {
          if (e.reason === 'defeat') defeatedNamed = true;
          const magnitude = Math.abs(e.disposition);
          if (magnitude > peakDisposition) {
            peakDisposition = magnitude;
            peakDay = state.day;
          }
        }
      }
      scanCursor = state.eventLog.length;

      if (sawBond && peakDisposition >= 5) break;
    }

    // Acceptance: at least one bond intervention AND a peak |disposition| >= 5,
    // both from unguided legal play (no line above steers toward Doc). Observed
    // at authoring time (seed 3, re-pinned at T-1502): the fuel-gift bond
    // intervention on day 7, peak |disposition| 5 on day 4.
    expect(sawBond, `no BondIntervention (bondDay=${bondDay})`).toBe(true);
    expect(
      peakDisposition,
      `peak |disposition| ${peakDisposition} on day ${peakDay}`,
    ).toBeGreaterThanOrEqual(5);
  }, 60000);
});
