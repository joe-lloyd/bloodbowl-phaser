## MODIFIED Requirements

### Requirement: Versioned hello with team and seed exchange

On entering a match the peers SHALL exchange a hello carrying the protocol version and each player's serialized team. The match seed SHALL be generated jointly before the match starts: each coach first records a hash of a private random secret, then, once both hashes exist, reveals the secret. Each side SHALL check both secrets against their hashes, and the seed SHALL be derived from both secrets together, so neither coach can choose it. A protocol-version mismatch SHALL abort before any game state is created, with an explanatory message.

#### Scenario: Seed made by both coaches

- **WHEN** both coaches have committed and revealed their secrets
- **THEN** both derive the same seed and the match can start

#### Scenario: A reveal that does not match its commitment

- **WHEN** a revealed secret does not hash to the value that coach committed
- **THEN** the match does not start and both coaches are told why

#### Scenario: Version mismatch aborts

- **WHEN** the two clients report incompatible protocol versions
- **THEN** the match does not start and both users are told why

### Requirement: Snapshot resync

The side that may act SHALL be able to send a resync envelope containing a full game snapshot, the RNG state, the per-team turn counters, the match stats and the current pending decision. On receipt the other side SHALL rebuild its engine from it and redraw its board, rather than replaying prior commands.

#### Scenario: Rebuilt from snapshot

- **WHEN** a side receives a resync envelope
- **THEN** its board, teams, score, dice state and pending decision match the sender's exactly, and its next command checksum matches

## ADDED Requirements

### Requirement: Compact command envelopes

During play, envelopes SHALL carry the action-protocol command and the sender's state checksums, not the game state. Full state SHALL travel only in hello-triggered and mismatch-triggered resyncs.

#### Scenario: Message size during play

- **WHEN** a coach performs an ordinary action such as a move step
- **THEN** the envelope written to the transport is under 1 KB
