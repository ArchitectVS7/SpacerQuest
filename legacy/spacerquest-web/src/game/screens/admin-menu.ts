/**
 * SpacerQuest v4.0 - Admin Menu Screen (SP.SYSOP hub)
 *
 * Sysop main menu: Player Editor, NPC Editor, Battle Config, Port Eviction, Top Gun,
 * Log Viewer, Star System Editor.
 * SP.SYSOP.txt: Complete sysop command menu with all sub-modules.
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';

interface EvictState {
  mode: 'manual' | 'auto';
  threshold?: number;
}

// Track port eviction prompts
const portEvictStates = new Map<string, EvictState>();

export const AdminMenuScreen: ScreenModule = {
  name: 'admin-menu',
  render: async (characterId: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { user: { select: { isAdmin: true } } },
    });

    if (!character || !character.user.isAdmin) {
      return { output: '\x1b[31mAccess denied.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    const output = `
\x1b[36;1m_________________________________________\x1b[0m
\x1b[31;1m      S Y S O P   P A N E L               \x1b[0m
\x1b[36;1m_________________________________________\x1b[0m

\x1b[37;1m=========================================\x1b[0m
\x1b[33;1m         ADMIN MENU                      \x1b[0m
\x1b[37;1m=========================================\x1b[0m

  [1] Player Editor       (SP.EDIT1)
  [2] NPC Editor          (SP.EDIT2)
  [3] Battle Config       (SP.EDIT3)
  [4] Port Eviction       (SP.SYSOP)
  [5] Top Gun Rankings    (SP.SYSOP)
  [6] Log Viewer          (SP.SYSOP logs)
  [7] Star System Editor  (SP.EDIT2 systems)
  [M] Main Menu

\x1b[31mAdmin:\x1b[0m Command:
> `;

    return { output };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const key = input.trim().toUpperCase();
    const raw = input.trim();

    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { user: { select: { isAdmin: true } } },
    });

    if (!character || !character.user.isAdmin) {
      return { output: '\x1b[31mAccess denied.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    // ── Port eviction state machine ────────────────────────────────────────
    if (portEvictStates.has(characterId)) {
      const evictState = portEvictStates.get(characterId)!;

      if (key === 'M') {
        portEvictStates.delete(characterId);
        return { output: '\x1b[2J\x1b[H', nextScreen: 'admin-menu' };
      }

      // SP.SYSOP line 91: auto-eviction threshold input
      if (evictState.mode === 'auto' && evictState.threshold === undefined) {
        const days = parseInt(raw, 10);
        if (isNaN(days) || days < 0 || days > 300) {
          portEvictStates.delete(characterId);
          return { output: '\r\n\x1b[31mInvalid threshold. Cancelled.\x1b[0m\r\n> ' };
        }
        if (days === 0) {
          portEvictStates.delete(characterId);
          return { output: '\r\n\x1b[33mAuto-eviction cancelled.\x1b[0m\r\n> ' };
        }

        // Scan for inactive port owners
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);

        const ports = await prisma.portOwnership.findMany({
          where: {
            OR: [
              { lastActiveDate: { lt: cutoff } },
              { lastActiveDate: null },
            ],
          },
          include: { character: { select: { name: true, updatedAt: true } } },
        });

        if (ports.length === 0) {
          portEvictStates.delete(characterId);
          return { output: `\r\n\x1b[33mNo port owners inactive for ${days}+ days.\x1b[0m\r\n> ` };
        }

        let out = `\r\n\x1b[33;1mPorts inactive ${days}+ days:\x1b[0m\r\n`;
        for (const p of ports) {
          const lastDate = p.lastActiveDate?.toISOString().slice(0, 10) || 'never';
          out += `  System ${p.systemId} — ${p.character.name} (last active: ${lastDate})\r\n`;
        }

        // Evict all matching
        for (const p of ports) {
          await prisma.portOwnership.delete({ where: { id: p.id } });
          await prisma.starSystem.updateMany({
            where: { id: p.systemId },
            data: { portOwner: null },
          });
        }

        portEvictStates.delete(characterId);
        out += `\r\n\x1b[32m${ports.length} port(s) evicted.\x1b[0m\r\n> `;
        return { output: out };
      }

      // Manual eviction: system ID input
      if (evictState.mode === 'manual') {
        portEvictStates.delete(characterId);
        const sysId = parseInt(key, 10);
        if (isNaN(sysId)) {
          return { output: '\r\n\x1b[31mInvalid system ID.\x1b[0m\r\n> ' };
        }
        const port = await prisma.portOwnership.findUnique({ where: { systemId: sysId } });
        if (!port) {
          return { output: `\r\n\x1b[31mNo port ownership for system ${sysId}.\x1b[0m\r\n> ` };
        }
        await prisma.portOwnership.delete({ where: { systemId: sysId } });
        await prisma.starSystem.update({
          where: { id: sysId },
          data: { portOwner: null },
        });
        return { output: `\r\n\x1b[32mPort at system ${sysId} has been evicted.\x1b[0m\r\n> ` };
      }

      portEvictStates.delete(characterId);
      return { output: '\r\n> ' };
    }

    // ── Main action dispatch ───────────────────────────────────────────────
    const actions: Record<string, () => Promise<ScreenResponse>> = {
      '1': async () => ({ output: '\x1b[2J\x1b[H', nextScreen: 'admin-players' }),
      '2': async () => ({ output: '\x1b[2J\x1b[H', nextScreen: 'admin-npcs' }),
      '3': async () => ({ output: '\x1b[2J\x1b[H', nextScreen: 'admin-config' }),
      '4': async () => {
        // Port eviction — show ports, then offer manual or auto
        const ports = await prisma.portOwnership.findMany({
          include: { character: { select: { name: true } } },
          orderBy: { systemId: 'asc' },
        });

        if (ports.length === 0) {
          return { output: '\r\n\x1b[33mNo ports are currently owned.\x1b[0m\r\n> ' };
        }

        let list = '\r\n\x1b[33;1mPort Ownerships:\x1b[0m\r\n';
        for (const p of ports) {
          const lastDate = p.lastActiveDate?.toISOString().slice(0, 10) || 'unknown';
          list += `  System ${p.systemId} — ${p.character.name} (last active: ${lastDate})\r\n`;
        }
        list += '\r\n  Enter system ID for manual eviction,\r\n';
        list += '  or type AUTO to set inactivity threshold (0-300 days):\r\n> ';

        // Check if user types AUTO or a system ID
        portEvictStates.set(characterId, { mode: 'manual' });
        return { output: list };
      },
      '5': async () => {
        const topgun = await import('../../game/systems/topgun.js');
        const rankings = await topgun.getTopGunRankings();

        let out = '\r\n\x1b[33;1m=== TOP GUN RANKINGS ===\x1b[0m\r\n\r\n';
        if (rankings.categories && Array.isArray(rankings.categories)) {
          for (const cat of rankings.categories) {
            out += `  \x1b[36m${cat.name}:\x1b[0m ${cat.leader} (${cat.value})\r\n`;
          }
        }
        out += '\r\nPress any key to continue...\r\n> ';
        return { output: out };
      },
      '6': async () => ({ output: '\x1b[2J\x1b[H', nextScreen: 'admin-logs' }),
      '7': async () => ({ output: '\x1b[2J\x1b[H', nextScreen: 'admin-systems' }),
      'M': async () => ({ output: '\x1b[2J\x1b[H', nextScreen: 'main-menu' }),
    };

    // Special: handle AUTO for eviction flow
    if (key === 'AUTO') {
      portEvictStates.set(characterId, { mode: 'auto' });
      return { output: '\r\nEnter days of inactivity for auto-eviction (0-300, 0 cancels):\r\n> ' };
    }

    const action = actions[key];
    if (action) {
      return await action();
    }

    return { output: '\r\n\x1b[31mInvalid command. Press 1-7 or M.\x1b[0m\r\n> ' };
  },
};
