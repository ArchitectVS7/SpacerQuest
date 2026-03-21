/**
 * SpacerQuest v4.0 - Game Constants
 * 
 * All game balance values from the original SpacerQuest v3.4
 * These values are preserved exactly from the original
 */

// ============================================================================
// CREDITS & ECONOMY
// ============================================================================

export const STARTING_CREDITS_NEW = 0;           // Source: characters start at 0 cr
export const STARTING_CREDITS_CONQUEROR = 100000; // Conqueror returning bonus (g1=10 → 10×10,000 cr)
export const CREDITS_PER_PROMOTION = 10000;      // 10,000 cr units

// ============================================================================
// RANK SYSTEM
// ============================================================================

// Score-based thresholds from original SpacerQuest v3.4
// Promotions are earned at these SCORE thresholds (not promotion count)
// Source formula: sc = floor(score/150)
// Rank fires when sc > threshold (i.e. sc >= threshold+1)
// sc=0 → Lieutenant, sc≥1 → Commander, sc≥2 → Captain, sc≥3 → Commodore,
// sc≥5 → Admiral, sc≥8 → Top Dog, sc≥11 → Grand Mufti, sc≥15 → Mega Hero,
// sc≥18 → Giga Hero.  Note: sc=14 gap (score 2100-2249) is an original bug preserved.
export const RANK_THRESHOLDS = {
  LIEUTENANT: 0,      // sc≥0
  COMMANDER: 150,     // sc≥1
  CAPTAIN: 300,       // sc≥2
  COMMODORE: 450,     // sc≥3
  ADMIRAL: 750,       // sc≥5
  TOP_DOG: 1200,      // sc≥8
  GRAND_MUFTI: 1650,  // sc≥11
  MEGA_HERO: 2250,    // sc≥15
  GIGA_HERO: 2700,    // sc≥18
} as const;

// Source: a=1 for Lieutenant (g1=g1+a → 10,000 cr honorarium on first session)
export const RANK_HONORARIA = {
  LIEUTENANT: 10000,
  COMMANDER: 20000,
  CAPTAIN: 30000,
  COMMODORE: 40000,
  ADMIRAL: 50000,
  TOP_DOG: 80000,
  GRAND_MUFTI: 100000,
  MEGA_HERO: 120000,
  GIGA_HERO: 150000,
} as const;

// ============================================================================
// SHIP COMPONENTS
// ============================================================================

// SP.SPEED.txt lines 31-32: x1=10000,x2=9000,x3=8000,x4=7000,x5=6000,x6=5000,x7=4000,x8=3000
// Price assignments (lines 43-50): i=1→x1(Hull), i=2→x2(Drives), i=3→x8(Cabin),
// i=4→x6(LifeSupport), i=5→x3(Weapons), i=6→x5(Navigation), i=7→x7(Robotics), i=8→x4(Shields)
export const COMPONENT_PRICES = {
  HULL: 10000,        // x1=10000 — i=1
  DRIVES: 9000,       // x2=9000  — i=2
  WEAPONS: 8000,      // x3=8000  — i=5
  SHIELDS: 7000,      // x4=7000  — i=8
  NAVIGATION: 6000,   // x5=6000  — i=6
  LIFE_SUPPORT: 5000, // x6=5000  — i=4
  ROBOTICS: 4000,     // x7=4000  — i=7
  CABIN: 3000,        // x8=3000  — i=3
} as const;

// SP.SPEED.txt line 159: "if x>198 x=199" — max component strength is 199
export const COMPONENT_MAX_STRENGTH = 199;
export const COMPONENT_MAX_CONDITION = 9;
export const COMPONENT_MIN_CONDITION = 0;

// ============================================================================
// SPECIAL EQUIPMENT
// ============================================================================

