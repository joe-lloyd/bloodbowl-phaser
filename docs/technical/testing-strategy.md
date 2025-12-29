# Testing Strategy

## 🎯 Overview

This document outlines the testing strategy for the Blood Bowl Phaser.js project. Our goal is to achieve comprehensive test coverage while maintaining fast, reliable tests that support confident refactoring.

## 📊 Testing Pyramid

```
        /\
       /  \      E2E Tests (Few)
      /____\     - Full game scenarios
     /      \    - Critical user paths
    /        \
   /__________\  Integration Tests (Some)
  /            \ - Component interactions
 /              \- State transitions
/________________\
                  Unit Tests (Many)
                  - Pure functions
                  - Business logic
                  - Validators
```

## 🧪 Test Types

### Unit Tests

**Purpose**: Test individual functions and classes in isolation

**Characteristics**:

- Fast (< 1ms per test)
- No dependencies on Phaser
- No file I/O or network
- Deterministic

**What to Test**:

- Validators (SetupValidator, ActionValidator)
- Utilities (GridUtils)
- Pure business logic
- Data transformations
- Type guards

**Example**:

```typescript
describe("GridUtils", () => {
  describe("screenToGrid", () => {
    it("should convert screen coordinates to grid coordinates", () => {
      const result = GridUtils.screenToGrid(100, 100);
      expect(result).toEqual({ gridX: 2, gridY: 2 });
    });

    it("should handle negative coordinates", () => {
      const result = GridUtils.screenToGrid(-50, -50);
      expect(result).toEqual({ gridX: -1, gridY: -1 });
    });
  });
});
```

### Integration Tests

**Purpose**: Test how components work together

**Characteristics**:

- Moderate speed (< 100ms per test)
- May use mocked Phaser
- Test multiple components
- Test state transitions

**What to Test**:

- GameStateManager with validators
- Scene transitions
- Service interactions (after refactoring)
- Event flow

**Example**:

```typescript
describe("Setup Phase Integration", () => {
  let gameState: GameStateManager;
  let team1: Team;
  let team2: Team;

  beforeEach(() => {
    team1 = createTestTeam("Team 1");
    team2 = createTestTeam("Team 2");
    gameState = new GameStateManager(team1, team2);
  });

  it("should complete setup when both teams place all players", () => {
    // Place 7 players for team 1
    for (let i = 0; i < 7; i++) {
      gameState.placePlayer(team1.players[i].id, i, 5);
    }

    // Place 7 players for team 2
    for (let i = 0; i < 7; i++) {
      gameState.placePlayer(team2.players[i].id, i, 10);
    }

    gameState.confirmSetup(team1.id);
    gameState.confirmSetup(team2.id);

    expect(gameState.getState().phase).toBe(GamePhase.KICKOFF);
  });
});
```

### End-to-End Tests

**Purpose**: Test complete user workflows

**Characteristics**:

- Slower (< 1s per test)
- Test full scenarios
- May use real Phaser (headless)
- Test critical paths

**What to Test**:

- Complete game setup
- Full turn execution
- Touchdown scoring
- Game completion

**Example**:

```typescript
describe("Complete Game Flow", () => {
  it("should play through setup to first turn", async () => {
    const game = await createTestGame();

    // Setup phase
    await game.selectTeams(team1, team2);
    await game.performCoinFlip();
    await game.placeAllPlayers();
    await game.confirmSetup();

    // Kickoff
    await game.performKickoff();

    // First turn
    expect(game.getPhase()).toBe(GamePhase.PLAY);
    expect(game.getCurrentTurn()).toBe(1);
  });
});
```

## 🛠️ Testing Tools

### Vitest

- Primary test runner
- Fast, modern, TypeScript-first
- Built-in coverage
- Watch mode for TDD

### jsdom

- Browser environment simulation
- DOM manipulation testing
- Event handling

### Custom Test Utilities

- Test builders (TeamBuilder, PlayerBuilder)
- Custom matchers
- Phaser mocks
- Fixture generators

## 📋 Test Organization

### File Naming

