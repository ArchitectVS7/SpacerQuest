import {
  AnonymousInterceptorKind,
  ExploreModuleContentId,
  FactionId,
  PoiType,
  PowerTier,
  RenownRankId,
  RouteDangerLevel,
  EraId,
  FlagValue,
  Stat,
  StoryletChoiceDefinition,
  StatBlock,
} from '@spacerquest/content';

/**
 * T-1703 · WHICH EDITION A CAREER IS BEING FLOWN AS.
 *
 * The demo gate is an ENGINE rule keyed off this one persisted scalar, not a UI
 * hide. Three requirements forced that: the gate must survive a save, it must be
 * provable headlessly, and it must be PROMOTABLE on import ("demo-save carries
 * into full game") — which one scalar makes a one-line promotion instead of a
 * save converter.
 *
 * THE SPLIT: the BUILD decides which edition a career is born in (cockpit
 * `BUILD_EDITION`, compiled into the bundle by Vite `define`) or promoted to;
 * the ENGINE decides what a demo career may do. That is the same seam
 * `storage.ts` already draws between platform identity and rules.
 */
export type Edition = 'full' | 'demo';

export interface DawnHand {
  dice: number[];
  spent: boolean[];
  /** T-1306 · Re-roll charges left today (PRD §7 "allow one re-roll"). Set at
   *  dawn to the crew-granted count (dice.ts `dawnDiceModifiers`, summed across
   *  crew — realized max 1), decremented each `Reroll` action (actions/crew.ts
   *  `resolveReroll`), and read by the sim protocol (legalActions advertises
   *  Reroll only while > 0). OPTIONAL so the ~20 inline `{ dice, spent }` test
   *  constructions still typecheck; `rollDawnHand` always sets it. Serializes
   *  mid-day (an unspent charge survives a JSON round-trip). */
  rerollsRemaining?: number;
}

export interface CheckResult {
  die: number;
  modifier: number;
  total: number;
  dc: number;
  success: boolean;
  margin: number;
  nat20: boolean;
  nat1: boolean;
}

export interface PendingTravelState {
  origin: number;
  destination: number;
  fuelUsed: number;
}

/**
 * A live world economic event (T-107). Transient world weather — a blockade, a
 * plague, a dilithium rush — that re-prices the map. Nothing derivable is stored:
 * the modifiers are always recomputed from content by `defId` (era.ts). This is
 * a DIFFERENT concept from the campaign-phase `era` field ('TOUR_ONE'|'VETERAN').
 */
export interface EraEventState {
  defId: string;
  /** First day the event is active. */
  startedDay: number;
  /** First day the event is NO LONGER active (active while day < endsDay). */
  endsDay: number;
  /** Systems in scope — the epicentre payments/fuel/danger read against. */
  affectedSystemIds: number[];
}

export interface EncounterInterceptorState {
  id: string;
  source: 'named' | 'anonymous';
  name: string;
  shipName: string;
  shipClass?: string;
  homeSystem?: string;
  kind?: AnonymousInterceptorKind;
  rosterIndex?: number;
  profileId?: string;
  stats: StatBlock;
  tier: PowerTier;
  flaw?: string;
  flawDc?: number;
}

export interface EncounterState {
  id: string;
  pendingTravel: PendingTravelState;
  interceptor: EncounterInterceptorState;
  routeDangerLevel: RouteDangerLevel;
  routeDangerChance: number;
  encounterRoll: number;
  round: number;
  /** Hull points the interceptor starts with; each successful fight volley
   *  removes one. Scales with interceptor tier (1-5). Always present. */
  enemyHull: number;
}

export enum DayPhase {
  DAWN = 'DAWN',
  WIRE = 'WIRE',
  DAY = 'DAY',
  DUSK = 'DUSK',
}

export interface EarnedDeedState {
  id: string;
  title: string;
  citation: string;
  day: number;
  /**
   * Where in `state.eventLog` the event that earned this deed sits.
   *
   * N11 · OPTIONAL, and its absence is a statement about the batch, not a gap. A
   * captain's deed accrual runs over a LOCAL per-captain event batch that never
   * enters `state.eventLog` (see `npc.ts` — putting a captain's `TradeEvent` in the
   * shared array would earn the PLAYER the deed), so there is no index into that log
   * to record and none is written. A number here would be a fabricated pointer:
   * the reverted attempt (`7334c5d5`) stuffed `eventIndex: 0` into every NPC row,
   * which is exactly what the field's absence now prevents. Player rows still always
   * carry one — `evaluateDeeds` passes `sourceStartIndex`, so the anchor is real.
   *
   * READER: `ui/src/format.ts` `deedRegistry`, which sorts by it; that reader only
   * ever sees player rows and nullish-guards the comparison anyway.
   */
  eventIndex?: number;
}

export interface DeedRegistryState {
  earned: EarnedDeedState[];
  renownRank: RenownRankId;
  /** Cached historical match count per deed id, so deed evaluation stays O(source
   *  events) instead of rescanning the full event log on every call. */
  matchCounts: Record<string, number>;
}

export interface StoryletOffer {
  storyletId: string;
  title: string;
  prose: string;
  choices: readonly {
    id: string;
    label: string;
    prose: string;
    requirements?: StoryletChoiceDefinition['requirements'];
  }[];
  day: number;
  scheduled: boolean;
}

export interface StoryletScheduleState {
  storyletId: string;
  dueDay: number;
  sourceStoryletId: string;
  sourceChoiceId: string;
}

export interface StoryletState {
  available: StoryletOffer[];
  completed: Record<string, number>;
  scheduled: StoryletScheduleState[];
  offeredToday: string[];
}

export interface TradeEvent {
  type: 'TradeEvent';
  characterId: string;
  actionDetails: string;
  action?:
    | 'buy-fuel'
    | 'sign-contract'
    | 'haggle'
    | 'deliver-cargo'
    | 'forfeit-cargo'
    /** T-1604b · The PLAYER-INITIATED hold release (UGT finding F2). Deliberately
     *  NOT folded into 'forfeit-cargo': that value is the succession/death forfeit
     *  and is read as such by the UI obituary (`packages/ui/src/format.ts`
     *  `successionSummary`) and by the sim route-leg tracker's death path — reusing
     *  it would file a voluntarily dumped crate as part of a captain's death
     *  notice. Emitted with `success: true` when the hold was cleared (carrying
     *  `destination` / `cargoType` / `payment` of the abandoned run) and
     *  `success: false` when there was nothing to abandon (no die spent). */
    | 'abandon-contract'
    | 'pay-debt-failed';
  success?: boolean;
  amount?: number;
  fuelAmount?: number;
  cost?: number;
  destination?: number;
  cargoType?: number;
  payment?: number;
}

/**
 * T-1401 · The typed provenance of a wire line, stamped at the engine emission
 * site so a reader never has to reverse-engineer it from prose. Replaces the UI's
 * fragile `msg.endsWith(flawDetail)` heuristic (format.ts `isFlawOverrideMessage`,
 * ~L326):
 *   - 'flaw-override' — set ONLY at the one site where an NPC's flaw overrode
 *     their day (day.ts, the `lastAction.type === 'FlawOverride'` branch). This is
 *     the load-bearing discriminator: the UI can now colour a flaw-override line
 *     without string-matching content `FLAWS[*].detail` suffixes (which false-
 *     positives whenever a plain wire line happens to end with the same words).
 *   - 'npc'          — an actor/NPC-driven line (bond interventions, contract
 *     snipes, the semi-random notable-NPC action, nat-wire stories, NPC odd-jobs).
 *   - 'plain'        — a world/system/economy line (era weather, deeds registry,
 *     succession, travel notices, exploration sweeps, port income).
 * READER: T-1402's `wireKind` (ui format.ts), which consumes this field directly
 * instead of the suffix scan. The sim's `countDailyEvents` (packages/sim) counts
 * WireEntry BY TYPE and does not read `kind`, so the STATS report is unaffected.
 */
export type WireEntryKind = 'flaw-override' | 'npc' | 'plain';

/**
 * T-1505b · Why the Nemesis-crossing stake was refused. The order of the union is
 * the AUTHORITATIVE refusal order `quoteCrossingStake` walks (nemesis.ts) — the
 * first failing clause is the one reported, so a captain is told the single next
 * thing to fix rather than a wall of unmet conditions:
 *   1. 'already-committed' — the stake is already signed; the gate is open.
 *   2. 'not-conqueror'     — rank below CROSSING_REQUIRED_RANK (T-1308 reader b).
 *   3. 'fragments-undecoded' — fewer than the full decoded set.
 *   4. 'debt-outstanding'  — a live Guild debt or Penny Wise loan. You cannot
 *      bet what you owe: the stake is "everything you OWN".
 *   5. 'insufficient-stake' — balance below CROSSING_STAKE_MIN_CREDITS.
 *   6. 'ship-cannot-carry-the-burn' — the tank does not already hold the jump's
 *      fuel. There is no port on the far side; the ledger is explicit that the
 *      ship must CARRY the burn, not buy it en route.
 *
 * READERS: the `NemesisCrossing{kind:'stake-refused'}` event's `reason`, rendered
 * by the UI's `crossingStatus` lock line and the wire ticker's refusal line.
 */
export type CrossingRefusal =
  | 'already-committed'
  | 'not-conqueror'
  | 'fragments-undecoded'
  | 'debt-outstanding'
  | 'insufficient-stake'
  | 'ship-cannot-carry-the-burn';

/**
 * T-131 · The typed refusal reasons an `Explore` can resolve to (the
 * `ExplorationFailed.reason` set). Kept as a NAMED ALIAS — the exact shape and
 * for the exact reason `PortEventFailReason` (below) is one: the resolver, the
 * zod enum (`schema.ts`) and the UI's notice mapper (`ui/format.ts`
 * `explorationFailExplanation`) must all read ONE source of truth, and an
 * exhaustive `switch` over a named union is a compile-time guarantee that a new
 * reason cannot render as silence. (It regressed exactly that way once:
 * `recovery-in-progress` shipped at T-111 and fell through the UI's switch to
 * `null` until T-131 closed it.)
 *
 * THREE CLASSES, and which resources are charged differs per class:
 *  - RESOLVED fails — `nav-check` / `insufficient-fuel`: a real detour was
 *    attempted, so the die IS spent (and fuel burned, for `nav-check`).
 *  - MALFORMED-input fails (T-1003) — `no-die` / `invalid-die-index` /
 *    `die-already-spent`: the Explore action named no usable die, so there was
 *    nothing to spend. NO die is spent and NO fuel is burned; these replace the
 *    raw `Error`s that used to crash the UGT adapter, keeping the typed-fail-
 *    event convention (every player-possible input is an event, never a throw).
 *  - VERB-REFUSED (T-111) — `recovery-in-progress`: the ship is already
 *    committed to an open recovery (`player.recovery !== null`), so the verb
 *    itself is refused before any resource is touched. NO die, NO fuel.
 *  - PAYMENT-REFUSED (T-131) — `insufficient-dice`: a class of its own, and the
 *    ONLY one where the find was real. The detour flew, the nav check passed,
 *    `PoiDiscovered` fired, the sweep's die and the fuel are spent — and the
 *    drawn row's band carries an `apCost` the remaining dawn hand could not
 *    cover, so the PAYOUT is forfeited. No downgrade, no partial payout.
 */
export type ExplorationFailReason =
  | 'nav-check'
  | 'insufficient-fuel'
  | 'no-die'
  | 'invalid-die-index'
  | 'die-already-spent'
  | 'recovery-in-progress'
  | 'insufficient-dice';

