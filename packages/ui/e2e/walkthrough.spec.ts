import { test, expect, type Page } from '@playwright/test';
import { createInitialState, startDay, createSave } from '@spacerquest/engine';
import { DARE_MIN_WAGER } from '@spacerquest/content';
import { WALKTHROUGH_KEY, signOpeningMarker, skipOpeningMarker } from './support/career';

// ---------------------------------------------------------------------------
// T-187 acceptance: THE SCRIPTED FIRST-TURN WALKTHROUGH, PLAYED AS A PLAYER.
//
// Test A IS the Accept's "fresh-profile playtest… confirms a first-time player
// reaches collect-the-contract and plays one Liar's Dice hand without asking what
// to do next", mechanised: a virgin browser context, `page.goto('/')`, and every
// single action driven by the affordance the CARD names — never an engine call,
// never a save fixture, never a store handle. If the card cannot get a player
// from step 1 to step 7, this test cannot pass.
//
// THE OTHER FOUR TESTS ARE THE CLAUSES THE ACCEPT ALSO NAMES:
//   B · the explicit "Skip tutorial" affordance really releases the rails,
//   C · a returning/expert player load never sees it at all,
//   D · T-311's contextual coach is SUPPRESSED, not removed,
//   E · the rails stand down whenever the engine has already taken over — the
//       anti-soft-lock guarantee.
//
// FIXTURE NOTES (verified by running, not assumed):
//   Default seed 424242: day 1 at Sol-3, dawn hand [19,14,14,13,3]. Contract 0
//   routes to system 9 (Pollux-7) — a CORE port, so it carries a Hangout and
//   step 7 works at the destination. The guided jump needs a fuel top-off first,
//   which is why step 4's rails open the depot (the same hinge `onboarding.spec.ts`
//   documents in its own header). If the RNG stream ever shifts, RE-DERIVE the
//   fixture offline (replay startDay(createInitialState(seed)) → sign → buy-fuel →
//   Travel) or hunt a new seed — never widen or edit an assertion to make it pass.
//
//   Seed 887 (Test E): dawn hand [20,18,13,7,6]; jumping with die INDEX 1 to
//   system 15 triggers a tier-2 encounter (the combat-spec fixture).
// ---------------------------------------------------------------------------

const card = (page: Page) => page.getByTestId('walkthrough');

/** The step the card is currently on, or null when it is not mounted. */
async function stepId(page: Page): Promise<string | null> {
  if ((await card(page).count()) === 0) return null;
  return card(page).getAttribute('data-walkthrough-step');
}

async function expectStep(page: Page, id: string): Promise<void> {
  await expect(card(page)).toHaveAttribute('data-walkthrough-step', id);
}

/** Read the persisted record the way a reload would. */
async function persisted(page: Page): Promise<{ status?: string } | null> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as { status?: string }) : null;
  }, WALKTHROUGH_KEY);
}

test.beforeEach(async ({ page }) => {
  // Settle the dawn-roll scramble and put the Dare reveal on its instant rail, so
  // the settled DOM exists on the very next render. NOTE: this spec deliberately
  // does NOT stamp the walkthrough away — it is the one suite that boots it armed.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // T-200 · Retire the opening marker ONLY. The Guild's cold open covers day 1 of
  // every new career and stands in front of the rails by design, so this suite —
  // which is about the rails — signs it off before the app boots. It writes a
  // DIFFERENT key (`sq.opening.v1`), so the walkthrough record every assertion
  // below reads is untouched by it, including test A's persistence check.
  await skipOpeningMarker(page);
});

// ---------------------------------------------------------------------------
// A · the fresh-profile run, end to end
// ---------------------------------------------------------------------------

