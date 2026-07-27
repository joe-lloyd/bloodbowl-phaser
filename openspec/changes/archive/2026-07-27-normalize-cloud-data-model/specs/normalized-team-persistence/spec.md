# normalized-team-persistence

## ADDED Requirements

### Requirement: A stored player record carries only non-derivable data
A persisted player SHALL store its identity (id, name, jersey number, roster name, position name, player kind), its progression (SPP, level, advancements, chosen skills as skill identifiers, characteristic increases), its injuries, and its career statistics. It SHALL NOT store base or current statlines, resolved skill objects or their description text, keywords, skill-category access, cost, or team value.

#### Scenario: Saving a team omits derivable fields
- **WHEN** a team is saved
- **THEN** the stored player records contain no statline, no skill description text, no keywords, no skill-category access, no cost, and no team value

#### Scenario: Chosen skills are stored as identifiers
- **WHEN** a player has gained a skill through advancement
- **THEN** the stored record lists that skill's identifier, not a resolved skill object with its rulebook text

### Requirement: Transient match state is never persisted
A persisted player SHALL NOT store per-match state: pitch status, grid position, whether they have acted, active conditions, or once-per-game skill usage flags.

#### Scenario: A knocked-out player is stored without match state
- **WHEN** a team is saved while a player is knocked out and standing on the pitch
- **THEN** the stored record contains neither the knocked-out status nor the grid position

### Requirement: Derivable data is rehydrated from roster templates on load
Loading a stored player SHALL reconstruct the runtime player: base statline, keywords, skill-category access, and cost from the roster template for that roster and position; current statline from the base plus characteristic advances and minus injury decreases; and the skill list from the template's skills plus the player's gained skills, resolved against the skill catalog.

#### Scenario: A rookie hydrates to its template
- **WHEN** a stored player with no advancements and no injuries is loaded
- **THEN** their statline, skills, keywords, and cost match the roster template for their position exactly

#### Scenario: Advancement and injury are applied over the template
- **WHEN** a stored player with a +1 MA characteristic advance and a -1 AV injury is loaded
- **THEN** their current statline is the template statline with those adjustments applied, and their base statline is the template's

#### Scenario: Team value is recomputed, not read
- **WHEN** a team is loaded
- **THEN** its team value is computed from the hydrated roster rather than read from storage

### Requirement: A missing roster position degrades without data loss
When a stored player's position no longer exists in its roster, loading SHALL preserve the player's identity, progression, injuries, and career statistics, SHALL substitute a clearly marked placeholder for the derivable data, and SHALL surface a warning. It SHALL NOT discard the player or throw.

#### Scenario: An unknown position is reported, not dropped
- **WHEN** a stored player references a position name that is not in its roster template
- **THEN** the player is loaded with their progression intact, marked as needing attention, and a warning is surfaced

### Requirement: Stored documents are versioned and read tolerantly
Every stored team document SHALL carry a schema version. The reader SHALL accept both the previous full-object shape and the normalized shape, converting the former on read. The next save of a converted document SHALL write the normalized shape.

#### Scenario: An old document loads
- **WHEN** a team saved in the previous full-object shape is loaded
- **THEN** it is converted on read and the coach sees the same team

#### Scenario: An old document is normalized on save
- **WHEN** a converted team is subsequently saved
- **THEN** the stored document is written in the normalized shape with the current schema version

### Requirement: Dehydration and hydration round-trip exactly
For every roster and position, storing a runtime player and loading it back SHALL produce a player equal to the original in every field that affects play, progression, or team value.

#### Scenario: Round-trip across all rosters
- **WHEN** a player of each position in each roster is dehydrated and rehydrated
- **THEN** the resulting player matches the original in statline, skills, keywords, access, cost, progression, and injuries
