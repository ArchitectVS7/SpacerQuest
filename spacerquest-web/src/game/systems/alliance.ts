/**
 * SpacerQuest v4.0 - Alliance System
 * 
 * Implements SP.VEST.S (Investing in Alliance, DEFCON, Takeovers)
 */

import { prisma } from '../../db/prisma.js';
import { DEFCON_MAX, ALLIANCE_STARTUP_INVESTMENT, CORE_SYSTEM_NAMES } from '../constants.js';
import { addCredits, subtractCredits, getTotalCredits } from '../utils.js';

export async function investInAlliance(characterId: string, amount: number) {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
  });

  if (!character) {
    return { success: false, error: 'Character not found' };
  }

  const membership = await prisma.allianceMembership.findUnique({
    where: { characterId },
  });

  if (!membership || membership.alliance === 'NONE') {
    return { success: false, error: 'Not in an alliance' };
  }

  const { success, high, low } = subtractCredits(character.creditsHigh, character.creditsLow, amount);
  if (!success) {
    return { success: false, error: 'Not enough credits' };
  }

  // Original (SP.SAVE lines 113-114): o4=o4+ia:o3=o3+ib
  // Uses 10,000-unit split (same as g1/g2 player credits), not 100,000.
  const { high: normalizedHigh, low: normalizedLow } = addCredits(
    membership.creditsHigh,
    membership.creditsLow,
    amount
  );

  await prisma.$transaction([
    prisma.character.update({
      where: { id: characterId },
      data: { creditsHigh: high, creditsLow: low },
    }),
    prisma.allianceMembership.update({
      where: { id: membership.id },
      data: { creditsHigh: normalizedHigh, creditsLow: normalizedLow },
    })
  ]);

  return { success: true, newBalance: normalizedHigh * 10000 + normalizedLow };
}

export async function withdrawFromAlliance(characterId: string, amount: number) {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
  });

  if (!character) {
    return { success: false, error: 'Character not found' };
  }

  const membership = await prisma.allianceMembership.findUnique({
    where: { characterId },
  });

  if (!membership || membership.alliance === 'NONE') {
    return { success: false, error: 'Not in an alliance' };
  }

  const { success: canWithdraw, high: newInvHigh, low: newInvLow } = subtractCredits(
    membership.creditsHigh,
    membership.creditsLow,
    amount
  );

  if (!canWithdraw) {
    return { success: false, error: 'Not enough invested credits' };
  }

  const { high: newCharHigh, low: newCharLow } = addCredits(
    character.creditsHigh,
    character.creditsLow,
    amount
  );

  await prisma.$transaction([
    prisma.character.update({
      where: { id: characterId },
      data: { creditsHigh: newCharHigh, creditsLow: newCharLow },
    }),
    prisma.allianceMembership.update({
      where: { id: membership.id },
      data: { creditsHigh: newInvHigh, creditsLow: newInvLow },
    })
  ]);

  return { success: true, withdrawn: amount };
}

/**
 * Calculate DEFCON fortification cost per level (SP.VEST.S lines 83, 85).
 * Original: j=1 if o7<=9, j=2 if o7>9. Cost per level = j*10 * 10,000 cr.
 * Tier 1 (current DEFCON ≤ 9): 100,000 cr per level.
 * Tier 2 (current DEFCON > 9): 200,000 cr per level.
 */
export function calculateDefconCostPerLevel(currentDefcon: number): number {
  return currentDefcon > 9 ? 200000 : 100000;
}