/**
 * T-135 · The `HangoutEvent.failReason` union, EXTRACTED from its inline site so
 * `schema.ts` can pin it value-for-value (`_covHangoutFailReason`), exactly as
 * {@link ExplorationFailReason} is pinned. `AssertEventKeys` compares KEYS, so a
 * reason added here and forgotten in the schema's `z.enum` would sail past it and
 * a save carrying the new reason would fail to parse at load — the same hole T-131
 * closed for the exploration reasons.
 *
 * The first five are the shipped set (malformed die input, an opponent who is not
 * in-system, a venue the house does not run). The last three are the Liar's Dice
 * gates (`docs/LIARS-DICE_REDESIGN.md` §9.3 + §5.1):
 *   - 'dare-hand-open'    — a `VisitHangout{venue:'dare'}` while a hand is already
 *     open (gate 2). Refused BEFORE the die is spent.
 *   - 'no-dare-hand'      — a `Dare` move with no open hand (gate 3). A typed
 *     no-op, deliberately NOT a throw (unlike `resolveCombat`).
 *   - 'illegal-dare-move' — a `Dare` move that is not in `legalDareMoves`, or
 *     whose quantity/face arithmetic breaks §5.1's lattice. Refused rather than
 *     clamped into legality, and nothing is spent or moved.
 *   - 'opponent-broke'    — T-145 · a `VisitHangout{venue:'dare'}` naming a ROSTER
 *     opponent whose live purse is <= 0 (`docs/LIARS-DICE-PROGRESSION_SPEC.md`
 *     §7.4). Refused BEFORE the die is spent, like every other pre-spend refusal.
 */
export type HangoutFailReason =
  | 'no-die'
  | 'invalid-die-index'
  | 'die-already-spent'
  | 'no-opponent'
  | 'venue-not-offered'
  | 'dare-hand-open'
  | 'no-dare-hand'
  | 'illegal-dare-move'
  | 'opponent-broke';

/**
 * T-135 · One standing claim in a Liar's Dice hand: "there are at least
 * `quantity` dice showing `face`, across all eight dice in play."
 * `face` 1..6, `quantity` 1..8 (`docs/LIARS-DICE_REDESIGN.md` §2.2).
 */
export interface DareBid {
  quantity: number;
  face: number;
}

/** T-135 · One line of the hand's PUBLIC record — everything the UI's bid history
 *  and T-137's balance fold need, and nothing that would leak a hidden die. */
export interface DareBidEntry {
  actor: 'player' | 'dealer';
  move: 'bid' | 'raise-face' | 'raise-quantity' | 'raise-both';
  quantity: number;
  face: number;
  /** Credits this actor paid into their own escrow for this move. 0 for the
   *  opening bid (an opening bid is not a raise — §4.2). */
  antePaid: number;
}

/**
 * T-135 · The open Liar's Dice hand (`docs/LIARS-DICE_REDESIGN.md` §2.2). A SCENE,
 * the architectural twin of {@link EncounterState}: it has a counterparty whose
 * purse is already debited, an escrow neither side owns yet, and hidden
 * information belonging to the other side — none of which belongs on the
 * captain's own sheet.
 *
 * THERE IS NO `toAct` FIELD, deliberately (§2.3): the dealer answers synchronously
 * inside the player's own action, so every PERSISTED hand is player-to-act by
 * construction and a stored `toAct` would be a constant.
 */
export interface DareHandState {
  /** `dare-${day}-${dealerId}-${dayEventCount}` — deterministic, no rng draw.
   *  The `enc-${day}-${dayEventCount}-…` precedent (actions/travel.ts). */
  id: string;
  /** FROZEN at open. The port whose band, ante and venue params govern the WHOLE
   *  hand, even if a later reload sees different content (§4.3). */
  systemId: number;
  dealerId: string;
  openedDay: number;
  /** 4 × d6, roll order preserved (NOT sorted — a sorted hand is a different hand
   *  to look at, and the UI animates the roll). */
  playerDice: number[];
  /** 4 × d6. HIDDEN: never enters an event until a challenge reveal (§10.2). */
  dealerDice: number[];
  /** The standing claim, or null before the player opens the bidding. */
  bid: DareBid | null;
  /** Who owns the standing bid — decides who wins a challenge. null iff bid is null. */
  bidder: 'player' | 'dealer' | null;
  /** The per-side seed, resolved and clamped once at open (§3). */
  seedWager: number;
  /** The per-raise ante, resolved once at open (§4). */
  ante: number;
  /** ESCROW, not a tally: credits already debited from `player.credits`. */
  potPlayer: number;
  /** ESCROW: credits already debited from the dealer's purse. */
  potDealer: number;
  /** True after a Peek ATTEMPT, pass or fail. One per hand (§8). */
  peekUsed: boolean;
  /** The one dealer die a successful Peek revealed, or null. */
  peekedDealerDie: { index: number; value: number } | null;
  history: DareBidEntry[];
  /**
   * T-145 · Which POOL the counterparty came from
   * (`docs/LIARS-DICE-PROGRESSION_SPEC.md` §5.3). Decides money routing (§7.1 —
   * an `NpcState.credits` vs a `liarsDicePurses` entry), whether
   * `applyDisposition` runs at all (§7.6), which policy answers the bid (§3.8)
   * and whether the win writes to `liarsDiceBeaten` (§6.2).
   */
  opponentKind: 'roaming' | 'roster';
  /**
   * T-145 · The CONCRETE archetype for this hand, resolved ONCE at open (§3.6)
   * and never re-rolled mid-hand. **Never the string `'mixed'`** — a mixed row is
   * resolved through `resolveMixedArchetype` at open and the concrete result is
   * what is stored. NULL iff `opponentKind === 'roaming'`.
   */
  opponentArchetype: 'optimal' | 'bad' | 'random' | null;
  /**
   * T-145 · FROZEN AT OPEN (§4.6): the number of dice on EACH side, and the
   * length of both dice arrays. 4 | 5 | 6. A hand opened at four dice stays a
   * four-dice hand until it settles, even if a settlement crosses a ladder
   * threshold in between.
   */
  dicePerSide: number;
  /** T-145 · FROZEN AT OPEN: `2 * dicePerSide`, the claim ceiling every legality
   *  site reads instead of the `DARE_MAX_QUANTITY` constant (§4.6). */
  maxQuantity: number;
  /** T-145 · FROZEN AT OPEN: the effective wager ceiling for this hand. `null`
   *  encodes tier 5 (unlimited — `headroomFor` returns MAX_SAFE_INTEGER and the
   *  solvency clamp is the only cap). T-145 writes the port's `wager.max` at every
   *  open; T-146 is what makes the value move. */
  bandMax: number | null;
}

/** T-135 · The seven moves one `Dare` action can carry (§9.1). */
export type DareMoveKind =
  'bid' | 'raise-face' | 'raise-quantity' | 'raise-both' | 'challenge' | 'fold' | 'peek';

/** T-135 · How a Liar's Dice hand ended (§10.2). `timeout-fold` is the dusk
 *  clause's outcome and is identical to `player-fold` in every other respect. */
export type DareOutcome =
  'challenge-win' | 'challenge-loss' | 'player-fold' | 'dealer-fold' | 'timeout-fold';

