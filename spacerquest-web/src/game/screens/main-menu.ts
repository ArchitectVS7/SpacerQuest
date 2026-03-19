/**
 * SpacerQuest v4.0 - Main Menu Screen (SP.START.S)
 * 
 * Original main menu from SpacerQuest v3.4
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { formatCredits, getAllianceSymbol } from '../utils.js';
import { isJailed } from '../systems/jail.js';
import { applyVandalism } from '../systems/extra-curricular.js';
import { isClassicMode } from '../../bots/config.js';

export const MainMenuScreen: ScreenModule = {
  name: 'main-menu',
  render: async (characterId: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({ 
      where: { id: characterId },
      include: { ship: true }
    });

    if (!character) {
      return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n' };
    }

    // Jailed players get redirected to jail screen
    if (isJailed(character.name)) {
      return { output: '\x1b[2J\x1b[H', nextScreen: 'jail' };
    }

    // Check for resolved combat from disconnect
    let combatNotice = '';
    const resolvedCombat = await prisma.combatSession.findFirst({
      where: { characterId, active: false, result: { not: null } },
      orderBy: { updatedAt: 'desc' },
    });
    if (resolvedCombat) {
      const outcomeMessages: Record<string, string> = {
        VICTORY: '\x1b[32;1mWhile you were away, your ship prevailed in combat!\x1b[0m',
        DEFEAT: '\x1b[31;1mWhile you were away, your ship was defeated in combat.\x1b[0m',
        DRAW: '\x1b[33;1mWhile you were away, your combat ended in a draw.\x1b[0m',
      };
      combatNotice = `\r\n${outcomeMessages[resolvedCombat.result!] || ''}\r\n`;
      // Clear the resolved session so it doesn't show again
      await prisma.combatSession.delete({ where: { id: resolvedCombat.id } });
    }

    const credits = formatCredits(character.creditsHigh, character.creditsLow);
    const allianceSymbol = getAllianceSymbol(character.allianceSymbol);
    const displayName = allianceSymbol ? `${character.name}-${allianceSymbol}` : character.name;

    const membership = await prisma.allianceMembership.findUnique({ where: { characterId } });
    const hasAlliance = !!(membership && membership.alliance !== 'NONE');

    const output = `${combatNotice}
\x1b[36;1m_________________________________________\x1b[0m
\x1b[33;1m                                        \x1b[0m
\x1b[33;1m     S P A C E R  Q U E S T             \x1b[0m
\x1b[33;1m     ----------------------             \x1b[0m
\x1b[33;1m                                        \x1b[0m
\x1b[37m     Version 4.0 - Web Museum Edition    \x1b[0m
\x1b[36;1m_________________________________________\x1b[0m

\x1b[32mSpacer:\x1b[0m ${displayName}
\x1b[32mShip:\x1b[0m ${character.shipName || 'None'}
\x1b[32mLocation:\x1b[0m System ${character.currentSystem}
\x1b[32mCredits:\x1b[0m ${credits} cr
\x1b[32mRank:\x1b[0m ${character.rank}

\x1b[37;1m=========================================\x1b[0m
\x1b[33;1m           MAIN MENU                     \x1b[0m
\x1b[37;1m=========================================\x1b[0m

  [B]ank - Manage your credits
  [S]hipyard - Upgrade and repair
  [P]ub - Gossip and games
  [T]raders - Buy and sell cargo
  [N]avigate - Travel between systems
  [R]egistry - Spacer directory
  [E]xtra-Curricular - Pirate, patrol, duels${!isClassicMode() ? '\n  [D]one - End Turn (run other spacers)' : ''}${hasAlliance ? '\n  [I]nvest - Alliance investment center' : ''}${character.currentSystem === 17 ? '\n  [W]ise One - Visit the Wise One' : ''}${character.currentSystem === 18 ? '\n  [A]ncient One - Visit the Sage' : ''}
  [Q]uit - Save and logout

\x1b[32m:\x1b[0m${character.currentSystem} Port Accounts:\x1b[32m:(?=Menu): Command:\x1b[0m
> `;

    return { output };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const key = input.trim().toUpperCase();

    const character = await prisma.character.findUnique({ where: { id: characterId } });

    const actions: Record<string, () => Promise<ScreenResponse>> = {
      'B': async () => ({ output: '\x1b[2J\x1b[H', nextScreen: 'bank' }),
      'S': async () => ({ output: '\x1b[2J\x1b[H', nextScreen: 'shipyard' }),
      'P': async () => ({ output: '\x1b[2J\x1b[H', nextScreen: 'pub' }),
      'T': async () => ({ output: '\x1b[2J\x1b[H', nextScreen: 'traders' }),
      'N': async () => ({ output: '\x1b[2J\x1b[H', nextScreen: 'navigate' }),
      'R': async () => ({ output: '\x1b[2J\x1b[H', nextScreen: 'registry' }),
      'E': async () => ({ output: '\x1b[2J\x1b[H', nextScreen: 'extra-curricular' }),
      'D': async () => {
        if (isClassicMode()) {
          return { output: '\r\n\x1b[33mClassic mode — wait for next day.\x1b[0m\r\n> ' };
        }
        return { output: '\x1b[2J\x1b[H', nextScreen: 'end-turn' };
      },
      'I': async () => {
        const membership = await prisma.allianceMembership.findUnique({ where: { characterId } });
        if (!membership || membership.alliance === 'NONE') {
          return { output: '\r\n\x1b[31mYou must be in an alliance to invest.\x1b[0m\r\n> ' };
        }
        return { output: '\x1b[2J\x1b[H', nextScreen: 'alliance-invest' };
      },
      'W': async () => {
        if (character?.currentSystem !== 17) {
          return { output: '\r\n\x1b[31mThe Wise One is only at Polaris-1 (System 17).\x1b[0m\r\n> ' };
        }
        return { output: '\x1b[2J\x1b[H', nextScreen: 'wise-one' };
      },
      'A': async () => {
        if (character?.currentSystem !== 18) {
          return { output: '\r\n\x1b[31mThe Sage is only at Mizar-9 (System 18).\x1b[0m\r\n> ' };
        }
        return { output: '\x1b[2J\x1b[H', nextScreen: 'sage' };
      },
      'Q': async () => {
        // Quit — apply vandalism if no ship guard (SP.END.txt lines 100-134)
        const vandalResult = await applyVandalism(characterId);
        let msg = '';
        if (vandalResult.vandalized) {
          const comp = vandalResult.component!.replace(/([A-Z])/g, ' $1').trim();
          msg = `\r\n\x1b[31;1mVandals damaged your ${comp}! (STR -${vandalResult.strengthLoss}, COND -${vandalResult.conditionLoss})\x1b[0m\r\n`;
          msg += '\x1b[33mHire a ship guard next time to prevent this!\x1b[0m\r\n';
        } else if (vandalResult.guardConsumed) {
          msg = '\r\n\x1b[32mYour ship guard protected your vessel.\x1b[0m\r\n';
        }
        return {
          output: `${msg}\r\n\x1b[32mGame saved. Thank you for playing SpacerQuest!\x1b[0m\r\n`
        };
      },
    };

    const action = actions[key];
    if (action) {
      return await action();
    }

    return { output: '\r\n\x1b[31mInvalid command. Press B, S, P, T, N, or Q.\x1b[0m\r\n> ' };
  }
};
