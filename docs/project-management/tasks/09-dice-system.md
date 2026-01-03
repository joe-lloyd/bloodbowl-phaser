# Task 09: Dice Rolling & Probability

**Status**: 🚧 IN PROGRESS
**Priority**: 🟡 Medium
**Phase**: 3 - Advanced Gameplay
**Dependencies**: [Task 02](./02-architecture-refactoring.md)

## 📝 Description

Implement comprehensive dice rolling system with modifiers, re-rolls, and probability calculations.

## 🎯 Objectives

1. [x] Create dice service for all rolls
2. [x] Implement modifier system
3. [ ] Add re-roll mechanics
4. [ ] Create dice UI and animations
5. [ ] Add probability display (optional)
6. [x] Implement dice logging (Events)
7. [x] Deterministic RNG for replays

## 🏛️ Architecture

The dice system follows a layered architecture:

```mermaid
├─────────────────────────────────────────────────────────┤
│                   Business Logic Layer                   │
│  (Game State, Managers, Controllers, Services)           │
│  - Layers: Manager -> Controller -> Service -> Operation │
├─────────────────────────────────────────────────────────┤
│                   Infrastructure Layer                   │
│  (EventBus, DiceController, RNGService)                 │
├─────────────────────────────────────────────────────────┤
```

## ✅ Acceptance Criteria

- [x] All dice types supported (D6, D8, 2D6, block dice)
- [x] Modifiers properly applied
- [ ] Re-rolls work correctly
- [ ] Dice results animated
- [x] Dice history tracked via events
- [x] All dice mechanics tested
- [x] Seeded RNG for determinism

## 🔄 Updates

- **2025-12-05**: Task created
- **2026-01-03**: Implemented layered DiceController → DiceService → RNGService architecture with deterministic Mulberry32 RNG. Updated all managers to use centralized dice logic. Verified with full unit test suite.
- **2026-01-03**: Added comprehensive deterministic testing with seed-finder utilities for scenario-based testing. Created 39 passing tests covering all dice methods and complex scenarios.

## 🧪 Deterministic Testing Approach

The dice system uses the **Mulberry32 PRNG algorithm** for deterministic randomness, which guarantees:

- **Same seed = Same sequence**: Identical dice rolls every time when using the same seed
- **Replay support**: Game replays can reproduce exact dice outcomes
- **Testability**: Complex scenarios can be tested without randomness

### Seed Discovery Utilities

Located in `__tests__/utils/seed-finder.ts`, these utilities allow finding seeds for specific outcomes:

#### `findSeedForDiceSequence(sequence: number[])`

Finds a seed that produces an exact D6 sequence:

```typescript
// Find seed that rolls 6, 6, 5
const result = findSeedForDiceSequence([6, 6, 5]);
const rng = new RNGService(result.seed);
// rng will now roll 6, 6, 5 in sequence
```

#### `findSeedForBlockOutcome(outcome: BlockResult[])`

Finds a seed for specific block dice results:

```typescript
// Find seed for POW, POW on 2D block
const result = findSeedForBlockOutcome(['pow', 'pow']);
```

#### `findSeedForInjuryChain(options: InjuryChainOptions)`

Finds seed for complete injury sequences - **perfect for testing player deaths**:

```typescript
// Find seed for: Block POW → Armor Break → Casualty 15 (death)
const result = findSeedForInjuryChain({
  blockResult: 'pow',
  armorTarget: 9,
  armorBreak: true,
  injuryTotal: 10,
  casualtyRoll: 15
});
```

### Usage in Tests

```typescript
import { findSeedForInjuryChain } from '@tests/utils/seed-finder';

it('should handle player death correctly', () => {
  // Find seed for death scenario
  const seedResult = findSeedForInjuryChain({
    blockResult: 'pow',
    armorBreak: true,
    injuryTotal: 10,
    casualtyRoll: 15
  });

  // Use seed to test death mechanics
  const rng = new RNGService(seedResult.seed);
  const diceController = new DiceController(eventBus, rng);
  
  // Test will now reliably produce death scenario
  const block = diceController.rollBlockDice(1);
  const armor = diceController.rollArmorCheck(9);
  const injury = diceController.rollInjury();
  
  expect(block[0].type).toBe('pow');
  expect(armor.broken).toBe(true);
  expect(injury.total).toBeGreaterThanOrEqual(10);
});
```

### Known Test Seeds

| Scenario     | Seed     | Description                                        |
|--------------|----------|----------------------------------------------------|
| Natural 6    | Variable | Use `findSeedForDiceSequence([6])`                 |
| Natural 1    | Variable | Use `findSeedForDiceSequence([1])`                 |
| Double POW   | Variable | Use `findSeedForBlockOutcome(['pow', 'pow'])`      |
| Player Death | Variable | Use `findSeedForInjuryChain()` with casualty 15-16 |

### Performance Notes

- Seed discovery typically completes in <1 second for simple sequences
- Complex scenarios (full injury chains) may take 2-5 seconds
- Maximum search iterations: 100,000 (configurable)
- Discovered seeds can be cached and reused across test runs
