/**
 * SpacerQuest v4.0 - Port Ownership System (SP.REAL.S)
 *
 * This module re-exports the canonical port ownership functions from economy.ts.
 * The economy module owns all port ownership logic via the PortOwnership table.
 *
 * Historical note: an earlier implementation used the AllianceSystem table by
 * mistake. All port operations must use the PortOwnership table.
 */

export { purchasePort as buyPort, sellPort, calculatePortPrice, calculatePortResaleValue } from './economy.js';

/**
 * Dividends collect automatically at day reset (via Bull queue job).
 * This stub is retained for backward-compatible imports in tests.
 */
export async function collectPortDividends(_characterId: string, _systemId: number) {
  return { success: false, error: 'Dividends collect automatically at day reset' };
}
