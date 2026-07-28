## ADDED Requirements

### Requirement: Optimistic setup placement renders without a Reserves flash

While a coach is setting up their own team online, relocating an already-placed
player from one legal pitch square directly to another legal pitch square SHALL
render as a single, atomic move on both the mover's own screen and the opponent's
spectating screen. The player's sprite SHALL NOT visibly appear in the Reserves
dugout box at any point during that move. Only a drop that actually leaves the
pitch (an illegal square, or an explicit removal) SHALL show the player in
Reserves.

#### Scenario: Guest repositions an already-placed player

- **WHEN** the guest, during their own setup turn, drags a player already on the
  pitch from one legal square to a different legal square
- **THEN** the player's sprite moves directly to the new square with no visible
  frame showing it in the Reserves box, regardless of the timing of the host's
  command responses

#### Scenario: Host repositions an already-placed player while the guest watches

- **WHEN** the host, during their own setup turn, drags a player already on the
  pitch from one legal square to a different legal square
- **THEN** both the host's own board and the guest's spectating board show the
  move directly to the new square, with no intermediate render of the player in
  the Reserves box

#### Scenario: An illegal drop still returns the player to Reserves

- **WHEN** a coach drags an already-placed player and drops them outside the
  setup zone
- **THEN** the player is shown in the Reserves box, since they have genuinely left
  the pitch

#### Scenario: A first-time placement does not get stuck showing Reserves

- **WHEN** the guest, during their own setup turn, places a player from the
  dugout onto a legal pitch square for the first time (not a reposition)
- **THEN** the player's sprite shows only on the pitch for the rest of the
  guest's turn — it does not become stuck rendering in the Reserves box even
  as further snapshots arrive while the guest keeps setting up
