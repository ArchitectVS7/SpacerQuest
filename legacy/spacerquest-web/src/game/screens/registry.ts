/**
 * SpacerQuest v4.0 - Registry Screen (SP.REG.S)
 *
 * Terminal screen for the Space Registry
 *
 * Original SP.REG.S menu (lines 38-45):
 *   [L] Library
 *   [R] Rescue Service
 *   [S] Space Patrol HQ
 *   [Q] Quit
 *   [?] Menu
 *
 * Checks before R and S (lines 41-42):
 *   - hull and drive must be functional (h2>=1 and d2>=1)
 *   - ship must have a name (nz$ != "")
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import {
  renderRegistryHeader,
  renderLibraryMenu,
  renderSpacerDirectory,
  renderAllianceDirectory,
} from '../systems/registry.js';

export const RegistryScreen: ScreenModule = {
  name: 'registry',
  render: async (_characterId: string): Promise<ScreenResponse> => {
    return { output: renderRegistryHeader() };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const key = input.trim().toUpperCase();

    // Q or Enter = quit (original: if i$=cr$ i$="Q")
    if (key === 'Q' || key === '' || key === '\r') {
      return { output: 'Leaving...\r\n', nextScreen: 'main-menu' };
    }

    // ? = show menu
    if (key === '?') {
      return { output: renderRegistryHeader() };
    }

    // L = Library (no ship check required)
    if (key === 'L') {
      return { output: 'Library\r\n' + renderLibraryMenu() };
    }

    // R and S require a functional ship and ship name
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true },
    });

    if (!character) {
      return { output: '\r\n\x1b[31mError: Character not found.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    // Original lines 41-42: if (h2<1) or (d2<1) → no functional ship
    if (!character.ship || character.ship.hullCondition < 1 || character.ship.driveCondition < 1) {
      return {
        output: 'No functional ship\r\n\x1b[32m[Registry]: Command:\x1b[0m ',
      };
    }

    // Original line 42: if nz$="" → ship needs a name first
    if (!character.shipName) {
      return {
        output: 'Your ship needs a name first\r\n\x1b[32m[Registry]: Command:\x1b[0m ',
      };
    }

    if (key === 'R') {
      // Rescue Service
      return { output: 'Rescue Service\r\n', nextScreen: 'rescue' };
    }

    if (key === 'S') {
      // Space Patrol HQ
      return { output: 'Space Patrol HQ\r\n', nextScreen: 'space-patrol' };
    }

    return {
      output: 'Whoops!...try it again\r\n\x1b[32m[Registry]: Command:\x1b[0m ',
    };
  },
};

// ============================================================================
// LIBRARY SCREEN
// ============================================================================

/**
 * Library submenu handler (SP.REG.S lines 47-69)
 *
 * Original options:
 *   [H] Help (sp.help)
 *   [P] Past Greats (pastgreat)
 *   [1] Star System Layout (sp.layout)
 *   [2] Game Log (sp.log)
 *   [3] Help (sp.help)
 *   [4] Directory of Spacers (dir)
 *   [5] Game Formulae (sp.formulae)
 *   [6] Ship Naming (shipname)
 *   [7] Rules/Documentation (sp.dox)
 *   [8] Top Gun List (topgun)
 *   [9] Alliance Directories (allies)
 *   [Q] Quit back to Registry
 */
export const LibraryScreen: ScreenModule = {
  name: 'library',
  render: async (_characterId: string): Promise<ScreenResponse> => {
    return { output: renderLibraryMenu() };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const key = input.trim().toUpperCase();

    if (key === 'Q' || key === '' || key === '\r') {
      return { output: 'Leaving....\r\n', nextScreen: 'registry' };
    }

    if (key === '?') {
      return { output: renderLibraryMenu() };
    }

    if (key === '4') {
      // Directory of Spacers (dir subroutine)
      const spacers = await prisma.character.findMany({
        select: {
          spacerId: true, name: true, shipName: true,
          rank: true, allianceSymbol: true, score: true,
        },
        orderBy: { spacerId: 'asc' },
      });

      const output = renderSpacerDirectory(spacers.map(s => ({
        spacerId: s.spacerId,
        name: s.name,
        shipName: s.shipName,
        rank: s.rank,
        allianceSymbol: s.allianceSymbol,
        score: s.score,
      })));

      return {
        output: output + '\r\nEnter spacer ID to view record, or [Q]uit: ',
        nextScreen: 'registry-search',
      };
    }

    if (key === '9') {
      // Alliance Directories (allies subroutine)
      const spacers = await prisma.character.findMany({
        select: {
          spacerId: true, name: true, shipName: true,
          rank: true, allianceSymbol: true, score: true,
        },
        orderBy: { score: 'desc' },
      });

      const output = renderAllianceDirectory(spacers.map(s => ({
        spacerId: s.spacerId,
        name: s.name,
        shipName: s.shipName,
        rank: s.rank,
        allianceSymbol: s.allianceSymbol,
        score: s.score,
      })));

      return { output: output + '\r\n\x1b[32m[Library]: Command:\x1b[0m ' };
    }

    if (key === '6') {
      // Ship Naming (shipname subroutine)
      return { output: '6\r\n', nextScreen: 'ship-name' };
    }

    if (key === '8') {
      // Top Gun List
      return { output: '8\r\n', nextScreen: 'topgun' };
    }

    // Options 1, 2, 3, 5, 7, H, P — static content screens
    const staticContent: Record<string, string> = {
      '1': '\r\n\x1b[33;1m=== STAR SYSTEM LAYOUT ===\x1b[0m\r\nSystems 1-14: Core Galaxy | 15-20: Rim | 21-26: Andromeda | 27-28: Special\r\n',
      '2': '\r\n\x1b[33;1m=== GAME LOG ===\x1b[0m\r\nCheck the Bulletin Board for recent game events.\r\n',
      '3': '\r\n\x1b[33;1m=== HELP ===\x1b[0m\r\nTravel between systems, trade cargo, upgrade your ship, battle pirates,\r\njoin alliances, and explore the galaxy. Use ? for menu help.\r\n',
      '5': '\r\n\x1b[33;1m=== GAME FORMULAE ===\x1b[0m\r\nFuel cost: ((21-drive_str)+(10-drive_cond))*dist, (result+10)/2\r\nScore: every 100th (battle+rescue) awards a promotion point\r\nCargo pay: (cargo_type*3*dist/3)*pods + (fuel_cost*5) + 1000\r\n',
      '7': '\r\n\x1b[33;1m=== GAME RULES ===\x1b[0m\r\nSpacerQuest v4.0 - Original gameplay from the 1991 Apple II BBS game.\r\nTrade cargo, patrol systems, battle pirates, and rise through the ranks.\r\n',
      'H': '\r\n\x1b[33;1m=== HELP ===\x1b[0m\r\nTravel between systems, trade cargo, upgrade your ship, battle pirates,\r\njoin alliances, and explore the galaxy. Use ? for menu help.\r\n',
      'P': '\r\n\x1b[33;1m=== PAST GREATS ===\x1b[0m\r\nHonors the great spacers of the past.\r\n',
    };

    if (staticContent[key]) {
      return { output: staticContent[key] + '\r\n\x1b[32m[Library]: Command:\x1b[0m ' };
    }

    return { output: 'Whoops...try it again\r\n\x1b[32m[Library]: Command:\x1b[0m ' };
  },
};
