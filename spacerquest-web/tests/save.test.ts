/**
 * SpacerQuest v4.0 - Save/Logout System Tests
 *
 * Tests for saveAndLogout, emergencyLogoutAll
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/db/prisma', () => ({
  prisma: {
    session: {
      deleteMany: vi.fn(),
    },
  },
}));

describe('Save/Logout system', () => {
  let prisma: any;
  let saveAndLogout: any;
  let emergencyLogoutAll: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const prismaMod = await import('../src/db/prisma');
    prisma = prismaMod.prisma;
    const saveMod = await import('../src/game/systems/save');
    saveAndLogout = saveMod.saveAndLogout;
    emergencyLogoutAll = saveMod.emergencyLogoutAll;
  });

  describe('saveAndLogout', () => {
    it('deletes session by token when token provided', async () => {
      prisma.session.deleteMany.mockResolvedValue({ count: 1 });
      const result = await saveAndLogout('user-1', 'token-abc');

      expect(result.success).toBe(true);
      // First call: delete by token, Second call: cleanup expired
      expect(prisma.session.deleteMany).toHaveBeenCalledTimes(2);
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', token: 'token-abc' },
      });
    });

    it('cleans up expired sessions', async () => {
      prisma.session.deleteMany.mockResolvedValue({ count: 0 });
      await saveAndLogout('user-1', 'token-abc');

      const secondCall = prisma.session.deleteMany.mock.calls[1][0];
      expect(secondCall.where.userId).toBe('user-1');
      expect(secondCall.where.expiresAt).toBeDefined();
      expect(secondCall.where.expiresAt.lt).toBeInstanceOf(Date);
    });

    it('only cleans expired sessions when no token', async () => {
      prisma.session.deleteMany.mockResolvedValue({ count: 0 });
      const result = await saveAndLogout('user-1', undefined);

      expect(result.success).toBe(true);
      // Only the expired cleanup call, not the token delete
      expect(prisma.session.deleteMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('emergencyLogoutAll', () => {
    it('deletes all sessions for the user', async () => {
      prisma.session.deleteMany.mockResolvedValue({ count: 3 });
      const result = await emergencyLogoutAll('user-1');

      expect(result.success).toBe(true);
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });

    it('succeeds even when no sessions exist', async () => {
      prisma.session.deleteMany.mockResolvedValue({ count: 0 });
      const result = await emergencyLogoutAll('user-1');
      expect(result.success).toBe(true);
    });
  });
});
