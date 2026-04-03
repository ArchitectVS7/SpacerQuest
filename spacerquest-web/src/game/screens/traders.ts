/**
 * SpacerQuest v4.0 - Traders Screen (SP.XCHG.S)
 * 
 * Cargo trading, market prices, and commerce
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { formatCredits } from '../utils.js';
import { getCargoDescription, getFuelPrice, getSystemName } from '../systems/economy.js';
import { CORE_SYSTEM_NAMES } from '../constants.js';

/**
 * SP.CARGO.txt lines 74-80: Daily upgrade specials.
 *
 * Original:
 *   if s2<150 ej=0:goto bddd       — need score >= 150 (Commander rank)
 *   if ej>0 goto bddd              — already set for today
 *   r=8:gosub rand:ej=x+3          — random system 4-11 (rand 1-8 + 3)
 *   "Today: "ll$" has specials on Upgrades at the Speede Shoppe"
 *
 * We generate a deterministic daily special using the date as seed.
 */
function getDailyUpgradeSpecialSystem(): number {
  const now = new Date();
  // Use date components to create a pseudo-random but deterministic daily value
  const seed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  // Original: r=8:gosub rand:ej=x+3 → system 4-11
  return (seed % 8) + 4;
}

export const TradersScreen: ScreenModule = {
  name: 'traders',
  render: async (characterId: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({ 
      where: { id: characterId },
      include: { ship: true }
    });

    if (!character || !character.ship) {
      return { output: '\x1b[31mError: No ship found.\x1b[0m\r\n' };
    }

    const credits = formatCredits(character.creditsHigh, character.creditsLow);
    const fuelPrice = getFuelPrice(character.currentSystem);

    // SP.CARGO.txt lines 74-80: Daily upgrade specials
    // Only show if player has score >= 150 (Commander rank, matching s2<150 check)
    const scoreLevel = Math.floor(character.score / 150);
    let upgradeSpecialLine = '';
    if (scoreLevel >= 1) {
      const specialSystemId = getDailyUpgradeSpecialSystem();
      const specialSystemName = CORE_SYSTEM_NAMES[specialSystemId] || `System ${specialSystemId}`;
      upgradeSpecialLine = `\r\n\x1b[33;1mToday: ${specialSystemName} has specials on Upgrades at the Speede Shoppe\x1b[0m\r\n`;
    }

    const output = `
\x1b[36;1m_________________________________________\x1b[0m
\x1b[33;1m      INTERGALACTIC TRADERS               \x1b[0m
\x1b[36;1m_________________________________________\x1b[0m
${upgradeSpecialLine}
Market rates fluctuate based on supply/demand.

\x1b[32mCredits:\x1b[0m ${credits} cr
\x1b[32mFuel Price:\x1b[0m ${fuelPrice} cr/unit
\x1b[32mCargo Pods:\x1b[0m ${character.ship.cargoPods}/${character.ship.maxCargoPods}

\x1b[37;1m=========================================\x1b[0m
\x1b[33;1m         CARGO TYPES                     \x1b[0m
\x1b[37;1m=========================================\x1b[0m

  Type    Description
  ────────────────────────────────────
  [1]     Dry Goods
  [2]     Nutri Goods
  [3]     Spices
  [4]     Medicinals
  [5]     Electronics
  [6]     Precious Metals
  [7]     Rare Elements
  [8]     Photonic Components
  [9]     Dilithium Crystal

\x1b[37;1m=========================================\x1b[0m
\x1b[33;1m           TRADERS MENU                  \x1b[0m
\x1b[37;1m=========================================\x1b[0m

  [A]ccept cargo contract
  [B]uy fuel
  [S]ell fuel
  [C]heck current contract
  [D]ump cargo (abandon current contract)
  [M]ain Menu

\x1b[32m:\x1b[0m${character.currentSystem} Traders:\x1b[32m:(?=Menu): Command:\x1b[0m
> `;

    return { output };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const key = input.trim().toUpperCase();

    switch (key) {
      case 'M':
        return { output: '\x1b[2J\x1b[H', nextScreen: 'main-menu' };
      
      case 'A': {
        // SP.LINK.S lkcargo gate (lines 225-239):
        //   if z1>=3 → CLOSED (tripCount>=3 today)
        //   if cs>=1 (hasPatrolCommission) → CLOSED (on patrol)
        //   if kk=5 (missionType=5, smuggling) → CLOSED
        const gateChar = await prisma.character.findUnique({
          where: { id: characterId },
          select: { tripCount: true, hasPatrolCommission: true, missionType: true },
        });
        if (gateChar) {
          if (gateChar.tripCount >= 3 || gateChar.hasPatrolCommission || gateChar.missionType === 5) {
            return {
              output: '\r\n\x1b[31mSorry, Cargo Dispatch Office is Closed for Today\x1b[0m\r\n> ',
            };
          }
        }
        return { output: '\x1b[2J\x1b[H', nextScreen: 'traders-cargo' };
      }
      
      case 'B':
        return { output: '\x1b[2J\x1b[H', nextScreen: 'traders-buy-fuel' };
      
      case 'S':
        return { output: '\x1b[2J\x1b[H', nextScreen: 'traders-sell-fuel' };
      
      case 'C': {
        // Check current cargo contract
        const character = await prisma.character.findUnique({
          where: { id: characterId },
        });

        if (character && character.cargoPods > 0 && character.cargoType !== 0) {
          const cargoDesc = getCargoDescription(character.cargoType);
          return {
            output: `\r\n\x1b[33mCurrent Contract:\x1b[0m\r\n  ${character.cargoPods} pods of ${cargoDesc}\r\n  Destination: System ${character.destination}\r\n  Payment: ${character.cargoPayment} cr\r\n> `
          };
        }
        return {
          output: '\r\n\x1b[33mNo active cargo contract\x1b[0m\r\n> '
        };
      }

      case 'D': {
        // Cargo dump / abandon contract
        // Original: SP.YARD.txt lines 301-302, SP.END.txt line 96
        // Voids the cargo contract: q1=0:q2=0:q3=0:q4=0:q5=0:q6=0:q2$="":q4$=""
        const character = await prisma.character.findUnique({
          where: { id: characterId },
        });

        if (!character || character.cargoPods < 1) {
          return {
            output: '\r\n\x1b[33mNo cargo to dump.\x1b[0m\r\n> '
          };
        }

        const cargoDesc = getCargoDescription(character.cargoType);
        await prisma.character.update({
          where: { id: characterId },
          data: {
            cargoPods: 0,
            cargoType: 0,
            cargoPayment: 0,
            cargoManifest: null,
            destination: 0,
            missionType: 0,
          },
        });

        return {
          output: `\r\n\x1b[31mAs of now...your Cargo Contract is null and void!\x1b[0m\r\n\x1b[33m${character.cargoPods} pods of ${cargoDesc} dumped.\x1b[0m\r\n> `
        };
      }

      default:
        return {
          output: '\r\n\x1b[31mInvalid command. Press A, B, S, C, D, or M.\x1b[0m\r\n> '
        };
    }
  }
};
