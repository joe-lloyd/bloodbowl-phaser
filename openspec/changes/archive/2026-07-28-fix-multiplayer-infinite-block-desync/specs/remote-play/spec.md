## ADDED Requirements

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