export async function investInDefcon(characterId: string, systemId: number, levels: number) {
  // Original SP.VEST.S line 219: only systems 1-14 are investable
  if (systemId < 1 || systemId > 14) {
    return { success: false, error: 'System must be 1–14' };
  }

  const character = await prisma.character.findUnique({
    where: { id: characterId },
  });

  if (!character) {
    return { success: false, error: 'Character not found' };
  }

  const membership = await prisma.allianceMembership.findUnique({
    where: { characterId },
  });

  if (!membership || membership.alliance === 'NONE') {
    return { success: false, error: 'Not in an alliance' };
  }

  // Get or create AllianceSystem to know current DEFCON before computing cost
  let allianceSystem = await prisma.allianceSystem.findUnique({
    where: { systemId },
  });

  const currentDefcon = allianceSystem ? allianceSystem.defconLevel : 0;

  // SP.VEST.S line 82: maximum DEFCON is 20
  if (currentDefcon >= DEFCON_MAX) {
    return { success: false, error: `Maximum DEFCON (${DEFCON_MAX}) already achieved for system ${systemId}` };
  }

  // Clamp levels so we don't exceed DEFCON_MAX
  const effectiveLevels = Math.min(levels, DEFCON_MAX - currentDefcon);

  // SP.VEST.S lines 83, 85: cost per level is tier-based.
  // j=1 if currentDefcon ≤ 9, j=2 if currentDefcon > 9.
  // Each fortification costs j * 100,000 cr (= 10*j * 10,000 in original units).
  const costPerLevel = calculateDefconCostPerLevel(currentDefcon);
  const cost = effectiveLevels * costPerLevel;

  // Deduct from player's credits
  const { success: canAfford, high, low } = subtractCredits(
    character.creditsHigh,
    character.creditsLow,
    cost
  );

  if (!canAfford) {
    return { success: false, error: 'Not enough credits for this DEFCON increase' };
  }

  if (!allianceSystem) {
    allianceSystem = await prisma.allianceSystem.create({
      data: {
        systemId,
        alliance: membership.alliance,
        defconLevel: 1 + effectiveLevels,
        ownerCharacterId: characterId,
      },
    });
  } else {
    // Port Takeover Logic
    if (allianceSystem.alliance !== membership.alliance) {
      if (allianceSystem.defconLevel > effectiveLevels) {
        // Did not beat existing DEFCON, just weaken it
        await prisma.$transaction([
          prisma.character.update({
            where: { id: characterId },
            data: { creditsHigh: high, creditsLow: low },
          }),
          prisma.allianceSystem.update({
            where: { systemId },
            data: { defconLevel: allianceSystem.defconLevel - effectiveLevels },
          }),
        ]);
        return { success: true, message: `Weakened enemy DEFCON. It is now level ${allianceSystem.defconLevel - effectiveLevels}.` };
      } else {
        // Takeover success
        const remainingLevels = effectiveLevels - allianceSystem.defconLevel;
        allianceSystem = await prisma.allianceSystem.update({
          where: { systemId },
          data: {
            alliance: membership.alliance,
            defconLevel: 1 + remainingLevels,
            ownerCharacterId: characterId,
            lastTakeoverAttempt: new Date(),
          },
        });

        // Log takeover
        await prisma.gameLog.create({
          data: {
            type: 'ALLIANCE',
            systemId,
            message: `${membership.alliance} has forcibly TAKEN OVER System ${systemId}!`,
            metadata: { event: 'TAKEOVER', systemId, newAlliance: membership.alliance },
          },
        });
      }
    } else {
      // Friendly: just add levels (clamped to DEFCON_MAX)
      const newDefcon = Math.min(allianceSystem.defconLevel + effectiveLevels, DEFCON_MAX);
      allianceSystem = await prisma.allianceSystem.update({
        where: { systemId },
        data: {
          defconLevel: newDefcon,
        },
      });
    }
  }

  // Finalize credit deduction for non-weakening cases
  await prisma.character.update({
    where: { id: characterId },
    data: { creditsHigh: high, creditsLow: low },
  });

  return { success: true, message: `System ${systemId} DEFCON is now ${allianceSystem.defconLevel} for ${allianceSystem.alliance}.` };
}

// ============================================================================
// ACQUIRE UNOWNED SYSTEM (SP.VEST.S lines 55-67, invall)
// ============================================================================

/**
 * Acquire an unowned star system for the player's alliance.
 * Original flow: costs 10,000 cr startup, player becomes CEO, alliance takes ownership.
 * Sets starting assets to 1 (= 10,000 cr in 10k units).
 */
export async function acquireSystem(characterId: string, systemId: number) {
  if (systemId < 1 || systemId > 14) {
    return { success: false, error: 'System must be 1–14' };
  }

  const character = await prisma.character.findUnique({
    where: { id: characterId },
  });
  if (!character) {
    return { success: false, error: 'Character not found' };
  }

  const membership = await prisma.allianceMembership.findUnique({
    where: { characterId },
  });
  if (!membership || membership.alliance === 'NONE') {
    return { success: false, error: 'Not in an alliance' };
  }

  // SP.VEST.S ckceo: player can only be CEO of one system
  const existingCeo = await prisma.allianceSystem.findFirst({
    where: { ownerCharacterId: characterId },
  });
  if (existingCeo) {
    return { success: false, error: 'You are already a CEO!' };
  }

  // Check system is unowned
  const existing = await prisma.allianceSystem.findUnique({
    where: { systemId },
  });
  if (existing) {
    const systemName = CORE_SYSTEM_NAMES[systemId] || `System ${systemId}`;
    return { success: false, error: `${systemName} belongs to The ${existing.alliance}` };
  }

  // SP.VEST.S line 59: startup costs 10,000 cr (g1<1 check = need at least 10k)
  const { success: canAfford, high, low } = subtractCredits(
    character.creditsHigh, character.creditsLow, ALLIANCE_STARTUP_INVESTMENT
  );
  if (!canAfford) {
    return { success: false, error: 'Not enough credits (10,000 cr required)' };
  }

  // SP.VEST.S line 63: o3=1 (starting assets = 1 unit of 10k = 10,000 cr)
  await prisma.$transaction([
    prisma.character.update({
      where: { id: characterId },
      data: { creditsHigh: high, creditsLow: low },
    }),
    prisma.allianceSystem.create({
      data: {
        systemId,
        alliance: membership.alliance,
        ownerCharacterId: characterId,
        defconLevel: 1,
        assetsHigh: 1, // o3=1
        assetsLow: 0,  // o4=0
      },
    }),
  ]);

  // Log the acquisition
  const systemName = CORE_SYSTEM_NAMES[systemId] || `System ${systemId}`;
  await prisma.gameLog.create({
    data: {
      type: 'ALLIANCE',
      systemId,
      message: `: ${character.name} of The ${membership.alliance} Acquires ${systemName}`,
      metadata: { event: 'ACQUIRE', systemId, alliance: membership.alliance },
    },
  });

  return { success: true, systemName };
}

