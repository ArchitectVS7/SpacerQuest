/**
 * SpacerQuest v4.0 - Docking System Tests
 *
 * Tests for processDocking
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/db/prisma', () => ({
  prisma: {
    character: {
      findUnique: vi.fn(),
    },
    gameLog: {
      create: vi.fn(),
    },
  },
}));

describe('Docking system', () => {
  let prisma: any;
  let processDocking: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const prismaMod = await import('../src/db/prisma');
    prisma = prismaMod.prisma;
    const dockMod = await import('../src/game/systems/docking');
    processDocking = dockMod.processDocking;
  });

  it('returns error when character not found', async () => {
    prisma.character.findUnique.mockResolvedValue(null);
    const result = await processDocking('char-1', 5);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Character not found');
  });

  it('succeeds and logs the docking event', async () => {
    prisma.character.findUnique.mockResolvedValue({
      id: 'char-1',
      name: 'TestPilot',
    });
    prisma.gameLog.create.mockResolvedValue(undefined);

    const result = await processDocking('char-1', 5);
    expect(result.success).toBe(true);
    expect(result.message).toContain('System 5');
    expect(prisma.gameLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'SYSTEM',
        characterId: 'char-1',
        systemId: 5,
        message: expect.stringContaining('TestPilot'),
      }),
    });
  });

  it('includes character name in the log message', async () => {
    prisma.character.findUnique.mockResolvedValue({
      id: 'char-1',
      name: 'StarCaptain',
    });
    prisma.gameLog.create.mockResolvedValue(undefined);

    await processDocking('char-1', 10);
    const logCall = prisma.gameLog.create.mock.calls[0][0];
    expect(logCall.data.message).toContain('StarCaptain');
    expect(logCall.data.message).toContain('system 10');
  });
});
