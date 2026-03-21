/**
 * SpacerQuest v4.0 - Rescue Service Screen (SP.REG.S)
 *
 * Terminal screen for the rescue service
 * Lists lost ships and allows rescue attempts
 *
 * Original SP.REG.S lines 368-415:
 *   - Player enters # of spacer to rescue
 *   - Confirmation prompt: [Y]/(N)
 *   - On Y: pays 1000 cr, costs 50 fuel, +11 score, +1 rescues
 *   - Returns to registry (start label) after rescue
 *
 * Fuel requirement check is done in render (50 units needed).
 * State between list and confirm: stored in cargoManifest field.
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { renderRescueScreen } from '../systems/rescue.js';
import { addCredits } from '../utils.js';
import { RESCUE_FEE, RESCUE_FUEL_COST, RESCUE_POINTS_BONUS } from '../constants.js';

const PENDING_RESCUE_PREFIX = 'RESCUE_PENDING:';

export const RescueScreen: ScreenModule = {
  name: 'rescue',
  render: async (characterId: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true },
    });

    if (!character) {
      return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n', nextScreen: 'registry' };
    }

    // Clear any pending rescue state on re-render
    if (character.cargoManifest?.startsWith(PENDING_RESCUE_PREFIX)) {
      await prisma.character.update({
        where: { id: characterId },
        data: { cargoManifest: null },
      });
    }

    // Get lost ships (exclude self)
    const lostShips = await prisma.character.findMany({
      where: { isLost: true, id: { not: characterId } },
      select: {
        id: true,
        name: true,
        shipName: true,
        lostLocation: true,
        updatedAt: true,
      },
    });

    // Original: if il<1 print"No ships are lost in space at this time":goto start
    if (lostShips.length === 0) {
      return {
        output: 'No ships are lost in space at this time\r\n',
        nextScreen: 'registry',
      };
    }

    // Original: if f1<50 print"50 units of fuel needed to complete rescue!":goto start
    const fuel = character.ship?.fuel ?? 0;
    if (fuel < RESCUE_FUEL_COST) {
      return {
        output: `${RESCUE_FUEL_COST} units of fuel needed to complete rescue!\r\n`,
        nextScreen: 'registry',
      };
    }

    const mapped = lostShips.map(s => ({
      id: s.id,
      name: s.name,
      shipName: s.shipName || 'unnamed',
      lostLocation: s.lostLocation || 0,
      lostAt: s.updatedAt,
    }));

    const output = renderRescueScreen(mapped, character.name);
    return { output };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const key = input.trim().toUpperCase();

    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true },
    });

    if (!character) {
      return { output: '\x1b[31mError.\x1b[0m\r\n', nextScreen: 'registry' };
    }

    // Check if we're in the Y/N confirmation state
    const isPending = character.cargoManifest?.startsWith(PENDING_RESCUE_PREFIX);

    if (isPending) {
      const targetId = character.cargoManifest!.slice(PENDING_RESCUE_PREFIX.length);

      if (key === 'N') {
        // Original: if i$="N" print"No":goto start
        await prisma.character.update({
          where: { id: characterId },
          data: { cargoManifest: null },
        });
        return { output: 'No\r\n', nextScreen: 'registry' };
      }

      if (key === 'Y' || key === '') {
        // Default is Y (original: [Y]/(N) — Y is default)
        // Perform rescue
        const target = await prisma.character.findUnique({
          where: { id: targetId },
        });

        if (!target || !target.isLost) {
          await prisma.character.update({
            where: { id: characterId },
            data: { cargoManifest: null },
          });
          return {
            output: `\r\n${target?.name || 'Spacer'}'s ship already Rescued\r\n`,
            nextScreen: 'registry',
          };
        }

        // Apply rescue rewards (original lines 407-413):
        //   g2=g2+1000:u1=u1+1:b1=b1+1:s2=s2+11:f1=f1-50:gosub crfix
        const { high: newHigh, low: newLow } = addCredits(
          character.creditsHigh,
          character.creditsLow,
          RESCUE_FEE
        );

        await prisma.character.update({
          where: { id: characterId },
          data: {
            creditsHigh: newHigh,
            creditsLow: newLow,
            tripsCompleted: { increment: 1 },    // u1=u1+1
            rescuesPerformed: { increment: 1 },  // b1=b1+1
            score: { increment: RESCUE_POINTS_BONUS }, // s2=s2+11
            cargoManifest: null,
          },
        });

        if (character.ship) {
          await prisma.ship.update({
            where: { id: character.ship.id },
            data: { fuel: { decrement: RESCUE_FUEL_COST } }, // f1=f1-50
          });
        }

        // Mark target as rescued (az$=na$)
        await prisma.character.update({
          where: { id: targetId },
          data: {
            isLost: false,
            lostLocation: null,
          },
        });

        return {
          output: `Yes\r\n\r\nYou scan for the lost spaceship near system ${target.lostLocation}........\r\n` +
            `You find it and using a tractor beam tow it into port\r\n` +
            `Congratulations ${character.name} on a successful rescue\r\n\r\n` +
            `A salvage fee of ${RESCUE_FEE} cr is paid by the Rescue Service\r\n`,
          nextScreen: 'registry',
        };
      }

      // Any other key — stay in pending state
      return {
        output: `Do you wish to rescue their ship? [Y]/(N): `,
      };
    }

    // Not in confirmation state — handle list navigation

    // Original: if i$="" goto start
    if (key === '' || key === 'Q') {
      return { output: '\x1b[2J\x1b[H', nextScreen: 'registry' };
    }

    // Try to parse as a number (rescue selection)
    const selection = parseInt(key, 10);
    if (isNaN(selection)) {
      return { output: '\r\n\x1b[31mInvalid input. Enter a number or Q to quit.\x1b[0m\r\nEnter # of Spacer to rescue: ' };
    }

    // Get lost ships to validate selection
    const lostShips = await prisma.character.findMany({
      where: { isLost: true, id: { not: characterId } },
      select: { id: true, name: true, lostLocation: true },
    });

    if (selection < 1 || selection > lostShips.length) {
      return {
        output: '\r\n\x1b[31mInvalid selection.\x1b[0m\r\nEnter # of Spacer to rescue: ',
      };
    }

    const target = lostShips[selection - 1];

    // Check if already rescued
    const fresh = await prisma.character.findUnique({
      where: { id: target.id },
      select: { isLost: true, name: true, lostLocation: true },
    });

    if (!fresh || !fresh.isLost) {
      return {
        output: `\r\n${fresh?.name || target.name}'s ship already Rescued\r\n` +
          'Enter # of Spacer to rescue: ',
      };
    }

    // Store pending rescue target and show confirmation
    await prisma.character.update({
      where: { id: characterId },
      data: { cargoManifest: PENDING_RESCUE_PREFIX + target.id },
    });

    return {
      output: `${target.name} is lost near system ${target.lostLocation}\r\n\r\n` +
        `Do you wish to rescue their ship? [Y]/(N): `,
    };
  },
};
