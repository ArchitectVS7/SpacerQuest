/**
 * SpacerQuest v4.0 - Repairs System (SP.DAMAGE.S)
 */
import { prisma } from '../../db/prisma.js';
import { getTotalCredits, subtractCredits } from '../utils.js';
export async function repairAllComponents(characterId) {
    const character = await prisma.character.findUnique({
        where: { id: characterId },
        include: { ship: true },
    });
    if (!character || !character.ship) {
        return { success: false, error: 'Character or ship not found' };
    }
    const ship = character.ship;
    let totalCost = 0;
    const components = ['hull', 'drive', 'cabin', 'lifeSupport', 'weapon', 'navigation', 'robotics', 'shield'];
    for (const comp of components) {
        const strength = ship[`${comp}Strength`];
        const condition = ship[`${comp}Condition`];
        const damage = 9 - condition;
        totalCost += damage * strength;
    }
    const totalCredits = getTotalCredits(character.creditsHigh, character.creditsLow);
    if (totalCredits < totalCost) {
        return { success: false, error: `Not enough credits. Repair cost: ${totalCost} cr` };
    }
    const updateData = {};
    for (const comp of components) {
        updateData[`${comp}Condition`] = 9;
    }
    const { high, low } = subtractCredits(character.creditsHigh, character.creditsLow, totalCost);
    await prisma.$transaction([
        prisma.ship.update({
            where: { id: ship.id },
            data: updateData,
        }),
        prisma.character.update({
            where: { id: characterId },
            data: { creditsHigh: high, creditsLow: low },
        })
    ]);
    return { success: true, cost: totalCost, message: 'All components repaired to full condition!' };
}
//# sourceMappingURL=repairs.js.map