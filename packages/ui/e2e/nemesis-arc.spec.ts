import { test, expect, type Page } from '@playwright/test';
import {
  createInitialState,
  createSave,
  refreshAvailableStorylets,
  startDay,
  type GameState,
} from '@spacerquest/engine';
import { CROSSING_BANK_STAKE, CROSSING_BURN_FUEL } from '@spacerquest/content';

// T-1505 · The Nemesis Signal arc, proven through the REAL cockpit UI:
//   1. the acquisition funnel — explore off-lane for a fragment, then the Sage
//      decodes it (the Nemesis File flips SIGNAL → DECODED);
//   2. the crossing requires the stake — the Commit choice is LOCKED without the
//      bank + ship stake and enabled with it (resolving lifts the gate);
//   3. the ending is reachable and returns to a fresh career cleanly.
//
// Building a whole career through the UI to reach Mizar-9 / CONQUEROR / the crossing
// would take hundreds of days, so — exactly as storylet-registry.spec does for the
// Conqueror registry — the states that a long career produces are built headlessly
// and injected as the boot autosave (`sq.save.v1` = engine `createSave`). Every
// ASSERTED interaction (decode, the locked/unlocked Commit, the crossing Travel, the
// menu return) is driven through the real cockpit; nothing calls the engine to act.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

const SEED = 424242;

/** A DAY-phase state with its storylet offers refreshed, serialized to the save
 *  envelope the store boots from. `mutate` positions the career. */
function buildSave(mutate: (s: GameState) => void): string {
  let state = startDay(createInitialState(SEED)).state;
  mutate(state);
  state = refreshAvailableStorylets(state).state;
  return createSave(state, SEED);
}

/** Push a fragment onto the Nemesis file (as a grant/explore would). */
function addFragment(state: GameState, fragmentId: string, decoded: boolean): void {
  state.player.nemesisFile.fragments.push({ fragmentId, source: 'derelict', day: 1, decoded });
}

/** Boot the app straight into an injected career. */
async function bootWithSave(page: Page, save: string): Promise<void> {
  await page.addInitScript((blob) => window.localStorage.setItem('sq.save.v1', blob), save);
  await page.goto('/');
}

