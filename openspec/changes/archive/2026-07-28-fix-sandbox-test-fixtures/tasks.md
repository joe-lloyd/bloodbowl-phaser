## 1. Plain chain-push scenario fixture

- [x] 1.1 In `src/data/scenarios.ts`, pin `team1Roster: RosterName.HUMAN` and `team2Roster: RosterName.HUMAN` explicitly on the `chain-push` scenario, matching the pinning convention already used for `chain-push-grab-open`/`chain-push-grab-boxed`/`chain-push-grab-second-link`
- [x] 1.2 Run the existing `chain-push` headless test in `__tests__/headless/push-chain.test.ts` and confirm it still passes unchanged (Human was already the effective default there)

## 2. Sandbox default teams

- [x] 2.1 In `src/scenes/SandboxScene.ts`'s `init()` no-args branch, change the default team construction from Black Orc vs. Black Orc to Human (team1) vs. Orc (team2, `RosterName.ORC`, not `RosterName.BLACK_ORC`) — extracted to `src/scenes/sandboxDefaultTeams.ts` so the choice is independently unit-testable
- [x] 2.2 Update any team-name/label strings tied to the old "Test Black Orcs 1/2" default (e.g. team display names) so they reflect the new Human/Orc default consistently

## 3. Spec

- [x] 3.1 Add the `sandbox-rule-explorer` delta requirement (default matchup is never a mirror-match; Human vs. Orc) at `openspec/changes/fix-sandbox-test-fixtures/specs/sandbox-rule-explorer/spec.md`

## 4. Tests

- [x] 4.1 Added `__tests__/unit/sandboxDefaultTeams.test.ts` asserting the sandbox's no-args default teams are Human and Orc, never Black Orc, and never identical
- [x] 4.2 Run the full unit/headless suite and confirm no regressions
