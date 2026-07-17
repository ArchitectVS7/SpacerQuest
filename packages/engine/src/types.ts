import {
  AnonymousInterceptorKind,
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
  eventIndex: number;
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
    'buy-fuel' | 'sign-contract' | 'haggle' | 'deliver-cargo' | 'forfeit-cargo' | 'pay-debt-failed';
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
        | 'gamble';
    }
  | { type: 'FlawCheck'; npcId: string; flaw: string; die: number; dc: number; resisted: boolean }
  | { type: 'NpcAction'; npcId: string; actionDetails: string }
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
      actionType: 'Trade' | 'Travel' | 'Shipyard' | 'Storylet' | 'Explore' | 'VisitHangout';
      // 'destination-locked' (T-1101): a Travel to a sealed system (Andromeda /
      // special) before the 'nemesis.crossing.unlocked' flag lifts it.
      // 'no-hangout' (T-1303): a VisitHangout at a system without a Spacers
      // Hangout (hasHangout !== true) — refused with no die spent, no throw.
      reason: 'active-encounter' | 'destination-locked' | 'no-hangout';
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
       * An Explore attempt produced nothing (T-111a). Two distinct classes:
       *  - RESOLVED fails — `nav-check` / `insufficient-fuel`: a real detour was
       *    attempted, so the die IS spent (and fuel burned, for nav-check).
       *  - MALFORMED-input fails (T-1003) — `no-die` / `invalid-die-index` /
       *    `die-already-spent`: the Explore action named no usable die, so there
       *    was nothing to spend. NO die is spent and NO fuel is burned; these
       *    replace the raw `Error`s that used to crash the UGT adapter, keeping
       *    the typed-fail-event convention (every player-possible input is an
       *    event, never a throw).
       */
      type: 'ExplorationFailed';
      day: number;
      systemId: number;
      reason:
        'nav-check' | 'insufficient-fuel' | 'no-die' | 'invalid-die-index' | 'die-already-spent';
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
       * T-1505 · The Nemesis crossing completed — the career's terminal act. Emitted
       * by engine `day.ts` when a Travel ARRIVES at NEMESIS (system 28) with
       * `flags['nemesis.crossing.unlocked']` set (the crossing committed at
       * Polaris-1). The v1 endgame: Andromeda beyond stays sealed for the expansion.
       * READERS: the sim's crossing-completable assertion (campaign-crossing.test)
       * and the UI ending ceremony (format.ts `crossingEnding` → App.tsx). Derived,
       * not stored — no new GameState field: the ending is a pure function of
       * `currentSystemId === 28 && flags['nemesis.crossing.unlocked']`, and this
       * event is the wire-line receipt of the arrival day.
       */
      type: 'CrossingCompleted';
      day: number;
      /** Decoded fragments the captain crossed with (the assembled signal). */
      fragmentsDecoded: number;
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
      failReason?: 'no-die' | 'invalid-die-index' | 'die-already-spent' | 'no-opponent';
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
        | 'insufficient-credits';
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
      // T-1505: `insufficient-fuel` — a `minFuel` choice requirement (the Nemesis
      // crossing ship stake) the ship's tank cannot currently meet.
      reason:
        | 'not-available'
        | 'unknown-choice'
        | 'insufficient-credits'
        | 'insufficient-fuel'
        | 'missing-die';
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
      action: 'buy-fuel' | 'sign-contract' | 'haggle' | 'pay-debt';
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
  fuel: number;
  /** Per-NPC standing toward the player, clamped to [-10, +10]; decays one
   *  step toward 0 each dusk. */
  disposition: number;
  lastAction?: NpcAction;
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
 * aggregator), day.ts (dawn roll + dusk wage upkeep), actions/crew.ts (hire /
 * dismiss / reroll), the sim protocol, and T-1405's UI crew pane.
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
  /** T-1306 · Hired crew — the dice-progression source (PRD §7). A new persistent
   *  field (v3→v4 save migration + round-trip test ship with it). Capped by
   *  `crewCapacity(ship)` (cabin berths, the T-1205 socket). READERS: dice.ts
   *  `dawnDiceModifiers` reads it to build the dawn hand's size/floor/rerolls;
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
  /** T-106 contract competition: jobs claimed off the local board by NPCs at
   *  dusk. Each claim removes the offer from the live board immediately AND
   *  shrinks the next dawn's board generation pool by one (the depot's job
   *  pool was drained). Reset to 0 by startDay after it is consumed. */
  npcClaims: number;
}

export interface GameState {
  day: number;
  rngState: number; // Storing the seed state to resume
  dayPhase: DayPhase;
  dayEventCount: number;
  era: EraId;
  flags: Record<string, FlagValue>;
  storylets: StoryletState;
  player: PlayerState;
  market: MarketState;
  npcs: NpcState[];
  encounter: EncounterState | null;
  /** The single active world economic event, or null (T-107). At most one is
   *  ever active; the seeded dusk scheduler owns its lifecycle. */
  eraEvent: EraEventState | null;
  /** Day the previous era event ended — the scheduler's cooldown anchor. 0 when
   *  no era event has ever ended. */
  lastEraEventEndedDay: number;
  eventLog: GameEvent[];
}
