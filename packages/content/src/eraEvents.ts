/**
 * Era events — world economic weather (T-107).
 *
 * These are the "economy fights back" beats (PRD §2, §5.3): a blockade, a
 * plague, a dilithium rush that re-price the map mid-career so no trade route
 * stays optimal. They are PURE DATA here — the engine owns the seeded schedule,
 * resolves modifiers by defId, and threads them through the shared player/NPC
 * economy functions (generateManifestBoard payments, localFuelPrice,
 * calculateRouteDanger).
 *
 * NOTE: an era EVENT (this file) is a transient world condition. It is a
 * DIFFERENT concept from the campaign-phase `EraId` ('TOUR_ONE' | 'VETERAN')
 * that gates storylet triggers. Do not conflate them.
 */

/** How an era event's epicentre is chosen at onset. Region events cover a whole
 *  band of the starmap; single-system events strike one port. */
export type EraEventScopeKind = 'single-system' | 'region';

/** The two starmap bands an era event can scope to. */
export type EraEventRegion = 'core' | 'rim';

export interface EraEventScopeRule {
  kind: EraEventScopeKind;
  /** For region scope: pin the band. Omit to let the scheduler roll core/rim. */
  region?: EraEventRegion;
}

/**
 * All modifiers are PLAIN NUMBERS and resolved by the engine against the event's
 * `affectedSystemIds`. Application rules (engine `era.ts`):
 *   - paymentMultiplierByCargoType: contract payment ×= value when the delivery
 *     DESTINATION is an affected system AND its cargo type matches a key here.
 *   - paymentMultiplierIntoScope: contract payment ×= value for every offer whose
 *     DESTINATION is an affected system (all cargo types).
 *   - paymentMultiplierAll: contract payment ×= value for EVERY offer, galaxy-wide.
 *   - fuelPriceMultiplier: local depot price ×= value when the depot's system is
 *     affected.
 *   - routeDangerDelta: route danger += value when the route touches an affected
 *     system (origin or destination).
 *   - routeDangerDeltaAll: route danger += value for EVERY route, galaxy-wide.
 */
export interface EraEventModifiers {
  paymentMultiplierByCargoType?: Readonly<Record<number, number>>;
  paymentMultiplierIntoScope?: number;
  paymentMultiplierAll?: number;
  fuelPriceMultiplier?: number;
  routeDangerDelta?: number;
  routeDangerDeltaAll?: number;
}

export interface EraEventDefinition {
  id: string;
  name: string;
  /** Period-voice wire copy. `{system}` and `{region}` are resolved by the
   *  engine from the live scope when the entry is emitted. */
  wireStart: string;
  wireEnd: string;
  /** Inclusive [min, max] active-day span; the scheduler rolls a length inside. */
  durationDays: readonly [number, number];
  scope: EraEventScopeRule;
  modifiers: EraEventModifiers;
}

// Cargo type ids (see cargo.ts): 1 Dry Goods, 2 Nutri Goods, 4 Medicinals,
// 7 Rare Elements, 9 Dilithium Crystal.

export const ERA_EVENTS: readonly EraEventDefinition[] = [
  {
    id: 'blockade',
    name: 'Confederation Blockade',
    wireStart:
      'WIRE: Warlord Confederation throws a cordon around {region} — freight bound inside fetches a premium, and the lanes have grown teeth.',
    wireEnd: 'WIRE: The Confederation lifts its cordon on {region}. Traffic breathes again.',
    durationDays: [6, 12],
    scope: { kind: 'region' },
    modifiers: {
      paymentMultiplierIntoScope: 1.8,
      routeDangerDelta: 2,
    },
  },
  {
    id: 'plague',
    name: 'Orbital Fever',
    wireStart:
      "WIRE: Fever outbreak in the {system} orbital district; the Governor's appeal has medicine rates soaring — and the desperate are circling.",
    wireEnd: 'WIRE: {system} declares the fever contained. Medicine rates settle.',
    durationDays: [5, 10],
    scope: { kind: 'single-system' },
    modifiers: {
      paymentMultiplierByCargoType: { 4: 2.5 },
      routeDangerDelta: 1,
    },
  },
  {
    id: 'dilithium_rush',
    name: 'Dilithium Rush',
    wireStart:
      'WIRE: Strike at {system}! A dilithium seam cracks wide open — haul crystal and rare elements in and name your price.',
    wireEnd: 'WIRE: The {system} seam plays out. The rush is over; the boomtown empties.',
    durationDays: [6, 12],
    scope: { kind: 'single-system' },
    modifiers: {
      paymentMultiplierByCargoType: { 9: 2, 7: 2 },
    },
  },
  {
    id: 'patrol_crackdown',
    name: 'Astro League Crackdown',
    wireStart:
      'WIRE: Astro League floods every lane with patrols — safer skies from core to rim, but the brokers have gone tight-fisted.',
    wireEnd: 'WIRE: The League stands its patrols down. The lanes loosen, for better and worse.',
    durationDays: [5, 9],
    scope: { kind: 'region', region: 'core' },
    modifiers: {
      paymentMultiplierAll: 0.9,
      routeDangerDeltaAll: -1,
    },
  },
  {
    id: 'famine',
    name: 'Crop Failure',
    wireStart:
      'WIRE: Crop failure grips {system} — foodstuffs and dry goods fetch double at the docks, and hungry eyes watch every approach.',
    wireEnd: 'WIRE: Relief convoys reach {system}. The famine breaks and prices ease.',
    durationDays: [5, 10],
    scope: { kind: 'single-system' },
    modifiers: {
      paymentMultiplierByCargoType: { 2: 2, 1: 2 },
    },
  },
  {
    id: 'fuel_crisis',
    name: 'Refinery Sabotage',
    wireStart:
      'WIRE: Refinery sabotage doubles fuel across {region} — every jump bleeds credits, so every haul that lands is worth the burn.',
    wireEnd: 'WIRE: {region} refineries come back online. Fuel prices fall out of the sky.',
    durationDays: [6, 11],
    scope: { kind: 'region' },
    modifiers: {
      fuelPriceMultiplier: 2,
      paymentMultiplierAll: 1.2,
    },
  },
];

export const ERA_EVENTS_BY_ID: Readonly<Record<string, EraEventDefinition>> = Object.fromEntries(
  ERA_EVENTS.map((def) => [def.id, def]),
);
