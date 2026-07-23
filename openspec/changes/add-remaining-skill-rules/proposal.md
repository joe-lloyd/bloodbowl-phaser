# Proposal: add-remaining-skill-rules

## Why

77 of the 108 catalog skills have enforced rules; 30 are still inert (Insignificant is a deliberate draft-list-only allowlist). These 30 are the last blank spots — the whole Devious/fouling column, the Jump/Leap movement family, the passing-reaction skills, the special-action weapons (Chainsaw, Bombardier, Ball & Chain, Punt), and a handful of agility/strength/mutation/trait leftovers. Landing them finishes the "plays exactly like the board game" goal for the skill system and closes the coverage gate at the full catalog.

## What Changes

- **Implement the final 30 skills**, one rule file per family, wording verified against `docs/rulebook/skills.json`, registered in `registerBuiltinSkills`, each riding the existing framework (trigger contexts, reroll machinery, decision channel, flow-queue operations).
- **A few new engine seams**, added only with the batch that first consumes them:
  - Foul-path triggers on `FoulOperation` (armour/injury post-roll modifier, failed-armour reroll, send-off modification, offensive-assist eligibility) for the Devious batch.
  - A Jump/Leap movement mechanic (jump over one adjacent square, Agility Test with modifiers) for Leap / Pogo / Very Long Legs.
  - Pass-reaction triggers (opponent declares a Pass) for On the Ball and Dump-Off, and an intercept-suppression flag for Cloud Burster / Hail Mary Pass.
  - An end-of-Drive send-off pass for Secret Weapon (and the Saboteur reaction that depends on it).
  - A Leader team-reroll grant at the start of each half.
- **Four special-action subsystems as flow-queue operations** with protocol + browser wiring so they are AI-playable and manually testable: Chainsaw Attack, Throw Bomb (Bombardier), Ball & Chain forced move, and Punt.
- **Every rule ships seeded catalog configurations** in `src/data/ruleScenarios/*` (the sandbox rule explorer + CLI `--rule` manual-test path) **and headless tests** locking each book clause, so the `rule-test-coverage` gate advances in lockstep.
- **End state**: `SkillRegistry.coverage()` reports 107 implemented + Insignificant allowlisted; the inert catalog list is empty; the gate snapshot in `gate.test.ts` reads the full set.

## Capabilities

### New Capabilities

<!-- none: this change fills out behavior under existing capabilities -->

### Modified Capabilities

- `skill-rules`: extend "Every catalog skill enforces 2025 rulebook behavior" to the final 30 skills, and add the new trigger points/subsystems (foul-path triggers, Jump/Leap movement, pass-reaction triggers, special-action weapon operations, end-of-Drive send-off, Leader reroll) under the established contract.
- `action-protocol`: add the declarable/reaction actions the new skills need — Jump/Leap moves, Chainsaw Attack, Throw Bomb, Punt, Multiple Block, foul-with-skills, and the Dump-Off / On the Ball reaction moves — exposed through both the browser controller and the headless JSON protocol.

## Impact

- **New code**: 30 rule files under `src/game/skills/rules/`; new trigger contexts in `SkillRule.ts` (foul-path, pass-declared reaction, jump); new flow operations (`ChainsawAttackOperation`, `ThrowBombOperation`, `BallAndChainMoveOperation`, `PuntOperation`, `JumpMove`, `MultipleBlockOperation`, `SecretWeaponSendOff`); protocol commands for each new action.
- **Modified code**: `FoulOperation`/`FoulValidator` (foul-path folds), `MovementManager`/`MovementValidator` (Jump), `PassController`/`InterceptionController` (pass-reaction + intercept suppression), `BlockManager` (Multiple Block, Pile Driver, Hit and Run follow-on), `TurnManager`/`DriveManager` (Leader reroll, end-of-Drive send-off), `computeActionAvailability`, `registerBuiltinSkills`, headless action protocol, and the browser `GameplayInteractionController`.
- **Data/tests**: catalog configuration sets per rule in `src/data/ruleScenarios/*`; new headless tests under `__tests__/headless/rules/`; the `gate.test.ts` coverage snapshot bumped from 77 to 107 as batches land.
- **Dependencies between skills**: Saboteur needs Secret Weapon; Bullseye needs Throw Team-mate; Lethal Flight needs Right Stuff (all three prerequisites already implemented). Batches are otherwise independent — a stalled subsystem blocks nothing else.
- **Out of scope**: Star Player special rules, inducements, prayers, kickoff-event rework; AI strategy for the new decisions (agents keep decline-by-default).
