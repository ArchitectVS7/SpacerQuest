# SpacerQuest v4.0 - E2E Tests

Comprehensive end-to-end tests for SpacerQuest using Playwright.

## Test Structure

```
tests/e2e/
├── fixtures/
│   └── spacerquest.ts       # Custom Playwright fixtures
├── pages/
│   ├── LoginPage.ts         # Login page object
│   ├── CharacterCreationPage.ts  # Character creation page object
│   └── MainGamePage.ts      # Main game terminal page object
├── 01-auth.spec.ts          # Authentication tests
├── 02-character-creation.spec.ts  # Character creation tests
├── 03-navigation.spec.ts    # Main game navigation tests
├── 04-economy.spec.ts       # Economy and trading tests
├── 05-ship-combat.spec.ts   # Ship and combat tests
├── 06-social-api.spec.ts    # Social features API tests
├── 07-api-integration.spec.ts  # Backend API integration tests
├── api.ts                   # API helper class
└── global-setup.ts          # Global test setup
```

## Running Tests

### Prerequisites

1. Install Playwright browsers:
```bash
npx playwright install
```

2. Ensure backend server is running on port 3000
3. Ensure frontend dev server is running on port 5173

### Commands

```bash
# Run all E2E tests
npm run test:e2e

# Run with UI mode
npm run test:e2e:ui

# Run with debug mode
npm run test:e2e:debug

# Run specific test file
npx playwright test tests/e2e/01-auth.spec.ts

# Run tests by name pattern
npx playwright test --grep "Authentication"

# Run specific browser
npx playwright test --project=chromium
```

## Test Categories

### 1. Authentication Tests (`01-auth.spec.ts`)
- Login page display
- Dev login flow
- OAuth callback handling
- Session persistence

### 2. Character Creation Tests (`02-character-creation.spec.ts`)
- Character creation form display
- Valid character creation
- Name validation (length, reserved prefixes)
- Auto-uppercase names

### 3. Navigation Tests (`03-navigation.spec.ts`)
- Main menu display
- Screen navigation (Bank, Shipyard, Pub, Traders)
- Return to main menu
- Command help display
- Invalid command handling

### 4. Economy Tests (`04-economy.spec.ts`)
- Fuel purchase via API
- Cargo contract acceptance
- Fuel price display
- Cargo type descriptions
- Credits display

### 5. Ship & Combat Tests (`05-ship-combat.spec.ts`)
- Ship status API
- Component status display
- Upgrade/repair options
- Fuel level display
- Combat engagement

### 6. Social API Tests (`06-social-api.spec.ts`)
- Top Gun rankings
- Leaderboard
- Travel status
- Launch API
- Character data

### 7. API Integration Tests (`07-api-integration.spec.ts`)
- Health check endpoint
- Authentication endpoints
- Character API
- Social API
- Ship API
- Navigation API

## Page Objects

### LoginPage
```typescript
const loginPage = new LoginPage(page);
await loginPage.goto();
await loginPage.devLogin();
await loginPage.waitForLoginSuccess();
```

### CharacterCreationPage
```typescript
const characterPage = new CharacterCreationPage(page);
await characterPage.createCharacter('Name', 'ShipName');
await characterPage.waitForSuccess();
```

### MainGamePage
```typescript
const mainGame = new MainGamePage(page);
await mainGame.waitForTerminal();
await mainGame.waitForMainMenu();
await mainGame.goToBank();
await mainGame.pressKey('B');
```

## API Helper

```typescript
const api = new SpacerQuestAPI(request);
await api.devLogin();
await api.getCharacter();
await api.buyFuel(100);
await api.acceptCargo();
```

## Configuration

Playwright configuration (`playwright.config.ts`):
- Base URL: `http://localhost:5173`
- Backend URL: `http://localhost:3000`
- Browser: Chromium (Desktop)
- Screenshots: On failure
- Video: On failure
- Trace: On first retry

## CI/CD Integration

The tests are configured to:
- Run in serial (not parallel) to avoid state conflicts
- Retry failed tests 2 times on CI
- Use single worker on CI
- Generate HTML report
- Start servers automatically

## Troubleshooting

### Backend not responding
```bash
# Start backend manually
npm run dev:server
```

### Frontend not loading
```bash
# Start frontend manually
npm run dev:client
```

### Database not seeded
```bash
# Seed the database
npm run db:seed
```

### Tests timing out
Increase timeout in `playwright.config.ts`:
```typescript
webServer: {
  timeout: 120000,  // Increase from 60000
}
```

## Reports

After running tests, view the HTML report:
```bash
npx playwright show-report
```

Reports are saved to `playwright-report/` directory.
