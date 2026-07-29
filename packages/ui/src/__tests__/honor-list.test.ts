import { describe, expect, it } from 'vitest';
import { createInitialState, type GameState, type ShipState } from '@spacerquest/engine';
import { honorList, PLAYER_HONOR_LABEL, type HonorTitle } from '../format';

// ---------------------------------------------------------------------------
// N6 · The Honor List is a real 31-way board.
//
// What these tests are FOR: the board's whole claim is that an NPC is ranked by
// the rule the player is ranked by. That claim is only checkable by driving a
// world where an NPC out-fits the player and asserting the NPC takes the title —
// a suite that only ever asserted the player's own row would pass just as
// happily against the personal board this replaced.
//
// The world is the engine's own `createInitialState`, never a hand-built state,
// so the seeded field these tests rank is the field the game ships.
// ---------------------------------------------------------------------------

const world = (): GameState => createInitialState(12345);

function row(rows: HonorTitle[], id: HonorTitle['id']): HonorTitle {
  const found = rows.find((r) => r.id === id);
  if (!found) throw new Error(`no honor row for ${id}`);
  return found;
}

const names = (r: HonorTitle): string[] => r.holders.map((h) => h.name);

/** Give one captain a component nobody else can match. */
function fit(ship: ShipState, id: 'weapons' | 'drives' | 'cabin', strength: number): void {
  ship[id] = { strength, condition: 9 };
}

describe('N6 · the eight titles', () => {
  it('prints the 1991 titles in the order `sp.top.s` printed them, all-around last', () => {
    expect(honorList(world()).map((r) => r.title)).toEqual([
      'Fastest Drives',
      'Fanciest Cabin',
      'Best Life Support',
      'Strongest Weapons',
      'Best Navigation',
      'Best Robotics',
      'Strongest Shields',
      'Best All-Around Ship',
    ]);
  });

  it('ranks the whole field — the player plus every NPC — on every title', () => {
    const game = world();
    expect(game.npcs).toHaveLength(30);
    for (const r of honorList(game)) expect(r.field).toBe(31);
  });
});

describe('N6 · an NPC is ranked by the rule the player is ranked by', () => {
  it('gives the title to the NPC when the NPC out-fits the player', () => {
    const game = world();
    const rival = game.npcs[7];
    fit(rival.ship, 'weapons', 90);
    fit(game.player.ship, 'weapons', 40);

    const weapons = row(honorList(game), 'weapons');
    expect(names(weapons)).toEqual([rival.name]);
    expect(weapons.score).toBe(90);
    expect(weapons.playerScore).toBe(40);
    expect(weapons.playerRank).toBe(2);
  });

  it('gives the title to the player when the player out-fits the field', () => {
    const game = world();
    fit(game.player.ship, 'weapons', 199);

    const weapons = row(honorList(game), 'weapons');
    expect(names(weapons)).toEqual([PLAYER_HONOR_LABEL]);
    expect(weapons.holders[0].isPlayer).toBe(true);
    expect(weapons.playerRank).toBe(1);
  });

  it('does not privilege the player: on a fresh world the player is LAST all-around', () => {
    // Not a curiosity — it is the proof the board is not the player's progress bar.
    // The junker (hull strength 1) scores 44; every seeded NPC hull beats it.
    const all = row(honorList(world()), 'allAround');
    expect(all.playerScore).toBe(44);
    expect(all.playerRank).toBe(31);
    expect(names(all)).not.toContain(PLAYER_HONOR_LABEL);
  });

  it('reads the engine score, not a restated one: condition moves the ranking', () => {
    const game = world();
    const rival = game.npcs[3];
    // Same strength, better condition — `effectiveScore` is strength x (cond+1)/10,
    // so the pristine gun must win. A board that ranked on `strength` alone ties here.
    game.player.ship.weapons = { strength: 80, condition: 4 };
    rival.ship.weapons = { strength: 80, condition: 9 };

    const weapons = row(honorList(game), 'weapons');
    expect(names(weapons)).toEqual([rival.name]);
    expect(weapons.playerRank).toBe(2);
  });
});

