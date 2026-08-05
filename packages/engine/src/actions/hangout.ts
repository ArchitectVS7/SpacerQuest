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
import { check } from '../dice.js';
import { applyDisposition } from '../npc.js';
import { cloneState } from '../clone.js';
import {
  isSocialPoolVenue,
  loanBandFor,
  npcGuile,
  socialPlaysRemaining,
  venueOffered,
  venueParamsFor,
  wagerBandFor,
} from '../hangoutRules.js';
import {
  anteFor,
  dicePerSideForTier,
  effectiveWagerBand,
  liarsDiceOpponentFor,
  liarsDiceRoundsPerDay,
  liarsDiceTier,
  maxQuantityForDice,
  readTheTableLine,
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
 * T-1303 · Visit the Spacers Hangout (PRD §7). The player's scene at a
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
 * resolution, the clamp algebra, `applyDisposition` and the loan ledger
 * are all still here, identical, and there is NO port-specific branch anywhere in
 * this file. A port is an instance; this is the rule that reads it.
 *
 * T-197 · ALL SEVEN VENUES ARE FREE ACTIONS (`docs/DAWN-HAND-REDESIGN.md` §3 as
 * amended 2026-08-04). This resolver no longer touches the dawn hand AT ALL —
 * there is no `spendDie` on the action, no die validation and no spend. Two daily
 * allowances replaced it, both enforced in this file and both on the save:
 *
 *   §4a · THE SOCIAL POOL — `SOCIAL_PLAYS_PER_DAY` plays shared by `meet`,
 *         `befriend` and `insult`, decremented ON RESOLUTION whatever the outcome,
 *         refusing with a typed `social-limit-reached` when spent out.
 *   §4b · THE ROUNDS CAP — how many Liar's Dice hands may be OPENED in a day,
 *         scaling with `liarsDiceTier`, refusing with a typed `daily-round-limit`.
 *
 * `rumor` (read-only), `borrow` and `repay` (single-loan slot + credits) draw from
 * NEITHER: they already had a real bound, which is the whole §3 test. Both caps
 * reset at dawn through `resetDailyHangoutCaps` at `day.ts`'s existing chokepoint.
 *
 * PEEK IS UNTOUCHED AND STILL COSTS A DIE. It is the one real check inside an open
 * hand and stayed a Main Action by ruling; its spend lives entirely in
 * `actions/dare.ts` and is now the only Hangout-family die spend in the engine.
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

  // --- T-197 · THERE IS NO DIE VALIDATION HERE ANY MORE ---------------------
  // All SEVEN venues are FREE ACTIONS (docs/DAWN-HAND-REDESIGN.md §3 as amended
  // 2026-08-04): dare-open, meet, befriend, insult, rumor, borrow and repay cost
  // no dawn die. The three malformed-die refusals that stood here — `no-die`,
  // `invalid-die-index`, `die-already-spent` — are gone with the spend they
  // guarded, and so is the `spendDie` field on the action shape (types.ts and
  // schema.ts, in this same commit, so a stale caller's field is STRIPPED by zod
  // rather than accepted and ignored).
  //
  // THE THREE REASONS SURVIVE IN `HangoutFailReason`, and that is deliberate:
  // `actions/dare.ts`'s PEEK still raises all three. Peek is the one real check
  // inside an open hand and stayed a Main Action by ruling (§3), so it — and NOT
  // this file — is now the only Hangout-family die spend in the engine.
  //
  // WHAT REPLACED THE DIE: two daily allowances, both enforced below and both on
  // the save — the SOCIAL POOL for meet/befriend/insult (§4a) and the LIAR'S DICE
  // ROUNDS CAP for the dare open (§4b). Rumor, borrow and repay needed neither:
  // rumor is read-only, and the lending pair is bounded by the single-active-loan
  // slot and by credits.
  //
  // T-1304: the two lending venues report their refusal as a LoanEvent (their
  // reader is the Penny Wise pane, not the Hangout social pane), so `failVenue`
  // still picks the right typed event — it simply has one reason left to pick for.
  const isLending = action.venue === 'borrow' || action.venue === 'repay';
  const failVenue = (failReason: 'venue-not-offered'): GameEvent =>
    isLending
      ? { type: 'LoanEvent', day, kind: 'failed', failReason }
      : { type: 'HangoutEvent', day, venue: action.venue as HangoutVenue, failReason };

  // --- The port must actually run this venue (T-120, HANGOUT_REDESIGN §2.6) ---
  // ONE rule, evaluated the same way at every port — not a per-port branch. A
  // garrison mess with no credit desk omits 'borrow'/'repay'; a card room that will
  // not seat a stranger omits 'meet'. Refused before ANYTHING is mutated, like
  // every other typed refusal, so nothing is charged for an act the house never
  // offered — T-197 · which now means the social pool and the rounds counter,
  // not a die — and routed through `failVenue` so the lending pair still reports
  // a LoanEvent.
  if (!venueOffered(systemId, action.venue)) {
    events.push(failVenue('venue-not-offered'));
    return { state: nextState, events };
  }

  // --- GATE 2 (T-135, LIARS-DICE §9.3): one hand at a time ------------------
  // A `VisitHangout{venue:'dare'}` while a hand is already open is a typed refusal
  // that costs NOTHING — which is why it sits here, with the other pre-resolution
  // refusals, and above §4b's rounds counter a few lines below. T-197: it used to
  // sit above the shared die spend for exactly this reason; the resource it must
  // stay above changed, the ordering argument did not.
  // `day.ts`'s gate 1 already refuses this with an ActionBlocked;
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
  // wandered off is a typed fail, NOT a crash and NOT a charge of any kind
  // (T-197: a refusal spends no social play, exactly as it used to spend no die).
  // T-1304: 'borrow'/'repay' are opponent-less like 'rumor' — Penny Wise is the
  // lender-of-record (the desk), not a co-located NPC, so the §7.5 "quiet word
  // with Penny Wise" bad-day out is reliably available at any Hangout.
  //
  // T-145 · POOL A IS A PARALLEL BRANCH, NOT A REPLACEMENT
  // (`docs/LIARS-DICE-PROGRESSION_SPEC.md` §8 row 10). The `!n.dead &&
  // n.currentSystemId === …` filter below still governs pool B, untouched; the
  // roster branch is keyed on the `ld-` id NAMESPACE and resolves through the
  // engine's own `liarsDiceOpponentFor`, which is keyed on the PORT as well as the
  // id — so a roster opponent authored at Deneb-4 is not seatable at Sol-3.
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

  // --- T-145 · THE BROKE REFUSAL (§7.4): typed fail, NOTHING SPENT -----------
  // A roster opponent whose LIVE purse has fallen to zero will not sit. Placed
  // here, with the other pre-resolution refusals, because a refusal must never
  // charge anything — the invariant every existing refusal in this function keeps,
  // and which T-197 carried over from the dawn die to the two daily caps.
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

  // --- Lending preconditions (T-1304): typed fail, NOTHING SPENT ------------
  // A lending rule that refuses the action (already borrowing / nothing to
  // repay / nothing payable) is a typed LoanEvent fail that spends NOTHING —
  // mirroring every refusal above and the debt-as-ledger law: a loan
  // can only ever ADD an out, never burn a resource on a no-op. T-197 · the
  // lending pair draws from NEITHER cap: the single-active-loan slot and the
  // player's own credits were always its real bounds (§3).
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

  // --- T-197 · THE SOCIAL POOL (§4a), EXACTLY WHERE THE DIE SPEND STOOD ------
  // The symmetry is deliberate and worth stating: this is the same place in the
  // resolution order the shared `spendDie` occupied — after every typed
  // pre-resolution refusal, before the switch that commits. What changed is WHICH
  // resource is charged and WHICH venues it is charged for.
  //
  // THREE VENUES DRAW FROM IT: meet, befriend and insult — the three disposition
  // movers with no other bound (owner ruling 2026-08-04, superseding the
  // per-NPC-per-day draft). Rumor is read-only, the lending pair is
  // ledger-bounded, and the dare open has §4b's rounds cap instead; none of the
  // four reach this block.
  //
  // "SPENT ON RESOLUTION, WHATEVER THE OUTCOME" HOLDS BY CONSTRUCTION, not by
  // care: every one of the three switch arms below runs to completion once
  // entered — there is no further refusal, no early return and no throw past this
  // point — so a FAILED Befriend d20 spends the play exactly as a successful one
  // does. That is §4a's accounting rule, and the reason it is stated here is that
  // adding a fourth early return inside one of those arms would quietly break it.
  //
  // NOT ROUTED THROUGH `failVenue`, for the same reason `dare-hand-open` above is
  // not: that helper also serves the two LENDING venues, whose LoanEvent carries
  // its own reason union, and `social-limit-reached` is not one of them.
  if (isSocialPoolVenue(action.venue)) {
    if (socialPlaysRemaining(nextState) <= 0) {
      events.push({
        type: 'HangoutEvent',
        day,
        venue: action.venue as HangoutVenue,
        opponentId: action.opponentId,
        failReason: 'social-limit-reached',
      });
      return { state: nextState, events };
    }
    nextState.player.socialPlaysRemaining -= 1;
  }

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

      // T-146 · THE ONE SITE THAT READS A LIVE TIER AND FREEZES ITS EFFECTS ONTO A
      // HAND (§8 row 16b, §4.6). There is exactly one other `liarsDiceTier` call in
      // the repo — `format.ts`'s pre-hand `dareWagerBounds`, which has no hand to
      // read a frozen field off. A THIRD IS A BUG.
      //
      // The hand stores the tier's EFFECTS, never the tier: `dicePerSide`,
      // `maxQuantity` and `bandMax` are written once, below, and never recomputed.
      // A save/reload, a content edit, or a settlement that crosses a threshold
      // mid-scene therefore cannot move the rules of a hand already in progress.
      const tier = liarsDiceTier(nextState.player.liarsDiceGamesPlayed);

      // --- T-197 · THE ROUNDS-PER-DAY CAP (docs/DAWN-HAND-REDESIGN.md §4b) -----
      // Owner: "clamp liars dice at X number of rounds, scaling with a player's
      // rank in liars dice (rewarding good play)." It reuses the tier frozen ONE
      // LINE ABOVE rather than inventing a second progression variable or adding
      // a second `liarsDiceTier` read — §4b says so explicitly, and the file
      // header's "a third call site is a bug" ruling is what makes it load-bearing.
      //
      // PLACED BEFORE ANY MUTATION AND BEFORE ANY RNG DRAW. The dice are drawn
      // below and the escrow is debited after them, so a refused open leaves the
      // day's rng stream byte-identical to a day on which the player never tried —
      // which is what keeps a refusal from moving every downstream number in the
      // campaign.
      //
      // COUNTED AT OPEN, NOT AT SETTLEMENT (ruled 2026-08-04). A hand persists
      // across save/reload and can straddle dusk, so a settlement-counted round
      // would let a hand opened before dusk dodge the dawn reset entirely. §4b's
      // "a round is one settled hand" defines the round's UNIT; the open is when
      // the day's allowance is spent. A fold still settles the hand, so an
      // open-and-fold burns the round — the cap cannot be laundered through folds.
      if (nextState.player.dareRoundsToday >= liarsDiceRoundsPerDay(tier)) {
        events.push({
          type: 'HangoutEvent',
          day,
          venue: 'dare',
          opponentId: counterparty.dealerId,
          failReason: 'daily-round-limit',
        });
        return { state: nextState, events };
      }
      nextState.player.dareRoundsToday += 1;

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
      //
      // T-146 · THE BAND IS NOW THE TIER'S EFFECTIVE BAND (§8 row 13b). Tiers 0–3
      // return the port's authored band verbatim, so this is inert until a rung
      // unlocks; tier 4 raises the ceiling ×3; tier 5 removes both ends and leaves
      // the SOLVENCY clamp (the two credit terms below) as the sole ceiling.
      //
      // RULING, RECORDED HERE BECAUSE IT LOOKS LIKE AN INCONSISTENCY: the DEFAULT
      // wager still reads the PORT'S AUTHORED FLOOR (`wagerBandFor(systemId).min`),
      // not `band.min`. At tier 5 `band.min` is 0, and defaulting an omitted wager
      // to 0 would silently open FREE hands for a veteran — the clamp loses its
      // floor (§4.8: "a veteran may sit at Regulus-6 for 10 credits"), the DEFAULT
      // does not. Tiers 0–4 are byte-identical either way.
      const band = effectiveWagerBand(systemId, tier);
      const requested = action.wager ?? wagerBandFor(systemId).min;
      const cap = Math.min(
        band.max ?? Number.MAX_SAFE_INTEGER,
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
      //
      // T-146 · the count is now the LIVE tier's (4 → 5 → 6, hard-capped at six
      // forever). Both loops and `maxQuantity` below follow from this one number.
      const dicePerSide = dicePerSideForTier(tier);
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
      // T-146 · the ante scales with the tier's ceiling (§4.7), so a raise never
      // becomes free relative to a tripled pot. Tier 5 deliberately uses the
      // TIER-4 ceiling — see `anteFor`'s own note for why an unbounded one is
      // undefined.
      const ante = anteFor(systemId, tier);
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
        // backfills them, and nothing observable moves.
        //
        // T-146 CHANGED EXACTLY ONE THING ABOUT THIS BLOCK: where the tier comes
        // from. No new key. The three ladder values are still written THROUGH THE
        // RULES, from the `tier` frozen above — which is what §4.6 means by "the
        // hand stores the tier's effects, never the tier".
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
        // T-146 · "READ THE TABLE", unlocked at tier ≥ 3 (§4.5, §8 row 17b). Pool A
        // reads the RESOLVED archetype — a 'mixed' row has already been collapsed
        // to one concrete arm above, and the honest read is the resolved one. Pool
        // B has no archetype, so its read is derived by rule from the profile's
        // GUILE; without that mapping tier 3 would unlock a feature dead at the
        // pool that supplies most of the player's hands.
        //
        // OPTIONAL on the event, for the same strip-mode reason as `dicePerSide`:
        // `GameEventSchema` drops unknown keys but does NOT tolerate a missing
        // required one, so a required key would make every existing save's
        // DareHandStarted entries fail to parse. Adding an OPTIONAL field to an
        // existing event variant is explicitly not a schema change
        // (`docs/VERSIONING.md` §2) — CURRENT_SAVE_VERSION does not move.
        ...(tier >= 3
          ? {
              opponentRead: rosterOpponent
                ? readTheTableLine('roster', opponentArchetype!)
                : readTheTableLine('roaming', npcGuile(dealer!)),
            }
          : {}),
      });
      break;
    }

    case 'befriend': {
      // A GUILE charm check against the PORT's table DC — charm can fall flat, and
      // a house that is hard to charm says so with a number, not a rule. No
      // actionContext: a context-less player GUILE check classifies to the wire's
      // 'talk' bucket (wire.ts classifyCheck), not the gamble bucket.
      //
      // T-197 · THE ROLL IS AN INTERNAL d20 NOW (§5's blocker, RESOLVED by owner
      // ruling 2026-08-04 as option 1). Befriend is a Free Action, so there is no
      // spent die to BE the roll — it draws its own d20 from the action's rng
      // instead. The `check()` call, the `StatCheck` event and every port's
      // authored `befriend.dc` stay live and unchanged; what the ruling gave up,
      // knowingly, is the player's ability to AIM a chosen die at this check.
      // The two shapes not chosen are logged in §5: keep Befriend a Main Action,
      // or drop the check entirely.
      //
      // THE PLAY IS ALREADY SPENT by the time this line runs, and a failure does
      // not refund it (§4a's accounting) — which is exactly why the pool, and not
      // the outcome, is what bounds the grind.
      const dealerNpc = dealer!;
      const befriendParams = venueParamsFor(systemId, 'befriend');
      const result = check(rng.d20(), playerGuile, befriendParams.dc);
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
