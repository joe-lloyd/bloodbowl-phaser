# foul-action-flow

## Purpose

Ensure declared Foul actions resolve through the foul sequence and that targeted action modes never fall through to an implicit Block.

## Requirements

### Requirement: A declared Foul resolves as a Foul
While a player has a Foul action declared, selecting a Prone or Stunned opponent SHALL resolve the Foul sequence — armour roll, injury roll on a break, and the referee/sending-off check. The block dice dialog SHALL NOT open, and no Block SHALL be declared or previewed as a result of that selection.

#### Scenario: Fouling a downed opponent runs the Foul sequence
- **WHEN** a coach declares a Foul with a player standing adjacent to a Prone opponent and clicks that opponent
- **THEN** the Foul resolves — an armour roll is made against the downed player and logged as a Foul — and the block dice dialog does not appear

#### Scenario: Fouling a Stunned opponent runs the Foul sequence
- **WHEN** a coach declares a Foul and clicks an adjacent Stunned opponent
- **THEN** the Foul resolves against that Stunned player rather than opening a Block

### Requirement: A Foul click on an illegal target does not become a Block
While a Foul is declared, selecting a target that cannot be fouled — a Standing opponent, a team-mate, or an empty square — SHALL leave the Foul declared and report why the target is invalid. It SHALL NOT fall through to an implicit Block declaration.

#### Scenario: Clicking a standing opponent during a Foul
- **WHEN** a coach declares a Foul and clicks an adjacent Standing opponent
- **THEN** the coach is told the target must be Prone or Stunned, the Foul remains declared, and no block dice dialog opens

### Requirement: An implicit Block is only declared when no action is declared
The implicit Block shortcut — clicking an adjacent opponent to declare and preview a Block — SHALL only apply when the selected player has no declared action and no action mode is active. Any active action mode SHALL claim the click for its own action or reject it.

#### Scenario: An active action mode never decays into a Block
- **WHEN** a coach has any targeted action mode active (Foul, a special action, Throw Team-mate, Pass, Hand-off) and clicks an adjacent opponent
- **THEN** the click is handled by that action mode and never results in a Block declaration or a block dice dialog

#### Scenario: The Block shortcut still works with nothing declared
- **WHEN** a coach selects a Standing player with no declared action and clicks an adjacent opponent
- **THEN** a Block action is implicitly declared and the block dice are previewed as before
