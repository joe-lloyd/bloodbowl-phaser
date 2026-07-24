# action-protocol (delta)

## ADDED Requirements

### Requirement: Reroll pending decision
The protocol SHALL support a `pendingDecision` of type `reroll` — carrying the deciding team, player, roll kind, and available sources (specific skill and/or team reroll) — and a `use-reroll` reply command `{accept, source?}`. While a reroll decision is pending, non-reply game commands SHALL be rejected, consistent with existing decision gating.

#### Scenario: Reroll reply resumes play
- **WHEN** a reroll decision is pending and `{"type":"use-reroll","accept":true,"source":"skill"}` is submitted
- **THEN** the roll is rerolled from the seeded dice service and the response reports the new result with the decision cleared
