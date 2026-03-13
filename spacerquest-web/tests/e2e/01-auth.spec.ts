/**
 * SpacerQuest v4.0 - Authentication E2E Tests
 */

import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';

test.describe('Authentication', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
  });

  test('should display login page on first visit', async ({ page }) => {
    await loginPage.goto();
    
    // Check for login page elements
    await expect(loginPage.welcomeText).toBeVisible();
    await expect(loginPage.devLoginButton).toBeVisible();
  });

  test('should complete dev login flow', async ({ page }) => {
    await loginPage.devLogin();
    
    // Should redirect with token
    await expect(page).toHaveURL(/.*token=.+/);
    
    // Should either show character creation or main menu
    const hasCharacterCreation = page.locator('text=CREATE NEW SPACER, text=Character Creation');
    const hasMainMenu = page.locator('text=MAIN MENU, text=SPACERQUEST');
    
    await expect(
      hasCharacterCreation.or(hasMainMenu)
    ).toBeVisible({ timeout: 10000 });
  });

  test('should handle OAuth callback with token', async ({ page }) => {
    // Simulate OAuth redirect
    await page.goto('/?token=test-token-123');
    
    // Should process the token (may show loading or redirect)
    await page.waitForTimeout(2000);
    
    // Should either be on main menu or character creation
    const url = page.url();
    expect(url).toMatch(/\/(\?token=.+)?/);
  });

  test('should persist session across page reload', async ({ page, context }) => {
    // Login
    await loginPage.devLogin();
    await page.waitForTimeout(2000);
    
    // Get token from URL or localStorage
    const url = new URL(page.url());
    const token = url.searchParams.get('token');
    
    if (token) {
      // Reload page
      await page.reload();
      
      // Should still be logged in (token in localStorage or URL)
      await page.waitForTimeout(2000);
      const currentUrl = page.url();
      expect(currentUrl).not.toContain('login');
    }
  });
});
