/**
 * SpacerQuest v4.0 - Screen Router
 */
import { MainMenuScreen } from '../game/screens/main-menu.js';
import { BankScreen } from '../game/screens/bank.js';
import { ShipyardScreen } from '../game/screens/shipyard.js';
import { PubScreen } from '../game/screens/pub.js';
import { TradersScreen } from '../game/screens/traders.js';
export const screens = {
    'main-menu': MainMenuScreen,
    'bank': BankScreen,
    'shipyard': ShipyardScreen,
    'pub': PubScreen,
    'traders': TradersScreen,
};
export async function handleScreenRequest(characterId, screenName) {
    const screen = screens[screenName] || screens['main-menu'];
    return await screen.render(characterId);
}
export async function handleScreenInput(characterId, screenName, input) {
    const screen = screens[screenName] || screens['main-menu'];
    return await screen.handleInput(characterId, input);
}
//# sourceMappingURL=screen-router.js.map