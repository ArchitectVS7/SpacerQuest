import {
  BEFRIEND_DC,
  BEFRIEND_DISPOSITION,
  DARE_LOSS_DISPOSITION,
  DARE_MAX_WAGER,
  DARE_MIN_WAGER,
  DARE_WIN_DISPOSITION,
  INSULT_DISPOSITION,
  LENDER_ID,
  LOAN_DAILY_RATE,
  LOAN_MAX_PRINCIPAL,
  LOAN_MIN_PRINCIPAL,
  LOAN_TERM_DAYS,
  MEET_DISPOSITION,
  NPC_PROFILES,
  RUMOR_EMPTY_LINE,
  RUMOR_QUIET_TEMPLATE,
  RUMOR_TEMPLATES,
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
  const inSystem = state.npcs.filter((n) => n.currentSystemId === here);
  const elsewhere = state.npcs.filter((n) => n.currentSystemId !== here);
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

/** GUILE score of the NPC behind a state id (via its profile — NpcState carries
 *  no stat block, only a `profileId`). Falls back to 0 for an unknown profile. */
function npcGuile(npc: NpcState): number {
  return NPC_PROFILES.find((p) => p.id === npc.profileId)?.stats[Stat.GUILE] ?? 0;
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
 */
export function resolveVisitHangout(
  state: GameState,
  action: Extract<PlayerAction, { type: 'VisitHangout' }>,
  rng: SeededRng,
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const nextState = JSON.parse(JSON.stringify(state)) as GameState;
  const day = nextState.day;

  // --- Die validation (malformed input → typed fail, NO die spent) ----------
  // Same three-way split as resolveExploration: a type-valid action can still
  // name no die / an out-of-range die / an already-burned die. None of those
  // spend anything. T-1304: the two lending venues report the SAME three
  // malformed-die fails as a LoanEvent (their reader is the Penny Wise pane, not
  // the Hangout social pane), so `failVenue` picks the right typed event.
  const isLending = action.venue === 'borrow' || action.venue === 'repay';
  const failVenue = (
    failReason: 'no-die' | 'invalid-die-index' | 'die-already-spent',
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

  // --- Opponent resolution (all venues except 'rumor') ----------------------
  // The load-bearing "an NPC actually present in-system" guarantee: the dealer /
  // target must be an NPC whose SIMULATED position (currentSystemId, moved by the
  // NPC sim each dusk) is the player's current system. A named opponent who has
  // wandered off is a typed fail, NOT a crash and NOT a die burned (malformed
  // targeting, like naming a die that isn't in the hand).
  // T-1304: 'borrow'/'repay' are opponent-less like 'rumor' — Penny Wise is the
  // lender-of-record (the desk), not a co-located NPC, so the §7.5 "quiet word
  // with Penny Wise" bad-day out is reliably available at any Hangout.
  const opponentlessVenue =
    action.venue === 'rumor' || action.venue === 'borrow' || action.venue === 'repay';
  let dealer: NpcState | undefined;
  if (!opponentlessVenue) {
    const inSystem = nextState.npcs.filter(
      (n) => n.currentSystemId === nextState.player.currentSystemId,
    );
    dealer = inSystem.find((n) => n.id === action.opponentId);
    if (!dealer) {
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
      // Opposed GUILE, mirroring combat.ts resolveRun: the dealer rolls a d20 off
      // the forked action rng, and EACH side's check is framed against the OTHER's
      // total so both StatChecks are well-formed. Ties go to the player (their
      // check succeeds when totals are equal).
      const dealerNpc = dealer!;
      const dealerGuile = npcGuile(dealerNpc);
      const dealerDie = rng.d20();
      const playerRoll = check(die, playerGuile, dealerDie + dealerGuile);
      const dealerRoll = check(dealerDie, dealerGuile, die + playerGuile);
      const playerWon = playerRoll.success;

      // Player check carries actionContext 'gamble' → the wire scanner routes a
      // nat here to the Spacer's Dare bucket (PRD §6 sample line). The dealer's
      // roll carries 'npc-socialize', which also routes to the gamble bucket.
      events.push({
        type: 'StatCheck',
        actor: 'Player',
        stat: Stat.GUILE,
        dc: playerRoll.dc,
        result: playerRoll,
        actionContext: 'gamble',
      });
      events.push({
        type: 'StatCheck',
        actor: dealerNpc.id,
        stat: Stat.GUILE,
        dc: dealerRoll.dc,
        result: dealerRoll,
        actionContext: 'npc-socialize',
      });

      // Wager: the requested stake, clamped into [MIN, MAX] and DOWN to what both
      // sides can cover (a stake a broke dealer can't match is capped, never a
      // crash / never a negative balance either way).
      const requested = action.wager ?? DARE_MIN_WAGER;
      const cap = Math.min(DARE_MAX_WAGER, nextState.player.credits, dealerNpc.credits);
      const wager = Math.max(0, Math.min(Math.max(requested, DARE_MIN_WAGER), cap));

      // Credits move BOTH directions off the same wager.
      const creditsDelta = playerWon ? wager : -wager;
      nextState.player.credits += creditsDelta;
      dealerNpc.credits -= creditsDelta;

      // Disposition shifts on BOTH outcomes (a Dare is memorable either way): a
      // beaten dealer sours (DARE_WIN_DISPOSITION, negative), a dealer who took
      // the spacer's stake warms (DARE_LOSS_DISPOSITION, positive). Feeds T-1204's
      // live interception + tribute-DC readers.
      applyDisposition(
        nextState,
        dealerNpc.id,
        playerWon ? DARE_WIN_DISPOSITION : DARE_LOSS_DISPOSITION,
        'dare',
        events,
      );

      events.push({
        type: 'HangoutEvent',
        day,
        venue: 'dare',
        opponentId: dealerNpc.id,
        wager,
        playerWon,
        creditsDelta,
      });
      break;
    }

    case 'befriend': {
      // A GUILE charm check against a fixed table DC — charm can fall flat. No
      // actionContext: a context-less player GUILE check classifies to the wire's
      // 'talk' bucket (wire.ts classifyCheck), not the gamble bucket.
      const dealerNpc = dealer!;
      const result = check(die, playerGuile, BEFRIEND_DC);
      events.push({
        type: 'StatCheck',
        actor: 'Player',
        stat: Stat.GUILE,
        dc: BEFRIEND_DC,
        result,
      });
      if (result.success) {
        applyDisposition(nextState, dealerNpc.id, BEFRIEND_DISPOSITION, 'befriend', events);
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
      applyDisposition(nextState, dealerNpc.id, INSULT_DISPOSITION, 'insult', events);
      events.push({ type: 'HangoutEvent', day, venue: 'insult', opponentId: dealerNpc.id });
      break;
    }

    case 'meet': {
      // An introduction: a single friendly step, and gossip comes with it.
      const dealerNpc = dealer!;
      applyDisposition(nextState, dealerNpc.id, MEET_DISPOSITION, 'meet', events);
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
      // content band and advance it: credits go UP by the principal, the loan is
      // recorded, interest accrues later at dusk (day.ts). Debt-as-ledger: the
      // advance ONLY adds credits — this is the §7.5 out, never a trap.
      const requested = action.amount ?? LOAN_MIN_PRINCIPAL;
      const principal = Math.max(LOAN_MIN_PRINCIPAL, Math.min(LOAN_MAX_PRINCIPAL, requested));
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
