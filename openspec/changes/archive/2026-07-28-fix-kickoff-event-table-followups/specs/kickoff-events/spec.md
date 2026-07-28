# kickoff-events

## ADDED Requirements

### Requirement: A drive's kickoff table resolves exactly once
The kickoff table SHALL be rolled and resolved exactly once per drive. Refreshing the browser, restoring a saved match, or re-entering the kickoff phase for a drive whose kickoff has already resolved SHALL reproduce the already-resolved event and outcome rather than rolling again.

#### Scenario: A refresh mid-kickoff does not reroll
- **WHEN** a match is refreshed or restored after its drive's kickoff table has already been rolled
- **THEN** the same previously-resolved kickoff event and outcome are shown, with no new roll made

#### Scenario: Re-entering the kickoff phase does not duplicate the roll
- **WHEN** the kickoff phase is re-entered for a drive that has already resolved its kickoff table
- **THEN** the table is not rolled again for that drive
