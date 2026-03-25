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
import { checkPortEviction } from './economy.js';

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
  // varfix tracks whether u1=u1+1 (tripsCompleted) has been applied this docking
  let varfixDone = false;

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
    // Note: astrecsTraveled already incremented by completeTravel, so just add +10 bonus here
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
        astrecsTraveled: (character.astrecsTraveled + 10) > 29999 ? 0 : character.astrecsTraveled + 10,  // SP.MAL.S:317 bonus
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

  // ── NEMESIS quest (SP.MAL.S kk=9 + SP.TOP.S gems) — battle then lattice puzzle ──
  // missionType=9, destination=28
  // SP.MAL.S:307 e1+1 on victory; then goto nemgem for the crystal lattice puzzle
  if (systemId === 28 && character.missionType === 9 && character.ship) {
    const battleResult = await runSpecialMissionBattle(characterId, character, 9 as MalignaMissionType, 1);
    if (!battleResult.playerWon) {
      return { success: true, message: battleResult.message, battleLost: true };
    }

    // SP.MAL.S:307: e1=(e1+1) — battlesWon increment happens on victory, before nemgem
    // pendingLattice=true routes client to nemesis-lattice screen (SP.MAL.S nemgem subroutine)
    // Rewards (mallosex + gems) are NOT awarded here — they are awarded by the lattice screen on success
    await prisma.character.update({
      where: { id: characterId },
      data: {
        battlesWon: character.battlesWon + 1,
        pendingLattice: true,
      },
    });

    messages.push(
      `${battleResult.message}\r\n` +
      `You have beaten the Nemesian Forces!\r\n` +
      `You approach the glowing crystal lattice...`
    );
    return { success: true, message: messages.join('\r\n'), pendingLattice: true };
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

  // ── Raid manifest burn (SP.DOCK1.S:60) ────────────────────────────────────
  // if right$(q2$,4)="Raid" → player carrying raid documents, burn them on any arrival
  if (character.missionType === 1 && character.cargoManifest?.endsWith('Raid')) {
    await prisma.character.update({
      where: { id: characterId },
      data: { missionType: 0, cargoPods: 0, cargoType: 0, cargoManifest: null, destination: 0, cargoPayment: 0 },
    });
    messages.push('Luckily you burned the plans');
    // Cargo cleared — fall through to rest of docking (rim effects, etc.)
    // Re-fetch is not needed: subsequent cargo checks will not fire (cargoPods already cleared in DB)
    return { success: true, message: messages.join('\r\n') };
  }

  // ── Mark VIII Teleportation for wrong-port delivery (SP.DOCK1.S:75-87) ──
  // If player has cargo (q1>0) but is at wrong destination (q9$<>q4$), teleport to correct port.
  // Andromeda cargo (cargoManifest='X') is always deliverable at current port — skip teleport.
  // Cargo pods and fuel are emptied, ship appears at correct destination launch bays.
  // missionType=1: bribed cargo; missionType=3: regular cargo from Traders (SP.CARGO.S:104 kk=3)
  if ((character.missionType === 1 || character.missionType === 3) && character.cargoPods > 0 && character.destination > 0
      && character.destination !== systemId && character.cargoManifest !== 'X') {
    const targetSystem = await prisma.starSystem.findUnique({ where: { id: character.destination } });
    if (targetSystem) {
      // SP.DOCK1.S:84-87 — clear cargo, fuel, and teleport
      await prisma.$transaction([
        prisma.ship.update({
          where: { id: character.ship!.id },
          data: { fuel: 0, cargoPods: 0 },
        }),
        prisma.character.update({
          where: { id: characterId },
          data: {
            currentSystem: character.destination,
            missionType: 0,
            cargoPods: 0,
            cargoType: 0,
            cargoPayment: 0,
            cargoManifest: null,
            destination: 0,
            // SP.DOCK1.S:63 — s2=s2-5: score penalty for wrong-port delivery
            score: Math.max(0, character.score - 5),
          },
        }),
        prisma.gameLog.create({
          data: {
            type: 'SYSTEM',
            characterId,
            systemId: character.destination,
            message: `${character.name} used Mark VIII transporter to ${targetSystem.name}`,
            metadata: { event: 'MARK_VIII_TELEPORT', fromSystem: systemId, toSystem: character.destination },
          },
        }),
      ]);
      messages.push(
        `Your port of entry should have been ${targetSystem.name}`,
        `Your ship will be transported to ${targetSystem.name} immediately!`,
        `Cargo pods and fuel tanks are emptied to decrease`,
        `The ${character.shipName || 'ship'}'s mass for the Mark VIII transporter`,
        `....ZZZZZZZZAAAAAAAAAAAAAPPPPPPPPPP!!!!`,
        `Your ship ${character.shipName || ''} is suddenly in the ${targetSystem.name} launch bays`
      );
      // Return early with teleport message — docking complete at new location
      return { success: true, message: messages.join('\r\n'), teleported: true, teleportedTo: character.destination };
    }
  }

  // ── Correct port delivery (SP.DOCK1.S:64-76, varfix) ─────────────────────
  // Fires when player has cargo and is at the correct destination, OR has Andromeda cargo,
  // OR has a bribed manifest (left$(q9$,2)="=-" → SP.DOCK1.S:34 auto-match any port).
  // SP.DOCK1.S:57 — Andromeda (q3$="X"): q9$=q4$ sets destination = current port (always matches).
  // SP.DOCK1.S:69-70 — Andromeda payment: q5=(min(q5,70)*300)+(q4*500); where q5=distance, q4=systemId.
  // SP.DOCK1.S:34 — Bribed manifest "=-Space-=": left$(q9$,2)="=-" → q9$=q4$ (any port OK, no payment).
  // SP.LIFT.S:107 — Bribed launch: q6=20 stored in cargoPayment for arriv3/varfix scoring.
  // Regular cargo: cargoPayment is the computed payment stored at contract acceptance.
  // missionType=1: bribed cargo; missionType=3: regular cargo from Traders (SP.CARGO.S:104 kk=3)
  const isBribedManifest = character.cargoManifest?.startsWith('=-') ?? false;
  if ((character.missionType === 1 || character.missionType === 3) && character.cargoPods > 0 && character.cargoManifest
      && (character.destination === systemId || character.cargoManifest === 'X' || isBribedManifest)) {
    const isAndromeda = character.cargoManifest === 'X';
    let payment: number;
    // q6 = distance for varfix scoring: bribed=20 (stored in cargoPayment), Andromeda=not used, regular=TBD
    const q6ForScoring = isBribedManifest ? character.cargoPayment : 0;

    if (isAndromeda) {
      // SP.DOCK1.S:69: if (q3$="X") and (q5>69) q5=70; then q5=(q5*300)+(q4*500)
      // cargoPayment stores the distance (q5 set at black hole loading)
      const cappedDist = Math.min(character.cargoPayment, 70);
      payment = cappedDist * 300 + systemId * 500;
    } else if (isBribedManifest) {
      // SP.DOCK1.S:arrv line: if q2$="0" q5=0:q1=0:goto arriv3 — no payment for bribed
      payment = 0;
    } else {
      // Regular: cargoPayment was computed at contract time (upod-scaled payment)
      payment = character.cargoPayment;
    }

    // SP.DOCK1.S:arriv3: y=2:gosub varfix — score += wb + q6 + 2 - lb (wb/lb=0 for cargo trips)
    const newScore = Math.max(0, character.score + q6ForScoring + 2);

    const { high, low } = addCredits(character.creditsHigh, character.creditsLow, payment);
    // SP.DOCK1.S varfix: k1=k1+q1:if (k1>29999):k1=0 — track cargo pods delivered
    const newCargoDelivered = (character.cargoDelivered + character.cargoPods) > 29999
      ? 0
      : character.cargoDelivered + character.cargoPods;
    await prisma.character.update({
      where: { id: characterId },
      data: {
        creditsHigh: high,
        creditsLow: low,
        score: newScore,
        cargoDelivered: newCargoDelivered,
        missionType: 0,
        cargoPods: 0,
        cargoType: 0,
        cargoManifest: null,
        destination: 0,
        cargoPayment: 0,
        manifestBoard: null,
        manifestDate: null,
        // SP.DOCK1.S:arriv3/varfix: u1=u1+1
        tripsCompleted: { increment: 1 },
      },
    });
    varfixDone = true;
    if (!isBribedManifest) {
      messages.push(
        `For delivery of ${character.cargoPods} pods of ${character.cargoManifest}\r\n` +
        `Payment of ${payment.toLocaleString()} cr will be credited to your account.\r\n` +
        "It's always a pleasure doing business with you."
      );
    } else {
      messages.push("Forged manifest accepted. No payment.");
    }
  }

  // ── Rim port arrival effects (SP.DOCK2.S:47-72) ──────────────────────
  // Systems 15-20 are rim star ports with extra arrival penalties + score bonus.
  if (systemId >= 15 && systemId <= 20 && character.ship) {
    const ship = character.ship;
    const shipUpdates: Record<string, number> = {};
    const charUpdates: Record<string, number> = {};

    // SP.DOCK2.S:70-72: y=4; if q3$="X" y=8; gosub varfix → s2=(s2+y)
    // Andromeda mission cargo (cargoManifest='X') doubles the rim arrival score bonus.
    const rimScoreBonus = character.cargoManifest === 'X' ? 8 : 4;
    charUpdates.score = character.score + rimScoreBonus;

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
    //   if (w1+p1)<60 goto rid (SKIP — damage only fires when >=60)
    //   if (mq$="LSS C") or (l1$=jk$) goto rid (SKIP — Chrysalis immune, or already junk)
    //   x=1: if z1>2 x=(z1-2)
    //   l1=(l1-x): if l1<1 l1=0:l2=0
    const combinedWeaponShield = ship.weaponStrength + ship.shieldStrength;
    const isLSSChrysalis = ship.lifeSupportName?.startsWith('LSS C') ?? false;
    if (combinedWeaponShield >= 60 && !isLSSChrysalis && ship.lifeSupportCondition > 0) {
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

  // ── SP.LIFT.S fueler subroutine (lines 213-229): Port eviction check ─────
  // Runs once per docking (fp flag in original = per-visit, we run at arrival).
  // Only applies to core systems (1-14) that can have owned ports.
  if (systemId >= 1 && systemId <= 14) {
    const port = await prisma.portOwnership.findUnique({ where: { systemId } });
    if (port) {
      const freshChar = await prisma.character.findUnique({ where: { id: characterId } });
      const ownerChar = await prisma.character.findUnique({ where: { id: port.characterId } });
      if (freshChar && ownerChar) {
        const evictionResult = checkPortEviction(
          port.fuelStored,
          port.bankCreditsHigh,
          ownerChar.name,
          freshChar.name,
        );
        if (evictionResult.shouldAutoBuy) {
          // SP.LIFT.S faut: m9=m9+1000:m7=m7-2 — auto-buy 1000 fuel, deduct 2 high cr
          await prisma.portOwnership.update({
            where: { id: port.id },
            data: {
              fuelStored: port.fuelStored + 1000,
              bankCreditsHigh: port.bankCreditsHigh - 2,
            },
          });
          messages.push(evictionResult.autoBuyMessage);
        } else if (evictionResult.shouldEvict) {
          // SP.LIFT.S fneg: gosub evict — clear owner, reset defaults m5=5:m9=3000
          await prisma.$transaction([
            prisma.portOwnership.delete({ where: { id: port.id } }),
            prisma.starSystem.update({ where: { id: systemId }, data: { portOwner: null } }),
          ]);
          messages.push(evictionResult.evictMessage);
        }
      }
    }
  }

  // ── Andromeda arrival score bonus (SP.BLACK.S:98: y=10:gosub varfix) ────
  // varfix: s2=(s2+wb+q6+y)-lb where q6=10 (set at SP.BLACK.S:87) and y=10.
  // Total score gain = q6(10) + y(10) = +20. wb=lb=0 for transit (no patrol/cargo bonuses).
  if (systemId >= 21 && systemId <= 26 && character.missionType === 10) {
    const freshChar = await prisma.character.findUnique({ where: { id: characterId }, select: { score: true } });
    await prisma.character.update({
      where: { id: characterId },
      data: { score: (freshChar?.score ?? character.score) + 20 },
    });
  }

  // SP.DOCK1.S:arriv3/varfix: u1=u1+1 — fires for all dockings that didn't already call varfix
  // (cargo delivery path sets varfixDone=true above; wrong-port teleport returns early without varfix)
  if (!varfixDone) {
    await prisma.character.update({
      where: { id: characterId },
      data: { tripsCompleted: { increment: 1 } },
    });
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
      hasWeaponMark: boolean;
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
      hasWeaponMark: ship.hasWeaponMark,  // SP.MAL.S line 83: +150 k8 bonus
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
    // Also clear hasWeaponMark since weapon is destroyed (ship total loss)
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
          hasWeaponMark: false, hasStarBuster: false, hasArchAngel: false,
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
  // SP.MAL.S linkup (lines 407-409): alien weapon enhancement vaporizes on mission exit
  //   if left$(w1$,3)="?ST" w1$=sb$:w1=w1-5   → "?STAR-BUSTER": -5 strength, revert to STAR-BUSTER
  //   if left$(w1$,1)="?" w1=0:w2=0:w1$=jk$    → other alien-enhanced: weapon destroyed
  const shipData: Record<string, unknown> = {
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
  };
  let alienWeaponMsg = '';
  if (ship.hasWeaponMark) {
    if (ship.hasStarBuster) {
      // "?STAR-BUSTER": revert to STAR-BUSTER (-5 str), left$(w1$,3)="?ST"
      shipData.weaponStrength = Math.max(1, ship.weaponStrength - 5);
      shipData.hasWeaponMark = false;
      alienWeaponMsg = `\r\nAlien weapon enhancement vaporizes causing damage -5 to STAR-BUSTER`;
    } else {
      // other alien-enhanced weapon: completely destroyed → JUNK
      shipData.weaponStrength = 0;
      shipData.weaponCondition = 0;
      shipData.hasWeaponMark = false;
      shipData.hasArchAngel = false;
      alienWeaponMsg = `\r\nYour weapon fuses into JUNK`;
    }
  }
  await prisma.ship.update({
    where: { id: ship.id },
    data: shipData,
  });

  return {
    playerWon: true,
    message: result.log.slice(-5).join('\r\n') + alienWeaponMsg,
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

  // SP.DOCK1.S:130-135 — pz$=q4$ two-step flow:
  //   print "The Armed Take-Over of {system} is successful!"
  //   print "Here are the legal documents to activate new ownership"
  //   print "Please take them immediately to Alliance Investment Ltd"
  //   pz$=q4$:s2=s2+5:z1=3
  // Ownership transfer happens later at Investment Center (SP.VEST.S invtak2)
  await prisma.character.update({
    where: { id: characterId },
    data: {
      score: character.score + 5,
      tripCount: 3,
      missionType: 0,
      cargoManifest: null,
      destination: 0,
      cargoPods: 0,
      cargoType: 0,
      raidDocument: targetSystem.name,
    },
  });

  return {
    message:
      `The Armed Take-Over of ${targetSystem.name} is successful!\r\n` +
      `Here are the legal documents to activate new ownership\r\n` +
      `Please take them immediately to Alliance Investment Ltd\r\n` +
      `+5 score points awarded.`,
  };
}
