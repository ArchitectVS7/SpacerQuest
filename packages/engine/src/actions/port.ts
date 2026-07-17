import {
  PORT_PURCHASE_ALLIANCE_DELTA,
  PURCHASABLE_PORTS_BY_SYSTEM,
  STAR_SYSTEMS,
  isPurchasablePort,
} from '@spacerquest/content';
import { GameEvent, GameState, PlayerAction, PortEventFailReason } from '../types.js';
import { eraPortIncomeMultiplier } from '../era.js';
import { spendDie } from '../dice.js';
import { applyReputation } from '../reputation.js';

/**
 * T-1307 · Ports as purchasable property (PRD §9). The purchase resolver, the
 * dusk-income reader, and the pure buy-preview. All three are PURE (clone → mutate
 * the clone → typed events; no rng, no Date, no DOM) and the resolver NEVER throws:
 * every player-possible input — malformed die selection, wrong system, an
 * unaffordable buy — resolves to a typed `PortEvent{failed}` that spends nothing,
 * mirroring resolveCrew / resolveVisitHangout. The port gate + encounter handling
 * live in day.ts (the only runtime caller).
 */

/**
 * Buy a controlling stake in the local port authority. PURE, no rng. Die
 * validation is the same three-way split as resolveCrew (no die / out-of-range /
 * already-spent → typed fail, NO die spent). Then the port rules, in order: the
 * `systemId` must be the player's current system (you buy the port you stand in),
 * it must be a purchasable core port, it must not already be owned, and the price
 * must be affordable. On COMMIT: spend the die, subtract the price, push the
 * `PortStake`, emit `PortEvent{purchased}` AND a `WireEntry` — the WireEntry is
 * the wire reader for the purchase.
 */
export function resolvePortPurchase(
  state: GameState,
  action: Extract<PlayerAction, { type: 'Port' }>,
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const nextState = JSON.parse(JSON.stringify(state)) as GameState;
  const day = nextState.day;

  const fail = (failReason: PortEventFailReason, systemId?: number) => {
    events.push({ type: 'PortEvent', day, kind: 'failed', failReason, systemId });
    return { state: nextState, events };
  };

  // --- Die validation (malformed input → typed fail, NO die spent) ----------
  const hand = nextState.player.dawnHand;
  const index = action.spendDie;
  if (index === undefined) return fail('no-die');
  if (!hand || index < 0 || index >= hand.dice.length) return fail('invalid-die-index');
  if (hand.spent[index]) return fail('die-already-spent');

  const systemId = action.systemId;
  // You buy the port you are standing in.
  if (systemId !== nextState.player.currentSystemId) return fail('not-at-port', systemId);
  // Only the 14 core ports are purchasable (the rim is ungoverned).
  if (!isPurchasablePort(systemId)) return fail('not-purchasable', systemId);
  // No double-buying a stake already owned.
  if (nextState.player.ports.some((port) => port.systemId === systemId)) {
    return fail('already-owned', systemId);
  }
  const def = PURCHASABLE_PORTS_BY_SYSTEM[systemId];
  if (nextState.player.credits < def.purchasePrice) return fail('insufficient-credits', systemId);

  // Commit: spend the die, pay the price, claim the stake.
  const { die } = spendDie(hand, index);
  void die;
  hand.spent[index] = true;
  nextState.player.credits -= def.purchasePrice;
  nextState.player.ports.push({ systemId, purchaseDay: day });

  // T-1503 · A port deal warms the port's aligned faction (the content `alliance`
  // tag — the ports.ts deferral, now consumed). This is the "port deals via T-1307"
  // organic rep mover; the Warlord-Confederation ports feed Confederation standing
  // exactly this way. No rng — behind the existing commit guard.
  applyReputation(nextState, def.alliance, PORT_PURCHASE_ALLIANCE_DELTA, 'port-deal', events);

  events.push({
    type: 'PortEvent',
    day,
    kind: 'purchased',
    systemId,
    cost: def.purchasePrice,
    portCount: nextState.player.ports.length,
  });
  const systemLabel = STAR_SYSTEMS[systemId]?.name ?? `system ${systemId}`;
  events.push({
    type: 'WireEntry',
    day,
    kind: 'plain',
    message: `A spacer buys a controlling stake in the ${systemLabel} port authority.`,
  });
  return { state: nextState, events };
}

/**
 * T-1307 · The dusk-economy reader (PRD §9). Sum, across every owned stake, the
 * port's content `baseDuskIncome` scaled by the live era multiplier for that
 * port's system (rounded per port). PURE — a function of the ports + content
 * tuning + the active era event only (no rng). day.ts endDay calls this once per
 * dusk (guarded on a non-empty roster) and the A/B era test exercises it directly.
 * Returns 0 for an empty roster, so a port-free run adds nothing.
 */
export function portDuskIncome(state: GameState): number {
  let income = 0;
  for (const port of state.player.ports) {
    const def = PURCHASABLE_PORTS_BY_SYSTEM[port.systemId];
    if (!def) continue;
    income += Math.round(
      def.baseDuskIncome * eraPortIncomeMultiplier(state.eraEvent, port.systemId),
    );
  }
  return income;
}

/** The pure buy-preview return (T-1405's buy-preview / ledger pane). */
export interface PortQuote {
  /** Whether a `Port` buy of `systemId` would commit right now. */
  ok: boolean;
  /** The purchase price (0 when `systemId` is not a purchasable port). */
  cost: number;
  /** The refusal reason, or null when `ok`. */
  failure: PortEventFailReason | null;
  /** Whether the stake is already owned (the common non-error disabled case). */
  alreadyOwned: boolean;
  /** The per-dusk income this port would accrue right now (era-modulated). 0 when
   *  not a purchasable port. */
  income: number;
}

/**
 * PURE preview of a port purchase — the engine function T-1405's buy-preview /
 * ledger pane reads for its price/income numbers and its "disabled, here's why"
 * reason. It spends no die and MUST NOT mutate the input. Every rule (at-port,
 * purchasable, already-owned, affordability) is the same order `resolvePortPurchase`
 * runs, so the preview can never disagree with the real purchase. Die validation
 * is NOT previewed here (the pane owns die selection); this mirrors `quoteShipyard`.
 */
export function quotePort(state: GameState, systemId: number): PortQuote {
  const def = PURCHASABLE_PORTS_BY_SYSTEM[systemId];
  const alreadyOwned = state.player.ports.some((port) => port.systemId === systemId);
  const income = def
    ? Math.round(def.baseDuskIncome * eraPortIncomeMultiplier(state.eraEvent, systemId))
    : 0;
  const cost = def?.purchasePrice ?? 0;

  let failure: PortEventFailReason | null = null;
  if (systemId !== state.player.currentSystemId) failure = 'not-at-port';
  else if (!isPurchasablePort(systemId)) failure = 'not-purchasable';
  else if (alreadyOwned) failure = 'already-owned';
  else if (state.player.credits < cost) failure = 'insufficient-credits';

  return { ok: failure === null, cost, failure, alreadyOwned, income };
}
