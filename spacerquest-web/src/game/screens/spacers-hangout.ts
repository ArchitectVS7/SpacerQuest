/**
 * SpacerQuest v4.0 - Spacers Hangout Screen (SP.BAR.S)
 *
 * Central social hub at Sun-3 (System #1).
 * Features:
 * - Information broker (interactive keyword input)
 * - Alliance joining (via Info → ALL)
 * - Brig viewing / bail (two-step confirmation)
 * - Gambling (links to pub)
 * - Smuggling contract completion (gain section)
 *
 * Original source: SP.BAR.S
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { formatCredits, subtractCredits, addCredits } from '../utils.js';
import { calculateBailCost, releasePlayer, CrimeType } from '../systems/jail.js';
import { ALLIANCE_INFO, canJoinAlliance } from '../systems/alliance-rules.js';
import { calculateSmugglingContract, SmugglingContractResult } from '../systems/economy.js';
import { AllianceType } from '@prisma/client';

// ============================================================================
// Module-level session state (keyed by characterId)
// ============================================================================

const pendingAllianceSwitch = new Map<string, AllianceType>();
const pendingBailPrompt = new Set<string>();      // SP.BAR.S:337 — waiting for cell # input
const inAllianceMenu = new Set<string>();

// SP.BAR.S:27 — dz (drink counter), hd (unknown-query counter)
const drinkCount = new Map<string, number>();     // dz
const infoHdCount = new Map<string, number>();    // hd

// Info broker interactive state
const pendingInfoInput = new Set<string>();

// Brig sub-menu state (L/B/Q after listing)
const inBrigMenu = new Set<string>();

// SP.BAR.S:32-37 — Sun-3 entry sub-menu (H/B/Q): shown before entering hangout
const inSun3EntryMenu = new Set<string>();

// Smuggling session state (SP.BAR.S:213-245 smug subroutine)
// nj: no-jobs counter (>2 = syndicate closed); ye: already got a contract this session
const smugNj = new Map<string, number>();   // nj per character session
const smugYe = new Map<string, number>();   // ye per character session

interface SmugConfirmState {
  step: 'confirm_smug' | 'confirm_contract';
  contract?: SmugglingContractResult;
}
const pendingSmug = new Map<string, SmugConfirmState>();

// Bail multi-step confirmation
interface BailConfirmState {
  step: 'confirm_bail' | 'confirm_payment';
  targetSpacerId: number;
  targetName: string;
  crimeType: CrimeType;
  bailCost: number;
}
const pendingBailConfirm = new Map<string, BailConfirmState>();

const ALLIANCE_KEY_MAP: Record<string, AllianceType> = {
  '+': AllianceType.ASTRO_LEAGUE,
  '@': AllianceType.SPACE_DRAGONS,
  '&': AllianceType.WARLORD_CONFED,
  '^': AllianceType.REBEL_ALLIANCE,
};

// ============================================================================
// Info keyword definitions — ordered as in original SP.BAR.S:67-93
// instr(KEYWORD, input) semantics: input is found inside KEYWORD
// ============================================================================

interface InfoEntry {
  keyword: string;
  response: string;
  action?: 'raid' | 'nfm' | 'smug';
}

const INFO_ENTRIES: InfoEntry[] = [
  { keyword: 'RAI', response: '', action: 'raid' },
  { keyword: 'WIS', response: 'Try Polaris-1' },
  { keyword: 'SAG', response: 'Try Mizar-9' },
  { keyword: 'CHR', response: 'Chrysalis is best life support system' },
  { keyword: 'ALL', response: "Looking for an alliance with someone...eh?", action: 'nfm' },
  { keyword: 'MAL', response: 'You mean the rogue star?' },
  { keyword: 'GIR', response: 'The ladies go for spacers like you' },
  { keyword: 'WIN', response: 'Have the best ship and the most wealth' },
  { keyword: 'WEA', response: 'Star Buster is the Big Gun' },
  { keyword: 'SHI', response: 'ARCH-ANGEL Shield is the best' },
  { keyword: 'PIR', response: 'Pirates attack Cargo Transports' },
  { keyword: 'DRI', response: 'Better Drives increase speed' },
  { keyword: 'ROB', response: 'Robotic/Computer needed in battle' },
  { keyword: 'NAV', response: 'Manual Navigation is tricky business' },
  { keyword: 'LIF', response: 'Space Patrol knows about life support' },
  { keyword: 'HUL', response: 'Titanium strengthened hulls best' },
  { keyword: 'FIR', response: 'Firefox wrote this entire dad-blamed game' },
  { keyword: 'COO', response: "MALIGNA's coordinates are 13-33-99" },
  { keyword: 'CLO', response: 'Special armour for smaller ships' },
  { keyword: 'RAN', response: 'Access increases with rank' },
  { keyword: 'BAT', response: 'B/F = Hull/Rank/Drives/#Trips/Life/#Wins' },
  { keyword: 'SPA', response: 'Owning a Space Port generates income' },
  { keyword: 'STA', response: 'Treasure can be found in the Rim Stars' },
  { keyword: 'RIM', response: 'Rim Star Worlds found in flight' },
  { keyword: 'SMU', response: 'Smuggling pays big bucks', action: 'smug' },
  { keyword: 'GEM', response: 'Gems contain an infinity of answers' },
];

// ============================================================================
// SCREEN MODULE
// ============================================================================

export const SpacersHangoutScreen: ScreenModule = {
  name: 'spacers-hangout',

  render: async (characterId: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true },
    });

    if (!character) {
      return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n' };
    }

    // Only accessible at Sun-3 (system 1)
    if (character.currentSystem !== 1) {
      return {
        output: '\x1b[33mThe Spacers Hangout is only accessible at Sun-3.\x1b[0m\r\n',
        nextScreen: 'main-menu',
      };
    }

    // Clear transient input states on re-render
    pendingInfoInput.delete(characterId);
    inBrigMenu.delete(characterId);
    inSun3EntryMenu.delete(characterId);

    // SP.BAR.S:30 — "if kk=5 goto begin": smuggling mission skips sub-menu entirely
    if (character.missionType === 5) {
      return renderHangoutContent(characterId);
    }

    // SP.BAR.S:32-37 — Sun-3 entry sub-menu: shown before hangout at Sun-3
    // Original: "if sp$<>"Sun-3" goto hanger"
    //           "print Spacers: [H]angout  (B)rig  (Q)uit:":gosub getkey
    // H → continue to hangout; B → go straight to brig; Q → leave
    inSun3EntryMenu.add(characterId);
    return {
      output: `\r\n${'-'.repeat(28)}\r\nSpacers: \x1b[37;1m[H]\x1b[0mangout  (B)rig  (Q)uit: `,
    };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const raw = input.trim();
    const key = raw.toUpperCase();

    // ── Priority 0: Sun-3 entry sub-menu (SP.BAR.S:32-37 — H/B/Q before hangout) ──
    if (inSun3EntryMenu.has(characterId)) {
      inSun3EntryMenu.delete(characterId);
      if (key === 'Q') {
        return { output: 'Leaving\r\n', nextScreen: 'main-menu' };
      }
      if (key === 'B') {
        return showBrig(characterId);
      }
      // H or Enter → proceed to hangout (hanger label)
      return renderHangoutContent(characterId);
    }

    // ── Priority 1: Smuggling multi-step (SP.BAR.S smug subroutine) ─────────────
    const smugState = pendingSmug.get(characterId);
    if (smugState) {
      return handleSmugStep(characterId, key, smugState);
    }

    // ── Priority 1: Bail confirmation (two-step: confirm_bail → confirm_payment) ──
    const bailConfirm = pendingBailConfirm.get(characterId);
    if (bailConfirm) {
      if (key === 'N') {
        pendingBailConfirm.delete(characterId);
        return { output: '\r\nNo\r\n> ' };
      }
      if (key === 'Y') {
        if (bailConfirm.step === 'confirm_bail') {
          // Advance to payment confirmation
          // SP.BAR.S:349-350 — show bail amount
          pendingBailConfirm.set(characterId, { ...bailConfirm, step: 'confirm_payment' });
          return {
            output:
              `\r\nYes\r\n` +
              `Bail is set at ${bailConfirm.bailCost} cr......pay it? \x1b[37;1m[Y]\x1b[0m/(N): `,
          };
        }
        if (bailConfirm.step === 'confirm_payment') {
          // SP.BAR.S:362-375 — execute bail
          pendingBailConfirm.delete(characterId);
          const caller = await prisma.character.findUnique({ where: { id: characterId } });
          if (!caller) {
            return { output: '\r\n\x1b[31mError: Character not found.\x1b[0m\r\n> ' };
          }
          const deductResult = subtractCredits(
            caller.creditsHigh,
            caller.creditsLow,
            bailConfirm.bailCost
          );
          if (!deductResult.success) {
            return {
              output: `\r\n\x1b[31mNot enough credits (need ${bailConfirm.bailCost} cr).\x1b[0m\r\n> `,
            };
          }
          const releasedName = releasePlayer(bailConfirm.targetName);
          await Promise.all([
            prisma.character.update({
              where: { id: caller.id },
              data: { creditsHigh: deductResult.high, creditsLow: deductResult.low },
            }),
            prisma.character.update({
              where: { spacerId: bailConfirm.targetSpacerId },
              data: { crimeType: null, name: releasedName },
            }),
          ]);
          return {
            output:
              `\r\nYes\r\n` +
              `\x1b[32mBail paid for ${releasedName}....The prisoner is free to go\x1b[0m\r\n> `,
          };
        }
      }
      return { output: '\r\n\x1b[31m(Y)es or (N)o: \x1b[0m' };
    }

    // ── Priority 2: Brig sub-menu (SP.BAR.S:330-335 — brgm label) ────────────
    if (inBrigMenu.has(characterId)) {
      if (key === 'L') {
        inBrigMenu.delete(characterId);
        return showBrig(characterId);
      }
      if (key === 'Q') {
        inBrigMenu.delete(characterId);
        return { output: '\r\n> ' };
      }
      if (key === 'B') {
        inBrigMenu.delete(characterId);
        // SP.BAR.S:337 — "Bail out convict in which cell #?"
        pendingBailPrompt.add(characterId);
        return { output: '\r\nBail out convict in which spacer #?  <C-R> quits: ' };
      }
      return { output: '\r\n\x1b[31m(L)ook, (B)ail, (Q)uit: \x1b[0m' };
    }

    // ── Priority 3: Bail spacer ID input (SP.BAR.S:337-343) ──────────────────
    if (pendingBailPrompt.has(characterId)) {
      if (raw === '' || key === 'Q') {
        pendingBailPrompt.delete(characterId);
        return { output: '\r\n> ' };
      }
      if (/^\d+$/.test(raw)) {
        pendingBailPrompt.delete(characterId);
        const targetSpacerId = parseInt(raw, 10);
        const target = await prisma.character.findFirst({ where: { spacerId: targetSpacerId } });
        if (!target || target.crimeType === null) {
          // SP.BAR.S:343 — "That cell is empty!"
          pendingBailPrompt.add(characterId);
          return {
            output: `\r\n\x1b[31mThat cell is empty!\x1b[0m\r\nBail out convict in which spacer #?  <C-R> quits: `,
          };
        }
        const crimeType = target.crimeType as unknown as CrimeType;
        const bailCost = calculateBailCost(crimeType);
        // SP.BAR.S:344-345 — show convict details
        pendingBailConfirm.set(characterId, {
          step: 'confirm_bail',
          targetSpacerId,
          targetName: target.name,
          crimeType,
          bailCost,
        });
        return {
          output:
            `\r\nConvict: ${target.name}....of the space ship: ${target.shipName || 'none'}\r\n` +
            `Bail out this miscreant? \x1b[37;1m[Y]\x1b[0m/(N): `,
        };
      }
      // Non-numeric non-empty: re-prompt
      return { output: '\r\nBail out convict in which spacer #?  <C-R> quits: ' };
    }

    // ── Priority 4: Info keyword input (SP.BAR.S:65-96 — inform label) ────────
    if (pendingInfoInput.has(characterId)) {
      return handleInfoInput(characterId, raw);
    }

    // ── Priority 5: Alliance sub-menu routing ─────────────────────────────────
    if (inAllianceMenu.has(characterId)) {
      inAllianceMenu.delete(characterId);
      if (key === 'B') {
        return { output: '\r\n', nextScreen: 'bulletin-board' };
      }
      // Fall through: alliance symbols, Q, etc. handled below
    }

    switch (key) {
      case 'Q':
        return { output: '\r\nLeaving\r\n', nextScreen: 'main-menu' };

      case 'G':
        // SP.BAR.S:57 — "if i$='G' print 'Gambling': g1$=g$: link 'sp.game'"
        return { output: '\r\nGambling\r\n', nextScreen: 'pub' };

      case 'D':
        // SP.BAR.S:58 — "if i$='D' print 'Slurp! Guzzle! Barf!': dz=dz+1: goto hang1"
        drinkCount.set(characterId, (drinkCount.get(characterId) ?? 0) + 1);
        return { output: '\r\n\x1b[32mSlurp! Guzzle! Barf!\x1b[0m\r\n> ' };

      case 'I': {
        // SP.BAR.S:59,61-66 — "if i$='I' print 'Information': goto inform"
        // "inform: if dz>4 print hints-row1; if dz>8 print hints-row2; dz=0; input 'What info do you need?'"
        const dz = drinkCount.get(characterId) ?? 0;
        let hints = '';
        if (dz > 4) {
          // SP.BAR.S:62 — first row of hints (beep + list)
          hints += '\r\n\x1b[36mALL MAL GIR WIN WEA SHI PIR FIR RAI STA RIM GEM SAG\x1b[0m';
        }
        if (dz > 8) {
          // SP.BAR.S:63 — second row of hints
          hints += '\r\n\x1b[36mDRI ROB NAV LIF HUL COO CLO RAN BAT SPA SMU CHR WIS\x1b[0m';
        }
        // SP.BAR.S:64 — dz=0
        drinkCount.set(characterId, 0);
        pendingInfoInput.add(characterId);
        return {
          output: `\r\nInformation${hints}\r\n\r\nWhat info do you need? `,
        };
      }

      case 'B':
        // SP.BAR.S:300-335 — Brig viewing
        return showBrig(characterId);

      // ── Alliance symbol keys (SP.BAR.S:142-160 — allfix section) ───────────
      case '+':
      case '@':
      case '&':
      case '^': {
        return handleAllianceSymbol(characterId, key);
      }

      case 'Y': {
        const pendingAlliance = pendingAllianceSwitch.get(characterId);
        if (!pendingAlliance) {
          return { output: '\r\n\x1b[31mWhoops!...one too many!\x1b[0m\r\n> ' };
        }
        pendingAllianceSwitch.delete(characterId);
        const allianceInfo = ALLIANCE_INFO.find(a => a.enum === pendingAlliance)!;
        const character = await prisma.character.findUnique({ where: { id: characterId } });
        if (!character) {
          return { output: '\r\n\x1b[31mError: Character not found.\x1b[0m\r\n> ' };
        }
        // SP.BAR.S:116,128,155-157 — zero credits, clear port, set alliance, log join
        await Promise.all([
          prisma.character.update({
            where: { id: character.id },
            data: { creditsHigh: 0, creditsLow: 0, allianceSymbol: pendingAlliance },
          }),
          prisma.portOwnership.deleteMany({ where: { characterId: character.id } }),
          prisma.allianceMembership.upsert({
            where: { characterId: character.id },
            update: { alliance: pendingAlliance },
            create: { characterId: character.id, alliance: pendingAlliance },
          }),
        ]);
        return {
          output:
            `\r\nYour ${character.name} is now a part of the ${allianceInfo.name}\r\n` +
            'Treat your allies well and do not betray them\r\n> ',
        };
      }

      case 'N': {
        if (pendingAllianceSwitch.has(characterId)) {
          pendingAllianceSwitch.delete(characterId);
          return { output: '\r\nNo\r\n> ' };
        }
        return { output: '\r\n\x1b[31mWhoops!...one too many!\x1b[0m\r\n> ' };
      }

      default:
        return { output: '\r\n\x1b[31mWhoops!...one too many!\x1b[0m\r\n> ' };
    }
  },
};

// ============================================================================
// HANGOUT CONTENT — SP.BAR.S:39-56 (hanger/begin/hang1 labels)
// Entered via H from Sun-3 entry sub-menu, or directly for non-Sun-3 entry
// ============================================================================

async function renderHangoutContent(characterId: string): Promise<ScreenResponse> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { ship: true },
  });
  if (!character) return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n' };

  if (character.missionType === 5 && character.cargoType < 1) {
    return renderGain(character);
  }

  const credits = formatCredits(character.creditsHigh, character.creditsLow);
  const output =
    `\r\n\x1b[36;1m${'-'.repeat(31)}\x1b[0m\r\n` +
    '\x1b[33;1m Welcome to The Spacers Hangout!\x1b[0m\r\n' +
    `\x1b[36;1m${'-'.repeat(31)}\x1b[0m\r\n\r\n` +
    'You step over an old spacer sprawled on the floor mumbling\r\n' +
    "...'what black hole hit me?'...'all I had were four drinks'...\r\n\r\n" +
    `\x1b[32m[:\x1b[0m${credits}\x1b[32m:][Spacers Hangout]:\x1b[0m\r\n\r\n` +
    '  \x1b[37;1m(G)\x1b[0mamble  \x1b[37;1m(D)\x1b[0mrinks  \x1b[37;1m(I)\x1b[0mnfo  \x1b[37;1m[Q]\x1b[0muit\r\n\r\n' +
    `Hello Spacer ${character.name}. What'll it be? `;
  return { output };
}

// ============================================================================
// GAIN SECTION — SP.BAR.S:247-264
// Entered when kk=5 (smuggling mission) and q2<1 (cargo delivered)
// ============================================================================

async function renderGain(character: {
  id: string;
  name: string;
  missionType: number;
  cargoType: number;
  cargoManifest: string | null;
  cargoPayment: number;
  creditsHigh: number;
  creditsLow: number;
}): Promise<ScreenResponse> {
  let gainOutput: string;
  let creditsUpdate: { creditsHigh: number; creditsLow: number } | null = null;

  // SP.BAR.S:249 — "if q2$='Contraband' goto gain1"
  if (character.cargoManifest === 'Contraband' && character.cargoPayment > 0) {
    // SP.BAR.S:255-260 — gain1: delivery success
    const newCredits = addCredits(
      character.creditsHigh,
      character.creditsLow,
      character.cargoPayment
    );
    creditsUpdate = { creditsHigh: newCredits.high, creditsLow: newCredits.low };
    gainOutput =
      "\r\n\x1b[33mThey're waiting for you in back!\x1b[0m\r\n\r\n" +
      'You hand over the cargo invoice to a swarthy fat man\r\n' +
      'in a pin-stripe suit who looks up and says....\r\n\r\n' +
      `\x1b[32mAh...the smuggled goods....Here's your pay: ${character.cargoPayment} cr\x1b[0m\r\n` +
      `A profitable venture for all concerned....spacer ${character.name}\r\n` +
      'The Syndicate is always happy to do business with you\r\n';
  } else {
    // SP.BAR.S:250-253 — gain2: delivery failure
    gainOutput =
      "\r\n\x1b[31mWhere's da goods?...if you're gonna work for da Syndicate\x1b[0m\r\n" +
      "Ya gotta learn to deliver or you're gonna get deep-spaced!\r\n" +
      "Now...get outta here...come back when you got what it takes\r\n";
  }

  // SP.BAR.S:263-264 — gain2: q1=0:q2=0:q3=0:q5=0:q6=0:q2$="":q4$="" kk=0
  await prisma.character.update({
    where: { id: character.id },
    data: {
      missionType: 0,
      cargoType: 0,
      cargoPods: 0,
      cargoPayment: 0,
      cargoManifest: null,
      destination: 0,
      ...(creditsUpdate ?? {}),
    },
  });

  const finalCredits = creditsUpdate
    ? formatCredits(creditsUpdate.creditsHigh, creditsUpdate.creditsLow)
    : formatCredits(character.creditsHigh, character.creditsLow);

  // Return to hang1 menu
  gainOutput +=
    `\r\n\x1b[36;1m${'-'.repeat(31)}\x1b[0m\r\n` +
    `\x1b[32m[:\x1b[0m${finalCredits}\x1b[32m:][Spacers Hangout]:\x1b[0m\r\n\r\n` +
    '  \x1b[37;1m(G)\x1b[0mamble  \x1b[37;1m(D)\x1b[0mrinks  \x1b[37;1m(I)\x1b[0mnfo  \x1b[37;1m[Q]\x1b[0muit\r\n\r\n' +
    `Hello Spacer ${character.name}. What'll it be? `;

  return { output: gainOutput };
}

// ============================================================================
// BRIG — SP.BAR.S:300-335
// ============================================================================

async function showBrig(characterId: string): Promise<ScreenResponse> {
  const jailed = await prisma.character.findMany({
    where: { crimeType: { not: null } },
    select: { spacerId: true, name: true, shipName: true, crimeType: true },
  });

  const divider = '-'.repeat(49);

  if (jailed.length === 0) {
    // SP.BAR.S:327 — "The Brig is vacant right now"
    return {
      output:
        `\r\n\x1b[36;1m${divider}\x1b[0m\r\n` +
        '\x1b[33mHmmm...Let\'s see who we have locked up....\x1b[0m\r\n' +
        `\x1b[36;1m${divider}\x1b[0m\r\n\r\n` +
        'The Brig is vacant right now\r\n' +
        `\x1b[36;1m${divider}\x1b[0m\r\n> `,
    };
  }

  // SP.BAR.S:313-317 — cell listing
  const cells = jailed
    .map(
      (j, i) =>
        `  Cell #${i + 1} (#${String(j.spacerId).padStart(4, '0')})...${j.name}...Ship: ${j.shipName || 'none'}`
    )
    .join('\r\n');

  // SP.BAR.S:326 — "That's the scurvy lot of them"
  // SP.BAR.S:330-335 — brgm: (L)ook, (B)ail, (Q)uit
  inBrigMenu.add(characterId);

  return {
    output:
      `\r\n\x1b[36;1m${divider}\x1b[0m\r\n` +
      '\x1b[33mHmmm...Let\'s see who we have locked up....\x1b[0m\r\n' +
      `\x1b[36;1m${divider}\x1b[0m\r\n\r\n` +
      `${cells}\r\n\r\n` +
      "That's the scurvy lot of them\r\n" +
      `\x1b[36;1m${divider}\x1b[0m\r\n\r\n` +
      "(L)ook 'em over again  (B)ail out convict  (Q)uit: ",
  };
}

// ============================================================================
// INFO KEYWORD HANDLER — SP.BAR.S:61-96 (inform label)
// Uses instr(KEYWORD, input) semantics: match if input appears inside KEYWORD
// ============================================================================

async function handleInfoInput(characterId: string, raw: string): Promise<ScreenResponse> {
  // SP.BAR.S:93 — "if i$='Q' goto hang1"
  if (raw === '' || raw.toUpperCase() === 'Q') {
    pendingInfoInput.delete(characterId);
    infoHdCount.delete(characterId);
    return { output: '\r\n> ' };
  }

  // Use up to 3 chars, uppercased — matches original single-byte input context
  const inp = raw.toUpperCase().slice(0, 3);

  // Walk entries in original order (first match wins)
  for (const entry of INFO_ENTRIES) {
    // SP.BAR.S style: instr(entry.keyword, inp) → inp is found in entry.keyword
    if (inp.length > 0 && entry.keyword.includes(inp)) {
      pendingInfoInput.delete(characterId);
      infoHdCount.delete(characterId);

      if (entry.action === 'raid') {
        // SP.BAR.S:67 — "if instr('RAI',i$) goto raid"
        return { output: '\r\n', nextScreen: 'raid' };
      }
      if (entry.action === 'nfm') {
        // SP.BAR.S:71 — "if instr('ALL',i$) goto nfm"
        return handleAllianceInfoEntry(characterId);
      }
      if (entry.action === 'smug') {
        // SP.BAR.S:91 — "if instr('SMU',i$) goto smug"
        return handleSmugEntry(characterId);
      }
      // Standard keyword: print response, goto hang1
      return { output: `\r\n\x1b[33m${entry.response}\x1b[0m\r\n> ` };
    }
  }

  // SP.BAR.S:94-96 — "Don't know..." + hd counter
  const hd = (infoHdCount.get(characterId) ?? 0) + 1;
  infoHdCount.set(characterId, hd);
  let reply = "\r\nDon't know what you're talking about\r\n";
  if (hd > 4) {
    // SP.BAR.S:95 — "Why don't you have another drink...spacer!"
    infoHdCount.set(characterId, 0);
    reply += "Why don't you have another drink...spacer!\r\n";
  }
  // Keep pendingInfoInput active (loop back to inform)
  reply += 'What info do you need? ';
  return { output: reply };
}

// ============================================================================
// ALLIANCE INFO ENTRY — SP.BAR.S:98-160 (nfm + contmem labels)
// ============================================================================

async function handleAllianceInfoEntry(characterId: string): Promise<ScreenResponse> {
  // SP.BAR.S:99 — "if pp$='' print 'Only Lieutenants and higher may join'"
  // In v4.0 all characters have at least LIEUTENANT rank so this check always passes
  const lines: string[] = ['\r\nLooking for an alliance with someone...eh?\r\n\r\n'];

  // SP.BAR.S:137 — copy"ally" (show alliance list with sizes)
  for (const a of ALLIANCE_INFO) {
    const count = await prisma.allianceMembership.count({ where: { alliance: a.enum } });
    lines.push(`  (${a.symbol}) ${a.name} - ${count} members\r\n`);
  }
  lines.push('\r\nWhich of these are you interested in joining? \x1b[37;1m[Q]\x1b[0muits: ');
  inAllianceMenu.add(characterId);
  return { output: lines.join('') };
}

// ============================================================================
// ALLIANCE SYMBOL HANDLER — SP.BAR.S:142-167 (allfix / allck labels)
// ============================================================================

async function handleAllianceSymbol(
  characterId: string,
  key: string
): Promise<ScreenResponse> {
  const allianceEnum = ALLIANCE_KEY_MAP[key];
  const allianceInfo = ALLIANCE_INFO.find(a => a.symbol === key)!;

  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { ship: true, portOwnership: true },
  });

  if (!character) {
    return { output: '\r\n\x1b[31mError: Character not found.\x1b[0m\r\n> ' };
  }

  const [totalPlayers, allianceMemberCount] = await Promise.all([
    prisma.character.count(),
    prisma.allianceMembership.count({ where: { alliance: allianceEnum } }),
  ]);

  const joinResult = canJoinAlliance(
    character.rank,
    character.allianceSymbol as AllianceType,
    totalPlayers,
    allianceMemberCount
  );

  if (!joinResult.allowed) {
    // SP.BAR.S:154 — "gosub allck: if left$(k$,4)='That' print k$: goto contmem"
    return { output: `\r\n\x1b[31m${joinResult.reason}\x1b[0m\r\n> ` };
  }

  pendingAllianceSwitch.set(characterId, allianceEnum);

  if (joinResult.hasExistingAlliance) {
    // SP.BAR.S:107-115 — oldmem: "It will cost you all your credits to switch"
    return {
      output:
        `\r\n\x1b[33;1mIt will cost you all your credits to switch alliances\x1b[0m\r\n` +
        (character.portOwnership ? `As well as the loss of your Space Port\r\n` : '') +
        `Join ${allianceInfo.name}? (Y)es (N)o\r\n> `,
    };
  } else {
    // SP.BAR.S:133-135 — newmem: "Interested in joining an alliance?"
    return {
      output:
        `\r\nInterested in joining the ${allianceInfo.name}? \r\n` +
        `Join ${allianceInfo.name}? (Y)es (N)o\r\n> `,
    };
  }
}

// ============================================================================
// SMUGGLING CONTRACT SETUP — SP.BAR.S:213-245 (smug subroutine)
// ============================================================================

/**
 * Entry point when player types "SMU" at the info broker.
 * SP.BAR.S:213-220 — guards + initial confirm
 */
