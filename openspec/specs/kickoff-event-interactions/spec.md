# kickoff-event-interactions

## Purpose

Define the kickoff events that require a coach to act before the kick resolves — Solid Defence, High Kick, Quick Snap and Charge! — including the single-ball airborne lifecycle they all share, how the kickoff waits for and can skip a coach's step, and who is allowed to act. See `kickoff-events` for the table roll and the non-interactive events.

## Requirements

### Requirement: The visual kickoff uses one ball and a strict lifecycle
The kickoff SHALL use one real ball through the complete sequence. After the
kicker and target square are selected, deviation SHALL move that ball to the
deviated square at an enlarged, semi-transparent scale to represent that it is
airborne without obscuring the square. The kickoff table SHALL then roll and
fully resolve while the ball remains enlarged and semi-transparent. Only after
resolution SHALL the ball animate back to normal scale and full opacity and
land. The landing SHALL then invoke the normal catch, bounce, or touchback
rules. A ghost or duplicate ball SHALL NOT be created. The camera SHALL remain
fixed in its existing gameplay view: kickoff SHALL NOT pan, zoom, track the
ball, or issue a compensating camera reset.

#### Scenario: Deviation does not land the ball
- **WHEN** the target is selected and kickoff deviation is calculated
- **THEN** the one real ball moves to the deviated square enlarged and semi-transparent, the camera does not move, and no catch or bounce is attempted

#### Scenario: The table resolves while the ball is airborne
- **WHEN** the deviated ball is enlarged above its square
- **THEN** the kickoff table rolls and any interactive result completes before the ball starts its landing animation

#### Scenario: Landing returns to normal ball handling
- **WHEN** the kickoff result has fully resolved
- **THEN** the same ball animates back to normal scale and full opacity and then attempts a catch if occupied or bounces according to the normal ball rules

### Requirement: The kickoff waits for a coach's event step
When a kickoff event requires the coach to act, the kickoff sequence SHALL pause at the correct point relative to the kick, present an informational event step to the owning coach in the bottom-right temporary-menu area, and resume only when that coach completes and confirms or skips it. Eligible players SHALL be highlighted and selected directly on the pitch. The step UI SHALL show event meaning, allowance/progress, confirm and skip, but SHALL NOT render a separate list of selectable players or bespoke action controls. A coach SHALL always be able to skip an optional step without selecting anyone.

#### Scenario: The kick waits for the step
- **WHEN** a kickoff event requiring coach input is rolled
- **THEN** the ball does not come to rest and play does not begin until that coach confirms or skips the step

#### Scenario: The camera remains fixed
- **WHEN** the kick deviates, the event step resolves, and the ball lands
- **THEN** the camera retains the same position and zoom for the entire sequence

#### Scenario: Skipping is always possible
- **WHEN** a coach is offered an event step and chooses to take no action
- **THEN** the step ends with no change and the kickoff continues

#### Scenario: Normal turn waits for the complete event
- **WHEN** an interactive event is selecting, re-placing, moving, or activating a player
- **THEN** the ball remains airborne and the receiving team's normal turn does not begin until the event is confirmed or skipped and all of its actions are complete

### Requirement: The event step UI always reflects current engine state
The kickoff event step's displayed selection progress (e.g. an x/x count) and, during Charge!, the currently active player and instructions SHALL always reflect the engine's current step state. A UI consumer polling or subscribing to the step SHALL observe every selection, move, placement, or Charge! advancement as it happens, not a stale snapshot from when the step began.

#### Scenario: The selection counter updates live
- **WHEN** a coach selects or deselects an eligible player during an event step
- **THEN** the displayed selection count updates to match immediately

#### Scenario: Charge!'s active player updates as the sequence advances
- **WHEN** Charge! advances from one selected player to the next
- **THEN** the displayed active player and instructions update to the new player without requiring the step to end first

### Requirement: The kickoff panel is positioned above hover/selection content and does not move
The kickoff event panel SHALL render above the selected-player and hovered-player info panels in the match HUD, in that top-to-bottom order: kickoff panel, then selected player, then hovered player. Showing or hiding hovered-player content SHALL NOT change the kickoff panel's position.

