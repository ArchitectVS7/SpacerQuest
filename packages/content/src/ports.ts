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
 * tuning — no foundation citation. Sanctioned to live here per the TECH-STACK
 * "balance numbers are data" constraint.
 *
 * CANONICAL (T-1603b, 2026-07-26). The former INTERIM header — flat 25,000cr /
 * 300cr per dusk, kept flat on purpose "until T-1603b sets the real curve" — is
 * discharged: the curve below is set from measured traffic and is graded by the
 * invariants stated at `PURCHASABLE_PORTS`. See `docs/balance/TUNING-T-1603.md`
 * §5 for the derivation and for the one thing this change CANNOT be graded by.
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
 * CANONICAL (T-1603b, 2026-07-26) — the real curve, replacing the flat
 * 25,000cr / 300cr-per-dusk placeholder. Two independent reasons the flat table
 * had to go:
 *   1. fourteen identical purchases are not a decision. The buy screen offered no
 *      reason to prefer one port to another beyond the `alliance` tag;
 *   2. AGGREGATE RUNAWAY. 14 x 300 = 4,200cr/dusk against a measured fleet median
 *      route EV of 1,630cr/day (`docs/balance/BASELINE-T-1603a.md` §2). A rich
 *      veteran who bought the board out-earned FLYING by ~2.6x, forever, for zero
 *      further decisions — and §6 already reports the veteran game's wealth brake
 *      missing (median day-120 credits 90,620 for fighter; max 597,807).
 *
 * HOW THE CURVE IS DERIVED. Canon defines the launch fee as income levied "as
 * other spacers depart that system" (User-Manual §3.11, cited in the header), so
 * the income ORDERING is taken from measured traffic, not invented: T-1603a's raw
 * sweep rows (`.scratch/balance/rows-*.json`, 92,483 contract legs across both
 * arms) were folded by `originSystem` to give each core port's share of all core
 * departures. Measured, and stable across both arms:
 *
 *     sys  1  14.3% | 11  7.2% | 8  6.8% | 9  6.8% | 12  6.8% | 7  6.7% | 4  6.7%
 *     sys 10   6.6% | 13  6.6% |  5 6.6% | 2  6.6% | 14  6.4% | 3  6.1% | 6  5.9%
 *
 * HONEST CAVEAT, stated because it shapes the answer: outside the home port that
 * spread is under +/-10%, which cannot by itself carry a purchase decision. So the
 * fourteen are BANDED by measured share (Sun-3 alone; then 11; then 8/9/12; then
 * 7/4/10; then 13/5/2; then 14; 3; 6) and the bands are spaced wider than the raw
 * traffic to make the choice real. The ordering is measured; the spacing is a
 * design call, and this sentence is the place it is admitted.
 *
 * ---------------------------------------------------------------------------
 * R2d (2026-07-28) · PRICES RE-SET TO THE 1991 CURVE. Everything from here to
 * "WHY PRICES FELL" below describes the SUPERSEDED price table and is kept for
 * provenance; where it conflicts with this block, this block wins.
 *
 * WHERE THE NUMBERS COME FROM. Not invented and not ratioed — recovered from the
 * original Apple II source, which lives in this repo's own history: the live port
 * registry at `7ca606d7^:SQ/SP.BANK` stores each port's price in units of 10,000cr
 * (`7ca606d7^:Decompile/Source-Text/SP.REAL.txt` prints it as `m6"0,000 cr"` and
 * charges it at `buy1`). The fourteen ports THERE are the fourteen systems here,
 * by name, priced linearly 10,000 (Vega-6) to 140,000 (Sun-3) — i.e. the source's
 * own assignment is `(15 - systemId) * 10_000`.
 *
 * WHAT WAS RECOVERED, AND WHAT WAS NOT — read this before citing the formula above
 * as if it were the table below. The fourteen VALUES are recovered exactly: the
 * price multiset here is precisely {10,000, 20,000, ... 140,000}, every rung of the
 * 1991 ladder, once each. The per-port ASSIGNMENT is deliberately NOT the source's:
 * the rungs are handed out in measured-traffic-band order (the banding documented
 * above), not by `systemId`. Only Sun-3 (1) and Fomalhaut-2 (7) land on the same
 * price both ways; the other twelve do not, so `(15 - systemId) * 10_000` describes
 * the 1991 registry and NOT this table.
 *
 * WHY THE SOURCE'S ASSIGNMENT WAS REJECTED (2026-07-29, doc audit). It is not
 * fidelity-vs-laziness, it breaks two invariants pinned below. The 1991 port income
 * was TRAFFIC-driven (see the fuel-depot note under "WHY PRICES FELL"), so its
 * systemId order carried the traffic signal implicitly; ours pays a flat
 * `baseDuskIncome`, so if price is not assigned in income rank order the ladder
 * stops being a ladder. Concretely, applying `(15 - systemId) * 10_000` to the
 * income column below puts SIX ports outside the payback window (Altair-3 1,600
 * dusks, Denebola-5 1,385, Aldebaran-1 1,368, Deneb-4 1,053, Vega-6 118) and
 * creates STRICTLY DOMINATED ports — Aldebaran-1 would cost 130,000cr for 95/dusk
 * against Mira-9 at 70,000cr for 115/dusk — which fails the price/income
 * monotonicity check in `port.test.ts`. Traffic-rank assignment is the design call;
 * this paragraph is the place it is admitted.
 *
 * NO CURRENCY CONVERSION WAS NEEDED, which is the finding that made this a lift
 * rather than an estimate: `YARD_COMPONENT_TIER_PRICES` IS the 1991 ladder, tier
 * for tier (`SQ/SP.YARD.5`: "Atomic Missile 50cr ... Astral ASDRS 10000cr"). The
 * two economies are 1:1.
 *
 * WHAT WAS WRONG WITH THE OLD TABLE — measured against the real field (30 NPCs +
 * the player, n=1,860 actors at day 120). Thirteen of fourteen prices sat between
 * 7,150 and 19,000, so 51-65% of the field could afford ALMOST ALL OF THEM: anyone
 * who could buy one could buy twelve. That is a flat shelf, not a ladder, and a
 * board with no scarcity gradient cannot be a race. The 1991 curve restores the
 * gradient — cheapest affordable by ~62%, second by ~50%, dearest by ~3% — which
 * is the design goal: hard, not impossible, and the top of the board a trophy.
 *
 * THE COST, STATED PLAINLY. Income is UNCHANGED, because the aggregate ceiling
 * below is the invariant that keeps flying better than owning and there is no
 * headroom under it (1,595 of a ~1,620cr/day route EV). So payback stretches from
 * [110, 150] dusks to **[154, 1044]** — Denebola-5 154, Mira-9 1044. A stake is now a
 * STATUS AND CONTROL asset on a horizon no 120-day career reaches, not an
 * investment that repays inside a career. That is a deliberate trade of ROI for a
 * contested ladder, and it is the thing to revisit first if ports feel pointless
 * rather than aspirational. Raising income to shorten payback would require
 * re-opening the aggregate ceiling.
 * ---------------------------------------------------------------------------
 *
 * THE THREE INVARIANTS THIS TABLE IS GRADED BY. All derived from content, never
 * restated as literals, and pinned in `packages/engine/src/__tests__/port.test.ts`:
 *   - AGGREGATE CEILING: `sum(baseDuskIncome)` over all 14 = 1,595cr/dusk, below
 *     the 1,630cr/day fleet median route EV. Owning the ENTIRE board — 211,750cr
 *     of capital, a reach only the wealthiest tail gets to (R2d: the
 *     whole board is now 1,050,000cr, not 211,750) — still earns less than simply
 *     flying contracts. This is the invariant that answers reason (2), and it is
 *     what forces the per-port income down.
 *   - PAYBACK WINDOW: SUPERSEDED BY R2d — was [110, 150] dusks, now [154, 1044]:
 *     Denebola-5 pays back fastest at 154, Mira-9 slowest at 1044. Note the slowest
 *     is NOT the dearest — Sun-3, the 140,000cr hub, pays back in 483 — which is
 *     the whole content of the next invariant. The test pins the window at
 *     [150, 1050]; see the R2d block above, and the per-port `// payback N dusks`
 *     comments are regenerated and correct.
 *   - THE DEAREST PORTS ARE THE BUSIEST ONES. This REPLACES the pre-R2d "the hub
 *     pays a premium" form, which said payback rises with traffic (Denebola-5 110
 *     dusks → Sun-3 150) and is simply not true any more: the 14x price ladder
 *     against a ~4.5x income spread makes payback non-monotone in traffic (Sun-3
 *     483 against Mira-9 1044). What survives is true by construction, because the
 *     ladder is assigned in income rank order — price and income move together, so
 *     no port is strictly dominated by a cheaper one, and the decision is what you
 *     can REACH rather than which rung is secretly the bargain.
 *
 * WHY PRICES FELL. The ceiling fixes total income near 1,600cr/dusk, i.e. ~114 per
 * port; a sane payback window then forces prices into roughly 7k–44k. There is no
 * table that keeps a 25,000cr price, a >=110-dusk payback, AND a sub-1,630 board
 * total at fourteen ports — the arithmetic does not permit it, and the ceiling is
 * the invariant that addresses the measured defect, so it wins. Sun-3 at 43,500cr
 * remains a genuine long-term goal; Denebola-5 at 7,150cr is reachable by a
 * competent captain shortly after Tour One (and is a deliberate trap DURING it —
 * 65cr/dusk against a 25,000cr marker on a 30-day clock never pays).
 */
