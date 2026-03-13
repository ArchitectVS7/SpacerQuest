/**
 * SpacerQuest v4.0 - Shipyard Screen (SP.SPEED.S / SP.DAMAGE.S)
 *
 * Ship upgrades, repairs, and component management
 */
import { prisma } from '../../db/prisma.js';
import { formatCredits } from '../utils.js';
import { COMPONENT_PRICES } from '../constants.js';
export const ShipyardScreen = {
    name: 'shipyard',
    render: async (characterId) => {
        const character = await prisma.character.findUnique({
            where: { id: characterId },
            include: { ship: true }
        });
        if (!character || !character.ship) {
            return { output: '\x1b[31mError: No ship found.\x1b[0m\r\n' };
        }
        const credits = formatCredits(character.creditsHigh, character.creditsLow);
        const ship = character.ship;
        const output = `
\x1b[36;1m_________________________________________\x1b[0m
\x1b[33;1m      GALACTIC SHIPYARD                   \x1b[0m
\x1b[36;1m_________________________________________\x1b[0m

\x1b[32mShip:\x1b[0m ${character.shipName}
\x1b[32mCredits:\x1b[0m ${credits} cr

\x1b[37;1m=========================================\x1b[0m
\x1b[33;1m         COMPONENT STATUS                \x1b[0m
\x1b[37;1m=========================================\x1b[0m

  Component       STR    COND    Price
  ─────────────────────────────────────
  Hull            ${String(ship.hullStrength).padStart(3)}    ${ship.hullCondition}/9    ${COMPONENT_PRICES.HULL}
  Drives          ${String(ship.driveStrength).padStart(3)}    ${ship.driveCondition}/9    ${COMPONENT_PRICES.DRIVES}
  Cabin           ${String(ship.cabinStrength).padStart(3)}    ${ship.cabinCondition}/9    ${COMPONENT_PRICES.CABIN}
  Life Support    ${String(ship.lifeSupportStrength).padStart(3)}    ${ship.lifeSupportCondition}/9    ${COMPONENT_PRICES.LIFE_SUPPORT}
  Weapons         ${String(ship.weaponStrength).padStart(3)}    ${ship.weaponCondition}/9    ${COMPONENT_PRICES.WEAPONS}
  Navigation      ${String(ship.navigationStrength).padStart(3)}    ${ship.navigationCondition}/9    ${COMPONENT_PRICES.NAVIGATION}
  Robotics        ${String(ship.roboticsStrength).padStart(3)}    ${ship.roboticsCondition}/9    ${COMPONENT_PRICES.ROBOTICS}
  Shields         ${String(ship.shieldStrength).padStart(3)}    ${ship.shieldCondition}/9    ${COMPONENT_PRICES.SHIELDS}

\x1b[37;1m=========================================\x1b[0m
\x1b[33;1m           SHIPYARD MENU                 \x1b[0m
\x1b[37;1m=========================================\x1b[0m

  [U]pgrade component (+10 STR or +1 COND)
  [R]epair all damage
  [S]pecial equipment
  [M]ain Menu

\x1b[32m:\x1b[0m${character.currentSystem} Shipyard:\x1b[32m:(?=Menu): Command:\x1b[0m
> `;
        return { output };
    },
    handleInput: async (characterId, input) => {
        const key = input.trim().toUpperCase();
        switch (key) {
            case 'M':
                return { output: '\x1b[2J\x1b[H', nextScreen: 'main-menu' };
            case 'U':
                return {
                    output: '\r\n\x1b[33mUse /api/ship/upgrade endpoint with component and type\x1b[0m\r\n> '
                };
            case 'R':
                return {
                    output: '\r\n\x1b[33mUse /api/ship/repair endpoint\x1b[0m\r\n> '
                };
            case 'S':
                return {
                    output: '\r\n\x1b[33mSpecial equipment: Cloaker, Auto-Repair, STAR-BUSTER++\x1b[0m\r\n> '
                };
            default:
                return {
                    output: '\r\n\x1b[31mInvalid command. Press U, R, S, or M.\x1b[0m\r\n> '
                };
        }
    }
};
//# sourceMappingURL=shipyard.js.map