/** Open a port-surface storylet from its diegetic Port dispatch opener. */
async function openStorylet(page: Page, storyletId: string): Promise<void> {
  const opener = page.locator(`[data-storylet-open="${storyletId}"]`);
  await expect(opener).toBeVisible();
  await opener.click();
  const panel = page.getByTestId('storylet-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('data-storylet-id', storyletId);
}

function choice(page: Page, choiceId: string) {
  return page.locator(`[data-testid="storylet-choice"][data-choice-id="${choiceId}"]`);
}

async function openNemesisFile(page: Page): Promise<void> {
  await page.getByTestId('records-toggle').click();
  await page.getByTestId('records-tab-nemesis').click();
  await expect(page.getByTestId('nemesis')).toBeVisible();
}

// --- Clause 1 · the acquisition funnel: explore → fragment → Sage decode ---------

test('acquisition funnel: an off-lane sweep yields a fragment, then the Sage decodes it', async ({
  page,
}) => {
  // Leg 1 — EXPLORE → FRAGMENT, through the real UI (seed 45 fixture from
  // exploration.spec: die 0 = value 20 clears the nav DC and boards a derelict whose
  // loot yields a Signal Fragment).
  await page.goto('/');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByLabel('seed').fill('45');
  await page.getByRole('button', { name: 'Roll' }).click();
  await page.getByTestId('die').nth(0).click();
  await page.getByTestId('explore-sweep').click();
  await expect(page.getByTestId('exploration-outcome')).toContainText('Signal Fragment');
  await openNemesisFile(page);
  await expect(page.getByTestId('nemesis-empty')).toHaveCount(0);
  await expect(page.getByTestId('nemesis-count')).toContainText('1 FRAGMENT');
  // Freshly explored, the fragment is undecoded — raw SIGNAL, not yet DECODED.
  await expect(page.getByTestId('nemesis-count')).toContainText('0 DECODED');

  // Leg 2 — SAGE DECODE. That fragment now needs the Sage of Mizar-9. Reaching the
  // Sage takes a rim voyage, so continue the SAME funnel from an injected save that
  // holds the explored (undecoded) fragment at Mizar-9 (system 18) — the arc's
  // decode leg, driven through the real Port dispatch + storylet panel.
  const save = buildSave((s) => {
    s.player.currentSystemId = 18; // Mizar-9 — the Sage's workshop
    addFragment(s, 'frag-nemesis-02', false);
  });
  await bootWithSave(page, save);

  // Records is closed on boot — open the Sage's decode storylet from its Port dispatch.
  await openStorylet(page, 'sage.mizar.decode-02');
  await choice(page, 'decode').getByTestId('storylet-choice-btn').click();

  // The Nemesis File entry flips to DECODED and the DECODED count increments.
  await openNemesisFile(page);
  await expect(page.getByTestId('nemesis-count')).toContainText('1 FRAGMENT · 1 DECODED');
  const frag = page.locator('[data-testid="nemesis-fragment"][data-fragment-id="frag-nemesis-02"]');
  await expect(frag).toHaveAttribute('data-decoded', '1');
});

// --- Clause 2 · the crossing requires the stake ----------------------------------

/** A CONQUEROR career at Polaris-1 with the whole signal decoded, at a given
 *  credits/fuel — the crossing commit's rank + bank + ship gate. */
function crossingSave(credits: number, fuel: number): string {
  return buildSave((s) => {
    s.player.currentSystemId = 17; // Polaris-1 — where the crossing is committed
    s.player.registry.renownRank = 'CONQUEROR';
    s.player.credits = credits;
    s.player.ship.fuel = fuel;
    for (let i = 1; i <= 12; i += 1) {
      addFragment(s, `frag-nemesis-${String(i).padStart(2, '0')}`, true);
    }
  });
}

test('the crossing Commit is LOCKED without the bank + ship stake', async ({ page }) => {
  // CONQUEROR, whole signal decoded, but neither the bank nor the tank can pay.
  await bootWithSave(page, crossingSave(CROSSING_BANK_STAKE - 1, CROSSING_BURN_FUEL - 1));
  await openStorylet(page, 'nemesis.crossing.commit');

  const commit = choice(page, 'commit');
  const commitBtn = commit.getByTestId('storylet-choice-btn');
  await expect(commitBtn).toBeDisabled();
  // The stake is visible on the choice — the credit floor is the first gate.
  await expect(commit.getByTestId('storylet-choice-cost')).toContainText(
    `${CROSSING_BANK_STAKE.toLocaleString()}cr`,
  );
  await expect(commit.getByTestId('storylet-choice-cost')).toContainText(
    `${CROSSING_BURN_FUEL.toLocaleString()} fuel`,
  );
  await expect(commit.getByTestId('storylet-choice-lock')).toHaveText(
    `Need ${CROSSING_BANK_STAKE.toLocaleString()}cr`,
  );

  // Bank the fortune but leave the tank short — now the SHIP stake is what locks it.
  await bootWithSave(page, crossingSave(CROSSING_BANK_STAKE, CROSSING_BURN_FUEL - 1));
  await openStorylet(page, 'nemesis.crossing.commit');
  const commit2 = choice(page, 'commit');
  await expect(commit2.getByTestId('storylet-choice-btn')).toBeDisabled();
  await expect(commit2.getByTestId('storylet-choice-lock')).toHaveText(
    `Ship must carry ${CROSSING_BURN_FUEL.toLocaleString()} fuel for the burn`,
  );
});

test('a fully-staked Commit is enabled and lifts the crossing gate', async ({ page }) => {
  await bootWithSave(page, crossingSave(CROSSING_BANK_STAKE, CROSSING_BURN_FUEL));
  await openStorylet(page, 'nemesis.crossing.commit');

  const commit = choice(page, 'commit');
  const commitBtn = commit.getByTestId('storylet-choice-btn');
  await expect(commitBtn).toBeEnabled();
  await expect(commit.getByTestId('storylet-choice-lock')).toHaveCount(0);
  await commitBtn.click();

  // The commit resolved (the one-shot storylet drops off its offer). The lifted gate
  // is proven in clause 3 (the crossing Travel now completes); here we confirm the
  // decisive choice was accepted.
  await expect(
    page.locator('[data-testid="storylet-panel"][data-storylet-id="nemesis.crossing.commit"]'),
  ).toHaveCount(0);
  await expect(page.locator('[data-storylet-open="nemesis.crossing.commit"]')).toHaveCount(0);
});

// --- Clause 3 · the ending is reachable and returns to menu cleanly --------------

test('the crossing Travel reaches the ending, which returns to a fresh career', async ({
  page,
}) => {
  // The crossing is already committed (`nemesis.crossing.unlocked`), the ship sits at
  // Polaris-1 with a maxed drive + a full tank, and a high PILOT guarantees the long
  // jump's check. Everything from here — arming a die, plotting NEMESIS, confirming
  // the jump, the ending, the menu return — is driven through the real cockpit.
  const save = buildSave((s) => {
    s.player.currentSystemId = 17;
    s.flags['nemesis.crossing.unlocked'] = true;
    s.player.stats.PILOT = 40;
    s.player.ship.drives = { strength: 21, condition: 9 };
    s.player.ship.fuel = 4000;
    s.player.ship.maxFuel = 4000;
    // The crossing jump is deep-space distance (DC ~73). A dawn hand of natural 20s
    // makes the pilot check a clean auto-success (nat-20), so the UI-driven Travel
    // lands deterministically — mirroring the sim, which rolls the crossing on a 20.
    s.player.dawnHand = { dice: [20, 20, 20, 20, 20], spent: [false, false, false, false, false] };
    for (let i = 1; i <= 12; i += 1) {
      addFragment(s, `frag-nemesis-${String(i).padStart(2, '0')}`, true);
    }
  });
  await bootWithSave(page, save);

  // NEMESIS (28) is revealed on the starmap now the crossing is open — plot it.
  const nemesisNode = page.locator('[data-testid="starmap-system"][data-system-id="28"]');
  await expect(nemesisNode).toBeVisible();
  await expect(nemesisNode).toHaveAttribute('data-reachable', '1');

  await page.getByTestId('die').first().click();
  await nemesisNode.click();
  await expect(page.getByTestId('route-preview')).toBeVisible();
  await page.getByTestId('confirm-jump').click();

  // The crossing ending ceremony renders — the decoded epilogue, unmissable.
  const ending = page.getByTestId('crossing-ending');
  await expect(ending).toBeVisible();
  await expect(page.getByTestId('crossing-epilogue')).toBeVisible();
  await expect(page.getByTestId('crossing-signal-count')).toContainText('12 of 12');

  // "Return to menu" resets to a fresh, playable day-1 cockpit.
  await page.getByTestId('crossing-return-menu').click();
  await expect(page.getByTestId('crossing-ending')).toHaveCount(0);
  await expect(page.getByTestId('day')).toHaveText('1');
});