// Discriminator for game events
export type GameEvent =
  | { type: 'DawnRoll'; day: number; hand: number[] }
  | {
      type: 'StatCheck';
      actor: string;
      stat: Stat;
      dc: number;
      result: CheckResult;
      /** Where the check came from. The `npc-*` contexts (T-1201) tag NPC
       *  day-resolution rolls so readers (the wire in day.ts / ui format.ts,
       *  and T-1202's deeper surface) can discriminate per-verb without
       *  stringly-parsing `actor`. */
      actionContext?:
        | 'haggle'
        | 'storylet'
        | 'npc-trade'
        | 'npc-travel'
        | 'npc-combat'
        | 'npc-patrol'
        | 'npc-socialize'
        // T-1207: an interceptor's post-kill retreat PILOT roll. Discriminated
        // from `npc-combat` (enemy pressure / run-pursuit) so the wire scanner
        // (wire.ts classifyCheck) routes a nat-20 here to the "miracle burn"
        // retreat bucket instead of the generic combat bucket.
        | 'retreat'
        // T-1303: the PLAYER's Spacer's Dare GUILE roll at the Hangout. Routes a
        // nat here to the `gamble` wire bucket (wire.ts classifyCheck) — the
        // player-side twin of the NPC `npc-socialize` context, so a natted Dare
        // "makes the wire" as a Spacer's Dare story (PRD §6 sample line).
        | 'gamble'
        // N3: a captain's rolls INSIDE an interdiction, one per round per stance.
        // Discriminated from the `npc-*` VERB contexts above on purpose, and the
        // distinction is load-bearing twice over:
        //   · The T-1201 verb ⟺ StatCheck invariant counts checks carrying the
        //     verb's OWN context, so an interdiction cannot inflate the sim's
        //     trade-failure denominator (see npc.test.ts).
        //   · PRD §6 guarantees "a natural 20 or natural 1 always generates a
        //     story" for ANY check, player or NPC — so these must reach the wire,
        //     and each stance routes to the bucket that reads correctly for it.
        | 'npc-encounter-fight'
        | 'npc-encounter-run'
        | 'npc-encounter-talk';
    }
  | { type: 'FlawCheck'; npcId: string; flaw: string; die: number; dc: number; resisted: boolean }
  | { type: 'NpcAction'; npcId: string; actionDetails: string }
  | {
      /**
       * N3 · An interdiction answered a captain's jump, resolved inside the dusk
       * tick. ONE SUMMARY EVENT PER ENCOUNTER, not one per round, and that is a
       * cost decision: 30 captains jump every dusk into an append-only event log
       * that T-1605c measured at ~94,000 entries on a 1,000-day career. The
       * per-round detail that survives is the `StatCheck` stream (which the wire
       * needs for nat-20 stories); everything else is folded into this line.
       */
      type: 'NpcEncounter';
      day: number;
      npcId: string;
      interceptorId: string;
      interceptorName: string;
      /** The stances the captain played, in order — their answer to the pirate. */
      stances: readonly ('talk' | 'run' | 'fight')[];
      /** 'survived' is the round-cap break-off: held the field, won nothing. */
      resolution: 'talked-down' | 'escaped' | 'defeated' | 'destroyed' | 'survived';
      rounds: number;
      /** Tribute handed over, when the captain talked their way out. */
      creditsPaid?: number;
      /** Wreck salvage collected, when the captain won. Same
       *  COMBAT_SALVAGE_PER_TIER the player is paid — no separate NPC rate. */
      salvageCredits?: number;
    }
  | {
      /**
       * N3 · A captain lost their ship and is gone for good. PERMANENT — no
       * succession, no replacement, no respawn (owner ruling, 2026-07-28). This is
       * the NPC twin of `ShipLost`, kept SEPARATE rather than reusing it: every
       * `ShipLost` reader (wire prose, the UI obituary log, `applySuccession`)
       * treats that event as the player's, and a shared type would have every one
       * of them narrating the player's death when a stranger died.
       */
      type: 'NpcShipLost';
      day: number;
      npcId: string;
      npcName: string;
      interceptorId: string;
      interceptorName: string;
      /** Where the wreck was left — the lane's destination end. */
      systemId: number;
    }
  | {
      /** A same-system NPC took a job off the player's manifest board at dusk
       *  (T-106 contract competition). */
      type: 'ContractClaimed';
      day: number;
      npcId: string;
      cargoType: number;
      destination: number;
      payment: number;
    }
  | {
      /** Per-NPC disposition toward the player moved. Clamped to [-10, +10]. */
      type: 'DispositionChanged';
      day: number;
      npcId: string;
      delta: number;
      disposition: number;
      // T-1303 adds the four Hangout beats ('dare' / 'befriend' / 'insult' /
      // 'meet') as distinct reasons so a reader (T-1404's pane, the wire, tests)
      // can attribute a shift to the venue that caused it.
      reason:
        | 'tribute'
        | 'defeat'
        | 'player-fled'
        | 'decay'
        | 'storylet'
        | 'contract-sniped'
        | 'dare'
        | 'befriend'
        | 'insult'
        | 'meet'
        // T-1304: defaulting on a Penny Wise loan sours her hard — the grudge is
        // read by the interceptor selection weighting (travel.ts chooseWeighted).
        | 'loan-default'
        // T-1305: a NAMED patrol captain who catches you smuggling holds a grudge
        // (engine actions/patrol.ts); read by the same interceptor weighting/talk-DC.
        | 'contraband-caught';
    }
  | {
      /**
       * T-1503 · The player's standing with one of the four galactic powers moved.
       * Clamped to [REPUTATION_MIN, REPUTATION_MAX] (content factions.ts). Emitted
       * only when the value actually changed (a clamped no-op emits nothing), by
       * `reputation.ts` `applyReputation`. `reputation` is the value AFTER the move.
       * READERS: the UI standing readout (format.ts `factionStanding` reads
       * player.reputation directly; this event is the wire/log trail of the move),
       * and the alliance-arc sim tests (which assert the cross-faction shift by
       * faction+delta). The nested state it reports lives on `PlayerState.reputation`
       * (v6→v7 save migration + round-trip regression test).
       */
      type: 'ReputationChanged';
      day: number;
      faction: FactionId;
      delta: number;
      reputation: number;
      reason:
        | 'patrol-tribute'
        | 'patrol-evaded'
        | 'smuggling-caught'
        | 'fence-dealt'
        | 'port-deal'
        | 'questline';
    }
  | {
      /** A bonded NPC intervened at dusk on the player's behalf (T-106 bond hook). */
      type: 'BondIntervention';
      day: number;
      npcId: string;
      kind: 'fuel-gift' | 'drive-off';
      amount?: number;
    }
  | { type: 'WireEntry'; day: number; message: string; kind: WireEntryKind }
  | {
      /** A world economic event began at dusk; active from the next dawn (T-107). */
      type: 'EraEventStarted';
      day: number;
      defId: string;
      name: string;
      endsDay: number;
      affectedSystemIds: number[];
    }
  | {
      /** A world economic event expired at the day boundary (T-107). */
      type: 'EraEventEnded';
      day: number;
      defId: string;
      name: string;
    }
  | { type: 'DayAdvanced'; day: number }
  | {
      type: 'DeedEarned';
      day: number;
      deedId: string;
      title: string;
      citation: string;
      renownRank: RenownRankId;
    }
  | {
      type: 'RenownRankUp';
      day: number;
      previousRank: RenownRankId;
      newRank: RenownRankId;
      deedCount: number;
    }
  | {
      type: 'ActionBlocked';
      day: number;
      // T-1703 WIDENED this enum with 'Port' and 'Crew'. T-1306/T-1307 deliberately
      // kept them out ("actions that have no reason to be blocked") and that was
      // right at the time; the demo gate is the FIRST rule that gives them a
      // reason, so the enum grows with it rather than the gate inventing a
      // parallel refusal shape.
      actionType:
        'Trade' | 'Travel' | 'Shipyard' | 'Storylet' | 'Explore' | 'VisitHangout' | 'Port' | 'Crew';
      // 'destination-locked' (T-1101): a Travel to a sealed system (Andromeda /
      // special) before the 'nemesis.crossing.unlocked' flag lifts it.
      // 'no-hangout' (T-1303): a VisitHangout at a system without a Spacers
      // Hangout (hasHangout !== true) — refused with no die spent, no throw.
      // 'career-ended' (T-1505c): the ship stands on the far side of the Nemesis
      // shear (engine `careerEnded`), where the career is over and every verb is
      // inert — refused with no die spent, no throw. READERS: the terminal guard
      // in `applyPlayerAction` (day.ts) emits it; the sim's `legalActions`
      // (protocol.ts) refuses to advertise anything that would earn it.
      // 'demo-locked' (T-1703): a demo career attempted a gated verb — a `Port`
      // buy or a `Crew` hire (engine `demoLocks`). Refused with no die spent, no
      // throw. READERS: the demo gate in `applyPlayerAction` (day.ts) emits it;
      // `legalActions` refuses to advertise either verb in a demo state, and the
      // cockpit renders both controls DISABLED with the content tease.
      // 'demo-ended' (T-1703): a demo career kept playing past DEMO_FINAL_DAY
      // (engine `demoConcluded`). Every blockable verb is inert, exactly as on the
      // far side of the shear. READER: the same pair, plus the cockpit's end card.
      // 'active-dare-hand' (T-135): an open Liar's Dice hand (`state.dareHand`)
      // blocks the world exactly as an encounter does — a captain cannot fly to
      // another system and ask a dealer four jumps away to answer a standing bid.
      // Refused with no die spent, no throw, `dayEventCount` untouched. This
      // widens `reason` ONLY: `actionType` already carries all six blockable
      // verbs. READERS: the gate in `applyPlayerAction` (day.ts) emits it; the
      // sim's `legalActions` advertises only `Dare` while a hand is open, so a
      // headless driver never earns it.
      reason:
        | 'active-encounter'
        | 'active-dare-hand'
        | 'destination-locked'
        | 'no-hangout'
        | 'career-ended'
        | 'demo-locked'
        | 'demo-ended';
    }
  | {
      /** An Explore nav check succeeded and charted a point of interest
       *  (T-111a). The reward (loot/fragments) is attached in T-111b. */
      type: 'PoiDiscovered';
      day: number;
      poiId: string;
      poiType: PoiType;
      systemId: number;
      name: string;
    }
  | {
      /**
       * An Explore attempt paid out nothing (T-111a). WHY is the `reason`, and
       * the four classes it splits into — with which resources each charges —
       * are documented once on `ExplorationFailReason` above.
       */
      type: 'ExplorationFailed';
      day: number;
      systemId: number;
      reason: ExplorationFailReason;
    }
  | {
      /** A boarded POI's loot roll yielded salvage — real credits (T-111b). */
      type: 'SalvageRecovered';
      day: number;
      poiId: string;
      systemId: number;
      amount: number;
    }
  | {
      /** A boarded POI's loot roll yielded a sealed Contraband pod (T-111b). The
       *  carrying choice is surfaced as the `derelict.sealed-pod` storylet. */
      type: 'ContrabandFound';
      day: number;
      poiId: string;
      systemId: number;
    }
  | {
      /**
       * T-112 · A `unique-item` outcome GRANTED its item (docs/EXPLORE_REDESIGN.md
       * §4). Emitted by `exploreOutcomes.ts` `applyUniqueItem` AFTER the effect has
       * been applied, so the wire reads effect-then-record in the order it
       * happened. Carries the ITEM id only — never the realized effect, which is
       * looked up from content by every reader (the same discipline `crew` and
       * `RecoveryState` keep). Reaches the player through `ui/format.ts`
       * `explorationOutcome`, which resolves the id to its content NAME and
       * invents no effect of its own.
       *
       * Emitted on BOTH grant paths for free: the same-day resolve and T-111's
       * deferred dusk payout both run through `resolveExploreOutcome`, so a
       * band-3/4 item grants at the dusk of `dueDay` with no second code path.
       */
      type: 'UniqueItemAcquired';
      day: number;
      itemId: string;
      poiId: string;
      systemId: number;
    }
  | {
      /**
       * T-111 · A find too valuable to lift in a day OPENED the single recovery
       * slot (docs/EXPLORE_REDESIGN.md §3). Emitted by `resolveExploration`'s
       * draw when the drawn row's band carries `recoveryDays > 0`. The payoff is
       * NOT resolved here — it rolls at the dusk of `dueDay`.
       */
      type: 'RecoveryStarted';
      day: number;
      outcomeId: string;
      poiId: string;
      /** THE ANCHOR — leaving this system before payout forfeits the op. */
      systemId: number;
      dueDay: number;
    }
  | {
      /** T-111 · An open recovery reached its `dueDay` and PAID OUT at dusk
       *  (`day.ts` endDay). Emitted immediately BEFORE the payload resolves, so
       *  the wire reads payout-then-detail in the order the player experiences
       *  it. `valuePoints` is read off the row at payout, never off the save. */
      type: 'RecoveryPaidOut';
      day: number;
      outcomeId: string;
      poiId: string;
      valuePoints: number;
    }
  | {
      /**
       * T-111 · An open recovery ended with NO payout. Three ruled causes:
       *  - 'departed'        — dusk found the captain outside the anchor system
       *                        (`day.ts` endDay, §3.3(a)); a location predicate,
       *                        not a hook on the Travel verb.
       *  - 'succession'      — the ship was lost; the op was moored to it
       *                        (`legacy.ts` applySuccession, §3.3(b)). The
       *                        KNOWLEDGE half survives: the DiscoveredPoi is on
       *                        `charts` and is inherited.
       *  - 'unknown-outcome' — content drift: the stored `outcomeId` (or the
       *                        stored POI) no longer resolves at payout
       *                        (`day.ts` endDay). Clear and move on; a stored
       *                        content id must never be able to throw.
       */
      type: 'RecoveryAbandoned';
      day: number;
      outcomeId: string;
      reason: 'departed' | 'succession' | 'unknown-outcome';
    }
  | {
      /** A Signal Fragment entered the Nemesis file (T-111b). Fired only when the
       *  fragment was actually NEW — a duplicate grant emits nothing. */
      type: 'FragmentAcquired';
      day: number;
      fragmentId: string;
      source: SignalFragmentRecord['source'];
      /** Running fragment count after the grant (== decoded-lore index length). */
      fragmentCount: number;
      /** The POI the fragment was looted from, when applicable. */
      poiId?: string;
    }
  | {
      /** The Sage decoded a held fragment into lore (T-111b). Fired only when a
       *  held, still-undecoded fragment was actually decoded. */
      type: 'FragmentDecoded';
      day: number;
      fragmentId: string;
    }
  | {
      /**
       * T-1505b · The Nemesis crossing (PRD §8.1: "the arc ends at the event
       * horizon, with everything you own on the table"). One event covers the whole
       * terminus via the `kind` sub-discriminator:
       *   - 'stake-committed' — the stake was signed over. `stakeCredits` is the
       *     balance surrendered (credits are zeroed). This is the ONLY thing that
       *     sets `nemesis.crossing.unlocked`.
       *   - 'stake-refused'   — the refusal ladder rejected the attempt.
       *     `reason` carries WHICH clause failed; NOTHING was mutated, and the
       *     attempt is re-attemptable at the next dawn.
       *   - 'crossed'         — the ship arrived at NEMESIS_SYSTEM_ID.
       *
       * This is an `eventLog` entry, NOT a GameState field: the crossing's own
       * state rides on the already-persisted `flags` map (see below), so there is
       * no save migration. It still carries a schema variant + drift guard
       * (schema.ts) so a mid-run save round-trips it.
       *
       * FLAGS this arc writes (all on the existing `GameState.flags`):
       *   - `nemesis.crossing.unlocked`      (true) — lifts the NEMESIS gate.
       *     READERS: day.ts's destination gate, the sim protocol's legalActions,
       *     the UI starmap band (format.ts `starmapProjection`), and the crossing
       *     storylet's own retire-trigger.
       *   - `nemesis.crossing.stake.credits` (number) — what was surrendered.
       *   - `nemesis.crossing.stake.day`     (number) — when.
       *     READER of both: the UI's `crossingStatus` → the `crossing-status` pane.
       *
       * READERS of this event: the UI wire ticker (`eventToWire` renders the
       * refusal line — the one crossing beat the galaxy does not report, so the
       * captain's own terminal logs it), plus the engine/sim/e2e assertions.
       */
      type: 'NemesisCrossing';
      day: number;
      kind: 'stake-committed' | 'stake-refused' | 'crossed';
      /** Credits surrendered — present on 'stake-committed' only. */
      stakeCredits?: number;
      /** Which clause of the stake ladder refused — 'stake-refused' only. */
      reason?: CrossingRefusal;
    }
  | {
      /**
       * T-1303 · A player Hangout visit resolved (PRD §7). One event per
       * `VisitHangout` action, covering every venue:
       *   - dare: `opponentId` + `wager` + `playerWon` + `creditsDelta` (signed
       *     from the player's view: +wager on a win, −wager on a loss). The Dare's
       *     nat-20/nat-1 wire story is produced downstream by T-1202's scanner
       *     (natWireStories), not here.
       *   - befriend / insult / meet: `opponentId`, and `success` for the
       *     befriend GUILE check (insult always lands; meet is unconditional).
       *   - meet / rumor: `rumors` — facts synthesized from LIVE NPC state.
       *   - a typed FAIL carries `failReason` and resolves nothing (mirrors
       *     ExplorationFailed: malformed die input or an opponent not in-system).
       * READER: the T-1404 Hangout pane (and the wire, for the Dare nat case).
       * This is an `eventLog` entry, not a GameState field — no save migration,
       * but it carries a schema variant + drift guard (schema.ts).
       */
      type: 'HangoutEvent';
      day: number;
      venue: 'dare' | 'meet' | 'befriend' | 'insult' | 'rumor';
      opponentId?: string;
      wager?: number;
      playerWon?: boolean;
      creditsDelta?: number;
      success?: boolean;
      rumors?: string[];
      // T-120: 'venue-not-offered' — the port's venue definition
      // (`PORT_HANGOUTS`) does not list this beat. ONE rule, evaluated the same
      // way at every port; refused before the die is spent.
      // T-135: the union is now NAMED (`HangoutFailReason`) so schema.ts can pin
      // it value-for-value, and carries the three Liar's Dice gates.
      failReason?: HangoutFailReason;
    }
  | {
      /**
       * T-135 · A Liar's Dice hand OPENED (`docs/LIARS-DICE_REDESIGN.md` §10.2).
       *
       * THE HIDDEN-DICE DISCIPLINE: this carries `playerDice` and NEVER
       * `dealerDice`. `state.eventLog` is serialized into the save and rendered
       * line by line by the UI, so a `DareHandStarted` carrying both hands would
       * leak the dealer's hand to the pane AND into a file a curious player can
       * read. The dealer's dice enter an event on exactly two outcomes (see
       * `DareHandResolved.dealerDice`) and nowhere else.
       */
      type: 'DareHandStarted';
      day: number;
      handId: string;
      opponentId: string;
      systemId: number;
      seedWager: number;
      ante: number;
      /** The PLAYER's dice. The dealer's are NEVER here. */
      playerDice: number[];
      /**
       * T-145 · The hand's FROZEN dice-per-side (§5.3). OPTIONAL, deliberately:
       * `GameEventSchema` runs in Zod STRIP mode, which drops unknown keys but
       * does NOT tolerate a missing REQUIRED one, so a required field here would
       * make every v14 save's existing `DareHandStarted` entries fail to parse at
       * v15. The live UI reads `hand.dicePerSide` off `DareHandState`, where it is
       * required; this is the event-log copy.
       */
      dicePerSide?: number;
      /** T-145 · The ROSTER opponent's authored `lines.tableTalk`, present iff the
       *  counterparty is pool A (§8 row 17a). A roaming hand carries nothing. */
      opponentLine?: string;
      /**
       * T-146 · "READ THE TABLE" — one line naming how this opponent plays,
       * present iff the hand OPENED at unlock tier ≥ 3 (§4.5, §8 row 17b). Pool A
       * reads the resolved archetype; pool B is derived from the profile's GUILE.
       *
       * OPTIONAL for the same strip-mode reason as `dicePerSide` above, and that
       * is what lets it land WITHOUT a save-version move: adding an optional field
       * to an existing event variant is not a schema change (`docs/VERSIONING.md`
       * §2). It is also MATHEMATICALLY INERT — one string on one event, touching
       * no dice, cost, legality or probability, and it must stay that way.
       */
      opponentRead?: string;
    }
  | {
      /** T-135 · A Peek was attempted (§8). One per hand, pass or fail; the die is
       *  spent either way. `dieIndex`/`value` are present only on success. */
      type: 'DarePeeked';
      day: number;
      handId: string;
      success: boolean;
      /** Present only on success. */
      dieIndex?: number;
      value?: number;
    }
  | {
      /** T-135 · One bid or raise landed, by either side (§10.2). The public
       *  record of the hand: the claim, what it cost, and both escrows after it. */
      type: 'DareBidPlaced';
      day: number;
      handId: string;
      actor: 'player' | 'dealer';
      move: 'bid' | 'raise-face' | 'raise-quantity' | 'raise-both';
      quantity: number;
      face: number;
      antePaid: number;
      potPlayer: number;
      potDealer: number;
    }
  | {
      /**
       * T-135 · A Liar's Dice hand SETTLED (§10.2). Emitted exactly once per hand,
       * immediately before the terminal `HangoutEvent` that nine shipped readers
       * key on (§10.3) — the two are a pair, and the `HangoutEvent`'s shape is
       * deliberately unchanged so those readers need no defensive edit.
       */
      type: 'DareHandResolved';
      day: number;
      handId: string;
      opponentId: string;
      outcome: DareOutcome;
      /** The standing bid at resolution; null iff the hand folded before any bid. */
      bid: DareBid | null;
      /** Present ONLY on the two challenge outcomes. */
      actualCount?: number;
      playerDice: number[];
      /** Present ONLY on the two challenge outcomes — a fold NEVER reveals (§6.1). */
      dealerDice?: number[];
      /** From the player's view: `+potDealer` on a win, `−potPlayer` on a
       *  loss/fold (§6.3's ledger). */
      creditsDelta: number;
      /** The delta PASSED to applyDisposition (pre-clamp). The APPLIED delta is on
       *  the neighbouring DispositionChanged, which is the existing convention.
       *  T-145: legitimately 0 on EVERY roster hand — pool A is outside the NPC
       *  economy, so there is no record to move (§7.6). Not a regression. */
      dispositionDelta: number;
      /** T-145 · The ROSTER opponent's authored `lines.win` when THEY won, or
       *  `lines.lose` when they lost; present iff pool A (§8 row 20c). Optional for
       *  the same strip-mode reason as `DareHandStarted.dicePerSide`. */
      opponentLine?: string;
    }
  | {
      /**
       * T-147 · A LIAR'S DICE SET CLOSED — the one-time completion signal
       * (`docs/LIARS-DICE-PROGRESSION_SPEC.md` §6.2 steps 2-3).
       *
       * EMITTER: `settleDareHand` (`actions/dare.ts`), and nowhere else. It fires
       * only on the hand that writes the LAST missing id into
       * `player.liarsDiceBeaten` — T-145's `includes` guard makes a rematch win
       * silent and a ROAMING win never reaches the branch at all, so "exactly
       * once, ever" is a property of the emission site rather than of any de-dup
       * bookkeeping downstream.
       *
       * READERS: the fifteen completion deeds in `packages/content/src/deeds.ts`
       * (fourteen `liars_dice_cleared_<port>` + `liars_dice_grand_slam`), which
       * reach it through `evaluateDeeds` and the `EVENT_PATHS` allowlist entry in
       * `deeds.ts`. `scope` is the discriminator between the two families;
       * `systemId` is what tells the fourteen apart.
       *
       * When a port clear and the whole-roster clear land on the SAME hand, two
       * events are emitted — `port` first, then `roster`, the order a player
       * experiences them.
       */
      type: 'LiarsDiceSetCleared';
      day: number;
      /** `'port'` — every seat at ONE house. `'roster'` — every seat everywhere. */
      scope: 'port' | 'roster';
      /** The port whose set closed; for `scope:'roster'`, the port of the final win. */
      systemId: number;
      /** Whose defeat closed the set. */
      opponentId: string;
      /** `liarsDiceBeaten.length` AFTER the write that closed it. */
      beatenCount: number;
    }
  | {
      /**
       * T-1304 · A Penny Wise lending beat (PRD §7.5). One event covers the whole
       * loan lifecycle via the `kind` sub-discriminator:
       *   - 'borrowed'  — a loan was taken. `principal`, `outstanding` (= principal
       *     at issue), `dailyRate`, `dueDay`. Credits went UP by `principal`.
       *   - 'accrued'   — a dusk's interest was added. `interest`, `outstanding`
       *     (post-accrual). Emitted by day.ts endDay while a loan is live.
       *   - 'repaid'    — the player paid down the loan. `amountPaid`, `outstanding`
       *     (post-payment), `cleared` (true when the loan was fully paid off and
       *     nulled — the collection status is gone).
       *   - 'defaulted' — the due day was crossed unpaid; `status` flipped to
       *     'defaulted'. `outstanding` at default. Paired with a one-time
       *     DispositionChanged{reason:'loan-default'} and a wire entry.
       *   - 'failed'    — a typed no-op (mirrors HangoutEvent/ExplorationFailed):
       *     malformed die input, or a lending rule refused it. NO die spent, NO
       *     credit change. `failReason` names why.
       * READER: the T-1404 Penny Wise desk pane (and the wire). This is an
       * `eventLog` entry, not a GameState field — the loan STATE lives on
       * PlayerState.loan (which ships the v2→v3 migration); this event carries a
       * schema variant + compile-time drift guard (schema.ts) only.
       */
      type: 'LoanEvent';
      day: number;
      kind: 'borrowed' | 'accrued' | 'repaid' | 'defaulted' | 'failed';
      lender?: string;
      principal?: number;
      dailyRate?: number;
      dueDay?: number;
      interest?: number;
      amountPaid?: number;
      outstanding?: number;
      cleared?: boolean;
      failReason?:
        | 'no-die'
        | 'invalid-die-index'
        | 'die-already-spent'
        | 'already-has-loan'
        | 'no-loan'
        | 'insufficient-credits'
        // T-120: the port runs no credit desk — 'borrow'/'repay' are absent from
        // its venue definition. The HangoutEvent sibling carries the same value.
        | 'venue-not-offered';
    }
  | {
      /**
       * T-1306 · A dawn-die re-roll (PRD §7 "allow one re-roll"). On SUCCESS every
       * field is set: `dieIndex`, the `previous` face, the `result`, and the
       * `rerollsRemaining` after the charge was spent. On a typed FAIL only
       * `failReason` is set — no charge consumed, no die mutated (mirrors the
       * HangoutEvent / LoanEvent typed-fail convention: every player-possible
       * input is an event, never a throw). Serialized in eventLog; the drift guard
       * (schema.ts) keeps this in lockstep with the interface. READER: T-1405's UI
       * (the reroll button + result); the sim protocol reads `rerollsRemaining`
       * off the hand, not this event.
       */
      type: 'DiceRerolled';
      day: number;
      dieIndex?: number;
      previous?: number;
      result?: number;
      rerollsRemaining?: number;
      failReason?: 'no-hand' | 'invalid-die-index' | 'die-already-spent' | 'no-charge';
    }
  | {
      /**
       * T-1306 · A crew hire/dismiss/wage beat (PRD §7 dice progression). One event
       * covers the whole crew lifecycle via the `kind` sub-discriminator:
       *   - 'hired'     — a role was hired. `roleId`, `cost` (hire price), `berths`
       *     (crewCapacity at hire), `crewCount` (after). Credits went DOWN by cost,
       *     a die was spent.
       *   - 'dismissed' — a role left (player dismiss, or the dusk crew-walk on an
       *     unpaid wage). `roleId`.
       *   - 'wage'      — a dusk's wage was paid. `amount` (total wage), `crewCount`.
       *     Emitted by day.ts endDay while crew is aboard and affordable.
       *   - 'failed'    — a typed no-op (mirrors LoanEvent/HangoutEvent): malformed
       *     die input, or a crew rule refused it. NO die spent, NO credit change.
       *     `failReason` names why.
       * READER: T-1405's UI crew pane (and the wire). This is an eventLog entry, not
       * a GameState field — the crew STATE lives on PlayerState.crew (v3→v4
       * migration); this event carries a schema variant + drift guard only.
       */
      type: 'CrewEvent';
      day: number;
      kind: 'hired' | 'dismissed' | 'wage' | 'failed';
      roleId?: string;
      cost?: number;
      amount?: number;
      berths?: number;
      crewCount?: number;
      failReason?:
        | 'no-die'
        | 'invalid-die-index'
        | 'die-already-spent'
        | 'no-berth'
        | 'insufficient-credits'
        | 'already-hired'
        | 'unknown-role'
        | 'not-hired';
    }
  | {
      /**
       * T-1307 · A port-stake beat (PRD §9 "ports as purchasable property"). One
       * event covers the whole lifecycle via the `kind` sub-discriminator:
       *   - 'purchased' — a stake was bought. `systemId`, `cost` (purchase price),
       *     `portCount` (owned after). Credits went DOWN by cost, a die was spent.
       *     Paired with a WireEntry (the purchase's wire reader).
       *   - 'income'    — a dusk's launch-fee income accrued across all owned
       *     stakes. `income` (total, era-modulated), `portCount`. Credits went UP by
       *     income. Emitted by day.ts endDay while ≥1 port is owned. Paired with a
       *     WireEntry.
       *   - 'failed'    — a typed no-op (mirrors CrewEvent/LoanEvent): malformed die
       *     input, or a port rule refused it. NO die spent, NO credit change.
       *     `failReason` names why.
       * READER: T-1405's UI port/ledger pane (and the wire). This is an eventLog
       * entry, not a GameState field — the port STATE lives on PlayerState.ports
       * (v4→v5 migration); this event carries a schema variant + drift guard only.
       */
      type: 'PortEvent';
      day: number;
      kind: 'purchased' | 'income' | 'failed';
      systemId?: number;
      cost?: number;
      income?: number;
      portCount?: number;
      failReason?: PortEventFailReason;
    }
  | {
      /**
       * T-1604b · The dusk subsistence FLOOR fired (UGT finding F2; PRD §"Scarcity
       * of choices, never a poverty trap" — "the world provides floors … no actor
       * in the simulation, player or cast, gets permanently trapped at zero").
       * Emitted by `day.ts` endDay ONLY when the purse ended the day below
       * content's `SUBSISTENCE_FLOOR_CREDITS`, and only while the career is live.
       *
       * `amount` is the top-up actually applied (floor − credits before, always
       * > 0); `creditsAfter` is the floor itself, recorded rather than implied so
       * a reader never has to re-derive it from the constant. Always paired with a
       * `WireEntry{kind:'plain'}` naming the dock work.
       *
       * This is an eventLog entry, NOT a GameState field — no new state, hence no
       * save migration (the serialized `eventLog` gains a shape old saves simply
       * never contain).
       *
       * READERS: the sim campaign roll-up's `subsistenceDays`
       * (`packages/sim/src/index.ts`, `accumulateMetricEvents`), and the UI wire
       * pane via the paired WireEntry (`packages/ui/src/format.ts` `wireKind`).
       */
      type: 'SubsistenceIncome';
      day: number;
      amount: number;
      creditsAfter: number;
    }
  | { type: 'StoryletOffered'; day: number; storyletId: string; scheduled: boolean }
  | {
      type: 'StoryletChoiceResolved';
      day: number;
      storyletId: string;
      choiceId: string;
      success?: boolean;
    }
  | {
      type: 'StoryletChoiceBlocked';
      day: number;
      storyletId: string;
      choiceId: string;
      reason: 'not-available' | 'unknown-choice' | 'insufficient-credits' | 'missing-die';
    }
  | {
      type: 'StoryletEffectApplied';
      day: number;
      storyletId: string;
      choiceId: string;
      effect:
        | 'credits'
        | 'fuel'
        | 'flag'
        | 'flag-cleared'
        | 'active-contract-cleared'
        | 'manifest-contract-added'
        | 'disposition'
        // T-1503: a reputation effect moved standing with `faction` by `amount`.
        | 'reputation'
        | 'fragment-granted'
        | 'fragment-decoded';
      amount?: number;
      flag?: string;
      value?: FlagValue;
      npcId?: string;
      /** T-1503: the galactic power moved by a `reputation` effect. */
      faction?: FactionId;
      cargoType?: number;
      destination?: number;
      fragmentId?: string;
    }
  | {
      type: 'StoryletScheduled';
      day: number;
      storyletId: string;
      choiceId: string;
      scheduledStoryletId: string;
      dueDay: number;
    }
  | {
      type: 'StoryletDeedProgress';
      day: number;
      storyletId: string;
      choiceId: string;
      deedId: string;
      amount: number;
    }
  | {
      type: 'TravelEvent';
      characterId: string;
      origin: number;
      destination: number;
      fuelUsed: number;
      success: boolean;
      interrupted?: boolean;
      resumedFromEncounterId?: string;
      /** T-1102: the jump was refused because the tank could not cover the
       *  per-distance cost — the "typed fail" of the fuel-scarcity overhaul (a
       *  cross-map hop is unaffordable on a starter tank). READER: the UI
       *  jump-command handler in store.ts, which surfaces the dry-tank notice. */
      insufficientFuel?: boolean;
    }
  | TradeEvent
  | { type: 'DebtPayment'; characterId: string; amount: number; remaining: number }
  | { type: 'DebtDue'; day: number; outstanding: number }
  | {
      /** T-113b: the decisive Day-30 Tour One resolution (PRD §5.1). Emitted
       *  exactly once, at the dusk of day 30 (after the player's final actions),
       *  forced regardless of the player's system or normal storylet
       *  eligibility. `outcome` branches the veteran unlock (cleared) from the
       *  guild-consequence continuation (unpaid). Debt survives on the unpaid
       *  path — the game continues indebted, never soft-locked. */
      type: 'TourOneResolved';
      day: number;
      outcome: 'cleared' | 'unpaid';
      /** Debt still owed at resolution — 0 on the cleared path. */
      debtOutstanding: number;
    }
  | {
      /**
       * T-1703 · A DEMO career reached the dusk of `DEMO_FINAL_DAY` (content
       * demo.ts) — Tour One plus its three post-resolution days are played out.
       * Emitted exactly once, at that dusk, and ONLY when `state.edition` is
       * 'demo'; a full career never sees it. The day still rolls over normally
       * afterwards, which is what makes engine `demoConcluded` true at the next
       * dawn — the event is the RECORD, the derived predicate is the RULE.
       * READERS: the wire (a `WireEntry` rides alongside) and, through
       * `demoConcluded`, the cockpit's `DemoEndCard` and the sim's `legalActions`
       * stop signal.
       */
      type: 'DemoConcluded';
      day: number;
      edition: Edition;
      /** Days actually played — `day`, carried explicitly so the end card and any
       *  replay reader need not re-derive the ceiling. */
      daysPlayed: number;
    }
  | {
      /**
       * T-1703 · A demo save was opened by a FULL build and promoted in place
       * (engine `promoteEdition`). The locks lift, the Registry rank is
       * re-derived, and the career continues past the demo's day ceiling. Emitted
       * only on a real transition — a same-edition load emits nothing.
       * READERS: the wire (a `WireEntry` rides alongside) and the cockpit's
       * import notice.
       */
      type: 'EditionPromoted';
      day: number;
      from: Edition;
      to: Edition;
    }
  | {
      type: 'CombatEvent';
      characterId: string;
      targetId: string;
      stance: 'run' | 'talk' | 'fight';
      fuelUsed: number;
      success: boolean;
      insufficientFuel?: boolean;
      enemyHullRemaining?: number;
    }
  | { type: 'EncounterStarted'; encounter: EncounterState }
  | {
      type: 'EncounterRound';
      encounterId: string;
      round: number;
      stance: 'run' | 'talk' | 'fight';
      continues: boolean;
      success: boolean;
      fuelUsed: number;
      insufficientFuel?: boolean;
    }
  | {
      type: 'TributeDemanded';
      encounterId: string;
      round: number;
      amount: number;
      refused: boolean;
      affordable: boolean;
      /** A natural-20 talk check waves the ship through free of charge. */
      waived?: boolean;
    }
  | {
      type: 'TributePaid';
      encounterId: string;
      round: number;
      amount: number;
      creditsRemaining: number;
    }
  | {
      type: 'EnemyCounterAction';
      encounterId: string;
      round: number;
      interceptorId: string;
      pressure: 'between-rounds' | 'day-end';
      check: CheckResult;
      success: boolean;
    }
  | {
      type: 'ComponentDamaged';
      encounterId: string;
      component: ShipComponentId;
      previousCondition: number;
      newCondition: number;
      amount: number;
      /** T-1205: how many condition points the player's shields absorbed off the
       *  raw hit. 0 for a junker (no mitigation); a fully-absorbed hit reports
       *  amount 0 with `mitigated` === the raw damage. READER: wire.ts prose and
       *  the ui damage log (format.ts). */
      mitigated?: number;
    }
  | {
      type: 'ShipLost';
      day: number;
      encounterId: string;
      interceptorId: string;
      // T-1205: 'life-support-failure' — life support driven to condition 0 (now
      // reachable via seeded combat damage) failed its dusk survival check in
      // day.ts. 'combat-defeat' is the hull-to-0 killing blow in combat.ts.
      reason: 'combat-defeat' | 'life-support-failure';
      component?: ShipComponentId;
    }
  | {
      /** T-1205: life support has been driven to condition 0 and faced its dusk
       *  survival check. `survived: true` is a scare (no state change);
       *  `survived: false` precedes a ShipLost{reason:'life-support-failure'} +
       *  succession. This is the named reader for the `lifeSupport` component.
       *  READER: wire.ts prose + ui damage/obituary log (format.ts). */
      type: 'LifeSupportCritical';
      day: number;
      component: 'lifeSupport';
      survived: boolean;
    }
  | {
      /** T-108: the successor claims the license. Fired immediately after
       *  ShipLost. Carries the estate summary — the wire obituary is a separate
       *  WireEntry emitted alongside. */
      type: 'LegacySuccession';
      day: number;
      successionCount: number;
      inheritedCredits: number;
      debtOutstanding: number;
      previousShipLostTo: string;
    }
  | {
      type: 'EncounterResolved';
      encounterId: string;
      /** 'interceptor-fled': a bonded NPC drove the interceptor off at dusk
       *  (T-106 bond hook) — travel completes as if the threat was beaten.
       *  'interceptor-escaped' (T-1207): a cracked-drive interceptor won its own
       *  opposed PILOT retreat roll off a LOST fight (PRD §7.4 "miracle burn") —
       *  it flees alive under its own power. The player still won the field, so
       *  travel completes (unlike 'escaped', which is the PLAYER fleeing). */
      resolution:
        'escaped' | 'talked-down' | 'defeated' | 'interceptor-fled' | 'interceptor-escaped';
      round: number;
      interceptorId: string;
      /** R2c · Wreck salvage paid to the player, present ONLY on 'defeated'
       *  (content `COMBAT_SALVAGE_PER_TIER` x the interceptor's tier). Optional so
       *  every pre-R2c save and golden round-trips unchanged. READER:
       *  sim/balance/aggregate.ts `combatEv`, which is no longer negative by
       *  construction now that a win can pay. */
      salvageCredits?: number;
    }
  | ShipyardEvent
  | ShipyardFail
  // T-1305 · patrol contraband scan beats (engine actions/patrol.ts). Serialized
  // in eventLog (round-trips via the discriminated-union schema below); read by
  // the patrol wire bucket and T-1405's UI surface.
  | {
      type: 'ContrabandScan';
      encounterId: string;
      interceptorId: string;
      caught: boolean;
      check: CheckResult;
    }
  | {
      type: 'ContrabandConfiscated';
      encounterId: string;
      fine: number;
      creditsRemaining: number;
      confiscatedContract: boolean;
      confiscatedPod: boolean;
    };

