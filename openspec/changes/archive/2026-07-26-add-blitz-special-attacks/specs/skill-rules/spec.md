# skill-rules

## ADDED Requirements

### Requirement: Block-replacing attacks have direct declarations

A player eligible to use Stab, Chainsaw, Breathe Fire, Monstrous Mouth, or Projectile
Vomit SHALL be offered the corresponding direct Special Action when a legal target is
currently available. Resolving that action SHALL use the skill's own targeting and
resolution rules and SHALL complete the player's attack for that activation.

#### Scenario: Stab is declared while adjacent

- **WHEN** an unactivated player with Stab is adjacent to a legal opponent and selects
  Stab
- **THEN** Stab resolves against the selected target without first declaring a normal
  Block

#### Scenario: Direct action is omitted without a legal target

- **WHEN** a player has a block-replacing attack but no target that satisfies that
  skill's rules
- **THEN** the direct Special Action is not offered

### Requirement: Eligible attacks may replace the Block in a Blitz

For Stab, Chainsaw, Breathe Fire, Monstrous Mouth, and Projectile Vomit, an eligible
player SHALL be able to declare `Blitz (with <attack>)`, move under the normal Blitz
movement rules, and resolve the declared attack instead of Block upon reaching a legal
target.

#### Scenario: Player moves before using a replacement

- **WHEN** a player declares Blitz with an eligible attack and follows a legal route to
  a target
- **THEN** the declared attack becomes available against that target and resolves
  instead of Block

#### Scenario: Target remains unreachable

- **WHEN** no legal route can place the declared attacker in a position permitted by the
  selected attack
- **THEN** the client does not offer an invalid target and the authoritative rules
  reject any forged target command

#### Scenario: Normal Block is not available after the replacement

- **WHEN** the player resolves the declared block-replacing attack during a Blitz
- **THEN** that player cannot also make a normal Block in the same activation

### Requirement: Replacement Blitzes obey action economy

Declaring a Blitz with a block-replacing attack SHALL reserve the team's one Blitz for
the turn and SHALL consume the player's activation under the same commitment and
cancellation rules as a normal Blitz.

#### Scenario: Team Blitz is already spent

- **WHEN** the team has already used its Blitz this turn
- **THEN** no Blitz variant of a block-replacing attack is legal

#### Scenario: Replacement Blitz completes

- **WHEN** a player completes a Blitz using a block-replacing attack
- **THEN** the team's Blitz is spent and the player is marked activated exactly once

### Requirement: Declared replacements synchronize across clients

Legal-action payloads and action commands SHALL identify the selected block replacement.
Graphical, headless, host, and guest clients SHALL observe the same declaration, target,
rolls, and final state.

#### Scenario: Guest declares a replacement Blitz

- **WHEN** the owning guest submits a legal Blitz declaration with a selected replacement
- **THEN** the authoritative match accepts it and both clients retain that replacement
  through movement and resolution

#### Scenario: Non-owner forges a declaration

- **WHEN** a client that does not own the active team submits a replacement declaration
- **THEN** the authoritative match rejects it without spending an action

### Requirement: Special-attack scenarios use appropriate players

Seeded scenarios for Stab, Chainsaw, Breathe Fire, Monstrous Mouth, and Projectile Vomit
SHALL use a player who possesses the skill by roster default where available, or through
a legal and documented roster advancement path otherwise.

#### Scenario: Scenario provenance is inspected

- **WHEN** the special-attack scenario catalog is validated
- **THEN** every attacker records a roster-valid reason for possessing the tested skill
  and no ordinary Human player is given an unrelated mutation merely for the test
