## 1. Eligibility & helpers

- [x] 1.1 Add `isRightStuffEligible(player)` helper (`hasSkill(RIGHT_STUFF) && stats.ST <= 3`) in a shared, Phaser-free location and unit-test it
- [x] 1.2 Add a `throwTeammate` / `kickTeammate` field to `ActionAvailability` and compute it in `computeActionAvailability` (offer only when a reachable/adjacent Standing team-mate is Right-Stuff-eligible and the thrower has the matching trait)
- [x] 1.3 Unit-test the new action-availability branches (eligible mate, no eligible mate, ST>3 mate, missing trait)

## 2. Throw Team-mate operation core

- [x] 2.1 Create `ThrowTeammateOperation(throwerId, targetTeammateId, aimX, aimY, mode)` following `StabOperation`'s shape (finish-action operation queued at back of flow)
- [x] 2.2 Validate eligibility at resolution (thrower Standing + trait + TZ; target Standing, adjacent, Right-Stuff-eligible); reject cleanly otherwise
- [x] 2.3 Make the Passing Ability Test via `PassController` to the aim square; treat a natural 1 as a Fumbled Throw
- [x] 2.4 On success, scatter the thrown player from the aim square using the Scatter template (`BallMovementController.scatter`); place the player (not the ball) at the resolved square
- [x] 2.5 Make the Right Stuff landing roll (D6) at the final square: land Standing on success, Prone on failure; if the square is occupied, knock down both players (crash)
- [x] 2.6 Emit the appropriate UI/skill events (reuse pass/ball-flight and knockdown events) throughout the sequence

## 3. Fumble, kick, and turnover handling

- [x] 3.1 Throw fumble: drop the team-mate Prone in the thrower's square, queue an `InjuryOperation` for them, bounce the ball if the thrower carried it, cause a Turnover
- [x] 3.2 Kick Team-mate (`mode === "kick"`) fumble: remove the kicked player from play, queue an immediate `InjuryOperation`, cause a Turnover
- [x] 3.3 Encode turnover conditions explicitly (Prone landing / injured / removed / eaten / fumble → turnover; Standing-in-empty → no turnover)

## 4. Trait modifiers

- [x] 4.1 Apply Strong Arm as a positive PA modifier only when `mode === "throw"` (never for kick)
- [x] 4.2 Apply Swoop: use the Throw-in template (single-step scatter) for the thrown-player scatter and add +1 to the Right Stuff landing roll
- [x] 4.3 Give Always Hungry its active clause (resolved inline in `ThrowTeammateOperation`): pre-throw D6 eat check (2+ continue; 1 → follow-up D6: 2+ squirm-free ⇒ force fumble, 1 ⇒ eat, remove from roster with no apoth/regen, bounce carried ball, Turnover)

## 5. Registration & action wiring

- [x] 5.1 Register `THROW_TEAM_MATE`, `KICK_TEAM_MATE`, `RIGHT_STUFF`, `SWOOP`, `STRONG_ARM` rules in `src/game/skills/index.ts` (Always Hungry already registered — comment updated in place)
- [x] 5.2 Wire the Throw/Kick Team-mate Action into the browser controller (action menu → declare → enqueue `ThrowTeammateOperation`) — needs in-browser verification
- [x] 5.3 Wire the Action into the headless action protocol so it is AI/JSON-playable

## 6. Catalog, coverage & tests

- [x] 6.1 Add seeded catalog configurations for all six traits in `src/data/ruleScenarios/*` (unique ids, ≥1 outcome each)
- [x] 6.2 Update `__tests__/headless/rules/gate.test.ts`: add the traits to the implemented set and bump `cov.implemented` from 69 to 74 (Always Hungry was already counted, so 5 new registrations)
- [x] 6.3 Add headless tests locking each rule branch (eligibility gate, Strong-Arm-vs-kick, Swoop scatter+landing, throw fumble injure, kick fumble remove+injure, Always Hungry eat/squirm, turnover-on-prone vs no-turnover-on-standing) — driven by the catalog suite
- [x] 6.4 Run the full test suite and typecheck; record any fixes in `ai_notes.md` per the project workflow
