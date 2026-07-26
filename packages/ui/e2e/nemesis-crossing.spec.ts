import { test, expect, type Page } from '@playwright/test';
import {
  ALL_FRAGMENT_IDS,
  CROSSING_WIRE,
  DEEDS,
  NEMESIS_CROSSING_DC,
  NEMESIS_SYSTEM_ID,
  RENOWN_DEED_THRESHOLDS,
  STAR_SYSTEMS,
} from '@spacerquest/content';
import {
  createInitialState,
  createSave,
  decodeFragment,
  grantFragment,
  rankForDeedCount,
  startDay,
  syncMaxFuel,
  type GameState,
} from '@spacerquest/engine';

// T-1505b · THE CROSSING, PLAYED THROUGH THE REAL COCKPIT — the task's
// reachability clause: a player can see the door is shut, be told why, sign the
// stake, watch the gate lift on the real starmap, and fly through it.
//
// HONEST SPLIT, stated up front (the `nemesis-file.spec.ts` convention): the
// injected save sets the SCENARIO only — a veteran standing at the Sage's bench
// (Mizar-9), holding all twelve fragments with ELEVEN decoded, at the capstone
// rank, with a fitted ship and money in the account. Every fragment is granted
// and decoded through the ENGINE'S OWN helpers, never a hand-written record, and
// the registry is stood up by its DEED LEDGER (the engine re-derives the rank
// from `earned.length`, so writing a rank alone would be demoted by the first
// deed evaluation). Everything after that — the last decode, the stake, the
// jump — is PLAYED through the real UI.
//
// Deliberately NOT duplicated here: the career-long acquisition funnel (earn 30
// deeds, find and decode twelve fragments across three modes). Those are proven
// headlessly by `deed-coverage.test.ts` and `nemesis-fragments.test.ts`, and the
// whole terminus is walked action-by-action in
// `packages/sim/src/__tests__/nemesis-crossing.test.ts`.

/** Seed provenance: the crossing rolls PILOT DC `NEMESIS_CROSSING_DC` against a
 *  fitted navigation suite (+8). Seed 18's day-1 hand at Mizar-9 clears it on the
 *  highest die; the spec asserts the arrival, so a regression here is loud. */
const CROSSING_SEED = 18;
const MIZAR = 18;
const CROSSING_STORYLET = 'nemesis.crossing.the-stake';
/** The twelfth fragment stays RAW in the fixture, so the pane's locked half is a
 *  real lock and the last decode is genuinely played. */
const LAST_FRAGMENT = 'frag-nemesis-12';
const LAST_DECODE_STORYLET = 'sage.mizar.decode-12';

