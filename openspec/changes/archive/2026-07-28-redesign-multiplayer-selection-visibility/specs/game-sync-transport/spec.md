## ADDED Requirements

### Requirement: Selection-change envelope
Either peer SHALL be able to send a lightweight "selection changed" envelope at any time, carrying the id of the player they currently have selected on their own controlled team, or none. This envelope is cosmetic (it drives only a live UI indicator, never engine state) and SHALL NOT participate in the ordered/deduplicated command-sequencing guarantees required for gameplay commands — a peer receiving it simply updates its display of the other coach's current selection to the latest value received.

#### Scenario: A selection change reaches the other peer
- **WHEN** a coach selects one of their own controlled team's players
- **THEN** the other peer receives a selection-change envelope naming that player

#### Scenario: A deselection reaches the other peer
- **WHEN** a coach deselects their currently selected player
- **THEN** the other peer receives a selection-change envelope with no player

#### Scenario: Selection envelopes do not affect gameplay state
- **WHEN** a selection-change envelope is sent or received
- **THEN** no game command executes and no snapshot or pending decision changes as a result
