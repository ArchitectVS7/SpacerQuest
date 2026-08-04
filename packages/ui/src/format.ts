import {
  STAR_SYSTEMS,
  CARGO_TYPES,
  STORYLETS,
  NPC_PROFILES,
  ALL_NPC_PROFILES,
  isSimulatedCaptain,
  ANONYMOUS_INTERCEPTORS,
  SHIP_COMPONENTS,
  SPECIAL_EQUIPMENT,
  RENOWN_RANKS,
  RENOWN_DEED_THRESHOLDS,
  Stat,
  FIGHT_FUEL_COST,
  RUN_FUEL_COST,
  EXPLORATION_NAV_DC,
  EXPLORATION_FUEL_COST,
  LOAN_DAILY_RATE,
  LOAN_TERM_DAYS,
  LENDER_ID,
  CREW_ROLES,
  CREW_BY_ID,
  EXPLORE_MODULES,
  EXPLORE_MODULE_DICE_BENEFITS,
  EXPLORE_ITEM_BY_ID,
  PURCHASABLE_PORTS_BY_SYSTEM,
  isPurchasablePort,
  FACTION_IDS,
  FACTION_LABELS,
  NEMESIS_SYSTEM_ID,
  NEMESIS_CROSSING_DC,
  CROSSING_STAKE_MIN_CREDITS,
  CROSSING_REQUIRED_RANK,
  CROSSING_ENDING,
  DEMO_END_CARD,
  DEMO_FINAL_DAY,
  DEMO_TEASE,
  type DemoLockedFeature,
  type FactionId,
  type StoryletTrigger,
  type CrewRole,
  type DiceBenefit,
  type ExploreModuleContentId,
  type HangoutTone,
  type HangoutVenueId,
} from '@spacerquest/content';
import {
  maxJumpDistance,
  navBonus,
  quoteShipyard,
  nemesisLoreIndex,
  fragmentCount,
  quoteCrossingStake,
  careerEnded,
  careerEpilogue,
  demoConcluded,
  demoDaysRemaining,
  demoLocked,
  isDemo,
  type Edition,
  type ShipState,
  componentTierForStrength,
  calculateFuelCapacity,
  jumpFuelCost,
  weaponVolleyDamage,
  shieldMitigation,
  navFuelFactor,
  effectiveScore,
  repairRate,
  tributeForRound,
  nextRankFor,
  quoteStoryletChoice,
  travelPreview,
  quoteFuelPurchase,
  hangoutRumors,
  loanBandFor,
  portHangoutFor,
  rankClientele,
  venueOffered,
  venueParamsFor,
  // T-136 · The Liar's Dice RULES the fog projection reads. The pane never
  // re-derives legality or headroom; it asks the engine's own functions.
  headroomFor,
  legalDareMoves,
  // T-145 · the ROSTER accessors. The pane resolves a pool-A opponent's authored
  // name and lines through the engine, exactly as it reads `wagerBandFor` /
  // `headroomFor` rather than re-deriving them.
  liarsDiceOpponentFor,
  liarsDiceOpponentsAt,
  // T-146 · the UNLOCK LADDER. `liarsDiceTier` is read in exactly one place in
  // this package (`dareWagerBounds`), for the reason stated there.
  effectiveWagerBand,
  liarsDiceTier,
  readTheTableLine,
  dawnDiceModifiers,
  equipmentDiceBenefits,
  hasExploreModule,
  quotePort,
  crewCapacity,
  isCarryingContraband,
  isCarryingIllicit,
  type CheckResult,
  type DareBid,
  type DareBidEntry,
  type DareMoveKind,
  type DareOutcome,
  type GameEvent,
  type GameState,
  type PlayerAction,
  type ShipComponentId,
  type SpecialEquipmentId,
  type ShipyardFail,
  type ShipyardQuote,
  type StoryletOffer,
  type NemesisLoreEntry,
  type CrossingRefusal,
  type TravelPreview,
  type FuelPurchaseQuote,
  type PortQuote,
  type PortEventFailReason,
  type ExplorationFailReason,
  type SaveErrorCode,
} from '@spacerquest/engine';
import type { RenownRankId, AnonymousInterceptorKind } from '@spacerquest/content';
// T-1701a · TYPE-ONLY on purpose: `format.ts` is the pure-prose module and must
// not acquire a runtime dependency on the storage seam (which has module-scope
// side effects — it performs the one-time localStorage import). Only the two
// storage-failure sentences below are backend-dependent, and they take the
// backend as a parameter rather than reading it. T-1701b adds `UpdateStatus` on
// the same terms — `updateStatusMessage` takes it as a parameter too, and
// T-1702a adds `SteamStatus` on the same terms again, and T-1702b `CloudStatus`.
import type { StorageBackend, UpdateStatus, SteamStatus, CloudStatus } from './storage';

/** Display label for a stat. The Stat enum values are already the labels we
 * want, so this is a stable pure lookup (no fabricated names). */
export function statName(stat: Stat): string {
  return String(stat).toUpperCase();
}

/**
 * Derive the styling verdict for a resolved check from the engine's result —
 * never recomputed, only read. Nat 20 / nat 1 outrank ordinary pass/miss so the
 * readout can give them distinct juice (PRD: the dice are honest and visible).
 */
export function checkVerdict(r: CheckResult): 'crit' | 'fumble' | 'pass' | 'miss' {
  if (r.nat20) return 'crit';
  if (r.nat1) return 'fumble';
  return r.success ? 'pass' : 'miss';
}

/** Signed margin, e.g. "+3" / "-2" / "0", for the honest readout. */
export function signedMargin(margin: number): string {
  return margin > 0 ? `+${margin}` : `${margin}`;
}

export function systemName(id: number): string {
  return STAR_SYSTEMS[id]?.name ?? `System-${id}`;
}

export function cargoName(id: number): string {
  return CARGO_TYPES[id]?.name ?? `Cargo-${id}`;
}

// ---- T-305 manifest flags (display-only) ---------------------------------
//
// The URGENT / STORYLET badges the manifest board shows are PRESENTATIONAL
// reads of existing engine + content state — the UI invents no new rule and
// adds no field to CargoContract. A contract is URGENT when its destination is
// repriced by the active era event (the honest derivation of the PRD's
// "Medicinals to Fomalhaut-2, flagged URGENT — fever outbreak" example); it
// carries a STORYLET when the cargo it moves has a storylet keyed to it in
// content data (e.g. Medicinals → cargo.medicinals.quarantine-seal).

/** Cargo types that any content storylet is keyed to via
 *  `trigger.cargo.activeContractCargoType`. Computed once from content data —
 *  this reads authored data, never a rule. */
const CARGO_STORYLET_TYPES: ReadonlySet<number> = new Set(
  STORYLETS.map((s) => (s.trigger as StoryletTrigger).cargo?.activeContractCargoType).filter(
    (t): t is number => typeof t === 'number',
  ),
);

/** True when carrying this cargo type can surface a storylet (display-only). */
export function cargoHasStorylet(cargoType: number): boolean {
  return CARGO_STORYLET_TYPES.has(cargoType);
}

/** True when a contract's destination is repriced by the active era event, the
 *  single commented place the URGENT derivation lives (display-only). */
export function contractIsUrgent(game: GameState, destination: number): boolean {
  return game.eraEvent?.affectedSystemIds.includes(destination) ?? false;
}

/** T-1402 · The engine's advisory fuel-purchase preview (cost, delivered, wasted,
 *  overspend, affordability), re-exported so the fuel depot can warn BEFORE the buy
 *  commits. A pure read — the engine still clamps the tank on resolve; this only
 *  surfaces the clamp so the spacer isn't silently charged for fuel they can't hold. */
export function fuelPurchaseQuote(game: GameState, fuelAmount: number): FuelPurchaseQuote {
  return quoteFuelPurchase(game, fuelAmount);
}

// ---- T-304 starmap -------------------------------------------------------
//
// Every rule number the starmap shows flows out of an engine function — never
// recomputed here. `routePreview` is a thin pass-through to the engine's
// `travelPreview` (fuel cost / pilot DC / danger / reachability); the fuel-range
// ring radius comes from maxJumpDistance. The UI only projects coordinates onto
// the SVG plane.

/** A single previewed jump — fuel cost, pilot DC, danger and reachability, all
 *  read straight from the engine so the number shown is the number checked. The
 *  UI owns no route rule: this is the engine's own `TravelPreview`, re-exported
 *  under the name the starmap already calls. */
export type RoutePreview = TravelPreview;

/** T-1402 · A thin pass-through to the engine's `travelPreview` — the UI no longer
 *  reimplements the jumpFuelCost / travelDc / calculateRouteDanger stack (nor the
 *  fabricated `jumpsBetween` round) it used to; it consumes the engine truth. */
export function routePreview(game: GameState, dest: number): RoutePreview {
  return travelPreview(game, dest);
}

// ---- T-1403 off-lane exploration (display-only) --------------------------
//
// The off-lane sweep control is a pure CLIENT of the engine's `Explore` action.
// Every rule number it shows — the nav DC, the fuel cost, the effective PILOT
// modifier — reads from the SAME content constants and engine function the
// resolver (actions/exploration.ts) checks against, never a value invented in
// JSX. The loot summary is composed only from the action's typed events.

/** The advisory nav-check preview for the sweep button: the DC and fuel cost the
 *  engine will charge, the ship's effective PILOT modifier (stat + navBonus — the
 *  exact term `resolveExploration` adds), and whether the tank can afford the
 *  detour. A pure read; the engine still gates fuel on resolve. */
export interface ExplorationPreview {
  dc: number;
  fuelCost: number;
  effectiveModifier: number;
  canAfford: boolean;
}

export function explorationPreview(game: GameState): ExplorationPreview {
  const ship = game.player.ship;
  return {
    dc: EXPLORATION_NAV_DC,
    fuelCost: EXPLORATION_FUEL_COST,
    // The same modifier the resolver adds: PILOT stat + the ship's nav bonus.
    effectiveModifier: game.player.stats[Stat.PILOT] + navBonus(ship),
    canAfford: ship.fuel >= EXPLORATION_FUEL_COST,
  };
}

/**
 * T-111 · THE OPEN RECOVERY, as the cockpit shows it (docs/EXPLORE_REDESIGN.md
 * §3/§4.4). A committed multi-day op the player cannot see is a trap rather than
 * a trade, so the commitment gets a readout. A PURE READ — it recomputes no rule:
 * the day count is the engine's own `dueDay` minus the live day, clamped at 0 (an
 * overdue slot pays at the next dusk, so "0 days" is the honest reading), and the
 * name comes off the CHARTED POI rather than the outcome row (every legacy row's
 * `wireFound` is deliberately empty — inventing a name here would be UI fiction).
 */
export interface RecoveryReadout {
  /** The charted POI the op hangs off — its flavour name, straight off `charts`. */
  outcomeName: string;
  systemName: string;
  /** `max(0, dueDay - day)`. 0 ⇒ pays at this dusk (or is already overdue). */
  daysRemaining: number;
}

export function recoveryReadout(game: GameState): RecoveryReadout | null {
  const recovery = game.player.recovery;
  if (!recovery) return null;
  const poi = game.player.charts.discoveredPois.find((p) => p.id === recovery.poiId);
  return {
    outcomeName: poi?.name ?? 'an uncharted salvage claim',
    systemName: systemName(recovery.systemId),
    daysRemaining: Math.max(0, recovery.dueDay - game.day),
  };
}

/**
 * One honest line summarising a SUCCESSFUL sweep, composed straight from the
 * action's typed events — the charted POI plus whatever loot the roll surfaced
 * (salvage credits, a Signal Fragment, a sealed contraband pod), or the multi-day
 * recovery the find opened (T-111). Returns null when no POI was discovered (a
 * failed sweep speaks through its notice instead). The UI invents nothing here:
 * every clause reads an emitted event.
 */
export function explorationOutcome(events: GameEvent[]): string | null {
  const poi = events.find(
    (e): e is Extract<GameEvent, { type: 'PoiDiscovered' }> => e.type === 'PoiDiscovered',
  );
  if (!poi) return null;
  const parts: string[] = [`Charted ${poi.name}`];
  let salvage = 0;
  for (const e of events) if (e.type === 'SalvageRecovered') salvage += e.amount;
  if (salvage > 0) parts.push(`${salvage.toLocaleString()}cr in salvage`);
  if (events.some((e) => e.type === 'FragmentAcquired')) parts.push('a Signal Fragment recovered');
  // T-117 re-homed the sealed pod onto three authored derelict lore rows'
  // `effects.flags` (content `exploration.ts` `DERELICT_POD_EFFECTS`), which sets
  // `signal.contraband.pending` and arms the `derelict.sealed-pod` storylet — but
  // the row's own `wireFound` prose (a manifest, a burn schedule, a survey file)
  // never actually says "pod", so without this clause the pod's arrival was
  // invisible everywhere: not in this summary, not in the wire log, only
  // discoverable by noticing a new launcher in the hold dispatches. Read the
  // flag-set event `applyEffects` emits (`StoryletEffectApplied` `effect: 'flag'`)
  // rather than the retired `ContrabandFound` event, which stopped being emitted
  // when the transitional `contraband` payload kind retired with the three-leg
  // draw (docs/EXPLORE_REDESIGN.md §2.4, finding F-113-B) and would never fire here.
  if (
    events.some(
      (e) =>
        e.type === 'StoryletEffectApplied' &&
        e.effect === 'flag' &&
        e.flag === 'signal.contraband.pending' &&
        e.value === true,
    )
  )
    parts.push('a sealed pod bolted in the hold');
  // T-111: a deferred find would otherwise read as "Charted X." with no payoff —
  // the commitment must be legible on the day it is made. Reads the event's own
  // `dueDay`, never a re-derived clock.
  const started = events.find(
    (e): e is Extract<GameEvent, { type: 'RecoveryStarted' }> => e.type === 'RecoveryStarted',
  );
  if (started) parts.push(`a salvage op under way — holds station to day ${started.dueDay}`);
  // T-112: the moment of acquisition. NAME LOOKUP ONLY — the effect is the ship
  // pane's and the HandDock's job; inventing one here would be a second, drifting
  // account of a rule the engine already applied.
  for (const e of events) {
    if (e.type !== 'UniqueItemAcquired') continue;
    parts.push(`${EXPLORE_ITEM_BY_ID[e.itemId]?.name ?? 'an unlogged fitting'} recovered`);
  }
  // T-114: the two band-2 kinds that had no clause at all. §4.4 is explicit that
  // a committed find the player cannot see is a trap, and an `npc` row or a
  // `questline` row would otherwise read as "Charted X." with no payoff — the
  // same gap T-111's `RecoveryStarted` clause closed for a deferred find.
  //
  // BOTH ARE NAME LOOKUPS ONLY, on the engine's own emitted events. The
  // disposition move is read off `DispositionChanged` (which `applyEffects`
  // routes every standing change through) and the hook off `StoryletScheduled`
  // — never re-derived here, because a second account of a rule the engine
  // already applied is exactly how a UI drifts from the game.
  for (const e of events) {
    if (e.type !== 'DispositionChanged') continue;
    const name = ALL_NPC_PROFILES.find((npc) => npc.id === e.npcId)?.name ?? 'a captain';
    parts.push(e.delta >= 0 ? `${name} owes you a word` : `${name} took it badly`);
  }
  for (const e of events) {
    if (e.type !== 'StoryletScheduled') continue;
    const title = STORYLETS.find((s) => s.id === e.scheduledStoryletId)?.title;
    parts.push(title ? `a lead opened: ${title}` : 'a lead opened');
  }
  return `${parts.join(' · ')}.`;
}

// ---- T-1404 Hangout & lending pane (display-only) ------------------------
//
// The Hangout pane is a pure CLIENT of the engine's T-1303 `VisitHangout` venues
// and the T-1304 Penny Wise lending state. Every number it shows is read from the
// SAME source the engine gates on: the `hasHangout` flag `day.ts` blocks on, the
// wager/loan CONTENT constants the resolver clamps to, the live `player.loan`
// fields the engine writes, and the rumor lines the engine's own pure
// `hangoutRumors` synthesizes. Nothing here re-derives a rule — in particular the
// loan accrual (`ceil(principal * rate)`) is NEVER recomputed in the UI; the
// schedule is shown from raw constants and the realized interest reads off state.

/** True when the current system hosts a Hangout — the EXACT predicate `day.ts`
 *  gates `VisitHangout` on (`STAR_SYSTEMS[id].hasHangout === true`). Reader: the
 *  cockpit's Hangout launcher button + the pane mount, so the pane is offered
 *  only where the engine says a Hangout exists. */
export function hangoutOpen(game: GameState): boolean {
  return STAR_SYSTEMS[game.player.currentSystemId]?.hasHangout === true;
}

/** One present-NPC row for the Hangout — an NPC whose SIMULATED position is the
 *  player's current system (the same "actually in-system" set the Dare resolver
 *  requires an opponent to be in). Disposition rides along as a hint. Reader: the
 *  pane's present-NPC list / Dare opponent picker. */
export interface HangoutNpc {
  id: string;
  name: string;
  disposition: number;
}

export function hangoutNpcs(game: GameState): HangoutNpc[] {
  const here = game.player.currentSystemId;
  // T-120 · the house's own order. `rankClientele` (engine) REORDERS the live
  // in-system set by the port's authored `clientele` — regulars first, then the
  // preferred archetypes, then everyone else, each bucket keeping its incoming
  // order. It never adds an NPC, so the pane still lists exactly the captains the
  // Dare resolver will accept as an opponent. Under Sun-3's default (empty)
  // clientele it is the identity and this list is unchanged.
  //
  // T-132 (F-101-5) · `!n.dead` is load-bearing, not defensive. `rankClientele`'s
  // own contract states that the CALLER passes the already-filtered live,
  // in-system, NON-DEAD set, and the engine's opponent resolution
  // (`actions/hangout.ts`) filters `!n.dead` before matching `opponentId` — so a
  // dead captain listed here was a button that could only ever return
  // `no-opponent`. This caller was the one violating the contract.
  const present = game.npcs.filter((n) => !n.dead && n.currentSystemId === here);
  return rankClientele(game, here, present).map((n) => ({
    id: n.id,
    name: n.name,
    disposition: n.disposition,
  }));
}

/**
 * T-145 · One row of the house's OWN table — a fixed Liar's Dice roster opponent
 * (`docs/LIARS-DICE-PROGRESSION_SPEC.md` §8 row 46a).
 *
 * A PARALLEL PROJECTION beside {@link hangoutNpcs}, never a replacement:
 * `hangoutNpcs` is unchanged, and the picker renders the two pools as two visually
 * separated sections. This row is how "all 42 opponents are reachable through the
 * real UI at their authored port" is actually satisfied.
 */
export interface HangoutRosterOpponent {
  id: string;
  name: string;
  /** In `player.liarsDiceBeaten` — the captain has already taken a hand off them.
   *  A rematch is perfectly legal and pays normally; it simply records nothing. */
  beaten: boolean;
  /** The LIVE purse (`GameState.liarsDicePurses`), not the authored bankroll. */
  purse: number;
  /** Purse <= 0. The engine refuses the sit-down with
   *  `HangoutEvent{failReason:'opponent-broke'}` (§7.4), so the pane disables the
   *  row rather than offering a button that can only fail. They never regenerate —
   *  see the theorem at the refusal site for why that cannot lock an achievement. */
  broke: boolean;
  /**
   * T-146 · The "Read the Table" line for this seat, present only at unlock
   * tier ≥ 3 (§8 row 46b).
   *
   * **UNDEFINED ON A `'mixed'` ROW, DELIBERATELY, AND THAT IS A RULING** (§4.5
   * ruling 1): a mix is resolved to a concrete arm at OPEN, so before the hand
   * exists there is no resolved arm and therefore no honest read. The pane renders
   * nothing (the `roomLine` convention — never a placeholder), and the mixed
   * opponent's real read arrives at open on `DareHandStarted.opponentRead`.
   * Mapping mixed to the `random` line here would be the pane inventing a read the
   * engine never made.
   */
  read?: string;
}

/**
 * T-146 · THE ONE LIVE-TIER READ IN THIS PACKAGE (§4.6). Both of its callers are
 * PRE-HAND projections — the stake input and the opponent picker — which is
 * exactly what makes a live read legitimate here: there is no hand yet to read a
 * frozen field off. Every reader that HAS a hand reads the hand's frozen fields.
 *
 * Kept as one function so `liarsDiceTier` has exactly two call sites in the whole
 * repo (this and `actions/hangout.ts`'s open arm), which is the invariant §4.6
 * states and the one a reviewer greps for.
 */
function preHandTier(game: GameState): number {
  return liarsDiceTier(game.player.liarsDiceGamesPlayed);
}

