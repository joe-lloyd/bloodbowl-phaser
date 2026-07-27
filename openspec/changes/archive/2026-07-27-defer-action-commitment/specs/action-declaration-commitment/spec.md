## ADDED Requirements

### Requirement: A declared action is provisional until it commits

Declaring an action SHALL NOT consume the team's once-per-turn allowance for that action. The declaration SHALL become committed at the first of: a die rolled for that activation, movement used by the declaring player, an attack or block replacement spent, the activation being finalized, or an activation gate being rolled. The team's `hasBlitzed`, `hasPassed`, `hasHandedOff`, and `hasFouled` flags SHALL be set at commitment, not at declaration.

#### Scenario: Declaring a Blitz does not spend the team Blitz
- **WHEN** a coach declares a Blitz for a player and no die has been rolled and no square moved
- **THEN** the team's Blitz for the turn is still available

#### Scenario: The first step commits the Blitz
- **WHEN** the blitzing player moves one square
- **THEN** the team's Blitz is spent for the turn and cannot be released

#### Scenario: Rolling for the action commits it
- **WHEN** the first die of the declared action is rolled
- **THEN** the declaration is committed regardless of the result

### Requirement: An uncommitted declaration is released by changing your mind

While a declaration is uncommitted, selecting a different player, deselecting, or declaring a different action for the same player SHALL release it: the declaration is discarded, the team's once-per-turn allowance is restored, and no player is marked as having been activated.

#### Scenario: Activating someone else releases the Blitz
- **WHEN** a coach declares a Blitz, changes their mind, and selects a different player of the same team
- **THEN** the first player has no declared action, is still available to activate, and the team's Blitz is available again

#### Scenario: Re-declaring replaces the action
- **WHEN** a coach declares a Blitz and then declares a Move for the same player before anything commits
- **THEN** the Move replaces the Blitz and the team's Blitz is available again

#### Scenario: Release is available to every client
- **WHEN** an uncommitted declaration is released by a networked guest or through the headless protocol
- **THEN** the host resolves the release authoritatively and every client shows the same restored allowance

### Requirement: A committed declaration cannot be released

An attempt to release, replace, or abandon a committed declaration SHALL be refused, the declaring player SHALL remain the active player, and the refusal SHALL state which commitment applies — dice already rolled, movement already used, or an attack already spent.

#### Scenario: Selecting another player after moving is refused
- **WHEN** a coach has moved the blitzing player one square and clicks another player of the same team
- **THEN** the selection change is refused with a message naming the movement already used, and the blitzing player remains active

#### Scenario: The spent Blitz stays spent
- **WHEN** a committed Blitz declaration is abandoned by any means
- **THEN** the team's Blitz remains spent for that turn

### Requirement: An activation gate commits the declaration when it rolls

When a declared action triggers an activation gate that rolls a die — Bone-head, Really Stupid, Take Root, Unchannelled Fury, Bloodlust — the declaration SHALL be committed before the roll is resolved, so it is binding whether the gate passes or fails, and the team's once-per-turn allowance SHALL be spent in both cases.

#### Scenario: A failed Bone-head still spends the Blitz
- **WHEN** a player with Bone-head declares a Blitz and fails the gate roll
- **THEN** the player becomes Distracted, their activation ends, and the team's Blitz is spent for the turn

#### Scenario: A gated declaration cannot be taken back
- **WHEN** a player with Really Stupid has rolled their gate and the coach tries to activate a different player instead
- **THEN** the attempt is refused and the gated player's activation stands

#### Scenario: An ungated declaration is still releasable
- **WHEN** a player with no activation gate declares a Blitz and rolls nothing
- **THEN** the declaration remains releasable
