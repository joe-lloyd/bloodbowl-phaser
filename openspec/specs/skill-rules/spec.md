# skill-rules

## Purpose

Enforce the 2025 rulebook's skills and traits through a central registry of one-per-file rules invoked at typed trigger points, composing with the reroll machinery, reacting-team decisions, and the flow queue — so every catalog skill's behaviour is implemented, observable, and verifiable in browser, CLI, and tests alike.

## Requirements

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

### Requirement: Every catalog skill enforces 2025 rulebook behavior
Every skill and trait in the reconciled catalog SHALL have a registered rule enforcing the 2025 rulebook's text for it (verified against the book-derived data file at implementation time), invoked through the framework's trigger points, reroll machinery, decision channel, or flow-queue operations. On completion the registry's coverage report SHALL list zero inert catalog skills, and any deliberate exclusion SHALL be an explicit allowlist entry, not an omission.

#### Scenario: Coverage reaches the full catalog
- **WHEN** the coverage report runs after the final batch
- **THEN** implemented equals the catalog total and the inert list is empty (or contains only allowlisted exclusions)

#### Scenario: A batch cannot land unverified
- **WHEN** a batch registers rules without rule-scenario catalog configurations for them
- **THEN** the rule-test-coverage gate fails naming those skills

### Requirement: New trigger points arrive with their first consumer
Trigger points beyond the original six (injury roll, assist counting, activation declared, opponent movement, foul resolution, …) SHALL be added only in the batch that first consumes them, SHALL follow the established contract (deterministic all-participant gather, context mutation, decisions via the one channel, flow effects via the queue), and SHALL be exercised by at least two rules or a rule plus a seeded framework test when introduced.

#### Scenario: Opponent-movement trigger lands with its consumers
- **WHEN** the marking-reactions batch introduces the opponent-movement trigger
- **THEN** Shadowing-class and Tentacles-class rules consume it in the same batch, with catalog configurations proving a marked player's escape is affected

### Requirement: Book-noted skill interactions are covered explicitly
Where the rulebook text of one skill names another (Tackle vs Dodge, Juggernaut vs Wrestle/Stand Firm/Fend, Block vs Wrestle, …), the interaction SHALL have its own catalog configuration and outcome, owned by whichever skill lands second.

#### Scenario: Juggernaut cancels Stand Firm on a Blitz
- **WHEN** Juggernaut lands (after Stand Firm) and a Blitz block pushes a Stand Firm player
- **THEN** a catalog configuration verifies Stand Firm cannot be used against it, per the book

### Requirement: Parameterized families read their instance value
A rule for a parameterized family (Loner (X+), Mighty Blow (+X), …) SHALL read the concrete value from the skill instance so one registered rule serves all printed variants.

#### Scenario: Loner threshold honored per player
- **WHEN** players with Loner (3+) and Loner (5+) each attempt to use a team reroll
- **THEN** each rolls against their own threshold from the same registered rule
