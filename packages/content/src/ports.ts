/**
 * Ports as purchasable property — DATA, consumed by the engine's dusk-economy and
 * wire readers (T-1307, PRD §9: "ports as purchasable property" carried from the
 * 1991 original). A spacer buys a controlling stake in one of the 14 core-system
 * port authorities; each owned stake levies a per-dusk launch-fee income as other
 * spacers depart the system. This file owns the purchase price + base income (the
 * balance numbers), keyed by system; the engine owns the accrual/era logic and
 * never denormalizes these numbers onto the save (a `PortStake` stores only the
 * systemId + purchase day — the benefit is looked up here every dusk).
 *
 * FOUNDATION (f2f95fa9): the foundation RULES OF RECORD (foundation/rules/*.ts —
 * combat / constants / economy / travel / upgrades) contain NO port-buying code,
 * so there are no foundation NUMBERS to preserve or diverge from. The MECHANIC is
 * 1991 canon, documented in the foundation LORE (f2f95fa9:foundation/lore/
 * User-Manual.md §3.11 "Buy Space Port… Purchase one of the 14 core system
 * ports… Ports generate launch-fee income whenever other spacers depart from that
 * system"; glossary: "Owning a Space Port generates income"). PRD §9 keeps the
 * feature, so per the Standing-Constraint divergence rule this comment records the
 * divergence-from-foundation obligation as SATISFIED-BY-ABSENCE: foundation has no
 * rule to preserve, and the design is taken from the User-Manual cited above.
 *
 * Therefore the price/income constants are Rimward-authored, ENGINE-ORIGINAL
 * tuning — no foundation citation. T-1603 CANONICAL: the balance pass ratified the
 * flat 25,000cr / 300cr-per-dusk values (see PURCHASABLE_PORTS below and
 * docs/balance/tuning-memo.md) after the 500-seed sweep confirmed they sit correctly
 * mid-veteran-run — affordable to a productive veteran, a slow ~83-dusk payback
 * annuity rather than a money printer, and not a route the sweep flagged as
 * dominant. Sanctioned to live here per the TECH-STACK "balance numbers are data"
 * constraint.
 *
 * READERS:
 *   - the dusk economy (`packages/engine/src/actions/port.ts` `portDuskIncome`,
 *     called by `day.ts` endDay) accrues `baseDuskIncome` per owned stake;
 *   - the era lever (`packages/engine/src/era.ts` `eraPortIncomeMultiplier`)
 *     modulates that income when a live regional era event covers the port;
 *   - the purchase resolver + preview (`actions/port.ts` `resolvePortPurchase` /
 *     `quotePort`) read `purchasePrice`;
 *   - the `alliance` tag is CONSUMED by T-1503's reputation movers: buying a stake
 *     warms that port's aligned faction (engine `actions/port.ts` resolvePortPurchase
 *     → `reputation.ts` `applyReputation`), and the Warlord-Confederation ports feed
 *     the Confederation questline's rep the same way;
 *   - `name` is surfaced by T-1405's UI buy-preview / ledger pane.
 */

import type { FactionId } from './factions.js';

/** The four galactic powers a core port can be aligned to. ALIASED to the single
 *  faction-id source (`factions.ts` `FactionId`) so a port's `alliance` tag and a
 *  reputation faction id can never drift — T-1503's port-purchase rep mover reads
 *  this exact `alliance` to pick which faction warms. */
export type PortAlliance = FactionId;

export interface PortStakeDefinition {
  /** Core system id (1–14) the port authority sits in. Matches STAR_SYSTEMS. */
  systemId: number;
  /** Display name for T-1405's buy-preview / ledger pane. */
  name: string;
  /** Which galactic power the port is aligned to. CONSUMED by T-1503: buying this
   *  stake warms `alliance`'s reputation (engine port.ts → reputation.ts). */
  alliance: PortAlliance;
  /** Credits to buy the controlling stake, spent up front (a die-costed port
   *  action, resolver actions/port.ts `resolvePortPurchase` / preview `quotePort`). */
  purchasePrice: number;
  /** Base launch-fee credits accrued at dusk while the stake is owned, BEFORE any
   *  era modulation (dusk reader day.ts endDay via `portDuskIncome`; era lever
   *  era.ts `eraPortIncomeMultiplier`). */
  baseDuskIncome: number;
}

