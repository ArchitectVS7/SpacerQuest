import { describe, expect, it } from 'vitest';
import { createInitialState, type GameState, type ShipState } from '@spacerquest/engine';
import { NPC_PROFILES, QUEST_PROFILES } from '@spacerquest/content';
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

/**
 * N2 · A world whose WEAPONS column is flat across all 31 captains — the shape the
 * day-1 roster used to have for free, before `npcShipForProfile` gave every
 * captain three stat-driven specialisms. Built here rather than assumed, so the
 * tests that exercise the 40-character budget and the player pinning still drive a
 * whole-field tie without depending on the field staying frozen.
 */
function flatField(): GameState {
  const game = world();
  for (const npc of game.npcs) {
    npc.ship.weapons = { ...game.player.ship.weapons };
  }
  return game;
}

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

  it('ranks the SIMULATION field — the player plus the 30 — on every title', () => {
    // N3's roster split made the two numbers here different, and conflating them
    // was a live bug: `state.npcs` carries 41 records (the 30 simulation captains
    // plus the 11 authored quest characters, who need records because storylet
    // triggers and dispositions look them up by id), while the BOARD is 31 — the
    // player plus the 30 who actually take turns. Before the fix this test read
    // `toHaveLength(30)` against the roster and failed at 41, with the board
    // silently ranking 42 including eleven captains frozen at their day-1 fit.
    const game = world();
    expect(game.npcs, 'the roster holds simulation AND quest records').toHaveLength(
      NPC_PROFILES.length + QUEST_PROFILES.length,
    );
    expect(NPC_PROFILES).toHaveLength(30);
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

  it('opens as a real contest on every title, not a whole-field tie (N2)', () => {
    // WHAT THIS TEST USED TO SAY, and why it is inverted rather than deleted:
    // before N2, `npcShipForTier` varied hull, drives and pods by tier and NOTHING
    // else, so all 31 captains co-held SIX of the seven component titles and this
    // test asserted `holders + overflow === 31` for each. That was N6's finding —
    // six titles uncontestable BY CONSTRUCTION — recorded as a fact about the
    // FIELD, with the note "N2 is what makes it move". It moved.
    //
    // N2's seed gives every captain three specialisms drawn from their own stat
    // block (engine `npcShipForProfile` + content `NPC_COMPONENT_STAT_AFFINITY`),
    // so tier says how far along a captain is and the character sheet says where.
    // Every title is now a contest between a handful of captains, and the PLAYER
    // — flying the junker — no longer co-holds any of them.
    const rows = honorList(world());
    for (const r of rows) {
      expect(r.holders.length + r.overflow, `${r.title} tie size`).toBeLessThan(r.field);
      expect(r.playerRank, `${r.title} player rank`).toBeGreaterThan(1);
    }
    // At least one title is held OUTRIGHT by a single captain, which was
    // structurally impossible on the old flat field.
    expect(rows.some((r) => r.holders.length + r.overflow === 1)).toBe(true);
  });
});

describe("N6 · the original's 40-character holder-line budget", () => {
  it('cuts the line and counts what it cut, so holders + overflow is the whole tie', () => {
    // N2 · The 31-way tie used to be the day-1 default and is now BUILT, because
    // the seeded field is a contest. The budget rule under test is unchanged; only
    // the way the tie is reached is (see `flatField`).
    const r = row(honorList(flatField()), 'weapons');
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
    // A 31-way tie prints ~3 of 31 names. The player co-holds it, so the
    // player must be ON the line — a board that showed three strangers under a
    // title the reader holds would be misinformation.
    const weapons = row(honorList(flatField()), 'weapons');
    expect(weapons.holders[0]).toEqual({ name: PLAYER_HONOR_LABEL, isPlayer: true });
    expect(weapons.holders.filter((h) => h.isPlayer)).toHaveLength(1);
  });

  it('marks nobody as the player when the player does not hold the title', () => {
    const drives = row(honorList(world()), 'drives');
    expect(drives.holders.some((h) => h.isPlayer)).toBe(false);
    expect(drives.playerRank).toBeGreaterThan(1);
  });

  it('orders co-holders by name once the player is placed', () => {
    const game = flatField();
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
