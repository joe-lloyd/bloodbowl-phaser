# Task 06: Ball Mechanics

**Status**: 📋 NOT STARTED  
**Priority**: 🔴 High  
**Phase**: 2 - Core Gameplay Mechanics  
**Dependencies**: [Task 04](./04-movement-system.md)  

## 📝 Description

Implement complete ball mechanics including pickup, passing, catching, scattering, hand-offs, and fumbles according to Blood Bowl rules.

## 🎯 Objectives

1. Implement ball pickup mechanics
2. Add passing system with range modifiers
3. Implement catching mechanics
4. Add ball scatter mechanics
5. Implement hand-off system
6. Add fumble and bounce mechanics
7. Create ball visualization

## ✅ Acceptance Criteria

- [ ] Ball can be picked up with AG roll
- [ ] Passing works with range modifiers
- [ ] Catching requires AG roll
- [ ] Ball scatters on failed catch/pickup
- [ ] Hand-offs work properly
- [ ] Ball bounces on scatter
- [ ] Ball visualization clear
- [ ] All ball mechanics tested

## 📋 Blood Bowl Ball Rules

### Pickup
- Requires AG roll (2D6 ≥ target)
- Modified by tackle zones (-1 per zone)
- Sure Hands skill allows re-roll
- Failure causes turnover and scatter

### Passing
- Range modifiers:
  - Quick (≤ 3 squares): +1
  - Short (4-6 squares): 0
  - Long (7-12 squares): -1
  - Bomb (13+ squares): -2
- Accurate pass: lands in target square
- Inaccurate pass: scatters 1D6 squares
- Fumble: scatters 3 times

### Catching
- Requires AG roll
- Modified by tackle zones
- Catch skill allows re-roll
- Failure causes scatter and turnover

### Scatter
- Roll D8 for direction
- Roll D6 for distance (if applicable)
- Ball bounces if hits player
- Stops if caught or hits ground

## 🔧 Implementation Details

### BallService
```typescript
interface IBallService {
  pickup(playerId: string): PickupResult
  pass(playerId: string, target: GridPosition): PassResult
  catch(playerId: string): CatchResult
  handoff(fromId: string, toId: string): HandoffResult
  scatter(): ScatterResult
  getBallPosition(): GridPosition
  getBallCarrier(): Player | null
}
```

## 🧪 Testing Requirements

### Unit Tests
- [ ] Pickup mechanics
- [ ] Pass range calculation
- [ ] Catch mechanics
- [ ] Scatter mechanics
- [ ] Hand-off validation

### Integration Tests
- [ ] Full passing sequence
- [ ] Failed catch causing scatter
- [ ] Pickup from ground
- [ ] Bounce mechanics

## 🔄 Updates

- **2025-12-05**: Task created
