/**
 * SpacerQuest v4.0 - Bot Setup
 *
 * Idempotent creation of bot User + Character + Ship records.
 * Safe to call repeatedly — creates only missing records.
 */

import { AllianceType } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { addCredits } from '../game/utils.js';
import { RANK_HONORARIA } from '../game/constants.js';
import { BOT_PROFILES } from './profiles.js';
import { BotProfile } from './types.js';

export async function ensureBotsExist(count: number): Promise<void> {
  const profiles = BOT_PROFILES.slice(0, count);

  for (const profile of profiles) {
    await ensureSingleBot(profile);
  }
}

async function ensureSingleBot(profile: BotProfile): Promise<void> {
  const bbsUserId = `bot-${profile.slug}`;

  // Upsert User
  let user = await prisma.user.findUnique({ where: { bbsUserId } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        bbsUserId,
        email: `${profile.slug}@spacerquest.bot`,
        displayName: `[BOT] ${profile.name}`,
      },
    });
  }

  // Check Character exists
  const existing = await prisma.character.findFirst({ where: { userId: user.id } });
  if (existing) return;

  // Create character with starting credits (same as registerCharacter)
  const startingCredits = addCredits(0, 0, RANK_HONORARIA.LIEUTENANT);

  const character = await prisma.character.create({
    data: {
      userId: user.id,
      name: profile.name,
      shipName: profile.shipName,
      isBot: true,
      creditsHigh: startingCredits.high,
      creditsLow: startingCredits.low,
      currentSystem: 1, // Sun-3
    },
  });

  // Create starting ship (identical to registerCharacter)
  await prisma.ship.create({
    data: {
      characterId: character.id,
      hullStrength: 5, hullCondition: 9,
      driveStrength: 5, driveCondition: 9,
      cabinStrength: 1, cabinCondition: 9,
      lifeSupportStrength: 5, lifeSupportCondition: 9,
      weaponStrength: 1, weaponCondition: 9,
      navigationStrength: 5, navigationCondition: 9,
      roboticsStrength: 1, roboticsCondition: 9,
      shieldStrength: 1, shieldCondition: 9,
      fuel: 50, cargoPods: 0, maxCargoPods: 1,
    },
  });

  // Join preferred alliance if not NONE
  if (profile.preferredAlliance !== AllianceType.NONE) {
    await prisma.character.update({
      where: { id: character.id },
      data: { allianceSymbol: profile.preferredAlliance },
    });
    await prisma.allianceMembership.create({
      data: {
        characterId: character.id,
        alliance: profile.preferredAlliance,
      },
    });
  }
}
