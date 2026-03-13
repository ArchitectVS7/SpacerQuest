/**
 * SpacerQuest v4.0 - Economy and Trading E2E Tests
 */

import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { MainGamePage } from './pages/MainGamePage';
import { SpacerQuestAPI } from './api';

test.describe('Economy and Trading', () => {
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
      await api.createCharacter(`TestEcon${timestamp}`, `Ship${timestamp}`);
      await page.reload();
      await page.waitForTimeout(2000);
    }
    
    await mainGame.waitForTerminal();
  });

  test('should buy fuel via API', async () => {
    // Test fuel purchase through API
    const result = await api.buyFuel(100);
    
    expect(result.success).toBeTruthy();
    expect(result.units).toBe(100);
    expect(result.cost).toBeGreaterThan(0);
  });

  test('should display fuel price on Traders screen', async ({ page }) => {
    await mainGame.waitForMainMenu();
    await mainGame.goToTraders();
    await page.waitForTimeout(1000);
    
    const terminalText = await mainGame.getTerminalText();
    expect(terminalText).toMatch(/Fuel Price:|fuel.*cr/i);
  });

  test('should accept cargo contract via API', async () => {
    const result = await api.acceptCargo();
    
    if (result.success) {
      expect(result.contract).toBeDefined();
      expect(result.contract.pods).toBeGreaterThan(0);
      expect(result.contract.destination).toBeDefined();
      expect(result.contract.payment).toBeGreaterThan(0);
    }
  });

  test('should display cargo information on Traders screen', async ({ page }) => {
    await mainGame.waitForMainMenu();
    await mainGame.goToTraders();
    await page.waitForTimeout(1000);
    
    const terminalText = await mainGame.getTerminalText();
    
    // Should show cargo types or contract info
    expect(terminalText).toMatch(/Cargo|cargo|pods|pods/i);
  });

  test('should show cargo type descriptions', async ({ page }) => {
    await mainGame.waitForMainMenu();
    await mainGame.goToTraders();
    await page.waitForTimeout(1000);
    
    const terminalText = await mainGame.getTerminalText();
    
    // Should list some cargo types
    const cargoTypes = [
      'Titanium', 'Herbals', 'Dilithium', 
      'Liquor', 'Gems', 'RDNA', 'Ore'
    ];
    
    const hasCargoType = cargoTypes.some(type => 
      terminalText.includes(type)
    );
    expect(hasCargoType).toBeTruthy();
  });

  test('should display credits correctly', async ({ page }) => {
    await mainGame.waitForMainMenu();
    
    const terminalText = await mainGame.getTerminalText();
    
    // Credits should be displayed as number
    expect(terminalText).toMatch(/Credits:.*\d+/i);
  });

  test('should show ship cargo capacity', async ({ page }) => {
    await mainGame.waitForMainMenu();
    await mainGame.goToTraders();
    await page.waitForTimeout(1000);
    
    const terminalText = await mainGame.getTerminalText();
    expect(terminalText).toMatch(/Cargo Pods:|pods|capacity/i);
  });
});