export type ShipComponentId =
  'hull' | 'drives' | 'cabin' | 'lifeSupport' | 'weapons' | 'navigation' | 'robotics' | 'shields';

export type SpecialEquipmentId =
  | 'CLOAKER'
  | 'AUTO_REPAIR'
  | 'STAR_BUSTER'
  | 'ARCH_ANGEL'
  | 'ASTRAXIAL_HULL'
  | 'TITANIUM_HULL'
  | 'TRANS_WARP';

export type ShipyardActionKind =
  'buy-component-tier' | 'repair' | 'buy-cargo-pods' | 'buy-special-equipment';

export type ShipyardFailureReason =
  | 'INSUFFICIENT_CREDITS'
  | 'AT_MAX_CONDITION'
  | 'NO_HULL'
  | 'CAPACITY_EXCEEDED'
  | 'MUTUALLY_EXCLUSIVE_EQUIPMENT'
  | 'PREREQUISITE_NOT_MET'
  | 'INSUFFICIENT_RENOWN'
  | 'ALREADY_INSTALLED';

export interface ShipyardEvent {
  type: 'ShipyardEvent';
  action: ShipyardActionKind;
  cost: number;
  component?: ShipComponentId;
  tier?: number;
  repairMode?: 'all' | 'single';
  quantity?: number;
  equipment?: SpecialEquipmentId;
}

