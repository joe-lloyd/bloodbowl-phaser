## ADDED Requirements

### Requirement: Sideline crew figures are inspectable on hover

Every rendered sideline crew figure SHALL respond to pointer hover by filling the match information panel used for player inspection, and SHALL clear it when the pointer leaves. Crew figures SHALL remain non-selectable and non-draggable, and hovering one SHALL NOT change the selected player, the declared action, or any pitch highlight.

#### Scenario: Hovering a cheerleader explains it
- **WHEN** a coach hovers a cheerleader figure on the sideline crew rail
- **THEN** the information panel shows the cheerleader entry

#### Scenario: Leaving the figure clears the panel
- **WHEN** the pointer moves off the crew figure
- **THEN** the panel clears

#### Scenario: Inspection does not disturb an activation
- **WHEN** a coach with a player selected and an action declared hovers a crew figure
- **THEN** the selection, declared action, and pitch highlights are unchanged

### Requirement: The panel states the crew type, its match effect, and the team's count

The information shown for a crew figure SHALL name the staff type, state what that staff type does in match terms, and report how many of that type the team has. The effect text SHALL describe the actual implemented effect: assistant coaches add to the Brilliant Coaching roll, cheerleaders add to the Cheering Fans roll, dedicated fans add to the Pitch Invasion roll and to winnings, and the apothecary may patch up one Knocked Out or injured player per match. No statline, skills, or player-specific controls SHALL be rendered for a crew subject.

#### Scenario: Assistant coach explanation
- **WHEN** an assistant coach figure is inspected
- **THEN** the panel names Assistant Coach, states that they add to the Brilliant Coaching kickoff roll, and reports how many assistant coaches the team has

#### Scenario: Apothecary explanation
- **WHEN** the apothecary figure is inspected
- **THEN** the panel names Apothecary and states that it may patch up one Knocked Out or injured player per match

#### Scenario: No player fields are shown
- **WHEN** any crew figure is inspected
- **THEN** the panel renders no MA/ST/AG/PA/AV line, no skills list, and no player status

### Requirement: Counts reported are the team's real counts

Where a team holds more of a staff type than the rail draws, the reported count SHALL be the team's actual number, not the number of figures drawn.

#### Scenario: More cheerleaders than drawn figures
- **WHEN** a team with more cheerleaders than the rail's cheerleader cap has one of its drawn cheerleaders inspected
- **THEN** the panel reports the team's real cheerleader count

### Requirement: An empty crew rail explains itself

When a team retains no sideline staff, the `NO STAFF` placeholder SHALL be inspectable on hover and SHALL explain that the team has no sideline staff and what that means for the rolls those staff would modify.

#### Scenario: Hovering the empty rail
- **WHEN** a coach hovers the `NO STAFF` placeholder on a team with no staff
- **THEN** the panel explains that the team retains no sideline staff and receives no staff modifiers on the kickoff-table rolls
