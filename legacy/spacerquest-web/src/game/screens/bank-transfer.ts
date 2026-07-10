import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { formatCredits } from '../utils.js';
import { investInAlliance } from '../systems/alliance.js';

export const BankTransferScreen: ScreenModule = {
  name: 'bank-transfer',
  render: async (characterId: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({ 
      where: { id: characterId } 
    });

    if (!character) {
        return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    const membership = await prisma.allianceMembership.findUnique({
      where: { characterId }
    });

    if (!membership || membership.alliance === 'NONE') {
        return { output: '\r\n\x1b[31mYou must be in an alliance to use the transfer feature.\x1b[0m\r\n> ', nextScreen: 'bank' };
    }

    const onHand = formatCredits(character.creditsHigh, character.creditsLow);
    const invested = formatCredits(membership.creditsHigh, membership.creditsLow);

    const output = `
\x1b[36;1m_________________________________________\x1b[0m
\x1b[33;1m      ALLIANCE INVESTMENT TRANSFER        \x1b[0m
\x1b[36;1m_________________________________________\x1b[0m

\x1b[32mAlliance:\x1b[0m ${membership.alliance}
\x1b[37mCredits on hand:\x1b[0m ${onHand} cr
\x1b[37mCurrent Investment:\x1b[0m ${invested} cr

Enter amount to transfer to your alliance account (0 to cancel):
\x1b[32m:\x1b[0m${character.currentSystem} Bank Transfer:\x1b[32m: Amount:\x1b[0m
> `;

    return { output };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const amountStr = input.trim();
    if (!amountStr || amountStr === '0') {
      return { output: '\x1b[2J\x1b[H\x1b[33mTransfer cancelled.\x1b[0m\r\n', nextScreen: 'bank' };
    }

    const amount = parseInt(amountStr, 10);
    if (isNaN(amount) || amount <= 0) {
      return { output: '\r\n\x1b[31mInvalid amount.\x1b[0m\r\n> ' };
    }

    const result = await investInAlliance(characterId, amount);

    if (!result.success) {
      return { output: `\r\n\x1b[31mTransfer failed: ${result.error}\x1b[0m\r\n> ` };
    }

    return { 
      output: `\x1b[2J\x1b[H\x1b[32m${amount} credits effectively transferred to Alliance. New investment balance: ${result.newBalance} cr.\x1b[0m\r\n`, 
      nextScreen: 'bank' 
    };
  }
};
