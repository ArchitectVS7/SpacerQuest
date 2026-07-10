/**
 * SpacerQuest v4.0 - Morton's Cloaking Device Toggle Screen
 *
 * SP.WARP.S lines 123-143 (flank/flink/flock):
 *   During cargo (kk=1) or smuggling (kk=5) travel encounters, if the ship
 *   has Morton's Cloaker, the player gets an interactive toggle screen.
 *   Spacebar toggles ON/OFF, G (or Enter) engages.
 *   If OFF → proceed to fight.
 *   If ON + cargo → cloak succeeds, skip fight.
 *   If ON + smuggling → malfunction check (r=c1+c2, if rand(r)>c1 → malfunction).
 */

import { ScreenModule, ScreenResponse } from './types.js';

// Track toggle state per character
const cloakerState = new Map<string, boolean>(); // true = ON, false = OFF

export const CloakerToggleScreen: ScreenModule = {
  name: 'cloaker-toggle',

  render: async (_characterId: string): Promise<ScreenResponse> => {
    cloakerState.set(_characterId, false); // Default to OFF
    return {
      output:
        '\r\n\x1b[33;1m....Intruder Alert.....\x1b[0m\r\n\r\n' +
        "Morton's Cloaking Device: (space bar toggles Cloaking  [G]o)\r\n" +
        '[:>>> Cloaker....... [\x1b[31mOFF\x1b[0m]',
    };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const key = input;
    const isOn = cloakerState.get(characterId) ?? false;

    // Spacebar toggles
    if (key === ' ') {
      const newState = !isOn;
      cloakerState.set(characterId, newState);
      const stateText = newState
        ? '\x1b[32mON \x1b[0m'
        : '\x1b[31mOFF\x1b[0m';
      // SP.WARP.S line 129: print chr$(8,4)a$"]" — backspace 4 chars and reprint state
      return {
        output: '\x1b[4D' + stateText + ']',
      };
    }

    // G or Enter engages
    if (key === 'G' || key === 'g' || key === '\r' || key === '\n') {
      const chosenOn = cloakerState.get(characterId) ?? false;
      cloakerState.delete(characterId);

      if (!chosenOn) {
        // Player chose OFF — proceed to combat
        // SP.WARP.S line 137: if a$="OFF" → goto linkft (fight)
        return {
          output: '\r\n\r\n',
          nextScreen: 'combat',
        };
      }

      // Player chose ON — resolve cloaker server-side
      // The cloaker-resolve API handles malfunction check for smuggling
      // and deletes CombatSession if cloaked successfully.
      // The client calls /api/navigation/cloaker-resolve with cloakerOn=true
      // and transitions based on the result.
      return {
        output: '',
        nextScreen: 'cloaker-resolve',
        data: { cloakerOn: true },
      };
    }

    // Any other key — ignore (SP.WARP.S line 135: goto flink)
    return { output: '' };
  },
};
