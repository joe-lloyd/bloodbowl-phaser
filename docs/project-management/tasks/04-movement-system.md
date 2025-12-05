# Task 04: Movement System

**Status**: � IN PROGRESS (Backend Complete)

## 🎯 Objectives

1. Implement grid-based pathfinding
2. Add tackle zone calculation
3. Implement dodge mechanics
4. Add go-for-it (GFI) system
5. Create movement validation
6. Add movement visualization (Pending UI)
7. Implement movement animation (Pending UI)

## ✅ Acceptance Criteria

- [x] Players can move up to their MA value
- [x] Tackle zones properly restrict movement
- [x] Dodge rolls required when leaving tackle zones
- [x] GFI allows 2 extra squares with risk
- [x] Movement paths visualized
- [x] Smooth movement animation
- [x] All movement rules tested
- [ ] Movement restricted to active team
- [ ] Opposing tackle zones visible
- [ ] Movement range overlay (dark mask)
- [ ] Sprint/GFI distinct visualization
- [ ] Path planning with waypoints
- [ ] Connected path lines
- [ ] Confirm move action

## 📋 Blood Bowl Movement Rules

### Basic Movement

- Player can move up to MA (Movement Allowance) squares
- Can move in any direction (orthogonal or diagonal)
- Cannot move through other players
- Cannot move off the pitch

### Tackle Zones

- Each standing player has 8 tackle zones (adjacent squares)
- Leaving a tackle zone requires a dodge roll
- Multiple tackle zones don't stack (single dodge roll)
- Prone players don't have tackle zones

### Dodge Rolls

- Roll 2D6, must equal or exceed target number
- Target based on AG (Agility) stat
- Modified by skills (Dodge, etc.)
- Failure causes turnover and player goes prone

### Go-For-It (GFI)

- Can move 2 extra squares beyond MA
- Each GFI square requires 2+ roll on D6
- Failure causes turnover and player goes prone
- Sprint skill allows re-roll

## 🔧 Implementation Details

### MovementService

```typescript
interface IMovementService {
  getValidMoves(playerId: string): GridPosition[]
  moveTo(playerId: string, position: GridPosition): MoveResult
  calculatePath(from: GridPosition, to: GridPosition): GridPosition[]
  getTackleZones(position: GridPosition): Player[]
  requiresDodge(from: GridPosition, to: GridPosition): boolean
}
```

### Movement Validation

```typescript
interface MovementValidator {
  canMoveTo(player: Player, position: GridPosition): boolean
  getMovementCost(from: GridPosition, to: GridPosition): number
  isPathClear(path: GridPosition[]): boolean
}
```

### Pathfinding

- Use A* algorithm for optimal paths
- Consider tackle zones in cost calculation
- Highlight valid movement squares
- Show movement cost per square

## 🧪 Testing Requirements

### Unit Tests

- [ ] Pathfinding algorithm
- [ ] Tackle zone calculation
- [ ] Dodge roll mechanics
- [ ] GFI mechanics
- [ ] Movement validation

### Integration Tests

- [ ] Full movement flow
- [ ] Movement with tackle zones
- [ ] Movement causing turnover
- [ ] Movement with skills

### Manual Tests

- [ ] Visual path highlighting
- [ ] Smooth animations
- [ ] UI feedback for invalid moves

## 🔗 References

- [Blood Bowl Rules - Movement](../../CORE_CONCEPT.md)
- [A* Pathfinding Algorithm](https://en.wikipedia.org/wiki/A*_search_algorithm)

## 🔄 Updates

- **2025-12-05**: Task created
