## MODIFIED Requirements

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

### Requirement: Sound stays out of the engine import chain
No module under `src/game`, `src/services`, or `src/headless` SHALL import the sound system or its Web Audio synthesis engine (directly or transitively). Headless mode SHALL be silent by construction.

#### Scenario: Headless runs in plain Node
- **WHEN** the headless CLI or test suite loads the engine in Node
- **THEN** no sound-engine import is reached and execution proceeds

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

## ADDED Requirements

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
