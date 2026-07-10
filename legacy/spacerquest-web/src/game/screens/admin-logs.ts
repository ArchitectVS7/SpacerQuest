/**
 * SpacerQuest v4.0 - Admin Log Viewer Screen (SP.SYSOP log viewers)
 *
 * Consolidated viewer for game logs, battle records, bulletins, and port stats.
 * SP.SYSOP.txt: V=Visitor Log, G=Heroes, F=Port Fees, K=Battles, N=Alliance, B=Balance, A=Bulletins
 * SP.EDIT3.txt lines 352-442: File Manager for message logs
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';

interface LogViewerState {
  step: 'MENU' | 'VIEW';
  logType?: string;
  page: number;
}

const viewerStates = new Map<string, LogViewerState>();

export const AdminLogsScreen: ScreenModule = {
  name: 'admin-logs',

  render: async (characterId: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { user: { select: { isAdmin: true } } },
    });

    if (!character || !character.user.isAdmin) {
      return { output: '\x1b[31mAccess denied.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    viewerStates.set(characterId, { step: 'MENU', page: 1 });

    const output = `
\x1b[36;1m_________________________________________\x1b[0m
\x1b[31;1m      LOG VIEWER  (SP.SYSOP)              \x1b[0m
\x1b[36;1m_________________________________________\x1b[0m

\x1b[33;1mSelect log to view:\x1b[0m

  [V] Visitor Log       (sp.log — player logins)
  [K] Battle Log        (sp.top — battles fought)
  [F] Port Fee Report   (sp.fee — landing fees)
  [N] Alliance News     (sp.news — alliance holdings)
  [B] Balance Ledger    (sp.balance — trade activity)
  [A] Alliance Bulletins (alliance message boards)
  [P] Port Statistics   (sp.stk — visit counts)
  [L] Lost Ships        (sp.lost — rescue records)
  [M] Back to Admin Menu

> `;

    return { output };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const key = input.trim().toUpperCase();
    const state = viewerStates.get(characterId) || { step: 'MENU', page: 1 };

    if (key === 'M') {
      viewerStates.delete(characterId);
      return { output: '\x1b[2J\x1b[H', nextScreen: 'admin-menu' };
    }

    if (state.step === 'MENU') {
      const logViews: Record<string, () => Promise<ScreenResponse>> = {
        'V': renderVisitorLog,
        'K': renderBattleLog,
        'F': renderPortFees,
        'N': renderAllianceNews,
        'B': renderBalanceLedger,
        'A': renderBulletins,
        'P': renderPortStats,
        'L': renderLostShips,
      };

      const handler = logViews[key];
      if (handler) {
        state.step = 'VIEW';
        state.logType = key;
        viewerStates.set(characterId, state);
        return handler();
      }
      return { output: '\r\n\x1b[31mInvalid choice.\x1b[0m\r\n> ' };
    }

    if (state.step === 'VIEW') {
      // Any key returns to menu
      state.step = 'MENU';
      viewerStates.set(characterId, state);
      return { output: '\x1b[2J\x1b[H', nextScreen: 'admin-logs' };
    }

    return { output: '\r\n\x1b[31mUnknown state.\x1b[0m\r\n> ' };
  },
};

// ── SP.SYSOP V: Visitor Log (recent logins from GameLog VISITOR) ───────────
async function renderVisitorLog(): Promise<ScreenResponse> {
  const logs = await prisma.gameLog.findMany({
    where: { type: 'VISITOR' },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { character: { select: { name: true } } },
  });

  let out = `\r\n\x1b[33;1m=== SPACER VISITOR LOG ===\x1b[0m\r\n\r\n`;
  if (logs.length === 0) {
    out += `  (No visitor entries)\r\n`;
  } else {
    for (const log of logs) {
      const name = log.character?.name || 'Unknown';
      const date = log.createdAt.toISOString().slice(0, 16).replace('T', ' ');
      out += `  ${date}  ${name}  ${log.message}\r\n`;
    }
  }
  out += `\r\n\x1b[37m(${logs.length} entries shown)\x1b[0m\r\nPress any key to return...\r\n> `;
  return { output: out };
}

// ── SP.SYSOP K: Battle Log (recent battles from BattleRecord) ──────────────
async function renderBattleLog(): Promise<ScreenResponse> {
  const battles = await prisma.battleRecord.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { character: { select: { name: true } } },
  });

  let out = `\r\n\x1b[33;1m=== BATTLES FOUGHT LOG ===\x1b[0m\r\n\r\n`;
  if (battles.length === 0) {
    out += `  (No battle records)\r\n`;
  } else {
    out += `\x1b[33m  Date             Player          vs Enemy            Result   Rnds\x1b[0m\r\n`;
    for (const b of battles) {
      const name = b.character?.name?.padEnd(14) || 'Unknown'.padEnd(14);
      const enemy = b.enemyName.padEnd(18);
      const date = b.createdAt.toISOString().slice(0, 16).replace('T', ' ');
      out += `  ${date}  ${name}  ${enemy}  ${b.result.padEnd(7)}  ${b.rounds}\r\n`;
    }
  }
  out += `\r\n\x1b[37m(${battles.length} entries shown)\x1b[0m\r\nPress any key to return...\r\n> `;
  return { output: out };
}

// ── SP.SYSOP F: Port Fee Report ────────────────────────────────────────────
async function renderPortFees(): Promise<ScreenResponse> {
  const fees = await prisma.gameLog.findMany({
    where: { type: 'PORT_FEE' },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { character: { select: { name: true } } },
  });

  let out = `\r\n\x1b[33;1m=== SPACE PORT FEES COLLECTION ===\x1b[0m\r\n\r\n`;
  if (fees.length === 0) {
    out += `  (No fee records)\r\n`;
  } else {
    for (const f of fees) {
      const name = f.character?.name || 'Unknown';
      const date = f.createdAt.toISOString().slice(0, 16).replace('T', ' ');
      out += `  ${date}  ${name}  ${f.message}\r\n`;
    }
  }
  out += `\r\n\x1b[37m(${fees.length} entries shown)\x1b[0m\r\nPress any key to return...\r\n> `;
  return { output: out };
}

// ── SP.SYSOP N: Alliance News (alliance system holdings) ───────────────────
async function renderAllianceNews(): Promise<ScreenResponse> {
  const systems = await prisma.allianceSystem.findMany({
    orderBy: { systemId: 'asc' },
  });

  let out = `\r\n\x1b[33;1m=== ALLIANCE HOLDINGS ===\x1b[0m\r\n\r\n`;
  if (systems.length === 0) {
    out += `  (No alliance systems)\r\n`;
  } else {
    out += `\x1b[33m  Sys  Alliance          DEFCON  Owner\x1b[0m\r\n`;
    for (const s of systems) {
      out += `   ${String(s.systemId).padStart(2)}  ${s.alliance.padEnd(16)}  ${s.defconLevel}       ${s.ownerCharacterId || '(none)'}\r\n`;
    }
  }
  out += `\r\nPress any key to return...\r\n> `;
  return { output: out };
}

// ── SP.SYSOP B: Balance Ledger (trade activity) ───────────────────────────
async function renderBalanceLedger(): Promise<ScreenResponse> {
  const logs = await prisma.gameLog.findMany({
    where: { type: 'TRADE' },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { character: { select: { name: true } } },
  });

  let out = `\r\n\x1b[33;1m=== BALANCE LEDGER ===\x1b[0m\r\n\r\n`;
  if (logs.length === 0) {
    out += `  (No trade records)\r\n`;
  } else {
    for (const log of logs) {
      const name = log.character?.name || 'Unknown';
      const date = log.createdAt.toISOString().slice(0, 16).replace('T', ' ');
      out += `  ${date}  ${name}  ${log.message}\r\n`;
    }
  }
  out += `\r\n\x1b[37m(${logs.length} entries shown)\x1b[0m\r\nPress any key to return...\r\n> `;
  return { output: out };
}

// ── SP.SYSOP A: Alliance Bulletins ─────────────────────────────────────────
async function renderBulletins(): Promise<ScreenResponse> {
  const posts = await prisma.bulletinPost.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  let out = `\r\n\x1b[33;1m=== ALLIANCE BULLETINS ===\x1b[0m\r\n\r\n`;
  if (posts.length === 0) {
    out += `  (No bulletin posts)\r\n`;
  } else {
    for (const p of posts) {
      const date = p.createdAt.toISOString().slice(0, 16).replace('T', ' ');
      out += `  ${date}  [${p.alliance}] ${p.authorName}: ${p.message.slice(0, 60)}\r\n`;
    }
  }
  out += `\r\n\x1b[37m(${posts.length} entries shown)\x1b[0m\r\nPress any key to return...\r\n> `;
  return { output: out };
}

// ── SP.EDIT3 Port Statistics (visit counts per system) ─────────────────────
async function renderPortStats(): Promise<ScreenResponse> {
  const systems = await prisma.starSystem.findMany({
    where: { type: 'CORE' },
    orderBy: { id: 'asc' },
  });

  let out = `\r\n\x1b[33;1m=== PORT STATISTICS ===\x1b[0m\r\n\r\n`;
  out += `\x1b[33m  Sys  Name              Visits  Port Owner       DEFCON\x1b[0m\r\n`;
  for (const s of systems) {
    out += `   ${String(s.id).padStart(2)}  ${s.name.padEnd(16)}  ${String(s.visitCount).padStart(6)}  ${(s.portOwner || '(none)').padEnd(15)}  ${s.defconLevel}\r\n`;
  }
  out += `\r\nPress any key to return...\r\n> `;
  return { output: out };
}

// ── SP.EDIT2 Lost Ships ────────────────────────────────────────────────────
async function renderLostShips(): Promise<ScreenResponse> {
  const lostChars = await prisma.character.findMany({
    where: { isLost: true },
    select: { name: true, shipName: true, lostLocation: true, currentSystem: true },
  });

  // Also check rescue-related game logs
  const rescueLogs = await prisma.gameLog.findMany({
    where: { type: 'RESCUE' },
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: { character: { select: { name: true } } },
  });

  let out = `\r\n\x1b[33;1m=== LOST SHIPS / RESCUE LOG ===\x1b[0m\r\n\r\n`;

  if (lostChars.length > 0) {
    out += `\x1b[31mCurrently Lost:\x1b[0m\r\n`;
    for (const c of lostChars) {
      out += `  ${c.name} (${c.shipName || 'Unnamed'}) — Lost at system ${c.lostLocation || c.currentSystem}\r\n`;
    }
    out += '\r\n';
  } else {
    out += `  No ships currently lost.\r\n\r\n`;
  }

  if (rescueLogs.length > 0) {
    out += `\x1b[32mRecent Rescues:\x1b[0m\r\n`;
    for (const log of rescueLogs) {
      const date = log.createdAt.toISOString().slice(0, 16).replace('T', ' ');
      out += `  ${date}  ${log.message}\r\n`;
    }
  }

  out += `\r\nPress any key to return...\r\n> `;
  return { output: out };
}
