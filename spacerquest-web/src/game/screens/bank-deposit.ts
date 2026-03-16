import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { formatCredits, getTotalCredits, addCredits, subtractCredits } from '../utils.js';

export const BankDepositScreen: ScreenModule = {
  name: 'bank-deposit',
  render: async (characterId: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({ 
      where: { id: characterId } 
    });

    if (!character) {
      return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    const onHand = formatCredits(character.creditsHigh, character.creditsLow);
    const inBank = formatCredits(character.bankHigh, character.bankLow);

    const output = `
\x1b[36;1m_________________________________________\x1b[0m
\x1b[33;1m      FIRST GALACTIC BANK                 \x1b[0m
\x1b[36;1m_________________________________________\x1b[0m

\x1b[37mCredits on hand:\x1b[0m ${onHand} cr
\x1b[37mCredits in bank:\x1b[0m ${inBank} cr

Enter amount to deposit (0 to cancel):
\x1b[32m:\x1b[0m${character.currentSystem} Bank Deposit:\x1b[32m: Amount:\x1b[0m
> `;

    return { output };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const amountStr = input.trim();
    if (!amountStr || amountStr === '0') {
      return { output: '\x1b[2J\x1b[H\x1b[33mDeposit cancelled.\x1b[0m\r\n', nextScreen: 'bank' };
    }

    const amount = parseInt(amountStr, 10);
    if (isNaN(amount) || amount < 0) {
      return { output: '\r\n\x1b[31mInvalid amount.\x1b[0m\r\n> ' };
    }

    const character = await prisma.character.findUnique({
      where: { id: characterId }
    });

    if (!character) {
      return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    const totalOnHand = getTotalCredits(character.creditsHigh, character.creditsLow);
    if (totalOnHand < amount) {
      return { output: '\r\n\x1b[31mYou do not have that many credits on hand!\x1b[0m\r\n> ' };
    }

    // Process transaction
    const { high: newCashHigh, low: newCashLow } = subtractCredits(character.creditsHigh, character.creditsLow, amount);
    const { high: newBankHigh, low: newBankLow } = addCredits(character.bankHigh, character.bankLow, amount);

    await prisma.character.update({
      where: { id: characterId },
      data: {
        creditsHigh: newCashHigh,
        creditsLow: newCashLow,
        bankHigh: newBankHigh,
        bankLow: newBankLow,
      }
    });

    return { 
      output: `\x1b[2J\x1b[H\x1b[32m${amount} credits deposited successfully.\x1b[0m\r\n`, 
      nextScreen: 'bank' 
    };
  }
};
