# match-stats

## Purpose

Track attributable, headless-safe match outcomes for SPP: only progression-enabled matches award SPP, standard SPP actions are attributed exactly from engine events (not UI text), participation and summary statistics are tallied via the typed EventBus with no DOM/Phaser dependency, and Star Player / Journeyman eligibility is respected.

## Requirements

### Requirement: Progression applies only to eligible matches

The system SHALL award and persist SPP only when the match is explicitly progression-enabled. Friendly/disabled matches SHALL award no SPP.

#### Scenario: Friendly match

- **WHEN** a match ends with progression disabled
- **THEN** no player SPP changes and no progression is persisted

### Requirement: Standard SPP outcomes are attributed exactly

The engine SHALL provide attributable outcomes for every standard SPP action without parsing UI text.

#### Scenario: Accurate completion

- **WHEN** a Pass Action produces an Accurate Pass caught directly by a team-mate without a bounce
- **THEN** the passer records one Completion

#### Scenario: Non-completion

- **WHEN** a hand-off succeeds, an inaccurate pass is caught, an opponent catches the pass, or the ball bounces before a team-mate catches it
- **THEN** no Completion is recorded

#### Scenario: Throw Team-mate awards

- **WHEN** a thrown team-mate lands safely
- **THEN** the thrown player records a safe landing and, only when the throw was Superb, the thrower records a Superb Throw landing

#### Scenario: Block casualty survives recovery

- **WHEN** a player knocks down another player during a Block Action and the victim suffers a Casualty
- **THEN** the causer records an SPP-eligible Casualty even if both players fell or the victim later recovers through Regeneration, an Apothecary, or another rule

#### Scenario: Other casualty does not qualify

- **WHEN** a Casualty is caused by a Special Action, failed dodge, foul, or the crowd
- **THEN** it is not counted as a standard SPP-eligible Casualty

#### Scenario: Touchdown and interception

- **WHEN** a player scores a Touchdown or intercepts an opposition Pass Action
- **THEN** the scorer/interceptor is recorded

### Requirement: Participation and summary statistics are headless-safe

The system SHALL track participating players and per-player completion, safe landing, superb throw, interception, eligible casualty, touchdown, MVP, blocks, yards, and injuries using the typed EventBus with no DOM or Phaser dependency.

#### Scenario: Headless tally

- **WHEN** a headless match emits gameplay outcomes
- **THEN** an immutable per-player and per-team summary is available

### Requirement: Star Player and Journeyman eligibility

Star Players SHALL never generate SPP. Journeymen SHALL generate SPP normally and retain it only if the later hiring step keeps them.

#### Scenario: Mixed temporary players

- **WHEN** a Star Player and a Journeyman each perform the same SPP action
- **THEN** only the Journeyman receives earned SPP
