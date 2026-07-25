# player-progression

## MODIFIED Requirements

### Requirement: Exact 2025 SPP values

For players on an Advanced League team, the system SHALL award Completion 1, Superb Throw
plus safe landing to the thrower 1, safe landing to the thrown player 1, Interception 2,
eligible Casualty 2, Touchdown 3, and MVP 4 SPP. Players on Matched Play or Sevens Skill
Selection teams SHALL record the same match achievements without receiving SPP.

#### Scenario: Combined Advanced League match line

- **WHEN** an eligible Advanced League player records two Completions, one eligible
  Casualty, one Touchdown, and MVP
- **THEN** the player earns 11 SPP

#### Scenario: Combined Skill Selection match line

- **WHEN** a Sevens Skill Selection player records the same achievements
- **THEN** those statistics are recorded and the player earns 0 SPP

### Requirement: Exact advancement bands

For Advanced League advancement numbers 1-6, the system SHALL charge Random Primary
`[3,4,6,8,10,15]`, Chosen Primary `[6,8,12,16,20,30]`, Chosen Secondary
`[10,12,16,20,24,34]`, and Characteristic `[14,16,20,24,28,38]` SPP. There SHALL be no
Random Secondary SPP option. These SPP spending bands SHALL NOT be offered to Matched
Play or Sevens Skill Selection teams.

#### Scenario: Forced Advanced League advancement

- **WHEN** a non-Legend Advanced League player has at least the Characteristic cost for
  their next advancement
- **THEN** Manage Team requires them to buy an advancement before their next required
  competition match, though it need not be a Characteristic

#### Scenario: Non-SPP mode opens development

- **WHEN** a Matched Play or Sevens Skill Selection team is managed
- **THEN** standard SPP spending options are not offered
