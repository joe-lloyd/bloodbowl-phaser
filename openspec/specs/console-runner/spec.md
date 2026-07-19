# console-runner

## Purpose

Provide a CLI that runs a headless game — a human-readable text mode for interactive play and a strict line-delimited JSON mode so an AI agent can be piped directly to the engine over stdio, plus scripted replay for regression.

## Requirements

### Requirement: CLI entry point
The system SHALL provide a CLI (`pnpm headless`) that starts a headless game with options for scenario id (`--scenario`), RNG seed (`--seed`), output mode (`--json`), and scripted input (`--script <file>`). Without options it starts a default match between two generated test teams.

#### Scenario: Start with scenario and seed
- **WHEN** `pnpm headless --scenario basic-scrimmage --seed 42` is run
- **THEN** the CLI starts, prints the initial game state, and awaits commands

### Requirement: Human-readable text mode
In text mode the CLI SHALL render the pitch as an ASCII grid (players by team marking and number, ball position, downed/stunned status), print the score/turn/phase line, echo dice results and events as they occur, and accept typed commands with a help listing.

#### Scenario: State rendered after each command
- **WHEN** a move command completes in text mode
- **THEN** the CLI re-renders the pitch showing the player's new square and prints the events that occurred

### Requirement: Machine JSON mode
With `--json`, the CLI SHALL read one JSON command per line on stdin and write exactly one JSON response per line on stdout (response format per the action-protocol capability), with no non-JSON output on stdout, so an AI agent can be piped directly to the game.

#### Scenario: AI plays over stdio
- **WHEN** a process pipes protocol commands line-by-line into `pnpm headless --json --seed 7`
- **THEN** each line of stdout parses as a single JSON response containing `ok`, events, snapshot, and any `pendingDecision`

#### Scenario: Diagnostics kept off stdout
- **WHEN** the engine logs diagnostics (e.g. flow execution logs) in JSON mode
- **THEN** they are suppressed or routed to stderr, never interleaved into stdout responses

### Requirement: Scripted replay
The CLI SHALL execute a command script file (one JSON command per line) to completion, reporting each response, and exit non-zero if any command is rejected or the game stalls.

#### Scenario: Regression script passes
- **WHEN** a known-good script for a seeded full match is run with `--script`
- **THEN** the CLI exits 0 with the expected final score in the last response
