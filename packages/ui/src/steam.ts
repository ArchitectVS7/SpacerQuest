import { DEEDS, RENOWN_RANKS } from '@spacerquest/content';
import type { GameEvent, GameState } from '@spacerquest/engine';
import { unlockAchievement } from './storage';

/**
 * ============================================================================
 *  T-1702a · THE STEAM ACHIEVEMENT MIRROR
 * ============================================================================
 *
 * PRD-REIMAGINED §8.2 does not describe achievements as a separate system: the
 * achievements ARE the Deeds, "in-world entries in the Spacer's Registry". So
 * there is no new rule here to own. `packages/engine/src/deeds.ts`'s
 * `evaluateDeeds` already decides what is earned and emits `DeedEarned` /
 * `RenownRankUp`; this module is a PURE CLIENT of that stream, exactly as
 * `sound.ts` is, hooking the same `store.ts` choke point. The engine emits
 * nothing new for it, no `GameState` field is added, no `GameEvent` is added,
 * `CURRENT_SAVE_VERSION` does not move and no save migration is owed (standing
 * constraint 3, N/A with the reason stated).
 *
 * WHY THE MAPPING LIVES HERE AND NOT IN `packages/desktop`. The shell has zero
 * workspace dependencies (`packages/desktop/tsconfig.json` has no `references`,
 * on purpose) and must keep knowing nothing about Deeds — what crosses the
 * bridge is a STRING. The cockpit already imports `@spacerquest/content`, so it
 * is the only place that can enumerate `DEEDS` without putting a game concept
 * inside a window manager.
 *
 * WHY NOT A `steamApiName` FIELD IN `packages/content/src/deeds.ts`. A Steam API
 * name is a DISTRIBUTION artifact, not game data, and a hand-authored per-deed
 * field can silently omit a deed — nobody would notice for a year. It is derived
 * mechanically instead (see {@link deedApiName}), so omission is not
 * representable. `packages/content` is untouched by this task (standing
 * constraint 4).
 *
 * ---------------------------------------------------------------------------
 *  THE SET — "the ≥30-Deed set including Conqueror" (the Accept)
 * ---------------------------------------------------------------------------
 * `DEEDS` currently holds 44 entries, and CONQUEROR is not one of them: it is a
 * `RenownRankId` (content `RENOWN_RANKS`, threshold 38), the career capstone
 * PRD §5.2/§9 names. So the mirror is 44 deeds + 1 capstone = 45 achievements,
 * comfortably over the "≥30" the Accept asks for, and
 * `__tests__/steam.test.ts` asserts BOTH the ≥31 floor and
 * `ACHIEVEMENT_MANIFEST.length === DEEDS.length + 1`, so a deed added later
 * cannot be forgotten here (the `EVENT_PATHS` guard in the engine's
 * `deeds.test.ts` is the precedent).
 *
 * ONLY CONQUEROR AMONG THE TEN RANKS IS MIRRORED — a deliberate call, recorded
 * here so it reads as a decision rather than an omission. The other nine ranks
 * are pure functions of deed count (`rankForDeedCount`), so mirroring them would
 * be nine Steam achievements that unlock as a side effect of achievements the
 * player already holds — noise on their profile, and nine more rows to maintain
 * on the partner backend. Conqueror is different: it is the capstone the Accept
 * names, and it gates the Nemesis crossing (T-1505b), so it marks something a
 * player actually did rather than a count they passed.
 * ============================================================================
 */

/**
 * The Steam API name for a deed.
 *
 * DERIVED, NEVER AUTHORED. See the header: a hand-kept table can omit a deed
 * silently, and this cannot. Deed ids are already `[a-z0-9_]` (content
 * `deedValidation.ts` enforces their shape), so uppercasing them yields exactly
 * the `^[A-Z][A-Z0-9_]{0,63}$` shape `packages/desktop/src/main.ts` validates
 * before anything reaches the native layer.
 *
 * The `DEED_` prefix keeps the deed namespace disjoint from the rank namespace
 * ({@link CONQUEROR_API_NAME}), which is asserted rather than assumed.
 */
export function deedApiName(deedId: string): string {
  return `DEED_${deedId.toUpperCase()}`;
}

/** The career capstone. `RANK_`-prefixed so it can never collide with a deed
 *  whose id happened to be `conqueror`. */
export const CONQUEROR_API_NAME = 'RANK_CONQUEROR';

/** One row of the partner-backend achievement table. */
export interface AchievementDefinition {
  apiName: string;
  /** Steam's "display name". The Deed's own title — the Registry and the store
   *  page say the same thing, because they are the same thing. */
  displayName: string;
  /** Steam's "description". The Deed's citation, with the `{day}` placeholder
   *  resolved to prose — see {@link describe}. */
  description: string;
}

/**
 * Turn a Deed's `citationTemplate` into a Steam description.
 *
 * `citationTemplate` carries a `{day}` placeholder the engine substitutes at
 * earn time (`citationFor`). A Steam description is authored ONCE, on the
 * partner site, before any career exists — there is no day to substitute, and
 * shipping a literal `{day}` onto a public product page would be a visible bug.
 *
 * Every one of the 44 authored templates opens with `On day {day}, ` or
 * `By day {day}, `, so the day clause is dropped and the sentence re-opened in
 * caps: "On day {day}, cargo reached its mark…" becomes "Cargo reached its
 * mark…". That keeps the authored period voice intact rather than paraphrasing
 * it. Any placeholder that survives — a future template naming the day
 * mid-sentence — degrades to neutral prose instead, so no `{` can ever reach the
 * store page (asserted in `__tests__/steam.test.ts`).
 */
