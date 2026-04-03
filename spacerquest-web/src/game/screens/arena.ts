/**
 * SpacerQuest v4.0 - Dueling Arena Screen (SP.ARENA1.S / SP.ARENA2.S)
 *
 * Terminal screen for the Dueling Arena
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import {
  renderArenaHeader,
  renderArenaMenu12,
  renderDuelRoster,
  renderBattleLog,
  renderArenaOptions,
  renderArenaStat,
  calculateDuelHandicap,
} from '../systems/arena.js';

// Per-character pending confirmation state
// 'remove_confirm' — waiting Y/N for roster removal (SP.ARENA1.S lines 86-88)
// 'quit_confirm'   — waiting Y/N for Contender quit warning (SP.ARENA1.S lines 271-274)
const pendingConfirm = new Map<string, 'remove_confirm' | 'quit_confirm'>();

export const ArenaScreen: ScreenModule = {
  name: 'arena',
  render: async (characterId: string): Promise<ScreenResponse> => {
    pendingConfirm.delete(characterId);
    return { output: renderArenaHeader() };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const key = input.trim().toUpperCase();

    // ── Handle pending Y/N confirmations ──────────────────────────────────────
    const pending = pendingConfirm.get(characterId);
    if (pending === 'remove_confirm') {
      pendingConfirm.delete(characterId);
      if (key === 'Y') {
        // Confirmed — proceed with removal
        const duelEntry = await prisma.duelEntry.findFirst({
          where: { challengerId: characterId, status: 'PENDING' },
        });
        if (!duelEntry) {
          return { output: '\r\nYes\r\n\x1b[31mEntry no longer found.\x1b[0m\r\n\x1b[32m[Spacer Arena]:Command:\x1b[0m ' };
        }
        if (duelEntry.stakesType === 'CREDITS' || duelEntry.stakesType === 'credits') {
          const { addCredits } = await import('../utils.js');
          const char = await prisma.character.findUnique({ where: { id: characterId } });
          if (char) {
            const refund = addCredits(char.creditsHigh, char.creditsLow, duelEntry.handicap);
            await prisma.character.update({
              where: { id: characterId },
              data: { creditsHigh: refund.high, creditsLow: refund.low },
            });
          }
        }
        await prisma.duelEntry.update({ where: { id: duelEntry.id }, data: { status: 'CANCELLED' } });
        return { output: '\r\nYes\r\nRemoved from dueling roster.\r\n\x1b[32m[Spacer Arena]:Command:\x1b[0m ' };
      } else {
        // Default is N (original: [Y]/(N) — N is default)
        return { output: '\r\nNo\r\n\x1b[32m[Spacer Arena]:Command:\x1b[0m ' };
      }
    }

    if (pending === 'quit_confirm') {
      pendingConfirm.delete(characterId);
      if (key === 'Y') {
        // SP.ARENA1.S line 274: print"Yes":goto linker
        return { output: '\r\nYes\r\n\x1b[2J\x1b[H', nextScreen: 'main-menu' };
      } else {
        // Default is N (original: [Y]/(N))
        return { output: '\r\nNo\r\n\x1b[32m[Spacer Arena]:Command:\x1b[0m ' };
      }
    }

    switch (key) {
      case 'Q': {
        // SP.ARENA1.S lines 267-274: if pp=8 show Contender quit warning
        const contenderCheck = await prisma.duelEntry.findFirst({
          where: { challengerId: characterId, status: 'PENDING' },
        });
        if (contenderCheck) {
          // Original: "Leaving with your ship as Contender will exit you from Spacer Quest"
          pendingConfirm.set(characterId, 'quit_confirm');
          return {
            output: '\r\n\x1b[33mLeaving with your ship as Contender will exit you from Spacer Quest\x1b[0m\r\nQuit the game? [Y]/(N): ',
          };
        }
        return { output: '\x1b[2J\x1b[H', nextScreen: 'main-menu' };
      }

      case 'O':
        // SP.ARENA1.S line 63: if i$="O" print:i$="sp.menu12":gosub show:goto startx
        // SP.ARENA1.S line 102: if i$="O" print:i$="sp.menu12":gosub show:goto liab
        return { output: renderArenaMenu12() + '\r\n\x1b[32m[Spacer Arena]:Command:\x1b[0m ' };

      case '?':
        // Redisplay arena header/menu (SP.ARENA1.S line 65: if i$="?" goto start)
        return { output: '\r\n' + renderArenaHeader() };

      case '1': {
        // Contender - show options for posting a duel
        // Check handicap adequacy first (SP.ARENA1.S line 68)
        const character = await prisma.character.findUnique({
          where: { id: characterId },
          include: { ship: true },
        });
        if (!character?.ship) {
          return { output: '\r\n\x1b[31mNo ship found.\x1b[0m\r\n\x1b[32m[Spacer Arena]:Command:\x1b[0m ' };
        }
        // SP.ARENA1.S line 70: if pp=8 → "You are already a Contender"
        const existingChallenge = await prisma.duelEntry.findFirst({
          where: { challengerId: characterId, status: 'PENDING' },
        });
        if (existingChallenge) {
          return {
            output: `\r\n\x1b[33mYou are already a Contender\x1b[0m\r\n\x1b[32m[Spacer Arena]:Command:\x1b[0m `,
          };
        }
        const hcp = calculateDuelHandicap(character.ship);
        if (hcp < 1) {
          return {
            output: `\r\n\x1b[31m${character.shipName || character.name} Inadequate for dueling!\x1b[0m\r\n\x1b[32m[Spacer Arena]:Command:\x1b[0m `,
          };
        }
        const options = renderArenaOptions();
        return {
          output: '\r\n\x1b[33;1m=== POST A DUEL ===\x1b[0m\r\n\r\n' + options +
            '\r\nUse: POST /api/duel/challenge { stakesType, stakesAmount, arenaType }\r\n' +
            '\x1b[32m[Spacer Arena]:Command:\x1b[0m ',
        };
      }

      case '2': {
        // Challenger - show roster to pick a duel (links to SP.ARENA2 flow)
        // Check handicap adequacy first (SP.ARENA1.S line 68)
        const character = await prisma.character.findUnique({
          where: { id: characterId },
          include: { ship: true },
        });
        if (!character?.ship) {
          return { output: '\r\n\x1b[31mNo ship found.\x1b[0m\r\n\x1b[32m[Spacer Arena]:Command:\x1b[0m ' };
        }
        // SP.ARENA1.S line 72: if pp=9 → "Only 1 challenge per visit"
        const existingAccepted = await prisma.duelEntry.findFirst({
          where: { contenderId: characterId, status: 'ACCEPTED' },
        });
        if (existingAccepted) {
          return {
            output: `\r\n\x1b[33mOnly 1 challenge per visit\x1b[0m\r\n\x1b[32m[Spacer Arena]:Command:\x1b[0m `,
          };
        }
        const hcp = calculateDuelHandicap(character.ship);
        if (hcp < 1) {
          return {
            output: `\r\n\x1b[31m${character.shipName || character.name} Inadequate for dueling!\x1b[0m\r\n\x1b[32m[Spacer Arena]:Command:\x1b[0m `,
          };
        }

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

      case '3': {
        // Remove from roster — show confirmation first (SP.ARENA1.S lines 86-88)
        // Original: "Remove [shipName] from roster? [Y]/(N): " → default N
        const duelEntry = await prisma.duelEntry.findFirst({
          where: { challengerId: characterId, status: 'PENDING' },
        });
        if (!duelEntry) {
          const char = await prisma.character.findUnique({ where: { id: characterId } });
          return {
            output: `\r\n\x1b[31m${char?.shipName || 'Your ship'} not entered in dueling roster\x1b[0m\r\n\x1b[32m[Spacer Arena]:Command:\x1b[0m `,
          };
        }
        // Show confirmation prompt and set pending state
        const char = await prisma.character.findUnique({ where: { id: characterId } });
        const shipName = char?.shipName || char?.name || 'Your ship';
        pendingConfirm.set(characterId, 'remove_confirm');
        return {
          output: `\r\nRemove ${shipName} from roster? [Y]/(N): `,
        };
      }

      case 'R': {
        // Roster view (SP.ARENA1.S line 59)
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
        // Battle log (SP.ARENA1.S line 60: f3$="duel.log")
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

      case 'V': {
        // View duel battle file (view section, SP.ARENA1.S lines 188-207)
        // Show the most recent completed duel involving this character
        const duel = await prisma.duelEntry.findFirst({
          where: {
            status: 'COMPLETED',
            OR: [{ challengerId: characterId }, { contenderId: characterId }],
          },
          include: { challenger: true, contender: true },
          orderBy: { completedAt: 'desc' },
        });

        if (!duel) {
          return { output: '\r\nDuel not fought!\r\n\x1b[32m[Spacer Arena]:Command:\x1b[0m ' };
        }

        const arenaName = ['Ion Cloud','Proton Storm','Cosmic Radiation','Black Hole Proximity','Super-Nova Flare','Deep Space'][duel.arenaType - 1] || 'Unknown';
        const posterName = duel.challenger.shipName || duel.challenger.name;
        const accepterName = duel.contender?.shipName || duel.contender?.name || 'Unknown';
        let summary: string;
        if (!duel.result) {
          summary = `${posterName} and ${accepterName} Duel to a Draw`;
        } else if (duel.result === 'VICTORY') {
          summary = `${posterName} beats Challenger: ${accepterName}`;
        } else {
          summary = `${posterName} loses to Challenger: ${accepterName}`;
        }

        const date = duel.completedAt?.toLocaleDateString() || 'Unknown date';
        let out = '\r\n' + '-'.repeat(65) + '\r\n';
        out += `${date} - ${arenaName} Dueling Arena\r\n`;
        out += '-'.repeat(65) + '\r\n';
        out += summary + '\r\n';
        out += '-'.repeat(65) + '\r\n';
        return { output: out + '\r\n\x1b[32m[Spacer Arena]:Command:\x1b[0m ' };
      }

      case 'X': {
        // Stat screen (stat section, SP.ARENA1.S lines 320-334)
        const character = await prisma.character.findUnique({
          where: { id: characterId },
          include: { ship: true },
        });
        if (!character?.ship) {
          return { output: '\r\n\x1b[31mNo ship data found.\x1b[0m\r\n\x1b[32m[Spacer Arena]:Command:\x1b[0m ' };
        }
        const handicap = calculateDuelHandicap(character.ship);
        const statOut = renderArenaStat({
          shipName: character.shipName || 'Unknown',
          ownerName: character.name,
          hullStrength: character.ship.hullStrength,
          hullCondition: character.ship.hullCondition,
          driveStrength: character.ship.driveStrength,
          driveCondition: character.ship.driveCondition,
          cabinStrength: character.ship.cabinStrength,
          cabinCondition: character.ship.cabinCondition,
          lifeSupportStrength: character.ship.lifeSupportStrength,
          lifeSupportCondition: character.ship.lifeSupportCondition,
          weaponStrength: character.ship.weaponStrength,
          weaponCondition: character.ship.weaponCondition,
          navigationStrength: character.ship.navigationStrength,
          navigationCondition: character.ship.navigationCondition,
          roboticsStrength: character.ship.roboticsStrength,
          roboticsCondition: character.ship.roboticsCondition,
          shieldStrength: character.ship.shieldStrength,
          shieldCondition: character.ship.shieldCondition,
          tripsCompleted: character.tripsCompleted,
          astrecsTraveled: character.astrecsTraveled,
          cargoDelivered: character.cargoDelivered,
          rescuesPerformed: character.rescuesPerformed,
          battlesWon: character.battlesWon,
          battlesLost: character.battlesLost,
          score: character.score,
          creditsHigh: character.creditsHigh,
          creditsLow: character.creditsLow,
          handicap,
        });
        return { output: statOut + '\r\n\x1b[32m[Spacer Arena]:Command:\x1b[0m ' };
      }

      case 'L': {
        // List all ships (list subroutine, SP.ARENA1.S lines 303-318)
        const spacers = await prisma.character.findMany({
          select: { spacerId: true, name: true, shipName: true, rank: true, score: true },
          orderBy: { score: 'desc' },
          take: 30,
        });

        let out = '\r\n' + '-'.repeat(52) + '\r\n';
        out += '  List of Fellow Spacers\r\n';
        out += '-'.repeat(52) + '\r\n';
        out += 'ID#   Ship Name             Owner Name\r\n';
        out += '---   -------------------   -------------------\r\n';
        for (const s of spacers) {
          const shipName = (s.shipName || '-').padEnd(21);
          const ownerName = s.name.padEnd(21);
          out += `${String(s.spacerId).padStart(3)}   ${shipName}${ownerName}\r\n`;
        }

        return { output: out + '\r\n\x1b[32m[Spacer Arena]:Command:\x1b[0m ' };
      }

      default:
        return {
          output: '\r\n\x1b[31mInvalid. Press 1, 2, 3, R, B, V, L, X, O, ?, or Q.\x1b[0m\r\n\x1b[32m[Spacer Arena]:Command:\x1b[0m ',
        };
    }
  },
};