export const PURCHASABLE_PORTS: readonly PortStakeDefinition[] = [
  {
    systemId: 1,
    name: 'Sun-3 Port Authority',
    alliance: 'league',
    // 14.3% of measured core departures — the hub: start port, only Hangout, 2.0x the next busiest.
    purchasePrice: 140000,
    baseDuskIncome: 290, // payback 482.8 dusks
  },
  {
    systemId: 2,
    name: 'Aldebaran-1 Port Authority',
    alliance: 'dragons',
    // 6.6% of measured core departures — mid band.
    purchasePrice: 60000,
    baseDuskIncome: 95, // payback 631.6 dusks
  },
  {
    systemId: 3,
    name: 'Altair-3 Port Authority',
    alliance: 'confederation',
    // 6.1% of measured core departures — quiet.
    purchasePrice: 20000,
    baseDuskIncome: 75, // payback 266.7 dusks
  },
  {
    systemId: 4,
    name: 'Arcturus-6 Port Authority',
    alliance: 'rebels',
    // 6.7% of measured core departures — upper-mid band.
    purchasePrice: 90000,
    baseDuskIncome: 105, // payback 857.1 dusks
  },
  {
    systemId: 5,
    name: 'Deneb-4 Port Authority',
    alliance: 'league',
    // 6.6% of measured core departures — mid band.
    purchasePrice: 50000,
    baseDuskIncome: 95, // payback 526.3 dusks
  },
  {
    systemId: 6,
    name: 'Denebola-5 Port Authority',
    alliance: 'dragons',
    // 5.9% of measured core departures — quietest core port — the cheapest way in.
    purchasePrice: 10000,
    baseDuskIncome: 65, // payback 153.8 dusks
  },
  {
    systemId: 7,
    name: 'Fomalhaut-2 Port Authority',
    alliance: 'confederation',
    // 6.7% of measured core departures — upper-mid band.
    purchasePrice: 80000,
    baseDuskIncome: 105, // payback 761.9 dusks
  },
  {
    systemId: 8,
    name: 'Mira-9 Port Authority',
    alliance: 'rebels',
    // 6.8% of measured core departures — busy band.
    purchasePrice: 120000,
    baseDuskIncome: 115, // payback 1043.5 dusks
  },
  {
    systemId: 9,
    name: 'Pollux-7 Port Authority',
    alliance: 'league',
    // 6.8% of measured core departures — busy band.
    purchasePrice: 110000,
    baseDuskIncome: 115, // payback 956.5 dusks
  },
  {
    systemId: 10,
    name: 'Procyon-5 Port Authority',
    alliance: 'dragons',
    // 6.6% of measured core departures — upper-mid band.
    purchasePrice: 70000,
    baseDuskIncome: 105, // payback 666.7 dusks
  },
  {
    systemId: 11,
    name: 'Regulus-6 Port Authority',
    alliance: 'confederation',
    // 7.2% of measured core departures — busiest non-home port.
    purchasePrice: 130000,
    baseDuskIncome: 135, // payback 963.0 dusks
  },
  {
    systemId: 12,
    name: 'Rigel-8 Port Authority',
    alliance: 'rebels',
    // 6.8% of measured core departures — busy band.
    purchasePrice: 100000,
    baseDuskIncome: 115, // payback 869.6 dusks
  },
  {
    systemId: 13,
    name: 'Spica-3 Port Authority',
    alliance: 'league',
    // 6.6% of measured core departures — mid band.
    purchasePrice: 40000,
    baseDuskIncome: 95, // payback 421.1 dusks
  },
  {
    systemId: 14,
    name: 'Vega-6 Port Authority',
    alliance: 'confederation',
    // 6.4% of measured core departures — lower-mid band.
    purchasePrice: 30000,
    baseDuskIncome: 85, // payback 352.9 dusks
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
