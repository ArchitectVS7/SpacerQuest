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

        // SP.FIGHT1.S:310 — f1=(f1-x) where x=w1/2: fuel consumed per attack round
        const fuelConsumed = Math.floor(ship.weaponStrength / 2);
        const newFuel = Math.max(0, ship.fuel - fuelConsumed);

        // SP.FIGHT2.S:106-112 — victory by hull condition reaching 0
        // Track cumulative damage via enemyHullCondition in the session
        const newEnemyHull = Math.max(0, session.enemyHullCondition - (round.playerSystemDamage > 0 ? 1 : 0));
        const newPlayerHull = Math.max(0, ship.hullCondition - (round.enemySystemDamage > 0 ? 1 : 0));

        // Update round counter and enemy hull
        await prisma.combatSession.update({
          where: { id: session.id },
          data: { currentRound: session.currentRound + 1, enemyHullCondition: newEnemyHull },
        });

        // Single ship update: always write fuel, also write hull if player took system damage
        await prisma.ship.update({
          where: { characterId },
          data: {
            fuel: newFuel,
            ...(round.enemySystemDamage > 0 ? { hullCondition: newPlayerHull } : {}),
          },
        });

        let out = `\r\n\x1b[33;1m── Round ${session.currentRound} ──\x1b[0m\r\n`;

        const enemyDestroyed = newEnemyHull <= 0;
        const playerDestroyed = newPlayerHull <= 0;

        if (enemyDestroyed) {
          const { calculateSalvage, applySalvage, calculateLoot } =
            await import('../systems/combat.js');

          // SP.FIGHT2.S:31-40 — w2=(x8/w1): weapon condition recalculated from remaining power.
          const roundsPlayed = session.currentRound;
          const newWeaponCond = Math.max(0, ship.weaponCondition - Math.floor(roundsPlayed / 2));
          await prisma.combatSession.update({
            where: { id: session.id },
            data: { active: false, result: 'VICTORY' },
          });

          // Award bounty (credit loot from safe/boarding)
          const npc = session.npcRosterId
            ? await prisma.npcRoster.findUnique({ where: { id: session.npcRosterId } })
            : null;
          const bounty = npc?.creditValue || 500;
          const newCredits = addCredits(character.creditsHigh, character.creditsLow, bounty);

          // SP.FIGHT2.S:139-193 — salvage wreckage for component upgrades
          const enemyType = (session.enemyType || 'PIRATE') as any;
          const enemyName = session.enemyName || 'Unknown';
          const salvage = calculateSalvage(
            enemyType,
            character.tripCount,
            character.battlesWon,
            enemyName,
            npc?.battlesWon || 3,
          );

          // Apply salvage to ship if it's a non-confirmation component
          const shipUpdates: Record<string, any> = { weaponCondition: newWeaponCond };
          let salvageCredits = 0;

          if (salvage.component === 'gold') {
            salvageCredits = salvage.amount;
          } else if (!salvage.requiresConfirmation && salvage.component !== 'nothing') {
            const componentUpdates = applySalvage(salvage, ship);
            Object.assign(shipUpdates, componentUpdates);
          } else if (salvage.requiresConfirmation && !salvage.isDefective) {
            // Auto-accept beneficial weapon enhancements (beam intensifier)
            // Original has a Y/N prompt; in web version we auto-accept beneficial ones
            const componentUpdates = applySalvage(salvage, ship);
            Object.assign(shipUpdates, componentUpdates);
          }
          // Defective weapons (isDefective=true) are auto-rejected for safety

          const totalCredits = addCredits(newCredits.high, newCredits.low, salvageCredits);

          // Space Patrol mission (kk=2): also increment per-mission wb counter
          const charVictoryUpdate: Record<string, any> = {
            battlesWon: { increment: 1 },
            creditsHigh: totalCredits.high,
            creditsLow: totalCredits.low,
          };
          if (character.missionType === 2) {
            charVictoryUpdate.patrolBattlesWon = { increment: 1 };
          }

          await Promise.all([
            prisma.character.update({
              where: { id: characterId },
              data: charVictoryUpdate,
            }),
            prisma.ship.update({
              where: { characterId },
              data: shipUpdates,
            }),
          ]);

          out += `\x1b[32;1mVICTORY! Enemy destroyed! +${bounty} cr\x1b[0m\r\n`;
          if (newWeaponCond < ship.weaponCondition) {
            out += `\x1b[33mWeapons depleted: condition ${ship.weaponCondition} → ${newWeaponCond}\x1b[0m\r\n`;
          }

          // Display salvage results
          out += `\r\n\x1b[36m...Searching Derelict for Salvage...\x1b[0m\r\n`;
          if (salvage.component === 'nothing') {
            out += `\x1b[37m...Nothing Useful found in wreckage of ${enemyName}\x1b[0m\r\n`;
          } else if (salvage.component === 'gold') {
            out += `\x1b[33;1m${salvage.description}.....found in wreckage of ${enemyName}\x1b[0m\r\n`;
          } else if (salvage.isDefective) {
            out += `\x1b[31mDefective weapon found — discarded for safety.\x1b[0m\r\n`;
          } else {
            out += `\x1b[32m${salvage.description}.....found in wreckage of ${enemyName}\x1b[0m\r\n`;
          }

          out += '\r\n\x1b[37;1mPress any key to continue...\x1b[0m';
          // Space Patrol (kk=2): dock at HQ for payoff; otherwise main-menu
          const victoryNext = character.missionType === 2 ? 'space-patrol' : 'main-menu';
          return { output: out, nextScreen: victoryNext };
        }

        if (playerDestroyed) {
          await prisma.combatSession.update({
            where: { id: session.id },
            data: { active: false, result: 'DEFEAT' },
          });

          // Space Patrol (kk=2): track per-mission loss, dock at HQ for payoff
          const charDefeatUpdate: Record<string, any> = { battlesLost: { increment: 1 } };
          if (character.missionType === 2) {
            charDefeatUpdate.patrolBattlesLost = { increment: 1 };
          }
          await prisma.character.update({
            where: { id: characterId },
            data: charDefeatUpdate,
          });

          out += `\x1b[31;1mDEFEAT! Your ship has been overwhelmed.\x1b[0m\r\n`;
          out += '\r\n\x1b[37;1mPress any key to continue...\x1b[0m';
          const defeatNext = character.missionType === 2 ? 'space-patrol' : 'main-menu';
          return { output: out, nextScreen: defeatNext };
        }

        out += `  Your attack: \x1b[32m${round.playerDamage || 'glancing'}\x1b[0m  `;
        out += `Enemy attack: \x1b[31m${round.enemyDamage || 'glancing'}\x1b[0m  `;
        out += `Fuel: \x1b[33m${newFuel}\x1b[0m\r\n`;
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
        // Full tribute system — 5 paths from SP.FIGHT1.S:222-271
        const { calculateTribute } = await import('../systems/combat.js');

        const totalCredits = character.creditsHigh * 10000 + character.creditsLow;
        const enemyType = (session.enemyType || 'PIRATE') as any;

        const tribute = calculateTribute(
          character.missionType,
          enemyType,
          session.currentRound,
          totalCredits,
          ship.fuel,
          character.cargoPods,
          character.cargoManifest,
          ship.cargoPods,
        );

        // Apply tribute effects
        const charUpdates: Record<string, any> = {};
        const shipUpdates: Record<string, any> = {};

        if (tribute.creditsLost > 0) {
          const { success, high, low } = subtractCredits(
            character.creditsHigh, character.creditsLow, tribute.creditsLost,
          );
          if (success) {
            charUpdates.creditsHigh = high;
            charUpdates.creditsLow = low;
          }
        }

        if (tribute.fuelLost > 0) {
          shipUpdates.fuel = Math.max(0, ship.fuel - tribute.fuelLost);
        }

        if (tribute.cargoLost) {
          charUpdates.cargoPods = 0;
          charUpdates.cargoType = 0;
          charUpdates.cargoPayment = 0;
          charUpdates.cargoManifest = null;
        }

        if (tribute.storagePodsTaken > 0) {
          shipUpdates.cargoPods = Math.max(0, ship.cargoPods - tribute.storagePodsTaken);
        }

        if (tribute.criminalRecord) {
          charUpdates.crimeType = 5; // pp=5 smuggling
          charUpdates.tripCount = character.tripCount + 1;
        }

        // Persist
        const updates: Promise<any>[] = [
          prisma.combatSession.update({
            where: { id: session.id },
            data: { active: false, result: 'SURRENDER' },
          }),
        ];
        if (Object.keys(charUpdates).length > 0) {
          updates.push(prisma.character.update({
            where: { id: characterId },
            data: charUpdates,
          }));
        }
        if (Object.keys(shipUpdates).length > 0) {
          updates.push(prisma.ship.update({
            where: { characterId },
            data: shipUpdates,
          }));
        }
        await Promise.all(updates);

        return {
          output: `\r\n\x1b[33m${tribute.message}\x1b[0m\r\n`,
          nextScreen: tribute.criminalRecord ? 'main-menu' : 'main-menu',
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
