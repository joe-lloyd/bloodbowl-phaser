# sound-effects

## Purpose

The interaction sound suite: a catalog of named effects synthesized in the UI layer, bound to existing EventBus domain events, with layering/priority rules and persisted user settings (mute/volume). The engine and headless mode never reference sound — `SoundManager`/`@strudel/web` live entirely under `src/ui/sound/`.

## Requirements

### Requirement: Interaction sound catalog
The system SHALL provide a named sound effect for each core interaction: dice roll, block impact, pushback, knockdown, kick-off, ball bounce, catch, fumble, pass, turnover whistle, touchdown, KO/injury, foul, send-off, end of half/game. Each catalog entry SHALL be individually auditioned on the sound test page.

#### Scenario: Audition board plays every effect
- **WHEN** a user opens the sound test page and triggers each catalog entry
- **THEN** each entry plays its distinct effect

### Requirement: Sounds bind to domain events
Sound playback SHALL be driven exclusively by subscribing to existing EventBus domain events in the UI layer; the engine SHALL NOT contain sound-specific calls or emit sound-specific events. Adding a binding for a new event SHALL require only a catalog/binding entry.

#### Scenario: Block plays impact sound
- **WHEN** a block resolves and `BlockDiceRolled`/knockdown events are emitted during browser play
- **THEN** the mapped effects play without any engine code referencing sound

#### Scenario: Turnover whistle
- **WHEN** a `Turnover` event is emitted
- **THEN** the turnover whistle plays

### Requirement: Sound stays out of the engine import chain
No module under `src/game`, `src/services`, or `src/headless` SHALL import the sound system or `@strudel/web` (directly or transitively). Headless mode SHALL be silent by construction.

#### Scenario: Headless runs in plain Node
- **WHEN** the headless CLI or test suite loads the engine in Node
- **THEN** no `@strudel/web` import is reached and execution proceeds

### Requirement: Overlap control
Rapid event sequences SHALL NOT produce audio chaos: each sound has a minimum re-trigger interval, and higher-priority sounds (touchdown, turnover whistle) take precedence over lesser concurrent effects.

#### Scenario: Block chain stays intelligible
- **WHEN** a block causes knockdown, armour break, and injury events within one second
- **THEN** the resulting audio is limited per the priority/throttle rules rather than playing every effect at full overlap

### Requirement: User sound settings
The system SHALL provide master mute and volume control, persisted across sessions, applied to all suite playback.

#### Scenario: Mute persists
- **WHEN** a user mutes sound and reloads the page
- **THEN** no sounds play until unmuted
