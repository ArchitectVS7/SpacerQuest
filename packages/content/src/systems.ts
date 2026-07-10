export interface StarCoordinates {
  // Rimward uses the seed's x/y plane for route distance. The seed's z value is legacy/special-location lore and is not part of T-101 travel math.
  x: number;
  y: number;
}

export interface StarSystem {
  id: number;
  name: string;
  isRim: boolean;
  coordinates: StarCoordinates;
  fuelBuyPrice?: number; // Base buy price for fuel, if defined
  fuelSellPrice?: number; // Base sell price for fuel, if defined
}

export const STAR_SYSTEMS: Record<number, StarSystem> = {
  // Core Systems
  1: {
    id: 1,
    name: 'Sun-3',
    isRim: false,
    coordinates: { x: 0, y: 0 },
    fuelBuyPrice: 8,
    fuelSellPrice: 1,
  },
  2: { id: 2, name: 'Aldebaran-1', isRim: false, coordinates: { x: 1, y: 0 } },
  3: { id: 3, name: 'Altair-3', isRim: false, coordinates: { x: 2, y: 0 } },
  4: { id: 4, name: 'Arcturus-6', isRim: false, coordinates: { x: 3, y: 0 } },
  5: { id: 5, name: 'Deneb-4', isRim: false, coordinates: { x: 4, y: 0 } },
  6: { id: 6, name: 'Denebola-5', isRim: false, coordinates: { x: 5, y: 0 } },
  7: { id: 7, name: 'Fomalhaut-2', isRim: false, coordinates: { x: 6, y: 0 } },
  8: {
    id: 8,
    name: 'Mira-9',
    isRim: false,
    coordinates: { x: 7, y: 0 },
    fuelBuyPrice: 4,
    fuelSellPrice: 3,
  },
  9: { id: 9, name: 'Pollux-7', isRim: false, coordinates: { x: 8, y: 0 } },
  10: { id: 10, name: 'Procyon-5', isRim: false, coordinates: { x: 9, y: 0 } },
  11: { id: 11, name: 'Regulus-6', isRim: false, coordinates: { x: 10, y: 0 } },
  12: { id: 12, name: 'Rigel-8', isRim: false, coordinates: { x: 11, y: 0 } },
  13: {
    id: 13,
    name: 'Spica-3',
    isRim: false,
    coordinates: { x: 12, y: 0 },
    fuelSellPrice: 5,
  },
  14: {
    id: 14,
    name: 'Vega-6',
    isRim: false,
    coordinates: { x: 13, y: 0 },
    fuelBuyPrice: 6,
    fuelSellPrice: 4,
  },

  // Rim Systems
  15: { id: 15, name: 'Antares-5', isRim: true, coordinates: { x: 14, y: 0 } },
  16: { id: 16, name: 'Capella-4', isRim: true, coordinates: { x: 15, y: 0 } },
  17: { id: 17, name: 'Polaris-1', isRim: true, coordinates: { x: 16, y: 0 } },
  18: { id: 18, name: 'Mizar-9', isRim: true, coordinates: { x: 17, y: 0 } },
  19: { id: 19, name: 'Achernar-5', isRim: true, coordinates: { x: 18, y: 0 } },
  20: { id: 20, name: 'Algol-2', isRim: true, coordinates: { x: 19, y: 0 } },

  // Andromeda Systems
  21: { id: 21, name: 'NGC-44', isRim: false, coordinates: { x: 44, y: 22 } },
  22: { id: 22, name: 'NGC-55', isRim: false, coordinates: { x: 55, y: 33 } },
  23: { id: 23, name: 'NGC-66', isRim: false, coordinates: { x: 66, y: 44 } },
  24: { id: 24, name: 'NGC-77', isRim: false, coordinates: { x: 77, y: 55 } },
  25: { id: 25, name: 'NGC-88', isRim: false, coordinates: { x: 88, y: 66 } },
  26: { id: 26, name: 'NGC-99', isRim: false, coordinates: { x: 99, y: 77 } },

  // Special Systems
  27: { id: 27, name: 'MALIGNA', isRim: false, coordinates: { x: 13, y: 33 } },
  28: { id: 28, name: 'NEMESIS', isRim: false, coordinates: { x: 0, y: 0 } },
};

export const FUEL_DEFAULT_BUY_PRICE = 5;
export const FUEL_DEFAULT_SELL_PRICE = 2;
export const RIM_FUEL_BUY_PRICE = 25;

export function calculateDistance(origin: StarCoordinates, destination: StarCoordinates): number {
  const raw = Math.hypot(destination.x - origin.x, destination.y - origin.y);
  return raw === 0 ? 1 : Math.ceil(raw);
}

export function distance(originSystemId: number, destinationSystemId: number): number {
  const origin = STAR_SYSTEMS[originSystemId];
  const destination = STAR_SYSTEMS[destinationSystemId];
  if (!origin || !destination) {
    throw new Error(`Unknown star system route: ${originSystemId} -> ${destinationSystemId}`);
  }
  return calculateDistance(origin.coordinates, destination.coordinates);
}