async function handleSmugEntry(characterId: string): Promise<ScreenResponse> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { ship: true },
  });
  if (!character || !character.ship) {
    return { output: '\r\n\x1b[31mError: Character not found.\x1b[0m\r\n> ' };
  }

  const nj = smugNj.get(characterId) ?? 0;

  // SP.BAR.S:214 — if kk=9 nj=3 (syndicate banned)
  // SP.BAR.S:215 — if (z1>2) or (nj>2) → "Syndicate closed down by Space Patrol"
  if (character.tripCount > 2 || nj > 2) {
    return { output: '\r\n\x1b[31mSyndicate closed down by Space Patrol\x1b[0m\r\n> ' };
  }

  // SP.BAR.S:216 — if s1<10 → "not enough cargo pods"
  if (character.cargoPods < 10) {
    return { output: "\r\n\x1b[33mYou don't have enough cargo pods\x1b[0m\r\n> " };
  }

  // SP.BAR.S:217-218 — if q1>0 and q2$="Contraband" → already have contract
  if (character.cargoType > 0 && character.cargoManifest === 'Contraband') {
    return { output: '\r\n\x1b[33mYour cargo pods already contain contraband\x1b[0m\r\n> ' };
  }

  // SP.BAR.S:219 — "Interested in smuggling some contra-band? [Y]/(N)"
  pendingSmug.set(characterId, { step: 'confirm_smug' });
  return {
    output: '\r\n\x1b[33mInterested in smuggling some contra-band?\x1b[0m \x1b[37;1m[Y]\x1b[0m/(N): ',
  };
}

