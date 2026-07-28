# remote-play

## Purpose

Define the host-authoritative online match model: a single live engine on the host, guests issuing action-protocol commands and rendering returned events, decision-ownership gating of input, live spectating while waiting, and abandon/forfeit and rejoin/resync handling.

## Requirements

### Requirement: Host-authoritative engine

Exactly one live game engine SHALL exist per match, on the host. The guest SHALL play by sending action-protocol commands and rendering the returned events/snapshots; the guest SHALL NOT simulate rules locally. All dice SHALL come from the host's seeded RNG.

#### Scenario: Guest command resolves on host

- **WHEN** the guest submits a move command for their player
- **THEN** the host engine executes it and both sides render the same resulting events and snapshot

### Requirement: Decision ownership gating

A command SHALL be accepted only from the side that owns it: normal commands from the active team's player; decision replies from the side matching the pending decision's chooser. The host SHALL reject (not crash on) out-of-turn commands; each client SHALL also disable its own input when it lacks ownership.

#### Scenario: Out-of-turn command rejected

- **WHEN** the waiting player sends a move command during the opponent's turn
- **THEN** the host rejects it with an ownership reason and game state is unchanged

#### Scenario: Opponent-owned decision

- **WHEN** an uphill block gives the die choice to the defender
- **THEN** only the defender's side may answer, and the attacker sees a waiting indicator naming the decision

### Requirement: Live spectating while waiting

The waiting player SHALL see the opponent's play as it happens — moves, dice results, events, and score — driven by broadcast responses, with an explicit waiting indicator showing whose action or decision the game awaits.

#### Scenario: Waiting player watches a block

- **WHEN** the active player performs a block with a push
- **THEN** the waiting player's board animates the dice result and push within the same exchange, without refreshing

### Requirement: Abandon and forfeit handling

If a peer disconnects and does not rejoin, the remaining player SHALL be able to end the match cleanly (recorded as opponent abandon/forfeit) rather than being stuck waiting forever. Heartbeats SHALL surface a disconnected state within seconds, and a returning peer SHALL be able to rejoin the same match and receive a full state resync (snapshot + any pending decision) and continue play.

#### Scenario: Opponent never returns

- **WHEN** the opponent has been disconnected past the grace period
- **THEN** the remaining player is offered to end the match and doing so exits to a final result screen

#### Scenario: Guest rejoins mid-match

- **WHEN** the guest reloads their browser and re-enters the same match
- **THEN** they receive the current snapshot and pending decision and the match continues from exactly where it paused

### Requirement: Guest reconciles on a rejected optimistic command

The guest client SHALL answer sync-returning mutations (declare-action, cancel-action) optimistically for responsiveness, but WHEN the host's asynchronous verdict for such a command is a rejection, the guest's local interaction state SHALL be corrected to stop acting on the stale assumption rather than continuing to build on it. A rejection of a declare-action or cancel-action the guest's UI had already treated as successful SHALL surface to the interaction layer so it can reconcile its local action-mode/step state against the (already snapshot-corrected) authoritative replica, instead of leaving the coach stuck repeating a command the host will never accept.

#### Scenario: Rejected declare-action resets the local step machine

- **WHEN** the guest optimistically declares an action for their player and the host later rejects that declaration
- **THEN** the guest's local action-mode and action-step state built on that declaration is cleared and the player's action menu is rebuilt from the authoritative replica, rather than leaving the guest able to attempt further steps (e.g. a Block roll) for an action the host never accepted

#### Scenario: Rejected cancel-action does not leave the guest believing no action is declared

- **WHEN** the guest optimistically cancels their player's declared action and the host rejects the cancellation because the declaration is already committed
- **THEN** the guest's local UI does not remain in the "no action declared" state it optimistically switched to — it reconciles against the replica, which still reflects the host's committed declaration

#### Scenario: A rejection for a superseded or unrelated command is ignored

- **WHEN** a rejection arrives for a command that no longer matches the guest's current local optimistic state (e.g. for a different player, or an action already superseded by a later local change)
- **THEN** the guest's current interaction state is left unchanged
