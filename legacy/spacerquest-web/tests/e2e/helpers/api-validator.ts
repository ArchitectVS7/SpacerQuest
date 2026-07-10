/**
 * SpacerQuest v4.0 - API State Validator
 *
 * Queries REST API endpoints to retrieve precise game state for assertions.
 * Complements terminal-based gameplay with server-validated state checks.
 */

import { APIRequestContext } from '@playwright/test';

const API = 'http://localhost:3000';

export interface CharacterState {
  id: string;
  name: string;
  shipName: string;
  rank: string;
  creditsHigh: number;
  creditsLow: number;
  currentSystem: number;
  cargoPods: number;
  cargoType: number;
  destination: number;
  allianceSymbol: string;
  tripCount: number;
  tripsCompleted: number;
  battlesWon: number;
  battlesLost: number;
  missionType: number;
}

export interface ShipComponent {
  name: string;
  strength: number;
  condition: number;
}

export interface ShipState {
  fuel: number;
  components: ShipComponent[];
  cargoPods: number;
  maxCargoPods: number;
  specialEquipment: string[];
}

export interface GameSnapshot {
  credits: number;
  fuel: number;
  system: number;
  cargoPods: number;
  cargoType: number;
  destination: number;
  tripCount: number;
  components: ShipComponent[];
  maxCargoPods: number;
  score: number;
  rank: string;
}

export class ApiValidator {
  token: string;
  request: APIRequestContext;

  constructor(token: string, request: APIRequestContext) {
    this.token = token;
    this.request = request;
  }

  private headers() {
    return { Authorization: `Bearer ${this.token}` };
  }

  private jsonHeaders() {
    return { ...this.headers(), 'Content-Type': 'application/json' };
  }

  async getCharacter(): Promise<CharacterState> {
    const res = await this.request.get(`${API}/api/character`, {
      headers: this.headers(),
    });
    if (!res.ok()) {
      throw new Error(`GET /api/character failed: ${res.status()} ${await res.text()}`);
    }
    const data = await res.json();
    return data.character;
  }

  async getShipStatus(): Promise<ShipState> {
    const res = await this.request.get(`${API}/api/ship/status`, {
      headers: this.headers(),
    });
    if (!res.ok()) {
      throw new Error(`GET /api/ship/status failed: ${res.status()} ${await res.text()}`);
    }
    return await res.json();
  }

  computeCredits(high: number, low: number): number {
    return high * 10000 + low;
  }

  async snapshotState(): Promise<GameSnapshot> {
    const [char, ship] = await Promise.all([
      this.getCharacter(),
      this.getShipStatus(),
    ]);
    return {
      credits: this.computeCredits(char.creditsHigh, char.creditsLow),
      fuel: ship.fuel,
      system: char.currentSystem,
      cargoPods: char.cargoPods,
      cargoType: char.cargoType,
      destination: char.destination,
      tripCount: char.tripCount,
      components: ship.components,
      maxCargoPods: ship.maxCargoPods ?? 0,
      score: (char as any).score ?? 0,
      rank: (char as any).rank ?? 'LIEUTENANT',
    };
  }

  async joinAlliance(allianceSymbol: string): Promise<boolean> {
    const res = await this.request.put(`${API}/api/character/alliance`, {
      headers: this.jsonHeaders(),
      data: { alliance: allianceSymbol },
    });
    return res.ok();
  }

  async buyFuel(units: number): Promise<any> {
    const res = await this.request.post(`${API}/api/economy/fuel/buy`, {
      headers: this.jsonHeaders(),
      data: { units },
    });
    return await res.json();
  }

  async sellFuel(units: number): Promise<any> {
    const res = await this.request.post(`${API}/api/economy/fuel/sell`, {
      headers: this.jsonHeaders(),
      data: { units },
    });
    return await res.json();
  }

  async acceptCargo(): Promise<any> {
    const res = await this.request.post(`${API}/api/economy/cargo/accept`, {
      headers: this.headers(),
    });
    return await res.json();
  }

  async deliverCargo(): Promise<any> {
    const res = await this.request.post(`${API}/api/economy/cargo/deliver`, {
      headers: this.headers(),
    });
    return await res.json();
  }

  async launch(destinationSystemId: number): Promise<any> {
    const res = await this.request.post(`${API}/api/navigation/launch`, {
      headers: this.jsonHeaders(),
      data: { destinationSystemId },
    });
    return await res.json();
  }

  async getTravelStatus(): Promise<any> {
    const res = await this.request.get(`${API}/api/navigation/travel-status`, {
      headers: this.headers(),
    });
    return await res.json();
  }

  async arrive(): Promise<any> {
    const res = await this.request.post(`${API}/api/navigation/arrive`, {
      headers: this.headers(),
    });
    return await res.json();
  }

  async engageCombat(): Promise<any> {
    const res = await this.request.post(`${API}/api/combat/engage`, {
      headers: this.jsonHeaders(),
      data: { attack: true },
    });
    return await res.json();
  }

