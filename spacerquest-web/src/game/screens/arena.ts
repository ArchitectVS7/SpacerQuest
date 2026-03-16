/**
 * SpacerQuest v4.0 - Dueling Arena Screen (SP.ARENA1.S / SP.ARENA2.S)
 *
 * Terminal screen for the Dueling Arena
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import {
  renderArenaHeader,
  renderDuelRoster,
  renderBattleLog,
  renderArenaOptions,
} from '../systems/arena.js';

export const ArenaScreen: ScreenModule = {
  name: 'arena',
  render: async (_characterId: string): Promise<ScreenResponse> => {
    return { output: renderArenaHeader() };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const key = input.trim().toUpperCase();

    switch (key) {
      case 'Q':
        return { output: '\x1b[2J\x1b[H', nextScreen: 'main-menu' };

      case '1': {
        // Contender - show options for posting a duel
        const options = renderArenaOptions();
        return {
          output: '\r\n\x1b[33;1m=== POST A DUEL ===\x1b[0m\r\n\r\n' + options +
            '\r\nUse: POST /api/duel/challenge { stakesType, stakesAmount, arenaType }\r\n' +
            '\x1b[32m[Spacer Arena]:Command:\x1b[0m ',
        };
      }

      case '2': {
        // Challenger - show roster to pick a duel
        const duels = await prisma.duelEntry.findMany({
          where: { status: 'PENDING' },
          include: { challenger: true },
          orderBy: { createdAt: 'desc' },
          take: 20,
        });

        const roster = duels.map(d => ({
          id: d.id,
          challengerName: d.challenger.name,
          challengerShip: d.challenger.shipName || 'unnamed',
          stakesType: d.stakesType,
          stakesAmount: d.stakesAmount,
          arenaType: d.arenaType,
          handicap: d.handicap,
          createdAt: d.createdAt,
        }));

        const output = renderDuelRoster(roster);
        return {
          output: output + '\r\nUse: POST /api/duel/accept/:duelId to accept\r\n' +
            '\x1b[32m[Spacer Arena]:Command:\x1b[0m ',
        };
      }

      case 'R': {
        // Roster view
        const duels = await prisma.duelEntry.findMany({
          where: { status: 'PENDING' },
          include: { challenger: true },
          orderBy: { createdAt: 'desc' },
          take: 20,
        });

        const roster = duels.map(d => ({
          id: d.id,
          challengerName: d.challenger.name,
          challengerShip: d.challenger.shipName || 'unnamed',
          stakesType: d.stakesType,
          stakesAmount: d.stakesAmount,
          arenaType: d.arenaType,
          handicap: d.handicap,
          createdAt: d.createdAt,
        }));

        return {
          output: renderDuelRoster(roster) + '\r\n\x1b[32m[Spacer Arena]:Command:\x1b[0m ',
        };
      }

      case 'B': {
        // Battle log
        const duels = await prisma.duelEntry.findMany({
          where: { status: 'COMPLETED' },
          include: {
            challenger: true,
            contender: true,
          },
          orderBy: { completedAt: 'desc' },
          take: 20,
        });

        const log = duels.map(d => ({
          winnerName: d.result === 'VICTORY' ? d.challenger.name : (d.contender?.name || 'Unknown'),
          winnerShip: d.result === 'VICTORY' ? (d.challenger.shipName || 'unnamed') : (d.contender?.shipName || 'unnamed'),
          loserName: d.result === 'VICTORY' ? (d.contender?.name || 'Unknown') : d.challenger.name,
          loserShip: d.result === 'VICTORY' ? (d.contender?.shipName || 'unnamed') : (d.challenger.shipName || 'unnamed'),
          arenaType: d.arenaType,
          stakesType: d.stakesType,
          stakesAmount: d.stakesAmount,
          completedAt: d.completedAt || d.createdAt,
        }));

        return {
          output: renderBattleLog(log) + '\r\n\x1b[32m[Spacer Arena]:Command:\x1b[0m ',
        };
      }

      case 'L': {
        // List all ships
        const spacers = await prisma.character.findMany({
          select: { spacerId: true, name: true, shipName: true, rank: true, score: true },
          orderBy: { score: 'desc' },
          take: 30,
        });

        let out = '\x1b[33;1m  Ship Listing:\x1b[0m\r\n';
        out += '\x1b[36m  ' + '-'.repeat(50) + '\x1b[0m\r\n';
        for (const s of spacers) {
          out += `  ${String(s.spacerId).padEnd(5)} ${s.name.padEnd(16)} ${(s.shipName || '-').padEnd(14)} ${s.rank}\r\n`;
        }

        return { output: out + '\r\n\x1b[32m[Spacer Arena]:Command:\x1b[0m ' };
      }

      default:
        return {
          output: '\r\n\x1b[31mInvalid. Press 1, 2, R, B, L, or Q.\x1b[0m\r\n\x1b[32m[Spacer Arena]:Command:\x1b[0m ',
        };
    }
  },
};