describe('N6 · ties are co-held, and the rank is blind to them', () => {
  it('lists every captain at the top score as a joint holder', () => {
    const game = world();
    const [a, b] = [game.npcs[0], game.npcs[1]];
    fit(a.ship, 'cabin', 70);
    fit(b.ship, 'cabin', 70);

    const cabin = row(honorList(game), 'cabin');
    expect(names(cabin).sort()).toEqual([a.name, b.name].sort());
    expect(cabin.overflow).toBe(0);
  });

  it('ranks tied captains equally — a tie with the leader is rank 1, not rank 2', () => {
    const game = world();
    fit(game.npcs[0].ship, 'cabin', 70);
    fit(game.player.ship, 'cabin', 70);
    expect(row(honorList(game), 'cabin').playerRank).toBe(1);
  });

  it('ranks by captains STRICTLY above: two leaders tied above you leaves you 3rd', () => {
    const game = world();
    fit(game.npcs[0].ship, 'cabin', 70);
    fit(game.npcs[1].ship, 'cabin', 70);
    fit(game.player.ship, 'cabin', 50);
    // Not 2nd ("one place behind the leaders") — two captains beat you, so 3rd.
    expect(row(honorList(game), 'cabin').playerRank).toBe(3);
  });

  it('opens with a whole-field tie on the six titles `npcShipForTier` seeds flat', () => {
    // The seeded roster varies hull, drives and pods by tier and NOTHING else, so
    // on day 1 all 31 captains co-hold six of the seven component titles. Recorded
    // as a fact about the FIELD, not about the board: N2 is what makes it move.
    const rows = honorList(world());
    for (const id of [
      'cabin',
      'lifeSupport',
      'weapons',
      'navigation',
      'robotics',
      'shields',
    ] as const) {
      const r = row(rows, id);
      expect(r.holders.length + r.overflow).toBe(31);
      expect(r.playerRank).toBe(1);
    }
    // The two that are a contest on day 1, both won by the tier-5 captains.
    expect(row(rows, 'drives').holders.length + row(rows, 'drives').overflow).toBe(3);
    expect(row(rows, 'allAround').holders.length + row(rows, 'allAround').overflow).toBe(3);
  });
});

describe("N6 · the original's 40-character holder-line budget", () => {
  it('cuts the line and counts what it cut, so holders + overflow is the whole tie', () => {
    const r = row(honorList(world()), 'weapons'); // the day-1 31-way tie
    expect(r.overflow).toBeGreaterThan(0);
    expect(r.holders.length + r.overflow).toBe(31);
    // `sp.top.s` tests the length BEFORE appending, so the line may finish one name
    // over budget — reproduced, not "corrected".
    const printed = names(r).join('/');
    const withoutLast = names(r).slice(0, -1).join('/');
    expect(withoutLast.length).toBeLessThan(40);
    expect(printed.length).toBeGreaterThanOrEqual(40);
  });

  it('never cuts a sole holder, however long the name', () => {
    const game = world();
    const rival = game.npcs[2];
    rival.name = 'A Captain With An Unreasonably Long Registered Name';
    fit(rival.ship, 'cabin', 70);

    const cabin = row(honorList(game), 'cabin');
    expect(names(cabin)).toEqual([rival.name]);
    expect(cabin.overflow).toBe(0);
  });
});

describe('N6 · the board is deterministic and finds the player', () => {
  it('renders identically twice — nothing here is order- or clock-dependent', () => {
    expect(honorList(world())).toEqual(honorList(world()));
  });

  it('is independent of roster order: reversing `npcs` changes nothing', () => {
    const forward = world();
    const reversed = world();
    reversed.npcs.reverse();
    expect(honorList(reversed)).toEqual(honorList(forward));
  });

  it('shows the player on a tie line they would otherwise be truncated off', () => {
    // The day-1 31-way tie prints ~3 of 31 names. The player co-holds it, so the
    // player must be ON the line — a board that showed three strangers under a
    // title the reader holds would be misinformation.
    const weapons = row(honorList(world()), 'weapons');
    expect(weapons.holders[0]).toEqual({ name: PLAYER_HONOR_LABEL, isPlayer: true });
    expect(weapons.holders.filter((h) => h.isPlayer)).toHaveLength(1);
  });

  it('marks nobody as the player when the player does not hold the title', () => {
    const drives = row(honorList(world()), 'drives');
    expect(drives.holders.some((h) => h.isPlayer)).toBe(false);
    expect(drives.playerRank).toBeGreaterThan(1);
  });

  it('orders co-holders by name once the player is placed', () => {
    const game = world();
    const sorted = [...names(row(honorList(game), 'weapons'))];
    const rest = sorted.slice(1);
    expect(rest).toEqual([...rest].sort());
  });
});

describe('N6 · Best All-Around', () => {
  it('sums all eight components, hull included, exactly as `tgfx` did', () => {
    const game = world();
    // Hull carries no individual title, so a hull-only change can ONLY show up here.
    const before = row(honorList(game), 'allAround').playerScore;
    game.player.ship.hull = { strength: 101, condition: 9 };
    const after = row(honorList(game), 'allAround').playerScore;
    expect(after - before).toBe(100);
    expect(
      honorList(game)
        .filter((r) => r.id !== 'allAround')
        .map((r) => r.playerScore),
    ).toEqual(
      honorList(world())
        .filter((r) => r.id !== 'allAround')
        .map((r) => r.playerScore),
    );
  });
});
