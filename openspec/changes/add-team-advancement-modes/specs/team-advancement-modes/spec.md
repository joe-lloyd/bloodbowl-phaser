# team-advancement-modes

## ADDED Requirements

### Requirement: Every team has one immutable advancement mode

A team SHALL select exactly one of Matched Play, Advanced League, or Sevens Skill
Selection during creation. The selected mode SHALL be persisted and SHALL NOT be changed
after the team is finalized or has entered a competition.

#### Scenario: New team selects a mode

- **WHEN** a coach finalizes a new team
- **THEN** exactly one advancement mode is stored with the team

#### Scenario: Coach attempts to convert an established team

- **WHEN** a finalized or competition-entered team is edited to a different advancement
  mode
- **THEN** the change is refused with an explanation that the mode is immutable

### Requirement: Matched Play uses the event skill package

A Matched Play team SHALL receive the skill allowance defined by its compatible event
profile and team tier. A Primary Skill MAY be selected in place of an allowed Secondary
Skill, and no player SHALL receive more than one added skill from the package.

#### Scenario: Primary replaces Secondary

- **WHEN** a package permits a Secondary Skill and the coach selects a legal Primary
  Skill instead
- **THEN** the selection is accepted and consumes that package allowance

#### Scenario: Second added skill is attempted

- **WHEN** a coach tries to assign a second package skill to the same player
- **THEN** the selection is rejected

#### Scenario: Package is incomplete

- **WHEN** a Matched Play team has not legally allocated its required event skill package
- **THEN** it cannot be submitted to the event and the missing allocation is stated

### Requirement: Advanced League alone uses standard SPP progression

Only an Advanced League team SHALL earn and spend SPP through the standard player
progression rules. Matched Play and Sevens Skill Selection teams SHALL NOT gain SPP from
match achievements.

#### Scenario: Advanced League match completes

- **WHEN** an eligible Advanced League team completes a match
- **THEN** its players receive standard SPP awards and may later spend them in Manage
  Team

#### Scenario: Skill Selection player scores

- **WHEN** a Sevens Skill Selection player records a touchdown
- **THEN** the statistic is recorded but no SPP is added

### Requirement: Skill Selection awards one random skill after each game

After each completed game, a Sevens Skill Selection team SHALL choose one of two methods:
the coach selects one eligible participant to receive a random Primary two-roll choice,
or the system randomly selects one eligible participant to receive a random Secondary
two-roll choice. A participant who suffered DEAD SHALL be ineligible.

#### Scenario: Coach selects the Primary recipient

- **WHEN** the coach chooses the Primary method and selects a living player who
  participated in the game
- **THEN** two legal random Primary results are generated under the normal random-skill
  rules and the coach confirms one

#### Scenario: Secondary recipient is random

- **WHEN** the coach chooses the Secondary method
- **THEN** the recipient is randomly selected from living match participants before two
  legal random Secondary results are generated

#### Scenario: Non-participant is selected

- **WHEN** a command names a player who did not participate as the Primary recipient
- **THEN** the command is rejected without awarding a skill

### Requirement: Every awarded skill changes player value

Skills awarded by any advancement mode SHALL create durable provenance and increase
player value using the standard advancement value for that skill category and any
applicable surcharge.

#### Scenario: Skill Selection awards a Primary

- **WHEN** a Skill Selection player confirms a random Primary Skill
- **THEN** the skill, source match, category, and value increase are persisted

### Requirement: Skill Selection teams resolve the Draft

During the post-game sequence, after DEAD players are removed, a D6 SHALL be rolled for
every rostered player with one or more added skills. If the roll is greater than the
number of added skills, the player remains. If the roll is equal to or lower than that
number, the player SHALL leave the active roster and the team SHALL receive gold equal
to the player's total value increase from added skills.

#### Scenario: Experienced player remains

- **WHEN** a player with two added skills receives a Draft roll of 3
- **THEN** the player remains on the team

#### Scenario: Experienced player is drafted

- **WHEN** a player with two Primary Skills receives a Draft roll of 2
- **THEN** the player leaves the active roster, their career and Draft history remain,
  and the team receives 40,000 gold if those skills increased value by 20,000 each

### Requirement: Team development is completed from Manage Team

Post-match processing SHALL persist pending advancement, Skill Selection, and Draft work,
but the results screen SHALL NOT require direct skill assignment. Manage Team SHALL list
and resolve the pending work before the team enters another match where the competition
requires it complete.

#### Scenario: Coach exits after an eligible match

- **WHEN** post-match awards have been recorded but a team has unresolved development
- **THEN** the coach may leave the results screen and Manage Team shows the pending work

#### Scenario: Team attempts another fixture

- **WHEN** a competition requires development completion and the selected team has
  pending work
- **THEN** match launch is refused with a link or instruction to Manage Team