  /** action: 'FIRE' | 'RETREAT' | 'SURRENDER' (schema uses FIRE not ATTACK) */
  async combatAction(action: string, round: number, enemy?: any): Promise<any> {
    const res = await this.request.post(`${API}/api/combat/action`, {
      headers: this.jsonHeaders(),
      data: { action, round, enemy },
    });
    return await res.json();
  }

  async payFine(): Promise<any> {
    const res = await this.request.post(`${API}/api/character/jail/pay-fine`, {
      headers: this.headers(),
    });
    return await res.json();
  }

  /** component: 'HULL'|'DRIVES'|'CABIN'|'LIFE_SUPPORT'|'WEAPONS'|'NAVIGATION'|'ROBOTICS'|'SHIELDS' */
  async upgradeComponent(component: string, upgradeType: 'STRENGTH' | 'CONDITION' = 'STRENGTH'): Promise<any> {
    const res = await this.request.post(`${API}/api/ship/upgrade`, {
      headers: this.jsonHeaders(),
      data: { component, upgradeType },
    });
    return await res.json();
  }

  async repairShip(): Promise<any> {
    const res = await this.request.post(`${API}/api/ship/repair`, {
      headers: this.headers(),
    });
    return await res.json();
  }

  /** Wait for travel to complete by polling, then call arrive */
  async waitForArrival(page: any, maxWaitMs = 60000): Promise<any> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      const status = await this.getTravelStatus();
      if (!status.inTransit) break;
      await page.waitForTimeout(1000);
    }
    try {
      return await this.arrive();
    } catch {
      return { success: true }; // already arrived
    }
  }

  // ── Gambling ────────────────────────────────────────────────────────────

  async gambleWheel(betNumber: number, betAmount: number, rolls: number): Promise<any> {
    const res = await this.request.post(`${API}/api/economy/gamble/wheel`, {
      headers: this.jsonHeaders(),
      data: { betNumber, betAmount, rolls },
    });
    return await res.json();
  }

  async gambleDare(rounds: number, multiplier: number): Promise<any> {
    const res = await this.request.post(`${API}/api/economy/gamble/dare`, {
      headers: this.jsonHeaders(),
      data: { rounds, multiplier },
    });
    return await res.json();
  }

  // ── Alliance ────────────────────────────────────────────────────────────

  async allianceInvest(amount: number): Promise<any> {
    const res = await this.request.post(`${API}/api/economy/alliance/invest`, {
      headers: this.jsonHeaders(),
      data: { amount },
    });
    return await res.json();
  }

  async allianceWithdraw(amount: number): Promise<any> {
    const res = await this.request.post(`${API}/api/economy/alliance/withdraw`, {
      headers: this.jsonHeaders(),
      data: { amount },
    });
    return await res.json();
  }

  async readBulletinBoard(): Promise<any> {
    const res = await this.request.get(`${API}/api/alliance/board`, {
      headers: this.headers(),
    });
    return await res.json();
  }

  async postBulletinBoard(message: string): Promise<any> {
    const res = await this.request.post(`${API}/api/alliance/board`, {
      headers: this.jsonHeaders(),
      data: { message },
    });
    return await res.json();
  }

  // ── Social ──────────────────────────────────────────────────────────────

  async getDirectory(): Promise<any> {
    const res = await this.request.get(`${API}/api/social/directory`, {
      headers: this.headers(),
    });
    return await res.json();
  }

  async getLeaderboard(): Promise<any> {
    const res = await this.request.get(`${API}/api/social/leaderboard`, {
      headers: this.headers(),
    });
    return await res.json();
  }

  async getBattleLog(): Promise<any> {
    const res = await this.request.get(`${API}/api/social/battles`, {
      headers: this.headers(),
    });
    return await res.json();
  }

  // ── Navigation ──────────────────────────────────────────────────────────

  async courseChange(newDestination: number): Promise<any> {
    const res = await this.request.post(`${API}/api/navigation/course-change`, {
      headers: this.jsonHeaders(),
      data: { newDestination },
    });
    return await res.json();
  }

  // ── Utility ─────────────────────────────────────────────────────────────

  /** Travel to a system: launch, wait, arrive. Returns true on success. */
  async travelTo(page: any, dest: number, maxWaitMs = 30000): Promise<boolean> {
    const result = await this.launch(dest);
    if (result.error) return false;
    await this.waitForArrival(page, maxWaitMs);
    const char = await this.getCharacter();
    return char.currentSystem === dest;
  }

  /** Ensure fuel is above minimum, buying if needed. */
  async ensureFuel(minFuel: number): Promise<void> {
    const ship = await this.getShipStatus();
    if (ship.fuel < minFuel) {
      const needed = minFuel - ship.fuel + 10;
      await this.buyFuel(needed);
    }
  }
}
