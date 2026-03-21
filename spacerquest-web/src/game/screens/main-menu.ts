/**
 * SpacerQuest v4.0 - Main Menu Screen (SP.START.S + SP.LINK.S combined)
 *
 * Original main menu from SpacerQuest v3.4.
 * Combines SP.START.S (val.start, hailstart, main1 operations menu) with
 * SP.LINK.S (main terminal hub, X/Z/0 always-available keys).
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { formatCredits, getAllianceSymbol } from '../utils.js';
import { isJailed } from '../systems/jail.js';
import { applyVandalism } from '../systems/extra-curricular.js';
import { isClassicMode } from '../../bots/config.js';
import { getSystemName } from '../systems/economy.js';

export const MainMenuScreen: ScreenModule = {
  name: 'main-menu',
  render: async (characterId: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true, portOwnership: true, user: { select: { isAdmin: true } } }
    });

    if (!character) {
      return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n' };
    }

    // Jailed players get redirected to jail screen
    if (isJailed(character.name)) {
      return { output: '\x1b[2J\x1b[H', nextScreen: 'jail' };
    }

    // SP.START.S val.start (lines 121-128):
    //   if s2<10000 goto vlst
    //   print "Hail Conqueror of Spacer Quest!...can you do it again?"
    //   na$="":sq=1
    //   goto new.start  (character reset)
    //
    // When score reaches 10,000, player is a Conqueror and their character
    // is reset so they can start over with a new role slot.
    if (character.score >= 10000 && !character.isConqueror) {
      await prisma.character.update({
        where: { id: characterId },
        data: { isConqueror: true },
      });
      return {
        output: '\x1b[2J\x1b[H\r\n\x1b[33;1mHail Conqueror of Spacer Quest!...can you do it again?\x1b[0m\r\n' +
                '\r\nYour legendary status has been recorded.\r\n' +
                'Your character will be reset so you can start a new role.\r\n' +
                '\r\n\x1b[32mThank you for playing SpacerQuest!\x1b[0m\r\n',
      };
    }

    // Check for resolved combat from disconnect
    let combatNotice = '';
    const resolvedCombat = await prisma.combatSession.findFirst({
      where: { characterId, active: false, result: { not: null } },
      orderBy: { updatedAt: 'desc' },
    });
    if (resolvedCombat) {
      const outcomeMessages: Record<string, string> = {
        VICTORY: '\x1b[32;1mWhile you were away, your ship prevailed in combat!\x1b[0m',
        DEFEAT: '\x1b[31;1mWhile you were away, your ship was defeated in combat.\x1b[0m',
        DRAW: '\x1b[33;1mWhile you were away, your combat ended in a draw.\x1b[0m',
      };
      combatNotice = `\r\n${outcomeMessages[resolvedCombat.result!] || ''}\r\n`;
      // Clear the resolved session so it doesn't show again
      await prisma.combatSession.delete({ where: { id: resolvedCombat.id } });
    }

    const credits = formatCredits(character.creditsHigh, character.creditsLow);
    const allianceSymbol = getAllianceSymbol(character.allianceSymbol);
    const displayName = allianceSymbol ? `${character.name}-${allianceSymbol}` : character.name;

    const membership = await prisma.allianceMembership.findUnique({ where: { characterId } });
    const hasAlliance = !!(membership && membership.alliance !== 'NONE');

    // SP.LINK.txt line 45: if ap>0 print "...Lost In Space!"
    const lostNotice = character.isLost
      ? '\r\n\x1b[31;1m*** YOUR SHIP IS LOST IN SPACE! Press [0] for Rescue Service. ***\x1b[0m\r\n'
      : '';

    const output = `${combatNotice}${lostNotice}
\x1b[36;1m_________________________________________\x1b[0m
\x1b[33;1m                                        \x1b[0m
\x1b[33;1m     S P A C E R  Q U E S T             \x1b[0m
\x1b[33;1m     ----------------------             \x1b[0m
\x1b[33;1m                                        \x1b[0m
\x1b[37m     Version 4.0 - Web Museum Edition    \x1b[0m
\x1b[36;1m_________________________________________\x1b[0m

\x1b[32mSpacer:\x1b[0m ${displayName}
\x1b[32mShip:\x1b[0m ${character.shipName || 'None'}
\x1b[32mLocation:\x1b[0m System ${character.currentSystem}
\x1b[32mCredits:\x1b[0m ${credits} cr
\x1b[32mRank:\x1b[0m ${character.rank}

\x1b[37;1m=========================================\x1b[0m
\x1b[33;1m           MAIN MENU                     \x1b[0m
\x1b[37;1m=========================================\x1b[0m

  [X] Ship's Stats
  [Z] Your Statz
  [0] Rescue Service${character.isLost ? ' \x1b[31m(AVAILABLE)\x1b[0m' : ''}
${character.isLost ? '\x1b[33m  (Navigation disabled while lost in space)\x1b[0m' : `  [B]ank - Manage your credits
  [S]hipyard - Upgrade and repair
  [P]ub - Gossip and games
  [T]raders - Buy and sell cargo
  [N]avigate - Travel between systems
  [R]egistry - Spacer directory
  [E]xtra-Curricular - Pirate, patrol, duels
  [G]alactic Port Prices - Fuel prices all ports${!isClassicMode() ? '\n  [D]one - End Turn (run other spacers)' : ''}${hasAlliance ? '\n  [I]nvest - Alliance investment center' : ''}${character.currentSystem === 17 ? '\n  [W]ise One - Visit the Wise One' : ''}${character.currentSystem === 18 ? '\n  [A]ncient One - Visit the Sage' : ''}${character.portOwnership ? '\n  [F]uel Depot - Manage your port fuel' : ''}${character.user.isAdmin ? '\n  \x1b[31m[*] Admin Panel (Sysop)\x1b[0m' : ''}`}
  [Q]uit - Save and logout

\x1b[32m:\x1b[0m${character.currentSystem} Port Accounts:\x1b[32m:(?=Menu): Command:\x1b[0m
> `;

    return { output };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const key = input.trim().toUpperCase();

    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true, portOwnership: true, user: { select: { isAdmin: true } } },
    });

    // SP.LINK.txt line 37: if i$="Q" goto lkend (always allowed, even when lost)
    if (key === 'Q') {
      const vandalResult = await applyVandalism(characterId);
      let msg = '';
      if (vandalResult.vandalized) {
        msg = `\r\n\x1b[31;1m${vandalResult.component} damaged by thieving vandals! (${vandalResult.damageDescription})\x1b[0m\r\n`;
        msg += '\x1b[33mHire a ship guard next time to prevent this!\x1b[0m\r\n';
      } else if (vandalResult.guardConsumed) {
        msg = '\r\n\x1b[32mYour ship guard protected your vessel.\x1b[0m\r\n';
      }
      return { output: `${msg}\r\n\x1b[32mGame saved. Thank you for playing SpacerQuest!\x1b[0m\r\n` };
    }

    // SP.LINK.txt line 39: if i$="X" print" Ship's Stats":goto shipstat (always allowed)
    if (key === 'X') {
      const ship = character?.ship;
      if (!ship) {
        return { output: '\r\n\x1b[31mNo ship found.\x1b[0m\r\n> ' };
      }
      const components = [
        { name: 'Hull',         strength: ship.hullStrength,        condition: ship.hullCondition },
        { name: 'Drive',        strength: ship.driveStrength,       condition: ship.driveCondition },
        { name: 'Cabin',        strength: ship.cabinStrength,       condition: ship.cabinCondition },
        { name: 'Life Support', strength: ship.lifeSupportStrength, condition: ship.lifeSupportCondition },
        { name: 'Weapons',      strength: ship.weaponStrength,      condition: ship.weaponCondition },
        { name: 'Navigation',   strength: ship.navigationStrength,  condition: ship.navigationCondition },
        { name: 'Robotics',     strength: ship.roboticsStrength,    condition: ship.roboticsCondition },
        { name: 'Shields',      strength: ship.shieldStrength,      condition: ship.shieldCondition },
        { name: 'Fuel Units',   strength: ship.fuel,                condition: ship.hullCondition },
        { name: 'Cargo Pods',   strength: ship.cargoPods,           condition: ship.hullCondition },
      ];
      const rows = components.map(c => {
        const nm = c.name.padEnd(15, '_');
        const str = String(c.strength).padStart(4, ' ');
        return `  ${nm}  Str:[${str}]  Cond:[${c.condition}]`;
      }).join('\r\n');
      return { output: `\r\n\x1b[36;1mShip's Stats: ${character?.shipName || 'Unknown'}\x1b[0m\r\n${rows}\r\n> ` };
    }

    // SP.LINK.txt line 40: if i$="Z" print" Your Statz":goto statz (always allowed)
    if (key === 'Z') {
      if (!character) return { output: '\r\n\x1b[31mError.\x1b[0m\r\n> ' };
      const credits = formatCredits(character.creditsHigh, character.creditsLow);
      const sc = Math.floor(character.score / 150);
      const originName = getSystemName(character.currentSystem);
      const destName = character.destination ? getSystemName(character.destination) : '---';
      const portOwned = character.portOwnership ? `System ${character.portOwnership.systemId}` : 'None';
      return {
        output: `\r\n\x1b[36;1m___________________________________________________\x1b[0m\r\n` +
          `\x1b[33;1m| ${character.name}'s Statz\x1b[0m\r\n` +
          `| Name of Ship............: ${character.shipName || '---'}\r\n` +
          `| Space Patrol Rank.......: ${character.rank}\r\n` +
          `| Credits.................: ${credits} cr\r\n` +
          `| Cargo to Deliver (pods).: ${character.cargoPods} ${character.cargoManifest || ''}\r\n` +
          `| Point of Origin.........: ${originName}\r\n` +
          `| Destination Point.......: ${destName}\r\n` +
          `| Completed Trips.........: ${character.tripsCompleted}\r\n` +
          `| Battles Won.............: ${character.battlesWon}\r\n` +
          `| Battles Lost............: ${character.battlesLost}\r\n` +
          `| Total Astrecs Travelled.: ${character.astrecsTraveled} Astrecs\r\n` +
          `| Total Cargo Delivered...: ${character.cargoDelivered} pods\r\n` +
          `| Total Rescues Performed.: ${character.rescuesPerformed}\r\n` +
          `| Total Score.............: ${character.score}\r\n` +
          `| Rating..................: ${sc}\r\n` +
          `| Space Port Owned........: ${portOwned}\r\n` +
          `| Trips Today.............: ${character.tripCount}\r\n` +
          `\x1b[36;1m___________________________________________________\x1b[0m\r\n> `,
      };
    }

    // SP.LINK.txt line 41: if i$="0" print" Rescue Service":gosub rescue (always allowed)
    if (key === '0') {
      return { output: '\x1b[2J\x1b[H', nextScreen: 'rescue-self' };
    }

    // SP.LINK.txt line 45: if ap>0 print"...Lost In Space!":goto linker
    // When lost, block all navigation — only Q/X/Z/0 are allowed (handled above)
    if (character?.isLost) {
      return { output: '\r\n\x1b[31m...Lost In Space! Use [0] to access Rescue Service.\x1b[0m\r\n> ' };
    }

    const actions: Record<string, () => Promise<ScreenResponse>> = {
      'B': async () => ({ output: '\x1b[2J\x1b[H', nextScreen: 'bank' }),
      'S': async () => ({ output: '\x1b[2J\x1b[H', nextScreen: 'shipyard' }),
      'P': async () => ({ output: '\x1b[2J\x1b[H', nextScreen: 'pub' }),
      'T': async () => ({ output: '\x1b[2J\x1b[H', nextScreen: 'traders' }),
      'N': async () => ({ output: '\x1b[2J\x1b[H', nextScreen: 'navigate' }),
      'R': async () => ({ output: '\x1b[2J\x1b[H', nextScreen: 'registry' }),
      'E': async () => ({ output: '\x1b[2J\x1b[H', nextScreen: 'extra-curricular' }),
      'G': async () => ({ output: '\x1b[2J\x1b[H', nextScreen: 'port-fuel-prices' }),
      'D': async () => {
        if (isClassicMode()) {
          return { output: '\r\n\x1b[33mClassic mode — wait for next day.\x1b[0m\r\n> ' };
        }
        return { output: '\x1b[2J\x1b[H', nextScreen: 'end-turn' };
      },
      'I': async () => {
        const membership = await prisma.allianceMembership.findUnique({ where: { characterId } });
        if (!membership || membership.alliance === 'NONE') {
          return { output: '\r\n\x1b[31mYou must be in an alliance to invest.\x1b[0m\r\n> ' };
        }
        return { output: '\x1b[2J\x1b[H', nextScreen: 'alliance-invest' };
      },
      'W': async () => {
        if (character?.currentSystem !== 17) {
          return { output: '\r\n\x1b[31mThe Wise One is only at Polaris-1 (System 17).\x1b[0m\r\n> ' };
        }
        return { output: '\x1b[2J\x1b[H', nextScreen: 'wise-one' };
      },
      'A': async () => {
        if (character?.currentSystem !== 18) {
          return { output: '\r\n\x1b[31mThe Sage is only at Mizar-9 (System 18).\x1b[0m\r\n> ' };
        }
        return { output: '\x1b[2J\x1b[H', nextScreen: 'sage' };
      },
      'F': async () => {
        if (!character?.portOwnership) {
          return { output: '\r\n\x1b[31mNot a port owner!\x1b[0m\r\n> ' };
        }
        return { output: '\x1b[2J\x1b[H', nextScreen: 'fuel-depot' };
      },
      '*': async () => {
        if (!character?.user.isAdmin) {
          return { output: '\r\n\x1b[31mAccess denied.\x1b[0m\r\n> ' };
        }
        return { output: '\x1b[2J\x1b[H', nextScreen: 'admin-menu' };
      },
    };

    const action = actions[key];
    if (action) {
      return await action();
    }

    return { output: '\r\n\x1b[31mInvalid command. Press B, S, P, T, N, or Q.\x1b[0m\r\n> ' };
  }
};
