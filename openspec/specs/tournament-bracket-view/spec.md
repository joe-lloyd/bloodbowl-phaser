# tournament-bracket-view

## Purpose
Defines the presentation, layout, progression, and fixture interactions for single-elimination tournament brackets.

## Requirements

### Requirement: A single-elimination tournament renders as a cup bracket
A tournament in single-elimination format SHALL be presented as a mirrored bracket: the two halves of the draw advance inward round by round toward a central final, with the trophy shown at the centre. It SHALL NOT be presented as a flat list of rounds.

#### Scenario: An eight-team tournament shows a bracket
- **WHEN** a coach opens an eight-team single-elimination tournament
- **THEN** the quarter-finals are shown on the outside, the semi-finals inside them, and the final at the centre with the trophy

#### Scenario: A round-robin competition is unchanged
- **WHEN** a coach opens a round-robin tournament or a league
- **THEN** the existing standings table and fixture list are shown, not a bracket

#### Scenario: A very small draw degrades gracefully
- **WHEN** a tournament has fewer than four entrants
- **THEN** the view shows the fixtures directly rather than an empty bracket frame

### Requirement: Fixtures are connected to where their winner advances
Each fixture SHALL be visually connected to the fixture its winner advances into, so a coach can trace any entrant's path from their first tie to the final.

#### Scenario: A path can be traced to the final
- **WHEN** a coach follows the connectors from a first-round fixture
- **THEN** they reach the final through each intervening fixture

#### Scenario: Connectors match the recorded linkage
- **WHEN** the bracket is drawn
- **THEN** each connector follows the fixture's recorded next-fixture linkage rather than being inferred from position alone

### Requirement: Elimination and advancement are visible
An entrant knocked out SHALL be shown as eliminated. An entrant that has advanced SHALL be shown carrying into their next tie. The champion SHALL be shown at the centre when the tournament is complete.

#### Scenario: A losing team is marked eliminated
- **WHEN** a fixture completes and one team loses
- **THEN** that team is shown as eliminated in the bracket

#### Scenario: A winning team appears in its next tie
- **WHEN** a fixture completes
- **THEN** the winner is shown occupying its slot in the next tie

#### Scenario: The champion is shown
- **WHEN** the final completes
- **THEN** the champion is shown at the centre of the bracket with the trophy

### Requirement: Uneven draws and byes lay out correctly
A draw whose entrant count is not a power of two SHALL lay out correctly. A bye SHALL be shown as an automatic advance for the entrant receiving it, connected onward to its next tie, rather than as an empty fixture. An undecided slot SHALL be shown as undetermined.

#### Scenario: A five-team draw lays out
- **WHEN** a five-team single-elimination tournament is opened
- **THEN** the bracket lays out with the byes shown as automatic advances and every fixture correctly positioned

#### Scenario: An unplayed later round shows undetermined slots
- **WHEN** a later-round fixture's feeding ties have not completed
- **THEN** its slots are shown as undetermined

### Requirement: Fixture actions remain available in the bracket
Launching a fixture as a local or hosted match, and reporting a score, SHALL remain available from the bracket without navigating away. Actions SHALL be offered for fixtures that are ready to play.

#### Scenario: Launching a match from the bracket
- **WHEN** a coach selects a ready fixture in the bracket
- **THEN** they can launch it locally or as a hosted match from there

#### Scenario: Reporting a score from the bracket
- **WHEN** a coach selects a ready fixture in the bracket
- **THEN** they can enter and submit its score from there

#### Scenario: Actions do not clutter unready fixtures
- **WHEN** a fixture is not ready to play
- **THEN** it shows its entrants and status without launch or score controls

### Requirement: Bracket layout is derived by a testable pure function
The bracket's geometry — each fixture's round column, side of the draw, vertical position, and connector segments — SHALL be produced by a pure function from the fixtures and entrants, independent of rendering.

#### Scenario: Layout is computed without rendering
- **WHEN** the layout function is given a set of fixtures and entrants
- **THEN** it returns positions and connectors that can be asserted without a DOM

#### Scenario: Parent fixtures centre on their children
- **WHEN** a fixture is fed by two earlier fixtures
- **THEN** its vertical position is the midpoint of those two

### Requirement: A wide bracket scrolls within its own container
The bracket SHALL scroll horizontally inside its own container and SHALL NOT cause the page to scroll horizontally. On narrow screens it SHALL fall back to a round-by-round list.

#### Scenario: A large bracket does not break the page
- **WHEN** a sixteen-team bracket is displayed on a narrow window
- **THEN** the bracket scrolls within its container and the page body does not scroll horizontally

#### Scenario: Narrow screens get a readable fallback
- **WHEN** the viewport is too narrow for the bracket
- **THEN** the fixtures are presented as a round-by-round list instead