export const SPECIAL_EQUIPMENT = {
  CLOAKER: {
    price: 500,
    // Source SP.SPEED.txt: if h1<5 → hull strength must be < 5 (max 4)
    // Also requires shields (p1>0), incompatible with ++ or +* shield upgrades, incompatible with auto-repair (+!)
    requirement: {
      hullStrength: { max: 4 },
      shieldStrengthMin: 1,
      incompatibleWith: ['AUTO_REPAIR'] as string[],
    },
  },
  AUTO_REPAIR: {
    priceMultiplier: 1000, // hull strength × 1000
    // Incompatible with cloaker
    requirement: { incompatibleWith: ['CLOAKER'] as string[] },
  },
  STAR_BUSTER: {
    price: 10000,
    // Source SP.SPEED.txt line 59: if sc>0 → just needs Commander rank (score ≥ 150)
    requirement: { minScore: 150 },
  },
  ARCH_ANGEL: {
    price: 10000,
    // Source SP.SPEED.txt: if sc>0 → just needs Commander rank (score ≥ 150)
    requirement: { minScore: 150 },
  },
  ASTRAXIAL_HULL: {
    price: 100000,
    requirement: { isConqueror: true, driveStrength: { min: 25 } },
    bonus: {
      hullStrength: 29,
      hullCondition: 9,
      cargoPods: 190,
      fuel: 2900,
    },
  },
  TITANIUM_HULL: {
    priceMultiplier: 1000, // hull strength × 1000
    requirement: {},
    bonus: { cargoPods: 50 },
  },
  TRANS_WARP: {
    price: 10000,
    requirement: {},
  },
} as const;

// ============================================================================
// FUEL SYSTEM
// ============================================================================

export const FUEL_BASE_COST = 21;          // Base for fuel calculation
export const FUEL_MAX_CAPACITY = 20000;    // Max fuel depot capacity
// SP.LIFT.S fueler section: fh=5 (default Space Authority buy price)
export const FUEL_DEFAULT_PRICE = 5;       // Space Authority default buy price (original: fh=5)

export const FUEL_PRICES_BY_SYSTEM: Record<number, number> = {
  1: 8,   // Sun-3 (SP.LIFT.S: if sp=1 fh=8)
  8: 4,   // Mira-9 (SP.LIFT.S: if sp=8 fh=4)
  14: 6,  // Vega-6 (SP.LIFT.S: if sp=14 fh=6)
};

// SP.LIFT.S seller section: hf (sell price per unit), Space Authority defaults
export const FUEL_SELL_DEFAULT_PRICE = 2;  // Default Space Authority sell price (original: hf=2)
export const FUEL_SELL_PRICES_BY_SYSTEM: Record<number, number> = {
  1: 1,   // Sun-3  (SP.LIFT.S: if sp=1 hf=1)
  8: 3,   // Mira-9 (SP.LIFT.S: if sp=8 hf=3)
  13: 5,  // Spica-3 (SP.LIFT.S: if sp=13 hf=5)
  14: 4,  // Vega-6 (SP.LIFT.S: if sp=14 hf=4)
};

// Kept for backward compatibility with calculateFuelSaleProceeds (used in some tests/routes)
export const FUEL_SELL_MULTIPLIER = 0.5;   // Legacy: sell proceeds multiplier (not used by getFuelSellPrice)

// Fuel depot (port owner operations) — SP.REAL.txt lines 168-230
export const FUEL_DEPOT_WHOLESALE_PRICE = 10;  // SP.REAL.txt line 193: 10 cr/unit from Main Port Storage
export const FUEL_DEPOT_MAX_PRICE = 50;        // SP.REAL.txt line 184: owner fuel price range 0-50
export const FUEL_DEPOT_TRANSFER_MAX = 2900;   // SP.REAL.txt line 225: max single transfer from ship

// ============================================================================
// TRAVEL & NAVIGATION
// ============================================================================
// Travel limitations
export const DAILY_TRIP_LIMIT = 2;
export const COURSE_CHANGE_FUEL_MULTIPLIER = 5; // hull × 5 per course change
export const COURSE_CHANGE_LIMIT_BASE = 3;      // Base course changes per trip
export const COURSE_CHANGE_LIMIT_INCREMENT = 2; // Additional per trip

