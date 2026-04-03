/**
 * SpacerQuest v4.0 - Top Gun Rankings System (SP.TOP.S)
 *
 * Original SP.TOP.S lines 38-73: For each player, compute strength×condition
 * for each ship component. The player with the highest product wins that category.
 *
 * Formula per category (tgfx subroutine, lines 106-109):
 *   score = strength × condition  (e.g. d1*d2 for Fastest Drives)
 *   Guard: if strength<1 or condition<1 → skip (component not installed)
 *   Guard: if strength>199 or condition>9 → skip (invalid — capped at original maximums)
 *
 * All-Around score (lines 69-73):
 *   sum of hull + drive + cabin + lifeSupport + weapon + navigation + robotics + shield (strength×condition)
 *
 * Categories output (lines 79-102 of original):
 *   td$ = Fastest Drives    (d1*d2)
 *   tf$ = Fanciest Cabin    (c1*c2)
 *   ts$ = Best Life Support (l1*l2)
 *   tw$ = Strongest Weapons (w1*w2)
 *   tj$ = Best Navigation   (n1*n2)
 *   tr$ = Best Robotics     (r1*r2)
 *   tg$ = Strongest Shields (p1*p2)
 *   a$  = Best All-Around Ship (sum of all 8 components)
 *
 * Additional categories (not in original, preserved as modern additions):
 *   Most Cargo, Top Rescuer, Battle Champion, Most Promotions, Strongest Hull
 */

import { prisma } from '../../db/prisma.js';

/** Validate component values per original tgfx guard (SP.TOP.S:107-108) */
function tgfx(strength: number, condition: number): number {
  if (strength < 1 || condition < 1) return 0;
  if (strength > 199 || condition > 9) return 0;
  return strength * condition;
}

export interface TopGunCategory {
  name: string;
  leader: string;   // ship name for ship categories, character name for stat categories
  value: number;
}

