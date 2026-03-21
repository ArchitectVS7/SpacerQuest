/**
 * SpacerQuest v4.0 - Docking System (SP.DOCK1.S + SP.DOCK2.S)
 *
 * Handles arrival at star systems including raid completion, MALIGNA quest,
 * and rim port arrival effects.
 *
 * Original sources: SP.DOCK1.S, SP.DOCK2.S
 */

import { AllianceType, Rank } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { addCredits } from '../utils.js';
import { simulateMalignaBattle, MalignaMissionType } from './maligna-battle.js';
import { NEMESIS_REWARD_CREDITS } from '../constants.js';

/**
 * Process ship arrival at a star system.
 *
 * Covers SP.DOCK1.S arrival logic (core systems 1-14, special systems 27-28)
 * and SP.DOCK2.S rim arrival logic (systems 15-20).
 */
export async function processDocking(characterId: string, systemId: number) {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { ship: true },
  });
  if (!character) return { success: false, error: 'Character not found' };

  const messages: string[] = [];

  // Log docking event
  await prisma.gameLog.create({
    data: {
      type: 'SYSTEM',
      characterId,
      systemId,
      message: `${character.name} docked at system ${systemId}`,
      metadata: { event: 'DOCK', systemId },
    },
  });

  // ── MALIGNA quest (SP.MAL.S kk=3) — battle then reward ───────────────
  // missionType=3, destination=27 → run SP.MAL battle before awarding
  if (systemId === 27 && character.missionType === 3 && character.ship) {
    const battleResult = await runSpecialMissionBattle(characterId, character, 3 as MalignaMissionType, 1);
    if (!battleResult.playerWon) {
      return { success: true, message: battleResult.message, battleLost: true };
    }
    // mallosex rewards + Maligna-specific bonus (SP.MAL.S line 319 + DOCK1.S:103-110)
    const { high, low } = addCredits(character.creditsHigh, character.creditsLow, 100000);
    await prisma.character.update({
      where: { id: characterId },
      data: {
        score: character.score + 105,  // s2+q6+5 (q6=0 for Maligna) + 100 Maligna bonus
        creditsHigh: high,
        creditsLow: low,
        currentSystem: 14,
        missionType: 0,
        cargoManifest: null,
        destination: 0,
        cargoPods: 0,
        cargoType: 0,
        tripsCompleted: character.tripsCompleted + 1,
        tripCount: 0,
        astrecsTraveled: (character.astrecsTraveled + 10) > 29999 ? 0 : character.astrecsTraveled + 10,
      },
    });
    await prisma.gameLog.create({
      data: {
        type: 'MISSION',
        characterId,
        message: `${character.name} Ablated Star MALIGNA`,
        metadata: { event: 'MALIGNA_COMPLETE' },
      },
    });
    messages.push(
      `${battleResult.message}\r\n` +
      'You have performed a most heroic and courageous feat\r\n' +
      'Ablation of the rogue star will save us all for a time\r\n' +
      '+105 score points and 100,000 cr awarded.\r\n' +
      'Your ship has been transported to Vega-6.'
    );
    return { success: true, message: messages.join('\r\n'), malignaCompleted: true };
  }

  // ── NEMESIS quest (SP.MAL.S kk=9 + SP.TOP.S gems) — battle then reward ──
  // missionType=9, destination=28
  if (systemId === 28 && character.missionType === 9 && character.ship) {
    const battleResult = await runSpecialMissionBattle(characterId, character, 9 as MalignaMissionType, 1);
    if (!battleResult.playerWon) {
      return { success: true, message: battleResult.message, battleLost: true };
    }

    // mallosex rewards (SP.MAL.S lines 316-321):
    //   sc=(sc+1): promotions+1
    //   j1=(j1+10): astrecs+10
    //   u1=(u1+1): trips+1
    //   z1=0: tripCount=0
    //   s2=(s2+q6+5): score += 20+5 = 25 (q6=20 for Nemesis, set at SP.TOP.S:148 / SP.MAL.S:403)
    //   e1=(e1+1): battlesWon+1 (SP.MAL.S:307)
    await prisma.character.update({
      where: { id: characterId },
      data: {
        score: character.score + 25,   // s2+q6+5 where q6=20 (SP.MAL.S:319, SP.TOP.S:148)
        battlesWon: character.battlesWon + 1,
        promotions: character.promotions + 1,
        tripsCompleted: character.tripsCompleted + 1,
        tripCount: 0,
        astrecsTraveled: (character.astrecsTraveled + 10) > 29999 ? 0 : character.astrecsTraveled + 10,
        missionType: 0,
        destination: 0,
        cargoManifest: null,
      },
    });

    // gems rewards (SP.TOP.S lines 169-172):
    //   g1=g1+15 → credits += 150,000
    //   l1=l1+50: life support strength +50
    //   l2=9: life support condition = 9
    //   p1=25, p2=9: shield strength=25, condition=9
    //   w1=25, w2=2: weapon strength=25, condition=2
    //   w1$="STAR-BUSTER++", p1$="ARCH-ANGEL++", l1$="LSS Chrysalis+*"
    const { high, low } = addCredits(character.creditsHigh, character.creditsLow, NEMESIS_REWARD_CREDITS);
    const ship = character.ship;
    await prisma.ship.update({
      where: { characterId },
      data: {
        lifeSupportStrength: ship.lifeSupportStrength + 50,
        lifeSupportCondition: 9,
        shieldStrength: 25,
        shieldCondition: 9,
        weaponStrength: 25,
        weaponCondition: 2,
        hasStarBuster: true,   // w1$="STAR-BUSTER++"
        hasArchAngel: true,    // p1$="ARCH-ANGEL++"
      },
    });
    await prisma.character.update({
      where: { id: characterId },
      data: {
        creditsHigh: high,
        creditsLow: low,
      },
    });

    await prisma.gameLog.create({
      data: {
        type: 'MISSION',
        characterId,
        message: `${character.name} Conquered Nemesian Forces and returned with the Star Jewels`,
        metadata: { event: 'NEMESIS_COMPLETE', reward: NEMESIS_REWARD_CREDITS },
      },
    });
    messages.push(
      `${battleResult.message}\r\n` +
      `You have beaten the Nemesian Forces!\r\n` +
      `+25 score points awarded.\r\n` +
      `The Nemesian Star Jewels have altered your weaponry, shields, and life support!\r\n` +
      `150,000 cr honorarium awarded by the Space Authority.`
    );
    return { success: true, message: messages.join('\r\n'), nemesisCompleted: true };
  }

  // ── Raid completion (SP.DOCK1.S:129-135 + SP.MAL.S kk=4) ─────────────
  // missionType=4 = alliance raid; battle runs before conquest is granted
  if (character.missionType === 4 && character.destination === systemId && character.ship) {
    const targetSystem = await prisma.starSystem.findUnique({ where: { id: systemId } });
    const defconLevel = (await prisma.allianceSystem.findUnique({ where: { systemId } }))?.defconLevel ?? 1;

    const battleResult = await runSpecialMissionBattle(characterId, character, 4 as MalignaMissionType, defconLevel);
    if (!battleResult.playerWon) {
      // mquit-style abort if battle lost
      await prisma.character.update({
        where: { id: characterId },
        data: { missionType: 0, cargoManifest: null, destination: 0, cargoPods: 0, cargoType: 0 },
      });
      return { success: true, message: battleResult.message, battleLost: true };
    }
    const raidResult = await completeRaid(characterId, character, systemId);
    if (raidResult) {
      return { success: true, message: `${battleResult.message}\r\n${raidResult.message}`, raidCompleted: true };
    }
    void targetSystem; // referenced in completeRaid
  }

  // ── Free-bribe launch clearance (SP.DOCK1.S: if q2$="0" q5=0:q1=0:goto arriv3) ──
  // After a bribed free launch, destination=0 means no delivery obligation — clear cargo, no payment.
  if (character.missionType === 1 && character.destination === 0 && character.cargoPods > 0) {
    await prisma.character.update({
      where: { id: characterId },
      data: { missionType: 0, cargoPods: 0, cargoType: 0, cargoManifest: null, destination: 0, cargoPayment: 0 },
    });
  }

  // ── Rim port arrival effects (SP.DOCK2.S:47-67) ───────────────────────
  // Systems 15-20 are rim star ports with extra arrival penalties.
  if (systemId >= 15 && systemId <= 20 && character.ship) {
    const ship = character.ship;
    const shipUpdates: Record<string, number> = {};
    const charUpdates: Record<string, number> = {};

    // Fuel consumption on docking (SP.DOCK2.S:47-51):
    //   if n1>60 goto rimf (skip)
    //   x=61-n1: f1=f1-x (consume fuel based on nav weakness)
    if (ship.navigationStrength <= 60) {
      const fuelConsumed = 61 - ship.navigationStrength;
      const newFuel = Math.max(0, ship.fuel - fuelConsumed);
      shipUpdates.fuel = newFuel;
      messages.push(`Excessive orbiting maneuvers consume ${fuelConsumed} fuel units.`);
    }

    // Hull damage from excessive docking (SP.DOCK2.S:53-59):
    //   if z1<4 goto rmmm (skip)
    //   h2=h2-(z1-3): if h2<1 h2=0:h1=0
    if (character.tripCount >= 4) {
      const damage = character.tripCount - 3;
      const newHullCond = Math.max(0, ship.hullCondition - damage);
      shipUpdates.hullCondition = newHullCond;
      if (newHullCond < 1) {
        shipUpdates.hullStrength = 0;
      }
      messages.push(`Hull damaged -${damage} during docking procedure due to fatigue.`);
    }

    // Airlock damage (SP.DOCK2.S:61-67):
    //   if (w1+p1)<60 and l1$ not destroyed:
    //   x=1: if z1>2 x=(z1-2)
    //   l1=(l1-x): if l1<1 l1=0:l2=0
    const combinedWeaponShield = ship.weaponStrength + ship.shieldStrength;
    if (combinedWeaponShield < 60 && ship.lifeSupportCondition > 0) {
      const x = character.tripCount > 2 ? character.tripCount - 2 : 1;
      const newLSCond = Math.max(0, ship.lifeSupportCondition - x);
      shipUpdates.lifeSupportCondition = newLSCond;
      if (newLSCond < 1) {
        shipUpdates.lifeSupportStrength = 0;
      }
      messages.push(`Life support damaged -${x} due to improper air-lock connection.`);
    }

    if (Object.keys(shipUpdates).length > 0) {
      await prisma.ship.update({
        where: { id: ship.id },
        data: shipUpdates,
      });
    }
    if (Object.keys(charUpdates).length > 0) {
      await prisma.character.update({
        where: { id: characterId },
        data: charUpdates,
      });
    }
  }

  const msg = messages.length > 0 ? messages.join('\r\n') : `Docked at System ${systemId}`;
  return { success: true, message: msg };
}