export function hangoutRosterOpponents(game: GameState): HangoutRosterOpponent[] {
  const beaten = new Set(game.player.liarsDiceBeaten);
  const readUnlocked = preHandTier(game) >= 3;
  // In authored SEAT ORDER, straight off the engine's accessor — pool A has no
  // `currentSystemId` and takes no part in the roam, so there is nothing to filter
  // and no `rankClientele` to apply. The house's three are always at the house.
  return liarsDiceOpponentsAt(game.player.currentSystemId).map((opponent) => {
    const purse = game.liarsDicePurses[opponent.id] ?? 0;
    return {
      id: opponent.id,
      name: opponent.name,
      beaten: beaten.has(opponent.id),
      purse,
      broke: purse <= 0,
      // A 'mixed' row has no resolved arm before the hand exists — see `read`'s
      // own note. `undefined` here, and the pane renders nothing.
      ...(readUnlocked && opponent.archetype !== 'mixed'
        ? { read: readTheTableLine('roster', opponent.archetype) }
        : {}),
    };
  });
}

/** The rumor-table lines — a pure pass-through to the engine's own exported
 *  `hangoutRumors` (synthesized from live NPC state). The UI never re-synthesizes
 *  gossip; it renders exactly what the engine produces. Reader: the pane's rumor
 *  table. */
export function hangoutRumorLines(game: GameState): string[] {
  return hangoutRumors(game);
}

/** The Dare wager band — the same bounds the engine clamps a requested wager into.
 *  T-120: the band is the PORT's, so a high table and a dockside room show
 *  different limits; the UI reads the engine's accessor rather than a bare
 *  constant. T-146: that accessor is now `effectiveWagerBand`, which layers the
 *  live unlock tier over the port's authored band — this file no longer imports
 *  `wagerBandFor` at all, because a raw port band is never the right answer here.
 *  Reader: the pane's wager input + its label. */
export interface DareWagerBounds {
  min: number;
  /** T-146 · `null` at unlock tier 5 — the band clamp is removed at both ends and
   *  there is NO ceiling to render. The pane must branch on this rather than print
   *  a blank number. The solvency clamp still applies; it is simply not a *band*. */
  max: number | null;
}

/**
 * T-146 · THE SECOND AND LAST LEGITIMATE `liarsDiceTier` CALL SITE IN THE REPO
 * (`docs/LIARS-DICE-PROGRESSION_SPEC.md` §4.6, §8 row 51). Every other reader with
 * a hand reads the hand's FROZEN `bandMax`; this one is legitimate precisely
 * because there is no hand yet — the player is choosing a stake before the hand
 * exists, so there is no frozen field to read off. A THIRD CALL SITE IS A BUG.
 *
 * DISPLAY ONLY. It decides nothing: the engine re-clamps the requested wager at
 * open, against this same effective band AND against both sides' live credits.
 */
export function dareWagerBounds(game: GameState): DareWagerBounds {
  return effectiveWagerBand(game.player.currentSystemId, preHandTier(game));
}

// ---- T-136 · THE LIAR'S DICE FOG PROJECTION ------------------------------
//
// THE PROBLEM THIS SOLVES, STATED PLAINLY. The engine keeps the dealer's four
// dice out of every event (`DareHandStarted` carries `playerDice` only;
// `DareHandResolved` carries `dealerDice` on the two CHALLENGE outcomes and on
// no other — `docs/LIARS-DICE_REDESIGN.md` §10.2). But `game.dareHand.dealerDice`
// is right there in the client's own state, one property access from any JSX in
// `App.tsx`. A rendering HABIT ("don't read that field") is not a discipline; the
// next person to touch the pane cannot see it, and no test can fail on it.
//
// So the discipline is STRUCTURAL. `DareSceneView` — the ONLY thing the live
// scene component is given — HAS NO `dealerDice` FIELD. It carries a COUNT, never
// values. A projection that cannot express the dealer's hand cannot leak it, and
// `__tests__/liars-dice-pane.test.ts` proves the point the only way it can be
// proved: it varies `dealerDice` across three different hands and asserts the
// projection is deep-equal every time.
//
// Nothing here re-derives a rule. `legalMoves` is the engine's own
// `legalDareMoves` verbatim (no UI-side filtering — a pane that decided legality
// would be the same violation the standing constraints ban in `packages/content`),
// `playerHeadroom` is `headroomFor`, and the ante/pots are the stored escrow the
// resolver wrote.

/**
 * The live hand, as the PLAYER may see it. One peeked die is the single legal
 * leak (§8.3) and is marked as such; everything else about the dealer's hand is a
 * count.
 */
export interface DareSceneView {
  handId: string;
  dealerId: string;
  dealerName: string;
  /** PUBLIC — the player's own four dice, in roll order (never sorted: a sorted
   *  hand is a different hand to look at). */
  playerDice: number[];
  /** A COUNT, never values. This field is the whole point of the projection.
   *  T-146 · already `hand.dealerDice.length`, so it is length-agnostic and needed
   *  no ladder edit — confirmed, not changed (§8 row 49's confirm half). */
  dealerDieCount: number;
  /** T-146 · The hand's FROZEN claim ceiling (`2 × dicePerSide`), so the pane's
   *  stepper clamp and its `data-max` come off the HAND rather than the tier-0
   *  `DARE_MAX_QUANTITY` constant (§8 rows 43, 45). The pane still decides no
   *  legality of its own — it asks the engine's `isLatticeMove` with this. */
  maxQuantity: number;
  /** The ONE dealer die a successful Peek revealed (§8.3), or null. */
  peeked: { index: number; value: number } | null;
  bid: DareBid | null;
  bidder: 'player' | 'dealer' | null;
  seedWager: number;
  ante: number;
  /** ESCROW already debited from each side (§2.4) — money that exists, not a promise. */
  potPlayer: number;
  potDealer: number;
  /** `headroomFor(hand, 'player')` — how much more the player may stake this hand. */
  playerHeadroom: number;
  history: DareBidEntry[];
  /** `legalDareMoves(hand, 'player', credits)`, verbatim. */
  legalMoves: DareMoveKind[];
  /** The port's Peek DC — DISPLAY ONLY; the engine rolls it. */
  peekDc: number;
  /** T-145 · Which pool the counterparty came from, straight off the hand. */
  opponentKind: 'roaming' | 'roster';
  /** T-145 · The roster opponent's authored TABLE TALK, shown at the table for the
   *  life of the hand. `null` on a roaming hand — pool B has no authored lines. */
  tableTalk: string | null;
  /**
   * T-146 · "READ THE TABLE" (§4.5, §8 row 47) — the line the ENGINE put on this
   * hand's `DareHandStarted`, or `null` when the hand opened below unlock tier 3.
   *
   * READ OFF `state.eventLog`, NOT RE-DERIVED. The pane owns no rule here: it does
   * not know the thresholds, does not call `liarsDiceTier`, and cannot map an
   * archetype or a GUILE to a line — it renders the string the engine already
   * emitted, keyed on this hand's own `handId`.
   *
   * WHY NOT THE STORE'S `dareBeats`, which also carry the event: the scene's beat
   * effect calls `clearDareBeats()` on its very first run whenever the dealer has
   * not answered — which is exactly the state at open — so a beat-sourced read
   * would render for one paint and vanish. The event log is append-only and
   * survives a reload, so the read is stable for the life of the hand, in the same
   * way `tableTalk` above is.
   */
  opponentRead: string | null;
}

/** T-146 · This hand's "Read the Table" line, straight off the `DareHandStarted`
 *  the engine emitted for it. Scanned from the tail because the log is
 *  append-only and the newest matching hand is the live one. */
function dareOpponentRead(game: GameState, handId: string): string | null {
  for (let i = game.eventLog.length - 1; i >= 0; i -= 1) {
    const event = game.eventLog[i];
    if (event.type === 'DareHandStarted' && event.handId === handId) {
      return event.opponentRead ?? null;
    }
  }
  return null;
}

export function dareScene(game: GameState): DareSceneView | null {
  const hand = game.dareHand;
  if (!hand) return null;
  // T-145 · THE NAME MUST BE RESOLVED BY POOL. `game.npcs.find(...)` returns
  // undefined for every roster hand — pool A has no `NpcState` at all — so the
  // shipped fallback rendered the raw id (`ld-5-2`) at the table. Resolved through
  // the engine's own `liarsDiceOpponentFor`, the same way this file already calls
  // `wagerBandFor` / `headroomFor` rather than re-deriving them.
  const roster =
    hand.opponentKind === 'roster' ? liarsDiceOpponentFor(hand.systemId, hand.dealerId) : undefined;
  const dealer = roster ?? game.npcs.find((n) => n.id === hand.dealerId);
  return {
    handId: hand.id,
    dealerId: hand.dealerId,
    dealerName: dealer?.name ?? hand.dealerId,
    opponentKind: hand.opponentKind,
    tableTalk: roster?.lines.tableTalk ?? null,
    opponentRead: dareOpponentRead(game, hand.id),
    playerDice: [...hand.playerDice],
    // `.length`, deliberately. Never a value, never a map over the array.
    dealerDieCount: hand.dealerDice.length,
    maxQuantity: hand.maxQuantity,
    peeked: hand.peekedDealerDie ? { ...hand.peekedDealerDie } : null,
    bid: hand.bid ? { ...hand.bid } : null,
    bidder: hand.bidder,
    seedWager: hand.seedWager,
    ante: hand.ante,
    potPlayer: hand.potPlayer,
    potDealer: hand.potDealer,
    playerHeadroom: headroomFor(hand, 'player'),
    history: hand.history.map((h) => ({ ...h })),
    legalMoves: legalDareMoves(hand, 'player', game.player.credits),
    peekDc: venueParamsFor(hand.systemId, 'dare').dc,
  };
}

/**
 * The SETTLED frame, built from the action's `DareHandResolved` event and NEVER
 * recomputed — the same discipline `combatAftermathSummary` / `explorationOutcome`
 * keep. This is the ONE place the dealer's dice may reach the DOM, and they reach
 * it only because the ENGINE put them on the event.
 *
 * `dealerDice` is `undefined` on the event for BOTH fold arms (§6.1 — a fold never
 * reveals, and the player never learns whether the call would have been correct).
 * That is carried through as `null`; there is deliberately no fallback to
 * `game.dareHand`, which is null by then anyway and whose values would be exactly
 * the leak the event shape exists to prevent.
 */
export interface DareRevealView {
  outcome: DareOutcome;
  bid: DareBid | null;
  /** The claimed face's true count across all eight dice — challenge outcomes only. */
  actualCount: number | null;
  playerDice: number[];
  /** null on BOTH fold arms. */
  dealerDice: number[] | null;
  creditsDelta: number;
  /** T-145 · legitimately 0 on EVERY roster hand — pool A is outside the NPC
   *  economy, so there is no disposition to move (§7.6). The pane already renders
   *  a zero as an honest nothing, so this needs no new branch and gets none. */
  dispositionDelta: number;
  dealerName: string;
  /** T-145 · The roster opponent's authored line for how the hand ended — their
   *  `lines.win` when they won, `lines.lose` when they lost. `null` on a roaming
   *  hand. Taken off the EVENT, never re-derived; the engine picked the arm. */
  opponentLine: string | null;
}

export function dareRevealFrom(events: GameEvent[], game: GameState): DareRevealView | null {
  const resolved = events.find(
    (e): e is Extract<GameEvent, { type: 'DareHandResolved' }> => e.type === 'DareHandResolved',
  );
  if (!resolved) return null;
  // T-145 · the same by-pool name resolution as `dareScene`, off the event's
  // `opponentId`. `game.dareHand` is null by the time this runs, so the systemId
  // comes from the player's current port — which is the hand's port by
  // construction: a hand can only settle where it was opened (a `VisitHangout` is
  // the only opener, `Travel` is refused while a hand stands, and the dusk
  // timeout-fold settles before any move).
  const roster = liarsDiceOpponentFor(game.player.currentSystemId, resolved.opponentId);
  const dealer = roster ?? game.npcs.find((n) => n.id === resolved.opponentId);
  return {
    outcome: resolved.outcome,
    bid: resolved.bid ? { ...resolved.bid } : null,
    actualCount: resolved.actualCount ?? null,
    playerDice: [...resolved.playerDice],
    dealerDice: resolved.dealerDice ? [...resolved.dealerDice] : null,
    creditsDelta: resolved.creditsDelta,
    dispositionDelta: resolved.dispositionDelta,
    dealerName: dealer?.name ?? resolved.opponentId,
    opponentLine: resolved.opponentLine ?? null,
  };
}

/**
 * T-132 (F-101-6) · The house's AUTHORED voice at the current port — the
 * `HangoutProse` block every one of the fourteen rows carries and which, until
 * this task, had no reader anywhere in the UI: the pane header was the literal
 * "Spacers Hangout · {system}" and the room lines and per-venue flavour rendered
 * nowhere at all.
 *
 * Read through the engine's own `portHangoutFor`, which resolves a rowless port to
 * `DEFAULT_PORT_HANGOUT` wearing that id — so the generic house is the ENGINE's
 * fallback, not a UI restatement of one. `DEFAULT_PORT_HANGOUT` is deliberately
 * NOT imported here and `flavour` is deliberately NOT `??`-chained into it: the
 * default row's `flavour` is `{}`, and reaching for it would be the pane redoing a
 * resolution the accessor already did.
 *
 * `roomLine` is optional on a row: absent ⇒ null ⇒ the pane renders NOTHING extra,
 * never a placeholder. READER: the Hangout pane's header, its standing room line,
 * and the flavour line beside each venue's controls.
 */
export interface HangoutHouse {
  houseName: string;
  tone: HangoutTone;
  roomLine: string | null;
  flavour: Partial<Record<HangoutVenueId, string>>;
}

export function hangoutHouse(game: GameState): HangoutHouse {
  const prose = portHangoutFor(game.player.currentSystemId).prose;
  return {
    houseName: prose.houseName,
    tone: prose.tone,
    roomLine: prose.roomLine ?? null,
    flavour: prose.flavour,
  };
}

/**
 * T-132 (F-123-1) · Does this port run this venue? A pure pass-through to the
 * engine's `venueOffered` — the SAME predicate `resolveVisitHangout` refuses on
 * with a typed `'venue-not-offered'` and that `sim/protocol.ts` filters its legal
 * actions with. The pane can therefore never advertise an affordance the engine
 * would refuse: a garrison with no credit desk shows no desk, a hall that seats no
 * stranger offers no introduction. READER: the pane's per-venue control gating
 * (the three social venues and Penny Wise's desk).
 */
export function hangoutVenueOffered(game: GameState, venue: HangoutVenueId): boolean {
  return venueOffered(game.player.currentSystemId, venue);
}

/**
 * Penny Wise's up-front lending terms — what the engine will advance against:
 * the principal band, the per-dusk rate and the term. Shown BEFORE a loan is
 * taken so the schedule is visible up front ("dice are honest" applied to money).
 * `ratePercent` is `LOAN_DAILY_RATE * 100` — a pure format of the rate constant,
 * NOT an accrual computation (the engine still computes the realized
 * `ceil(principal * rate)` interest each dusk).
 *
 * T-133 (owner ruling D7) · THE BAND IS NOW THE PORT'S, read through the engine's
 * `loanBandFor` — the SAME accessor `resolveVisitHangout`'s `borrow` arm clamps
 * with — exactly as `dareWagerBounds` reads the engine's own band accessor. The garrison mess
 * fronts a soldier a month's wages and the home hall fronts a hull, and the pane
 * says so without a per-port branch of its own. The RATE, the TERM and the LENDER
 * stay global constants, because D7 narrowed ruling 5 rather than repealing it:
 * one lender of record, one schedule, a per-port depth.
 *
 * Reader: the pane's Penny Wise desk terms line and its principal input bounds.
 */
export interface LendingTerms {
  lenderId: string;
  minPrincipal: number;
  maxPrincipal: number;
  ratePercent: number;
  termDays: number;
}

export function lendingTerms(game: GameState): LendingTerms {
  const band = loanBandFor(game.player.currentSystemId);
  return {
    lenderId: LENDER_ID,
    minPrincipal: band.min,
    maxPrincipal: band.max,
    ratePercent: LOAN_DAILY_RATE * 100,
    termDays: LOAN_TERM_DAYS,
  };
}

// ---- T-1405 progression, property & smuggling surfaces (display-only) -----
//
// The dawn-hand modifiers, crew roster, port ledger and contraband-hold badge are
// pure CLIENTS of the T-1305 patrol / T-1306 dice-progression / T-1307 port
// mechanics. Every number reads a content constant or an engine export
// (`dawnDiceModifiers`, `quotePort`, `crewCapacity`, `isCarryingContraband` /
// `isCarryingIllicit`) — the same source the resolvers gate on. Nothing here
// re-derives a rule (income, floor, hire price, capacity all come from
// engine/content); the UI only projects them onto the pane.

/** The resolved dawn-hand parameters — crew-granted hand size / floor / per-day
 *  reroll grant (from the SAME `dawnDiceModifiers` aggregator `startDay` uses to
 *  deal the hand) merged with the LIVE remaining reroll charges off the dealt
 *  hand. T-1601c: it also passes the SAME equipment leg (`equipmentDiceBenefits`
 *  off the ship's fitted modules) that `startDay` does, so the badges a player
 *  reads can never disagree with the hand the engine dealt. T-112: THIS FUNCTION
 *  NEEDED NO CHANGE for the explore modules to surface — `equipmentDiceBenefits`
 *  grew the module leg internally, so a fitted module's floor/reroll/extra-die
 *  badge appears the moment the item is granted. The YARD's table still ships
 *  empty; the module table does not. A pure read. READER: the HandDock floor badge
 *  + reroll count + per-die reroll affordance. */
export interface DawnHandModifiers {
  handSize: number;
  floor: number;
  rerolls: number;
  rerollsRemaining: number;
}

export function dawnHandModifiers(game: GameState): DawnHandModifiers {
  const mods = dawnDiceModifiers(game.player.crew, equipmentDiceBenefits(game.player.ship));
  return {
    handSize: mods.handSize,
    floor: mods.floor,
    rerolls: mods.rerolls,
    rerollsRemaining: game.player.dawnHand?.rerollsRemaining ?? 0,
  };
}

/** The one-word label for ANY `DiceBenefit`, read straight off its content
 *  discriminant — never a UI-invented effect. T-112 extracted this from
 *  `crewBenefitLabel` unchanged (same three strings) because crew and
 *  explore-granted modules share one benefit vocabulary and must therefore read
 *  the same in the cockpit. READERS: `crewBenefitLabel` (the crew pane) and
 *  `fittedModuleRows` (the ship pane's salvaged fittings). */
export function diceBenefitLabel(benefit: DiceBenefit): string {
  switch (benefit.kind) {
    case 'extra-die':
      return '+1 die';
    case 'reroll':
      return 'one re-roll/day';
    case 'floor':
      return `floor ${benefit.floor}`;
  }
}

/** The one-word benefit label for a crew role, read straight off its content
 *  `benefit` discriminant — never a UI-invented effect. */
export function crewBenefitLabel(role: CrewRole): string {
  return diceBenefitLabel(role.benefit);
}

/** One explore-granted module currently fitted to the ship — its content name and
 *  the label for the dice benefit it grants. */
export interface FittedModuleRow {
  id: string;
  name: string;
  benefitLabel: string;
}

/**
 * T-112 · THE SALVAGED-FITTINGS READOUT (docs/EXPLORE_REDESIGN.md §4.4). Class B
 * must not be a silent buff: an item whose only evidence is a bigger hand is a
 * mystery, not a reward.
 *
 * Reads the ENGINE's own predicate (`hasExploreModule`) against the SAME content
 * table `equipmentDiceBenefits` folds into the dawn hand
 * (`EXPLORE_MODULE_DICE_BENEFITS`), so this pane and the dealt hand cannot
 * disagree — the same discipline `dawnHandModifiers` keeps by calling the
 * aggregator `startDay` uses rather than re-deriving it. A pure read; the UI
 * invents no effect and no name.
 *
 * Iterates the CONTENT table, not the ship, so the rows come out in the shipped
 * order regardless of the order the player recovered them.
 */
export function fittedModuleRows(game: GameState): FittedModuleRow[] {
  const rows: FittedModuleRow[] = [];
  for (const module of EXPLORE_MODULES) {
    const id = module.id as ExploreModuleContentId;
    if (!hasExploreModule(game.player.ship, id)) continue;
    const benefit = EXPLORE_MODULE_DICE_BENEFITS[id];
    if (!benefit) continue;
    rows.push({ id: module.id, name: module.name, benefitLabel: diceBenefitLabel(benefit) });
  }
  return rows;
}

/** One hired crew member — its content role definition + the day it came aboard. */
export interface HiredCrewRow {
  role: CrewRole;
  hiredDay: number;
}

/** One hireable crew role — its definition plus affordability / berth state and a
 *  plain "here's why you can't hire" reason (mirrors quoteShipyard's reason style
 *  so the pane disables-not-hides). `canHire` folds every precondition (free berth
 *  AND the hire price) so the button gate is a single read. */
export interface HireableCrewRow {
  role: CrewRole;
  affordable: boolean;
  canHire: boolean;
  reason: string | null;
}

