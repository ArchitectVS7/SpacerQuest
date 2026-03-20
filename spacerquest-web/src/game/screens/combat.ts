/**
 * SpacerQuest v4.0 - Combat Screen (SP.FIGHT1.S / SP.FIGHT2.S)
 *
 * Terminal screen for space combat encounters.
 * Reads active CombatSession from DB and processes rounds via game systems.
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { calculateComponentPower } from '../utils.js';
import { subtractCredits, addCredits } from '../utils.js';

export const CombatScreen: ScreenModule = {
  name: 'combat',
  render: async (characterId: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true },
    });

    if (!character || !character.ship) {
      return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    const session = await prisma.combatSession.findFirst({
      where: { characterId, active: true },
    });

    if (!session) {
      return { output: '\x1b[33mNo active combat encounter.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    const ship = character.ship;
    const weaponPower = calculateComponentPower(ship.weaponStrength, ship.weaponCondition);
    const shieldPower = calculateComponentPower(ship.shieldStrength, ship.shieldCondition);

    const output = '\x1b[2J\x1b[H' +
      '\x1b[33;1m  COMBAT SYSTEMS ONLINE\x1b[0m\r\n\r\n' +
      `  Ship: ${character.shipName}  |  Fuel: ${ship.fuel}\r\n` +
      `  Weapons: \x1b[36m${weaponPower}\x1b[0m  Shields: \x1b[36m${shieldPower}\x1b[0m  BF: \x1b[36m${session.playerBattleFactor}\x1b[0m\r\n` +
      `\r\n  Enemy BF: \x1b[31m${session.enemyBattleFactor}\x1b[0m  Round: ${session.currentRound}\r\n\r\n` +
      '  [A]ttack  [R]etreat  [S]urrender' +
      (ship.hasCloaker ? '  [C]loak' : '') +
      '  [Q]uit\r\n> ';

    return { output };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const key = input.trim().toUpperCase();

    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true },
    });

    if (!character || !character.ship) {
      return { output: '\x1b[31mError.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    const session = await prisma.combatSession.findFirst({
      where: { characterId, active: true },
    });

    if (!session) {
      return { output: '\x1b[33mNo active combat.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    const ship = character.ship;

    switch (key) {
      case 'A': {
        const { processCombatRound, calculateBattleFactor } =
          await import('../systems/combat.js');

        const playerBF = calculateBattleFactor(
          {
            weaponStrength: ship.weaponStrength, weaponCondition: ship.weaponCondition,
            shieldStrength: ship.shieldStrength, shieldCondition: ship.shieldCondition,
            cabinStrength: ship.cabinStrength, cabinCondition: ship.cabinCondition,
            roboticsStrength: ship.roboticsStrength, roboticsCondition: ship.roboticsCondition,
            lifeSupportStrength: ship.lifeSupportStrength, lifeSupportCondition: ship.lifeSupportCondition,
            navigationStrength: ship.navigationStrength, navigationCondition: ship.navigationCondition,
            driveStrength: ship.driveStrength, driveCondition: ship.driveCondition,
            hasAutoRepair: ship.hasAutoRepair,
          },
          character.rank,
          character.battlesWon,
        );

        const enemy = {
          weaponStrength: session.enemyWeaponPower,
          weaponCondition: 9,
          shieldStrength: session.enemyShieldPower,
          shieldCondition: 9,
          driveStrength: session.enemyDrivePower,
          driveCondition: 9,
          battleFactor: session.enemyBattleFactor,
          hullCondition: session.enemyHullCondition,
        };

        const round = processCombatRound(
          playerBF,
          ship.weaponStrength, ship.weaponCondition,
          ship.shieldStrength, ship.shieldCondition,
          ship.hasAutoRepair,
          enemy as any,
          session.currentRound,
        );

        // Update round counter
        await prisma.combatSession.update({
          where: { id: session.id },
          data: { currentRound: session.currentRound + 1 },
        });

        let out = `\r\n\x1b[33;1m── Round ${session.currentRound} ──\x1b[0m\r\n`;

        // Check for victory (enemy shields destroyed)
        const enemyDestroyed = round.enemyShieldDamage >= 100;
        const playerDestroyed = round.playerShieldDamage >= 100;

        if (enemyDestroyed) {
          await prisma.combatSession.update({
            where: { id: session.id },
            data: { active: false, result: 'VICTORY' },
          });
          // Award bounty and increment battles won
          const npc = session.npcRosterId
            ? await prisma.npcRoster.findUnique({ where: { id: session.npcRosterId } })
            : null;
          const bounty = npc?.creditValue || 500;
          const newCredits = addCredits(character.creditsHigh, character.creditsLow, bounty);
          await prisma.character.update({
            where: { id: characterId },
            data: {
              battlesWon: { increment: 1 },
              creditsHigh: newCredits.high,
              creditsLow: newCredits.low,
            },
          });

          out += `\x1b[32;1mVICTORY! Enemy destroyed! +${bounty} cr\x1b[0m\r\n`;
          out += '\r\n\x1b[37;1mPress any key to continue...\x1b[0m';
          return { output: out, nextScreen: 'main-menu' };
        }

        if (playerDestroyed) {
          await prisma.combatSession.update({
            where: { id: session.id },
            data: { active: false, result: 'DEFEAT' },
          });
          await prisma.character.update({
            where: { id: characterId },
            data: { battlesLost: { increment: 1 } },
          });

          out += `\x1b[31;1mDEFEAT! Your ship has been overwhelmed.\x1b[0m\r\n`;
          out += '\r\n\x1b[37;1mPress any key to continue...\x1b[0m';
          return { output: out, nextScreen: 'main-menu' };
        }

        out += `  Your attack: \x1b[32m${round.playerDamage || 'glancing'}\x1b[0m  `;
        out += `Enemy attack: \x1b[31m${round.enemyDamage || 'glancing'}\x1b[0m\r\n`;
        out += '\r\n  [A]ttack  [R]etreat  [S]urrender  [Q]uit\r\n> ';
        return { output: out };
      }

      case 'R': {
        const { attemptRetreat } = await import('../systems/combat.js');
        const retreat = attemptRetreat(
          (ship.driveStrength + (ship.hasTransWarpDrive ? 10 : 0)) * ship.driveCondition,
          session.enemyDrivePower * 9,
          ship.hasCloaker,
        );

        if (retreat.success) {
          await prisma.combatSession.update({
            where: { id: session.id },
            data: { active: false, result: 'RETREAT' },
          });
          return {
            output: `\r\n\x1b[32m${retreat.message}\x1b[0m\r\n`,
            nextScreen: 'main-menu',
          };
        }
        return {
          output: `\r\n\x1b[31m${retreat.message}\x1b[0m\r\n  [A]ttack  [R]etreat  [S]urrender  [Q]uit\r\n> `,
        };
      }

      case 'S': {
        const tribute = Math.min(session.currentRound * 1000, 20000);
        const { success, high, low } = subtractCredits(
          character.creditsHigh, character.creditsLow, tribute,
        );
        if (success) {
          await prisma.character.update({
            where: { id: characterId },
            data: { creditsHigh: high, creditsLow: low },
          });
        }
        await prisma.combatSession.update({
          where: { id: session.id },
          data: { active: false, result: 'SURRENDER' },
        });
        return {
          output: `\r\n\x1b[33mYou surrender and pay ${tribute} cr tribute.\x1b[0m\r\n`,
          nextScreen: 'main-menu',
        };
      }

      case 'C': {
        if (ship.hasCloaker) {
          await prisma.combatSession.update({
            where: { id: session.id },
            data: { active: false, result: 'RETREAT' },
          });
          return {
            output: '\r\n\x1b[36mCloaker activated! You vanish from sensors.\x1b[0m\r\n',
            nextScreen: 'main-menu',
          };
        }
        return { output: '\r\n\x1b[31mNo cloaking device installed.\x1b[0m\r\n> ' };
      }

      case 'Q':
      case 'M':
        // Leaving combat without resolving — treat as surrender
        await prisma.combatSession.update({
          where: { id: session.id },
          data: { active: false, result: 'SURRENDER' },
        });
        return { output: '\x1b[2J\x1b[H', nextScreen: 'main-menu' };

      default:
        return { output: '\r\n\x1b[31mInvalid. Press A, R, S, or Q.\x1b[0m\r\n> ' };
    }
  },
};
