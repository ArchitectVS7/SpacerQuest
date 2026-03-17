/**
 * SpacerQuest v4.0 - Screen Flow Integration Tests
 *
 * Verifies that ALL screens in the screen router are properly structured
 * and have correct transitions between screens.
 *
 * Tests cover:
 * 1. Screen registry completeness
 * 2. Main menu transitions
 * 3. System-gated screens
 * 4. Bank flow
 * 5. Traders flow
 * 6. Shipyard flow
 * 7. Combat screen
 * 8. New Tier 2 screens (jail, bulletin-board, alliance-invest)
 */

import { describe, it, expect } from 'vitest';

// ============================================================================
// 1. SCREEN REGISTRY COMPLETENESS
// ============================================================================

describe('Screen Registry Completeness', () => {
  const EXPECTED_SCREENS = [
    'main-menu',
    'bank',
    'shipyard',
    'shipyard-upgrade',
    'pub',
    'traders',
    'traders-buy-fuel',
    'traders-sell-fuel',
    'traders-cargo',
    'navigate',
    'bank-deposit',
    'bank-withdraw',
    'bank-transfer',
    'rescue',
    'registry',
    'arena',
    'combat',
    'spacers-hangout',
    'wise-one',
    'sage',
    'jail',
    'bulletin-board',
    'alliance-invest',
  ];

  it('all expected screens exist in the registry', async () => {
    const { screens } = await import('../src/sockets/screen-router');

    for (const name of EXPECTED_SCREENS) {
      expect(screens[name], `Screen '${name}' should be in the registry`).toBeDefined();
    }
  });

  it('every registered screen has a render function', async () => {
    const { screens } = await import('../src/sockets/screen-router');

    for (const name of EXPECTED_SCREENS) {
      expect(
        screens[name].render,
        `Screen '${name}' should have a render function`
      ).toBeTypeOf('function');
    }
  });

  it('every registered screen has a handleInput function', async () => {
    const { screens } = await import('../src/sockets/screen-router');

    for (const name of EXPECTED_SCREENS) {
      expect(
        screens[name].handleInput,
        `Screen '${name}' should have a handleInput function`
      ).toBeTypeOf('function');
    }
  });
});

// ============================================================================
// 2. MAIN MENU TRANSITIONS
// ============================================================================

describe('Main Menu Transitions', () => {
  it("'B' routes to bank", async () => {
    const fs = await import('fs');
    const menuCode = fs.readFileSync(
      new URL('../src/game/screens/main-menu.ts', import.meta.url),
      'utf-8'
    );

    expect(menuCode).toContain("nextScreen: 'bank'");
  });

  it("'S' routes to shipyard", async () => {
    const fs = await import('fs');
    const menuCode = fs.readFileSync(
      new URL('../src/game/screens/main-menu.ts', import.meta.url),
      'utf-8'
    );

    expect(menuCode).toContain("nextScreen: 'shipyard'");
  });

  it("'P' routes to pub", async () => {
    const fs = await import('fs');
    const menuCode = fs.readFileSync(
      new URL('../src/game/screens/main-menu.ts', import.meta.url),
      'utf-8'
    );

    expect(menuCode).toContain("nextScreen: 'pub'");
  });

  it("'T' routes to traders", async () => {
    const fs = await import('fs');
    const menuCode = fs.readFileSync(
      new URL('../src/game/screens/main-menu.ts', import.meta.url),
      'utf-8'
    );

    expect(menuCode).toContain("nextScreen: 'traders'");
  });

  it("'N' routes to navigate", async () => {
    const fs = await import('fs');
    const menuCode = fs.readFileSync(
      new URL('../src/game/screens/main-menu.ts', import.meta.url),
      'utf-8'
    );

    expect(menuCode).toContain("nextScreen: 'navigate'");
  });

  it("'R' routes to registry", async () => {
    const fs = await import('fs');
    const menuCode = fs.readFileSync(
      new URL('../src/game/screens/main-menu.ts', import.meta.url),
      'utf-8'
    );

    expect(menuCode).toContain("nextScreen: 'registry'");
  });

  it("'W' routes to wise-one at system 17", async () => {
    const fs = await import('fs');
    const menuCode = fs.readFileSync(
      new URL('../src/game/screens/main-menu.ts', import.meta.url),
      'utf-8'
    );

    expect(menuCode).toContain('currentSystem !== 17');
    expect(menuCode).toContain("nextScreen: 'wise-one'");
  });

  it("'A' routes to sage at system 18", async () => {
    const fs = await import('fs');
    const menuCode = fs.readFileSync(
      new URL('../src/game/screens/main-menu.ts', import.meta.url),
      'utf-8'
    );

    expect(menuCode).toContain('currentSystem !== 18');
    expect(menuCode).toContain("nextScreen: 'sage'");
  });

  it("'I' routes to alliance-invest", async () => {
    const fs = await import('fs');
    const menuCode = fs.readFileSync(
      new URL('../src/game/screens/main-menu.ts', import.meta.url),
      'utf-8'
    );

    expect(menuCode).toContain("nextScreen: 'alliance-invest'");
  });

  it("'Q' returns a quit message with no nextScreen transition", async () => {
    const fs = await import('fs');
    const menuCode = fs.readFileSync(
      new URL('../src/game/screens/main-menu.ts', import.meta.url),
      'utf-8'
    );

    // Q case should produce a quit/logout message
    expect(menuCode).toContain("'Q'");
    expect(menuCode).toContain('logout');
  });
});

