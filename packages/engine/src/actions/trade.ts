import { Stat } from '@spacerquest/content';
import { GameState, GameEvent, PlayerAction } from '../types.js';
import { SeededRng } from '../rng.js';
import { check, spendDie } from '../dice.js';

export function resolveTrade(
  state: GameState,
  action: Extract<PlayerAction, { type: 'Trade' }>,
  _rng: SeededRng,
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const nextState = JSON.parse(JSON.stringify(state)) as GameState;

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
        contract.payment = Math.floor(contract.payment * 1.5); // 50% bump
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
