## Why

Several match-state transitions are correct in the engine but are not reflected reliably on the board: a mid-route pickup can leave a second ball on the pitch, knocked-out players can remain rendered in their square, restored activations lose their used-player treatment, and Punt resolves without a kick animation. These mismatches make the visible match state untrustworthy and make otherwise-correct rules look broken.

## What Changes

- Make ball possession visually singular: once a pickup succeeds, remove the loose-ball sprite and show an unambiguous carrier marker throughout the remainder of the route.
- Move a player to the Knocked Out dugout immediately when an injury result changes their status to KO, removing their pitch position and sprite.
- Reapply activated-player styling after a saved match or scenario is restored.
- Give Punt a complete declaration and kick animation, with rule resolution waiting for the presentation boundary instead of silently teleporting the ball.
- Add regression scenarios covering the engine state and visible board state together.

## Capabilities

### New Capabilities
- `match-state-visual-sync`: keeps ball possession, pitch/dugout placement, activation styling, and action animations synchronized with authoritative game state.

### Modified Capabilities

## Impact

- Ball movement and pickup: `BallManager`, `PickupController`, movement events, `GameScene`, `BallSprite`, and player carrier indicators.
- Injury/status handling: armour/injury operations, player status events, pitch placement, dugout refresh, and player sprites.
- Restoration: `GameStateRestored`, `GameScene` initialization, and activated-player rendering.
- Punt: `PuntOperation`, gameplay interaction flow, animation events, camera tracking, headless/browser timing boundaries.
- Tests: headless regression scenarios plus browser/component assertions for sprite and marker state.