export interface ShipyardFail {
  type: 'ShipyardFail';
  action: ShipyardActionKind;
  reason: ShipyardFailureReason;
  component?: ShipComponentId;
  tier?: number;
  repairMode?: 'all' | 'single';
  quantity?: number;
  equipment?: SpecialEquipmentId;
  conflictingEquipment?: SpecialEquipmentId;
  prerequisite?: string;
  requiredRank?: RenownRankId;
  cost?: number;
  credits?: number;
  maxPods?: number;
}

// Player actions
export type PlayerAction =
  | {
      type: 'Trade';
      /** T-1604b adds 'abandon-contract' — the player-initiated hold release that
       *  frees a captain carrying an undeliverable run (UGT finding F2). Costs one
       *  die and the forfeited payment; no credit fee (see actions/trade.ts). */
      action: 'buy-fuel' | 'sign-contract' | 'haggle' | 'pay-debt' | 'abandon-contract';
      contractIndex?: number;
      fuelAmount?: number;
      amount?: number;
      spendDie?: number;
    }
  | { type: 'Travel'; destinationId: number; spendDie?: number }
  | { type: 'Combat'; stance: 'run' | 'talk' | 'fight'; targetId: string; spendDie?: number }
  | {
      type: 'Shipyard';
      action: ShipyardActionKind;
      spendDie: number;
      component?: ShipComponentId;
      tier?: number;
      repairMode?: 'all' | 'single';
      quantity?: number;
      equipment?: SpecialEquipmentId;
    }
  | { type: 'Storylet'; storyletId: string; choiceId: string; spendDie?: number }
  | { type: 'Explore'; spendDie?: number }
  | {
      /**
       * T-1303 · Visit the Spacers Hangout (PRD §7). A die-costed player scene at
       * a `hasHangout` system. `venue` picks the beat:
       *   - 'dare'     — a wagered, opposed-GUILE Spacer's Dare against an NPC
       *                  actually present in-system (`opponentId`, `wager`).
       *   - 'meet'     — an introduction: a small disposition nudge + gossip.
       *   - 'befriend' — a GUILE charm check to warm the NPC (`opponentId`).
       *   - 'insult'   — always lands, souring the NPC hard (`opponentId`).
       *   - 'rumor'    — read the rumor table (host slot; no opponent).
       *   - 'borrow'   — T-1304: take a loan at Penny Wise's desk (`amount` =
       *                  requested principal, clamped to the content band). Penny
       *                  Wise is the lender-of-record, so no opponent required.
       *   - 'repay'    — T-1304: pay down the active loan (`amount` = credits to
       *                  pay; default = full outstanding). No opponent required.
       * `opponentId` is required for dare/meet/befriend/insult and must name an
       * NPC whose SIMULATED position is in the player's current system, else a
       * typed HangoutEvent fail. `borrow`/`repay`/`rumor` need no opponent.
       * RESOLVER: actions/hangout.ts resolveVisitHangout.
       */
      type: 'VisitHangout';
      venue: 'dare' | 'meet' | 'befriend' | 'insult' | 'rumor' | 'borrow' | 'repay';
      opponentId?: string;
      wager?: number;
      /** T-1304: borrow principal / repay amount (venue 'borrow' / 'repay'). */
      amount?: number;
      spendDie?: number;
    }
  | {
      /**
       * T-135 · One move in the open Liar's Dice hand (`state.dareHand`). The hand
       * is OPENED by `VisitHangout{venue:'dare'}` and closed by 'challenge',
       * 'fold', a dealer answer that ends it, or the dusk timeout fold
       * (`docs/LIARS-DICE_REDESIGN.md` §9.1).
       *
       * This is the `Combat{stance}` shape, chosen for the same reason: one verb
       * whose variants share a scene, a counterparty and a lifecycle. RESOLVER:
       * actions/dare.ts `resolveDare`, which NEVER throws — a move with no open
       * hand is a typed `HangoutEvent{failReason:'no-dare-hand'}`.
       */
      type: 'Dare';
      move: DareMoveKind;
      /** Required for 'bid' / 'raise-quantity' / 'raise-both'; ignored otherwise. */
      quantity?: number;
      /** Required for 'bid' / 'raise-face' / 'raise-both'; ignored otherwise. */
      face?: number;
      /** 'peek' ONLY. Bids, raises, challenges and folds cost no die (§9.2). */
      spendDie?: number;
    }
  | {
      /**
       * T-1306 · Re-roll one un-spent dawn die (PRD §7 "allow one re-roll").
       * Consumes a single `dawnHand.rerollsRemaining` charge (granted by a reroll
       * crew role). `dieIndex` names the die to re-roll; the new value is floored
       * by any crew floor and written IN PLACE (no re-sort — mid-day die indices
       * are load-bearing). Costs a charge, NOT a whole die. RESOLVER:
       * actions/crew.ts resolveReroll.
       */
      type: 'Reroll';
      dieIndex: number;
    }
  | {
      /**
       * T-1306 · Hire or dismiss a crew role at the Hangout/port (PRD §7 dice
       * progression). `roleId` names a content CREW_ROLES entry; `spendDie` is the
       * die the action costs (like every other die-costed player scene). Hiring
       * needs a free cabin berth (`crewCapacity`) and the hire price; dismissing
       * frees a berth (no refund). RESOLVER: actions/crew.ts resolveCrew.
       */
      type: 'Crew';
      action: 'hire' | 'dismiss';
      roleId: string;
      spendDie: number;
    }
  | {
      /**
       * T-1307 · Buy a controlling stake in the local port authority (PRD §9
       * "ports as purchasable property"). `systemId` names the port and MUST equal
       * `currentSystemId` (you buy the port you are standing in); it must be a
       * purchasable core port (content `isPurchasablePort`). `spendDie` is the die
       * the action costs (die-costed like Shipyard). Needs the purchase price and
       * a stake not already owned. RESOLVER: actions/port.ts `resolvePortPurchase`.
       */
      type: 'Port';
      action: 'buy';
      systemId: number;
      spendDie: number;
    }
  | { type: 'Wait' };

