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
export const STARTING_CREDITS_CONQUEROR = 10000; // Conqueror returning bonus
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

export const COMPONENT_PRICES = {
  HULL: 10000,       // +10 strength
  DRIVES: 9000,      // +10 strength
  WEAPONS: 8000,     // +10 strength
  SHIELDS: 7000,     // +10 strength
  LIFE_SUPPORT: 6000, // +10 strength
  NAVIGATION: 5000,  // +10 strength
  ROBOTICS: 4000,    // +10 strength
  CABIN: 8000,       // +10 strength
} as const;

export const COMPONENT_MAX_STRENGTH = 209;
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
export const FUEL_DEFAULT_PRICE = 25;      // Space Authority default price

export const FUEL_PRICES_BY_SYSTEM: Record<number, number> = {
  1: 8,   // Sun-3
  8: 4,   // Mira-9 (cheap)
  14: 6,  // Vega-6
};

export const FUEL_SELL_MULTIPLIER = 0.5;   // Sell at 50% of buy price

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
export const TRIBUTE_MAX = 20000;            // Maximum tribute

export const RETREAT_SUCCESS_CHANCE = 0.5;   // 50% base retreat success

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

export const CARGO_BASE_RATES = {
  1: 1000,  // Titanium Ore
  2: 2000,  // Capellan Herbals
  3: 3000,  // Raw Dilithium
  4: 4000,  // Mizarian Liquor
  5: 5000,  // Achernarian Gems
  6: 6000,  // Algolian RDNA
  10: 1000, // Contraband (base)
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

// ============================================================================
// GAMBLING
// ============================================================================

export const WOF_MAX_BET = 1000;
export const WOF_MIN_ROLLS = 3;
export const WOF_MAX_ROLLS = 7;
export const WOF_NUMBERS = 20;

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
// SAGE & WISE ONE (SP.DOCK2.S)
// ============================================================================

// ============================================================================
// EXTRA-CURRICULAR (SP.END.txt sp.menu11)
// ============================================================================

export const SHIP_GUARD_COST = 10000;         // 10,000 cr to hire ship guard (g1=g1-1)
export const VANDALISM_STRENGTH_MIN = 1;      // Min random component strength loss on quit without guard
export const VANDALISM_STRENGTH_MAX = 5;      // Max random component strength loss
export const VANDALISM_CONDITION_MIN = 1;     // Min condition loss
export const VANDALISM_CONDITION_MAX = 3;     // Max condition loss

// ============================================================================
// SAGE & WISE ONE (SP.DOCK2.S)
// ============================================================================

export const SAGE_TIMER_SECONDS = 9;        // 9 nano-chrons to answer
export const WISE_ONE_SYSTEM = 17;          // Polaris-1
export const SAGE_SYSTEM = 18;              // Mizar-9
