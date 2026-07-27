# team-lifecycle-modes

## MODIFIED Requirements

### Requirement: Draft teams are editable but must be legal to finalize

A draft team MAY be persisted while incomplete and SHALL allow renaming, roster changes,
player changes, double-roster-price re-roll purchases, and Dedicated Fans. It SHALL NOT be
finalized, selected for play, or entered in a competition until shared roster validation
passes.

#### Scenario: Incomplete work is saved

- **WHEN** a draft has fewer than seven players
- **THEN** it may remain saved as an incomplete draft and is clearly marked unavailable
  for play

#### Scenario: Illegal draft tries to play

- **WHEN** an incomplete or illegal draft is selected for a match
- **THEN** selection is refused and every known legality failure is shown

#### Scenario: Draft team buys a re-roll

- **WHEN** a draft team buys a re-roll
- **THEN** the displayed and charged price is twice the roster's base re-roll price

### Requirement: Active purchasing rules are enforced

For an active team, re-roll purchases SHALL be refused outright (re-rolls cannot be
bought once a team is active in Sevens), Dedicated Fans SHALL NOT be purchasable, and an
eligible player MAY be hired at roster price subject to roster and budget limits.

#### Scenario: Active team attempts to buy a re-roll

- **WHEN** an active team attempts to buy a re-roll
- **THEN** the purchase is refused and the reason states that active teams cannot buy
  re-rolls

#### Scenario: Active team attempts Dedicated Fans

- **WHEN** an active team attempts to buy Dedicated Fans
- **THEN** the purchase is refused and the reason is stated

#### Scenario: Active team hires a legal player

- **WHEN** an active team can afford a player without violating roster limits
- **THEN** the hire is accepted at roster price

### Requirement: The team mode and rules are visible

Team list and management views SHALL show draft or active mode, legality state, and the
mode-specific restrictions currently enforced.

#### Scenario: Incomplete draft is listed

- **WHEN** a coach views a saved incomplete draft
- **THEN** it is marked draft and illegal for play with a route to fix it

#### Scenario: Active team is opened

- **WHEN** a coach opens an active team
- **THEN** unavailable re-roll purchases, unavailable Dedicated Fans, and locked draft
  edits are communicated
