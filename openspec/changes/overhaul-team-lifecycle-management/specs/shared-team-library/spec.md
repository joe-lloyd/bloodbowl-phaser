# shared-team-library

## ADDED Requirements

### Requirement: A coach's teams are directly readable by other coaches
A team stored under its owner's account SHALL be readable by any authenticated coach without any publish step. No copy of the team SHALL be created for sharing.

#### Scenario: Another coach reads a team without it being published
- **WHEN** a coach browses another coach's teams
- **THEN** they can view the full roster, and no shared copy exists anywhere

#### Scenario: What a reader sees is current
- **WHEN** an owner's team changes after another coach viewed it
- **THEN** the next read shows the current team, with no snapshot to refresh

### Requirement: Competitions reference the owner's team directly
Leagues and tournaments SHALL add entrants by referencing a coach's team by owner and team id. There SHALL be no distinction between a "shared" and a "local" entrant source.

#### Scenario: Adding an entrant from another coach
- **WHEN** an organizer browses coaches and selects one of their teams while building a competition
- **THEN** the entrant is added as a reference to that owner's team

#### Scenario: A single entrant path
- **WHEN** entrants are added from the organizer's own teams and from other coaches' teams
- **THEN** both are stored identically as owner/team references

## MODIFIED Requirements

### Requirement: Public read, owner-only write
A team SHALL be readable by any authenticated coach and writable only by its owner. No non-owner SHALL be able to modify another coach's team, whether directly or through a competition it is entered in.

#### Scenario: Another coach reads a team
- **WHEN** a coach opens another coach's team
- **THEN** they can view the full roster but cannot edit or save changes to it

#### Scenario: Non-owner write is rejected
- **WHEN** a non-owner attempts to write to another coach's team document
- **THEN** the write is denied

#### Scenario: A competition organizer cannot edit an entrant's team
- **WHEN** a competition organizer who does not own an entrant's team attempts to modify that team
- **THEN** the write is denied

## REMOVED Requirements

### Requirement: Publish a team to the shared library
**Reason**: Publishing solved a visibility problem by copying. Read access on the owner's own team document achieves the same thing without a second copy, without a manual refresh step, and without the published snapshot drifting from the real team as players advance.

**Migration**: Any competition entrant referencing a shared team document is repointed at the underlying owner uid and team id before the `sharedTeams` collection is deleted. An entrant whose underlying team no longer exists retains its cached display fields so historical fixtures still render. Coaches take no action: teams they had published remain in their library and become readable by other coaches automatically.
