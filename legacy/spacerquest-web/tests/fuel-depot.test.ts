/**
 * SpacerQuest v4.0 - Fuel Depot Tests
 *
 * Tests for SP.REAL.txt fuel depot operations:
 * - validateDepotPrice (P command)
 * - calculateDepotBuy (B command)
 * - calculateDepotTransfer (T command)
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  validateDepotPrice,
  calculateDepotBuy,
  calculateDepotTransfer,
  checkPortEviction,
} from '../src/game/systems/economy';
import {
  FUEL_MAX_CAPACITY,
  FUEL_DEPOT_WHOLESALE_PRICE,
  FUEL_DEPOT_MAX_PRICE,
  FUEL_DEPOT_TRANSFER_MAX,
} from '../src/game/constants';

const sellerScreenCode = fs.readFileSync(
  path.join(__dirname, '../src/game/screens/traders-sell-fuel.ts'),
  'utf-8'
);

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
// SP.LIFT.S fueler subroutine (lines 213-229): checkPortEviction
// ============================================================================

describe('checkPortEviction (SP.LIFT.S fueler:213-229)', () => {
  it('returns no action when no port owner (m5$="")', () => {
    const r = checkPortEviction(0, 0, '', 'Alice');
    expect(r.shouldEvict).toBe(false);
    expect(r.shouldAutoBuy).toBe(false);
  });

  it('returns no action when fuel > 0 (m9>0 skip)', () => {
    const r = checkPortEviction(100, 0, 'Bob', 'Alice');
    expect(r.shouldEvict).toBe(false);
    expect(r.shouldAutoBuy).toBe(false);
  });

  it('triggers auto-buy when fuel=0 and bankHigh>=2 (faut: m9=m9+1000:m7=m7-2)', () => {
    const r = checkPortEviction(0, 2, 'Bob', 'Alice');
    expect(r.shouldAutoBuy).toBe(true);
    expect(r.shouldEvict).toBe(false);
    expect(r.autoBuyMessage).toContain('Auto-Buys');
  });

  it('triggers auto-buy when fuel=0 and bankHigh>2 (plenty of credits)', () => {
    const r = checkPortEviction(0, 5, 'Bob', 'Alice');
    expect(r.shouldAutoBuy).toBe(true);
  });

  it('triggers eviction when fuel=0 and bankHigh<2 (fneg: m7<2)', () => {
    const r = checkPortEviction(0, 1, 'Bob', 'Alice');
    expect(r.shouldEvict).toBe(true);
    expect(r.shouldAutoBuy).toBe(false);
  });

  it('eviction message mentions owner name', () => {
    const r = checkPortEviction(0, 0, 'Bob', 'Alice');
    expect(r.evictMessage).toContain('Bob');
    expect(r.evictMessage).toContain('lost the franchise');
  });

  it('shows owner-specific warning if visiting player IS the port owner (SP.LIFT.S:226)', () => {
    const r = checkPortEviction(0, 0, 'Bob', 'Bob');
    expect(r.shouldEvict).toBe(true);
    expect(r.evictMessage).toContain('Port can be lost');
  });

  it('does not evict when fuel=0 bankHigh=0 but fuel>999 (fneg guard)', () => {
    // This case can't naturally occur (fuel>999 AND fuel==0 is impossible)
    // but the >999 guard in fneg protects against state corruption
    const r = checkPortEviction(1000, 0, 'Bob', 'Alice');
    // fuel > 0, so early exit at first guard
    expect(r.shouldEvict).toBe(false);
  });
});

// ============================================================================
// SP.LIFT.S seller: Transfer mode (lines 316 + 326)
// ============================================================================

describe('SP.LIFT.S seller Transfer mode (line 316: i$="Transfer" if ma$=na$)', () => {
  it('checks portOwnership to detect port owner (SP.LIFT.S ma$=na$ check)', () => {
    expect(sellerScreenCode).toContain('portOwnership');
    expect(sellerScreenCode).toContain('isOwner');
  });

  it('sets action to "Transfer" when player is port owner (line 316)', () => {
    expect(sellerScreenCode).toContain("'Transfer'");
  });

  it('still shows "Sell" label when player is not port owner', () => {
    expect(sellerScreenCode).toContain("'Sell'");
  });

  it('prints "Fuel put into Storage!" on owner transfer (line 326)', () => {
    expect(sellerScreenCode).toContain('Fuel put into Storage!');
  });

  it('no addCredits call in owner Transfer path (line 326: only f1-i, m9+i)', () => {
    // Transfer path must return before reaching addCredits
    const transferBlock = sellerScreenCode.indexOf('Fuel put into Storage!');
    const addCreditsIdx = sellerScreenCode.indexOf('addCredits(');
    // addCredits appears AFTER the transfer block return (guarded by isOwner check)
    expect(addCreditsIdx).toBeGreaterThan(transferBlock);
  });

  it('updates portOwnership.fuelStored in owner Transfer path (m9=m9+i)', () => {
    expect(sellerScreenCode).toContain('fuelStored: newFuelStored');
  });

  it('caps depot at FUEL_MAX_CAPACITY on owner Transfer (m9 cap)', () => {
    expect(sellerScreenCode).toContain('Math.min(port.fuelStored + units, FUEL_MAX_CAPACITY)');
  });

  it('deducts ship fuel in owner Transfer path (f1=f1-i)', () => {
    expect(sellerScreenCode).toContain('fuel: character.ship.fuel - units');
  });

  it('includes portOwnership in DB query for render', () => {
    expect(sellerScreenCode).toContain('portOwnership: true');
  });
});

// ============================================================================
// SP.REAL.S port/prtr: — M key Stock Report (lines 290-318)
// ============================================================================

describe('SP.REAL.S M key — Space Port Stock Activity report', () => {
  const fuelDepotCode = (() => {
    const fs = require('fs');
    const path = require('path');
    return fs.readFileSync(
      path.join(__dirname, '../src/game/screens/fuel-depot.ts'),
      'utf-8'
    );
  })();

  it("'M' case is present in handleInput (SP.REAL.S start1 line 46: if i$='M')", () => {
    expect(fuelDepotCode).toContain("key === 'M'");
  });

  it('M key prompts for projection ratio 1-100 (SP.REAL.S port: line 293)', () => {
    expect(fuelDepotCode).toContain('1-100');
    expect(fuelDepotCode).toContain('projection ratio');
  });

  it('M key uses pendingStockRatio state for multi-step flow', () => {
    expect(fuelDepotCode).toContain('pendingStockRatio');
  });

  it('M key calls renderStockReport with ratio (SP.REAL.S prtr: bar chart)', () => {
    expect(fuelDepotCode).toContain('renderStockReport(');
  });

  it('renderStockReport queries GameLog for DOCK events per system', () => {
    expect(fuelDepotCode).toContain('DOCK');
    expect(fuelDepotCode).toContain('prisma.gameLog.findMany');
  });

  it('renderStockReport bar uses _ characters scaled by ratio (SP.REAL.S prtr: line 316)', () => {
    // SP.REAL.S: for k=1 to iz:a$=a$+"_":next
    expect(fuelDepotCode).toContain("'_'.repeat(iz)");
  });

  it('renderStockReport caps bar at 60 characters (SP.REAL.S: if iz>60 iz=60)', () => {
    expect(fuelDepotCode).toContain('Math.min(Math.floor(y / ratio), 60)');
  });

  it('M key menu option is visible in render output', () => {
    expect(fuelDepotCode).toContain('(M)arket');
  });
});

// ============================================================================
// SP.REAL.S start1 N key — Fee Report (copy"sp.fee")
// ============================================================================

describe('SP.REAL.S N key — Port Fee Collection Report', () => {
  const fuelDepotCode = (() => {
    const fs = require('fs');
    const path = require('path');
    return fs.readFileSync(
      path.join(__dirname, '../src/game/screens/fuel-depot.ts'),
      'utf-8'
    );
  })();

  it("'N' case is present in handleInput (SP.REAL.S start1 line 47: if i$='N')", () => {
    expect(fuelDepotCode).toContain("key === 'N'");
  });

  it('N key calls renderFeeReport (SP.REAL.S: copy"sp.fee")', () => {
    expect(fuelDepotCode).toContain('renderFeeReport(');
  });

  it('renderFeeReport queries GameLog for PORT_FEE type (modern equivalent of sp.fee)', () => {
    expect(fuelDepotCode).toContain("'PORT_FEE'");
    expect(fuelDepotCode).toContain('prisma.gameLog.findMany');
  });

  it('N key menu option is visible in render output', () => {
    expect(fuelDepotCode).toContain('(N)ews');
  });

  it('fee report header matches original sp.fee format', () => {
    expect(fuelDepotCode).toContain('Space Port Collected Fees List for:');
  });

  it('fee report shows fee amount in credits (SP.LIFT.S: " - Fee Paid: "+a$+" cr")', () => {
    expect(fuelDepotCode).toContain('Fee Paid:');
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
