/**
 * SpacerQuest v4.0 - Save/End System (SP.END.S)
 */

import { prisma } from '../../db/prisma.js';

export async function saveAndLogout(userId: string, token: string | undefined) {
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

export async function emergencyLogoutAll(userId: string) {
  await prisma.session.deleteMany({ where: { userId } });
  return { success: true };
}
