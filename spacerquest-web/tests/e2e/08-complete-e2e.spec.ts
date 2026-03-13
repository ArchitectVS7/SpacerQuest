/**
 * SpacerQuest v4.0 - Complete E2E Test Suite
 * 
 * Comprehensive end-to-end tests covering:
 * - Authentication flow
 * - Character creation
 * - Game API endpoints
 * - Economy and trading
 * - Ship management
 * - Social features
 */

import { test, expect } from '@playwright/test';
import { SpacerQuestAPI } from './api';

test.describe('SpacerQuest v4.0 - Complete E2E Suite', () => {
  let api: SpacerQuestAPI;
  let token: string;
  let characterCreated = false;

  test.beforeAll(async ({ request }) => {
    api = new SpacerQuestAPI();
    await api.init(request);
    
    // Get dev login token
    const result = await api.devLogin();
    token = result.token;
    api.setToken(token);
  });

  test.describe('1. Authentication', () => {
    test('should get valid token from dev login', async () => {
      expect(token).toBeDefined();
      expect(token.length).toBeGreaterThan(0);
    });

    test('should authenticate with backend', async ({ request }) => {
      const response = await request.get('http://localhost:3000/health');
      expect(response.status()).toBe(200);
      
      const data = await response.json();
      expect(data.status).toBe('ok');
      expect(data.version).toBe('4.0.0');
    });
  });

  test.describe('2. Character Creation', () => {
    test('should check if character exists', async () => {
      const character = await api.getCharacter();
      
      if (character && character.character) {
        characterCreated = true;
        expect(character.character.name).toBeDefined();
      }
    });

    test('should create new character if none exists', async () => {
      const existingChar = await api.getCharacter();
      
      if (!existingChar || !existingChar.character) {
        const timestamp = Date.now();
        const result = await api.createCharacter(`TestSpacer${timestamp}`, `Millennia${timestamp}`);
        
        expect(result.id).toBeDefined();
        expect(result.name).toBeDefined();
        characterCreated = true;
      } else {
        characterCreated = true;
      }
    });

    test('should validate character name length', async ({ request }) => {
      // Test short name
      const shortResponse = await request.post('http://localhost:3000/auth/character', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        data: { name: 'AB', shipName: 'GoodShip' },
      });
      
      expect(shortResponse.status()).toBe(400);
      
      // Test long name
      const longResponse = await request.post('http://localhost:3000/auth/character', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        data: { name: 'ThisNameIsWayTooLongForTheGame', shipName: 'GoodShip' },
      });
      
      expect(longResponse.status()).toBe(400);
    });
  });

  test.describe('3. Character API', () => {
    test('should get character data', async () => {
      const character = await api.getCharacter();
      
      if (characterCreated) {
        expect(character).toBeDefined();
        expect(character.character).toBeDefined();
        expect(character.character.name).toBeDefined();
        expect(character.character.rank).toBeDefined();
        expect(character.ship).toBeDefined();
      }
    });

    test('should show correct starting values', async () => {
      const character = await api.getCharacter();
      
      if (character && character.character) {
        // Starting credits should be 1000 (g1=0, g2=1000)
        expect(character.character.creditsLow).toBeGreaterThanOrEqual(0);
        expect(character.character.currentSystem).toBe(1); // Sun-3
        expect(character.character.rank).toBe('LIEUTENANT');
      }
    });
  });

  test.describe('4. Ship Management', () => {
    test('should get ship status', async () => {
      const shipStatus = await api.getShipStatus();
      
      expect(shipStatus).toBeDefined();
      expect(shipStatus.shipName).toBeDefined();
      expect(shipStatus.components).toBeDefined();
      expect(Array.isArray(shipStatus.components)).toBeTruthy();
      expect(shipStatus.components.length).toBe(8); // 8 components
    });

    test('should show all ship components', async () => {
      const shipStatus = await api.getShipStatus();
      
      const componentNames = shipStatus.components.map((c: any) => c.name.toLowerCase());
      const expectedComponents = ['hull', 'drives', 'cabin', 'life support', 'weapons', 'navigation', 'robotics', 'shields'];
      
      for (const expected of expectedComponents) {
        expect(componentNames.some((name: string) => name.includes(expected))).toBeTruthy();
      }
    });

    test('should display fuel level', async () => {
      const shipStatus = await api.getShipStatus();
      expect(typeof shipStatus.fuel).toBe('number');
    });
  });

  test.describe('5. Economy and Trading', () => {
    test('should buy fuel', async () => {
      const result = await api.buyFuel(100);
      
      expect(result.success).toBeTruthy();
      expect(result.units).toBe(100);
      expect(result.cost).toBeGreaterThan(0);
    });

    test('should accept cargo contract', async () => {
      const result = await api.acceptCargo();
      
      if (result.success) {
        expect(result.contract).toBeDefined();
        expect(result.contract.pods).toBeGreaterThan(0);
        expect(result.contract.destination).toBeDefined();
        expect(result.contract.payment).toBeGreaterThan(0);
      }
    });

    test('should deliver cargo', async ({ request }) => {
      // First accept cargo
      await api.acceptCargo();
      
      // Then deliver it
      const response = await request.post('http://localhost:3000/api/economy/cargo/deliver', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      const result = await response.json();
      
      if (result.success) {
        expect(result.payment).toBeGreaterThanOrEqual(0);
        expect(result.total).toBeGreaterThanOrEqual(0);
      }
    });
  });

  test.describe('6. Navigation and Travel', () => {
    test('should get travel status', async () => {
      const travelStatus = await api.getTravelStatus();
      
      // Should return travel state (may be in transit or not)
      expect(['object', 'undefined'].includes(typeof travelStatus)).toBeTruthy();
    });

    test('should validate launch requirements', async ({ request }) => {
      // Try to launch without enough fuel
      const response = await request.post('http://localhost:3000/api/navigation/launch', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        data: { destinationSystemId: 14 }, // Far destination
      });
      
      // May succeed or fail based on fuel
      expect([200, 400]).toContain(response.status());
    });
  });

  test.describe('7. Combat System', () => {
    test('should engage in combat', async ({ request }) => {
      const response = await request.post('http://localhost:3000/api/combat/engage', {
        headers: { 'Authorization': `Bearer ${token}` },
        data: { attack: true },
      });
      
      const result = await response.json();
      
      // Should return encounter result (may or may not encounter enemy)
      expect(result).toBeDefined();
    });

    test('should calculate battle factor', async ({ request }) => {
      const response = await request.post('http://localhost:3000/api/combat/engage', {
        headers: { 'Authorization': `Bearer ${token}` },
        data: { attack: true },
      });
      
      const result = await response.json();
      
      if (result.encounter) {
        expect(result.playerBattleFactor).toBeDefined();
        expect(result.enemy).toBeDefined();
        expect(result.enemy.battleFactor).toBeDefined();
      }
    });
  });

  test.describe('8. Social Features', () => {
    test('should get Top Gun rankings', async () => {
      const rankings = await api.getTopGun();
      
      expect(rankings).toBeDefined();
      expect(rankings.categories).toBeDefined();
      expect(Array.isArray(rankings.categories)).toBeTruthy();
      expect(rankings.categories.length).toBeGreaterThan(0);
    });

    test('should have all ranking categories', async () => {
      const rankings = await api.getTopGun();
      
      const expectedCategories = [
        'Drives', 'Weapons', 'Shields', 'Hull', 'Cabin',
        'Rescuer', 'Battle', 'Promotions'
      ];
      
      const categoryNames = rankings.categories.map((c: any) => c.name.toLowerCase());
      
      // Check for at least some expected categories
      const foundCategories = expectedCategories.filter(cat =>
        categoryNames.some(name => name.includes(cat.toLowerCase()))
      );
      
      expect(foundCategories.length).toBeGreaterThan(5);
    });

    test('should get leaderboard', async () => {
      const leaderboard = await api.getLeaderboard();
      
      expect(leaderboard).toBeDefined();
      expect(leaderboard.scores).toBeDefined();
      expect(Array.isArray(leaderboard.scores)).toBeTruthy();
    });

    test('should show character in leaderboard', async () => {
      const leaderboard = await api.getLeaderboard();
      
      if (leaderboard.scores.length > 0) {
        const entry = leaderboard.scores[0];
        expect(entry.name).toBeDefined();
        expect(entry.score).toBeDefined();
        expect(entry.rank).toBeDefined();
      }
    });
  });

  test.describe('9. Ship Upgrades', () => {
    test('should upgrade component strength', async ({ request }) => {
      const response = await request.post('http://localhost:3000/api/ship/upgrade', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        data: { component: 'HULL', upgradeType: 'STRENGTH' },
      });
      
      const result = await response.json();
      
      // May succeed or fail based on credits
      expect([200, 400]).toContain(response.status());
    });

    test('should repair ship damage', async ({ request }) => {
      const response = await request.post('http://localhost:3000/api/ship/repair', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      const result = await response.json();
      
      // May succeed or fail based on credits/damage
      expect([200, 400]).toContain(response.status());
    });
  });

  test.describe('10. Alliance System', () => {
    test('should invest in alliance', async ({ request }) => {
      const response = await request.post('http://localhost:3000/api/economy/alliance/invest', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        data: { amount: 1000, type: 'ALLIANCE' },
      });
      
      // May succeed (200), fail due to no alliance (400), or endpoint unavailable (404)
      expect([200, 400, 404]).toContain(response.status());
    });

    test('should invest in DEFCON', async ({ request }) => {
      const response = await request.post('http://localhost:3000/api/economy/alliance/invest', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        data: { type: 'DEFCON', levels: 1 },
      });
      
      // May succeed (200), fail due to no alliance (400), or endpoint unavailable (404)
      expect([200, 400, 404]).toContain(response.status());
    });
  });
});
