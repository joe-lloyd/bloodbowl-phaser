# Computer team templates

## Purpose

Provide sourced starting opponents to every user and isolate their development
within each competition.

## Requirements

### Requirement: Every user has a computer-team catalogue

Team Management SHALL provide My teams and Computer teams tabs. The computer
catalogue SHALL be bundled with the app, available signed out and signed in,
and independent of development seeds or saved team documents. Each recipe SHALL
have a distinct name and kit, a build description, and a Bonehead source link.
Browsing SHALL NOT create, save, edit, or delete a team.

#### Scenario: A coach with an empty library browses defaults

- **WHEN** the coach opens Computer teams
- **THEN** legal starting builds for every supported roster are available
- **AND** the saved team library remains empty

### Requirement: Current rules determine catalogue eligibility

Recipes SHALL use current player and reroll prices and the shared draft legality
checks, including a Veteran Lineman and the chosen Insignificant ruling. Recipes
SHALL NOT change composition to hide an illegal draft.

#### Scenario: Rules profiles differ on a Snotling build

- **WHEN** the coach browses under GW rules
- **THEN** the seven-Lineman Max snots recipe is excluded
- **WHEN** the coach selects the NAF rulings that ignore Insignificant at the draft
- **THEN** that recipe is available to a competition using those rulings

### Requirement: Computer selections use fresh catalogue copies

Friendly computer-opponent selection and competition setup SHALL use catalogue
recipes. Each new instance SHALL have fresh team and player ids, zero match
history, and its recipe's lineup, rerolls, name, and kit. Repeated names within
one competition SHALL receive a distinguishing suffix.

#### Scenario: A friendly needs one saved human team

- **GIVEN** the coach has one saved team
- **WHEN** the coach selects a catalogue opponent and starts a friendly
- **THEN** the computer plays a fresh unsaved copy
- **AND** the opponent does not appear in the coach's saved team library

### Requirement: A competition owns its copy and progression

Competition creation SHALL instantiate and validate each selected recipe before
saving entrants. The copy SHALL use the competition profile's advancement mode,
or Advanced League when the profile is absent. Its source recipe id SHALL
survive local and cloud persistence. Subsequent results and development SHALL
mutate only that competition's copy.

#### Scenario: Two leagues use the same starting team

- **WHEN** the same recipe enters two leagues with different advancement modes
- **THEN** each league references a separate team and separate players
- **AND** each copy follows its league's advancement mode
- **AND** development in one league changes neither the other copy nor the recipe

### Requirement: League filling uses catalogue variants

The league fill action SHALL retain selected entrants, spread roster types before
repeating them, and choose catalogue builds legal for the competition's rules.
The coach SHALL be able to change each computer entrant's roster and build.
