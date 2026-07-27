// ---------------------------------------------------------------------------
// T-1702b · STEAM RICH PRESENCE — "current system/day" (the Accept).
//
// What a friend sees next to the player's name in the Steam friends list. It is
// a MIRROR, exactly as the achievement pipe is: the two values it publishes —
// `game.player.currentSystemId` and `game.day` — are engine state that already
// round-trips through the T-1002 save envelope, so no `GameState` field, no
// `GameEvent` and no save migration exist for this (standing constraint 3, N/A
// with the reason). `docs/PRD-REIMAGINED.md` says nothing about Steam or
// presence, so there is no PRD divergence to comment either.
//
// PURE NODE — NO `electron` IMPORT AND NO `steamworks.js` IMPORT, the same
// discipline and the same structural test as `steam.ts` and `cloud.ts`. The
// single guarded `require` stays in `main.ts`.
//
// THIS MODULE OWNS NO PROSE. It publishes the two Steamworks custom keys plus
// the `steam_display` TOKEN, and the sentence a friend reads is authored on the
// partner site against that token (`docs/STEAM-ACHIEVEMENTS.md`'s partner-site
// section). Composing a player-facing sentence inside a window manager would be
// the rule-in-the-shell this package forbids — the cockpit owns the prose
// (`packages/ui/src/format.ts`'s `richPresenceLine`), and the Settings row shows
// the player exactly that sentence.
// ---------------------------------------------------------------------------

/**
 * The slice of steamworks.js's `localplayer` namespace this module uses.
 *
 * DUPLICATED rather than imported, for the reason stated in `steam.ts` and
 * `cloud.ts`: an `import type` from an OPTIONAL dependency is a hard compile
 * error the moment the optional install is skipped.
 */
export interface PresenceClientLike {
  setRichPresence(key: string, value?: string | null): void;
}

/** Everything {@link initPresence} is allowed to know about the world. */
export interface PresenceHost {
  /** `null` when there is no Steam, or when the binding has no `localplayer`. */
  client: PresenceClientLike | null;
  log?(message: string): void;
}

/**
 * What one {@link PresenceSession.set} call actually did. Honest rather than
 * boolean, and for the same reason `steam.ts`'s {@link UnlockResult} is:
 *
 *  - `unavailable` — no Steam. Nothing was attempted.
 *  - `rejected` — the payload failed validation, or the native call threw. Logged
 *    and dropped; never thrown.
 *  - `unchanged` — the same system/day pair as the last publish, so the native
 *    call was skipped. This is what keeps a per-patch call cheap (see below).
 *  - `published` — Steamworks accepted the three keys.
 */
export type PresenceResult = 'unavailable' | 'rejected' | 'unchanged' | 'published';

export interface PresenceSession {
  state: 'ready' | 'unavailable';
  /** Publish the player's current system and day. NEVER THROWS. */
  set(system: string, day: number): PresenceResult;
  /** Clear every key we set. Called from `before-quit`: a "Day 12 — Sol" that
   *  outlives the process is a lie told to the player's friends. */
  clear(): void;
}

/**
 * The Steamworks keys this game publishes. The partner-site configuration must
 * match this list exactly, which is why it is documented rather than implied.
 *
 * `steam_display` is Steam's reserved key: its value is a LOCALIZATION TOKEN
 * authored on the partner site (App Admin → Community → Rich Presence), and
 * `{#system}` / `{#day}` inside that token's text interpolate the two custom keys
 * below it. Pointing at a token is the ONLY supported way to show a rich-presence
 * string — there is no "just send a sentence" API — which is why the prose lives
 * on the partner site and in the cockpit, and not here.
 */
export const PRESENCE_KEYS = {
  system: 'system',
  day: 'day',
  display: 'steam_display',
} as const;

/** The partner-site token `steam_display` points at. Its TEXT is authored on the
 *  partner site as `Day {#day} — {#system}`; `packages/ui/src/format.ts`'s
 *  `richPresenceLine` emits that same sentence for the Settings row, and a doc
 *  parity test asserts the two cannot drift. */
export const PRESENCE_DISPLAY_TOKEN = '#Status_InSystem';