/**
 * The 14 core-system port authorities a spacer can buy into (canon: "one of the
 * 14 core system ports"; the rim is ungoverned, so rim systems 15–20 are NOT
 * purchasable). The four alliances are spread across the fourteen so a
 * Confederation-only reader (T-1503) has real Confederation ports to work with.
 *
 * T-1603 CANONICAL: a flat 25,000cr price and 300cr/dusk base income, ratified by
 * the balance sweep. Simple and affordable mid-veteran-run (a productive veteran
 * clears 25k easily, and 300/dusk pays the stake back over ~83 quiet dusks — a slow,
 * ownable annuity, not a money printer). Kept flat across all fourteen deliberately:
 * a per-system spread would create a single "best port to buy", and T-1603's no-
 * dominant-route goal prefers a uniform annuity that competes with, rather than
 * dominates, the trading loop. See docs/balance/tuning-memo.md.
 */
export const PURCHASABLE_PORTS: readonly PortStakeDefinition[] = [
  {
    systemId: 1,
    name: 'Sun-3 Port Authority',
    alliance: 'league',
    purchasePrice: 25000,
    baseDuskIncome: 300,
  },
  {
    systemId: 2,
    name: 'Aldebaran-1 Port Authority',
    alliance: 'dragons',
    purchasePrice: 25000,
    baseDuskIncome: 300,
  },
  {
    systemId: 3,
    name: 'Altair-3 Port Authority',
    alliance: 'confederation',
    purchasePrice: 25000,
    baseDuskIncome: 300,
  },
  {
    systemId: 4,
    name: 'Arcturus-6 Port Authority',
    alliance: 'rebels',
    purchasePrice: 25000,
    baseDuskIncome: 300,
  },
  {
    systemId: 5,
    name: 'Deneb-4 Port Authority',
    alliance: 'league',
    purchasePrice: 25000,
    baseDuskIncome: 300,
  },
  {
    systemId: 6,
    name: 'Denebola-5 Port Authority',
    alliance: 'dragons',
    purchasePrice: 25000,
    baseDuskIncome: 300,
  },
  {
    systemId: 7,
    name: 'Fomalhaut-2 Port Authority',
    alliance: 'confederation',
    purchasePrice: 25000,
    baseDuskIncome: 300,
  },
  {
    systemId: 8,
    name: 'Mira-9 Port Authority',
    alliance: 'rebels',
    purchasePrice: 25000,
    baseDuskIncome: 300,
  },
  {
    systemId: 9,
    name: 'Pollux-7 Port Authority',
    alliance: 'league',
    purchasePrice: 25000,
    baseDuskIncome: 300,
  },
  {
    systemId: 10,
    name: 'Procyon-5 Port Authority',
    alliance: 'dragons',
    purchasePrice: 25000,
    baseDuskIncome: 300,
  },
  {
    systemId: 11,
    name: 'Regulus-6 Port Authority',
    alliance: 'confederation',
    purchasePrice: 25000,
    baseDuskIncome: 300,
  },
  {
    systemId: 12,
    name: 'Rigel-8 Port Authority',
    alliance: 'rebels',
    purchasePrice: 25000,
    baseDuskIncome: 300,
  },
  {
    systemId: 13,
    name: 'Spica-3 Port Authority',
    alliance: 'league',
    purchasePrice: 25000,
    baseDuskIncome: 300,
  },
  {
    systemId: 14,
    name: 'Vega-6 Port Authority',
    alliance: 'confederation',
    purchasePrice: 25000,
    baseDuskIncome: 300,
  },
];

/** Port definitions keyed by system id for O(1) lookup by the resolver / dusk
 *  income reader / era lever. */
export const PURCHASABLE_PORTS_BY_SYSTEM: Record<number, PortStakeDefinition> = Object.fromEntries(
  PURCHASABLE_PORTS.map((port) => [port.systemId, port]),
);

/** Whether a stake in `systemId`'s port is purchasable (a core port, 1–14). The
 *  purchase gate the resolver (`resolvePortPurchase`) and the sim protocol's
 *  legalActions advertise-gate both read. */
export function isPurchasablePort(systemId: number): boolean {
  return Object.prototype.hasOwnProperty.call(PURCHASABLE_PORTS_BY_SYSTEM, systemId);
}