/**
 * Run the SP.MAL battle simulation and apply results to the DB.
 * Returns { playerWon, message } for the caller to use.
 *
 * On loss (malwin): SP.MAL.S lines 337-343 — all ship stats zeroed,
 *   battlesLost+1, score-10, rank reset to 3.
 * On win: ship condition fields updated from battle result.
 */
async function runSpecialMissionBattle(
  characterId: string,
  character: {
    id: string;
    name: string;
    score: number;
    battlesLost: number;
    battlesWon: number;
    tripsCompleted: number;
    tripCount: number;
    astrecsTraveled: number;
    ship: {
      id: string;
      weaponStrength: number; weaponCondition: number;
      shieldStrength: number; shieldCondition: number;
      hasStarBuster: boolean; hasArchAngel: boolean;
      fuel: number; lifeSupportCondition: number;
      cargoPods: number; driveCondition: number;
      cabinCondition: number; navigationCondition: number;
      roboticsCondition: number; hullCondition: number;
    } | null;
  },
  missionType: MalignaMissionType,
  defconLevel: number,
): Promise<{ playerWon: boolean; message: string }> {
  if (!character.ship) {
    return { playerWon: false, message: 'No ship data available for battle.' };
  }
  const ship = character.ship;

  const result = simulateMalignaBattle(
    missionType,
    defconLevel,
    {
      weaponStrength: ship.weaponStrength,
      weaponCondition: ship.weaponCondition,
      shieldStrength: ship.shieldStrength,
      shieldCondition: ship.shieldCondition,
      hasStarBuster: ship.hasStarBuster,
      hasArchAngel: ship.hasArchAngel,
      fuel: ship.fuel,
      lifeSupportCond: ship.lifeSupportCondition,
      cargoPods: ship.cargoPods,
      driveCondition: ship.driveCondition,
      cabinCondition: ship.cabinCondition,
      navigationCondition: ship.navigationCondition,
      roboticsCondition: ship.roboticsCondition,
      hullCondition: ship.hullCondition,
    },
  );

  if (result.playerLost) {
    // SP.MAL.S malwin lines 337-343: all stats zeroed, battlesLost+1, score-10
    const newScore = Math.max(0, character.score - 10);
    await prisma.$transaction([
      prisma.ship.update({
        where: { id: ship.id },
        data: {
          hullStrength: 0, hullCondition: 0,
          driveStrength: 0, driveCondition: 0,
          cabinStrength: 0, cabinCondition: 0,
          lifeSupportStrength: 0, lifeSupportCondition: 0,
          weaponStrength: 0, weaponCondition: 0,
          navigationStrength: 0, navigationCondition: 0,
          roboticsStrength: 0, roboticsCondition: 0,
          shieldStrength: 0, shieldCondition: 0,
          fuel: 0, cargoPods: 0,
        },
      }),
      prisma.character.update({
        where: { id: characterId },
        data: {
          score: newScore,
          battlesLost: character.battlesLost + 1,
          rank: Rank.COMMODORE,   // pp=3: rank reset per SP.MAL.S line 343
          missionType: 0, cargoManifest: null, destination: 0, cargoPods: 0, cargoType: 0,
        },
      }),
    ]);
    return {
      playerWon: false,
      message: result.log.slice(-5).join('\r\n'),
    };
  }

  // Player won — update ship conditions from battle result (mallosex: l2>=1, h2>=1, d2>=1 ensured)
  await prisma.ship.update({
    where: { id: ship.id },
    data: {
      fuel: result.fuelRemaining,
      lifeSupportCondition: Math.max(1, result.lifeSupportCond),
      cargoPods: result.cargoPods,
      driveCondition: Math.max(1, result.driveCondition),
      cabinCondition: result.cabinCondition,
      navigationCondition: result.navigationCondition,
      roboticsCondition: result.roboticsCondition,
      hullCondition: Math.max(1, result.hullCondition),
      weaponCondition: result.finalWeaponCondition,
      shieldCondition: result.finalShieldCondition,
    },
  });

  return {
    playerWon: true,
    message: result.log.slice(-5).join('\r\n'),
  };
}

