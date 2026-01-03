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
- **2026-01-03**: Implemented layered DiceController -> DiceService -> RNGService architecture with deterministic Mulberry32 RNG. Updated all managers to use centralized dice logic. Verified with full unit test suite.
