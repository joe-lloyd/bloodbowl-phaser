# skill-rules

## ADDED Requirements

### Requirement: Skill rule registry with typed hook points
The system SHALL resolve a player's skills to rule objects via a central registry, invoking them at typed hook points in the roll paths (dodge, block dice count, block result application, pickup, catch, pass). A skill with no registered rule SHALL have no effect and SHALL NOT interrupt play. Rules SHALL live one-per-file; a `switch` over skill types is non-conforming.

#### Scenario: Inert skill does nothing
- **WHEN** a player has a catalog skill with no registered rule and takes any action
- **THEN** rolls and outcomes are identical to a player without that skill

#### Scenario: Adding a rule requires no manager changes
- **WHEN** a new skill rule is registered for an existing hook
- **THEN** its effect applies at that hook without modifications to managers or controllers

### Requirement: Coverage is reportable
The registry SHALL report which catalog skills have implemented rules and which are inert, so rulebook fidelity is measurable.

#### Scenario: Coverage query
- **WHEN** coverage is queried in a test
- **THEN** it lists implemented count, total catalog count, and the names of inert skills

### Requirement: Starter skills enforce 2025 rulebook behavior
The following SHALL be implemented per the Blood Bowl 2025 rulebook: **Block** (attacker not knocked down on Both Down), **Wrestle** (option to place both players prone without armour rolls on Both Down), **Dodge** (dodge reroll; interaction with Defender Stumbles), **Sure Hands** (pickup reroll), **Catch** (catch reroll), **Pass** (pass reroll).

#### Scenario: Block vs Both Down
- **WHEN** a Both Down result is applied and the attacker has Block but the defender does not
- **THEN** only the defender is knocked down and no turnover occurs for the attacker's team

#### Scenario: Dodge skill offers a reroll
- **WHEN** a player with Dodge fails a dodge roll and has not used the skill this action
- **THEN** a reroll decision is offered before the failure is applied

### Requirement: Skill effects are observable
Whenever a rule changes a roll, dice count, or result application, the system SHALL emit an event naming the player, skill, and effect, visible in browser logs and headless command responses.

#### Scenario: Skill trigger appears in headless events
- **WHEN** Block cancels an attacker knockdown during a headless block command
- **THEN** the command response events include the skill trigger with player and skill identified
