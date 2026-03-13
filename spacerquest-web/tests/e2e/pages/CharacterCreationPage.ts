/**
 * SpacerQuest v4.0 - Character Creation Page Object
 */

import { Page, Locator } from '@playwright/test';

export class CharacterCreationPage {
  readonly page: Page;
  readonly nameInput: Locator;
  readonly shipNameInput: Locator;
  readonly createButton: Locator;
  readonly errorText: Locator;

  constructor(page: Page) {
    this.page = page;
    this.nameInput = page.locator('input[placeholder*="name"], input[label*="Name"], input[type="text"]').first();
    this.shipNameInput = page.locator('input[placeholder*="ship"], input[label*="Ship"], input[type="text"]').nth(1);
    this.createButton = page.locator('button:has-text("Create"), button:has-text("[C]"), [type="submit"]');
    this.errorText = page.locator('.text-red-500, [class*="error"], text=Error');
  }

  async goto() {
    await this.page.goto('/');
    // Navigate to character creation if needed
    await this.page.waitForSelector('text=CREATE NEW SPACER, text=Character, text=Create');
  }

  async createCharacter(name: string, shipName: string) {
    await this.nameInput.fill(name);
    await this.shipNameInput.fill(shipName);
    await this.createButton.click();
  }

  async waitForSuccess() {
    // Wait for redirect to main menu
    await this.page.waitForURL(/\/\?token=/);
  }

  async getError(): Promise<string | null> {
    const errorVisible = await this.errorText.isVisible().catch(() => false);
    if (errorVisible) {
      return this.errorText.textContent();
    }
    return null;
  }

  async isOnPage(): Promise<boolean> {
    const titleVisible = await this.page.locator('text=CREATE NEW SPACER, text=Character Creation').isVisible().catch(() => false);
    return titleVisible;
  }
}
