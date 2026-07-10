export interface CargoType {
  id: number;
  name: string;
  isContraband: boolean;
  baseRate: number; // Rough base value
}

export const CARGO_TYPES: Record<number, CargoType> = {
  1: { id: 1, name: 'Dry Goods', isContraband: false, baseRate: 1000 },
  2: { id: 2, name: 'Nutri Goods', isContraband: false, baseRate: 2000 },
  3: { id: 3, name: 'Spices', isContraband: false, baseRate: 3000 },
  4: { id: 4, name: 'Medicinals', isContraband: false, baseRate: 4000 },
  5: { id: 5, name: 'Electronics', isContraband: false, baseRate: 5000 },
  6: { id: 6, name: 'Precious Metals', isContraband: false, baseRate: 6000 },
  7: { id: 7, name: 'Rare Elements', isContraband: false, baseRate: 7000 },
  8: { id: 8, name: 'Photonic Components', isContraband: false, baseRate: 8000 },
  9: { id: 9, name: 'Dilithium Crystal', isContraband: false, baseRate: 9000 },
  10: { id: 10, name: 'Contraband', isContraband: true, baseRate: 1000 }, // Special handling for contraband
  
  // Rim specific cargo
  15: { id: 15, name: 'Titanium Ore', isContraband: false, baseRate: 1000 }, // Multiplier 1
  16: { id: 16, name: 'Capellan Herbals', isContraband: false, baseRate: 2000 }, // Multiplier 2
  17: { id: 17, name: 'Raw Dilithium', isContraband: false, baseRate: 3000 }, // Multiplier 3
  18: { id: 18, name: 'Mizarian Liquor', isContraband: false, baseRate: 4000 }, // Multiplier 4
  19: { id: 19, name: 'Achernarian Gems', isContraband: false, baseRate: 5000 }, // Multiplier 5
  20: { id: 20, name: 'Algolian RDNA', isContraband: false, baseRate: 6000 }, // Multiplier 6
};