export type NpcActionType =
  'Trade' | 'Travel' | 'Combat' | 'Patrol' | 'Socialize' | 'Idle' | 'FlawOverride';

export interface NpcAction {
  type: NpcActionType;
  details: string;
}

export interface NpcState {
  id: string;
  name: string;
  profileId: string;
  currentSystemId: number;
  credits: number;
  /**
   * N1 · THE SHIP THE CAPTAIN OWNS — the same {@link ShipState} the player flies,
   * not a tier-derived phantom recomputed on every action.
   *
   * Before N1 an NPC had no ship at all: `npc.ts` synthesized `npcCargoPods(tier)`
   * / `npcDrives(tier)` / a literal `hullCondition: 9` at each call site, so an
   * NPC's capability was a CONSTANT of its profile and could never change — which
   * is why an NPC could never earn more by investing (the N2 complaint).
   *
   * IT ALSO OWNS THE TANK. `NpcState.fuel` is gone; the fuel an NPC is carrying is
   * `npc.ship.fuel`, bounded by `npc.ship.maxFuel`, exactly as the player's is.
   * Two fuel numbers on one captain would be two sources of truth, and the phantom
   * had no tank ceiling at all.
   *
   * SEEDED BY: `npc.ts` `npcShipForProfile` (world creation, and the v9→v10 save
   * migration). READ BY: `npc.ts` `executeTrade` / `executeTravel` /
   * `executeCombat` / `executePatrol` / `refuelIfNeeded`, and `day.ts`'s bond-hook
   * fuel gift.
   */
  ship: ShipState;
  /**
   * N11 · THE CAPTAIN'S OWN DEED REGISTRY AND RENOWN RANK — the same
   * {@link DeedRegistryState} the player's standing lives in, evaluated by the same
   * `accrueDeeds` against the same content `DEEDS` and `RENOWN_DEED_THRESHOLDS`.
   *
   * WHY IT EXISTS. Before N11 no NPC had a registry at all, so `actorRankIndex`
   * (`actions/shipyard.ts`) returned −1 for every captain — strictly below every
   * rung of the Renown ladder, forever. Every rank-gated purchase was therefore
   * refused with no recourse, which the track's standing constraint defines as an
   * exemption: a gate the actor can never open is not the rule the player plays
   * under, because the player can EARN the key.
   *
   * SEEDED BY: `deeds.ts` `emptyDeedRegistry()` — the ONE seeding function, called
   * by `state.ts` `createInitialState` (world creation), `state.ts`
   * `deserializeState` (raw JSON path) and `save.ts` `MIGRATIONS[11]` (envelope
   * path), so a migrated roster cannot drift from a freshly created one.
   * WRITTEN BY: the verb paths in `npc.ts` — `executeTrade` / `executeTravel` /
   * `resolveNpcEncounter` feed a local `deedSource` batch that `resolveNpcDay`
   * hands to `accrueDeeds` at the captain's dusk.
   * READ BY: `actorRankIndex` (the yard's Renown gate).
   *
   * IT STARTS AT ZERO AND IS NEVER BACKFILLED FROM THE PROFILE. N11's ruling is
   * explicit that the fast-forward allowance applies to the SOURCE — the coarse
   * verbs standing in for played days — and *"does not license synthetic backfill
   * of unearned rank at world creation"*. A tier-5 captain seeded with a rank they
   * never earned is precisely the "constant recomputed from profile" phantom N1
   * existed to kill, so no `profile.tier` read reaches this field anywhere,
   * including the migration.
   */
  registry: DeedRegistryState;
  /** Per-NPC standing toward the player, clamped to [-10, +10]; decays one
   *  step toward 0 each dusk. */
  disposition: number;
  lastAction?: NpcAction;
  /**
   * N3 · This captain lost their ship and is gone. **PERMANENT — no succession, no
   * replacement, no respawn** (owner ruling, 2026-07-28). The player gets
   * succession; an NPC does not. The framing is *"in many real-world multiplayer
   * games, sometimes a player quits"* — the seat empties and stays empty, so the
   * field shrinks over a career and contract competition falls with it.
   *
   * OPTIONAL, and absent means alive. That is deliberate: it makes the field a
   * pure addition to the save shape, so no migration and no version bump are owed
   * (an old save has no dead captains, which is exactly what `undefined` means).
   *
   * THE RECORD STAYS — it is marked, never deleted, because the wire, the Honor
   * List's history and any grudge the player still carries all reference it. Which
   * means every reader that treats the roster as "the living field" must skip it,
   * and MARKING DEAD WITHOUT THOSE SKIPS RANKS CORPSES FOREVER. The four that
   * matter, all closed by N3:
   *   · `honorField` (`packages/ui/src/format.ts`) — the fifth 1991 behaviour N6
   *     shipped only as a seam (worklist item OI-2).
   *   · `buildNamedCandidates` (`actions/travel.ts`) — a corpse must not intercept.
   *   · the dusk NPC loop (`day.ts`) — a corpse takes no turn.
   *   · Hangout presence (`actions/hangout.ts`) — a corpse is not at the tables.
   */
  dead?: boolean;
}

export interface ComponentState {
  strength: number; // 1-199
  condition: number; // 0-9
}

