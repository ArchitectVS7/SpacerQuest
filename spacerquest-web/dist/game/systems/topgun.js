/**
 * SpacerQuest v4.0 - Top Gun Rankings System (SP.TOP.S)
 */
import { prisma } from '../../db/prisma.js';
export async function getTopGunRankings() {
    const [topDrives, topWeapons, topShields, topHull, topCabin, topLifeSupport, topNavigation, topRobotics, topCargo, topRescues, topBattles, topPromotions,] = await Promise.all([
        prisma.character.findFirst({
            where: { ship: { driveStrength: { gt: 0 } } },
            include: { ship: true },
            orderBy: { ship: { driveStrength: 'desc' } },
        }),
        prisma.character.findFirst({
            where: { ship: { weaponStrength: { gt: 0 } } },
            include: { ship: true },
            orderBy: { ship: { weaponStrength: 'desc' } },
        }),
        prisma.character.findFirst({
            where: { ship: { shieldStrength: { gt: 0 } } },
            include: { ship: true },
            orderBy: { ship: { shieldStrength: 'desc' } },
        }),
        prisma.character.findFirst({
            where: { ship: { hullStrength: { gt: 0 } } },
            include: { ship: true },
            orderBy: { ship: { hullStrength: 'desc' } },
        }),
        prisma.character.findFirst({
            where: { ship: { cabinStrength: { gt: 0 } } },
            include: { ship: true },
            orderBy: { ship: { cabinStrength: 'desc' } },
        }),
        prisma.character.findFirst({
            where: { ship: { lifeSupportStrength: { gt: 0 } } },
            include: { ship: true },
            orderBy: { ship: { lifeSupportStrength: 'desc' } },
        }),
        prisma.character.findFirst({
            where: { ship: { navigationStrength: { gt: 0 } } },
            include: { ship: true },
            orderBy: { ship: { navigationStrength: 'desc' } },
        }),
        prisma.character.findFirst({
            where: { ship: { roboticsStrength: { gt: 0 } } },
            include: { ship: true },
            orderBy: { ship: { roboticsStrength: 'desc' } },
        }),
        prisma.character.findFirst({
            where: { ship: { cargoPods: { gt: 0 } } },
            include: { ship: true },
            orderBy: { ship: { cargoPods: 'desc' } },
        }),
        prisma.character.findFirst({
            where: { rescuesPerformed: { gt: 0 } },
            orderBy: { rescuesPerformed: 'desc' },
        }),
        prisma.character.findFirst({
            where: { battlesWon: { gt: 0 } },
            orderBy: { battlesWon: 'desc' },
        }),
        prisma.character.findFirst({
            where: { promotions: { gt: 0 } },
            orderBy: { promotions: 'desc' },
        }),
    ]);
    return {
        categories: [
            { name: 'Fastest Drives', leader: topDrives?.shipName || 'N/A', value: topDrives?.ship?.driveStrength || 0 },
            { name: 'Strongest Weapons', leader: topWeapons?.shipName || 'N/A', value: topWeapons?.ship?.weaponStrength || 0 },
            { name: 'Strongest Shields', leader: topShields?.shipName || 'N/A', value: topShields?.ship?.shieldStrength || 0 },
            { name: 'Strongest Hull', leader: topHull?.shipName || 'N/A', value: topHull?.ship?.hullStrength || 0 },
            { name: 'Fanciest Cabin', leader: topCabin?.shipName || 'N/A', value: topCabin?.ship?.cabinStrength || 0 },
            { name: 'Best Life Support', leader: topLifeSupport?.shipName || 'N/A', value: topLifeSupport?.ship?.lifeSupportStrength || 0 },
            { name: 'Best Navigation', leader: topNavigation?.shipName || 'N/A', value: topNavigation?.ship?.navigationStrength || 0 },
            { name: 'Best Robotics', leader: topRobotics?.shipName || 'N/A', value: topRobotics?.ship?.roboticsStrength || 0 },
            { name: 'Most Cargo', leader: topCargo?.shipName || 'N/A', value: topCargo?.ship?.cargoPods || 0 },
            { name: 'Top Rescuer', leader: topRescues?.name || 'N/A', value: topRescues?.rescuesPerformed || 0 },
            { name: 'Battle Champion', leader: topBattles?.name || 'N/A', value: topBattles?.battlesWon || 0 },
            { name: 'Most Promotions', leader: topPromotions?.name || 'N/A', value: topPromotions?.promotions || 0 },
        ],
    };
}
//# sourceMappingURL=topgun.js.map