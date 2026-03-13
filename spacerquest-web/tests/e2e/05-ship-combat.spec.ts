/**
 * SpacerQuest v4.0 - Ship and Combat E2E Tests
 */

import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { MainGamePage } from './pages/MainGamePage';
import { SpacerQuestAPI } from './api';

test.describe('Ship and Combat', () => {
  let loginPage: LoginPage;
  let mainGame: MainGamePage;
  let api: SpacerQuestAPI;

  test.beforeEach(async ({ page, request }) => {
    loginPage = new LoginPage(page);
    mainGame = new MainGamePage(page);
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
    
    // Setup character if needed
    const isOnCharacterCreation = await page.locator('text=CREATE NEW SPACER').isVisible().catch(() => false);
    if (isOnCharacterCreation) {
      const timestamp = Date.now();
      await api.createCharacter(`TestShip${timestamp}`, `Ship${timestamp}`);
      await page.reload();
      await page.waitForTimeout(2000);
    }
    
    await mainGame.waitForTerminal();
  });

  test('should display ship status via API', async () => {
    const shipStatus = await api.getShipStatus();
    
    expect(shipStatus).toBeDefined();
    expect(shipStatus.shipName).toBeDefined();
    expect(shipStatus.components).toBeDefined();
    expect(Array.isArray(shipStatus.components)).toBeTruthy();
  });

  test('should show component status on Shipyard screen', async ({ page }) => {
    await mainGame.waitForMainMenu();
    await mainGame.goToShipyard();
    await page.waitForTimeout(1000);
    
    const terminalText = await mainGame.getTerminalText();
    
    // Should show component names
    const components = [
      'Hull', 'Drives', 'Cabin', 'Life Support',
      'Weapons', 'Navigation', 'Robotics', 'Shields'
    ];
    
    const hasComponent = components.some(comp => 
      terminalText.includes(comp)
    );
    expect(hasComponent).toBeTruthy();
  });

  test('should display component strength and condition', async ({ page }) => {
    await mainGame.waitForMainMenu();
    await mainGame.goToShipyard();
    await page.waitForTimeout(1000);
    
    const terminalText = await mainGame.getTerminalText();
    
    // Should show STR and COND headers or values
    expect(terminalText).toMatch(/STR|Strength|COND|Condition/i);
  });

  test('should show upgrade options on Shipyard screen', async ({ page }) => {
    await mainGame.waitForMainMenu();
    await mainGame.goToShipyard();
    await page.waitForTimeout(1000);
    
    const terminalText = await mainGame.getTerminalText();
    expect(terminalText).toMatch(/Upgrade|upgrade|\[U\]/i);
  });

  test('should show repair options on Shipyard screen', async ({ page }) => {
    await mainGame.waitForMainMenu();
    await mainGame.goToShipyard();
    await page.waitForTimeout(1000);
    
    const terminalText = await mainGame.getTerminalText();
    expect(terminalText).toMatch(/Repair|repair|\[R\]/i);
  });

  test('should display ship fuel level', async () => {
    const shipStatus = await api.getShipStatus();
    
    expect(shipStatus.fuel).toBeDefined();
    expect(typeof shipStatus.fuel).toBe('number');
  });

  test('should display special equipment if owned', async () => {
    const shipStatus = await api.getShipStatus();
    
    if (shipStatus.specialEquipment && shipStatus.specialEquipment.length > 0) {
      expect(Array.isArray(shipStatus.specialEquipment)).toBeTruthy();
    }
  });

  test('should handle combat engage via API', async ({ request }) => {
    // Test combat engagement endpoint
    const response = await request.post('http://localhost:3000/api/combat/engage', {
      headers: api.token ? { 'Authorization': `Bearer ${api.token}` } : {},
      data: { attack: true },
    });
    
    const result = await response.json();
    
    // Should return encounter result (may or may not encounter enemy)
    expect(result).toBeDefined();
  });

  test('should show battle factor in combat', async ({ request }) => {
    const response = await request.post('http://localhost:3000/api/combat/engage', {
      headers: api.token ? { 'Authorization': `Bearer ${api.token}` } : {},
      data: { attack: true },
    });
    
    const result = await response.json();
    
    if (result.encounter) {
      expect(result.playerBattleFactor).toBeDefined();
      expect(result.enemy).toBeDefined();
    }
  });
});