function describe(template: string): string {
  const stripped = template.replace(/^(?:On|By) day \{day\}, /, '');
  const reopened =
    stripped === template ? stripped : stripped.charAt(0).toUpperCase() + stripped.slice(1);
  return reopened.replace(/\{day\}/g, 'that day');
}

/**
 * THE MANIFEST — every achievement this game defines, in one table.
 *
 * READERS: {@link achievementsForEvents} and {@link achievementsForState} (which
 * validate against it), `App.tsx`'s `SteamRow` (which shows its size to the
 * player), and `__tests__/steam.test.ts`'s parity check against
 * `docs/STEAM-ACHIEVEMENTS.md` — the table a human pastes into the Steamworks
 * partner site. Not a receipt: remove any one of those readers and something
 * fails.
 */
export const ACHIEVEMENT_MANIFEST: readonly AchievementDefinition[] = [
  ...DEEDS.map((deed) => ({
    apiName: deedApiName(deed.id),
    displayName: deed.title,
    description: describe(deed.citationTemplate),
  })),
  {
    apiName: CONQUEROR_API_NAME,
    displayName: RENOWN_RANKS.CONQUEROR.label,
    // Rank citations carry no placeholder by construction (`validateRenownRanks`
    // rejects braces outright), so this needs no substitution — but it goes
    // through the same function so the two paths cannot drift.
    description: describe(RENOWN_RANKS.CONQUEROR.citation),
  },
];

/**
 * PURE mapping from an action's emitted `GameEvent`s to the achievements it
 * implies. No DOM, no I/O, no side effects — the twin of `sound.ts`'s
 * `cuesForEvents`, and exported so the event → achievement mapping stays
 * reviewable and testable without a shell.
 *
 * `RenownRankUp` for any rank other than CONQUEROR maps to nothing, by the
 * decision recorded in the header.
 */
export function achievementsForEvents(events: readonly GameEvent[]): string[] {
  const names: string[] = [];
  for (const e of events) {
    if (e.type === 'DeedEarned') names.push(deedApiName(e.deedId));
    else if (e.type === 'RenownRankUp' && e.newRank === 'CONQUEROR') {
      names.push(CONQUEROR_API_NAME);
    }
  }
  return names;
}

/**
 * PURE · Every achievement a loaded career has ALREADY earned — the BACKFILL.
 *
 * THIS IS NOT OPTIONAL, and it is the design point of this module. A career can
 * have been played on the web build, or with Steam closed, or before this
 * feature existed; `state.player.registry.earned` round-trips through the save
 * envelope (T-112b) and is the AUTHORITATIVE record of what was earned. Without
 * reconciliation on load, a veteran launching under Steam for the first time
 * would get zero achievements for a forty-deed career and would have no way to
 * ever get them — the events that would have fired are years in their past.
 *
 * We deliberately persist NOTHING of our own for this: Steam owns the unlocked
 * set, `registry.earned` is the reconciliation source, and the dedupe that keeps
 * a 44-deed backfill cheap lives in {@link unlock} (per session) and in
 * `packages/desktop/src/steam.ts`'s `isActivated` check (per Steam account).
 */
export function achievementsForState(game: GameState): string[] {
  const registry = game.player.registry;
  const names = registry.earned.map((deed) => deedApiName(deed.id));
  if (registry.renownRank === 'CONQUEROR') names.push(CONQUEROR_API_NAME);
  return names;
}

/**
 * Every API name sent this session. The backfill runs on boot AND on every slot
 * load, so without this a long career re-sends its whole set several times a
 * sitting. The per-account dedupe still lives on the shell side (`isActivated`);
 * this one exists so the IPC traffic is proportional to what actually happened.
 *
 * Session-scoped on purpose: it is a cache, not a record. Nothing here is
 * persisted, so nothing here can go stale against Steam's own state.
 */
const sent = new Set<string>();

/** Every API name this game defines, for the drop-the-unknown guard in
 *  {@link unlock}. */
const KNOWN = new Set(ACHIEVEMENT_MANIFEST.map((a) => a.apiName));

/**
 * Send a batch of achievements to the shell.
 *
 * FIRE AND FORGET, and it NEVER THROWS — the sink (`storage.ts`'s
 * `unlockAchievement`) is a no-op in a browser tab and a swallowing
 * `ipcRenderer.send` under the shell, and this adds its own guard on top so a
 * future sink cannot break the rule. That matters because the call sites are
 * inside `store.ts` actions: a failed achievement must never be able to cost a
 * player their turn.
 *
 * READER of {@link ACHIEVEMENT_MANIFEST}: unknown names are dropped rather than
 * forwarded, so a typo cannot reach the native layer.
 */
export function unlock(apiNames: readonly string[]): void {
  for (const apiName of apiNames) {
    if (sent.has(apiName)) continue;
    if (!KNOWN.has(apiName)) continue;
    sent.add(apiName);
    try {
      unlockAchievement(apiName);
    } catch {
      /* cosmetic — never worth an action. See the doc comment. */
    }
  }
}

/** TEST-ONLY · Forget this session's sent set. The dedupe is module state, so
 *  without this the unit suite's second test would see the first one's sends.
 *  Not called from the cockpit. */
export function resetSentForTests(): void {
  sent.clear();
}