test('a first-time player is walked from the dawn hand to a hand of Liar’s Dice', async ({
  page,
}) => {
  // A genuinely virgin profile: isolated context, empty localStorage, and no init
  // script touching the WALKTHROUGH key (one that did would re-run on reload and
  // clobber the very record the final persistence assertion reads). The one init
  // script in play is `beforeEach`'s T-200 marker stamp, which writes
  // `sq.opening.v1` and nothing else.
  await page.goto('/');

  // ---- STEP 1 · the dawn hand -------------------------------------------
  await expect(card(page)).toBeVisible();
  await expectStep(page, 'w1-dawn-hand');
  await expect(card(page)).toHaveAttribute('data-walkthrough-index', '1');
  await expect(card(page).locator('.wt-counter')).toHaveText('STEP 1 OF 7');
  // The card names WHAT and WHY — both, per the Accept.
  await expect(card(page).locator('.wt-what')).not.toBeEmpty();
  await expect(card(page).locator('.wt-why')).not.toBeEmpty();
  // …and the rails are genuinely on: a non-scripted pane is inert, not merely
  // dimmed. `inert` kills pointer events, focus AND accessibility exposure.
  await expect(page.getByTestId('ship-pane')).toHaveAttribute('data-rails-off', '1');
  await expect(page.getByTestId('ship-pane')).toHaveAttribute('inert', '');
  await expect(page.getByTestId('explore-panel')).toHaveAttribute('data-rails-off', '1');
  await expect(page.getByTestId('hangout-toggle')).toHaveAttribute('data-rails-off', '1');
  await page.getByTestId('walkthrough-next').click();

  // ---- STEP 2 · arm a die ------------------------------------------------
  await expectStep(page, 'w2-assign-die');
  // The manifest is still shut on step 2 — the script wants the hand first.
  await expect(page.getByTestId('contract').first()).toBeVisible();
  await page.getByTestId('die').nth(0).click();

  // ---- STEP 3 · sign a job ----------------------------------------------
  await expectStep(page, 'w3-take-contract');
  // The manifest has opened and is the highlighted region; the shipyard has not.
  await expect(page.getByTestId('ship-pane')).toHaveAttribute('data-rails-off', '1');
  const destination = await page
    .getByTestId('contract')
    .first()
    .getAttribute('data-destination-id');
  expect(Number(destination)).toBeGreaterThan(0);
  await page.getByTestId('contract').first().click();

  // ---- STEP 4 · make the jump -------------------------------------------
  await expectStep(page, 'w4-make-the-jump');
  await expect(page.getByTestId('active-contract-empty')).toHaveCount(0);
  // The destination is PINNED: every other node is a dead click and says so.
  const target = page.locator(`[data-testid="starmap-system"][data-system-id="${destination}"]`);
  await expect(target).toHaveAttribute('data-rails-target', '1');
  const someOtherNode = page.locator(`[data-testid="starmap-system"][data-rails-locked="1"]`);
  expect(await someOtherNode.count()).toBeGreaterThan(0);

  // Top the tank off through the depot the step deliberately leaves open.
  await expect(page.getByTestId('fuel-depot')).not.toHaveAttribute('data-rails-off', '1');
  await page.getByTestId('die').nth(1).click();
  await page.getByTestId('fuel-amount').fill('10');
  await page.getByTestId('buy-fuel').click();
  await expectStep(page, 'w4-make-the-jump');

  // …then plot and confirm, exactly as the card says.
  await page.getByTestId('die').nth(2).click();
  await target.click();
  await expect(page.getByTestId('route-preview')).toBeVisible();
  await page.getByTestId('confirm-jump').click();

  // ---- STEP 5 · collect the payout --------------------------------------
  // THE ACCEPT'S FIRST NAMED MILESTONE: the player reached "collect the contract"
  // guided by the card alone.
  await expectStep(page, 'w5-collect-payout');
  await expect(page.getByTestId('active-contract-empty')).toBeVisible();
  // The card names the payout the ENGINE actually paid, not a placeholder.
  await expect(card(page).locator('.wt-what')).toContainText(/[\d,]+cr/);
  await page.getByTestId('walkthrough-next').click();

  // ---- STEP 6 · the off-lane sweep --------------------------------------
  await expectStep(page, 'w6-explore');
  await expect(page.getByTestId('explore-panel')).not.toHaveAttribute('data-rails-off', '1');
  await expect(page.getByTestId('ship-pane')).toHaveAttribute('data-rails-off', '1');
  await page.getByTestId('die').nth(3).click();
  await page.getByTestId('explore-sweep').click();

  // ---- STEP 7 · a hand of Liar's Dice -----------------------------------
  await expectStep(page, 'w7-liars-dice');
  await expect(page.getByTestId('hangout-toggle')).not.toHaveAttribute('data-rails-off', '1');
  await page.getByTestId('hangout-toggle').click();
  const panel = page.getByTestId('hangout-panel');
  await expect(panel).toBeVisible();
  await expect(panel).not.toHaveAttribute('data-rails-off', '1');

  // Seat an opponent, set the wager to the band's own floor, commit a die.
  await page.getByTestId('hangout-npc').first().click();
  await page.getByTestId('dare-wager').fill(String(DARE_MIN_WAGER));
  await page.getByTestId('die').nth(4).click();
  await expect(page.getByTestId('dare-commit')).toBeEnabled();
  await page.getByTestId('dare-commit').click();
  await expect(page.getByTestId('dare-scene')).toBeVisible();

  // With a hand live the rails stand fully down — the table must be playable.
  await expect(card(page)).toHaveCount(0);
  await expect(page.locator('[data-rails-off="1"]')).toHaveCount(0);

  // Play the hand out: open the bidding, then call the house a liar if it answers.
  await page.getByTestId('dare-quantity').fill('2');
  await page.getByTestId('dare-face').fill('3');
  await page.locator('[data-testid="dare-move"][data-move="bid"]').click();
  if ((await page.getByTestId('dare-reveal').count()) === 0) {
    await page.locator('[data-testid="dare-move"][data-move="challenge"]').click();
  }
  await expect(page.getByTestId('dare-reveal')).toBeVisible();

  // THE ACCEPT'S SECOND NAMED MILESTONE. The seventh signal landed, so the whole
  // walkthrough is done: the card is gone for good and the record says so.
  await expect(card(page)).toHaveCount(0);
  expect((await persisted(page))?.status).toBe('done');

  // …and the cockpit is fully released — nothing is inert any more.
  await page.getByTestId('dare-leave').click();
  await expect(page.getByTestId('dare-scene')).toHaveCount(0);
  await expect(page.locator('[data-rails-off="1"]')).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// B · skip
// ---------------------------------------------------------------------------

test('“Skip tutorial” releases the rails immediately and stays skipped across a reload', async ({
  page,
}) => {
  await page.goto('/');
  await expectStep(page, 'w1-dawn-hand');
  await expect(page.getByTestId('ship-pane')).toHaveAttribute('data-rails-off', '1');

  await page.getByTestId('walkthrough-skip').click();

  await expect(card(page)).toHaveCount(0);
  // EVERY region is released, not just the one the player was looking at.
  await expect(page.locator('[data-rails-off="1"]')).toHaveCount(0);
  await expect(page.getByTestId('ship-pane')).not.toHaveAttribute('inert', '');
  expect((await persisted(page))?.status).toBe('skipped');

  // A reload does not bring it back — the whole point of persisting it.
  await page.reload();
  await expect(page.getByTestId('hand')).toBeVisible();
  await expect(card(page)).toHaveCount(0);
  await expect(page.locator('[data-rails-off="1"]')).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// C · the returning player
// ---------------------------------------------------------------------------

test('a returning player booting a save never sees the walkthrough', async ({ page }) => {
  // Offline save-fixture construction only (the wire/combat precedent); NO
  // walkthrough key is written, so the arming rule is what has to keep this
  // cockpit clean — not a stamp the test applied.
  const base = startDay(createInitialState(424242)).state;
  base.day = 6;
  const save = createSave(base, 424242);
  await page.addInitScript((s) => {
    if (!window.localStorage.getItem('sq.save.v1')) window.localStorage.setItem('sq.save.v1', s);
  }, save);
  await page.goto('/');

  await expect(page.getByTestId('day')).toHaveText('6');
  await expect(card(page)).toHaveCount(0);
  await expect(page.locator('[data-rails-off="1"]')).toHaveCount(0);
  // Nothing was even written for a career that never armed it.
  expect(await persisted(page)).toBeNull();
});

// ---------------------------------------------------------------------------
// D · coexistence with T-311's contextual coach
// ---------------------------------------------------------------------------

test('the contextual coach is suppressed while on rails, and resumes once skipped', async ({
  page,
}) => {
  await page.goto('/');

  // Two coach cards on screen at once is the failure mode this rules out.
  await expect(card(page)).toBeVisible();
  await expect(page.getByTestId('onboarding')).toHaveCount(0);

  // Skipped — and T-311's day-1 dawn-roll callout takes over, proving it was
  // SUPPRESSED at render time rather than consumed or removed.
  await page.getByTestId('walkthrough-skip').click();
  const coach = page.getByTestId('onboarding');
  await expect(coach).toBeVisible();
  await expect(coach).toHaveAttribute('data-onboarding-id', 'dawn-roll');
});

// ---------------------------------------------------------------------------
// E · the rails stand down under the engine
// ---------------------------------------------------------------------------

test('an encounter suspends the rails entirely — no soft-lock behind the combat overlay', async ({
  page,
}) => {
  await page.goto('/');
  // The seeded interception (seed 887, die index 1 → system 15) is the
  // combat-spec fixture, and it depends on the RNG stream NOT being perturbed
  // before the jump — so the walkthrough is retired first, through its own Skip
  // button, exactly as a player who wanted the ambush would. Signing a contract
  // on the way would move the stream and the ambush would not fire.
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByLabel('seed').fill('887');
  await page.getByRole('button', { name: 'Roll' }).click();
  // T-200 · A fresh career always opens under its own Guild marker, and it
  // stands in FRONT of the rails by design — so the dispatch is signed the way a
  // player signs it, and only then is the walkthrough card asserted on. Without
  // this the assertions below would read the card through the marker's render-time
  // suppression and pass for the wrong reason. RNG-free: no engine action.
  await signOpeningMarker(page);
  await expectStep(page, 'w1-dawn-hand');
  await page.getByTestId('walkthrough-skip').click();

  await page.getByTestId('die').nth(1).click();
  await page.locator('[data-testid="starmap-system"][data-system-id="15"]').click();
  await page.getByTestId('confirm-jump').click();
  const overlay = page.getByTestId('combat-overlay');
  await expect(overlay).toBeVisible();

  // Now put a RUNNING walkthrough underneath that live encounter. Writing the
  // client record and reloading is FIXTURE CONSTRUCTION (the `recovery.spec.ts`
  // precedent for `page.evaluate` on storage), not an API shortcut for a player
  // action: the encounter itself was flown through the real cockpit above, and
  // every assertion below reads the real DOM. There is no player route to this
  // state — the rails would have refused the jump — which is exactly why the
  // guarantee has to be tested this way rather than not at all.
  await page.evaluate((key) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        v: 1,
        status: 'active',
        acked: { 'w1-dawn-hand': true },
        flags: { dieAssigned: true, signed: true },
      }),
    );
  }, WALKTHROUGH_KEY);
  await page.reload();

  // The mid-encounter autosave restores the fight…
  await expect(page.getByTestId('combat-overlay')).toBeVisible();
  // …and the rails stand FULLY down while the engine holds the screen: no card,
  // and not one inert node anywhere on the page. That is the anti-soft-lock
  // guarantee, asserted where it actually matters.
  await expect(card(page)).toHaveCount(0);
  await expect(page.locator('[data-rails-off="1"]')).toHaveCount(0);

  // And it is a SUSPENSION, not a cancellation: once the engine lets go, the
  // walkthrough picks up exactly where it was. Work the fight to its end the way
  // a player does — commit a die and buy the lane with tribute, round by round.
  for (let round = 0; round < 8; round += 1) {
    if ((await page.getByTestId('combat-aftermath').count()) > 0) break;
    if ((await page.getByTestId('combat-overlay').count()) === 0) break;
    const dice = page.locator('[data-testid="combat-die"][data-spent="0"]');
    if ((await dice.count()) === 0) {
      await page.getByTestId('combat-stand-down').click();
      break;
    }
    await dice.first().click();
    await page.getByTestId('combat-talk').click();
  }
  const dismiss = page.getByTestId('combat-dismiss');
  if ((await dismiss.count()) > 0) await dismiss.click();
  await expect(page.getByTestId('combat-overlay')).toHaveCount(0);

  // The card is back, on step 4 or on step 5 — never reset, never cancelled.
  // (Talking the interceptor down RESUMES the interrupted jump, and a resumed
  // jump legitimately completes step 4, so both are correct outcomes; which one
  // lands is the engine's business, not this test's.)
  await expect(card(page)).toBeVisible();
  expect(await stepId(page)).toMatch(/^w[45]-/);
});