export const TRAVEL_TIME_MULTIPLIER = 3; // distance × 3 = chronos

// ============================================================================
// COMBAT SYSTEM
// ============================================================================

export const ENCOUNTER_BASE_CHANCE = 0.3;    // 30% base encounter rate
export const ENCOUNTER_RIM_CHANCE = 0.4;     // 40% in Rim Stars

export const TRIBUTE_BASE_MULTIPLIER = 1000; // Base tribute demand
// Original SP.FIGHT1.S:227: kc=(kg*1000):if kg>12 kc=10000
// Maximum tribute demand is 10,000 cr (hit after 12+ rounds)
export const TRIBUTE_MAX = 10000;            // Maximum tribute demand (capped at round 12)

export const CLOAKING_ESCAPE_CHANCE = 0.7;   // 70% escape with cloaker

// Battle Factor bonuses
export const RANK_BF_BONUS = {
  LIEUTENANT: 0,
  COMMANDER: 5,
  CAPTAIN: 10,
  COMMODORE: 15,
  ADMIRAL: 20,
  TOP_DOG: 30,
  GRAND_MUFTI: 40,
  MEGA_HERO: 50,
  GIGA_HERO: 60,
} as const;

export const EXPERIENCE_BF_DIVISOR = 10; // battlesWon / 10
export const AUTO_REPAIR_BF_BONUS = 10;

// ============================================================================
// CARGO SYSTEM
// ============================================================================

// Original cargo type names from carname subroutine (SP.CARGO.txt lines 313-323)
// Types 1-9 only; type 10 (Contraband) is a modern addition for smuggling missions
export const CARGO_TYPES: Record<number, string> = {
  1: 'Dry Goods',
  2: 'Nutri Goods',
  3: 'Spices',
  4: 'Medicinals',
  5: 'Electronics',
  6: 'Precious Metals',
  7: 'Rare Elements',
  8: 'Photonic Components',
  9: 'Dilithium Crystal',
  10: 'Contraband',  // Modern addition: smuggling missions
};

// Core system names from desname subroutine (SP.CARGO.txt lines 325-340)
// Systems 1-14 are the core star systems used for cargo destinations
export const CORE_SYSTEM_NAMES: Record<number, string> = {
  1: 'Sun-3',
  2: 'Aldebaran-1',
  3: 'Altair-3',
  4: 'Arcturus-6',
  5: 'Deneb-4',
  6: 'Denebola-5',
  7: 'Fomalhaut-2',
  8: 'Mira-9',
  9: 'Pollux-7',
  10: 'Procyon-5',
  11: 'Regulus-6',
  12: 'Rigel-8',
  13: 'Spica-3',
  14: 'Vega-6',
};

// NOTE: CARGO_BASE_RATES is retained for backward compatibility but is NOT used
// by the cargo payment formula. The original uses cargoType * 3 as value-per-pod.
export const CARGO_BASE_RATES = {
  1: 1000,
  2: 2000,
  3: 3000,
  4: 4000,
  5: 5000,
  6: 6000,
  10: 1000,
} as const;

export const CARGO_POD_BONUS_HULL = 50;      // Titanium hull gives +50 pods
export const CARGO_WRONG_DESTINATION_PENALTY = 0.5; // 50% pay for wrong destination

// ============================================================================
// PORT OWNERSHIP
// ============================================================================

export const PORT_BASE_PRICE = 100000;       // Base port price (10,000 cr units in original)
export const PORT_RESALE_MULTIPLIER = 0.5;   // 50% resale value
export const PORT_EVICTION_DAYS = 30;        // Days of inactivity before eviction
export const PORT_GUARD_COST = 10000;        // 10,000 cr for guards (1 credit in original)

// ============================================================================
// ALLIANCE SYSTEM
// ============================================================================

