/**
 * SpacerQuest v4.0 - Traders Cargo Screen (SP.CARGO.S)
 *
 * Original flow (SP.CARGO.S):
 *   - greet → check cc flag (manifest exists for today?) → show 4-manifest board
 *   - board/chart: show 4 contracts; player picks 1-4 or Q
 *   - boardx: validate prereqs (ship, no existing contract, enough pods)
 *   - fine: accept contract, set mission state
 *
 * Original source: SP.CARGO.S
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import {
  generateManifestBoard,
  getCargoDescription,
  getSystemName,
  ManifestEntry,
} from '../systems/economy.js';
import { CARGO_TYPES } from '../constants.js';
import { pendingWins } from './topgun.js';

// ============================================================================
// Session state — pending confirmation (characterId → manifest index 0-3)
// ============================================================================
const pendingManifestChoice = new Map<string, { index: number; entry: ManifestEntry }>();

// SP.CARGO.S:33 — commandant prompt pending (waiting for Y/N response)
const pendingCommandant = new Set<string>();
// Characters who declined the Commandant this session — don't re-prompt until next render cycle
const declinedCommandant = new Set<string>();

// ============================================================================
// HELPERS
// ============================================================================

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * Render the 4-manifest board (SP.CARGO.S:114-171)
 * Original chart subroutine shows all 4 contracts in a formatted table.
 */
function renderManifestBoard(manifests: ManifestEntry[], systemName: string, date: string): string {
  const padEnd = (s: string, n: number) => s.padEnd(n, ' ');
  const padStart = (s: string, n: number) => s.padStart(n, ' ');

  let out = `\r\n\x1b[36;1mCargo Manifest for ${systemName} System - ${date}\x1b[0m\r\n`;
  out += ` ${'_'.repeat(64)}\r\n`;
  out += `| ${'─'.repeat(62)} |\r\n`;
  out += `|    Cargo                 Val  Destination   Dis Paymnt  Fuel   |\r\n`;
  out += `|    -------------------   ---  -----------   --- ------  ----   |\r\n`;

  for (let i = 0; i < manifests.length; i++) {
    const m = manifests[i];
    const cargo = padEnd((CARGO_TYPES[m.cargoType] ?? 'Unknown').slice(0, 19), 19);
    const val = padStart(String(m.valuePerPod), 3);
    const dest = padEnd(m.destName.slice(0, 11), 11);
    const dis = padStart(String(m.distance), 3);
    const pay = padStart(String(m.payment), 6);
    const fuel = padStart(String(m.fuelRequired), 4);
    out += `| ${i + 1}. ${cargo}  ${val}  ${dest}  ${dis} ${pay}  ${fuel}   |\r\n`;
  }

  out += `|__${'_'.repeat(62)}|\r\n`;
  return out;
}

// ============================================================================
// SCREEN MODULE
// ============================================================================

