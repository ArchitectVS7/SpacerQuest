export interface StarSystem {
  id: number;
  name: string;
  isRim: boolean;
  fuelBuyPrice?: number; // Base buy price for fuel, if defined
  fuelSellPrice?: number; // Base sell price for fuel, if defined
}

export const STAR_SYSTEMS: Record<number, StarSystem> = {
  // Core Systems
  1: { id: 1, name: 'Sun-3', isRim: false, fuelBuyPrice: 8, fuelSellPrice: 1 },
  2: { id: 2, name: 'Aldebaran-1', isRim: false },
  3: { id: 3, name: 'Altair-3', isRim: false },
  4: { id: 4, name: 'Arcturus-6', isRim: false },
  5: { id: 5, name: 'Deneb-4', isRim: false },
  6: { id: 6, name: 'Denebola-5', isRim: false },
  7: { id: 7, name: 'Fomalhaut-2', isRim: false },
  8: { id: 8, name: 'Mira-9', isRim: false, fuelBuyPrice: 4, fuelSellPrice: 3 },
  9: { id: 9, name: 'Pollux-7', isRim: false },
  10: { id: 10, name: 'Procyon-5', isRim: false },
  11: { id: 11, name: 'Regulus-6', isRim: false },
  12: { id: 12, name: 'Rigel-8', isRim: false },
  13: { id: 13, name: 'Spica-3', isRim: false, fuelSellPrice: 5 },
  14: { id: 14, name: 'Vega-6', isRim: false, fuelBuyPrice: 6, fuelSellPrice: 4 },
  
  // Rim Systems
  15: { id: 15, name: 'Antares-5', isRim: true },
  16: { id: 16, name: 'Capella-4', isRim: true },
  17: { id: 17, name: 'Polaris-1', isRim: true },
  18: { id: 18, name: 'Mizar-9', isRim: true },
  19: { id: 19, name: 'Achernar-5', isRim: true },
  20: { id: 20, name: 'Algol-2', isRim: true },
};

export const FUEL_DEFAULT_BUY_PRICE = 5;
export const FUEL_DEFAULT_SELL_PRICE = 2;
export const RIM_FUEL_BUY_PRICE = 25;
