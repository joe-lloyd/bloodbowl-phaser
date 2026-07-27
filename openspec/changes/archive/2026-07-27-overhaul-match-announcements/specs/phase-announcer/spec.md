# phase-announcer

## ADDED Requirements

### Requirement: The announcer is reserved for structural transitions
The large on-screen announcement SHALL be raised only for these transitions: a coach's turn beginning, the round passing to the other coach, halftime, and full time. No other message SHALL use the announcer.

#### Scenario: A turn change is announced
- **WHEN** a new turn begins for a coach
- **THEN** the announcer states whose turn it is and which turn number of the half it is

#### Scenario: Halftime is announced
- **WHEN** the first half ends
- **THEN** the announcer states that it is halftime

#### Scenario: A dice outcome is not announced
- **WHEN** a weather roll, kickoff event, or skill trigger resolves
- **THEN** no announcement is raised and the outcome appears in the match log instead

### Requirement: The announcement is large, centred, and self-dismissing
The announcement SHALL be rendered centred on screen at a size clearly larger than HUD text, SHALL animate in, hold, and animate out without requiring input, and SHALL be click-through so it never blocks play.

#### Scenario: An announcement does not require dismissal
- **WHEN** an announcement is raised
- **THEN** it appears, holds briefly, and clears on its own

#### Scenario: An announcement does not block the pitch
- **WHEN** an announcement is on screen and the coach clicks a square beneath it
- **THEN** the click reaches the pitch

### Requirement: One announcement is shown at a time
A new announcement SHALL replace any announcement currently on screen rather than stacking beneath or above it.

#### Scenario: A later announcement replaces an earlier one
- **WHEN** halftime is announced while a turn-change announcement is still on screen
- **THEN** only the halftime announcement is shown

### Requirement: Announcements bookend each part of the match
Each part of the match SHALL be opened and closed by an announcement, so a coach can read the structure of the game from the announcer alone: the turn that is starting, the hand-over to the opponent, halftime, and full time.

#### Scenario: A half reads as a sequence of bookends
- **WHEN** a coach plays through a half
- **THEN** each of their turns opens with a turn announcement, each hand-over announces the round passing to the opponent, and the half closes with the halftime announcement
