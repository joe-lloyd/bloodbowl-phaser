# foul-injury-resolution

## ADDED Requirements

### Requirement: A foul-caused KO or Casualty moves the player off the pitch
When a Foul's armour/injury resolution results in the target being Knocked Out or suffering a Casualty, the target SHALL be moved off the pitch into its corresponding box (KO box or dead-and-injured) through the same mechanism block-caused injuries use, and the view SHALL reconcile so the player's sprite no longer appears on the pitch.

#### Scenario: A foul-caused KO reaches the KO box
- **WHEN** a Foul's armour roll breaks and the injury roll results in KO
- **THEN** the target is removed from the pitch and appears in the KO box

#### Scenario: A foul-caused Casualty reaches dead-and-injured
- **WHEN** a Foul's injury roll results in a Casualty
- **THEN** the target is removed from the pitch and appears in the dead-and-injured area

### Requirement: A sent-off player is removed from the pitch and marked in the dugout
When a Foul's referee check results in the fouling player being Sent Off, that player SHALL be moved off the pitch into a sent-off box and SHALL be shown in the dugout with a distinct marker (e.g. a red card) indicating they cannot play the rest of the match.

#### Scenario: A sent-off player leaves the pitch
- **WHEN** a coach is Sent Off as a result of a Foul
- **THEN** that player is removed from the pitch and no longer appears at any pitch square

#### Scenario: The dugout shows the sent-off marker
- **WHEN** a sent-off player is viewed in the dugout
- **THEN** they appear in a section distinct from Reserves and Dead/Injured, with a marker indicating ejection from the rest of the match

### Requirement: The foul target highlight clears only after the foul fully resolves
The fouling player's target highlight SHALL remain until the foul's complete resolution — including any KO, Casualty, or Send-Off consequence — has finished, and SHALL then clear.

#### Scenario: The highlight persists through resolution
- **WHEN** a foul is declared and its resolution (including any injury/send-off consequence) is still in progress
- **THEN** the target highlight remains visible until that resolution completes

#### Scenario: The highlight clears once activation ends
- **WHEN** the fouling player's activation ends after the foul has fully resolved
- **THEN** no highlight remains on the former target's square
