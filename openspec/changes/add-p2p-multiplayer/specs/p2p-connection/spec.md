# p2p-connection

## ADDED Requirements

### Requirement: Serverless host/join pairing
The system SHALL let one player host and one player join a match over a WebRTC data channel with no dedicated game server: the host produces an offer code, the joiner produces an answer code, exchanged out-of-band. Connection setup SHALL fail with a clear, user-visible reason (never a hang) when pairing or ICE fails.

#### Scenario: Two machines connect
- **WHEN** the joiner submits a valid answer for the host's offer
- **THEN** the data channel opens and both sides see the connection as established

#### Scenario: Bad code fails clearly
- **WHEN** a malformed or expired code is pasted
- **THEN** the user is told the pairing failed and can retry, with no partial game state created

### Requirement: Versioned hello with team exchange
On connection the peers SHALL exchange a hello message carrying protocol version and each player's serialized team; the host SHALL supply the match seed. Mismatched protocol versions SHALL abort with an explanatory message before any game starts.

#### Scenario: Teams and seed established
- **WHEN** the hello exchange completes
- **THEN** both sides display both teams and the match proceeds to the coin flip using the host's seed

### Requirement: Ordered, deduplicated messaging
All messages SHALL travel in an envelope with a monotonic sequence number; receivers SHALL detect gaps and duplicates. A detected gap SHALL trigger a resync rather than continuing from inconsistent state.

#### Scenario: Gap triggers resync
- **WHEN** the guest observes a missing sequence number
- **THEN** it requests and applies a full snapshot resync before accepting further play

### Requirement: Disconnect detection and rejoin
Heartbeats SHALL detect a dead peer within seconds; the remaining player SHALL see a disconnected state. A returning peer SHALL be able to rejoin the same match and receive a full state resync (snapshot + any pending decision) and continue play.

#### Scenario: Guest rejoins mid-match
- **WHEN** the guest reloads their browser and re-pairs
- **THEN** they receive the current snapshot and pending decision and the match continues from exactly where it paused
