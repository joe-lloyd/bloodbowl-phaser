## ADDED Requirements

### Requirement: A non-controlled team never shows a blanket team-turn highlight in an online match
In an online match, a coach SHALL NOT see the blanket "active team" white square highlight on any player of the team they do not control. This applies regardless of whose turn it is. The yellow (prone) and orange (stunned) status border colors, and the reduced-opacity treatment for players who have already been activated this turn, are status information rather than team-selectability and SHALL continue to render for both teams exactly as before.

#### Scenario: Opponent's turn shows no blanket highlight
- **WHEN** it becomes the opposing team's turn in an online match
- **THEN** none of that team's players show the white active-team square highlight on the local coach's screen

#### Scenario: My own team is unaffected
- **WHEN** it is the local coach's own team's turn
- **THEN** their own players show the white active-team square highlight exactly as before

#### Scenario: Status borders are unaffected
- **WHEN** an opposing player is Prone or Stunned
- **THEN** their yellow or orange status border still renders regardless of who controls that team

#### Scenario: Offline/local play is unaffected
- **WHEN** a match is played locally with no online match active
- **THEN** the active team's white square highlight renders for whichever team's turn it is, exactly as before

### Requirement: A single live indicator shows the opposing coach's current selection
In an online match, the local coach SHALL see a distinct live indicator (a red ring) on at most one player of the opposing team at a time: the player the opposing coach currently has selected. This indicator SHALL update as the opposing coach changes their selection or deselects, and is independent of the local coach's own selection highlighting.

#### Scenario: A red ring appears on the opponent's selected player
- **WHEN** the opposing coach selects one of their own players
- **THEN** the local coach's board shows a red ring on that specific player and no other opposing player

#### Scenario: The indicator moves with the opponent's selection
- **WHEN** the opposing coach selects a different one of their own players
- **THEN** the red ring moves from the previous player to the newly selected one

#### Scenario: The indicator clears on deselection
- **WHEN** the opposing coach deselects their player
- **THEN** the red ring no longer appears on the board

#### Scenario: The indicator does not interfere with local selection
- **WHEN** the local coach has one of their own players selected while the opposing coach also has a player selected
- **THEN** both the local yellow selection highlight and the opponent's red ring render independently without one clobbering the other
