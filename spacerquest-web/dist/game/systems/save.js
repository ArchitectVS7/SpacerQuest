/**
 * SpacerQuest v4.0 - Save/End System (SP.END.S)
 */
import { prisma } from '../../db/prisma.js';
export async function saveAndLogout(userId, token) {
    if (token) {
        await prisma.session.deleteMany({
            where: { userId, token },
        });
    }
    await prisma.session.deleteMany({
        where: { userId, expiresAt: { lt: new Date() } },
    });
    return { success: true };
}
export async function emergencyLogoutAll(userId) {
    await prisma.session.deleteMany({ where: { userId } });
    return { success: true };
}
//# sourceMappingURL=save.js.map