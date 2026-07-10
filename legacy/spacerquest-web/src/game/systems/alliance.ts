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

  // SP.SAVE.S lines 119-120: news subroutine — post deposit event to alliance log
  // Original: i$=" "+o6$+" "+ll$+"Deposits_"+yj$+" cr___"+zj$:gosub news
  const allianceName = membership.alliance.replace(/_/g, ' ');
  await prisma.gameLog.create({
    data: {
      type: 'ALLIANCE',
      characterId,
      message: ` ${allianceName} ${character.name}...Deposits ${amount} cr`,
      metadata: { event: 'DEPOSIT', alliance: membership.alliance, amount },
    },
  });

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

  // SP.SAVE.S lines 88-89: news subroutine — post withdraw event to alliance log
  // Original: i$=" "+o6$+" "+ll$+"Withdraws"+yj$+" cr___"+zj$:gosub news
  const allianceName = membership.alliance.replace(/_/g, ' ');
  await prisma.gameLog.create({
    data: {
      type: 'ALLIANCE',
      characterId,
      message: ` ${allianceName} ${character.name}...Withdraws ${amount} cr`,
      metadata: { event: 'WITHDRAW', alliance: membership.alliance, amount },
    },
  });

  return { success: true, withdrawn: amount };
}

/**
 * Calculate DEFCON fortification cost tier (SP.VEST.S lines 83, 85).
 * Original: j=1 if o7<=9, j=2 if o7>9.
 * Returns j value (cost multiplier tier).
 */
export function getDefconTier(currentDefcon: number): number {
  return currentDefcon > 9 ? 2 : 1;
}

/**
 * Calculate cost per level based on current DEFCON.
 * Tier 1 (DEFCON 0-9): 100,000 cr per level (j=1, cost = j*100,000).
 * Tier 2 (DEFCON 10-19): 200,000 cr per level (j=2, cost = j*100,000).
 */
export function calculateDefconCostPerLevel(currentDefcon: number): number {
  return getDefconTier(currentDefcon) * 100000;
}

/**
 * Invest in DEFCON fortification for an alliance-owned system.
 *
 * CRITICAL: Matches SP.VEST.S fortpass loop (lines 79-95) exactly:
 *   1. System must be owned by player's alliance
 *   2. Maximum DEFCON = 20 (line 82: if o7>19)
 *   3. Cost tier: j=1 for DEFCON 0-9, j=2 for DEFCON 10-19 (line 83)
 *   4. Asset requirement: (j*10) <= o3 — system assets must support level (line 84)
 *   5. Cost deducted from SYSTEM ASSETS, not player credits (line 89: o3=(o3-(10*j)))
 *   6. Each level processed individually (loop: goto fortpass)
 *
 * @param characterId - The character requesting fortification
 * @param systemId - The star system to fortify (1-14)
 * @param levels - How many DEFCON levels to add
 */
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

  const allianceSystem = await prisma.allianceSystem.findUnique({
    where: { systemId },
  });

  // SP.VEST.S line 71: if o4$="" → system must be owned
  if (!allianceSystem) {
    const systemName = CORE_SYSTEM_NAMES[systemId] || `System ${systemId}`;
    return { success: false, error: `${systemName} is open for investment` };
  }

  // SP.VEST.S line 72: must be your alliance's system
  if (allianceSystem.alliance !== membership.alliance) {
    return { success: false, error: `You are not in The ${allianceSystem.alliance}` };
  }

  let currentDefcon = allianceSystem.defconLevel;
  let assetsHigh = allianceSystem.assetsHigh;
  let assetsLow = allianceSystem.assetsLow;
  let levelsAdded = 0;

  // SP.VEST.S fortpass loop (lines 80-90): process each level individually
  // Original loop: check max, compute j, check assets, deduct from assets, increment DEFCON
  for (let i = 0; i < levels; i++) {
    // SP.VEST.S line 82: if o7>19 → maximum DEFCON achieved
    if (currentDefcon >= DEFCON_MAX) {
      break;
    }

    // SP.VEST.S line 83: j=1:if o7>9 j=2
    const j = getDefconTier(currentDefcon);

    // SP.VEST.S line 84: if (j*10)>o3 → need more assets
    if ((j * 10) > assetsHigh) {
      if (levelsAdded === 0) {
        const systemName = CORE_SYSTEM_NAMES[systemId] || `System ${systemId}`;
        return { success: false, error: `Need more assets in ${systemName}` };
      }
      break; // Partial fortification: applied what we could
    }

    // SP.VEST.S line 89: o7=(o7+1):o3=(o3-(10*j))
    currentDefcon += 1;
    assetsHigh -= (10 * j);
    levelsAdded += 1;
  }

  if (levelsAdded === 0) {
    return { success: false, error: 'No DEFCON levels could be added' };
  }

  // Persist updated DEFCON and assets
  await prisma.allianceSystem.update({
    where: { systemId },
    data: {
      defconLevel: currentDefcon,
      assetsHigh: assetsHigh,
      assetsLow: assetsLow,
    },
  });

  // SP.VEST.S line 93-94: news log and display
  const systemName = CORE_SYSTEM_NAMES[systemId] || `System ${systemId}`;
  await prisma.gameLog.create({
    data: {
      type: 'ALLIANCE',
      systemId,
      message: `: ${character.name} - ${membership.alliance} - Increases ${systemName} DEFCON to: ${currentDefcon}`,
      metadata: { event: 'DEFCON', systemId, newDefcon: currentDefcon, levelsAdded },
    },
  });

  // SP.VEST.S line 94: weaponry and shielding = o7 * 100 each
  return {
    success: true,
    message: `${systemName} DEFCON is now ${currentDefcon}.\r\nCurrent DEFCON: Weaponry:____${currentDefcon}00______Shielding:____${currentDefcon}00`,
    newDefcon: currentDefcon,
    levelsAdded,
  };
}

// ============================================================================
// ACQUIRE UNOWNED SYSTEM (SP.VEST.S lines 55-67, invall)
// ============================================================================

/**
 * Acquire an unowned star system for the player's alliance.
 * Original flow: costs 10,000 cr startup, player becomes CEO, alliance takes ownership.
 * Sets starting assets to 1 (= 10,000 cr in 10k units).
 * Also sets account password for fortification/withdrawals (SP.VEST.S line 67: gosub passwd).
 */
export async function acquireSystem(characterId: string, systemId: number, password?: string) {
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
  // SP.VEST.S line 67: o7$ = password (account password for fortification/withdrawals)
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
        password: password || null, // SP.VEST.S line 67: gosub passwd
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

  // SP.VEST.S takeover eligibility (lines 170-173):
  //   line 170: if (o3<1) and (o4<10000) goto invtak1  → bankrupt → eligible
  //   line 171: if o3<10 → "Assets need to be > 99,999 for Take-Over" → reject
  //   line 172: if o3<200 goto invtak1  → assets 10-199 (100k-1.99M) → eligible
  //   line 173: "Assets greater than 1,999,999...safe from Take-Over" → reject
  const isBankrupt = allianceSystem.assetsHigh < 1 && allianceSystem.assetsLow < 10000;
  if (!isBankrupt) {
    if (allianceSystem.assetsHigh >= 200) {
      return { success: false, error: `Assets greater than 1,999,999...${systemName} safe from Take-Over` };
    }
    if (allianceSystem.assetsHigh < 10) {
      return { success: false, error: `${systemName}'s Assets need to be > 99,999 for Take-Over` };
    }
  }

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
