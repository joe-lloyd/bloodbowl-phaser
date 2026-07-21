# skill-rules (delta)

## ADDED Requirements

### Requirement: Activation rolls gate the declared action
The system SHALL provide a single activation-declared trigger that folds the activating player's rules after an action is declared and before it is performed. A rule at this trigger SHALL be able to roll dice and, per its book text, let the action proceed, downgrade the declared action, end the activation immediately, apply a player condition, or force a book-defined effect requiring a coach choice (via the standard decision channel). Failure effects SHALL flow through the existing activation/turnover paths, and a declared once-per-Turn action (e.g. Blitz) SHALL still count as used when the gate fails, where the book says so.

#### Scenario: Bone Head fails
- **WHEN** a Bone Head player declares an action and rolls a natural 1 on the gate
- **THEN** the player becomes Distracted per the book and the declared action does not execute

#### Scenario: Failed gate on the team's last activatable player
- **WHEN** the last player able to act fails an activation gate that ends their activation
- **THEN** the turn passes to the opponent normally, without a turnover being latched

### Requirement: Die-level rerolls compose with the reroll machinery
The reroll machinery SHALL support offering a die-level reroll source (Pro) alongside skill and team sources: eligible only during the player's own activation and never for Armour, Injury, or Casualty Rolls; gated by the book's usage roll; rerolling exactly one die of the original roll (the chooser selecting which die when several were rolled); and, once attempted, locking that roll against every other reroll source.

#### Scenario: Pro attempt locks out the team reroll
- **WHEN** a player with Pro attempts the Pro roll on a failed dodge and the usage roll fails
- **THEN** the dodge result stands and no team reroll may be offered for it

#### Scenario: One die of a multi-die roll
- **WHEN** Pro succeeds against a roll made with several dice
- **THEN** exactly one chosen die is rerolled and the rest keep their values

### Requirement: End-of-opponent-turn trigger
The system SHALL fire a trigger when a team's opponent's turn ends, before the next turn starts, folding rules of the non-active team (Pick-Me-Up class). Effects SHALL respect book limits such as a player stood up by the trait being unable to use the trait themselves that turn.

#### Scenario: Pick-Me-Up stands a Prone team-mate
- **WHEN** the opposition's turn ends with a Prone player within 3 squares of a Standing team-mate with Pick-Me-Up and the roll succeeds
- **THEN** the Prone player stands before the next turn begins

### Requirement: Keyword-parameterized rules match roster keywords
A rule whose instance parameter names a keyword (Animosity (X), Hatred (X)) SHALL match it against the target player's keywords through one shared helper, with `(all)` matching every team-mate, so keyword semantics stay uniform across rules.

#### Scenario: Animosity refuses a matching hand-off
- **WHEN** an Animosity (X) player attempts a hand-off to a team-mate bearing keyword X and rolls a 1
- **THEN** the action is refused and the player's activation ends, with no turnover
