import { test, expect, type Page } from '@playwright/test';
import { createInitialState, startDay, createSave, type GameState } from '@spacerquest/engine';

// T-311 acceptance: Tour One's teaching layer, driven end to end through the real
// cockpit UI (per the global "validate the UX, never the API" rule). The only
// engine use here is OFFLINE save-fixture construction — exactly as the wire/combat
// specs do — never an in-page engine call that bypasses a screen the player uses.
//
//   Fresh default seed 424242 (Test A): Day 1 at Sun-3, dawn hand [19,14,14,13,3].
//     - Contract 0 carries cargo to system 9.
//     - Sign with die index 0, top the tank off (a visible fuel affordance), then
//       jump with die index 2 → delivery pays out (1,000 → 3,420cr, hold empties).
//       The whole first delivery is reachable guided by the contextual prompts +
//       visible affordances.
//     - T-1104 re-fixture: the rim/contraband payment overhaul changed rollContract's
//       RNG draw order (it now rolls a rim-vs-core coin BEFORE the destination), which
//       re-rolls the whole board for seed 424242 — contract 0 now routes to system 9
//       (was 3) and pays 2,500 (final credits 3,420, was 3,120). Re-derived offline by
//       replaying startDay(createInitialState(424242)) -> sign -> buy-fuel -> Travel:
//       the guided jump to system 9 lands clean (no interceptor) and the hold empties.
//     - T-1103 rationale (still holds): the encounter-rate repair (core 0.08 -> 0.30)
//       makes a LOADED delivery jump risk an interceptor; interposing the fuel top-off
//       (one engine action) advances the RNG stream so the guided jump's encounter roll
//       clears — verified clean under the T-1104 stream above. The fuel top-off is
//       itself on-PRD onboarding ("fuel is the plot"). Seed 424242 is the store's shared
//       default and is deliberately UNCHANGED.
//   Seed 887 (Test B): dawn hand [20,18,13,7,6]; jump die INDEX 1 (value 18, which
//     clears the T-1101 rim DC 18) to system 15 triggers a tier-2 encounter (the
//     combat-spec fixture). T-1103: still fires (rim rate rose 0.32 -> 0.50).
//   Day-30 dawn saves (Tests C/D) are built offline and injected via the save
//     envelope, with all onboarding prompts pre-marked seen so no coach callout
//     interferes with the ceremony assertions.

const ALL_ONBOARDING_SEEN = JSON.stringify({
  'dawn-roll': true,
  'first-sign': true,
  'first-jump': true,
  'first-encounter': true,
  // T-1407 · the new-verb prompts, pre-marked so the day-30 ceremony fixtures
  // (which boot at a hangout/purchasable system) never surface a coach callout.
  'first-hangout': true,
  'first-loan': true,
  'first-contraband': true,
  'first-port': true,
  'first-explore': true,
});

/**
 * T-1407 · Boot the store into an offline save fixture with a chosen onboarding
 * seen-set, isolating the target new-verb prompt as the winner (the guided
 * delivery chain is pre-seen away, and higher-priority new prompts too). Offline
 * fixture construction only — the same allowance the wire/combat specs use; every
 * prompt is then driven and dismissed through the real DOM, never an engine call.
 *
 * The init script GUARDS on an existing save so it does NOT clobber the app's own
 * persisted onboarding record on page.reload() — that record (with the dismissal
 * the persistence assertions depend on) must survive the reboot, exactly as the
 * un-scripted Test A relies on.
 */
async function bootOnboardingFixture(
  page: Page,
  seed: number,
  seen: Record<string, true>,
  mutate?: (s: GameState) => void,
): Promise<void> {
  const base = startDay(createInitialState(seed)).state;
  mutate?.(base);
  const save = createSave(base, seed);
  await page.addInitScript(
    ([s, ob]) => {
      if (!window.localStorage.getItem('sq.save.v1')) {
        window.localStorage.setItem('sq.save.v1', s);
        window.localStorage.setItem('sq.onboarding.v1', ob);
      }
    },
    [save, JSON.stringify(seen)] as const,
  );
  await page.goto('/');
}

