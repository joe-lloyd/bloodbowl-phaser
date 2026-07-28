# dice-log-font-scale

## Purpose

The Dice Log's roll/entry text is small by default. Players can manually scale it larger (or smaller), and the choice persists so it doesn't need to be re-set every session.

## Requirements

### Requirement: The Dice Log text size is manually adjustable
The Dice Log panel SHALL offer a manual control to scale its roll/entry text size larger or smaller than the default, so players who find the default text too small can increase it.

#### Scenario: Increasing the scale enlarges log text
- **WHEN** the player raises the Dice Log font-size control above its default
- **THEN** the roll and entry text in the log is rendered larger, and the rows reflow to fit the larger text

#### Scenario: Decreasing the scale shrinks log text
- **WHEN** the player lowers the Dice Log font-size control below its default
- **THEN** the roll and entry text in the log is rendered smaller, and the rows reflow to fit the smaller text

#### Scenario: The control is bounded
- **WHEN** the player repeatedly increases or decreases the scale
- **THEN** the scale stops changing once it reaches a minimum or maximum bound, rather than growing or shrinking without limit

### Requirement: The chosen font scale persists across sessions
The Dice Log font-size scale the player last set SHALL be remembered and re-applied the next time the log is shown, without the player needing to re-set it.

#### Scenario: Scale survives a reload
- **WHEN** the player sets a non-default Dice Log font scale and then reloads or restarts the app
- **THEN** the Dice Log is rendered at the previously chosen scale, not the default

#### Scenario: No stored preference falls back to the default
- **WHEN** no Dice Log font scale has ever been set (or the stored value can't be read)
- **THEN** the Dice Log renders at the default (100%) scale
