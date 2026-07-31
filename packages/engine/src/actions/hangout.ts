import {
  LENDER_ID,
  LOAN_DAILY_RATE,
  LOAN_TERM_DAYS,
  RUMOR_EMPTY_LINE,
  RUMOR_QUIET_TEMPLATE,
  RUMOR_TEMPLATES,
  LiarsDiceOpponent,
  STAR_SYSTEMS,
  Stat,
} from '@spacerquest/content';
import { GameEvent, GameState, NpcState, PlayerAction } from '../types.js';

/** The five social HangoutEvent venues (excludes the T-1304 lending venues
 *  'borrow'/'repay', which report a LoanEvent instead). */
type HangoutVenue = 'dare' | 'meet' | 'befriend' | 'insult' | 'rumor';
import { SeededRng } from '../rng.js';
import { check, spendDie } from '../dice.js';
import { applyDisposition } from '../npc.js';
import { cloneState } from '../clone.js';
import { loanBandFor, venueOffered, venueParamsFor, wagerBandFor } from '../hangoutRules.js';
import {
  anteFor,
  dicePerSideForTier,
  liarsDiceOpponentFor,
  maxQuantityForDice,
  resolveMixedArchetype,
} from '../liarsDiceRules.js';
import { DareCounterparty, opponentCredits, payOpponent } from './dare.js';

function systemName(systemId: number): string {
  return STAR_SYSTEMS[systemId]?.name ?? `system ${systemId}`;
}

/** Interpolate a `{placeholder}` template with live NPC fields. An unknown
 *  placeholder is left as-is (a defensive no-op — the authored templates only use
 *  the three keys this ever supplies). */
function fillRumor(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => vars[key] ?? whole);
}

/**
 * T-1303 · The rumor-table host slot (PRD §8.3), now filled from AUTHORED content
 * (T-1501). PURE: synthesizes one fact per NPC from LIVE state — the NPC's most
 * recent simulated action (`lastAction`) and its current simulated position
 * (`currentSystemId`) — with the NPCs sharing the player's system listed first
 * (they're at the same tables). Returns at least one line so the slot is never
 * empty.
 *
 * T-1501: the prose no longer lives here. Each line is an authored
 * `RUMOR_TEMPLATES` entry (content) selected by the NPC's live `lastAction.type`,
 * with the warm/cold variant chosen off the NPC's live `disposition` sign, then
 * interpolated with the NPC's live `name`, `lastAction.details`, and system name.
 * The engine owns only the selection + interpolation; the strings are data. An
 * NPC with no logged action yet uses the quiet template; an empty roster uses the
 * empty line — the "always ≥1 fact" guarantee is preserved.
 *
 * Because every line is derived from live NPC fields (type, details, position,
 * disposition), the wire changes the moment the simulation moves an NPC, logs a
 * new action, or its standing shifts — the acceptance's "fills ≥3 dynamic slots
 * from live NPC state" (asserted by seeding ≥3 distinct co-located NPCs and by
 * mutating a field and seeing the output follow it).
 *
 * READERS: the T-1404 Hangout pane renders these (`ui/format.ts
 * hangoutRumorLines`); the `meet` and `rumor` venues attach the output to their
 * HangoutEvent.
 */
export function hangoutRumors(state: GameState): string[] {
  const here = state.player.currentSystemId;
  // N3 · A dead captain is not at the tables and is not gossiped about in the
  // present tense. Their record stays on the roster, so every "who is around"
  // read has to filter — the rumour mill is one of them.
  const living = state.npcs.filter((n) => !n.dead);
  const inSystem = living.filter((n) => n.currentSystemId === here);
  const elsewhere = living.filter((n) => n.currentSystemId !== here);
  const ordered = [...inSystem, ...elsewhere].slice(0, 5);

  const facts: string[] = [];
  for (const npc of ordered) {
    const where = systemName(npc.currentSystemId);
    if (npc.lastAction) {
      // Live `lastAction` (written by the NPC sim each dusk) selects the authored
      // template by action type; live `disposition` sign picks warm vs. grudge.
      const template = RUMOR_TEMPLATES[npc.lastAction.type] ?? RUMOR_TEMPLATES.Idle;
      const phrasing = npc.disposition < 0 ? template.cold : template.warm;
      facts.push(
        fillRumor(phrasing, { name: npc.name, details: npc.lastAction.details, system: where }),
      );
    } else {
      facts.push(fillRumor(RUMOR_QUIET_TEMPLATE, { name: npc.name, system: where }));
    }
  }

  if (facts.length === 0) {
    // Degenerate empty-roster corner: keep the "always ≥1 fact" guarantee.
    facts.push(RUMOR_EMPTY_LINE);
  }
  return facts;
}

