# local-match-resume

## ADDED Requirements

### Requirement: An in-progress local match is autosaved
A local match SHALL be saved to browser storage after each event that advances the game — an action resolving, a turn ending, a phase changing, a drive ending. A save SHALL only be taken at a resumable boundary, with no operation in flight and no decision pending.

#### Scenario: A save follows each completed action
- **WHEN** a coach completes a move, a block, or a pass in a local match
- **THEN** the match is written to storage before the next action begins

#### Scenario: No save is taken mid-operation
- **WHEN** an operation is still resolving or a decision is awaiting a coach's answer
- **THEN** no save is written until that resolution completes

### Requirement: A saved match can be resumed
Returning to the app with a saved in-progress local match SHALL offer to resume it. Resuming SHALL restore the pitch positions, dugout boxes, ball position, score, weather, half, turn number, active team, and the drive's kicking and receiving assignment exactly as they were when saved.

#### Scenario: Refresh does not lose the match
- **WHEN** a coach refreshes the browser mid-match and chooses to resume
- **THEN** the match continues from the last completed action with the board, score, and turn intact

#### Scenario: The resume offer describes the match
- **WHEN** a saved match exists
- **THEN** the resume entry shows both team names, the current score, and the half and turn

#### Scenario: Player condition survives the resume
- **WHEN** a match is saved with players prone, stunned, knocked out, and injured
- **THEN** each player is restored with the same status in the same box or square

### Requirement: The save carries everything a resume needs
The saved payload SHALL contain the game snapshot, both full team rosters, the drive's kicking and receiving team assignment, the half, the random-number generator state, the accumulated match statistics, and the competition context when the match is a fixture. It SHALL carry a version stamp and the time it was saved.

#### Scenario: Advancement data survives a resume
- **WHEN** a match involving players with SPP, skills gained, and injuries is saved and resumed
- **THEN** those player records are restored complete, not reduced to their play-time fields

#### Scenario: Dice determinism survives a resume
- **WHEN** a seeded match is saved, resumed, and continued with the same commands
- **THEN** the same dice results are produced as in an uninterrupted run

#### Scenario: A fixture resumes as a fixture
- **WHEN** a competition fixture is saved and resumed
- **THEN** the competition context is restored and the result is still reported to that fixture at full time

### Requirement: A signed-in coach gets a cloud save
When a coach is signed in, the save SHALL also be written to their account in the cloud, so the match can be resumed on another device. When both a local and a cloud save exist, the more recently saved one SHALL be used, and the other SHALL be retained for the session rather than discarded silently.

#### Scenario: Resume on a second device
- **WHEN** a signed-in coach saves a match on one device and opens the app on another
- **THEN** the match is offered for resumption there

#### Scenario: Newer local progress is not lost to an older cloud save
- **WHEN** a local save is newer than the cloud save for the same coach
- **THEN** the local save is the one resumed

### Requirement: Saves are cleared and failures are non-blocking
The save SHALL be cleared when the match reaches full time and the coach leaves the results screen, and when the coach explicitly abandons the match. A save that fails to load, or whose version is not recognised, SHALL be discarded with a warning and SHALL NOT prevent the app from starting or a new match from being created.

#### Scenario: Finishing a match clears its save
- **WHEN** a coach completes a match and leaves the results screen
- **THEN** no resume entry remains

#### Scenario: Abandoning requires confirmation
- **WHEN** a coach chooses to discard a saved match
- **THEN** they are asked to confirm before the save is removed

#### Scenario: A corrupt save does not block startup
- **WHEN** a saved match cannot be read or its version is not recognised
- **THEN** it is discarded with a warning and the coach can start a new match normally

#### Scenario: Starting a new match replaces the save
- **WHEN** a saved match exists and the coach starts a new local match
- **THEN** they are warned that the saved match will be replaced, and the save is replaced only after they confirm
