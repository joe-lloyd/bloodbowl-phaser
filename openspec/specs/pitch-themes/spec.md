# pitch-themes

## Purpose
Defines the match's one visual presentation, the Blood Bowl stadium, and how matches, saves, lobbies and links from when a second style (Neon) existed still open in it.

## Requirements

### Requirement: One match presentation
Every match SHALL be drawn in the Blood Bowl presentation: its pre-rendered stadium, its render of every player model, and its canvas colour. Local setup and the online lobby SHALL NOT offer a choice of match style.

#### Scenario: Local play
- **WHEN** a local (hotseat) or computer match is started
- **THEN** the pitch renders in the Blood Bowl stadium and team selection shows no match style picker

#### Scenario: Online play
- **WHEN** the host and guest open the online lobby and start a match
- **THEN** the lobby shows no match style setting and both coaches see the Blood Bowl stadium

### Requirement: Retired styles open the Blood Bowl presentation
A pitch theme id written before the presentation was fixed, including `neon` and the earlier `classic`, `mud`, `astro` and `wasteland`, SHALL be ignored wherever it still appears: a saved or autosaved match's `presentation.pitchThemeId`, an online lobby's `settings.pitchThemeId`, or a `?theme=` link. Such a match SHALL open in the Blood Bowl presentation without an error, and new saves and lobbies SHALL NOT write the id.

#### Scenario: Resuming a Neon save
- **WHEN** a coach resumes a match saved while the Neon style was selected
- **THEN** the match resumes in the Blood Bowl stadium and the next autosave carries no pitch theme id

#### Scenario: Following an old Neon link
- **WHEN** a coach opens a match link with `?theme=neon`
- **THEN** the match loads only Blood Bowl stadium art, before and after a reload

### Requirement: Presentation does not change gameplay geometry
The presentation SHALL NOT alter the grid dimensions, square size, offsets, or the grid↔pixel mapping. Player placement, hit-testing, and scenario coordinates SHALL be the same as before the Neon style was removed.

#### Scenario: Placement unchanged
- **WHEN** a scenario is loaded
- **THEN** every player and the ball occupy the same grid squares as in the scenario definition
