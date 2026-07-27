# sevens-apothecary

## Purpose

Give a team with an owned, unused Apothecary a once-per-match, owner-only use-or-decline
decision immediately after an eligible Knocked Out or casualty result, and apply Blood
Bowl Sevens' patch-up outcomes: an on-pitch Knocked Out player is patched up Stunned in
place, a crowd Knocked Out player moves to the Reserves, and Badly Hurt / Seriously Hurt
/ Dead roll a D6 where 4+ moves the player to the Reserves. The decision, the original
result, and any rolled outcome are all serialized so the same match resumes and
synchronizes identically across saves and online play.

## Requirements

### Requirement: An owned Apothecary is offered once per match

A Sevens team with an unused Apothecary SHALL receive an owner-only use-or-decline
decision immediately after an eligible Knocked Out or casualty result and before final
player placement. Choosing to use it SHALL consume the Apothecary for the match;
declining SHALL leave it available for a later eligible result.

#### Scenario: Coach declines the first eligible result

- **WHEN** the coach declines to use an unused Apothecary on an eligible Knocked Out
  result
- **THEN** the original result is applied and the Apothecary remains unused

#### Scenario: Apothecary was already used

- **WHEN** another eligible injury occurs after the team's Apothecary was consumed
- **THEN** no Apothecary decision is offered

### Requirement: On-pitch Knocked Out becomes Stunned

When an Apothecary is used on a player who was Knocked Out on the pitch, that player
SHALL remain in their pitch square and become Stunned instead of moving to the Knocked
Out box.

#### Scenario: On-pitch KO is patched up

- **WHEN** the coach uses an Apothecary on an eligible on-pitch Knocked Out result
- **THEN** the player remains on that square Stunned, does not occupy the Knocked Out box,
  and the Apothecary is consumed

### Requirement: Crowd Knocked Out moves to Reserves

When an Apothecary is used on a player Knocked Out while off the pitch in the crowd, the
player SHALL be placed in Reserves instead of the Knocked Out box.

#### Scenario: Crowd KO is patched up

- **WHEN** the coach uses an Apothecary on an eligible crowd Knocked Out result
- **THEN** the player is placed in Reserves and the Apothecary is consumed

### Requirement: Eligible casualties use the Sevens patch-up roll

When an Apothecary is used on Badly Hurt, Seriously Hurt, or Dead, the system SHALL roll
one D6. On 4+, the player SHALL move from Casualties to Reserves; on 1-3, the original
casualty result and placement SHALL remain.

#### Scenario: Casualty patch-up succeeds

- **WHEN** the Apothecary roll for an eligible casualty is 4, 5, or 6
- **THEN** the player is placed in Reserves and the Apothecary is consumed

#### Scenario: Casualty patch-up fails

- **WHEN** the Apothecary roll for an eligible casualty is 1, 2, or 3
- **THEN** the original casualty result remains, the player stays in Casualties, and the
  Apothecary is consumed

### Requirement: Apothecary decisions are resumable and authoritative

The pending decision, original injury result, player location, use state, and any rolled
outcome SHALL be serialized. Only the owning coach or authoritative headless command
SHALL resolve the decision, and resolving the same decision id more than once SHALL have
no additional effect.

#### Scenario: Save occurs during the decision

- **WHEN** a match is restored with an unresolved Apothecary decision
- **THEN** the same decision is presented with the original result and no new injury or
  patch-up roll occurs

#### Scenario: Opponent attempts to use it

- **WHEN** the opposing online coach submits a response to the Apothecary decision
- **THEN** the response is rejected and the decision remains pending for its owner
