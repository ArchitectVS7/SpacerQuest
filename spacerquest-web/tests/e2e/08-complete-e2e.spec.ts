/**
 * SpacerQuest v4.0 - Complete End-to-End Sequential Flow (strict)
 *
 * Validates the entire game API surface in one cohesive flow.
 * Uses a fresh user for full isolation.
 *
 * Flow:
 *   1. Auth → health, dev-login, token extraction
 *   2. Character → create, verify PRD starting values
 *   3. Ship → status, all 8 components
 *   4. Economy → buy fuel (price=8), sell fuel (50% proceeds)
 *   5. Navigation → travel status, launch rejection for new char
 *   6. Combat → engage, fire round, retreat
 *   7. Social → topgun (12 categories), leaderboard, directory, battles
 *   8. Edge cases → 401 on protected routes, mission requirements
 */

import { test, expect } from '@playwright/test';
import { API, getAuthToken, ensureCharacter } from './helpers';

test.describe('Complete E2E Flow', () => {
  let token: string;
  let characterName: string;

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request);
    const ts = Date.now().toString();
    characterName = `E${ts}`.slice(0, 15);
    // Create character explicitly so we can verify the 201 response
    const res = await request.post(`${API}/auth/character`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { name: characterName, shipName: `SHP${ts}`.slice(0, 15) },
    });
    if (res.status() !== 201) {
      throw new Error(`Character creation failed: ${res.status()} ${await res.text()}`);
    }
  });

  // ─── 1. Authentication ──────────────────────────────────────────────────────

  test('1.1 GET /health → 200, status ok, version 4.0.0', async ({ request }) => {
    const res = await request.get(`${API}/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.version).toBe('4.0.0');
  });

  test('1.2 GET /auth/status → 200, hasCharacter: true', async ({ request }) => {
    const res = await request.get(`${API}/auth/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.hasCharacter).toBe(true);
    expect(body.character).not.toBeNull();
  });

  // ─── 2. Character ────────────────────────────────────────────────────────────

  test('2.1 GET /api/character → PRD starting state', async ({ request }) => {
    const res = await request.get(`${API}/api/character`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const char = body.character;
    expect(char.name).toBe(characterName);
    expect(char.rank).toBe('LIEUTENANT');
    expect(char.currentSystem).toBe(1);
    expect(char.creditsHigh).toBe(0);
    expect(char.creditsLow).toBe(1000);
    expect(char.battlesWon).toBe(0);
  });

  test('2.2 GET /api/character → ship present with 8 component fields', async ({ request }) => {
    const res = await request.get(`${API}/api/character`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    expect(body.ship).not.toBeNull();
    // Check all 8 component pairs present
    const componentPairs = [
      'hull', 'drive', 'cabin', 'lifeSupport',
      'weapon', 'navigation', 'robotics', 'shield',
    ];
    for (const comp of componentPairs) {
      expect(body.ship).toHaveProperty(`${comp}Strength`);
      expect(body.ship).toHaveProperty(`${comp}Condition`);
    }
  });

  // ─── 3. Ship ─────────────────────────────────────────────────────────────────

  test('3.1 GET /api/ship/status → 8 components with correct names', async ({ request }) => {
    const res = await request.get(`${API}/api/ship/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.components.length).toBe(8);
    const names: string[] = body.components.map((c: any) => c.name);
    for (const n of ['Hull', 'Drives', 'Cabin', 'Life Support', 'Weapons', 'Navigation', 'Robotics', 'Shields']) {
      expect(names).toContain(n);
    }
  });

  test('3.2 ship starts with fuel=0 and specialEquipment=[]', async ({ request }) => {
    const res = await request.get(`${API}/api/ship/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    expect(body.fuel).toBe(0);
    expect(body.specialEquipment.length).toBe(0);
  });

  // ─── 4. Economy ──────────────────────────────────────────────────────────────

  test('4.1 buy 50 fuel → fuelPrice=8, cost=400', async ({ request }) => {
    const res = await request.post(`${API}/api/economy/fuel/buy`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { units: 50 },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.fuelPrice).toBe(8);
    expect(body.cost).toBe(400); // 50 * 8
  });

  test('4.2 ship fuel = 50 after purchase', async ({ request }) => {
    const res = await request.get(`${API}/api/ship/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    expect(body.fuel).toBe(50);
  });

  test('4.3 credits reduced to 600 after buying 50 fuel at 8 cr', async ({ request }) => {
    const res = await request.get(`${API}/api/character`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    const total = body.character.creditsHigh * 10000 + body.character.creditsLow;
    expect(total).toBe(600); // 1000 - 400
  });

  test('4.4 sell 20 fuel → proceeds=80 (4 cr/unit at 50%)', async ({ request }) => {
    const res = await request.post(`${API}/api/economy/fuel/sell`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { units: 20 },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.proceeds).toBe(80); // 20 * 8 * 0.5 = 80
  });

  test('4.5 cargo accept fails (0 pods) → 400', async ({ request }) => {
    const res = await request.post(`${API}/api/economy/cargo/accept`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(400);
  });

  // ─── 5. Navigation ───────────────────────────────────────────────────────────

  test('5.1 travel status → inTransit: false', async ({ request }) => {
    const res = await request.get(`${API}/api/navigation/travel-status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.inTransit).toBe(false);
  });

  test('5.2 launch → 400 (no drives/life support/navigation on new char)', async ({ request }) => {
    const res = await request.post(`${API}/api/navigation/launch`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { destinationSystemId: 2 },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    expect(Array.isArray(body.details)).toBe(true);
  });

  // ─── 6. Combat ───────────────────────────────────────────────────────────────

  test('6.1 combat engage → 200 with encounter boolean', async ({ request }) => {
    const res = await request.post(`${API}/api/combat/engage`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { attack: true },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.encounter).toBe('boolean');
  });

  test('6.2 combat FIRE → 200 with combat round fields', async ({ request }) => {
    const res = await request.post(`${API}/api/combat/action`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { action: 'FIRE', round: 1 },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.playerDamage).toBe('number');
    expect(typeof body.enemyDamage).toBe('number');
    expect(Array.isArray(body.combatLog)).toBe(true);
  });

  test('6.3 combat RETREAT → 200 with retreated + message', async ({ request }) => {
    const res = await request.post(`${API}/api/combat/action`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { action: 'RETREAT' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.retreated).toBe('boolean');
    expect(typeof body.message).toBe('string');
  });

  // ─── 7. Social ───────────────────────────────────────────────────────────────

  test('7.1 topgun → 12 categories, each with name/leader/value', async ({ request }) => {
    const res = await request.get(`${API}/api/social/topgun`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.categories.length).toBe(12);
    for (const cat of body.categories) {
      expect(typeof cat.name).toBe('string');
      expect(typeof cat.leader).toBe('string');
      expect(typeof cat.value).toBe('number');
    }
  });

  test('7.2 leaderboard → scores array, entries have rank/name/score/characterRank', async ({ request }) => {
    const res = await request.get(`${API}/api/social/leaderboard`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.scores)).toBe(true);
    for (const entry of body.scores) {
      expect(typeof entry.rank).toBe('number');
      expect(typeof entry.name).toBe('string');
      expect(typeof entry.score).toBe('number');
      expect(typeof entry.characterRank).toBe('string');
    }
  });

  test('7.3 directory → spacers array, entries have id/name/shipName/rank/alliance/score', async ({ request }) => {
    const res = await request.get(`${API}/api/social/directory`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.spacers)).toBe(true);
    for (const s of body.spacers) {
      expect(s.id).toBeDefined();
      expect(typeof s.name).toBe('string');
      expect(typeof s.shipName).toBe('string');
      expect(typeof s.rank).toBe('string');
      expect(s).toHaveProperty('alliance');
      expect(typeof s.score).toBe('number');
    }
  });

  test('7.4 battles → 200 with battles array', async ({ request }) => {
    const res = await request.get(`${API}/api/social/battles`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.battles)).toBe(true);
  });

  // ─── 8. Edge cases ───────────────────────────────────────────────────────────

  test('8.1 nemesis mission (0 wins) → 400 requiring 500 wins', async ({ request }) => {
    const res = await request.post(`${API}/api/missions/nemesis`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/500/);
  });

  test('8.2 maligna mission (non-conqueror) → 400', async ({ request }) => {
    const res = await request.post(`${API}/api/missions/maligna`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/[Cc]onqueror/);
  });
});
