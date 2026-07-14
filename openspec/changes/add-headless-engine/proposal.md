# Proposal: add-headless-engine

## Why

The game engine is entangled with Phaser at the orchestration layer, so the only way to play or test a game end-to-end is through the browser UI — making iteration slow, regressions frequent, and AI-driven play impossible. The core logic (`GameService`, managers, operations, validators, seeded RNG) is already Phaser-free, so a headless mode is achievable now by formalizing that boundary rather than rewriting the engine.

## What Changes

- Add a **headless engine entry point**: create and drive a full game (Blood Bowl Sevens, 2025 rules) from Node with no Phaser, no DOM, no browser.
- Add a **JSON protocol** over the engine: serializable game state snapshots (converting the current `Set`/`Map` fields in `TurnData`), a legal-action query surface, and JSON-shaped commands mapping onto `IGameService` (declare action, move, block, pass, foul, end turn, …) so an external agent — human at a console or an AI — can play by reading state and issuing actions.
- Add a **console (CLI) runner** that renders state as text/JSON per turn and accepts commands interactively or from a script, reusing the existing scenario + seed system (`ScenarioLoader`, `scenarios.ts`) for reproducible games.
- Make **animation pacing injectable**: replace hardcoded `setTimeout(800/1500ms)` delays inside operations (`ArmourOperation`, `PassOperation`, `FoulOperation`, `BounceOperation`, etc.) with a delay/presentation strategy that is a no-op headless and unchanged in the browser.
- Add **headless engine tests**: full-game and per-phase tests that run through the JSON protocol with seeded RNG, forming the regression safety net for later refactors (god-controller breakup, docs migration).
- Non-breaking for the browser game: the Phaser UI keeps working against the same `ServiceContainer`/`IGameService`; this change only adds a second front end and removes hidden couplings.

## Capabilities

### New Capabilities

- `headless-engine`: Constructing and running a complete game (setup → kickoff → turns → scoring → game over) from Node via `ServiceContainer`/`IGameService` with deterministic seeded RNG and no Phaser/DOM dependency, including injectable presentation delays (no-op headless).
- `game-state-serialization`: JSON-serializable snapshots of `GameState` (including `Set`/`Map` turn data), round-trippable for save/replay, stable field naming for external consumers.
- `action-protocol`: JSON command/response protocol for playing the game — enumerate legal actions for the active team/player, submit actions, receive resulting events and dice outcomes.
- `console-runner`: CLI front end that prints pitch/state (text and `--json` mode) and accepts commands interactively or from a scripted move list, with scenario + seed selection.

### Modified Capabilities

<!-- none — openspec/specs/ is currently empty; all capabilities in this change are new -->

## Impact

- **New code**: `src/headless/` (or similar) entry point, CLI runner script, state serializer, legal-action enumerator.
- **Modified code**: operations in `src/game/operations/` (delay injection), `src/services/GameService.ts` / `ServiceContainer.ts` (construction without window/eventBus globals, delay strategy wiring), `src/types/GameState.ts` (serialization boundary).
- **Untouched**: Phaser scenes, React UI, `GameplayInteractionController` (its breakup is a separate follow-up change).
- **Tests**: new `__tests__/headless/` suite; existing 31 test files unaffected.
- **Docs**: these four capability specs become the first entries in `openspec/specs/`, starting the migration away from the legacy `docs/` tree.
