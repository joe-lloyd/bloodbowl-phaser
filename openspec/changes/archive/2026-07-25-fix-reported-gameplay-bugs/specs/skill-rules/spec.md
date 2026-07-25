# skill-rules

## ADDED Requirements

### Requirement: Horns adds +1 Strength on a Blitz block
When a player with Horns performs a Block Action as part of a Blitz Action, the system SHALL apply a +1 modifier to that player's Strength for the block, and the block dice SHALL be recomputed from the boosted strength. The bonus SHALL apply on the blitz path, not only on a standing (non-blitz) block.

#### Scenario: Horns boosts the blitz block
- **WHEN** a player with Horns declares a Blitz and performs the resulting block
- **THEN** their effective Strength for that block is increased by 1 and the block dice reflect the boosted strength

### Requirement: An offered reroll can be accepted
When the reroll machinery offers a reroll (including a skill reroll such as Dodge), the decision SHALL expose an accept option alongside decline, and the accept option SHALL resolve the decision by performing the reroll. A reroll offer SHALL NOT present only a decline control.

#### Scenario: Dodge reroll offers accept and decline
- **WHEN** a player with Dodge fails a dodge roll and is offered the Dodge reroll
- **THEN** the decision presents both an accept (use the reroll) control and a decline control, and choosing accept performs the reroll
