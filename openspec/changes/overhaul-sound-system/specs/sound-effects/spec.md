# sound-effects

## ADDED Requirements

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
