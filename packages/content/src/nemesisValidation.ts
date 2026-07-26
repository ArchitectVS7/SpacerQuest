/**
 * T-1505a · Signal-fragment content validation — the load-time "12 fragments load
 * and validate" guarantee.
 *
 * Mirrors the blessed `defineStorylets` / `defineDeeds` / `defineRenownRanks` shape
 * exactly: `validateSignalFragments` collects every structural error in the table
 * and `defineSignalFragments` throws on any of them, so a malformed fragment table
 * can never reach a running game (importing `@spacerquest/content` at all fails
 * loudly instead). Every rule below names the READER it protects — none is
 * decoration.
 *
 * SCOPE NOTE — what this file deliberately does NOT check: that every fragment has
 * a Sage DECODE PATH. That check has to join the fragment table against `STORYLETS`,
 * and `storyletValidation.ts` already imports THIS module's table (nemesis.ts) — a
 * validator here importing storylets.ts would invert the dependency and create a
 * cycle. The decode-path guard therefore lives where it can see both tables, as an
 * engine test (`packages/engine/src/__tests__/nemesis.test.ts`, the content-derived
 * decode map). The two checks are complementary: this one proves each fragment is
 * well-formed, that one proves each fragment can actually be decoded.
 */

import type { SignalFragmentLore } from './nemesis.js';

/** Rules 1–3: the fragment table itself. */
function validateFragmentTable(
  errors: string[],
  fragments: Readonly<Record<string, SignalFragmentLore>>,
): void {
  const orders = new Map<number, string>();

  for (const [key, def] of Object.entries(fragments)) {
    const path = `signalFragments.${key}`;

    // 1. Key/id agreement. Real hazard, not tidiness: `ALL_FRAGMENT_IDS` is
    //    `Object.keys(SIGNAL_FRAGMENTS)` — the KEY is the loot-pool / whitelist
    //    handle — while `def.id` is nothing in particular on its own. A mismatch
    //    would desync the two silently.
    if (def.id !== key) {
      errors.push(`${path}.id must equal its key (got '${String(def.id)}')`);
    }

    // 2. `order` — READER: `nemesisLoreIndex` (engine nemesis.ts) sorts the whole
    //    Nemesis pane by it. A non-integer or duplicate order leaves two rows in a
    //    non-deterministic relative position in the player's file.
    if (
      typeof def.order !== 'number' ||
      !Number.isFinite(def.order) ||
      !Number.isInteger(def.order) ||
      def.order < 1
    ) {
      errors.push(`${path}.order must be a positive integer`);
    } else {
      const owner = orders.get(def.order);
      if (owner !== undefined) {
        errors.push(`${path}.order (${def.order}) duplicates signalFragments.${owner}.order`);
      } else {
        orders.set(def.order, key);
      }
    }

    // 3. The three player-visible strings. READERS: `nemesisLoreIndex` puts `title`
    //    on every row and picks `signal` vs `decoded` for the row's `text`, which
    //    the Nemesis File pane renders as `.nf-title` / `.nf-text` (ui/App.tsx
    //    RecordsOverlay). An empty one renders as a blank row.
    for (const field of ['title', 'signal', 'decoded'] as const) {
      if (typeof def[field] !== 'string' || def[field].length === 0) {
        errors.push(`${path}.${field} must be a non-empty string`);
      }
    }
    // …and `signal` must actually differ from `decoded`: the ONLY visible
    // difference between a SIGNAL row and a DECODED row (beyond the tag) is
    // `entry.text`, so identical strings make the Sage's decode invisible to the
    // player — a decode path that changes nothing anyone can see.
    if (typeof def.signal === 'string' && def.signal === def.decoded) {
      errors.push(`${path}.decoded must differ from ${path}.signal (decoding must be visible)`);
    }
  }
}

/** Rule 4: the loot pools point at real fragments and name none of them twice. */
function validatePool(
  errors: string[],
  path: string,
  pool: readonly string[],
  fragments: Readonly<Record<string, SignalFragmentLore>>,
): void {
  const seen = new Set<string>();
  pool.forEach((id, index) => {
    // READER: `POI_LOOT` (exploration.ts) → engine `resolveLoot`'s seeded
    // `pool[floor(rng.next() * pool.length)]` pick, whose result goes straight to
    // `grantFragment`. An unknown id makes grantFragment return false, so the board
    // silently yields NOTHING on a roll the player was told they won.
    if (!fragments[id]) {
      errors.push(`${path}[${index}] ('${id}') is not a known Signal Fragment id`);
    }
    // A duplicate entry is not an error of correctness but of intent: it doubles
    // that id's draw weight invisibly, which is a balance lever nobody declared.
    if (seen.has(id)) {
      errors.push(`${path}[${index}] ('${id}') is duplicated in the pool`);
    }
    seen.add(id);
  });
}

export function validateSignalFragments(
  fragments: Readonly<Record<string, SignalFragmentLore>>,
): string[] {
  const errors: string[] = [];
  validateFragmentTable(errors, fragments);
  return errors;
}

/**
 * Validate the loot pools against a fragment table. Kept separate from
 * `validateSignalFragments` because nemesis.ts must define the table (and throw on
 * it) BEFORE the pools that reference it exist — the pools are checked by the
 * engine test that owns the cross-table guards.
 */
export function validateFragmentPools(
  fragments: Readonly<Record<string, SignalFragmentLore>>,
  pools: Readonly<Record<string, readonly string[]>>,
): string[] {
  const errors: string[] = [];
  for (const [name, pool] of Object.entries(pools)) {
    validatePool(errors, name, pool, fragments);
  }
  return errors;
}

export function defineSignalFragments<const T extends Readonly<Record<string, SignalFragmentLore>>>(
  fragments: T,
): T {
  const errors = validateSignalFragments(fragments);
  if (errors.length > 0) {
    throw new Error(`Invalid Signal Fragment content:\n - ${errors.join('\n - ')}`);
  }
  return fragments;
}
