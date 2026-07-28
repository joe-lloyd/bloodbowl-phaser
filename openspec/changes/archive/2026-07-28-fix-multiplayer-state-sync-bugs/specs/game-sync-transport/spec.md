## MODIFIED Requirements

### Requirement: Snapshot resync

The host SHALL be able to send a resync envelope containing a full game snapshot plus the current pending decision. On receipt the guest SHALL rebuild its entire view from that snapshot rather than replaying prior events. The snapshot SHALL include each team's per-turn counter (not only the currently-active team's turn number), so a guest that has never seen a `TurnStarted` event for one or both teams — a fresh resync, a reload, or a gap-triggered resync — can still display the correct turn count for both teams.

#### Scenario: Guest rebuilds from snapshot

- **WHEN** the guest receives a resync envelope
- **THEN** its board, teams, score, and pending decision match the host's exactly

#### Scenario: Guest's per-team turn counters match after resync

- **WHEN** the guest receives a resync (or any broadcast/response) envelope mid-match
- **THEN** querying the guest's replica for either team's turn number returns the same value the host would return for that team
