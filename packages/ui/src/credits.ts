/**
 * ============================================================================
 *  T-1704 · CREDITS — the licences this artifact actually ships under
 * ============================================================================
 *
 * WHY THIS IS NOT IN `packages/content` (standing constraint 4, read correctly
 * rather than mechanically). `content` is GAME DATA — the things the rules
 * operate on: ports, deeds, storylets, cast. Nothing here is ever read by a rule;
 * this is DISTRIBUTION METADATA about the artifact, the same category as
 * `steam.ts`'s `ACHIEVEMENT_MANIFEST`, which lives beside this file for the same
 * reason. The engine cannot import it, no seeded run depends on it, and adding a
 * row cannot change a single outcome.
 *
 * WHY THE PROSE LIVES HERE AND NOT IN `format.ts`. `format.ts` owns the player's
 * VOICE — sentences the voice guide governs and that other modules compose. These
 * are structured attribution fields (component / holder / licence), assembled by
 * two trivial joins, and `format.ts` is a hotspot every serialization task
 * touches; there is no reason for a release-hygiene task to open it.
 *
 * A LICENCE THAT ONLY EXISTS IN A REPO IS NOT AN ATTRIBUTION THAT SHIPPED. That
 * is why this is a module and not just `docs/CREDITS.md`: the OFL and the MIT
 * licence both require the notice to travel with the distributed work, and the
 * only copy a player receives is the one inside the build. The doc is the
 * human-readable twin, pinned row-for-row by `__tests__/credits.test.ts` on the
 * `docs/STEAM-ACHIEVEMENTS.md` precedent.
 *
 * EVERY ROW IS VERIFIABLE FROM THIS REPOSITORY — `packages/ui/index.html` for the
 * fonts, `packages/ui/src/sound.ts` for the audio, the workspace manifests for the
 * three code dependencies. Nothing is invented. DEV-ONLY tooling (Vite, vitest,
 * Playwright, TypeScript, ESLint, Prettier) is deliberately absent: it is never
 * distributed to a player, so crediting it in the shipped build would be noise
 * that dilutes the notices that are actually required.
 * ============================================================================
 */

/** One attribution row. */
export interface Credit {
  /** Stable kebab-case handle. The structural id a spec asserts on
   *  (`data-credit-id`), on the `data-update-status` precedent — prose may be
   *  re-voiced, the id may not. */
  readonly id: string;
  /** What is being credited, as a player would name it. */
  readonly name: string;
  /** Who holds the rights. */
  readonly holder: string;
  /** The licence, named exactly as its authors name it. */
  readonly license: string;
  /** Where the licence text lives. Rendered as SELECTABLE TEXT, never a link:
   *  opening a browser from the cockpit is a shell capability the renderer does
   *  not have, and a dead link is worse than a copyable URL (the same call
   *  `App.tsx`'s save-location row makes about opening a folder). */
  readonly licenseUrl?: string;
  /** The one thing a reader would otherwise have to go and check. */
  readonly note?: string;
}

/**
 * THE CREDITS.
 *
 * READER: `App.tsx`'s `CreditsPanel` (Settings → Credits), which renders every
 * row — asserted consumed against the real cockpit by
 * `packages/ui/e2e/settings-saves.spec.ts` and inside a real packaged binary by
 * `packages/desktop/e2e/packaged.spec.ts`. Also read by
 * `__tests__/credits.test.ts`, which pins `docs/CREDITS.md` to it.
 */
export const CREDITS: readonly Credit[] = Object.freeze([
  {
    id: 'font-chakra-petch',
    name: 'Chakra Petch',
    holder: 'Cadson Demak',
    license: 'SIL Open Font License 1.1',
    licenseUrl: 'https://openfontlicense.org',
    note: 'Loaded from Google Fonts by the web build; a packaged offline launch falls back to system-ui. No font binary is bundled.',
  },
  {
    id: 'font-ibm-plex-mono',
    name: 'IBM Plex Mono',
    holder: 'IBM Corp.',
    license: 'SIL Open Font License 1.1',
    licenseUrl: 'https://openfontlicense.org',
    note: 'Loaded from Google Fonts by the web build; a packaged offline launch falls back to ui-monospace. No font binary is bundled.',
  },
  {
    // T-185 · The row now covers TWO modules, not one: the score joined the cues
    // when the `music` bus was added. Deliberately amended rather than split into
    // a second row — same holder, same licence, same claim ("synthesized live,
    // zero asset files"), and the `credits.test.ts` extension walk that ENFORCES
    // that claim does not care which file the synthesis lives in. A second row
    // would be a second place to keep the identical sentence true.
    id: 'audio',
    name: 'All sound cues and the score',
    holder: 'The Spacer Quest project',
    license: 'CC0 1.0 Universal',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    note: 'Original procedural WebAudio synthesis and composition. There are zero audio asset files and zero third-party samples — see packages/ui/src/sound.ts (cues) and packages/ui/src/music.ts (the score).',
  },
  {
    id: 'react',
    name: 'React and React-DOM 19',
    holder: 'Meta Platforms, Inc. and affiliates',
    license: 'MIT',
    licenseUrl: 'https://opensource.org/license/mit',
    note: 'Bundled into the cockpit on every build, web and desktop.',
  },
  {
    // T-136 · A RUNTIME DEPENDENCY NEW TO THIS REPO, added for the Liar's Dice
    // reveal timeline. It is bundled into the cockpit on every build, so it owes
    // a notice here exactly as React does.
    id: 'gsap',
    name: 'GSAP 3.15.0',
    holder: 'GreenSock, Inc.',
    license: 'Standard "No Charge" GSAP License',
    licenseUrl: 'https://gsap.com/standard-license',
    note: 'Bundled into the cockpit on every build, web and desktop. The npm package ships no LICENSE file — its README names the licence and points at the URL above, which permits commercial use in a sold product and prohibits only building competing visual-animation tooling.',
  },
  {
    id: 'electron',
    name: 'Electron 43',
    holder: 'Electron contributors and the OpenJS Foundation',
    license: 'MIT',
    licenseUrl: 'https://opensource.org/license/mit',
    note: 'Desktop builds only. It carries Chromium (BSD-3-Clause) and Node.js (MIT) with it.',
  },
  {
    id: 'steamworks-js',
    name: 'steamworks.js',
    holder: 'ceifa and contributors',
    license: 'MIT',
    licenseUrl: 'https://opensource.org/license/mit',
    note: 'An optional dependency, present only in desktop builds. The Steamworks SDK it binds to is redistributed under Valve terms — see docs/RELEASE-CHECKLIST.md item B6.',
  },
  {
    id: 'spacer-quest-1991',
    name: 'Spacer Quest v3.4 (1991)',
    holder: 'Firefox, on Apple II GBBS',
    license: 'Provenance, not a licence',
    note: 'The systems, roster, factions and lore this game is built from. The rules of record live at git ref f2f95fa9.',
  },
]);

/** The one-line attribution a row shows: who holds it, under what. */
export function creditLine(credit: Credit): string {
  return `${credit.holder} · ${credit.license}`;
}

/**
 * The secondary line: the caveat and the licence URL, joined, or `''` when the
 * row has neither. Returned rather than rendered so the panel stays a client of
 * this module and the two strings cannot drift apart in a JSX branch.
 */
export function creditDetail(credit: Credit): string {
  return [credit.note, credit.licenseUrl].filter((part) => !!part).join(' ');
}
