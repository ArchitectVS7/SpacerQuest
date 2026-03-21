/**
 * SpacerQuest v4.0 - Top Gun Rankings Screen (SP.TOP.S)
 *
 * Displays top gun rankings for each ship category.
 * Accessed via Library option 8 (SP.REG.S line 64: if i=8 f$="topgun":goto libshow).
 *
 * Original categories (SP.TOP.S lines 79-102):
 *   td$ = Fastest Drives    (d1*d2)
 *   tf$ = Fanciest Cabin    (c1*c2)
 *   ts$ = Best Life Support (l1*l2)
 *   tw$ = Strongest Weapons (w1*w2)
 *   tj$ = Best Navigation   (n1*n2)
 *   tr$ = Best Robotics     (r1*r2)
 *   tg$ = Strongest Shields (p1*p2)
 *   a$  = Best All-Around Ship
 *
 * In the original, this was a static file (topgun). The modern version
 * computes rankings live from the database.
 *
 * After display: any key returns to library (original: "goto lib1").
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { getTopGunRankings } from '../systems/topgun.js';

export const TopgunScreen: ScreenModule = {
  name: 'topgun',

  render: async (_characterId: string): Promise<ScreenResponse> => {
    const { categories } = await getTopGunRankings();

    let out = '';
    out += '\x1b[36;1m=========================================\x1b[0m\r\n';
    out += '\x1b[33;1m           TOP GUN RANKINGS              \x1b[0m\r\n';
    out += '\x1b[36;1m=========================================\x1b[0m\r\n\r\n';

    for (const cat of categories) {
      const label = (cat.name + ':').padEnd(22);
      const leader = cat.leader.padEnd(16);
      out += `  ${label} ${leader} [${cat.value}]\r\n`;
    }

    out += '\r\n\x1b[36m-----------------------------------------\x1b[0m\r\n';
    out += '....type anykey to go on....';
    return { output: out };
  },

  handleInput: async (_characterId: string, _input: string): Promise<ScreenResponse> => {
    // Any key returns to library (original: "setint(1):copy f$:setint(''):goto lib1")
    return { output: '\r\n', nextScreen: 'library' };
  },
};
