import {
  CREW_ROLES,
  EXPLORATION_FUEL_COST,
  FENCE_REP_FLAG,
  FLAWS,
  // T-175 · The five unlock thresholds, IMPORTED rather than restated, so the
  // sim's derived tier moves with content (see `derivedDareTier`).
  LIARS_DICE_UNLOCK_GAMES,
  NPC_PROFILES,
  SPECIAL_EQUIPMENT,
  STAR_SYSTEMS,
  Stat,
  YARD_COMPONENT_TIER_PRICES,
  distance as systemDistance,
  isGatedDestination,
  isSimulatedCaptain,
  type DiceBenefit,
  type PowerTier,
  type RenownRankId,
} from '@spacerquest/content';
import {
  FIGHT_FUEL_COST,
  RUN_FUEL_COST,
  calculateFuelCapacity,
  componentTierForStrength,
  createInitialState,
  crewCapacity,
  dawnDiceModifiers,
  decodedFragmentCount,
  demoLocked,
  endDay,
  equipmentDiceBenefits,
  fragmentCount,
  hasAnyUndecoded,
  hasFragment,
  hasSpecialEquipment,
  isCarryingIllicit,
  jumpFuelCost,
  navBonus,
  quotePort,
  quoteShipyard,
  renownRankIndex,
  startDay,
  travelDc,
  tributeForRound,
  loanBandFor,
  venueOffered,
  // T-168 · `wagerBandFor` survives here as the MEASUREMENT's tier-0 reference
  // ceiling only (`accumulateMetricEvents`' `DareHandStarted` arm). It is NO
  // LONGER what sizes a stake — see `preHandWagerBand` below and §4.6a.
  wagerBandFor,
  effectiveWagerBand,
  liarsDiceOpponentsAt,
  // T-197 · §4b's rounds cap, read through the engine's own accessor (never
  // re-derived from the tier table) — the planner mirror and the gambler's loop
  // bound are the two readers.
  liarsDiceRoundsRemaining,
  // T-168 · THE PRE-HAND STAKE BAND (§4.6a item 3). `planDare` sizes its wager off
  // THIS, never off the raw port band — sizing off `wagerBandFor` is what F-148-4
  // measured as "no career can ever request into the raised ceiling".
  preHandWagerBand,
  // T-175 · The tier→dice mapping, read through the engine's own accessor so the
  // cell split's tier cross-check never restates it (see `derivedDareTier`).
  dicePerSideForTier,
  // T-176 · The ONE evidence bar the challenge instrument classifies BOTH sides
  // with (F-160-2, §18 criterion C3'(b)). Imported, never restated, and never
  // combined with either policy's own relaxations — see
  // `isEvidenceBackedChallenge`.
  DARE_AI_CHALLENGE_MARGIN,
  legalDareMoves,
  minOpeningQuantity,
  applyPlayerAction,
  weaponVolleyDamage,
  SeededRng,
  type GameEvent,
  type GameState,
  type NpcDecisionTraceSink,
  type NpcState,
  type PlayerAction,
  type PortStake,
  type ShipComponentId,
  type SpecialEquipmentId,
} from '@spacerquest/engine';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// T-202 · UGT adapter — the pure protocol core (message types, handleMessage,
// legal-actions enumerator, state-summary builder). Transport shell lives in
// ./protocol-stdio.ts. See PROTOCOL.md.
export * from './protocol.js';

export type SimPolicyName =
  | 'idle'
  | 'greedy'
  | 'random'
  | 'trader'
  | 'fighter'
  | 'explorer'
  | 'veteran'
  // T-1601b · the two net-new instruments: the smuggling pillar (contraband
  // supply → patrol scans → Ray's fence) and the Hangout tables (Spacer's Dare).
  | 'smuggler'
  | 'gambler'
  // R1 (BALANCE-REDESIGN-WORKLIST) · the human-plausible pilot. A MEASUREMENT
  // instrument, not a balance archetype — see `degradedTraderPolicy`.
  | 'trader-degraded';

export interface RunCampaignOptions {
  seed: number;
  days: number;
  policy: SimPolicyName;
}

export interface CampaignDayStats {
  day: number;
  credits: number;
  debt: number;
  fuel: number;
  systemId: number;
  wireEntries: number;
  flawChecks: number;
  flawOverrides: number;
  deedsEarned: string[];
  deedCount: number;
  renownRank: RenownRankId;
  /** Destination of the best-payment offer on this dawn's manifest board (T-107
   *  route-diversity tracking); null on a completely dark board. */
  bestOfferDestination: number | null;
  /**
   * N10 · How many offers this dawn's board actually carried at the player's
   * location — the DEPTH the shared job pool could supply, between
   * `JOB_POOL_MIN_BOARD` and `JOB_POOL_BOARD_SIZE`.
   *
   * This is the player-facing face of contract competition and the series the
   * step's Disproves limb is read off ("boards empty and Tour One clear
   * collapses"). Before N10 it was a constant 4 except on the dawn after a
   * co-located snipe, which is precisely why nobody needed to measure it.
   */
  boardDepth: number;
  /** N10 · Offers taken off the player's LIVE board this dusk (`ContractClaimed`).
   *  The VISIBLE half of competition — claims made elsewhere in the galaxy thin
   *  `boardDepth` on a later day instead of showing up here. */
  contractsSniped: number;
  /**
   * N11/T-022 · Rank-gated special equipment the SIMULATED field installed during
   * this dusk — the per-day series behind `CampaignStatsReport.
   * npcSpecialEquipmentPurchases`.
   *
   * A STATE DIFF, not an event count, and deliberately so: `considerRefit` narrates
   * a captain's purchase as a `WireEntry` only, exactly the bind
   * `equipmentUse.autoRepairDusks` is in a few fields above, and emitting a
   * `ShipyardEvent` from the NPC path is ruled out (it would source deeds T-020
   * reserves for the owner and would pollute the player-scoped
   * `equipmentUse.specialEquipmentBought`). See {@link gatedEquipmentWorn} for why
   * the difference is exactly a purchase count — monotone gated items, a roster
   * that never shrinks — and for the content-driven definition of "gated".
   */
  npcSpecialEquipmentBought: number;
  /** Number of income-producing actions the policy actually took this day
   *  (T-201): signing a contract, travelling toward a delivery, exploring for
   *  salvage/fragments, or engaging combat (fight/talk) for gain. The
   *  poverty-trap invariant asserts this is never zero for 5 consecutive days —
   *  a competent policy is never stuck with no legal way to make progress. */
  incomeActionCount: number;
  /** T-1601a: the per-day series behind the report-level `fuelStarvationDays`
   *  (T-1004) — true when this dusk ended stranded (`cannotAffordCheapestJump`).
   *  Set from the SAME single call that increments the counter, so the two can
   *  never disagree. READER: `campaign-policies.test.ts` cross-checks
   *  `daily.filter(d => d.fuelStarved).length === report.fuelStarvationDays`,
   *  which is what turns the scalar into an auditable trajectory (a run can now
   *  be asked WHEN it starved, not just how often). */
  fuelStarved: boolean;
}

// ---------------------------------------------------------------------------
// T-1601a (three blocks) / T-1601b (two more) · Policy-behavior metrics. These
// blocks are DERIVED sim report fields, not `GameState` — they are folded out of
// the typed `GameEvent` stream (and, where events cannot say it, out of
// before/after state comparisons) at report time. Nothing is persisted, so
// standing constraint 3's save-migration + round-trip obligation does not apply
// here; the report's JSON survival is covered by the existing byte-identical
// `reportToJson` determinism test.
//
// READERS (constraint 7) for all five: the per-policy assertions in
// `packages/sim/src/__tests__/campaign-policies.test.ts` (T-1601a's three) and
// `packages/sim/src/__tests__/campaign-smuggler-gambler.test.ts` (T-1601b's
// two), plus the CLI JSON that `reportToJson` emits for `npm run sim`.
// ---------------------------------------------------------------------------

/** T-1304 Penny Wise lending, as the trader actually used it over a run. */
export interface LoanUsageStats {
  /** `LoanEvent` kind 'borrowed' — advances actually taken at the desk. */
  loansTaken: number;
  /** Sum of `LoanEvent.principal` over the 'borrowed' events. */
  principalBorrowed: number;
  /** Sum of `LoanEvent.interest` over the per-dusk 'accrued' events — what the
   *  interim `LOAN_DAILY_RATE` × `LOAN_TERM_DAYS` band actually costs in play. */
  interestAccrued: number;
  /** Sum of `LoanEvent.amountPaid` over the 'repaid' events. */
  amountRepaid: number;
  /** 'repaid' events that drove the balance to zero (`cleared === true`). */
  loansCleared: number;
  /** 'defaulted' events — the term ran out unpaid (collection pressure follows). */
  defaults: number;
  /** Days whose DUSK state still carried a live loan. */
  daysWithLoan: number;
}

/** T-111b Signal-fragment flow: what the explorer pulled in and got decoded. */
export interface FragmentStats {
  /** `FragmentAcquired` events over the run (new fragments only — the engine
   *  suppresses duplicate grants). */
  acquired: number;
  /** `FragmentDecoded` events over the run (the Sage of Mizar-9's only output). */
  decoded: number;
  /** `fragmentCount` of the final Nemesis file. */
  heldAtEnd: number;
  /** `decodedFragmentCount` of the final Nemesis file. */
  decodedAtEnd: number;
}

/** T-1205/T-1206 ship fit, as BEHAVIOR rather than as a purchase receipt: what
 *  the policy bought AND what the fit then did in the fights it took. */
export interface EquipmentUseStats {
  /** `ShipyardEvent` action 'buy-special-equipment', in purchase order. */
  specialEquipmentBought: SpecialEquipmentId[];
  /** `ShipyardEvent` action 'buy-component-tier' count. */
  componentTiersBought: number;
  /** Winning fight rounds landed while the gun was BETTER than the junker's
   *  (`weaponVolleyDamage > 1` measured on the pre-action ship). Proves the
   *  T-1205/T-1206 weapon fit was load-bearing on a real volley, not merely
   *  purchased — events alone cannot say it, so this is measured per action. */
  upgradedVolleys: number;
  /** Sum of `ComponentDamaged.mitigated` — condition points the shields (or a
   *  fitted ARCH_ANGEL floor) absorbed off incoming fire. */
  shieldAbsorbedPoints: number;
  /** Dusks on which a fitted AUTO_REPAIR module actually restored condition.
   *  The module emits only prose, so this is a state comparison across `endDay`
   *  over the SAME seven non-hull components the engine reader repairs (mirrors
   *  `AUTO_REPAIR_COMPONENTS` in engine/src/components.ts — hull excluded there,
   *  hull excluded here; see AUTO_REPAIR_SIM_COMPONENTS below). */
  autoRepairDusks: number;
}

/**
 * T-1601b · The smuggling pillar as the smuggler actually ran it — supply
 * (contraband contracts + derelict pods), enforcement (patrol GUILE scans, PRD
 * §7.2) and the fence out (Smuggler Ray, PRD §7.5). Every field is a fold over
 * already-typed events except the two dusk-state counters, which no event can
 * say (carrying illicit cargo and holding the fence rep are STATE, not beats).
 * READER: the smuggler assertions in `campaign-smuggler-gambler.test.ts` and the
 * `npm run sim` CLI JSON.
 */
export interface SmugglingStats {
  /** `TradeEvent` action 'sign-contract' with `cargoType === 10` — the pillar's
   *  contract-side supply (only a port with `allowsContraband` issues one). */
  contrabandContractsSigned: number;
  /** `TradeEvent` action 'deliver-cargo' with `cargoType === 10` — runs that got
   *  past the patrols and paid out. */
  contrabandDelivered: number;
  /** `ContrabandScan` events — patrol interdictions that actually boarded an
   *  illicit hold (the engine draws no die unless PATROL && isCarryingIllicit). */
  scans: number;
  /** ...of which the patrol's GUILE check beat the player's concealment. */
  scansCaught: number;
  /** ...of which it did not. `scansCaught + scansEvaded === scans` by construction. */
  scansEvaded: number;
  /** Sum of `ContrabandConfiscated.fine` — CONTRABAND_FINE clamped to the purse. */
  finesPaid: number;
  /** `ContrabandConfiscated.confiscatedContract` — a voided contraband run. */
  contractsConfiscated: number;
  /** `ContrabandConfiscated.confiscatedPod` — a seized sealed pod. */
  podsConfiscated: number;
  /** `StoryletChoiceResolved` on `derelict.sealed-pod` / choice `take` — the pod
   *  supply line the Explore loot roll arms. */
  podsTaken: number;
  /** `StoryletChoiceResolved` on a `fence.ray.*` storylet's SELL choice — the
   *  §7.5 third out. Both fence storylets are `repeat: 'never'`, so this is
   *  bounded at 2 per career by content, not by the policy. */
  fenceSales: number;
  /** Days whose DUSK state still carried illicit cargo (`isCarryingIllicit`) —
   *  the exposure window the scan rolls against. */
  daysCarryingIllicit: number;
  /** Days whose DUSK state carried Ray's fence rep (`FENCE_REP_FLAG`). The flag's
   *  downstream reader is the scan DC itself (CONTRABAND_FENCE_REP_SCAN_PENALTY),
   *  so fencing EARLY raises the caught rate for the rest of the career. */
  fenceRepDays: number;
}

/**
 * T-1601b · The Spacers Hangout as the gambler actually played it (PRD §7.5's
 * first out; the Spacer's Dare of PRD §6/§7.3). Pure fold over `HangoutEvent`.
 * READER: the gambler assertions in `campaign-smuggler-gambler.test.ts` and the
 * `npm run sim` CLI JSON.
 */
export interface HangoutPlayStats {
  /** Social `HangoutEvent`s that actually resolved (no `failReason`). */
  visits: number;
  /** ...of which were Dares. */
  dares: number;
  /** Dares the player took (`playerWon === true`). */
  daresWon: number;
  /** Dares the dealer took. `daresWon + daresLost === dares`. */
  daresLost: number;
  /** Sum of `HangoutEvent.wager` — total stake across the run. Note the engine
   *  clamps every stake into the PORT's band (`wagerBandFor`) AND down to what the
   *  DEALER can cover, so a broke dealer shows up here as a thin wager. */
  wagered: number;
  /** Sum of `HangoutEvent.creditsDelta` — the tables' net effect on the purse. */
  netCredits: number;
  /** THE acceptance metric: `netCredits / dares` (0 when no dare was played). */
  expectedValuePerDare: number;
  /** meet / befriend / insult beats — the non-wagered social venues. */
  socialBeats: number;
  /** `HangoutEvent`s carrying a `failReason`. A policy whose preconditions mirror
   *  the engine's gates never burns a die on a typed refusal, so this must be 0 —
   *  it is the proof that `planDare`'s guards are the engine's guards.
   *
   *  T-135 · This got STRONGER: a `Dare` move outside the lattice is refused with
   *  `failReason: 'illegal-dare-move'` and lands here too, so a zero is now also
   *  the proof that `planDareMove` mirrors the engine's `legalDareMoves`. */
  failedVisits: number;
  /** T-135 · Times the runner's Liar's Dice continuation loop hit
   *  `DARE_MAX_MOVES_PER_HAND`. MUST BE 0: §12.4 proves the tripwire unreachable
   *  (the bid lattice bounds a hand at ~15 player actions), which is exactly why a
   *  non-zero count is a bug to fail on rather than a number to swallow. */
  dareGuardHits: number;
  /** T-168 · Hands whose SEATED stake (`DareHandStarted.seedWager`, i.e. after the
   *  resolver's band AND solvency clamps) exceeded the port's TIER-0 authored
   *  ceiling `wagerBandFor(systemId).max` — a tier-4-or-better stake that both
   *  sides could actually cover. STRUCTURALLY 0 BEFORE T-168: `planDare` sized its
   *  request off the tier-0 band, so the raised ceiling was unreachable by
   *  construction (F-148-4). This is the field that makes it measurable.
   *  READERS: the tier-4 assertions in `campaign-smuggler-gambler.test.ts`, the
   *  `npm run sim` CLI JSON, and `SeedRow.hangout` in the sweep. */
  handsAboveBaseCeiling: number;
  /** T-168 · ...and above the TIER-4 ceiling, read as
   *  `effectiveWagerBand(systemId, 4).max` rather than by restating
   *  `LIARS_DICE_RAISED_CEILING_MULT` here. Only tier 5's REMOVED band clamp can
   *  reach above it, so this counts tier-5 stakes specifically. Same readers. */
  handsAboveRaisedCeiling: number;
  /** T-168 · The largest single SEATED stake over the run, in credits. The scale
   *  reading that the two counters above give as frequencies. */
  maxSeedWager: number;
  /**
   * T-175 · **THE ARCHETYPE-ORDERING SPLIT** (F-160-1) — settled Liar's Dice hands
   * cut by `pool × archetype × unlock tier`, keyed by {@link DareCellKey}.
   *
   * WHY IT IS HERE AND NOT ON A PROBE. `docs/HANGOUT_REDESIGN.md` §10.7 retired the
   * gitignored-`.scratch/`-probe lineage at T-173: "a new measurement reads the
   * sweep's own rows instead of descending from this file". `SeedRow.hangout`
   * carries this block WHOLE off the report (`balance/aggregate.ts`), so the cells
   * reach the 8,000-row sweep with no aggregator edit at all.
   *
   * RAW COUNTERS, NOT RATES, deliberately — `aggregate.ts`'s own philosophy. A
   * later re-cut (by pool only, by archetype only, EV per hand, bids per hand) is
   * arithmetic over what is already here and needs no new sweep.
   *
   * EVERY KEY IS PRESENT AND ZERO-FILLED (T-173's `movesByReason` rule: *a missing
   * key and a zero must not be the same reading*). The product is small and totally
   * enumerable — 2 pools × 4 archetype slots × 6 tiers = 48 — so a cell that was
   * never reached reads `hands: 0` rather than `undefined`.
   */
  dareCells: Record<DareCellKey, DareCellStats>;
  /**
   * T-175 · Settled hands whose ARITHMETIC tier disagreed with their own frozen
   * `dicePerSide`. **MUST BE 0** — see {@link derivedDareTier}. Shipped as a
   * counter rather than a `throw` for the same reason `dareGuardHits` is: a
   * non-zero is a finding to file, and a sweep that dies mid-run reports nothing.
   */
  dareTierDisagreements: number;
  /**
   * T-176 · **THE CHALLENGER-WON SPLIT AT MATCHED EVIDENCE** (F-160-2) — hands
   * settled by a CHALLENGE, cut by `pool × challenger × dicePerSide × k`, keyed by
   * {@link DareChallengeCellKey}.
   *
   * `k = bid.quantity - own(bid.face)` off the CHALLENGER's own hand: the number of
   * the claimed face the challenger still needs from the other side's `dicePerSide`
   * dice, and the sufficient statistic both sides' challenge rules are written in.
   * `docs/LIARS-DICE_REDESIGN.md` §18 derives criterion C3' over these cells; the
   * raw per-pool split T-160's C3 reported is the `k`-marginal of the same table.
   *
   * ONLY THE CHALLENGE POPULATION LANDS HERE, by construction rather than by
   * filter: `DareHandResolved.dealerDice` and `actualCount` ride the event on the
   * two challenge outcomes ONLY (a fold never reveals, §6.1), which is precisely the
   * population the criterion is about.
   *
   * RAW COUNTS, NOT RATES, and every derived quantity §18 reports — the raw split,
   * the standardised split, `w`, `p_backed`, `p_unbacked`, the analytic null — is
   * arithmetic over these 108 cells plus the engine's `probAtLeast`.
   */
  dareChallengeCells: Record<DareChallengeCellKey, DareChallengeCellStats>;
  /**
   * T-176 · The same challenges rolled up by `pool × archetype × challenger`
   * ({@link DareChallengeSplitKey}), 16 zero-filled cells. NOT derivable from
   * {@link dareChallengeCells}, which drops the archetype to keep the `k` axis
   * bounded — and since T-175 `optimal` is a materially different challenger from
   * `bad`, dropping it would send the next reader back for another sweep.
   */
  dareChallengeSplit: Record<DareChallengeSplitKey, DareChallengeCellStats>;
  /**
   * T-176 · Settled CHALLENGE hands that failed one of three structural checks.
   * **MUST BE 0**, and `campaign-dare-challenges.test.ts` asserts it on every seed.
   * A counter rather than a `throw`, for the same reason
   * {@link dareTierDisagreements} is one.
   *
   * The three channels, all impossible if the stream is well-formed:
   *   1. **THE TWO-DERIVATION IDENTITY.** `challengerWon` is derived from
   *      `outcome` + the challenger's identity; `claimFalse` from
   *      `actualCount < bid.quantity`. `resolveChallenge` makes these the same
   *      fact, so a disagreement means the join or the identity is wrong.
   *   2. **THE JOIN.** A challenge outcome must carry a standing `bid`, an
   *      `actualCount`, a revealed `dealerDice`, and a parked last-bidder for its
   *      `handId`. A miss on any of them is a lost hand, not a rounding error.
   *   3. **THE ARITY.** Both revealed hands must hold the same number of dice, and
   *      that number must be one the ladder can produce (4, 5 or 6).
   */
  dareChallengeDisagreements: number;
}

/**
 * T-175 · The pool of a settled hand, taken FROM the engine event rather than
 * restated, so the sim can never carry a pool the engine does not emit.
 */
export type DarePool = NonNullable<
  Extract<GameEvent, { type: 'DareHandResolved' }>['opponentKind']
>;
/** T-175 · ...and the concrete archetype, same discipline. `null` on a roaming hand. */
export type DareArchetype = NonNullable<
  NonNullable<Extract<GameEvent, { type: 'DareHandResolved' }>['opponentArchetype']>
>;

/** T-175 · The archetype SLOT a cell key uses — the three concrete arms plus the
 *  explicit `'none'` a roaming hand occupies. `'none'` is a value, not a gap. */
export type DareArchetypeSlot = DareArchetype | 'none';

/** T-175 · `pool|archetype|tN`. A template-literal type, so a typo in a key is a
 *  compile error and the 48 cells are enumerable at the type level. */
export type DareCellKey = `${DarePool}|${DareArchetypeSlot}|t${0 | 1 | 2 | 3 | 4 | 5}`;

/** T-175 · One (pool × archetype × tier) cell. Raw counts only; every rate the
 *  write-up reports is derived from these four numbers. */
export interface DareCellStats {
  /** Settled hands that landed in this cell. `Σ hands === HangoutPlayStats.dares`. */
  hands: number;
  /** ...of which the PLAYER took. `Σ playerWon === HangoutPlayStats.daresWon`. */
  playerWon: number;
  /** Sum of `DareHandResolved.creditsDelta` (player's view).
   *  `Σ netCredits === HangoutPlayStats.netCredits`. */
  netCredits: number;
  /** `DareBidPlaced` beats attributed to this cell — BOTH sides, the same quantity
   *  §12 reports as "bids per hand". Joined through `handId`. */
  bids: number;
}

/** T-175 · The three concrete arms plus `'none'`, in the FIXED order the write-up
 *  reports them. Not `resolveMixedArchetype`'s contract order (that one is a rules
 *  contract and lives in the engine); this is a presentation order and says so. */
const DARE_ARCHETYPE_SLOTS: readonly DareArchetypeSlot[] = ['optimal', 'bad', 'random', 'none'];
const DARE_POOLS: readonly DarePool[] = ['roaming', 'roster'];
const DARE_TIERS: readonly (0 | 1 | 2 | 3 | 4 | 5)[] = [0, 1, 2, 3, 4, 5];

/** T-175 · The one place a cell key is spelled. Every reader and the zero-fill
 *  below go through it, so the key format cannot drift between them. */
export function dareCellKey(
  pool: DarePool,
  archetype: DareArchetypeSlot,
  tier: 0 | 1 | 2 | 3 | 4 | 5,
): DareCellKey {
  return `${pool}|${archetype}|t${tier}`;
}

/** T-175 · All 48 cells, zero-filled. See {@link HangoutPlayStats.dareCells}. */
export function zeroDareCells(): Record<DareCellKey, DareCellStats> {
  const cells = {} as Record<DareCellKey, DareCellStats>;
  for (const pool of DARE_POOLS) {
    for (const archetype of DARE_ARCHETYPE_SLOTS) {
      for (const tier of DARE_TIERS) {
        cells[dareCellKey(pool, archetype, tier)] = {
          hands: 0,
          playerWon: 0,
          netCredits: 0,
          bids: 0,
        };
      }
    }
  }
  return cells;
}

/**
 * T-175 · THE TIER OF A HAND, DERIVED — never a fifth live `liarsDiceTier` read.
 *
 * `docs/LIARS-DICE-PROGRESSION_SPEC.md` §4.6a CLOSES the licensed live-tier-read
 * list at four and says adding a fifth requires amending the spec FIRST. This
 * follows T-148's probe precedent instead (§12's "`liarsDiceTier` was NOT called a
 * third time" paragraph): the tier is arithmetic over the run's OWN settled-hand
 * count against the imported `LIARS_DICE_UNLOCK_GAMES` thresholds.
 *
 * THE OFF-BY-ONE IS THE ENGINE'S, restated here only because there is no hand to
 * read it off: `player.liarsDiceGamesPlayed` is incremented BY `settleDareHand`
 * (`packages/engine/src/actions/dare.ts`), so the hand being settled was OPENED
 * while the counter still read `settledBefore` — the count of hands settled before
 * it. That is exactly the value passed here.
 *
 * IT IS CROSS-CHECKED, NOT TRUSTED: {@link accumulateMetricEvents} compares this
 * against the hand's FROZEN `dicePerSide` (4 → 0, 5 → 1, 6 → ≥2) on every hand and
 * `campaign-dare-cells.test.ts` asserts ZERO disagreements — which turns the §4.6a
 * constraint into a free correctness check on freeze-at-open.
 */
export function derivedDareTier(settledBefore: number): 0 | 1 | 2 | 3 | 4 | 5 {
  const rungs = LIARS_DICE_UNLOCK_GAMES.filter((threshold) => settledBefore >= threshold).length;
  return rungs as 0 | 1 | 2 | 3 | 4 | 5;
}

/**
 * T-175 · The dice-per-side band a tier implies, for the cross-check above. Read
 * through the ENGINE's `dicePerSideForTier` rather than restated, so the mapping
 * exists in exactly one place; the comparison is a band because tiers 2..5 all
 * hold six dice and are therefore not separable from `dicePerSide` alone.
 */
export function dicePerSideAgreesWithTier(dicePerSide: number, tier: number): boolean {
  return dicePerSide === dicePerSideForTier(tier);
}

// ---------------------------------------------------------------------------
// T-176 · THE CHALLENGER-WON SPLIT (F-160-2) — `docs/LIARS-DICE_REDESIGN.md` §18.
//
// WHAT THIS MEASURES, AND WHY IT IS NOT THE RAW SPLIT. T-160's criterion C3 asked
// the two challenger rows to sit within 20 pp of each other and neither shape met
// it. §18 re-derives the criterion as C3', which compares the two sides AT MATCHED
// EVIDENCE — the sufficient statistic both sides' challenge rules are written in,
// `k = bid.quantity - own(bid.face)` counted off the CHALLENGER's own hand, against
// the `dicePerSide` unknown dice on the other side. `probAtLeast(k, dicePerSide)`
// is the engine's own analytic prior for that statistic and is IMPORTED, never
// restated here.
//
// THE INSTRUMENT MIRRORS NO POLICY. It stores raw `(challenges, won)` counts per
// `pool × challenger × dicePerSide × k`; every rate, the evidence-backed split, the
// standardisation and the mixture identity are arithmetic over those counts (see
// `isEvidenceBackedChallenge`, which applies ONE engine-exported constant
// identically to both sides). Copying `dealerMove`'s or `planDareMove`'s if-chain
// into the sim is the drift failure this repo keeps naming, and it is not done.
// ---------------------------------------------------------------------------

/** T-176 · Which side played CALL. Derived from the actor of the LAST
 *  `DareBidPlaced` on the hand — the challenger is by construction the other one
 *  (`packages/engine/src/actions/dare.ts`, both challenge arms). */
export type DareChallenger = 'player' | 'dealer';

/** T-176 · The hand's dice-per-side. The ladder produces exactly 4, 5 or 6
 *  (`dicePerSideForTier`), so the cell axis is closed at three values. */
export type DareDiceArity = 4 | 5 | 6;

/**
 * T-176 · The `k` axis, BUCKETED and totally enumerable.
 *
 * `0` collects `k <= 0` — the claim is already true off the challenger's own dice
 * alone, which is exactly the input `probAtLeast` answers `1` for, so collapsing
 * them loses nothing. `8` collects `k >= 8`: `k > dicePerSide` makes the claim
 * impossible for every legal arity, so every bucket at or above 7 carries the same
 * analytic null of 1.
 */
export type DareKBucket = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** T-176 · `pool|challenger|dN|kM`. A template-literal type, so a typo is a compile
 *  error and the 2 × 2 × 3 × 9 = 108 cells are enumerable at the type level. */
export type DareChallengeCellKey =
  `${DarePool}|${DareChallenger}|d${DareDiceArity}|k${DareKBucket}`;

/** T-176 · `pool|archetype|challenger` — the small rollup. Post-T-175 `optimal` is
 *  a materially different challenger from `bad`, so a reader asking "who is
 *  challenging well" needs the archetype cut and would otherwise have to re-run. */
export type DareChallengeSplitKey = `${DarePool}|${DareArchetypeSlot}|${DareChallenger}`;

/** T-176 · One challenge cell. RAW COUNTS ONLY — `aggregate.ts`'s own philosophy,
 *  and the reason a later re-cut needs no new sweep. */
export interface DareChallengeCellStats {
  /** Hands settled by a CHALLENGE played by this side, at this evidence. */
  challenges: number;
  /** ...of which the CHALLENGER took the pot. */
  won: number;
}

const DARE_CHALLENGERS: readonly DareChallenger[] = ['player', 'dealer'];
const DARE_DICE_ARITIES: readonly DareDiceArity[] = [4, 5, 6];
const DARE_K_BUCKETS: readonly DareKBucket[] = [0, 1, 2, 3, 4, 5, 6, 7, 8];

/** T-176 · The one place a challenge-cell key is spelled. */
export function dareChallengeCellKey(
  pool: DarePool,
  challenger: DareChallenger,
  dicePerSide: DareDiceArity,
  bucket: DareKBucket,
): DareChallengeCellKey {
  return `${pool}|${challenger}|d${dicePerSide}|k${bucket}`;
}

/** T-176 · ...and of a rollup key. */
export function dareChallengeSplitKey(
  pool: DarePool,
  archetype: DareArchetypeSlot,
  challenger: DareChallenger,
): DareChallengeSplitKey {
  return `${pool}|${archetype}|${challenger}`;
}

/** T-176 · `k` clamped onto the bucket axis. Both clamps are EXPLICIT rather than
 *  implied by an index, because a silent clamp is how a tail quietly stops being
 *  measured. */
export function dareKBucket(k: number): DareKBucket {
  if (k <= 0) return 0;
  if (k >= 8) return 8;
  return k as DareKBucket;
}

/**
 * T-176 · THE POLICY-AGNOSTIC EVIDENCE CLASSIFIER (§18, criterion C3'(b)).
 *
 * A challenge is EVIDENCE-BACKED iff the claim outruns what the challenger's own
 * dice plus the unknown half's EXPECTATION support by more than the engine's
 * margin: `surplus = k - dicePerSide/6 > DARE_AI_CHALLENGE_MARGIN`.
 *
 * ONE CONSTANT, IMPORTED, APPLIED IDENTICALLY TO BOTH SIDES. It is deliberately
 * NOT a mirror of either policy's if-chain: `dealerMove` branch 1 relaxes the same
 * margin by `dealerGuile * DARE_AI_GUILE_PATIENCE` and `planDareMove` (c2) does
 * not, so neither side's own test would classify the other's population. What is
 * shared between them — and what `SIM_DARE_CHALLENGE_MARGIN`'s docblock says it
 * mirrors "so the two sides fold on comparable evidence" — is exactly this bar.
 *
 * NOTE FOR THE READER OF THE CELLS: this predicate is a FUNCTION OF THE CELL KEY
 * alone, and it lands on `k >= 3` at all three arities (`1.5 + 4/6 = 2.167`,
 * `1.5 + 5/6 = 2.333`, `1.5 + 6/6 = 2.5`). That is why `w`, `p_backed` and
 * `p_unbacked` are pure summation over `dareChallengeCells` and are not stored.
 */
export function isEvidenceBackedChallenge(k: number, dicePerSide: number): boolean {
  return k - dicePerSide / 6 > DARE_AI_CHALLENGE_MARGIN;
}

/**
 * T-176 · WHAT ONE SETTLED HAND SAYS ABOUT THE CHALLENGE, or why it says nothing.
 *
 *   * `not-a-challenge` — the hand folded (or timed out). `dealerDice`/`actualCount`
 *     do not ride those outcomes (§6.1: a fold NEVER reveals), so there is nothing
 *     to read and nothing wrong. The common case; not a disagreement.
 *   * `join-miss` — a CHALLENGE outcome missing one of the four things it must
 *     carry. Structurally impossible; counted, never dropped.
 *   * `challenge` — the reading.
 */
export type DareChallengeReading =
  | { kind: 'not-a-challenge' }
  | { kind: 'join-miss' }
  | {
      kind: 'challenge';
      /** The side that played CALL — the actor of the last `DareBidPlaced` is by
       *  construction the other one. */
      challenger: DareChallenger;
      /** DERIVATION ONE — the engine's `outcome`, read through who called.
       *  `challenge-win`/`challenge-loss` are the PLAYER's view of the pot. */
      challengerWon: boolean;
      /** DERIVATION TWO — the showdown arithmetic. `resolveChallenge` makes the
       *  bidder win iff the claim holds, so these two are the SAME FACT and a
       *  disagreement is a bug. Kept as a separate field rather than collapsed, so
       *  the identity is asserted rather than assumed. */
      claimFalse: boolean;
      /** The UNKNOWN half's size — read off the OTHER side's revealed hand, which
       *  is what `probAtLeast`'s second argument means. */
      dicePerSide: DareDiceArity;
      /** `bid.quantity − own(bid.face)` off the CHALLENGER's own hand. RAW: may be
       *  ≤ 0 (the challenger already holds the claim) and is bucketed separately. */
      k: number;
      /** False iff the two derivations disagree, or the two revealed hands hold
       *  different (or impossible) numbers of dice. MUST be true on every hand. */
      wellFormed: boolean;
    };

/**
 * T-176 · THE ONE PLACE A SETTLED HAND BECOMES A CHALLENGE READING (§18).
 *
 * Pure, and exported so `campaign-dare-challenges.test.ts` can drive REAL hands
 * through the engine, read `state.eventLog`, and check this against a reference
 * derivation written independently of it — rather than checking the fold against
 * itself. {@link accumulateMetricEvents}'s `DareHandResolved` arm is its only
 * production caller.
 *
 * IT MIRRORS NO POLICY. The only rule knowledge here is the pairing the engine
 * states at both of its challenge arms (`packages/engine/src/actions/dare.ts`): the
 * challenger is whoever did NOT place the standing bid, and the bidder wins iff the
 * claim holds.
 */
export function readDareChallenge(
  event: Extract<GameEvent, { type: 'DareHandResolved' }>,
  lastBidder: DareChallenger | undefined,
): DareChallengeReading {
  if (event.outcome !== 'challenge-win' && event.outcome !== 'challenge-loss') {
    return { kind: 'not-a-challenge' };
  }
  if (
    event.bid === null ||
    lastBidder === undefined ||
    event.actualCount === undefined ||
    event.dealerDice === undefined
  ) {
    return { kind: 'join-miss' };
  }
  const standing = event.bid;
  const challenger: DareChallenger = lastBidder === 'player' ? 'dealer' : 'player';
  const challengerWon =
    challenger === 'player'
      ? event.outcome === 'challenge-win'
      : event.outcome === 'challenge-loss';
  const claimFalse = event.actualCount < standing.quantity;
  const ownDice = challenger === 'player' ? event.playerDice : event.dealerDice;
  const otherDice = challenger === 'player' ? event.dealerDice : event.playerDice;
  const arity = otherDice.length;
  const wellFormed =
    challengerWon === claimFalse && arity === ownDice.length && arity >= 4 && arity <= 6;
  return {
    kind: 'challenge',
    challenger,
    challengerWon,
    claimFalse,
    dicePerSide: Math.min(6, Math.max(4, arity)) as DareDiceArity,
    k: standing.quantity - ownDice.filter((die) => die === standing.face).length,
    wellFormed,
  };
}

/** T-176 · All 108 cells, zero-filled (T-173's `movesByReason` rule: a missing key
 *  and a zero must not be the same reading). */
export function zeroDareChallengeCells(): Record<DareChallengeCellKey, DareChallengeCellStats> {
  const cells = {} as Record<DareChallengeCellKey, DareChallengeCellStats>;
  for (const pool of DARE_POOLS) {
    for (const challenger of DARE_CHALLENGERS) {
      for (const dicePerSide of DARE_DICE_ARITIES) {
        for (const bucket of DARE_K_BUCKETS) {
          cells[dareChallengeCellKey(pool, challenger, dicePerSide, bucket)] = {
            challenges: 0,
            won: 0,
          };
        }
      }
    }
  }
  return cells;
}

/** T-176 · All 16 rollup cells, zero-filled. The full cross product is enumerated
 *  — including the eight structurally unreachable `roaming|optimal|*`-shaped pairs
 *  — for the same reason `zeroDareCells`'s 48 include them: the key set is a
 *  property of the axes, not of what a particular run happened to reach. */
export function zeroDareChallengeSplit(): Record<DareChallengeSplitKey, DareChallengeCellStats> {
  const cells = {} as Record<DareChallengeSplitKey, DareChallengeCellStats>;
  for (const pool of DARE_POOLS) {
    for (const archetype of DARE_ARCHETYPE_SLOTS) {
      for (const challenger of DARE_CHALLENGERS) {
        cells[dareChallengeSplitKey(pool, archetype, challenger)] = { challenges: 0, won: 0 };
      }
    }
  }
  return cells;
}

/** T-173 · The engine's own `DispositionChanged.reason` union, taken FROM the
 *  event rather than restated, so the sim can never carry a reason the engine
 *  does not emit (or miss one it does). */
export type DispositionChangeReason = Extract<GameEvent, { type: 'DispositionChanged' }>['reason'];

/**
 * T-173 · STANDING, as the career actually moved it — the disposition half of the
 * instrument gap BR-13 recorded and this task discharges. Every figure here was
 * previously obtainable only from the gitignored `.scratch/t125-hangout.ts` probe
 * (source fenced at `docs/HANGOUT_REDESIGN.md` §10.7), which is why four separate
 * measurements (T-125, T-137, T-148, T-150) each had to re-derive it.
 *
 * TWO FOLDS, NOT ONE, and the split is the same one `SmugglingStats` makes:
 *   * `movesByReason` is a pure EVENT fold (`accumulateMetricEvents`) — a move is
 *     a beat, and `DispositionChanged` carries its own reason.
 *   * the four state figures and the spans are sampled once per day AT DUSK over
 *     `state.npcs`, because "the cast sits at exactly zero on N% of live
 *     captain-days" is a CONDITION, not a beat, and no event can answer it. Dusk
 *     is the moment decay runs (`day.ts` → `applyDisposition(..., 'decay')`), so a
 *     dusk sample is the post-decay standing — exactly the state
 *     `docs/HANGOUT_REDESIGN.md` §11.3's table reports.
 *
 * READERS (constraint 7): `packages/sim/src/__tests__/campaign-disposition.test.ts`,
 * `SeedRow.disposition` in `balance/aggregate.ts`, and the CLI JSON that
 * `reportToJson` emits for `npm run sim`.
 */
export interface DispositionStats {
  /** `DispositionChanged` events by `reason`. EVERY reason is a key, 0 when it
   *  never fired — a missing key and a zero must not be the same reading. */
  movesByReason: Record<DispositionChangeReason, number>;
  /** Live (non-dead) captain-records sampled at dusk, summed over the horizon —
   *  THE denominator for the three figures below. All roster records, not just the
   *  simulated field: a quest record is still a captain the player can hold a
   *  standing with, and this is the sample §11.3's "live npc-days" reports. */
  liveNpcDays: number;
  /** ...of which sat at exactly 0. `zeroDispositionNpcDays / liveNpcDays` is the
   *  inertness of the whole cast, the number behind the named pool's own. */
  zeroDispositionNpcDays: number;
  /** Σ |disposition| over the same sample — mean |disposition| is this over
   *  `liveNpcDays`, computed by the reader rather than baked in here so an empty
   *  sample cannot become a NaN on the row. */
  absDispositionSum: number;
  /** The largest |disposition| any captain reached at any dusk. The engine clamps
   *  to [-10, 10], so a value above 10 is a clamp defect, not a balance number. */
  peakAbsDisposition: number;
  /** One entry per standing that both OPENED (0 → non-zero) and CLOSED (→ 0)
   *  inside the horizon: the days it survived. Deliberately excludes standings
   *  still open when the horizon ran out — see {@link standingsOpenAtHorizon} —
   *  so the mean is not biased downward by truncation. */
  standingSpanDays: number[];
  /** Standings still open when the horizon ran out (including a captain who died
   *  holding one), counted rather than dropped so the exclusion above is auditable
   *  instead of invisible. */
  standingsOpenAtHorizon: number;
}

// ---------------------------------------------------------------------------
// T-1603a (four blocks) · Balance-baseline instrumentation. Same construction as
// the T-1601a/T-1601b blocks above and for the same reason: these are DERIVED,
// UNPERSISTED report fields, folded out of the typed `GameEvent` stream (plus,
// where events cannot say it, pre-action state samples). **No `GameState` field
// is added**, so standing constraint 3's save-migration + round-trip obligation
// does not apply; the report's JSON survival rides the existing byte-identical
// `reportToJson` determinism tests and is additionally asserted directly in
// `packages/sim/src/__tests__/balance-sweep.test.ts`.
//
// Design choice that matters for T-1603b/T-1603c: the two big blocks emit RAW
// RECORDS, not pre-bucketed aggregates. Bucketing (tier parity, prepared/unprepared,
// per-route EV) lives in the pure `./balance/aggregate.js` module, so the tuning
// passes can re-cut the same sweep output without paying for another sweep.
//
// READERS (constraint 7) for all four: `packages/sim/src/balance/sweep.ts` (the
// committed re-runnable sweep) via `summarizeReport`/`aggregate` in
// `packages/sim/src/balance/aggregate.ts`, the assertions in
// `packages/sim/src/__tests__/balance-sweep.test.ts`, and the CLI JSON that
// `reportToJson` emits for `npm run sim`.
// ---------------------------------------------------------------------------

/** T-113b's day-30 Tour One resolution, as the run actually landed it — folded
 *  from the single `TourOneResolved` event (engine `day.ts`, dusk of day 30).
 *
 *  NOTE the distinction from the report's existing `debtClearedDay`: that is the
 *  FIRST day the debt hit zero (which may be day 12, or day 47), while
 *  `outcome` is the day-30 BRANCH the guild actually took. The baseline memo
 *  reports both — they answer different questions ("how fast can a competent
 *  spacer clear it?" vs "did the marker get paid on time?"). */
export interface TourOneOutcomeStats {
  /** `TourOneResolved.day` — 30 by construction, recorded rather than assumed. */
  resolvedDay: number;
  outcome: 'cleared' | 'unpaid';
  /** Debt still owed at resolution — 0 on the cleared path. */
  debtOutstanding: number;
}

/** How a tracked encounter ended. The first five are the engine's own
 *  `EncounterResolved.resolution` union, passed through verbatim. The two extras
 *  are the terminations that emit no `EncounterResolved` at all:
 *   - 'ship-lost'   — a `ShipLost{reason:'combat-defeat'}` killing blow (combat.ts
 *                     returns before emitting a resolution).
 *   - 'unresolved'  — the encounter was still live when the run's horizon ran out,
 *                     or it died with the ship on the life-support dusk path
 *                     (`day.ts` nulls `state.encounter` after succession without a
 *                     resolution event). Never silently dropped: an unresolved
 *                     record is still pushed, so encounter counts stay honest. */
export type CombatEncounterResolution =
  | 'escaped'
  | 'talked-down'
  | 'defeated'
  | 'interceptor-fled'
  | 'interceptor-escaped'
  | 'ship-lost'
  | 'unresolved';

/**
 * T-1603a · One record per encounter the run entered — the raw material for the
 * memo's "combat EV by tier parity" target and for T-1603c's acceptance ("combat
 * EV negative below tier parity without preparation").
 *
 * MEASUREMENT DESIGN — why the cost side is itemised instead of taken as a purse
 * delta. The obvious construction, `credits(close) - credits(open)`, is
 * CONTAMINATED: an encounter opens mid-jump and stays open for one or more whole
 * days, during which a delivery pays out, a port earns, a storylet grants and a
 * dare wins — none of which the fight caused. (Measured on seed 1 / fighter /
 * day 1: a purse delta of +1,700 that is, to the credit, the delivery payment on
 * a contract signed before the interception.) So the EV `./balance/aggregate.js`
 * exports is built from the credit movements the engine attributes to the
 * encounter BY EVENT — tribute, contraband fine, combat fuel, repair, and the
 * succession haircut — and the raw `creditsDelta` is kept only as a labelled
 * diagnostic beside it.
 *
 * The second consequence, and a headline finding for T-1603c: the engine pays
 * NOTHING for winning a fight. There is no bounty, no salvage, no wreck loot
 * (`resolveEncounter` moves disposition and reputation and nothing else; the only
 * salvage table in the game is exploration's). An encounter is therefore pure
 * cost, and `combatEv` is ≤ 0 by construction — so "combat EV negative below tier
 * parity" is not a discriminating test on its own. What discriminates is the
 * MAGNITUDE by parity bucket and by preparation, plus `travelCompleted` (an
 * encounter that ends in a flight also costs the trip).
 */
export interface CombatEncounterRecord {
  /** `EncounterState.id`, so a record can be traced back to its event run. */
  encounterId: string;
  /** Day the encounter opened. */
  day: number;
  /** `EncounterStarted.encounter.interceptor.tier` (1..5). */
  interceptorTier: PowerTier;
  /**
   * T-173 · WHO answered the jump — `EncounterStarted.encounter.interceptor.id`.
   * A named captain's roster id (`npc-…`) or an anonymous roster entry's id.
   * ADDITIVE: nothing above or below this block changed shape.
   */
  interceptorId: string;
  /** T-173 · `…interceptor.source`. The 0.25 named-pool gate in
   *  `selectEncounterInterceptor` (`packages/engine/src/actions/travel.ts`) is a
   *  measurable rate only if the instrument records which side of it each draw
   *  landed on; before this field the four Hangout/disposition probes had to
   *  reconstruct it out of a gitignored `.scratch/` script (BR-13). */
  interceptorSource: 'named' | 'anonymous';
  /** T-173 · The chosen captain's standing toward the PLAYER at the moment of the
   *  draw, or null when the interceptor was anonymous (an anonymous candidate has
   *  no disposition — `chooseWeighted` weights it exactly 1) or when the named
   *  pool could not be reconstructed (see {@link namedPoolReconstructed}). */
  interceptorDisposition: number | null;
  /**
   * T-173 · The dispositions of EVERY candidate the named pool held at the draw,
   * in roster order — `[]` on an anonymous draw.
   *
   * RAW POOL, NOT A WEIGHT OR A LIFT, and deliberately so: the same "raw records,
   * not pre-bucketed aggregates" argument the block comment above makes. From the
   * raw pool, `balance/aggregate.ts` derives the inertness rate (every candidate at
   * 0, so disposition changed nothing), the wronged share, and the ANALYTIC
   * uniform counterfactual — and a future re-cut can derive a different weighting
   * without re-running the sweep. Carrying a pre-computed weight instead would
   * restate `chooseWeighted`'s rule inside the instrument, which is exactly the
   * duplication that makes a before/after comparison unfalsifiable.
   */
  namedPoolDispositions: number[];
  /**
   * T-173 · False iff the chosen NAMED captain was not found in the pool this
   * instrument rebuilt — i.e. the draw came from `selectEncounterInterceptor`'s
   * THIRD, band-widening branch, which fires only when both pools are empty at the
   * target tier and therefore reaches outside the single-tier pool rebuilt here.
   *
   * A FIELD RATHER THAN A FOOTNOTE so the case is COUNTED rather than assumed
   * away: T-125 measured it at 0 of 11,566 named draws. A non-zero is a FINDING to
   * file, never a number to widen a band around. True on every anonymous draw (no
   * pool is claimed, so nothing can be missed).
   */
  namedPoolReconstructed: boolean;
  /** `state.player.tier` sampled at the encounter's open. Tier is STATE, not an
   *  event payload (`tier.ts` `syncPlayerTier` keeps it live at every chokepoint),
   *  so it can only be measured here — the same justification the T-1601a
   *  `upgradedVolleys` sample carries. */
  playerTier: PowerTier;
  /** The fit was better than a junker's when the encounter opened:
   *  `weaponVolleyDamage(pre-action ship) > 1`. By the T-1205 baseline-subtraction
   *  invariant the junker's volley damage is exactly 1, so `> 1` means a bought
   *  weapon tier / STAR_BUSTER was actually in play. This is the memo's
   *  "prepared" axis. */
  prepared: boolean;
  /** Highest `EncounterRound.round` observed (0 if the encounter opened and ended
   *  without a single resolved round). */
  rounds: number;
  /** DIAGNOSTIC ONLY — not an EV input. Credits at close minus credits at open
   *  (open sampled AFTER the batch that triggered the encounter, so the jump's own
   *  fuel bill belongs to the route). Contaminated by whatever else paid out while
   *  the encounter was open; see the block comment above. The memo reports it
   *  beside the attributed cost precisely to show that gap. */
  creditsDelta: number;
  /** Σ `TributePaid.amount` — the talk-down price actually handed over (T-1202
   *  margin-shaved, so this is the paid figure, not `TributeDemanded.amount`). */
  tributeCredits: number;
  /** R2c · `EncounterResolved.salvageCredits` — wreck salvage the player was PAID
   *  for destroying the interceptor (content `COMBAT_SALVAGE_PER_TIER` x tier).
   *  This is the first and only credit INFLOW an encounter can produce, and it is
   *  why `combatEv` is no longer negative by construction. 0 on every resolution
   *  but 'defeated'. */
  salvageCredits: number;
  /** Σ `ContrabandConfiscated.fine` — a patrol scan only ever fires inside an
   *  encounter (`patrol.ts`), so the fine is an encounter cost. */
  fineCredits: number;
  /** Credits burned by the succession haircut when the fight took the ship:
   *  `legacy.ts` halves the purse, so this is read off
   *  `LegacySuccession.inheritedCredits` (the surviving half). Exact for an even
   *  purse and low by 1 for an odd one — the floor's remainder is unrecoverable
   *  from the event, and a 1-credit bias on a five-figure loss is noise. */
  successionCredits: number;
  /** The interrupted jump completed. False only for 'escaped' (the PLAYER fled —
   *  `resolveEncounter` puts the ship back at the origin) and for the unresolved
   *  terminations. The opportunity cost of a fight the player ran from is a
   *  delivery that did not happen, which no credit figure captures. */
  travelCompleted: boolean;
  /** Σ `EncounterRound.fuelUsed` while the encounter was open — the
   *  RUN_FUEL_COST/FIGHT_FUEL_COST burn the fight itself charged.
   *  DOUBLE-COUNT TRAP, checked in `actions/combat.ts`: every `CombatEvent` is
   *  emitted alongside an `EncounterRound` for the SAME round carrying the SAME
   *  `fuelUsed`, so summing both would double the burn. `EncounterRound` is the
   *  one counted because it is also emitted on the paths that have no
   *  `CombatEvent` (the talk-tribute branches). */
  fuelUnits: number;
  /** `fuelUnits` × the local fuel price at the encounter's open — the burn priced
   *  in credits so it can be subtracted from the payout. */
  fuelCredits: number;
  /** Σ `ComponentDamaged.amount` × the damaged component's `strength` on the
   *  PRE-action ship. ENGINE-ANCHORED, not invented: `actions/shipyard.ts`
   *  `repairCost` in 'all' mode charges `(9 - condition) * strength`, i.e. exactly
   *  `strength` credits per condition point restored. This is therefore the price
   *  of undoing the damage the fight did, which is what makes the EV honest rather
   *  than a payout-only number. (Mitigated points are excluded automatically:
   *  `ComponentDamaged.amount` is already net of shields.) */
  repairCredits: number;
  resolution: CombatEncounterResolution;
  /** True iff `resolution === 'ship-lost'` — the career-ending branch, kept as its
   *  own boolean so the death-rate fold does not have to string-match. */
  shipLost: boolean;
}

/** How a signed contract left the hold. 'lost' covers both the succession
 *  forfeit (`TradeEvent{action:'forfeit-cargo'}`, engine `legacy.ts` — PRD §5.2's
 *  "the cargo goes down with the ship") and the rarer storylet
 *  `active-contract-cleared` path, which is detected structurally: a new
 *  sign-contract while a leg is still open means the previous cargo left the hold
 *  without either a delivery or a forfeit. */
export type RouteLegOutcome = 'delivered' | 'lost' | 'open-at-end';

/**
 * T-1603a · One record per signed cargo contract — the raw material for the
 * memo's "route EVs" target and for T-1603b's "no dominant route" acceptance.
 */
export interface RouteLegRecord {
  signedDay: number;
  /** `player.currentSystemId` sampled BEFORE the signing action — the port the
   *  contract was taken at, which is not on the `TradeEvent`. */
  originSystem: number;
  /** `TradeEvent.destination` on the signing. */
  destination: number;
  /** `TradeEvent.cargoType` on the signing (10 === contraband). */
  cargoType: number;
  /** `TradeEvent.payment` on the SIGNING — the quoted price. */
  quotedPayment: number;
  /** `TradeEvent.payment` on the DELIVERY, or null if never delivered. This can
   *  differ from `quotedPayment` under T-1202 margin scaling; that delta is a
   *  MEASUREMENT (the memo reports its distribution), not a defect. */
  paidPayment: number | null;
  deliveredDay: number | null;
  /** Σ `TravelEvent.fuelUsed` between sign and close — the leg's fuel burn,
   *  including any legs flown while the contract sat in the hold. */
  fuelUnitsWhileOpen: number;
  /** `market.localFuelPrice` at the signing port. Carried on the record so
   *  `routeEv` can price the burn WITHOUT a hard-coded credits-per-unit constant;
   *  it is an approximation (the tank may be topped up elsewhere at a different
   *  price mid-leg) and the memo says so where the number is used. */
  fuelPriceAtSigning: number;
  outcome: RouteLegOutcome;
}

/**
 * T-1603a · The death side of the ledger — a pure per-day event fold, which is
 * why (unlike the two record blocks above) it lives in `accumulateMetricEvents`.
 * Deliberately COUNTS ONLY: the memo's death RATE is computed by the sweep from
 * these counts against the sim-day denominator, so no rate is baked into a
 * per-run report where the denominator would be invisible.
 */
export interface SurvivalStats {
  /** `ShipLost` events, any reason. `combatDefeats + lifeSupportFailures` by
   *  construction — the invariant the test asserts, which is what proves the fold
   *  is exhaustive over `ShipLost.reason`. */
  shipsLost: number;
  /** `ShipLost.reason === 'combat-defeat'` — the hull-to-0 killing blow. */
  combatDefeats: number;
  /** `ShipLost.reason === 'life-support-failure'` — the dusk GRIT survival roll. */
  lifeSupportFailures: number;
  /** `LifeSupportCritical{survived:true}` — the ship rode it out. A run with
   *  scares but zero failures is the fingerprint of the T-1804 Auto-Repair
   *  interaction (the module heals lifeSupport 0→1 before the dusk gate), which
   *  T-1603c owns; the memo reports both numbers so the call has evidence. */
  lifeSupportScares: number;
  /** `LegacySuccession` events — successors who claimed the license. */
  successions: number;
}

/** Route-diversity measure over a fixed window of days: how dominant the single
 *  most-frequent best-offer destination was (T-107 sim assertion). A healthy,
 *  churning economy keeps topShare well under 1 — no route stays optimal. */
export interface RouteDiversityWindow {
  windowIndex: number;
  startDay: number;
  endDay: number;
  topDestination: number | null;
  topShare: number;
  sampleCount: number;
}

export interface CampaignStatsReport {
  seed: number;
  days: number;
  policy: SimPolicyName;
  creditsCurve: number[];
  debtClearedDay: number | null;
  /** Days the player ended stranded: even after spending every credit on fuel
   *  they could not afford the cheapest available jump (T-1004). Supersedes the
   *  old `fuel === 0` count, which never fired in 6,000 simulated days. */
  fuelStarvationDays: number;
  flawOverrideRate: number;
  wireVolume: number;
  deedCount: number;
  deedsEarned: string[];
  renownRank: RenownRankId;
  /** Per-100-day route-diversity windows (T-107). */
  routeDiversity: RouteDiversityWindow[];
  /** T-1601a policy-behavior metrics — see the interfaces above for readers. */
  loanUsage: LoanUsageStats;
  fragments: FragmentStats;
  equipmentUse: EquipmentUseStats;
  /** T-1601b policy-behavior metrics — see the interfaces above for readers. */
  smuggling: SmugglingStats;
  hangoutPlay: HangoutPlayStats;
  /** T-173 · Standing as the career moved it — see {@link DispositionStats}. The
   *  capstone instrument's disposition blind spot, closed. */
  disposition: DispositionStats;
  /** T-1603a balance-baseline instrumentation — see the interfaces above for
   *  readers. `tourOne` is null when the horizon never reached day 30. */
  tourOne: TourOneOutcomeStats | null;
  /** T-1604b · Dusks on which the subsistence floor fired (`SubsistenceIncome`
   *  events). Zero on every solvent career; > 0 is the fingerprint of a run the
   *  world had to catch. READERS: the F2 escape regression in
   *  `packages/sim/src/__tests__/protocol.test.ts`, and the CLI JSON that
   *  `reportToJson` emits for `npm run sim`. */
  subsistenceDays: number;
  /**
   * N10 · Offers taken off the player's live board by the cast over the whole run
   * (`ContractClaimed`) — the run total behind `CampaignDayStats.contractsSniped`.
   *
   * READERS (constraint 7): the contract-competition assertions in
   * `packages/sim/src/__tests__/campaign-contracts.test.ts`, the per-policy
   * aggregate `contractClaims` in `balance/aggregate.ts`, and the CLI JSON that
   * `reportToJson` emits for `npm run sim`.
   */
  contractClaims: number;
  /**
   * N11/T-022 · Rank-gated special equipment the SIMULATED field bought over the
   * whole run — the run total behind `CampaignDayStats.npcSpecialEquipmentBought`,
   * summed from that series rather than kept as a second counter.
   *
   * This is the number N11's Simulate clause calls "special-equipment purchase
   * counts", and it is the only field in the report that can say whether the Renown
   * gate T-021 opened is actually being WALKED THROUGH rather than merely offered.
   * A zero here at a 120-day horizon is a finding about reachability, not a quiet
   * absence.
   *
   * READERS (constraint 7): `packages/sim/src/__tests__/campaign-renown.test.ts`,
   * `SeedRow` / `PolicyAggregate` in `balance/aggregate.ts`, and the CLI JSON that
   * `reportToJson` emits for `npm run sim`.
   */
  npcSpecialEquipmentPurchases: number;
  /**
   * N12/T-030 · Port stakes the PLAYER holds at the end of the horizon
   * (`state.player.ports.length`) — the first asset, as opposed to cash, this
   * report has ever carried. N9 measured the port arm as the game's biggest asset
   * lever (22% of fleet cash converted into perpetual dusk income) and the
   * aggregate could not see a single stake; N12 is about to hand the same asset to
   * the cast, so the count has to exist before the sweep that grades it.
   *
   * A STOCK, NOT A FLOW, which is why it is read once off the final state exactly
   * as `finalState.credits` is rather than summed from a per-day series the way
   * `contractClaims` and `npcSpecialEquipmentPurchases` are. Those two count
   * EVENTS, which only a trajectory can hold; a stake is a holding that only ever
   * goes up (ports are buy-only and survive succession via `legacy.ts`), so a
   * 120-entry series would add a number per day to every report to say a thing the
   * milestone samples already say at the days anyone reads.
   *
   * READERS (constraint 7): `packages/sim/src/__tests__/campaign-ports.test.ts`,
   * `SeedRow` / `PolicyAggregate` (`portsOwned`, `portOwnershipRate`) in
   * `balance/aggregate.ts`, and the CLI JSON that `reportToJson` emits for
   * `npm run sim`.
   */
  portsOwned: number;
  combatEncounters: CombatEncounterRecord[];
  routeLegs: RouteLegRecord[];
  survival: SurvivalStats;
  finalState: {
    day: number;
    credits: number;
    debt: number;
    fuel: number;
    systemId: number;
  };
  daily: CampaignDayStats[];
  /**
   * N7 · THE POISON MARK. Present, and only present, when this career did not
   * start at day 1 from `createInitialState` — i.e. when `RunCampaignExtras.
   * startState` supplied a SYNTHESIZED mid-game world (see
   * `balance/synthesize.ts`).
   *
   * It exists to make the smoke rig's honest caveat STRUCTURAL rather than
   * documentary: `balance/aggregate.ts` `summarizeReport` copies it onto the row
   * and `aggregate` THROWS on any row that carries it, so a synthesized run
   * cannot be folded into a baseline — the artefact that grades balance — by any
   * route, including an accidental one. Breakage detection only.
   *
   * `?: true` rather than `: boolean` is deliberate: `JSON.stringify` omits an
   * absent optional, so an ordinary career's report JSON is byte-identical to its
   * pre-N7 self and the pinned fingerprints in `campaign-degraded.test.ts` do not
   * move. READERS: `balance/aggregate.ts` (both functions), `balance/smoke.ts`.
   */
  syntheticStart?: true;
  /**
   * N7 · MILESTONE SAMPLES — the real progression spread a capstone harvests so
   * the smoke fixtures stop being guesses (the worklist's "every capstone run
   * harvests real milestone samples to replace them").
   *
   * Absent unless `RunCampaignExtras.milestoneDays` asked for them, for the same
   * byte-identity reason as `syntheticStart`. READER:
   * `balance/aggregate.ts` `summarizeReport` → `balance/checkpoints.ts`.
   */
  milestones?: MilestoneSample[];
}

/**
 * N7 · One captain-field snapshot, taken at the START of a milestone day — the
 * moment a synthesized tier state has to reproduce.
 *
 * WHAT IS AND IS NOT HERE. Only the fields `balance/synthesize.ts` writes back:
 * a sample is the spec for a synthesized state, so carrying anything the
 * synthesizer cannot restore would invite a reader to believe the synthesis is
 * more faithful than it is. The NPC arrays are the whole roster in roster order.
 *
 * THE MEASUREMENT-ONLY LIST — ruled exceptions to the paragraph above, named one
 * by one so the invariant is never left silently false. Each is carried because a
 * mechanism the instrument cannot see cannot be graded (N9's "the aggregate
 * cannot see an asset"), and each is one the synthesizer refuses on purpose:
 *
 *   * N11/T-022 · `npcDeedCount` and `npcRenownRank`. `synthesize.ts`'s own "NOT
 *     RESTORED" list names the deed registry and the renown rank first, and it is
 *     right to — fabricating deed entries so a synthesized captain could carry a
 *     rank would be authoring content inside a fixture. They are carried anyway
 *     because N11's Simulate clause asks for the CAST's rank distribution at day
 *     30/60/120 and there is no other route to it: the aggregate's `renownRanks`
 *     is the player's.
 *   * N12/T-030 · `player.ports` and `npcPortCount`. The SAME "NOT RESTORED"
 *     bullet names ports verbatim ("Crew, ports, faction reputation, charts, the
 *     nemesis file, storylet history and the event log. All start empty"), and
 *     again it is right to: restoring a stake would hand a fixture a perpetual
 *     dusk income stream (`portDuskIncome`) that no career earned — authoring
 *     content in a test, the same objection that keeps deeds out. They are carried
 *     because N12's sweep has to count an asset it is about to hand the cast, and
 *     the instrument gap has to close BEFORE the capstone, not after.
 *   * N12/T-030, RECORDED RATHER THAN LEFT FALSE · `player.crew` HAS BEEN IN THIS
 *     POSITION SINCE N7 AND THIS COMMENT DID NOT SAY SO. The same NOT-RESTORED
 *     bullet names crew alongside ports, so the "only the fields `synthesize.ts`
 *     writes back" claim above has been untrue for as long as `crew` has been on
 *     this type. Nothing about the field changes here; the claim does.
 *
 * THE CONSEQUENCE A READER MUST NOT MIS-TAKE: because the synthesizer cannot
 * restore any of them, a synthesized captain is a zero-deed LIEUTENANT with NO
 * CREW AND NO PORT. The smoke rig's mid-game tiers therefore do not exercise rank
 * at all — the gap `balance-smoke.test.ts`'s header already declares — and carry
 * no port dusk income and no crew wage either. These five fields are honest only
 * about PLAYED careers.
 */
export interface MilestoneSample {
  day: number;
  player: {
    credits: number;
    debt: number;
    fuel: number;
    maxFuel: number;
    systemId: number;
    tier: number;
    deedCount: number;
    renownRank: RenownRankId;
    /** `max(weapons, hull, shields)` — the combat fit `computePlayerTier` reads. */
    shipRating: number;
    /** The four component strengths a synthesized ship is rebuilt from. Carried
     *  individually rather than as the rating alone because the HULL decides the
     *  fuel tank (`calculateFuelCapacity`): a synthesis that restored the rating
     *  by moving weapons only would hand a tier-5 captain a day-1 tank and the
     *  tier would measure stranding instead of play. */
    weaponsStrength: number;
    hullStrength: number;
    shieldsStrength: number;
    drivesStrength: number;
    cargoPods: number;
    crew: number;
    /** N12/T-030 · `state.player.ports.length` — the stake COUNT, not the stakes.
     *  A count rather than the `PortStake[]` itself because price, per-dusk income
     *  and alliance are content lookups from `PURCHASABLE_PORTS_BY_SYSTEM`
     *  (`PortStake`'s own comment says why they are never denormalized onto the
     *  save), and denormalizing them into a measurement here would be a second
     *  source of truth for tuning that lives in data. */
    ports: number;
  };
  /** Every SIMULATED captain's purse, roster order. The wealth SPREAD across the
   *  field. Simulated, not every record: see {@link sampleMilestone}. */
  npcCredits: number[];
  /** Every simulated captain's hull strength, roster order — the capability their
   *  ship carries. */
  npcHullStrength: number[];
  npcFuel: number[];
  npcSystemId: number[];
  /** N11/T-022 · `registry.earned.length` per simulated captain, roster order —
   *  the deed STOCK behind the rank below, carried separately because the rank is
   *  a step function of it and a distribution over ranks alone cannot say how far
   *  into a rung the field has climbed. */
  npcDeedCount: number[];
  /** N11/T-022 · `registry.renownRank` per simulated captain, roster order. The
   *  cast-side twin of `PolicyAggregate.renownRanks` (the player's), which is what
   *  makes T-023's renown-inflation limb — "does the median captain outrank a
   *  competent player?" — gradeable off ONE artefact. */
  npcRenownRank: RenownRankId[];
  /** N12/T-030 · Port stakes held per simulated captain, roster order — the
   *  cast-side twin of `player.ports` above. IT READS 0 FOR EVERY CAPTAIN TODAY
   *  and that is the correct, expected value: `NpcState` has no `ports` field
   *  until N12 proper lands (see {@link npcPortCount}). It exists NOW so that when
   *  the cast starts buying, N12's sweep can already see its own effect — the
   *  R0a/R2a/N9/N4/N10 blind-spot class, closed ahead of the capstone rather than
   *  after it. */
  npcPortCount: number[];
  /** T-173 · Every simulated captain's standing toward the player at this
   *  milestone day, roster order — index-aligned with `npcCredits`,
   *  `npcRenownRank` and `npcPortCount` above because all of them come out of the
   *  ONE `sampleField` traversal. THE named deliverable of T-173's milestone limb:
   *  the by-day disposition spread, which `SeedRow.disposition`'s run totals
   *  cannot give (a run total cannot say whether the cast's standing had already
   *  decayed away by day 30). Every entry is an integer in [-10, +10] — the
   *  engine's clamp — and every entry is 0 at day 1 by construction. */
  npcDisposition: number[];
}

/** N7 · Optional extras for `runCampaign`. All are absent on every ordinary
 *  call, and all leave the report JSON byte-identical when absent. */
export interface RunCampaignExtras {
  /**
   * Start from THIS state instead of `createInitialState(seed)`. The one and only
   * door to a mid-game start, and it stamps `syntheticStart` on the report —
   * there is deliberately no way to open it without being marked.
   */
  startState?: GameState;
  /** Days (by `state.day`, sampled at dawn before the day is played) to record a
   *  {@link MilestoneSample} for. */
  milestoneDays?: readonly number[];
  /**
   * T-140 · A sink for the dusk's NPC decision traces
   * (docs/BALANCE-TELEMETRY_SPEC.md). Set ONLY by
   * `balance/sweep.ts --trace-npc-decisions`; every other caller of `runCampaign`
   * leaves it absent, and when absent nothing on the day loop's hot path changes —
   * the report JSON is byte-identical, exactly as `milestoneDays` promises above.
   *
   * It is an OBSERVATION channel: the engine reads it to decide whether to build a
   * trace entry, never to decide what a captain does, so a traced run and an
   * untraced run of the same seed play the same career.
   *
   * F-140-3 · THIS FIELD IS WHY `instrumentFingerprint` MOVED, and that is worth
   * saying at the site rather than only in a doc. This file is INSTRUMENT-hashed
   * (`balance/rules-fingerprint.ts`, `SIM_INSTRUMENT_DIRECTORIES`), so adding the
   * field and the branch at the `endDay` call below re-hashed the instrument —
   * which `rules-fingerprint.ts` reads out as "the measurement changed". Here it
   * did not: an untraced 350-run sweep is sha256-identical across the move, and
   * every measured number in `docs/balance/smoke/tiers.json` is unchanged by the
   * re-extraction. See `docs/BALANCE-TELEMETRY_SPEC.md` §7.5 for the evidence and
   * §7.6 for why no arrangement of design (a) or (b) avoids it.
   */
  npcDecisionTrace?: NpcDecisionTraceSink;
}

export type SimPolicy = (context: {
  state: GameState;
  dayIndex: number;
  rng: SeededRng;
}) => PlayerAction[];

type ResolvedPolicy = {
  name: SimPolicyName;
  policy: SimPolicy;
  /** When true, the policy is invoked on the DAWN state (board not yet
   *  generated), exactly as the original three naive policies were — preserving
   *  their byte-for-byte behavior. The competent T-201 policies set this false:
   *  they are invoked on the freshly generated day state so they can read the
   *  live manifest board and dawn hand and actually plan (route/fuel/upgrade). */
  dawnBlind: boolean;
};

type CliResult = RunCampaignOptions | { help: true };

// `satisfies` (not just the annotation) so a name added to `SimPolicyName` but
// forgotten here — or misspelled here — is a compile error rather than a policy
// the CLI silently refuses.
const POLICY_NAMES = [
  'idle',
  'greedy',
  'random',
  'trader',
  'fighter',
  'explorer',
  'veteran',
  'smuggler',
  'gambler',
  'trader-degraded',
] as const satisfies readonly SimPolicyName[];

function isSimPolicyName(value: string): value is SimPolicyName {
  return (POLICY_NAMES as readonly string[]).includes(value);
}

export function systemIds(): number[] {
  return Object.keys(STAR_SYSTEMS)
    .map((id) => Number.parseInt(id, 10))
    .filter((id) => Number.isInteger(id))
    .sort((a, b) => a - b);
}

/** The systems a policy is allowed to name as a travel target — every system
 *  except the T-1101 gated ones (Andromeda / special), which the engine's
 *  destination gate refuses. A picker that targeted a sealed system would burn a
 *  die on an ActionBlocked and, cycling, could stall the default policy. */
export function travelableSystemIds(): number[] {
  return systemIds().filter((id) => !isGatedDestination(id));
}

/** T-1601a: the systems that actually host a Spacers Hangout — the only places
 *  the Penny Wise desk (borrow/repay) is legal, per the engine's `hasHangout`
 *  gate in day.ts. DERIVED from content (`STAR_SYSTEMS[...].hasHangout`), never a
 *  hard-coded id: today Sol-3 is the only one, and a policy that hard-coded `1`
 *  would silently stop finding the desk the moment content flags a second. */
export function hangoutSystemIds(): number[] {
  return systemIds().filter((id) => STAR_SYSTEMS[id]?.hasHangout === true);
}

/** Membership test over `hangoutSystemIds()` — the single derivation both the
 *  policies (borrow/repay preconditions, head-home routing) and any external
 *  caller share, so there is one definition of "where the desk is". */
function isHangoutSystem(systemId: number): boolean {
  return hangoutSystemIds().includes(systemId);
}

/**
 * T-123 · IS PENNY WISE'S DESK ACTUALLY AT THIS PORT? `isHangoutSystem` answers
 * "is there a bar", which used to be the same question — every port offered all
 * seven venues. It is not the same question any more: T-123's Arcturus-6 authors
 * a `venues` list with no `borrow` and no `repay` (§6.2's strict garrison), so the
 * engine now typed-refuses a lending action there with
 * `LoanEvent{failReason:'venue-not-offered'}` BEFORE the die is spent.
 *
 * THIS MIRRORS AN ENGINE GATE, IT DOES NOT ADD ONE — the same relationship
 * `planDare`'s `!npc.dead` guard (F-121-1) has to the resolver's N3 guard, and the
 * same thing `campaign-smuggler-gambler.test.ts`'s "PROOF THE POLICY'S GUARDS ARE
 * THE ENGINE'S GUARDS" asserts. Read through the engine's own `venueOffered`
 * accessor, never against a hard-coded id and never against a restated venue list,
 * so a port that withdraws or restores a desk moves the policy with it.
 *
 * Without it the lending planners would queue an action the engine refuses, which
 * burns a die SLOT out of the day's ledger for nothing — and the trader's and
 * smuggler's "head home to settle up" preferences could steer a repayment run at a
 * port with no desk, which is exactly the compounding-loan pathology the comment
 * above `traderPolicy`'s homeRun documents.
 */
function isLendingDeskSystem(systemId: number, venue: 'borrow' | 'repay'): boolean {
  return isHangoutSystem(systemId) && venueOffered(systemId, venue);
}

export function nextSystemId(currentSystemId: number): number {
  const ids = travelableSystemIds();
  const currentIndex = ids.indexOf(currentSystemId);

  if (currentIndex === -1) {
    return ids[0] ?? currentSystemId;
  }

  return ids[(currentIndex + 1) % ids.length] ?? currentSystemId;
}

function fuelPrice(state: GameState): number {
  return state.market.localFuelPrice || 5;
}

function affordableFuelAmount(state: GameState): number {
  const remainingCapacity = state.player.ship.maxFuel - state.player.ship.fuel;
  const affordable = Math.floor(state.player.credits / fuelPrice(state));
  return Math.max(0, Math.min(100, remainingCapacity, affordable));
}

/** A day the player is stranded: even after spending every credit on fuel they
 *  cannot reach the fuel needed for the CHEAPEST available jump (the nearest
 *  reachable system). Replaces the old `fuel === 0` metric, which never fired
 *  in 6,000 simulated days because every policy keeps the tank topped up — it
 *  measured a state the sim never reaches, not economic hardship (T-1004).
 *  Uses the same `jumpFuelCost` (via `playerJumpFuel`) the engine prices travel
 *  with, so "the cheapest jump" is the exact fuel the resolver would demand. */
export function cannotAffordCheapestJump(state: GameState): boolean {
  const from = state.player.currentSystemId;
  const cheapestJumpFuel = Math.min(
    // Only TRAVELABLE systems (T-1101): a sealed destination is not a jump the
    // player could actually take, so it never counts as "the cheapest jump".
    ...travelableSystemIds()
      .filter((id) => id !== from)
      .map((id) => playerJumpFuel(state, systemDistance(from, id))),
  );
  const ship = state.player.ship;
  const buyable = Math.floor(state.player.credits / fuelPrice(state));
  const maxReachableFuel = Math.min(ship.maxFuel, ship.fuel + buyable);
  return maxReachableFuel < cheapestJumpFuel;
}

function countDailyEvents(events: GameEvent[]): {
  wireEntries: number;
  flawChecks: number;
  flawOverrides: number;
  deedsEarned: string[];
  contractsSniped: number;
} {
  let wireEntries = 0;
  let flawChecks = 0;
  let flawOverrides = 0;
  let contractsSniped = 0;
  const deedsEarned: string[] = [];

  for (const event of events) {
    if (event.type === 'WireEntry') {
      wireEntries += 1;
    } else if (event.type === 'FlawCheck') {
      flawChecks += 1;
      if (!event.resisted) {
        flawOverrides += 1;
      }
    } else if (event.type === 'DeedEarned') {
      deedsEarned.push(event.deedId);
    } else if (event.type === 'ContractClaimed') {
      // N10 · Contract competition had NO sim reader at all before this step:
      // `ContractClaimed` was emitted by `day.ts` and counted by nothing, so N2's
      // "+2.0%" had to be an ad-hoc probe and no baseline has ever carried the
      // number. That gap is the same class as N9's "the aggregate cannot see an
      // asset" — a mechanism the instrument is blind to cannot be graded — and it
      // has to close before this step's own capstone, not after.
      contractsSniped += 1;
    }
  }

  return { wireEntries, flawChecks, flawOverrides, deedsEarned, contractsSniped };
}

/** The seven components a fitted AUTO_REPAIR module regenerates overnight.
 *  MIRROR of engine/src/components.ts `AUTO_REPAIR_COMPONENTS` (which is module-
 *  private): the HULL is deliberately absent in both — the module patches
 *  systems, not the hull. Kept as an explicit mirror so a future divergence in
 *  the engine's list is visible here rather than silently mis-measured. */
const AUTO_REPAIR_SIM_COMPONENTS: readonly ShipComponentId[] = [
  'drives',
  'cabin',
  'lifeSupport',
  'weapons',
  'navigation',
  'robotics',
  'shields',
];

/**
 * N11/T-022 · The RANK-GATED special equipment, read off content by the same
 * filter `considerRefit` uses (`requiredRenownRank !== undefined`) rather than
 * written out as an id list. A newly gated content row therefore joins this
 * instrument for free, and an ungated one can never sneak into a "the gate is
 * reachable" number — which is the whole claim N11 is graded on.
 *
 * The cast today can reach STAR_BUSTER / ARCH_ANGEL (CAPTAIN) and ASTRAXIAL_HULL
 * (TOP_DOG). CLOAKER, AUTO_REPAIR, TITANIUM_HULL and TRANS_WARP are ungated and
 * deliberately absent: counting them would report ordinary yard shopping as
 * evidence that the Renown gate opened.
 *
 * The cast is the same cast as at `npc.ts`'s gated rung, so the cast to
 * `SpecialEquipmentId` is the same assumption made there for the same reason:
 * `SPECIAL_EQUIPMENT` is widened to `id: string` while the engine takes its
 * narrower union. Here the failure mode is milder than the yard's (an unmodelled
 * id makes `hasSpecialEquipment` return false, so it would under-count rather than
 * mis-fit a ship), but the assertion that keeps them honest is the same one: the
 * N11 block in `shipyard.test.ts` drives every gated content row through the real
 * quote and reads the fit back through `hasSpecialEquipment`.
 */
const GATED_SPECIAL_EQUIPMENT: readonly SpecialEquipmentId[] = SPECIAL_EQUIPMENT.filter(
  (entry) => entry.requiredRenownRank !== undefined,
).map((entry) => entry.id as SpecialEquipmentId);

/**
 * N11/T-022 · How many rank-gated items the SIMULATED field is wearing right now.
 * Counted through the engine's own `hasSpecialEquipment` predicate rather than off
 * the raw `hasStarBuster` / `isAstraxialHull` flags, so this cannot drift from
 * what the yard considers fitted, and over the 30 simulated captains only
 * (`isSimulatedCaptain` — the same shared predicate `sampleField` uses, so the
 * scalar describes the same field the milestone arrays do; 41 is the roster and 31
 * is the board).
 *
 * Compared across a dusk, the DIFFERENCE is exactly a purchase count. Three facts
 * make that exact rather than approximate, and all three are properties of the
 * engine as it stands:
 *   1. Captains are born with every special-equipment flag false (`npc.ts`
 *      `npcShipForTier`), so the count starts at 0 and every increment is a `buy`.
 *   2. Gated items are MONOTONE per captain: nothing uninstalls one. The only flag
 *      the engine ever clears is `hasCloaker`, and CLOAKER is ungated, hence
 *      excluded above.
 *   3. Dead captains are SKIPPED, never spliced out of `state.npcs` (`day.ts`),
 *      and `cloneState` hands each snapshot a fresh array of the same records — so
 *      the pre-dusk total and the post-dusk total are over the same 30 captains
 *      and no index can alias a different one. A shrinking roster would make the
 *      delta go negative and is a finding, not a band.
 *
 * WHY A STATE DIFF AND NOT AN EVENT COUNT. `considerRefit` narrates a purchase as
 * a `WireEntry` only — there is nothing typed to fold — which is the same bind
 * `equipmentUse.autoRepairDusks` is in, and it is measured the same way. Emitting
 * a `ShipyardEvent` from the NPC path is RULED OUT rather than merely unused:
 * every existing reader of that event treats it as the player's (including
 * `equipmentUse.specialEquipmentBought` in this file), and it would source
 * `yard_rat` / `cargo_expansion` for the cast — deeds `docs/NPC_REDESIGN.md`'s
 * T-020 rulings reserve for an owner decision, not for an instrument step.
 */
function gatedEquipmentWorn(state: GameState): number {
  let worn = 0;
  for (const npc of state.npcs) {
    if (!isSimulatedCaptain(npc.profileId)) continue;
    for (const equipment of GATED_SPECIAL_EQUIPMENT) {
      if (hasSpecialEquipment(npc.ship, equipment)) worn += 1;
    }
  }
  return worn;
}

/** T-1601b · The one contraband cargo type (content `CARGO_TYPES`, id 10). Only a
 *  port with `allowsContraband` issues it (engine `rollContract`), and it is what
 *  makes a signed run illicit for `isCarryingIllicit`. Named here so the fold
 *  below reads as the pillar rather than as a magic number. */
const CONTRABAND_CARGO_TYPE = 10;

/** T-1601b · The pod-take beat: `derelict.sealed-pod` / choice `take`, the flag
 *  that makes a hold permanently illicit until a scan or Ray clears it. Matched
 *  by CHOICE ID, never by ordinal, so re-ordering the content choices can never
 *  silently turn this into the "leave it" beat. */
const SEALED_POD_STORYLET_ID = 'derelict.sealed-pod';
const SEALED_POD_TAKE_CHOICE_ID = 'take';
/** T-1601b · Smuggler Ray's two fence storylets and their SELL choices (content
 *  storylets.ts). Both are `repeat: 'never'`. Choice ids, not ordinals. */
const FENCE_STORYLET_PREFIX = 'fence.ray.';
const FENCE_SELL_CHOICE_IDS: readonly string[] = ['sell-the-pod', 'fence-the-load'];

/** T-1601a/T-1601b · The run-level behavior metrics one day's events fold into.
 *  Passed as a single accumulator rather than as a growing positional list —
 *  there is exactly one call site (`runCampaign`), so the fold stays readable as
 *  the block count grows. */
interface CampaignMetricAccumulator {
  loanUsage: LoanUsageStats;
  fragments: FragmentStats;
  equipmentUse: EquipmentUseStats;
  smuggling: SmugglingStats;
  hangoutPlay: HangoutPlayStats;
  /** T-173 · Only the `movesByReason` half is folded from events here; the four
   *  state figures and the spans are sampled at DUSK in `runCampaign`'s day loop,
   *  for the reason {@link DispositionStats} states. */
  disposition: DispositionStats;
  /** T-173 · Open standings, npcId → the day the standing opened (0 → non-zero).
   *  Held on the accumulator rather than in the day loop because a standing spans
   *  days, exactly as an encounter does. An entry that never closes is counted as
   *  `standingsOpenAtHorizon` after the loop, never as a truncated span. */
  openStandingDays: Map<string, number>;
  /** T-1603a. `survival` is a plain counter fold like the blocks above.
   *  `tourOne` is a single-shot assignment (the event fires exactly once, at the
   *  dusk of day 30) rather than a counter, so it is a mutable member on the
   *  accumulator itself. The other two T-1603a blocks (`combatEncounters`,
   *  `routeLegs`) deliberately do NOT live here: they need PRE-ACTION state
   *  samples (player tier, weapon fit, local fuel price, origin system) that no
   *  event carries, so they are folded in `runCampaign`'s action loop — the same
   *  reason `upgradedVolleys` is measured there. */
  survival: SurvivalStats;
  tourOne: TourOneOutcomeStats | null;
  /** T-1604b · Dusks on which the engine's subsistence FLOOR fired — i.e. the
   *  career ended a day below content's `SUBSISTENCE_FLOOR_CREDITS` and the world
   *  put it back on the line. A plain counter fold like `survival`, but held on
   *  the accumulator itself (rather than inside one of the sub-objects) because
   *  it belongs to no existing block: it is the machine READER for the new
   *  `SubsistenceIncome` event. Surfaced on the report as `subsistenceDays`. */
  subsistenceDays: number;
  /**
   * T-175 · Settled Liar's Dice hands SO FAR — the sim's own copy of what
   * `player.liarsDiceGamesPlayed` reads, used to derive a hand's unlock tier
   * without opening a fifth live `liarsDiceTier` read (§4.6a). Incremented by the
   * `DareHandResolved` arm AFTER the hand has been attributed, because the hand
   * being settled was opened while the counter still read the pre-increment value.
   */
  settledDareHands: number;
  /**
   * T-175 · Open hands, `handId` → `DareBidPlaced` beats seen so far. Held on the
   * accumulator rather than in the fold, for the same reason `openStandingDays` is:
   * a hand spans event batches. The entry is deleted at settlement, so a career
   * that ends mid-hand leaves at most one live key.
   */
  openDareBids: Map<string, number>;
  /**
   * T-176 · Open hands, `handId` → the actor of the LAST `DareBidPlaced` seen.
   * Parked the same way `openDareBids` is and for the same reason — a hand spans
   * event batches — and read once at settlement, where the CHALLENGER is by
   * construction the other actor (`packages/engine/src/actions/dare.ts`: the
   * player's challenge arm resolves against `hand.bidder`, and the dealer's arm
   * notes "the PLAYER owns the standing bid by construction"). The entry is deleted
   * at settlement, so a career that ends mid-hand leaves at most one live key.
   */
  openDareLastBidder: Map<string, DareChallenger>;
}

/**
 * T-173 · A zeroed counter for every `DispositionChanged.reason` the engine can
 * emit.
 *
 * WRITTEN OUT LONGHAND ON PURPOSE, in place of `Object.fromEntries` over a
 * `const` list: the object literal is checked against
 * `Record<DispositionChangeReason, number>`, so a reason ADDED to the engine's
 * union is a compile error here (missing property) and a reason misspelled here is
 * a compile error too (excess property). A derived list would need a cast, and a
 * cast is exactly how a counter comes to be silently missing — the failure mode
 * the `POLICY_NAMES` `satisfies` idiom below guards against for policy names.
 */
function zeroMovesByReason(): Record<DispositionChangeReason, number> {
  return {
    tribute: 0,
    defeat: 0,
    'player-fled': 0,
    decay: 0,
    storylet: 0,
    'contract-sniped': 0,
    dare: 0,
    befriend: 0,
    insult: 0,
    meet: 0,
    'loan-default': 0,
    'contraband-caught': 0,
  };
}

/**
 * T-173 · The DUSK disposition sample — the half of {@link DispositionStats} no
 * event can answer ("how much of the time does the cast sit at exactly zero?" is a
 * condition, not a beat), folded exactly where `daysWithLoan` and
 * `daysCarryingIllicit` are and for the same reason.
 *
 * Pure: reads the post-dusk state, draws no rng, mutates nothing but the
 * accumulator. Cost is one pass over the 41 roster records per simulated day.
 */
function sampleDispositionAtDusk(state: GameState, metrics: CampaignMetricAccumulator): void {
  const stats = metrics.disposition;
  for (const npc of state.npcs) {
    // A dead captain holds no live standing. Its open span (if any) is left in
    // `openStandingDays` and lands in `standingsOpenAtHorizon` — a standing that
    // ended with the captain rather than with decay is not a measured survival.
    if (npc.dead) continue;
    stats.liveNpcDays += 1;
    const standing = npc.disposition;
    const magnitude = Math.abs(standing);
    if (standing === 0) stats.zeroDispositionNpcDays += 1;
    stats.absDispositionSum += magnitude;
    if (magnitude > stats.peakAbsDisposition) stats.peakAbsDisposition = magnitude;
    const openedOn = metrics.openStandingDays.get(npc.id);
    if (standing === 0) {
      if (openedOn !== undefined) {
        stats.standingSpanDays.push(state.day - openedOn);
        metrics.openStandingDays.delete(npc.id);
      }
    } else if (openedOn === undefined) {
      metrics.openStandingDays.set(npc.id, state.day);
    }
  }
}

/** T-1601a · Fold one day's events into the run-level behavior metrics. Kept as
 *  a SIBLING of `countDailyEvents` (rather than widening it) so that function's
 *  signature and its existing callers stay untouched. Pure: a fold over the
 *  event stream, no rng, so determinism is unaffected. */
function accumulateMetricEvents(
  events: readonly GameEvent[],
  metrics: CampaignMetricAccumulator,
): void {
  const { loanUsage, fragments, equipmentUse, smuggling, hangoutPlay, survival } = metrics;
  for (const event of events) {
    if (event.type === 'ShipLost') {
      // T-1603a. Exhaustive over `ShipLost.reason` — the test pins
      // `shipsLost === combatDefeats + lifeSupportFailures`, so a third reason
      // added to the engine union fails loudly here instead of vanishing.
      survival.shipsLost += 1;
      if (event.reason === 'combat-defeat') survival.combatDefeats += 1;
      else if (event.reason === 'life-support-failure') survival.lifeSupportFailures += 1;
    } else if (event.type === 'LifeSupportCritical') {
      if (event.survived) survival.lifeSupportScares += 1;
    } else if (event.type === 'LegacySuccession') {
      survival.successions += 1;
    } else if (event.type === 'TourOneResolved') {
      // Fires exactly once per career (dusk of day 30). Last write wins, which
      // for a once-only event is the only write.
      metrics.tourOne = {
        resolvedDay: event.day,
        outcome: event.outcome,
        debtOutstanding: event.debtOutstanding,
      };
    } else if (event.type === 'LoanEvent') {
      if (event.kind === 'borrowed') {
        loanUsage.loansTaken += 1;
        loanUsage.principalBorrowed += event.principal ?? 0;
      } else if (event.kind === 'accrued') {
        loanUsage.interestAccrued += event.interest ?? 0;
      } else if (event.kind === 'repaid') {
        loanUsage.amountRepaid += event.amountPaid ?? 0;
        if (event.cleared) loanUsage.loansCleared += 1;
      } else if (event.kind === 'defaulted') {
        loanUsage.defaults += 1;
      }
    } else if (event.type === 'SubsistenceIncome') {
      // T-1604b · the named machine reader for the dusk floor (standing
      // constraint 7). A run with `subsistenceDays > 0` is a run the world had to
      // catch; T-1605b's poverty-trap property test reads the same signal.
      metrics.subsistenceDays += 1;
    } else if (event.type === 'DispositionChanged') {
      // T-173 · One arm, one counter, every reason a key. `reason` is the
      // engine's own union, so this cannot drift: `movesByReason` is typed
      // `Record<DispositionChangeReason, number>` and a reason added to the engine
      // is a compile error at `zeroMovesByReason` below rather than a beat that
      // silently stops being counted.
      metrics.disposition.movesByReason[event.reason] += 1;
    } else if (event.type === 'FragmentAcquired') {
      fragments.acquired += 1;
    } else if (event.type === 'FragmentDecoded') {
      fragments.decoded += 1;
    } else if (event.type === 'ShipyardEvent') {
      if (event.action === 'buy-special-equipment' && event.equipment) {
        equipmentUse.specialEquipmentBought.push(event.equipment);
      } else if (event.action === 'buy-component-tier') {
        equipmentUse.componentTiersBought += 1;
      }
    } else if (event.type === 'ComponentDamaged') {
      equipmentUse.shieldAbsorbedPoints += event.mitigated ?? 0;
    } else if (event.type === 'TradeEvent') {
      // T-1601b: the contraband SUPPLY side. `cargoType` is stamped on the
      // sign/deliver events by the trade + travel resolvers, so the pillar's
      // throughput needs no new state — only a filter on the type-10 runs.
      if (event.success && event.cargoType === CONTRABAND_CARGO_TYPE) {
        if (event.action === 'sign-contract') smuggling.contrabandContractsSigned += 1;
        else if (event.action === 'deliver-cargo') smuggling.contrabandDelivered += 1;
      }
    } else if (event.type === 'ContrabandScan') {
      smuggling.scans += 1;
      if (event.caught) smuggling.scansCaught += 1;
      else smuggling.scansEvaded += 1;
    } else if (event.type === 'ContrabandConfiscated') {
      smuggling.finesPaid += event.fine;
      if (event.confiscatedContract) smuggling.contractsConfiscated += 1;
      if (event.confiscatedPod) smuggling.podsConfiscated += 1;
    } else if (event.type === 'StoryletChoiceResolved') {
      if (
        event.storyletId === SEALED_POD_STORYLET_ID &&
        event.choiceId === SEALED_POD_TAKE_CHOICE_ID
      ) {
        smuggling.podsTaken += 1;
      } else if (
        event.storyletId.startsWith(FENCE_STORYLET_PREFIX) &&
        FENCE_SELL_CHOICE_IDS.includes(event.choiceId)
      ) {
        smuggling.fenceSales += 1;
      }
    } else if (event.type === 'HangoutEvent') {
      if (event.failReason !== undefined) {
        // A typed refusal (no die spent). Counted so a policy whose guards drift
        // out of step with the engine's gates shows up as a number, not silence.
        hangoutPlay.failedVisits += 1;
      } else {
        hangoutPlay.visits += 1;
        if (event.venue === 'dare') {
          hangoutPlay.dares += 1;
          if (event.playerWon) hangoutPlay.daresWon += 1;
          else hangoutPlay.daresLost += 1;
          hangoutPlay.wagered += event.wager ?? 0;
          hangoutPlay.netCredits += event.creditsDelta ?? 0;
        } else if (
          event.venue === 'meet' ||
          event.venue === 'befriend' ||
          event.venue === 'insult'
        ) {
          hangoutPlay.socialBeats += 1;
        }
      }
    } else if (event.type === 'DareHandStarted') {
      // T-168 · THE RAISED-CEILING MEASUREMENT (F-148-4). It folds `DareHandStarted`
      // and not `HangoutEvent` for one structural reason: `HangoutEvent` carries no
      // `systemId`, so there is no band to compare its `wager` against, while
      // `DareHandStarted` carries BOTH `systemId` and the SEATED `seedWager` —
      // post-clamp, which is what "was actually staked" means.
      //
      // The tier-4 ceiling is read through the engine's `effectiveWagerBand`, NOT by
      // restating `LIARS_DICE_RAISED_CEILING_MULT` here. That is an ordinary rule
      // accessor call and not a live-tier read, so §4.6a's closed list is untouched.
      const base = wagerBandFor(event.systemId).max;
      const raised = effectiveWagerBand(event.systemId, 4).max ?? base;
      if (event.seedWager > base) hangoutPlay.handsAboveBaseCeiling += 1;
      if (event.seedWager > raised) hangoutPlay.handsAboveRaisedCeiling += 1;
      hangoutPlay.maxSeedWager = Math.max(hangoutPlay.maxSeedWager, event.seedWager);
    } else if (event.type === 'DareBidPlaced') {
      // T-175 · One beat of the hand, either side. Attributed to a CELL only at
      // settlement, because the cell key needs the pool/archetype/tier that only
      // `DareHandResolved` carries — so the count is parked against the `handId`
      // and joined there. `bid` and every `raise-*` land here alike; that is what
      // "bids per hand" has always meant in §12's tables.
      metrics.openDareBids.set(event.handId, (metrics.openDareBids.get(event.handId) ?? 0) + 1);
      // T-176 · ...and WHO placed it. The last writer wins, which is exactly the
      // semantics `hand.bidder` has in the engine: the standing claim belongs to
      // whoever made the most recent one.
      metrics.openDareLastBidder.set(event.handId, event.actor);
    } else if (event.type === 'DareHandResolved') {
      // T-175 · THE ARCHETYPE-ORDERING SPLIT (F-160-1). Folded off
      // `DareHandResolved` and NOT off `HangoutEvent`, because the pool, the
      // archetype and the frozen `dicePerSide` ride only here.
      //
      // `playerWon` is derived from the ENGINE's `outcome`, never re-derived from
      // the paired `HangoutEvent` — one definition, and `campaign-dare-cells.test.ts`
      // asserts the two agree rather than assuming it.
      const playerWon = event.outcome === 'challenge-win' || event.outcome === 'dealer-fold';
      const tier = derivedDareTier(metrics.settledDareHands);
      // The FREE CORRECTNESS CHECK on freeze-at-open (T-148's precedent): the tier
      // derived from the run's own settled-hand count must imply the dice-per-side
      // the hand actually froze. A non-zero here is a FINDING, not a rounding
      // error, and `campaign-dare-cells.test.ts` asserts it is zero.
      if (event.dicePerSide !== undefined && !dicePerSideAgreesWithTier(event.dicePerSide, tier)) {
        hangoutPlay.dareTierDisagreements += 1;
      }
      // A pre-T-175 event (or a save replayed through an older engine) carries no
      // `opponentKind`. It is attributed to `roaming|none`, the only shape such a
      // stream could have described, and NOT silently dropped — a dropped hand
      // would break `Σ hands === dares`, which is the identity every split rests on.
      const pool: DarePool = event.opponentKind ?? 'roaming';
      const archetype: DareArchetypeSlot = event.opponentArchetype ?? 'none';
      const cell = hangoutPlay.dareCells[dareCellKey(pool, archetype, tier)];
      cell.hands += 1;
      if (playerWon) cell.playerWon += 1;
      cell.netCredits += event.creditsDelta;
      cell.bids += metrics.openDareBids.get(event.handId) ?? 0;
      metrics.openDareBids.delete(event.handId);

      // T-176 · THE CHALLENGER-WON SPLIT AT MATCHED EVIDENCE (F-160-2, §18). Only
      // the two CHALLENGE outcomes reach the body below, and they are the only ones
      // that could: a fold reveals nothing (§6.1), so `dealerDice`/`actualCount` are
      // absent on the other three by design.
      const reading = readDareChallenge(event, metrics.openDareLastBidder.get(event.handId));
      metrics.openDareLastBidder.delete(event.handId);
      if (reading.kind === 'join-miss') {
        hangoutPlay.dareChallengeDisagreements += 1;
      } else if (reading.kind === 'challenge') {
        if (!reading.wellFormed) hangoutPlay.dareChallengeDisagreements += 1;
        const challengeCell =
          hangoutPlay.dareChallengeCells[
            dareChallengeCellKey(
              pool,
              reading.challenger,
              reading.dicePerSide,
              dareKBucket(reading.k),
            )
          ];
        challengeCell.challenges += 1;
        if (reading.challengerWon) challengeCell.won += 1;

        const splitCell =
          hangoutPlay.dareChallengeSplit[
            dareChallengeSplitKey(pool, archetype, reading.challenger)
          ];
        splitCell.challenges += 1;
        if (reading.challengerWon) splitCell.won += 1;
      }
      metrics.settledDareHands += 1;
    }
  }
}

/**
 * T-1603a · The pre-batch state sample the two record blocks need. Events alone
 * cannot say any of these: `player.tier` is state (tier.ts), the weapon fit is
 * state, the local fuel price is market state, and the origin port of a signing
 * is gone from the state by the time the `TradeEvent` lands. `creditsAfter` is
 * read AFTER the batch — an encounter's credit ledger must open on the far side
 * of the travel action that triggered it, so the jump's own fuel bill is charged
 * to the ROUTE and not to the fight.
 */
interface BalanceSample {
  day: number;
  ship: GameState['player']['ship'];
  tier: PowerTier;
  fuelPrice: number;
  systemId: number;
  creditsAfter: number;
  /**
   * T-173 · The roster as it stood when the batch opened — the very array
   * `selectEncounterInterceptor` was handed, since `EncounterStarted` has exactly
   * one emitter (the player's own jump, `actions/travel.ts`) and this sample is
   * taken on the PRE-action state. Read ONLY by the `EncounterStarted` branch of
   * {@link ingestBalanceRecords}, to rebuild the named candidate pool the draw
   * chose from.
   *
   * Carried BY REFERENCE, not copied: the engine clones state per step
   * (`cloneState`), so the pre-action array is already a snapshot nothing will
   * mutate, and copying 41 records per action would be a real cost on the sweep's
   * hot path for no additional truth.
   */
  npcs: readonly NpcState[];
}

/** T-1603a · Mutable state for the encounter/route-leg folds. Both trackers span
 *  DAYS, not batches: an encounter survives the dusk (`applyEncounterDuskPressure`)
 *  and a contract sits in the hold for as long as the run takes, so neither may be
 *  flushed at end-of-day. `runCampaign` flushes what is still open once, after the
 *  horizon, as 'unresolved'/'open-at-end'. */
interface BalanceRecordTracker {
  encounters: CombatEncounterRecord[];
  legs: RouteLegRecord[];
  openEncounter: CombatEncounterRecord | null;
  /** Fuel price at the open encounter's start — `fuelUnits` is priced at it. */
  openEncounterFuelPrice: number;
  /** Credits immediately after the batch that opened the encounter. */
  openEncounterCredits: number;
  /** A `ShipLost` seen this batch whose close is deferred to the end of the batch
   *  so the succession haircut (the very next event) lands on the record. */
  pendingEncounterClose: CombatEncounterResolution | null;
  openLeg: RouteLegRecord | null;
}

/** Take a `BalanceSample` off a state. `creditsAfter` defaults to the same
 *  state's purse; callers folding an ACTION batch pass the post-action purse
 *  while everything else is read off the PRE-action state. */
function balanceSample(state: GameState, creditsAfter = state.player.credits): BalanceSample {
  return {
    day: state.day,
    ship: state.player.ship,
    tier: state.player.tier,
    fuelPrice: fuelPrice(state),
    systemId: state.player.currentSystemId,
    creditsAfter,
    npcs: state.npcs,
  };
}

function newBalanceRecordTracker(): BalanceRecordTracker {
  return {
    encounters: [],
    legs: [],
    openEncounter: null,
    openEncounterFuelPrice: 0,
    openEncounterCredits: 0,
    pendingEncounterClose: null,
    openLeg: null,
  };
}

/** Close whatever encounter is open, stamping its resolution and credit ledger.
 *  A no-op when nothing is open. An encounter is NEVER dropped silently — every
 *  open record reaches `tracker.encounters` through this one door. */
function closeBalanceEncounter(
  tracker: BalanceRecordTracker,
  resolution: CombatEncounterResolution,
  creditsAtClose: number,
): void {
  const open = tracker.openEncounter;
  if (!open) return;
  open.resolution = resolution;
  open.shipLost = resolution === 'ship-lost';
  open.creditsDelta = creditsAtClose - tracker.openEncounterCredits;
  open.fuelCredits = open.fuelUnits * tracker.openEncounterFuelPrice;
  tracker.encounters.push(open);
  tracker.openEncounter = null;
}

/** Close whatever route leg is open. Same single-door rule as encounters. */
function closeBalanceLeg(
  tracker: BalanceRecordTracker,
  outcome: RouteLegOutcome,
  deliveredDay: number | null,
  paidPayment: number | null,
): void {
  const open = tracker.openLeg;
  if (!open) return;
  open.outcome = outcome;
  open.deliveredDay = deliveredDay;
  open.paidPayment = paidPayment;
  tracker.legs.push(open);
  tracker.openLeg = null;
}

/**
 * T-1603a · Fold one batch of events into the encounter/route-leg record streams.
 * Called for the dawn batch, for each action's batch, and for the dusk batch —
 * dusk matters because a bond drive-off resolves an encounter there
 * (`day.ts` → `resolveInterceptorFled`) and the life-support succession forfeits
 * cargo there (`legacy.ts`). Pure: reads events plus an already-taken state
 * sample, draws no rng.
 */
function ingestBalanceRecords(
  events: readonly GameEvent[],
  sample: BalanceSample,
  tracker: BalanceRecordTracker,
): void {
  for (const event of events) {
    if (event.type === 'EncounterStarted') {
      // Defensive: an encounter open when a new one starts cannot be resolved by
      // any event we will ever see, so it is closed as 'unresolved' rather than
      // overwritten (which would lose the record entirely).
      closeBalanceEncounter(tracker, 'unresolved', sample.creditsAfter);
      // T-173 · The interceptor draw, recorded rather than reconstructed later.
      // The named pool is rebuilt EXACTLY as `buildNamedCandidates`
      // (`packages/engine/src/actions/travel.ts`) builds it — live captains whose
      // content profile sits at the chosen tier — off the PRE-action roster, which
      // is the same array `selectEncounterInterceptor` was handed. It draws no rng
      // and mutates nothing; it is a read of the state that produced the event.
      const chosen = event.encounter.interceptor;
      const namedPool =
        chosen.source === 'named'
          ? sample.npcs.filter(
              (npc) =>
                !npc.dead &&
                NPC_PROFILES.find((profile) => profile.id === npc.profileId)?.tier === chosen.tier,
            )
          : [];
      const chosenIndex = namedPool.findIndex((npc) => npc.id === chosen.id);
      tracker.openEncounter = {
        encounterId: event.encounter.id,
        day: sample.day,
        interceptorTier: event.encounter.interceptor.tier,
        interceptorId: chosen.id,
        interceptorSource: chosen.source,
        interceptorDisposition: chosenIndex >= 0 ? namedPool[chosenIndex].disposition : null,
        namedPoolDispositions: namedPool.map((npc) => npc.disposition),
        // True on every anonymous draw (no pool is claimed). On a named draw it is
        // false only for `selectEncounterInterceptor`'s third, band-widening branch
        // — measured at 0 of 11,566 named draws by T-125, and a non-zero is a
        // finding to file rather than a number to accept.
        namedPoolReconstructed: chosen.source !== 'named' || chosenIndex >= 0,
        playerTier: sample.tier,
        prepared: weaponVolleyDamage(sample.ship) > 1,
        rounds: 0,
        creditsDelta: 0,
        tributeCredits: 0,
        salvageCredits: 0,
        fineCredits: 0,
        successionCredits: 0,
        travelCompleted: false,
        fuelUnits: 0,
        fuelCredits: 0,
        repairCredits: 0,
        resolution: 'unresolved',
        shipLost: false,
      };
      tracker.openEncounterFuelPrice = sample.fuelPrice;
      tracker.openEncounterCredits = sample.creditsAfter;
    } else if (event.type === 'EncounterRound') {
      const open = tracker.openEncounter;
      if (open && open.encounterId === event.encounterId) {
        open.rounds = Math.max(open.rounds, event.round);
        open.fuelUnits += event.fuelUsed;
      }
    } else if (event.type === 'ComponentDamaged') {
      const open = tracker.openEncounter;
      if (open && open.encounterId === event.encounterId) {
        // `strength` read off the ship as it stood before this batch — the same
        // number the shipyard would multiply the missing condition by.
        open.repairCredits += event.amount * sample.ship[event.component].strength;
      }
    } else if (event.type === 'TributePaid') {
      const open = tracker.openEncounter;
      if (open && open.encounterId === event.encounterId) {
        open.tributeCredits += event.amount;
      }
    } else if (event.type === 'ContrabandConfiscated') {
      const open = tracker.openEncounter;
      if (open && open.encounterId === event.encounterId) {
        open.fineCredits += event.fine;
      }
    } else if (event.type === 'LegacySuccession') {
      const open = tracker.openEncounter;
      if (open) {
        open.successionCredits += event.inheritedCredits;
      }
    } else if (event.type === 'EncounterResolved') {
      if (tracker.openEncounter?.encounterId === event.encounterId) {
        tracker.openEncounter.salvageCredits += event.salvageCredits ?? 0;
        // Everything but a player flight resumes the interrupted jump
        // (`resolveEncounter` returns early to the origin on 'escaped').
        tracker.openEncounter.travelCompleted = event.resolution !== 'escaped';
        closeBalanceEncounter(tracker, event.resolution, sample.creditsAfter);
      }
    } else if (event.type === 'ShipLost') {
      // 'combat-defeat' is the encounter's own terminus. A 'life-support-failure'
      // at dusk can also kill a ship with a live interdiction — `day.ts` nulls the
      // encounter after succession without ever emitting a resolution — so that
      // record closes as 'unresolved' (and `shipLost` stays false, which is
      // correct: the FIGHT did not take the ship, the air did; the death is
      // counted once, in `SurvivalStats`).
      //
      // DEFERRED CLOSE: the succession haircut arrives on the NEXT event
      // (`applySuccession` is called immediately after this push), so closing here
      // would file the record before its largest cost line existed. The pending
      // resolution is flushed at the end of this batch instead.
      tracker.pendingEncounterClose = event.reason === 'combat-defeat' ? 'ship-lost' : 'unresolved';
    } else if (event.type === 'TravelEvent') {
      if (tracker.openLeg) {
        tracker.openLeg.fuelUnitsWhileOpen += event.fuelUsed;
      }
    } else if (event.type === 'TradeEvent') {
      // NOTE the asymmetry, which is the engine's and not a slip: sign/deliver
      // are `success: true` beats, but the succession forfeit is emitted with
      // `success: false` (`legacy.ts` — losing the cargo is not a success), so it
      // must be matched on the ACTION alone.
      if (event.action === 'forfeit-cargo') {
        closeBalanceLeg(tracker, 'lost', null, null);
      } else if (event.action === 'abandon-contract' && event.success === true) {
        // T-1604b · the player-initiated dump (UGT finding F2) closes the leg
        // 'lost', same as the succession forfeit above — the cargo left the hold
        // without a payday. Handled EXPLICITLY rather than being swept up by the
        // implicit close at the next signing, so the leg is filed on the day it
        // actually ended. This is the named sim reader for the new action value.
        closeBalanceLeg(tracker, 'lost', null, null);
      } else if (event.success !== true) {
        continue;
      } else if (event.action === 'sign-contract') {
        // A leg still open at a new signing means the cargo left the hold without
        // a delivery or a forfeit (the storylet `active-contract-cleared` effect).
        // Recorded as 'lost' rather than dropped.
        closeBalanceLeg(tracker, 'lost', null, null);
        tracker.openLeg = {
          signedDay: sample.day,
          originSystem: sample.systemId,
          destination: event.destination ?? -1,
          cargoType: event.cargoType ?? -1,
          quotedPayment: event.payment ?? 0,
          paidPayment: null,
          deliveredDay: null,
          fuelUnitsWhileOpen: 0,
          fuelPriceAtSigning: sample.fuelPrice,
          outcome: 'open-at-end',
        };
      } else if (event.action === 'deliver-cargo') {
        closeBalanceLeg(tracker, 'delivered', sample.day, event.payment ?? 0);
      }
    }
  }

  if (tracker.pendingEncounterClose !== null) {
    closeBalanceEncounter(tracker, tracker.pendingEncounterClose, sample.creditsAfter);
    tracker.pendingEncounterClose = null;
  }
}

/** Queue an action that really does spend a die, handing it the next unused die
 *  index and refusing once the five-die hand is committed.
 *
 *  T-196b · THE COUNT IS OF DIE ACTIONS, NOT OF ACTIONS. It used to be
 *  `actions.filter(a => a.type !== 'Wait').length`, which was the same number only
 *  while every non-Wait action cost a die. M17 freed nine action types
 *  (docs/DAWN-HAND-REDESIGN.md §3), so a `Trade/buy-fuel` sitting in the batch must
 *  not consume a `spendDie` index — counting it would hand the day's jump index 1
 *  while die 0 sat unspent, and would spend the budget five actions into a day that
 *  had rolled nothing. The filter now names the property it always meant. */
function appendDieAction(
  actions: PlayerAction[],
  makeAction: (spendDie: number) => PlayerAction,
): void {
  const dieActionCount = actions.filter(
    (action) => 'spendDie' in action && action.spendDie !== undefined,
  ).length;

  if (dieActionCount < 5) {
    actions.push(makeAction(dieActionCount));
  }
}

export function availablePlannedActions(state: GameState): PlayerAction[] {
  const actions: PlayerAction[] = [{ type: 'Wait' }];

  if (state.encounter) {
    for (const stance of ['talk', 'run', 'fight'] as const) {
      appendDieAction(actions, (spendDie) => ({
        type: 'Combat',
        stance,
        targetId: state.encounter!.interceptor.id,
        spendDie,
      }));
    }
    return actions;
  }

  const fuelToBuy = affordableFuelAmount(state);
  if (state.player.ship.fuel < state.player.ship.maxFuel && fuelToBuy >= 1) {
    // T-196b: buy-fuel is a FREE ACTION (T-196a freed the engine rule), so it no
    // longer goes through `appendDieAction` at all — the die budget is for jumps
    // and checks. Its REAL bounds are the two already tested on the line above:
    // tank capacity and what the purse can afford. Note the knock-on: because this
    // no longer consumes a `dieActionCount` slot, the `Travel` below now receives
    // `spendDie: 0` on a day that also buys fuel (it used to receive 1).
    actions.push({
      type: 'Trade',
      action: 'buy-fuel',
      fuelAmount: fuelToBuy,
    });
  }

  const destinationId = state.player.activeContract
    ? state.player.activeContract.destination
    : nextSystemId(state.player.currentSystemId);
  appendDieAction(actions, (spendDie) => ({
    type: 'Travel',
    destinationId,
    spendDie,
  }));

  if (state.player.debt > 0 && state.player.credits > 0) {
    actions.push({
      type: 'Trade',
      action: 'pay-debt',
      amount: Math.min(state.player.credits, state.player.debt),
    });
  }

  return actions;
}

export const idlePolicy: SimPolicy = () => [{ type: 'Wait' }];

type StoryletOfferChoice = GameState['storylets']['available'][number]['choices'][number];

function choiceRequiresDie(choice: StoryletOfferChoice): boolean {
  return Boolean(choice.requirements?.spendDie || choice.requirements?.statCheck);
}

function canAffordChoice(state: GameState, choice: StoryletOfferChoice): boolean {
  const credits = choice.requirements?.credits;
  if (!credits) {
    return true;
  }
  if (credits.gte !== undefined && state.player.credits < credits.gte) {
    return false;
  }
  if (credits.lte !== undefined && state.player.credits > credits.lte) {
    return false;
  }
  if (credits.equals !== undefined && state.player.credits !== credits.equals) {
    return false;
  }
  return true;
}

/** Greedy storylet pick: first available offer with an affordable choice,
 *  preferring no-die choices; a die choice spends the lowest die (index 0, the
 *  policy's single die action of the day). Deterministic — content order only. */
function chooseStoryletAction(state: GameState): PlayerAction | null {
  for (const offer of state.storylets.available) {
    const affordable = offer.choices.filter((choice) => canAffordChoice(state, choice));
    const chosen = affordable.find((choice) => !choiceRequiresDie(choice)) ?? affordable[0];
    if (chosen) {
      return {
        type: 'Storylet',
        storyletId: offer.storyletId,
        choiceId: chosen.id,
        ...(choiceRequiresDie(chosen) ? { spendDie: 0 } : {}),
      };
    }
  }
  return null;
}

/** T-1601a · The Sage of Mizar-9's decode storylets (`sage.mizar.decode-first`
 *  and `decode-02..12`, content/storylets.ts) — the game's ONLY decoder. */
const SAGE_DECODE_STORYLET_PREFIX = 'sage.mizar.decode';
/** Mizar-9. Where the Sage keeps the workshop; not a gated destination, so a
 *  plain `Travel` reaches it. */
const SAGE_SYSTEM_ID = 18;

/** T-1601a · `chooseStoryletAction` takes the FIRST offer in board order, which
 *  at Mizar-9 may not be the decode (the Sage also hosts the constellation quiz
 *  and star-lore beats). While the explorer is chasing a decode, prefer a Sage
 *  decode offer; the caller falls back to the ordinary greedy pick. Every decode
 *  storylet's first choice is the die-free `decode`, so this resolves INLINE on a
 *  normal income day — the standalone/inline split is untouched. */
function chooseDecodeStoryletAction(state: GameState): PlayerAction | null {
  for (const offer of state.storylets.available) {
    if (!offer.storyletId.startsWith(SAGE_DECODE_STORYLET_PREFIX)) continue;
    const affordable = offer.choices.filter((choice) => canAffordChoice(state, choice));
    const chosen = affordable.find((choice) => !choiceRequiresDie(choice)) ?? affordable[0];
    if (chosen) {
      return {
        type: 'Storylet',
        storyletId: offer.storyletId,
        choiceId: chosen.id,
        ...(choiceRequiresDie(chosen) ? { spendDie: 0 } : {}),
      };
    }
  }
  return null;
}

export const greedyTraderPolicy: SimPolicy = ({ state }) => {
  if (state.encounter) {
    return [
      {
        type: 'Combat',
        stance: 'talk',
        targetId: state.encounter.interceptor.id,
        spendDie: 0,
      },
    ];
  }

  const storyletAction = chooseStoryletAction(state);
  if (storyletAction) {
    return [storyletAction];
  }

  if (state.player.activeContract) {
    return [
      {
        type: 'Travel',
        destinationId: state.player.activeContract.destination,
        spendDie: 0,
      },
    ];
  }

  const fuelToBuy = affordableFuelAmount(state);
  if (state.player.ship.fuel < 200 && fuelToBuy >= 1) {
    // T-196b · THE RESIDUAL `spendDie: 0` T-196a's compile sweep could not see.
    // `PlayerAction` is a union and `Trade` is one member with several sub-action
    // shapes; TypeScript's excess-property check against a union admits any key
    // that is present in SOME member, and `Trade/haggle` still has `spendDie` — so
    // a `spendDie` on the (now field-less) `buy-fuel` shape compiled clean. The
    // zod schema strips it before the engine sees it, so it was dead payload, but
    // dead payload in a swept instrument is exactly the "field that silently does
    // nothing" M17 exists to remove.
    return [
      {
        type: 'Trade',
        action: 'buy-fuel',
        fuelAmount: fuelToBuy,
      },
    ];
  }

  const actions: PlayerAction[] = [
    {
      type: 'Trade',
      action: 'sign-contract',
      contractIndex: 0,
    },
  ];

  if (state.player.debt > 0 && state.player.credits > 2000) {
    actions.push({
      type: 'Trade',
      action: 'pay-debt',
      amount: Math.min(state.player.credits - 1000, state.player.debt),
    });
  }

  return actions;
};

export const randomLegalActionPolicy: SimPolicy = ({ state, rng }) => {
  const actions = availablePlannedActions(state);
  const index = Math.floor(rng.next() * actions.length);
  return [actions[index] ?? { type: 'Wait' }];
};

// ---------------------------------------------------------------------------
// T-201 · Competent policies. These are the balance instruments — they play the
// game the way a thinking spacer would, using ONLY the day state (fresh board +
// dawn hand) and no external randomness, so a seed reproduces byte-identically.
//
// They are invoked on the POST-startDay state (dawnBlind:false), so they can
// read the live manifest board (choose the best contract), the dawn hand
// (spend the sharpest dice on skill checks and the dull ones on rote actions),
// the local fuel price, and any encounter carried over from the previous dusk.
// ---------------------------------------------------------------------------

/** Whether an action is a legal income-producing / progress move (T-201
 *  poverty-trap definition): signing a contract, travelling toward a delivery,
 *  exploring for salvage/fragments, or engaging combat (fight/talk) for gain.
 *  Buying fuel, paying debt, waiting, or fleeing are not income moves. */
export function isIncomeAction(action: PlayerAction): boolean {
  if (action.type === 'Travel') return true;
  if (action.type === 'Explore') return true;
  if (action.type === 'Trade') return action.action === 'sign-contract';
  if (action.type === 'Combat') return action.stance === 'fight' || action.stance === 'talk';
  return false;
}

/**
 * A per-day die ledger. The dawn hand is sorted DESCENDING (index 0 = the
 * highest-value die), so `takeBest` pops the sharpest remaining die (for skill
 * checks — travel, explore, combat) and `takeWorst` pops the dullest. Returns
 * `undefined` once the hand is exhausted so callers stop queueing actions.
 *
 * T-196b · WHAT `takeWorst` IS STILL FOR. It used to serve "rote actions that
 * roll no check — signing, refuelling, buying upgrades"; M17 freed every one of
 * those (docs/DAWN-HAND-REDESIGN.md §3) and no planner spends a die on them any
 * more. What is left on the dull end are the die-costed verbs a policy wants to
 * take WITHOUT giving up the sharp die the day's real check needs: the veteran's
 * `haggle`, and the Hangout's borrow/repay/dare (T-197's to revisit). Everything
 * this ledger hands out now is a Main Action.
 */
interface DieLedger {
  takeBest(): number | undefined;
  takeWorst(): number | undefined;
  remaining(): number;
}

// ---------------------------------------------------------------------------
// R1 (docs/BALANCE-REDESIGN-WORKLIST.md) · THE HUMAN-PLAUSIBLE PILOT.
//
// The archetype matrix recorded a trader that survived all 1,052 encounters it
// was outgunned in and lost zero ships across 12,000 simulated days. R1 asks the
// one question that decides whether R2 is even the right task: is that record a
// property of the ENGINE (the exit is near-free) or an artifact of a sim policy
// that plays perfectly? The only way to tell them apart is to degrade the pilot
// and re-measure — if a sloppy captain still never dies, the engine is the answer.
//
// TWO CORRECTIONS TO THAT FRAMING, both measured after this policy was written and
// both recorded here so the comment does not outlive its own evidence:
//   * R1 — "survived" is right, "escaped" was not. 979 of the 1,052 ended
//     `talked-down` (paying tribute) and only 62 in flight. The free exit is the
//     PURCHASE, not the getaway.
//   * R0b — "zero ships" was a SAMPLING ARTIFACT of the 100-seed arm. At 1,000
//     seeds the same policy loses 19 ships and 17 of 89,967 routes; its true
//     outgunned `shipLostRate` is 0.00119, whose expected count over a 12,000-day
//     arm is ~1. This policy's answer is unaffected and sharper at the larger n:
//     degraded 0.00899 vs clean 0.00119, a 7.6x separation.
//
// The three slips below are the ones the worklist names, and each is a MISTAKE A
// PLAYER ACTUALLY MAKES, not a random-action generator (a random policy would
// answer a different, useless question):
//
//   1. NOISY DIE ALLOCATION — spending a middling die on the skill check where
//      the optimal line spends the sharpest one. This is the load-bearing slip
//      for R1: the run stance is an OPPOSED PILOT roll (engine `resolveRun`), so
//      a duller die directly lowers the per-round escape chance, and a failed run
//      does not end the encounter — it draws another round of enemy pressure
//      (`continueEncounter`). If escape has a real price, this is where it shows.
//   2. IMPERFECT FUEL RESERVES — topping the tank to just cover today's leg plus
//      a single getaway burn, rather than to the working target. Arriving on a
//      thin tank is what removes the exit: `resolveCombat` refuses a run below
//      RUN_FUEL_COST and a fight below FIGHT_FUEL_COST, so a thin-tanked captain
//      meets an interceptor with talk (tribute) as the only stance left.
//   3. GREEDY CONTRACT OVERREACH — signing the biggest number on the board rather
//      than the best NET run inside the re-flight margin cap (SIGN_FUEL_FRACTION).
//      Long legs, no margin, and sometimes a contract that does not even clear its
//      own fuel bill.
//
// These are POLICY tuning, exactly like TRADER_LOAN_MARKER_WINDOW, and live here
// rather than in packages/content for the same reason: content holds the rules'
// data, not a sim instrument's heuristics. Nothing in the engine or content reads
// them.
//
// DETERMINISM: the slips are drawn from the per-day `rng` `runCampaign` already
// forks for the policy (`seed → 'policy' → day-N → index-N`), never from
// Math.random, so a seed still reproduces a degraded career byte-for-byte. That
// rng is a policy-only fork — drawing from it cannot move any engine roll, so the
// existing policies stay byte-identical (asserted in campaign-degraded.test.ts).
// ---------------------------------------------------------------------------

export interface PilotDegradationProfile {
  /** Chance, per skill-check die pick, that a MIDDLING die is spent instead of
   *  the sharpest remaining one. */
  dullDieChance: number;
  /** Chance, per day, that the refuel is sized to today's leg plus one getaway
   *  burn instead of to the working target — the thin-tank arrival. */
  thinFuelChance: number;
  /** Chance, per day, that the contract choice is made on the RAW payment,
   *  ignoring net value and the re-flight margin cap. */
  overreachChance: number;
}

/** The R1 instrument's calibration. Deliberately CONSERVATIVE: a captain who
 *  misallocates a die on about a third of checks, flies thin on a quarter of
 *  days, and chases the big number on a fifth of them is a plausible human, not a
 *  disaster. Conservatism is what makes the null result strong — if even this
 *  pilot cannot lose a ship, the escape is free at any skill level. */
const DEGRADED_TRADER_PROFILE: PilotDegradationProfile = {
  dullDieChance: 0.35,
  thinFuelChance: 0.25,
  overreachChance: 0.2,
};

/** A profile bound to the day's policy rng. Null everywhere the competent
 *  policies run, which is what keeps them byte-identical. */
interface PilotDegradation {
  profile: PilotDegradationProfile;
  rng: SeededRng;
}

/** Did this day's slip fire? Sole draw site, so every slip costs exactly one
 *  rng value and the draw ORDER is the order the policy asks the questions in. */
function slips(degradation: PilotDegradation | null, chance: number): boolean {
  if (!degradation) return false;
  return degradation.rng.next() < chance;
}

/** `degradation` is null for every competent policy, in which case `takeBest` is
 *  the plain `shift()` it has always been — the byte-identity guarantee. */
function dieLedger(state: GameState, degradation: PilotDegradation | null = null): DieLedger {
  const hand = state.player.dawnHand;
  const available: number[] = [];
  if (hand) {
    for (let index = 0; index < hand.dice.length; index += 1) {
      if (!hand.spent[index]) available.push(index);
    }
  } else {
    for (let index = 0; index < 5; index += 1) available.push(index);
  }
  return {
    takeBest: () => {
      // The hand is sorted DESCENDING, so index 0 is the sharpest die and the
      // MIDDLE of what is left is a genuinely middling one. Guarded at three
      // remaining: with two left the "middle" IS the dullest, which is the die
      // the rote actions are entitled to — a slip that stole it would degrade
      // the day's plan rather than the day's roll.
      if (
        degradation &&
        available.length >= 3 &&
        slips(degradation, degradation.profile.dullDieChance)
      ) {
        return available.splice(Math.floor(available.length / 2), 1)[0];
      }
      return available.shift();
    },
    takeWorst: () => available.pop(),
    remaining: () => available.length,
  };
}

/** Fuel the player's own drives burn on a jump of `dist` — the SAME cost math
 *  the engine prices travel with (single source of truth). */
function playerJumpFuel(state: GameState, dist: number): number {
  const ship = state.player.ship;
  return jumpFuelCost(ship.drives, dist, ship.hasTransWarpDrive ?? false);
}

interface RankedContract {
  index: number;
  destination: number;
  payment: number;
  dist: number;
  fuel: number;
}

/** The manifest board annotated with distance and jump fuel from the current
 *  system, pre-sorted by RAW payment, richest first (board order as the
 *  tiebreak so the choice is deterministic). Note: this is only the raw
 *  pre-ranking — since T-1102 `traderPolicy` re-ranks the reachable subset by
 *  NET value (payment minus fuel burn priced at the local depot) before
 *  signing, so the final choice is made there, not here. */
function rankedContracts(state: GameState): RankedContract[] {
  const from = state.player.currentSystemId;
  return state.market.manifestBoard
    .map((contract, index) => {
      const dist = systemDistance(from, contract.destination);
      return {
        index,
        destination: contract.destination,
        payment: contract.payment,
        dist,
        fuel: playerJumpFuel(state, dist),
      };
    })
    .sort((a, b) => b.payment - a.payment || a.index - b.index);
}

// T-1102: retuned for the fuel-scarcity overhaul. Under the new per-distance
// cost a single rim run can burn ~250+ fuel, so the trader must top off BEFORE a
// big jump rather than after stranding. Threshold raised so a partially-drained
// tank refuels early; target lifted toward the starter ceiling (300) so a rich,
// distant contract is actually fundable in one day.
const FUEL_REFUEL_THRESHOLD = 180;
const FUEL_REFUEL_TARGET = 300;

/** Queue a refuel when the tank dips below the working threshold, buying up to
 *  the target, capped by what's affordable above `keepFloor`.
 *  T-196b: buying fuel is a FREE ACTION (docs/DAWN-HAND-REDESIGN.md §3), so this
 *  planner takes no die and no longer needs the `DieLedger` at all. Its REAL
 *  bounds are unchanged and all still enforced below: tank capacity
 *  (`maxFuel - fuel`), the working target, and the credits left above `keepFloor`.
 *  Returns the action and its credit cost (so debt planning can reserve it).
 *  T-1601a `extraCredits`: credits the day's plan has ALREADY arranged to have on
 *  hand before this action runs (today only: a Penny Wise advance queued earlier
 *  in the same day). The planners are pure and read the DAWN state, so a borrow
 *  the policy has queued but not yet applied has to be passed in explicitly —
 *  otherwise the trader borrows to cover a fuel bill and then refuses to spend
 *  the money it just borrowed. Defaults to 0, so every existing caller is
 *  byte-identical. */
function planRefuel(
  state: GameState,
  keepFloor: number,
  threshold = FUEL_REFUEL_THRESHOLD,
  target = FUEL_REFUEL_TARGET,
  extraCredits = 0,
): { action: PlayerAction; cost: number } | null {
  const ship = state.player.ship;
  if (ship.fuel >= threshold) return null;
  const price = state.market.localFuelPrice || 5;
  const want = Math.min(ship.maxFuel - ship.fuel, target - ship.fuel);
  const spendable = Math.max(0, state.player.credits + extraCredits - keepFloor);
  const affordable = Math.floor(spendable / price);
  const units = Math.min(want, affordable);
  if (units < 1) return null;
  return {
    action: { type: 'Trade', action: 'buy-fuel', fuelAmount: units },
    cost: units * price,
  };
}

// T-1205: a real player repairs a battered ship. Now that enemy fire can chip the
// HULL on any round (seeded component targeting), a junker's hull condition — and
// with it the hull-derived fuel ceiling (maxFuel = (condition+1)·strength·30) —
// can be ground down mid-run, shrinking the tank until no contract is reachable
// and a solvent trader strands rich-but-short-ranged (observed: hull condition 3 →
// maxFuel 120, stuck 7 days with 158k credits). The pre-T-1205 damage rotation
// spared the hull in short encounters, so the policies never needed to repair;
// they do now. This is the "think like a player" fix, not a loosened invariant.
const CRIPPLED_FUEL_FRACTION = 0.7;

/** A repair-all when a chipped hull's fuel ceiling has dropped enough to hamper
 *  the ship AND the repair is affordable above `reserve`. Restores the full tank
 *  in one action so the ship can reach contracts again. Two triggers:
 *   1. the ceiling fell below CRIPPLED_FUEL_FRACTION of pristine (the coarse
 *      "clearly crippled" heuristic), OR
 *   2. T-1302 stranding trigger — the degraded tank can no longer reach the
 *      CHEAPEST contract on the board, but a pristine (condition-9) tank could.
 *      The 0.7 fraction alone misses the boundary case that motivated T-1205:
 *      combat drops the starter hull to condition 6 → maxFuel = 7·1·30 = 210,
 *      exactly 0.7·300, so trigger 1's `>=` lets it slip through — yet 210 is
 *      below the ~286 nearest-contract jump at a Rim system, stranding a solvent
 *      trader for days (seed 2: 5 idle dawns at system 16 with ~33k credits and
 *      a full 210 tank, every board contract 221–494 fuel away). Repairing the
 *      hull restores the 300 tank and reopens the near runs. Reader:
 *      campaign.test.ts poverty-trap invariant (streak < 5).
 *  Returns null when the ship is healthy or the yard bill is unaffordable.
 *  T-196b: the yard is a FREE ACTION (docs/DAWN-HAND-REDESIGN.md §3), so this
 *  takes no die and the `DieLedger` parameter is gone. Its REAL bound is the one
 *  it always had and still enforces: the quoted repair must clear `reserve` out
 *  of the purse. It is still at most ONE repair-all per day by construction —
 *  `crippledRepairNeed` reads the dawn state and returns a single quote. */
function planCrippledRepair(
  state: GameState,
  reserve: number,
  extraCredits = 0,
): PlayerAction | null {
  const need = crippledRepairNeed(state);
  if (!need.needed || !need.repairable) return null;
  if (state.player.credits + extraCredits - need.cost < reserve) return null;
  return { type: 'Shipyard', action: 'repair', repairMode: 'all' };
}

/**
 * T-1601a · The AFFORDABILITY-FREE half of `planCrippledRepair`: do the two
 * crippled triggers hold, is a repair-all otherwise legal, and what does the yard
 * quote? Split out so the trader can ask "the ship needs a repair it cannot pay
 * for" — the §7.5 repair-duress case behind a Penny Wise advance — without
 * burning a die on a plan it is about to reject. `repairable` deliberately treats
 * INSUFFICIENT_CREDITS as repairable (that is precisely the case the loan fixes)
 * while any other yard refusal is not; with `extraCredits === 0` the composition
 * above is byte-identical to the pre-split behavior, because a quote that failed
 * only on credits also fails the `credits - cost < reserve` test.
 */
function crippledRepairNeed(state: GameState): {
  needed: boolean;
  repairable: boolean;
  cost: number;
} {
  const none = { needed: false, repairable: false, cost: 0 };
  const ship = state.player.ship;
  const pristineCapacity = calculateFuelCapacity(ship.hull.strength, 9);
  if (pristineCapacity <= 0) return none;
  const crippled = ship.maxFuel < CRIPPLED_FUEL_FRACTION * pristineCapacity;
  // Cheapest jump-fuel among the contracts currently on the board — the least
  // the tank must hold to fly ANY run from here.
  const from = state.player.currentSystemId;
  const contractFuels = state.market.manifestBoard.map((contract) =>
    playerJumpFuel(state, systemDistance(from, contract.destination)),
  );
  const cheapestContractFuel = contractFuels.length > 0 ? Math.min(...contractFuels) : Infinity;
  // Stranded by a combat-shrunk tank: it can't fly the cheapest contract, the hull
  // is worn (so a repair actually lifts the ceiling), and a pristine tank WOULD
  // reach it (else repairing is futile and we leave the decision to other logic).
  const strandedByTank =
    ship.hull.condition < 9 &&
    ship.maxFuel < cheapestContractFuel &&
    pristineCapacity >= cheapestContractFuel;
  if (!crippled && !strandedByTank) return none;
  const quote = quoteShipyard(state.player, {
    type: 'Shipyard',
    action: 'repair',
    repairMode: 'all',
  });
  const repairable = quote.ok || quote.failure?.reason === 'INSUFFICIENT_CREDITS';
  return { needed: true, repairable, cost: quote.cost };
}

/**
 * Single combat move for the weak-hulled trader/explorer. Resolving an
 * encounter by talk or fight COMPLETES the interrupted delivery; running only
 * escapes back to the origin (delivery lost). So prefer to talk it down when the
 * tribute is affordable and the interceptor will actually take credits; fall
 * back to a getaway otherwise. An unresolved encounter simply carries to the next
 * dawn and is retried, at the cost of one dusk pressure roll.
 *
 * T-199 · THE ONE-ACTION-PER-DAY CAP IS GONE, AND ITS RATIONALE WAS STALE.
 * This comment used to read "Exactly ONE combat action per day — queueing more
 * would crash the moment one resolves the encounter (no encounter left to
 * target)". That crash is no longer reachable from a batch driver: BOTH drivers
 * that apply a policy's plan now skip an orphaned Combat before it reaches the
 * engine — `runCampaign` (this file, "T-1205: a queued Combat can now be orphaned
 * mid-batch") and `driveFrom` (`__tests__/support/campaign-drivers.ts`, T-1603c),
 * each carrying the same `if (action.type === 'Combat' && !dayState.encounter)
 * continue;`. The cap was a workaround for a hazard those two guards removed, and
 * leaving it in place cost a real out (below).
 */
function planPacifistCombat(state: GameState, ledger: DieLedger): PlayerAction[] {
  const encounter = state.encounter;
  if (!encounter) return [];
  const die = ledger.takeBest();
  if (die === undefined) return [{ type: 'Wait' }];
  const targetId = encounter.interceptor.id;

  const round = encounter.round;
  // R0a · ASK THE ENGINE WHAT THE TOLL IS. This used to be a local
  // `Math.min(round * 1000, 10_000)` — the raw round schedule, with neither the
  // class multiplier (TRIBUTE_CLASS_MULTIPLIER: a Reptiloid demands ×2, a Brigand
  // ÷2) nor the tier-gap multiplier (TRIBUTE_TIER_GAP_STEP: up to ×1.75 when the
  // interceptor outranks the player). Against a Reptiloid two tiers up the real
  // demand is ~3.5× what this estimate said, so the policy could — and did —
  // answer "affordable" about a bill the engine was never going to charge.
  //
  // WHY THAT IS A BUG AND NOT AN ACCEPTABLE SIMPLIFICATION. This file's standard
  // is that a planner mirrors the engine gate it is deciding against, so it can
  // never burn a die on a typed refusal — `planLoanBorrow` says exactly that of
  // `resolveVisitHangout`. And the UI already calls this same function
  // (`format.ts` `tributeThisRound`), so a HUMAN player sees the true demand
  // before choosing a stance while the balance instrument did not. An instrument
  // that is wrong about the one number a decision turns on cannot grade a change
  // to that number, which is why this lands ahead of R2/R2.5 (worklist R0a).
  //
  // Sign convention matches `resolveTalk`'s own call: the gap is
  // interceptor.tier − player.tier, positive when the player is outgunned.
  const tribute = tributeForRound(
    round,
    encounter.interceptor.kind,
    encounter.interceptor.tier - state.player.tier,
  );
  const flaw = encounter.interceptor.flaw;
  const refusesTribute = flaw ? Boolean(FLAWS[flaw]?.refusesTribute) : false;
  const canPay = state.player.credits >= tribute;

  if (!refusesTribute && canPay) {
    return [{ type: 'Combat', stance: 'talk', targetId, spendDie: die }];
  }

  // T-199 · THE DAY DOES NOT HAVE TO END AT THE FIRST REFUSED STANCE. Until now
  // this branch played exactly one move — a `run` if the tank could pay for one,
  // otherwise a plea — and then let the encounter carry to the next dawn. That
  // single move is kept, in the same order and on the same die, so a prepared ship
  // still tries the getaway it has always tried. What is added is a SECOND stance
  // behind it, taken only if the first one did not end the encounter (both batch
  // drivers skip an orphaned Combat, see the header).
  //
  // THE SECOND STANCE IS THE PLEA, AND `canPay === false` WAS NEVER THE ENGINE'S
  // GATE ON IT. `canPay` compares the purse to the DEMAND; `resolveTalk`
  // (`engine/src/actions/combat.ts`) charges `paid = max(1, floor(amount × (1 −
  // 0.05 × margin)))` on a success and WAIVES THE TOLL ENTIRELY on a natural 20.
  // So the old code declined a deal the engine might still have closed — the same
  // class of mistake the R0a block above fixed for the demand itself ("an
  // instrument that is wrong about the one number a decision turns on cannot grade
  // a change to that number"), and the same reasoning the dry-tank fallback below
  // already used in its own words ("a nat-20 waves the ship through, and it costs
  // no fuel"). That fallback stops being a dry-tank corner and becomes the general
  // second try.
  //
  // WHY THE GETAWAY STAYS FIRST, and this ordering is MEASURED, not aesthetic. A
  // plea-first version was written and run: it moved
  // `balance-combat-survival.test.ts`'s "preparation pays off when outgunned" band
  // from 0.5333 to 0.4542 against a bar of 0.50 (confirmed causal, not noise, at a
  // 3x-widened sample: 0.4340 over 360 seeds × 60 days, n = 4,636 / 826 in the two
  // graded cells). The mechanism is plain once seen — a PREPARED ship outguns the
  // interceptor and usually escapes, so making it open its purse before it opens
  // the throttle makes it PAY for encounters it used to leave, and the band that
  // exists to say "preparation pays" is exactly the thing that dulls. The band was
  // not moved to accommodate the ordering; the ordering was moved to respect the
  // band.
  //
  // HONEST TRADE-OFF, stated because a reviewer will ask: a `talk` anywhere in the
  // plan makes an encounter-pinned day income-classified (`isIncomeAction` counts
  // Combat talk, not run), so `assertNoIncomeStall` can no longer fire from a
  // carried encounter for the five policies sharing this planner. That is a
  // CONSEQUENCE of the fix, not its justification — the justification is the
  // engine mirror above, and it would stand if the invariant did not exist.
  //
  // REJECTED: `fight` as a last resort. It converts five deliberately pacifist
  // instruments into fighters, moves `ship-loss-share-of-encounters` and
  // `combat-win-share`, and would change what the trader/explorer/smuggler rows
  // measure. NAMED, NOT CLOSED: `refusesTribute` is still a wrong mirror in the
  // other direction — `interceptorRefusesTribute` (`engine/src/rules/combatRules.ts`)
  // is a per-attempt d20 against `flawDc`, not a certainty, so a flawed
  // interceptor is treated here as never negotiable when the engine says
  // "usually not". Left as-is: closing it would widen this change past its root.
  const actions: PlayerAction[] = [];
  if (state.player.ship.fuel >= RUN_FUEL_COST) {
    actions.push({ type: 'Combat', stance: 'run', targetId, spendDie: die });
    // The plea rides the NEXT die. If the hand is empty the getaway simply stands
    // alone, which is exactly what this branch did before.
    const pleaDie = ledger.takeBest();
    if (pleaDie !== undefined) {
      actions.push({ type: 'Combat', stance: 'talk', targetId, spendDie: pleaDie });
    }
    return actions;
  }
  // Dry tank and can't buy the interceptor off at the asking price: plead anyway,
  // on the die the getaway would have used.
  return [{ type: 'Combat', stance: 'talk', targetId, spendDie: die }];
}

/**
 * THE ANTI-IDLE REPOSITIONING BURN, shared. Lifted VERBATIM at T-199 from
 * `fighterPolicy`'s T-159 second pass, whose original reasoning is preserved
 * below word for word because it is the justification for every caller, not just
 * for the fighter:
 *
 *   "NOTHING ON THE BOARD IS FLYABLE AT ALL: FLY HOME. The relaxation above
 *   closes the case where the margin cap is the only thing in the way. It CANNOT
 *   close the harder rim corner, and measurement said so: with the relaxation
 *   alone, seed 35's fighter still sat 8 consecutive zero-income days at Algol-2
 *   (system 20) because after a succession left it on a 240-unit tank and a
 *   junker drive, EVERY leg the board offered cost 252-602 fuel — `reachable` is
 *   empty even at `maxFuel`, so there is no filter to relax.
 *
 *   So this is the gambler's fallback, not the trader's: an explicit ANTI-IDLE
 *   MOVE (`index.ts` gamblerPolicy, "Nothing to fly? Go where the tables are" —
 *   "`Travel` IS an income action, and without it a rich gambler simply stops").
 *   The fighter's version of "where the tables are" is HOMEWARD: the lanes around
 *   the Hangout, where the legs are short enough that a junker drive can fly them
 *   and where the interceptor traffic this policy exists to shoot actually is.
 *
 *   Three guards keep this a repositioning burn and not a metric-gaming twitch:
 *     1. It fires ONLY when the day has queued no income action at all, so it can
 *        never displace a run the fighter could have flown.
 *     2. The destination must be affordable on the tank the day will ACTUALLY
 *        have (`availableFuel`, post-refuel) — never a leg the engine refuses.
 *     3. STRICT PROGRESS: the target must be closer to a Hangout than the current
 *        port is, so a stranded fighter walks in toward the core instead of
 *        ping-ponging between two rim ports to keep an income counter warm."
 *
 * WHY IT IS SHARED NOW (F-199-1). The rim corner T-159 measured is not a fighter
 * property — it is a property of the BOARD, and the 1,000-seed × 35-day sweep
 * caught `traderPolicy` in exactly it (seeds 371 and 571: a full 240/240 tank,
 * `TRADER_RESERVE` in the purse, `reachable` empty even at `maxFuel`, and no
 * anti-idle move of any kind, so the day fell through to a bare `Wait`). Rather
 * than write the same walk out again, T-159's is lifted here unchanged — and the
 * extraction was proven INERT before any new caller was wired in: with the fighter
 * calling this function and nothing else changed, `campaign-degraded.test.ts`'s
 * `fighter` fingerprint came back byte-identical to its pre-T-199 pin and the
 * 200-seed × 35-day strand scan reported the same two offending seeds.
 *
 * CALLERS: `fighterPolicy` (its original home), `traderPolicy` and
 * `smugglerPolicy`. `veteranPolicy` is DELIBERATELY NOT WIRED, and the omission is
 * measured, not forgotten: the veteran is exempt from `assertNoIncomeStall`
 * (`balance/gate.ts` GATE_COMPETENT_POLICIES — "an endgame grinder, not a lean
 * balance instrument"), and wiring it moved `balance-combat-survival.test.ts`'s
 * "preparation pays off when outgunned" band from 0.5333 to 0.4801 against a bar of
 * 0.50 (the veteran is one of that slice's four policies; the trader is not, which
 * is why the trader could be wired and the veteran could not). Carried as an open
 * residual under T-235 (F-199-1) in TASKS.md rather than paid for by moving a band.
 *
 * `refuelCost` is the CREDITS the day has already committed to refuelling; it is
 * converted back to fuel units at the port's price, exactly as the fighter did.
 * Guard 1 is enforced here rather than at the call sites so a new caller cannot
 * forget it. Readers: `assertNoIncomeStall` in `balance/gate.ts`, and the `< 5`
 * poverty-trap invariant in `campaign-policies.test.ts`.
 */
function planHomewardBurn(
  state: GameState,
  ledger: DieLedger,
  actions: readonly PlayerAction[],
  refuelCost: number,
): PlayerAction | null {
  // Guard 1.
  if (state.player.activeContract) return null;
  if (actions.some(isIncomeAction)) return null;

  const from = state.player.currentSystemId;
  const homewardDistance = (systemId: number): number =>
    Math.min(...hangoutSystemIds().map((id) => systemDistance(systemId, id)));
  const boughtFuel = refuelCost > 0 ? refuelCost / fuelPrice(state) : 0;
  const availableFuel = Math.min(state.player.ship.maxFuel, state.player.ship.fuel + boughtFuel);
  const currentHomeward = homewardDistance(from);
  let target: number | null = null;
  let targetHomeward = currentHomeward;
  let targetFuel = Infinity;
  for (const id of travelableSystemIds()) {
    if (id === from) continue;
    const jumpFuel = playerJumpFuel(state, systemDistance(from, id));
    // Guard 2.
    if (jumpFuel > availableFuel) continue;
    const homeward = homewardDistance(id);
    // Guard 3 in code: a candidate no closer to the desk than the current port
    // is not a repositioning burn, it is a twitch, and is never taken.
    if (homeward >= currentHomeward) continue;
    // Closest to the desk wins; ties go to the cheaper burn, then to the lower
    // id (loop order) so the choice is deterministic.
    if (
      target === null ||
      homeward < targetHomeward ||
      (homeward === targetHomeward && jumpFuel < targetFuel)
    ) {
      target = id;
      targetHomeward = homeward;
      targetFuel = jumpFuel;
    }
  }
  if (target === null) return null;
  const die = ledger.takeBest();
  if (die === undefined) return null;
  return { type: 'Travel', destinationId: target, spendDie: die };
}

/**
 * THE SECOND RUNG OF THE ANTI-IDLE FALLBACK (T-199, F-199-2) · WHEN NOT EVEN THE
 * WALK HOME IS FLYABLE. {@link planHomewardBurn} needs one leg the tank can pay
 * for. The harder corner has none: the tank is at max and EVERY leg on the map —
 * contract, homeward or otherwise — costs more than the whole tank, which is the
 * state seed 74's fighter woke into after spending 6,652 → 400 credits at the
 * yard and coming out with a 60-unit tank it could not use and no credits to
 * enlarge it. Twenty-six consecutive zero-income days followed, and no travel
 * rule can reach that: there is nowhere to travel TO.
 *
 * The out that remains is the one verb that costs fuel but no distance. Explore
 * is an income action (`isIncomeAction`), it is what a stranded captain would
 * actually do with a part tank, and the evidence it is enough is `explorerPolicy`
 * itself — which builds a whole career on this verb and never stalls in any
 * window measured for this task (worst zero-income streak 0 over 200 seeds × 35
 * days after the T-199 combat fix).
 *
 * The guards mirror the burn's: it fires only after a day has queued no income
 * action and no leg was flyable, and it is offered only when the engine will
 * actually accept the verb — `EXPLORATION_FUEL_COST` of fuel in the tank and no
 * open recovery (`engine/src/actions/exploration.ts` refuses with
 * `ExplorationFailed{'recovery-in-progress'}`, the same F-116-1 mirror the
 * explorer's and smuggler's own loops carry). One Explore, not a drain loop: this
 * is a last resort, not a strategy, and a stranded captain with a part tank should
 * not spend all of it in a day.
 *
 * CALL IT LAST, AFTER EVERY OTHER DIE-COSTED ACTION IN THE DAY — this is an engine
 * rule, not a preference. A band-3/4 find charges `apCost`: 2 or 3 EXTRA dice out
 * of the same dawn hand, taken AT CLAIM (`engine/src/exploreOutcomes.ts`, owner
 * ruling D1). An Explore placed mid-plan therefore spends dice that later actions
 * in the same batch have already been assigned, and the engine throws `Die already
 * spent` on whichever one follows. Not hypothetical: a first pass at this change
 * put the call before `veteranPolicy`'s yard block and crashed on seed 194, day 22
 * (Explore on die 0, then `buy-cargo-pods` on die 2). `explorerPolicy` and
 * `smugglerPolicy` have always put their Explore loops last for exactly this
 * reason; the tail placement is that same rule, not a new one.
 *
 * ORDERING AGAINST {@link planHomewardBurn} NEEDS NO COORDINATION, even though the
 * two are called from different points in the plan: the walk home is the better
 * out (it reaches ports that have BOARDS on them; an Explore does not move the ship
 * at all), and if it queued a Travel then `actions.some(isIncomeAction)` is already
 * true by the time this runs, so this returns null on its own first guard.
 */
function planStrandedExplore(
  state: GameState,
  ledger: DieLedger,
  actions: readonly PlayerAction[],
): PlayerAction | null {
  if (actions.some(isIncomeAction)) return null;
  if (state.player.recovery !== null) return null;
  if (state.player.ship.fuel < EXPLORATION_FUEL_COST) return null;
  const die = ledger.takeBest();
  if (die === undefined) return null;
  return { type: 'Explore', spendDie: die };
}

/** Amount to pay toward the Guild marker this dusk. Computed from PLAN-TIME
 *  credits minus the operating reserve and the fuel we're about to burn on
 *  refuelling — so even if a delivery is interrupted (no income arrives) the
 *  ledger clamp can never drain the tank below the reserve.
 *  T-1601a `refuelCost` is really "everything already committed this day" (the
 *  refuel, plus any Penny Wise repayment queued ahead of this action), and
 *  `extraCredits` is a Penny Wise advance queued ahead of it — a marker-duress
 *  advance exists precisely so it can reach the Guild. Both default to their
 *  pre-T-1601a values, so existing callers are unchanged. */
function planDebtPayment(
  state: GameState,
  reserve: number,
  refuelCost: number,
  extraCredits = 0,
): PlayerAction | null {
  if (state.player.debt <= 0) return null;
  const spendable = state.player.credits + extraCredits - reserve - refuelCost;
  const amount = Math.min(state.player.debt, spendable);
  if (amount < 1) return null;
  return { type: 'Trade', action: 'pay-debt', amount };
}

// T-1102: raised from 1500. Fuel now costs multiples of the old flat rate, so the
// trader must keep a fatter buffer back from debt payments to fund the next day's
// refuel — otherwise it pays down debt aggressively, then strands with no credits
// to fill the tank for the following run.
const TRADER_RESERVE = 3000;

// ---------------------------------------------------------------------------
// T-1601a · The trader's Penny Wise verbs (PRD §7.5: "a quiet word with Penny
// Wise, who lends at rates that become their own quest line" — one of the bad
// day's three outs). These two numbers are POLICY tuning, not game balance data:
// they say when THIS sim instrument decides a day is bad enough to borrow and
// when it heads home to settle up. Nothing in the engine or content reads them,
// so they deliberately do NOT live in packages/content (constraint 4 cuts both
// ways — content holds the rules' data, not a policy's heuristics). The lending
// RATE/TERM/PRINCIPAL band those loans are priced at is content
// (`content/lending.ts`), and this policy is its first sim exerciser.
// ---------------------------------------------------------------------------

/** How many days before the Guild marker falls due the trader will treat "the
 *  marker is bigger than the purse" as duress worth borrowing against. */
const TRADER_LOAN_MARKER_WINDOW = 6;
/** How many days before a loan falls due the trader starts PREFERRING a run that
 *  ends at a Hangout, so it is standing at the desk with the money in hand. */
const TRADER_LOAN_HOME_WINDOW = 5;

/**
 * A Penny Wise advance sized to the day's shortfall. Preconditions mirror
 * `resolveVisitHangout` + day.ts's hangout/encounter gates exactly, so the policy
 * can never burn a die on a typed refusal: a Hangout system, no live loan, no
 * encounter, a real shortfall, and a die left in the hand. The principal is
 * clamped with the PORT's own band (T-133 / owner ruling D7 — `loanBandFor`, the
 * same accessor the resolver clamps with), never restated numerically here. A
 * policy that asked for the global ceiling at a tight desk would still get a loan,
 * because the engine clamps rather than refuses — but it would MIS-SIZE the day's
 * shortfall plan, which is the F-121-1 "the policy's guards are the engine's
 * guards" argument applied to an amount rather than to a gate.
 *
 * T-197 · NO DIE AT ALL. Borrowing is a Free Action
 * (docs/DAWN-HAND-REDESIGN.md §3) and draws from NEITHER of the two daily caps —
 * §4a's social pool covers meet/befriend/insult only, and §4b's rounds cap covers
 * the dare open only. The desk was always bounded by the single-active-loan slot
 * (the `state.player.loan` guard below, the engine's own `already-has-loan`
 * refusal mirrored) and by the port's principal band, which is exactly why §3
 * ruled it free with no new cap owed. The `DieLedger` parameter is gone with the
 * spend, the T-196b treatment applied to the Hangout.
 *
 * CRITICAL: the caller must queue this as an EXTRA action on an otherwise normal
 * working day, never as a standalone day. A borrow-only day has
 * `incomeActionCount === 0` and would walk the poverty-trap invariant
 * (`longestZeroIncomeStreak < 5`) — the bad-day out must not itself become the
 * bad day.
 */
function planLoanBorrow(
  state: GameState,
  shortfall: number,
): { action: PlayerAction; principal: number } | null {
  if (state.encounter) return null;
  if (state.player.loan) return null;
  // T-123 · mirrors the engine's `venueOffered(systemId,'borrow')` gate in
  // `resolveVisitHangout` — a Hangout is not automatically a credit desk.
  if (!isLendingDeskSystem(state.player.currentSystemId, 'borrow')) return null;
  if (!(shortfall >= 1)) return null;
  const band = loanBandFor(state.player.currentSystemId);
  const principal = Math.max(band.min, Math.min(band.max, Math.ceil(shortfall)));
  return {
    action: { type: 'VisitHangout', venue: 'borrow', amount: principal },
    principal,
  };
}

/**
 * Clear the Penny Wise marker in full while standing at the desk. Two triggers:
 * comfortably (the balance AND the operating reserve are both covered), or
 * urgently — inside two days of the due day, pay it with whatever is on hand
 * rather than let it flip. A default is not a slap on the wrist: it applies
 * LOAN_DEFAULT_DISPOSITION to Penny Wise (grudge-weighting her into the
 * interceptor draw) and multiplies the realized encounter chance by
 * COLLECTION_ENCOUNTER_MULTIPLIER until the balance is cleared.
 *
 * T-197 · NO DIE, AND NO CAP (docs/DAWN-HAND-REDESIGN.md §3/§4a). Repaying is a
 * Free Action outside the social pool: credits and the outstanding balance were
 * always its real bounds, and the engine clamps the payment to
 * `min(requested, credits, outstanding)` regardless.
 */
function planLoanRepay(state: GameState): PlayerAction | null {
  const loan = state.player.loan;
  if (!loan) return null;
  if (state.encounter) return null;
  // T-123 · mirrors the engine's `venueOffered(systemId,'repay')` gate — the
  // garrison mess at Arcturus-6 runs no desk to settle a marker at.
  if (!isLendingDeskSystem(state.player.currentSystemId, 'repay')) return null;
  const outstanding = loan.outstanding;
  if (outstanding < 1) return null;
  const urgent = loan.dueDay - state.day <= 2;
  const affordable = urgent
    ? state.player.credits >= outstanding
    : state.player.credits >= outstanding + TRADER_RESERVE;
  if (!affordable) return null;
  return { type: 'VisitHangout', venue: 'repay', amount: outstanding };
}

// ---------------------------------------------------------------------------
// N9 (docs/NPC_REDESIGN.md) · THE THREE VERBS THE INSTRUMENT NEVER
// PLAYED — `Reroll`, `Crew` and `Port`.
//
// THE DEFECT, as N7 measured it: this file emitted `type: 'Crew'` 0 times,
// `type: 'Port'` 0 times and `type: 'Reroll'` 0 times, across every policy and
// every sweep ever run. All three are first-class `PlayerAction` members the
// engine fully resolves (actions/crew.ts, actions/port.ts), and all three ARE
// advertised by `protocol.ts` — the UGT adapter a human-driven headless client
// plays through. So the GAME supports them and the BALANCE INSTRUMENT never used
// them: `player.crew.length` was 0 at every percentile across 8,000 careers.
//
// This is the same class of defect as R0a (a stale tribute oracle) and R2a (a
// self-imposed upgrade ceiling), one level larger, and it is fixed the same way
// — by letting the instrument play the game a competent player would.
//
// THE STRUCTURAL FACT THAT SHAPES THE WHOLE DESIGN, and the reason these three
// are ONE change rather than three: they are a chain, not a set.
//   * a `Reroll` charge exists only while a crew member GRANTS one — `rollDawnHand`
//     seeds `rerollsRemaining` from `dawnDiceModifiers`, whose only live source is
//     the crew roster (`EQUIPMENT_DICE_BENEFITS` ships empty). No crew, no reroll,
//     ever. That is why the verb had never fired: nothing could have fired it.
//   * a `Crew` hire needs a free CABIN BERTH — `crewCapacity` is
//     `1 + floor(cabin.strength / CREW_PER_CABIN_STRENGTH)`, and the junker cabin
//     berths exactly one. The whole three-role roster needs cabin strength 20,
//     which is yard tier 2 — 50 and 100 credits off `YARD_COMPONENT_TIER_PRICES`,
//     less trade-in. The cheapest unbought progression in the game, and no policy
//     had ever bought it either.
// So "give the policies the crew verb" necessarily means "let them buy berths",
// and "give them the reroll verb" necessarily means "let them hire the reroll
// crew". A design that skipped either link would emit the verb zero times again.
//
// NEVER RESTATE AN ENGINE RULE (R2c's standing warning: the sim's private copy of
// the yard ladder inherited the engine's bug and so agreed with it for the wrong
// reason). Every precondition and every price below is asked of the engine or read
// from content:
//   * berth count → engine `crewCapacity`; next cabin tier → engine
//     `componentTierForStrength`; its price → engine `quoteShipyard` (via
//     `componentTierNetCost`);
//   * hire price / wage / benefit → content `CREW_ROLES`, never a literal;
//   * the reroll floor → engine `dawnDiceModifiers` + `equipmentDiceBenefits`,
//     the exact pair `resolveReroll` applies to a re-rolled die;
//   * the port buy → engine `quotePort(...).ok`, which IS `resolvePortPurchase`'s
//     own rule order and the predicate `protocol.ts` and the UI's ledger pane
//     already gate on;
//   * the two demo locks → engine `demoLocked`, so a policy can never burn a die
//     on a typed `ActionBlocked`.
// The only numbers authored here are POLICY tuning (when a captain judges a hire
// or a stake worth it), which is the same latitude `TRADER_LOAN_MARKER_WINDOW`
// and `FIGHTER_RESERVE` already take, and they live here rather than in
// `packages/content` for the same reason: content holds the rules' data, not an
// instrument's heuristics.
//
// WHO GETS THE VERBS. Every COMPETENT policy (trader, smuggler, gambler, fighter,
// explorer, veteran) plus `trader-degraded`, which is the trader's own planner
// with R1's slips layered on and must not be allowed to diverge strategically
// from the captain it degrades. `greedy` is deliberately UNTOUCHED: it runs
// `greedyTraderPolicy`, a separate function, and R0a used exactly that separation
// as the control proving a sweep diff came from one code path and nothing else.
// It is the cautionary control here too, and a byte-identical `greedy` row is
// this change's proof of attribution.
// ---------------------------------------------------------------------------

/** Faces on the die the engine deals a dawn hand from (`SeededRng.d20`). Not a
 *  balance number — the identity of the die — and the sole reason it is named
 *  here is that `expectedFreshDieFace` has to integrate over it. */
const D20_FACES = 20;

/**
 * The expected face of a FRESHLY re-rolled die, under whatever floor the captain
 * currently has. `resolveReroll` computes its result as `max(rng.d20(), floor)`
 * with the floor taken from `dawnDiceModifiers(crew, equipmentDiceBenefits(ship))`
 * — so this asks those same two engine functions rather than assuming 10.5, and a
 * captain who hires the floor crew correctly values their re-rolls higher
 * (floor 5 → 11.0 rather than 10.5).
 */
function expectedFreshDieFace(state: GameState): number {
  const { floor } = dawnDiceModifiers(state.player.crew, equipmentDiceBenefits(state.player.ship));
  let total = 0;
  for (let face = 1; face <= D20_FACES; face += 1) total += Math.max(face, floor);
  return total / D20_FACES;
}

/**
 * Spend a re-roll charge on the SHARPEST unspent die when that die is worse than
 * a fresh one would be expected to be.
 *
 * WHY THE SHARPEST AND NOT THE DULLEST. The hand is dealt descending, and every
 * planner in this file spends `takeBest()` (index 0) on the day's actions that
 * actually roll a check — the jump, the stance, the sweep. Improving the dull end
 * buys nothing at all; improving the top of the hand is the whole value of the
 * charge. And if the sharpest die is below the expected fresh face, so is every
 * other die in the hand, so the re-roll is +EV by construction.
 *
 * T-196b: this used to add "and `takeWorst()` on the rote ones (sign, refuel,
 * yard, hire), which roll nothing" — M17 freed all four, so they take no die at
 * all now and the dull end serves only `haggle` and the Hangout verbs. The
 * conclusion is unchanged and, if anything, stronger.
 *
 * COSTS NO DIE — only a `rerollsRemaining` charge (engine `resolveReroll`), so
 * this never competes with the day's income actions and takes nothing from the
 * ledger. It must be queued FIRST in the batch, because it rewrites the face at
 * `dieIndex` IN PLACE and every later action in the plan names dice by index.
 *
 * THE HONEST LIMITATION, stated because it makes this policy strictly WEAKER than
 * the human it models: `runCampaign` asks a policy for the whole day's batch at
 * dawn and then applies it, so the re-roll is committed BLIND — the planner never
 * sees the new face and cannot re-plan around it, where a player at the HandDock
 * does. The instrument therefore under-states the verb's value; it cannot
 * over-state it.
 *
 * Preconditions mirror `resolveReroll` exactly (a hand, a banked charge, an
 * in-range unspent index), so the action can never resolve to a typed
 * `DiceRerolled{failReason}`.
 */
function planReroll(state: GameState): PlayerAction | null {
  const hand = state.player.dawnHand;
  if (!hand) return null;
  if ((hand.rerollsRemaining ?? 0) <= 0) return null;
  const dieIndex = hand.spent.findIndex((spent) => !spent);
  if (dieIndex < 0 || dieIndex >= hand.dice.length) return null;
  if (hand.dice[dieIndex] >= expectedFreshDieFace(state)) return null;
  return { type: 'Reroll', dieIndex };
}

/**
 * Queue today's re-roll, if one is worth a charge, AHEAD of the plan it is meant
 * to improve. Every competent policy funnels its returns through this, including
 * the encounter and single-storylet branches — a weak top die matters most on
 * exactly the days that come down to one check. `Reroll` costs no die and is
 * exempt from day.ts's active-encounter block (T-1306), so prepending it is
 * always legal and never displaces an income action.
 */
function withReroll(state: GameState, actions: PlayerAction[]): PlayerAction[] {
  const reroll = planReroll(state);
  return reroll ? [reroll, ...actions] : actions;
}

/** Days of payroll a captain wants covered, on top of the operating reserve,
 *  before signing a hand. Not arbitrary: an unpayable crew WALK at dusk (day.ts
 *  endDay dismisses the whole roster and charges nothing), and the hire price is
 *  not refunded — so hiring into a purse that cannot make payroll burns the fee
 *  outright. Ten days is a working stretch either side of one bad run. */
const CREW_WAGE_RUNWAY_DAYS = 10;

/** How many times over the free capital must cover a port stake before a captain
 *  buys one. A stake is ILLIQUID and, at R2d's 1991 price curve, pays back in
 *  154–1,043 dusks — far beyond a 120-day sweep — so it is bought as a status and
 *  control asset out of genuine surplus, never out of working capital. Halving
 *  the surplus is the plainest form of "don't put more than half your free money
 *  into one thing you cannot sell". */
const PORT_SURPLUS_COVER = 2;

/**
 * Rank the dice benefits a hire can grant, strongest first, by KIND — never by
 * role id, so a content edit that re-prices or renames a role, or adds a fourth,
 * needs no change here.
 *   0 `extra-die` — a whole extra action every day for the rest of the career.
 *   1 `reroll`    — one targeted re-draw a day on the die that carries the check.
 *   2 `floor`     — a smaller uplift, but on EVERY die; it also removes the nat-1
 *                   auto-fail (`check()`), which is why it is not last by much.
 */
function crewBenefitRank(benefit: DiceBenefit): number {
  if (benefit.kind === 'extra-die') return 0;
  if (benefit.kind === 'reroll') return 1;
  return 2;
}

/** One captain's-overhead purchase, priced before it is committed. T-196b: the
 *  builder takes no argument — all three verbs (berth tier, crew hire, port
 *  stake) are Free Actions and their shapes carry no `spendDie`. */
interface OverheadPick {
  cost: number;
  make: () => PlayerAction;
}

/** What `planCaptainOverhead` decided: the queued actions and the credits they
 *  commit, so the caller can hold that money back from the Guild marker exactly
 *  as it already holds back the refuel. */
interface CaptainOverhead {
  actions: PlayerAction[];
  cost: number;
}

const NO_OVERHEAD: CaptainOverhead = { actions: [], cost: 0 };

/**
 * Buy the next cabin tier — the BERTHS the crew roster needs. Fires only once the
 * berths already fitted are full, so a captain never buys space before filling
 * the space they have. Stops at `CREW_ROLES.length`: there is no reason to fit a
 * cabin larger than the whole hireable roster, and doing so would be exactly the
 * "buy it because it is buyable" behaviour R2a's ceiling finding warns against in
 * the other direction.
 */
function planBerthUpgrade(state: GameState, spendable: number): OverheadPick | null {
  const ship = state.player.ship;
  const berths = crewCapacity(ship);
  if (berths >= CREW_ROLES.length) return null;
  if (state.player.crew.length < berths) return null;
  const tier = componentTierForStrength(ship.cabin.strength) + 1;
  if (YARD_COMPONENT_TIER_PRICES[tier - 1] === undefined) return null;
  const cost = componentTierNetCost(state, 'cabin', tier);
  if (!Number.isFinite(cost) || cost > spendable) return null;
  return {
    cost,
    // T-196a: the shipyard is FREE, so the builder takes no die; T-196b removed
    // the die budget in `planCaptainOverhead` that used to ration it. The
    // ONE-per-day rule there is not a die rule and survives untouched.
    make: () => ({
      type: 'Shipyard',
      action: 'buy-component-tier',
      component: 'cabin',
      tier,
    }),
  };
}

/**
 * Sign the strongest hand the purse can carry and the cabin can berth.
 *
 * PRIORITY ORDER IS CONTENT'S OWN CLAIM, not an invention here: crew.ts prices
 * "the extra-die Second [as] the dearest (the strongest benefit — a whole extra
 * action's worth of die), the navigator's re-roll mid, and the quartermaster's
 * floor the cheapest", and `crewBenefitRank` reads that ordering off the benefit
 * KIND so a content re-price cannot desynchronise it.
 *
 * Preconditions mirror `resolveCrew` + day.ts's demo gate exactly — the role
 * exists and is not aboard, a berth is free, the price is covered — so the hire
 * can never resolve to a typed `CrewEvent{failed}` or `ActionBlocked`.
 */
function planCrewHire(state: GameState, spendable: number): OverheadPick | null {
  if (demoLocked(state, 'crew-progression')) return null;
  const crew = state.player.crew;
  if (crew.length >= crewCapacity(state.player.ship)) return null;
  const aboard = new Set(crew.map((member) => member.roleId));
  const wanted = CREW_ROLES.filter((role) => !aboard.has(role.id)).sort(
    (a, b) => crewBenefitRank(a.benefit) - crewBenefitRank(b.benefit),
  );
  for (const role of wanted) {
    if (role.hirePrice + role.dailyWage * CREW_WAGE_RUNWAY_DAYS > spendable) continue;
    return {
      cost: role.hirePrice,
      // T-196a: a hire is FREE now — no die in the built action.
      make: () => ({ type: 'Crew', action: 'hire', roleId: role.id }),
    };
  }
  return null;
}

/**
 * Buy the controlling stake in the port the captain is STANDING IN — the only
 * port `resolvePortPurchase` will sell them.
 *
 * The legality test is `quotePort(...).ok`, which is the engine's own preview and
 * runs `resolvePortPurchase`'s rules in its own order (at-port, purchasable, not
 * already owned, affordable). Nothing about the port ladder is restated here.
 *
 * One COMPETENCE rule on top of legality — the marker-first rule that gates all
 * three verbs lives in `planCaptainOverhead`, and content's ports.ts states it
 * for this one directly ("the cheapest stake is a deliberate trap DURING [Tour
 * One] — 65cr/dusk against a 25,000cr marker on a 30-day clock never pays"): the
 * stake must cost no more than 1/PORT_SURPLUS_COVER of the free capital.
 *
 * STATED PLAINLY, because it is the thing to read this arm's numbers against:
 * inside a 120-day window a stake is a NET CREDIT LOSS at R2d's prices — the
 * shortest payback on the board is 154 dusks. A captain buys one because the
 * career is longer than the measurement, and the sweep will score that as
 * poorer. That is a true consequence of the shipping price curve, not an
 * instrument defect, and it is why this verb is graded as its own arm.
 */
function planPortStake(state: GameState, spendable: number): OverheadPick | null {
  if (demoLocked(state, 'port-ownership')) return null;
  const systemId = state.player.currentSystemId;
  const quote = quotePort(state, systemId);
  if (!quote.ok) return null;
  if (quote.cost * PORT_SURPLUS_COVER > spendable) return null;
  return {
    cost: quote.cost,
    // T-196a: a port buy is FREE now — no die in the built action.
    make: () => ({ type: 'Port', action: 'buy', systemId }),
  };
}

/**
 * THE CAPTAIN'S OVERHEAD — at most ONE purchase a day, after the day's income
 * actions are already queued, and only out of the surplus left once the whole
 * Guild marker is held back.
 *
 * THE MARKER-FIRST RULE IS THE HOUSE RULE, and it is recorded here with the
 * measurement that put it back, per BALANCE-POLICY Part B rule 3. It is the same
 * rule R2c imposed on the fighter's kit after an ungated version spiralled to a
 * 4,253,290-credit marker, and the same one `traderPolicy` states at its rim
 * preference: the marker "is the Tour One failure condition and the acceptance's
 * clear-rate band, so the trader finishes paying the Guild before it starts
 * flying the long, expensive, lucrative rim legs."
 *
 * THE COUNTER-ARGUMENT WAS TRIED FIRST AND MEASURED FALSE. This planner was
 * originally written WITHOUT the gate, on the argument that crew are a throughput
 * purchase — an extra die is an extra contract, which is how the marker gets paid
 * — and that 7,500 credits of hiring is nothing beside a 100,000-credit kit
 * ladder. A full capstone (1,000 seeds x 120 days, N9 arm `n9-crew`) says
 * otherwise, and says it in the fuel:
 *   * trader clear rate 0.916 -> 0.759, clear day 21 -> 25, final credits
 *     80,305 -> 63,892, fuel-starved days/career 0.14 -> 1.08;
 *   * smuggler clear rate 0.535 -> 0.210, clear day 30 -> 44, ships lost
 *     72 -> 204; fleet ships lost 571 -> 816.
 * The mechanism is the one R2c already documented: credits spent before the
 * marker clears are credits the marker then compounds against, the flagged board
 * pays worse, and a captain who cannot fill the tank meets interceptors with
 * tribute as the only stance left. The throughput premise ALSO failed on its own
 * terms — the trader's day is a two-run plan that uses at most five dice, so the
 * sixth die a First Officer grants buys it no extra contract at all. Both halves
 * of the argument for skipping the gate are therefore refuted, and the gate goes
 * back where every other discretionary purchase in this file already has one.
 *
 * Two further properties, each deliberate:
 *   * ONE per day, and this survives M17 intact. Berths, hires and stakes all
 *     read the DAWN state, so two in a batch would be planned against
 *     preconditions the first one has already moved (a hire into a berth the same
 *     batch is still buying). Mirroring the engine exactly means planning against
 *     the state the engine will see. The die was never what enforced this, so
 *     "no longer costs a die" does NOT become "may be taken N times".
 *   * LAST in the plan, so it can never displace an income action.
 *
 * T-196b · THE OLD THIRD PROPERTY IS GONE AND ITS RATIONALE MUST NOT SURVIVE IT.
 * This block used to read "DULLEST die … LAST in the plan, so the ledger is
 * already empty on a full working day and the shopping simply does not happen.
 * That is what keeps `incomeActionCount` where it was and the poverty-trap
 * invariant (`longestZeroIncomeStreak < 5`) untouched." Both halves are now
 * false: berths, hires and stakes are Free Actions (docs/DAWN-HAND-REDESIGN.md
 * §3), so there is no ledger left to be empty and the shopping DOES happen on a
 * full working day. The invariant is untouched for a stronger reason than the old
 * accident of ordering: this planner consumes NO die at all, so it cannot take
 * one from an income action however busy the day is. `incomeActionCount` counts
 * sign/Travel/Explore/fight-or-talk (`isIncomeAction`) and none of the three
 * verbs here is one — they neither add to it nor subtract from it. What DID
 * change, and is the single biggest mechanism in this arm's sweep, is the
 * FREQUENCY: the throttle was real, and these three verbs now fire on every day
 * where `spendable > 0` rather than only on days the working plan left a die.
 *
 * `committed` is the credits the rest of today's plan has already spent (refuel,
 * repayment, yard, less any advance), so affordability is judged on what will
 * really be in the purse, not on the dawn balance. Callers that can now queue
 * several freed purchases in one day MUST thread their running total through it —
 * before M17 the die scarcity made that collision rare; it is the common case now.
 */
function planCaptainOverhead(state: GameState, reserve: number, committed = 0): CaptainOverhead {
  if (state.encounter) return NO_OVERHEAD;
  // THE MARKER COMES OUT FIRST. `spendable` is what is left after the operating
  // reserve, what the rest of today's plan has already committed, AND THE WHOLE
  // OUTSTANDING GUILD MARKER — see the block comment above for the capstone that
  // put this term back. Expressed as a hold rather than a hard `debt === 0`
  // block on purpose: a captain sitting on 60,000 credits against a 25,000
  // marker is not being reckless by signing a 3,000-credit second, and a hard
  // block would silence all three verbs for the whole career of any policy that
  // never clears (the explorer clears on 0.00 of seeds, the veteran on 0.001) —
  // which would re-create the exact blind spot this step exists to remove.
  // Callers that can carry a Penny Wise balance pass it inside `reserve`, the
  // same way they already do for `planDebtPayment`.
  const spendable = state.player.credits - committed - reserve - state.player.debt;
  if (spendable <= 0) return NO_OVERHEAD;

  const pick =
    planBerthUpgrade(state, spendable) ??
    planCrewHire(state, spendable) ??
    planPortStake(state, spendable);
  if (!pick) return NO_OVERHEAD;
  return { actions: [pick.make()], cost: pick.cost };
}

// T-1102: the largest share of the tank a single contract's jump may cost. Below
// 1.0 so a run leaves fuel/credit margin to re-fly after an encounter-run and to
// pay tribute — the headroom that keeps the scarcity economy out of deadlock.
// Shared by the trader and veteran contract pickers.
const SIGN_FUEL_FRACTION = 0.6;

/**
 * TRADER — route + fuel planner that pays down the Guild marker. Each day it
 * keeps the tank topped, signs the richest contract on the board and flies it to
 * delivery the SAME day (a second run too while the debt is still heavy and the
 * hand/tank allow), then remits everything above a fuel reserve toward the debt.
 * Weak hull, so it talks its way past interceptors rather than fighting.
 *
 * T-1601a adds the two verbs a working rim trader actually uses: once the Guild
 * marker is cleared it PREFERS a rim run over a core one inside the same fundable
 * set ("one more run to the rim", PRD §1/§9), and on a bad day at a Hangout it
 * takes a Penny Wise advance (PRD §7.5) sized to the day's shortfall, protects
 * the repayment from the marker, and clears the balance at the desk before the
 * term runs out.
 */
export const traderPolicy: SimPolicy = ({ state }) => planTraderDay(state, null);

/** The trader's whole day, parameterised by the R1 degradation. `degradation`
 *  is null for the shipped `trader` — every branch below then takes the exact
 *  path it took before R1, which is why the trader's sweep numbers are unchanged
 *  (pinned in `campaign-degraded.test.ts`). */
function planTraderDay(state: GameState, degradation: PilotDegradation | null): PlayerAction[] {
  const ledger = dieLedger(state, degradation);
  if (state.encounter) return withReroll(state, planPacifistCombat(state, ledger));

  const ship = state.player.ship;
  const from = state.player.currentSystemId;
  const actions: PlayerAction[] = [];

  // T-1102: under the per-distance fuel cost, a jump can cost more than the idle
  // refuel threshold would ever top up — so the DESTINATION is chosen first and
  // the refuel is sized to guarantee the tank can actually make that jump. This
  // is the fix for the scarcity deadlock: a carried-over contract whose leg costs
  // (say) 228 fuel while the tank sits at 192 — above the flat threshold, so no
  // top-up fires — otherwise strands the trader forever (a dry-tank Travel is a
  // no-op that burns nothing, so the state never changes).
  // T-1102: under scarcity the richest contract is often a far one whose fuel
  // bill (and stranding risk) dwarfs a nearer, only-slightly-poorer run. Rank the
  // reachable board by NET value — payment minus the fuel the jump burns at the
  // local depot price — so the trader flies efficient runs it can actually fund,
  // and never signs a loss.
  const fuelDepotPrice = state.market.localFuelPrice || 5;
  const ranked = rankedContracts(state); // fuel = cost from the CURRENT system
  // Cap the fuel a single signed run may cost at a fraction of the tank. The
  // margin is deliberate: an interrupted delivery the trader RUNS from returns it
  // to origin and forces a re-flight (re-charging the jump fuel), so a run that
  // eats most of the tank can loop the ship into an unfundable deadlock after a
  // couple of encounters. Keeping runs cheap preserves the fuel/credit headroom
  // to re-fly and to weather tribute demands.
  const signFuelCap = ship.maxFuel * SIGN_FUEL_FRACTION;
  const signableWithin = (cap: number) =>
    ranked
      .filter((c) => c.fuel <= cap)
      .map((c) => ({ ...c, net: c.payment - c.fuel * fuelDepotPrice }))
      .filter((c) => c.net > 0)
      .sort((a, b) => b.net - a.net || a.index - b.index);
  let reachable: (RankedContract & { net: number })[] = signableWithin(signFuelCap);
  // T-1104 poverty-trap fix: T-1104 lets rollContract route the trader to a Rim
  // system, and from the Rim EVERY core-bound contract's leg exceeds 0.6 of the
  // tank — so the re-flight-margin cap leaves `reachable` empty and a rich,
  // full-tank trader strands for days waiting on a rare short hop (seed 1 stalled
  // 9 days at system 17). When nothing is signable within the margin cap, relax
  // to the FULL tank so the trader takes the run it can actually complete (it can
  // afford the fuel and accepts the thinner re-flight margin) rather than idling.
  // Reader: campaign.test.ts's 300-day poverty-trap invariant (streak < 5).
  if (reachable.length === 0) {
    reachable = signableWithin(ship.maxFuel);
  }

  // R1 SLIP 3 · GREEDY CONTRACT OVERREACH. On a slip day the pilot signs the
  // biggest number on the board it can physically fund today — ignoring the net
  // check (so a leg that does not clear its own fuel bill is fair game) and the
  // SIGN_FUEL_FRACTION re-flight margin (so it arrives with nothing in hand). The
  // `fuel <= maxFuel` floor stays: a leg the tank cannot hold is not a mistake a
  // captain makes, it is a jump the engine refuses, and a day spent making
  // refused jumps would measure nothing.
  const overreach = slips(degradation, degradation?.profile.overreachChance ?? 0);
  if (overreach) {
    const grabbed = ranked
      .filter((c) => c.fuel <= ship.maxFuel)
      .map((c) => ({ ...c, net: c.payment - c.fuel * fuelDepotPrice }));
    if (grabbed.length > 0) reachable = grabbed; // `ranked` is already richest-first
  }

  // T-1601a · Which reachable run to take. The default is unchanged (the richest
  // NET run), with two preferences layered on top, both of which only ever pick a
  // DIFFERENT member of the already-fundable set — never a run the tank or the
  // purse cannot carry, which is the T-1104 strand this policy exists to avoid.
  let preferred = reachable.length > 0 ? reachable[0] : null;
  const loan = state.player.loan;
  // R1: an overreaching pilot is chasing the number, not running a route plan —
  // the rim and head-home preferences below are exactly the discipline the slip
  // models the loss of, so they are skipped on a slip day.
  if (preferred && !overreach && state.player.debt === 0) {
    // "One more run to the rim" (PRD §1/§9). Gated on the Guild marker being
    // CLEARED, deliberately: the marker is the Tour One failure condition and the
    // acceptance's clear-rate band, so the trader finishes paying the Guild before
    // it starts flying the long, expensive, lucrative rim legs. Rim-ness is read
    // from content (`isRim`), never from a hard-coded 15..20 id range — the rim
    // set is data and has moved before. Those legs are also where the fuel bills
    // get big enough to produce genuine borrowing duress.
    const rimRun = reachable.find((c) => STAR_SYSTEMS[c.destination]?.isRim === true);
    if (rimRun) preferred = rimRun;
  }
  if (preferred && !overreach && loan && loan.dueDay - state.day <= TRADER_LOAN_HOME_WINDOW) {
    // Head home to settle up: with the balance covered and the term nearly up,
    // prefer a fundable run that ENDS at the Penny Wise desk. Preference only —
    // if no such contract is on the board the trader flies its normal best run.
    if (state.player.credits >= loan.outstanding) {
      // T-123 · a run that ends at a bar with no credit desk is not a settle-up
      // run — `isLendingDeskSystem` mirrors the engine's `venueOffered` gate, so
      // the preference cannot steer the trader to a port where `planLoanRepay`
      // will then refuse itself and the marker compounds untouched.
      const homeRun = reachable.find((c) => isLendingDeskSystem(c.destination, 'repay'));
      if (homeRun) preferred = homeRun;
    }
  }

  let primaryDest: number | null = null;
  if (state.player.activeContract) {
    primaryDest = state.player.activeContract.destination;
  } else if (preferred) {
    primaryDest = preferred.destination;
  }
  const primaryFuelNeed =
    primaryDest !== null ? playerJumpFuel(state, systemDistance(from, primaryDest)) : 0;

  // ---- T-1601a · Penny Wise, under duress -------------------------------
  // Three genuinely bad-day shapes (PRD §7.5), each measured against the plan the
  // trader has already made for today. The advance is sized to the LARGEST of
  // them and queued FIRST, so the principal is on hand before the refuel /
  // repair / marker payment below try to spend it.
  const repairNeed = crippledRepairNeed(state);
  // 1. FUEL DURESS — the tank cannot make today's leg and the purse cannot buy
  //    the difference. The classic §7.5 bad day: a run in hand, no way to fly it.
  const fuelShortfall =
    primaryFuelNeed > ship.fuel
      ? (primaryFuelNeed - ship.fuel) * fuelDepotPrice - state.player.credits
      : 0;
  // 2. REPAIR DURESS — the ship is crippled enough that `planCrippledRepair`
  //    wants to fire, but the yard quote is out of reach above the reserve.
  const repairShortfall =
    repairNeed.needed && repairNeed.repairable
      ? repairNeed.cost + TRADER_RESERVE - state.player.credits
      : 0;
  // 3. MARKER DURESS — the Guild marker is closing and the purse cannot cover it.
  const markerShortfall =
    state.player.debt > 0 &&
    state.day >= state.player.debtDueDay - TRADER_LOAN_MARKER_WINDOW &&
    state.player.credits < state.player.debt
      ? state.player.debt - state.player.credits
      : 0;
  // 4. WORKING CAPITAL — not duress, and labelled honestly as such: a Tour One
  //    trader standing at the desk on the morning of day 1 with 1,000 credits, a
  //    25,000 marker and a month to clear it BORROWS. Every real spacer does; the
  //    advance buys the fuel for the runs that pay the Guild, and the strict
  //    duress cases above almost never coincide with being AT the desk (measured
  //    over seeds 1..50: the trader passes through Sol-3 about five dawns per 60
  //    days, and is rarely there on the one day the tank runs dry). Without this
  //    case the lending band ships unexercised by any policy, which is precisely
  //    what this task exists to prevent.
  const workingCapitalShortfall =
    state.player.debt > 0 && state.player.credits < TRADER_RESERVE
      ? TRADER_RESERVE - state.player.credits
      : 0;
  const shortfall = Math.max(
    fuelShortfall,
    repairShortfall,
    markerShortfall,
    workingCapitalShortfall,
  );
  const borrow = planLoanBorrow(state, shortfall);
  let borrowed = 0;
  if (borrow) {
    // FIRST in the day's plan — and an EXTRA action on a normal working day, so
    // the sign/travel below still runs and the day keeps its income action.
    actions.push(borrow.action);
    borrowed = borrow.principal;
  }

  // Settle the Penny Wise balance before the day's spending starts, so the
  // repayment is never lost to a refuel that drained the purse first.
  const repay = planLoanRepay(state);
  let repaid = 0;
  if (repay) {
    actions.push(repay);
    repaid = loan?.outstanding ?? 0;
  }

  // Raise the refuel threshold/target to cover this day's jump (capped at the
  // tank). Never lower them below the working defaults.
  //
  // R1 SLIP 2 · THIN-TANK ARRIVAL. On a slip day the pilot buys the leg plus one
  // getaway burn and calls it good, instead of topping to the working target. The
  // margin removed is precisely the escape margin: arriving on `RUN_FUEL_COST` of
  // fuel buys exactly ONE run attempt, and the engine refuses a second (and
  // refuses a fight, at FIGHT_FUEL_COST, outright) — so a failed getaway leaves
  // talk-and-pay as the only stance the ship can still take. The threshold is
  // left alone: it decides WHETHER to refuel, and a pilot who skipped the pumps
  // entirely would strand rather than fly thin, which measures nothing.
  const thinTank = slips(degradation, degradation?.profile.thinFuelChance ?? 0);
  const workingTarget = thinTank ? primaryFuelNeed + RUN_FUEL_COST : FUEL_REFUEL_TARGET;
  const refuelThreshold = Math.min(ship.maxFuel, Math.max(FUEL_REFUEL_THRESHOLD, primaryFuelNeed));
  const refuelTarget = Math.min(ship.maxFuel, Math.max(workingTarget, primaryFuelNeed));
  const refuel = planRefuel(
    state,
    // T-1601a: hold back exactly the repayment queued above (it runs first, but
    // these planners all read the DAWN state), so the tank is never filled with
    // the money that was going to clear the marker.
    repaid,
    refuelThreshold,
    refuelTarget,
    borrowed,
  );
  let refuelCost = 0;
  if (refuel) {
    actions.push(refuel.action);
    refuelCost = refuel.cost;
  }

  // T-1205: if enemy fire has chipped the hull down far enough to collapse the
  // fuel ceiling (stranding a solvent trader with no reachable contract), repair
  // the ship — a real player fixes a crippled hull. Restores the full tank for the
  // next run; fires only when actually crippled and affordable.
  // T-1601a: the day's Penny Wise traffic nets into the affordability check (an
  // advance funds the repair, a repayment is money already spent). The refuel is
  // deliberately NOT subtracted — that was never modelled here, and changing it
  // would move the T-1302 stranding fix this planner exists for.
  // T-196b: the refuel is STILL deliberately not netted off, for the reason the
  // comment above already gives — this pair could always co-occur (both were
  // reachable on a five-die day), so freeing the die did not create the collision
  // and closing it here would be a behaviour change this task does not own.
  const repair = planCrippledRepair(state, TRADER_RESERVE, borrowed - repaid);
  if (repair) actions.push(repair);

  // The tank the trader will actually have when it flies today — current fuel
  // plus whatever the just-queued refuel tops it up by (refuel runs before the
  // travel action).
  const fuelPrice = state.market.localFuelPrice || 5;
  const boughtFuel = refuel ? refuel.cost / fuelPrice : 0;
  const availableFuel = Math.min(ship.maxFuel, ship.fuel + boughtFuel);

  if (state.player.activeContract) {
    // A run carried over (a prior delivery was interrupted or the nav check
    // slipped) — finish it before signing anything new.
    const die = ledger.takeBest();
    if (die !== undefined) {
      actions.push({
        type: 'Travel',
        destinationId: state.player.activeContract.destination,
        spendDie: die,
      });
    }
  } else if (preferred && availableFuel >= primaryFuelNeed) {
    // T-1601a: `preferred` is `reachable[0]` unless the rim or head-home
    // preference above swapped in another member of the SAME fundable set.
    const best = preferred;
    // T-196b · SIGNING IS FREE (docs/DAWN-HAND-REDESIGN.md §3), so the pair is
    // gated on the TRAVEL die alone — the jump is the only half that rolls a
    // check. The sign's real bounds are unchanged and both still enforced: the
    // engine refuses a second active contract (`trade.ts:67`), and `preferred` is
    // drawn from the already fuel- and net-filtered `reachable` set.
    const travelDie = ledger.takeBest();
    if (travelDie !== undefined) {
      actions.push({
        type: 'Trade',
        action: 'sign-contract',
        contractIndex: best.index,
      });
      actions.push({ type: 'Travel', destinationId: best.destination, spendDie: travelDie });

      // Second run while the debt still bites: throughput matters more than the
      // marginal encounter risk when 25,000 credits are due by day 30.
      // T-196b: `>= 2` became `>= 1` — the second sign is free, so only the
      // second TRAVEL die has to still be in the hand.
      if (state.player.debt > 5000 && reachable.length > 1 && ledger.remaining() >= 1) {
        // T-1601a: the richest OTHER fundable run — `reachable[1]` unless a
        // preference above made `best` something other than `reachable[0]`.
        const second = reachable.find((c) => c.index !== best.index)!;
        // The board shifts when the first contract is spliced off; correct the
        // live index for the second sign.
        const liveIndex = second.index > best.index ? second.index - 1 : second.index;
        const secondTravelDie = ledger.takeBest();
        // T-1102: the second leg is flown FROM the first delivery's system, not
        // from here — price it on that leg (distance best.destination → second),
        // and require the fuel left after run 1 to cover it. The old check used
        // the second contract's cost-from-here, which under scarcity signed a
        // double the tank could never complete and deadlocked the run.
        const secondLegFuel = playerJumpFuel(
          state,
          systemDistance(best.destination, second.destination),
        );
        const projectedFuel = availableFuel - primaryFuelNeed;
        if (secondTravelDie !== undefined && projectedFuel >= secondLegFuel) {
          actions.push({
            type: 'Trade',
            action: 'sign-contract',
            contractIndex: liveIndex,
          });
          actions.push({
            type: 'Travel',
            destinationId: second.destination,
            spendDie: secondTravelDie,
          });
        }
      }
    }
  }

  // ---- T-199 · F-199-1 · THE TRADER'S MISSING ANTI-IDLE MOVE.
  // The full-tank relaxation above closes the case where the margin cap is the only
  // thing in the way; it cannot close the rim corner where EVERY leg on the board
  // costs more than the whole tank, and until now the trader had no answer to that
  // at all. Measured at 1,000 seeds × 35 days, on HEAD and unmoved by anything else
  // in this task: seeds 371 and 571 sat 6 and 7 consecutive zero-income days with a
  // FULL 240/240 tank and exactly `TRADER_RESERVE` in the purse, `reachable` empty
  // even at `maxFuel`, falling through to a bare `Wait`. `fighterPolicy` has had the
  // walk-home fix since T-159; this is that same code, now shared. Placed here —
  // after the day's contract and travel work, before the overhead and the marker —
  // so it can only ever fill an idle day. (The second rung, `planStrandedExplore`,
  // is called at the TAIL of this plan; its own doc explains why it cannot be queued
  // beside the burn.)
  const homewardBurn = planHomewardBurn(state, ledger, actions, refuelCost);
  if (homewardBurn) actions.push(homewardBurn);

  // T-1601a: PROTECT THE PENNY WISE REPAYMENT FROM THE GUILD MARKER. While a loan
  // is live and unpaid this day, hold its whole balance back on top of the
  // operating reserve. Sending it to the Guild instead is a false economy: the
  // marker is a plain ledger, but a defaulted loan applies LOAN_DEFAULT_DISPOSITION
  // to Penny Wise (grudge-weighting her into the interceptor draw, travel.ts
  // chooseWeighted) AND multiplies the realized encounter chance by
  // COLLECTION_ENCOUNTER_MULTIPLIER until it is cleared — a compounding penalty
  // that costs far more than the days of marker payment it defers. A repayment
  // queued TODAY needs no such hold; it is already committed spending instead.
  const loanHold = state.player.loan && !repay ? state.player.loan.outstanding : 0;
  // N9 · The captain's overhead — berths, crew, a port stake — BEFORE the marker
  // payment is sized, so the money it commits is held back from the Guild exactly
  // as the refuel is. T-196b: it no longer waits on a leftover die (it costs
  // none), so it now fires on every day the surplus allows.
  const overhead = planCaptainOverhead(
    state,
    TRADER_RESERVE + loanHold,
    refuelCost + repaid - borrowed,
  );
  actions.push(...overhead.actions);

  // T-199 · F-199-2 · the second rung, at the tail (see `planStrandedExplore` for
  // why it cannot sit beside the burn above). Fires only when the walk home found
  // no flyable leg either, i.e. the day is otherwise a bare `Wait`.
  const strandedExplore = planStrandedExplore(state, ledger, actions);
  if (strandedExplore) actions.push(strandedExplore);

  const debtPayment = planDebtPayment(
    state,
    TRADER_RESERVE + loanHold,
    refuelCost + repaid + overhead.cost,
    borrowed,
  );
  if (debtPayment) actions.push(debtPayment);

  return withReroll(state, actions.length > 0 ? actions : [{ type: 'Wait' }]);
}

/**
 * R1 · TRADER, DEGRADED — the human-plausible pilot the worklist's gating
 * question is asked of. Identical route/fuel/marker planning to `traderPolicy`,
 * with the three slips described at `PilotDegradationProfile` layered on top.
 *
 * IT IS AN INSTRUMENT, NOT AN ARCHETYPE. It is deliberately NOT a member of the
 * sweep's DEFAULT_POLICIES fleet and NOT a member of `campaign-policies.test.ts`'s
 * COMPETENT_POLICIES: the anti-poverty-trap invariant (T-1605b, scoped to the
 * competent policies per errata E4) is a promise about what the WORLD offers a
 * captain who plays well, and a policy that flies thin-tanked on purpose is not
 * that captain. Read it only against the `trader` row, which is the comparison
 * R1 is built to make.
 */
export const degradedTraderPolicy: SimPolicy = ({ state, rng }) =>
  planTraderDay(state, { profile: DEGRADED_TRADER_PROFILE, rng });

/**
 * R1 · The same instrument at an arbitrary calibration — the ABLATION door.
 *
 * A single degraded pilot answers "does a sloppy captain die?" but not "which
 * mistake killed it", and R1's whole output is a re-scoping decision that turns
 * on exactly that: a death caused by a botched getaway argues for pricing the
 * run, a death caused by a botched negotiation argues for pricing the tribute.
 * Zeroing one field at a time separates them.
 *
 * Deliberately NOT given roster names: an ablation is a question asked once, and
 * six near-identical entries in `SimPolicyName` would be six more rows every
 * future sweep silently carries. The shipped `trader-degraded` is the one
 * calibration the balance data is cut on.
 *
 * NOTE the driver requirement, which is a real trap: a bare `SimPolicy` handed to
 * `runCampaign` resolves with `dawnBlind: true` and would be planned on the
 * pre-board DAWN state, quietly measuring a blinded pilot. Drive this through
 * `resolvePolicy('trader-degraded')`'s day-state contract, not through the
 * function overload.
 */
export function makeDegradedTraderPolicy(profile: PilotDegradationProfile): SimPolicy {
  return ({ state, rng }) => planTraderDay(state, { profile, rng });
}

// ---------------------------------------------------------------------------
// T-1601b · SMUGGLER. The smuggling pillar (PRD §7.2 "patrol captains roll GUILE
// checks against smugglers", §7.5 "Smuggler Ray" as the third out) shipped
// complete — contraband contracts (T-1104), the derelict sealed pod (T-111b),
// the patrol scan (T-1305), Ray's fence storylets — but NO policy ever ran it,
// so the balance instruments never measured a scan, a fine, or a fence sale.
// This policy is that instrument.
//
// WHY IT LIVES ON THE RIM: `rollContract` only issues cargo type 10 from an
// ORIGIN port with `allowsContraband`, which today is exactly the six rim
// systems (content systems.ts). A core-resident smuggler is offered no
// contraband at all — so the pillar's supply is a ROUTING problem before it is
// anything else, and the policy is built around getting to (and staying on) the
// rim. Its second supply line is the sealed pod: Explore → POI loot →
// `signal.contraband.pending` → the `derelict.sealed-pod` storylet, whose `take`
// choice sets a carrying flag NOTHING clears but a confiscation or Ray.
//
// The numbers below are POLICY tuning, not game balance data — they say when
// THIS instrument decides to deadhead for the rim, exactly as
// TRADER_LOAN_MARKER_WINDOW says when the trader decides a day is bad enough to
// borrow. The contraband/fence/dare BAND constants stay in content, and this
// file imports them rather than restating them (constraint 4 cuts both ways).
// ---------------------------------------------------------------------------

/** Mirrors TRADER_RESERVE: the smuggler is a trader variant and needs the same
 *  fat buffer to fund the next day's refuel under the T-1102 fuel economy. */
const SMUGGLER_RESERVE = 3000;
/** Drive condition at or below which the smuggler books a repair: every point of
 *  wear adds 1 fuel PER UNIT OF DISTANCE (`jumpFuelCost`), which on this policy's
 *  long legs is the difference between a 13-fuel hop and a 39-fuel one. */
const SMUGGLER_DRIVE_REPAIR_CONDITION = 8;
/** The credit floor the EXPLORE sweeps keep back, deliberately far below
 *  SMUGGLER_RESERVE. Same lesson EXPLORER_FUEL_RESERVE records: a high floor
 *  becomes its own strand, because it blocks the one income action still legal on
 *  a day when the board offers no fundable, navigable run. Measured with the
 *  sweeps gated at the full reserve (seed 8 × 300 days): five consecutive
 *  zero-income days at Herculis-2 on 1,399 credits and a 228-unit tank — the ship
 *  could have flown off-lane the whole time. */
const SMUGGLER_EXPLORE_RESERVE = 2000;
/** The floor on a day that has produced NO income action — see the comment at the
 *  explore loop. Thin on purpose: on such a day the choice is between charting
 *  off-lane and idling, and idling is what the poverty-trap invariant forbids. */
const SMUGGLER_IDLE_EXPLORE_RESERVE = 200;
/** What it costs to be allowed to DEADHEAD for the rim — an unpaid leg flown
 *  only when the board offers nothing fundable at all. Same shape and same
 *  rationale as EXPLORER_DECODE_TRIP_RESERVE / _FIRST_DAY: a pursuit leg flown
 *  broke lands the ship at a rim port with no fundable run and no credits to
 *  refuel, which is a strand, not a career. */
const SMUGGLER_RIM_DEADHEAD_RESERVE = 10000;
/** Not before the Tour One marker has resolved (PRD §5.1): the first month is
 *  where this policy is poorest and a deadhead is least survivable. */
const SMUGGLER_RIM_DEADHEAD_FIRST_DAY = 30;
/** The die roll a leg must be flyable ON before the smuggler will commit to it:
 *  a jump is only signed when `travelDc(distance) <= PILOT + navBonus + this`, so
 *  the run lands on a 15-or-better rather than only on a natural 20. See the NAV
 *  GATE comment in the policy for the strand this closes. */
const SMUGGLER_SIGN_DIE_FLOOR = 15;

/**
 * T-1601b · The smuggler's storylet preference, modelled on
 * `chooseDecodeStoryletAction`. Board order would otherwise hand the pillar's
 * two decisive beats to whatever sorts first, and the greedy picker's
 * "prefer a die-free choice" rule would happily take `leave` / `keep-it-bolted`.
 * Priority: (a) TAKE the sealed pod (the pod supply line), then (b) SELL to Ray
 * (the §7.5 fence out, which also stamps FENCE_REP_FLAG and so makes every later
 * scan harder — a consequence this policy exists to measure, not to dodge).
 * Choices are matched by CHOICE ID so re-ordering the content can never flip
 * this into the declining branch. Both target choices are die-free, so the
 * caller resolves them INLINE and the day keeps its income action.
 */
function chooseSmugglerStoryletAction(state: GameState): PlayerAction | null {
  const takeChoice = (
    offer: GameState['storylets']['available'][number],
    choiceIds: readonly string[],
  ): PlayerAction | null => {
    const chosen = offer.choices.find(
      (choice) => choiceIds.includes(choice.id) && canAffordChoice(state, choice),
    );
    if (!chosen) return null;
    return {
      type: 'Storylet',
      storyletId: offer.storyletId,
      choiceId: chosen.id,
      ...(choiceRequiresDie(chosen) ? { spendDie: 0 } : {}),
    };
  };

  for (const offer of state.storylets.available) {
    if (offer.storyletId !== SEALED_POD_STORYLET_ID) continue;
    const action = takeChoice(offer, [SEALED_POD_TAKE_CHOICE_ID]);
    if (action) return action;
  }
  for (const offer of state.storylets.available) {
    if (!offer.storyletId.startsWith(FENCE_STORYLET_PREFIX)) continue;
    const action = takeChoice(offer, FENCE_SELL_CHOICE_IDS);
    if (action) return action;
  }
  return null;
}

/** The nearest rim system to `from` (content `isRim`, never a hard-coded 15..20
 *  range — the rim set is data and has moved before). Ties break on the lower
 *  id so the choice is deterministic. Gated systems are excluded: a sealed
 *  destination is not a leg the player could fly. */
function nearestRimSystemId(from: number): number | null {
  let best: number | null = null;
  let bestDistance = Infinity;
  for (const id of travelableSystemIds()) {
    if (id === from || STAR_SYSTEMS[id]?.isRim !== true) continue;
    const dist = systemDistance(from, id);
    if (dist < bestDistance) {
      bestDistance = dist;
      best = id;
    }
  }
  return best;
}

/**
 * SMUGGLER — a trader that runs dirty. It keeps the tank topped and funds itself
 * with ordinary contract runs (the same net-value ranking, margin cap and
 * T-1104 full-tank relaxation the trader uses), but inside the already-fundable
 * set it prefers, in order: a CONTRABAND run (cargo type 10), then any rim-bound
 * run — because the rim is where the contraband is issued. It takes every sealed
 * pod an Explore sweep turns up, sells to Ray when he offers, and pays the Guild
 * out of what the runs pay. Weak hull, so it talks its way past interceptors.
 *
 * Unlike the trader's rim preference, this one is NOT gated on the Guild marker
 * being cleared: the rim IS this policy's career, and a contraband payday prices
 * at the top of the band (CARGO_TYPES type 10 carries the highest
 * valueMultiplier), so the marker is paid out of exactly those runs.
 */
export const smugglerPolicy: SimPolicy = ({ state }) => {
  const ledger = dieLedger(state);
  // A carried-over encounter is resolved first. NOTE: the contraband scan has
  // ALREADY happened by the time this runs — `applyPatrolContrabandScan` fires
  // at interdiction inside resolveTravel, before any stance is chosen — so no
  // combat choice here can suppress a scan or change its outcome.
  if (state.encounter) return withReroll(state, planPacifistCombat(state, ledger));

  const actions: PlayerAction[] = [];
  const ship = state.player.ship;
  const from = state.player.currentSystemId;

  // The pod / fence beats first, then the ordinary greedy pick. Die-free choices
  // resolve INLINE (they cost no die, so the day still does its income work); a
  // die choice is taken as a standalone day, matching the explorer.
  const storyletAction = chooseSmugglerStoryletAction(state) ?? chooseStoryletAction(state);
  if (storyletAction) {
    if (storyletAction.type === 'Storylet' && storyletAction.spendDie === undefined) {
      actions.push(storyletAction);
    } else {
      return withReroll(state, [storyletAction]);
    }
  }

  // DRIVES FIRST — the smuggler's defining upgrade, for exactly the reason
  // T-1310 gives the explorer's: a policy that lives on the RIM cannot fly rim
  // distances on the junker's strength-10 drives. A tier-3 drive costs ~0 net
  // (the trade-in dwarfs the sticker) and drops per-unit jump fuel from 12 to
  // ~1, so the same tank reaches six times as far. Measured without it (seeds
  // 1..8 × 300 days): seeds 1, 2 and 3 spent their whole purse on a single
  // ~240-fuel rim leg, failed the long jump's high pilot DC — which BURNS the
  // fuel and leaves the ship at origin (engine resolveTravel) — and then sat on
  // an unfundable activeContract for the rest of the campaign (289 fuel-starved
  // days, a marker compounded past 3,900,000). With the drives all eight seeds
  // finish solvent. Component tiers are not renown-gated, so this is reachable
  // from day one; gated above a working reserve so it never spends the last
  // credits at the yard.
  // T-196b · The yard is FREE, so no die is taken here. The bounds that actually
  // hold this are the ones already on the branch: the component is bought only
  // while its strength is below tier 3 (so it fires at most once per component
  // per career), the two branches are mutually exclusive (`else if`), and the
  // purse must clear half the working reserve. `yardCommitted` carries the net
  // cost forward so the refuel/repair/overhead below cannot spend it twice — a
  // collision that was rare while the die rationed these and is now routine.
  let yardCommitted = 0;
  if (ship.drives.strength < 30 && state.player.credits >= SMUGGLER_RESERVE / 2) {
    actions.push({
      type: 'Shipyard',
      action: 'buy-component-tier',
      component: 'drives',
      tier: 3,
    });
    yardCommitted += Math.max(0, componentTierNetCost(state, 'drives', 3));
  } else if (ship.navigation.strength < 30 && state.player.credits >= SMUGGLER_RESERVE / 2) {
    // THEN THE NAV COMPUTER. `navBonus` adds `floor((score - 10) / 10)` to every
    // pilot check, so a tier-3 navigation (+2) buys 4 units of extra reach
    // against the `8 + distance/2` travel DC — which is the difference between a
    // rim port being a place you can leave under the NAV GATE below and a place
    // you are stuck at. Also ~0 net at the yard (the strength-10 trade-in covers
    // the tier-3 sticker), so it is affordable the moment the drives are done.
    actions.push({
      type: 'Shipyard',
      action: 'buy-component-tier',
      component: 'navigation',
      tier: 3,
    });
    yardCommitted += Math.max(0, componentTierNetCost(state, 'navigation', 3));
  }

  // ---- Contract pick (trader machinery, plus a NAV gate) -------------------
  // WHY THE NAV GATE IS NEW HERE. Every other policy's reachability test is the
  // FUEL cap, which under the junker's strength-10 drives happens to imply a
  // short distance too (a 44-unit leg costs 528 fuel on a 300 tank, so it can
  // never be signed). The drives upgrade above breaks that coupling: at
  // strength 30 the same leg costs 44 fuel and sails through the fuel cap — but
  // `travelDc` is `8 + distance/2`, so its pilot DC is 30, which a d20 plus a
  // junker's PILOT modifier CANNOT beat. Signing it locks the contract (a failed
  // jump never clears `activeContract`, engine resolveTravel) and burns the whole
  // leg's fuel on every retry — the exact "signed 118 unwinnable rim runs, 0
  // delivered" trap T-1104's comment describes, re-opened by cheap fuel.
  // Measured before this gate (seeds 1..8 × 300 days): seeds 2 and 7 locked onto
  // a DC-30 rim-to-rim leg and re-attempted it until the campaign ended (seed 7:
  // credits 6, marker compounded to 2,686,365, zero-income streak 5 — the
  // invariant's bar). The gate is NEVER relaxed, unlike the fuel cap below: a
  // jump the ship cannot navigate is not a cheaper option, it is a dead end.
  const pilotModifier = state.player.stats[Stat.PILOT] + navBonus(ship);
  const navBeatable = (dist: number) => travelDc(dist) <= pilotModifier + SMUGGLER_SIGN_DIE_FLOOR;

  const fuelDepotPrice = state.market.localFuelPrice || 5;
  const ranked = rankedContracts(state);
  const signableWithin = (cap: number) =>
    ranked
      .filter((c) => c.fuel <= cap && navBeatable(c.dist))
      .map((c) => ({ ...c, net: c.payment - c.fuel * fuelDepotPrice }))
      .filter((c) => c.net > 0)
      .sort((a, b) => b.net - a.net || a.index - b.index);
  let reachable = signableWithin(ship.maxFuel * SIGN_FUEL_FRACTION);
  // T-1104 poverty-trap fix, ported (see traderPolicy for the full argument): a
  // RIM-RESIDENT policy hits this corner constantly, because from the rim every
  // core-bound leg exceeds SIGN_FUEL_FRACTION of the tank and `reachable` comes
  // back empty. Relax to the FULL tank rather than idle. Reader: the poverty-trap
  // invariant in campaign-smuggler-gambler.test.ts (streak < 5).
  if (reachable.length === 0) {
    reachable = signableWithin(ship.maxFuel);
  }

  // Preferences, both INSIDE the already-fundable set — never a run the tank or
  // the purse cannot carry, which is the strand the relaxation above exists for.
  let preferred = reachable.length > 0 ? reachable[0] : null;
  if (preferred) {
    const contrabandRun = reachable.find(
      (c) => state.market.manifestBoard[c.index]?.cargoType === CONTRABAND_CARGO_TYPE,
    );
    if (contrabandRun) {
      // A type-10 run needs no gate: it is a fundable, top-of-band payday
      // (CARGO_TYPES type 10 carries the highest valueMultiplier), so taking it
      // is strictly better trading AND the pillar's supply at the same time.
      preferred = contrabandRun;
    } else {
      // MOVING HOUSE to the rim, on the other hand, is gated on the Guild marker
      // being cleared — the same gate the trader puts on its rim preference, and
      // for the reason the sweep measured rather than a theoretical one. Without
      // this line the smuggler emigrates to the rim inside the first month, where
      // every core-bound leg is unfundable on a junker drive: seeds 1, 2, 3 and 8
      // of the 1..8 × 300-day sweep ended on ~1 credit with 24-289 fuel-starved
      // days and a marker compounded past 3,900,000, and seed 2's zero-income
      // streak hit 7 (the invariant's bar is 5). With the gate the same four seeds
      // finish solvent. The rim is still this policy's home — it just earns its
      // passage first, exactly as the PRD's "one more run to the rim" frames it.
      const rimRun =
        state.player.debt === 0
          ? reachable.find((c) => STAR_SYSTEMS[c.destination]?.isRim === true)
          : undefined;
      if (rimRun) preferred = rimRun;
    }
  }
  // HEAD HOME TO SETTLE UP — the trader's preference, ported for a measured
  // reason. `planLoanRepay` is only legal AT a Hangout, and nothing else in this
  // policy ever routes back to one, so without this the day-1 working-capital
  // advance is never repaid: it accrues interest, the `loanHold` below holds its
  // whole balance back from the Guild marker forever, and BOTH ledgers compound
  // untouched (seed 8 of the 1..8 × 300-day sweep finished with a 1,982,209
  // marker while flying a perfectly healthy trade loop on ~9,000 credits a day).
  // Preference only, inside the fundable set, and only when the balance is
  // actually covered — it never flies a run it cannot fund to reach the desk.
  const loan = state.player.loan;
  if (
    preferred &&
    loan &&
    loan.dueDay - state.day <= TRADER_LOAN_HOME_WINDOW &&
    state.player.credits >= loan.outstanding
  ) {
    // T-123 · the trader's guard, ported with the preference: mirrors the engine's
    // `venueOffered(...,'repay')` gate so a desk-less port is never chosen as the
    // place to settle up.
    const homeRun = reachable.find((c) => isLendingDeskSystem(c.destination, 'repay'));
    if (homeRun) preferred = homeRun;
  }

  const primaryDest = state.player.activeContract
    ? state.player.activeContract.destination
    : (preferred?.destination ?? null);
  const primaryFuelNeed =
    primaryDest !== null ? playerJumpFuel(state, systemDistance(from, primaryDest)) : 0;

  // ---- Penny Wise, as WORKING CAPITAL (PRD §7.5) ---------------------------
  // The same day-1 advance `traderPolicy` takes, and for a sharper reason: a
  // failed pilot check BURNS the jump's fuel and leaves the ship at origin
  // (engine resolveTravel), so a thin purse plus one botched jump plus one
  // interdiction is enough to leave a smuggler holding a contract it can neither
  // fly nor abandon — the activeContract lock the T-1310 comments call a silent
  // strand. Measured without this block (seeds 1..8 × 300 days): seeds 3, 5, 7
  // and 8 locked inside the first week and never recovered (seed 3 sat at Sol-3
  // re-attempting the same jump for 294 days on 1 credit). The trader survives
  // the identical day-1 corner precisely BECAUSE it borrows. Sized to the larger
  // of the day's fuel shortfall and the working-capital gap, clamped by
  // `planLoanBorrow` into the CONTENT principal band.
  const fuelShortfall =
    primaryFuelNeed > ship.fuel
      ? (primaryFuelNeed - ship.fuel) * fuelDepotPrice - state.player.credits
      : 0;
  const workingCapitalShortfall =
    state.player.debt > 0 && state.player.credits < SMUGGLER_RESERVE
      ? SMUGGLER_RESERVE - state.player.credits
      : 0;
  const borrow = planLoanBorrow(state, Math.max(fuelShortfall, workingCapitalShortfall));
  let borrowed = 0;
  if (borrow) {
    // An EXTRA action on a normal working day (never a standalone day) — the
    // sign/travel below still runs, so the day keeps its income action.
    actions.push(borrow.action);
    borrowed = borrow.principal;
  }
  // Settle the balance before the day's spending starts, so a refuel can never
  // eat the money that was going to clear the desk.
  const repay = planLoanRepay(state);
  let repaid = 0;
  if (repay) {
    actions.push(repay);
    repaid = state.player.loan?.outstanding ?? 0;
  }

  // Size the refuel to guarantee today's leg (capped at the tank), never below
  // the working defaults — the T-1102 scarcity fix.
  // T-196b: `repaid + yardCommitted` is the keep-floor — the tank is never filled
  // with money the day has already spent at the yard, which before this task the
  // die scarcity made an unlikely pairing and now is an ordinary day.
  const refuel = planRefuel(
    state,
    repaid + yardCommitted,
    Math.min(ship.maxFuel, Math.max(FUEL_REFUEL_THRESHOLD, primaryFuelNeed)),
    Math.min(ship.maxFuel, Math.max(FUEL_REFUEL_TARGET, primaryFuelNeed)),
    borrowed,
  );
  let refuelCost = 0;
  if (refuel) {
    actions.push(refuel.action);
    refuelCost = refuel.cost;
  }

  const repair = planCrippledRepair(state, SMUGGLER_RESERVE, borrowed - repaid - yardCommitted);
  if (repair) {
    actions.push(repair);
  } else if (ship.drives.condition < SMUGGLER_DRIVE_REPAIR_CONDITION) {
    // KEEP THE DRIVES SHARP. `jumpFuelCost` charges `21 - min(strength,21) +
    // (10 - condition)` per unit of distance, so a drive worn from condition 9 to
    // 7 TRIPLES the fuel bill of every leg this policy flies — and it flies the
    // long ones. `planCrippledRepair` above only fires on the HULL's fuel-ceiling
    // collapse, so nothing else in the sim ever notices a worn drive. Affordable
    // above the working reserve; T-196b took its die (the yard is free) and added
    // `yardCommitted` to the affordability sum, so a tier bought at the top of
    // this same day is money this repair can no longer also spend. It stays at
    // most one repair per day: the `else` arm of `planCrippledRepair`, guarded by
    // a single dawn-read condition.
    const quote = quoteShipyard(state.player, {
      type: 'Shipyard',
      action: 'repair',
      repairMode: 'all',
    });
    if (
      quote.ok &&
      state.player.credits + borrowed - repaid - refuelCost - yardCommitted - quote.cost >=
        SMUGGLER_RESERVE
    ) {
      actions.push({ type: 'Shipyard', action: 'repair', repairMode: 'all' });
      yardCommitted += Math.max(0, quote.cost);
    }
  }

  const boughtFuel = refuel ? refuel.cost / fuelDepotPrice : 0;
  const postRefuelFuel = Math.min(ship.maxFuel, ship.fuel + boughtFuel);
  let projectedFuel = postRefuelFuel;

  if (state.player.activeContract) {
    const die = ledger.takeBest();
    if (die !== undefined) {
      actions.push({
        type: 'Travel',
        destinationId: state.player.activeContract.destination,
        spendDie: die,
      });
      projectedFuel -= primaryFuelNeed;
    }
  } else if (preferred && postRefuelFuel >= primaryFuelNeed) {
    const best = preferred;
    // T-196b: free sign, so the pair is gated on the travel die alone. The sign's
    // real bounds hold: one active contract (engine `trade.ts`), and `preferred`
    // comes from the nav-gated, fuel-capped, net-positive `reachable` set.
    const travelDie = ledger.takeBest();
    if (travelDie !== undefined) {
      actions.push({
        type: 'Trade',
        action: 'sign-contract',
        contractIndex: best.index,
      });
      actions.push({ type: 'Travel', destinationId: best.destination, spendDie: travelDie });
      projectedFuel -= primaryFuelNeed;
    }
  } else if (STAR_SYSTEMS[from]?.isRim !== true) {
    // ---- The one gated DEADHEAD, mirroring the explorer's Sage leg ---------
    // Reached only when the board offered nothing fundable, so it costs the day
    // nothing it would have earned. Every gate is the explorer's: past the Tour
    // One boundary, genuinely flush, and — the load-bearing one — the tank AFTER
    // this turn's refuel already covers the whole hop. NEVER launch a leg you
    // cannot finish. `Travel` is itself an income action, so this cannot burn a
    // zero-income day.
    const target = nearestRimSystemId(from);
    const legFuel =
      target === null ? Infinity : playerJumpFuel(state, systemDistance(from, target));
    if (
      target !== null &&
      // Same nav gate as the sign above — never deadhead onto a jump the ship
      // cannot navigate.
      navBeatable(systemDistance(from, target)) &&
      state.day > SMUGGLER_RIM_DEADHEAD_FIRST_DAY &&
      state.player.credits - refuelCost >= SMUGGLER_RIM_DEADHEAD_RESERVE &&
      postRefuelFuel >= legFuel
    ) {
      const die = ledger.takeBest();
      if (die !== undefined) {
        actions.push({ type: 'Travel', destinationId: target, spendDie: die });
        projectedFuel -= legFuel;
      }
    }
  }

  // ---- T-1603c · STRANDED RECOVERY: refit the drives when nothing else is legal
  // The drives block at the top of this policy gates the tier-3 refit on
  // SMUGGLER_RESERVE / 2 so it never spends the last credits at the yard. That
  // gate is right on a working day and WRONG on a stranded one, for the reason the
  // block's own comment already states: the tier-3 drive costs ~0 net because the
  // strength-10 trade-in covers the sticker. Measured at the rim port the strand
  // happens at (seed 2, day 56): `quoteShipyard` returns cost **0** and the policy
  // refuses it over a 1,500-credit floor it will never reach again.
  //
  // WHY THIS ONLY SURFACED NOW. The corner is entered by SUCCESSION — the
  // successor's license is claimed where the wreck was towed in (engine legacy.ts
  // `applySuccession`), which for this policy is a rim port, and the successor
  // flies a fresh junker. On junker drives every leg off that rim port costs
  // `21 - 10 + 1 = 12` fuel per unit of distance, so `net = payment - fuel*price`
  // is negative on the whole board, `reachable` comes back empty, and the day
  // plans nothing. Before T-1603c a combat death was arithmetically unreachable
  // (one defeat in 34,000+ encounters, `docs/balance/BASELINE-T-1603a.md` §4), so
  // no seed in this sweep ever entered it; the T-1603c targeting levers make hull
  // kills real, and seed 2 idled 66 consecutive days against the invariant's bar
  // of 5.
  //
  // Deliberately narrow, so no working day changes: it fires ONLY when the day has
  // produced no income action at all, and ONLY when the yard quote is actually
  // covered by the purse. At strength 30 the same leg costs 1 fuel per unit, which
  // is what puts the board back inside `net > 0` and ends the strand. This is a
  // POLICY fix, not a game-data change — the instrument was refusing a free
  // upgrade, not the game withholding one.
  if (!actions.some(isIncomeAction) && ship.drives.strength < 30) {
    const refitQuote = quoteShipyard(state.player, {
      type: 'Shipyard',
      action: 'buy-component-tier',
      component: 'drives',
      tier: 3,
    });
    // T-196b: free at the yard now, and `yardCommitted` joins the sum so a tier or
    // repair already queued today cannot be paid for twice. Reachable only when
    // the day produced no income action at all, and the drives block at the top of
    // this policy would have fired instead if it could — so this stays one refit.
    if (
      refitQuote.ok &&
      refitQuote.cost <= state.player.credits + borrowed - repaid - refuelCost - yardCommitted
    ) {
      actions.push({
        type: 'Shipyard',
        action: 'buy-component-tier',
        component: 'drives',
        tier: 3,
      });
      yardCommitted += Math.max(0, refitQuote.cost);
    }
  }

  // Off-lane sweeps with whatever sharp dice remain, while solvent and fuelled:
  // this is the POD supply line (Explore loot arms `signal.contraband.pending`,
  // which is what offers `derelict.sealed-pod` at the next dawn). Explore is an
  // income action, so a sweep day is never a zero-income day.
  // The floor DROPS on a day the plan has produced no income action at all —
  // typically a rim dawn whose board holds nothing both fundable and navigable.
  // Off-lane charting is then the only legal way to make progress, and refusing
  // it over a credit floor is precisely how a policy strands itself with a full
  // tank (measured at the flat 2,000 floor, seeds 1..20 × 300 days: seed 13 sat
  // at Mizar-9 for 11 straight days on 1,755 credits and a 270-unit tank; seeds
  // 12, 16 and 19 idled 7, 7 and 5). The high floor still applies on a normal
  // working day, because exploring down to the last credit on days that ALREADY
  // earn is its own spiral (measured at a flat 500 floor: seed 1 idled 183 days).
  // T-1601a's protection, ported: while a Penny Wise balance is live and unpaid
  // today, hold it back on top of the operating reserve rather than sending it to
  // the Guild. A defaulted loan grudge-weights Penny Wise into the interceptor
  // draw AND multiplies the encounter chance until cleared; a late marker does
  // neither.
  const loanHold = state.player.loan && !repay ? state.player.loan.outstanding : 0;

  // N9 · The captain's overhead. It used to have to sit AHEAD of the Explore loop
  // below, because that loop drains every remaining die by design and a shopping
  // planner queued after it would have been handed an empty ledger on every
  // fuelled, solvent day. T-196b removes that constraint (the three verbs take no
  // die), but the placement is KEPT: it still runs after the day's contract and
  // travel actions so it never displaces the income work, and its `overhead.cost`
  // is a term of the Explore floor below, which reads it from here.
  const overhead = planCaptainOverhead(
    state,
    SMUGGLER_RESERVE + loanHold,
    refuelCost + repaid + yardCommitted - borrowed,
  );
  actions.push(...overhead.actions);

  const exploreFloor = actions.some(isIncomeAction)
    ? SMUGGLER_EXPLORE_RESERVE
    : SMUGGLER_IDLE_EXPLORE_RESERVE;
  // F-150-2, CLOSED AT T-199 · this is F-116-1's twin and it now carries the same
  // `state.player.recovery === null` term the explorer's loop does. The full
  // reasoning for the guard — the engine's `ExplorationFailed{'recovery-in-progress'}`
  // refusal, why it is scoped to the queue rather than to the policy, and the named
  // dawn-pure residual — lives at `explorerPolicy`'s loop and is not restated here;
  // the two loops are identical again, on purpose. T-150 wrote this guard, measured
  // it and backed it out because it re-seeded the smuggler onto a stall in the
  // SHARED `planPacifistCombat`; T-199 fixed that planner first (see its header),
  // which is what made this line safe to add.
  //
  // F-196b-1 · THE LOOP'S CREDIT BOUND IS NOW CHARGED PER SWEEP, and this is a
  // T-196b fix, filed and measured. The credit test above used to be a ONE-SHOT
  // check taken before the first sweep: it asked "can the purse afford to be
  // exploring today", never "can it afford THIS MANY sweeps". That was survivable
  // only while the sign, the refuel and the yard each took a die, which held the
  // loop to one or two iterations; T-196b freed all three, so the same fuelled day
  // now hands the loop four dice and it burns 320 fuel instead of 160 — fuel the
  // NEXT dawn has to buy back at the pump. MEASURED over seeds 1..1000 × 120 days:
  // before this term the smuggler's longest zero-income streak developed a tail it
  // never had (seed 42: 6 days, seed 216: 8, against a HEAD maximum of 1 across
  // the whole 1,000), both stranded at Polaris-1 on the 100-credit subsistence
  // floor with a tank too thin to sweep and no fundable run. `sweepReplacement`
  // charges each queued sweep the credits its fuel will cost to replace, which is
  // the REAL bound the task's own F-116-1/F-150-2 clause demands be enforced IN
  // THE PLANNER. Note it does NOT cap the iteration count: a rich, fuelled day
  // still sweeps its whole hand, which is the pacing the loop is there for.
  const sweepReplacementCost = EXPLORATION_FUEL_COST * fuelDepotPrice;
  let sweepReplacement = 0;
  while (
    state.player.recovery === null &&
    state.player.credits +
      borrowed -
      refuelCost -
      repaid -
      overhead.cost -
      yardCommitted -
      sweepReplacement >
      exploreFloor &&
    projectedFuel >= EXPLORATION_FUEL_COST &&
    ledger.remaining() > 0
  ) {
    const die = ledger.takeBest();
    if (die === undefined) break;
    actions.push({ type: 'Explore', spendDie: die });
    projectedFuel -= EXPLORATION_FUEL_COST;
    sweepReplacement += sweepReplacementCost;
  }

  // ---- T-199 · F-199-1 · THE WALK HOME, AS THE LAST RUNG.
  // Deliberately placed AFTER the T-1603c drive refit and after the Explore sweep
  // above, not up with the contract block — both of those are gated on
  // `!actions.some(isIncomeAction)` and both are BETTER outs than a repositioning
  // burn (the refit ends a strand permanently by making the whole board flyable
  // again; the sweep feeds the pod supply line). Queueing a Travel ahead of them
  // would have switched them off. So the shared move goes last: it fires only on a
  // day where the yard, the board and the sweep floor all had nothing.
  //
  // WHY THE SMUGGLER AND NOT THE OTHER TWO. This wiring is here because leaving it
  // out WOKE A STRAND: on the 1,000-seed × 35-day map, seed 970 went from clean to
  // 5 consecutive zero-income days — the F-199-3 re-seeding effect, i.e. a defect
  // this change moved rather than caused, but moved INTO the sample, which makes it
  // this change's to close. `traderPolicy` and `veteranPolicy` are deliberately NOT
  // wired (see TASKS.md F-199-1): their strands are pre-existing and unmoved, and
  // widening to them measurably dulled `balance-combat-survival.test.ts`'s
  // preparation band.
  const homewardBurn = planHomewardBurn(state, ledger, actions, refuelCost);
  if (homewardBurn) actions.push(homewardBurn);
  const strandedExplore = planStrandedExplore(state, ledger, actions);
  if (strandedExplore) actions.push(strandedExplore);

  // T-196b: the yard spend joins "everything already committed this day". Unlike
  // `fighterPolicy`'s equivalent hole (F-199-1, deliberately left open there),
  // this one is NEW — before this task the smuggler's yard buys competed with the
  // day's dice and now they do not, so netting them is closing a hole this change
  // would otherwise open, not re-litigating a filed one.
  const debtPayment = planDebtPayment(
    state,
    SMUGGLER_RESERVE + loanHold,
    refuelCost + repaid + overhead.cost + yardCommitted,
    borrowed,
  );
  if (debtPayment) actions.push(debtPayment);

  return withReroll(state, actions.length > 0 ? actions : [{ type: 'Wait' }]);
};

// ---------------------------------------------------------------------------
// T-1601b · GAMBLER. The Spacers Hangout is a core PRD verb (§7 "Visit the
// Hangout", §7.5's first out, §6's Spacer's Dare wire line) that T-1303 built
// and T-1404 surfaced, but which no balance instrument ever PLAYED — the trader
// only ever visits the desk to borrow and repay (T-1601a). This policy plays the
// tables: an otherwise ordinary trading career that routes through the Hangout
// and wagers on opposed-GUILE Dares while it is standing there.
//
// Policy tuning, not game data (same justification as the smuggler's constants
// above): the Dare's own band is CONTENT, and after T-120/T-121 it is PER-PORT and
// after T-146 it is PER-TIER — read through the engine's `preHandWagerBand`
// accessor (T-168, §4.6a item 3), never restated and no longer even read as a
// global constant, exactly as planLoanBorrow treats the (still global, §2.2 ruling
// 5) lending band.
// ---------------------------------------------------------------------------

/** The working float the gambler never stakes into. Mirrors TRADER_RESERVE.
 *
 *  T-168 · WHAT THIS RESERVE ACTUALLY BOUNDS, restated honestly. It was
 *  documented as "deliberately larger than a full day of dares
 *  (GAMBLER_MAX_DARES_PER_DAY × the default band's max = 1,000)", and that stopped
 *  being true the moment the planner could request into the raised ceiling: at
 *  tier 4 the ceiling is ×3, and at tier 5 the band has no ceiling at all (§4.8),
 *  so two hands can exceed 3,000. What bounds exposure past tier 4 is
 *  GAMBLER_BANKROLL_FRACTION — 10% of the surplus above this reserve — together
 *  with the resolver's solvency clamp, which §4.8 names as the SOLE ceiling at
 *  tier 5. The reserve still does its original job at tiers 0-3, and it is still
 *  what makes it safe to settle the stakes FIRST in the day's plan: the fraction
 *  is taken of the surplus, so the float itself is never staked. */
const GAMBLER_RESERVE = 3000;
/** Share of the bankroll ABOVE the reserve the gambler is willing to put on one
 *  hand. The engine clamps the request into the effective band regardless, so at
 *  tiers 0-4 this only decides where inside that band a given day's stake lands.
 *  T-168 · At tier 5 there is no band ceiling to land inside, so this fraction
 *  becomes the instrument's own exposure bound. */
const GAMBLER_BANKROLL_FRACTION = 0.1;
/** Dice budget guard: at most two hands a day, so a Hangout dawn still has dice
 *  left for the sign/travel pair that keeps the day an income day. */
const GAMBLER_MAX_DARES_PER_DAY = 2;

/**
 * One hand of Spacer's Dare. The preconditions MIRROR `resolveVisitHangout` plus
 * day.ts's hangout/encounter gates exactly, so the policy can never burn a die on
 * a typed refusal (the `hangoutPlay.failedVisits === 0` assertion is what holds
 * this honest):
 *   - no encounter, and a `hasHangout` system (day.ts emits ActionBlocked
 *     otherwise) — read through `isHangoutSystem`, never a hard-coded id;
 *   - a co-located NPC to deal (`currentSystemId === player's`), else the engine
 *     returns a 'no-opponent' fail;
 *   - the RICHEST such NPC, first-wins on a tie. This is load-bearing, not
 *     cosmetic: the engine caps the wager at `min(the port band's max,
 *     playerCredits, dealerCredits)`, so dealing with a broke NPC produces a zero-or-tiny-stake
 *     hand that inflates the dare count and drags `expectedValuePerDare` toward
 *     0 — the one value the acceptance forbids;
 *   - the purse is above the reserve and the dealer can cover the minimum stake.
 *
 * T-197 · NO DIE, AND A REAL DAILY BOUND IN ITS PLACE
 * (docs/DAWN-HAND-REDESIGN.md §3/§4b). Opening a hand is a Free Action, so the
 * `DieLedger` is gone; what bounds the tables now is the ROUNDS-PER-DAY cap, which
 * scales with the captain's Liar's Dice unlock tier. This planner mirrors it the
 * same way it already mirrors `venueOffered` and the two broke rules — an open
 * past the cap earns a typed `daily-round-limit`, and burning a plan on a knowable
 * refusal is precisely what `hangoutPlay.failedVisits === 0` forbids.
 *
 * WHY THAT MIRROR IS NOT ENOUGH ON ITS OWN, and why the caller's loop counter is
 * the second half: these planners are PURE over the DAWN state, so
 * `state.player.dareRoundsToday` is the count at dawn — accurate for the first
 * queued hand and stale for every one after it. The caller carries the day's
 * allowance forward in its loop bound, exactly as it already carries `purse` and
 * `committedStakes` forward for the same reason. (This is the F-116-1 / F-150-2
 * class in its natural habitat: a free action inside a loop needs the loop to
 * hold the bound, because the state the planner reads no longer moves.)
 *
 * CRITICAL (same warning planLoanBorrow carries): the caller must queue this as
 * an EXTRA action on an otherwise normal working day, never as a standalone day.
 * `VisitHangout` is not an income action (`isIncomeAction`), so a gamble-only day
 * has `incomeActionCount === 0` and walks the poverty-trap invariant.
 *
 * `credits` is the purse the hand will actually be played against — the caller
 * passes the DAWN credits for the first hand and subtracts each queued stake for
 * the next, because these planners are pure and read the dawn state.
 */
function planDare(
  state: GameState,
  credits: number,
  /**
   * T-145 · Roster opponents this day has ALREADY queued a hand against. These
   * planners are pure and read the DAWN state, so `state.liarsDicePurses` is the
   * purse at dawn — accurate for the first hand and stale for the second. A
   * ROAMING dealer whose purse the first hand emptied is merely clamped to a
   * zero-stake hand by the engine, but a ROSTER opponent is REFUSED outright with
   * `HangoutEvent{failReason:'opponent-broke'}` (§7.4), and burning a die on a
   * knowable refusal is exactly what `hangoutPlay.failedVisits === 0` forbids. So
   * the caller carries the ids forward, the same way it already carries the
   * credits the previous stake would leave behind.
   */
  committedRosterIds: ReadonlySet<string> = new Set(),
  /**
   * F-123-3 (docs/HANGOUT_REDESIGN.md §7, fixed at T-150) · THE ROAMING HALF of
   * the same carry-forward, and the half T-145 deliberately left. Credits this
   * day's already-queued hands could take OFF each dealer, keyed by NPC id.
   *
   * STILL APPLICABLE AFTER THE LIAR'S DICE REDESIGN — checked, not assumed. M4d/M4e
   * replaced the HAND (the single opposed-GUILE check became the full bid/raise/
   * challenge resolver); they did not touch the DEALER PICK, which still runs once
   * off the dawn state right here. `docs/LIARS-DICE_REDESIGN.md` §16 re-confirms it
   * under the new resolver: "the seed is clamped to the dealer's purse, and a broke
   * dealer deals a free hand. Unchanged by this redesign, still not fixed here."
   *
   * THE WORST CASE IS THE DEALER LOSING THE QUEUED STAKE, which is the identical
   * convention the caller already applies to the player's own purse (`purse -=
   * dare.wager`). The symmetry is the argument: a planner that will not over-commit
   * the player's credits must not over-commit the other side of the table either.
   *
   * TWO MECHANISMS, TWO REASONS, both kept: `committedRosterIds` is CATEGORICAL (a
   * roster seat at purse <= 0 is REFUSED outright with `HangoutEvent{failReason:
   * 'opponent-broke'}`), this map is QUANTITATIVE (a drained roaming dealer is
   * merely clamped to a worthless sub-floor or zero stake). Collapsing them would
   * lose the distinction the engine itself draws.
   */
  committedStakes: ReadonlyMap<string, number> = new Map(),
): PlayerAction | null {
  if (state.encounter) return null;
  if (!isHangoutSystem(state.player.currentSystemId)) return null;
  // T-123 · THE PORT MUST ACTUALLY DEAL. Mirrors the engine's
  // `venueOffered(systemId,'dare')` gate in `resolveVisitHangout`, exactly as the
  // `!npc.dead` guard above mirrors its N3 guard. ARITHMETICALLY INERT TODAY: all
  // fourteen authored and baseline rows offer `dare` (T-123 narrows `venues` at
  // two ports, and neither withdraws the tables), so this cannot move a number —
  // and that is precisely why it lands now, on the T-121 precedent of shipping a
  // mirror while it is provably inert rather than after a later row makes it a bug.
  if (!venueOffered(state.player.currentSystemId, 'dare')) return null;
  // T-197 · THE DAY'S ROUNDS ARE THE NEW BOUND (§4b). Read through the engine's
  // own `liarsDiceRoundsRemaining`, never re-derived from the tier table here —
  // the same "the policy's guards are the engine's guards" argument F-121-1 made
  // for `!npc.dead`. See the docstring for why the CALLER's loop bound is the
  // other half of this: a pure planner over the dawn state cannot see the hands
  // this same day has already queued.
  if (liarsDiceRoundsRemaining(state) <= 0) return null;

  // T-145 · THE CANDIDATE SET NOW SPANS BOTH POOLS
  // (`docs/LIARS-DICE-PROGRESSION_SPEC.md` §8 row 38). Without this no sweep row
  // and no deed-coverage career ever plays a roster opponent, and the whole
  // milestone is unmeasured — which is why the row is T-145's rather than a later
  // task's. The selection RULE is unchanged: the richest candidate, first-wins on
  // a tie. The ordering is deterministic — the in-system NPCs are considered
  // first, so at equal credits a roaming captain still wins the seat and the
  // pre-T-145 behaviour survives wherever the roster does not out-bank the field.
  // T-169 · THE RICHEST-CANDIDATE RULE BELOW IS RULED, NOT OVERLOOKED
  // (`docs/LIARS-DICE-PROGRESSION_SPEC.md` §12.9 F-148-2, shape (b)). It has no
  // idea a *set* exists, which is why the M4e sweep reports 0 `liars_dice_grand_slam`
  // in 720 careers. That zero is a fact about THIS policy, not about the deed:
  // deliberate set-seeking play is measured on a different instrument —
  // `__tests__/support/deed-hunter.ts`'s roster tour, driven by
  // `__tests__/deed-coverage.test.ts`, where the grand slam lands in 75 of 76
  // careers. Do NOT teach this loop set-completion: it is the shared seat-picker
  // every dice sweep row reads off (§12.2, §12.3, §12.5, §12.6, §12.11), so
  // changing it re-bases every baseline in the same commit that measures it. If a
  // set-seeking number is ever wanted FROM THE SWEEP, add a probe policy beside
  // `gambler` on the `degradedTraderPolicy` precedent instead.
  let dealer: { id: string; credits: number } | null = null;
  for (const npc of state.npcs) {
    // F-121-1 · `!npc.dead` MIRRORS THE ENGINE'S N3 GUARD (`actions/hangout.ts`:
    // "a dead captain cannot deal a hand of Spacer's Dare"), and its absence here
    // was a real divergence, not a nicety: the resolver typed-fails a Dare against
    // a dead dealer with 'no-opponent', which is precisely what
    // `hangoutPlay.failedVisits === 0` exists to forbid. It was LATENT while one
    // port had a bar — measured 0 failures over 10 seeds x 120 days before T-121,
    // and 2 (seed 7, day 75, `npc-black-tide`) after, because the reach change puts
    // the gambler at a table on most days instead of a handful.
    if (npc.dead) continue;
    if (npc.currentSystemId !== state.player.currentSystemId) continue;
    // F-123-3 · the purse this dealer would still have AFTER losing every stake
    // today's earlier hands already committed against them. Reading `npc.credits`
    // raw is what made the second hand of the day a zero-stake wager (34 of 1,319
    // hands at T-123, 2.67% at T-125) — the dawn purse is accurate for the first
    // hand and stale for the second.
    const purse = npc.credits - (committedStakes.get(npc.id) ?? 0);
    if (purse <= 0) continue;
    if (dealer === null || purse > dealer.credits) dealer = { id: npc.id, credits: purse };
  }
  // T-145 · Pool A, mirroring the engine's §7.4 broke refusal exactly the way the
  // `!npc.dead` and `venueOffered` mirrors above already work: an opponent whose
  // LIVE purse has fallen to zero will not sit, and advertising them here would
  // burn a die on a guaranteed 'opponent-broke' — which is precisely what
  // `hangoutPlay.failedVisits === 0` exists to forbid.
  for (const opponent of liarsDiceOpponentsAt(state.player.currentSystemId)) {
    if (committedRosterIds.has(opponent.id)) continue;
    const purse = state.liarsDicePurses[opponent.id] ?? 0;
    if (purse <= 0) continue;
    if (dealer === null || purse > dealer.credits) dealer = { id: opponent.id, credits: purse };
  }
  if (dealer === null) return null;
  // T-121 · THE BAND IS THE PORT'S, read through the same engine accessor
  // `protocol.ts` and the Hangout pane use — never the bare content constants and
  // never a restated number. Before T-120 there was one band because there was one
  // bar; now that fourteen ports run tables, a policy that sized its stake off the
  // global constants would request a wager the engine then re-clamped, and the
  // measured `expectedValuePerDare` would drift away from what was actually played
  // (`docs/HANGOUT_REDESIGN.md` §4.2). Arithmetically inert today — all fourteen
  // rows inherit `DEFAULT_PORT_HANGOUT`'s band — and that is the point: it lands
  // while it is provably inert, ahead of the authored bands at T-123.
  //
  // T-168 · ...AND THE BAND IS THE TIER'S EFFECTIVE BAND, not the port's raw one
  // (§4.6a item 3, F-148-4). Sizing off `wagerBandFor` meant this planner could
  // never REQUEST a stake above the tier-0 ceiling, so no sweep row and no UGT
  // career ever exercised the raised bounded-betting ceiling or tier 5's removed
  // clamp — the ×3 multiplier was worth +43.7% bids per hand and nothing else.
  // Read through the engine's own accessor, which takes the whole state precisely
  // so this file cannot supply a tier of its own.
  const band = preHandWagerBand(state);
  // Tier 5 removes the band ceiling entirely (§4.8); the solvency clamps below and
  // in the resolver are what bound the stake there.
  const ceiling = band.max ?? Number.MAX_SAFE_INTEGER;
  // THE INSTRUMENT'S OWN FLOOR, and a POLICY CHOICE rather than a game rule. At
  // tiers 0-4 this IS the port's authored floor and is byte-identical to the
  // pre-T-168 `band.min`. At tier 5 the band has no floor (§4.8 — "a veteran may
  // sit at Regulus-6 for 10 credits"), so the planner supplies a 1-credit floor of
  // its own rather than seating a FREE hand: a zero stake still counts as a dare
  // and drags `expectedValuePerDare` toward 0, which is the one number this
  // instrument exists to measure.
  const floor = Math.max(1, band.min);
  // A dealer who cannot cover the minimum stake makes a zero-EV hand — skip it.
  // F-123-3 · with `dealer.credits` now carrying the day's committed stakes, this
  // ONE pre-existing guard closes BOTH halves of the finding for free: the zero
  // stake (34 of 1,319 hands) and the sub-floor stake (3 more) it also measured.
  // No new downstream guard is owed.
  //
  // T-168 · RE-DERIVED AGAINST THE EFFECTIVE BAND (F-148-4's last clause). Against
  // the raw port band this gate was wrong at tier 5, where the band's floor is 0
  // and the only honest floor is the instrument's own.
  if (dealer.credits < floor) return null;

  const bankroll = credits - GAMBLER_RESERVE;
  if (bankroll < floor) return null;
  const wager = Math.max(
    floor,
    Math.min(ceiling, Math.floor(bankroll * GAMBLER_BANKROLL_FRACTION)),
  );

  return { type: 'VisitHangout', venue: 'dare', opponentId: dealer.id, wager };
}

// ---------------------------------------------------------------------------
// T-135 · PLAYING THE LIAR'S DICE HAND OUT (docs/LIARS-DICE_REDESIGN.md §12).
//
// `planDare` above is UNCHANGED and stays a one-shot: it queues the opening
// `VisitHangout{venue:'dare'}` from the DAWN state, which is all a policy can
// honestly do — every move after the opening bid answers a dealer bid that did not
// exist at dawn. The rest of the hand is played by the runner's continuation loop
// (see `runCampaign`'s batch loop), which asks `planDareMove` for one move at a
// time against the LIVE state.
//
// Rejected, per the spec: re-invoking the whole policy mid-batch (it changes every
// policy's contract — they are documented as planning from the dawn state, and
// `dawnBlind` policies deliberately never see the mid-day state), and an
// engine-side auto-play (a player policy inside the engine, and it would make the
// UI's hand unplayable).
// ---------------------------------------------------------------------------

/** Mirrors the engine dealer's `DARE_AI_FOLD_QUANTITY` so the two sides fold on
 *  comparable evidence and the measured fold rate is not an artefact of an
 *  asymmetric baseline. */
const SIM_DARE_FOLD_QUANTITY = 5;
/** Mirrors the engine dealer's `DARE_AI_CHALLENGE_MARGIN`, for the same reason. */
const SIM_DARE_CHALLENGE_MARGIN = 1.5;
/**
 * A TRIPWIRE, NOT A POLICY. The bid lattice bounds a hand's raises: every raise
 * strictly increases quantity or face and decreases neither, so the number of
 * raises is bounded by `(maxQuantity - 1) + (DARE_MAX_FACE - 1)`.
 *
 * T-146 · STATED AT THE LADDER'S CEILING rather than at tier 0, because the hand's
 * quantity bound is now the hand's frozen `maxQuantity` (4 → 5 → 6 dice per side,
 * HARD-CAPPED AT SIX): at 6 dice that is `(12-1) + (6-1) = 16` raises, so with the
 * opening bid and the terminal move a hand is at most ~18 player actions long.
 * Still comfortably under 32, so the guard remains PROVABLY UNREACHABLE at every
 * tier and `dareGuardHits === 0` stays an assertion rather than a hope. **The
 * constant does not move** — only the argument for it got wider.
 */
export const DARE_MAX_MOVES_PER_HAND = 32;

/**
 * THE BASELINE HAND STRATEGY (§12.3). Pure: no rng, no `DieLedger`, no state
 * mutation. Returns the next move in the open hand, or `null` when there is no
 * hand to play.
 *
 * TOTAL over the scene's reachable state space, which partitions into exactly
 * three (there is no fourth, because the dealer answers synchronously and so the
 * returned state is always player-to-act):
 *   (a) no hand              → `null`; the loop's condition is already false.
 *   (b) a hand, no bid       → an OPENING BID is always legal: any held face is in
 *                              1..6, and T-160's opening floor
 *                              `minOpeningQuantity(own(F*)) = own(F*) + 1` is in
 *                              `1..dicePerSide + 1` ⊆ `1..maxQuantity` (T-146:
 *                              `maxQuantity` is `2 × dicePerSide`, and
 *                              `dicePerSide + 1 ≤ 2 × dicePerSide` for every
 *                              `dicePerSide ≥ 1`, so the floor can never exceed
 *                              the ceiling at ANY tier — including a six-dice
 *                              hand showing all six faces). An opening bid costs
 *                              no ante, so neither headroom nor credits can
 *                              refuse it either.
 *   (c) a hand, a bid stands → CHALLENGE is legal unconditionally (its single
 *                              precondition is `bid !== null`, it costs nothing,
 *                              and no clamp applies), and the fallback reaches it
 *                              on every path the earlier branches do not take.
 *
 * LEGALITY IS THE ENGINE'S. The raise branches filter through the engine's own
 * `legalDareMoves` — the SAME function the resolver refuses with and the dealer
 * chooses from — rather than restating §5.1's arithmetic here. That is the T-121 /
 * T-123 mirror discipline: a policy that re-derived the lattice would drift, and
 * `hangoutPlay.failedVisits === 0` is the assertion that holds it honest.
 *
 * TWO NAMED BASELINE LIMITATIONS, so T-137 reports the right thing (§12.5):
 *   - IT NEVER PEEKS. Dice are reserved at PLAN time by the policy's `DieLedger`
 *     and this loop runs after planning; grabbing a second die mid-batch would
 *     break the reservation invariant every other planner depends on. The measured
 *     win rate and EV are therefore a NO-PEEK baseline.
 *   - IT NEVER RAISES BOTH. So T-137's "how often is the 2× ante used" figure
 *     measures the DEALER's use only; a zero on the player's side is the baseline,
 *     not a bug.
 * Neither threatens totality: both are moves the baseline DECLINES, never states
 * it cannot answer.
 */
export function planDareMove(state: GameState): PlayerAction | null {
  const hand = state.dareHand;
  if (!hand) return null;

  const own = (face: number) => hand.playerDice.filter((d) => d === face).length;
  const legal = legalDareMoves(hand, 'player', state.player.credits);

  // (b) No bid stands — open at the engine's OPENING FLOOR on the face we hold
  // most of.
  if (hand.bid === null) {
    let bestFace = 1;
    // Ascending, with `>=`, so ties go to the HIGHER face: a claim on a taller
    // face leaves the opponent fewer face-raise steps to answer with. UNCHANGED
    // at T-160 — the selection rule is not what moved.
    for (let face = 1; face <= 6; face += 1) {
      if (own(face) >= own(bestFace)) bestFace = face;
    }
    return {
      type: 'Dare',
      move: 'bid',
      face: bestFace,
      // T-160 · `minOpeningQuantity(own(bestFace))`, asked of the ENGINE rather
      // than restated as `own + 1` here — the same mirror discipline the raise
      // branches keep by filtering through `legalDareMoves`.
      //
      // THIS IS NOT §16.2'S BANNED THIRD SHAPE. The banned shape was "teach
      // `planDareMove` to open above its own count" as the FIX — moving the
      // measurement while the rule stayed put, so a human opening truthfully
      // would still play the old, broken game. Here the RULE moved underneath
      // the planner: `isLatticeMove` now REFUSES `quantity <= own(face)` for
      // every actor, human included, and this line is the minimum legal
      // adaptation forced by that refusal. The planner is still not bluffing —
      // it makes the smallest claim the lattice permits and nothing taller.
      quantity: minOpeningQuantity(own(bestFace)),
    };
  }

  const bid = hand.bid;
  // T-146 · the unknown half is the HAND'S frozen `dicePerSide` (§8 row 39), not a
  // hardcoded four — otherwise the baseline would systematically under-credit the
  // other side of the table at tiers 1 and 2 and challenge true claims too often.
  // Identical at four dice, so T-137's pool-B baseline stays comparable.
  const expected = own(bid.face) + hand.dicePerSide / 6;

  // (c1) Hopeless: none of the claimed face and a tall claim.
  if (own(bid.face) === 0 && bid.quantity >= SIM_DARE_FOLD_QUANTITY && legal.includes('fold')) {
    return { type: 'Dare', move: 'fold' };
  }

  // (c2) The claim is taller than the evidence supports.
  if (bid.quantity > expected + SIM_DARE_CHALLENGE_MARGIN && legal.includes('challenge')) {
    return { type: 'Dare', move: 'challenge' };
  }

  // (c3) Raise if a raise is legal AND affordable AND within headroom — all three
  // answered by the engine's own accessor.
  if (legal.includes('raise-quantity')) {
    return { type: 'Dare', move: 'raise-quantity', quantity: bid.quantity + 1, face: bid.face };
  }
  if (legal.includes('raise-face')) {
    return { type: 'Dare', move: 'raise-face', quantity: bid.quantity, face: bid.face + 1 };
  }

  // (c4) Terminal fallback. Unconditional, which is what makes (c) total.
  return { type: 'Dare', move: 'challenge' };
}

/**
 * GAMBLER — a working trader who plays the tables. The day is the trader's
 * (refuel sized to the leg → crippled repair → richest NET fundable run → fly it
 * → pay the Guild), with two changes:
 *   1. inside the already-fundable set it PREFERS a run that ends at a Hangout
 *      system, so it is standing at the tables on the next dawn (the same shape
 *      as the trader's head-home preference, minus the loan condition);
 *   2. while it IS at a Hangout, it queues up to GAMBLER_MAX_DARES_PER_DAY hands
 *      as EXTRA actions on that working day.
 *
 * The working day is planned FIRST so the sign/travel dice are reserved before
 * the tables get what is left; the dares are then placed at the FRONT of the
 * returned plan so the stakes settle before the day's spending. That ordering is
 * only safe because GAMBLER_RESERVE exceeds a full day of maximum stakes.
 */
export const gamblerPolicy: SimPolicy = ({ state }) => {
  const ledger = dieLedger(state);
  if (state.encounter) return withReroll(state, planPacifistCombat(state, ledger));

  const actions: PlayerAction[] = [];
  const ship = state.player.ship;
  const from = state.player.currentSystemId;

  const storyletAction = chooseStoryletAction(state);
  if (storyletAction) {
    if (storyletAction.type === 'Storylet' && storyletAction.spendDie === undefined) {
      actions.push(storyletAction);
    } else {
      return withReroll(state, [storyletAction]);
    }
  }

  const fuelDepotPrice = state.market.localFuelPrice || 5;
  const ranked = rankedContracts(state);
  const signableWithin = (cap: number) =>
    ranked
      .filter((c) => c.fuel <= cap)
      .map((c) => ({ ...c, net: c.payment - c.fuel * fuelDepotPrice }))
      .filter((c) => c.net > 0)
      .sort((a, b) => b.net - a.net || a.index - b.index);
  let reachable = signableWithin(ship.maxFuel * SIGN_FUEL_FRACTION);
  // The T-1104 full-tank relaxation (see traderPolicy) — the anti-strand fix.
  if (reachable.length === 0) {
    reachable = signableWithin(ship.maxFuel);
  }

  // Head for the tables: a fundable run that ENDS at a Hangout is preferred over
  // an equally fundable one that does not. Preference only, inside the fundable
  // set — the gambler never flies a run it cannot fund just to reach a game.
  let preferred = reachable.length > 0 ? reachable[0] : null;
  if (preferred) {
    // T-123 · "where the tables are" means where a hand is actually DEALT — the
    // same `venueOffered` mirror `planDare` now carries, so the two cannot drift.
    // Inert today (every port offers `dare`), landed while it is provably so.
    const tablesRun = reachable.find(
      (c) => isHangoutSystem(c.destination) && venueOffered(c.destination, 'dare'),
    );
    if (tablesRun) preferred = tablesRun;
  }

  const primaryDest = state.player.activeContract
    ? state.player.activeContract.destination
    : (preferred?.destination ?? null);
  const primaryFuelNeed =
    primaryDest !== null ? playerJumpFuel(state, systemDistance(from, primaryDest)) : 0;

  // The trader's Penny Wise machinery, and doubly in character here: the gambler
  // is already standing at the desk. It is also load-bearing for survival — a
  // botched pilot check burns the leg's fuel and leaves the ship at origin, so a
  // thin purse plus one bad jump strands the ship on a contract it can neither
  // fly nor abandon. Measured without it (seeds 1..8 × 300 days): seeds 3 and 7
  // locked in the first week and finished on 1-2 credits with markers compounded
  // past 5,100,000 and 294 fuel-starved days. Queued FIRST, and always as an
  // EXTRA action on a working day (never a standalone day — see planLoanBorrow).
  const fuelShortfall =
    primaryFuelNeed > ship.fuel
      ? (primaryFuelNeed - ship.fuel) * fuelDepotPrice - state.player.credits
      : 0;
  const workingCapitalShortfall =
    state.player.debt > 0 && state.player.credits < GAMBLER_RESERVE
      ? GAMBLER_RESERVE - state.player.credits
      : 0;
  const borrow = planLoanBorrow(state, Math.max(fuelShortfall, workingCapitalShortfall));
  let borrowed = 0;
  if (borrow) {
    actions.push(borrow.action);
    borrowed = borrow.principal;
  }
  const repay = planLoanRepay(state);
  let repaid = 0;
  if (repay) {
    actions.push(repay);
    repaid = state.player.loan?.outstanding ?? 0;
  }

  const refuel = planRefuel(
    state,
    repaid,
    Math.min(ship.maxFuel, Math.max(FUEL_REFUEL_THRESHOLD, primaryFuelNeed)),
    Math.min(ship.maxFuel, Math.max(FUEL_REFUEL_TARGET, primaryFuelNeed)),
    borrowed,
  );
  let refuelCost = 0;
  if (refuel) {
    actions.push(refuel.action);
    refuelCost = refuel.cost;
  }

  const repair = planCrippledRepair(state, GAMBLER_RESERVE, borrowed - repaid);
  if (repair) actions.push(repair);

  const boughtFuel = refuel ? refuel.cost / fuelDepotPrice : 0;
  const availableFuel = Math.min(ship.maxFuel, ship.fuel + boughtFuel);

  if (state.player.activeContract) {
    const die = ledger.takeBest();
    if (die !== undefined) {
      actions.push({
        type: 'Travel',
        destinationId: state.player.activeContract.destination,
        spendDie: die,
      });
    }
  } else if (preferred && availableFuel >= primaryFuelNeed) {
    const best = preferred;
    // T-196b: free sign — gated on the travel die alone. Bounds unchanged: one
    // active contract (engine), and `preferred` is inside the fundable set.
    const travelDie = ledger.takeBest();
    if (travelDie !== undefined) {
      actions.push({
        type: 'Trade',
        action: 'sign-contract',
        contractIndex: best.index,
      });
      actions.push({ type: 'Travel', destinationId: best.destination, spendDie: travelDie });
    }
  }

  // ---- Nothing to fly? Go where the tables are -----------------------------
  // Reached only when the board held no fundable run at all, so this costs the
  // day nothing it would have earned — and a gambler with no work on the board
  // heading for the Hangout is the most in-character move this policy has. It is
  // also the anti-idle fix: `Travel` IS an income action, and without it a rich
  // gambler simply stops (measured on seeds 1..20 × 300 days: seed 19 sat at
  // Rigel-8 for 5 straight days on 50,546 credits and a 117-unit tank, level
  // with the poverty-trap bar). Never launches a leg the tank cannot finish.
  if (!state.player.activeContract && !actions.some(isIncomeAction)) {
    let target: number | null = null;
    let bestDistance = Infinity;
    for (const id of hangoutSystemIds()) {
      if (id === from || isGatedDestination(id)) continue;
      const dist = systemDistance(from, id);
      if (dist < bestDistance) {
        bestDistance = dist;
        target = id;
      }
    }
    if (target !== null && availableFuel >= playerJumpFuel(state, bestDistance)) {
      const die = ledger.takeBest();
      if (die !== undefined) {
        actions.push({ type: 'Travel', destinationId: target, spendDie: die });
      }
    }
  }

  // T-175 · THE TWO SHARED ANTI-IDLE RUNGS (F-199-1 / F-199-2), AND THE SMUGGLER'S
  // PRECEDENT APPLIES TO THIS WIRING VERBATIM: "a defect this change moved rather
  // than caused, but moved INTO the sample, which makes it this change's to close"
  // (see `smugglerPolicy`'s own note). T-175 changed an ENGINE RULE — `optimal` now
  // reads the standing claim — which re-phases every gambler career from the first
  // hand it plays, and two of the 1,000 capstone seeds landed on a rim strand this
  // policy could not leave: seed 819 sat at system 17 for days 45-49 and seed 485
  // at system 18 for days 80-84, both on a FULL TANK and **67,913 credits** in the
  // second case. That is not a poverty trap and it was never about money.
  //
  // WHY THE BLOCK ABOVE IS NOT ENOUGH. "Go where the tables are" only ever
  // considers `hangoutSystemIds()`, and from the deep rim EVERY Hangout can be out
  // of tank range at once — the exact corner `planHomewardBurn`'s own docblock
  // describes ("distance 5, so `reachable` is empty most dawns"). The shared rung
  // takes ANY reachable leg, which is why it closes what the Hangout-seeking move
  // cannot.
  //
  // IT CANNOT DISPLACE A RUN. Both rungs return `null` the moment
  // `actions.some(isIncomeAction)` is true, so they only ever fill a day the board,
  // the tank and the Hangout search all left empty — and they are placed AFTER that
  // search for the same reason `smugglerPolicy` places them last: queueing a Travel
  // ahead of a better out would switch the better out off.
  const homewardBurn = planHomewardBurn(state, ledger, actions, refuelCost);
  if (homewardBurn) actions.push(homewardBurn);
  const strandedExplore = planStrandedExplore(state, ledger, actions);
  if (strandedExplore) actions.push(strandedExplore);

  // T-1601a's protection: while a Penny Wise balance is live and unpaid today,
  // hold it back from the Guild marker (a default grudge-weights Penny Wise into
  // the interceptor draw and multiplies the encounter chance until cleared).
  const loanHold = state.player.loan && !repay ? state.player.loan.outstanding : 0;
  // N9 · The captain's overhead, ahead of the marker payment (see traderPolicy)
  // and ahead of the tables below, so a hire is never funded with money the day
  // has already staked.
  const overhead = planCaptainOverhead(
    state,
    GAMBLER_RESERVE + loanHold,
    refuelCost + repaid - borrowed,
  );
  actions.push(...overhead.actions);
  const debtPayment = planDebtPayment(
    state,
    GAMBLER_RESERVE + loanHold,
    refuelCost + repaid + overhead.cost,
    borrowed,
  );
  if (debtPayment) actions.push(debtPayment);

  // ---- The tables, with whatever dice the working day left over -------------
  // Each hand is re-clamped against the credits the previous one would leave in
  // the worst case (a loss), so two queued stakes can never over-commit the purse.
  const dares: PlayerAction[] = [];
  let purse = state.player.credits - overhead.cost;
  // T-145 · …and the same carry-forward for the ROSTER opponent's side of the
  // table, for the reason `planDare`'s own parameter documents.
  const committedRosterIds = new Set<string>();
  // F-123-3 · …and the DEALER's side of the same carry-forward, for the roaming
  // pool T-145's set does not cover. Worst case per dealer = they lose every stake
  // queued against them today, the same convention `purse` above applies to the
  // player. See `planDare`'s parameter doc for why the two mechanisms stay
  // separate rather than being collapsed into one.
  const committedStakes = new Map<string, number>();
  // T-197 · THE LOOP BOUND IS NOW THE DAY'S REMAINING ROUNDS AS WELL
  // (docs/DAWN-HAND-REDESIGN.md §4b). `planDare` mirrors the engine's cap, but it
  // is PURE over the DAWN state — `dareRoundsToday` does not move between two
  // calls in this loop, so the planner alone would happily queue a second hand a
  // tier-0 captain's cap forbids and earn a typed `daily-round-limit`. The loop
  // counter is what carries the allowance forward, exactly as `purse` and
  // `committedStakes` above carry the credits and the dealers' purses forward for
  // the identical reason. `hangoutPlay.failedVisits === 0` is the mechanical proof
  // this mirror is right; if it ever goes non-zero, THIS is the line to read first.
  const roundsToday = Math.min(GAMBLER_MAX_DARES_PER_DAY, liarsDiceRoundsRemaining(state));
  for (let hand = 0; hand < roundsToday; hand += 1) {
    const dare = planDare(state, purse, committedRosterIds, committedStakes);
    if (!dare) break;
    dares.push(dare);
    purse -= dare.type === 'VisitHangout' ? (dare.wager ?? 0) : 0;
    if (dare.type === 'VisitHangout' && dare.opponentId !== undefined) {
      committedStakes.set(
        dare.opponentId,
        (committedStakes.get(dare.opponentId) ?? 0) + (dare.wager ?? 0),
      );
      if (dare.opponentId.startsWith('ld-')) committedRosterIds.add(dare.opponentId);
    }
  }

  const plan = [...dares, ...actions];
  return withReroll(state, plan.length > 0 ? plan : [{ type: 'Wait' }]);
};

/**
 * Net cost of a component-tier upgrade — the yard sticker price less the trade-in
 * on the current fit, so the fighter never burns a die on a purchase it cannot
 * afford.
 *
 * ASKS THE ENGINE rather than restating its arithmetic. This used to be a private
 * copy of the yard's price/trade-in maths, and the copy is exactly how the
 * strength-vs-tier trade-in bug (see `YARD_COMPONENT_TRADE_IN` in content) stayed
 * invisible on the sim side: the instrument agreed with the engine because it had
 * inherited the same mistake. `quoteShipyard` is the engine's own pure preview and
 * returns the figure the resolver will actually charge, so the two cannot drift
 * again — the same lesson R0a recorded for the tribute oracle.
 */
function componentTierNetCost(
  state: GameState,
  // N9 widened this from the fighter's four combat components to the engine's
  // whole `ShipComponentId` union, so the CABIN (the crew-berth socket,
  // `crewCapacity`) is priced through the same single source of truth. No new
  // arithmetic — `quoteShipyard` already accepts every component id.
  component: ShipComponentId,
  tier: number,
): number {
  if (YARD_COMPONENT_TIER_PRICES[tier - 1] === undefined) return Infinity;
  return quoteShipyard(state.player, {
    type: 'Shipyard',
    action: 'buy-component-tier',
    component,
    tier,
  }).cost;
}

const FIGHTER_RESERVE = 3000;

/**
 * T-1601a · The fighter's special-equipment shopping list, and the ONE ordering
 * fact that makes it work: AUTO_REPAIR is priced `min(hull.strength * 1000,
 * 20000)` (engine shipyard.ts `specialEquipmentCost`, mirrored in
 * `simSpecialEquipmentCost`), so it costs **1,000 credits while the ship is still
 * on the junker's strength-1 hull and 20,000 the moment the tier-3 hull refit
 * lands**. A player who wants it buys it FIRST — which is why `fighterPolicy`
 * now runs `planSpecialEquipment` BEFORE `planFighterUpgrade`, instead of after.
 * It carries no renown gate either, so it is the only special equipment a
 * low-renown fighter can reach at all, and it is what makes the T-1206 module
 * genuinely load-bearing in this policy's play (`equipmentUse.autoRepairDusks`).
 *
 * CLOAKER and TITANIUM_HULL are deliberately absent: both conflict with this list
 * under the engine's exclusion ladder (see `planSpecialEquipment`).
 */
const FIGHTER_EQUIPMENT_PRIORITY: readonly SpecialEquipmentId[] = [
  'AUTO_REPAIR',
  'STAR_BUSTER',
  'ARCH_ANGEL',
  'ASTRAXIAL_HULL',
];

/**
 * The fighter's shopping list, cheapest meaningful refit first: a real gun, then
 * a bigger gun, then a tougher hull/shields/drives — each bought only when the
 * surplus above the operating reserve covers it.
 *
 * R2a · THE CEILING THIS LIST USED TO IMPOSE, AND WHY IT WAS A BUG. The wishlist
 * stopped at weapons strength 50 (yard tier 5) and 30 for everything else, while
 * the policy finished a 120-day career holding a MEASURED ~126,000 credits and
 * yard tier 9 (strength 90) costs 10,000. A fighter that will not spend 8% of its
 * purse on the gun it exists to fire is not "a fighter playing well" — it is an
 * instrument that stops halfway up its own progression, which is the same class
 * of defect as R0a's stale tribute oracle.
 *
 * WHAT THE CEILING HID, and why it blocked R2 (measured, 120 seeds × 120 days):
 *   * `player.tier` is `max(rankTier, shipClassTier)` (engine tier.ts) and
 *     `shipClassTier` needs strength > 50 for tier 4 and > 70 for tier 5. Capped
 *     at exactly 50, the fighter sat at **tier 3 in 97% of its encounters** and
 *     reached tier 4 or 5 **never**.
 *   * `chooseTargetTier` clamps interceptors to [tier−1, tier+1], so a tier-3
 *     player can only ever draw tiers 2–4. Measured tier-5 interceptor share:
 *     **0.0%** for the fighter and the trader, 6.7% for the veteran.
 *   * **25 of the 65 entries in `ANONYMOUS_INTERCEPTORS` — the whole tier-4/5
 *     band — were therefore never exercised by any balance sweep ever run.**
 *     R2 asked "are top-tier pirates a real threat?" about content the instrument
 *     could not reach, which is why an elite-only power lever measured as an
 *     exact no-op.
 * With the ceiling lifted: player tier 5 in 87.7% of encounters, and the tier-5
 * interceptor share goes 0.0% → 62.2%.
 *
 * The tiers below are the yard's own ladder (`YARD_COMPONENT_TIER_PRICES`, 9
 * entries), walked in the same cheapest-first order as before — the shape of the
 * list is unchanged, only its ceiling. Shared with the veteran policy, which
 * calls this function too.
 */
/** T-196b · `committed` is what the rest of today's plan has already promised to
 *  spend. The yard is a Free Action now, so this planner and
 *  `planSpecialEquipment` / `planCaptainOverhead` can all fire on the SAME day —
 *  before M17 the die scarcity made that collision rare, and each one reading the
 *  dawn balance would now let the same credits be spent three times over. Still at
 *  most ONE wishlist entry per day (the `return` inside the loop): that cap was
 *  never the die's doing. */
function planFighterUpgrade(state: GameState, committed = 0): PlayerAction | null {
  const ship = state.player.ship;
  const wishlist: { component: 'weapons' | 'hull' | 'shields' | 'drives'; tier: number }[] = [];
  if (ship.weapons.strength < 30) wishlist.push({ component: 'weapons', tier: 3 });
  else if (ship.weapons.strength < 50) wishlist.push({ component: 'weapons', tier: 5 });
  else if (ship.weapons.strength < 70) wishlist.push({ component: 'weapons', tier: 7 });
  else if (ship.weapons.strength < 90) wishlist.push({ component: 'weapons', tier: 9 });
  if (ship.hull.strength < 30) wishlist.push({ component: 'hull', tier: 3 });
  else if (ship.hull.strength < 70) wishlist.push({ component: 'hull', tier: 7 });
  if (ship.shields.strength < 30) wishlist.push({ component: 'shields', tier: 3 });
  else if (ship.shields.strength < 70) wishlist.push({ component: 'shields', tier: 7 });
  if (ship.drives.strength < 30) wishlist.push({ component: 'drives', tier: 3 });

  for (const pick of wishlist) {
    const cost = componentTierNetCost(state, pick.component, pick.tier);
    if (state.player.credits - committed >= FIGHTER_RESERVE + cost) {
      return {
        type: 'Shipyard',
        action: 'buy-component-tier',
        component: pick.component,
        tier: pick.tier,
      };
    }
  }
  return null;
}

/** The net yard price of a `buy-component-tier` this policy has just queued, for
 *  the running `committed` total the next planner is judged against. */
function upgradeCost(state: GameState, upgrade: PlayerAction | null): number {
  if (!upgrade || upgrade.type !== 'Shipyard' || upgrade.action !== 'buy-component-tier') return 0;
  if (upgrade.component === undefined || upgrade.tier === undefined) return 0;
  const cost = componentTierNetCost(state, upgrade.component, upgrade.tier);
  return Number.isFinite(cost) ? Math.max(0, cost) : 0;
}

/**
 * FIGHTER — upgrade-then-hunt. It funds itself with a contract run each day
 * (fuel gating respected), reinvests the surplus into weapon/hull/shield/drive
 * tiers, and when an interceptor jumps it, it FIGHTS the ones it can drop — one
 * volley per point of enemy hull, spending the sharpest dice, but only when the
 * tank holds enough fuel for the whole exchange. Outmatched (not enough fuel or
 * hand for the full kill) it runs, and if it can't even run it talks its way out.
 */
export const fighterPolicy: SimPolicy = ({ state }) => {
  const ledger = dieLedger(state);

  if (state.encounter) {
    const encounter = state.encounter;
    const targetId = encounter.interceptor.id;
    const hull = Math.max(1, encounter.enemyHull);
    // T-1205: a winning volley now removes `weaponVolleyDamage` hull points, not a
    // flat 1, so the clean kill takes CEIL(hull / volleyDamage) volleys — fewer
    // with an upgraded gun. Queuing the old raw `hull` count over-fired once
    // weapons were load-bearing: the enemy died early and the surplus Combat
    // actions hit no encounter (a throw). Sizing the queue to the real damage is
    // both the fix and the reason an upgraded fighter wins more (this task's A/B).
    // T-1601a: this window is already the WIDE one, and deliberately stays so —
    // `volleys` is the min of what the enemy needs, what the tank can burn and
    // what the hand holds, and any value >= 1 commits, so a PARTIAL volley is
    // taken rather than bailing to the pacifist path. That is the right trade
    // once the fit is load-bearing (T-1205/T-1206): enemy hull carries between
    // rounds and upgraded shields absorb the counter-fire. It is also where the
    // report's `equipmentUse.upgradedVolleys` and `shieldAbsorbedPoints` come
    // from. The pacifist fallback below is reached only on a dry tank or an
    // exhausted hand — i.e. when there is genuinely no volley to throw.
    const volleysNeeded = Math.ceil(hull / weaponVolleyDamage(state.player.ship));
    const fuelVolleys = Math.floor(state.player.ship.fuel / FIGHT_FUEL_COST);
    const volleys = Math.min(volleysNeeded, fuelVolleys, ledger.remaining());
    if (volleys >= 1) {
      // Queue exactly `volleys` fights — never more than the enemy's hull, so a
      // clean sweep resolves on the final volley without a dangling action.
      const fights: PlayerAction[] = [];
      for (let i = 0; i < volleys; i += 1) {
        const die = ledger.takeBest();
        if (die === undefined) break;
        fights.push({ type: 'Combat', stance: 'fight', targetId, spendDie: die });
      }
      if (fights.length > 0) return withReroll(state, fights);
    }
    // Can't win this one cleanly: fall back to the pacifist escape logic.
    return withReroll(state, planPacifistCombat(state, ledger));
  }

  const actions: PlayerAction[] = [];

  // ---- T-199 · F-199-2 · THE CRIPPLED REPAIR THE FIGHTER WAS THE LAST POLICY
  // WITHOUT. `planCrippledRepair` (T-1205/T-1302) is carried by `traderPolicy`,
  // `smugglerPolicy`, `gamblerPolicy`, `explorerPolicy` and `veteranPolicy`; the
  // fighter — the ONE archetype that deliberately stands and trades fire, and so
  // the one whose hull is chipped most — had no repair of any kind. That is the
  // same omission shape T-159 and T-161 each closed for this file (the last
  // policy without the full-tank relaxation), and it produced the same result.
  //
  // Seed 74 is the picture, and it is not a fuel problem or a credit problem:
  // enemy fire ground the hull to condition 1, which collapses the tank to
  // `(1+1)·1·30 = 60` units. At 60 the ship is below the 80-unit Explore floor
  // FOREVER, and on junker drives (strength 10) it can only reach systems within
  // distance 5, so `reachable` is empty most dawns, `planHomewardBurn` finds no
  // leg and `planStrandedExplore` cannot fire. Nine to twenty-six consecutive
  // zero-income days followed. No anti-idle rule can reach that state; the only
  // move that reopens the map is the one every other policy already makes.
  //
  // Placed FIRST, ahead of the refuel, for the reason `planRefuel` itself needs:
  // a repair lifts `maxFuel`, so buying fuel into the collapsed ceiling first
  // would cap the top-up at the broken tank. Same reserve the rest of the day
  // spends against, so it cannot itself strand the purse.
  const crippledRepair = planCrippledRepair(state, FIGHTER_RESERVE);
  if (crippledRepair) actions.push(crippledRepair);

  const refuel = planRefuel(state, 0);
  if (refuel) actions.push(refuel.action);

  // T-1104: only sign a contract whose jump fits inside SIGN_FUEL_FRACTION of the
  // tank — the SAME reachability gate trader/veteran already apply. Before
  // rollContract issued rim destinations the richest contract was always a
  // fuelable core run, so picking ranked[0] raw was safe; now the richest is
  // often a long, high-DC rim run this ship can neither fuel nor fly, and signing
  // it locked the contract (a failed jump never clears activeContract) and
  // poverty-trapped the fighter. Filtering to reachable runs keeps "richest run"
  // intent while refusing the unwinnable rim temptation.
  const ranked = rankedContracts(state);
  const signFuelCap = state.player.ship.maxFuel * SIGN_FUEL_FRACTION;
  let reachable = ranked.filter((c) => c.fuel <= signFuelCap);
  // T-159: the T-1104 full-tank RELAXATION, ported (not invented) from the four
  // policies that already carry it verbatim — `traderPolicy`, `smugglerPolicy`,
  // `gamblerPolicy` and `explorerPolicy`. The fighter was the last gated policy
  // without it, and the omission read from the outside as a monoculture: parked
  // at a RIM port where every reachable leg exceeds 0.6 of the tank, `reachable`
  // comes back empty every day, so the fighter signs nothing and Waits.
  //
  // Why the streak climbs instead of self-correcting: refuel, special equipment,
  // component tiers, captain overhead and debt payment all still QUEUE below, so
  // the ship looks busy — but none of them is an income action (`isIncomeAction`,
  // this file, ~L1659-1665, counts only sign-contract / Travel / Explore /
  // fight-or-talk). A busy, earning-nothing day is still a zero-income day.
  //
  // Measured before this line (the sweep gate's own first honest CI run, seeds
  // 1..200 at 35 days): fighter's longest zero-income streak 32 against a limit
  // of 5, with six seeds >= 5 (35, 54, 75, 80, 115, 181) — every other gated
  // policy sat at 2-4. Seed 35 is the picture: parked at Algol-2 from day 7 with
  // 2,825cr and a live 2-4 offer board it could not sign from, debt compounding
  // 20,970 -> 23,156 by day 36.
  //
  // The trade this accepts is the SAME one T-1104 argued for in the trader: a
  // full-tank run leaves a thinner re-flight margin after an interrupted
  // delivery. Taking the completable run beats idling at the rim.
  //
  // Readers: `assertNoIncomeStall` / `INCOME_STALL_LIMIT` in `balance/gate.ts`,
  // and the `< 5` poverty-trap invariant in `campaign-policies.test.ts`.
  if (reachable.length === 0) {
    reachable = ranked.filter((c) => c.fuel <= state.player.ship.maxFuel);
  }
  if (state.player.activeContract) {
    const die = ledger.takeBest();
    if (die !== undefined) {
      actions.push({
        type: 'Travel',
        destinationId: state.player.activeContract.destination,
        spendDie: die,
      });
    }
  } else if (reachable.length > 0) {
    const best = reachable[0];
    // T-196b: free sign — gated on the travel die alone. Bounds unchanged: one
    // active contract (engine), and `reachable` is the fuel-capped set.
    const travelDie = ledger.takeBest();
    if (travelDie !== undefined) {
      actions.push({
        type: 'Trade',
        action: 'sign-contract',
        contractIndex: best.index,
      });
      actions.push({ type: 'Travel', destinationId: best.destination, spendDie: travelDie });
    }
  }

  // ---- T-159 (second pass) · NOTHING ON THE BOARD IS FLYABLE AT ALL: FLY HOME
  // The relaxation above closes the case where the margin cap is the only thing
  // in the way. It CANNOT close the harder rim corner — see `planHomewardBurn`,
  // which is this pass, lifted verbatim at T-199 so the trader and the smuggler
  // (which had the same hole, F-199-1) can share it. The fighter's
  // behaviour is unchanged by that extraction (proved before the second rung was
  // added: this row's fingerprint came back byte-identical to its pre-T-199 pin,
  // and the 200-seed × 35-day strand scan reported the same two offenders).
  //
  // The SECOND rung (`planStrandedExplore`) is new and is the fighter's own
  // finding — F-199-2, measured at 1,000 seeds × 35 days: seeds 74, 747 and 916 sat
  // 9, 26 and 24 consecutive zero-income days at rim ports where not even the walk
  // home was affordable — but it is queued at the TAIL of
  // this plan, not here, because an Explore can charge `apCost` dice at claim and
  // would orphan the yard purchases below. See its doc.
  const homewardBurn = planHomewardBurn(state, ledger, actions, refuel ? refuel.cost : 0);
  if (homewardBurn) actions.push(homewardBurn);

  // T-1601a: special equipment goes FIRST for the fighter. AUTO_REPAIR is priced
  // off the CURRENT hull strength, so buying it before `planFighterUpgrade` lands
  // the tier-3 hull is the difference between 1,000 and 20,000 credits — see
  // FIGHTER_EQUIPMENT_PRIORITY. The offensive items behind it (STAR_BUSTER /
  // ARCH_ANGEL at CAPTAIN, ASTRAXIAL_HULL at GIGA_HERO) still open only through
  // EARNED rank (T-114a); only the ORDER relative to the component tiers moved.
  // R2c · CLEAR THE GUILD MARKER BEFORE DISCRETIONARY KIT.
  //
  // This policy used to buy special equipment and component tiers FIRST and remit
  // only the leftovers to the Guild — the only competent policy that did. That was
  // survivable while the yard's trade-in bug made mid-ladder upgrades free (see
  // `YARD_COMPONENT_TRADE_IN` in content). Once upgrades cost real credits it
  // became a debt spiral: measured on seed 1 x 300 days, the fighter ended owing
  // **4,253,290 credits** while sitting on its 2,825 reserve, having bought one
  // special module and four component tiers and never cleared the marker.
  //
  // Gating kit on `debt === 0` is not a tuning knob, it is the same rule every
  // other competent policy already follows, and `traderPolicy` states the
  // principle at its own rim-preference gate: the marker "is the Tour One failure
  // condition and the acceptance's clear-rate band, so the trader finishes paying
  // the Guild before it starts flying the long, expensive, lucrative rim legs."
  // No captain buys a STAR_BUSTER while owing 25,000cr at compounding interest.
  //
  // Measured effect on the same seed/horizon: debt 4,253,290 -> 0, credits
  // 2,825 -> 584,456, special equipment 1 -> 3, component tiers 4 -> 9, and
  // `shieldAbsorbedPoints` 0 -> 86 (the fit is finally USED, which is what
  // `campaign-policies.test.ts` asserts).
  const kitAllowed = state.player.debt === 0;
  // NOTE, measured: ungating special equipment does NOT work. It was tried — the
  // priority list opens with a cheap AUTO_REPAIR but continues to STAR_BUSTER /
  // ARCH_ANGEL (10,000 each) and ASTRAXIAL_HULL (100,000), and letting it through
  // while the marker is open reproduced the full spiral (seed 1 x 300 days: debt
  // back to 4,253,290). Both planners have to wait.
  // T-196b · THE RUNNING CREDIT COMMITMENT, threaded through the three shopping
  // planners below. Each of them reads the DAWN balance, and until this task the
  // die budget made "special equipment AND a component tier AND a berth on one
  // day" a rarity; now that all three are Free Actions it is the ordinary day, and
  // without netting the same credits would fund all three. The refuel leads the
  // total because it is queued above and runs first.
  let committed = refuel?.cost ?? 0;
  const special = kitAllowed
    ? planSpecialEquipment(state, FIGHTER_RESERVE, FIGHTER_EQUIPMENT_PRIORITY, committed)
    : null;
  if (special) actions.push(special);
  committed += specialEquipmentCost(state, special);

  const upgrade = planFighterUpgrade(state, committed);
  if (upgrade) actions.push(upgrade);
  committed += upgradeCost(state, upgrade);

  // N9 · The captain's overhead, after the gun budget: a fighter fits its ship
  // first and its cabin second.
  const overhead = planCaptainOverhead(state, FIGHTER_RESERVE, committed);
  actions.push(...overhead.actions);

  // T-199 · F-199-2 · the second rung, at the tail (see `planStrandedExplore`).
  const strandedExplore = planStrandedExplore(state, ledger, actions);
  if (strandedExplore) actions.push(strandedExplore);

  // Keep the marker from festering, but never at the cost of the war chest.
  //
  // T-199 · F-199-2 · A SPEND-SIDE FIX WAS WRITTEN HERE, MEASURED, AND BACKED OUT.
  // `planDebtPayment`'s third argument is documented at its own site as "everything
  // already committed this day" (T-1601a), and this call lists the refuel and the
  // overhead but NOT the component tier / special equipment queued twenty lines
  // above — so on a heavy shopping day the yard and the marker can each respect
  // `FIGHTER_RESERVE` on their own and clear it together. Seed 74's day 15 is the
  // picture: a 2,600cr tier AND a 3,412cr marker payment out of a 6,652cr purse,
  // waking on 400 credits.
  //
  // Adding `yardCost` to this call closed that arithmetic — and cost far more than
  // it bought, measured over 100 seeds x 120 days: median final credits
  // 79,494 -> 5,877 and the debt-clear rate 0.580 -> 0.510, because a smaller
  // payment leaves the COMPOUNDING Guild marker open for longer, and `kitAllowed`
  // (this policy's `debt === 0` gate) then withholds the special equipment that
  // pays for the rest of the career. The 8,000-row capstone diff put the same
  // number at `fighter.finalCredits.median` 46,242 -> 3,000 (-93.5%) with
  // `tourOneClearRate` -9.2%. So it is NOT applied.
  //
  // The strand it was aimed at is closed at the top of this policy instead, by the
  // `planCrippledRepair` every other policy already had: seed 74's real problem was
  // a hull ground to condition 1 (a 60-unit tank), not the credits. With the repair
  // in and this call left alone, seed 74 clears, median credits RISE to 79,494 and
  // the debt-clear rate rises to 0.580 — better than before the task on every one
  // of the three. The arithmetic hole is real and stays FILED (T-236, F-199-2 in TASKS.md)
  // rather than being paid for by a 93% credit regression.
  //
  // T-196b · STILL NOT APPLIED, and deliberately so. This task threads a running
  // `committed` total through the three SHOPPING planners above (they now co-occur
  // routinely, so each must see what the last one spent) but leaves THIS call
  // exactly as it was: adding `yardCost` here is the change measured above and
  // rejected, and re-making it under cover of a different task would silently
  // re-buy a 93% credit regression. F-199-1 stays filed.
  const debtPayment = planDebtPayment(state, FIGHTER_RESERVE, (refuel?.cost ?? 0) + overhead.cost);
  if (debtPayment) actions.push(debtPayment);

  return withReroll(state, actions.length > 0 ? actions : [{ type: 'Wait' }]);
};

const EXPLORER_RESERVE = 2000;
// T-1310: a small hard credit floor the explorer keeps back for fuel. Low on
// purpose — a HIGH floor becomes its own strand (it blocks the very refuel needed to
// escape a low-fuel corner), and with the early drives upgrade below fuel is cheap
// enough that a thin reserve always buys enough range to reach the next contract.
const EXPLORER_FUEL_RESERVE = 50;
// T-1601a: what it costs to be allowed to DEADHEAD to the Sage of Mizar-9. A
// decode trip earns nothing on the way out — it is a rim round-trip paid for in
// fuel — so it is only a good move from a genuinely flush position. Measured
// WITHOUT these two gates (seeds 1..12 × 300 days): the explorer started decode
// trips inside the first month, arrived at rim ports broke, and three of twelve
// seeds finished on ~50 credits with 20-250 fuel-starved days, against zero
// starved days and six-figure balances before the leg existed. WITH them (seeds
// 1..20 × 300 days): 18 of 20 careers decode every fragment they pull and finish
// on six figures, worst zero-income streak 3 (the pre-T-1601a baseline's worst
// was 4). The deadhead is NOT dead code at this value — disabling it entirely
// over the same sweep drops the total decode count from 203 to 161. Sweep also
// showed values from 2,000 to 10,000 producing near-identical outcomes; the
// conservative end is kept because the failure it guards against is a strand.
const EXPLORER_DECODE_TRIP_RESERVE = 10000;
/** Not before the Tour One marker has resolved (PRD §5.1 / engine day-30
 *  resolution): the first month is where this policy is poorest, and a deadhead
 *  flown out of it is what turned into the strands above. */
const EXPLORER_DECODE_TRIP_FIRST_DAY = 30;
/** What the explorer holds BACK from the Guild, over and above the operating
 *  reserve, so that remitting can never eat tomorrow's refuel. This is
 *  `TRADER_RESERVE`'s lesson paid for a second time, at this policy's prices:
 *  the first cut of the remittance below reserved only `EXPLORER_RESERVE`
 *  (2,000), and the 1,000-seed capstone answered with a **10x rise in
 *  `fuelStarvationDays.mean` (0.0130 -> 0.1390, max 11 -> 26)** and
 *  **`shipsLost` 41 -> 57**, the exact "pays down debt aggressively, then
 *  strands with no credits to fill the tank" failure `TRADER_RESERVE` records.
 *
 *  SWEPT AT 1,000 SEEDS x 120 days (reserve -> tourOneClearRate / clearDay
 *  median / starvation mean / starved runs / shipsLost), against a pre-remittance
 *  explorer of 0.000 / never / 0.0130 / - / 41:
 *       2,000 -> 0.950 / 19 / 0.139 / 17 / 57
 *       4,000 -> 0.894 / 21 / 0.071 /  9 / 50
 *       6,000 -> 0.777 / 23 / 0.067 / 11 / 39   <- kept
 *       8,000 -> 0.721 / 25 / 0.104 /  9 / 43
 *      10,000 -> 0.661 / 27 / 0.053 / 15 / 49
 *
 *  READ THE COLUMNS DIFFERENTLY, because they do not all carry the same weight.
 *  `tourOneClearRate` and the clear-day median are monotone in the reserve and
 *  measured over all 1,000 runs, so they rank values reliably. **The starvation
 *  mean does not**: only 9-17 runs in 1,000 starve at all, so that column is a
 *  ten-run tail and its non-monotonicity (0.139, 0.071, 0.067, 0.104, 0.053) is
 *  noise, not signal. Ranking on it is how an earlier cut of this constant chose
 *  8,000 off a 250-seed probe that read starvation 0.012 — a number that did not
 *  survive n=1,000 (0.104). That is R0b's standing amendment, and the
 *  balance-targets split's "match the assertion to the sample", landing on a
 *  constant instead of a test.
 *
 *  So 6,000 is chosen on the two columns that hold: it is the HIGHEST clear rate
 *  among the values whose clear-day median lands inside R3's [22, 30] band
 *  (2,000 and 4,000 clear too FAST, at 19 and 21, and fall out the bottom), and
 *  it is the only value whose `shipsLost` (39) is at or BELOW the 41 the
 *  explorer lost before the remittance existed — i.e. the marker gets paid
 *  without costing a single extra ship. The curve turns back on itself above
 *  8,000 for a mechanical reason worth keeping: holding that much back pushes
 *  the payment past day 30, the marker resolves `unpaid`, and the flagged
 *  principal compounds into exactly the poverty the reserve was raised to
 *  prevent. The debt still reaches zero at every value swept; the reserve
 *  decides whether it clears ON TIME. */
const EXPLORER_DEBT_RESERVE = 6000;

/**
 * EXPLORER — fragment chaser. Off-lane sweeps are a credit SINK (a detour burns
 * 80 fuel for a thin salvage roll), so the explorer funds itself with one
 * contract run a day and pours the surplus fuel and dice into Explore attempts,
 * charting POIs and pulling Signal fragments while staying solvent. Weak hull,
 * so it talks/ runs past interceptors.
 */
export const explorerPolicy: SimPolicy = ({ state }) => {
  const ledger = dieLedger(state);
  if (state.encounter) return withReroll(state, planPacifistCombat(state, ledger));

  const actions: PlayerAction[] = [];

  // T-1310: Nemesis-arc reachability. The Wise One of Polaris-1 (system 17) is the
  // ONLY source of frag-nemesis-01 and the sole key into the decode arc (PRD §8.3).
  // Polaris-1 is a rim system no core contract routes to under starter drives (its
  // nearest core neighbour is a ~22-unit hop = 264 fuel, over the 180 sign-cap), so
  // the explorer reaches it through LEGAL actions only (below): it resolves the
  // offered wire rumor / Wise One hook, upgrades its drives (making the rim hop cost
  // a fraction of the tank), banks enough to afford the 500cr fragment, then flies
  // STRAIGHT to Polaris-1. No state poke, no teleport. Pursuit runs from the hook's
  // day-25 window open until the fragment is in hand.
  const pursuingArc = state.day >= 25 && !hasFragment(state.player.nemesisFile, 'frag-nemesis-01');

  // T-1601a · The DECODE leg. Acquiring fragments was already real (Explore →
  // POI loot pool → FragmentAcquired), but nothing ever routed the explorer to
  // the Sage of Mizar-9 (system 18), the game's only decoder — so everything it
  // pulled sat raw forever. This is the second pursuit phase, and it is
  // deliberately SEQUENCED AFTER the Polaris pursuit (`!pursuingArc`):
  // campaign-nemesis.test.ts requires the arc to open by day 80 on >= 80% of 50
  // seeds, and that sweep ends the instant frag-nemesis-01 lands — so a decode
  // leg that can only run once the Polaris pursuit is satisfied cannot regress
  // it. Unlike arc pursuit, Explore is NOT suppressed here: decoding costs
  // nothing but the jump, so the explore↔decode loop should keep charting.
  const decodePursuit = !pursuingArc && hasAnyUndecoded(state.player.nemesisFile);

  // Resolve any offered storylet — the wire rumor, the Wise One buy-fragment hook
  // (grants frag-nemesis-01), and (at Mizar-9) the Sage decodes all surface here. A
  // no-die choice is resolved INLINE: it costs no die, so the day still does its
  // income work and the arc never burns a zero-income day (the poverty-trap
  // invariant the explorer is held to). A die-consuming choice is taken as a
  // standalone day (matches veteranPolicy) so it never collides with the ledger.
  // T-1601a: while chasing a decode, a Sage decode offer outranks whatever sorts
  // first on the board (see chooseDecodeStoryletAction).
  const storyletAction =
    (decodePursuit ? chooseDecodeStoryletAction(state) : null) ?? chooseStoryletAction(state);
  if (storyletAction) {
    // chooseStoryletAction always returns a Storylet action; a no-die choice omits
    // spendDie (resolve inline), a die choice sets it (resolve as a standalone day).
    if (storyletAction.type === 'Storylet' && storyletAction.spendDie === undefined) {
      actions.push(storyletAction);
    } else {
      return withReroll(state, [storyletAction]);
    }
  }

  // T-1205: repair a hull chipped down enough to collapse the fuel ceiling before
  // the explorer strands (it burns fuel fastest, so it feels a shrunk tank first).
  const crippledRepair = planCrippledRepair(state, EXPLORER_RESERVE);
  if (crippledRepair) actions.push(crippledRepair);

  /** What today's plan has already promised the yard, tracked so the remittance
   *  at the bottom cannot spend the same credits twice. */
  let drivesCost = 0;

  // T-1310: the explorer invests in DRIVES early — its defining upgrade, the way the
  // fighter buys guns. A tier-3 drive (strength 30) costs ~0 net (the strength-10
  // trade-in dwarfs the 200cr sticker) and drops per-unit jump fuel from 12 to ~1, so
  // the same tank reaches six times as far. This is both what a real explorer does
  // and the structural fix for the strands above: with near-free fuel the ship almost
  // never burns itself into an unrefuelable corner, and — once bought — the rim hop to
  // the Wise One of Polaris-1 (system 17) fuels for a fraction of the tank, so arc
  // pursuit can fly straight there. Component tiers are NOT renown-gated (engine
  // shipyard.ts), so a low-renown explorer can buy them. Gated above a working reserve
  // so it never spends its last credits on the yard.
  //
  // DELIBERATELY NOT GATED ON THE MARKER, and this is the one exemption to R2c's
  // kit rule (doc-audit finding, 2026-07-29). Three measured facts force it:
  //   1. `quoteShipyard` prices this buy at **175 credits** on a day-1 junker —
  //      it is not the 10,000cr STAR_BUSTER / 100,000cr ASTRAXIAL_HULL class of
  //      kit the fighter's `debt === 0` rule exists to stop. R2c's spiral was
  //      built out of five-figure purchases; a 175cr one cannot reproduce it.
  //   2. It fires on **day 1**, out of the 1,000cr starting purse, against a
  //      25,000cr marker that is 29 days from due. Any debt-shaped gate — hard
  //      `debt === 0` or an N9-style `credits - debt` hold — is unsatisfiable on
  //      day 1 by construction, so it would not delay this buy, it would DELETE
  //      it (a hold needs 26,000cr, which seed 30 never reaches at all).
  //   3. Deleting it breaks the arc. Tier-3 drives cut fuel-per-jump 60 -> 5,
  //      which is the ONLY thing that puts the Polaris-1 rim hop inside the
  //      sign-cap — i.e. the whole T-1310 pursuit `campaign-nemesis.test.ts`
  //      grades at >= 80% of 50 seeds hangs off this one 175cr line.
  // This is the anti-poverty-trap invariant in its purest form: the drives ARE
  // the explorer's income, so gating them behind the marker gates the explorer
  // out of ever paying the marker. The remittance below is what actually settles
  // the Guild, and it settles it in full.
  // T-196b: the yard is FREE, so no die is taken. The real bound is the branch's
  // own: it fires only while the drives are below tier 3 — i.e. at most once per
  // ship, since the very purchase it queues falsifies the condition — and only
  // above half the working reserve. `drivesCost` was already threaded into the
  // remittance below and now matters on many more days.
  if (state.player.ship.drives.strength < 30 && state.player.credits >= EXPLORER_RESERVE / 2) {
    actions.push({
      type: 'Shipyard',
      action: 'buy-component-tier',
      component: 'drives',
      tier: 3,
    });
    drivesCost = componentTierNetCost(state, 'drives', 3);
  }

  const from = state.player.currentSystemId;
  const fuelPriceNow = state.market.localFuelPrice || 5;
  const drivesReady = state.player.ship.drives.strength >= 20;

  // T-1310: hold back a small credit reserve so a refuel is always possible next
  // turn — the explorer used to pour its last credits into fuel (floor 0), then the
  // fuel burned down until it was too broke to refuel and too empty to reach even
  // the nearest system, freezing there for the rest of the campaign (a silent strand
  // the poverty-trap check misses, since a failed Travel still counts as income). The
  // Wise One's 500cr fragment is NOT protected by the floor (a high floor re-strands);
  // instead the flight to Polaris-1 below only launches once the ship can afford it.
  const refuelFloor = EXPLORER_FUEL_RESERVE;
  const refuel = planRefuel(state, refuelFloor, 200, 400);
  // T-1310: refuel BEFORE the jump. The old order pushed the refuel AFTER the travel
  // action, so the ship jumped on its current (possibly near-empty) tank, failed the
  // jump, and then got stuck on an active contract it could neither reach nor abandon
  // — refuelling a ship that had already frozen at the wrong system. Topping the tank
  // first makes sign+refuel+travel a single completable delivery.
  if (refuel) actions.push(refuel.action);
  const postRefuelFuel = state.player.ship.fuel + (refuel ? refuel.cost / fuelPriceNow : 0);

  // T-1104: reachability gate (see fighterPolicy) — refuse the unfuelable rim
  // run the richest-first ranking would otherwise sign and get stranded on.
  // T-1310: ALSO bound by the fuel the ship will actually have AFTER this turn's
  // refuel (postRefuelFuel), capped by the tank-fraction sign-cap. Signing a contract
  // the ship can neither fly nor fund was the other half of the freeze. Bounding by
  // the funded, topped tank makes a low-fuel explorer take a SHORT reachable run
  // instead, earn, and fly on — which is also what lets arc pursuit reach Polaris-1.
  const ranked = rankedContracts(state);
  const signFuelCap = state.player.ship.maxFuel * SIGN_FUEL_FRACTION;
  const flyCap = Math.min(signFuelCap, postRefuelFuel);
  let reachable = ranked.filter((c) => c.fuel <= flyCap);
  // T-1601a: the T-1104 relaxation the trader has always had, ported to the
  // explorer. From a RIM port every core-bound leg exceeds SIGN_FUEL_FRACTION of
  // the tank, so `reachable` comes back empty and the explorer — which cannot
  // Explore below EXPLORER_RESERVE either — has NO legal move and Waits forever
  // (measured before this line: seed 16 sat at Mizar-9 for 48 straight days after
  // a ship loss left it at the rim on a junker drive with 340 credits). The
  // decode leg above makes ending a day at a rim port routine, so the corner has
  // to be closed here. When nothing fits the margin cap, relax to the FULL funded
  // tank: take the run the ship can actually complete, accepting the thinner
  // re-flight margin, exactly as `traderPolicy` does. Reader: the poverty-trap
  // invariant in campaign-policies.test.ts (streak < 5).
  if (reachable.length === 0) {
    reachable = ranked.filter((c) => c.fuel <= postRefuelFuel);
  }
  if (state.player.activeContract) {
    const die = ledger.takeBest();
    if (die !== undefined) {
      actions.push({
        type: 'Travel',
        destinationId: state.player.activeContract.destination,
        spendDie: die,
      });
    }
  } else if (pursuingArc && drivesReady && from !== 17 && state.player.credits >= 550) {
    // T-1310: drives upgraded and the 500cr fragment is affordable — fly STRAIGHT to
    // Polaris-1 (system 17) to reach the Wise One, the sole grantor of frag-nemesis-01.
    // Direct travel needs no contract and system 17 is not a gated destination (engine
    // day.ts / isGatedDestination); the upgraded drive makes the hop cost a fraction of
    // the tank, so a plain Travel gets there instead of waiting on a rare dest-17
    // contract to happen onto a board. The >=550 gate means the ship arrives able to
    // buy the fragment (chooseStoryletAction takes buy-fragment only when credits>=500);
    // until then it banks net-positive runs below.
    const die = ledger.takeBest();
    if (die !== undefined) {
      actions.push({ type: 'Travel', destinationId: 17, spendDie: die });
    }
  } else if (
    decodePursuit &&
    drivesReady &&
    from !== SAGE_SYSTEM_ID &&
    // FUELLED, FUNDED and out of Tour One — all three required. Mizar-9 is a RIM
    // system: an explorer that deadheads for it on a thin tank burns days on
    // failed jumps and lands broke at a rim port where no contract is within the
    // sign-cap and no Explore is affordable — a silent strand (measured before
    // these gates: seed 16 sat at Mizar-9 for 48 straight days). So the detour
    // only launches when the tank can already make the hop after this turn's
    // refuel and the career is genuinely flush. Same shape as the Polaris leg's
    // `>= 550` affordability gate above: never start a pursuit leg you cannot
    // finish. See EXPLORER_DECODE_TRIP_RESERVE for the sweep behind the numbers.
    postRefuelFuel >= playerJumpFuel(state, systemDistance(from, SAGE_SYSTEM_ID)) &&
    state.player.credits >= EXPLORER_DECODE_TRIP_RESERVE &&
    state.day > EXPLORER_DECODE_TRIP_FIRST_DAY
  ) {
    // T-1601a: fly STRAIGHT to the Sage of Mizar-9 (system 18) with a held, raw
    // fragment — exactly the argument the Polaris leg above already documents:
    // system 18 is not gated (isGatedDestination), and the upgraded drive makes
    // the hop a fraction of the tank, so a plain legal Travel gets there instead
    // of waiting on a rare dest-18 contract to happen onto a board. No state
    // poke, no teleport. The Sage's decode is die-free and resolves inline on the
    // following dawn, so the round trip costs fuel and a jump, never an income
    // day (Travel is itself an income action for the poverty-trap invariant).
    const die = ledger.takeBest();
    if (die !== undefined) {
      actions.push({ type: 'Travel', destinationId: SAGE_SYSTEM_ID, spendDie: die });
    }
  } else if (reachable.length > 0) {
    // T-1310: during pursuit, bank on NET-POSITIVE runs only (payment beats the fuel
    // bill at the local depot), so credits actually climb toward the drives tier and
    // the fragment — the raw richest-first pick can be a fuel loss that keeps the
    // spend-to-zero explorer broke. Outside pursuit, keep the richest reachable run.
    let best = reachable[0];
    if (pursuingArc) {
      const netPositive = reachable
        .map((c) => ({ ...c, net: c.payment - c.fuel * fuelPriceNow }))
        .filter((c) => c.net > 0)
        .sort((a, b) => b.net - a.net || a.index - b.index);
      if (netPositive.length > 0) best = netPositive[0];
    } else if (decodePursuit) {
      // T-1601a: the PAID decode trip. A fundable run that already ends at
      // Mizar-9 carries the explorer to the Sage AND gets paid for it, so it is
      // always preferred over the deadhead above and carries none of its gates —
      // it costs nothing the day would not have spent anyway. Preference only,
      // inside the already-fundable set.
      const sageRun = reachable.find((c) => c.destination === SAGE_SYSTEM_ID);
      if (sageRun) best = sageRun;
    }
    // T-196b: free sign — gated on the travel die alone. Bounds unchanged: one
    // active contract (engine), and `best` comes from the funded, capped set.
    const travelDie = ledger.takeBest();
    if (travelDie !== undefined) {
      actions.push({
        type: 'Trade',
        action: 'sign-contract',
        contractIndex: best.index,
      });
      actions.push({ type: 'Travel', destinationId: best.destination, spendDie: travelDie });
    }
  }

  // Off-lane sweeps with whatever sharp dice remain, while solvent and fuelled.
  // Project the tank forward: post-refuel fuel, less one jump's worth already
  // committed to the delivery, then spend the rest on Explore detours (each burns
  // EXPLORATION_FUEL_COST).
  // T-1310: SUPPRESSED during arc pursuit. Exploring is the explorer's credit sink
  // (it refuels to explore, draining credits to the solvency floor), which left it
  // too broke to ever afford the drives tier or the 500cr Wise One fragment. While
  // pursuing the arc the explorer banks its contract income instead, so the tier and
  // the fragment become affordable; normal off-lane charting resumes the moment the
  // fragment is in hand (pursuit ends) or before day 25.
  // N9 · The captain's overhead, kept ahead of the Explore loop. The original
  // reason (that loop consumes every remaining die by design, so anything queued
  // after it would never be handed one) is void as of T-196b — the overhead takes
  // no die — but the placement stands: the loop's credit floor reads
  // `overhead.cost`, so the overhead has to be decided first.
  // T-196b: `drivesCost` joins the committed total. The tier-3 drive buy at the
  // top of this policy no longer competes with the day's dice, so it and a hire
  // now land on the same day routinely and must not spend the same credits.
  const overhead = planCaptainOverhead(state, EXPLORER_RESERVE, (refuel?.cost ?? 0) + drivesCost);
  actions.push(...overhead.actions);

  if (!pursuingArc) {
    let projectedFuel = postRefuelFuel;
    if (actions.some((action) => action.type === 'Travel')) {
      projectedFuel -= playerJumpFuel(state, 5);
    }
    // F-116-1 (docs/EXPLORE_REDESIGN.md §9.7, fixed at T-150) · THE RECOVERY
    // GATE. `packages/engine/src/actions/exploration.ts:52` refuses the verb with
    // `ExplorationFailed{'recovery-in-progress'}` while `player.recovery !== null`
    // — no die spent, no fuel burned, nothing gained. `packages/sim/src/protocol.ts`
    // (`legalActions`) already withholds Explore on exactly this condition and its
    // comment names this exact risk, but `runCampaign` NEVER CALLS `legalActions`,
    // so that gate was never on the path the sim actually takes. This line is the
    // mirror landing on the path the sim takes — the same "policy guard mirrors the
    // engine guard" shape as `planDare`'s `!npc.dead` (F-121-1) and its
    // `venueOffered` mirror.
    //
    // THE 22.5% IN §9.7 IS A PRE-T-131 NUMBER and must not be restated as current:
    // D1 moved bands 3 and 4 off calendar recoveries onto same-day `apCost` dice, so
    // `player.recovery` now governs BAND 2 ONLY (`engine/src/types.ts` RecoveryState).
    // The post-fix rate is re-measured in §10 of the same doc.
    //
    // SCOPED TO THE EXPLORE QUEUE, deliberately: it is a term of THIS loop and not
    // an early return from the policy, so the contract run, the refuel, the
    // captain's overhead, the yard buy and `planDebtPayment` all still run on a
    // recovery day. Gating the whole policy would invent a poverty-trap regression.
    //
    // RESIDUAL, NAMED NOT CLOSED: these planners are pure and read the DAWN state,
    // so a band-2 find claimed by the FIRST Explore of a day opens a recovery
    // mid-batch and a second queued Explore can still be refused. Mid-day
    // re-planning is refused for the reason T-135 gives for not re-invoking a policy
    // mid-batch, and capping the loop at one Explore per day would be a pacing
    // change by fiat. Measured and reported in §10 as a bounded limitation.
    //
    // F-196b-1 · the per-sweep credit charge the smuggler's twin carries, applied
    // here for the reason the two loops have always been kept identical: the same
    // one-shot credit test, the same four-dice-instead-of-two after T-196b freed
    // the sign/refuel/yard, and the same fuel bill landing on the next dawn. Full
    // provenance and the seeds 1..1000 measurement live at `smugglerPolicy`'s
    // copy and are not restated.
    const sweepReplacementCost = EXPLORATION_FUEL_COST * fuelPriceNow;
    let sweepReplacement = 0;
    while (
      state.player.recovery === null &&
      state.player.credits - overhead.cost - drivesCost - sweepReplacement > EXPLORER_RESERVE &&
      projectedFuel >= EXPLORATION_FUEL_COST &&
      ledger.remaining() > 0
    ) {
      const die = ledger.takeBest();
      if (die === undefined) break;
      actions.push({ type: 'Explore', spendDie: die });
      projectedFuel -= EXPLORATION_FUEL_COST;
      sweepReplacement += sweepReplacementCost;
    }
  }

  // THE MARKER. Until this line the explorer was the ONLY policy in the fleet
  // with no debt remittance of any kind — not a weak one, none: `planDebtPayment`
  // appeared in the trader, smuggler, gambler, fighter and veteran, and never
  // here. R2c recorded that the fighter "was the only competent policy that
  // [bought kit before remitting]"; that was measured against the fighter's
  // spiral and missed this policy entirely, because an explorer that never remits
  // at all never shows up as one that remits late.
  //
  // Measured on shipped code before this line existed, 30 seeds x 120 days: the
  // marker was cleared on **0 of 30** seeds and resolved `unpaid` on 30 of 30,
  // while the explorer sat on a median **39,866 credits at day 30** against the
  // 25,000 it owed. It could simply afford it, every seed, and never paid. The
  // `guild.debt-flagged` penalty (leaner manifests, keener patrols) then landed
  // on every career, and day.ts's dusk interest compounded the untouched
  // principal to **148,696 credits by day 120** — identical on all 30 seeds,
  // which is the fingerprint of a debt nothing ever touches. That is the same
  // spiral R2c fixed for the fighter, in a policy the fix never looked at.
  //
  // Placed LAST, after the Explore loop, for the fighter's stated reason: the
  // marker must not fester, but it also must not eat the day's working capital
  // before the day has done its work. `pay-debt` consumes no die, so sitting at
  // the end of the list costs the plan nothing. The committed term carries the
  // refuel, the captain's overhead AND the yard buy above, so the remittance can
  // never promise credits another action in this same plan has already spent.
  const debtPayment = planDebtPayment(
    state,
    EXPLORER_DEBT_RESERVE,
    (refuel?.cost ?? 0) + overhead.cost + drivesCost,
  );
  if (debtPayment) actions.push(debtPayment);

  return withReroll(state, actions.length > 0 ? actions : [{ type: 'Wait' }]);
};

/** Mirror of the engine's private `specialEquipmentCost` (shipyard.ts) so a
 *  policy never burns a die on an unaffordable special-equipment purchase. */
function simSpecialEquipmentCost(state: GameState, equipment: SpecialEquipmentId): number {
  const hullStrength = state.player.ship.hull.strength;
  if (equipment === 'CLOAKER') return 500;
  if (equipment === 'AUTO_REPAIR' || equipment === 'TITANIUM_HULL') {
    return Math.min(hullStrength * 1000, 20000);
  }
  if (equipment === 'ASTRAXIAL_HULL') return 100000;
  return 10000; // STAR_BUSTER, ARCH_ANGEL, TRANS_WARP
}

/** Whether the equipment is already installed — mirrors engine `alreadyInstalled`. */
function simEquipmentInstalled(state: GameState, equipment: SpecialEquipmentId): boolean {
  const ship = state.player.ship;
  switch (equipment) {
    case 'CLOAKER':
      return ship.hasCloaker === true;
    case 'AUTO_REPAIR':
      return ship.hasAutoRepair === true;
    case 'STAR_BUSTER':
      return ship.hasStarBuster === true;
    case 'ARCH_ANGEL':
      return ship.hasArchAngel === true;
    case 'ASTRAXIAL_HULL':
      return ship.isAstraxialHull === true;
    case 'TITANIUM_HULL':
      return ship.hasTitaniumHull === true;
    default:
      return ship.hasTransWarpDrive === true;
  }
}

/**
 * Buy the next affordable, renown-gated special-equipment item the ship can
 * legally install. This is what makes special equipment reachable through
 * EARNED play (T-114a): the gate is `state.player.registry.renownRank`, climbed
 * by deeds — no test sets the rank. Priority runs cheapest-gate first so
 * STAR_BUSTER/ARCH_ANGEL (CAPTAIN) land long before ASTRAXIAL_HULL (GIGA_HERO).
 */
function planSpecialEquipment(
  state: GameState,
  reserve: number,
  // T-1601a: the priority list is now a PARAMETER, defaulting to the veteran's
  // original three so `veteranPolicy` (the T-114a pinned-seed ASTRAXIAL_HULL
  // reachability proof) is byte-for-byte unchanged. The fighter passes its own
  // list, which leads with AUTO_REPAIR — see `FIGHTER_EQUIPMENT_PRIORITY`.
  priority: readonly SpecialEquipmentId[] = ['STAR_BUSTER', 'ARCH_ANGEL', 'ASTRAXIAL_HULL'],
  /** T-196b · credits the rest of today's plan has already committed. Same reason
   *  `planFighterUpgrade` grew one: with the yard free, both fire the same day. */
  committed = 0,
): PlayerAction | null {
  const ship = state.player.ship;
  for (const equipment of priority) {
    if (simEquipmentInstalled(state, equipment)) continue;
    // Mirror of the engine's `specialEquipmentFailure` exclusion/prereq ladder
    // (actions/shipyard.ts), so a policy never burns a die on a refusal. The
    // CLOAKER conflicts with STAR_BUSTER / ARCH_ANGEL / AUTO_REPAIR and demands
    // hull strength 1–4 (which every upgrading policy refits past), and
    // TITANIUM_HULL conflicts with AUTO_REPAIR — so neither is ever on a priority
    // list here; only the reverse-direction guards are needed.
    if (equipment === 'STAR_BUSTER' && ship.hasCloaker) continue;
    if (equipment === 'ARCH_ANGEL' && ship.hasCloaker) continue;
    if (equipment === 'AUTO_REPAIR' && (ship.hasCloaker || ship.hasTitaniumHull)) continue;
    if (equipment === 'ASTRAXIAL_HULL' && ship.drives.strength < 25) continue;

    const requiredRank = SPECIAL_EQUIPMENT.find((e) => e.id === equipment)?.requiredRenownRank;
    if (
      requiredRank &&
      renownRankIndex(state.player.registry.renownRank) < renownRankIndex(requiredRank)
    ) {
      continue;
    }
    const cost = simSpecialEquipmentCost(state, equipment);
    if (state.player.credits - committed < reserve + cost) continue;
    return { type: 'Shipyard', action: 'buy-special-equipment', equipment };
  }
  return null;
}

/** The price of a `buy-special-equipment` this policy has just queued, for the
 *  running `committed` total (see `upgradeCost`). */
function specialEquipmentCost(state: GameState, special: PlayerAction | null): number {
  if (!special || special.type !== 'Shipyard' || special.action !== 'buy-special-equipment') {
    return 0;
  }
  if (special.equipment === undefined) return 0;
  return Math.max(0, simSpecialEquipmentCost(state, special.equipment));
}

const VETERAN_RESERVE = 3000;

/**
 * VETERAN — the endgame balance instrument and the T-114a reachability proof.
 * A full-loop pilot that deliberately earns its way up the Renown ladder and
 * spends the winnings on the renown-gated special equipment — including the
 * ASTRAXIAL_HULL at GIGA_HERO. It is registry-driven: each dawn it reads which
 * Deeds are still unearned and steers toward them (haggle for broker_shark, a
 * mercy_runner / rim contract when offered, varied combat stance for the three
 * encounter deeds, a low-fuel arrival for the fuel-fumes deed), then trades to
 * fund the fit. It is NOT in COMPETENT_POLICIES: it is an endgame grinder, not
 * a lean balance baseline, so it is exempt from the poverty-trap sweep.
 *
 * T-161 · THE EXEMPTION IS NARROWER THAN IT USED TO SOUND, and the honest number
 * lives here and in `GATE_COMPETENT_POLICIES` (`balance/gate.ts`) rather than in
 * a rationale nobody measured. Being out of scope for the gate never licensed a
 * missing fallback: the full-tank relaxation below is the same branch every other
 * gated policy carries, and this policy was the last in the file without it
 * (finding F-159-1). What is still open after that fix is F-161-1 — the storylet
 * branch a few lines down takes EVERY offered storylet as a standalone day, so on
 * a port with a live queue the grinder never reaches the contract block at all.
 * That, not dice-banking and not reachability, is what the residual stall is.
 */
export const veteranPolicy: SimPolicy = ({ state }) => {
  const ledger = dieLedger(state);
  const earned = new Set(state.player.registry.earned.map((deed) => deed.id));
  const need = (id: string): boolean => !earned.has(id);

  // Combat: collect first_combat_win / silver_tongue / clean_getaway by picking
  // the still-unearned outcome we can act on this encounter.
  if (state.encounter) {
    const encounter = state.encounter;
    const targetId = encounter.interceptor.id;
    const hull = Math.max(1, encounter.enemyHull);
    const fuelVolleys = Math.floor(state.player.ship.fuel / FIGHT_FUEL_COST);
    // T-1205: a winning volley removes `weaponVolleyDamage` hull points, so the
    // clean kill needs CEIL(hull / volleyDamage) volleys — fewer with an upgraded
    // gun. Sizing to real damage (not the raw hull count) is both the correctness
    // fix (over-queuing orphaned the surplus Combat once weapons went live) and
    // why an upgraded veteran wins fights it used to be priced out of.
    const volleysNeeded = Math.ceil(hull / weaponVolleyDamage(state.player.ship));
    const canWin =
      state.player.ship.weapons.strength > 1 &&
      Math.min(fuelVolleys, ledger.remaining()) >= volleysNeeded;
    if (need('first_combat_win') && canWin) {
      const fights: PlayerAction[] = [];
      for (let i = 0; i < volleysNeeded; i += 1) {
        const die = ledger.takeBest();
        if (die === undefined) break;
        fights.push({ type: 'Combat', stance: 'fight', targetId, spendDie: die });
      }
      if (fights.length > 0) return withReroll(state, fights);
    }
    if (need('silver_tongue')) {
      const die = ledger.takeBest();
      if (die !== undefined)
        return withReroll(state, [{ type: 'Combat', stance: 'talk', targetId, spendDie: die }]);
    }
    if (need('clean_getaway') && state.player.ship.fuel >= RUN_FUEL_COST) {
      const die = ledger.takeBest();
      if (die !== undefined)
        return withReroll(state, [{ type: 'Combat', stance: 'run', targetId, spendDie: die }]);
    }
    // Carrying a delivery, deeds all earned: FIGHT the interceptor down rather
    // than fall through to the pacifist run. A fight win resolves the encounter
    // 'defeated', which COMPLETES the interrupted delivery (completePendingTravel)
    // and lands the ship at its destination — whereas a run forfeits the contract
    // and dumps the ship back at the origin. On a long, high-danger lane (the
    // full-rate VETERAN-era encounter band the T-1301 era flip now exposes) the
    // interceptions are relentless: running the loaded ship home every time bled
    // the veteran's fuel 10/interdiction and its credits on re-fuel until it was
    // MAROONED one jump short with no income to recover (observed: pinned at 5
    // credits / 61 fuel from day ~50 to 500 on the sys-17→9 rim run, the
    // ASTRAXIAL_HULL forever out of reach). The veteran has the gun for it
    // (weapons strength climbs past the junker's 1), and fighting through is what
    // a real veteran does with a hold full of cargo. Only when it can't win the
    // fight in the fuel/dice it has does it fall back to the pacifist path.
    if (state.player.activeContract && canWin) {
      const fights: PlayerAction[] = [];
      for (let i = 0; i < volleysNeeded; i += 1) {
        const die = ledger.takeBest();
        if (die === undefined) break;
        fights.push({ type: 'Combat', stance: 'fight', targetId, spendDie: die });
      }
      if (fights.length > 0) return withReroll(state, fights);
    }
    return withReroll(state, planPacifistCombat(state, ledger));
  }

  const actions: PlayerAction[] = [];
  const ship = state.player.ship;
  const from = state.player.currentSystemId;
  const board = state.market.manifestBoard;

  // A storylet in the queue is taken as a standalone day so its die spend never
  // collides with the trade-day ledger — this is how beacon_keeper and chained
  // storylets progress.
  //
  // F-161-1 (OPEN, measured at T-161, `docs/BALANCE-POLICY.md` D.2a) · THIS
  // BRANCH DOES NOT "MATCH THE OTHER POLICIES", as the comment here used to
  // claim. `smugglerPolicy`, `gamblerPolicy` and `explorerPolicy` all SPLIT it:
  // a choice that spends no die resolves INLINE and the trade day continues
  // around it; only a die-spending choice takes the day, because only that can
  // collide with the ledger — which is the reason this comment itself gives for
  // a rule it then applies far too widely. Taking the whole day for a free
  // narrative beat is what leaves the veteran's residual stall at 197 of 200
  // seeds even after the F-159-1 relaxation below: a `Storylet` is not an income
  // action (`isIncomeAction`, ~L1660). NOT fixed here — T-161's scope is the
  // contract filter, and the ported split is measured to cost the deed slate
  // (`deed-coverage.test.ts` full slates 2 -> 0 over seeds 1..76), so it needs a
  // task that owns the deed-hunter instrument. See F-161-1 for the numbers.
  const storyletAction = chooseStoryletAction(state);
  if (storyletAction) return withReroll(state, [storyletAction]);

  // T-1205: repair a hull the enemy has chipped down enough to collapse the fuel
  // ceiling, before it strands the grinder and starves its deed income.
  const repair = planCrippledRepair(state, VETERAN_RESERVE);
  if (repair) actions.push(repair);

  // T-1102: choose the destination FIRST so the refuel can be sized to reach it —
  // the same scarcity fix the trader needs. Without it the veteran signs the
  // richest (often far, unfuelable) run, strands, and never earns the credits to
  // upgrade — pinned at the junker hull for the whole 500-day campaign.
  const fuelDepotPrice = state.market.localFuelPrice || 5;
  const ranked = rankedContracts(state);
  const signableWithin = (cap: number) =>
    ranked
      .filter((c) => c.fuel <= cap)
      .map((c) => ({ ...c, net: c.payment - c.fuel * fuelDepotPrice }))
      .filter((c) => c.net > 0)
      .sort((a, b) => b.net - a.net || a.index - b.index);
  let reachable = signableWithin(ship.maxFuel * SIGN_FUEL_FRACTION);
  // T-161: the T-1104 full-tank RELAXATION, ported (not invented) from the five
  // policies that already carry it verbatim — `traderPolicy`, `smugglerPolicy`,
  // `gamblerPolicy`, `explorerPolicy` and (from T-159) `fighterPolicy`. The
  // veteran was the LAST un-relaxed contract filter in this file (finding
  // F-159-1, `docs/BALANCE-POLICY.md` D.2a), and the omission cost exactly what
  // the fighter's did: parked at a RIM port where every leg on the board exceeds
  // 0.6 of the tank, `reachable` comes back empty every dawn, `idx` falls through
  // to -1, and the grinder signs nothing and never travels.
  //
  // Why the streak climbs instead of self-correcting: refuel, crippled repair,
  // cargo pods, component tiers, special equipment, captain overhead and debt
  // payment all still QUEUE below, so the ship looks busy — but none of them is
  // an income action (`isIncomeAction`, this file, ~L1660), so a busy,
  // earning-nothing day is still a zero-income day.
  //
  // Measured before this line on this tree (seeds 1..200 x 35 days): the
  // veteran's longest zero-income streak was 31 against a limit of 5, with 198 of
  // 200 seeds at or over the limit — every other gated policy sat at 2-4 (bar the
  // fighter's one F-159-2 strand at seed 157). Seed 4 is the picture: parked at
  // system 18 from day 5 on a FULL 300 tank with 2,825cr and a live 2-4 offer
  // board it could not sign from, debt compounding 20,727 -> 22,886 by day 36.
  //
  // Measured AFTER this line, same rig: worst streak 31 -> 13, and the nine seeds
  // that held the 31-day strand (4, 10, 56, 62, 82, 91, 135, 155, 185) fall to
  // 5-10. The COUNT of seeds at or over the limit barely moves (198 -> 197), and
  // that is not this branch failing — it is F-161-1, the un-split storylet branch
  // above, which on a busy port eats the whole day before the code here is ever
  // reached. Depth is what the relaxation owns, and depth is what it fixed.
  //
  // The trade this accepts is the SAME one T-1104 argued for in the trader: a
  // full-tank run leaves a thinner re-flight margin after an interrupted
  // delivery. Taking the completable run beats idling at the rim. The `net > 0`
  // filter stays in the relaxed pass (as it does for trader/smuggler/gambler) —
  // dropping it would be new behaviour, not a port — and the existing
  // `availableFuel >= primaryFuelNeed` sign guard below still refuses a relaxed
  // pick the purse cannot fuel.
  //
  // Readers: `assertNoIncomeStall` / `INCOME_STALL_LIMIT` in `balance/gate.ts`.
  if (reachable.length === 0) {
    reachable = signableWithin(ship.maxFuel);
  }
  const reachableByFullTank = (dest: number): boolean =>
    playerJumpFuel(state, systemDistance(from, dest)) <= ship.maxFuel;

  // Steer toward missing deeds, but only when that steered run is fuelable; else
  // take the richest reachable, net-positive run.
  let idx = -1;
  if (need('mercy_runner')) {
    const m = board.findIndex((c) => c.cargoType === 4 && c.destination === 7);
    if (m >= 0 && reachableByFullTank(board[m].destination)) idx = m;
  }
  if (idx < 0 && need('rimward_bound')) {
    const r = board.findIndex(
      (c) => c.destination >= 15 && c.destination <= 20 && reachableByFullTank(c.destination),
    );
    if (r >= 0) idx = r;
  }
  if (idx < 0) idx = reachable.length > 0 ? reachable[0].index : -1;

  const primaryDest = state.player.activeContract
    ? state.player.activeContract.destination
    : idx >= 0
      ? board[idx].destination
      : null;
  const primaryFuelNeed =
    primaryDest !== null ? playerJumpFuel(state, systemDistance(from, primaryDest)) : 0;

  // Size the refuel to guarantee the jump. fuel_fumes_arrival still wants a lean
  // tank (land on fumes), so top only just above the jump cost; otherwise raise
  // the working threshold/target to cover the jump (never below the defaults).
  let refuelCost = 0;
  const wantFumes = need('fuel_fumes_arrival') && primaryFuelNeed > 0;
  const refuel = wantFumes
    ? planRefuel(
        state,
        0,
        Math.min(ship.maxFuel, primaryFuelNeed),
        Math.min(ship.maxFuel, primaryFuelNeed + 24),
      )
    : planRefuel(
        state,
        0,
        Math.min(ship.maxFuel, Math.max(FUEL_REFUEL_THRESHOLD, primaryFuelNeed)),
        Math.min(ship.maxFuel, Math.max(FUEL_REFUEL_TARGET, primaryFuelNeed)),
      );
  if (refuel) {
    actions.push(refuel.action);
    refuelCost = refuel.cost;
  }
  const boughtFuel = refuel ? refuel.cost / fuelDepotPrice : 0;
  const availableFuel = Math.min(ship.maxFuel, ship.fuel + boughtFuel);

  if (state.player.activeContract) {
    const die = ledger.takeBest();
    if (die !== undefined) {
      actions.push({
        type: 'Travel',
        destinationId: state.player.activeContract.destination,
        spendDie: die,
      });
    }
  } else if (idx >= 0 && availableFuel >= primaryFuelNeed) {
    // Haggle the chosen board offer before signing → broker_shark.
    // T-196b: `>= 3` became `>= 2`. The gate used to read "needs three dice for
    // haggle + sign + travel"; the sign is a Free Action now (§3), so the only two
    // die spends left in this branch are the haggle's TRADE check and the jump's
    // pilot check. Haggle keeps its die for real — it IS the check.
    if (need('broker_shark') && !board[idx].haggled && ledger.remaining() >= 2) {
      const haggleDie = ledger.takeWorst();
      if (haggleDie !== undefined) {
        actions.push({
          type: 'Trade',
          action: 'haggle',
          contractIndex: idx,
          spendDie: haggleDie,
        });
      }
    }
    // T-196b: free sign — gated on the travel die alone.
    const travelDie = ledger.takeBest();
    if (travelDie !== undefined) {
      actions.push({
        type: 'Trade',
        action: 'sign-contract',
        contractIndex: idx,
      });
      actions.push({
        type: 'Travel',
        destinationId: board[idx].destination,
        spendDie: travelDie,
      });
    }
  }

  // Yard: a cargo-pod expansion (earns yard_rat + cargo_expansion), then combat
  // tiers (weapons first, so first_combat_win becomes winnable), then the
  // renown-gated special equipment once the rank opens.
  // T-196b · Free at the yard, so no die and no `ledger.remaining()` gate. The
  // REAL bounds, both already here and both non-die: the `cargo_expansion` deed is
  // still unearned (one pod purchase earns it, so this cannot repeat once the
  // registry catches up) and the purse clears the reserve plus the pod price.
  // `yardCommitted` then carries the spend into the two planners below, which
  // before this task were rationed apart by the die and now fire together.
  let yardCommitted = 0;
  if (need('cargo_expansion') && state.player.credits >= VETERAN_RESERVE + 1000) {
    const podAction: PlayerAction = { type: 'Shipyard', action: 'buy-cargo-pods', quantity: 1 };
    actions.push(podAction);
    // Priced through the engine's own quote rather than re-stating the 1,000 the
    // gate above assumes — content owns the number.
    yardCommitted += Math.max(0, quoteShipyard(state.player, podAction).cost);
  }
  const upgrade = planFighterUpgrade(state, yardCommitted);
  if (upgrade) actions.push(upgrade);
  yardCommitted += upgradeCost(state, upgrade);
  const special = planSpecialEquipment(state, VETERAN_RESERVE, undefined, yardCommitted);
  if (special) actions.push(special);
  yardCommitted += specialEquipmentCost(state, special);

  // N9 · The captain's overhead. The veteran is the LONG-HORIZON archetype — the
  // one whose whole premise is that the career outlives the measurement window —
  // so it is the policy a port stake's 154-to-1,043-dusk payback is least unfair
  // to. It plays the verbs on exactly the same rules as everyone else regardless.
  const overhead = planCaptainOverhead(state, VETERAN_RESERVE, refuelCost + yardCommitted);
  actions.push(...overhead.actions);

  // T-199 · F-199-1 · the yard spend is NOT netted off this payment, and that is a
  // KNOWN, FILED hole, not an oversight — `fighterPolicy`'s equivalent call carries
  // the fix and the reasoning. It is left alone here because the veteran is exempt
  // from `assertNoIncomeStall` and because widening this change to a fourth policy
  // moved `balance-combat-survival.test.ts`'s preparation band (see TASKS.md,
  // T-235 / F-199-1). Closing it belongs to the task that owns that band.
  const debtPayment = planDebtPayment(state, VETERAN_RESERVE, refuelCost + overhead.cost);
  if (debtPayment) actions.push(debtPayment);

  return withReroll(state, actions.length > 0 ? actions : [{ type: 'Wait' }]);
};

export function resolvePolicy(policy: SimPolicyName | SimPolicy): ResolvedPolicy {
  if (typeof policy === 'function') {
    return { name: 'random', policy, dawnBlind: true };
  }

  if (policy === 'idle') {
    return { name: policy, policy: idlePolicy, dawnBlind: true };
  }

  if (policy === 'greedy') {
    return { name: policy, policy: greedyTraderPolicy, dawnBlind: true };
  }

  if (policy === 'trader') {
    return { name: policy, policy: traderPolicy, dawnBlind: false };
  }

  if (policy === 'fighter') {
    return { name: policy, policy: fighterPolicy, dawnBlind: false };
  }

  if (policy === 'explorer') {
    return { name: policy, policy: explorerPolicy, dawnBlind: false };
  }

  if (policy === 'veteran') {
    return { name: policy, policy: veteranPolicy, dawnBlind: false };
  }

  // T-1601b. NOTE the fallthrough below: an unrecognised name silently runs the
  // RANDOM policy, so a missing branch here would not fail loudly — it would just
  // report zeros for every metric. `campaign-smuggler-gambler.test.ts` asserts
  // these two resolve to the named policies precisely to catch that.
  if (policy === 'smuggler') {
    return { name: policy, policy: smugglerPolicy, dawnBlind: false };
  }

  if (policy === 'gambler') {
    return { name: policy, policy: gamblerPolicy, dawnBlind: false };
  }

  // R1 · same fallthrough hazard as the two above: an unrecognised name runs the
  // RANDOM policy and would report plausible-looking zeros. Pinned in
  // `campaign-degraded.test.ts`.
  if (policy === 'trader-degraded') {
    return { name: policy, policy: degradedTraderPolicy, dawnBlind: false };
  }

  return { name: policy, policy: randomLegalActionPolicy, dawnBlind: true };
}

function validateInteger(name: string, value: number, minimum: number): void {
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${name} must be an integer >= ${minimum}`);
  }
}

/** Destination of the highest-paying offer on a freshly generated board. First
 *  max wins (deterministic board order). Null when the board is empty. */
function bestOfferDestination(board: GameState['market']['manifestBoard']): number | null {
  let destination: number | null = null;
  let bestPayment = -1;
  for (const offer of board) {
    if (offer.payment > bestPayment) {
      bestPayment = offer.payment;
      destination = offer.destination;
    }
  }
  return destination;
}

/** Group the per-dawn best-offer destinations into fixed windows and report how
 *  dominant the single most-frequent destination was in each (T-107). */
export function computeRouteDiversity(
  bestOfferDestinations: readonly (number | null)[],
  windowSize = 100,
): RouteDiversityWindow[] {
  const windows: RouteDiversityWindow[] = [];
  for (let start = 0; start < bestOfferDestinations.length; start += windowSize) {
    const slice = bestOfferDestinations.slice(start, start + windowSize);
    const counts = new Map<number, number>();
    let sampleCount = 0;
    for (const destination of slice) {
      if (destination === null) continue;
      sampleCount += 1;
      counts.set(destination, (counts.get(destination) ?? 0) + 1);
    }
    let topDestination: number | null = null;
    let topCount = 0;
    for (const [destination, count] of counts) {
      if (count > topCount) {
        topCount = count;
        topDestination = destination;
      }
    }
    windows.push({
      windowIndex: windows.length,
      startDay: start + 1,
      endDay: start + slice.length,
      topDestination,
      topShare: sampleCount === 0 ? 0 : topCount / sampleCount,
      sampleCount,
    });
  }
  return windows;
}

export function runCampaign(
  seed: number,
  days: number,
  policy: SimPolicyName | SimPolicy,
  extras: RunCampaignExtras = {},
): CampaignStatsReport {
  validateInteger('seed', seed, Number.MIN_SAFE_INTEGER);
  validateInteger('days', days, 0);

  const resolvedPolicy = resolvePolicy(policy);
  // N7 · ONE loop, two possible starting worlds. The staged smoke runner reuses
  // this function rather than re-implementing start→act→dusk, which is R2c's
  // lesson applied to the instrument: a second copy of the day loop would agree
  // with this one right up until it inherited a bug and stopped.
  const milestoneDays = new Set(extras.milestoneDays ?? []);
  const milestones: MilestoneSample[] = [];
  let state = extras.startState ?? createInitialState(seed);
  const creditsCurve: number[] = [];
  const daily: CampaignDayStats[] = [];
  let debtClearedDay: number | null = null;
  let fuelStarvationDays = 0;
  let flawChecks = 0;
  let flawOverrides = 0;
  let wireVolume = 0;
  const bestOfferDestinations: (number | null)[] = [];
  const boardDepths: number[] = [];
  // T-1601a behavior metrics (see the interface doc comments for readers).
  const loanUsage: LoanUsageStats = {
    loansTaken: 0,
    principalBorrowed: 0,
    interestAccrued: 0,
    amountRepaid: 0,
    loansCleared: 0,
    defaults: 0,
    daysWithLoan: 0,
  };
  const fragments: FragmentStats = { acquired: 0, decoded: 0, heldAtEnd: 0, decodedAtEnd: 0 };
  const equipmentUse: EquipmentUseStats = {
    specialEquipmentBought: [],
    componentTiersBought: 0,
    upgradedVolleys: 0,
    shieldAbsorbedPoints: 0,
    autoRepairDusks: 0,
  };
  // T-1601b behavior metrics (see the interface doc comments for readers).
  const smuggling: SmugglingStats = {
    contrabandContractsSigned: 0,
    contrabandDelivered: 0,
    scans: 0,
    scansCaught: 0,
    scansEvaded: 0,
    finesPaid: 0,
    contractsConfiscated: 0,
    podsConfiscated: 0,
    podsTaken: 0,
    fenceSales: 0,
    daysCarryingIllicit: 0,
    fenceRepDays: 0,
  };
  const hangoutPlay: HangoutPlayStats = {
    visits: 0,
    dares: 0,
    daresWon: 0,
    daresLost: 0,
    wagered: 0,
    netCredits: 0,
    expectedValuePerDare: 0,
    socialBeats: 0,
    failedVisits: 0,
    dareGuardHits: 0,
    handsAboveBaseCeiling: 0,
    handsAboveRaisedCeiling: 0,
    maxSeedWager: 0,
    // T-175 · all 48 cells present and zero-filled (F-160-1's split).
    dareCells: zeroDareCells(),
    dareTierDisagreements: 0,
    dareChallengeCells: zeroDareChallengeCells(),
    dareChallengeSplit: zeroDareChallengeSplit(),
    dareChallengeDisagreements: 0,
  };
  // T-1603a balance-baseline instrumentation (see the interface doc comments).
  const survival: SurvivalStats = {
    shipsLost: 0,
    combatDefeats: 0,
    lifeSupportFailures: 0,
    lifeSupportScares: 0,
    successions: 0,
  };
  // T-173 · standing instrumentation (see {@link DispositionStats}).
  const disposition: DispositionStats = {
    movesByReason: zeroMovesByReason(),
    liveNpcDays: 0,
    zeroDispositionNpcDays: 0,
    absDispositionSum: 0,
    peakAbsDisposition: 0,
    standingSpanDays: [],
    standingsOpenAtHorizon: 0,
  };
  const metrics: CampaignMetricAccumulator = {
    loanUsage,
    fragments,
    equipmentUse,
    smuggling,
    hangoutPlay,
    disposition,
    openStandingDays: new Map<string, number>(),
    survival,
    tourOne: null,
    subsistenceDays: 0,
    // T-175 · the cell split's two running fields (F-160-1).
    settledDareHands: 0,
    openDareBids: new Map<string, number>(),
    openDareLastBidder: new Map<string, DareChallenger>(),
  };
  const balance = newBalanceRecordTracker();

  for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
    const startingDay = state.day;
    // N7 · Sampled at DAWN, before the day is played: a milestone is the spec for
    // a synthesized state, and a synthesizer hands `runCampaign` a world that has
    // not yet had its day-N dawn either.
    if (milestoneDays.has(startingDay)) milestones.push(sampleMilestone(state));
    const rng = new SeededRng(seed)
      .fork('policy')
      .fork(`day-${startingDay}`)
      .fork(`index-${dayIndex}`);
    // The naive policies (dawnBlind) plan on the DAWN state (board not yet
    // generated), exactly as they did under advanceDay — byte-for-byte
    // preserved (startDay clones its input, so `dawnState` is untouched). The
    // competent T-201 policies plan on the freshly generated day state so they
    // can read the live board and dawn hand. We inline advanceDay's
    // start→act→dusk sequence either way, observing the fresh board for
    // route-diversity tracking (T-107).
    const dawnState = state;
    const dawn = startDay(state);
    let dayState = dawn.state;
    const dayEvents: GameEvent[] = [...dawn.events];
    // T-1603a: the dawn batch is folded too. It normally carries no encounter or
    // trade beat, but a scheduled storylet firing at dawn can, and a fold that
    // skipped it would silently lose those.
    ingestBalanceRecords(dawn.events, balanceSample(dayState), balance);
    bestOfferDestinations.push(bestOfferDestination(dayState.market.manifestBoard));
    // N10 · The board's DEPTH, sampled at the same moment as its best offer and
    // for the same reason: this is the dawn board, before the player signs
    // anything off it and before the dusk splices a snipe out of it.
    boardDepths.push(dayState.market.manifestBoard.length);
    const actions = resolvedPolicy.policy({
      state: resolvedPolicy.dawnBlind ? dawnState : dayState,
      dayIndex,
      rng,
    });
    const incomeActionCount = actions.filter(isIncomeAction).length;
    for (const action of actions) {
      // T-1205: a queued Combat can now be orphaned mid-batch — seeded enemy
      // damage can drive the player's hull to 0 and end the encounter (succession)
      // BEFORE the rest of a volley queue is applied, and a Combat with no active
      // encounter is malformed input that throws. A batch driver must therefore
      // skip a Combat once the encounter is gone (a real UGT client re-reads legal
      // actions between steps and would never send it). This only fires on the new
      // mid-batch-death path, so deterministic non-fatal runs are unchanged.
      if (action.type === 'Combat' && !dayState.encounter) continue;
      // T-135: the analogous orphan skip for the Liar's Dice scene. DEFENSIVE —
      // no policy queues a `Dare` today (the continuation loop below plays hands
      // out against the live state, so a `Dare` never reaches this batch) — but
      // the same class of orphaning that produced the Combat skip applies, and
      // unlike Combat the engine answers a `Dare` with no hand as a typed no-op
      // rather than a throw, so this is belt to the engine's braces.
      if (action.type === 'Dare' && !dayState.dareHand) continue;
      // T-1601a: `upgradedVolleys` cannot be read off the event stream — a
      // CombatEvent says a fight round landed, not what gun landed it. Sample the
      // fit on the PRE-action ship (the junker's `weaponVolleyDamage` is exactly
      // 1 by the T-1205 baseline-subtraction invariant, so `> 1` means a bought
      // weapon tier / STAR_BUSTER was in play) and pair it with the outcome.
      const volleyDamageBefore = weaponVolleyDamage(dayState.player.ship);
      // T-1603a: the pre-action sample the encounter/route folds need. Taken
      // AFTER the mid-batch-death `continue` above on purpose — a Combat action
      // whose encounter is already gone must not produce a phantom record.
      const preActionState = dayState;
      const stepped = applyPlayerAction(dayState, action);
      dayState = stepped.state;
      dayEvents.push(...stepped.events);
      ingestBalanceRecords(
        stepped.events,
        balanceSample(preActionState, dayState.player.credits),
        balance,
      );

      // T-135 · A Liar's Dice hand is a SCENE (docs/LIARS-DICE_REDESIGN.md §12.2).
      // The policy planned its OPENING from the dawn state and cannot plan the
      // rest, because every later move answers a dealer bid that did not exist at
      // dawn. Play it out here, one move at a time, folding each step's events
      // exactly as the outer loop does — with a PRE-ACTION sample per iteration,
      // because without it T-137 would measure the opening hand and nothing else.
      //
      // Without this loop every sweep that plays the tables would end its day with
      // an open hand, which gate 1 then blocks every subsequent action against and
      // which the dusk timeout-fold silently forfeits: the measured EV would be
      // "the gambler folds every hand", a measurement of nothing.
      let dareGuard = 0;
      while (dayState.dareHand && dareGuard < DARE_MAX_MOVES_PER_HAND) {
        dareGuard += 1;
        const move = planDareMove(dayState);
        if (!move) break;
        const preMoveState = dayState;
        const played = applyPlayerAction(dayState, move);
        dayState = played.state;
        dayEvents.push(...played.events);
        ingestBalanceRecords(
          played.events,
          balanceSample(preMoveState, dayState.player.credits),
          balance,
        );
      }
      if (dareGuard >= DARE_MAX_MOVES_PER_HAND) hangoutPlay.dareGuardHits += 1;

      if (
        volleyDamageBefore > 1 &&
        stepped.events.some(
          (event) => event.type === 'CombatEvent' && event.stance === 'fight' && event.success,
        )
      ) {
        equipmentUse.upgradedVolleys += 1;
      }
    }
    // T-1601a: the AUTO_REPAIR module narrates only a WireEntry, so measure it by
    // comparing condition across the dusk on the seven components the engine's
    // reader actually touches (hull excluded, exactly as engine-side).
    const preDuskShip = dayState.player.ship;
    // N11/T-022: the cast's yard is measured the same way, and for the same reason
    // — `considerRefit` narrates a purchase as a WireEntry only. Sampled here so
    // the pair straddles exactly one `endDay`, which is the tick `resolveNpcDay`
    // runs on. `cloneState` gives the next state a fresh array of the SAME records
    // and `resolveNpcDay` assigns a `structuredClone` copy back, so this total is a
    // reading of the field BEFORE the dusk and cannot be mutated out from under us.
    const preDuskGatedWorn = gatedEquipmentWorn(dayState);
    // T-140 · The options object is built ONLY for a traced run; an ordinary sweep
    // still calls the one-argument `endDay(dayState)` it always called.
    const dusk =
      extras.npcDecisionTrace === undefined
        ? endDay(dayState)
        : endDay(dayState, { npcDecisionTrace: extras.npcDecisionTrace });
    state = dusk.state;
    dayEvents.push(...dusk.events);
    // T-1603a: dusk closes encounters (a bond drive-off's `resolveInterceptorFled`)
    // and forfeits cargo (the life-support succession), so the fold must see it.
    ingestBalanceRecords(dusk.events, balanceSample(dayState, state.player.credits), balance);
    if (
      preDuskShip.hasAutoRepair === true &&
      AUTO_REPAIR_SIM_COMPONENTS.some(
        (id) => state.player.ship[id].condition > preDuskShip[id].condition,
      )
    ) {
      equipmentUse.autoRepairDusks += 1;
    }
    // N11/T-022: the dusk delta. Non-negative by the monotonicity argument at
    // `gatedEquipmentWorn`; `Math.max` is NOT used to clamp it, because a negative
    // value would mean an item was uninstalled or the roster shrank, and that is a
    // finding the reader test is meant to surface rather than hide.
    const npcSpecialEquipmentBought = gatedEquipmentWorn(state) - preDuskGatedWorn;
    if (state.player.loan) {
      loanUsage.daysWithLoan += 1;
    }
    // T-1601b: two DUSK-STATE folds. No event says "the hold is still dirty" or
    // "the fence rep is still on the record" — those are conditions, not beats —
    // so they are measured the same way `daysWithLoan` above is. Both use the
    // engine/content definitions (`isCarryingIllicit`, `FENCE_REP_FLAG`) rather
    // than re-deriving from raw flags, so the sim can never drift from the scan.
    if (isCarryingIllicit(state)) {
      smuggling.daysCarryingIllicit += 1;
    }
    if (state.flags[FENCE_REP_FLAG] === true) {
      smuggling.fenceRepDays += 1;
    }
    // T-173 · The third dusk-STATE fold, beside the two above and for the same
    // reason: "the cast sits at exactly zero" is a condition no event reports.
    // Taken AFTER the dusk, so the standing read is the post-decay one — decay is
    // itself a dusk step (`day.ts` → `applyDisposition(..., 'decay')`).
    sampleDispositionAtDusk(state, metrics);

    const counts = countDailyEvents(dayEvents);
    accumulateMetricEvents(dayEvents, metrics);
    wireVolume += counts.wireEntries;
    flawChecks += counts.flawChecks;
    flawOverrides += counts.flawOverrides;

    // T-1004 stranding measure. Evaluated ONCE and consumed twice: the report
    // counter and the per-day `fuelStarved` series below (T-1601a).
    const fuelStarved = cannotAffordCheapestJump(state);
    if (fuelStarved) {
      fuelStarvationDays += 1;
    }

    if (debtClearedDay === null && state.player.debt === 0) {
      debtClearedDay = state.day;
    }

    creditsCurve.push(state.player.credits);
    daily.push({
      day: state.day,
      credits: state.player.credits,
      debt: state.player.debt,
      fuel: state.player.ship.fuel,
      systemId: state.player.currentSystemId,
      wireEntries: counts.wireEntries,
      flawChecks: counts.flawChecks,
      flawOverrides: counts.flawOverrides,
      deedsEarned: counts.deedsEarned,
      deedCount: state.player.registry.earned.length,
      renownRank: state.player.registry.renownRank,
      bestOfferDestination: bestOfferDestinations[dayIndex] ?? null,
      // N10 · Sampled from the DAWN board (`boardDepths`, pushed beside
      // `bestOfferDestinations` above) and not from `state.market` here: by this
      // point the dusk has spliced any sniped offer out, so reading it now would
      // conflate "the pool supplied 3" with "4 were offered and one was taken".
      boardDepth: boardDepths[dayIndex] ?? 0,
      contractsSniped: counts.contractsSniped,
      npcSpecialEquipmentBought,
      incomeActionCount,
      fuelStarved,
    });
  }

  fragments.heldAtEnd = fragmentCount(state.player.nemesisFile);
  fragments.decodedAtEnd = decodedFragmentCount(state.player.nemesisFile);
  // T-1601b: the acceptance metric, derived post-loop exactly as the fragment
  // end-state fields above are. Zero (not NaN) on a career that never dared.
  hangoutPlay.expectedValuePerDare =
    hangoutPlay.dares > 0 ? hangoutPlay.netCredits / hangoutPlay.dares : 0;
  // T-1603a: the horizon ended mid-fight / mid-delivery. Both are flushed rather
  // than dropped so counts stay honest, and both are labelled so an aggregate can
  // exclude them (an unfinished leg has no payout to price).
  // T-173 · Standings still open when the horizon ran out. COUNTED, never pushed
  // into `standingSpanDays` as a truncated survival — a span that has not closed
  // is not a span, and averaging it in would bias every survival figure downward.
  disposition.standingsOpenAtHorizon = metrics.openStandingDays.size;
  closeBalanceEncounter(balance, 'unresolved', state.player.credits);
  if (balance.openLeg) {
    balance.legs.push({ ...balance.openLeg, outcome: 'open-at-end' });
    balance.openLeg = null;
  }

  return {
    seed,
    days,
    policy: resolvedPolicy.name,
    creditsCurve,
    debtClearedDay,
    fuelStarvationDays,
    flawOverrideRate: flawChecks === 0 ? 0 : flawOverrides / flawChecks,
    wireVolume,
    deedCount: state.player.registry.earned.length,
    deedsEarned: state.player.registry.earned.map((deed) => deed.id),
    renownRank: state.player.registry.renownRank,
    routeDiversity: computeRouteDiversity(bestOfferDestinations),
    loanUsage,
    fragments,
    equipmentUse,
    smuggling,
    hangoutPlay,
    disposition,
    tourOne: metrics.tourOne,
    subsistenceDays: metrics.subsistenceDays,
    // N10 · Summed from the per-day series rather than kept as a second running
    // counter, so the scalar and the trajectory cannot disagree — the discipline
    // T-1601a's `fuelStarved` established one field above.
    contractClaims: daily.reduce((total, day) => total + day.contractsSniped, 0),
    // N11/T-022 · Summed from its own per-day series for the same reason the line
    // above is: the scalar and the trajectory are one measurement in two shapes and
    // must not be able to disagree.
    npcSpecialEquipmentPurchases: daily.reduce(
      (total, day) => total + day.npcSpecialEquipmentBought,
      0,
    ),
    // N12/T-030 · A STOCK, read once off the final state exactly as
    // `finalState.credits` below is — see the field's own comment for why it is
    // deliberately not summed from a per-day series like the two lines above.
    portsOwned: state.player.ports.length,
    combatEncounters: balance.encounters,
    routeLegs: balance.legs,
    survival,
    finalState: {
      day: state.day,
      credits: state.player.credits,
      debt: state.player.debt,
      fuel: state.player.ship.fuel,
      systemId: state.player.currentSystemId,
    },
    daily,
    // Spread rather than assigned so an ordinary call emits neither key and its
    // report JSON stays byte-identical to the pre-N7 shape.
    ...(extras.startState === undefined ? {} : { syntheticStart: true as const }),
    ...(milestones.length === 0 ? {} : { milestones }),
  };
}

/** N7 · The dawn snapshot behind {@link MilestoneSample}. Reads the live state;
 *  every derived number comes from the engine's own field rather than a
 *  re-computation here. */
/**
 * N12/T-030 · Port stakes this captain holds. NO NPC RECORD CARRIES THE KEY
 * TODAY — `NpcState` has no `ports` field, so this reads 0 for every captain by
 * construction, and that zero is the honest measurement rather than a stub. N12
 * proper gives the cast the PLAYER's own `ports: PortStake[]` (the parity shape N1
 * used for `ShipState` and N11 for `DeedRegistryState`); when it does, this
 * function starts returning real counts and NOTHING ELSE IN THE INSTRUMENT
 * CHANGES.
 *
 * The optional intersection is deliberate in place of adding an unwritten field to
 * the engine now. Adding `ports?: PortStake[]` to `NpcState` here would move
 * `rulesFingerprint` — re-pinning every balance fixture for a rule that did not
 * change — and would prejudge where N12 chooses to store a finite, per-system,
 * first-come-first-served stake.
 */
function npcPortCount(npc: NpcState & { readonly ports?: readonly PortStake[] }): number {
  return npc.ports?.length ?? 0;
}

/** The eight per-captain arrays behind {@link MilestoneSample} (seven until T-173
 *  added `npcDisposition`), over the SIMULATED
 *  roster only. One traversal, one filter, so the arrays cannot fall out of
 *  step with each other — index i is the same captain in all of them. That
 *  property is load-bearing rather than tidy since N11/T-022: `npcDeedCount[i]`
 *  and `npcRenownRank[i]` are only readable together (a rank is a step function of
 *  a deed count), and the cross-milestone monotonicity assertion in
 *  `campaign-renown.test.ts` compares index i at day 30 with index i at day 60. A
 *  second `state.npcs.filter` anywhere here would make all of that a coincidence,
 *  so the `Pick<>` is deliberately the compiler's way of forcing a new array into
 *  THIS traversal. */
function sampleField(
  state: GameState,
): Pick<
  MilestoneSample,
  | 'npcCredits'
  | 'npcHullStrength'
  | 'npcFuel'
  | 'npcSystemId'
  | 'npcDeedCount'
  | 'npcRenownRank'
  | 'npcPortCount'
  | 'npcDisposition'
> {
  const field = state.npcs.filter((npc) => isSimulatedCaptain(npc.profileId));
  return {
    npcCredits: field.map((npc) => npc.credits),
    npcHullStrength: field.map((npc) => npc.ship.hull.strength),
    npcFuel: field.map((npc) => npc.ship.fuel),
    npcSystemId: field.map((npc) => npc.currentSystemId),
    npcDeedCount: field.map((npc) => npc.registry.earned.length),
    npcRenownRank: field.map((npc) => npc.registry.renownRank),
    npcPortCount: field.map((npc) => npcPortCount(npc)),
    // T-173 · The eighth array, in the SAME traversal for the same reason: a
    // captain's standing is only readable against the purse and the rank beside
    // it, and a second `state.npcs.filter` would make that alignment a
    // coincidence.
    npcDisposition: field.map((npc) => npc.disposition),
  };
}

function sampleMilestone(state: GameState): MilestoneSample {
  const ship = state.player.ship;
  return {
    day: state.day,
    player: {
      credits: state.player.credits,
      debt: state.player.debt,
      fuel: ship.fuel,
      maxFuel: ship.maxFuel,
      systemId: state.player.currentSystemId,
      tier: state.player.tier,
      deedCount: state.player.registry.earned.length,
      renownRank: state.player.registry.renownRank,
      shipRating: Math.max(ship.weapons.strength, ship.hull.strength, ship.shields.strength),
      weaponsStrength: ship.weapons.strength,
      hullStrength: ship.hull.strength,
      shieldsStrength: ship.shields.strength,
      drivesStrength: ship.drives.strength,
      cargoPods: ship.cargoPods,
      crew: state.player.crew.length,
      ports: state.player.ports.length,
    },
    // THE SIMULATED FIELD, NOT EVERY RECORD — an instrument defect found and
    // fixed at the reopened N4, and it silently scoped every NPC number this
    // project has measured since N3's roster split. `state.npcs` carries 41
    // records: the 30 captains who take a turn, plus 11 quest characters who
    // never do and therefore sit FROZEN at 5,000cr and their day-1 fit for the
    // whole career. Sampling all 41 mixed eleven constants into every percentile
    // — and because they cluster mid-distribution, they landed ON the median: at
    // seed 1 / day 200 the 41-record median reads 5,000cr against the simulated
    // field's 167,421, which reported the field's wealth spread as 344x when it
    // is 10.3x. Same class as N9's "the aggregate cannot see an asset", and
    // fixed for the same reason: an instrument blind spot has to close BEFORE
    // the capstone it would corrupt, not after.
    ...sampleField(state),
  };
}

export function reportToJson(report: CampaignStatsReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function usage(): string {
  return [
    'Usage: npm run sim -- --seed <integer> --days <integer> --policy <idle|greedy|random|trader|fighter|explorer|veteran|smuggler|gambler|trader-degraded>',
    'Defaults: --seed 1 --days 100 --policy idle',
    'Alias: --policy random-legal-action',
  ].join('\n');
}

function normalizePolicy(value: string): SimPolicyName {
  if (value === 'random-legal-action') {
    return 'random';
  }

  if (isSimPolicyName(value)) {
    return value;
  }

  throw new Error(`Invalid policy: ${value}`);
}

function parseIntegerFlag(name: string, value: string | undefined): number {
  if (value === undefined || value.trim() === '') {
    throw new Error(`Missing value for ${name}`);
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer`);
  }

  return parsed;
}

function parseCli(argv: string[]): CliResult {
  const options: RunCampaignOptions = {
    seed: 1,
    days: 100,
    policy: 'idle',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help') {
      return { help: true };
    }

    if (arg === '--seed') {
      options.seed = parseIntegerFlag(arg, argv[index + 1]);
      index += 1;
    } else if (arg === '--days') {
      options.days = parseIntegerFlag(arg, argv[index + 1]);
      index += 1;
    } else if (arg === '--policy') {
      const value = argv[index + 1];
      if (value === undefined || value.trim() === '') {
        throw new Error('Missing value for --policy');
      }
      options.policy = normalizePolicy(value);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg ?? ''}`);
    }
  }

  validateInteger('--seed', options.seed, Number.MIN_SAFE_INTEGER);
  validateInteger('--days', options.days, 0);

  return options;
}

export function parseCliArgs(argv: string[]): RunCampaignOptions {
  const result = parseCli(argv);

  if ('help' in result) {
    throw new Error('--help is handled by main');
  }

  return result;
}

export function main(argv: string[] = process.argv.slice(2)): void {
  try {
    const result = parseCli(argv);

    if ('help' in result) {
      process.stdout.write(`${usage()}\n`);
      process.exitCode = 0;
      return;
    }

    process.stdout.write(reportToJson(runCampaign(result.seed, result.days, result.policy)));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    process.stderr.write(`${message}\n${usage()}\n`);
    process.exitCode = 1;
  }
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  main();
}
