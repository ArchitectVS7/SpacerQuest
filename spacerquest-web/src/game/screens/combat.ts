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
import { calculateDefeatConsequences } from '../systems/combat.js';

// ── SP.FIGHT2.S scavx: Malignite weapon enhancement Y/N prompt ───────────────
// After combat victory with x=5 (Beam Intensifier) or x=9 (Defective Power Unit),
// player is prompted "Install even if possibly defective? [Y]/(N)".
// The prompt reveals no information — both cases use the same message.
interface PendingWeaponEnhancement {
  salvageDescription: string;
  salvageAmount: number;
  isDefective: boolean;
  enemyName: string;
  nextScreen: string;
}
const pendingWeaponEnhancement = new Map<string, PendingWeaponEnhancement>();

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

    // ── SP.FIGHT2.S scavx: resolve pending Malignite weapon enhancement Y/N ──
    const pending = pendingWeaponEnhancement.get(characterId);
    if (pending) {
      pendingWeaponEnhancement.delete(characterId);
      let out = '';
      if (key === 'Y' || key === '') {
        // Install: apply weapon strength delta (FIGHT2.S: w1=w1+a or w1=w1-a)
        const delta = pending.isDefective ? -pending.salvageAmount : pending.salvageAmount;
        const ship = await prisma.ship.findFirst({ where: { characterId } });
        if (ship) {
          const newStrength = Math.max(0, Math.min(199, ship.weaponStrength + delta));
          await prisma.ship.update({
            where: { id: ship.id },
            data: { weaponStrength: newStrength },
          });
        }
        // SP.FIGHT2.S line 165: goto scav1 → "a$;'.....found in wreckage of 'p5$"
        out += `Yes\r\n\x1b[32m${pending.salvageDescription}.....found in wreckage of ${pending.enemyName}\x1b[0m\r\n`;
      } else {
        // N: reveal what it was (FIGHT2.S lines 160-161)
        if (pending.isDefective) {
          out += `Smart move!....it was a ${pending.salvageDescription}\r\n`;
        } else {
          out += `Unlucky choice!....it was a ${pending.salvageDescription}\r\n`;
        }
      }
      out += '\r\n\x1b[37;1mPress any key to continue...\x1b[0m';
      return { output: out, nextScreen: pending.nextScreen };
    }

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
        // SP.FIGHT1.S:452 — if kg>qq x=y:goto spgo — max rounds from GameConfig (qq)
        const { getGameConfig } = await import('../systems/game-config.js');
        const gameConfig = await getGameConfig();
        const maxRounds = gameConfig.maxCombatRounds ?? 12;
        if (session.currentRound > maxRounds) {
          // Round limit exceeded — battle ends as a draw ("The Battle is Over!")
          await prisma.combatSession.update({
            where: { id: session.id },
            data: { active: false, result: 'RETREAT' },
          });
          return {
            output: `\r\n\x1b[33mThe Battle is Over! Round limit (${maxRounds}) reached.\x1b[0m\r\n`,
            nextScreen: 'main-menu',
          };
        }

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
            hullStrength: ship.hullStrength, hullCondition: ship.hullCondition,
            hasAutoRepair: ship.hasAutoRepair,
          },
          character.rank,
          character.battlesWon,
          character.tripCount,
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
          ship.roboticsStrength,
          ship.roboticsCondition,
        );

        // SP.FIGHT1.S:308 — x=1:if w1>1 x=(w1/2): fuel consumed per attack round
        // When weaponStrength=1, x stays 1 (not Math.floor(1/2)=0)
        const fuelConsumed = ship.weaponStrength > 1 ? Math.floor(ship.weaponStrength / 2) : 1;
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
          const { calculateSalvage, applySalvage, calculateLoot, applyAutoRepair, applyShieldRecharge } =
            await import('../systems/combat.js');

          // SP.FIGHT2.S:31-40 — post-combat weapon/shield condition recalculation.
          // Original: w2=(x8/w1) where x8=weapon power tracked during combat.
          // In the modern system, component conditions are tracked per-round via
          // applySystemDamage; no additional post-battle decrement is applied here.
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

          // Ship stat updates to accumulate (no baseline weapon decrement)
          const shipUpdates: Record<string, any> = {};
          let salvageCredits = 0;

          if (salvage.component === 'gold') {
            salvageCredits = salvage.amount;
          } else if (!salvage.requiresConfirmation && salvage.component !== 'nothing') {
            const componentUpdates = applySalvage(salvage, ship);
            Object.assign(shipUpdates, componentUpdates);
          }
          // requiresConfirmation (x=5 Beam Intensifier or x=9 Defective Power Unit):
          // SP.FIGHT2.S scavx: player is prompted AFTER other post-battle updates.
          // The weapon strength change is deferred until Y/N response.

          // SP.FIGHT2.S:41-64 — Auto-Repair module (uses extracted pure function)
          const autoRepairMsgs: string[] = [];
          if (ship.hasAutoRepair) {
            const arShip = {
              driveStrength: ship.driveStrength,
              driveCondition: (shipUpdates['driveCondition'] ?? ship.driveCondition) as number,
              cabinStrength: ship.cabinStrength,
              cabinCondition: (shipUpdates['cabinCondition'] ?? ship.cabinCondition) as number,
              lifeSupportStrength: ship.lifeSupportStrength,
              lifeSupportCondition: (shipUpdates['lifeSupportCondition'] ?? ship.lifeSupportCondition) as number,
              weaponStrength: ship.weaponStrength,
              weaponCondition: (shipUpdates['weaponCondition'] ?? ship.weaponCondition) as number,
              navigationStrength: ship.navigationStrength,
              navigationCondition: (shipUpdates['navigationCondition'] ?? ship.navigationCondition) as number,
              roboticsStrength: ship.roboticsStrength,
              roboticsCondition: (shipUpdates['roboticsCondition'] ?? ship.roboticsCondition) as number,
              shieldStrength: ship.shieldStrength,
              shieldCondition: (shipUpdates['shieldCondition'] ?? ship.shieldCondition) as number,
            };
            const ar = applyAutoRepair(arShip);
            Object.assign(shipUpdates, ar.updates);
            autoRepairMsgs.push(...ar.messages);
          }

          // SP.FIGHT2.S:66-75 — Shield recharger (uses extracted pure function)
          const hasShieldRecharger = ship.hullName?.endsWith('*') ?? false;
          const fuelBefore = ship.fuel;
          let fuelNow = fuelBefore;
          let shieldCondNow = (shipUpdates['shieldCondition'] ?? ship.shieldCondition) as number;
          if (hasShieldRecharger) {
            const sr = applyShieldRecharge(ship.shieldStrength, shieldCondNow, fuelNow);
            shieldCondNow = sr.shieldCondition;
            fuelNow = sr.fuel;
            if (fuelNow !== fuelBefore) {
              shipUpdates['shieldCondition'] = shieldCondNow;
              shipUpdates['fuel'] = fuelNow;
            }
          }

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
          if (ship.hasAutoRepair && autoRepairMsgs.length > 0) {
            out += `\x1b[36mA-R Module repairs (+1): ${autoRepairMsgs.join(', ')}\x1b[0m\r\n`;
          }
          if (hasShieldRecharger && fuelNow !== fuelBefore) {
            out += `\x1b[36mShield Recharge: condition ${ship.shieldCondition}→${shieldCondNow}\x1b[0m\r\n`;
          }

          // Display salvage results
          out += `\r\n\x1b[36m...Searching Derelict for Salvage...\x1b[0m\r\n`;

          // Space Patrol (kk=2): dock at HQ for payoff; otherwise main-menu
          const victoryNext = character.missionType === 2 ? 'space-patrol' : 'main-menu';

          if (salvage.requiresConfirmation) {
            // SP.FIGHT2.S scavx lines 158-159: prompt before revealing which one it is
            // Both beam intensifier (x=5) and defective unit (x=9) use the same prompt.
            pendingWeaponEnhancement.set(characterId, {
              salvageDescription: salvage.description,
              salvageAmount: salvage.amount,
              isDefective: salvage.isDefective,
              enemyName,
              nextScreen: victoryNext,
            });
            out += `\x1b[33mYou found a Malignite weapon enhancement.\x1b[0m\r\n`;
            out += `Install even if possibly defective? \x1b[37;1m[Y]\x1b[0m/(N): `;
            return { output: out }; // no nextScreen — wait for Y/N
          }

          if (salvage.component === 'nothing') {
            out += `\x1b[37m...Nothing Useful found in wreckage of ${enemyName}\x1b[0m\r\n`;
          } else if (salvage.component === 'gold') {
            out += `\x1b[33;1m${salvage.description}.....found in wreckage of ${enemyName}\x1b[0m\r\n`;
          } else {
            out += `\x1b[32m${salvage.description}.....found in wreckage of ${enemyName}\x1b[0m\r\n`;
          }

          out += '\r\n\x1b[37;1mPress any key to continue...\x1b[0m';
          return { output: out, nextScreen: victoryNext };
        }

        if (playerDestroyed) {
          await prisma.combatSession.update({
            where: { id: session.id },
            data: { active: false, result: 'DEFEAT' },
          });

          // SP.FIGHT2.S pirwin:195-220 — enemy boards and takes cargo/pods/fuel
          const enemyTypeName = session.enemyType === 'RIM_PIRATE' ? 'Rim Pirate'
            : session.enemyType === 'REPTILOID' ? 'Reptiloid'
            : session.enemyType === 'PATROL' ? 'Guard'
            : 'Pirate';
          const boarding = calculateDefeatConsequences(
            character.cargoPods,
            character.cargoManifest,
            ship.cargoPods,
            ship.fuel,
            enemyTypeName,
          );

          out += `\r\nYour ship is defeated and boarded.\r\n`;
          out += `\x1b[31m${boarding.message}\x1b[0m\r\n`;

          // Space Patrol (kk=2): track per-mission loss, dock at HQ for payoff
          const charDefeatUpdate: Record<string, any> = { battlesLost: { increment: 1 } };
          if (character.missionType === 2) {
            charDefeatUpdate.patrolBattlesLost = { increment: 1 };
          }
          if (boarding.cargoLost) {
            charDefeatUpdate.cargoPods = 0;
            charDefeatUpdate.cargoType = 0;
            charDefeatUpdate.cargoPayment = 0;
            charDefeatUpdate.cargoManifest = null;
          }

          const defeatShipUpdate: Record<string, any> = {};
          if (boarding.storagePodsLost > 0) {
            defeatShipUpdate.cargoPods = Math.max(0, ship.cargoPods - boarding.storagePodsLost);
          }
          if (boarding.fuelLost > 0) {
            defeatShipUpdate.fuel = Math.max(0, ship.fuel - boarding.fuelLost);
          }

          await Promise.all([
            prisma.character.update({ where: { id: characterId }, data: charDefeatUpdate }),
            ...(Object.keys(defeatShipUpdate).length > 0
              ? [prisma.ship.update({ where: { characterId }, data: defeatShipUpdate })]
              : []),
          ]);

          out += `\x1b[31;1mDEFEAT! Your ship has been overwhelmed.\x1b[0m\r\n`;
          out += '\r\n\x1b[37;1mPress any key to continue...\x1b[0m';
          const defeatNext = character.missionType === 2 ? 'space-patrol' : 'main-menu';
          return { output: out, nextScreen: defeatNext };
        }

        out += `  Your attack: \x1b[32m${round.playerDamage || 'glancing'}\x1b[0m  `;
        out += `Enemy attack: \x1b[31m${round.enemyDamage || 'glancing'}\x1b[0m  `;
        out += `Fuel: \x1b[33m${newFuel}\x1b[0m\r\n`;

        // SP.FIGHT1.S speed:/spedo: post-round speed/chase check
        // After each round, if enemy drive > player drive, enemy may get a bonus attack run.
        const { checkEnemySpeedChase } = await import('../systems/combat.js');
        const enemyName = session.enemyName || 'Enemy';
        const speedResult = checkEnemySpeedChase(
          ship.driveStrength,
          ship.driveCondition,
          session.enemyDrivePower,
          9, // enemy drive condition (s4) — full condition from session spawn
          enemy.weaponStrength * enemy.weaponCondition,
          9, // enemy shield condition (y9) — full condition from session spawn
        );

        if (speedResult.enemyChases) {
          // Enemy gets a bonus attack run: "The faster X is making another run"
          out += `\r\n\x1b[31mThe faster ${enemyName} is making another run\x1b[0m\r\n`;

          // Apply the bonus enemy attack (same weapon vs player shields logic)
          const enemyWeaponPowerBonus = enemy.weaponStrength * enemy.weaponCondition;
          const playerShieldPowerNow = ship.shieldStrength * (ship.shieldCondition ?? 9);
          if (enemyWeaponPowerBonus > playerShieldPowerNow) {
            const bonusDamage = enemyWeaponPowerBonus - playerShieldPowerNow;
            const bonusHullDmg = bonusDamage % 10;
            if (bonusHullDmg > 0) {
              const bonusHull = Math.max(0, newPlayerHull - 1);
              await prisma.ship.update({
                where: { characterId },
                data: { hullCondition: bonusHull },
              });
              out += `\x1b[31mBonus run hit! Additional hull damage.\x1b[0m\r\n`;
              if (bonusHull <= 0) {
                await prisma.combatSession.update({
                  where: { id: session.id },
                  data: { active: false, result: 'DEFEAT' },
                });
                const charBonusDefeat: Record<string, any> = { battlesLost: { increment: 1 } };
                if (character.missionType === 2) charBonusDefeat.patrolBattlesLost = { increment: 1 };
                await prisma.character.update({ where: { id: characterId }, data: charBonusDefeat });
                out += `\x1b[31;1mDEFEAT! Your ship has been overwhelmed.\x1b[0m\r\n`;
                out += '\r\n\x1b[37;1mPress any key to continue...\x1b[0m';
                const bonusDefeatNext = character.missionType === 2 ? 'space-patrol' : 'main-menu';
                return { output: out, nextScreen: bonusDefeatNext };
              }
            }
          } else {
            out += `\x1b[32mYour shields deflect the bonus run.\x1b[0m\r\n`;
          }
        } else if (speedResult.enemyRetreats) {
          // Enemy is faster but retreats: "The faster X retreats from conflict"
          out += `\r\n\x1b[32mThe faster ${enemyName} retreats from conflict\x1b[0m\r\n`;
          await prisma.combatSession.update({
            where: { id: session.id },
            data: { active: false, result: 'RETREAT' },
          });
          out += '\r\n\x1b[37;1mPress any key to continue...\x1b[0m';
          return { output: out, nextScreen: 'main-menu' };
        }

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
