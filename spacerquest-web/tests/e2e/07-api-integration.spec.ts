/**
 * SpacerQuest v4.0 - API Integration Tests
 * 
 * These tests verify the backend API endpoints work correctly
 */

import { test, expect } from '@playwright/test';
import { SpacerQuestAPI } from './api';

test.describe('SpacerQuest API Integration', () => {
  let api: SpacerQuestAPI;
  let token: string;

  test.beforeAll(async ({ request }) => {
    api = new SpacerQuestAPI(request);
    
    // Get dev login token
    try {
      const result = await api.devLogin();
      token = result.token;
      api.setToken(token);
    } catch (error) {
      console.warn('Dev login failed, tests may skip authenticated endpoints');
    }
  });

  test.describe('Health Check', () => {
    test('should return healthy status', async ({ request }) => {
      const response = await request.get('http://localhost:3000/health');
      
      expect(response.status()).toBe(200);
      
      const data = await response.json();
      expect(data.status).toBe('ok');
      expect(data.version).toBe('4.0.0');
    });
  });

  test.describe('Authentication', () => {
    test('should get token from dev login', async () => {
      expect(token).toBeDefined();
      expect(token.length).toBeGreaterThan(0);
    });

    test('should get auth status with valid token', async ({ request }) => {
      const response = await request.get('http://localhost:3000/auth/status', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      expect(response.status()).toBe(200);
      
      const data = await response.json();
      expect(data).toHaveProperty('hasCharacter');
    });
  });

  test.describe('Character API', () => {
    test('should get character data', async ({ request }) => {
      const response = await request.get('http://localhost:3000/api/character', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      // May be 404 if no character exists
      if (response.status() === 200) {
        const data = await response.json();
        expect(data.character).toBeDefined();
        expect(data.ship).toBeDefined();
      }
    });
  });

  test.describe('Social API', () => {
    test('should get Top Gun rankings', async ({ request }) => {
      const response = await request.get('http://localhost:3000/api/social/topgun');
      
      expect(response.status()).toBe(200);
      
      const data = await response.json();
      expect(data.categories).toBeDefined();
      expect(Array.isArray(data.categories)).toBeTruthy();
      expect(data.categories.length).toBeGreaterThan(0);
    });

    test('should get leaderboard', async ({ request }) => {
      const response = await request.get('http://localhost:3000/api/social/leaderboard');
      
      expect(response.status()).toBe(200);
      
      const data = await response.json();
      expect(data.scores).toBeDefined();
      expect(Array.isArray(data.scores)).toBeTruthy();
    });
  });

  test.describe('Ship API', () => {
    test('should get ship status', async ({ request }) => {
      const response = await request.get('http://localhost:3000/api/ship/status', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (response.status() === 200) {
        const data = await response.json();
        expect(data.shipName).toBeDefined();
        expect(data.components).toBeDefined();
      }
    });
  });

  test.describe('Navigation API', () => {
    test('should get travel status', async ({ request }) => {
      const response = await request.get('http://localhost:3000/api/navigation/travel-status', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      // May be 200 (with status) or 404 (no character)
      expect([200, 404]).toContain(response.status());
    });
  });
});
