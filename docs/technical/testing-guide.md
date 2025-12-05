# Testing Guide

## Overview

We use **Vitest** for all testing (Unit, Integration) and it is configured to mimic a browser environment where needed using `jsdom`.

## Running Tests

- **Run all tests**: `npm test`
- **Run with UI**: `npm run test:ui`
- **Check coverage**: `npm run test:coverage`

## Test Structure

- `__tests__/unit`: Pure logic tests (Validators, Services).
- `__tests__/integration`: Component interaction tests.
- `__tests__/e2e`: Full game scenario tests.
- `__tests__/mocks`: Phaser and Global mocks.
- `__tests__/setup`: Global test configuration.

## Writing Tests

### 1. Using Mocks

If you need to test a Scene or GameObject dependent class, use the mocks from `mocks/phaser-mocks.ts`.

```typescript
import { MockScene } from '../mocks/phaser-mocks';

it('should add sprite', () => {
    const scene = new MockScene();
    const sprite = scene.add.sprite(0, 0, 'tex');
    expect(sprite).toBeDefined();
});
```

### 2. Using Builders

Use builders to create consistent test data.

```typescript
import { TeamBuilder } from '../utils/test-builders';

const team = new TeamBuilder().withRace(TeamRace.ORC).build();
```

### 3. Async Testing

Use helper utilities execution.

```typescript
import { wait, flushPromises } from '../utils/test-helpers';

await wait(100);
```

## Coverage Requirements

We aim for **80% coverage** on pure logic files (Services, Validators).
