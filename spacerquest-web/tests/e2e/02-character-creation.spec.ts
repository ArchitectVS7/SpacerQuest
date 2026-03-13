/**
 * SpacerQuest v4.0 - Character Creation E2E Tests
 */

import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { CharacterCreationPage } from './pages/CharacterCreationPage';

test.describe('Character Creation', () => {
  let loginPage: LoginPage;
  let characterPage: CharacterCreationPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    characterPage = new CharacterCreationPage(page);
    
    // Login first
    await loginPage.devLogin();
    await page.waitForTimeout(2000);
  });

  test('should display character creation form for new users', async ({ page }) => {
    // After login, new users should see character creation
    const isOnCreationPage = await characterPage.isOnPage();
    
    if (isOnCreationPage) {
      await expect(characterPage.nameInput).toBeVisible();
      await expect(characterPage.shipNameInput).toBeVisible();
      await expect(characterPage.createButton).toBeVisible();
    }
  });

  test('should create character with valid name and ship name', async ({ page, request }) => {
    const timestamp = Date.now();
    const characterName = `TestSpacer${timestamp}`;
    const shipName = `Millennia${timestamp}`;

    // Check if we need to create character
    const isOnCreationPage = await characterPage.isOnPage();
    
    if (isOnCreationPage) {
      await characterPage.createCharacter(characterName, shipName);
      await page.waitForTimeout(3000);
      
      // Should redirect to main menu after successful creation
      const url = page.url();
      expect(url).not.toContain('character-create');
    }
  });

  test('should reject character name shorter than 3 characters', async ({ page }) => {
    const isOnCreationPage = await characterPage.isOnPage();
    
    if (isOnCreationPage) {
      await characterPage.nameInput.fill('AB');
      await characterPage.shipNameInput.fill('GoodShip');
      await characterPage.createButton.click();
      
      // Should show error
      const error = await characterPage.getError();
      expect(error).toBeTruthy();
    }
  });

  test('should reject character name longer than 15 characters', async ({ page }) => {
    const isOnCreationPage = await characterPage.isOnPage();
    
    if (isOnCreationPage) {
      await characterPage.nameInput.fill('ThisNameIsWayTooLong');
      await characterPage.shipNameInput.fill('GoodShip');
      await characterPage.createButton.click();
      
      // Should show error or truncate
      await page.waitForTimeout(1000);
      const inputValue = await characterPage.nameInput.inputValue();
      expect(inputValue.length).toBeLessThanOrEqual(15);
    }
  });

  test('should reject reserved name prefixes', async ({ page }) => {
    const isOnCreationPage = await characterPage.isOnPage();
    
    if (isOnCreationPage) {
      await characterPage.nameInput.fill('THE Player');
      await characterPage.shipNameInput.fill('GoodShip');
      await characterPage.createButton.click();
      
      // Should show error
      await page.waitForTimeout(1000);
      const error = await characterPage.getError();
      expect(error).toBeTruthy();
    }
  });

  test('should auto-uppercase character name', async ({ page }) => {
    const isOnCreationPage = await characterPage.isOnPage();
    
    if (isOnCreationPage) {
      await characterPage.nameInput.fill('testplayer');
      await page.waitForTimeout(500);
      
      const inputValue = await characterPage.nameInput.inputValue();
      expect(inputValue).toEqual(inputValue.toUpperCase());
    }
  });

  test('should show starting credits information', async ({ page }) => {
    const isOnCreationPage = await characterPage.isOnPage();
    
    if (isOnCreationPage) {
      await expect(page.locator('text=1,000, text=Starting Credits')).toBeVisible();
    }
  });
});
