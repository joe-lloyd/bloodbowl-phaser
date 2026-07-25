# match-completion-flow

## ADDED Requirements

### Requirement: Game end is handled by the orchestrator
When the game reaches the `GAME_OVER` phase, the orchestrator SHALL handle the phase and resolve the match to a completed/result state. It SHALL NOT fall through to the default branch or log `No handler for phase: GAME_OVER`.

#### Scenario: Game reaches GAME_OVER
- **WHEN** play transitions to the `GAME_OVER` phase
- **THEN** the orchestrator resolves the match to a completed state and no unhandled-phase warning is logged

#### Scenario: Final result is surfaced
- **WHEN** the match completes
- **THEN** the final result (score / winner) is made available to the HUD rather than the game stalling with nothing happening
