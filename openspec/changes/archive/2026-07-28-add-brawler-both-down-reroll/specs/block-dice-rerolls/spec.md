## ADDED Requirements

### Requirement: Block-dice re-roll sources surface as buttons on the block-dice decision
When a block roll offers a re-roll source (Team Re-roll, Pro, or Brawler), the system SHALL make it available as a control on the same `block-dice` pending decision that shows the roll — a button in the browser's block popup, or a corresponding command the headless protocol accepts while that decision is pending — rather than as a separate confirmation prompt raised before the roll is shown. The coach SHALL always see the current dice before being offered any re-roll on them.

#### Scenario: Coach sees the roll before any re-roll offer
- **WHEN** block dice are rolled and at least one re-roll source is available
- **THEN** the roll is shown immediately, with the available re-roll(s) offered as button(s)/command(s) alongside it — no confirmation popup gates the coach's view of the dice

#### Scenario: Team Re-roll re-rolls all dice
- **WHEN** the acting team has a banked Team Re-roll and spends it on a block roll
- **THEN** every die is re-rolled and the block-dice decision refreshes with the new results

#### Scenario: Pro re-rolls one die after a 3+ check
- **WHEN** the attacker has Pro, is the active player, has not yet used Pro this action, and spends it on one die
- **THEN** a D6 is rolled; on a 3+ that one die is re-rolled and the decision refreshes, and on a failure no die changes but no other re-roll source may be used on this block

#### Scenario: Brawler re-rolls the single Both Down die
- **WHEN** the attacker has Brawler and a rolled die currently reads Both Down
- **THEN** a "Brawler: re-roll 1 Both Down" control is offered; using it re-rolls that one die (no skill check) and the decision refreshes with the new result

#### Scenario: Declining or ignoring a re-roll leaves the roll unchanged
- **WHEN** the coach chooses a block result without using any offered re-roll source
- **THEN** the roll resolves exactly as originally rolled, consuming no re-roll and no additional dice

### Requirement: Block-dice re-roll sources are mutually exclusive per block
Once any one of Team Re-roll, Pro, or Brawler has been spent on a block's dice, none of the others SHALL remain available for that same block, even if their own individual eligibility (banked re-roll, un-attempted Pro, an un-touched Both Down die) still holds. Each source SHALL be usable at most once per block, regardless of whether its use had an effect (a failed Pro attempt still counts as spent).

#### Scenario: Using Pro locks out Team Re-roll
- **WHEN** the attacker spends Pro on one die (whether the 3+ check succeeds or fails)
- **THEN** Team Re-roll and Brawler are no longer offered on that block, even if a Both Down die is still showing

#### Scenario: Using Team Re-roll locks out Brawler
- **WHEN** the acting team spends a Team Re-roll on the block
- **THEN** Brawler is not offered even if the re-rolled dice happen to show a new Both Down

#### Scenario: Using Brawler locks out Team Re-roll and Pro
- **WHEN** the attacker spends Brawler to re-roll the Both Down die
- **THEN** Team Re-roll and Pro are no longer offered on that block

### Requirement: Block-dice re-rolls are deterministic and observable
Every block-dice re-roll SHALL draw from the same seeded dice service as the original roll, and a skill-sourced re-roll (Pro, Brawler) SHALL emit a skill-trigger event naming the player, skill, and effect. Identical seeds and identical re-roll choices SHALL produce identical outcomes.

#### Scenario: Brawler's re-roll is announced
- **WHEN** Brawler re-rolls the Both Down die
- **THEN** a skill-trigger event names the attacker, Brawler, and that a Both Down was re-rolled

#### Scenario: Deterministic replay across re-roll choices
- **WHEN** two games run with the same seed and the same re-roll choices on a block
- **THEN** all dice results and outcomes are identical
