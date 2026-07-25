# team-lifecycle-modes

## ADDED Requirements

### Requirement: Team mode is derived from completed play

A team SHALL record its first completed match. A team without that record SHALL be in
draft mode; a team with it SHALL be active. Mode SHALL NOT be directly settable and an
active team SHALL NOT return to draft.

#### Scenario: New team is draft

- **WHEN** a coach creates a team that has not completed a match
- **THEN** the team is in draft mode

#### Scenario: First match completes

- **WHEN** that team's first match and post-match record are confirmed
- **THEN** the first completed match is recorded and the team is active thereafter

#### Scenario: Match is abandoned

- **WHEN** a draft team's match is abandoned before completion
- **THEN** the team remains in draft mode

### Requirement: Draft teams are editable but must be legal to finalize

A draft team MAY be persisted while incomplete and SHALL allow renaming, roster changes,
player changes, roster-price re-roll purchases, and Dedicated Fans. It SHALL NOT be
finalized, selected for play, or entered in a competition until shared roster validation
passes.

#### Scenario: Incomplete work is saved

- **WHEN** a draft has fewer than seven players
- **THEN** it may remain saved as an incomplete draft and is clearly marked unavailable
  for play

#### Scenario: Illegal draft tries to play

- **WHEN** an incomplete or illegal draft is selected for a match
- **THEN** selection is refused and every known legality failure is shown

### Requirement: Sevens roster legality is shared

For a standard Sevens profile, finalization validation SHALL require at least seven and
at most eleven players, no more than four players without the Lineman keyword, no player
type above its roster maximum, and non-negative remaining budget. Team Builder, match
selection, competition entry, and development seeding SHALL use the same validator.

#### Scenario: Legal seven-player roster

- **WHEN** a seven-player team has no more than four non-Lineman players, obeys every
  positional maximum, and is within budget
- **THEN** shared roster validation accepts it

#### Scenario: Fifth non-Lineman is hired

- **WHEN** a draft would contain five players without the Lineman keyword
- **THEN** finalization is refused with the non-Lineman limit stated

#### Scenario: Positional maximum is exceeded

- **WHEN** a roster contains more of a player type than its roster permits
- **THEN** finalization is refused with that player type and maximum stated

### Requirement: Active teams only accept legal in-play changes

An active team SHALL refuse roster-type changes, draft-only edits, and unrestricted
player removal, with structured reasons that name the active-team rule.

#### Scenario: Active roster type is changed

- **WHEN** a coach attempts to change an active team's roster type
- **THEN** the operation is refused and the active-team restriction is stated

### Requirement: Active purchasing rules are enforced

For an active team, re-rolls SHALL cost twice roster price, Dedicated Fans SHALL NOT be
purchasable, and an eligible player MAY be hired at roster price subject to roster and
budget limits.

#### Scenario: Active team buys a re-roll

- **WHEN** an active team buys a re-roll
- **THEN** the displayed and charged price is twice the roster price

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
- **THEN** doubled re-roll pricing, unavailable Dedicated Fans, and locked draft edits
  are communicated

### Requirement: Team-builder roster information remains readable

The team builder SHALL render critical labels, prices, counts, characteristics, and
validation messages at the application's normal body-text scale. Table headers and row
values SHALL share aligned columns. At narrow widths, the layout SHALL scroll or switch
to an intentional stacked presentation rather than shrinking critical text below that
scale.

#### Scenario: Standard desktop roster table

- **WHEN** the team builder displays player and roster summaries at its supported desktop
  viewport
- **THEN** headers align with row values and critical text uses the normal body scale

#### Scenario: Narrow supported viewport

- **WHEN** the same information does not fit horizontally
- **THEN** it remains readable through scrolling or a stacked layout without clipped
  controls or miniature critical text