/**
 * Complete an alliance raid on arrival at target system.
 *
 * Original SP.DOCK1.S:129-135:
 *   if pz$<>"Guard" pz$="":return
 *   print "The Armed Take-Over of "q4$" is successful!"
 *   print "Here are the legal documents to activate new ownership"
 *   print "Please take them immediately to Alliance Investment Ltd"
 *   pz$=q4$:s2=s2+5:z1=3
 *
 * The original required a "Guard" check (pz$) for the raid to succeed.
 * In v4.0, we check alliance membership and apply the takeover directly
 * since the Investment Center document-registration step is simplified.
 * z1=3 maps to tripCount=3 (trip counter maxed after raid).
 */
async function completeRaid(
  characterId: string,
  character: { name: string; allianceSymbol: AllianceType; score: number; missionType: number },
  systemId: number
) {
  const targetSystem = await prisma.starSystem.findUnique({
    where: { id: systemId },
  });

  if (!targetSystem) return null;

  const allianceSystem = await prisma.allianceSystem.findUnique({
    where: { systemId },
  });

  // Must be an enemy-controlled system
  if (!allianceSystem || allianceSystem.alliance === character.allianceSymbol) {
    // Raid fails — system no longer enemy-controlled
    await prisma.character.update({
      where: { id: characterId },
      data: { missionType: 0, cargoManifest: null, destination: 0, cargoPods: 0, cargoType: 0 },
    });
    return { message: `Raid on ${targetSystem.name} failed — target is no longer enemy-controlled.` };
  }

  const previousAlliance = allianceSystem.alliance;

  // Transfer system ownership — original: pz$=q4$ then register at Investment Center
  // Simplified: apply takeover directly, set DEFCON to 1
  // z1=3 → tripCount=3 (original line 134: trip counter set to 3 after raid)
  await prisma.$transaction([
    prisma.allianceSystem.update({
      where: { systemId },
      data: {
        alliance: character.allianceSymbol,
        ownerCharacterId: characterId,
        defconLevel: 1,
        lastTakeoverAttempt: new Date(),
      },
    }),
    // Award score: original s2=s2+5; set tripCount=3 (original z1=3)
    prisma.character.update({
      where: { id: characterId },
      data: {
        score: character.score + 5,
        tripCount: 3,
        missionType: 0,
        cargoManifest: null,
        destination: 0,
        cargoPods: 0,
        cargoType: 0,
      },
    }),
    // Log the raid takeover (generates news entry per SP.VEST.S:187)
    prisma.gameLog.create({
      data: {
        type: 'ALLIANCE',
        characterId,
        systemId,
        message: `: [${character.allianceSymbol}] - Take-Over ${targetSystem.name} from ${previousAlliance} by ${character.name}`,
        metadata: {
          event: 'RAID_TAKEOVER',
          systemId,
          systemName: targetSystem.name,
          newAlliance: character.allianceSymbol,
          previousAlliance,
        },
      },
    }),
  ]);

  return {
    message:
      `The Armed Take-Over of ${targetSystem.name} is successful!\r\n` +
      `Here are the legal documents to activate new ownership\r\n` +
      `The ${character.allianceSymbol} now controls ${targetSystem.name}!\r\n` +
      `+5 score points awarded.`,
  };
}
