# Proposal: implement-all-skill-rules

## Why

8 of 126 catalog skills have enforced rules; the other 118 are inert, so most rosters play without their defining abilities and the game is not yet "exactly like the board game". The skill-rules framework (registry, trigger points, reroll/reaction decisions, flow-queue effects) exists precisely so these can land incrementally — this change is the campaign that lands all of them, batch by batch, each rulebook-verified and locked by rule-scenario catalog configurations.

## What Changes

- **A few new engine seams first**: rush (GFI) and interception rolls join the reroll machinery; injury-roll and activation-declared trigger points; an assist-counting hook (Guard/Defensive); foul-path triggers; an opponent-movement trigger (Shadowing/Tentacles-class). Added only as their consuming batch lands — no speculative hooks.
- **Every remaining skill implemented in mechanism batches** (movement/agility, ball handling, passing, block armour/injury, block dice/flow, marking reactions, negatraits/activation, fouling/Devious, and the big subsystems: Throw Team-mate, Chainsaw, Bombardier, Ball & Chain, Pogo Stick, Kick). One rule file per skill family, registered in `registerBuiltinSkills`, wording verified against the 2025 rulebook PDF at implementation time.
- **Every rule ships with catalog configurations** — the `rule-test-coverage` gate (from `add-rule-scenario-catalog`) makes an implemented-but-untested rule a CI failure, so book coverage and test coverage advance in lockstep, visible in the sandbox rule explorer.
- **End state**: `SkillRegistry.coverage()` reports zero inert catalog skills; the inert-list snapshot shrinks to empty.

## Capabilities

### New Capabilities

<!-- none: this change fills out behavior under the existing skill-rules capability -->

### Modified Capabilities

- `skill-rules`: extends "Starter skills enforce 2025 rulebook behavior" to the whole catalog — every catalog skill SHALL have a registered rule enforcing the book's text, with new trigger points added per batch. (Delta against the add-skill-rules-system spec, which is still in `openspec/changes/` — coordinate archiving order.)

## Impact

- **New code**: ~110 rule files under `src/game/skills/rules/` (one per family after `reconcile-skill-catalog` collapses variants), new trigger contexts in `SkillRule.ts`, new subsystem operations (throw team-mate chain, secret-weapon send-off, bomb/chainsaw resolution, kick deviation control) on the existing flow queue.
- **Modified code**: `MovementManager` (rush rerolls, movement triggers), `BlockValidator` (assist hook), `FoulOperation`/`InjuryOperation` (foul + injury triggers), `TurnManager`/`PlayerActionManager` (activation triggers for negatraits), `registerBuiltinSkills`.
- **Data/tests**: a catalog configuration set per rule in `src/data/ruleScenarios/`; the coverage-gate snapshot updated every batch.
- **Prerequisites**: `add-rule-scenario-catalog` (the verification loop) and `reconcile-skill-catalog` (final names/families) land first; batch membership may shift slightly after reconciliation but the union of batches covers every remaining skill.
- **Risk**: batches are independent; a stalled subsystem batch (e.g. Chainsaw) blocks nothing else.
