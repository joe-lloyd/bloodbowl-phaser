# Proposal

## Why

The inducement engine and selection panel exist, but normal games never open the panel. Coaches need a purchase window after both teams ready up and before the coin toss starts setup.

## What Changes

- Add a persisted pregame ready and purchase sequence shared by local, computer and online matches.
- Require both coaches to ready, then confirm their own purchases (including an empty selection) before starting the match.
- Load purchases alongside existing Matched Play draft inducements exactly once, resolve their choices before setup, and preserve progress on resume.
- Make prices, limits, remaining budget, existing draft purchases and validation errors clear in the purchase UI.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sevens-inducements`: define readiness, purchase ordering, ownership, synchronization and resume for the graphical pregame flow.

## Impact

GameService inducement state, protocol commands and ownership, snapshot serialization, local/online coin-toss screens, computer coach pregame handling, purchase UI and focused tests. No additional dependencies or changes to inducement prices or Matched Play budgeting.
