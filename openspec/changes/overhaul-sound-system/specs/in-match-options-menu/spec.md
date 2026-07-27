# in-match-options-menu

## ADDED Requirements

### Requirement: The menu can host an inline control entry
The Match Options menu SHALL support an entry that renders an inline interactive control (such as a mute checkbox and volume slider), in addition to its simple labelled actions. This entry SHALL NOT require the coach to leave the menu or open a separate popup to use it, and SHALL NOT permanently occupy the HUD outside the expanded menu.

#### Scenario: Sound control lives in the menu
- **WHEN** the coach opens the Match Options menu
- **THEN** a mute checkbox and volume slider are available as an entry inside that menu

#### Scenario: No separate floating sound popup
- **WHEN** the Match Options menu is closed
- **THEN** no separate mute/volume popup is shown elsewhere on the HUD
