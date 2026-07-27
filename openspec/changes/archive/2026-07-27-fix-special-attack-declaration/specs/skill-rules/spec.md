## MODIFIED Requirements

### Requirement: Block-replacing attacks have direct declarations

A player eligible to use Stab, Chainsaw, Breathe Fire, Monstrous Mouth, or Projectile
Vomit SHALL be offered the corresponding direct Special Action when a legal target is
currently available AND the player has not used any movement in the current activation.
A player that has already moved SHALL NOT be offered a direct Special Action; the Blitz
variant is the only way to move and then attack. Resolving that action SHALL use the
skill's own targeting and resolution rules and SHALL complete the player's attack for
that activation.

#### Scenario: Stab is declared while adjacent

- **WHEN** an unactivated player with Stab is adjacent to a legal opponent and selects
  Stab
- **THEN** Stab resolves against the selected target without first declaring a normal
  Block

#### Scenario: Direct action is omitted without a legal target

- **WHEN** a player has a block-replacing attack but no target that satisfies that
  skill's rules
- **THEN** the direct Special Action is not offered

#### Scenario: Moving next to an opponent does not offer a direct Special Action

- **WHEN** a player with Stab declares a Move Action and moves into contact with a
  legal opponent
- **THEN** Stab and every other direct block-replacing Special Action are absent from
  the action menu for the rest of that activation

#### Scenario: A moved player's direct declaration is refused authoritatively

- **WHEN** a direct block-replacing Special Action is commanded for a player that has
  already used movement this activation, from any client or the headless protocol
- **THEN** the declaration is refused, the state is unchanged, and the refusal states
  that the attack must be declared as a Blitz before moving

### Requirement: Eligible attacks may replace the Block in a Blitz

For Stab, Chainsaw, Breathe Fire, Monstrous Mouth, and Projectile Vomit, an eligible
player SHALL be able to declare `Blitz (with <attack>)`, move under the normal Blitz
movement rules, and resolve the declared attack instead of Block upon reaching a legal
target. While such a declaration is live and unused, selecting a target on the board
SHALL resolve the declared attack; it SHALL NOT resolve a normal Block.

#### Scenario: Player moves before using a replacement

- **WHEN** a player declares Blitz with an eligible attack and follows a legal route to
  a target
- **THEN** the declared attack becomes available against that target and resolves
  instead of Block

#### Scenario: Clicking the target resolves the declared attack

- **WHEN** a player has declared Blitz with Stab, has moved adjacent to a legal
  opponent, and the coach clicks that opponent on the board
- **THEN** Stab resolves against them, and no block dice are rolled or previewed

#### Scenario: Clicking an illegal target refuses by name

- **WHEN** a player with a declared block-replacing attack clicks an adjacent opponent
  that the declared attack may not legally target
- **THEN** the click is refused with a message naming the declared attack, the player
  keeps their declaration and remaining movement, and no Block is made

#### Scenario: Target remains unreachable

- **WHEN** no legal route can place the declared attacker in a position permitted by the
  selected attack
- **THEN** the client does not offer an invalid target and the authoritative rules
  reject any forged target command

#### Scenario: Normal Block is not available after the replacement

- **WHEN** the player resolves the declared block-replacing attack during a Blitz
- **THEN** that player cannot also make a normal Block in the same activation
