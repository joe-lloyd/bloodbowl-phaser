# short-handed-setup Specification

## Purpose
Defines how a team with fewer than seven available players completes setup and kicks off: setup completion is "every available player placed", not "seven placed", and fielding availability (excluding KO, Casualty, and sent-off players) is distinct from the roster minimum used for team building.
## Requirements
### Requirement: Setup completes when every available player is placed
A team's setup SHALL be complete when it has placed `min(7, availablePlayers)` players, where available players are those not knocked out, not casualties, and not sent off. Setup SHALL NOT require seven placed players when the team has fewer than seven available.

#### Scenario: A team with five available players completes setup
- **WHEN** a team has five available players after KOs and casualties and places all five in its setup zone
- **THEN** setup reports complete and the coach can confirm it

#### Scenario: A full team still requires seven
- **WHEN** a team has nine available players and has placed six
- **THEN** setup does not report complete until a seventh is placed

#### Scenario: The placement cap stays at seven
- **WHEN** a team with nine available players has placed seven
- **THEN** no eighth player can be placed on the pitch

### Requirement: A short-handed drive kicks off normally
When one or both teams field fewer than seven players, the kickoff and the drive SHALL proceed as normal. The short-handed team SHALL NOT be blocked, auto-conceded, or forced to forfeit setup.

#### Scenario: Kickoff proceeds with a short-handed receiving team
- **WHEN** the receiving team fields four players and confirms setup
- **THEN** the kickoff proceeds and the drive begins

#### Scenario: Both teams short-handed
- **WHEN** both teams field fewer than seven players
- **THEN** setup completes for both and the drive is played out normally

### Requirement: Fielding availability is distinct from roster minimums
The seven-player minimum SHALL continue to govern team building — a roster may not be created or saved below seven players — and SHALL NOT be used to decide whether a team can field a drive.

#### Scenario: Team building still enforces seven
- **WHEN** a coach attempts to save a roster with six players in the team builder
- **THEN** the save is refused with the roster minimum message

#### Scenario: A depleted roster can still take the field
- **WHEN** a legal seven-plus roster is depleted mid-match to fewer than seven available players
- **THEN** that team can still set up and play the next drive

### Requirement: A team with no available players is reported
When a team has zero available players to field, that condition SHALL be reported explicitly rather than leaving setup unable to complete.

#### Scenario: Zero available players is surfaced
- **WHEN** every player on a team is knocked out, injured, or sent off at the start of a setup
- **THEN** the condition is announced to the coaches rather than stalling setup silently

