# Tasks: add-headless-engine

## 1. Delay injection (unblocks everything, zero behavior change)

- [x] 1.1 Add `DelayProvider` type and a `delay(ms)` member to `FlowContext` in `src/game/core/GameFlowManager.ts`; default to real `setTimeout` so browser behavior is unchanged
- [x] 1.2 Replace every hardcoded `await new Promise((resolve) => setTimeout(resolve, N))` in `src/game/operations/*.ts` (Armour, Pass, Foul, Bounce, Casualty, Injury, SendOff, ArgueTheCall) with `await context.delay(N)`
- [x] 1.3 Grep for any remaining raw `setTimeout` pacing in managers/controllers used by `GameService` and route them through the provider (also injected DelayProvider into GameService, BallManager, SetupManager, TurnManager fire-and-forget sequencing)
- [x] 1.4 Run existing test suite + `pnpm build` to confirm no regressions — 302/302 tests pass; DISCOVERED: `pnpm build` (tsc) was already broken on main with 95 pre-existing errors (none in files touched by this change; identical error set before/after). Tracked as task 7.0.

## 2. Headless factory

- [x] 2.1 Create `src/headless/createHeadlessGame.ts`: construct `EventBus`, `RNGService(seed)`, `BlockResolutionService`, `GameService` directly (no `ServiceContainer` singleton, no `window`), wiring the no-op delay provider
- [x] 2.2 Support initialization from a scenario definition — extracted pure `applyScenario(scenario, team1, team2): GameState` from `ScenarioLoader.load` (also fixed its missing `coachesEjected`/`activePlayer` fields, one of the pre-existing tsc errors)
- [x] 2.3 Moved `TestTeamFactory` → `src/game/TeamFactory.ts` (class renamed `TeamFactory`; it was pure already, just mis-filed under controllers); updated `SandboxScene`
- [x] 2.4 Tests in `__tests__/headless/createHeadlessGame.test.ts`: independence of two games in one process, identical seeds ⇒ identical dice + identical pickup results, scenario init, scenario-seed fallback (7 tests)

## 3. State serialization

- [x] 3.1 Create `src/headless/serialization.ts` with `GameSnapshot` type, `serializeGameState`, `deserializeGameState`, plus `applySnapshotToTeams` (player placement/status live on Team objects); `createHeadlessGame` gained an `initialState` option for restores
- [x] 3.2 Tests in `__tests__/headless/serialization.test.ts`: JSON round-trip deep-equality, turn data fully represented, Set/Map restore, mid-turn save/restore plays identically, stable field names (5 tests)

## 4. Action protocol

- [x] 4.1 Command union + response types in `src/headless/protocol.ts` (also queries `state`/`legal-actions`, and `coin-flip` since the browser coin flip is UI-only)
- [x] 4.2 `HeadlessGame` class: dispatches to `IGameService`, subscribes to every `GameEventNames` value (no wildcard on EventBus), returns `{ok, events, snapshot, pendingDecision, reason?}`, `settle()` drains noDelay chains, shape-validates commands before touching state
- [x] 4.3 Decision inventory: engine-driven decisions are `BlockDiceRolled` → block-dice, `UI_SelectPushDirection` → push-direction, `PlayerMoved.followUpData` → follow-up. Coin flip is UI-driven (became a seeded command); `UI_RequestConfirmation` is a UI nicety (a headless command is its own confirmation); no reroll/apothecary prompt events exist in the engine yet. Command gating implemented.
- [x] 4.4 Legal-action enumeration via `canActivate`, `getAvailableMovements`, adjacency for block/foul targets, once-per-turn flags (blitz/pass/handoff/foul), ball possession for pass/handoff
- [x] 4.5 Tests in `__tests__/headless/HeadlessGame.test.ts`: malformed rejection with state untouched, queries, enumerate→execute move consistency, full block decision chain with gating, reply-without-pending rejection, failed-pickup turnover with team switch (6 tests)

## 5. Console runner

- [x] 5.1 Added `tsx` devDependency and `pnpm headless` script; `src/headless/cli.ts` with `--scenario`, `--seed`, `--json`, `--script`, `--help`. DISCOVERED+FIXED: `ScenarioLoader` pulled `ServiceContainer`→`SoundManager`→`@strudel/web` which crashes plain Node — `applyScenario` moved to its own module `src/game/applyScenario.ts`
- [x] 5.2 Text mode: ASCII pitch (A/B + number, `*` for downed, `o` ball) using `GameConfig.PITCH_WIDTH/HEIGHT`, status line, event echo, `help`, `state`/`legal` shortcuts
- [x] 5.3 JSON mode: JSON-lines stdin/stdout; `console.*` rerouted to stderr in json/script modes (note: invoke as `pnpm --silent headless` — pnpm's own banner otherwise pollutes stdout)
- [x] 5.4 Script mode with 30s watchdog per command; verified exit 0 on good script, exit 1 on rejected command

## 6. Headless full-game tests (regression safety net)

- [x] 6.1 `__tests__/headless/fullGame.test.ts`: deterministic bot plays a complete seeded match (coin flip → placements → kickoff → both halves → GAME_OVER) with a 600-command cap as watchdog; determinism test (same seed twice ⇒ same score + command count). DISCOVERED+FIXED missing engine features required by the spec: HALFTIME was a dead end (added second-half setup with kicking-team swap + turn-count reset in `TurnManager.endHalf`), GAME_OVER was never set (added), touchdown detection didn't exist anywhere (`addTouchdown` was dead code — wired via `MovementManager.onTouchdown` callback; fixed `isInEndZone` which still checked the old vertical pitch orientation), and `ReadyToStart→startGame` only existed in the UI (mirrored in `HeadlessGame`)
- [x] 6.2 Per-phase coverage: setup/confirm + kickoff (full-match bot), move+dodge (bot turns), block chain incl. armour (block decision test), pass (pass-test scenario), foul + armour roll (foul-test scenario), pickup turnover, touchdown + next-drive reset
- [x] 6.3 Stall fixes were the engine gaps in 6.1; no new pendingDecision types emerged (specs unchanged)
- [x] 6.4 `scripts/headless-smoke.jsonl` known-good script (replay verified, exit 0). DISCOVERED+FIXED: generated team ids embedded `Date.now()` making scripts non-replayable — headless default teams now get stable ids (`team1`, `team1-player-N`)

## 7. Wrap-up

- [ ] 7.0 Restore `pnpm build` to green: 93 pre-existing tsc errors remain (was 95; this change fixed 2 in passing), all in UI-layer files this change doesn't touch — DEFERRED to its own OpenSpec change (`fix-typecheck-build`) since the proposal declares the React/Phaser UI out of scope
- [ ] 7.1 Verify browser game unchanged: tsc error set is strictly smaller than baseline and none touch changed files; NEEDS USER: manual smoke of a drive in the Phaser UI (pacing delays still present; note the browser also *gains* touchdown scoring, halftime → second half, and game over, which never worked before)
- [x] 7.2 Full test suite 325/325 green (31 pre-existing files + 4 headless suites, 23 new tests), eslint clean on all changed files, prettier applied
- [ ] 7.3 `openspec validate` passes; archive via `/opsx:archive` once the user confirms the browser smoke (specs promote to `openspec/specs/`)
