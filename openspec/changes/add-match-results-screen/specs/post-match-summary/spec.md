# post-match-summary

## ADDED Requirements

### Requirement: The summary is presented for every completed match
The post-match summary SHALL be presented whenever a match reaches the game-over phase. Progression eligibility SHALL determine which sections of the summary are offered, and SHALL NOT determine whether the summary is presented at all.

#### Scenario: An ineligible match still gets a summary
- **WHEN** a match that is not eligible for progression reaches full time
- **THEN** the post-match summary is presented with the result and match statistics, and without the SPP and advancement sections

#### Scenario: An eligible match gets the full summary
- **WHEN** a match eligible for progression reaches full time
- **THEN** the post-match summary is presented with the result, match statistics, MVP nomination, SPP confirmation, and advancement

### Requirement: Match statistics are available independently of progression
The per-player statistics used by the summary SHALL be readable for any completed match. Progression eligibility SHALL affect only the SPP figures within them.

#### Scenario: Statistics without SPP
- **WHEN** the summary is built for a match that awards no SPP
- **THEN** participation, completions, interceptions, casualties, and touchdowns are all present, and SPP earned is zero and not displayed
