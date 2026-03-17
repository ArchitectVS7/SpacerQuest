/**
 * SpacerQuest v4.0 - Screen Router
 */

import { MainMenuScreen } from '../game/screens/main-menu.js';
import { BankScreen } from '../game/screens/bank.js';
import { ShipyardScreen } from '../game/screens/shipyard.js';
import { ShipyardUpgradeScreen } from '../game/screens/shipyard-upgrade.js';
import { PubScreen } from '../game/screens/pub.js';
import { TradersScreen } from '../game/screens/traders.js';
import { TradersBuyFuelScreen } from '../game/screens/traders-buy-fuel.js';
import { TradersSellFuelScreen } from '../game/screens/traders-sell-fuel.js';
import { TradersCargoScreen } from '../game/screens/traders-cargo.js';
import { NavigateScreen } from '../game/screens/navigate.js';
import { BankDepositScreen } from '../game/screens/bank-deposit.js';
import { BankWithdrawScreen } from '../game/screens/bank-withdraw.js';
import { BankTransferScreen } from '../game/screens/bank-transfer.js';
import { RescueScreen } from '../game/screens/rescue.js';
import { RegistryScreen } from '../game/screens/registry.js';
import { ArenaScreen } from '../game/screens/arena.js';
import { CombatScreen } from '../game/screens/combat.js';
import { SpacersHangoutScreen } from '../game/screens/spacers-hangout.js';
import { WiseOneScreen } from '../game/screens/wise-one.js';
import { SageScreen } from '../game/screens/sage.js';
import { JailScreen } from '../game/screens/jail.js';
import { BulletinBoardScreen } from '../game/screens/bulletin-board.js';
import { AllianceInvestScreen } from '../game/screens/alliance-invest.js';

export const screens: Record<string, any> = {
  'main-menu': MainMenuScreen,
  'bank': BankScreen,
  'shipyard': ShipyardScreen,
  'shipyard-upgrade': ShipyardUpgradeScreen,
  'pub': PubScreen,
  'traders': TradersScreen,
  'traders-buy-fuel': TradersBuyFuelScreen,
  'traders-sell-fuel': TradersSellFuelScreen,
  'traders-cargo': TradersCargoScreen,
  'navigate': NavigateScreen,
  'bank-deposit': BankDepositScreen,
  'bank-withdraw': BankWithdrawScreen,
  'bank-transfer': BankTransferScreen,
  'rescue': RescueScreen,
  'registry': RegistryScreen,
  'arena': ArenaScreen,
  'combat': CombatScreen,
  'spacers-hangout': SpacersHangoutScreen,
  'wise-one': WiseOneScreen,
  'sage': SageScreen,
  'jail': JailScreen,
  'bulletin-board': BulletinBoardScreen,
  'alliance-invest': AllianceInvestScreen,
};

export async function handleScreenRequest(characterId: string, screenName: string) {
  const screen = screens[screenName] || screens['main-menu'];
  return await screen.render(characterId);
}

export async function handleScreenInput(characterId: string, screenName: string, input: string) {
  const screen = screens[screenName] || screens['main-menu'];
  return await screen.handleInput(characterId, input);
}
