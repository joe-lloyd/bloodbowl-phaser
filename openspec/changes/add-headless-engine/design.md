# Design: add-headless-engine

## Context

The engine core is already Phaser-free: `GameService` (implements `IGameService`), the managers (`TurnManager`, `MovementManager`, `BlockManager`, `BallManager`, `SetupManager`, `WeatherManager`), operations (`src/game/operations/`), validators (`src/game/validators/`), `GameFlowManager`/`GameOperation`, seeded `RNGService`, and `EventBus` (a plain TS emitter that explicitly replaced `Phaser.Events.EventEmitter`). `ServiceContainer` wires all of this up and takes teams + optional initial state + optional seed.

What blocks headless play today:

1. **Entry point** — the only way to construct and drive a game is through Phaser scenes (`GameScene`/`SandboxScene`) and `window.eventBus`.
2. **Pacing** — operations hardcode `await new Promise(r => setTimeout(r, 800))`-style delays for animation pacing (`ArmourOperation`, `PassOperation`, `FoulOperation`, `BounceOperation`, `CasualtyOperation`, `InjuryOperation`, `SendOffOperation`, `ArgueTheCallOperation`).
3. **Serialization** — `GameState.turn` uses `Set<string>` (activatedPlayerIds) and `Map<string, number>` (movementUsed), which serialize to `{}` under `JSON.stringify`.
4. **Decision points** — mid-action choices (block die selection, push direction, follow-up) are currently resolved by UI components listening on the EventBus; a headless driver needs those surfaced as explicit pending decisions.

## Guiding Philosophy

Be ruthless about deleting complexity when a simpler solution covers the same behavior. Features must not be lost — but code, indirection, wrappers, and half-abstractions that exist only because of how the code grew are fair game for removal rather than accommodation. When a task says "adapt X" and X turns out to be needless complexity, prefer replacing X outright over building around it. Applies to this change and every follow-up change in the refactor.

## Goals / Non-Goals

**Goals:**

- Run a complete seeded game of Blood Bowl Sevens from Node with no Phaser/DOM.
- A JSON protocol (state snapshot + legal actions + commands) good enough for an AI agent to play without reading engine source.
- A console runner for humans/scripts, reusing `ScenarioLoader`/`scenarios.ts`.
- Headless test suite that doubles as the regression safety net for the follow-up refactors.
- Zero behavior change in the browser game.

**Non-Goals:**

- Building the AI player itself (the protocol enables it; the agent is separate).
- Breaking up `GameplayInteractionController` or `SceneOrchestrator` (separate change).
- Multiplayer/networking, replay persistence format stability, league play.
- Migrating the rest of `docs/` to OpenSpec (separate change).

## Decisions

### 1. Factory over singleton for headless construction

Add `createHeadlessGame(options)` in `src/headless/` that constructs `EventBus`, `RNGService(seed)`, `BlockResolutionService`, and `GameService` directly — bypassing the `ServiceContainer` singleton. The singleton stays for the browser (scenes depend on `ServiceContainer.getInstance()`), but headless tests need N independent games in one process without `reset()` choreography. Alternative considered: reuse the singleton with `reset()` between games — rejected because it makes parallel vitest cases and multi-game AI training loops fragile.

### 2. Injectable presentation delay

Introduce a `DelayProvider` (`(ms) => Promise<void>`) carried on `FlowContext` (which already flows into every `GameOperation.execute(context)`). Operations call `context.delay(800)` instead of raw `setTimeout`. Browser wiring passes the real-timer implementation; headless passes a resolved-immediately no-op. Alternative considered: fake timers in tests only — rejected because the CLI (not just tests) needs real-time-free execution, and fake timers don't help an interactive CLI session.

### 3. Snapshot serializer, not state refactor

Add `serializeGameState(state, teams): GameSnapshot` and `deserializeGameState(snapshot)` in `src/headless/serialization.ts`. `Set`→array, `Map`→record; snapshot includes phase, subPhase, active team, turn data, score, weather, ball position, and per-player `{id, name, team, position(x,y), status, stats, skills, movementUsed}`. The in-memory `GameState` keeps `Set`/`Map` — converting the live type would touch every manager for no runtime benefit. Round-trip is required so scenarios/saves can restore a game.

### 4. Action protocol as a thin adapter over IGameService + validators

`src/headless/protocol.ts` defines a discriminated-union command type (`{type: "declare-action", playerId, action}`, `{type: "move", playerId, path}`, `{type: "block", ...}`, `{type: "pass", ...}`, `{type: "foul", ...}`, `{type: "end-turn"}`, setup/kickoff commands, and decision replies). A `HeadlessGame` class dispatches commands to `IGameService`, collects events emitted on the EventBus during execution, and returns `{ok, events, snapshot, pendingDecision?}`. Legal-action enumeration reuses the existing validators (`ActionValidator`, `MovementValidator` via `getAvailableMovements`, `BlockValidator`, `FoulValidator`, `ActivationValidator`) rather than duplicating rules. Alternative considered: a parallel rules engine for legality — rejected as guaranteed drift.

### 5. Decision points become protocol turns

Where the flow currently pauses waiting for a UI event (block-die choice, push direction, follow-up), `HeadlessGame` listens for those request events and returns them as `pendingDecision` with the legal options; the next command must be the matching decision reply. This mirrors how the UI dialogs already work over the EventBus, so no engine control-flow changes — the headless driver is just another listener.

### 6. CLI via tsx

`src/headless/cli.ts`, run with `tsx` (new devDependency), exposed as `pnpm headless [--scenario <id>] [--seed <n>] [--json] [--script <file>]`. Text mode prints an ASCII pitch grid + prompt; `--json` mode reads one JSON command per line on stdin and writes one JSON response per line on stdout (the AI-facing mode). Alternative considered: vite-node — tsx is simpler and has no config coupling to the browser build.

## Risks / Trade-offs

- [Hidden UI couplings: an operation may emit an event only a UI component answers, stalling headless flow] → the full-game headless test runs with a watchdog timeout; every stall found gets promoted to an explicit `pendingDecision` in the protocol.
- [Validator drift: legal-action enumeration may claim an action is legal that `GameService` then rejects] → protocol responses always report rejection cleanly (`ok: false, reason`), and tests assert enumerate→execute consistency for each action type.
- [Two construction paths (singleton + factory) can drift] → factory is the single source of wiring; a follow-up can make `ServiceContainer` delegate to it. Keep both thin.
- [`GameplayInteractionController` orchestration (push selection, pass steps) lives UI-side, so some sequencing may be missing headless] → acceptable for this change: replicate the minimal sequencing in `HeadlessGame` decision handling and record gaps as requirements for the god-controller breakup change.

## Migration Plan

Additive change; no rollback concerns for the browser build. Land in increments on `main`: (1) delay injection + factory, (2) serializer, (3) protocol + legal actions, (4) CLI, (5) test suite. Each increment keeps `pnpm test` and `pnpm build` green.

## Open Questions

- Full inventory of decision-request events (block dice, push, follow-up, reroll prompts, apothecary?) — enumerate during implementation from `types/events.ts` and dialog components; each becomes a `pendingDecision` variant.
- Whether kickoff-event resolution requires interactive choices in Sevens rules or can auto-resolve headless (check `KickoffController`/rulebook).