export const ALLIANCE_STARTUP_INVESTMENT = 10000; // 10,000 cr to start alliance system
export const ALLIANCE_SIZE_DIVISOR = 3;      // Max 1/3 of players
export const ALLIANCE_MIN_MEMBERS = 4;       // Minimum members before full

export const DEFCON_MAX = 20;
export const DEFCON_COST_PER_LEVEL = 100000; // 100,000 cr per DEFCON level (100 in original)

// ============================================================================
// MISSION SYSTEM
// ============================================================================

export const PATROL_BASE_PAY = 500;
export const PATROL_BATTLE_BONUS = 1000;
export const PATROL_DAILY_LIMIT = 2;          // z1>2 blocks — tripCount > PATROL_DAILY_LIMIT
export const PATROL_SCORE_PROMOTION_INTERVAL = 100; // every 100th (battlesWon+rescuesPerformed)

export const NEMESIS_REQUIREMENT_WINS = 500;
export const NEMESIS_REWARD_CREDITS = 150000;
export const NEMESIS_COORDINATES = { x: 0, y: 0, z: 0 };

export const MALIGNA_COORDINATES = { x: 13, y: 33, z: 99 };
export const MALIGNA_REWARD_POINTS = 100;

export const SMUGGLING_BASE_PAY = 18000;
export const SMUGGLING_RISK_MULTIPLIER = 1.5;

// ============================================================================
// DUELING ARENA
// ============================================================================

export const DUEL_HANDICAP_DIVISOR = 500; // (h1*h2 + d1*d2 + ...) / 500

export const ARENA_REQUIREMENTS = {
  ION_CLOUD: { trips: 50 },
  PROTON_STORM: { astrecs: 100 },
  COSMIC_RADIATION: { cargo: 100 },
  BLACK_HOLE: { rescues: 1 },
} as const;

// ============================================================================
// RESCUE SERVICE
// ============================================================================

export const RESCUE_FEE = 1000;         // 1,000 cr rescue fee (1000 in original)
export const RESCUE_FUEL_COST = 50;     // 50 fuel units for rescue
export const RESCUE_POINTS_BONUS = 11;  // s2 + 11 for successful rescue

// Self-rescue cost formula (SP.LINK.txt line 61):
// xo=20000:if sc<20 xo=(sc*1000)
// sc = floor(score/150); cost capped at 20,000 cr
export function calculateSelfRescueCost(score: number): number {
  const sc = Math.floor(score / 150);
  return sc < 20 ? sc * 1000 : 20000;
}

// ============================================================================
// GAMBLING
// ============================================================================

export const WOF_MAX_BET = 1000;
export const WOF_MIN_ROLLS = 3;
export const WOF_MAX_ROLLS = 7;
export const WOF_NUMBERS = 20;
export const WOF_DAILY_WIN_CAP = 12; // ui=12 in SP.GAME.S line 53

export const DARE_MIN_ROUNDS = 3;
export const DARE_MAX_ROUNDS = 10;
export const DARE_MIN_CREDITS = 750;
export const DARE_MAX_MULTIPLIER = 3;

// ============================================================================
// TIME & DAILY LIMITS
// ============================================================================

export const TURNS_PER_DAY = 2;
export const DAY_RESET_HOUR_UTC = 0; // Midnight UTC

// ============================================================================
// PIRATE CLASSES
// ============================================================================

export const PIRATE_CLASSES = [
  { name: 'SPX', minPower: 0, maxPower: 100 },
  { name: 'SPY', minPower: 100, maxPower: 200 },
  { name: 'SPZ', minPower: 200, maxPower: 500 },
] as const;

// ============================================================================
// STAR SYSTEMS
// ============================================================================

export const CORE_SYSTEMS = 14;
export const RIM_SYSTEMS = 6;
export const ANDROMEDA_SYSTEMS = 6;
export const TOTAL_SYSTEMS = 28; // Including special locations

// ============================================================================
// ALLIANCE SYMBOLS
// ============================================================================

