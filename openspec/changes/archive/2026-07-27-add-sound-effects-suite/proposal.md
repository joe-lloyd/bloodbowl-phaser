# Proposal: add-sound-effects-suite

## Why

The game is nearly silent: `SoundManager` exists (Strudel-based, with a theme and a `playSFX` stub exercised only by the SoundTest page) but no gameplay interaction produces sound. A consistent effect suite — blocks, pushbacks, kicks, dice, turnovers, touchdowns — gives every action tactile feedback. Separately, `SoundManager` currently sits inside `ServiceContainer`, which is what dragged `@strudel/web` into the engine import chain and crashed plain-Node use once already.

## What Changes

- Define a **sound suite**: one named sound per interaction type — dice roll, block impact, pushback, knockdown, kick-off, ball bounce/catch/fumble, pass, turnover whistle, touchdown + crowd, KO/injury, foul, referee send-off, end of half/game, UI click.
- Add an **event→sound binding layer**: a `SoundSuite` listener subscribes to existing `GameEventNames` on the EventBus (`BlockDiceRolled`, `PlayerKnockedDown`, `Turnover`, `Touchdown`, `BallKicked`, `DiceRoll`, `KORecoveryRolled`, …) and triggers the mapped effect. The engine emits nothing sound-specific — events stay the single source of truth.
- **Move sound wholly into the UI layer**: `SoundManager` leaves `ServiceContainer`/`src/services` so `@strudel/web` can never re-enter the engine/headless import chain. Headless mode stays silent by construction.
- Sound **settings**: master mute + volume, persisted (localStorage), with the existing SoundTest page extended into a suite audition board.
- Sound sources: keep Strudel synthesis as the default generator (no licensing/asset pipeline); allow per-sound sample overrides from `public/assets/sounds/` later.

## Capabilities

### New Capabilities

- `sound-effects`: The interaction sound suite — the catalog of named effects, their event bindings, layering/priority rules, settings (mute/volume, persistence), and the guarantee that sound stays out of the engine import chain.

### Modified Capabilities

<!-- none — no sound capability exists in openspec/specs -->

## Impact

- **Moved code**: `src/services/SoundManager.ts` → `src/ui/sound/` (with `ServiceContainer` losing its `soundManager` member — internal breaking change).
- **New code**: `src/ui/sound/SoundSuite.ts` (event bindings, catalog), settings hook, audition page update.
- **Untouched**: engine (`src/game`, `src/services` minus the move), headless code — verified by the existing headless test suite continuing to run in plain Node.
- **Dependencies**: none added; keeps `@strudel/web`.