test.beforeEach(async ({ page }) => {
  // Settle the dawn-roll scramble so a die's displayed face equals its dealt
  // value the instant we read it, and disable the coach fade (same pattern as the
  // dawn-hand / combat specs).
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

async function newGameSeed(page: Page, seed: number): Promise<void> {
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByLabel('seed').fill(String(seed));
  await page.getByRole('button', { name: 'Roll' }).click();
}

test('fresh seed: first delivery guided by visible affordances; each prompt fires once; state persists', async ({
  page,
}) => {
  // A genuinely fresh career: each test runs in an isolated context, so
  // localStorage starts empty — the default seed 424242 and a fresh onboarding
  // record both boot from scratch. We deliberately do NOT addInitScript a clear
  // (it would re-run on page.reload() and wipe the persisted seen-record the
  // final persistence assertion depends on — the combat-spec gotcha).
  await page.goto('/');

  const coach = page.getByTestId('onboarding');

  // 1) The dawn-roll coach fires first (highest-priority active prompt on a fresh
  //    day-1 hand). Dismiss it via its own affordance (the manual path) → the next
  //    prompt in the guided sequence, first-sign, takes its place.
  await expect(coach).toBeVisible();
  await expect(coach).toHaveAttribute('data-onboarding-id', 'dawn-roll');
  await page.getByTestId('onboarding-dismiss').click();
  await expect(coach).toHaveAttribute('data-onboarding-id', 'first-sign');

  // 2) Take the job through the manifest: assign a die, sign contract 0. The
  //    active-contract tracker populates and first-sign AUTO-dismisses (the taught
  //    action was performed) → first-jump takes its place.
  await expect(page.getByTestId('active-contract-empty')).toBeVisible();
  await page.getByTestId('die').nth(0).click();
  await page.getByTestId('contract').first().click();
  await expect(page.getByTestId('active-contract-empty')).toHaveCount(0);
  await expect(coach).toHaveAttribute('data-onboarding-id', 'first-jump');

  // 2b) Top the tank off before the run (a visible fuel affordance — "fuel is the
  //     plot"). This is also the T-1103 re-fixture hinge: the extra engine action
  //     advances the RNG so the loaded guided jump clears its (now 0.40) encounter
  //     roll on seed 424242. first-jump is the taught prompt and stays up (buying
  //     fuel is not the jump it teaches).
  await page.getByTestId('die').nth(1).click();
  await page.getByTestId('fuel-amount').fill('10');
  await page.getByTestId('buy-fuel').click();
  await expect(coach).toHaveAttribute('data-onboarding-id', 'first-jump');

  // 3) Plot and confirm the jump through the starmap (die → destination → commit),
  //    exactly as a player would. Delivery pays out on arrival: credits climb and
  //    the hold empties. first-jump AUTO-dismisses and, the delivery done, no
  //    further prompt is due.
  await page.getByTestId('die').nth(2).click();
  await page.locator('[data-testid="starmap-system"][data-system-id="9"]').click();
  await page.getByTestId('confirm-jump').click();

  await expect(page.getByTestId('credits')).toHaveText('3,420');
  await expect(page.getByTestId('active-contract-empty')).toBeVisible();

  // 4) The delivery lands at Pollux-7 (system 9), a purchasable core port with a
  //    full-enough tank — so the T-1407 contextual prompts now take over: first the
  //    port nudge (higher priority), then the off-lane sweep nudge. Each fires once
  //    and is dismissed via its own affordance (these are manual-dismiss-only). No
  //    contraband rides the sys-9 board here, so the contraband nudge stays silent.
  await expect(coach).toHaveAttribute('data-onboarding-id', 'first-port');
  await expect(coach).toHaveAttribute('data-onboarding-anchor', 'port');
  await page.getByTestId('onboarding-dismiss').click();
  await expect(coach).toHaveAttribute('data-onboarding-id', 'first-explore');
  await expect(coach).toHaveAttribute('data-onboarding-anchor', 'starmap');
  await page.getByTestId('onboarding-dismiss').click();
  await expect(coach).toHaveCount(0);

  // 5) Fired once + persistence: reload WITHOUT clearing storage. The seen record
  //    rode along in sq.onboarding.v1, so no prompt re-fires on the fresh boot.
  await page.reload();
  await expect(page.getByTestId('onboarding')).toHaveCount(0);
});

// ---- T-1407 · one test per new verb, driven through the real cockpit --------
// Each proves: the prompt fires once, anchored to its real affordance; the
// dismissed state persists across reload; and it never fires for a state that
// cannot perform the verb (the negative sub-check). Fixtures pre-seen the guided
// delivery chain (and any higher-priority new prompt) so the target is the winner.

const SEEN_DELIVERY = { 'dawn-roll': true, 'first-sign': true } as const;

test('first-hangout coach fires once at a Hangout system, anchored, and persists', async ({
  page,
}) => {
  // Sun-3 (system 1) hosts the only Tour One Hangout. With the delivery chain
  // pre-seen, the highest-priority new prompt at a hangout system is first-hangout.
  await bootOnboardingFixture(page, 424242, { ...SEEN_DELIVERY });

  const coach = page.getByTestId('onboarding');
  await expect(coach).toBeVisible();
  await expect(coach).toHaveAttribute('data-onboarding-id', 'first-hangout');
  await expect(coach).toHaveAttribute('data-onboarding-anchor', 'hangout');

  await page.getByTestId('onboarding-dismiss').click();
  // Persistence: reload; the hangout nudge does not re-fire (the loan nudge is
  // next in priority but mounts inside the closed panel, so nothing shows here).
  await page.reload();
  await expect(page.locator('[data-onboarding-id="first-hangout"]')).toHaveCount(0);
});

test('first-hangout never fires where no Hangout exists', async ({ page }) => {
  // A rim system (Antares-5, id 15) has no Hangout — the nudge must stay silent.
  await bootOnboardingFixture(page, 424242, { ...SEEN_DELIVERY }, (s) => {
    s.player.currentSystemId = 15;
  });
  await expect(page.getByTestId('day')).toBeVisible();
  await expect(page.locator('[data-onboarding-id="first-hangout"]')).toHaveCount(0);
});

test('first-loan coach fires once inside the open Hangout panel, anchored, and persists', async ({
  page,
}) => {
  // Delivery chain + the hangout nudge pre-seen, so first-loan is the winner. It
  // mounts INSIDE the panel, so it only surfaces once the player opens the Hangout.
  await bootOnboardingFixture(page, 424242, { ...SEEN_DELIVERY, 'first-hangout': true });

  // Nothing at cockpit screen level (the loan nudge routes to the hangout mount).
  await expect(page.getByTestId('onboarding')).toHaveCount(0);

  await page.getByTestId('hangout-toggle').click();
  const panel = page.getByTestId('hangout-panel');
  const coach = panel.getByTestId('onboarding');
  await expect(coach).toBeVisible();
  await expect(coach).toHaveAttribute('data-onboarding-id', 'first-loan');
  await expect(coach).toHaveAttribute('data-onboarding-anchor', 'loan');

  await panel.getByTestId('onboarding-dismiss').click();
  // Persistence: reload, re-open the panel — the loan nudge does not re-fire.
  await page.reload();
  await page.getByTestId('hangout-toggle').click();
  await expect(page.getByTestId('hangout-panel')).toBeVisible();
  await expect(page.locator('[data-onboarding-id="first-loan"]')).toHaveCount(0);
});

test('first-loan never fires when a loan is already outstanding', async ({ page }) => {
  // A player already carrying a Penny Wise loan cannot borrow again — the in-panel
  // nudge must stay silent even at the Hangout.
  await bootOnboardingFixture(page, 424242, { ...SEEN_DELIVERY, 'first-hangout': true }, (s) => {
    s.player.loan = {
      lender: 'npc-penny-wise',
      principal: 5000,
      outstanding: 5000,
      dailyRate: 0.05,
      borrowedDay: 1,
      dueDay: 15,
      status: 'active',
    };
  });
  await page.getByTestId('hangout-toggle').click();
  await expect(page.getByTestId('hangout-panel')).toBeVisible();
  await expect(page.locator('[data-onboarding-id="first-loan"]')).toHaveCount(0);
});

test('first-contraband coach fires once at a contraband offer, anchored, and persists', async ({
  page,
}) => {
  // A non-Hangout core system (Aldebaran-1, id 2) with a contraband offer on the
  // board and the delivery chain pre-seen: first-contraband is the winner.
  await bootOnboardingFixture(page, 424242, { ...SEEN_DELIVERY }, (s) => {
    s.player.currentSystemId = 2;
    s.market.manifestBoard[0].cargoType = 10; // the lone contraband cargo id
  });

  const coach = page.getByTestId('onboarding');
  await expect(coach).toBeVisible();
  await expect(coach).toHaveAttribute('data-onboarding-id', 'first-contraband');
  await expect(coach).toHaveAttribute('data-onboarding-anchor', 'manifest');

  await page.getByTestId('onboarding-dismiss').click();
  await page.reload();
  await expect(page.locator('[data-onboarding-id="first-contraband"]')).toHaveCount(0);
});

test('first-contraband never fires when the board carries no contraband', async ({ page }) => {
  // Scrub the board of contraband — the nudge must stay silent (a purchasable port
  // nudge may show instead; we only assert the contraband nudge never appears).
  await bootOnboardingFixture(page, 424242, { ...SEEN_DELIVERY }, (s) => {
    s.player.currentSystemId = 2;
    for (const c of s.market.manifestBoard) c.cargoType = 1; // Dry Goods, clean
  });
  await expect(page.getByTestId('day')).toBeVisible();
  await expect(page.locator('[data-onboarding-id="first-contraband"]')).toHaveCount(0);
});

test('first-port coach fires once at a purchasable port, anchored, and persists', async ({
  page,
}) => {
  // A purchasable core port (Aldebaran-1, id 2) with the delivery chain + the
  // contraband nudge pre-seen, so first-port is the winner (over first-explore).
  await bootOnboardingFixture(page, 424242, { ...SEEN_DELIVERY, 'first-contraband': true }, (s) => {
    s.player.currentSystemId = 2;
  });

  const coach = page.getByTestId('onboarding');
  await expect(coach).toBeVisible();
  await expect(coach).toHaveAttribute('data-onboarding-id', 'first-port');
  await expect(coach).toHaveAttribute('data-onboarding-anchor', 'port');

  await page.getByTestId('onboarding-dismiss').click();
  // The off-lane sweep nudge takes its place (still affordable); the port nudge
  // does not re-fire after reload.
  await expect(coach).toHaveAttribute('data-onboarding-id', 'first-explore');
  await page.reload();
  await expect(page.locator('[data-onboarding-id="first-port"]')).toHaveCount(0);
});

test('first-port never fires at a system with no purchasable port', async ({ page }) => {
  // A rim system (id 15) is not a purchasable port — the nudge must stay silent.
  await bootOnboardingFixture(page, 424242, { ...SEEN_DELIVERY, 'first-contraband': true }, (s) => {
    s.player.currentSystemId = 15;
  });
  await expect(page.getByTestId('day')).toBeVisible();
  await expect(page.locator('[data-onboarding-id="first-port"]')).toHaveCount(0);
});

test('first-explore coach fires once when the tank can afford a sweep, anchored, and persists', async ({
  page,
}) => {
  // A rim system (id 15, no Hangout, not a purchasable port) with a full tank and
  // the higher-priority new prompts pre-seen: first-explore is the sole winner.
  await bootOnboardingFixture(page, 424242, { ...SEEN_DELIVERY, 'first-contraband': true }, (s) => {
    s.player.currentSystemId = 15;
  });

  const coach = page.getByTestId('onboarding');
  await expect(coach).toBeVisible();
  await expect(coach).toHaveAttribute('data-onboarding-id', 'first-explore');
  await expect(coach).toHaveAttribute('data-onboarding-anchor', 'starmap');

  await page.getByTestId('onboarding-dismiss').click();
  await expect(coach).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-onboarding-id="first-explore"]')).toHaveCount(0);
});

test('first-explore never fires when the tank cannot afford a sweep', async ({ page }) => {
  // Drain the tank below the sweep's fuel cost (80) — the nudge must stay silent.
  await bootOnboardingFixture(page, 424242, { ...SEEN_DELIVERY, 'first-contraband': true }, (s) => {
    s.player.currentSystemId = 15;
    s.player.ship.fuel = 40;
  });
  await expect(page.getByTestId('day')).toBeVisible();
  await expect(page.locator('[data-onboarding-id="first-explore"]')).toHaveCount(0);
});

test('first-encounter coach fires once, inside combat, and its dismissed state persists', async ({
  page,
}) => {
  await page.goto('/');
  await newGameSeed(page, 887);

  // Jump into the seeded interception (no contract needed — the coach keys off the
  // live encounter). The combat overlay mounts, and the highest-priority prompt —
  // the combat coach — surfaces INSIDE it.
  await page.getByTestId('die').nth(1).click();
  await page.locator('[data-testid="starmap-system"][data-system-id="15"]').click();
  await page.getByTestId('confirm-jump').click();

  const overlay = page.getByTestId('combat-overlay');
  await expect(overlay).toBeVisible();
  const coach = overlay.getByTestId('onboarding');
  await expect(coach).toBeVisible();
  await expect(coach).toHaveAttribute('data-onboarding-id', 'first-encounter');

  // Dismiss it via its own affordance, then reload mid-encounter: the autosaved
  // encounter is restored, but the coach does NOT re-fire (seen state persisted).
  await overlay.getByTestId('onboarding-dismiss').click();
  await expect(coach).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('combat-overlay')).toBeVisible();
  await expect(page.getByTestId('combat-overlay').getByTestId('onboarding')).toHaveCount(0);
});

