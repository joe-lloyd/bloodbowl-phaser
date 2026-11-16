## Purpose

Choose and finish useful Sevens plans using the actual skills, opponents, remaining time and player-preservation costs.

## ADDED Requirements

### Requirement: Preserve chosen tactical targets

The shared coach SHALL preserve a selected activation's concrete destination or target through accepted declaration and continuation commands. It SHALL validate retained intent against the current actor, turn, possession and legal candidates, and replan when the intent becomes invalid.

#### Scenario: Prepare a scoring receiver

- **WHEN** the coach chooses a receiver's route to a useful catching square
- **THEN** subsequent commands pursue that square and finish the activation there instead of replacing the plan with generic cage movement

#### Scenario: Interrupted plan

- **WHEN** a participant or route is no longer available
- **THEN** the coach chooses a currently legal alternative without executing stale commands

### Requirement: Skill-aware transfer decisions

The coach SHALL compare runs, passes and handoffs using applicable skills and available reroll resources. One team reroll SHALL NOT be independently reused across stages of one transfer plan.

#### Scenario: Useful skilled pass

- **WHEN** a legal pass creates a better scoring opportunity than ordinary movement
- **THEN** its lower safety tier does not automatically exclude it and the coach can complete the selected transfer

#### Scenario: Unnecessary pass

- **WHEN** a run or handoff offers a better result
- **THEN** having passing skills does not force a pass

### Requirement: Late-half scoring and preparation

The coach SHALL consider risky scoring routes on turn six and preparation for a touchdown across turns five and six, including legal rushes and transfers. It SHALL distinguish a scoring attempt from safe progress that cannot reach the end zone in the remaining time.

#### Scenario: Last-turn big play

- **WHEN** only a difficult but legal run or transfer can produce a useful touchdown
- **THEN** the coach can attempt it instead of preferring non-scoring progress solely because it is safer

#### Scenario: Two-turn reach

- **WHEN** extra turn-five movement is needed to leave a scoring route on turn six
- **THEN** the coach values the future touchdown and can prepare that route

### Requirement: Contextual defensive preservation

When no viable scoring plan is found within the supported horizon, the coach SHALL value preventing an opposing score and avoiding unnecessary player loss. It SHALL account for fielded capabilities, player availability and persistent league injuries while retaining necessary defensive actions.

#### Scenario: Season preservation

- **WHEN** scoring is out of reach and an unrelated dangerous block risks a valuable league player
- **THEN** a useful safe defensive move or ending the activation can be preferred

#### Scenario: Necessary defence

- **WHEN** an opponent threatens an immediate score
- **THEN** preservation does not forbid a worthwhile defensive action solely because it carries risk

### Requirement: Shared capability planning

The same general coach SHALL serve browser and simulation play. Native and learned capabilities SHALL alter shared proposals, estimates and support plans rather than require a separate AI for each roster pair.

#### Scenario: Changed opponent capability

- **WHEN** the same team faces a different relevant strength, armour or skill counter
- **THEN** its plan is evaluated against the actual fielded opponent and can change

#### Scenario: Bloodlust support

- **WHEN** a Vampire's intended activation needs feeding support
- **THEN** the shared coach considers the supporting teammate and friendly attrition alongside the intended play