export interface CrewRoster {
  hired: HiredCrewRow[];
  hireable: HireableCrewRow[];
  /** Cabin berths (engine `crewCapacity`, the T-1205 cabin-strength socket). */
  berths: number;
  berthsUsed: number;
}

/**
 * The crew roster for the ship pane: which roles are aboard, which are hireable
 * (each with a disabled-reason), and the berth budget. `berths` is the engine's
 * `crewCapacity` (cabin strength → berths); a hire is gated on a free berth AND
 * the hire price — the SAME order `resolveCrew` checks — so the pane never enables
 * a hire the engine would refuse. READER: ShipPane crew section.
 */
export function crewRoster(game: GameState): CrewRoster {
  const crew = game.player.crew;
  const berths = crewCapacity(game.player.ship);
  const berthsUsed = crew.length;
  const hiredIds = new Set(crew.map((m) => m.roleId));
  const hired: HiredCrewRow[] = crew
    .map((m) => ({ role: CREW_BY_ID[m.roleId], hiredDay: m.hiredDay }))
    .filter((r): r is HiredCrewRow => r.role != null);
  const hireable: HireableCrewRow[] = CREW_ROLES.filter((role) => !hiredIds.has(role.id)).map(
    (role) => {
      const affordable = game.player.credits >= role.hirePrice;
      const hasBerth = berthsUsed < berths;
      let reason: string | null = null;
      if (!hasBerth) reason = 'No free cabin berth — upgrade the cabin';
      else if (!affordable)
        reason = `Need ${role.hirePrice.toLocaleString()}cr, have ${game.player.credits.toLocaleString()}cr`;
      return { role, affordable, canHire: hasBerth && affordable, reason };
    },
  );
  return { hired, hireable, berths, berthsUsed };
}

/** The current-system port stake (name + live `quotePort` buy preview), or null
 *  when the player stands in a non-purchasable (rim) system. */
export interface PortLedgerCurrent {
  systemId: number;
  name: string;
  quote: PortQuote;
}

/** One owned port stake — its per-dusk income (era-modulated, straight off
 *  `quotePort`) and the day it was bought. */
export interface OwnedPortRow {
  systemId: number;
  name: string;
  income: number;
  purchaseDay: number;
}

export interface PortLedger {
  current: PortLedgerCurrent | null;
  owned: OwnedPortRow[];
  /** Sum of the owned stakes' per-dusk incomes — the "watch income tick at dusk"
   *  figure the ledger surfaces. */
  totalDuskIncome: number;
}

/**
 * The port-authority ledger for the trade pane: the buy preview for the port the
 * player stands in (via `quotePort`, so the price / income / disabled-reason can
 * never disagree with the real purchase), plus every owned stake with its
 * era-modulated per-dusk income. Every number reads content (`baseDuskIncome`,
 * `purchasePrice`) through the engine — never recomputed here. READER: the
 * TradePane PORT AUTHORITY block + its income ledger.
 */
export function portLedger(game: GameState): PortLedger {
  const here = game.player.currentSystemId;
  const current: PortLedgerCurrent | null = isPurchasablePort(here)
    ? {
        systemId: here,
        name: PURCHASABLE_PORTS_BY_SYSTEM[here].name,
        quote: quotePort(game, here),
      }
    : null;
  const owned: OwnedPortRow[] = game.player.ports.map((port) => {
    const def = PURCHASABLE_PORTS_BY_SYSTEM[port.systemId];
    return {
      systemId: port.systemId,
      name: def?.name ?? `System-${port.systemId} Port Authority`,
      income: quotePort(game, port.systemId).income,
      purchaseDay: port.purchaseDay,
    };
  });
  const totalDuskIncome = owned.reduce((sum, o) => sum + o.income, 0);
  return { current, owned, totalDuskIncome };
}

/** Translate the engine's typed `PortEventFailReason` (also the `quotePort`
 *  failure set) into a one-line "disabled, here's why" reason for the buy button.
 *  Pure display translation — re-derives no rule. Every reason maps. */
export function portFailureExplanation(failure: PortEventFailReason): string {
  switch (failure) {
    case 'not-at-port':
      return 'Dock here to buy this authority';
    case 'not-purchasable':
      return 'No port authority for sale here';
    case 'already-owned':
      return 'You already hold this stake';
    case 'insufficient-credits':
      return 'Not enough credits';
    case 'no-die':
    case 'invalid-die-index':
    case 'die-already-spent':
      return 'Assign a die';
  }
}

/**
 * T-131 · Translate the engine's typed `ExplorationFailReason` into an honest
 * visible notice — this project's "typed fails render as notices, never silence"
 * rule. Pure display translation; re-derives no rule.
 *
 * EXHAUSTIVE BY COMPILATION, exactly as `portFailureExplanation` above is: no
 * `default`, no trailing `return`, so an eighth reason added to the union fails
 * `tsc` here ("function lacks ending return statement") until it is given a line.
 * That is the mechanical half of closing the hole this task found — the UI's
 * `explorationFailNoticeFrom` (store.ts) switched on the reason INLINE, handled
 * five of the six shipped reasons, and fell through to `null` on the sixth, so
 * `recovery-in-progress` had rendered as silence since T-111 despite the
 * docstring claiming full coverage. Extracting it here makes that class of bug a
 * compile error rather than a review catch, and testable without importing the
 * store (`store.ts` runs `init()` at module load).
 */
export function explorationFailExplanation(reason: ExplorationFailReason): string {
  switch (reason) {
    case 'insufficient-fuel':
      return 'Not enough fuel to reach an off-lane target.';
    case 'nav-check':
      return 'The sweep turned up nothing but static.';
    case 'no-die':
    case 'invalid-die-index':
    case 'die-already-spent':
      return 'That sweep needs a fresh die from the hand.';
    // T-131 · the two that used to be silence, and the one this task adds.
    case 'recovery-in-progress':
      return 'The crew is holding station on a salvage op — no hands free for a sweep.';
    case 'insufficient-dice':
      return 'Charted it, but the hand was too thin to lift it — the find was left behind.';
  }
}

/**
 * T-132 · The two Hangout fail unions, DERIVED FROM THE EVENT SHAPES rather than
 * imported as named engine types — on purpose. `packages/engine/src/types.ts` is a
 * hashed rule source (`packages/sim/src/balance/rules-fingerprint.ts`: "types.ts is
 * IN"), so naming these unions there would move `rulesFingerprint` and owe a
 * capstone sweep for a UI-only change. `Extract` gives the same compile-time
 * exhaustiveness at zero fingerprint cost, and still fails `tsc` the moment the
 * engine adds a reason.
 */
type HangoutFailReason = NonNullable<Extract<GameEvent, { type: 'HangoutEvent' }>['failReason']>;
type LoanFailReason = NonNullable<Extract<GameEvent, { type: 'LoanEvent' }>['failReason']>;

/**
 * T-132 · Translate the engine's typed `HangoutEvent` fail into an honest visible
 * notice — this project's "typed fails render as notices, never silence" rule.
 * Pure display translation; re-derives no rule.
 *
 * EXHAUSTIVE BY COMPILATION, the T-131 mechanism: no `default`, no trailing
 * `return`, so a sixth reason fails `tsc` here until it is given a line. The hole
 * this closes (F-123-1): the store's old inline switch covered four of the five
 * shipped reasons and fell through to `null` on `'venue-not-offered'` — a port
 * that runs no such venue refused the action and the pane said NOTHING.
 */
export function hangoutFailExplanation(reason: HangoutFailReason): string {
  switch (reason) {
    case 'no-opponent':
      return 'That spacer has left the tables — no one here to wager against.';
    case 'no-die':
    case 'invalid-die-index':
    case 'die-already-spent':
      return 'That table needs a fresh die from the hand.';
    // T-132 · the reason that used to be silence.
    case 'venue-not-offered':
      return 'No one here takes that kind of wager.';
    // T-135 · the three Liar's Dice gates. The scene's own pane is T-136's; these
    // lines exist because the mechanism above makes a new reason a BUILD FAILURE
    // until it is answered, and inheriting a plausible-sounding wrong line is
    // exactly what it was built to prevent.
    case 'dare-hand-open':
      return 'You already have a hand on the table — finish it first.';
    case 'no-dare-hand':
      return 'There is no hand on the table to play.';
    case 'illegal-dare-move':
      return 'The house will not take that call.';
    // T-145 · the roster's broke rule. They are cleaned out and will not sit; the
    // purse never regenerates, so the line says "tonight" rather than promising a
    // return the engine cannot make.
    case 'opponent-broke':
      return 'They are cleaned out — that seat will not take a wager.';
  }
}

/**
 * T-132 · Translate a Penny Wise `LoanEvent{kind:'failed'}` refusal into an honest
 * visible notice. Same exhaustive-by-compilation mechanism as its Hangout sibling
 * above; the old inline switch had a `default` arm, which is why this one was never
 * silent — but that arm answered `'venue-not-offered'` with "Penny Wise turned that
 * request down", implying a REFUSAL where the truth is an ABSENT DESK (F-123-1).
 * A `default` is not reinstated here: the whole point is that a new reason must
 * fail the build rather than inherit a plausible-sounding wrong line.
 */
export function loanFailExplanation(reason: LoanFailReason): string {
  switch (reason) {
    case 'already-has-loan':
      return 'You already carry a loan with Penny Wise — clear it before borrowing again.';
    case 'no-loan':
      return 'No loan to repay.';
    case 'insufficient-credits':
      return 'Not enough credits to make that payment.';
    case 'no-die':
    case 'invalid-die-index':
    case 'die-already-spent':
      return "Penny Wise's desk needs a fresh die from the hand.";
    // T-132 · the reason the old `default` arm answered misleadingly.
    case 'venue-not-offered':
      return 'There is no credit desk in this room.';
  }
}

/** The contraband-hold badge state — whether the ship is carrying illicit cargo
 *  and from which source(s). Reads the SAME `isCarryingContraband` / illicit-pod
 *  flag the T-1305 patrol scan gates on, so the badge shows exactly when a patrol
 *  would scan. READER: the TradePane hold badge. */
export interface ContrabandHold {
  carrying: boolean;
  source: 'contract' | 'pod' | 'both' | null;
}

export function contrabandHold(game: GameState): ContrabandHold {
  const contract = isCarryingContraband(game);
  const pod = game.flags['signal.contraband.carrying'] === true;
  let source: ContrabandHold['source'] = null;
  if (contract && pod) source = 'both';
  else if (contract) source = 'contract';
  else if (pod) source = 'pod';
  return { carrying: isCarryingIllicit(game), source };
}

/** A system placed on the SVG plane: raw coordinates plus projected (viewBox)
 *  screen coordinates. */
export interface ProjectedNode {
  id: number;
  name: string;
  isRim: boolean;
  x: number;
  y: number;
  sx: number;
  sy: number;
}

export interface StarmapProjection {
  /** SVG viewBox string sized to the displayed band. */
  viewBox: string;
  width: number;
  height: number;
  /** Distance-units → viewBox-units (uniform, so a distance circle stays round). */
  scale: number;
  nodes: ProjectedNode[];
  here: ProjectedNode | null;
  /** Fuel-range ring radius in distance units (from maxJumpDistance) … */
  ringUnits: number;
  /** … and in projected viewBox units. */
  ringRadius: number;
}

/**
 * Project the relevant band of systems onto an SVG plane. We do NOT fit all 28
 * systems: the Andromeda cluster sits at x up to 99 and would crush the core
 * lane into an unreadable sliver. Instead we render the core+rim lane (ids
 * 1–20) plus the current system and any charted system, then bound the box to
 * exactly that set. The scale is uniform so the fuel-range ring — a true
 * distance circle — is drawn round rather than sheared.
 *
 * T-1505b · ONE DELIBERATE EXCEPTION: NEMESIS (id 28) joins the band once
 * `nemesis.crossing.unlocked` is set. The band stretches only for the endgame,
 * and only after the stake is paid — before that the black hole is not on the
 * chart at all, so the map never advertises a door the player cannot open, and
 * the arc's terminus is never spoiled on day one. Andromeda (21–26) and MALIGNA
 * (27) are still never shown: the gate lift is NEMESIS-only (design call D1), so
 * showing them would offer six systems the engine would refuse. This is the UI
 * READER of the crossing flag; the other two are the engine gate (day.ts) and the
 * sim protocol's legalActions.
 */