/** Boot the store straight into the dawn of day 30 via the save envelope. */
async function bootDay30(page: Page, seed: number, credits?: number): Promise<void> {
  const base = createInitialState(seed);
  base.day = 30;
  if (credits !== undefined) base.player.credits = credits;
  const state = startDay(base).state;
  const save = createSave(state, seed);
  await page.addInitScript(
    ([s, ob]) => {
      window.localStorage.setItem('sq.save.v1', s);
      window.localStorage.setItem('sq.onboarding.v1', ob);
    },
    [save, ALL_ONBOARDING_SEEN] as const,
  );
  await page.goto('/');
  await expect(page.getByTestId('day')).toHaveText('30');
}

test('resolution ceremony: the cleared branch is reachable and playable', async ({ page }) => {
  // Banked enough to discharge the 25,000cr marker on the final day.
  await bootDay30(page, 4242, 30000);

  // Clear the Guild marker through the Port Ledger UI (a die-free ledger transfer),
  // then close out the day. Dusk of day 30 FORCES the resolution; the ceremony
  // surfaces at the dawn of day 31.
  await page.getByTestId('debt-amount').fill('25000');
  await page.getByTestId('pay-debt').click();
  await expect(page.getByTestId('debt-cleared')).toBeVisible();
  await page.getByTestId('end-day').click();

  const ceremony = page.getByTestId('resolution-ceremony');
  await expect(ceremony).toBeVisible();
  await expect(ceremony).toHaveAttribute('data-outcome', 'cleared');
  await expect(page.getByTestId('veteran-unlocked')).toBeVisible();
  await expect(page.getByTestId('resolution-deed')).toContainText('Tour One Complete');

  // Acknowledge the resolution → the ceremony unmounts back to a playable cockpit
  // (no soft-lock): the next day is dealt and the day can be ended.
  await page.getByTestId('resolution-choice-btn').first().click();
  await expect(page.getByTestId('resolution-ceremony')).toHaveCount(0);
  await expect(page.getByTestId('end-day')).toBeVisible();
  await expect(page.getByTestId('hand')).toBeVisible();
});

test('resolution ceremony: the unpaid branch is reachable and the debt survives', async ({
  page,
}) => {
  // No banked coin to clear the marker — the day-30 resolution files it unpaid.
  await bootDay30(page, 909);

  // Close out the day WITHOUT paying. Dusk forces the unpaid resolution.
  await page.getByTestId('end-day').click();

  const ceremony = page.getByTestId('resolution-ceremony');
  await expect(ceremony).toBeVisible();
  await expect(ceremony).toHaveAttribute('data-outcome', 'unpaid');
  await expect(page.getByTestId('veteran-unlocked')).toHaveCount(0);
  await expect(page.getByTestId('resolution-consequence')).toBeVisible();

  // Acknowledge it → the cockpit remains playable and the marker still rides along
  // (the debt was never cleared behind the player's back).
  await page.getByTestId('resolution-choice-btn').first().click();
  await expect(page.getByTestId('resolution-ceremony')).toHaveCount(0);
  await expect(page.getByTestId('end-day')).toBeVisible();
  await expect(page.getByTestId('debt-chip')).toBeVisible();
});
