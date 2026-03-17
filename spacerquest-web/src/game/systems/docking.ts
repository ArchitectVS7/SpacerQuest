/**
 * SpacerQuest v4.0 - Docking System (SP.DOCK1.S)
 *
 * Handles arrival at star systems including raid completion.
 * Original source: SP.DOCK1.S
 */

import { prisma } from '../../db/prisma.js';

export async function processDocking(characterId: string, systemId: number) {
  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character) return { success: false, error: 'Character not found' };

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

  // ── Raid completion (SP.DOCK1.S:129-135) ──────────────────────────────
  // missionType 4 = alliance raid; check if arrived at destination
  if (character.missionType === 4 && character.destination === systemId) {
    const raidResult = await completeRaid(characterId, character, systemId);
    if (raidResult) {
      return { success: true, message: raidResult.message, raidCompleted: true };
    }
  }

  return { success: true, message: `Docked at System ${systemId}` };
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
 */
async function completeRaid(
  characterId: string,
  character: { name: string; allianceSymbol: string; score: number; missionType: number },
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
    // Award score: original s2=s2+5
    prisma.character.update({
      where: { id: characterId },
      data: {
        score: character.score + 5,
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