export const TradersCargoScreen: ScreenModule = {
  name: 'traders-cargo',

  render: async (characterId: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true },
    });

    if (!character || !character.ship) {
      return { output: '\x1b[31mError: No ship found.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    // SP.CARGO.S:31 — if q1>0 print "You have a valid contract": goto board
    // Any player with cargo already loaded gets routed back to traders (board display).
    if (character.cargoPods > 0) {
      return {
        output: '\x1b[2J\x1b[H\r\n\x1b[33mYou have a valid contract\x1b[0m\r\n',
        nextScreen: 'traders',
      };
    }

    // SP.CARGO.S:32-38 — Space Commandant promotion prompt
    // Conditions: (w1+p1)>=50 AND kk!=9 AND lifeSupportName NOT "LSS C*" AND hullName NOT "Ast*"
    const ship = character.ship!;
    const canCommandant =
      (ship.weaponStrength + ship.shieldStrength) >= 50 &&
      character.missionType !== 9 &&
      !ship.lifeSupportName?.startsWith('LSS C') &&
      !ship.hullName?.startsWith('Ast');
    if (canCommandant && !pendingCommandant.has(characterId) && !declinedCommandant.has(characterId)) {
      pendingCommandant.add(characterId);
      return {
        output:
          `\x1b[2J\x1b[H\r\n\x1b[33;1mWelcome ${character.name} to the Cargo Dispatch Office\x1b[0m\r\n\r\n` +
          '\x1b[33mThe Space Commandant wishes to speak to you \x1b[37;1m[Y]\x1b[0m\x1b[33m/(N):\x1b[0m ',
      };
    }
    // Clear declined flag so the Commandant can re-appear on future cargo visits
    declinedCommandant.delete(characterId);

    // SP.CARGO.S:44 — boardx: if h1<1 print "You need a ship first!"
    if (!character.ship.hullStrength) {
      return { output: '\r\n\x1b[31mYou need a ship first!\x1b[0m\r\n', nextScreen: 'traders' };
    }

    // SP.CARGO.S:47 — gosub upod: if x<2 print "No servicable cargo pods!"
    // SP.CARGO.S upod daily penalty (line 290): second visit same day + trips>0 → y/2
    const today = getTodayDate();
    const isSecondVisitToday = character.manifestDate === today && character.tripCount > 0;
    const effectivePods = isSecondVisitToday
      ? Math.floor(character.ship.maxCargoPods / 2)
      : character.ship.maxCargoPods;
    if (effectivePods < 2) {
      return {
        output: '\r\n\x1b[31mNo servicable cargo pods!\x1b[0m\r\n',
        nextScreen: 'traders',
      };
    }

    // SP.CARGO.S:29 — if cc<1 goto manif (generate manifest if not today's)
    let manifests: ManifestEntry[];
    if (character.manifestBoard && character.manifestDate === today) {
      // Use existing board (cc=1 flag — persistent for the day)
      manifests = character.manifestBoard as unknown as ManifestEntry[];
    } else {
      // SP.CARGO.S:208-247 — manif: generate fresh 4-contract board
      manifests = generateManifestBoard(
        character.currentSystem,
        character.ship.maxCargoPods,
        character.ship.hullCondition,
        character.ship.driveStrength,
        character.ship.driveCondition,
      );
      await prisma.character.update({
        where: { id: characterId },
        data: { manifestBoard: manifests as object[], manifestDate: today },
      });
    }

    const systemName = getSystemName(character.currentSystem);
    const board = renderManifestBoard(manifests, systemName, today);

    return {
      output:
        `\x1b[2J\x1b[H\r\n\x1b[33;1mWelcome ${character.name} to the Cargo Dispatch Office\x1b[0m\r\n` +
        '\r\nWe have cargo transport contracts ready for you to sign\r\n' +
        board +
        '\r\n\x1b[32m[Manifest Board]\x1b[0m (B)oard (Q)uits : ' +
        (character.ship.hullStrength > 0 && character.cargoPods < 1
          ? 'Choose: (1-4) '
          : ''),
    };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const raw = input.trim();
    const key = raw.toUpperCase();

    // ── SP.CARGO.S:33-38 — Space Commandant prompt Y/N ───────────────────────
    if (pendingCommandant.has(characterId)) {
      pendingCommandant.delete(characterId);
      if (key !== 'N' && key !== '') {
        // SP.CARGO.S:36: if i$<>"N" print"Yes":link"sp.top","wins"
        pendingWins.set(characterId, 'menu');
        return { output: 'Yes\r\n', nextScreen: 'topgun' };
      }
      // SP.CARGO.S:38: print"Not now" → fall through to manifest board
      // Mark as declined so the re-render skips the Commandant check this cycle
      declinedCommandant.add(characterId);
      return TradersCargoScreen.render(characterId);
    }

    // ── Pending confirmation (manifest index chosen, waiting for Y/N) ────────
    const pending = pendingManifestChoice.get(characterId);
    if (pending) {
      if (key === 'N' || key === '') {
        pendingManifestChoice.delete(characterId);
        return { output: '\r\nNo\r\n(1-4) or Q: ' };
      }
      if (key === 'Y') {
        pendingManifestChoice.delete(characterId);
        const character = await prisma.character.findUnique({
          where: { id: characterId },
          include: { ship: true },
        });
        if (!character || !character.ship) {
          return { output: '\r\n\x1b[31mError.\x1b[0m\r\n', nextScreen: 'traders' };
        }

        const m = pending.entry;

        // SP.CARGO.S:104 — if kk<>9 kk=3 (active cargo mission)
        // SP.CARGO.S:105 — gosub upod: x = effective pod count
        // SP.CARGO.S upod daily penalty (line 290): second visit same day + trips>0 → y/2
        const signToday = getTodayDate();
        const signIsSecondVisit = character.manifestDate === signToday && character.tripCount > 0;
        const upodX = signIsSecondVisit
          ? Math.floor(character.ship.maxCargoPods / 2)
          : character.ship.maxCargoPods;

        // SP.CARGO.S:111 — if f2>f1 print "Mission will require additional X fuel units."
        const fuelWarning = m.fuelRequired > character.ship.fuel
          ? `\r\n\x1b[33mMission will require additional ${m.fuelRequired - character.ship.fuel} fuel units.\x1b[0m\r\n`
          : '';

        // SP.CARGO.S:106 — q1=x; ee=1; pz$="" — set contract, clear raid document
        await prisma.character.update({
          where: { id: characterId },
          data: {
            missionType: 3,
            cargoPods: upodX,
            cargoType: m.cargoType,
            destination: m.destId,
            cargoManifest: m.destName,
            cargoPayment: m.payment,
            raidDocument: null, // SP.CARGO.S:106 pz$=""
          },
        });

        return {
          output: `\r\nYes${fuelWarning}\r\n\x1b[32mContract signed! Cargo loaded.\x1b[0m\r\n`,
          nextScreen: 'traders',
        };
      }
      return { output: '\r\nAre you sure? \x1b[37;1m[Y]\x1b[0m/(N): ' };
    }

    // ── Main input ────────────────────────────────────────────────────────────
    if (key === 'Q' || key === '') {
      return { output: '\r\nQuit\r\n', nextScreen: 'traders' };
    }

    if (key === 'B') {
      // Refresh board display
      return TradersCargoScreen.render(characterId);
    }

    // Numeric selection (1-4)
    const choice = parseInt(raw, 10);
    if (choice >= 1 && choice <= 4) {
      const character = await prisma.character.findUnique({
        where: { id: characterId },
        include: { ship: true },
      });

      if (!character || !character.ship) {
        return { output: '\r\n\x1b[31mError.\x1b[0m\r\n', nextScreen: 'traders' };
      }

      // SP.CARGO.S:46 — if (q1>0) and (kk<>5) print "You already have a valid contract!"
      if (character.cargoPods > 0 && character.missionType !== 5) {
        return { output: '\r\n\x1b[31mYou already have a valid contract!\x1b[0m\r\n', nextScreen: 'traders' };
      }

      const today = getTodayDate();
      if (!character.manifestBoard || character.manifestDate !== today) {
        return TradersCargoScreen.render(characterId);
      }
      const manifests = character.manifestBoard as unknown as ManifestEntry[];
      const entry = manifests[choice - 1];

      if (!entry) {
        return { output: `\r\n\x1b[31mInvalid choice.\x1b[0m\r\n(1-4) or Q: ` };
      }

      // SP.CARGO.S:88 — "You choose manifest # i. Are you sure? [Y]/(N)"
      pendingManifestChoice.set(characterId, { index: choice - 1, entry });
      const cargoDesc = getCargoDescription(entry.cargoType);
      return {
        output:
          `\r\nYou choose manifest # ${choice}. Are you sure? \x1b[37;1m[Y]\x1b[0m/(N): ` +
          `\r\n  (${cargoDesc} → ${entry.destName}, ${entry.payment} cr) `,
      };
    }

    return { output: `\r\n\x1b[31mOutta range!\x1b[0m\r\n(1-4) or Q: ` };
  },
};
