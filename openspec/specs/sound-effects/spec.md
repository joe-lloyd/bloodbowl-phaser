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

### Requirement: Dice-roll sound varies between rolls
The dice-roll effect SHALL NOT play one fixed, identical pattern on every trigger. It SHALL vary (by outcome and/or a randomized variation) so a sequence of rolls is audibly distinguishable rather than sounding like the same effect repeated.

#### Scenario: Consecutive rolls are not identical
- **WHEN** two dice rolls are triggered in succession
- **THEN** the resulting playback is not the exact same fixed note pattern both times

### Requirement: Leaving a match fully stops all sound
Tearing down the game page or scene (leaving a match, returning to the main menu, starting a new match) SHALL stop all sound output — both the synthesized scheduler and any in-flight one-shot sample — not merely unsubscribe event bindings. No sound triggered by the left match SHALL continue playing afterward.

#### Scenario: Leaving mid-effect silences it
- **WHEN** a coach leaves a match while a sound effect or sample is playing
- **THEN** playback stops immediately and no further sound from that match is heard

#### Scenario: A new match starts silent of the old one
- **WHEN** a coach starts a new match after leaving a previous one
- **THEN** none of the previous match's sound is still audible
