# team-lifecycle-modes

## ADDED Requirements

### Requirement: A team's mode is derived from whether it has played
A team SHALL record when it first completed a match. A team with no such record SHALL be in **draft** mode; a team with one SHALL be in **active** mode. The mode SHALL NOT be settable directly, and a team SHALL NOT return to draft once active.

#### Scenario: A new team is in draft
- **WHEN** a coach creates a team and has not yet played a match with it
- **THEN** the team is in draft mode

#### Scenario: Completing a first match makes a team active
- **WHEN** a team completes its first match and the post-match summary is confirmed
- **THEN** the team records that match's completion and is in active mode from then on

#### Scenario: An abandoned match does not activate a team
- **WHEN** a draft team's match is abandoned before the post-match summary is confirmed
- **THEN** the team remains in draft mode

### Requirement: Draft teams are freely editable
A team in draft mode SHALL allow every team-building operation: renaming, changing the roster type, adding and removing players, buying re-rolls at roster price, and setting Dedicated Fans.

#### Scenario: A draft team can change roster type
- **WHEN** a coach changes the roster of a draft team
- **THEN** the change is allowed

#### Scenario: A draft team buys a re-roll at roster price
- **WHEN** a coach buys a re-roll for a draft team
- **THEN** they are charged the roster's re-roll price

### Requirement: Active teams only accept changes legal in play
A team in active mode SHALL refuse draft-only operations — renaming the roster type, changing the roster, and freely removing players — and SHALL state the reason and the mode when it does so.

#### Scenario: Changing the roster of an active team is refused
- **WHEN** a coach attempts to change the roster type of an active team
- **THEN** the change is refused with a message naming the active-team rule

#### Scenario: Refusals explain themselves
- **WHEN** any edit is refused because the team is active
- **THEN** the message states that the team is active and which rule prevents the edit

### Requirement: Active-team purchasing rules are enforced
For an active team, re-rolls SHALL cost double the roster's re-roll price, and Dedicated Fans SHALL NOT be purchasable. Hiring players SHALL be allowed at roster price up to the roster maximum.

#### Scenario: A re-roll costs double for an active team
- **WHEN** a coach buys a re-roll for an active team
- **THEN** they are charged twice the roster's re-roll price

#### Scenario: Dedicated Fans cannot be bought by an active team
- **WHEN** a coach attempts to buy Dedicated Fans for an active team
- **THEN** the purchase is refused and the reason is stated

#### Scenario: Hiring a player is allowed for an active team
- **WHEN** an active team below its roster maximum hires an eligible player
- **THEN** the hire is allowed at the roster price

### Requirement: The displayed price is the price charged
Every purchasable item SHALL be displayed at the price that will actually be charged for the team's current mode.

#### Scenario: An active team sees the doubled re-roll price
- **WHEN** a coach views the re-roll purchase option for an active team
- **THEN** the price shown is the doubled price

### Requirement: The team's mode is visible
Team management SHALL show whether each team is in draft or active mode, and SHALL state which active-team rules are enforced so a coach is not led to assume rules that are not modelled.

#### Scenario: Mode is shown in the team list
- **WHEN** a coach views their teams
- **THEN** each team is marked as draft or active

#### Scenario: Enforced rules are stated
- **WHEN** a coach opens an active team
- **THEN** the enforced active-team rules are listed