/**
 * T-1303 · Visit the Spacers Hangout (PRD §7). The player's die-costed scene at a
 * `hasHangout` system: a wagered opposed-GUILE **Spacer's Dare**, three social
 * beats (meet / befriend / insult) that move a co-located NPC's disposition
 * (feeding T-1204's live interception + tribute-DC readers), and the rumor host
 * slot. Pure: clones state, mutates the clone, returns typed events — never
 * throws (every player-possible input, including malformed die selection or an
 * opponent who isn't actually in-system, resolves to a typed HangoutEvent fail,
 * mirroring resolveExploration's convention). The Dare's opposed roll mirrors
 * combat.ts resolveRun exactly (each side's check framed against the other's
 * total); there is deliberately no fixed DC constant — a Dare is opposed, so the
 * dealer's live GUILE total IS the difficulty (a strong dealer is a hard table).
 *
 * The hangout-system gate and encounter gate live in day.ts (the only runtime
 * caller), which emits a typed ActionBlocked before this resolver is reached.
 *
 * T-120 · PARAMETERISED PER PORT (docs/HANGOUT_REDESIGN.md ruling 3). Every number
 * this resolver used to read from a bare content constant now comes from the
 * port's row through `hangoutRules.ts` — `wagerBandFor` for the stake band,
 * `loanBandFor` for the principal band (T-133 / owner ruling D7), `venueParamsFor`
 * for the DCs and disposition deltas, `venueOffered` for whether the house runs
 * the beat at all. THE RULES DID NOT MOVE: the opposed-GUILE
 * resolution, the clamp algebra, `applyDisposition`, `spendDie` and the loan ledger
 * are all still here, identical, and there is NO port-specific branch anywhere in
 * this file. A port is an instance; this is the rule that reads it.
 */