export const ALLIANCE_SYMBOLS = {
  ASTRO_LEAGUE: '+',
  SPACE_DRAGONS: '@',
  WARLORD_CONFED: '&',
  REBEL_ALLIANCE: '^',
} as const;

// ============================================================================
// VALIDATION
// ============================================================================

export const NAME_MIN_LENGTH = 3;
export const NAME_MAX_LENGTH = 15;
export const RESERVED_PREFIXES = ['THE ', 'J%', '*'];
export const RESERVED_SUFFIXES = ['+!', '++', '='];

// ============================================================================
// JAIL / CRIME SYSTEM (SP.END.S)
// ============================================================================

export const CRIME_FINE_SMUGGLING = 1000;   // pp=5: 1,000 cr
export const CRIME_FINE_CARRIER = 10000;    // pp=6: 10,000 cr
export const CRIME_FINE_CONDUCT = 20000;    // pp=7: 20,000 cr
export const BAIL_MULTIPLIER = 2;           // Bail = 2× fine

// ============================================================================
// RIM PORTS (SP.DOCK2.S)
// ============================================================================

/** Rim cargo names and payment multipliers (SP.DOCK2.S carname: lines 336-343) */
export const RIM_CARGO: Record<number, { name: string; multiplier: number }> = {
  15: { name: 'Titanium Ore', multiplier: 1 },
  16: { name: 'Capellan Herbals', multiplier: 2 },
  17: { name: 'Raw Dilithium', multiplier: 3 },
  18: { name: 'Mizarian Liquor', multiplier: 4 },
  19: { name: 'Achernarian Gems', multiplier: 5 },
  20: { name: 'Algolian RDNA', multiplier: 6 },
};

/** Rim star system display names */
export const RIM_SYSTEM_NAMES: Record<number, string> = {
  15: 'Antares-5',
  16: 'Capella-4',
  17: 'Polaris-1',
  18: 'Mizar-9',
  19: 'Achernar-5',
  20: 'Algol-2',
};

/** Rim port single-component repair mapping (SP.DOCK2.S:277-282) */
export const RIM_REPAIR_MAP: Record<number, { component: string; label: string } | null> = {
  15: { component: 'shield', label: 'Shield Repair' },
  16: { component: 'drive', label: 'Drive Repair' },
  17: { component: 'cabin', label: 'Cabin Repair' },
  18: { component: 'robotics', label: 'Robot. Repair' },
  19: { component: 'navigation', label: 'Navig. Repair' },
  20: null,  // Algol-2: no repair shop
};

export const ALGOL_SYSTEM_ID = 20;
export const TRIP_ZERO_MIN_TRIPS = 4;   // z1 >= 4 to qualify for trip counter zero
export const RIM_FUEL_BUY_PRICE = 25;   // fixed 25 cr/unit at rim fuel depots
export const RIM_FUEL_MAX_BUY = 2900;   // max per purchase (SP.DOCK2.S:260)
export const RIM_FUEL_MAX_SELL = 3000;   // max per sale (SP.DOCK2.S:241)

// ============================================================================
// EXTRA-CURRICULAR (SP.END.txt sp.menu11)
// ============================================================================

export const SHIP_GUARD_COST = 10000;         // 10,000 cr to hire ship guard (g1=g1-1)
// Vandalism roll: x=1-10; x<4 damages cargo pods, x=4 hull cond, x=5 cabin cond, x=6 drive str, x=7 life support str, x=8-10 no damage
// Source: SP.END.txt lines 122-134
export const FUEL_MIN_MISSIONS = 50;          // f1<50 → "Not enough fuel to undertake mission!" (SP.END.txt line 47)

// ============================================================================
// SAGE & WISE ONE (SP.DOCK2.S)
// ============================================================================

export const SAGE_TIMER_SECONDS = 9;        // 9 nano-chrons to answer
export const WISE_ONE_SYSTEM = 17;          // Polaris-1
export const SAGE_SYSTEM = 18;              // Mizar-9