export function starmapProjection(game: GameState): StarmapProjection {
  const here = game.player.currentSystemId;
  const visited = new Set(game.player.charts.visitedSystemIds);
  const crossingOpen = game.flags['nemesis.crossing.unlocked'] === true;
  const shown = new Map<number, (typeof STAR_SYSTEMS)[number]>();
  for (const sys of Object.values(STAR_SYSTEMS)) {
    if (
      (sys.id >= 1 && sys.id <= 20) ||
      sys.id === here ||
      visited.has(sys.id) ||
      (crossingOpen && sys.id === NEMESIS_SYSTEM_ID)
    ) {
      shown.set(sys.id, sys);
    }
  }
  const systems = [...shown.values()];
  const xs = systems.map((s) => s.coordinates.x);
  const ys = systems.map((s) => s.coordinates.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX;
  const spanY = maxY - minY;

  const pad = 8; // viewBox units of margin around the band
  const targetSpan = 220; // desired long-axis size in viewBox units
  const scale = targetSpan / Math.max(spanX, spanY, 1);

  const width = spanX * scale + pad * 2;
  // A pure lane (spanY 0) still needs vertical room for the node + label.
  const laneHeight = 64;
  const height = Math.max(spanY * scale, laneHeight) + pad * 2;
  const yOffset = spanY === 0 ? height / 2 : pad;

  const project = (sys: (typeof STAR_SYSTEMS)[number]): ProjectedNode => ({
    id: sys.id,
    name: sys.name,
    isRim: sys.isRim,
    x: sys.coordinates.x,
    y: sys.coordinates.y,
    sx: pad + (sys.coordinates.x - minX) * scale,
    sy: spanY === 0 ? yOffset : pad + (sys.coordinates.y - minY) * scale,
  });

  const nodes = systems.map(project);
  const hereSys = STAR_SYSTEMS[here];
  const ship = game.player.ship;
  const ringUnits = maxJumpDistance(ship.drives, ship.fuel, ship.hasTransWarpDrive ?? false);

  return {
    viewBox: `0 0 ${round(width)} ${round(height)}`,
    width,
    height,
    scale,
    nodes,
    here: hereSys ? project(hereSys) : null,
    ringUnits,
    ringRadius: ringUnits * scale,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Known-NPC pip counts per system. There is no `known` flag on engine state, so
 * this is a deliberate T-304-LOCAL definition (a full knownNpcIds set would be
 * engine scope, out of this task): a ship is "known" if the player has standing
 * with it (`disposition !== 0`) OR it is co-located in the player's current
 * system. Returns systemId → count of known ships there.
 */
export function knownNpcCounts(game: GameState): Map<number, number> {
  const here = game.player.currentSystemId;
  const counts = new Map<number, number>();
  for (const npc of game.npcs) {
    const known = npc.disposition !== 0 || npc.currentSystemId === here;
    if (!known) continue;
    counts.set(npc.currentSystemId, (counts.get(npc.currentSystemId) ?? 0) + 1);
  }
  return counts;
}

/** Human-readable wire lines, newest first, derived from the event log. */
export function wireLines(state: GameState, limit = 24): string[] {
  const lines: string[] = [];
  for (let i = state.eventLog.length - 1; i >= 0 && lines.length < limit; i--) {
    const line = eventToWire(state.eventLog[i]);
    if (line) lines.push(line);
  }
  return lines;
}

function eventToWire(e: GameEvent): string | null {
  switch (e.type) {
    case 'WireEntry':
      return e.message;
    case 'DeedEarned':
      return `DEED — ${e.title}: ${e.citation}`;
    case 'RenownRankUp':
      return `RENOWN — the spacer is now ${e.newRank}.`;
    case 'EraEventStarted':
      return `${e.name} — the ${systemName(e.affectedSystemIds[0] ?? 0)} region reprices.`;
    case 'EraEventEnded':
      return `The ${e.defId} event has passed; markets settle.`;
    case 'PoiDiscovered':
      return `Beacon return — ${e.name} logged off the lane.`;
    case 'ComponentDamaged':
      // T-1205: the wire is the reader of shields' mitigation. Junker hits (no
      // shields, `mitigated` 0/absent) stay silent to avoid ticker spam; a hit an
      // upgraded shield soaked is newsworthy. A full absorb reports amount 0.
      if ((e.mitigated ?? 0) <= 0) return null;
      return e.amount === 0
        ? `Shields held — absorbed a ${e.mitigated}-point hit to ${componentName(e.component).toLowerCase()}.`
        : `Shields bled off ${e.mitigated} of a hit to ${componentName(e.component).toLowerCase()}.`;
    case 'LifeSupportCritical':
      // T-1205: the wire is a reader of the lifeSupport survival check.
      return e.survived
        ? 'LIFE SUPPORT — critical failure ridden out on emergency air.'
        : 'LIFE SUPPORT — catastrophic failure; the ship was lost to the dark.';
    case 'NemesisCrossing':
      // T-1505b · The wire renders the REFUSAL only. The committed and crossed
      // beats already arrive as authored `WireEntry`s (content CROSSING_WIRE),
      // filed by the engine at the same moment — rendering them here too would
      // double every line. A refusal, though, is the one crossing beat the galaxy
      // never hears about: no escrow was opened and no flight plan was filed, so
      // the captain's own terminal is the only thing that logs it.
      return e.kind === 'stake-refused' ? `CROSSING — ${crossingRefusalText(e.reason)}` : null;
    default:
      return null;
  }
}

// ---- T-306 wire log (display-only) ---------------------------------------
//
// The browsable day-by-day log and the NPC mini-dossier are PRESENTATIONAL
// reads of state that already exists — `state.eventLog` (append-only, JSON
// round-tripped through the save envelope), `state.npcs`, and the authored
// content data `FLAWS` / `NPC_PROFILES`. Same charter as T-304/T-305: the UI
// invents no rule, mutates nothing, and never surfaces raw NPC stats.

export type WireLogKind = 'flaw-override' | 'deed' | 'renown' | 'era' | 'poi' | 'npc' | 'plain';

/** One rendered wire line, tagged with its source day, a cheap display kind and
 *  the originating `eventLog` index (a stable React key + virtualization id). */
export interface WireLogEntry {
  day: number;
  text: string;
  kind: WireLogKind;
  eventIndex: number;
}

/** A day's worth of wire lines, oldest day first for chronological reading. */
export interface WireLogDay {
  day: number;
  entries: WireLogEntry[];
}

function wireKind(e: GameEvent): WireLogKind {
  switch (e.type) {
    case 'DeedEarned':
      return 'deed';
    case 'RenownRankUp':
      return 'renown';
    case 'EraEventStarted':
    case 'EraEventEnded':
      return 'era';
    case 'PoiDiscovered':
      return 'poi';
    case 'WireEntry':
      // T-1402 · Read the engine-stamped `WireEntry.kind` (T-1401) instead of the
      // UI re-classifying the message by suffix-matching content FLAWS. The kind
      // ('flaw-override' | 'npc' | 'plain') is decided at emission; the UI owns no
      // rule here. Every WireEntryKind member is a valid WireLogKind.
      return e.kind;
    default:
      return 'plain';
  }
}

/**
 * Group the event log into a day-by-day wire log (oldest day first). Reuses the
 * ticker's `eventToWire` mapping for text — an event that produces no wire line
 * (returns null) is skipped, as is any event without a `day` (none of the wire
 * events lack one, but the guard keeps this honest). Pure derivation over the
 * existing snapshot; the full history rides along in a loaded save.
 */
export function wireLog(state: GameState): WireLogDay[] {
  const byDay = new Map<number, WireLogEntry[]>();
  for (let i = 0; i < state.eventLog.length; i++) {
    const e = state.eventLog[i];
    const text = eventToWire(e);
    if (text === null) continue;
    if (!('day' in e)) continue;
    const day = e.day;
    const entry: WireLogEntry = { day, text, kind: wireKind(e), eventIndex: i };
    const arr = byDay.get(day);
    if (arr) arr.push(entry);
    else byDay.set(day, [entry]);
  }
  return [...byDay.keys()].sort((a, b) => a - b).map((day) => ({ day, entries: byDay.get(day)! }));
}

/** NPC name → id, longest name first so a multi-word name wins over any name
 *  that is a substring of it when the renderer scans a wire line for links. */
export function npcNameIndex(state: GameState): { name: string; id: string }[] {
  return state.npcs
    .map((n) => ({ name: n.name, id: n.id }))
    .sort((a, b) => b.name.length - a.name.length);
}

/** A mini dossier: name, ship and prose HINTS only — never the raw stat block,
 *  flawDc or tier (PRD: "disposition hints — not raw stats"). */
export interface NpcDossier {
  name: string;
  shipName: string;
  location: string;
  standing: string;
  temperament: string;
}

/** Disposition rendered as a standing HINT, never the number. Checked in
 *  most-extreme-first order so the bands don't overlap. */
function dispositionHint(disposition: number): string {
  if (disposition < -2) return 'Wants you dead';
  if (disposition < 0) return 'Holds a grudge';
  if (disposition === 0) return 'No standing with you';
  if (disposition > 2) return 'Owes you goodwill';
  return 'Warming to you';
}

export function npcDossier(state: GameState, npcId: string): NpcDossier | null {
  const npc = state.npcs.find((n) => n.id === npcId);
  if (!npc) return null;
  const profile = NPC_PROFILES.find((p) => p.id === npc.profileId);
  if (!profile) return null;
  return {
    name: profile.name,
    shipName: profile.shipName,
    location: systemName(npc.currentSystemId),
    standing: dispositionHint(npc.disposition),
    // Prose temperament from authored bond + flaw — no numeric stat/flawDc/tier.
    temperament: `${profile.bond}. Said to be ${profile.flaw.toLowerCase()}.`,
  };
}

// ---- T-307 combat overlay (display-only) ---------------------------------
//
// Read-only projections of the engine's live `EncounterState` and of the events
// a Combat action returns. The overlay is a CLIENT of the combat rules exactly
// as the starmap is a client of travel: every balance number here is imported
// from `@spacerquest/content` (FIGHT/RUN fuel, tribute schedule), never
// hardcoded, and nothing recomputes a check — the honest roll is read straight
// off the engine's StatCheck via CheckBreakdown.

/** Human label for an anonymous interceptor's kind (display flavour only). */
const KIND_LABELS: Record<string, string> = {
  PIRATE: 'Pirate',
  PATROL: 'Patrol',
  RIM_PIRATE: 'Rim pirate',
  BRIGAND: 'Brigand',
  REPTILOID: 'Reptiloid',
};

export interface EncounterReadout {
  name: string;
  shipName: string;
  shipClass?: string;
  /** Deliberately surfaced here (task spec: "name/ship/tier"); the wire dossier
   *  never shows tier, but the instrument that decides whether to fire does. */
  tier: number;
  kindLabel: string;
  /** Prose known-history HINT — never a raw stat block. */
  history: string;
}

/**
 * The enemy readout: name, ship, tier and a prose history hint. For a named
 * interceptor the history reuses the same disposition-hint machinery as the
 * dossier plus a last-seen system and a count of prior wire mentions; an
 * anonymous raider has no record. Reads live `game.encounter`; returns null when
 * there is no active encounter.
 */
export function encounterReadout(game: GameState): EncounterReadout | null {
  const enc = game.encounter;
  if (!enc) return null;
  const int = enc.interceptor;
  let history: string;
  if (int.source === 'named') {
    const npc = game.npcs.find((n) => n.id === int.id);
    const mentions = countWireMentions(game, int.name);
    const parts = [dispositionHint(npc?.disposition ?? 0)];
    if (npc) parts.push(`Last known at ${systemName(npc.currentSystemId)}`);
    if (mentions > 0)
      parts.push(`${mentions} prior wire ${mentions === 1 ? 'mention' : 'mentions'}`);
    history = `${parts.join(' · ')}.`;
  } else {
    history = 'Unknown raider — no record on file.';
  }
  return {
    name: int.name,
    shipName: int.shipName,
    shipClass: int.shipClass,
    tier: int.tier,
    kindLabel: int.kind
      ? (KIND_LABELS[int.kind] ?? 'Raider')
      : int.source === 'named'
        ? 'Named'
        : 'Raider',
    history,
  };
}

/** Count of prior WireEntry lines that name this interceptor (read-only scan of
 *  the append-only event log — the same source the wire pane renders). */
function countWireMentions(game: GameState, name: string): number {
  let n = 0;
  for (const e of game.eventLog) {
    if (e.type === 'WireEntry' && e.message.includes(name)) n++;
  }
  return n;
}

export interface CombatFuelStatus {
  fuel: number;
  fightCost: number;
  runCost: number;
  canFight: boolean;
  canRun: boolean;
}

/**
 * The "can I afford to fire?" readout (the PRD's front-and-centre fuel budget).
 * Compares the ship's fuel against the imported FIGHT/RUN fuel costs. When
 * `canFight` is false the overlay raises the weapons-offline band — the fuel-gate
 * that the engine also enforces (a fight with fuel < FIGHT_FUEL_COST malfunctions).
 */
export function combatFuelStatus(game: GameState): CombatFuelStatus {
  const fuel = game.player.ship.fuel;
  return {
    fuel,
    fightCost: FIGHT_FUEL_COST,
    runCost: RUN_FUEL_COST,
    canFight: fuel >= FIGHT_FUEL_COST,
    canRun: fuel >= RUN_FUEL_COST,
  };
}

/**
 * PREVIEW of what a talk is likely to cost THIS round. T-1402 · Delegates to the
 * engine's own `tributeForRound`, forwarding the interceptor's CLASS so an
 * anonymous Brigand (÷2) / Reptiloid (×2) previews the exact demand the engine
 * charges — the old UI reimplementation ignored the class modifier and could
 * preview a tribute the engine never charges. Named interceptors pass `undefined`
 * (the unmodified ×1 schedule). The amount actually charged always comes from the
 * engine's `TributeDemanded`/`TributePaid` events, never from this number.
 *
 * T-1603c adds `tierGap` for exactly the same reason the class modifier was
 * forwarded in T-1402: the engine now scales the demand by how many tiers the
 * interceptor outranks the player (content `TRIBUTE_TIER_GAP_STEP`), so a preview
 * that ignored it would quote a number the engine never charges. The UI stays a
 * CLIENT of the engine rule — this function still owns no arithmetic of its own.
 */
export function tributeThisRound(
  round: number,
  kind?: AnonymousInterceptorKind,
  tierGap = 0,
): number {
  return tributeForRound(round, kind, tierGap);
}

export interface CombatAftermath {
  resolution: 'escaped' | 'talked-down' | 'defeated' | 'interceptor-fled' | 'interceptor-escaped';
  lines: string[];
}

const RESOLUTION_HEADLINE: Record<CombatAftermath['resolution'], string> = {
  escaped: 'Broke off — you slipped the net.',
  'talked-down': 'Talked down — tribute bought the lane.',
  defeated: 'Interceptor destroyed — the wreck drifts.',
  'interceptor-fled': 'Driven off — a friend cleared your tail.',
  // T-1207: the interceptor won its post-kill retreat roll — a miracle burn.
  'interceptor-escaped': 'Miracle burn — the interceptor slipped the kill.',
};

/**
 * Build the in-the-moment aftermath summary from the events a Combat (or dusk)
 * action returned. Returns null when the encounter did not resolve this action.
 * The same events also ride the wire (eventLog); this panel is just the cockpit
 * echo of that news the instant it lands.
 */
export function combatAftermathSummary(events: GameEvent[]): CombatAftermath | null {
  const resolved = events.find(
    (e): e is Extract<GameEvent, { type: 'EncounterResolved' }> => e.type === 'EncounterResolved',
  );
  if (!resolved) return null;
  const lines: string[] = [RESOLUTION_HEADLINE[resolved.resolution]];
  // T-1602b: the loop below deliberately has NO ShipLost / LegacySuccession
  // branch. The killing blow in `combat.ts` nulls the encounter and returns
  // WITHOUT emitting `EncounterResolved`, so this function has already returned
  // null by the time a death's events reach it — the two branches that used to
  // sit here were provably unreachable copy. A ship loss routes to
  // `successionSummary` below and renders in its own notice, not in this panel.
  for (const e of events) {
    if (e.type === 'TributePaid') {
      lines.push(
        `Paid ${e.amount.toLocaleString()}cr tribute — ${e.creditsRemaining.toLocaleString()}cr left.`,
      );
    } else if (
      e.type === 'CombatEvent' &&
      e.stance === 'fight' &&
      e.success &&
      e.enemyHullRemaining === 0
    ) {
      lines.push('Final volley connected — their hull gave way.');
    }
  }
  lines.push(`Resolved on round ${resolved.round}.`);
  return { resolution: resolved.resolution, lines };
}

// ---- T-1602b · death & succession (display-only) -------------------------

/**
 * The estate summary of a ship loss, for the succession notice.
 *
 * PURE TRANSLATION, exactly like `shipyardFailureExplanation`: every field below
 * is COPIED off a typed engine event (`ShipLost`, `LegacySuccession`, the
 * `TradeEvent{action:'forfeit-cargo'}` and the obituary `WireEntry` that
 * `applySuccession` emits together in one batch). Nothing here is re-derived —
 * in particular the halved bank is the engine's own `inheritedCredits` and the
 * obituary is the engine's own sentence, never prose authored in the UI.
 *
 * READERS: `store.ts` (`succession`, set from BOTH death paths — the combat
 * killing blow and the dusk life-support failure) and `App.tsx`'s
 * `SuccessionNotice`. The DURABLE reader of the persisted counter is the
 * Registry pane's `registry-successions` row, which survives a reload; this
 * summary is the in-the-moment beat only.
 */
export interface SuccessionSummary {
  /** The day the ship went down (`ShipLost.day`). */
  day: number;
  /** What took the ship down: the interceptor's id, or the literal
   *  'life-support-failure' on the dusk path (`ShipLost.interceptorId`). */
  lostTo: string;
  /** `lostTo` rendered for a human — the interceptor's authored NAME (the same
   *  string the combat overlay's `combat-enemy-name` showed), looked up in
   *  content exactly as `componentName` looks up a component. A pure name
   *  translation, never a rule; unknown ids fall back to the id itself. */
  lostToLabel: string;
  /** The typed cause (`ShipLost.reason`) — rendered as the notice's data-reason. */
  reason: 'combat-defeat' | 'life-support-failure';
  /** Half the bank, floored, straight off `LegacySuccession.inheritedCredits`. */
  inheritedCredits: number;
  /** The Guild marker the estate still owes (`LegacySuccession.debtOutstanding`). */
  debtOutstanding: number;
  /** How many licences this career has passed on (`LegacySuccession.successionCount`). */
  successionCount: number;
  /** The cargo that went down with the ship, or null when the hold was empty. */
  cargoForfeited: string | null;
  /** The engine's own wire obituary, verbatim. */
  obituary: string;
}

/** The authored display name behind a `ShipLost.interceptorId` — anonymous
 *  roster first, then the named cast, then the non-combat causes. Same shape as
 *  `componentName` / `equipmentName`: a content lookup, not a rule. */
function shipLostToLabel(interceptorId: string): string {
  if (interceptorId === 'life-support-failure') return 'Life support failure';
  const anon = ANONYMOUS_INTERCEPTORS.find((i) => i.id === interceptorId);
  if (anon) return anon.name;
  return NPC_PROFILES.find((p) => p.id === interceptorId)?.name ?? interceptorId;
}

/**
 * Build the succession summary from the events an action (or a dusk) returned.
 * Returns null when no ship was lost — which is every action but two in a career.
 */
export function successionSummary(events: GameEvent[]): SuccessionSummary | null {
  const lost = events.find(
    (e): e is Extract<GameEvent, { type: 'ShipLost' }> => e.type === 'ShipLost',
  );
  const succession = events.find(
    (e): e is Extract<GameEvent, { type: 'LegacySuccession' }> => e.type === 'LegacySuccession',
  );
  // Both always ride together (`applySuccession` is called at the ShipLost site),
  // but the UI refuses to render half an estate rather than invent the other half.
  if (!lost || !succession) return null;

  const forfeit = events.find(
    (e): e is Extract<GameEvent, { type: 'TradeEvent' }> =>
      e.type === 'TradeEvent' && e.action === 'forfeit-cargo',
  );
  const obituary = events.find(
    (e): e is Extract<GameEvent, { type: 'WireEntry' }> =>
      e.type === 'WireEntry' && e.message.includes('A successor claims the license'),
  );

  return {
    day: lost.day,
    lostTo: lost.interceptorId,
    lostToLabel: shipLostToLabel(lost.interceptorId),
    reason: lost.reason,
    inheritedCredits: succession.inheritedCredits,
    debtOutstanding: succession.debtOutstanding,
    successionCount: succession.successionCount,
    cargoForfeited: forfeit?.cargoType === undefined ? null : cargoName(forfeit.cargoType),
    obituary: obituary?.message ?? '',
  };
}

// ---- T-308 ship & shipyard (display-only) --------------------------------
//
// Every number and every "you can't buy this because…" reason the ship pane
// shows is read from the engine's pure `quoteShipyard` (cost, exclusion,
// prereq, renown, capacity, and the before→after fuel/pod projection). The UI
// owns NO shipyard rule: `shipyardFailureExplanation` is the single new function
// here and it is a pure TRANSLATION of the engine's typed `ShipyardFail` into
// prose — never a re-derivation of the rule. Balance numbers (tier prices, pod
// capacity, fuel curve) all live in engine/content.

type ShipyardAction = Extract<PlayerAction, { type: 'Shipyard' }>;

/** Thin re-export so panes never import the engine directly (the store stays the
 *  sole engine caller for MUTATIONS; this is a pure read used for previews). */
export function shipyardQuote(game: GameState, action: ShipyardAction): ShipyardQuote {
  return quoteShipyard(game.player, action);
}

/** Authored display name for a component (from content SHIP_COMPONENTS). */
export function componentName(id: ShipComponentId): string {
  return SHIP_COMPONENTS.find((c) => c.id === id)?.name ?? id;
}

/** Authored display name for a special-equipment item. */
export function equipmentName(id: SpecialEquipmentId): string {
  return SPECIAL_EQUIPMENT.find((e) => e.id === id)?.name ?? id;
}

/** A component grid row — strength/condition read straight off the ship, with a
 *  `damaged` flag for the highlight (condition below the 9 maximum). */
export interface ShipComponentRow {
  id: ShipComponentId;
  name: string;
  strength: number;
  condition: number;
  damaged: boolean;
  /** The tier this component currently sits at, from the engine's
   *  `componentTierForStrength` (floor(strength/10); a junker sits at tier 0). */
  tier: number;
  /** The next purchasable tier, or null when already at the top tier (9). */
  nextTier: number | null;
  /** What this component DOES, in one short phrase — the mechanical effect, not
   *  flavour. */
  effectLabel: string;
  /** The effect at the CURRENT fit, already formatted for display. */
  effectNow: string;
  /** The effect at `nextTier`, formatted the same way, or null at the top tier.
   *  Lets the yard show "18 fuel -> 10 fuel" instead of a bare price. */
  effectNext: string | null;
}

/**
 * T-1406 · What each component actually does, evaluated at a given strength.
 *
 * EVERY NUMBER COMES FROM THE ENGINE'S OWN READER — `jumpFuelCost`,
 * `weaponVolleyDamage`, `shieldMitigation`, `navFuelFactor`, `navBonus`,
 * `crewCapacity`, `repairRate`, `calculateFuelCapacity`. The UI owns no rule here,
 * exactly as it owns no shipyard rule (`shipyardFailureExplanation` above states
 * the same discipline). A hypothetical ship is built by cloning the live one and
 * moving ONE component to the strength under test, so the quoted effect is what
 * the engine would compute for that fit — never a UI approximation of it.
 *
 * WHY THIS EXISTS. The yard used to price a component without ever saying what it
 * did: "Drives, tier 7, 2,975cr" told a player nothing about whether it was worth
 * buying. Four of the eight components (drives, navigation, life support,
 * robotics) had no visible effect at all, which is a large part of why nobody
 * bought them.
 */
function componentEffect(
  ship: ShipState,
  id: ShipComponentId,
  strength: number,
): { label: string; value: string } {
  // The same ship with ONE component moved — condition held at the live value so
  // the comparison isolates the purchase.
  const probe: ShipState = {
    ...ship,
    [id]: { strength, condition: ship[id].condition },
  };
  const REFERENCE_DISTANCE = 10;
  switch (id) {
    case 'hull':
      return {
        label: 'fuel capacity',
        value: `${calculateFuelCapacity(strength, probe.hull.condition)} units`,
      };
    case 'drives':
      return {
        label: `fuel burned per ${REFERENCE_DISTANCE}-unit jump`,
        value: `${jumpFuelCost(probe.drives, REFERENCE_DISTANCE, probe.hasTransWarpDrive ?? false, navFuelFactor(probe))} fuel`,
      };
    case 'weapons':
      return { label: 'hull points per winning volley', value: `${weaponVolleyDamage(probe)}` };
    case 'shields':
      return { label: 'damage absorbed per hit', value: `${shieldMitigation(probe)}` };
    case 'navigation':
      return {
        label: 'pilot bonus / fuel discount',
        value: `+${navBonus(probe)} / x${navFuelFactor(probe).toFixed(2)}`,
      };
    case 'lifeSupport':
      // Strength has no reader; only `condition === 0` is checked (the dusk
      // survival gate). Said plainly rather than invented.
      return {
        label: 'dusk survival',
        value: probe.lifeSupport.condition > 0 ? 'holding' : 'CRITICAL',
      };
    case 'robotics':
      return { label: 'condition restored per repair', value: `${repairRate(probe)}` };
    case 'cabin':
      return { label: 'crew berths', value: `${crewCapacity(probe)}` };
    default:
      return { label: '', value: '' };
  }
}

/** The eight ship components as grid rows (order from content). */
export function shipComponents(game: GameState): ShipComponentRow[] {
  const ship = game.player.ship;
  return SHIP_COMPONENTS.map((def) => {
    const id = def.id;
    const comp = ship[id];
    // T-1402 · Consume the engine's floor-based tier inverse instead of the UI's
    // old `Math.max(1, Math.ceil(strength/10))`, which mapped a junker (strength 1)
    // to tier 1 → nextTier 2, making TIER 1 UNBUYABLE. floor maps it to tier 0 →
    // nextTier 1 is buyable.
    const tier = componentTierForStrength(comp.strength);
    const nextTier = tier < 9 ? tier + 1 : null;
    const now = componentEffect(ship, id, comp.strength);
    return {
      id,
      name: def.name,
      strength: comp.strength,
      condition: comp.condition,
      damaged: comp.condition < 9,
      tier,
      nextTier,
      effectLabel: now.label,
      effectNow: now.value,
      effectNext: nextTier === null ? null : componentEffect(ship, id, nextTier * 10).value,
    };
  });
}

// ===========================================================================
// T-189 · THE SHIP DIAGRAM — the ledger becomes a ship
//
// The ship pane used to be eight table rows and a flat six-cell instrument
// strip: every number was legible and none of them were LOCATABLE. "How many
// cargo pods do I have" and "what do my engines burn" were the same act of
// scanning a column. This model turns the pane's existing readouts into an
// annotated top-down outline: one region per ship system, each carrying the
// numbers that belong to THAT part of the hull, at THAT part of the hull.
//
// TWO RULES GOVERN THIS BLOCK, and both are load-bearing:
//
//  1. IT INVENTS NOTHING. Every strength, condition, effect string, capacity and
//     berth count below is a re-projection of a reader the pane ALREADY called —
//     `shipComponents` (engine `componentEffect`), `quoteShipyard(...).before`
//     (the same no-op repair-all quote the pane's fuel-curve strip read),
//     `crewRoster`, `fittedModuleRows`, and the raw ship/contract fields. There
//     is no second derivation of a rule here, so the diagram cannot disagree
//     with the grid beneath it.
//
//  2. THE GEOMETRY IS UI, NOT CONTENT. `SHIP_DIAGRAM_GEOMETRY` is hand-authored
//     here in `packages/ui` deliberately: `computeRulesFingerprint`
//     (`packages/sim/src/balance/rules-fingerprint.ts`) hashes
//     `packages/engine/src` + `packages/content/src` wholesale, so putting a
//     picture's coordinates in content would stale every balance fixture for a
//     drawing. Nothing here is a rule; nothing here is persisted.
//
// The projection follows `starmapProjection`'s precedent — SVG geometry and the
// derived readouts are computed in this file and `App.tsx` only renders them —
// which is what makes the whole surface unit-testable without a DOM.
// ===========================================================================

/** The ten diagram regions: the eight ship components plus the two instruments
 *  that have no component of their own (the cargo hold and the fuel load). */
export type ShipDiagramRegionId = ShipComponentId | 'pods' | 'fuel';

/** One labelled number inside a region's callout. `testId` is set only where a
 *  spec already reads that number by id — those ids moved onto the diagram with
 *  the readouts they name, and must stay BARE (the value and nothing else). */
export interface ShipDiagramReadout {
  key: string;
  value: string;
  testId?: string;
}

/** A hull mark: the shape (or shapes) drawn for a region, in viewBox units. */
export type ShipDiagramMark =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; rx: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'path'; d: string };

/** Where a region sits on the hull and where its callout hangs. `x`/`y` is the
 *  leader-line origin ON the hull; `labelX`/`labelY` is the callout anchor. */
export interface ShipDiagramGeometry {
  x: number;
  y: number;
  labelX: number;
  labelY: number;
  anchor: 'start' | 'middle' | 'end';
  /** False for the two callouts that sit ON their own mark (hold, fuel bar). */
  leader: boolean;
  marks: ShipDiagramMark[];
}

/** One region of the diagram — a part of the ship and the numbers that live at
 *  it. `componentId` is null for the two non-component instruments. */
export interface ShipDiagramRegion {
  id: ShipDiagramRegionId;
  componentId: ShipComponentId | null;
  label: string;
  readouts: ShipDiagramReadout[];
  /** Component strength / condition (0-9), or null for `pods` / `fuel`. */
  strength: number | null;
  condition: number | null;
  /** Condition below the 9 maximum — the same flag the grid row highlights. */
  damaged: boolean;
  /** Condition at zero — the failure state, drawn in reverse video. */
  critical: boolean;
  /** Hover text: the long form of what the callout says in shorthand. */
  title: string;
}

export interface ShipDiagramModel {
  hullVariant: 'junker' | 'astraxial';
  regions: ShipDiagramRegion[];
  podsOwned: number;
  podsMax: number;
  podsInUse: number;
  /** Owned pods as a fraction of hull capacity, 0..1. Zero (never NaN) when the
   *  hull holds nothing — an SVG attribute must not receive NaN. */
  podFill: number;
  /** Contracted pods as a fraction of the SAME capacity, 0..1. */
  podUseFill: number;
  fuel: number;
  maxFuel: number;
  fuelFill: number;
  crewUsed: number;
  crewBerths: number;
  fittings: { id: string; name: string }[];
  viewBox: string;
}

/**
 * The diagram's coordinate space — WIDE AND SHORT, and measured rather than
 * guessed: the ship pane's box in the cockpit's left column is 623 x 220 CSS px
 * at the suite's 1280x720 viewport (`.col.left`'s ship row is
 * `minmax(220px, 1fr)`). A tall diagram would eat the whole pane and push the
 * pods block and the yard bench below the fold, so the ship lies along the long
 * axis — nose right, engine bells left — with the callouts in the top and bottom
 * gutters. At the CSS cap of 480px wide the diagram is 156px tall, leaving the
 * pane's own controls visible beneath it.
 */
export const SHIP_DIAGRAM_VIEWBOX = { width: 480, height: 156 } as const;

/** The stock hull, seen from above and lying nose-right: a pointed fore hull, a
 *  wide cargo midsection (the largest shape on the diagram, deliberately), a
 *  narrow neck, and a tail block carrying twin engine bells. */
export const JUNKER_PATH =
  'M466 78 L440 64 L336 64 L330 46 L196 46 L192 64 L120 64 L120 56 L92 56 ' +
  'L92 100 L120 100 L120 92 L192 92 L196 110 L330 110 L336 92 L440 92 Z';

/** The Astraxial hull: the same anatomy, longer and swept — the silhouette is
 *  the ONLY thing the hull upgrade changes here (it changes no readout). */
export const ASTRAXIAL_PATH =
  'M472 78 L438 62 L332 60 L326 42 L192 44 L188 62 L114 60 L114 52 L86 52 ' +
  'L86 104 L114 104 L114 96 L188 94 L192 112 L326 114 L332 96 L438 94 Z';

/** The cargo bay's interior, in viewBox units — the fill meter is drawn inside
 *  it. Ten segments, NOT one cell per pod: `maxCargoPods` reaches 100, so the
 *  segments are texture and the callout carries the exact numerals. */
export const SHIP_DIAGRAM_BAY = { x: 196, y: 46, w: 134, h: 64 } as const;
export const SHIP_DIAGRAM_BAY_SEGMENTS = 10;

/** The fuel bar, drawn under the engine bells it feeds. */
export const SHIP_DIAGRAM_FUEL_BAR = { x: 46, y: 114, w: 56, h: 8 } as const;

/** Where the salvaged-fitting pips ride: along the neck's spine, one per fitted
 *  module. The named list stays below the diagram, unchanged. */
export const SHIP_DIAGRAM_FITTING_ORIGIN = { x: 132, y: 78, step: 12 } as const;

/**
 * Where each region lives. Hand-authored, and checked by
 * `ship-diagram.test.ts`: every region id has an entry, every coordinate is
 * finite and inside the viewBox, and no two callout anchors stack closer than
 * the line height (which is what would make the diagram unreadable).
 */
export const SHIP_DIAGRAM_GEOMETRY: Record<ShipDiagramRegionId, ShipDiagramGeometry> = {
  // --- top gutter, read fore-to-aft ---------------------------------------
  drives: {
    x: 74,
    y: 46,
    labelX: 74,
    labelY: 22,
    anchor: 'middle',
    leader: true,
    // Twin bells on the tail block — mirrored, so "the engines" is a shape a
    // player recognises before reading a single digit.
    marks: [
      { kind: 'rect', x: 56, y: 46, w: 36, h: 24, rx: 3 },
      { kind: 'rect', x: 56, y: 86, w: 36, h: 24, rx: 3 },
      // Grille bars, so a bell reads as an engine rather than a box.
      { kind: 'path', d: 'M62 52 L86 52 M62 58 L86 58 M62 64 L86 64' },
      { kind: 'path', d: 'M62 92 L86 92 M62 98 L86 98 M62 104 L86 104' },
    ],
  },
  lifeSupport: {
    x: 157,
    y: 64,
    labelX: 157,
    labelY: 22,
    anchor: 'middle',
    leader: true,
    marks: [{ kind: 'rect', x: 134, y: 70, w: 46, h: 16, rx: 2 }],
  },
  shields: {
    x: 262,
    y: 12,
    labelX: 262,
    labelY: 22,
    anchor: 'middle',
    // The envelope is the whole ship, so the callout sits ON it rather than
    // pointing at one spot.
    leader: false,
    marks: [{ kind: 'ellipse', cx: 262, cy: 78, rx: 214, ry: 66 }],
  },
  weapons: {
    x: 360,
    y: 64,
    labelX: 360,
    labelY: 22,
    anchor: 'middle',
    leader: true,
    marks: [
      { kind: 'rect', x: 358.5, y: 66, w: 3, h: 12, rx: 1 },
      { kind: 'ellipse', cx: 360, cy: 78, rx: 10, ry: 7 },
    ],
  },
  navigation: {
    x: 440,
    y: 64,
    labelX: 440,
    labelY: 22,
    anchor: 'middle',
    leader: true,
    marks: [{ kind: 'path', d: 'M466 78 L438 68 L438 88 Z' }],
  },
  // --- bottom gutter -------------------------------------------------------
  fuel: {
    x: 74,
    y: 122,
    labelX: 74,
    labelY: 138,
    anchor: 'middle',
    leader: false,
    marks: [
      {
        kind: 'rect',
        x: SHIP_DIAGRAM_FUEL_BAR.x,
        y: SHIP_DIAGRAM_FUEL_BAR.y,
        w: SHIP_DIAGRAM_FUEL_BAR.w,
        h: SHIP_DIAGRAM_FUEL_BAR.h,
        rx: 2,
      },
    ],
  },
  robotics: {
    x: 220,
    y: 121,
    labelX: 220,
    labelY: 138,
    anchor: 'middle',
    leader: false,
    marks: [{ kind: 'rect', x: 205, y: 112, w: 30, h: 9, rx: 2 }],
  },
  cabin: {
    x: 297,
    y: 121,
    labelX: 300,
    labelY: 138,
    anchor: 'middle',
    leader: false,
    marks: [{ kind: 'rect', x: 280, y: 112, w: 34, h: 9, rx: 2 }],
  },
  hull: {
    x: 400,
    y: 92,
    labelX: 400,
    labelY: 138,
    anchor: 'middle',
    leader: true,
    // No mark of its own: the hull IS the silhouette, drawn from the variant
    // path above and owned by this region's group.
    marks: [],
  },
  // --- inside the bay it measures -----------------------------------------
  pods: {
    x: 262,
    y: 78,
    labelX: 262,
    labelY: 72,
    anchor: 'middle',
    leader: false,
    marks: [
      {
        kind: 'rect',
        x: SHIP_DIAGRAM_BAY.x,
        y: SHIP_DIAGRAM_BAY.y,
        w: SHIP_DIAGRAM_BAY.w,
        h: SHIP_DIAGRAM_BAY.h,
        rx: 2,
      },
    ],
  },
};

/** The short name printed at each region. Deliberately terse — the long form is
 *  the hover title, and the authored component name is in the grid below. */
const SHIP_DIAGRAM_LABEL: Record<ShipDiagramRegionId, string> = {
  hull: 'HULL',
  drives: 'DRIVES',
  cabin: 'CABIN',
  lifeSupport: 'LIFE',
  weapons: 'WEAPONS',
  navigation: 'NAV',
  robotics: 'ROBOTICS',
  shields: 'SHIELDS',
  pods: 'CARGO HOLD',
  fuel: 'FUEL',
};

/** A fraction guarded against a zero (or absent) denominator, clamped to 0..1.
 *  An SVG width/x attribute must never receive NaN. */
function fill(part: number, whole: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0;
  return Math.min(1, Math.max(0, part / whole));
}

/**
 * The ship diagram model: the pane's existing numbers, re-projected onto the
 * hull they describe. Pure — reads `game`, mutates nothing.
 *
 * READER: `App.tsx` `ShipDiagram`, inside `ShipPane`.
 */
export function shipDiagram(game: GameState): ShipDiagramModel {
  const ship = game.player.ship;
  // The SAME no-op repair-all quote the pane already used for its fuel curve:
  // `before` is a pure read of the current ship, so the diagram's capacity /
  // fuel-curve / berth numbers are the engine's, not the UI's.
  const curve = quoteShipyard(game.player, {
    type: 'Shipyard',
    action: 'repair',
    repairMode: 'all',
    spendDie: 0,
  }).before;
  const components = shipComponents(game);
  const roster = crewRoster(game);

  const podsOwned = ship.cargoPods;
  const podsMax = curve.maxCargoPods;
  const podsInUse = game.player.activeContract?.pods ?? 0;

  /** The per-component readouts. Every value is a string the engine produced. */
  const componentReadouts = (row: ShipComponentRow): ShipDiagramReadout[] => {
    switch (row.id) {
      // The hull's own effect IS the fuel capacity, and that number already has
      // a region of its own (the bar under the drives, `300/300`) — so the hull
      // callout carries only what nothing else says. The long form is still in
      // the bench row below, verbatim, and in this region's hover title.
      case 'hull':
        return [{ key: 'STR', value: `${row.strength}` }];
      case 'drives':
        // The two ids that moved off the deleted flat strip; both stay bare
        // numbers (`shipyard.spec.ts` reads `fuel-per-jump` with `innerText`).
        return [
          { key: 'FUEL/JUMP', value: `${curve.fuelPerJump}`, testId: 'fuel-per-jump' },
          { key: 'RANGE', value: `${curve.maxJumpDistance}`, testId: 'jump-range' },
        ];
      case 'cabin':
        return [
          { key: 'BERTHS', value: `${roster.berths}`, testId: 'crew-capacity' },
          { key: 'ABOARD', value: `${roster.berthsUsed}` },
        ];
      case 'weapons':
        return [{ key: 'HP/VOLLEY', value: row.effectNow }];
      case 'shields':
        return [{ key: 'ABSORB', value: row.effectNow }];
      // Two engine strings that are already self-describing ("+0 / x1.00",
      // "holding") take no key: in a gutter this shallow a redundant word is what
      // turns a callout back into a ledger line.
      case 'navigation':
        return [{ key: '', value: row.effectNow }];
      case 'lifeSupport':
        return [{ key: '', value: row.effectNow }];
      case 'robotics':
        return [{ key: 'REPAIR', value: row.effectNow }];
    }
  };

  // Built by mapping the CONTENT table (via `shipComponents`), never a literal
  // list, so a ninth component cannot be silently missing from the diagram.
  const regions: ShipDiagramRegion[] = components.map((row) => ({
    id: row.id,
    componentId: row.id,
    label: SHIP_DIAGRAM_LABEL[row.id],
    readouts: componentReadouts(row),
    strength: row.strength,
    condition: row.condition,
    damaged: row.damaged,
    critical: row.condition === 0,
    title: `${row.name} — strength ${row.strength}, condition ${row.condition}/9 · ${row.effectLabel}: ${row.effectNow}`,
  }));

  regions.push({
    id: 'pods',
    componentId: null,
    label: SHIP_DIAGRAM_LABEL.pods,
    readouts: [
      { key: '', value: `${podsOwned}/${podsMax}` },
      ...(podsInUse > 0 ? [{ key: 'IN USE', value: `${podsInUse}` }] : []),
    ],
    strength: null,
    condition: null,
    damaged: false,
    critical: false,
    title:
      podsInUse > 0
        ? `Cargo hold — ${podsOwned} of ${podsMax} pods fitted, ${podsInUse} loaded`
        : `Cargo hold — ${podsOwned} of ${podsMax} pods fitted, empty`,
  });

  regions.push({
    id: 'fuel',
    componentId: null,
    label: SHIP_DIAGRAM_LABEL.fuel,
    readouts: [
      { key: '', value: `${ship.fuel.toLocaleString()}/${ship.maxFuel.toLocaleString()}` },
    ],
    strength: null,
    condition: null,
    damaged: false,
    critical: false,
    title: `Fuel — ${ship.fuel.toLocaleString()} of ${ship.maxFuel.toLocaleString()} units`,
  });

  return {
    hullVariant: ship.isAstraxialHull === true ? 'astraxial' : 'junker',
    regions,
    podsOwned,
    podsMax,
    podsInUse,
    podFill: fill(podsOwned, podsMax),
    podUseFill: fill(podsInUse, podsMax),
    fuel: ship.fuel,
    maxFuel: ship.maxFuel,
    fuelFill: fill(ship.fuel, ship.maxFuel),
    crewUsed: roster.berthsUsed,
    crewBerths: roster.berths,
    fittings: fittedModuleRows(game).map((m) => ({ id: m.id, name: m.name })),
    viewBox: `0 0 ${SHIP_DIAGRAM_VIEWBOX.width} ${SHIP_DIAGRAM_VIEWBOX.height}`,
  };
}

/** Whether the player already owns a special-equipment item (read from the
 *  ship's install flags — the same booleans the engine sets on purchase). */
function equipmentOwned(game: GameState, id: SpecialEquipmentId): boolean {
  const ship = game.player.ship;
  switch (id) {
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
    case 'TRANS_WARP':
      return ship.hasTransWarpDrive === true;
  }
}

export interface SpecialEquipmentRow {
  id: SpecialEquipmentId;
  name: string;
  owned: boolean;
  quote: ShipyardQuote;
}

/** One row per special-equipment item — ALL of them, always rendered (the pane
 *  disables, never hides, an item you can't buy, and shows the engine's reason).
 *  `quote` carries whether it's buyable and the typed `failure` when it isn't. */
export function specialEquipmentRows(game: GameState): SpecialEquipmentRow[] {
  return SPECIAL_EQUIPMENT.map((def) => {
    const id = def.id as SpecialEquipmentId;
    return {
      id,
      name: def.name,
      owned: equipmentOwned(game, id),
      quote: quoteShipyard(game.player, {
        type: 'Shipyard',
        action: 'buy-special-equipment',
        equipment: id,
        spendDie: 0,
      }),
    };
  });
}

const PREREQUISITE_PROSE: Record<string, string> = {
  HULL_STRENGTH_1_TO_4: 'Needs a light hull (strength 1–4)',
  SHIELDS: 'Needs shields installed',
  DRIVES_STRENGTH_25: 'Needs drives at strength 25+',
};

/**
 * Translate the engine's TYPED failure reason into a one-line explanation for
 * the pane — the "exclusion conflict shows why" surface. This is pure display
 * translation of `ShipyardFail`; it re-derives no rule. Every branch maps a
 * `ShipyardFailureReason` the engine emitted to prose.
 */
export function shipyardFailureExplanation(fail: ShipyardFail): string {
  switch (fail.reason) {
    case 'MUTUALLY_EXCLUSIVE_EQUIPMENT':
      return fail.conflictingEquipment
        ? `Conflicts with ${equipmentName(fail.conflictingEquipment)}`
        : 'Conflicts with installed equipment';
    case 'INSUFFICIENT_RENOWN':
      return fail.requiredRank
        ? `Requires ${RENOWN_RANKS[fail.requiredRank].label} renown`
        : 'Requires higher renown';
    case 'PREREQUISITE_NOT_MET':
      return fail.prerequisite
        ? (PREREQUISITE_PROSE[fail.prerequisite] ?? `Requires ${fail.prerequisite}`)
        : 'Prerequisite not met';
    case 'INSUFFICIENT_CREDITS':
      return `Need ${(fail.cost ?? 0).toLocaleString()}cr, have ${(fail.credits ?? 0).toLocaleString()}cr`;
    case 'CAPACITY_EXCEEDED':
      return `Hold maxes at ${fail.maxPods ?? 0} pods`;
    case 'ALREADY_INSTALLED':
      return 'Already installed';
    case 'AT_MAX_CONDITION':
      return 'Already at full condition';
    case 'NO_HULL':
      return 'No hull to fit this to';
  }
}

// ---- T-309 storylet & registry UX (display-only) -------------------------
//
// Pure reads of existing engine surface: the storylet offer's authored
// requirements, the player's DeedRegistryState + Nemesis file. The UI invents
// no rule — the cost labels and lock reasons are honest projections of the same
// `requirements` the engine (resolveStoryletChoice) enforces, and the registry
// / nemesis views read straight off `game.player`. Every threshold comes from
// content (RENOWN_DEED_THRESHOLDS), never a hardcoded balance number.

/** One presented storylet choice (the offer's authored choice shape). */
export type StoryletChoice = StoryletOffer['choices'][number];

/** Does resolving this choice consume a die? T-1402 · Reads the engine's own
 *  `quoteStoryletChoice(...).needsDie` (a `spendDie` requirement or a stat check —
 *  the two paths the engine burns a die on) rather than reimplementing the gate.
 *  The store passes `spendDie` ONLY for these — a no-requirement choice
 *  (answer / accept-thanks) must never demand or waste a die. */
export function storyletChoiceNeedsDie(
  game: GameState,
  storyletId: string,
  choice: StoryletChoice,
): boolean {
  return quoteStoryletChoice(game, storyletId, choice.id).needsDie;
}

/**
 * A compact, always-shown requirement/cost badge for a choice — the PRD's
 * "choices with visible requirements/costs". T-1402 · Assembled from the engine's
 * `quoteStoryletChoice` FACTS (credit floor, stat check, die spend), never from a
 * UI-reimplemented read of `choice.requirements`. Renders the credit floor, the
 * stat check (STAT DC n), and a `die` token when a die is spent, joined by ` · `.
 * An unconditional choice returns '' (no badge). This shows the requirement whether
 * or not it is currently met; the LOCK (below) adds the disabled-state reason.
 */
export function storyletChoiceCostLabel(
  game: GameState,
  storyletId: string,
  choice: StoryletChoice,
): string {
  const quote = quoteStoryletChoice(game, storyletId, choice.id);
  const parts: string[] = [];
  if (quote.requiredCredits !== null) parts.push(`${quote.requiredCredits.toLocaleString()}cr`);
  if (quote.statCheck) parts.push(`${statName(quote.statCheck.stat)} DC ${quote.statCheck.dc}`);
  if (quote.needsDie) parts.push('die');
  return parts.join(' · ');
}

/**
 * Why this choice is locked right now, or null when it can be taken. T-1402 ·
 * Delegates to the engine's `quoteStoryletChoice`, which runs the EXACT read-only
 * refusal ladder `resolveStoryletChoice` runs (insufficient-credits before
 * missing-die), and translates its typed reason into prose. `armedDie` is the die
 * index the UI has tentatively assigned (undefined = none) — a die-requiring
 * choice previews `missing-die` until a valid, unspent die is armed. This drives
 * both the disabled state and the visible requirement on a locked choice.
 */
export function storyletChoiceLock(
  game: GameState,
  storyletId: string,
  choice: StoryletChoice,
  armedDie?: number,
): string | null {
  const quote = quoteStoryletChoice(game, storyletId, choice.id, armedDie);
  switch (quote.reason) {
    case 'insufficient-credits':
      return `Need ${(quote.requiredCredits ?? 0).toLocaleString()}cr`;
    case 'missing-die':
      return 'Assign a die';
    case 'not-available':
    case 'unknown-choice':
      // A live offer's own choice never hits these; map defensively so a stale
      // render is disabled rather than mis-enabled.
      return 'Unavailable';
    case null:
      return null;
  }
}

export interface DeedRegistryView {
  rankId: RenownRankId;
  rankLabel: string;
  deedCount: number;
  /** The next rank up, when one remains (null at the top rank). */
  nextRankLabel: string | null;
  /** Deeds still needed to reach that next rank (null at the top rank). */
  deedsToNextRank: number | null;
  /** T-1504c · The CURRENT rank's authored citation (content RENOWN_RANKS).
   *  Until now this text existed only as the rank-up wire moment (engine
   *  `deeds.ts`), a single ticker frame — so a player who missed it never saw
   *  their own citation. READER: the `registry-rank-citation` line in
   *  RecordsOverlay (App.tsx), asserted at two ranks in `e2e/derule.spec.ts`.
   *  Emitted verbatim: content owns the prose, the UI owns no rule here. */
  rankCitation: string;
  /** T-1602b · How many times this career has passed the licence on — a verbatim
   *  read of the PERSISTED `player.legacy.successionCount` (T-108). This is the
   *  DURABLE reader of that field: unlike the transient succession notice it
   *  survives a reload, which is what proves the counter is state and not a
   *  modal. READER: the `registry-successions` row in RecordsOverlay (App.tsx),
   *  rendered only when the count is non-zero — the same "a first-run spacer is
   *  not told about a counter that reads zero" rule `endingScreen` follows. */
  successionCount: number;
  /** Earned deeds, newest first (by eventIndex — stable within a day). */
  earned: { id: string; title: string; citation: string; day: number }[];
}

/**
 * The Registry of Deeds view — rank, the current rank's citation, deed count,
 * next-rank progress, and the earned-deed roll (newest first). All read from
 * `game.player.registry`; the rank labels and citations come from RENOWN_RANKS and
 * the next-rank threshold from RENOWN_DEED_THRESHOLDS (content), never recomputed
 * here.
 */
export function deedRegistry(game: GameState): DeedRegistryView {
  const registry = game.player.registry;
  const deedCount = registry.earned.length;
  // T-1402 · The next rank up comes from the engine's `nextRankFor` (the canonical
  // RENOWN_RANK_ORDER), not a UI re-sort of RENOWN_DEED_THRESHOLDS. The threshold
  // itself is still a content lookup for the remaining-deeds countdown.
  const next = nextRankFor(registry.renownRank);
  return {
    rankId: registry.renownRank,
    rankLabel: RENOWN_RANKS[registry.renownRank].label,
    deedCount,
    nextRankLabel: next ? RENOWN_RANKS[next].label : null,
    deedsToNextRank: next ? Math.max(0, RENOWN_DEED_THRESHOLDS[next] - deedCount) : null,
    rankCitation: RENOWN_RANKS[registry.renownRank].citation,
    successionCount: game.player.legacy.successionCount,
    earned: [...registry.earned]
      // N11 made `eventIndex` optional on `EarnedDeedState` — an NPC-earned row has
      // no index into the shared event log to carry (see the field's doc comment).
      // This reader only ever sees the PLAYER's rows, which always carry one, so the
      // `?? 0` is a type-level guard rather than a live case: a hypothetical
      // index-less row simply sorts to the bottom instead of poisoning the compare
      // with NaN.
      .sort((a, b) => (b.eventIndex ?? 0) - (a.eventIndex ?? 0))
      .map((d) => ({ id: d.id, title: d.title, citation: d.citation, day: d.day })),
  };
}

/** One faction's standing row for the ALLIANCE STANDING readout. */
export interface FactionStandingView {
  faction: FactionId;
  /** Display name (content FACTION_LABELS). */
  label: string;
  /** The raw standing value (engine `player.reputation[faction]`). */
  value: number;
  /** A coarse tone for styling — friendly / hostile / neutral. */
  tone: 'friendly' | 'hostile' | 'neutral';
}

/**
 * T-1503 · The four-faction ALLIANCE STANDING view — a pure read of
 * `game.player.reputation`, one row per galactic power in the canonical
 * FACTION_IDS order, labelled from content FACTION_LABELS. The UI owns NO rule: the
 * value is the engine's stored standing verbatim; `tone` is a display-only sign
 * bucket. READER of the reputation state the T-1503 movers/questlines write.
 */
export function factionStanding(game: GameState): FactionStandingView[] {
  return FACTION_IDS.map((faction) => {
    const value = game.player.reputation[faction];
    return {
      faction,
      label: FACTION_LABELS[faction],
      value,
      tone: value > 0 ? 'friendly' : value < 0 ? 'hostile' : 'neutral',
    };
  });
}

export interface NemesisFileView {
  count: number;
  decodedCount: number;
  entries: NemesisLoreEntry[];
}

/**
 * The Nemesis file view — the decoded-lore index (one entry per held fragment,
 * arc-ordered) plus the fragment and decoded counts. A pure read via the
 * engine's own `nemesisLoreIndex` / `fragmentCount`; each entry's `text` is the
 * decoded lore when decoded, else the raw signal (the engine decides which).
 */
export function nemesisFile(game: GameState): NemesisFileView {
  const file = game.player.nemesisFile;
  const entries = nemesisLoreIndex(file);
  return {
    count: fragmentCount(file),
    decodedCount: entries.filter((e) => e.decoded).length,
    entries,
  };
}

/**
 * T-1505b · Number-free prose for a crossing refusal, used by the WIRE ticker
 * (which only has the event, never the quote). The pane's own lock line —
 * {@link crossingStatus} — reuses the same switch shape but folds in the live
 * numbers off the engine quote. Both translate the SAME typed reason, so they can
 * never describe different failures.
 */
function crossingRefusalText(reason: CrossingRefusal | undefined): string {
  switch (reason) {
    case 'not-conqueror':
      return 'the escrow clerk would not open a file for a captain of your rank.';
    case 'fragments-undecoded':
      return 'the solution is not whole — the ledger has gaps you cannot fly through.';
    case 'debt-outstanding':
      return 'you cannot stake what you owe. The ledger comes first.';
    case 'insufficient-stake':
      return 'the account on the table did not amount to a stake.';
    case 'ship-cannot-carry-the-burn':
      return 'the tank cannot carry the burn, and there is no port on the far side.';
    case 'already-committed':
      return 'the stake is already signed; there is nothing left to put on the table.';
    case undefined:
      return 'the attempt was refused.';
  }
}

/** T-1505b · The THE CROSSING block's state, for the Records → Nemesis pane. */
export interface CrossingStatusView {
  /**
   * `hidden`    — the spacer has decoded nothing, so the pane says nothing (the
   *               endgame is not spoiled on day one);
   * `locked`    — visible, with the next unmet clause named;
   * `committed` — the stake is signed and the gate is lifted;
   * `crossed`   — the ship has been to the far side.
   */
  state: 'hidden' | 'locked' | 'committed' | 'crossed';
  /** The engine's first failing clause while `locked`, else null. */
  reason: CrossingRefusal | null;
  /** Player-facing lock line with live numbers, or null when not `locked`. */
  lockText: string | null;
  /** What was signed over (flag `nemesis.crossing.stake.credits`), once paid. */
  stakeCredits: number | null;
  /** The day it was signed (flag `nemesis.crossing.stake.day`). */
  stakeDay: number | null;
  /** Decoded-set progress, straight off the engine quote. */
  decoded: number;
  decodedRequired: number;
  /** The crossing jump's PILOT DC (content) — shown so the door names its price. */
  dc: number;
}

/**
 * T-1505b · The crossing pane's read. A pure client of the engine's
 * `quoteCrossingStake` (the same ladder `commitCrossingStake` runs) plus the two
 * stake-receipt flags — so the pane can never disagree with the resolver about
 * WHY the door is shut, and the flags this task writes have a named reader.
 *
 * The `hidden` state is deliberate: a captain who has decoded nothing has no
 * business being told about a black hole they have not heard of yet.
 */
export function crossingStatus(game: GameState): CrossingStatusView {
  const quote = quoteCrossingStake(game);
  const committed = game.flags['nemesis.crossing.unlocked'] === true;
  const stakeCredits = game.flags['nemesis.crossing.stake.credits'];
  const stakeDay = game.flags['nemesis.crossing.stake.day'];
  const crossed =
    game.player.currentSystemId === NEMESIS_SYSTEM_ID ||
    game.player.charts.visitedSystemIds.includes(NEMESIS_SYSTEM_ID);

  const base = {
    reason: null as CrossingRefusal | null,
    lockText: null as string | null,
    stakeCredits: typeof stakeCredits === 'number' ? stakeCredits : null,
    stakeDay: typeof stakeDay === 'number' ? stakeDay : null,
    decoded: quote.decoded,
    decodedRequired: quote.decodedRequired,
    dc: NEMESIS_CROSSING_DC,
  };

  // T-1505c NOTE: in v1 this branch is HEADLESS-ONLY. Arrival at NEMESIS ends the
  // career (engine `careerEnded`), the ending screen replaces the cockpit, and a
  // new career starts with empty charts — so no player can open Records while
  // `crossed` holds. It is kept, rather than deleted, because the read is correct
  // and it becomes player-visible the moment the far side is playable (the
  // Andromeda expansion, PRD §10). Its live readers today are the engine/sim
  // tests; the arrival's player-facing surface is `endingScreen` below.
  if (crossed) return { ...base, state: 'crossed' };
  if (committed) return { ...base, state: 'committed' };
  if (quote.decoded === 0) return { ...base, state: 'hidden' };
  if (quote.ok) return { ...base, state: 'locked', lockText: null };

  return {
    ...base,
    state: 'locked',
    reason: quote.reason,
    lockText: crossingLockText(quote.reason, quote),
  };
}

/** The lock line with live numbers — same typed reasons as
 *  {@link crossingRefusalText}, in the style of `storyletChoiceLock`'s switch. */
function crossingLockText(
  reason: CrossingRefusal | null,
  quote: ReturnType<typeof quoteCrossingStake>,
): string {
  switch (reason) {
    case 'not-conqueror':
      return `Requires the rank of ${RENOWN_RANKS[CROSSING_REQUIRED_RANK].label}`;
    case 'fragments-undecoded':
      return `Decode the Signal — ${quote.decoded} of ${quote.decodedRequired}`;
    case 'debt-outstanding':
      return 'Clear every debt before you stake anything';
    case 'insufficient-stake':
      return `Need ${CROSSING_STAKE_MIN_CREDITS.toLocaleString()}cr on the table`;
    case 'ship-cannot-carry-the-burn':
      return `Carry the burn — ${quote.burnRequired.toLocaleString()} fuel`;
    case 'already-committed':
    case null:
      return 'Ready';
  }
}

/** T-1505c · One label/value row of the ending screen's career summary. `key`
 *  rides the DOM as `data-stat`, so the e2e spec addresses rows by meaning
 *  rather than by position. */
export interface EndingStatRow {
  key: string;
  label: string;
  value: string;
}

/** T-1505c · Everything the ending screen renders. */
export interface EndingView {
  kicker: string;
  title: string;
  prose: readonly string[];
  signOff: string;
  /** The arrival wire line (content `CROSSING_WIRE.crossed`), shown as the
   *  screen's epigraph — this screen is the line's only player-facing reader,
   *  because it replaces the cockpit ticker that used to carry it. */
  lastWire: string;
  /** Copy on the screen's single control (content `CROSSING_ENDING`). */
  returnLabel: string;
  /** The career summary, in display order. */
  stats: EndingStatRow[];
}

/**
 * T-1505c · The ending screen's view-model — NULL unless the ENGINE says the
 * career is over (`careerEnded`). A pure client in the strictest sense: every
 * number comes from the engine's `careerEpilogue` and every string from content's
 * `CROSSING_ENDING`; this function owns no rule, invents no figure, and decides
 * nothing except formatting and row order.
 *
 * READER: `EndingScreen` (App.tsx), which App mounts INSTEAD of the cockpit —
 * see the design note there for why the far side replaces the terminal rather
 * than covering it.
 */
export function endingScreen(game: GameState): EndingView | null {
  if (!careerEnded(game)) return null;
  const epilogue = careerEpilogue(game);

  const stats: EndingStatRow[] = [
    { key: 'day', label: 'DAYS FLOWN', value: String(epilogue.day) },
    { key: 'rank', label: 'FINAL RANK', value: epilogue.rankLabel },
    { key: 'deeds', label: 'DEEDS ON THE BOARD', value: String(epilogue.deedCount) },
    {
      key: 'fragments',
      label: 'THE SIGNAL',
      value: `${epilogue.fragmentsDecoded} of ${epilogue.fragmentsHeld} decoded`,
    },
    {
      key: 'stake',
      label: 'STAKE SIGNED OVER',
      value: `${epilogue.stakeCredits.toLocaleString()} CR`,
    },
    { key: 'charted', label: 'SYSTEMS CHARTED', value: String(epilogue.systemsCharted) },
  ];
  // Only a career that actually lost a ship gets the succession line — a
  // first-run spacer is not told about a counter that reads zero.
  if (epilogue.successionCount > 0) {
    stats.push({
      key: 'successions',
      label: 'LICENCES PASSED ON',
      value: String(epilogue.successionCount),
    });
  }

  return {
    kicker: epilogue.kicker,
    title: epilogue.title,
    prose: epilogue.prose,
    signOff: epilogue.signOff,
    lastWire: epilogue.lastWire,
    returnLabel: CROSSING_ENDING.returnLabel,
    stats,
  };
}

// ---- T-1703 demo prose ---------------------------------------------------
//
// Every function below is a PURE CLIENT of the engine's demo predicates
// (`packages/engine/src/demo.ts`) and content's authored copy
// (`packages/content/src/demo.ts`). No rule lives here: the cockpit does not
// decide what is locked, when the demo ends, or how many days are left — it asks.

/** The player-facing name of an edition. READER: the Settings → Build → Edition
 *  row (App.tsx), which also carries the raw id as `data-edition` on the
 *  `data-update-status` precedent — prose may be re-voiced, the id is what a spec
 *  asserts on. */
export function editionLabel(edition: Edition): string {
  return edition === 'demo' ? 'Demo — Tour One' : 'Full game';
}

/** The demo banner's view-model — the sentence a player reads plus the number a
 *  spec asserts on, from ONE call so the two cannot disagree. */
export interface DemoBannerView {
  line: string;
  /** Days left on the licence, counting today (engine `demoDaysRemaining`). */
  daysRemaining: number;
}

/**
 * The standing demo banner, or `null` for a full career (and for a demo that has
 * already concluded — the end card speaks for that state, and two notices saying
 * the same thing is one too many).
 *
 * READER: `DemoBanner` (App.tsx), mounted above the bezel.
 */
export function demoBannerLine(game: GameState): DemoBannerView | null {
  if (!isDemo(game) || demoConcluded(game)) return null;
  const daysRemaining = demoDaysRemaining(game) ?? 0;
  const days = daysRemaining === 1 ? 'day' : 'days';
  return {
    line: `DEMO LICENCE · ${daysRemaining} ${days} left of ${DEMO_FINAL_DAY}`,
    daysRemaining,
  };
}

/** The tease beside a demo-locked control — content's authored line, verbatim.
 *  Returns `null` when the feature is not locked in this state, so the caller
 *  renders nothing on a full build without a second condition of its own.
 *  READER: the Port Ledger buy row, the crew hireable rows and the Registry
 *  capstone row (App.tsx). */
export function demoLockNotice(game: GameState, feature: DemoLockedFeature): string | null {
  return demoLocked(game, feature) ? DEMO_TEASE[feature] : null;
}

/**
 * The one-line notice for a save-file transfer, in the four outcomes the store
 * can produce. Prose only — the store owns the branching, this owns the words.
 *
 * READER: `store.ts`'s `exportCareer` / `importCareer`, surfaced through the
 * cockpit's standing `notice`.
 */
export function careerTransferMessage(
  outcome: 'exported' | 'imported' | 'promoted' | 'edition-refused' | 'unreadable',
): string {
  switch (outcome) {
    case 'exported':
      return 'Career exported. Open it in the full game to fly on from here.';
    case 'imported':
      return 'Career imported. The licence picks up exactly where it left off.';
    case 'promoted':
      return 'Career imported and upgraded — the demo endorsement is off your papers and every lane is open.';
    case 'edition-refused':
      return 'That career belongs to the full game. The demo cannot open it — nothing was changed.';
    case 'unreadable':
      return 'That file could not be read as a Rimward career.';
  }
}

/** The demo end card's view-model. Deliberately shaped like {@link EndingView}'s
 *  header so `DemoEndCard` reads as a sibling of `EndingScreen` rather than a new
 *  kind of screen. */
export interface DemoEndView {
  kicker: string;
  title: string;
  body: readonly string[];
  cta: string;
  /** The career summary, reusing the ending screen's row type so the two screens
   *  share one presentation vocabulary. */
  stats: EndingStatRow[];
}

/**
 * T-1703 · The demo's closing screen — NULL unless the ENGINE says the licence
 * has expired (`demoConcluded`). Same contract as {@link endingScreen}: the UI
 * never decides this itself, every string comes from content and every number
 * from engine state.
 *
 * READER: `DemoEndCard` (App.tsx), mounted INSTEAD of the cockpit — the engine
 * refuses every verb from here, so leaving the terminal up would be a screen of
 * dead controls.
 */
export function demoEndCard(game: GameState): DemoEndView | null {
  if (!demoConcluded(game)) return null;
  const registry = game.player.registry;
  const stats: EndingStatRow[] = [
    { key: 'day', label: 'DAYS FLOWN', value: String(DEMO_FINAL_DAY) },
    { key: 'rank', label: 'RANK REACHED', value: RENOWN_RANKS[registry.renownRank].label },
    { key: 'deeds', label: 'DEEDS ON THE BOARD', value: String(registry.earned.length) },
    { key: 'credits', label: 'CREDITS IN HAND', value: game.player.credits.toLocaleString() },
    {
      key: 'debt',
      label: 'GUILD MARKER',
      value: `${Math.max(0, game.player.debt).toLocaleString()} CR`,
    },
    {
      key: 'charted',
      label: 'SYSTEMS CHARTED',
      value: String(game.player.charts.visitedSystemIds.length),
    },
  ];
  return {
    kicker: DEMO_END_CARD.kicker,
    title: DEMO_END_CARD.title,
    body: DEMO_END_CARD.body,
    cta: DEMO_END_CARD.cta,
    stats,
  };
}

// ---- T-311 onboarding & Tour One presentation ----------------------------
//
// The teaching layer for Tour One is PURELY PRESENTATIONAL. It reads existing
// engine state and never mutates a rule. "Which first-time prompts the player
// has already progressed past" is client meta-state (like `fx`), kept in the UI
// store and out of GameState — so the engine stays pure and a JSON round-trip of
// game state is unaffected. This section is the single source of truth for the
// prompts, shared by the selector (what to render) and the store's auto-dismiss
// reconcile (what to mark seen when the taught action lands).

/** Anchor a contextual prompt to the real affordance it teaches. T-1407 adds the
 *  new-verb anchors: `hangout` (the cockpit launch switch) and `port` (the Trade
 *  pane's PORT AUTHORITY block) are new screen-level anchors; `loan` renders
 *  INSIDE the open Hangout panel (a distinct mount — see `onboardingMount`).
 *  explore reuses `starmap` and the contraband nudge reuses `manifest`, since each
 *  teaches an affordance already living in those panes. */
export type OnboardingAnchor =
  'hand' | 'manifest' | 'starmap' | 'combat' | 'hangout' | 'loan' | 'port';

/** One contextual, first-time coach prompt. `active(game)` is a pure predicate
 *  over existing engine state — no new rule, no new field. A prompt shows while
 *  it is active and unseen; it auto-dismisses (is marked seen) the instant the
 *  player performs the taught action and the predicate flips to false. */
export interface OnboardingPrompt {
  id: string;
  title: string;
  body: string;
  anchor: OnboardingAnchor;
  active(game: GameState): boolean;
  /** T-1407 · When false, the prompt is marked seen ONLY via explicit dismissal
   *  (the "Got it" button → `dismissOnboarding`), never by the auto-dismiss
   *  reconcile. The new-verb prompts gate on affordance/location/resource state
   *  (a hangout system, an affordable tank, a contraband board, a purchasable
   *  port) rather than on the taught action landing, so a mere context change —
   *  jumping away from a hangout, a board reroll — would otherwise spuriously
   *  consume them before the player ever acts. Reader: `nextOnboardingSeen`.
   *  Omitted/true for the T-311 delivery-flow prompts, whose predicate flips
   *  false precisely when the taught action completes (so auto-dismiss is right). */
  autoDismiss?: boolean;
}

/**
 * The Tour One prompt registry, in PRIORITY order (first match wins in the
 * selector, so at most one shows at a time — non-modal, never stacked). The
 * encounter coach outranks everything so a mid-delivery interception surfaces
 * the combat teaching instead of the jump teaching. Predicates read only
 * existing engine surface (`encounter`, `day`, `dawnHand`, `activeContract`,
 * `market.manifestBoard`).
 */
export const ONBOARDING_PROMPTS: readonly OnboardingPrompt[] = [
  {
    id: 'first-encounter',
    title: 'Intercepted',
    body: 'A ship has you. Pick a die and a stance — the fuel budget shows if you can afford to fire.',
    anchor: 'combat',
    active: (game) => game.encounter != null,
  },
  {
    id: 'dawn-roll',
    title: 'The Dawn Hand',
    // T-1405 · Hand-size-neutral copy: crew (a First Officer) can grow the dawn
    // hand to 6–7 dice, so the count is no longer a fixed "five".
    body: 'Your dawn hand — one roll each day. Pick a die, then assign it to an action.',
    anchor: 'hand',
    active: (game) => {
      const hand = game.player.dawnHand;
      return game.day === 1 && !!hand && hand.spent.every((s) => !s);
    },
  },
  {
    id: 'first-sign',
    title: 'Sign a Job',
    body: 'Your hold is empty — assign a die to a manifest offer to take a job.',
    anchor: 'manifest',
    active: (game) => game.player.activeContract == null && game.market.manifestBoard.length > 0,
  },
  {
    id: 'first-jump',
    title: 'Plot the Jump',
    body: 'Cargo aboard. Pick a die, plot the destination on the map, then confirm the jump.',
    anchor: 'starmap',
    active: (game) => game.player.activeContract != null,
  },
  // ---- T-1407 · the new-verb coach prompts -------------------------------
  // Appended BELOW the four delivery-flow prompts so the guided first delivery
  // (dawn → sign → jump) is unchanged: these only ever win once that chain is
  // exhausted (or its prompts pre-seen). All five are `autoDismiss: false` — they
  // gate on affordance state, not on the taught action, so only the "Got it"
  // button marks them seen (see the interface note above). Each predicate is a
  // pure read of existing engine/content surface; the reader is `OnboardingCallout`
  // (the screen mount, plus the in-panel `hangout` mount for `first-loan`).
  {
    id: 'first-hangout',
    title: 'The Spacers Hangout',
    body: 'This port keeps a Hangout — open it to wager at the tables or borrow from Penny Wise.',
    // Ranked ABOVE first-loan: at a hangout system both are active, but the
    // player must be told to OPEN the panel before the in-panel loan nudge (which
    // renders inside that panel) can be reached.
    anchor: 'hangout',
    // Same predicate the cockpit's Hangout launcher gates on (STAR_SYSTEMS
    // hasHangout), so the nudge shows exactly where the button does.
    active: (game) => hangoutOpen(game),
    autoDismiss: false,
  },
  {
    id: 'first-loan',
    title: 'Penny Wise Lends',
    body: 'Short on coin? Borrow against your future runs — mind the interest before you sign.',
    anchor: 'loan',
    // Only while the Hangout is open (the mount lives inside the panel) AND no
    // loan is already outstanding — the exact state the `loan-borrow` button is
    // live in.
    active: (game) => hangoutOpen(game) && game.player.loan == null,
    autoDismiss: false,
  },
  {
    id: 'first-contraband',
    title: 'Running Contraband',
    body: 'A CONTRABAND offer pays well but rides dirty — signing it courts inspections. Your call.',
    anchor: 'manifest',
    // A contraband offer is on the board and the hold is free to take it — the
    // decision the player faces at the manifest. Reads CARGO_TYPES.isContraband,
    // the same flag the manifest row badges.
    active: (game) =>
      game.player.activeContract == null &&
      game.market.manifestBoard.some((c) => CARGO_TYPES[c.cargoType]?.isContraband === true),
    autoDismiss: false,
  },
  {
    id: 'first-port',
    title: 'Buy the Port',
    body: 'You can buy a stake in this Port Authority — it pays a launch-fee income every dusk.',
    anchor: 'port',
    // Standing in a purchasable core port you do not already own — the exact
    // state the Trade pane's `buy-port` button is live in (isPurchasablePort +
    // not-owned).
    active: (game) => {
      const here = game.player.currentSystemId;
      return isPurchasablePort(here) && !game.player.ports.some((p) => p.systemId === here);
    },
    autoDismiss: false,
  },
  {
    id: 'first-explore',
    title: 'Off-Lane Sweep',
    body: 'Burn fuel to sweep off-lane for a discovery — salvage, a Signal Fragment, a sealed pod.',
    anchor: 'starmap',
    // The tank can afford the sweep — the same fuel gate `explorationPreview`
    // reports and the sweep button disables on.
    active: (game) => explorationPreview(game).canAfford,
    autoDismiss: false,
  },
];

/**
 * The prompt to show right now AT THIS MOUNT: the first registry prompt that is
 * active for this state, not yet seen, AND routes to `mount` (`onboardingMount`).
 * Returns null when nothing is due for this mount — the callout then renders
 * nothing. Each of the three `OnboardingCallout` mounts asks for its own winner
 * independently, so a winner routed to a closed-panel mount (e.g. `first-loan`
 * inside the closed Hangout panel) cannot hold the slot and silently block a
 * screen-mount prompt behind it (F-121-2). At most one prompt per mount at a
 * time (non-modal, no stacking).
 */
export function activeOnboardingPrompt(
  game: GameState,
  seen: Record<string, true>,
  mount: OnboardingMount,
): OnboardingPrompt | null {
  for (const prompt of ONBOARDING_PROMPTS) {
    if (seen[prompt.id] || !prompt.active(game)) continue;
    if (onboardingMount(prompt.anchor) !== mount) continue;
    return prompt;
  }
  return null;
}

/** T-1407 · Where a prompt's callout renders. `activeOnboardingPrompt` is
 *  mount-aware (F-121-2) — each mount computes its own winner rather than
 *  filtering a single global one, so a prompt anchored to an overlaid surface
 *  cannot be hidden behind that overlay nor block a different mount's prompt. */
export type OnboardingMount = 'screen' | 'combat' | 'hangout';

/** Derive the mount a prompt's anchor renders in: the combat coach rides inside
 *  the combat overlay, the loan nudge inside the open Hangout panel, everything
 *  else at cockpit screen level. Reader: `activeOnboardingPrompt` (each of the
 *  three mounts asks for its own winner). */
export function onboardingMount(anchor: OnboardingAnchor): OnboardingMount {
  if (anchor === 'combat') return 'combat';
  if (anchor === 'loan') return 'hangout';
  return 'screen';
}

/**
 * Auto-dismiss reconcile: given the state BEFORE and AFTER an action, mark seen
 * every not-yet-seen prompt that WAS active and is now inactive — i.e. the player
 * just performed the taught action. This is what makes a prompt disappear the
 * moment its affordance is used ("guided only by visible affordances") without
 * wiring each callsite. Returns the SAME reference when nothing changed so the
 * store never re-renders needlessly.
 */
export function nextOnboardingSeen(
  prev: GameState,
  next: GameState,
  seen: Record<string, true>,
): Record<string, true> {
  let out: Record<string, true> | null = null;
  for (const prompt of ONBOARDING_PROMPTS) {
    if (seen[prompt.id]) continue;
    // T-1407 · Affordance-gated prompts opt out of auto-dismiss: a context change
    // that is NOT the taught action (jumping away from a hangout, a board reroll)
    // must not consume them. They are seen only via explicit dismissal.
    if (prompt.autoDismiss === false) continue;
    if (prompt.active(prev) && !prompt.active(next)) {
      out ??= { ...seen };
      out[prompt.id] = true;
    }
  }
  return out ?? seen;
}

/** True for a Merchant-Guild storylet — the letterhead presentation switch. The
 *  day-30 resolution storylets are presented by the ceremony below, so `guild.`
 *  is the sole letterhead family (their ids start with `resolution.`). */
export function isGuildLetter(storyletId: string): boolean {
  return storyletId.startsWith('guild.');
}

/** True for a day-30 Tour One resolution storylet — the ceremony intercepts
 *  these so the generic storylet launcher/panel never double-renders them. */
export function isResolutionStorylet(storyletId: string): boolean {
  return storyletId.startsWith('resolution.tour-one.');
}

// ---- T-1406 diegetic storylet delivery (display-only) --------------------
//
// PRD §8.3: a storylet is "delivered by the economy — a contract, a price spike,
// a wire item — rather than a quest marker." The old cockpit put every offer
// behind a single badge-counted launcher button; this classifier instead routes
// each live offer to the DIEGETIC surface that opens it (a hold/manifest line, a
// Galactic-Wire bulletin, a Port-Ledger dispatch). It owns NO rule — the routing
// is a pure function of the authored storylet id prefix, and every mutation still
// flows through the store's `resolveStorylet`.

/** The in-fiction surface a storylet opens from. `ceremony` is the day-30 Tour
 *  One resolution, owned by the full-screen ResolutionCeremony (never an opener). */
export type StoryletSurface = 'hold' | 'wire' | 'port' | 'ceremony';

/**
 * Route a storylet id to the diegetic surface that opens it. Pure, id-prefix
 * based, and TOTAL: the `port` default is the reachability guarantee — a newly
 * authored storylet whose prefix isn't listed here still lands on the Port-Ledger
 * dispatches rather than becoming unreachable (the invariant the sweep spec
 * asserts). READERS: the cockpit surface openers (App.tsx TradePane / Wire) and
 * the storylet-delivery sweep spec's audit.
 */
export function storyletSurface(storyletId: string): StoryletSurface {
  if (isResolutionStorylet(storyletId)) return 'ceremony';
  // Hold: cargo riding in the hold, a boarded derelict's pod, a fence at the dock.
  if (
    storyletId.startsWith('cargo.') ||
    storyletId.startsWith('derelict.') ||
    storyletId.startsWith('fence.')
  ) {
    return 'hold';
  }
  // Wire: a Galactic-Wire bulletin — Guild pressure notices and wire rumors.
  if (storyletId.startsWith('wire.') || storyletId.startsWith('guild.')) return 'wire';
  // T-1504b · Era-event tie-ins. An era event ANNOUNCES itself on the wire (engine
  // era.ts `resolveWireCopy` files the def's wireStart/wireEnd as a WireEntry), so
  // the storylet that plays the story behind that bulletin belongs on the same
  // surface — PRD §8.3's "delivered by the economy ... a wire item." READER: the
  // Wire cap-bar bulletin opener (App.tsx `Wire`, `offersForSurface(game,'wire')`),
  // which renders every wire offer generically, so this needs no App change.
  // NOTE: era-tied storylets that are NOT `era.*` keep their own surface —
  // `cargo.medicinals.plague-relief` is a hold/manifest beat and stays 'hold'.
  if (storyletId.startsWith('era.')) return 'wire';
  // Port dispatches: port auditors, passengers, the Wise One / Sage, chains,
  // veteran beats — and, by the total default, anything not classified above.
  return 'port';
}

/** The non-resolution offers currently live — the ground truth the openers and
 *  the sweep audit both project. The day-30 resolution offers are excluded (the
 *  ceremony presents those). READERS: the cockpit surface openers + the audit. */
export function availableStorylets(game: GameState): StoryletOffer[] {
  return game.storylets.available.filter((o) => !isResolutionStorylet(o.storyletId));
}

/** The live offers whose diegetic surface is `surface`. READER: each cockpit
 *  surface opener (hold / wire / port). */
export function offersForSurface(game: GameState, surface: StoryletSurface): StoryletOffer[] {
  return availableStorylets(game).filter((o) => storyletSurface(o.storyletId) === surface);
}

export interface ResolutionCeremonyView {
  outcome: 'cleared' | 'unpaid';
  offer: StoryletOffer;
  rankLabel: string;
  /** The earned `tour_one_cleared` deed's title on the cleared path; null on
   *  unpaid (no deed is earned there). */
  deedTitle: string | null;
  /** The veteran lanes are open — read straight off the engine's flag. */
  veteranUnlocked: boolean;
}

/**
 * The day-30 resolution ceremony view, or null when no resolution is on offer.
 * Pure read of existing engine surface: the forced `resolution.tour-one.*` offer
 * (T-113b), the `veteran.unlocked` flag, and the earned `tour_one_cleared` deed.
 * The ceremony is a PRESENTATION of the engine's already-forced resolution — it
 * owns no rule and resolves through the standard `resolveStorylet` path.
 */
export function resolutionCeremony(game: GameState): ResolutionCeremonyView | null {
  const offer = game.storylets.available.find((o) => isResolutionStorylet(o.storyletId));
  if (!offer) return null;
  const outcome: 'cleared' | 'unpaid' =
    offer.storyletId === 'resolution.tour-one.cleared' ? 'cleared' : 'unpaid';
  const registry = deedRegistry(game);
  const deedTitle =
    outcome === 'cleared'
      ? (registry.earned.find((d) => d.id === 'tour_one_cleared')?.title ?? 'Tour One Complete')
      : null;
  return {
    outcome,
    offer,
    rankLabel: registry.rankLabel,
    deedTitle,
    veteranUnlocked: game.flags['veteran.unlocked'] === true,
  };
}

// ---- T-1605a corrupt-save recovery (display-only) ------------------------
//
// Until this task a save that would not load was swallowed by the store's boot
// path (`readSave`'s bare `catch { return null }`) and the player was handed a
// fresh career with NO notice — and the first autosave after any action then
// overwrote the damaged bytes, losing the career twice over. The fix is two
// halves: the store QUARANTINES the unreadable blob (store.ts), and this
// function turns the engine's own reason into one honest sentence.
//
// PURE TRANSLATION, exactly like `shipyardFailureExplanation`: the UI classifies
// nothing. Save validity is decided in the ENGINE (`save.ts` `loadSave`, which
// throws a typed `SaveError` carrying a `SaveErrorCode`) and proved there
// headlessly (engine `__tests__/save.test.ts` covers all five codes). The store
// reads `err.code`; this function only voices it. No new rule is added anywhere,
// so there is nothing new to make reachable headlessly.

/**
 * Why the cockpit could not boot the player's last career.
 *
 * `SaveErrorCode` is the engine's own union, re-exported through
 * `@spacerquest/engine`. Two UI-side codes extend it, and only one of them is a
 * failure of the SAVE:
 *  - `storage-unavailable` — the save-storage READ itself threw (private mode or
 *    a blocked store on the web build; an unreadable app-data dir on the desktop
 *    shell). The save is not damaged and the message must not say it is;
 *  - `unknown` — something other than a `SaveError` escaped `loadSave`. Honest
 *    catch-all: never claim a cause we do not have.
 *
 * T-1703 adds a THIRD UI-side code, and it is likewise not damage:
 *  - `edition-refused` — the save loaded and validated perfectly, but it is a
 *    FULL-game career and this is the DEMO build (engine `promoteEdition`
 *    refuses that direction). Closing that hole is the whole reason the refusal
 *    exists: without it a player could fly veteran content on a demo licence
 *    simply by dropping a save file in. The bytes are untouched and are
 *    quarantined like any other unopenable save, so the career is not lost —
 *    the full build opens it.
 *
 * READER: `App.tsx`'s `RecoveryNotice`, via {@link saveRecoveryMessage}.
 */
export type SaveRecoveryCode =
  SaveErrorCode | 'storage-unavailable' | 'unknown' | 'edition-refused';

export interface SaveRecoveryNotice {
  code: SaveRecoveryCode;
  /**
   * True when the unreadable bytes were successfully copied to the quarantine
   * key (`sq.save.v1.corrupt`), so the message may promise they were kept. False
   * when the copy failed (full quota / blocked store) — the sentence then says
   * so rather than promising custody the game does not have.
   * READER: {@link saveRecoveryMessage}'s third clause.
   */
  preserved: boolean;
}

/**
 * One clause per cause, in the player's language. `satisfies Record<...>` is the
 * exhaustiveness guard that matters here: if the engine ever adds a
 * `SaveErrorCode`, this object stops type-checking instead of silently handing
 * the player `undefined` prose.
 */
const SAVE_RECOVERY_CAUSE = {
  'corrupt-json': 'the save data was damaged and could not be read',
  'bad-envelope': "the save file's header was unreadable",
  'invalid-state': 'that save no longer matches this build of Rimward',
  'no-migration': 'there is no upgrade path from that save’s version',
  'future-version': 'that save was written by a NEWER build of Rimward',
  // T-1701a: the ONLY cause whose wording depends on which store the cockpit is
  // running against — every other clause is about the save's own bytes, which
  // are identical on both backends. See `STORAGE_UNAVAILABLE_CAUSE` below.
  'storage-unavailable': 'save storage could not be reached',
  unknown: 'the save could not be loaded',
  // T-1703: NOT damage, and the wording is careful about that — the save is fine,
  // it is this BUILD that cannot open it.
  'edition-refused': 'that career belongs to the full game and the demo cannot open it',
} satisfies Record<SaveRecoveryCode, string>;

/**
 * T-1701a · The one storage-dependent clause, per backend.
 *
 * "this browser" became a LIE the moment the Electron shell shipped: on desktop
 * there is no browser, there is an app-data folder, and telling a desktop player
 * to check their browser's site settings sends them somewhere that cannot help.
 * The rebalance-fallout rule applies to prose the same way it applies to
 * numbers — the sentence had to move in the same commit as the shell.
 *
 * READER of `StorageBackend` here: {@link saveRecoveryMessage} and
 * {@link saveWriteFailedMessage}; the value comes from `storage.ts`'s
 * `storageBackend` and is passed in by `App.tsx`.
 */
const STORAGE_UNAVAILABLE_CAUSE = {
  browser: 'this browser blocked access to save storage',
  desktop: 'the game could not reach its save folder',
} satisfies Record<StorageBackend, string>;

/** The quarantine key the message names. Mirrors the store's `CORRUPT_SAVE_KEY`
 *  — the sentence must name the exact key a player (or a bug report) can go
 *  looking for, so the two are stated once each and asserted together in
 *  `e2e/recovery.spec.ts`. */
const QUARANTINE_KEY_LABEL = 'sq.save.v1.corrupt';

/**
 * The corrupt-save notice, as one sentence in three clauses — cause, consequence,
 * custody. The player is TOLD (a) their last career could not be loaded and why,
 * (b) that the fresh career on screen is a fallback and not their save, and (c)
 * exactly what happened to the unreadable bytes.
 *
 * `storage-unavailable` is deliberately not accused of damage, and the custody
 * clause is never a promise the store did not keep (`preserved`).
 */
export function saveRecoveryMessage(
  notice: SaveRecoveryNotice,
  // T-1701a. Defaulted to `'browser'` so the ~30 existing call sites and tests
  // that predate the desktop shell keep their exact wording; `App.tsx` passes
  // the live `storageBackend`.
  backend: StorageBackend = 'browser',
): string {
  const cause =
    notice.code === 'storage-unavailable'
      ? STORAGE_UNAVAILABLE_CAUSE[backend]
      : SAVE_RECOVERY_CAUSE[notice.code];
  const custody = notice.preserved
    ? `The unreadable save was kept as “${QUARANTINE_KEY_LABEL}” and has not been overwritten.`
    : 'Nothing could be kept.';
  return `Your last career could not be loaded — ${cause}. A fresh career has been started. ${custody}`;
}

// ---------------------------------------------------------------------------
// T-1605c · THE WRITE SIDE OF THE SAME HONESTY.
//
// T-1605a made a save that would not LOAD say so (`saveRecoveryMessage` above).
// This says so when a save will not WRITE. The trigger is not hypothetical: this
// task measured a 1,000-day career at ~11 MB of JSON, against a ~5 MB
// localStorage quota per origin in Chromium — a long career crosses it around
// day ~420, and until now `store.ts autosave()` swallowed the resulting
// QuotaExceededError in a bare catch. The cockpit kept playing and kept writing
// nothing.
//
// T-1701a · THE QUOTA IS GONE ON DESKTOP, THE MESSAGE IS NOT. The Electron shell
// writes saves as ordinary files in the OS app-data dir, so the ~5 MB ceiling
// that motivated this message does not exist there. The message stays because
// the web build is still the dev/playtest loop (TECH-STACK §3) and still has the
// quota, and because a disk write can still fail (full disk, read-only profile
// dir). What changed is that it no longer says "the browser" when there is no
// browser — see `backend` below.
//
// Player-facing copy lives HERE, in format.ts, not in packages/content: content
// is game DATA (systems, storylets, balance tables), and this is UI chrome about
// the browser's storage, which the engine knows nothing about.
//
// PURE, like every other function in this file: no state, no I/O. The store owns
// the flag (`CockpitState.saveWriteFailed`), App.tsx owns the banner, this owns
// only the sentence.
// ---------------------------------------------------------------------------

/**
 * The autosave-failed notice, as one sentence in three clauses — cause,
 * consequence, and what the player can actually DO about it.
 *
 * The remedy clause names saving to a slot because that is the one write path
 * still worth trying: it is a different key, so it can succeed where the
 * autosave's ~11 MB blob does not, and `store.ts saveToSlot` reports its OWN
 * failure honestly if it also fails (T-312). The cause clause does not guess
 * between "quota full" and "storage blocked" — the browser does not reliably
 * distinguish them across engines, and claiming the wrong one would be worse
 * than naming both.
 *
 * READER: `App.tsx`'s `SaveWriteFailedNotice`, rendered while
 * `CockpitState.saveWriteFailed` is true. Asserted in
 * `e2e/save-write-failure.spec.ts`.
 */
export function saveWriteFailedMessage(
  // T-1701a. Defaulted for the same reason as `saveRecoveryMessage`'s parameter.
  backend: StorageBackend = 'browser',
): string {
  // The two clauses that name the CONTAINER. Everything else is backend-neutral
  // and stays word-for-word what T-1605c shipped — including the three phrases
  // `e2e/save-write-failure.spec.ts` asserts ("no longer being saved
  // automatically", "lost when you close or reload", "Save to a slot"), which is
  // why both variants still contain all three.
  const refuser =
    backend === 'desktop' ? 'the write to disk failed' : 'the browser refused the write';
  const closing = backend === 'desktop' ? 'close or reload the game' : 'close or reload the page';
  return (
    `This career is no longer being saved automatically — ${refuser}, ` +
    'usually because save storage is full or blocked. Everything you do from here will be ' +
    `lost when you ${closing}. Save to a slot from Settings to keep it.`
  );
}

// ---------------------------------------------------------------------------
// T-1701b · WHETHER THIS BUILD UPDATES ITSELF.
//
// One honest sentence per state, and honesty is the whole point: the shipped
// desktop package resolves to `inert` (no feed is compiled in, and
// electron-builder's `publish` is `null`, so no `app-update.yml` exists either),
// so the row must NOT imply that an update will ever arrive. A "checking for
// updates…" that never checks is the kind of small lie that turns into a
// support ticket when a patch does not land.
//
// READER of `storage.ts`'s `updateStatus`: `App.tsx`'s `BuildRow`. `null` means
// the web build — there is no shell, and the browser is what fetches a new
// version.
// ---------------------------------------------------------------------------
export function updateStatusMessage(status: UpdateStatus | null): string {
  switch (status) {
    case 'armed':
      return 'Checking for updates in the background.';
    case 'inert':
      // The sentence the shipped desktop package actually shows today.
      return 'Automatic updates are off in this build.';
    case 'unsupported':
      return 'This build does not check for updates.';
    default:
      return 'Updates are handled by your browser.';
  }
}

// ---------------------------------------------------------------------------
// T-1702a · WHETHER STEAM IS RECORDING YOUR DEEDS.
//
// The same honesty rule `updateStatusMessage` is held to, and for the same
// reason: `unavailable` is the state EVERY build this repo produces resolves to
// today (no app id is compiled in), so the sentence must not imply a connection
// that is not there — and it must not read as a fault either, because running
// without Steam is a fully supported way to play. The web sentence must never
// claim Steam; neither desktop sentence may mention a browser there is none of.
//
// READER of `storage.ts`'s `steamStatus`: `App.tsx`'s `SteamRow`. `null` means
// the web build.
// ---------------------------------------------------------------------------
export function steamStatusMessage(status: SteamStatus | null): string {
  switch (status) {
    case 'ready':
      return 'Connected — Deeds are recorded as achievements.';
    case 'unavailable':
      // Deliberately not "failed" or "error": the game is working exactly as
      // designed, and the Registry itself is unaffected.
      return 'Not connected — Deeds are still kept in your Registry.';
    default:
      return 'Steam achievements are available in the desktop version.';
  }
}

/**
 * T-1702a · The mirror's own progress line, so a player can see that the mirror
 * EXISTS and not merely that a connection does.
 *
 * `earned` counts Deeds only; `total` is the full manifest (every Deed plus the
 * Conqueror capstone), which is why a captain who has earned every Deed still
 * reads N-of-N+1 until they take the rank. That is honest rather than tidy —
 * the capstone is a real thing left to do.
 *
 * READER of `steam.ts`'s `ACHIEVEMENT_MANIFEST` (its length) and of
 * `state.game.player.registry.earned`: `App.tsx`'s `SteamRow`.
 */
export function steamAchievementsMessage(
  status: SteamStatus | null,
  earned: number,
  total: number,
): string {
  const tally = `${earned} of ${total}`;
  if (status === 'ready') return `${tally} mirrored to Steam.`;
  return `${tally} earned — they will mirror when you play on Steam.`;
}

// ---------------------------------------------------------------------------
// T-1702b · WHETHER YOUR CAREERS ARE BACKED UP, AND WHAT FRIENDS SEE.
//
// Held to exactly the honesty rule `steamStatusMessage` and `updateStatusMessage`
// are held to, and for the same reason: `unavailable` is the state EVERY build
// this repo produces resolves to today (no app id is compiled in), so neither
// sentence may imply a connection that is not there, and neither may read as a
// FAULT — playing without Steam is a fully supported way to play. The web
// sentences must never claim Steam; the desktop sentences must never mention a
// browser there is none of.
//
// THE CLOUD SENTENCE IS ALSO A PROMISE, so it is worded to the policy the code
// actually implements (`packages/desktop/src/cloud.ts`, Decision B): Steam Cloud
// SEEDS a machine with no career and BACKS UP the one you have. It is not a
// two-way merge, and the row does not hint at one.
//
// READERS of `storage.ts`'s `cloudStatus` / `cloudRestored`: `App.tsx`'s
// `SteamRow`. `null` means the web build.
// ---------------------------------------------------------------------------
export function cloudStatusMessage(status: CloudStatus | null, restored: number): string {
  if (status === 'ready') {
    if (restored > 0) {
      const saves = restored === 1 ? 'save' : 'saves';
      // The RESTORE, made visible. Without this line a player whose career came
      // down from the cloud has no way to know it did.
      return `Synced — ${restored} ${saves} restored from Steam Cloud this launch.`;
    }
    return 'Synced — your careers are backed up to Steam Cloud.';
  }
  if (status === 'unavailable') {
    // Deliberately not "failed" or "off": nothing is broken, and the careers are
    // exactly as safe as they were before this feature existed.
    return 'Not synced — your saves are kept on this machine.';
  }
  return 'Steam Cloud is available in the desktop version.';
}

/**
 * T-1702b · The rich-presence sentence — THE PROSE THE SHELL DELIBERATELY DOES
 * NOT OWN.
 *
 * `packages/desktop` publishes the two custom Steamworks keys plus the
 * `steam_display` token `#Status_InSystem`; the token's TEXT is authored on the
 * partner site as `Day {#day} — {#system}`, and this function emits that same
 * sentence for the Settings row so a player can read exactly what their friends
 * see. `docs/STEAM-ACHIEVEMENTS.md` carries the token line and a unit test
 * asserts the doc and this function cannot drift apart.
 *
 * Composing this string inside the window manager would have been a rule in the
 * shell; composing it twice, differently, would have been a lie on one of the
 * two surfaces.
 */
export function richPresenceLine(system: string, day: number): string {
  return `Day ${day} — ${system}`;
}

/**
 * T-1702b · What the Settings "Shown to friends" row says.
 *
 * Keyed off `SteamStatus`, not `CloudStatus`: presence rides the same client
 * Steam itself resolved (`packages/desktop/src/steam.ts`'s Decision B), so
 * "connected to Steam" is precisely the condition under which a friend sees
 * anything.
 */
export function presenceMessage(steam: SteamStatus | null, line: string): string {
  if (steam === 'ready') return line;
  if (steam === 'unavailable') return 'Not connected — nothing is shown to friends.';
  return 'Rich presence is available in the desktop version.';
}

// ---- T-1406 · The Top Gun Honor List -------------------------------------
//
// RECOVERED FROM THE ORIGINAL, not invented. `SP.TOP.txt` in the 1991 Apple II
// source (this repo's own history, `7ca606d7^:Decompile/Source-Text/`) prints an
// "-=*=- Top Gun Honor List -=*=-" with eight titles — Fastest Drives, Fanciest
// Cabin, Best Life Support, Strongest Weapons, Best Navigation, Best Robotics,
// Strongest Shields, Best All-Around Ship — each ranked on `strength x condition`
// per component, the all-around title summing all eight. Our `effectiveScore` is
// that same quantity.
//
// WHY THIS AND NOT A NET-WORTH BOARD. A leaderboard on credits would simply
// re-crown the archetype that already dominates by refusing all risk — the trader
// hoards, and hoarding would win. The 1991 board cannot be won by hoarding: you
// have to SPEND the money on the ship to place. That is also the answer to the
// measured problem that the best weapon in the game is a net-negative purchase —
// it does not have to pay for itself in credits if it wins you a title.
//
// EIGHT TITLES, NOT ONE LADDER. Measured across the shipped policies, the board is
// multi-polar: the fighter takes Weapons and Hull, the veteran takes Shields, the
// smuggler takes Drives and Navigation. Four playstyles, four things to be best at.
//
// SCOPE — N6: A REAL 31-WAY BOARD. v1 shipped this as a PERSONAL board (the player's
// fit against the ladder's ceiling, drawn as completion bars) for one reason only:
// `NpcState` had no ship, so there was no field to rank. N1 landed `NpcState.ship:
// ShipState` — the SAME type the player flies, validated by the same schema — so the
// board is now what the original was: the whole registry, ranked, one holder (or a
// tie) per title. The progress bar is gone; a contest replaced it.
//
// THE STANDING CONSTRAINT (worklist, "same rules, no exemptions") IS SATISFIED
// STRUCTURALLY, not by convention: the ranking reader below takes an ACTOR
// ({@link HonorCaptain}) and never touches `game.player.*`. There is exactly one
// scoring path, `effectiveScore` — the engine's own derived value — and it is applied
// to `captain.ship[id]` whoever the captain is. There is no NPC branch to drift.
//
// WHAT THE ORIGINAL DID, LINE BY LINE (`sp.top.s`, quoted so the fidelity claims here
// are checkable):
//   - it walked EVERY registry record (`for x=1 to oa`), not the caller's own;
//   - it scored `i=(d1*d2)` per component and kept the running max;
//   - TIES WERE CO-HELD, not broken: `if (td=i) and (len(td$)<40) td$=td$+"/"+nz$`
//     appends an equal scorer to the holder line, and only a strictly greater score
//     (`if td<i td$=nz$:td=i`) takes the title outright;
//   - THE HOLDER LINE WAS BUDGETED AT 40 CHARACTERS and overflow was dropped silently;
//   - a record marked with a leading `*` was SKIPPED, not deleted
//     (`if (left$(na$,1)="*") or (left$(q2$,1)="*") next`).
// All five behaviours are reproduced below. See {@link HONOR_HOLDER_LINE_BUDGET},
// {@link rankTitle} and {@link honorField}.
//
// ONE DELIBERATE DIVERGENCE FROM THE ORIGINAL, per BALANCE-POLICY Part B rule 3.
// `sp.top.s` credits the SHIP (`nz$`, the second registry field); this board credits
// the CAPTAIN (`NpcState.name`). Rimward's cast is authored as captains — the wire
// links captain names (`npcNameIndex`), the dossier is a captain's, the Hangout lists
// captains, and a grudge is held by a captain — so a board that named hulls would be
// the only surface in the game that does not name the person. The scoring, the ties
// and the budget are untouched.
//
// WHY THIS BOARD AND NOT A NET-WORTH ONE — unchanged from v1, and it matters more now
// that the field is real: a leaderboard on credits would re-crown the archetype that
// already dominates by refusing all risk. This one cannot be won by hoarding.

/** One name on a title's holder line. `isPlayer` is the ONLY thing that
 *  distinguishes the player anywhere in this board's data. */
export interface HonorHolder {
  /** The captain's name, or {@link PLAYER_HONOR_LABEL} for the player, who has no
   *  name in `GameState` to print. */
  name: string;
  isPlayer: boolean;
}

export interface HonorTitle {
  id: ShipComponentId | 'allAround';
  /** The 1991 title, verbatim where one existed. */
  title: string;
  /** The WINNING score in the field — `effectiveScore` for the component, or its
   *  sum over all eight for the all-around title. 0 when nobody is ranked. */
  score: number;
  /** Every captain tied at `score`, in display order, cut to the original's
   *  40-character line budget. Empty only when the field is empty. */
  holders: HonorHolder[];
  /** Co-holders the budget cut. The original dropped them silently; counting them
   *  is the one presentational addition, because a 31-captain field ties far more
   *  often than a BBS registry of individually-fitted ships did. */
  overflow: number;
  /** What the player scored for this title — their standing, not their progress. */
  playerScore: number;
  /** The player's COMPETITION rank: `1 + (captains scoring strictly higher)`. 1
   *  means the player holds or co-holds the title. See the tiebreak note on
   *  {@link rankTitle} for why this is the tie-blind form. */
  playerRank: number;
  /** How many captains were ranked for this title — the player plus every living
   *  NPC. Per-title rather than global so a future qualification rule (a title
   *  nobody can hold without, say, a fitted module) needs no new field. */
  field: number;
}

/** The 1991 titles, in the order `SP.TOP.txt` prints them. `hull` carries no
 *  individual title in the original — it counts only toward Best All-Around — so
 *  it is reported here the same way. */
const HONOR_TITLES: readonly { id: ShipComponentId; title: string }[] = [
  { id: 'drives', title: 'Fastest Drives' },
  { id: 'cabin', title: 'Fanciest Cabin' },
  { id: 'lifeSupport', title: 'Best Life Support' },
  { id: 'weapons', title: 'Strongest Weapons' },
  { id: 'navigation', title: 'Best Navigation' },
  { id: 'robotics', title: 'Best Robotics' },
  { id: 'shields', title: 'Strongest Shields' },
];

/** What the player is called on a board where every other row is a named captain.
 *  `GameState` carries no player name — there is nothing else to print, and
 *  inventing one here would be a second source of truth for the captain's identity
 *  the moment the game grows one. */
export const PLAYER_HONOR_LABEL = 'YOU';

/** The original's holder-line budget, recovered verbatim from `sp.top.s`
 *  (`len(td$)<40`). Note the original tests the length BEFORE appending, so a line
 *  may finish slightly over 40; that off-by-a-name is reproduced rather than
 *  "corrected", because the budget's job is to stop a runaway line, not to be exact. */
const HONOR_HOLDER_LINE_BUDGET = 40;

/**
 * A ranked captain — the ACTOR the whole board is written against. Player and NPC
 * both arrive here as `{ name, ship }` and nothing downstream can tell them apart
 * except the `isPlayer` flag, which is used for DISPLAY ONLY and never reaches
 * {@link rankTitle}'s arithmetic.
 */
interface HonorCaptain {
  name: string;
  isPlayer: boolean;
  ship: ShipState;
}

/**
 * THE FIELD: the player plus every LIVING ranked NPC, in one list.
 *
 * DEAD CAPTAINS (N3, LANDED 2026-07-29 — this was the seam; it is now the feature).
 * A dead captain's record STAYS, marked dead rather than deleted, because the wire,
 * the Honor List's history and the player's grudges all still reference it. The board
 * therefore has to SKIP the marked records rather than lose them, and marking dead
 * without this clause ranks corpses forever.
 *
 * The original had exactly this case and handled it exactly this way: `sp.top.s`
 * skips a registry record whose name begins with `*` and ranks the rest. This is the
 * fifth of the 1991 registry's behaviours, which N6 shipped only as a seam (worklist
 * item OI-2) and N3 closes. No re-architecting was needed — every score, tie, rank
 * and budget below already works on a field of any size, including the empty one,
 * which is what a career that outlives its whole cohort eventually produces.
 */
function honorField(game: GameState): HonorCaptain[] {
  // QUEST CHARACTERS ARE NOT ON THE BOARD (fixed 2026-07-29, alongside N3's dead
  // filter). N3's roster split gave `state.npcs` 41 records — the 30 simulation
  // captains plus the 11 authored quest characters, who need `NpcState` records
  // because storylet triggers and dispositions look them up by id, but who take no
  // turn and never buy a component. Left in, they sat on this board forever at
  // their day-1 fit: eleven permanent, frozen entries on a leaderboard about who is
  // doing well, and a "31-way board" silently become 42-way. The board is the
  // SIMULATION field — the captains actually playing. The membership test is
  // content's shared `isSimulatedCaptain`, not a Set built here: the same
  // distinction spelled locally at four sites is what produced this bug and three
  // others (see the predicate's own comment).
  return [
    { name: PLAYER_HONOR_LABEL, isPlayer: true, ship: game.player.ship },
    ...game.npcs
      .filter((npc) => isSimulatedCaptain(npc.profileId) && !npc.dead)
      .map((npc) => ({ name: npc.name, isPlayer: false, ship: npc.ship })),
  ];
}

/**
 * Rank the field on one title.
 *
 * TIES ARE CO-HELD, NOT BROKEN — recovered, not invented. With 31 captains over
 * eight titles a tie is the common case, not the corner one. (Until N2 it was the
 * ONLY case: `npcShipForTier` varied only hull, drives and pods, so six of the
 * seven component titles opened as a whole-field 31-way tie. N2's stat-driven seed
 * makes day 1 a contest — but ties of two to twenty remain routine as captains buy
 * their way up the same nine-rung yard ladder.) A tiebreak would
 * therefore be doing most of the work of the board, and any tiebreak available here
 * — roster index, profile tier, credits — would be a rule this file invented about
 * who is better, i.e. exactly the "never restate an engine rule" failure. The
 * original's answer is better and is the one used: everyone at the top score holds
 * the title jointly.
 *
 * DETERMINISM, which the co-holding makes load-bearing: `holders` is ordered by NAME
 * (plain code-unit compare, no locale — a locale collator would make the board
 * depend on the machine that rendered it), and captain names are unique. The player
 * is PINNED FIRST among co-holders, and that is the one place display order is not
 * alphabetical: with a 31-way tie the 40-character budget shows about three names,
 * so a player who genuinely co-holds a title would otherwise never see themselves on
 * the line they are on. It moves no rank — `playerRank` counts captains scoring
 * STRICTLY HIGHER and is blind to order, to `isPlayer` and to the budget, so the
 * player cannot out-rank a captain they merely tied.
 *
 * A TITLE NOBODY HOLDS IS NOT REACHABLE, and there is deliberately no branch for it.
 * Every title is scored by the same total function over the same eight components, so
 * the only way to vacate one is to empty the field — and the field always contains at
 * least the captain reading the board, who is the one thing the N3 dead-filter can
 * never remove. (Every `effectiveScore` is > 0 as well: `strength` is 1..199, so the
 * `0` seed on the max below can never be mistaken for a real score.) The day a title
 * grows a QUALIFICATION rule — "only ships with a fitted Star-Buster contend" — is the
 * day this becomes reachable; `field` is already per-title rather than global so that
 * rule has somewhere to land, and that is the point at which a vacant branch should be
 * written, tested, and not before.
 */
function rankTitle(
  id: ShipComponentId | 'allAround',
  title: string,
  field: readonly HonorCaptain[],
  scoreOf: (ship: ShipState) => number,
  playerScore: number,
): HonorTitle {
  const scored = field.map((captain) => ({ captain, score: scoreOf(captain.ship) }));
  const score = scored.reduce((best, row) => Math.max(best, row.score), 0);

  const tied = scored
    .filter((row) => row.score === score)
    .map((row) => row.captain)
    .sort((a, b) => {
      if (a.isPlayer !== b.isPlayer) return a.isPlayer ? -1 : 1;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });

  // `sp.top.s`: the first holder is set unconditionally, each further tie is appended
  // only while the line so far is still under budget.
  const holders: HonorHolder[] = [];
  let line = 0;
  for (const captain of tied) {
    if (holders.length > 0 && line >= HONOR_HOLDER_LINE_BUDGET) break;
    line += (holders.length > 0 ? 1 : 0) + captain.name.length;
    holders.push({ name: captain.name, isPlayer: captain.isPlayer });
  }

  return {
    id,
    title,
    score,
    holders,
    overflow: tied.length - holders.length,
    playerScore,
    // COMPETITION rank, the tie-blind form: it counts captains who beat the player
    // and nothing else. It cannot see `isPlayer`, holder order or the line budget, so
    // no display choice above can move it.
    playerRank: 1 + scored.filter((row) => row.score > playerScore).length,
    field: scored.length,
  };
}

/** Best All-Around sums ALL EIGHT components (hull included), exactly as the
 *  original's `tgfx` subroutine does. Read through `SHIP_COMPONENTS` and
 *  `effectiveScore` so a change to the roster of components or to the score formula
 *  moves the title with it — never a restated sum. */
function allAroundScore(ship: ShipState): number {
  return SHIP_COMPONENTS.reduce((sum, def) => sum + effectiveScore(ship[def.id]), 0);
}

export function honorList(game: GameState): HonorTitle[] {
  const field = honorField(game);
  // `playerScore` is the SAME `scoreOf` applied to the player's ship, never a
  // second expression that happens to agree — the player is one captain in the
  // field, and the row's own summary of them must be the field's arithmetic.
  const rank = (
    id: ShipComponentId | 'allAround',
    title: string,
    scoreOf: (ship: ShipState) => number,
  ): HonorTitle => rankTitle(id, title, field, scoreOf, scoreOf(game.player.ship));

  const rows = HONOR_TITLES.map(({ id, title }) =>
    rank(id, title, (ship) => effectiveScore(ship[id])),
  );
  rows.push(rank('allAround', 'Best All-Around Ship', allAroundScore));
  return rows;
}
