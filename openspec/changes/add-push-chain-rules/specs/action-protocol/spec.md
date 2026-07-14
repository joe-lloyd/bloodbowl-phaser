# action-protocol (delta)

## ADDED Requirements

### Requirement: Chained and crowd push decisions
The protocol SHALL support the `push-direction` pending decision occurring multiple times for a single block (one per chain link), each attributed to the blocking team via `chooserTeamId`. Options MAY include occupied squares (chain pushes) and one off-pitch coordinate representing the crowd exit. Command gating SHALL apply to each link as to any pending decision.

#### Scenario: Chain surfaces sequentially
- **WHEN** a block causes a two-link chain push in a headless game
- **THEN** answering the first push-direction decision yields a response carrying the second, and only after both are answered does the response report the applied moves
