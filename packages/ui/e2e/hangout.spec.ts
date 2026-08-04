import { test, expect, type Page } from '@playwright/test';
import { skipFirstTurnWalkthrough } from './support/career';
import {
  DARE_MIN_WAGER,
  LOAN_MIN_PRINCIPAL,
  LOAN_MAX_PRINCIPAL,
  LOAN_DAILY_RATE,
  LOAN_TERM_DAYS,
  PORT_HANGOUTS,
} from '@spacerquest/content';

// T-1404 acceptance: the Spacers Hangout as a visitable place, driven ENTIRELY
// through the real UI (no state injection, no API calls). Visit the pane, wager a
// die on a Spacer's Dare and read BOTH opposed actors' honest checks; take and
// repay a Penny Wise loan through the desk; confirm the pane tracks exactly where
// the engine says a Hangout exists; and trace every displayed number to an engine
// export / content constant.
//
// T-132 EXTENDS THIS FILE to the dark half of the room. The pane now exposes SIX of
// the engine's seven venues — the Dare, `meet`, `befriend`, `insult`, the free
// rumor table and Penny Wise's desk — plus the authored house name, room line and
// per-venue flavour that fourteen `PORT_HANGOUTS` rows carry and that nothing read
// until now. The SEVENTH venue, `rumor`, is deliberately not dispatchable:
// `VisitHangout{rumor}` spends a die to emit exactly the `hangoutRumors` lines the
// rumor table already renders for free, so a paid control would be strictly
// dominated by one already on screen.
//
// FIXTURE: the player starts at Sol-3 (id 1 — the home hall, and since T-121 one
// of fourteen `hasHangout` core ports) and the
// cast's index-0 NPC `npc-iron-vex` starts co-located at Sol-3 on ANY seed —
// `createInitialState` seats NPCs at `(index % 20) + 1` and `startDay` never moves
// them (movement is a dusk step), so Iron Vex is a valid, solvent (5000cr) Dare
// dealer at day-1 dawn. Seed 1 additionally deals the dawn hand [17,15,15,7,4] and
// gives an encounter-free Sol-3 -> Aldebaran-1 (1->2) jump (shared with
// starmap.spec.ts), used by the gate test to leave the Hangout cleanly.
const SEED = 1;
const DEALER = 'npc-iron-vex';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // T-187 · This spec is NOT testing the first-time flow — retire the scripted
  // first-turn walkthrough before the app boots, or its rails would make the
  // panes below inert. See `support/career.ts`.
  await skipFirstTurnWalkthrough(page);
});

/** Start a fresh, deterministic career on a chosen seed, entirely through the UI. */
async function newGameSeed(page: Page, seed: number): Promise<void> {
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByLabel('seed').fill(String(seed));
  await page.getByRole('button', { name: 'Roll' }).click();
}

function npcRow(page: Page, id: string) {
  return page.locator(`[data-testid="hangout-npc"][data-npc-id="${id}"]`);
}

// T-136 · THIS TEST WAS REWRITTEN, NOT REPLACED. It used to assert
// `dare-check-player` / `dare-check-opponent` — the two opposed GUILE checks the
// Dare emitted until T-135 turned it into a hand of Liar's Dice. The engine emits
// neither any more (§8.4: the hand's ONE possible check is the optional Peek), so
// the old assertions could never pass again. What survives here is what is still
// this file's business: the ROOM — the launcher, the opponent picker, the port's
// wager band, and the fact that committing a die SEATS the player at a table. The
// table itself is `liars-dice.spec.ts`'s.
test('visit the Hangout, pick an opponent, and seat yourself at the dice table', async ({
  page,
}) => {
  await page.goto('/');
  await newGameSeed(page, SEED);

  // 1) Visit: the Hangout launcher is present at Sol-3; open the pane.
  await page.getByTestId('hangout-toggle').click();
  await expect(page.getByTestId('hangout-panel')).toBeVisible();

  // 2) The present-NPC list carries Iron Vex (co-located at Sol-3) — pick him.
  await expect(npcRow(page, DEALER)).toBeVisible();
  await npcRow(page, DEALER).click();

  // 3) The wager band is the PORT's, shown up front; set a valid wager.
  await expect(page.getByTestId('dare-wager-bounds')).toContainText(`WAGER ${DARE_MIN_WAGER}`);
  await page.getByTestId('dare-wager').fill('100');

  // 4) Arm a die from the (still-reachable) HandDock and commit the Dare.
  await page.getByTestId('die').nth(0).click();
  await expect(page.getByTestId('dare-commit')).toBeEnabled();
  await page.getByTestId('dare-commit').click();

  // 5) The SCENE opened. The opening visit no longer resolves anything — it deals
  //    eight dice and posts both seeds into escrow.
  await expect(page.getByTestId('dare-scene')).toBeVisible();
  await expect(page.locator('[data-testid="dare-player-die"]')).toHaveCount(4);
  await expect(page.getByTestId('dare-pot-player')).toContainText('100');
  await expect(page.getByTestId('dare-pot-dealer')).toContainText('100');
  // The seed is debited the moment the hand opens (§2.4 — escrow, not a promise).
  await expect(page.getByTestId('credits')).toHaveText('900');

  // 6) Exactly one die was spent to seat yourself; the rest of the hand is credits.
  const spent = await page
    .getByTestId('die')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-spent')));
  expect(spent.filter((s) => s === '1').length).toBe(1);

  // Fold out so the rest of this file's tests are not run behind a locked panel.
  await page.locator('[data-testid="dare-move"][data-move="fold"]').click();
  await expect(page.getByTestId('dare-reveal')).toBeVisible();
});