export function resolveVisitHangout(
  state: GameState,
  action: Extract<PlayerAction, { type: 'VisitHangout' }>,
  rng: SeededRng,
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const nextState = cloneState(state);
  const day = nextState.day;
  // T-120: the port whose venue definition parameterises this whole resolution.
  // Resolved ONCE, from live state — never a literal, never a branch.
  const systemId = nextState.player.currentSystemId;

  // --- Die validation (malformed input → typed fail, NO die spent) ----------
  // Same three-way split as resolveExploration: a type-valid action can still
  // name no die / an out-of-range die / an already-burned die. None of those
  // spend anything. T-1304: the two lending venues report the SAME three
  // malformed-die fails as a LoanEvent (their reader is the Penny Wise pane, not
  // the Hangout social pane), so `failVenue` picks the right typed event.
  const isLending = action.venue === 'borrow' || action.venue === 'repay';
  const failVenue = (
    failReason: 'no-die' | 'invalid-die-index' | 'die-already-spent' | 'venue-not-offered',
  ): GameEvent =>
    isLending
      ? { type: 'LoanEvent', day, kind: 'failed', failReason }
      : { type: 'HangoutEvent', day, venue: action.venue as HangoutVenue, failReason };

  if (action.spendDie === undefined) {
    events.push(failVenue('no-die'));
    return { state: nextState, events };
  }
  const hand = nextState.player.dawnHand;
  const index = action.spendDie;
  if (!hand || index < 0 || index >= hand.dice.length) {
    events.push(failVenue('invalid-die-index'));
    return { state: nextState, events };
  }
  if (hand.spent[index]) {
    events.push(failVenue('die-already-spent'));
    return { state: nextState, events };
  }

  // --- The port must actually run this venue (T-120, HANGOUT_REDESIGN §2.6) ---
  // ONE rule, evaluated the same way at every port — not a per-port branch. A
  // garrison mess with no credit desk omits 'borrow'/'repay'; a card room that will
  // not seat a stranger omits 'meet'. Refused BEFORE spendDie, like every other
  // typed refusal, so nothing is charged for an act the house never offered, and
  // routed through `failVenue` so the lending pair still reports a LoanEvent.
  if (!venueOffered(systemId, action.venue)) {
    events.push(failVenue('venue-not-offered'));
    return { state: nextState, events };
  }

  // --- GATE 2 (T-135, LIARS-DICE §9.3): one hand at a time ------------------
  // A `VisitHangout{venue:'dare'}` while a hand is already open is a typed refusal
  // with NO die spent — which is why it sits here, with the other pre-spend
  // refusals, and not inside the switch (the die is burned a few lines below, for
  // every venue). `day.ts`'s gate 1 already refuses this with an ActionBlocked;
  // this is the RESOLVER'S OWN defence, so its never-throws contract is
  // self-contained rather than dependent on its caller. NOT routed through
  // `failVenue`: that helper also serves the two LENDING venues, whose LoanEvent
  // carries its own reason union, and `dare-hand-open` is not one of them.
  if (action.venue === 'dare' && nextState.dareHand) {
    events.push({ type: 'HangoutEvent', day, venue: 'dare', failReason: 'dare-hand-open' });
    return { state: nextState, events };
  }

  // --- Opponent resolution (all venues except 'rumor') ----------------------
  // The load-bearing "an NPC actually present in-system" guarantee: the dealer /
  // target must be an NPC whose SIMULATED position (currentSystemId, moved by the
  // NPC sim each dusk) is the player's current system. A named opponent who has
  // wandered off is a typed fail, NOT a crash and NOT a die burned (malformed
  // targeting, like naming a die that isn't in the hand).
  // T-1304: 'borrow'/'repay' are opponent-less like 'rumor' — Penny Wise is the
  // lender-of-record (the desk), not a co-located NPC, so the §7.5 "quiet word
  // with Penny Wise" bad-day out is reliably available at any Hangout.
  //
  // T-145 · POOL A IS A PARALLEL BRANCH, NOT A REPLACEMENT
  // (`docs/LIARS-DICE-PROGRESSION_SPEC.md` §8 row 10). The `!n.dead &&
  // n.currentSystemId === …` filter below still governs pool B, untouched; the
  // roster branch is keyed on the `ld-` id NAMESPACE and resolves through the
  // engine's own `liarsDiceOpponentFor`, which is keyed on the PORT as well as the
  // id — so a roster opponent authored at Deneb-4 is not seatable at Sun-3.
  //
  // ONE DETERMINED CONSEQUENCE, implemented rather than discovered: **a roster id
  // resolves only for `venue: 'dare'`.** `meet` / `befriend` / `insult` all need an
  // `NpcState` for `applyDisposition`, and pool A has none (§1 rule 1), so a roster
  // id at a social venue falls through to the pool-B lookup and typed-fails with
  // `no-opponent` — which is the honest answer, not an oversight.
  const opponentlessVenue =
    action.venue === 'rumor' || action.venue === 'borrow' || action.venue === 'repay';
  let dealer: NpcState | undefined;
  let rosterOpponent: LiarsDiceOpponent | undefined;
  if (!opponentlessVenue) {
    const namesRoster =
      action.venue === 'dare' &&
      typeof action.opponentId === 'string' &&
      action.opponentId.startsWith('ld-');
    if (namesRoster) {
      rosterOpponent = liarsDiceOpponentFor(systemId, action.opponentId as string);
    } else {
      // N3 · A dead captain cannot deal a hand of Spacer's Dare.
      const inSystem = nextState.npcs.filter(
        (n) => !n.dead && n.currentSystemId === nextState.player.currentSystemId,
      );
      dealer = inSystem.find((n) => n.id === action.opponentId);
    }
    if (!dealer && !rosterOpponent) {
      events.push({
        type: 'HangoutEvent',
        day,
        // Narrowed by `!opponentlessVenue` to the four social venues.
        venue: action.venue as HangoutVenue,
        opponentId: action.opponentId,
        failReason: 'no-opponent',
      });
      return { state: nextState, events };
    }
  }

  // --- T-145 · THE BROKE REFUSAL (§7.4): typed fail, NO die spent ------------
  // A roster opponent whose LIVE purse has fallen to zero will not sit. Placed
  // here, with the other pre-`spendDie` refusals, because a refusal must never
  // burn a dawn die — the invariant every existing refusal in this function keeps.
  //
  // THEY DO NOT REGENERATE, EVER, and that is safe. The theorem, written here
  // because a future reader who finds a broke-opponent refusal with no
  // regeneration will otherwise reasonably assume it is a bug:
  //
  //   A roster opponent's purse moves only through the three sites of §7.1, and
  //   the only one that DECREASES it net over a whole hand is losing the pot at
  //   settlement — the seed and ante debits are matched by the pot credit whenever
  //   the opponent wins. So a purse can fall below its authored bankroll only by
  //   LOSING HANDS TO THE PLAYER. Every player win over a roster opponent writes
  //   that opponent's id into `liarsDiceBeaten` (§6.2 step 1, unconditional on the
  //   first such win). Therefore `purse < bankroll ⟹ the opponent has lost at
  //   least one hand ⟹ id ∈ liarsDiceBeaten`, and a fortiori
  //   `purse <= 0 ⟹ id ∈ liarsDiceBeaten`. **BROKE IMPLIES BEATEN.** The beaten
  //   set already contains every broke opponent, so no completion set can be short
  //   an opponent the player is now unable to play. ∎
  //
  //   PRECONDITION: the opponent must be able to sit at least once, i.e.
  //   `bankroll >= 1`. The content validator asserts the far stronger
  //   `bankroll >= wagerBandFor(systemId).min` at all 42 rows, so a later content
  //   pass cannot break the theorem's foundation.
  if (rosterOpponent && (nextState.liarsDicePurses[rosterOpponent.id] ?? 0) <= 0) {
    events.push({
      type: 'HangoutEvent',
      day,
      venue: 'dare',
      opponentId: rosterOpponent.id,
      failReason: 'opponent-broke',
    });
    return { state: nextState, events };
  }

  // --- Lending preconditions (T-1304): typed fail, NO die spent -------------
  // A lending rule that refuses the action (already borrowing / nothing to
  // repay / nothing payable) is a typed LoanEvent fail that spends NOTHING —
  // mirroring the malformed-die fails above and the debt-as-ledger law: a loan
  // can only ever ADD an out, never burn a resource on a no-op.
  let repayPaid = 0;
  if (action.venue === 'borrow' && nextState.player.loan) {
    events.push({ type: 'LoanEvent', day, kind: 'failed', failReason: 'already-has-loan' });
    return { state: nextState, events };
  }
  if (action.venue === 'repay') {
    const loan = nextState.player.loan;
    if (!loan) {
      events.push({ type: 'LoanEvent', day, kind: 'failed', failReason: 'no-loan' });
      return { state: nextState, events };
    }
    // Pay the requested amount (default = full balance), clamped to what the
    // player can afford AND to the outstanding balance — credits never go
    // negative, the balance never over-pays.
    const requested = action.amount ?? loan.outstanding;
    repayPaid = Math.min(Math.max(0, requested), nextState.player.credits, loan.outstanding);
    if (repayPaid <= 0) {
      events.push({ type: 'LoanEvent', day, kind: 'failed', failReason: 'insufficient-credits' });
      return { state: nextState, events };
    }
  }

  // The attempt commits — spend the die.
  const { die } = spendDie(hand, index);
  hand.spent[index] = true;

  const playerGuile = nextState.player.stats[Stat.GUILE];

  switch (action.venue) {
    case 'dare': {
      // T-135 · THE DARE IS NOW A SCENE, NOT A CHECK (owner ruling D2,
      // docs/LIARS-DICE_REDESIGN.md). This arm OPENS a Liar's Dice hand and
      // returns; the bidding, the dealer's answers and the settlement are
      // `actions/dare.ts`'s, driven by further `Dare` actions.
      //
      // WHAT THIS ARM DOES **NOT** EMIT ANY MORE: no StatCheck (the hand's one
      // possible check is the optional Peek, §8.4 — a named consequence, see
      // finding F-134-2), no DispositionChanged, and no terminal HangoutEvent.
      // All three come at settlement, which is where the outcome actually exists.
      // T-145 · The counterparty, resolved by POOL. Every money site below routes
      // through `opponentCredits` / `payOpponent`, the only two places in the
      // engine that branch on `opponentKind` for money (§7.1).
      const counterparty: DareCounterparty = rosterOpponent
        ? { dealerId: rosterOpponent.id, opponentKind: 'roster' }
        : { dealerId: dealer!.id, opponentKind: 'roaming' };

      // The clamp algebra, CHARACTER FOR CHARACTER as before (§3): the requested
      // stake, clamped into the PORT'S band and DOWN to what both sides can cover
      // (a stake a broke dealer cannot match is capped, never a crash). Both sides
      // post it, which is why the dealer's purse is inside the cap.
      //
      // T-145 · THE THIRD TERM NOW READS THE LIVE BALANCE OF WHICHEVER POOL the
      // counterparty came from (§7.2). NO NEW BRANCH FOR THE SIT-DOWN (§7.3): the
      // shipped algebra already lets `cap` fall under `band.min`, so a roster
      // opponent with a purse below the port's floor sits for whatever they have —
      // which is already today's behaviour for a poor roaming dealer.
      const band = wagerBandFor(systemId);
      const requested = action.wager ?? band.min;
      const cap = Math.min(
        band.max,
        nextState.player.credits,
        opponentCredits(nextState, counterparty),
      );
      const seedWager = Math.max(0, Math.min(Math.max(requested, band.min), cap));

      // ROLL ORDER IS FIXED AND LOAD-BEARING: the player's dice first, then the
      // dealer's, off the action's forked rng. It decides the day-loop goldens,
      // so it is stated rather than left to the reader.
      //
      // T-145 · THE DRAW-ORDER RULING, stated HERE because this is where the
      // draws happen (`docs/LIARS-DICE-PROGRESSION_SPEC.md` §3.7):
      //   AT OPEN  — the player's `dicePerSide` dice, then the dealer's
      //              `dicePerSide` dice, then (ONLY when the roster row's
      //              archetype is 'mixed') exactly ONE archetype roll, appended
      //              LAST.
      //   PER MOVE — both pools draw exactly one `floor(rng.next() * 100)` before
      //              dispatch, WHETHER OR NOT the chosen policy consumes it
      //              (`optimal` ignores it; the draw still happens). A
      //              policy-dependent draw count would make the rng stream depend
      //              on the archetype, so a content edit to one opponent's label
      //              would move every downstream number in the campaign.
      // At tier 0 against a roaming opponent both sequences are byte-identical to
      // what M4d shipped, which is why the goldens are provably inert until a
      // roster hand or a ladder unlock actually occurs.
      const dicePerSide = dicePerSideForTier(0);
      const playerDice: number[] = [];
      for (let i = 0; i < dicePerSide; i += 1) playerDice.push(rng.d6());
      const dealerDice: number[] = [];
      for (let i = 0; i < dicePerSide; i += 1) dealerDice.push(rng.d6());

      // ESCROW, NOT A PROMISE (§2.4): both seeds are debited NOW, so a reload
      // mid-hand can neither mint nor lose the pot and a fold is a transfer of
      // money that already exists. INVARIANT, asserted by liarsDice.test.ts:
      // `player.credits + dareHand.potPlayer` is conserved across the whole hand.
      nextState.player.credits -= seedWager;
      // T-145 · the FIRST of the three zero-sum sites (§7.1), kind-resolved. For a
      // roaming dealer this is still the copy-on-write `mutableNpc` write it always
      // was; for a roster opponent it debits `state.liarsDicePurses`.
      payOpponent(nextState, counterparty, -seedWager);

      // T-145 · A 'mixed' row is resolved to ONE CONCRETE archetype HERE, at open,
      // and the concrete result is what is stored (§3.6). `opponentArchetype` is
      // NEVER the string 'mixed'. This is the only archetype roll in the hand, and
      // it is drawn LAST — after both sides' dice — so the roaming path's draw
      // sequence stays byte-identical to today's.
      let opponentArchetype: 'optimal' | 'bad' | 'random' | null = null;
      if (rosterOpponent) {
        opponentArchetype =
          rosterOpponent.archetype === 'mixed'
            ? resolveMixedArchetype(rosterOpponent.mix!, Math.floor(rng.next() * 100))
            : rosterOpponent.archetype;
      }

      // The ante is resolved ONCE, here, and stored — so a content edit between
      // two `applyPlayerAction` calls cannot move the price of a raise mid-hand.
      // `systemId` is frozen for the same reason.
      const ante = anteFor(systemId);
      nextState.dareHand = {
        id: `dare-${day}-${counterparty.dealerId}-${nextState.dayEventCount}`,
        systemId,
        dealerId: counterparty.dealerId,
        openedDay: day,
        playerDice,
        dealerDice,
        bid: null,
        bidder: null,
        seedWager,
        ante,
        potPlayer: seedWager,
        potDealer: seedWager,
        peekUsed: false,
        peekedDealerDie: null,
        history: [],
        // T-145 · ALL FIVE NEW FIELDS ARE WRITTEN AT EVERY OPEN, roaming hands
        // included (§5.6 ruling A). **A schema key and a migration cannot make a
        // NEWLY-OPENED hand carry a field; only this literal can.**
        //
        // `opponentKind` / `opponentArchetype` carry their REAL values from the
        // first commit, because T-145 is the task that introduces pool A at all.
        // The three LADDER values are written at tier-0 THROUGH THE RULES rather
        // than as literals — exactly the numbers the shipped engine already
        // computes, so the fields exist, the schema pins them, the migration
        // backfills them, and nothing observable moves. T-146 changes one thing
        // about this block: where the `0` comes from.
        opponentKind: counterparty.opponentKind,
        opponentArchetype,
        dicePerSide,
        maxQuantity: maxQuantityForDice(dicePerSide),
        bandMax: band.max,
      };

      // THE HIDDEN-DICE DISCIPLINE (§10.2): `playerDice` only. `state.eventLog` is
      // serialized into the save and rendered line by line by the UI, so a
      // DareHandStarted carrying both hands would leak the dealer's hand to the
      // pane and into a file a curious player can read.
      events.push({
        type: 'DareHandStarted',
        day,
        handId: nextState.dareHand.id,
        opponentId: counterparty.dealerId,
        systemId,
        seedWager,
        ante,
        playerDice: [...playerDice],
        // T-145 · the UI cannot render a table without knowing how many dice are
        // on it, and the roster opponent's TABLE TALK is the line the pane shows
        // at open. Both are OPTIONAL on the event (strip-mode forward-compat); the
        // dice count is REQUIRED on the hand, which is what the live pane reads.
        dicePerSide,
        ...(rosterOpponent ? { opponentLine: rosterOpponent.lines.tableTalk } : {}),
      });
      break;
    }

    case 'befriend': {
      // A GUILE charm check against the PORT's table DC — charm can fall flat, and
      // a house that is hard to charm says so with a number, not a rule. No
      // actionContext: a context-less player GUILE check classifies to the wire's
      // 'talk' bucket (wire.ts classifyCheck), not the gamble bucket.
      const dealerNpc = dealer!;
      const befriendParams = venueParamsFor(systemId, 'befriend');
      const result = check(die, playerGuile, befriendParams.dc);
      events.push({
        type: 'StatCheck',
        actor: 'Player',
        stat: Stat.GUILE,
        dc: befriendParams.dc,
        result,
      });
      if (result.success) {
        applyDisposition(
          nextState,
          dealerNpc.id,
          befriendParams.dispositionOnSuccess,
          'befriend',
          events,
        );
      }
      events.push({
        type: 'HangoutEvent',
        day,
        venue: 'befriend',
        opponentId: dealerNpc.id,
        success: result.success,
      });
      break;
    }

    case 'insult': {
      // An insult always lands — no check (PRD §7.4: "you laughed at his hand …
      // 'I never let an insult go'"). This is exactly the disposition drop that
      // makes a co-located NPC re-hunt the player through T-1204's live readers.
      const dealerNpc = dealer!;
      applyDisposition(
        nextState,
        dealerNpc.id,
        venueParamsFor(systemId, 'insult').dispositionOnSuccess,
        'insult',
        events,
      );
      events.push({ type: 'HangoutEvent', day, venue: 'insult', opponentId: dealerNpc.id });
      break;
    }

    case 'meet': {
      // An introduction: a single friendly step, and gossip comes with it.
      const dealerNpc = dealer!;
      applyDisposition(
        nextState,
        dealerNpc.id,
        venueParamsFor(systemId, 'meet').dispositionOnSuccess,
        'meet',
        events,
      );
      events.push({
        type: 'HangoutEvent',
        day,
        venue: 'meet',
        opponentId: dealerNpc.id,
        rumors: hangoutRumors(nextState),
      });
      break;
    }

    case 'rumor': {
      // The host slot: read the room. ≥1 fact synthesized from live NPC state.
      events.push({ type: 'HangoutEvent', day, venue: 'rumor', rumors: hangoutRumors(nextState) });
      break;
    }

    case 'borrow': {
      // T-1304 · Take a loan at Penny Wise's desk. The already-has-loan case was
      // rejected above (no die spent). Clamp the requested principal into the
      // port's band and advance it: credits go UP by the principal, the loan is
      // recorded, interest accrues later at dusk (day.ts). Debt-as-ledger: the
      // advance ONLY adds credits — this is the §7.5 out, never a trap.
      // T-133 · the two bounds are the PORT's (`loanBandFor`, owner ruling D7);
      // the clamp ALGEBRA is the engine's rule and is unchanged, exactly as the
      // dare's stake clamp reads `wagerBandFor` above. A request over the ceiling
      // is CLAMPED, never refused — the desk counts out less than you asked for.
      const loanBand = loanBandFor(systemId);
      const requested = action.amount ?? loanBand.min;
      const principal = Math.max(loanBand.min, Math.min(loanBand.max, requested));
      const dueDay = day + LOAN_TERM_DAYS;
      nextState.player.loan = {
        lender: LENDER_ID,
        principal,
        outstanding: principal,
        dailyRate: LOAN_DAILY_RATE,
        borrowedDay: day,
        dueDay,
        status: 'active',
      };
      nextState.player.credits += principal;
      events.push({
        type: 'LoanEvent',
        day,
        kind: 'borrowed',
        lender: LENDER_ID,
        principal,
        dailyRate: LOAN_DAILY_RATE,
        dueDay,
        outstanding: principal,
      });
      break;
    }

    case 'repay': {
      // T-1304 · Pay down the loan. `repayPaid` was computed and validated above
      // (> 0, affordable, <= outstanding), before the die was spent. Move the
      // credits, shrink the balance; a balance driven to <= 0 CLEARS the whole
      // loan (status included) — repaying is what lifts the collection pressure
      // and the Penny Wise grudge's cause.
      const loan = nextState.player.loan!;
      nextState.player.credits -= repayPaid;
      loan.outstanding -= repayPaid;
      const cleared = loan.outstanding <= 0;
      if (cleared) {
        nextState.player.loan = null;
      }
      events.push({
        type: 'LoanEvent',
        day,
        kind: 'repaid',
        lender: loan.lender,
        amountPaid: repayPaid,
        outstanding: cleared ? 0 : loan.outstanding,
        cleared,
      });
      break;
    }
  }

  return { state: nextState, events };
}
