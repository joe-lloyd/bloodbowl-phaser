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

### Requirement: Reactive triggers gather rules from all participants

At each named trigger point the system SHALL gather registered rules from every player relevant to that moment — the acting player, the target, and adjacent opponents — not only the acting player. A rule SHALL be able to read and adjust the trigger context (participants, from/to squares, current result). Gathering order SHALL be deterministic so multi-skill interactions are reproducible.

#### Scenario: Opponent's skill affects the acting player's roll

- **WHEN** a player dodges away from an adjacent opponent who has a dodge-affecting skill (e.g. Tackle)
- **THEN** that opponent's rule modifies the dodging player's roll even though the opponent is not the acting player

#### Scenario: Inert reactive skill is transparent

- **WHEN** a reactive-category skill has no registered rule and its trigger point is reached
- **THEN** play proceeds exactly as if the skill were absent

### Requirement: Reactions surface as reacting-team decisions

A trigger that requires a coach's choice SHALL raise a pending decision whose chooser is the reacting player's team; the base action SHALL pause until it is answered and then resume. A declined reaction SHALL leave the base outcome unchanged and SHALL consume no dice.

#### Scenario: Reacting coach chooses whether to use a reactive skill

- **WHEN** a reactive skill's trigger condition is met (e.g. an opponent is pushed and the pushed player has Stand Firm)
- **THEN** only the reacting player's coach is offered the choice, and the base action resumes according to their answer

### Requirement: Flow-altering skills compose through the operation queue

A skill effect that adds or replaces steps (e.g. an extra block, a pre-action roll) SHALL enqueue an operation on the game flow queue rather than mutating the base rule inline, and SHALL emit a skill-trigger event. The base rule's own code SHALL remain unchanged.

#### Scenario: Skill adds a step without editing the base rule

- **WHEN** a flow-altering skill triggers during an action
- **THEN** the added step runs in order via the flow queue and a skill-trigger event is emitted, with the base rule unmodified

### Requirement: Coverage is reportable
The registry SHALL report which catalog skills have implemented rules and which are inert, so rulebook fidelity is measurable.

#### Scenario: Coverage query
- **WHEN** coverage is queried in a test
- **THEN** it lists implemented count, total catalog count, and the names of inert skills

### Requirement: Starter skills enforce 2025 rulebook behavior
The following SHALL be implemented per the Blood Bowl 2025 rulebook: **Block** (attacker not knocked down on Both Down), **Wrestle** (option to place both players prone without armour rolls on Both Down), **Dodge** (dodge reroll; interaction with Defender Stumbles), **Sure Hands** (pickup reroll), **Catch** (catch reroll), **Pass** (pass reroll), and one **reactive skill** — Stand Firm (the pushed player may refuse the push) or Diving Tackle (an adjacent opponent may drop prone to worsen a player dodging away) — exercising a reacting-team trigger decision.

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
