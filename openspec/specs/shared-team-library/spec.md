# shared-team-library

## Purpose

Let team owners opt-in to publish teams to a shared collection that other coaches can read and reference as competition entrants, while keeping write access owner-only.

## Requirements

### Requirement: Publish a team to the shared library
The system SHALL let a team's owner publish it to a shared collection, opt-in, without removing it from their private library. Publishing SHALL store a snapshot the owner can later refresh.

#### Scenario: Owner publishes a team
- **WHEN** an owner publishes one of their teams
- **THEN** a shared copy becomes available to other coaches and the private team remains in the owner's library

#### Scenario: Owner refreshes a published team
- **WHEN** an owner republishes a team they have edited
- **THEN** the shared snapshot updates to the new version

### Requirement: Public read, owner-only write
A shared team SHALL be readable by any authenticated coach and writable only by its owner. No non-owner SHALL be able to modify a shared team.

#### Scenario: Another coach reads a shared team
- **WHEN** a coach opens another coach's shared team
- **THEN** they can view the full roster but cannot edit or save changes to it

#### Scenario: Non-owner write is rejected
- **WHEN** a non-owner attempts to write to a shared team document
- **THEN** the write is denied

### Requirement: Discover and reference shared teams
Leagues and tournaments SHALL be able to discover shared teams and reference them as entrants.

#### Scenario: Add a shared team as an entrant
- **WHEN** an organizer browses shared teams while building a competition
- **THEN** they can select one and add it as an entrant
