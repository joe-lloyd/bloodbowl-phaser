# game-sync-transport

## Purpose

Define the Firestore-backed message transport that carries match traffic between two clients — a single send/subscribe abstraction, a versioned team/seed hello, ordered and deduplicated envelopes, snapshot resync, and the security rules that gate writes — so turn-based online play works without a dedicated game server and stays within the Firebase free tier.

## Requirements

### Requirement: Firestore message-bus transport

Match messages SHALL travel through a Firestore-backed transport: each client subscribes to the match's message stream and sends a message as a document write. The transport SHALL be accessed through a single abstraction (send envelope / subscribe to envelopes) so the underlying carrier can be replaced without changing session logic. The design SHALL keep write volume low enough to remain within the Firebase free tier for turn-based play (no per-second or per-command server round-trips).

#### Scenario: Message delivered over Firestore

- **WHEN** one client sends an envelope
- **THEN** the other client receives it through its subscription without any dedicated game server

#### Scenario: One listener per client

- **WHEN** a client is in a match
- **THEN** it observes commands, responses, broadcasts, and chat through a single ordered stream

### Requirement: Versioned hello with team and seed exchange

On entering a match the peers SHALL exchange a hello carrying the protocol version and each player's serialized team, and the host SHALL supply the match seed. A protocol-version mismatch SHALL abort before any game state is created, with an explanatory message.

#### Scenario: Teams and seed established

- **WHEN** the hello exchange completes
- **THEN** both sides have both teams and the match seed and proceed to the opening sequence

#### Scenario: Version mismatch aborts

- **WHEN** the two clients report incompatible protocol versions
- **THEN** the match does not start and both users are told why

### Requirement: Ordered, deduplicated envelopes

Every message SHALL be wrapped in an envelope carrying a monotonic per-sender sequence number and the sender identity. Receivers SHALL apply envelopes in order and ignore duplicates. A detected gap SHALL trigger a resync rather than continuing from inconsistent state.

#### Scenario: Duplicate ignored

- **WHEN** an envelope with an already-seen sequence number arrives
- **THEN** it is ignored and state is unchanged

#### Scenario: Gap triggers resync

- **WHEN** a client detects a missing sequence number
- **THEN** it requests and applies a full snapshot resync before accepting further play

### Requirement: Snapshot resync

The host SHALL be able to send a resync envelope containing a full game snapshot plus the current pending decision. On receipt the guest SHALL rebuild its entire view from that snapshot rather than replaying prior events. The snapshot SHALL include each team's per-turn counter (not only the currently-active team's turn number), so a guest that has never seen a `TurnStarted` event for one or both teams — a fresh resync, a reload, or a gap-triggered resync — can still display the correct turn count for both teams.

#### Scenario: Guest rebuilds from snapshot

- **WHEN** the guest receives a resync envelope
- **THEN** its board, teams, score, and pending decision match the host's exactly

#### Scenario: Guest's per-team turn counters match after resync

- **WHEN** the guest receives a resync (or any broadcast/response) envelope mid-match
- **THEN** querying the guest's replica for either team's turn number returns the same value the host would return for that team

### Requirement: Selection-change envelope

Either peer SHALL be able to send a lightweight "selection changed" envelope at any time, carrying the id of the player they currently have selected on their own controlled team, or none. This envelope is cosmetic (it drives only a live UI indicator, never engine state) and SHALL NOT participate in the ordered/deduplicated command-sequencing guarantees required for gameplay commands — a peer receiving it simply updates its display of the other coach's current selection to the latest value received. The receiver SHALL verify that a claimed player id actually belongs to the sending peer's own team before applying it; a claim naming a player outside the sender's team SHALL be discarded rather than displayed.

#### Scenario: A selection change reaches the other peer

- **WHEN** a coach selects one of their own controlled team's players
- **THEN** the other peer receives a selection-change envelope naming that player

#### Scenario: A deselection reaches the other peer

- **WHEN** a coach deselects their currently selected player
- **THEN** the other peer receives a selection-change envelope with no player

#### Scenario: Selection envelopes do not affect gameplay state

- **WHEN** a selection-change envelope is sent or received
- **THEN** no game command executes and no snapshot or pending decision changes as a result

#### Scenario: A claim naming another team's player is rejected

- **WHEN** a peer sends a selection-change envelope naming a player that does not belong to that peer's own controlled team
- **THEN** the receiver discards the claim and does not display it as a selection

### Requirement: Security-rule edge validation

Firestore security rules SHALL restrict game-document writes to the match's members (plus claiming the empty guest seat as oneself while a lobby is open), restrict message writes to members, and require a message's sender field to match the authenticated writer. A callable Cloud Function MAY additionally validate lobby create/join and roster legality as optional hardening — it requires the Blaze plan, so the system SHALL be fully playable without it, and it SHALL NOT execute per-command game logic.

#### Scenario: Non-member write blocked

- **WHEN** a user who is not a member of a match attempts to write to its game document or messages
- **THEN** the write is denied by security rules

#### Scenario: Spoofed sender blocked

- **WHEN** a client writes a message whose sender field is not its own authenticated id
- **THEN** the write is denied
