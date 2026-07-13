export interface CargoType {
  id: number;
  name: string;
  isContraband: boolean;
  baseRate: number; // Rough base value
  /**
   * T-1104 · The per-unit value factor the contract-payment math multiplies by
   * (engine `rollContract`). Lives here as DATA, not as an engine branch, per the
   * content-as-data constraint: the engine reads `CARGO_TYPES[id].valueMultiplier`
   * and never hardcodes the id→value mapping.
   *
   * Core types (1–9): `valueMultiplier === id` DELIBERATELY. The pre-T-1104 engine
   * priced core cargo as `cargoType * 3` per pod; keeping the multiplier equal to
   * the id leaves every CORE payment numerically unchanged (divergence-free for
   * core). Rim types (15–20) carry 1..6 (the "Multiplier 1..6" the data was
   * already annotated with, now a real field). Contraband (10) is priced at the
   * top of the band (9) — PRD §7.4 frames a contraband haul as the score that
   * "solves everything", so it pays like the richest legal cargo before the
   * rim danger/fuel premiums stack on top.
   */
  valueMultiplier: number;
}

export const CARGO_TYPES: Record<number, CargoType> = {
  1: { id: 1, name: 'Dry Goods', isContraband: false, baseRate: 1000, valueMultiplier: 1 },
  2: { id: 2, name: 'Nutri Goods', isContraband: false, baseRate: 2000, valueMultiplier: 2 },
  3: { id: 3, name: 'Spices', isContraband: false, baseRate: 3000, valueMultiplier: 3 },
  4: { id: 4, name: 'Medicinals', isContraband: false, baseRate: 4000, valueMultiplier: 4 },
  5: { id: 5, name: 'Electronics', isContraband: false, baseRate: 5000, valueMultiplier: 5 },
  6: { id: 6, name: 'Precious Metals', isContraband: false, baseRate: 6000, valueMultiplier: 6 },
  7: { id: 7, name: 'Rare Elements', isContraband: false, baseRate: 7000, valueMultiplier: 7 },
  8: {
    id: 8,
    name: 'Photonic Components',
    isContraband: false,
    baseRate: 8000,
    valueMultiplier: 8,
  },
  9: { id: 9, name: 'Dilithium Crystal', isContraband: false, baseRate: 9000, valueMultiplier: 9 },
  // Contraband — the smuggling pillar's cargo. Priced at the top of the band (9);
  // T-1104 issues it rarely and only from contraband-allowing rim ports.
  10: { id: 10, name: 'Contraband', isContraband: true, baseRate: 1000, valueMultiplier: 9 },

  // Rim specific cargo — value multipliers 1..6 (was loose `// Multiplier N`
  // comments; now the real `valueMultiplier` field the engine reads).
  15: { id: 15, name: 'Titanium Ore', isContraband: false, baseRate: 1000, valueMultiplier: 1 },
  16: { id: 16, name: 'Capellan Herbals', isContraband: false, baseRate: 2000, valueMultiplier: 2 },
  17: { id: 17, name: 'Raw Dilithium', isContraband: false, baseRate: 3000, valueMultiplier: 3 },
  18: { id: 18, name: 'Mizarian Liquor', isContraband: false, baseRate: 4000, valueMultiplier: 4 },
  19: { id: 19, name: 'Achernarian Gems', isContraband: false, baseRate: 5000, valueMultiplier: 5 },
  20: { id: 20, name: 'Algolian RDNA', isContraband: false, baseRate: 6000, valueMultiplier: 6 },
};