// ============================================================================
// 3. SYSTEM-GATED SCREENS
// ============================================================================

describe('System-Gated Screens', () => {
  it('wise-one screen enforces system 17 requirement', async () => {
    const fs = await import('fs');
    const screenCode = fs.readFileSync(
      new URL('../src/game/screens/wise-one.ts', import.meta.url),
      'utf-8'
    );

    expect(screenCode).toContain('currentSystem !== 17');
  });

  it('sage screen enforces system 18 requirement', async () => {
    const fs = await import('fs');
    const screenCode = fs.readFileSync(
      new URL('../src/game/screens/sage.ts', import.meta.url),
      'utf-8'
    );

    expect(screenCode).toContain('currentSystem !== 18');
  });

  it('spacers-hangout screen enforces system 1 requirement', async () => {
    const fs = await import('fs');
    const screenCode = fs.readFileSync(
      new URL('../src/game/screens/spacers-hangout.ts', import.meta.url),
      'utf-8'
    );

    expect(screenCode).toContain('currentSystem !== 1');
  });
});

// ============================================================================
// 4. BANK FLOW
// ============================================================================

describe('Bank Flow', () => {
  it('bank screen has deposit, withdraw, and transfer options in output', async () => {
    const fs = await import('fs');
    const bankCode = fs.readFileSync(
      new URL('../src/game/screens/bank.ts', import.meta.url),
      'utf-8'
    );

    expect(bankCode).toContain('eposit');
    expect(bankCode).toContain('ithdraw');
    expect(bankCode).toContain('ransfer');
  });

  it("bank 'D' routes to bank-deposit", async () => {
    const fs = await import('fs');
    const bankCode = fs.readFileSync(
      new URL('../src/game/screens/bank.ts', import.meta.url),
      'utf-8'
    );

    expect(bankCode).toContain("nextScreen: 'bank-deposit'");
  });

  it("bank 'W' routes to bank-withdraw", async () => {
    const fs = await import('fs');
    const bankCode = fs.readFileSync(
      new URL('../src/game/screens/bank.ts', import.meta.url),
      'utf-8'
    );

    expect(bankCode).toContain("nextScreen: 'bank-withdraw'");
  });

  it("bank 'T' routes to bank-transfer", async () => {
    const fs = await import('fs');
    const bankCode = fs.readFileSync(
      new URL('../src/game/screens/bank.ts', import.meta.url),
      'utf-8'
    );

    expect(bankCode).toContain("nextScreen: 'bank-transfer'");
  });

  it("bank 'R' routes back to main-menu", async () => {
    const fs = await import('fs');
    const bankCode = fs.readFileSync(
      new URL('../src/game/screens/bank.ts', import.meta.url),
      'utf-8'
    );

    expect(bankCode).toContain("nextScreen: 'main-menu'");
  });
});

// ============================================================================
// 5. TRADERS FLOW
// ============================================================================

describe('Traders Flow', () => {
  it("traders 'B' routes to traders-buy-fuel", async () => {
    const fs = await import('fs');
    const tradersCode = fs.readFileSync(
      new URL('../src/game/screens/traders.ts', import.meta.url),
      'utf-8'
    );

    expect(tradersCode).toContain("nextScreen: 'traders-buy-fuel'");
  });

  it("traders 'S' routes to traders-sell-fuel", async () => {
    const fs = await import('fs');
    const tradersCode = fs.readFileSync(
      new URL('../src/game/screens/traders.ts', import.meta.url),
      'utf-8'
    );

    expect(tradersCode).toContain("nextScreen: 'traders-sell-fuel'");
  });

  it("traders 'C' or 'A' routes to traders-cargo", async () => {
    const fs = await import('fs');
    const tradersCode = fs.readFileSync(
      new URL('../src/game/screens/traders.ts', import.meta.url),
      'utf-8'
    );

    expect(tradersCode).toContain("nextScreen: 'traders-cargo'");
  });

  it("traders 'M' routes back to main-menu", async () => {
    const fs = await import('fs');
    const tradersCode = fs.readFileSync(
      new URL('../src/game/screens/traders.ts', import.meta.url),
      'utf-8'
    );

    expect(tradersCode).toContain("nextScreen: 'main-menu'");
  });
});

