# player-conditions

## Purpose

Model named player conditions (Distracted, Rooted, Chomped) as first-class serialized player state distinct from status, applied and cleared through one engine-owned mechanism, and enforce each condition's 2025-rulebook effect on tackle zones, movement, and marking.

## Requirements

### Requirement: Conditions are first-class serialized player state
The system SHALL model named player conditions (initially Distracted, Rooted, Chomped) as state on the player, distinct from status (Standing/Prone/Stunned), included in game-state serialization and headless snapshots, and announced via player-changed events when gained or cleared. Rules SHALL apply and clear conditions through this one mechanism; ad-hoc boolean flags per trait are non-conforming.

#### Scenario: Condition visible to headless consumers
- **WHEN** a player becomes Distracted during a headless command
- **THEN** the command response events announce the change and the snapshot lists the condition on that player

#### Scenario: Condition expiry is engine-owned
- **WHEN** a condition's book-defined expiry moment occurs (e.g. the Distracted player is next activated)
- **THEN** the condition clears without any skill rule running

### Requirement: Distracted players lose their defensive presence
A Distracted player SHALL have no Tackle Zone, SHALL NOT count as Marking opponents, and SHALL NOT provide offensive or defensive assists, per the 2025 rulebook's Distracted definition (exact wording verified against the book at implementation). The condition SHALL clear at the book-defined moment.

#### Scenario: Distracted player does not hinder a dodge
- **WHEN** an opponent dodges out of a square adjacent only to a Distracted player
- **THEN** no marked-square modifier or marking reaction applies to the dodge

#### Scenario: Distracted player provides no assist
- **WHEN** assists are counted for a block adjacent to a Distracted team-mate
- **THEN** the Distracted player is excluded from the assist count

### Requirement: Rooted players cannot leave their square
A Rooted player SHALL NOT perform Move Actions, follow up after a Block Action, be Pushed Back, or leave their square for any reason except being Knocked Out or suffering a Casualty. The condition SHALL end at the end of the drive or when the player is Knocked Down or Placed Prone.

#### Scenario: Push against a Rooted player
- **WHEN** a block result would push a Rooted player back
- **THEN** the player remains in their square and the remainder of the result (knockdown, armour) applies where they stand

#### Scenario: Rooted ends on knockdown
- **WHEN** a Rooted player is Knocked Down
- **THEN** the Rooted condition is removed

### Requirement: Chomped players are pinned while marked by the chomper
A Chomped player SHALL NOT leave their square while the player who Chomped them remains Marking them, and the condition SHALL end immediately when that player is no longer Marking them for any reason.

#### Scenario: Chomper is pushed away
- **WHEN** the chomping player is pushed out of the Chomped player's adjacent squares
- **THEN** the Chomped condition is removed at once
