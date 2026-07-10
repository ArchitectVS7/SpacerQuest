/**
 * SpacerQuest v4.0 - Special Equipment Purchase Screen (SP.SPEED.S)
 *
 * Allows purchase of: Cloaker, Auto-Repair, Star-Buster, Arch-Angel, Astraxial Hull
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { formatCredits } from '../utils.js';
import { SPECIAL_EQUIPMENT } from '../constants.js';
import { purchaseSpecialEquipment } from '../systems/upgrades.js';

export const ShipyardSpecialScreen: ScreenModule = {
  name: 'shipyard-special',
  render: async (characterId: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true },
    });

    if (!character || !character.ship) {
      return { output: '\x1b[31mError: No ship found.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    const credits = formatCredits(character.creditsHigh, character.creditsLow);
    const ship = character.ship;
    // SP.SPEED.txt lines 82-83: price = hull * 1000, capped at 20,000 when hull > 20
    const rawAutoRepairPrice = ship.hullStrength * SPECIAL_EQUIPMENT.AUTO_REPAIR.priceMultiplier;
    const autoRepairPrice = ship.hullStrength > 20 ? 20000 : rawAutoRepairPrice;
    const titaniumHullPrice = autoRepairPrice; // Same formula per original

    const owned = (flag: boolean) => flag ? ' \x1b[32m[OWNED]\x1b[0m' : '';

    const output = `
\x1b[36;1m_________________________________________\x1b[0m
\x1b[33;1m      SPECIAL EQUIPMENT                   \x1b[0m
\x1b[36;1m_________________________________________\x1b[0m

\x1b[32mCredits:\x1b[0m ${credits} cr

  [1] Morton's Cloaker   -   500 cr  (hull < 5, shields req'd)${owned(ship.hasCloaker)}
  [2] Auto-Repair System - ${String(autoRepairPrice).padStart(5)} cr  (hull × 1,000, max 20k)${owned(ship.hasAutoRepair)}${ship.hasTitaniumHull && !ship.hasAutoRepair ? ' \x1b[33m(removes Titanium)\x1b[0m' : ''}
  [3] Star-Buster        - 10,000 cr  (Commander rank)${owned(ship.hasStarBuster)}
  [4] Arch-Angel         - 10,000 cr  (Commander rank)${owned(ship.hasArchAngel)}
  [5] Titanium Hull      - ${String(titaniumHullPrice).padStart(5)} cr  (hull × 1,000, max 20k, +50 pods)${owned(ship.hasTitaniumHull)}${ship.hasAutoRepair && !ship.hasTitaniumHull ? ' \x1b[33m(removes A-R module)\x1b[0m' : ''}
  [6] Trans-Warp Accel.  - 10,000 cr  (+10 drive speed)${owned(ship.hasTransWarpDrive)}
  [7] Astraxial Hull     - 100,000 cr (Conqueror, drives ≥ 25)${owned(ship.isAstraxialHull)}

  [0] Back to Shipyard

\x1b[32m:\x1b[0m${character.currentSystem} Special Equipment:\x1b[32m: Selection:\x1b[0m
> `;

    return { output };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const key = input.trim();

    if (key === '0' || !key) {
      return { output: '\x1b[2J\x1b[H', nextScreen: 'shipyard' };
    }

    const equipmentMap: Record<string, 'CLOAKER' | 'AUTO_REPAIR' | 'STAR_BUSTER' | 'ARCH_ANGEL' | 'TITANIUM_HULL' | 'TRANS_WARP' | 'ASTRAXIAL_HULL'> = {
      '1': 'CLOAKER',
      '2': 'AUTO_REPAIR',
      '3': 'STAR_BUSTER',
      '4': 'ARCH_ANGEL',
      '5': 'TITANIUM_HULL',
      '6': 'TRANS_WARP',
      '7': 'ASTRAXIAL_HULL',
    };

    const equipment = equipmentMap[key];
    if (!equipment) {
      return { output: '\r\n\x1b[31mInvalid selection.\x1b[0m\r\n> ' };
    }

    const result = await purchaseSpecialEquipment(characterId, equipment);

    if (!result.success) {
      return { output: `\r\n\x1b[31m${result.error}\x1b[0m\r\n> ` };
    }

    return {
      output: `\x1b[2J\x1b[H\x1b[32m${equipment.replace(/_/g, ' ')} installed! (-${result.cost} cr)\x1b[0m\r\n`,
      nextScreen: 'shipyard',
    };
  },
};