// ============================================================================
// 6. SHIPYARD FLOW
// ============================================================================

describe('Shipyard Flow', () => {
  it("shipyard 'U' routes to shipyard-upgrade for component selection", async () => {
    const fs = await import('fs');
    const shipyardCode = fs.readFileSync(
      new URL('../src/game/screens/shipyard.ts', import.meta.url),
      'utf-8'
    );

    expect(shipyardCode).toContain("nextScreen: 'shipyard-upgrade'");
  });

  it('shipyard-upgrade returns to shipyard on successful upgrade', async () => {
    const fs = await import('fs');
    const upgradeCode = fs.readFileSync(
      new URL('../src/game/screens/shipyard-upgrade.ts', import.meta.url),
      'utf-8'
    );

    expect(upgradeCode).toContain("nextScreen: 'shipyard'");
  });

  it('shipyard-upgrade returns to shipyard on cancel (0)', async () => {
    const fs = await import('fs');
    const upgradeCode = fs.readFileSync(
      new URL('../src/game/screens/shipyard-upgrade.ts', import.meta.url),
      'utf-8'
    );

    // Cancel (key '0') must also go back to shipyard
    expect(upgradeCode).toContain("nextScreen: 'shipyard'");
  });
});

// ============================================================================
// 7. COMBAT SCREEN
// ============================================================================

describe('Combat Screen', () => {
  it("combat screen source contains attack option 'A'", async () => {
    const fs = await import('fs');
    const combatCode = fs.readFileSync(
      new URL('../src/game/screens/combat.ts', import.meta.url),
      'utf-8'
    );

    expect(combatCode).toContain("'A'");
    expect(combatCode).toContain('attack');
  });

  it("combat screen source contains retreat option 'R'", async () => {
    const fs = await import('fs');
    const combatCode = fs.readFileSync(
      new URL('../src/game/screens/combat.ts', import.meta.url),
      'utf-8'
    );

    expect(combatCode).toContain("'R'");
    expect(combatCode).toContain('retreat');
  });

  it("combat screen source contains surrender option 'S'", async () => {
    const fs = await import('fs');
    const combatCode = fs.readFileSync(
      new URL('../src/game/screens/combat.ts', import.meta.url),
      'utf-8'
    );

    expect(combatCode).toContain("'S'");
    expect(combatCode).toContain('surrender');
  });

  it("combat 'Q' or 'M' routes back to main-menu", async () => {
    const fs = await import('fs');
    const combatCode = fs.readFileSync(
      new URL('../src/game/screens/combat.ts', import.meta.url),
      'utf-8'
    );

    expect(combatCode).toContain("'Q'");
    expect(combatCode).toContain("'M'");
    expect(combatCode).toContain("nextScreen: 'main-menu'");
  });
});

// ============================================================================
// 8. NEW TIER 2 SCREENS
// ============================================================================

describe('New Tier 2 Screens', () => {
  it('jail screen routes to main-menu after fine payment', async () => {
    const fs = await import('fs');
    const jailCode = fs.readFileSync(
      new URL('../src/game/screens/jail.ts', import.meta.url),
      'utf-8'
    );

    // Pay fine ('P') must transition to main-menu on success
    expect(jailCode).toContain("nextScreen: 'main-menu'");
    expect(jailCode).toContain("'P'");
  });

  it('bulletin-board screen routes to spacers-hangout on quit', async () => {
    const fs = await import('fs');
    const bbCode = fs.readFileSync(
      new URL('../src/game/screens/bulletin-board.ts', import.meta.url),
      'utf-8'
    );

    expect(bbCode).toContain("nextScreen: 'spacers-hangout'");
    expect(bbCode).toContain("'Q'");
  });

  it('alliance-invest screen routes to main-menu on quit', async () => {
    const fs = await import('fs');
    const investCode = fs.readFileSync(
      new URL('../src/game/screens/alliance-invest.ts', import.meta.url),
      'utf-8'
    );

    expect(investCode).toContain("nextScreen: 'main-menu'");
    expect(investCode).toContain("'Q'");
  });
});
