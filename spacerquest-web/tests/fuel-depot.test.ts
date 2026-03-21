/**
 * SpacerQuest v4.0 - Fuel Depot Tests
 *
 * Tests for SP.REAL.txt fuel depot operations:
 * - validateDepotPrice (P command)
 * - calculateDepotBuy (B command)
 * - calculateDepotTransfer (T command)
 */

import { describe, it, expect } from 'vitest';
import {
  validateDepotPrice,
  calculateDepotBuy,
  calculateDepotTransfer,
} from '../src/game/systems/economy';
import {
  FUEL_MAX_CAPACITY,
  FUEL_DEPOT_WHOLESALE_PRICE,
  FUEL_DEPOT_MAX_PRICE,
  FUEL_DEPOT_TRANSFER_MAX,
} from '../src/game/constants';

// ============================================================================
// validateDepotPrice
// ============================================================================

describe('validateDepotPrice', () => {
  it('accepts price of 0 (free fuel)', () => {
    const result = validateDepotPrice(0);
    expect(result.success).toBe(true);
    expect(result.newPrice).toBe(0);
  });

  it('accepts price of 50 (maximum)', () => {
    const result = validateDepotPrice(FUEL_DEPOT_MAX_PRICE);
    expect(result.success).toBe(true);
    expect(result.newPrice).toBe(50);
  });

  it('accepts price of 25 (mid-range)', () => {
    const result = validateDepotPrice(25);
    expect(result.success).toBe(true);
    expect(result.newPrice).toBe(25);
  });

  it('rejects price of 51 (over max)', () => {
    const result = validateDepotPrice(51);
    expect(result.success).toBe(false);
  });

  it('rejects negative price', () => {
    const result = validateDepotPrice(-1);
    expect(result.success).toBe(false);
  });

  it('rejects non-integer price', () => {
    const result = validateDepotPrice(5.5);
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// calculateDepotBuy
// ============================================================================

describe('calculateDepotBuy', () => {
  it('buys fuel at 10 cr/unit', () => {
    const result = calculateDepotBuy(100, 3000, 1, 0);
    expect(result.success).toBe(true);
    expect(result.units).toBe(100);
    expect(result.cost).toBe(100 * FUEL_DEPOT_WHOLESALE_PRICE);
    expect(result.newFuelStored).toBe(3100);
  });

  it('correctly deducts credits (crosses 10K boundary)', () => {
    // 500 units × 10 = 5000 cr. Starting with 0 high, 6000 low → 0 high, 1000 low
    const result = calculateDepotBuy(500, 0, 0, 6000);
    expect(result.success).toBe(true);
    expect(result.creditsHigh).toBe(0);
    expect(result.creditsLow).toBe(1000);
  });

  it('rejects when not enough credits', () => {
    // 100 units × 10 = 1000 cr, but only 500 cr available
    const result = calculateDepotBuy(100, 0, 0, 500);
    expect(result.success).toBe(false);
    expect(result.message).toContain('Not enough credits');
  });

  it('rejects when would exceed 20K capacity', () => {
    const result = calculateDepotBuy(100, 19950, 10, 0);
    expect(result.success).toBe(false);
    expect(result.message).toContain('20,000');
  });

  it('allows exact fill to 20K', () => {
    const result = calculateDepotBuy(1000, 19000, 10, 0);
    expect(result.success).toBe(true);
    expect(result.newFuelStored).toBe(FUEL_MAX_CAPACITY);
  });

  it('rejects 0 units', () => {
    const result = calculateDepotBuy(0, 3000, 10, 0);
    expect(result.success).toBe(false);
  });

  it('rejects negative units', () => {
    const result = calculateDepotBuy(-10, 3000, 10, 0);
    expect(result.success).toBe(false);
  });

  it('rejects non-integer units', () => {
    const result = calculateDepotBuy(1.5, 3000, 10, 0);
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// calculateDepotTransfer
// ============================================================================

describe('calculateDepotTransfer', () => {
  it('transfers fuel from ship to depot', () => {
    const result = calculateDepotTransfer(500, 1000, 3000);
    expect(result.success).toBe(true);
    expect(result.units).toBe(500);
    expect(result.newShipFuel).toBe(500);
    expect(result.newFuelStored).toBe(3500);
  });

  it('rejects when exceeds ship fuel', () => {
    const result = calculateDepotTransfer(500, 200, 3000);
    expect(result.success).toBe(false);
    expect(result.message).toContain('Not enough ship fuel');
  });

  it('rejects when exceeds 2900 transfer max', () => {
    const result = calculateDepotTransfer(3000, 5000, 0);
    expect(result.success).toBe(false);
    expect(result.message).toContain(`${FUEL_DEPOT_TRANSFER_MAX}`);
  });

  it('allows exactly 2900 units', () => {
    const result = calculateDepotTransfer(FUEL_DEPOT_TRANSFER_MAX, 3000, 0);
    expect(result.success).toBe(true);
    expect(result.units).toBe(2900);
  });

  it('rejects when depot would exceed 20K', () => {
    const result = calculateDepotTransfer(100, 500, 19950);
    expect(result.success).toBe(false);
    expect(result.message).toContain('20,000');
  });

  it('allows exact fill to 20K', () => {
    const result = calculateDepotTransfer(1000, 2000, 19000);
    expect(result.success).toBe(true);
    expect(result.newFuelStored).toBe(FUEL_MAX_CAPACITY);
  });

  it('rejects 0 units', () => {
    const result = calculateDepotTransfer(0, 1000, 3000);
    expect(result.success).toBe(false);
  });

  it('rejects negative units', () => {
    const result = calculateDepotTransfer(-10, 1000, 3000);
    expect(result.success).toBe(false);
  });

  it('rejects non-integer units', () => {
    const result = calculateDepotTransfer(1.5, 1000, 3000);
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// Constants verification
// ============================================================================

describe('fuel depot constants match SP.REAL.txt', () => {
  it('wholesale price is 10 cr/unit (line 193)', () => {
    expect(FUEL_DEPOT_WHOLESALE_PRICE).toBe(10);
  });

  it('max price is 50 cr/unit (line 184)', () => {
    expect(FUEL_DEPOT_MAX_PRICE).toBe(50);
  });

  it('max transfer is 2900 units (line 225)', () => {
    expect(FUEL_DEPOT_TRANSFER_MAX).toBe(2900);
  });

  it('max depot capacity is 20000 (line 169)', () => {
    expect(FUEL_MAX_CAPACITY).toBe(20000);
  });
});
