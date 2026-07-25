# kickoff-event-interactions

## ADDED Requirements

### Requirement: The kickoff waits for a coach's event step
When a kickoff event requires the coach to act, the kickoff sequence SHALL pause at the correct point relative to the kick, present the step to the owning coach, and resume only when that coach confirms or skips it. A coach SHALL always be able to skip an optional step without selecting anyone.

#### Scenario: The kick waits for the step
- **WHEN** a kickoff event requiring coach input is rolled
- **THEN** the ball does not come to rest and play does not begin until that coach confirms or skips the step

#### Scenario: Skipping is always possible
- **WHEN** a coach is offered an event step and chooses to take no action
- **THEN** the step ends with no change and the kickoff continues

### Requirement: Solid Defence re-sets up to D3+1 kicking players
On a result of 4, the kicking coach SHALL roll D3+1 and may select up to that many of their own Open players. The selected players SHALL be removed from the pitch and set up again, subject to all the normal setup restrictions for their team. The step SHALL resolve before the ball is kicked.

#### Scenario: Selected players are re-placed
- **WHEN** the kicking coach selects three players under a D3+1 of three
- **THEN** those three players are removed from the pitch and must be placed again before the kick

#### Scenario: Re-placement obeys setup restrictions
- **WHEN** the coach re-places a Solid Defence player into a Wide Zone that already holds one of their players
- **THEN** the placement is refused with the restriction stated

#### Scenario: Only Open players may be selected
- **WHEN** the kicking coach attempts to select a prone or stunned player for Solid Defence
- **THEN** that player is not selectable

### Requirement: High Kick places a receiver under the ball
On a result of 5, one Open player on the receiving team MAY immediately be placed in the square the ball is going to land in. The step SHALL be offered after the kick's landing square is known and before the ball lands, and the destination square SHALL be shown to the coach.

#### Scenario: A receiver is moved under the kick
- **WHEN** the receiving coach selects an Open player for High Kick
- **THEN** that player is placed in the ball's landing square before the ball arrives

#### Scenario: The landing square is shown
- **WHEN** the High Kick step opens
- **THEN** the square the ball will land in is indicated on the pitch

#### Scenario: High Kick may be declined
- **WHEN** the receiving coach declines the High Kick step
- **THEN** the ball lands in its square with no player moved

### Requirement: Quick Snap moves up to D3+1 receiving players one square
On a result of 9, the receiving coach SHALL roll D3+1 and may select up to that many of their own Open players. Each selected player MAY move exactly one square in any direction, including into the opposition's half, without a dodge and without using their activation for the coming turn. A move into an occupied or off-pitch square SHALL be refused.

#### Scenario: A player steps across the line
- **WHEN** a Quick Snap player moves one square into the opposition's half
- **THEN** the move is allowed with no dodge roll and the player is not marked as having acted

#### Scenario: Only one square each
- **WHEN** a coach attempts to move a Quick Snap player a second square
- **THEN** the second move is refused

#### Scenario: Occupied squares are refused
- **WHEN** a coach attempts to move a Quick Snap player into an occupied square
- **THEN** the move is refused

### Requirement: Charge! gives up to D3+1 kicking players a free activation
On a result of 10, the kicking coach SHALL roll D3+1 and may select up to that many of their own Open players. The selected players SHALL then be activated one at a time, exactly as in their team's turn, each performing a free Move Action. Within the sequence, one selected player MAY instead perform a free Blitz Action, one MAY instead perform a free Throw Team-mate Action, and one MAY instead perform a free Kick Team-mate Action.

#### Scenario: Selected players activate in sequence
- **WHEN** the kicking coach selects three players for Charge!
- **THEN** those players are activated one at a time, each taking a free Move Action, and no other player may act

#### Scenario: One free Blitz is available
- **WHEN** one Charge! player performs a free Blitz Action
- **THEN** no other Charge! player in this sequence may perform a Blitz Action

#### Scenario: Charge! does not consume the coming turn
- **WHEN** the Charge! sequence ends and the kicking team's first turn begins
- **THEN** the players that acted during Charge! are able to activate normally

### Requirement: Charge! ends when a selected player goes down
If a player selected for Charge! Falls Over or is Knocked Down during their activation, the Charge SHALL end immediately and no further selected players SHALL be activated.

#### Scenario: A knockdown stops the charge
- **WHEN** the second of three Charge! players is knocked down during their free Blitz
- **THEN** the third player is not activated and the Charge ends

#### Scenario: Falling over stops the charge
- **WHEN** a Charge! player fails a dodge and falls over
- **THEN** the Charge ends with no further activations

### Requirement: Only the owning coach may act in an event step
An event step SHALL be actionable only by the coach it belongs to — the kicking coach for Solid Defence and Charge!, the receiving coach for High Kick and Quick Snap. In an online match the other coach SHALL see the step and its outcome but SHALL NOT be able to act in it.

#### Scenario: The opposing coach cannot act
- **WHEN** a Quick Snap step is open for the receiving coach in an online match
- **THEN** the kicking coach sees the step but cannot select or move any player

#### Scenario: Both coaches see the outcome
- **WHEN** an event step completes
- **THEN** both coaches see the resulting board state
