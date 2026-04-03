/**
 * SpacerQuest v4.0 - Port Accounts Screen
 *
 * SP.REAL.txt start1 section (lines 40-57):
 *   Port Accounts & Fuel Depot Ltd — gateway menu.
 *   M — Space port stock report       (port subroutine, lines 290-325)
 *   N — Fee report                    (copy"sp.fee", line 47)
 *   P — Prospectus                    (proshow, lines 62-79)
 *   B — Buy a port                    (bshow/buy/buy1, lines 59-98)
 *   Q — Quit to main menu
 *   Owner-only (ap$<>""):
 *     S — Sell port                   (sell/sell1, lines 100-124)
 *     W — Withdraw from port bank     (draw, lines 126-145)
 *     D — Deposit to port bank        (depo, lines 147-166)
 *     F — Fuel depot                  (fuel subroutine → fuel-depot screen)
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { purchasePort, sellPort, getSystemName } from '../systems/economy.js';
import { formatCredits, getTotalCredits, addCredits, subtractCredits } from '../utils.js';
import { CORE_SYSTEM_NAMES, CORE_SYSTEMS, PORT_BASE_PRICE } from '../constants.js';

// ── State machine ─────────────────────────────────────────────────────────────
type Step =
  | null
  | 'stock-ratio'          // waiting for ratio 1-100 after M
  | 'buy-system'           // waiting for system 1-14
  | { k: 'buy-sys-ok'; sys: number }    // waiting Y/N "Is X your choice?"
  | { k: 'buy-price-ok'; sys: number }  // waiting Y/N "Buy it?"
  | 'sell-prompt'          // waiting for (S)ell or [Q]uit
  | 'sell-system'          // waiting for system 1-14
  | { k: 'sell-sys-ok'; sys: number }
  | { k: 'sell-price-ok'; sys: number }
  | 'withdraw'
  | 'deposit';

const stepMap = new Map<string, Step>();

// ── Screen ────────────────────────────────────────────────────────────────────

export const PortAccountsScreen: ScreenModule = {
  name: 'port-accounts',

  render: async (characterId: string): Promise<ScreenResponse> => {
    stepMap.set(characterId, null);
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { portOwnership: true },
    });
    if (!character) return { output: '\x1b[31mError\x1b[0m\r\n', nextScreen: 'main-menu' };

    const credStr = formatCredits(character.creditsHigh, character.creditsLow);
    const port = character.portOwnership;
    const portName = port ? getSystemName(port.systemId) : null;
    const bankStr = port ? formatCredits(port.bankCreditsHigh, port.bankCreditsLow) : null;

    let out = '\x1b[2J\x1b[H';
    out += '\x1b[36;1m______________________________________________________\x1b[0m\r\n';
    out += '\x1b[33;1m  :$: Space Port Accounts & Fuel Depot Ltd :$:        \x1b[0m\r\n';
    out += '\x1b[36;1m______________________________________________________\x1b[0m\r\n\r\n';
    out += `\x1b[32mGreetings \x1b[33m${character.name}\x1b[32m, Welcome...!!!\x1b[0m\r\n\r\n`;
    out += `\x1b[32m[Cr:\x1b[0m${credStr}\x1b[32m:][:${character.name} Port Accounts:](?=Menu):\x1b[0m\r\n\r\n`;
    out += '  (M)arket    - Space port stock activity report\r\n';
    out += '  (N)ews      - Port fee collection report\r\n';
    out += '  (P)rospectus- System investment listing\r\n';
    out += '  (B)uy       - Purchase a space port\r\n';
    if (port) {
      out += `\r\n  \x1b[33mPort Owner:\x1b[0m ${portName}   \x1b[32mBank Acct:\x1b[0m ${bankStr} cr\r\n`;
      out += '  (S)ell      - Sell your space port\r\n';
      out += '  (W)ithdraw  - Withdraw from port bank\r\n';
      out += '  (D)eposit   - Deposit to port bank\r\n';
      out += '  (F)uel Depot- Manage fuel operations\r\n';
    }
    out += '  [Q]uit      - Return to main menu\r\n\r\n';
    out += '\x1b[32mCommand:\x1b[0m\r\n> ';
    return { output: out };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const key = input.trim().toUpperCase();
    const step = stepMap.get(characterId) ?? null;

    // ── Top-level menu ────────────────────────────────────────────────────────
    if (step === null) {
      if (!key || key === 'Q') {
        stepMap.delete(characterId);
        return { output: '\x1b[33mLeaving\x1b[0m\r\n', nextScreen: 'main-menu' };
      }
      if (key === 'M') {
        stepMap.set(characterId, 'stock-ratio');
        return {
          output:
            '\r\n\x1b[37;1m-------------------------\x1b[0m\r\n' +
            'Space Port Stock Activity\r\n' +
            '\x1b[37;1m-------------------------\x1b[0m\r\n' +
            'Choose a projection ratio: [1-100] (<C-R>=1:1)\r\n' +
            'Input number: (Q)uits: ',
        };
      }
      if (key === 'N') return renderFeeReport(characterId);
      if (key === 'P') {
        const prosp = await renderProspectus();
        return { output: prosp + '\r\n\x1b[32m> \x1b[0m' };
      }
      if (key === 'B') {
        const character = await prisma.character.findUnique({
          where: { id: characterId },
          include: { portOwnership: true },
        });
        if (character?.portOwnership) {
          const pName = getSystemName(character.portOwnership.systemId);
          return { output: `\r\n\x1b[31mYou already own the ${pName} Space Port!\x1b[0m\r\n> ` };
        }
        const prosp = await renderProspectus();
        stepMap.set(characterId, 'buy-system');
        return { output: prosp + '\r\n\x1b[32mChoice: (1-14) (Q)uits:\x1b[0m\r\n> ' };
      }
      // Owner-only
      if (key === 'S' || key === 'W' || key === 'D' || key === 'F') {
        const character = await prisma.character.findUnique({
          where: { id: characterId },
          include: { portOwnership: true },
        });
        if (!character?.portOwnership) {
          return { output: '\r\n\x1b[31mNot a port owner!\x1b[0m\r\n> ' };
        }
        if (key === 'F') {
          stepMap.delete(characterId);
          return { output: '\x1b[2J\x1b[H', nextScreen: 'fuel-depot' };
        }
        const credStr = formatCredits(character.creditsHigh, character.creditsLow);
        const bankStr = formatCredits(character.portOwnership.bankCreditsHigh, character.portOwnership.bankCreditsLow);
        if (key === 'S') {
          stepMap.set(characterId, 'sell-prompt');
          return {
            output: `\r\n\x1b[32m[:Cr:${credStr}:][:Realty Market:]: (S)ell [Q]uit:\x1b[0m\r\n> `,
          };
        }
        if (key === 'W') {
          stepMap.set(characterId, 'withdraw');
          return {
            output: `\r\n\x1b[32m[:Cr:${credStr}:][:Port Acct:${bankStr}][Q]uit:\x1b[0m\r\n...Withdraw?  : `,
          };
        }
        if (key === 'D') {
          stepMap.set(characterId, 'deposit');
          return {
            output: `\r\n\x1b[32m[:Cr:${credStr}:][:Port Acct:${bankStr}][Q]uit:\x1b[0m\r\n...Deposit?  : `,
          };
        }
      }
      // unrecognised
      return { output: '\r\n\x1b[31m...Whoops!...\x1b[0m\r\n> ' };
    }

    // ── Stock-ratio input ─────────────────────────────────────────────────────
    if (step === 'stock-ratio') {
      stepMap.set(characterId, null);
      const raw = input.trim();
      if (!raw || raw.toUpperCase() === 'Q') return PortAccountsScreen.render(characterId);
      const ratio = parseInt(raw, 10);
      if (isNaN(ratio) || ratio < 1 || ratio > 100) {
        return { output: '\r\n\x1b[31m...Enter 1-100...\x1b[0m\r\nInput number: (Q)uits: ' };
      }
      return renderStockReport(ratio);
    }

    // ── Buy: system number input ──────────────────────────────────────────────
    if (step === 'buy-system') {
      if (key === 'Q') {
        stepMap.set(characterId, null);
        return PortAccountsScreen.render(characterId);
      }
      const sys = parseInt(key, 10);
      if (isNaN(sys) || sys < 1 || sys > 14) {
        return { output: '\r\n\x1b[31m...Enter 1-14...\x1b[0m\r\nChoice: (1-14) (Q)uits:\r\n> ' };
      }
      const sysName = CORE_SYSTEM_NAMES[sys] ?? `System ${sys}`;
      stepMap.set(characterId, { k: 'buy-sys-ok', sys });
      return { output: `\r\nIs ${sysName} your choice? [Y]/(N): ` };
    }

    // ── Buy: system confirm ───────────────────────────────────────────────────
    if (typeof step === 'object' && step.k === 'buy-sys-ok') {
      if (key !== 'Y') {
        stepMap.set(characterId, 'buy-system');
        return { output: '\r\n\x1b[33mNo\x1b[0m\r\nChoice: (1-14) (Q)uits:\r\n> ' };
      }
      const sys = step.sys;
      const existing = await prisma.portOwnership.findUnique({ where: { systemId: sys } });
      if (existing) {
        stepMap.set(characterId, 'buy-system');
        const sysName = CORE_SYSTEM_NAMES[sys] ?? `System ${sys}`;
        return {
          output: `\r\n\x1b[31m${sysName} Space Port is already owned!\x1b[0m\r\nChoice: (1-14) (Q)uits:\r\n> `,
        };
      }
      const character = await prisma.character.findUnique({ where: { id: characterId } });
      if (!character) return { output: '\x1b[31mError\x1b[0m\r\n', nextScreen: 'main-menu' };
      const total = getTotalCredits(character.creditsHigh, character.creditsLow);
      if (total < PORT_BASE_PRICE) {
        stepMap.set(characterId, 'buy-system');
        return {
          output: `\r\n\x1b[31mNot enough credits! Need ${PORT_BASE_PRICE.toLocaleString()} cr\x1b[0m\r\nChoice: (1-14) (Q)uits:\r\n> `,
        };
      }
      const sysName = CORE_SYSTEM_NAMES[sys] ?? `System ${sys}`;
      stepMap.set(characterId, { k: 'buy-price-ok', sys });
      return {
        output: `\r\n\x1b[33mYes\x1b[0m\r\n${sysName} requires a total payment of ${PORT_BASE_PRICE.toLocaleString()} cr to purchase\r\n\r\n...Buy it? [Y]/(N): `,
      };
    }

    // ── Buy: price confirm ────────────────────────────────────────────────────
    if (typeof step === 'object' && step.k === 'buy-price-ok') {
      if (key !== 'Y') {
        stepMap.set(characterId, 'buy-system');
        return { output: '\r\n\x1b[33mNo\x1b[0m\r\nChoice: (1-14) (Q)uits:\r\n> ' };
      }
      const character = await prisma.character.findUnique({ where: { id: characterId } });
      if (!character) return { output: '\x1b[31mError\x1b[0m\r\n', nextScreen: 'main-menu' };
      const result = await purchasePort(characterId, step.sys, character.creditsHigh, character.creditsLow);
      stepMap.set(characterId, null);
      if (!result.success) {
        return { output: `\r\n\x1b[31m${result.message}\x1b[0m\r\n> ` };
      }
      return { output: `\r\n\x1b[32mYes\r\nYou got a deal!\x1b[0m\r\n`, nextScreen: 'port-accounts' };
    }

    // ── Sell: initial prompt (S or Q) ─────────────────────────────────────────
    if (step === 'sell-prompt') {
      if (key === 'Q') {
        stepMap.set(characterId, null);
        return PortAccountsScreen.render(characterId);
      }
      if (key === 'S') {
        const prosp = await renderProspectus();
        stepMap.set(characterId, 'sell-system');
        return { output: '\r\n\x1b[33mSelling\x1b[0m\r\n' + prosp + '\r\n\x1b[32mChoice: (1-14) (Q)uits:\x1b[0m\r\n> ' };
      }
      return { output: '\r\n\x1b[31m...Whoops!...try it again...\x1b[0m\r\n> ' };
    }

    // ── Sell: system number input ─────────────────────────────────────────────
    if (step === 'sell-system') {
      if (key === 'Q') {
        stepMap.set(characterId, 'sell-prompt');
        const character = await prisma.character.findUnique({ where: { id: characterId } });
        const credStr = character ? formatCredits(character.creditsHigh, character.creditsLow) : '0';
        return { output: `\r\n\x1b[33mLeaving\x1b[0m\r\n\x1b[32m[:Cr:${credStr}:][:Realty Market:]: (S)ell [Q]uit:\x1b[0m\r\n> ` };
      }
      const sys = parseInt(key, 10);
      if (isNaN(sys) || sys < 1 || sys > 14) {
        return { output: '\r\n\x1b[31m...Enter 1-14...\x1b[0m\r\nChoice: (1-14) (Q)uits:\r\n> ' };
      }
      const sysName = CORE_SYSTEM_NAMES[sys] ?? `System ${sys}`;
      stepMap.set(characterId, { k: 'sell-sys-ok', sys });
      return { output: `\r\nIs ${sysName} your choice? [Y]/(N): ` };
    }

    // ── Sell: system confirm ──────────────────────────────────────────────────
    if (typeof step === 'object' && step.k === 'sell-sys-ok') {
      if (key !== 'Y') {
        stepMap.set(characterId, 'sell-system');
        return { output: '\r\n\x1b[33mNo\x1b[0m\r\nChoice: (1-14) (Q)uits:\r\n> ' };
      }
      const sys = step.sys;
      const character = await prisma.character.findUnique({
        where: { id: characterId },
        include: { portOwnership: true },
      });
      if (!character?.portOwnership || character.portOwnership.systemId !== sys) {
        const sysName = CORE_SYSTEM_NAMES[sys] ?? `System ${sys}`;
        stepMap.set(characterId, 'sell-prompt');
        return {
          output: `\r\n\x1b[31m${sysName} Space Port not yours to sell!\x1b[0m\r\n> `,
        };
      }
      // SP.REAL.S:112: if m6>1 i=(m6/2) else i=0 → resale = PORT_BASE_PRICE / 2
      const resale = Math.floor(PORT_BASE_PRICE / 2);
      stepMap.set(characterId, { k: 'sell-price-ok', sys });
      return {
        output: `\r\n\x1b[33mYes\x1b[0m\r\nWe'll buy it back for ${resale.toLocaleString()} cr\r\n\r\n...Sell it? [Y]/(N): `,
      };
    }

    // ── Sell: price confirm ───────────────────────────────────────────────────
    if (typeof step === 'object' && step.k === 'sell-price-ok') {
      if (key !== 'Y') {
        stepMap.set(characterId, 'sell-prompt');
        const character = await prisma.character.findUnique({ where: { id: characterId } });
        const credStr = character ? formatCredits(character.creditsHigh, character.creditsLow) : '0';
        return { output: `\r\n\x1b[33mNo\x1b[0m\r\n\x1b[32m[:Cr:${credStr}:][:Realty Market:]: (S)ell [Q]uit:\x1b[0m\r\n> ` };
      }
      const character = await prisma.character.findUnique({ where: { id: characterId } });
      if (!character) return { output: '\x1b[31mError\x1b[0m\r\n', nextScreen: 'main-menu' };
      const result = await sellPort(characterId, step.sys, character.creditsHigh, character.creditsLow);
      stepMap.set(characterId, null);
      if (!result.success) {
        return { output: `\r\n\x1b[31m${result.message}\x1b[0m\r\n> ` };
      }
      return {
        output: `\r\n\x1b[32mYes\r\nTransaction Completed! ${result.message}\x1b[0m\r\n`,
        nextScreen: 'port-accounts',
      };
    }

    // ── Withdraw ──────────────────────────────────────────────────────────────
    if (step === 'withdraw') {
      const raw = input.trim();
      if (!raw || raw.toUpperCase() === 'Q' || raw === '0') {
        stepMap.set(characterId, null);
        return { output: '\x1b[33mLeaving...\x1b[0m\r\n', nextScreen: 'port-accounts' };
      }
      return processWithdraw(characterId, raw, stepMap);
    }

    // ── Deposit ───────────────────────────────────────────────────────────────
    if (step === 'deposit') {
      const raw = input.trim();
      if (!raw || raw.toUpperCase() === 'Q' || raw === '0') {
        stepMap.set(characterId, null);
        return { output: '\x1b[33mLeaving\x1b[0m\r\n', nextScreen: 'port-accounts' };
      }
      return processDeposit(characterId, raw, stepMap);
    }

    return PortAccountsScreen.render(characterId);
  },
};

// ── Withdraw (SP.REAL.S draw: lines 126-145) ──────────────────────────────────
// Original encodes amount as multi-char: last 4 digits = low units (0-9999),
// leading digits = high units (×10000).  "25000" → ib=2, ia=5000 → 25000 cr.
async function processWithdraw(
  characterId: string,
  raw: string,
  sm: Map<string, Step>,
): Promise<ScreenResponse> {
  if (raw.length > 8) {
    return { output: '\r\n\x1b[31mToo Much!\x1b[0m\r\n...Withdraw?  : ' };
  }
  const lw = raw.length;
  const iaStr = lw <= 4 ? raw : raw.slice(-4);
  const ibStr = lw > 4 ? raw.slice(0, lw - 4) : '0';
  const ia = parseInt(iaStr, 10) || 0;
  const ib = parseInt(ibStr, 10) || 0;
  if (ia === 0 && ib === 0) {
    return { output: '\r\n\x1b[33mNone\x1b[0m\r\n...Withdraw?  : ' };
  }
  const requested = ib * 10000 + ia;

  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { portOwnership: true },
  });
  if (!character?.portOwnership) {
    return { output: '\x1b[31mNot a port owner!\x1b[0m\r\n', nextScreen: 'main-menu' };
  }
  const port = character.portOwnership;
  const bankTotal = getTotalCredits(port.bankCreditsHigh, port.bankCreditsLow);
  if (requested > bankTotal) {
    return { output: '\r\n\x1b[31mToo Much!\x1b[0m\r\n...Withdraw?  : ' };
  }

  const { high: newBH, low: newBL } = subtractCredits(port.bankCreditsHigh, port.bankCreditsLow, requested);
  const { high: newCH, low: newCL } = addCredits(character.creditsHigh, character.creditsLow, requested);
  await prisma.$transaction([
    prisma.portOwnership.update({ where: { id: port.id }, data: { bankCreditsHigh: newBH, bankCreditsLow: newBL } }),
    prisma.character.update({ where: { id: characterId }, data: { creditsHigh: newCH, creditsLow: newCL } }),
  ]);
  return {
    output: `\r\n\x1b[32mWithdrew ${requested.toLocaleString()} cr  [Cr:${formatCredits(newCH, newCL)}]  [Port Acct:${formatCredits(newBH, newBL)}]\x1b[0m\r\n...Withdraw?  : `,
  };
}

// ── Deposit (SP.REAL.S depo: lines 147-166) ───────────────────────────────────
async function processDeposit(
  characterId: string,
  raw: string,
  sm: Map<string, Step>,
): Promise<ScreenResponse> {
  if (raw.length > 8) {
    return { output: '\r\n\x1b[31mToo Much!\x1b[0m\r\n...Deposit?  : ' };
  }
  const lw = raw.length;
  const iaStr = lw <= 4 ? raw : raw.slice(-4);
  const ibStr = lw > 4 ? raw.slice(0, lw - 4) : '0';
  const ia = parseInt(iaStr, 10) || 0;
  const ib = parseInt(ibStr, 10) || 0;
  if (ia === 0 && ib === 0) {
    return { output: '\r\n\x1b[33mNone\x1b[0m\r\n...Deposit?  : ' };
  }
  const requested = ib * 10000 + ia;

  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { portOwnership: true },
  });
  if (!character?.portOwnership) {
    return { output: '\x1b[31mNot a port owner!\x1b[0m\r\n', nextScreen: 'main-menu' };
  }
  const port = character.portOwnership;
  const crTotal = getTotalCredits(character.creditsHigh, character.creditsLow);
  if (requested > crTotal) {
    return { output: '\r\n\x1b[31mToo Much!\x1b[0m\r\n...Deposit?  : ' };
  }

  const { high: newCH, low: newCL } = subtractCredits(character.creditsHigh, character.creditsLow, requested);
  const { high: newBH, low: newBL } = addCredits(port.bankCreditsHigh, port.bankCreditsLow, requested);
  await prisma.$transaction([
    prisma.character.update({ where: { id: characterId }, data: { creditsHigh: newCH, creditsLow: newCL } }),
    prisma.portOwnership.update({ where: { id: port.id }, data: { bankCreditsHigh: newBH, bankCreditsLow: newBL } }),
  ]);
  return {
    output: `\r\n\x1b[32mDeposited ${requested.toLocaleString()} cr  [Cr:${formatCredits(newCH, newCL)}]  [Port Acct:${formatCredits(newBH, newBL)}]\x1b[0m\r\n...Deposit?  : `,
  };
}

// ── Fee report (SP.REAL.S start1 N key — copy"sp.fee") ────────────────────────
async function renderFeeReport(characterId: string): Promise<ScreenResponse> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { portOwnership: true },
  });
  const systemId = character?.portOwnership?.systemId;
  const label = systemId ? (CORE_SYSTEM_NAMES[systemId] ?? `System ${systemId}`) : 'All Systems';
  const fees = await prisma.gameLog.findMany({
    where: systemId ? { type: 'PORT_FEE', systemId } : { type: 'PORT_FEE' },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { character: { select: { name: true, shipName: true } } },
  });

  let out = '\r\n';
  out += '\x1b[37m-------------------------------------------------------------------------------\x1b[0m\r\n';
  out += `Space Port Collected Fees List for: \x1b[33m${label}\x1b[0m\r\n`;
  out += '\x1b[37m-------------------------------------------------------------------------------\x1b[0m\r\n';
  if (fees.length === 0) {
    out += 'No fees collected yet.\r\n';
  } else {
    for (const entry of fees) {
      const date = entry.createdAt.toISOString().slice(0, 10);
      const name = entry.character?.name ?? 'Unknown';
      const ship = entry.character?.shipName ?? '';
      const meta = entry.metadata as Record<string, any> | null;
      const fee = meta?.fee ?? 0;
      const nameShip = ship ? `${name}/${ship}` : name;
      out += `${date}: ${nameShip.padEnd(34)} - Fee Paid: ${fee} cr\r\n`;
    }
  }
  out += '\x1b[37m-------------------------------------------------------------------------------\x1b[0m\r\n\x1b[32m> \x1b[0m';
  return { output: out };
}

// ── Prospectus (SP.REAL.S proshow: lines 62-79) ───────────────────────────────
async function renderProspectus(): Promise<string> {
  const ownerships = await prisma.portOwnership.findMany({
    where: { systemId: { gte: 1, lte: 14 } },
    include: { character: { select: { name: true } } },
  });
  const ownerMap: Record<number, { name: string; date: string }> = {};
  for (const o of ownerships) {
    ownerMap[o.systemId] = {
      name: o.character?.name ?? '?',
      date: o.purchaseDate ? o.purchaseDate.toISOString().slice(0, 10) : '',
    };
  }
  const priceDisp = `${(PORT_BASE_PRICE / 10000).toFixed(0).padStart(3)}0,000`;
  let out = '\r\n\x1b[37m----------------------------------------------------------------------\x1b[0m\r\n';
  out += ' System Space Port Investment Prospectus\r\n';
  out += '\x1b[37m----------------------------------------------------------------------\x1b[0m\r\n';
  for (let x = 1; x <= 14; x++) {
    const name = (CORE_SYSTEM_NAMES[x] ?? `System ${x}`).padEnd(12, '.').slice(0, 12);
    const o = ownerMap[x];
    const ownerLabel = (o?.name ?? '(for sale)').padEnd(21, '.').slice(0, 21);
    const dateLabel = o?.date ?? '';
    const n = x < 10 ? ` ${x}` : `${x}`;
    out += `${n}. ${name}..Value:${priceDisp}...Owner:${ownerLabel}.Date:${dateLabel}\r\n`;
  }
  out += '\x1b[37m----------------------------------------------------------------------\x1b[0m\r\n';
  return out;
}

// ── Stock report (SP.REAL.S port:/prtr: lines 290-325) ────────────────────────
async function renderStockReport(ratio: number): Promise<ScreenResponse> {
  const logs = await prisma.gameLog.findMany({
    where: { type: 'SYSTEM', metadata: { path: ['event'], equals: 'DOCK' } },
    select: { metadata: true },
  });
  const counts: Record<number, number> = {};
  for (let i = 1; i <= CORE_SYSTEMS; i++) counts[i] = 0;
  for (const log of logs) {
    const meta = log.metadata as Record<string, any> | null;
    const sid = meta?.systemId as number | undefined;
    if (sid && sid >= 1 && sid <= CORE_SYSTEMS) counts[sid] = (counts[sid] || 0) + 1;
  }
  let out =
    `\r\n\x1b[37;1m  Projection Ratio = ${ratio}:1\x1b[0m\r\n\r\n` +
    `  Space_Port_____Trips`;
  out += `____.____|____.____|____.____|____.____|____.____|____.____|__\r\n`;
  for (let x = 1; x <= CORE_SYSTEMS; x++) {
    const y = counts[x] || 0;
    const name = (CORE_SYSTEM_NAMES[x] || `System ${x}`).padEnd(13).slice(0, 13);
    const tripStr = ('____' + y).slice(-5);
    const iz = y >= ratio ? Math.min(Math.floor(y / ratio), 60) : 0;
    out += `  ${name}${tripStr}${'_'.repeat(iz)}\r\n`;
  }
  out += `\r\n\x1b[37;1m....type anykey to go on....\x1b[0m\r\n> `;
  return { output: out };
}
