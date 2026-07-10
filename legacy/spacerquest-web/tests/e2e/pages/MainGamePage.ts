/**
 * SpacerQuest v4.0 - Main Game Page Object (Terminal)
 */

import { Page, Locator } from '@playwright/test';

export class MainGamePage {
  readonly page: Page;
  readonly terminal: Locator;
  readonly terminalOutput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.terminal = page.locator('.terminal-container, .xterm, [data-testid="terminal"]');
    this.terminalOutput = page.locator('.xterm-screen, .xterm-rows, .terminal-output');
  }

  async waitForTerminal() {
    await this.terminal.waitFor({ timeout: 10000 });
  }

  async waitForMainMenu() {
    await this.page.waitForSelector('text=MAIN MENU, text=Main Menu, text=SPACERQUEST', {
      timeout: 10000,
    });
  }

  async getTerminalText(): Promise<string> {
    return this.page.locator('.xterm-screen').textContent() || '';
  }

  async pressKey(key: string) {
    await this.page.keyboard.press(key);
  }

  async typeText(text: string) {
    await this.page.keyboard.type(text);
  }

  // Screen navigation commands
  async goToBank() {
    await this.pressKey('B');
  }

  async goToShipyard() {
    await this.pressKey('S');
  }

  async goToPub() {
    await this.pressKey('P');
  }

  async goToTraders() {
    await this.pressKey('T');
  }

  async returnToMainMenu() {
    await this.pressKey('M');
    await this.pressKey('R');
  }

  async waitForScreen(screenName: string) {
    await this.page.waitForSelector(`text=${screenName}`, { timeout: 5000 });
  }

  async isOnMainMenu(): Promise<boolean> {
    const text = await this.getTerminalText();
    return text.includes('MAIN MENU') || text.includes('Main Menu');
  }

  async isOnScreen(screenName: string): Promise<boolean> {
    const text = await this.getTerminalText();
    return text.includes(screenName.toUpperCase()) || text.includes(screenName);
  }
}