// ============================================================================
// HOSTILE TAKEOVER (SP.VEST.S lines 170-192, invtak)
// ============================================================================

/**
 * Calculate hostile takeover cost based on system assets.
 * SP.VEST.S lines 180-182:
 *   if o3<1 y=1       → cost = 10,000 cr (minimum)
 *   if o3>0 y=(o3*2)  → cost = o3 * 2 * 10,000 cr
 *
 * @param assetsHigh — o3: system assets in 10,000 cr units
 * @returns cost in credits
 */
export function calculateTakeoverCost(assetsHigh: number): number {
  const y = assetsHigh < 1 ? 1 : assetsHigh * 2;
  return y * 10000;
}

/**
 * Perform a hostile takeover of an owned system.
 * Original eligibility rules (SP.VEST.S lines 170-177):
 *   - Cannot take over if assets >= 200 (2,000,000 cr) — "safe from Take-Over"
 *   - Cannot take over your own alliance's system
 *   - System must be owned by another alliance
 *
 * Cost formula: y = max(1, o3*2) × 10,000 cr
 * After takeover: o3 = o3 + y (assets increase by cost paid)
 */
export async function hostileTakeover(characterId: string, systemId: number) {
  if (systemId < 1 || systemId > 14) {
    return { success: false, error: 'System must be 1–14' };
  }

  const character = await prisma.character.findUnique({
    where: { id: characterId },
  });
  if (!character) {
    return { success: false, error: 'Character not found' };
  }

  const membership = await prisma.allianceMembership.findUnique({
    where: { characterId },
  });
  if (!membership || membership.alliance === 'NONE') {
    return { success: false, error: 'Not in an alliance' };
  }

  const allianceSystem = await prisma.allianceSystem.findUnique({
    where: { systemId },
  });

  const systemName = CORE_SYSTEM_NAMES[systemId] || `System ${systemId}`;

  if (!allianceSystem) {
    return { success: false, error: `${systemName} belongs to no alliance` };
  }

  if (allianceSystem.alliance === membership.alliance) {
    return { success: false, error: `${systemName} already belongs to your alliance` };
  }

  // SP.VEST.S line 176: if o3>=200 → safe from takeover (assets ≥ 2,000,000 cr)
  if (allianceSystem.assetsHigh >= 200) {
    return { success: false, error: `Assets greater than 1,999,999...${systemName} safe from Take-Over` };
  }

  // SP.VEST.S lines 173-174: eligibility check
  // Must have assets between 10k-199k range OR o3<1 and o4<10000
  // (Systems with very low assets are also vulnerable)

  const cost = calculateTakeoverCost(allianceSystem.assetsHigh);

  // Check if player can afford
  const { success: canAfford, high, low } = subtractCredits(
    character.creditsHigh, character.creditsLow, cost
  );
  if (!canAfford) {
    return { success: false, error: 'Not enough credits', cost };
  }

  const previousAlliance = allianceSystem.alliance;

  // SP.VEST.S line 187: if pz$="" o3=o3+y (assets increase by cost units paid)
  const y = allianceSystem.assetsHigh < 1 ? 1 : allianceSystem.assetsHigh * 2;
  const newAssetsHigh = allianceSystem.assetsHigh + y;

  await prisma.$transaction([
    prisma.character.update({
      where: { id: characterId },
      data: { creditsHigh: high, creditsLow: low },
    }),
    prisma.allianceSystem.update({
      where: { systemId },
      data: {
        alliance: membership.alliance,
        ownerCharacterId: characterId,
        assetsHigh: newAssetsHigh,
        assetsLow: 0,
        lastTakeoverAttempt: new Date(),
      },
    }),
  ]);

  // Log takeover
  await prisma.gameLog.create({
    data: {
      type: 'ALLIANCE',
      systemId,
      message: `: [${membership.alliance}] - Take-Over ${systemName} from ${previousAlliance} by ${character.name}`,
      metadata: { event: 'TAKEOVER', systemId, newAlliance: membership.alliance, previousAlliance },
    },
  });

  return { success: true, systemName, cost, previousAlliance };
}