test('take and repay a Penny Wise loan entirely through the UI', async ({ page }) => {
  await page.goto('/');
  await newGameSeed(page, SEED);

  await page.getByTestId('hangout-toggle').click();
  await expect(page.getByTestId('hangout-panel')).toBeVisible();

  // The schedule is visible UP FRONT — every number a raw content constant.
  const terms = page.getByTestId('loan-terms');
  await expect(terms).toContainText(`${LOAN_MIN_PRINCIPAL}`); // 250 floor
  await expect(terms).toContainText(`${LOAN_DAILY_RATE * 100}%`); // 5%/dusk
  await expect(terms).toContainText(`${LOAN_TERM_DAYS}-dusk`); // 15-dusk term

  // Starter credits are 1000; borrowing the minimum principal advances +250.
  await expect(page.getByTestId('credits')).toHaveText('1,000');

  // Borrow: arm a die, take the loan at the minimum principal (the input default).
  await page.getByTestId('die').nth(0).click();
  await page.getByTestId('loan-borrow').click();

  await expect(page.getByTestId('credits')).toHaveText('1,250');
  const status = page.getByTestId('loan-status');
  await expect(status).toBeVisible();
  await expect(status).toContainText(`${LOAN_MIN_PRINCIPAL}`); // outstanding = principal at issue
  await expect(status).toContainText('DUE D'); // engine-written due day

  // Repay: arm a second die and pay the balance in full — the loan clears.
  await page.getByTestId('die').nth(1).click();
  await page.getByTestId('loan-repay-amount').fill(String(LOAN_MIN_PRINCIPAL));
  await page.getByTestId('loan-repay').click();

  await expect(page.getByTestId('credits')).toHaveText('1,000');
  // The desk returns to the no-loan state: the status is gone, borrow is offered again.
  await expect(page.getByTestId('loan-status')).toHaveCount(0);
  await expect(page.getByTestId('loan-borrow')).toBeVisible();
});

// T-121 · INVERTED, deliberately (docs/HANGOUT_REDESIGN.md §4.2). This test used
// to jump to Aldebaran-1 and assert the launcher VANISHED; the reach change gives
// Aldebaran-1 a bar, so the old assertion is simply false. It was NOT retargeted
// to a rim port: the rim shell sits ~20–24 units out (`content/systems.ts` layout
// note) and a fresh day-1 start cannot fund that hop, so the test would become
// unrunnable rather than merely different. The negative case moved to a unit test
// over `hangoutOpen()` at a rim id and at NEMESIS
// (`packages/ui/src/__tests__/hangout-gate.test.ts`), which needs no funded jump.
//
// What is asserted here is now STRONGER than what it replaced: the pane FOLLOWS
// the engine's content gate to a second, non-home port, rather than merely
// disappearing where content is absent.
test('the Hangout pane follows the engine gate to a second port', async ({ page }) => {
  await page.goto('/');
  await newGameSeed(page, SEED);

  // Sol-3 — the launcher is present at the home hall.
  await expect(page.getByTestId('hangout-toggle')).toHaveCount(1);

  // Jump one clean, encounter-free hop to Aldebaran-1 (id 2 — a core port, and
  // since T-121 a `hasHangout` one).
  await page.getByTestId('die').nth(0).click();
  const dest = page.locator('[data-testid="starmap-system"][data-system-id="2"]');
  await expect(dest).toHaveAttribute('data-reachable', '1');
  await dest.click();
  await page.getByTestId('confirm-jump').click();

  // Arrived at a different bar: the launcher is still there — the pane tracks the
  // exact `hasHangout` gate day.ts enforces, not a hard-coded home port.
  await expect(page.getByTestId('day')).toBeVisible();
  await expect(page.getByTestId('hangout-toggle')).toHaveCount(1);
});