// ---------------------------------------------------------------------------
// F · the Settings replay control
// ---------------------------------------------------------------------------

test('Settings can re-arm the walkthrough for the next New Game', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('walkthrough-skip').click();
  await expect(card(page)).toHaveCount(0);

  // A New Game does NOT re-arm a walkthrough the player already retired…
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByLabel('seed').fill('4242');
  await page.getByRole('button', { name: 'Roll' }).click();
  // T-200 · A fresh career always opens under its own Guild marker, and it
  // stands in FRONT of the rails by design — so the dispatch is signed the way a
  // player signs it, and only then is the walkthrough card asserted on. Without
  // this the assertions below would read the card through the marker's render-time
  // suppression and pass for the wrong reason. RNG-free: no engine action.
  await signOpeningMarker(page);
  await expect(card(page)).toHaveCount(0);

  // …until Settings arms it again, which lands on the NEXT fresh career.
  await page.getByTestId('settings-toggle').click();
  await page.getByTestId('set-replay-walkthrough').click();
  await page.getByTestId('settings-toggle').click();
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByLabel('seed').fill('4242');
  await page.getByRole('button', { name: 'Roll' }).click();
  // T-200 · A fresh career always opens under its own Guild marker, and it
  // stands in FRONT of the rails by design — so the dispatch is signed the way a
  // player signs it, and only then is the walkthrough card asserted on. Without
  // this the assertions below would read the card through the marker's render-time
  // suppression and pass for the wrong reason. RNG-free: no engine action.
  await signOpeningMarker(page);
  await expectStep(page, 'w1-dawn-hand');
  expect((await persisted(page))?.status).toBe('active');
});
