/**
 * SpacerQuest v4.0 - Main Menu Screen (SP.START.S)
 * 
 * Original main menu from SpacerQuest v3.4
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { formatCredits, getAllianceSymbol } from '../utils.js';

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

    const credits = formatCredits(character.creditsHigh, character.creditsLow);
    const allianceSymbol = getAllianceSymbol(character.allianceSymbol);
    const displayName = allianceSymbol ? `${character.name}-${allianceSymbol}` : character.name;

    const output = `
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
  [Q]uit - Save and logout

\x1b[32m:\x1b[0m${character.currentSystem} Port Accounts:\x1b[32m:(?=Menu): Command:\x1b[0m
> `;

    return { output };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const key = input.trim().toUpperCase();

    const actions: Record<string, () => Promise<ScreenResponse>> = {
      'B': async () => ({ output: '\x1b[2J\x1b[H', nextScreen: 'bank' }),
      'S': async () => ({ output: '\x1b[2J\x1b[H', nextScreen: 'shipyard' }),
      'P': async () => ({ output: '\x1b[2J\x1b[H', nextScreen: 'pub' }),
      'T': async () => ({ output: '\x1b[2J\x1b[H', nextScreen: 'traders' }),
      'N': async () => {
        // Navigate command - would trigger navigation flow
        return { 
          output: '\r\n\x1b[33mNavigation Control - Use API or WebSocket for travel\x1b[0m\r\n> ' 
        };
      },
      'Q': async () => {
        // Quit - save and logout
        return { 
          output: '\r\n\x1b[32mGame saved. Thank you for playing SpacerQuest!\x1b[0m\r\n' 
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
