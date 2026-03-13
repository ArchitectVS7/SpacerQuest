/**
 * SpacerQuest v4.0 - Main Game Navigation E2E Tests
 */

import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { MainGamePage } from './pages/MainGamePage';
import { SpacerQuestAPI } from './api';

test.describe('Main Game Navigation', () => {
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
  });

  test('should display main menu after login and character setup', async ({ page }) => {
    // Check if we need to create a character first
    const isOnCharacterCreation = await page.locator('text=CREATE NEW SPACER, text=Character Creation').isVisible().catch(() => false);
    
    if (isOnCharacterCreation) {
      // Create a test character via API
      const timestamp = Date.now();
      await api.createCharacter(`TestNav${timestamp}`, `Ship${timestamp}`);
      await page.reload();
      await page.waitForTimeout(2000);
    }
    
    // Now wait for terminal or main menu
    await mainGame.waitForTerminal();
    await mainGame.waitForMainMenu();
    
    // Check for main menu elements
    const terminalText = await mainGame.getTerminalText();
    expect(terminalText).toContain('MAIN MENU');
    expect(terminalText).toContain('SPACERQUEST');
  });

  test('should show character info on main menu', async ({ page }) => {
    // Setup character if needed
    const isOnCharacterCreation = await page.locator('text=CREATE NEW SPACER').isVisible().catch(() => false);
    if (isOnCharacterCreation) {
      const timestamp = Date.now();
      await api.createCharacter(`TestInfo${timestamp}`, `Ship${timestamp}`);
      await page.reload();
      await page.waitForTimeout(2000);
    }
    
    await mainGame.waitForTerminal();
    const terminalText = await mainGame.getTerminalText();
    
    // Should show character name, ship, location, credits
    expect(terminalText).toMatch(/Spacer:|Captain:|Name:/i);
    expect(terminalText).toMatch(/Ship:/i);
    expect(terminalText).toMatch(/Location:|System:/i);
    expect(terminalText).toMatch(/Credits:/i);
  });

  test('should navigate to Bank screen', async ({ page }) => {
    // Setup character if needed
    const isOnCharacterCreation = await page.locator('text=CREATE NEW SPACER').isVisible().catch(() => false);
    if (isOnCharacterCreation) {
      const timestamp = Date.now();
      await api.createCharacter(`TestBank${timestamp}`, `Ship${timestamp}`);
      await page.reload();
      await page.waitForTimeout(2000);
    }
    
    await mainGame.waitForTerminal();
    await mainGame.waitForMainMenu();
    await mainGame.goToBank();
    await page.waitForTimeout(1000);
    
    const terminalText = await mainGame.getTerminalText();
    expect(terminalText).toMatch(/BANK|Bank/i);
  });

  test('should navigate to Shipyard screen', async ({ page }) => {
    // Setup character if needed
    const isOnCharacterCreation = await page.locator('text=CREATE NEW SPACER').isVisible().catch(() => false);
    if (isOnCharacterCreation) {
      const timestamp = Date.now();
      await api.createCharacter(`TestShip${timestamp}`, `Ship${timestamp}`);
      await page.reload();
      await page.waitForTimeout(2000);
    }
    
    await mainGame.waitForTerminal();
    await mainGame.waitForMainMenu();
    await mainGame.goToShipyard();
    await page.waitForTimeout(1000);
    
    const terminalText = await mainGame.getTerminalText();
    expect(terminalText).toMatch(/SHIPYARD|Shipyard/i);
  });

  test('should navigate to Pub screen', async ({ page }) => {
    // Setup character if needed
    const isOnCharacterCreation = await page.locator('text=CREATE NEW SPACER').isVisible().catch(() => false);
    if (isOnCharacterCreation) {
      const timestamp = Date.now();
      await api.createCharacter(`TestPub${timestamp}`, `Ship${timestamp}`);
      await page.reload();
      await page.waitForTimeout(2000);
    }
    
    await mainGame.waitForTerminal();
    await mainGame.waitForMainMenu();
    await mainGame.goToPub();
    await page.waitForTimeout(1000);
    
    const terminalText = await mainGame.getTerminalText();
    expect(terminalText).toMatch(/PUB|Pub/i);
  });

  test('should navigate to Traders screen', async ({ page }) => {
    // Setup character if needed
    const isOnCharacterCreation = await page.locator('text=CREATE NEW SPACER').isVisible().catch(() => false);
    if (isOnCharacterCreation) {
      const timestamp = Date.now();
      await api.createCharacter(`TestTrade${timestamp}`, `Ship${timestamp}`);
      await page.reload();
      await page.waitForTimeout(2000);
    }
    
    await mainGame.waitForTerminal();
    await mainGame.waitForMainMenu();
    await mainGame.goToTraders();
    await page.waitForTimeout(1000);
    
    const terminalText = await mainGame.getTerminalText();
    expect(terminalText).toMatch(/TRADERS|Traders/i);
  });

  test('should show valid commands help', async ({ page }) => {
    // Setup character if needed
    const isOnCharacterCreation = await page.locator('text=CREATE NEW SPACER').isVisible().catch(() => false);
    if (isOnCharacterCreation) {
      const timestamp = Date.now();
      await api.createCharacter(`TestHelp${timestamp}`, `Ship${timestamp}`);
      await page.reload();
      await page.waitForTimeout(2000);
    }
    
    await mainGame.waitForTerminal();
    await mainGame.waitForMainMenu();
    
    const terminalText = await mainGame.getTerminalText();
    
    // Should show command options
    expect(terminalText).toMatch(/\[B\].*ank/i);
    expect(terminalText).toMatch(/\[S\].*hip/i);
    expect(terminalText).toMatch(/\[P\].*ub/i);
    expect(terminalText).toMatch(/\[T\].*rad/i);
  });
});
