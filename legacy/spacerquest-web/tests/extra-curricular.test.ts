/**
 * SpacerQuest v4.0 - Extra-Curricular System Tests
 *
 * Based on SP.END.txt lines 122-134 (vand subroutine), lines 45-47 (prereq checks)
 */

import { describe, it, expect } from 'vitest';
import { computeVandalDamage, isVandalismEligible, VandalShipStats } from '../src/game/systems/extra-curricular.js';
import { FUEL_MIN_MISSIONS } from '../src/game/constants.js';

// ---------------------------------------------------------------------------
// Vandalism logic — SP.END.txt lines 122-134
// ---------------------------------------------------------------------------

/** A ship with all stats high enough for every vandalism case to fire */
const richShip: VandalShipStats = {
  cargoPods: 100,          // s1 > 30 (covers x=1,2,3)
  hullCondition: 9,        // h2 > 3 (covers x=4)
  cabinCondition: 9,       // c2 > 4 (covers x=5)
  driveStrength: 5,        // d1 > 0 (covers x=6)
  lifeSupportCondition: 9, // l2 > 6 (covers x=7)
  lifeSupportStrength: 20, // l1 (what gets damaged)
};

describe('computeVandalDamage (SP.END.txt vand subroutine)', () => {

  // x < 4: cargo pods damage
  it('x=1 damages cargo pods by 10 when cargoPods > 10', () => {
    const r = computeVandalDamage(1, richShip);
    expect(r.vandalized).toBe(true);
    expect(r.component).toBe('Pods');
    expect(r.field).toBe('cargoPods');
    expect(r.newValue).toBe(richShip.cargoPods - 10);
  });

  it('x=2 damages cargo pods by 20 when cargoPods > 20', () => {
    const r = computeVandalDamage(2, richShip);
    expect(r.vandalized).toBe(true);
    expect(r.component).toBe('Pods');
    expect(r.newValue).toBe(richShip.cargoPods - 20);
  });

  it('x=3 damages cargo pods by 30 when cargoPods > 30', () => {
    const r = computeVandalDamage(3, richShip);
    expect(r.vandalized).toBe(true);
    expect(r.component).toBe('Pods');
    expect(r.newValue).toBe(richShip.cargoPods - 30);
  });

  it('x=1 does NOT damage cargo pods when cargoPods <= 10', () => {
    const r = computeVandalDamage(1, { ...richShip, cargoPods: 10 });
    expect(r.vandalized).toBe(false);
  });

  it('x=3 does NOT damage cargo pods when cargoPods <= 30', () => {
    const r = computeVandalDamage(3, { ...richShip, cargoPods: 30 });
    expect(r.vandalized).toBe(false);
  });

  // x=4: hull condition damage
  it('x=4 damages hull condition by 4 when hullCondition > 3', () => {
    const r = computeVandalDamage(4, richShip);
    expect(r.vandalized).toBe(true);
    expect(r.component).toBe('Hull');
    expect(r.field).toBe('hullCondition');
    expect(r.newValue).toBe(richShip.hullCondition - 4);
  });

  it('x=4 does NOT damage hull when hullCondition <= 3', () => {
    const r = computeVandalDamage(4, { ...richShip, hullCondition: 3 });
    expect(r.vandalized).toBe(false);
  });

  // x=5: cabin condition damage
  it('x=5 damages cabin condition by 5 when cabinCondition > 4', () => {
    const r = computeVandalDamage(5, richShip);
    expect(r.vandalized).toBe(true);
    expect(r.component).toBe('Cabin');
    expect(r.field).toBe('cabinCondition');
    expect(r.newValue).toBe(richShip.cabinCondition - 5);
  });

  it('x=5 does NOT damage cabin when cabinCondition <= 4', () => {
    const r = computeVandalDamage(5, { ...richShip, cabinCondition: 4 });
    expect(r.vandalized).toBe(false);
  });

  // x=6: drive strength damage
  it('x=6 damages drive strength by 1 when driveStrength > 0', () => {
    const r = computeVandalDamage(6, richShip);
    expect(r.vandalized).toBe(true);
    expect(r.component).toBe('Drives');
    expect(r.field).toBe('driveStrength');
    expect(r.newValue).toBe(richShip.driveStrength - 1);
  });

  it('x=6 does NOT damage drives when driveStrength === 0', () => {
    const r = computeVandalDamage(6, { ...richShip, driveStrength: 0 });
    expect(r.vandalized).toBe(false);
  });

  // x=7: life support strength damage (when condition > 6)
  it('x=7 damages life support strength by 7 when lifeSupportCondition > 6', () => {
    const r = computeVandalDamage(7, richShip);
    expect(r.vandalized).toBe(true);
    expect(r.component).toBe('Life Support');
    expect(r.field).toBe('lifeSupportStrength');
    expect(r.newValue).toBe(richShip.lifeSupportStrength - 7);
  });

  it('x=7 does NOT damage life support when lifeSupportCondition <= 6', () => {
    const r = computeVandalDamage(7, { ...richShip, lifeSupportCondition: 6 });
    expect(r.vandalized).toBe(false);
  });

  // x=8,9,10: no damage (original always-safe rolls)
  it('x=8 never causes damage', () => {
    expect(computeVandalDamage(8, richShip).vandalized).toBe(false);
  });

  it('x=9 never causes damage', () => {
    expect(computeVandalDamage(9, richShip).vandalized).toBe(false);
  });

  it('x=10 never causes damage', () => {
    expect(computeVandalDamage(10, richShip).vandalized).toBe(false);
  });

  // Clamp to 0
  it('hull condition does not go below 0', () => {
    const r = computeVandalDamage(4, { ...richShip, hullCondition: 4 });
    expect(r.newValue).toBe(0);
  });

  it('life support strength does not go below 0', () => {
    const r = computeVandalDamage(7, { ...richShip, lifeSupportStrength: 3, lifeSupportCondition: 9 });
    expect(r.newValue).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Score gate — SP.END.S vaca: if s2<2000 goto vat
// ---------------------------------------------------------------------------

describe('isVandalismEligible (SP.END.S vaca score gate)', () => {
  it('score < 2000 → not eligible', () => {
    expect(isVandalismEligible(0)).toBe(false);
    expect(isVandalismEligible(1999)).toBe(false);
  });

  it('score = 2000 → eligible', () => {
    expect(isVandalismEligible(2000)).toBe(true);
  });

  it('score > 2000 → eligible', () => {
    expect(isVandalismEligible(5000)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Mission prerequisites — SP.END.txt lines 45-47
// ---------------------------------------------------------------------------

describe('FUEL_MIN_MISSIONS constant', () => {
  it('is 50 (SP.END.txt line 47: if f1<50 goto start)', () => {
    expect(FUEL_MIN_MISSIONS).toBe(50);
  });
});
