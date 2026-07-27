# player-progression

## Purpose

Define the Blood Bowl 2025 player progression rules: exact SPP award values, advancement cost bands, skill access and random-skill roll rules, the D8 characteristic table with caps, and how applying an advancement mutates the player, appends durable history, and adjusts advancement value.

## Requirements

### Requirement: Exact 2025 SPP values

For players on an Advanced League team, the system SHALL award Completion 1, Superb Throw plus safe landing to the thrower 1, safe landing to the thrown player 1, Interception 2, eligible Casualty 2, Touchdown 3, and MVP 4 SPP. Players on Matched Play or Sevens Skill Selection teams SHALL record the same match achievements without receiving SPP.

#### Scenario: Combined Advanced League match line

- **WHEN** an eligible Advanced League player records two Completions, one eligible Casualty, one Touchdown, and MVP
- **THEN** the player earns 11 SPP

#### Scenario: Combined Skill Selection match line

- **WHEN** a Sevens Skill Selection player records the same achievements
- **THEN** those statistics are recorded and the player earns 0 SPP

### Requirement: Exact advancement bands

For Advanced League advancement numbers 1-6, the system SHALL charge Random Primary `[3,4,6,8,10,15]`, Chosen Primary `[6,8,12,16,20,30]`, Chosen Secondary `[10,12,16,20,24,34]`, and Characteristic `[14,16,20,24,28,38]` SPP. There SHALL be no Random Secondary SPP option. These SPP spending bands SHALL NOT be offered to Matched Play or Sevens Skill Selection teams.

#### Scenario: Forced Advanced League advancement

- **WHEN** a non-Legend Advanced League player has at least the Characteristic cost for their next advancement
- **THEN** Manage Team requires them to buy an advancement before their next required competition match, though it need not be a Characteristic

#### Scenario: Non-SPP mode opens development

- **WHEN** a Matched Play or Sevens Skill Selection team is managed
- **THEN** standard SPP spending options are not offered

### Requirement: Skill advancements obey access and roll rules

Chosen skills SHALL be legal Skills in the player's selected Primary/Secondary category and SHALL not duplicate or conflict with an existing Skill. Random Primary SHALL generate two legal candidates by selecting the correct half from the first D6 and row from the second D6, reroll illegal candidates, and let the coach choose unless both candidates match.

#### Scenario: Random Primary choice

- **WHEN** a coach chooses an eligible Primary category and rolls two legal different candidates
- **THEN** both results are shown and exactly one may be confirmed

#### Scenario: Identical random results

- **WHEN** both random candidate rolls resolve to the same legal Skill
- **THEN** that Skill is the mandatory result

### Requirement: Characteristic advancement obeys the D8 table and caps

The system SHALL offer AV on 1; AV/PA on 2; AV/MA/PA on 3-4; MA/PA on 5; AG/MA on 6; AG/ST on 7; and any characteristic on 8, filtered by the twice-only rule and maxima MA 9, ST 8, AG 1+, PA 1+, AV 11+. The coach MAY reject the roll for a legal chosen Primary or Secondary skill while still paying the Characteristic cost.

#### Scenario: Target-number characteristic improves

- **WHEN** AG 3+ is legally improved
- **THEN** it becomes AG 2+

#### Scenario: Capped choice removed

- **WHEN** a characteristic is at its maximum or already has two improvements
- **THEN** it is not offered for the D8 result

### Requirement: Advancement value and history persist

Applying an advancement SHALL deduct SPP, append durable history, increment level up to Legend, mutate the skill/stat, and add Primary 20k, Secondary 40k, AV 10k, MA/PA 20k, AG 30k, or ST 60k to player advancement value. Block, Dodge, Guard, and Mighty Blow SHALL add a further 10k Elite surcharge.

#### Scenario: Elite Primary

- **WHEN** a player gains Block as a Primary Skill
- **THEN** player advancement value increases by 30k

#### Scenario: Existing saved team

- **WHEN** a saved player lacks the new progression fields
- **THEN** loading supplies safe defaults and derives skill access from its roster position