#### Scenario: Hovering a player does not move the kickoff panel
- **WHEN** a coach hovers a player while a kickoff event panel is shown
- **THEN** the kickoff panel's position is unchanged and the hovered player's info appears below the selected player's info

#### Scenario: Order is kickoff, then selected, then hovered
- **WHEN** a kickoff panel, a selected player, and a hovered player are all shown at once
- **THEN** they appear top to bottom in that order

### Requirement: Solid Defence repositions up to D3+1 kicking players directly on the pitch
On a result of 4, the kicking coach SHALL roll D3+1 and may redeploy up to that many of their own Open players. Each redeployment SHALL be one direct drag from the player's current pitch square to a legal new setup square, subject to all the normal setup restrictions for their team. A Solid Defence player SHALL NOT be sent to or staged in the Reserves box, and the coach SHALL NOT need to select every player before placing them. Only a successful drop SHALL spend one redeployment. The step SHALL resolve while the ball is airborne and before it lands.

#### Scenario: Players are dragged directly to their new squares
- **WHEN** the kicking coach drags an eligible player from its current pitch square to a legal setup square
- **THEN** that player moves directly to the destination, remains on the pitch throughout the interaction, and spends one Solid Defence redeployment

#### Scenario: No separate selection pass is required
- **WHEN** the kicking coach has a D3+1 allowance of three
- **THEN** the coach may drag and drop each chosen player in turn, then confirm after up to three successful redeployments without first choosing all three players

#### Scenario: Invalid drops do not spend the allowance
- **WHEN** the kicking coach drops a Solid Defence player on an illegal setup square
- **THEN** that player returns to its original square and the remaining redeployment count is unchanged

#### Scenario: Re-placement obeys setup restrictions
- **WHEN** the coach drags a Solid Defence player into a Wide Zone that already holds one of their players
- **THEN** the placement is refused with the restriction stated

#### Scenario: Only Open players may be selected
- **WHEN** the kicking coach attempts to select a prone or stunned player for Solid Defence
- **THEN** that player is not selectable

### Requirement: High Kick places a receiver under the ball
On a result of 5, one Open player on the receiving team MAY immediately be placed in the square the ball is going to land in. The step SHALL be offered after the kick's landing square is known and before the ball lands, and the destination square SHALL be shown to the coach.

#### Scenario: A receiver is moved under the kick
- **WHEN** the receiving coach selects an Open player for High Kick
- **THEN** the coach selects that player directly on the pitch and the player is placed in the ball's landing square before the ball arrives

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
- **THEN** the coach selects the player and destination directly on the pitch, the move is allowed with no dodge roll, and the player is not marked as having acted

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
- **THEN** those players are chosen directly on the pitch and activated one at a time through the normal player context menu and action window, each taking a free Move Action, and no other player may act

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
An event step SHALL be actionable only by the coach it belongs to — the kicking coach for Solid Defence and Charge!, the receiving coach for High Kick and Quick Snap. In an online match the other coach SHALL see the step's event/outcome text and SHALL see the owning coach's moves happen live on the board, but SHALL NOT be able to act in it, SHALL NOT see the step's Confirm/Skip controls, and SHALL NOT see the eligible-player or selected-player pitch highlight circles — those are specific to the owning coach's own interaction and would otherwise misrepresent what the passive coach can do.

#### Scenario: The opposing coach cannot act
- **WHEN** a Quick Snap step is open for the receiving coach in an online match
- **THEN** the kicking coach sees the step but cannot select or move any player

#### Scenario: The opposing coach sees no step controls
- **WHEN** an interactive kickoff event step is open in an online match
- **THEN** the non-owning coach's screen shows no Confirm or Skip buttons for that step

#### Scenario: The opposing coach sees no eligible/selected highlights
- **WHEN** an interactive kickoff event step is open in an online match
- **THEN** the non-owning coach's pitch shows no blue eligible-player or gold selected-player highlight circles for that step

#### Scenario: Both coaches see the outcome
- **WHEN** an event step completes
- **THEN** both coaches see the resulting board state

#### Scenario: The opposing coach watches the moves happen live
- **WHEN** the owning coach moves or places a player as part of resolving the step (e.g. Solid Defence redeployment, Quick Snap's one-square move)
- **THEN** that move is reflected on the non-owning coach's board as it happens, without requiring any action from them