/**
 * Handle Y/N for the smuggling confirm steps.
 */
async function handleSmugStep(
  characterId: string,
  key: string,
  state: SmugConfirmState,
): Promise<ScreenResponse> {
  // ── confirm_smug: "Interested in smuggling?" ──────────────────────────────
  if (state.step === 'confirm_smug') {
    if (key === 'N' || key === '') {
      pendingSmug.delete(characterId);
      return { output: '\r\nNo\r\n> ' };
    }

    // Y — generate contract
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true },
    });
    if (!character || !character.ship) {
      pendingSmug.delete(characterId);
      return { output: '\r\n\x1b[31mError.\x1b[0m\r\n> ' };
    }

    const ye = smugYe.get(characterId) ?? 0;

    // SP.BAR.S:223 — if ye>0 i=20 (already got a contract this session → snooping)
    let contract: SmugglingContractResult;
    if (ye > 0) {
      contract = { intercepted: true };
    } else {
      contract = calculateSmugglingContract(
        character.currentSystem,
        character.ship.hullStrength,
        character.ship.driveStrength,
        character.ship.driveCondition,
      );
    }

    // SP.BAR.S:227 — if i>14 → Space Patrol snooping
    if (contract.intercepted) {
      const nj = (smugNj.get(characterId) ?? 0) + 1;
      smugNj.set(characterId, nj);
      pendingSmug.delete(characterId);
      return { output: '\r\n\x1b[33mSpace Patrol snooping about...Nothing here!\x1b[0m\r\n> ' };
    }

    // Show destination + pay + confirm
    pendingSmug.set(characterId, { step: 'confirm_contract', contract });
    const warnLine = contract.lowPayWarning
      ? `\r\n\x1b[33mThe syndicate isn't sure ${character.shipName ?? 'your ship'} will clear customs.\x1b[0m`
      : '';
    return {
      output:
        `\r\nYes\r\n\r\nWe have a shipment for ${contract.destinationName}${warnLine}\r\n` +
        `Destination: ${contract.destinationName}......Distance: ${contract.distance}\r\n` +
        `Fuel Required: ${contract.fuelRequired}..........Pays: ${contract.payment} cr\r\n` +
        `${'-'.repeat(40)}\r\n...Want to give it a go?  \x1b[37;1m[Y]\x1b[0m/(N): `,
    };
  }

  // ── confirm_contract: "Want to give it a go?" ────────────────────────────
  if (state.step === 'confirm_contract') {
    if (key === 'N' || key === '') {
      pendingSmug.delete(characterId);
      return { output: '\r\nNo\r\n> ' };
    }

    // Y — accept contract
    const contract = state.contract!;
    pendingSmug.delete(characterId);

    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true },
    });
    if (!character || !character.ship) {
      return { output: '\r\n\x1b[31mError.\x1b[0m\r\n> ' };
    }

    // SP.BAR.S:241-244 — set contract fields
    // q6=y (distance), q1=s1 (all pods), q2=10 (cargo type), q4=i (dest), q2$="Contraband"
    // q5=x (pay), f2=fy, wb=0:lb=0:cs=0:cc=0, kk=5, q4$=ll$
    // nj=3 (block further contracts)
    await prisma.character.update({
      where: { id: characterId },
      data: {
        missionType: 5,
        cargoPods: character.cargoPods,
        cargoType: 10,
        destination: contract.destinationSystemId!,
        cargoManifest: 'Contraband',
        cargoPayment: contract.payment!,
      },
    });

    smugNj.set(characterId, 3);   // nj=3 — prevent further contracts
    smugYe.set(characterId, 1);   // ye=1 — mark session as used

    return {
      output:
        `\r\nYes\r\n\r\nThere's the risk of possible interception by the Space Patrol\r\n` +
        `\x1b[33mDon't get caught....they treat smugglers harshly!\x1b[0m\r\n> `,
    };
  }

  pendingSmug.delete(characterId);
  return { output: '\r\n> ' };
}
