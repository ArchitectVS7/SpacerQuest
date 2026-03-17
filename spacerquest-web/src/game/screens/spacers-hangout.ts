/**
 * SpacerQuest v4.0 - Spacers Hangout Screen (SP.BAR.S)
 *
 * Central social hub at Sun-3 (System #1).
 * Features:
 * - Alliance joining
 * - Brig viewing / bail
 * - Gambling (links to pub)
 * - Information broker
 * - Smuggling contracts
 *
 * Original source: SP.BAR.S
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { formatCredits, subtractCredits } from '../utils.js';
import { isJailed, calculateBailCost, releasePlayer, CrimeType } from '../systems/jail.js';
import { ALLIANCE_INFO, canJoinAlliance, calculateSwitchCost } from '../systems/alliance-rules.js';
import { AllianceType } from '@prisma/client';

// Module-level state maps keyed by characterId
const pendingAllianceSwitch = new Map<string, AllianceType>();
const pendingBailPrompt = new Set<string>();

const ALLIANCE_KEY_MAP: Record<string, AllianceType> = {
  '+': AllianceType.ASTRO_LEAGUE,
  '@': AllianceType.SPACE_DRAGONS,
  '&': AllianceType.WARLORD_CONFED,
  '^': AllianceType.REBEL_ALLIANCE,
};

export const SpacersHangoutScreen: ScreenModule = {
  name: 'spacers-hangout',

  render: async (characterId: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true },
    });

    if (!character) {
      return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n' };
    }

    // Only accessible at Sun-3 (system 1)
    if (character.currentSystem !== 1) {
      return {
        output: '\x1b[33mThe Spacers Hangout is only accessible at Sun-3.\x1b[0m\r\n',
        nextScreen: 'main-menu',
      };
    }

    const credits = formatCredits(character.creditsHigh, character.creditsLow);

    const output = `
\x1b[36;1m${'-'.repeat(31)}\x1b[0m
\x1b[33;1m Welcome to The Spacers Hangout!\x1b[0m
\x1b[36;1m${'-'.repeat(31)}\x1b[0m

You step over an old spacer sprawled on the floor mumbling
...'what black hole hit me?'...'all I had were four drinks'...

\x1b[32m[:\x1b[0m${credits}\x1b[32m:][Spacers Hangout]:\x1b[0m

  \x1b[37;1m(G)\x1b[0mamble    \x1b[37;1m(D)\x1b[0mrinks    \x1b[37;1m(I)\x1b[0mnfo
  \x1b[37;1m(A)\x1b[0mlliance  \x1b[37;1m(B)\x1b[0mrig     \x1b[37;1m[Q]\x1b[0muit

Hello Spacer ${character.name}. What'll it be?
> `;

    return { output };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const raw = input.trim();
    const key = raw.toUpperCase();

    // -----------------------------------------------------------------------
    // Bail ID input — pending bail prompt is active, user typed a number
    // -----------------------------------------------------------------------
    if (pendingBailPrompt.has(characterId) && /^\d+$/.test(raw)) {
      pendingBailPrompt.delete(characterId);

      const targetSpacerId = parseInt(raw, 10);

      const [caller, target] = await Promise.all([
        prisma.character.findUnique({ where: { id: characterId } }),
        prisma.character.findFirst({ where: { spacerId: targetSpacerId } }),
      ]);

      if (!caller) {
        return { output: '\r\n\x1b[31mError: Character not found.\x1b[0m\r\n> ' };
      }

      if (!target) {
        return { output: `\r\n\x1b[31mNo spacer with ID #${targetSpacerId} found.\x1b[0m\r\n> ` };
      }

      if (target.crimeType === null) {
        return { output: `\r\n\x1b[31m${target.name} is not in the brig.\x1b[0m\r\n> ` };
      }

      const crimeType = target.crimeType as unknown as CrimeType;
      const bailCost = calculateBailCost(crimeType);
      const deductResult = subtractCredits(caller.creditsHigh, caller.creditsLow, bailCost);

      if (!deductResult.success) {
        return {
          output: `\r\n\x1b[31mYou don't have enough credits to post bail (need ${bailCost} cr).\x1b[0m\r\n> `,
        };
      }

      const releasedName = releasePlayer(target.name);

      await Promise.all([
        prisma.character.update({
          where: { id: caller.id },
          data: { creditsHigh: deductResult.high, creditsLow: deductResult.low },
        }),
        prisma.character.update({
          where: { id: target.id },
          data: { crimeType: null, name: releasedName },
        }),
      ]);

      return {
        output: `\r\n\x1b[32mBail posted! ${releasedName} walks free.\x1b[0m\r\n> `,
      };
    }

    // If bail prompt is active but user typed something non-numeric, cancel it
    if (pendingBailPrompt.has(characterId)) {
      pendingBailPrompt.delete(characterId);
    }

    switch (key) {
      case 'Q':
        return { output: '\x1b[33mLeaving the Hangout...\x1b[0m\r\n', nextScreen: 'main-menu' };

      case 'G':
        return { output: '\x1b[33mGambling...\x1b[0m\r\n', nextScreen: 'pub' };

      case 'D':
        return { output: '\r\n\x1b[32mSlurp! Guzzle! Barf!\x1b[0m\r\n> ' };

      case 'I':
        return {
          output: `\r\n\x1b[33mInformation Broker:\x1b[0m\r\n` +
            `  WIS - Try Polaris-1\r\n` +
            `  SAG - Try Mizar-9\r\n` +
            `  ALL - Looking for an alliance?\r\n` +
            `  PIR - Pirates attack Cargo Transports\r\n` +
            `  SMU - Smuggling pays big bucks\r\n` +
            `  SPA - Owning a Space Port generates income\r\n` +
            `  BAT - B/F = Hull/Rank/Drives/#Trips/Life/#Wins\r\n> `,
        };

      case 'A': {
        // Alliance display — show member counts then prompt for choice
        const lines = ['\r\n\x1b[33;1mAlliance Recruitment:\x1b[0m\r\n'];
        for (const a of ALLIANCE_INFO) {
          const count = await prisma.allianceMembership.count({
            where: { alliance: a.enum },
          });
          lines.push(`  (${a.symbol}) ${a.name} - ${count} members\r\n`);
        }
        lines.push('\r\nRequires Lieutenant rank or higher.\r\n');
        lines.push('\r\nChoose: (+)Astro League  (@)Space Dragons\r\n');
        lines.push('        (&)Warlord Confed (^)Rebel Alliance\r\n');
        lines.push('        (Q)Cancel\r\n> ');
        return { output: lines.join(''), data: { awaitingAllianceChoice: true } };
      }

      case '+':
      case '@':
      case '&':
      case '^': {
        const allianceEnum = ALLIANCE_KEY_MAP[key];
        const allianceInfo = ALLIANCE_INFO.find(a => a.symbol === key)!;

        const character = await prisma.character.findUnique({
          where: { id: characterId },
          include: { ship: true },
        });

        if (!character) {
          return { output: '\r\n\x1b[31mError: Character not found.\x1b[0m\r\n> ' };
        }

        const [totalPlayers, allianceMemberCount] = await Promise.all([
          prisma.character.count(),
          prisma.allianceMembership.count({ where: { alliance: allianceEnum } }),
        ]);

        const joinResult = canJoinAlliance(
          character.rank,
          character.allianceSymbol as AllianceType,
          totalPlayers,
          allianceMemberCount
        );

        if (!joinResult.allowed) {
          return {
            output: `\r\n\x1b[31m${joinResult.reason}\x1b[0m\r\n> `,
          };
        }

        if (joinResult.hasExistingAlliance) {
          // Store pending switch and ask for confirmation
          pendingAllianceSwitch.set(characterId, allianceEnum);
          return {
            output: `\r\n\x1b[33;1mSwitching costs ALL your credits and port ownership!\x1b[0m\r\n` +
              `Join ${allianceInfo.name}? (Y)es (N)o\r\n> `,
          };
        }

        // No existing alliance — join immediately
        await prisma.character.update({
          where: { id: character.id },
          data: { allianceSymbol: allianceEnum },
        });
        await prisma.allianceMembership.upsert({
          where: { characterId: character.id },
          update: { alliance: allianceEnum },
          create: { characterId: character.id, alliance: allianceEnum },
        });

        return {
          output: `\r\n\x1b[32mWelcome to ${allianceInfo.name}!\x1b[0m\r\n> `,
        };
      }

      case 'Y': {
        const pendingAlliance = pendingAllianceSwitch.get(characterId);
        if (!pendingAlliance) {
          return { output: '\r\n\x1b[31mWhoops!...one too many!\x1b[0m\r\n> ' };
        }

        pendingAllianceSwitch.delete(characterId);

        const allianceInfo = ALLIANCE_INFO.find(a => a.enum === pendingAlliance)!;

        const character = await prisma.character.findUnique({
          where: { id: characterId },
        });

        if (!character) {
          return { output: '\r\n\x1b[31mError: Character not found.\x1b[0m\r\n> ' };
        }

        // Apply switch cost: zero credits, delete port ownership
        await Promise.all([
          prisma.character.update({
            where: { id: character.id },
            data: {
              creditsHigh: 0,
              creditsLow: 0,
              allianceSymbol: pendingAlliance,
            },
          }),
          prisma.portOwnership.deleteMany({ where: { characterId: character.id } }),
          prisma.allianceMembership.upsert({
            where: { characterId: character.id },
            update: { alliance: pendingAlliance },
            create: { characterId: character.id, alliance: pendingAlliance },
          }),
        ]);

        return {
          output: `\r\n\x1b[32mAlliance switched! Welcome to ${allianceInfo.name}.\x1b[0m\r\n` +
            `\x1b[33mAll your credits and port ownership have been forfeited.\x1b[0m\r\n> `,
        };
      }

      case 'N': {
        if (pendingAllianceSwitch.has(characterId)) {
          pendingAllianceSwitch.delete(characterId);
          return { output: '\r\n\x1b[33mAlliance switch cancelled.\x1b[0m\r\n> ' };
        }
        return { output: '\r\n\x1b[31mWhoops!...one too many!\x1b[0m\r\n> ' };
      }

      case 'B': {
        // Brig viewing
        const jailed = await prisma.character.findMany({
          where: { crimeType: { not: null } },
          select: { spacerId: true, name: true, shipName: true, crimeType: true },
        });

        if (jailed.length === 0) {
          return {
            output: `\r\n\x1b[36;1m${'_'.repeat(49)}\x1b[0m\r\n` +
              `\x1b[33mHmmm...Let's see who we have locked up....\x1b[0m\r\n` +
              `\x1b[36;1m${'_'.repeat(49)}\x1b[0m\r\n` +
              `\r\nThe Brig is vacant right now\r\n> `,
          };
        }

        const cells = jailed.map((j, i) =>
          `  Cell #${i + 1} (#${String(j.spacerId).padStart(4, '0')})...${j.name}...Ship: ${j.shipName || 'none'}`
        ).join('\r\n');

        // Set bail prompt flag so next numeric input is treated as a spacer ID
        pendingBailPrompt.add(characterId);

        return {
          output: `\r\n\x1b[36;1m${'_'.repeat(49)}\x1b[0m\r\n` +
            `\x1b[33mHmmm...Let's see who we have locked up....\x1b[0m\r\n` +
            `\x1b[36;1m${'_'.repeat(49)}\x1b[0m\r\n` +
            `\r\n${cells}\r\n` +
            `\r\nThat's the scurvy lot of them\r\n` +
            `\r\n  \x1b[37;1m(B)\x1b[0mail spacer #___  to bail someone out\r\n` +
            `\r\nEnter spacer ID to bail: `,
        };
      }

      default:
        return {
          output: '\r\n\x1b[31mWhoops!...one too many!\x1b[0m\r\n> ',
        };
    }
  },
};
