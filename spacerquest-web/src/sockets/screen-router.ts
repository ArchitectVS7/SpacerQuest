/**
 * SpacerQuest v4.0 - Screen Router
 */

import { MainMenuScreen } from '../game/screens/main-menu.js';
import { BankScreen } from '../game/screens/bank.js';
import { ShipyardScreen } from '../game/screens/shipyard.js';
import { PubScreen } from '../game/screens/pub.js';
import { TradersScreen } from '../game/screens/traders.js';

export const screens: Record<string, any> = {
  'main-menu': MainMenuScreen,
  'bank': BankScreen,
  'shipyard': ShipyardScreen,
  'pub': PubScreen,
  'traders': TradersScreen,
};

export async function handleScreenRequest(characterId: string, screenName: string) {
  const screen = screens[screenName] || screens['main-menu'];
  return await screen.render(characterId);
}

export async function handleScreenInput(characterId: string, screenName: string, input: string) {
  const screen = screens[screenName] || screens['main-menu'];
  return await screen.handleInput(characterId, input);
}
