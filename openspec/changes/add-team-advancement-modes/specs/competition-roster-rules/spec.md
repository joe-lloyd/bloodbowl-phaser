# competition-roster-rules

## ADDED Requirements

### Requirement: Competitions define a roster rule profile

Every new league or tournament SHALL define a versioned profile containing its required
advancement mode, team draft budget, eligible roster constraints, and any Matched Play
skill package. The accepted profile SHALL be snapshotted for the competition.

#### Scenario: Tournament uses Matched Play

- **WHEN** an organizer creates a Matched Play tournament
- **THEN** the tournament stores its draft budget and tier skill package with the
  required Matched Play mode

#### Scenario: League uses Advanced League

- **WHEN** an organizer creates an Advanced League competition
- **THEN** the profile requires Advanced League teams and standard SPP progression

### Requirement: Entry uses shared compatibility validation

A team SHALL enter a competition only when its advancement mode, roster, budget, skill
package, legality, and pending-development state satisfy the snapshotted profile. The UI
and authoritative repository command SHALL use the same validator.

#### Scenario: Advancement mode differs

- **WHEN** a Sevens Skill Selection team attempts to join an Advanced League competition
- **THEN** entry is refused and the advancement-mode mismatch is stated

#### Scenario: Team matches the profile

- **WHEN** a legal team satisfies every rule in the competition profile
- **THEN** it is available for selection and its entry is accepted

#### Scenario: Forged incompatible entry

- **WHEN** a client bypasses the UI and submits an incompatible team id
- **THEN** the repository command rejects the entry without changing membership

### Requirement: Compatibility is visible before selection

Competition entry UI SHALL mark teams as compatible or incompatible and SHALL expose all
currently known refusal reasons before the coach confirms selection.

#### Scenario: Multiple rules fail

- **WHEN** a team has the wrong advancement mode and exceeds the draft budget
- **THEN** both refusal reasons are shown before entry is attempted
