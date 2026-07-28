# sound-effects

## Purpose

The interaction sound suite: a catalog of named effects synthesized in the UI layer, bound to existing EventBus domain events, with layering/priority rules and persisted user settings (mute/volume). The engine and headless mode never reference sound — `SoundManager` and its native Web Audio synthesis engine live entirely under `src/ui/sound/`.

## Requirements

### Requirement: Interaction sound catalog
The system SHALL provide a named, distinctly-synthesized sound effect for each core interaction: dice roll, block impact, pushback, knockdown, kick-off, ball bounce, catch, fumble, pass, turnover, touchdown, KO/injury, foul, send-off, end of half/game. Each effect SHALL be built from layered Web Audio primitives (oscillators, filtered noise, envelopes) chosen to audibly evoke the interaction it represents, not a single flat tone. Each catalog entry SHALL be individually auditioned on the sound test page. There SHALL be no generic UI-click sound in the catalog.

#### Scenario: Audition board plays every effect
- **WHEN** a user opens the sound test page and triggers each catalog entry
- **THEN** each entry plays its distinct, layered effect

#### Scenario: Dice roll sounds like rolling dice
- **WHEN** the dice-roll effect plays
- **THEN** it is built from multiple short randomized percussive taps (not a single tone), evoking dice rattling and landing

#### Scenario: Touchdown sounds like a crowd cheering
- **WHEN** the touchdown effect plays
- **THEN** it is a layered noise-and-tone swell evoking a crowd roar, distinct from every other effect in the catalog

#### Scenario: Turnover sounds discordant, not like a whistle
- **WHEN** the turnover effect plays
- **THEN** it is a sustained dissonant/detuned tone cluster signaling something bad happened, not a clean whistle blast

#### Scenario: No UI click sound exists
- **WHEN** the catalog is inspected or the sound test page is opened
- **THEN** no entry named `uiClick` (or equivalent generic UI-click effect) is present

### Requirement: Sounds bind to domain events
Sound playback SHALL be driven exclusively by subscribing to existing EventBus domain events in the UI layer; the engine SHALL NOT contain sound-specific calls or emit sound-specific events. Adding a binding for a new event SHALL require only a catalog/binding entry.

#### Scenario: Block plays impact sound
- **WHEN** a block resolves and `BlockDiceRolled`/knockdown events are emitted during browser play
- **THEN** the mapped effects play without any engine code referencing sound

#### Scenario: Turnover whistle
- **WHEN** a `Turnover` event is emitted
- **THEN** the turnover whistle plays

### Requirement: Sound stays out of the engine import chain
No module under `src/game`, `src/services`, or `src/headless` SHALL import the sound system or its Web Audio synthesis engine (directly or transitively). Headless mode SHALL be silent by construction.

#### Scenario: Headless runs in plain Node
- **WHEN** the headless CLI or test suite loads the engine in Node
- **THEN** no sound-engine import is reached and execution proceeds

### Requirement: Overlap control
Rapid event sequences SHALL NOT produce audio chaos: each sound has a minimum re-trigger interval, and higher-priority sounds (touchdown, turnover whistle) take precedence over lesser concurrent effects.

#### Scenario: Block chain stays intelligible
- **WHEN** a block causes knockdown, armour break, and injury events within one second
- **THEN** the resulting audio is limited per the priority/throttle rules rather than playing every effect at full overlap

### Requirement: User sound settings
The system SHALL provide master mute and volume control, persisted across sessions, applied to all suite playback — including sound already in flight when the setting changes, not only sounds triggered afterward.

#### Scenario: Mute persists
- **WHEN** a user mutes sound and reloads the page
- **THEN** no sounds play until unmuted

#### Scenario: Muting silences sound already playing
- **WHEN** a user mutes sound while a multi-layered effect (e.g. touchdown) is still audibly playing
- **THEN** that in-flight sound is silenced immediately, not merely prevented from repeating

#### Scenario: Volume changes apply live
- **WHEN** a user drags the volume slider while a sound effect is playing
- **THEN** the playing sound's loudness changes accordingly, without needing to wait for the next trigger

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

### Requirement: Concurrent triggers cannot strand or silently replace each other
Each triggered sound SHALL be allocated its own independent playback unit (its own audio nodes), so that a rapid sequence of triggers — of the same or different catalog entries — can never cause one sound to be silently replaced by another in a way that leaves it looping or playing indefinitely.

#### Scenario: Rapid dice rolls never get stuck
- **WHEN** dice-roll events fire in rapid succession (faster than each effect's natural playback duration)
- **THEN** each triggered instance plays and finishes on its own; no dice-roll (or any other) sound continues playing indefinitely after the events that triggered it have passed

#### Scenario: A later different sound is always audible
- **WHEN** a dice-roll sound is playing and a higher-priority event (e.g. a touchdown) fires immediately after
- **THEN** the new sound is audibly triggered — playback is never stuck replaying only the earlier sound

### Requirement: Sound test page navigation works
The sound test/audition page's "Back to Main Menu" control SHALL navigate the user back to the main menu route.

#### Scenario: Back to Main Menu returns to the menu
- **WHEN** a user on the sound test page clicks "Back to Main Menu"
- **THEN** the app navigates to the main menu route
