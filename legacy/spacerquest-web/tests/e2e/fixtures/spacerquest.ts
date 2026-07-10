/**
 * SpacerQuest v4.0 - E2E Test Fixtures
 * 
 * Extended Playwright fixtures with SpacerQuest-specific helpers
 */

import { test as base, expect } from '@playwright/test';

export interface SpacerQuestFixtures {
  testAccount: {
    email: string;
    displayName: string;
  };
};

export const test = base.extend<SpacerQuestFixtures>({
  testAccount: async ({}, use) => {
    // Generate unique test account
    const timestamp = Date.now();
    const testAccount = {
      email: `test-${timestamp}@spacerquest.test`,
      displayName: `TestSpacer${timestamp}`,
    };
    
    await use(testAccount);
  },
});

export { expect };
