import { Stat } from '@spacerquest/content';
import { GameState, GameEvent, PlayerAction } from '../types.js';
import { SeededRng } from '../rng.js';
import { check, spendDie } from '../dice.js';
import { cloneState } from '../clone.js';

export function resolveTrade(
  state: GameState,
  action: Extract<PlayerAction, { type: 'Trade' }>,
  _rng: SeededRng,
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const nextState = cloneState(state);

  if (action.action === 'buy-fuel') {
    if (!action.fuelAmount) {
      throw new Error('Must specify fuelAmount to buy');
    }
    // Every meaningful action consumes a die (PRD §7) — fueling included.
    if (action.spendDie === undefined) {
      throw new Error('Must spend a die to buy fuel');
    }
    const { hand } = spendDie(nextState.player.dawnHand!, action.spendDie);
    nextState.player.dawnHand = hand;

    const cost = action.fuelAmount * nextState.market.localFuelPrice;

    if (nextState.player.credits >= cost) {
      nextState.player.credits -= cost;
      nextState.player.ship.fuel += action.fuelAmount;
      if (nextState.player.ship.fuel > nextState.player.ship.maxFuel) {
        nextState.player.ship.fuel = nextState.player.ship.maxFuel;
      }
      events.push({
        type: 'TradeEvent',
        characterId: 'player',
        action: 'buy-fuel',
        success: true,
        fuelAmount: action.fuelAmount,
        cost,
        actionDetails: `Bought ${action.fuelAmount} fuel for ${cost} credits.`,
      });
    } else {
      events.push({
        type: 'TradeEvent',
        characterId: 'player',
        action: 'buy-fuel',
        success: false,
        fuelAmount: action.fuelAmount,
        cost,
        actionDetails: `Failed to buy fuel: Not enough credits.`,
      });
    }
  } else if (action.action === 'sign-contract') {
    if (action.contractIndex === undefined) {
      throw new Error('Must specify contractIndex to sign');
    }
    if (action.spendDie === undefined) {
      throw new Error('Must spend a die to sign a contract');
    }

    const contract = nextState.market.manifestBoard[action.contractIndex];
    if (!contract) {
      throw new Error('No such contract on the manifest board');
    }

    if (nextState.player.activeContract) {
      events.push({
        type: 'TradeEvent',
        characterId: 'player',
        action: 'sign-contract',
        success: false,
        actionDetails: 'Cannot sign: already carrying an active contract.',
      });
    } else {
      const { hand } = spendDie(nextState.player.dawnHand!, action.spendDie);
      nextState.player.dawnHand = hand;

      nextState.player.activeContract = contract;
      // Signing takes the contract off the board — it's yours now.
      nextState.market.manifestBoard.splice(action.contractIndex, 1);
      events.push({
        type: 'TradeEvent',
        characterId: 'player',
        action: 'sign-contract',
        success: true,
        destination: contract.destination,
        cargoType: contract.cargoType,
        payment: contract.payment,
        actionDetails: `Signed contract to deliver cargo to ${contract.destination} for ${contract.payment} credits.`,
      });
    }
  } else if (action.action === 'abandon-contract') {
    // T-1604b · The player-initiated hold release (UGT finding F2,
    // docs/playtests/T-1604a-ugt-campaign.md §7). The audited trap had TWO locks:
    // no income verb (fixed by the dusk subsistence floor in day.ts) and a hold
    // that could not be re-let, because `sign-contract` refuses while
    // `player.activeContract` is set and nothing but delivery, a storylet, a
    // patrol seizure or succession ever cleared it. This is the missing verb.
    //
    // COST MODEL: one die plus the forfeited payment — and deliberately NO credit
    // fee. Charging to dump cargo would re-strand exactly the destitute captain
    // this verb exists to free, re-opening F2 from the other side. The contract
    // does NOT return to `market.manifestBoard`: the crates are vented at the
    // gantry, not un-signed, so the board stays the day's honest offer set.
    if (action.spendDie === undefined) {
      throw new Error('Must spend a die to abandon a contract');
    }

    if (!nextState.player.activeContract) {
      // Typed refusal, no die spent — the same shape as the `sign-contract`
      // refusal above, and surfaced to the player by the UI store's
      // `failNoticeFrom` scan rather than being a silent no-op.
      events.push({
        type: 'TradeEvent',
        characterId: 'player',
        action: 'abandon-contract',
        success: false,
        actionDetails: 'Nothing in the hold to abandon.',
      });
    } else {
      const { hand } = spendDie(nextState.player.dawnHand!, action.spendDie);
      nextState.player.dawnHand = hand;

      const dumped = nextState.player.activeContract;
      nextState.player.activeContract = null;
      events.push({
        type: 'TradeEvent',
        characterId: 'player',
        action: 'abandon-contract',
        success: true,
        destination: dumped.destination,
        cargoType: dumped.cargoType,
        payment: dumped.payment,
        actionDetails: `Abandoned the run to ${dumped.destination}; ${dumped.payment} credits forfeited and the hold is clear.`,
      });
      events.push({
        type: 'WireEntry',
        day: nextState.day,
        kind: 'plain',
        message: `The crates go over the gantry rail one by one and the slip gets torn up in front of the clerk. No cargo, no payday, no argument — but the hold is empty and the ship can take work again.`,
      });
    }
  } else if (action.action === 'haggle') {
    if (action.spendDie === undefined || action.contractIndex === undefined) {
      throw new Error('Must specify spendDie and contractIndex to haggle');
    }

    const contract = nextState.market.manifestBoard[action.contractIndex];
    if (!contract) {
      throw new Error('No such contract on the manifest board');
    }

    if (contract.haggled) {
      events.push({
        type: 'TradeEvent',
        characterId: 'player',
        action: 'haggle',
        success: false,
        actionDetails: 'The broker will not renegotiate this contract again.',
      });
    } else {
      const { die, hand } = spendDie(nextState.player.dawnHand!, action.spendDie);
      nextState.player.dawnHand = hand;

      const haggleDc = 12;
      const result = check(die, nextState.player.stats[Stat.TRADE], haggleDc);
      contract.haggled = true;
      events.push({
        type: 'StatCheck',
        actor: 'Player',
        stat: Stat.TRADE,
        dc: haggleDc,
        result,
        actionContext: 'haggle',
      });

      if (result.success) {
        // T-1202 (PRD §6 "the margin decides how well it goes"): the haggle bonus
        // now SCALES with the check margin instead of a flat +50%. FOUNDATION
        // DIVERGENCE — foundation (f2f95fa9) had no margin-scaled haggle; its
        // successful haggle was a fixed 1.5x. `perMarginCredit >= 1` guarantees a
        // STRICTLY higher payout for a higher margin even after flooring, at any
        // contract size (acceptance: same-seed A/B, higher margin → higher bonus).
        const base = contract.payment;
        const perMarginCredit = Math.max(1, Math.round(base * 0.05));
        const bonus = Math.floor(base * 0.5) + Math.max(0, result.margin) * perMarginCredit;
        contract.payment = base + bonus;
        events.push({
          type: 'TradeEvent',
          characterId: 'player',
          action: 'haggle',
          success: true,
          payment: contract.payment,
          actionDetails: `Haggle successful! Contract payment increased to ${contract.payment} credits.`,
        });
      } else {
        events.push({
          type: 'TradeEvent',
          characterId: 'player',
          action: 'haggle',
          success: false,
          actionDetails: `Haggle failed.`,
        });
      }
    }
  } else if (action.action === 'pay-debt') {
    if (!action.amount || action.amount <= 0) {
      throw new Error('Must specify a positive amount to pay toward debt');
    }
    // A ledger transfer, not a job — costs credits, not a die
    // (PRD §7.3: remote payments need no roll).
    const payment = Math.min(action.amount, nextState.player.credits, nextState.player.debt);
    if (payment > 0) {
      nextState.player.credits -= payment;
      nextState.player.debt -= payment;
      events.push({
        type: 'DebtPayment',
        characterId: 'player',
        amount: payment,
        remaining: nextState.player.debt,
      });
    } else {
      events.push({
        type: 'TradeEvent',
        characterId: 'player',
        action: 'pay-debt-failed',
        success: false,
        amount: action.amount,
        actionDetails: 'Debt payment failed: no credits to send.',
      });
    }
  }

  return { state: nextState, events };
}
