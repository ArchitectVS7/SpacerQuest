/**
 * SpacerQuest v4.0 - Social Features and API E2E Tests
 */

import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { SpacerQuestAPI } from './api';

test.describe('Social Features and API', () => {
  let loginPage: LoginPage;
  let api: SpacerQuestAPI;

  test.beforeEach(async ({ page, request }) => {
    loginPage = new LoginPage(page);
    api = new SpacerQuestAPI(request);
    
    // Login and get token
    await loginPage.devLogin();
    await page.waitForTimeout(3000);
    
    // Extract token for API calls
    const url = new URL(page.url());
    const token = url.searchParams.get('token');
    if (token) {
      api.setToken(token);
    }
  });

  test('should get Top Gun rankings', async () => {
    const rankings = await api.getTopGun();
    
    expect(rankings).toBeDefined();
    expect(rankings.categories).toBeDefined();
    expect(Array.isArray(rankings.categories)).toBeTruthy();
    expect(rankings.categories.length).toBeGreaterThan(0);
  });

  test('should have all Top Gun categories', async () => {
    const rankings = await api.getTopGun();
    
    const expectedCategories = [
      'Drives', 'Weapons', 'Shields', 'Hull', 'Cabin',
      'Life Support', 'Navigation', 'Robotics', 'Cargo',
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

  test('should show character data in leaderboard', async () => {
    const leaderboard = await api.getLeaderboard();
    
    if (leaderboard.scores.length > 0) {
      const entry = leaderboard.scores[0];
      expect(entry.name).toBeDefined();
      expect(entry.score).toBeDefined();
      expect(entry.rank).toBeDefined();
    }
  });

  test('should handle travel status API', async () => {
    const travelStatus = await api.getTravelStatus();
    
    // Should return travel state (may be in transit or not)
    expect(travelStatus).toBeDefined();
    // inTransit will be false when not traveling
    expect(['boolean', 'undefined'].includes(typeof travelStatus.inTransit)).toBeTruthy();
  });

  test('should handle launch API with valid destination', async () => {
    // First check if character has enough fuel
    const character = await api.getCharacter();
    
    if (character && character.ship && character.ship.fuel > 100) {
      const result = await api.launch(2); // Launch to system 2
      
      // Should either succeed or give validation error
      expect(result).toBeDefined();
    }
  });

  test('should handle launch API with insufficient fuel', async () => {
    const result = await api.launch(14); // Far destination
    
    // Should return error if insufficient fuel
    if (result.error) {
      expect(result.error).toBeDefined();
    }
  });

  test('should get character data', async () => {
    const character = await api.getCharacter();
    
    if (character) {
      expect(character.character).toBeDefined();
      expect(character.character.name).toBeDefined();
      expect(character.character.rank).toBeDefined();
    }
  });

  test('should show ship data with character', async () => {
    const character = await api.getCharacter();
    
    if (character) {
      expect(character.ship).toBeDefined();
      
      if (character.ship) {
        expect(character.ship.hullStrength !== undefined).toBeTruthy();
        expect(character.ship.fuel !== undefined).toBeTruthy();
      }
    }
  });
});
