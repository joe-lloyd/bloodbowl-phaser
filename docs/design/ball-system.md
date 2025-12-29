# Ball System Design

## Overview

Currently, ball logic (`ballPosition`, `attemptPickup`) resides directly in `GameService`. As we add complex mechanics like Passing, Bouncing, Interceptions, and Throw-ins, `GameService` will become bloated. A dedicated `BallController` (or `BallManager`) is required to encapsulate this logic.

## Responsibilities

### 1. State Management

The controller should track more than just position:

- **Position**: `{ x, y }`
- **Holder**: `playerId | null`
- **Status**: `GROUND` | `AIR` | `HELD` | `OUT_OF_BOUNDS`
- **Previous Position**: For determining throw-in templates.

### 2. Mechanics

The controller should expose methods for specific Blood Bowl ball physics:

#### A. Scatter & Bounce

- **`scatter()`**: Moves ball 1 square in random d8 direction. Used for inaccurate passes or failed pickups.
- **`bounce()`**: Similar to scatter, but happens when ball hits ground.
  - _Chain Reaction_: If it bounces onto a player -> Attempt Catch. If fail -> Bounce again.

#### B. Passing

- **`calculatePass(start, end)`**:
  - Determine Range (Quick, Short, Long, Long Bomb).
  - Determine Interceptors (scales over path).
- **`resolvePass(roll, modifiers)`**:
  - **Accurate**: Lands in target square.
  - **Inaccurate**: Scatters d3 squares from target.
  - **Fumble**: Scatters from thrower.

#### C. Out of Bounds (OOB)

- **Kickoff OOB**:
  - **Rule**: Touchback. Receiving coach gives ball to any player.
- **Play OOB**:
  - **Rule**: Throw-in.
  - **Template**: 2d6 Template (Direction) + d6 Distance.

### 3. Event Handling

The controller should emit granular events for the UI to animate:

- `ballThrow` (start, end, type)
- `ballBounce` (from, to)
- `ballCatchAttempt` (player, success)
- `ballOutOfBounds` (type)

## Proposed API

```typescript
interface BallState {
  position: { x: number; y: number };
  holderId: string | null;
  status: "GROUND" | "AIR" | "HELD";
}

class BallManager {
  constructor(private eventBus: EventBus) {}

  // Actions
  public pickup(player: Player): boolean; // The logic we just wrote
  public drop(position: { x; y }): void; // Place on ground
  public scatter(from: { x; y }): { x; y }; // Random d8
  public throwIn(lastSquare: { x; y }): { x; y }; // 2d6 template

  // Queries
  public getHolder(): string | null;
  public isAt(x: number, y: number): boolean;
}
```

## Integration Plan

1. **Extract**: Move current `ballPosition` and `attemptPickup` from `GameService` to `BallManager`.
2. **Refactor**: Update `GameService` to delegate ball actions to `BallManager`.
3. **Expand**: Implement `scatter` and `bounce` logic in `BallManager` when implementing Passing.