export interface ShipState {
  fuel: number;
  maxFuel: number;
  cargoPods: number;
  hull: ComponentState;
  drives: ComponentState;
  weapons: ComponentState;
  shields: ComponentState;
  navigation: ComponentState;
  lifeSupport: ComponentState;
  robotics: ComponentState;
  cabin: ComponentState;
  hasTransWarpDrive?: boolean;
  hasCloaker?: boolean;
  hasAutoRepair?: boolean;
  hasStarBuster?: boolean;
  hasArchAngel?: boolean;
  isAstraxialHull?: boolean;
  hasTitaniumHull?: boolean;
  /**
   * T-112 · THE EXPLORE-GRANTED MODULES FITTED TO THIS HULL (Class B,
   * docs/EXPLORE_REDESIGN.md §4.2). Content ids from `EXPLORE_MODULES`
   * (`content/crew.ts`). ABSENT ⇒ none fitted.
   *
   * NOT SHIPYARD EQUIPMENT. These are recovered off a derelict, never bought, so
   * they deliberately do not join the seven `has…` booleans above — those mirror
   * `SpecialEquipmentId`, which is the YARD's purchasable union.
   *
   * FINDING F-112-A · A LIST, NOT THREE BOOLEANS. §6's F-100-1 sketched "three
   * optional booleans mirroring the existing seven". Three booleans would force
   * TWO id-keyed switches in the engine — one to READ (`hasExploreModule`) and one
   * to WRITE the grant — and the write-side switch is literally "an effect applied
   * by a branch keyed on a specific item id", which this task's acceptance
   * forbids. A list removes the write branch entirely (membership, not a case) and
   * removes F-100-1's per-instance engine cost (a union member, a flag, a switch
   * case, a schema field, a backfill) — which was the friction that capped Class B
   * at three. The three-module bound is UNCHANGED; it now rests on §4.2's design
   * argument (the `MAX_EXTRA_DICE` clamp and the three-kind vocabulary) and on a
   * content test, rather than on how tedious a fourth would be to add.
   *
   * A PURE ADDITION TO THE SAVE SHAPE — the `NpcState.dead?` precedent. Optional
   * and absent-means-none, so no migration and no version bump are owed, and a
   * module-free career serializes byte-identically to before T-112.
   *
   * WRITTEN BY: `components.ts` `fitExploreModule` (the ONLY writer, called from
   * `exploreOutcomes.ts` `applyUniqueItem`).
   * READ BY: `components.ts` `hasExploreModule`, and through it `dice.ts`
   * `equipmentDiceBenefits` (the dawn-hand module leg) and `ui/format.ts`
   * `fittedModuleRows` (the ship pane's salvaged-fittings readout).
   */
  exploreModules?: readonly ExploreModuleContentId[];
  /**
   * T-112 · PERMANENT TANK CAPACITY granted by Class-A explore items. ABSENT ⇒ 0.
   *
   * FINDING F-112-B · `maxFuel` IS DERIVED, NOT STORED. `economy.ts` `syncMaxFuel`
   * recomputes it from the hull at the end of EVERY `applyPlayerAction` and again
   * on load, so a `{ element: 'maxFuel', amount: +40 }` delta written straight
   * onto `ship.maxFuel` would be silently erased within the same action. §4.1 and
   * §5.2's band ceilings both name maxFuel deltas, so this had to be solved rather
   * than dropped. This field is the ONE additive term, and it is applied INSIDE
   * `syncMaxFuel` — so there is still exactly one place `maxFuel` is decided.
   *
   * NPC hulls never carry one (`npc.ts` never sets it), so `undefined → 0` leaves
   * every NPC tank byte-identical.
   */
  bonusMaxFuel?: number;
}

/** A point of interest the spacer has charted off the lane (T-111a). Part of
 *  the persistent charts knowledge — it survives death and passes to the
 *  successor. T-111b socket: loot (salvage credits, Contraband pods, Signal
 *  fragments) and the Nemesis file attach to a discovered POI by `id`/`type`. */
export interface DiscoveredPoi {
  id: string;
  type: PoiType;
  /** System the POI was charted off (the spacer's location at discovery). */
  systemId: number;
  /** Flavor name chosen deterministically from the seeded discovery roll. */
  name: string;
  /** Day the POI was discovered. */
  day: number;
}

export interface ChartsState {
  /** Every system the spacer has personally arrived at — recorded on each
   *  successful arrival (travel completion) and seeded with the starting
   *  system. This is the persistent KNOWLEDGE namespace: it survives death and
   *  passes wholesale to the successor (T-108 legacy).
   *  // T-111 socket: fragments join the charts inheritance */
  visitedSystemIds: number[];
  /** Points of interest charted via the Explore action (T-111a). Also part of
   *  the persistent knowledge that survives death. */
  discoveredPois: DiscoveredPoi[];
}

export interface LegacyState {
  /** How many times the license has passed to a successor — 0 for a first-run
   *  spacer, +1 on every ShipLost succession (T-108). */
  successionCount: number;
}

/**
 * T-1304 · An outstanding loan from Penny Wise's desk at the Hangout (PRD §7.5).
 * A new persistent `PlayerState` field — one loan at a time; borrow is blocked
 * while a loan is active. FOUNDATION-ORIGINAL: foundation (f2f95fa9) has no
 * lending mechanic, so this whole type is a T-1304 addition (see content
 * lending.ts for the tuning + divergence note).
 *
 * DEBT-AS-LEDGER LAW (shared with `PlayerState.debt`): interest accrues to
 * `outstanding`, NEVER to `player.credits`. Credits only go UP when borrowing;
 * they only come down on a player-chosen, clamped repay — so a loan can only ever
 * be an OUT, never a trap that drives credits negative.
 */
export interface LoanState {
  /** The lender of record — always `npc-penny-wise` (content LENDER_ID). The
   *  default disposition hit / grudge keys to this id. */
  lender: string;
  /** Credits advanced up front. Constant for the life of the loan — the interest
   *  base and the narrative "you borrowed X". */
  principal: number;
  /** The live balance owed: principal + accrued interest − repayments. Grows
   *  `ceil(principal * dailyRate)` each dusk. Cleared to a null loan when repaid
   *  to <= 0. */
  outstanding: number;
  /** Per-dusk simple-interest rate (content LOAN_DAILY_RATE). */
  dailyRate: number;
  /** Dusk day the loan was taken. */
  borrowedDay: number;
  /** Day the loan comes due (borrowedDay + LOAN_TERM_DAYS). Crossing this unpaid
   *  flips `status` to 'defaulted'. */
  dueDay: number;
  /** The COLLECTION FLAG. 'defaulted' is READ by generateEncounter (travel.ts)
   *  to raise interdiction odds, and its one-time disposition hit is read by the
   *  interceptor grudge-weighting (travel.ts chooseWeighted). Repaying clears the
   *  whole loan (status included). */
  status: 'active' | 'defaulted';
}

/**
 * T-111 · AN IN-PROGRESS SALVAGE OP — "the anchored single-slot recovery"
 * (docs/EXPLORE_REDESIGN.md §3). A find whose band carries `recoveryDays > 0`
 * occupies real calendar days: the POI is charted on the day of the find, but the
 * PAYOFF is delivered at the dusk of `dueDay`, and only if the captain is still
 * parked at `systemId`.
 *
 * Sibling of `loan: LoanState | null` — ONE at a time (the T-1304 precedent), and
 * the Explore VERB is refused while the slot is occupied rather than the outcome
 * being silently downgraded.
 *
 * THE PAYLOAD IS LOOKED UP AT PAYOUT, NEVER STORED. Only the content id and the
 * clock live here — the same discipline `crew` keeps (it stores only `roleId`)
 * and `EQUIPMENT_DICE_BENEFITS` states outright ("nothing is stored on the save").
 * Two consequences, both deliberate: re-tuning a row's `valuePoints` never has to
 * rewrite a live save, and there is no phantom copy of a content number on the
 * save to drift. The price is that a renamed/removed row must be tolerated at
 * payout — see `RecoveryAbandoned{reason:'unknown-outcome'}`.
 *
 * A RECOVERY IS A ZERO-DIE COMMITMENT after the initiating Explore die. Ruling 1
 * chose calendar days INSTEAD OF a scaling die cost; nothing may charge a die per
 * recovery day.
 *
 * AMENDED by D1 (owner ruling, `/bakeoff`, 2026-07-31) — THE PARAGRAPH ABOVE NOW
 * GOVERNS BAND 2 ONLY. Bands 3 and 4 no longer open a recovery at all: they carry
 * `recoveryDays: 0` and an `apCost` of 2 / 3 EXTRA dice, charged AT CLAIM from the
 * same dawn hand and resolved same-day (`exploreOutcomes.ts` `claimOutcome`;
 * docs/EXPLORE_REDESIGN.md §3.3, §5.2). The invariant SURVIVES EXACTLY AS WRITTEN
 * for the recoveries that still exist — nothing charges a die per recovery *day*.
 * Keep that distinction: a same-day claim cost is not a per-day cost, and the ban
 * D1 narrowed is the ban on a die cost that SCALES WITH THE CLOCK. A band may
 * never carry both `recoveryDays > 0` and `apCost > 0`; the content table asserts
 * it (`__tests__/exploreContent.test.ts`), because a band drawn AFTER the nav
 * check has no later dawn hand to charge against.
 *
 * READERS: `day.ts` endDay (the dusk tick — departure forfeit, then payout);
 * `legacy.ts` applySuccession (forfeit on death); `actions/exploration.ts` (the
 * fifth typed refusal); `sim/protocol.ts` legalActions (stops advertising
 * Explore); `ui/format.ts` `recoveryReadout` (the cockpit readout).
 */
export interface RecoveryState {
  /** The content row being recovered (`ExploreOutcomeDefinition.id`). */
  outcomeId: string;
  /** The DiscoveredPoi this hangs off — already on charts, already survives death. */
  poiId: string;
  /** THE ANCHOR — the system the op is moored at. Read by the dusk predicate. */
  systemId: number;
  startedDay: number;
  /** `startedDay + N`, N from `recoveryDays(valuePoints)`. The payout predicate is
   *  `day >= dueDay` — NEVER `===`, or a past-due slot sticks forever. */
  dueDay: number;
}

/** One Signal Fragment held in the Nemesis file (T-111b, PRD §8.1). A knowledge
 *  item keyed by a content fragment id (nemesis.ts). Dedupe key: fragmentId. */
export interface SignalFragmentRecord {
  /** Content fragment id — maps 1:1 to a SIGNAL_FRAGMENTS lore entry. */
  fragmentId: string;
  /** How the fragment entered the file. */
  source: 'derelict' | 'beacon' | 'wise-one' | 'sage' | 'npc';
  /** Day the fragment was acquired. */
  day: number;
  /** Whether the Sage of Mizar-9 has decoded it into lore. */
  decoded: boolean;
}

/** The terminal's Nemesis file — the running collection of Signal Fragments
 *  (PRD §7.2/§8.1). Knowledge is "the one currency death never takes", so this
 *  persists wholesale through succession (T-108). Fragments are deduped by id
 *  and never removed: the fragment count grows monotonically. */
export interface NemesisFileState {
  fragments: SignalFragmentRecord[];
}

/**
 * T-1306 · One hired crew member (PRD §7 dice progression). MINIMAL by design:
 * only the content `roleId` and the day hired are stored — the dice benefit
 * (extra-die / reroll / floor) is looked up from content (`CREW_BY_ID`) every
 * time it's needed, never denormalized onto the save, so the tuning stays data.
 * FOUNDATION-ORIGINAL: foundation (f2f95fa9) has no crew-grants-dice mechanic, so
 * this whole type is a T-1306 addition (see content crew.ts for the tuning + the
 * foundation-divergence note). READERS: dice.ts `dawnDiceModifiers` (the dawn
 * aggregator — which since T-1601c also folds in the fitted-equipment leg,
 * `equipmentDiceBenefits`, through the same accumulators), day.ts (dawn roll +
 * dusk wage upkeep), actions/crew.ts (hire / dismiss / reroll), the sim protocol,
 * and T-1405's UI crew pane.
 */
export interface CrewMember {
  /** Content id into CREW_ROLES / CREW_BY_ID — the benefit is resolved from this. */
  roleId: string;
  /** Dusk day this crew member was hired (flavor + T-1405 seniority display). */
  hiredDay: number;
}

/**
 * T-1307 · One owned port stake (PRD §9 "ports as purchasable property", canon
 * from 1991). MINIMAL by design: only the content `systemId` and the day bought
 * are stored — the purchase price, per-dusk income and alliance are looked up from
 * content (`PURCHASABLE_PORTS_BY_SYSTEM`) every time they're needed, never
 * denormalized onto the save, so the tuning stays data. FOUNDATION-ORIGINAL: the
 * foundation RULES of record (f2f95fa9) have no port-buying code, so this whole
 * type is a T-1307 addition (see content ports.ts for the tuning + the
 * foundation-divergence note). READERS: actions/port.ts `portDuskIncome` (the
 * dusk-economy accrual day.ts endDay calls), actions/port.ts `resolvePortPurchase`
 * / `quotePort` (buy + preview), the wire (the purchase + income WireEntries), and
 * — via the port's content `alliance` tag — T-1503's alliance-reputation mover
 * (`resolvePortPurchase` applies `PORT_PURCHASE_ALLIANCE_DELTA` to the port's
 * aligned faction). Surfaced to the player by T-1405 (named).
 */
