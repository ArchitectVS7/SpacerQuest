/**
 * SpacerQuest v4.0 - Game Constants
 *
 * All game balance values from the original SpacerQuest v3.4
 * These values are preserved exactly from the original
 */
export declare const STARTING_CREDITS_NEW = 1000;
export declare const STARTING_CREDITS_CONQUEROR = 10000;
export declare const CREDITS_PER_PROMOTION = 10000;
export declare const RANK_THRESHOLDS: {
    readonly LIEUTENANT: 0;
    readonly COMMANDER: 150;
    readonly CAPTAIN: 300;
    readonly COMMODORE: 450;
    readonly ADMIRAL: 600;
    readonly TOP_DOG: 900;
    readonly GRAND_MUFTI: 1100;
    readonly MEGA_HERO: 1350;
    readonly GIGA_HERO: 2700;
};
export declare const RANK_HONORARIA: {
    readonly LIEUTENANT: 0;
    readonly COMMANDER: 20000;
    readonly CAPTAIN: 30000;
    readonly COMMODORE: 40000;
    readonly ADMIRAL: 50000;
    readonly TOP_DOG: 80000;
    readonly GRAND_MUFTI: 100000;
    readonly MEGA_HERO: 120000;
    readonly GIGA_HERO: 150000;
};
export declare const COMPONENT_PRICES: {
    readonly HULL: 10000;
    readonly DRIVES: 9000;
    readonly WEAPONS: 8000;
    readonly SHIELDS: 7000;
    readonly LIFE_SUPPORT: 6000;
    readonly NAVIGATION: 5000;
    readonly ROBOTICS: 4000;
    readonly CABIN: 8000;
};
export declare const COMPONENT_MAX_STRENGTH = 209;
export declare const COMPONENT_MAX_CONDITION = 9;
export declare const COMPONENT_MIN_CONDITION = 0;
export declare const SPECIAL_EQUIPMENT: {
    readonly CLOAKER: {
        readonly price: 500;
        readonly requirement: {
            readonly hullStrength: {
                readonly max: 49;
            };
        };
    };
    readonly AUTO_REPAIR: {
        readonly priceMultiplier: 1000;
        readonly requirement: {};
    };
    readonly STAR_BUSTER: {
        readonly price: 10000;
        readonly requirement: {
            readonly isConqueror: true;
            readonly completedMaligna: true;
        };
    };
    readonly ARCH_ANGEL: {
        readonly price: 10000;
        readonly requirement: {
            readonly isConqueror: true;
            readonly completedMaligna: true;
        };
    };
    readonly ASTRAXIAL_HULL: {
        readonly price: 100000;
        readonly requirement: {
            readonly isConqueror: true;
            readonly driveStrength: {
                readonly min: 25;
            };
        };
        readonly bonus: {
            readonly hullStrength: 29;
            readonly hullCondition: 9;
            readonly cargoPods: 190;
            readonly fuel: 2900;
        };
    };
};
export declare const FUEL_BASE_COST = 21;
export declare const FUEL_MAX_CAPACITY = 20000;
export declare const FUEL_DEFAULT_PRICE = 25;
export declare const FUEL_PRICES_BY_SYSTEM: Record<number, number>;
export declare const FUEL_SELL_MULTIPLIER = 0.5;
export declare const DAILY_TRIP_LIMIT = 3;
export declare const COURSE_CHANGE_FUEL_MULTIPLIER = 5;
export declare const COURSE_CHANGE_LIMIT_BASE = 5;
export declare const COURSE_CHANGE_LIMIT_INCREMENT = 2;
export declare const TRAVEL_TIME_MULTIPLIER = 3;
export declare const ENCOUNTER_BASE_CHANCE = 0.3;
export declare const ENCOUNTER_RIM_CHANCE = 0.4;
export declare const TRIBUTE_BASE_MULTIPLIER = 1000;
export declare const TRIBUTE_MAX = 20000;
export declare const RETREAT_SUCCESS_CHANCE = 0.5;
export declare const CLOAKING_ESCAPE_CHANCE = 0.7;
export declare const RANK_BF_BONUS: {
    readonly LIEUTENANT: 0;
    readonly COMMANDER: 5;
    readonly CAPTAIN: 10;
    readonly COMMODORE: 15;
    readonly ADMIRAL: 20;
    readonly TOP_DOG: 30;
    readonly GRAND_MUFTI: 40;
    readonly MEGA_HERO: 50;
    readonly GIGA_HERO: 60;
};
export declare const EXPERIENCE_BF_DIVISOR = 10;
export declare const AUTO_REPAIR_BF_BONUS = 10;
export declare const CARGO_BASE_RATES: {
    readonly 1: 1000;
    readonly 2: 2000;
    readonly 3: 3000;
    readonly 4: 4000;
    readonly 5: 5000;
    readonly 6: 6000;
    readonly 10: 1000;
};
export declare const CARGO_POD_BONUS_HULL = 50;
export declare const CARGO_WRONG_DESTINATION_PENALTY = 0.5;
export declare const PORT_BASE_PRICE = 100000;
export declare const PORT_RESALE_MULTIPLIER = 0.5;
export declare const PORT_EVICTION_DAYS = 30;
export declare const PORT_GUARD_COST = 10000;
export declare const ALLIANCE_STARTUP_INVESTMENT = 10000;
export declare const ALLIANCE_SIZE_DIVISOR = 3;
export declare const ALLIANCE_MIN_MEMBERS = 4;
export declare const DEFCON_MAX = 20;
export declare const DEFCON_COST_PER_LEVEL = 100000;
export declare const PATROL_BASE_PAY = 500;
export declare const PATROL_BATTLE_BONUS = 1000;
export declare const NEMESIS_REQUIREMENT_WINS = 500;
export declare const NEMESIS_REWARD_CREDITS = 150000;
export declare const NEMESIS_COORDINATES: {
    x: number;
    y: number;
    z: number;
};
export declare const MALIGNA_COORDINATES: {
    x: number;
    y: number;
    z: number;
};
export declare const MALIGNA_REWARD_POINTS = 100;
export declare const SMUGGLING_BASE_PAY = 18000;
export declare const SMUGGLING_RISK_MULTIPLIER = 1.5;
export declare const DUEL_HANDICAP_DIVISOR = 500;
export declare const ARENA_REQUIREMENTS: {
    readonly ION_CLOUD: {
        readonly trips: 50;
    };
    readonly PROTON_STORM: {
        readonly astrecs: 100;
    };
    readonly COSMIC_RADIATION: {
        readonly cargo: 100;
    };
    readonly BLACK_HOLE: {
        readonly rescues: 1;
    };
};
export declare const RESCUE_FEE = 1000;
export declare const RESCUE_FUEL_COST = 50;
export declare const RESCUE_POINTS_BONUS = 11;
export declare const WOF_MAX_BET = 1000;
export declare const WOF_MIN_ROLLS = 3;
export declare const WOF_MAX_ROLLS = 7;
export declare const WOF_NUMBERS = 20;
export declare const DARE_MIN_ROUNDS = 3;
export declare const DARE_MAX_ROUNDS = 10;
export declare const DARE_MIN_CREDITS = 750;
export declare const DARE_MAX_MULTIPLIER = 3;
export declare const TURNS_PER_DAY = 3;
export declare const DAY_RESET_HOUR_UTC = 0;
export declare const PIRATE_CLASSES: readonly [{
    readonly name: "SPX";
    readonly minPower: 0;
    readonly maxPower: 100;
}, {
    readonly name: "SPY";
    readonly minPower: 100;
    readonly maxPower: 200;
}, {
    readonly name: "SPZ";
    readonly minPower: 200;
    readonly maxPower: 500;
}];
export declare const CORE_SYSTEMS = 14;
export declare const RIM_SYSTEMS = 6;
export declare const ANDROMEDA_SYSTEMS = 6;
export declare const TOTAL_SYSTEMS = 28;
export declare const ALLIANCE_SYMBOLS: {
    readonly ASTRO_LEAGUE: "+";
    readonly SPACE_DRAGONS: "@";
    readonly WARLORD_CONFED: "&";
    readonly REBEL_ALLIANCE: "^";
};
export declare const NAME_MIN_LENGTH = 3;
export declare const NAME_MAX_LENGTH = 15;
export declare const RESERVED_PREFIXES: string[];
export declare const RESERVED_SUFFIXES: string[];
//# sourceMappingURL=constants.d.ts.map