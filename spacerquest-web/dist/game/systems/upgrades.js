/**
 * SpacerQuest v4.0 - Upgrades System (SP.SPEED.S)
 */
import { prisma } from '../../db/prisma.js';
import { COMPONENT_PRICES } from '../constants.js';
import { getTotalCredits, subtractCredits } from '../utils.js';
export async function upgradeShipComponent(characterId, component, upgradeType) {
    const character = await prisma.character.findUnique({
        where: { id: characterId },
        include: { ship: true },
    });
    if (!character || !character.ship) {
        return { success: false, error: 'Character or ship not found' };
    }
    // Map component to price
    const priceMap = {
        'HULL': COMPONENT_PRICES.HULL,
        'DRIVES': COMPONENT_PRICES.DRIVES,
        'CABIN': COMPONENT_PRICES.CABIN,
        'LIFE_SUPPORT': COMPONENT_PRICES.LIFE_SUPPORT,
        'WEAPONS': COMPONENT_PRICES.WEAPONS,
        'NAVIGATION': COMPONENT_PRICES.NAVIGATION,
        'ROBOTICS': COMPONENT_PRICES.ROBOTICS,
        'SHIELDS': COMPONENT_PRICES.SHIELDS,
    };
    const price = priceMap[component.toUpperCase()];
    if (!price) {
        return { success: false, error: 'Invalid component' };
    }
    const totalCredits = getTotalCredits(character.creditsHigh, character.creditsLow);
    if (totalCredits < price) {
        return { success: false, error: 'Not enough credits' };
    }
    const componentMap = {
        'HULL': 'hull',
        'DRIVES': 'drive',
        'CABIN': 'cabin',
        'LIFE_SUPPORT': 'lifeSupport',
        'WEAPONS': 'weapon',
        'NAVIGATION': 'navigation',
        'ROBOTICS': 'robotics',
        'SHIELDS': 'shield',
    };
    const field = componentMap[component.toUpperCase()];
    const strengthField = `${field}Strength`;
    const conditionField = `${field}Condition`;
    const updateData = {};
    if (upgradeType === 'STRENGTH') {
        updateData[strengthField] = Number(character.ship[strengthField]) + 10;
    }
    else {
        updateData[conditionField] = Math.min(9, Number(character.ship[conditionField]) + 1);
    }
    const { high, low } = subtractCredits(character.creditsHigh, character.creditsLow, price);
    await prisma.$transaction([
        prisma.ship.update({
            where: { id: character.ship.id },
            data: updateData,
        }),
        prisma.character.update({
            where: { id: characterId },
            data: { creditsHigh: high, creditsLow: low },
        })
    ]);
    return { success: true, cost: price, newStrength: updateData[strengthField], newCondition: updateData[conditionField] };
}
//# sourceMappingURL=upgrades.js.map