export async function getTopGunRankings(): Promise<{ categories: TopGunCategory[] }> {
  // Fetch all characters with ships for the ship-based categories.
  // We must compute strength×condition in memory since SQL cannot order by computed columns.
  const allChars = await prisma.character.findMany({
    include: { ship: true },
  });

  // ── Ship component categories (original SP.TOP.S lines 48-68) ───────────
  // Each category: find the character with the highest strength×condition product.

  // SP.TOP.S tie logic (lines 49,52,55,58,61,64,67,72):
  //   if (td=i) and (len(td$)<40) td$=td$+"/"+nz$   ← tie: append ship name
  //   if td<i td$=nz$:td=i                           ← new leader: replace
  function appendTie(leader: string, shipName: string): string {
    if (leader.length < 40) return leader + '/' + shipName;
    return leader; // cap at 40 chars
  }

  function bestByComponent(
    field: 'drive' | 'cabin' | 'lifeSupport' | 'weapon' | 'navigation' | 'robotics' | 'shield' | 'hull',
  ): { shipName: string; value: number } {
    let best = { shipName: 'N/A', value: 0 };
    for (const c of allChars) {
      if (!c.ship || !c.shipName) continue;
      let strength: number;
      let condition: number;
      switch (field) {
        case 'drive':       strength = c.ship.driveStrength;       condition = c.ship.driveCondition;       break;
        case 'cabin':       strength = c.ship.cabinStrength;       condition = c.ship.cabinCondition;       break;
        case 'lifeSupport': strength = c.ship.lifeSupportStrength; condition = c.ship.lifeSupportCondition; break;
        case 'weapon':      strength = c.ship.weaponStrength;      condition = c.ship.weaponCondition;      break;
        case 'navigation':  strength = c.ship.navigationStrength;  condition = c.ship.navigationCondition;  break;
        case 'robotics':    strength = c.ship.roboticsStrength;    condition = c.ship.roboticsCondition;    break;
        case 'shield':      strength = c.ship.shieldStrength;      condition = c.ship.shieldCondition;      break;
        case 'hull':        strength = c.ship.hullStrength;        condition = c.ship.hullCondition;        break;
        default: continue;
      }
      const score = tgfx(strength, condition);
      if (score > 0 && score === best.value) {
        best = { shipName: appendTie(best.shipName, c.shipName), value: score };
      } else if (score > best.value) {
        best = { shipName: c.shipName, value: score };
      }
    }
    return best;
  }

  // ── All-Around score (SP.TOP.S lines 69-73) ───────────────────────────────
  // sum = hull + drive + cabin + lifeSupport + weapon + navigation + robotics + shield
  function bestAllAround(): { shipName: string; value: number } {
    let best = { shipName: 'N/A', value: 0 };
    for (const c of allChars) {
      if (!c.ship || !c.shipName) continue;
      const s = c.ship;
      const score =
        tgfx(s.hullStrength,        s.hullCondition)        +
        tgfx(s.driveStrength,       s.driveCondition)       +
        tgfx(s.cabinStrength,       s.cabinCondition)       +
        tgfx(s.lifeSupportStrength, s.lifeSupportCondition) +
        tgfx(s.weaponStrength,      s.weaponCondition)      +
        tgfx(s.navigationStrength,  s.navigationCondition)  +
        tgfx(s.roboticsStrength,    s.roboticsCondition)    +
        tgfx(s.shieldStrength,      s.shieldCondition);
      if (score > 0 && score === best.value) {
        best = { shipName: appendTie(best.shipName, c.shipName), value: score };
      } else if (score > best.value) {
        best = { shipName: c.shipName, value: score };
      }
    }
    return best;
  }

  const drives       = bestByComponent('drive');
  const cabin        = bestByComponent('cabin');
  const lifeSupport  = bestByComponent('lifeSupport');
  const weapons      = bestByComponent('weapon');
  const navigation   = bestByComponent('navigation');
  const robotics     = bestByComponent('robotics');
  const shields      = bestByComponent('shield');
  const hull         = bestByComponent('hull');
  const allAround    = bestAllAround();

  // ── Additional stat-based categories (modern additions, not in original) ──
  const [topCargo, topRescues, topBattles, topPromotions] = await Promise.all([
    prisma.character.findFirst({
      where: { ship: { cargoPods: { gt: 0 } } },
      include: { ship: true },
      orderBy: { ship: { cargoPods: 'desc' } },
    }),
    prisma.character.findFirst({
      where: { rescuesPerformed: { gt: 0 } },
      orderBy: { rescuesPerformed: 'desc' },
    }),
    prisma.character.findFirst({
      where: { battlesWon: { gt: 0 } },
      orderBy: { battlesWon: 'desc' },
    }),
    prisma.character.findFirst({
      where: { promotions: { gt: 0 } },
      orderBy: { promotions: 'desc' },
    }),
  ]);

  return {
    categories: [
      // Original SP.TOP.S categories (in original display order):
      { name: 'Fastest Drives',    leader: drives.shipName,      value: drives.value },
      { name: 'Fanciest Cabin',    leader: cabin.shipName,       value: cabin.value },
      { name: 'Best Life Support', leader: lifeSupport.shipName, value: lifeSupport.value },
      { name: 'Strongest Weapons', leader: weapons.shipName,     value: weapons.value },
      { name: 'Best Navigation',   leader: navigation.shipName,  value: navigation.value },
      { name: 'Best Robotics',     leader: robotics.shipName,    value: robotics.value },
      { name: 'Strongest Shields', leader: shields.shipName,     value: shields.value },
      { name: 'Best All-Around Ship', leader: allAround.shipName, value: allAround.value },
      // Modern additions (not in original):
      { name: 'Strongest Hull',    leader: hull.shipName,        value: hull.value },
      { name: 'Most Cargo',        leader: topCargo?.shipName || 'N/A', value: topCargo?.ship?.cargoPods || 0 },
      { name: 'Top Rescuer',       leader: topRescues?.name || 'N/A',   value: topRescues?.rescuesPerformed || 0 },
      { name: 'Battle Champion',   leader: topBattles?.name || 'N/A',   value: topBattles?.battlesWon || 0 },
      { name: 'Most Promotions',   leader: topPromotions?.name || 'N/A', value: topPromotions?.promotions || 0 },
    ],
  };
}
