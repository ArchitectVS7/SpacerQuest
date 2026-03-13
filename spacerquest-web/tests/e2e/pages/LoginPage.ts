/**
 * SpacerQuest v4.0 - Login Page Object
 */

import { Page, Locator } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly loginButton: Locator;
  readonly devLoginButton: Locator;
  readonly welcomeText: Locator;

  constructor(page: Page) {
    this.page = page;
    this.loginButton = page.locator('button:has-text("Login")');
    this.devLoginButton = page.locator('button:has-text("Development Login"), button:has-text("[D]"), [data-testid="dev-login"]');
    this.welcomeText = page.locator('text=SpacerQuest');
  }

  async goto() {
    await this.page.goto('/');
  }

  async devLogin() {
    await this.goto();
    // Click dev login button or navigate directly to dev login
    await this.page.goto('/auth/dev-login');
    await this.page.waitForURL(/\/\?token=/);
  }

  async waitForLoginSuccess() {
    // Wait for redirect to main menu or terminal
    await this.page.waitForSelector('.terminal-container, #terminal, [data-testid="terminal"], text=Main Menu, text=SPACER', {
      timeout: 10000,
    });
  }

  async isLoggedIn(): Promise<boolean> {
    const url = this.page.url();
    return url.includes('?token=') || !url.includes('login');
  }
}
