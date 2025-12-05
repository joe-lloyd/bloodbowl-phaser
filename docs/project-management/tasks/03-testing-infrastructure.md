# Task 03: Testing Infrastructure

**Status**: ✅ COMPLETE  
**Priority**: 🔴 High  
**Phase**: 1 - Foundation & Refactoring  
**Dependencies**: [Task 01](./01-project-structure.md)  

## 📝 Description

Establish comprehensive testing infrastructure with unit tests, integration tests, and end-to-end tests. Set up testing utilities, mocks, and fixtures to support test-driven development.

## 🎯 Objectives

1. Expand Vitest configuration for comprehensive testing
2. Create testing utilities and helpers
3. Set up Phaser mocking infrastructure
4. Create test fixtures for common scenarios
5. Establish testing patterns and conventions
6. Achieve baseline test coverage for existing code
7. Set up continuous integration for tests

## ✅ Acceptance Criteria

- [x] Testing utilities created and documented
- [x] Phaser mocking infrastructure in place
- [x] Test fixtures created for teams, players, game states
- [x] Testing patterns documented
- [x] Baseline tests written for core systems
- [x] Test coverage reporting configured
- [x] CI/CD pipeline running tests
- [x] Testing guide created for contributors

## 📋 Testing Infrastructure

### Test Organization

```
__tests__/
├── unit/                   # Unit tests for pure logic
│   ├── services/
│   ├── validators/
│   ├── utils/
│   └── models/
├── integration/            # Integration tests
│   ├── game-flow/
│   ├── state-management/
│   └── scene-transitions/
├── e2e/                    # End-to-end tests
│   └── game-scenarios/
├── fixtures/               # Test data
│   ├── teams.ts
│   ├── players.ts
│   ├── game-states.ts
│   └── rosters.ts
├── mocks/                  # Mock implementations
│   ├── phaser-mocks.ts
│   ├── scene-mocks.ts
│   └── service-mocks.ts
└── utils/                  # Testing utilities
    ├── test-helpers.ts
    ├── assertions.ts
    └── builders.ts
```

### Testing Utilities

#### Test Builders

```typescript
// Builder pattern for test data
class TeamBuilder {
  withPlayers(count: number): TeamBuilder;
  withRoster(roster: RosterTemplate): TeamBuilder;
  build(): Team;
}

class GameStateBuilder {
  inPhase(phase: GamePhase): GameStateBuilder;
  withActiveTeam(teamId: string): GameStateBuilder;
  build(): GameState;
}
```

#### Custom Assertions

```typescript
// Domain-specific assertions
expect(player).toBeOnPitch();
expect(gameState).toBeInPhase(GamePhase.SETUP);
expect(action).toBeValid();
expect(team).toHavePlayersPlaced(7);
```

#### Phaser Mocks

```typescript
// Mock Phaser scene
class MockScene {
  add: MockAdd;
  make: MockMake;
  physics: MockPhysics;
  // ... other Phaser APIs
}
```

## 🔧 Implementation Steps

### Phase 1: Setup Infrastructure

1. Configure Vitest for different test types
2. Set up coverage reporting
3. Create base test utilities
4. Set up Phaser mocking

### Phase 2: Create Fixtures & Mocks

1. Create team fixtures
2. Create player fixtures
3. Create game state fixtures
4. Create Phaser mocks
5. Create service mocks

### Phase 3: Write Baseline Tests

1. Test GameStateManager
2. Test validators
3. Test utilities
4. Test type definitions
5. Test data transformations

### Phase 4: Integration & E2E

1. Test scene transitions
2. Test game flow
3. Test setup phase
4. Test turn management
5. Create E2E scenarios

### Phase 5: CI/CD

1. Set up GitHub Actions (or similar)
2. Configure test running on PR
3. Set up coverage reporting
4. Add badges to README

## 🧪 Testing Requirements

### Coverage Targets

- **Unit Tests**: 80%+ coverage for services and utilities
- **Integration Tests**: All major workflows covered
- **E2E Tests**: Critical user paths covered

### Test Categories

#### Unit Tests (Fast, Isolated)

```typescript
describe('GameStateManager', () => {
  it('should initialize with correct phase', () => {
    const manager = new GameStateManager(team1, team2);
    expect(manager.getState().phase).toBe(GamePhase.SETUP);
  });

  it('should validate player placement', () => {
    const manager = new GameStateManager(team1, team2);
    const result = manager.placePlayer('player1', 5, 5);
    expect(result).toBe(true);
  });
});
```

#### Integration Tests (Component Interaction)

```typescript
describe('Setup Phase Flow', () => {
  it('should complete setup and transition to kickoff', () => {
    const game = setupTestGame();
    game.placeAllPlayers(team1);
    game.placeAllPlayers(team2);
    game.confirmSetup(team1.id);
    game.confirmSetup(team2.id);
    
    expect(game.getState().phase).toBe(GamePhase.KICKOFF);
  });
});
```

#### E2E Tests (Full Scenarios)

```typescript
describe('Complete Game Flow', () => {
  it('should play through a full turn', async () => {
    const game = await startNewGame();
    await game.completeSetup();
    await game.performKickoff();
    await game.selectPlayer('player1');
    await game.movePlayer(8, 8);
    await game.endTurn();
    
    expect(game.getCurrentTurn()).toBe(2);
  });
});
```

## 📝 Testing Patterns

### Arrange-Act-Assert (AAA)

```typescript
it('should end turn when player falls', () => {
  // Arrange
  const game = new GameStateManager(team1, team2);
  game.startTurn(team1.id);
  
  // Act
  const result = game.playerFalls('player1');
  
  // Assert
  expect(result.turnover).toBe(true);
  expect(game.getState().activeTeamId).not.toBe(team1.id);
});
```

### Test Data Builders

```typescript
const team = new TeamBuilder()
  .withName('Orcland Raiders')
  .withRoster(OrcRoster)
  .withPlayers(11)
  .build();
```

### Snapshot Testing

```typescript
it('should render player info correctly', () => {
  const panel = createPlayerInfoPanel(player);
  expect(panel.toJSON()).toMatchSnapshot();
});
```

## 🔧 Configuration

### vitest.config.ts

```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup/vitest-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        '__tests__/',
        '**/*.d.ts',
        '**/*.config.*',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});
```

## 📚 Testing Guide

Create `docs/technical/testing-guide.md` with:

- How to write tests
- Testing patterns to follow
- How to run tests
- How to debug failing tests
- How to mock Phaser
- How to create fixtures

## 🔗 References

- [Vitest Documentation](https://vitest.dev/)
- [Testing Best Practices](https://testingjavascript.com/)
- [Test-Driven Development](https://martinfowler.com/bliki/TestDrivenDevelopment.html)

## 🔄 Updates

- **2025-12-05**: Task created