/**
 * Steamworks caps a rich-presence VALUE at 256 bytes and a KEY at 64. We are far
 * stricter on the system name than that, because it is the one field that comes
 * FROM THE RENDERER and is going to a native library — the same discipline (and
 * the same reason) as `main.ts`'s `SAFE_ACHIEVEMENT` and `saveStore.ts`'s
 * `SAFE_KEY`. The longest authored system name in `packages/content` is well
 * under 64 characters, so nothing legitimate is excluded.
 */
const MAX_SYSTEM_CHARS = 64;

/** True when the string carries a C0/DEL control character. Written as a scan
 *  rather than a regex on purpose: a control-character CHARACTER CLASS is either
 *  an `eslint-disable` (`no-control-regex`) or a line of literal unprintables in
 *  the source, and neither survives a copy-paste intact. */
function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Resolve rich presence for this launch.
 *
 * NEVER THROWS, for the same reason `initSteam` and `initCloud` never do: a
 * storefront feature must not be able to take the game down. There is nothing to
 * initialise on the Steamworks side — presence is write-only — so this is a
 * pure narrowing of the injected client into a total session.
 */
export function initPresence(host: PresenceHost): PresenceSession {
  const client = host.client;
  // A binding that predates `localplayer.setRichPresence` degrades to
  // `unavailable` rather than throwing on first use.
  const usable = client && typeof client.setRichPresence === 'function' ? client : null;
  if (client && !usable) host.log?.('unavailable: this Steam binding has no rich presence');

  /** The last pair actually published, for the dedupe. Session-scoped: it is a
   *  cache, not a record, so nothing here can go stale against Steam. */
  let last: string | null = null;

  const publish = (key: string, value: string | null): void => {
    usable!.setRichPresence(key, value);
  };

  return {
    state: usable ? 'ready' : 'unavailable',

    set(system: string, day: number): PresenceResult {
      if (!usable) return 'unavailable';

      // PAYLOAD VALIDATION, here AS WELL AS in `main.ts`'s IPC handler, and
      // deliberately not instead of it: the IPC guard protects the process from a
      // hostile renderer, and this one protects the native call from every caller
      // including a future in-process one. Both are silent drops — there is no
      // reply channel to fail on, and a throw would surface as an unhandled
      // main-process error over a cosmetic string.
      if (typeof system !== 'string' || system.length === 0 || system.length > MAX_SYSTEM_CHARS) {
        host.log?.(`rejected presence: bad system name (${JSON.stringify(system)?.slice(0, 80)})`);
        return 'rejected';
      }
      if (hasControlChars(system)) {
        host.log?.('rejected presence: system name carries control characters');
        return 'rejected';
      }
      if (!Number.isSafeInteger(day) || day <= 0) {
        host.log?.(`rejected presence: bad day (${String(day)})`);
        return 'rejected';
      }

      // DEDUPE. `store.ts` calls this from its one state-update choke point, so
      // it fires on every UI-only patch (a die selected, a pane opened). Without
      // this, that is pointless native traffic several times a second; with it,
      // it is a string compare. Reported as a distinct result so the test can
      // ASSERT the dedupe rather than infer it from a call count.
      const key = `${system}|${day}`;
      if (key === last) return 'unchanged';

      try {
        publish(PRESENCE_KEYS.system, system);
        publish(PRESENCE_KEYS.day, String(day));
        publish(PRESENCE_KEYS.display, PRESENCE_DISPLAY_TOKEN);
      } catch (err) {
        // A throw from the native layer degrades here rather than becoming an
        // unhandled exception in the main process. Presence is cosmetic; a
        // crashed main process is the whole game. `last` is deliberately NOT
        // updated, so the next call retries.
        host.log?.(`setRichPresence failed: ${err instanceof Error ? err.message : String(err)}`);
        return 'rejected';
      }
      last = key;
      return 'published';
    },

    clear(): void {
      if (!usable) return;
      last = null;
      try {
        // `null` is steamworks.js's "unset this key". Clearing `steam_display`
        // alone would be enough for the friends list, but leaving the two custom
        // keys set would leave a stale system/day readable by anything that reads
        // raw presence keys — so all three go.
        publish(PRESENCE_KEYS.system, null);
        publish(PRESENCE_KEYS.day, null);
        publish(PRESENCE_KEYS.display, null);
      } catch (err) {
        // Called from `before-quit`. A throw here would abort the rest of that
        // emit — the exact shape of the T-1701a `closed`-handler bug that left
        // the process resident — so it is caught and logged, never propagated.
        host.log?.(`clearing presence failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  };
}
