## MODIFIED Requirements

### Requirement: Only the owning coach may act in an event step
An event step SHALL be actionable only by the coach it belongs to — the kicking coach for Solid Defence and Charge!, the receiving coach for High Kick and Quick Snap. In an online match the other coach SHALL see the step's event/outcome text and SHALL see the owning coach's moves happen live on the board, but SHALL NOT be able to act in it, SHALL NOT see the step's Confirm/Skip controls, and SHALL NOT see the eligible-player or selected-player pitch highlight circles — those are specific to the owning coach's own interaction and would otherwise misrepresent what the passive coach can do.

#### Scenario: The opposing coach cannot act
- **WHEN** a Quick Snap step is open for the receiving coach in an online match
- **THEN** the kicking coach sees the step but cannot select or move any player

#### Scenario: The opposing coach sees no step controls
- **WHEN** an interactive kickoff event step is open in an online match
- **THEN** the non-owning coach's screen shows no Confirm or Skip buttons for that step

#### Scenario: The opposing coach sees no eligible/selected highlights
- **WHEN** an interactive kickoff event step is open in an online match
- **THEN** the non-owning coach's pitch shows no blue eligible-player or gold selected-player highlight circles for that step

#### Scenario: Both coaches see the outcome
- **WHEN** an event step completes
- **THEN** both coaches see the resulting board state

#### Scenario: The opposing coach watches the moves happen live
- **WHEN** the owning coach moves or places a player as part of resolving the step (e.g. Solid Defence redeployment, Quick Snap's one-square move)
- **THEN** that move is reflected on the non-owning coach's board as it happens, without requiring any action from them
