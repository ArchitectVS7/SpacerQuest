import { describe, expect, it } from 'vitest';
import { createInitialState } from '@spacerquest/engine';
import { NEMESIS_SYSTEM_ID, STAR_SYSTEMS } from '@spacerquest/content';
import { hangoutOpen } from '../format';

// ---------------------------------------------------------------------------
// T-121 · THE COCKPIT'S VIEW OF THE REACH CHANGE
// (docs/HANGOUT_REDESIGN.md §4, §4.5).
//
// The rule this file guards: the Hangout launcher is offered at EXACTLY the ports
// the engine's `hasHangout` gate admits — no more, and no fewer. `hangoutOpen` is
// the single predicate `App.tsx`'s `hangoutAvailable` and the two Hangout nudges
// in `format.ts` all read, so proving it here proves all three.
//
// WHY THIS FILE EXISTS AT ALL. The NEGATIVE case used to live in
// `e2e/hangout.spec.ts`, which jumped from Sun-3 to Aldebaran-1 and asserted the
// launcher vanished. T-121 gives Aldebaran-1 a bar, and the obvious repair —
// retarget the hop to a rim port — is not available: the rim shell sits ~20–24
// units out and a fresh day-1 start cannot fund the jump, so the e2e would become
// unrunnable rather than merely different (§4.2's own recommendation). The e2e was
// therefore INVERTED to prove the pane follows the gate to a second port, and the
// negative half moved here, where a rim id costs no fuel.
// ---------------------------------------------------------------------------

/** ids 1–14, Sun-3 … Vega-6 — the fourteen core ports §4.5 rules in. */
const CORE_HANGOUT_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
/** Antares-5 — the first rim id, and the cheapest proof that the un-flagged set is
 *  not empty. §4.5 keeps it un-flagged on purpose. */
const RIM_SYSTEM = 15;

describe('T-121 · the Hangout launcher tracks the engine gate, port for port', () => {
  it('opens at every one of the fourteen core ports', () => {
    for (const id of CORE_HANGOUT_IDS) {
      const game = createInitialState(1);
      game.player.currentSystemId = id;
      expect(hangoutOpen(game)).toBe(true);
    }
  });

  it('stays shut at a rim port and at NEMESIS', () => {
    for (const id of [RIM_SYSTEM, NEMESIS_SYSTEM_ID]) {
      const game = createInitialState(1);
      game.player.currentSystemId = id;
      expect(hangoutOpen(game)).toBe(false);
    }
  });

  it('is exactly the `hasHangout` set, with nothing UI-side added or withheld', () => {
    // The drift this closes: a cockpit that decided for itself where a bar is
    // would advertise a launcher the engine then refuses with
    // ActionBlocked{'no-hangout'} — a button that loses the player a die.
    for (const system of Object.values(STAR_SYSTEMS)) {
      const game = createInitialState(1);
      game.player.currentSystemId = system.id;
      expect(hangoutOpen(game)).toBe(system.hasHangout === true);
    }
  });
});