```
src/utils/GridUtils.ts
__tests__/unit/utils/GridUtils.test.ts

src/game/GameStateManager.ts
__tests__/integration/game/GameStateManager.test.ts
```

### Test Structure (AAA Pattern)

```typescript
it("should do something", () => {
  // Arrange - Set up test data
  const input = createTestInput();

  // Act - Execute the code under test
  const result = functionUnderTest(input);

  // Assert - Verify the result
  expect(result).toBe(expected);
});
```

## 🎯 Coverage Targets

### Overall Coverage

- **Statements**: 80%+
- **Branches**: 75%+
- **Functions**: 80%+
- **Lines**: 80%+

### Per-Component Targets

- **Services**: 90%+ (after refactoring)
- **Validators**: 95%+
- **Utilities**: 90%+
- **Scenes**: 60%+ (harder to test)
- **UI Components**: 70%+

## 🔧 Mocking Strategy

### Phaser Mocking

```typescript
// Mock Phaser scene
class MockScene {
  add = {
    rectangle: vi.fn(),
    text: vi.fn(),
    container: vi.fn(),
  };

  make = {
    graphics: vi.fn(),
  };

  scene = {
    start: vi.fn(),
    stop: vi.fn(),
  };
}
```

### Service Mocking (Future)

```typescript
const mockGameService: IGameService = {
  startGame: vi.fn(),
  endTurn: vi.fn(),
  executeAction: vi.fn(),
  getState: vi.fn(() => mockGameState),
};
```

## 🏗️ Test Fixtures

### Team Fixtures

```typescript
export const createTestTeam = (name: string): Team => ({
  id: `team-${Date.now()}`,
  name,
  roster: OrcRoster,
  players: createTestPlayers(11),
  reRolls: 3,
  treasury: 0,
  color: 0xff0000,
});
```

### Player Fixtures

```typescript
export const createTestPlayer = (overrides?: Partial<Player>): Player => ({
  id: `player-${Date.now()}`,
  name: "Test Player",
  position: "Lineman",
  number: 1,
  stats: { MA: 5, ST: 3, AG: 3, PA: 4, AV: 9 },
  skills: [],
  status: PlayerStatus.READY,
  ...overrides,
});
```

### Game State Fixtures

```typescript
export const createTestGameState = (
  phase: GamePhase = GamePhase.SETUP
): GameState => ({
  phase,
  activeTeamId: null,
  turn: {
    teamId: "",
    turnNumber: 1,
    isHalf2: false,
    activatedPlayerIds: new Set(),
    hasBlitzed: false,
    hasPassed: false,
    hasHandedOff: false,
    hasFouled: false,
  },
  score: {},
});
```

## 🚀 Running Tests

### Commands

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test GridUtils.test.ts

# Run tests matching pattern
npm test -- --grep "setup"
```

### CI/CD Integration

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm install
      - run: npm test
      - run: npm run test:coverage
```

## ✅ Testing Checklist

Before merging code, ensure:

- [ ] All tests pass
- [ ] New code has tests
- [ ] Coverage targets met
- [ ] No skipped tests without reason
- [ ] Tests are deterministic (no flaky tests)
- [ ] Test names are descriptive
- [ ] Tests follow AAA pattern

## 📚 Best Practices

### DO

✅ Write tests first (TDD when possible)
✅ Keep tests simple and focused
✅ Use descriptive test names
✅ Test edge cases and error conditions
✅ Use fixtures and builders
✅ Mock external dependencies
✅ Keep tests fast

### DON'T

❌ Test implementation details
❌ Write brittle tests
❌ Use real Phaser in unit tests
❌ Share state between tests
❌ Skip tests without good reason
❌ Test third-party code
❌ Write slow tests

## 🔮 Future Improvements

1. **Visual Regression Testing**: Screenshot comparison for UI
2. **Performance Testing**: Benchmark critical paths
3. **Mutation Testing**: Verify test quality
4. **Property-Based Testing**: Generate test cases
5. **Contract Testing**: API contract verification

## 🔗 Related Documentation

- [Architecture](./architecture.md)
- [Task 03: Testing Infrastructure](../project-management/tasks/03-testing-infrastructure.md)

---

**Last Updated**: 2025-12-05
