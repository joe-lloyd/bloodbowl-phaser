## ADDED Requirements

### Requirement: Parity record

`pnpm parity record <file>` SHALL play 210 Sevens matches and 40 each of Street Bowl, Beach Bowl and Gutter Bowl with planner coaches from seed 7000, and write each match's final-state hash keyed by game type and seed.

#### Scenario: Same tree, same hashes

- **WHEN** the record runs twice on an unchanged tree
- **THEN** both files hold the same 330 hashes

### Requirement: Parity compare

`pnpm parity compare <base> <head>` SHALL exit 0 when every hash matches, and otherwise exit 1 and name the changed matches, first seed first.

#### Scenario: A rules change breaks parity

- **WHEN** the head tree changes a rule that two-team matches use
- **THEN** the compare names the first match whose final state changed

### Requirement: Parity replay

`pnpm parity replay <match> <file>` SHALL replay one parity match with the rosters, game type and seed the record used, and write its command recording.

#### Scenario: Replay matches the record

- **WHEN** a match is replayed on the tree that recorded it
- **THEN** its final hash equals the recorded one
