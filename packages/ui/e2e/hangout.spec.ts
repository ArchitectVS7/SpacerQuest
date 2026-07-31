import { test, expect, type Page } from '@playwright/test';
import {
  DARE_MIN_WAGER,
  LOAN_MIN_PRINCIPAL,
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
// FIXTURE: the player starts at Sun-3 (id 1 — the home hall, and since T-121 one
// of fourteen `hasHangout` core ports) and the
// cast's index-0 NPC `npc-iron-vex` starts co-located at Sun-3 on ANY seed —
// `createInitialState` seats NPCs at `(index % 20) + 1` and `startDay` never moves
// them (movement is a dusk step), so Iron Vex is a valid, solvent (5000cr) Dare
// dealer at day-1 dawn. Seed 1 additionally deals the dawn hand [17,15,15,7,4] and
// gives an encounter-free Sun-3 -> Aldebaran-1 (1->2) jump (shared with
// starmap.spec.ts), used by the gate test to leave the Hangout cleanly.
const SEED = 1;
const DEALER = 'npc-iron-vex';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await page.emulateMedia({ reducedMotion: 'reduce' });
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

test('visit the Hangout, wager a die, and read BOTH actors’ honest checks', async ({ page }) => {
  await page.goto('/');
  await newGameSeed(page, SEED);

  // 1) Visit: the Hangout launcher is present at Sun-3; open the pane.
  await page.getByTestId('hangout-toggle').click();
  await expect(page.getByTestId('hangout-panel')).toBeVisible();

  // 2) The present-NPC list carries Iron Vex (co-located at Sun-3) — pick him.
  await expect(npcRow(page, DEALER)).toBeVisible();
  await npcRow(page, DEALER).click();

  // 3) The wager band is the CONTENT constant, shown up front; set a valid wager.
  await expect(page.getByTestId('dare-wager-bounds')).toContainText(`WAGER ${DARE_MIN_WAGER}`);
  await page.getByTestId('dare-wager').fill('100');

  // 4) Arm a die from the (still-reachable) HandDock and commit the Dare.
  await page.getByTestId('die').nth(0).click();
  await expect(page.getByTestId('dare-commit')).toBeEnabled();
  await page.getByTestId('dare-commit').click();

  // 5) BOTH opposed checks render — the honest-dice signature applied to gambling.
  for (const testid of ['dare-check-player', 'dare-check-opponent']) {
    const check = page.getByTestId(testid);
    await expect(check).toBeVisible();
    // Opposed GUILE: each side's stat, a rolled d20, a DC, a margin and a verdict.
    await expect(check.getByTestId('check-stat')).toHaveText('GUILE');
    await expect(check.getByTestId('check-die')).toBeVisible();
    await expect(check.getByTestId('check-dc')).toBeVisible();
    await expect(check.getByTestId('check-margin')).toBeVisible();
    // The verdict is seed-dependent; assert it is one of the honest two, not which.
    await expect(check.getByTestId('check-result')).toHaveText(/SUCCESS|FAILURE/);
  }

  // 6) The signed credits delta reads off the engine's HangoutEvent, never recomputed.
  const result = page.getByTestId('dare-result');
  await expect(result).toBeVisible();
  await expect(result).toHaveAttribute('data-won', /0|1/);
  await expect(result).toContainText(/[+-]100cr/);

  // Exactly one die was spent by the Dare.
  const spent = await page
    .getByTestId('die')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-spent')));
  expect(spent.filter((s) => s === '1').length).toBe(1);
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

  // Sun-3 — the launcher is present at the home hall.
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

test('a port with no credit desk shows none, and still seats a stranger', async ({ page }) => {
  await page.goto('/');
  await newGameSeed(page, SEED);

  // One clean, encounter-free hop to Arcturus-6 (id 4 — the garrison mess, and the
  // only authored row that omits BOTH 'borrow' and 'repay'). Verified against the
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

  // F-123-1 · The desk is gone entirely, because `venueOffered(4, 'borrow')` is
  // false — not disabled, not refusing after the click: absent.
  await expect(page.getByTestId('loan-terms')).toHaveCount(0);
  await expect(page.getByTestId('loan-borrow')).toHaveCount(0);
  await expect(page.getByTestId('loan-status')).toHaveCount(0);

  // …and the gate is PER-VENUE, not a blanket hide: the mess still seats a
  // stranger, so `meet` is offered here.
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
