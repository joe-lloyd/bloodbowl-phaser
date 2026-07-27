# sevens-inducements

## Purpose

Give every match a pre-match inducement budget and selection flow — shared identically by local, competition, online, and headless matches — that enforces the Blood Bowl Sevens catalog: 0-8 Extra Team Training at 150,000 gold each, no Star Players, and Prayers to Nuffle results 10-13 rerolled outside Advanced League play. Confirmed purchases and free grants are copied into a match-scoped inventory that survives save/resume and online synchronization.

## Requirements

### Requirement: Pregame inducements use an authoritative budget

Before a match that permits inducements, the system SHALL calculate each team's
inducement budget from the competition or match rule profile and team values, present
only legal offers, and validate price, quantity, and remaining budget when selections
are confirmed.

#### Scenario: Purchase fits the budget

- **WHEN** a coach confirms a legal inducement selection whose total cost does not exceed
  the resolved budget
- **THEN** the purchase is accepted and copied into that team's match-scoped inventory

#### Scenario: Forged purchase exceeds the budget

- **WHEN** a client submits quantities whose total exceeds the authoritative budget
- **THEN** confirmation is rejected and no inventory or treasury state changes

### Requirement: Sevens Extra Team Training has its own price and limit

In a Sevens match, Extra Team Training SHALL cost 150,000 gold and a team SHALL be able
to hold from zero through eight purchased instances, subject to its inducement budget.

#### Scenario: Eighth training is legal

- **WHEN** a Sevens team can afford eight Extra Team Training inducements and selects
  eight
- **THEN** the selection costs 1,200,000 gold and is accepted

#### Scenario: Ninth training is refused

- **WHEN** a Sevens team attempts to select nine Extra Team Training inducements
- **THEN** the selection is rejected for exceeding the Sevens limit

### Requirement: Star Players are unavailable in Sevens

The Sevens inducement catalog SHALL NOT offer or accept Star Players.

#### Scenario: Catalog is built for Sevens

- **WHEN** a coach opens inducement selection for a Sevens match
- **THEN** no Star Player offer is present

#### Scenario: Forged Star Player purchase

- **WHEN** a client submits a Star Player purchase for a Sevens match
- **THEN** the authoritative rules reject it

### Requirement: Restricted Prayers are rerolled outside Advanced League

In a Sevens match not using Advanced League advancement, a Prayers to Nuffle result of
10, 11, 12, or 13 SHALL be rerolled until an allowed result is produced. In Advanced
League Sevens, those results SHALL remain eligible unless the competition profile
explicitly imposes another restriction.

#### Scenario: Restricted result is rolled

- **WHEN** a non-Advanced-League Sevens prayer initially produces 12
- **THEN** 12 is recorded as rejected and the match RNG is used again until an allowed
  result is obtained

#### Scenario: Same result in Advanced League

- **WHEN** an Advanced League Sevens prayer produces 12 and no additional restriction
  applies
- **THEN** result 12 is accepted

### Requirement: Inducement state survives resume and synchronization

Confirmed inventory, remaining uses, random outcomes, and pending owner decisions SHALL
be serialized in saves and authoritative online snapshots.

#### Scenario: Match resumes with an unused inducement

- **WHEN** a match is saved and restored after purchase but before the inducement is used
- **THEN** the same owner has the same remaining quantity and no purchase is charged
  again

#### Scenario: Headless purchase is deterministic

- **WHEN** a seeded headless scenario submits the same inducement selections and seed
- **THEN** it records the same inventory, rolls, and final state as the graphical flow