// ---------------------------------------------------------------------------
// T-132 · the three social venues, the house's authored voice, and the per-port
// venue gate — all through real clicks.
// ---------------------------------------------------------------------------

/** Arm a die, dispatch one social venue against the chosen captain, and confirm the
 *  engine's readout came back with NO typed fail notice. */
async function dispatchSocial(page: Page, venue: string, dieIndex: number): Promise<void> {
  await page.getByTestId('die').nth(dieIndex).click();
  const button = page.locator(`[data-testid="hangout-social"][data-venue="${venue}"]`);
  await expect(button).toBeEnabled();
  await button.click();
  const outcome = page.getByTestId('social-outcome');
  await expect(outcome).toBeVisible();
  await expect(outcome).toHaveAttribute('data-venue', venue);
  // A committed venue is not a refusal: the pane-local fail surface stays empty.
  await expect(page.getByTestId('hangout-notice')).toHaveCount(0);
}

test('meet, befriend and insult are each dispatchable at the Long Table', async ({ page }) => {
  await page.goto('/');
  await newGameSeed(page, SEED);

  await page.getByTestId('hangout-toggle').click();
  await expect(page.getByTestId('hangout-panel')).toBeVisible();

  // Pick the dealer once — all three venues take the same co-located captain.
  await expect(npcRow(page, DEALER)).toBeVisible();
  await npcRow(page, DEALER).click();

  // 1) meet — an introduction, no roll: the readout carries the engine's applied
  //    disposition delta and NO StatCheck at all.
  await dispatchSocial(page, 'meet', 0);
  await expect(page.getByTestId('social-check')).toHaveCount(0);
  await expect(page.getByTestId('social-result')).toHaveAttribute('data-delta', /^-?\d+$/);

  // 2) befriend — the one social venue that ROLLS: a GUILE check against the
  //    port's authored DC, rendered through the shared honest-dice readout.
  await dispatchSocial(page, 'befriend', 1);
  const check = page.getByTestId('social-check');
  await expect(check).toBeVisible();
  await expect(check.getByTestId('check-stat')).toHaveText('GUILE');
  await expect(check.getByTestId('check-die')).toBeVisible();
  await expect(check.getByTestId('check-dc')).toBeVisible();
  await expect(check.getByTestId('check-result')).toHaveText(/SUCCESS|FAILURE/);

  // 3) insult — always lands, never rolls, and the delta is negative.
  await dispatchSocial(page, 'insult', 2);
  await expect(page.getByTestId('social-check')).toHaveCount(0);
  await expect(page.getByTestId('social-result')).toHaveAttribute('data-delta', /^-\d+$/);

  // Exactly three dice were spent — one per venue, none burned by a refusal.
  const spent = await page
    .getByTestId('die')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-spent')));
  expect(spent.filter((s) => s === '1').length).toBe(3);
});

test('the house speaks: its name, its room line and its venue flavour', async ({ page }) => {
  await page.goto('/');
  await newGameSeed(page, SEED);

  await page.getByTestId('hangout-toggle').click();
  await expect(page.getByTestId('hangout-panel')).toBeVisible();

  // Every expectation comes from the CONTENT row, never a hard-coded literal: a
  // re-authoring pass must move the prose without breaking the rendering path.
  const prose = PORT_HANGOUTS[1].prose;
  await expect(page.getByTestId('hangout-house')).toContainText(prose.houseName);
  const room = page.getByTestId('hangout-room-line');
  await expect(room).toBeVisible();
  await expect(room).toHaveText(String(prose.roomLine));
  const flavour = page.locator('[data-testid="hangout-flavour"][data-venue="dare"]');
  await expect(flavour).toBeVisible();
  await expect(flavour).toHaveText(String(prose.flavour.dare));
});