/** The scenario fixture — see the HONEST SPLIT above for input vs played. */
function oneDecodeShort(seed: number): GameState {
  const base = createInitialState(seed);
  base.player.currentSystemId = MIZAR;
  base.player.registry.earned = DEEDS.slice(0, RENOWN_DEED_THRESHOLDS.CONQUEROR).map(
    (deed, index) => ({
      id: deed.id,
      title: deed.title,
      citation: deed.citationTemplate,
      day: 1,
      eventIndex: index,
    }),
  );
  base.player.registry.renownRank = rankForDeedCount(base.player.registry.earned.length);
  base.player.credits = 60000;
  base.player.debt = 0;
  base.player.loan = null;
  base.player.ship.drives = { strength: 60, condition: 9 };
  base.player.ship.hull = { strength: 30, condition: 9 };
  base.player.ship.navigation = { strength: 90, condition: 9 };
  syncMaxFuel(base.player.ship);
  base.player.ship.fuel = base.player.ship.maxFuel;
  for (const id of ALL_FRAGMENT_IDS) {
    grantFragment(base.player.nemesisFile, id, 'sage', base.day);
    if (id !== LAST_FRAGMENT) decodeFragment(base.player.nemesisFile, id);
  }
  return startDay(base).state;
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

async function inject(page: Page, save: string): Promise<void> {
  await page.addInitScript((s) => window.localStorage.setItem('sq.save.v1', s), save);
  await page.goto('/');
}

async function showStorylet(page: Page, storyletId: string): Promise<void> {
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

/** Open Records → Nemesis and run `read` against the live pane, then close it. */
async function inNemesisPane(page: Page, read: () => Promise<void>): Promise<void> {
  await page.getByTestId('records-toggle').click();
  await page.getByTestId('records-tab-nemesis').click();
  await expect(page.getByTestId('nemesis')).toBeVisible();
  await read();
  await page.getByTestId('records-close').click();
}

function sysNode(page: Page, id: number) {
  return page.locator(`[data-testid="starmap-system"][data-system-id="${id}"]`);
}

test('the crossing: locked, staked, and flown through the real cockpit', async ({ page }) => {
  await inject(page, createSave(oneDecodeShort(CROSSING_SEED), CROSSING_SEED));

  // ---- LOCKED HALF ---------------------------------------------------------
  // 1) The pane names the ONE unmet clause, with the engine's own numbers.
  await inNemesisPane(page, async () => {
    const status = page.getByTestId('crossing-status');
    await expect(status).toHaveAttribute('data-crossing-state', 'locked');
    // The engine's own typed refusal reason, surfaced verbatim — the pane and the
    // resolver name the same failing clause.
    await expect(status).toHaveAttribute('data-crossing-reason', 'fragments-undecoded');
    await expect(page.getByTestId('crossing-lock')).toHaveText(
      `Decode the Signal — ${ALL_FRAGMENT_IDS.length - 1} of ${ALL_FRAGMENT_IDS.length}`,
    );
    await expect(page.getByTestId('crossing-dc')).toHaveText(`PILOT DC ${NEMESIS_CROSSING_DC}`);
  });

  // 2) The black hole is not on the chart at all — the gate is shut, and the map
  //    does not advertise a door the engine would refuse.
  await expect(sysNode(page, NEMESIS_SYSTEM_ID)).toHaveCount(0);
  // …and neither is Andromeda, which stays sealed for the expansion.
  await expect(sysNode(page, 21)).toHaveCount(0);

  // 3) The crossing beat itself is not even offered while the set is incomplete.
  await expect(page.locator(`[data-storylet-open="${CROSSING_STORYLET}"]`)).toHaveCount(0);

  // ---- THE LAST DECODE, PLAYED --------------------------------------------
  await showStorylet(page, LAST_DECODE_STORYLET);
  await choice(page, 'decode').getByTestId('storylet-choice-btn').click();

  // ---- THE STAKE, PLAYED ---------------------------------------------------
  await showStorylet(page, CROSSING_STORYLET);
  await choice(page, 'commit').getByTestId('storylet-choice-btn').click();

  // The pane flips to the receipt: what was signed over, and when.
  await inNemesisPane(page, async () => {
    const status = page.getByTestId('crossing-status');
    await expect(status).toHaveAttribute('data-crossing-state', 'committed');
    await expect(page.getByTestId('crossing-stake')).toContainText('STAKE SIGNED');
    await expect(page.getByTestId('crossing-stake')).toContainText('60,000 CR');
  });

  // The authored wire line reaches the ticker — imported from content, not typed.
  await expect(page.getByTestId('wire')).toContainText(CROSSING_WIRE.stakeCommitted);

  // ---- THE CROSSING, FLOWN -------------------------------------------------
  // 4) The gate lifted: NEMESIS is now on the chart, tagged as the event horizon,
  //    and reachable. Andromeda is STILL absent — the lift is NEMESIS-only.
  const nemesis = sysNode(page, NEMESIS_SYSTEM_ID);
  await expect(nemesis).toHaveCount(1);
  await expect(nemesis).toHaveAttribute('data-crossing', '1');
  await expect(nemesis).toHaveAttribute('data-reachable', '1');
  await expect(sysNode(page, 21)).toHaveCount(0);

  // 5) Plan it on the real starmap. The previewed DC is the CROSSING DC (content),
  //    not the ~70 the distance rule would price this jump at.
  await page.getByTestId('die').first().click();
  await nemesis.click();
  await expect(page.getByTestId('route-preview')).toBeVisible();
  await expect(page.getByTestId('route-dc')).toHaveText(String(NEMESIS_CROSSING_DC));

  // 6) Commit. The bezel names the far side.
  await page.getByTestId('confirm-jump').click();
  await expect(page.locator('.loc')).toContainText(STAR_SYSTEMS[NEMESIS_SYSTEM_ID].name);
  await expect(page.getByTestId('wire')).toContainText(CROSSING_WIRE.crossed);

  await inNemesisPane(page, async () => {
    await expect(page.getByTestId('crossing-status')).toHaveAttribute(
      'data-crossing-state',
      'crossed',
    );
  });
});
