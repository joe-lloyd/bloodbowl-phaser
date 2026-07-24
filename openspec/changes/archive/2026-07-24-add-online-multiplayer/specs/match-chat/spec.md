# match-chat

## ADDED Requirements

### Requirement: Chat tab in the dice-roller panel

The dice-roller panel SHALL provide a Chat tab alongside the dice log. Selecting it SHALL show the match's chat history and let the player send a text message. The dice log SHALL remain available on its own tab.

#### Scenario: Player opens chat

- **WHEN** a player selects the Chat tab in the dice-roller panel
- **THEN** the chat history is shown and the player can type and send a message

#### Scenario: Dice log preserved

- **WHEN** the player switches back to the dice log tab
- **THEN** the dice roll history is shown unchanged

### Requirement: Chat relayed to the opponent

A sent chat message SHALL be delivered to the opponent through the same match message stream as game commands, attributed to its sender. Chat SHALL be allowed at any time regardless of whose turn it is or who owns the current decision.

#### Scenario: Opponent receives chat

- **WHEN** a player sends a chat message
- **THEN** the opponent sees it in their Chat tab attributed to the sender

#### Scenario: Chat while waiting

- **WHEN** it is not a player's turn
- **THEN** they can still send and receive chat messages

### Requirement: Unread indication

When a chat message arrives while the player is not viewing the Chat tab, the panel SHALL indicate an unread message so it is not missed. The indicator SHALL clear when the player views the Chat tab.

#### Scenario: Unread badge on incoming chat

- **WHEN** a chat message arrives while the dice log tab is active
- **THEN** the Chat tab shows an unread indicator until the player opens it