// T-133 (owner ruling D7) · INVERTED, deliberately. This test used to assert that
// Arcturus-6's garrison mess showed NO credit desk at all — `venueOffered(4,
// 'borrow')` was false, so the whole section was absent. D7 amends §2.2 ruling 5:
// a row now carries its own `loanBand`, so the garrison runs its desk again and
// says "tight credit" with a ceiling instead of an absence. What is asserted here
// is STRONGER than what it replaced — an absence is proved by counting elements,
// while a clamp has to be driven: fill the principal control with more than this
// desk will front, arm a die, click Borrow, and read what the engine actually
// wrote.
//
// NO NUMBER IS RESTATED. The ceiling comes off `PORT_HANGOUTS[4].loanBand`, so a
// re-authoring pass moves this test with the content.
test('a tight-credit port fronts less than you ask for, and says so up front', async ({ page }) => {
  await page.goto('/');
  await newGameSeed(page, SEED);

  // One clean, encounter-free hop to Arcturus-6 (id 4 — the garrison mess, and the
  // only authored row that carries a `loanBand` of its own). Verified against the
  // built engine on seed 1 with die 0: the jump arrives with no encounter.
  await page.getByTestId('die').nth(0).click();
  const dest = page.locator('[data-testid="starmap-system"][data-system-id="4"]');
  await expect(dest).toHaveAttribute('data-reachable', '1');
  await dest.click();
  await page.getByTestId('confirm-jump').click();

  await page.getByTestId('hangout-toggle').click();
  await expect(page.getByTestId('hangout-panel')).toBeVisible();

  // The pane followed content to a second, differently-voiced house.
  await expect(page.getByTestId('hangout-house')).toContainText(PORT_HANGOUTS[4].prose.houseName);

  // The band is the PORT's, visible before a credit changes hands — and it is
  // genuinely tighter than the galaxy's, or this test would be measuring nothing.
  const band = PORT_HANGOUTS[4].loanBand!;
  expect(band.max).toBeLessThan(LOAN_MAX_PRINCIPAL);
  const terms = page.getByTestId('loan-terms');
  await expect(terms).toBeVisible();
  await expect(terms).toContainText(`${band.max}`);
  // …and the control itself carries the bounds, so the clamp is not prose only.
  const input = page.getByTestId('loan-principal');
  await expect(input).toHaveAttribute('data-max', String(band.max));
  await expect(input).toHaveAttribute('data-min', String(band.min));

  // THE CLAMP, THROUGH THE TERMINAL. Ask for the galaxy's ceiling; the garrison
  // counts out its own. Not an error, not a refusal notice — a smaller marker.
  await input.fill(String(LOAN_MAX_PRINCIPAL));
  await page.getByTestId('die').nth(1).click();
  await page.getByTestId('loan-borrow').click();

  const status = page.getByTestId('loan-status');
  await expect(status).toBeVisible();
  await expect(status).toContainText(`${band.max.toLocaleString()}cr`);
  await expect(page.getByTestId('hangout-notice')).toHaveCount(0);

  // …and the gate is still PER-VENUE, not a blanket show: the mess seats a
  // stranger, so `meet` is offered here too.
  await expect(page.locator('[data-testid="hangout-social"][data-venue="meet"]')).toBeVisible();
});

test('a hall that seats no stranger offers no introduction', async ({ page }) => {
  await page.goto('/');
  await newGameSeed(page, SEED);

  // Deneb-4 (id 5 — the League's Standing Hall) omits exactly one venue: 'meet'.
  // Same clean-hop fixture as above, verified encounter-free on seed 1 / die 0.
  await page.getByTestId('die').nth(0).click();
  const dest = page.locator('[data-testid="starmap-system"][data-system-id="5"]');
  await expect(dest).toHaveAttribute('data-reachable', '1');
  await dest.click();
  await page.getByTestId('confirm-jump').click();

  await page.getByTestId('hangout-toggle').click();
  await expect(page.getByTestId('hangout-panel')).toBeVisible();
  await expect(page.getByTestId('hangout-house')).toContainText(PORT_HANGOUTS[5].prose.houseName);

  // The withheld venue is UNREACHABLE BY CONSTRUCTION — the honest
  // `'venue-not-offered'` notice that would have rendered had the player got that
  // far is asserted in `src/__tests__/hangout-pane.test.ts`, since no UI path can
  // now emit the action at all.
  await expect(page.locator('[data-testid="hangout-social"][data-venue="meet"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="hangout-social"][data-venue="befriend"]')).toBeVisible();
  // The hall DOES run a credit desk, so this is not a blanket social hide either.
  await expect(page.getByTestId('loan-terms')).toBeVisible();
});
