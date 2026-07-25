# setup-player-inspection

## ADDED Requirements

### Requirement: Player information is shown while placing players
During setup, selecting or beginning to drag a player SHALL show that player's information panel with the same content available during play: name, number, position, MA/ST/AG/PA/AV, skills, and current status.

#### Scenario: Dragging a player from the dugout shows their info
- **WHEN** a coach begins dragging a player out of the Reserves box during setup
- **THEN** the player information panel shows that player's details

#### Scenario: Selecting a placed player shows their info
- **WHEN** a coach selects a player already positioned in the setup zone
- **THEN** the player information panel shows that player's details

### Requirement: Player information persists for the duration of the interaction
The panel SHALL remain populated while the player is being dragged and SHALL continue to show the last inspected player after the drag ends, until another player is inspected.

#### Scenario: Info stays visible through the drag
- **WHEN** a coach drags a player across the pitch during setup
- **THEN** the panel keeps showing that player throughout the drag rather than clearing on pointer move

#### Scenario: Info persists after placement
- **WHEN** a coach drops a player into the setup zone
- **THEN** the panel still shows that player until a different player is inspected

### Requirement: Inspection works for every setup-eligible player
Players in the Reserves box, players already placed, and players in the KO and Casualty boxes SHALL all be inspectable during setup, with the panel reporting their status.

#### Scenario: A knocked-out player can be inspected
- **WHEN** a coach clicks a player in the KO box during setup
- **THEN** the panel shows that player's details and reports their knocked-out status
