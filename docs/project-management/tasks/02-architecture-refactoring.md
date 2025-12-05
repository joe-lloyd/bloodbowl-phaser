# Task 02: Core Architecture Refactoring

**Status**: 📋 NOT STARTED  
**Priority**: 🔴 High  
**Phase**: 1 - Foundation & Refactoring  
**Dependencies**: [Task 01](./01-project-structure.md)  

## 📝 Description

Refactor the core architecture to improve modularity, testability, and maintainability. Separate concerns, introduce clear interfaces, and establish patterns for future development.

## 🎯 Objectives

1. Separate game logic from presentation layer
2. Introduce service layer for core systems
3. Implement dependency injection pattern
4. Create clear interfaces for all major components
5. Establish event-driven communication between systems
6. Refactor GameStateManager for better testability

## ✅ Acceptance Criteria

- [ ] Game logic separated from Phaser scenes
- [ ] Service layer created for core systems
- [ ] Dependency injection implemented
- [ ] All major components have defined interfaces
- [ ] Event system implemented for inter-component communication
- [ ] GameStateManager refactored and fully tested
- [ ] No existing features broken
- [ ] All existing tests pass
- [ ] New unit tests added for refactored components

## 📋 Proposed Architecture

### Service Layer
```
src/services/
├── GameService.ts          # Core game logic orchestration
├── TeamService.ts          # Team management logic
├── PlayerService.ts        # Player management logic
├── ActionService.ts        # Action validation and execution
├── DiceService.ts          # Dice rolling and probability
└── EventBus.ts            # Event-driven communication
```

### Domain Models
```
src/domain/
├── models/
│   ├── Game.ts
│   ├── Team.ts
│   ├── Player.ts
│   └── Action.ts
├── validators/
│   ├── SetupValidator.ts
│   ├── ActionValidator.ts
│   └── MovementValidator.ts
└── repositories/
    ├── GameRepository.ts
    └── TeamRepository.ts
```

### Presentation Layer
```
src/presentation/
├── scenes/                 # Phaser scenes (thin controllers)
├── components/             # Reusable UI components
└── controllers/            # Scene-specific controllers
```

## 🔧 Implementation Steps

### Phase 1: Extract Game Logic
1. Create service interfaces
2. Extract GameStateManager logic into GameService
3. Extract team management into TeamService
4. Create EventBus for component communication

### Phase 2: Refactor Scenes
1. Make scenes thin controllers
2. Move logic to services
3. Use dependency injection for services
4. Implement event listeners for state changes

### Phase 3: Add Validation Layer
1. Create validator interfaces
2. Implement setup validation
3. Implement action validation
4. Add movement validation

### Phase 4: Testing
1. Write unit tests for all services
2. Write integration tests for service interactions
3. Add scene tests (mocked services)
4. Verify all existing features work

## 🧪 Testing Requirements

### Unit Tests
- [ ] GameService fully tested
- [ ] TeamService fully tested
- [ ] PlayerService fully tested
- [ ] ActionService fully tested
- [ ] All validators tested
- [ ] EventBus tested

### Integration Tests
- [ ] Service interactions tested
- [ ] State transitions tested
- [ ] Event flow tested

### Manual Verification
1. Run existing game through all scenes
2. Verify team builder works
3. Verify setup phase works
4. Verify game phase transitions work
5. Verify player selection and info display works

### Test Commands
```bash
npm test                    # Run all tests
npm run test:ui            # Run tests with UI
npm run test:coverage      # Check coverage
```

## 📚 Design Patterns

### Dependency Injection
```typescript
class GameScene extends Phaser.Scene {
  constructor(
    private gameService: IGameService,
    private teamService: ITeamService,
    private eventBus: IEventBus
  ) {
    super('GameScene');
  }
}
```

### Event-Driven Communication
```typescript
// Publisher
eventBus.emit('player:selected', { playerId: '123' });

// Subscriber
eventBus.on('player:selected', (data) => {
  this.updatePlayerInfo(data.playerId);
});
```

### Service Layer
```typescript
interface IGameService {
  startGame(config: GameConfig): void;
  endTurn(): void;
  executeAction(action: Action): ActionResult;
  getState(): GameState;
}
```

## 🚧 Migration Strategy

1. **Create new structure alongside old** - Don't break existing code
2. **Migrate one scene at a time** - Start with simplest (BootScene)
3. **Test after each migration** - Ensure nothing breaks
4. **Remove old code only when new is proven** - Safety first
5. **Update documentation as you go** - Keep docs in sync

## 📝 Notes

- Prioritize testability over cleverness
- Keep interfaces simple and focused
- Document all public APIs
- Use TypeScript strictly (no `any` types)
- Follow SOLID principles

## 🔗 References

- [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [Dependency Injection in TypeScript](https://www.typescriptlang.org/docs/handbook/decorators.html)
- [Event-Driven Architecture](https://martinfowler.com/articles/201701-event-driven.html)

## 🔄 Updates

- **2025-12-05**: Task created