export interface PortStake {
  /** Content core-system id (1–14) into PURCHASABLE_PORTS_BY_SYSTEM. The income /
   *  price / alliance are resolved from this. */
  systemId: number;
  /** Dusk day the stake was bought (flavor + T-1405 ledger display). */
  purchaseDay: number;
}

/** T-1307 · The typed refusal reasons a `Port` buy can resolve to (the
 *  `PortEvent{failed}.failReason` set; also the `quotePort` failure set). Kept as
 *  a named alias so the resolver/preview reference one source of truth. */
export type PortEventFailReason =
  | 'no-die'
  | 'invalid-die-index'
  | 'die-already-spent'
  | 'not-at-port'
  | 'not-purchasable'
  | 'already-owned'
  | 'insufficient-credits';

/**
 * T-1503 · The player's standing with each of the four galactic powers (PRD §8.1
 * "your reputation … good and bad"; §2 the four powers). ALWAYS four keys (like
 * StatBlock's always-present shape) so it round-trips deterministically. Values are
 * clamped to [REPUTATION_MIN, REPUTATION_MAX] (content factions.ts). This is the
 * NESTED state the T-1002 drift-protection was built to protect — the `.strict()`
 * PlayerStateSchema + the `_covReputation` keyof guard keep an unknown/dropped key
 * failing loudly instead of being silently stripped (the exact `player.reputation`
 * bug named in schema.ts). FOUNDATION-ORIGINAL: the foundation carries the powers as
 * setting but no rep mechanic (see content factions.ts divergence note).
 */
export interface FactionReputation {
  league: number;
  dragons: number;
  confederation: number;
  rebels: number;
}

export interface PlayerState {
  credits: number;
  /** Outstanding Merchant Guild debt — a ledger entry, NOT negative credits.
   *  Modeling debt as a negative balance recreates the UGT poverty trap
   *  (can't buy fuel, can't earn, can't recover). */
  debt: number;
  debtDueDay: number;
  /** T-1304 · The outstanding Penny Wise loan, or null. A new persistent field
   *  (v2→v3 save migration + round-trip test ship with it). Like `debt`, this is
   *  a ledger entry, never negative credits. READERS: generateEncounter
   *  (travel.ts) reads `loan.status`; the day loop (day.ts endDay) accrues and
   *  defaults it; T-1404 surfaces it. */
  loan: LoanState | null;
  /** T-111 · The ONE open multi-day salvage recovery, or null (v12→v13 save
   *  migration + round-trip test ship with it). Like `loan`, one at a time — the
   *  Explore verb is refused while it is occupied. READERS: day.ts endDay (the
   *  dusk departure-forfeit + payout tick); legacy.ts applySuccession (forfeit on
   *  death); actions/exploration.ts (the fifth typed refusal, and the site that
   *  opens the slot); sim/protocol.ts legalActions; ui/format.ts
   *  `recoveryReadout`. See {@link RecoveryState} for why the payload is not
   *  stored here. */
  recovery: RecoveryState | null;
  /** T-1306 · Hired crew — the dice-progression source (PRD §7). A new persistent
   *  field (v3→v4 save migration + round-trip test ship with it). Capped by
   *  `crewCapacity(ship)` (cabin berths, the T-1205 socket). READERS: dice.ts
   *  `dawnDiceModifiers` reads it to build the dawn hand's size/floor/rerolls
   *  (alongside the T-1601c fitted-equipment leg, which is derived from the ship's
   *  flags and adds no save field);
   *  day.ts endDay charges the wage upkeep; actions/crew.ts hires/dismisses;
   *  the sim protocol + veteran policy consume it; T-1405 surfaces it. */
  crew: CrewMember[];
  /** T-1307 · Owned port stakes — purchasable property (PRD §9). A new persistent
   *  field (v4→v5 save migration + round-trip test ship with it). Each stake
   *  accrues per-dusk launch-fee income, modulated by a live regional era event.
   *  READERS: actions/port.ts `portDuskIncome` (dusk-economy accrual, called by
   *  day.ts endDay); actions/port.ts `resolvePortPurchase` / `quotePort` (buy +
   *  preview); the wire (purchase + income WireEntries); carried through succession
   *  (legacy.ts) like the debt/loan; T-1503's port-deal reputation mover reads
   *  it via each port's content `alliance` tag (`resolvePortPurchase` applies
   *  `PORT_PURCHASE_ALLIANCE_DELTA`); T-1405 surfaces it. */
  ports: PortStake[];
  /** T-1503 · Four-faction standing — purchasable/earnable reputation (PRD §8.1).
   *  A new persistent NESTED field (v6→v7 save migration + a nested round-trip
   *  regression test — the T-1002 `player.reputation` bug class — ship with it).
   *  Moved by ORGANIC play: patrol tribute/evasion + smuggling scans (combat.ts /
   *  patrol.ts), port deals (port.ts), and the alliance-questline grants — all via
   *  `reputation.ts` `applyReputation`. READERS: the questline `reputation` trigger
   *  gates (storylets.ts `triggerMatches`); the questline `reputation` effects
   *  (storylets.ts `applyEffects`); the cross-faction join shift; carried WHOLESALE
   *  through succession (legacy.ts) like debt/ports; the UI standing readout
   *  (format.ts `factionStanding`). */
  reputation: FactionReputation;
  stats: StatBlock;
  tier: PowerTier;
  currentSystemId: number;
  dawnHand?: DawnHand;
  ship: ShipState;
  registry: DeedRegistryState;
  /** Persistent chart knowledge — survives death (T-108). */
  charts: ChartsState;
  /** The Nemesis file — Signal Fragments (knowledge). Survives death (T-111b). */
  nemesisFile: NemesisFileState;
  /** Legacy/succession bookkeeping — survives death (T-108). */
  legacy: LegacyState;
  /**
   * T-145 · Roster opponent ids the captain has beaten, in FIRST-DEFEAT ORDER
   * (`docs/LIARS-DICE-PROGRESSION_SPEC.md` §5.1). A SET semantically, an array
   * physically — no duplicates, ever, enforced at the single write site in
   * `actions/dare.ts`'s `settleDareHand`.
   *
   * POOL A ONLY (§1 rule 3). A win over a roaming captain is NEVER written here,
   * no matter how many times it happens: pool B respawns its willingness to play
   * every day, so counting it would turn a finite authored gauntlet into a grind
   * timer. Order is first-defeat order, not sorted — it is a career record, and a
   * sort would destroy information for no gain.
   *
   * READERS: T-147's set-closure arithmetic (`LiarsDiceSetCleared`), and the UI's
   * roster picker, which marks a beaten opponent.
   */
  liarsDiceBeaten: string[];
  /** T-145 · Every SETTLED Liar's Dice hand against EITHER pool. Integer >= 0.
   *  Drives the unlock ladder (§4); T-146 wires the increment into the single
   *  settlement site. Initialised here so T-146 needs no save-version move. */
  liarsDiceGamesPlayed: number;
  activeContract?: CargoContract | null;
}

export interface CargoContract {
  destination: number;
  cargoType: number;
  payment: number;
  pods: number;
  haggled?: boolean;
}

export interface MarketState {
  manifestBoard: CargoContract[];
  localFuelPrice: number;
  /**
   * N10 · THE SHARED JOB POOL — outstanding claims against EVERY system's
   * generation pool, keyed by `String(systemId)`.
   *
   * This replaces T-106's `npcClaims: number`, which counted claims in the
   * player's system only and was reset to 0 every dawn. Two things were wrong
   * with that shape, and they are the same thing said twice: a captain hauling
   * out of Vega-7 drained nothing, and a pool the player was not standing in
   * could not be drained at all. So competition existed only under the player's
   * nose — a texture, not a force (N2 measured an 8x field-wealth increase move
   * `ContractClaimed` by +2.0%).
   *
   * Now every claim, wherever it happens, debits the origin system's pool, and
   * `startDay` sizes the player's board from the pool of the system they are
   * actually in. THAT is what lets the player WATCH the competition rather than
   * merely share a galaxy with it: fly into a hub the cast has been working and
   * the board is thin; fly somewhere quiet and it is full.
   *
   * Two properties, both load-bearing and both enforced by the accessors in
   * `economy.ts` (`jobPoolDepth` / `debitJobPool` / `regeneratePools`) rather
   * than by any call site spelling the arithmetic itself:
   *
   *   1. **Pools RECOVER.** `regeneratePools` steps every tally back toward 0 by
   *      `JOB_POOL_REGEN_PER_DAY` each dawn. Without it the galaxy ratchets: 30
   *      captains claiming for 120 days would leave every port permanently dark,
   *      which is not competition but attrition.
   *   2. **Tallies are CLAMPED** to `JOB_POOL_MAX_CLAIMS`, so a pool cannot bank
   *      a debt it needs twenty quiet days to work off.
   *
   * A missing key means an undrained pool, which is why this is a sparse record
   * and not a 20-slot array: `regeneratePools` deletes a tally the moment it
   * reaches 0, so a quiet galaxy serializes as `{}` and the save does not grow a
   * key per system.
   */
  jobPoolClaims: Record<string, number>;
}

export interface GameState {
  day: number;
  rngState: number; // Storing the seed state to resume
  dayPhase: DayPhase;
  dayEventCount: number;
  era: EraId;
  /**
   * T-1703 · The edition this career is being flown as. WRITTEN by
   * `createInitialState(seed, edition)` (the build supplies it) and by
   * `promoteEdition` (a full build adopting a demo save). Backfilled to 'full'
   * by the v8→v9 save migration and by `deserializeState`, because every save
   * that predates T-1703 is a full-game career.
   *
   * READERS, all of them named because a state field with no consumer is a
   * receipt: `demo.ts`'s predicates (`isDemo` / `demoConcluded` /
   * `demoDaysRemaining` / `demoLocks`), through which `day.ts`'s demo gate and
   * `deeds.ts`'s CONQUEROR ceiling enforce it; the sim's `legalActions` +
   * `StateSummary.edition`; and the cockpit's demo banner, disabled controls,
   * end card and Settings → Build → Edition row.
   */
  edition: Edition;
  flags: Record<string, FlagValue>;
  storylets: StoryletState;
  player: PlayerState;
  market: MarketState;
  npcs: NpcState[];
  encounter: EncounterState | null;
  /** T-135 · The open Liar's Dice hand, or null. A SCENE, not player-owned data —
   *  see the sibling `encounter` above and docs/LIARS-DICE_REDESIGN.md §2.1. */
  dareHand: DareHandState | null;
  /**
   * T-145 · The LIVE purse of every fixed Liar's Dice roster opponent, keyed by
   * `LiarsDiceOpponent.id` (`docs/LIARS-DICE-PROGRESSION_SPEC.md` §5.2, §7).
   *
   * AT THE ROOT, BESIDE `npcs` AND `dareHand`, AND NOT ON `player` — deliberately.
   * These balances are not the captain's property; they belong to the
   * counterparties, exactly as `npcs[].credits` does. Seeded from the authored
   * bankrolls by `seedLiarsDicePurses` at new game, at load, and by the v14->v15
   * migration.
   *
   * ZERO-SUM AND NEVER REGENERATING (§7.5). Every credit the player takes off a
   * roster opponent came out of that opponent's authored bankroll, and 280,800 cr
   * is the lifetime cap the whole gauntlet can transfer.
   */
  liarsDicePurses: Record<string, number>;
  /** The single active world economic event, or null (T-107). At most one is
   *  ever active; the seeded dusk scheduler owns its lifecycle. */
  eraEvent: EraEventState | null;
  /** Day the previous era event ended — the scheduler's cooldown anchor. 0 when
   *  no era event has ever ended. */
  lastEraEventEndedDay: number;
  eventLog: GameEvent[];
}
