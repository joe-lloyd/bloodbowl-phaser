# in-match-options-menu

## Purpose

Give local and online matches one predictable, accessible home for match-level controls — leaving, abandoning, and online session actions — via a single bottom-right expandable options menu, instead of scattering destructive and connection controls across the HUD.

## Requirements

### Requirement: Match-level controls use an expandable options menu

The bottom-right match HUD SHALL provide one labelled options trigger that expands a menu
of actions valid for the current match context. The menu SHALL NOT permanently occupy
the HUD with each individual action.

#### Scenario: Options menu opens

- **WHEN** the coach activates the in-match options trigger
- **THEN** the trigger reports expanded state and the valid match actions are displayed

#### Scenario: Menu closes without an action

- **WHEN** the coach presses Escape or activates the trigger while the menu is open
- **THEN** the menu closes and focus returns to the trigger without changing match state

### Requirement: Returning to the main menu preserves resumable progress

Return to Main Menu SHALL save the current resumable local match through the canonical
local-match save path before navigating away. It SHALL NOT be treated as abandonment or
concession.

#### Scenario: Return from a resumable local match

- **WHEN** the coach chooses Return to Main Menu during a resumable local match
- **THEN** the current match is saved, the main menu is shown, and the match can be
  resumed from that saved state

#### Scenario: Return is not a concession

- **WHEN** a coach returns to the main menu
- **THEN** no concession outcome or artificial score change is recorded

### Requirement: Abandonment is explicit and confirmed

Abandon Match SHALL be a separate menu action and SHALL require confirmation that
describes its effect before any destructive state change occurs.

#### Scenario: Abandonment is cancelled

- **WHEN** the coach opens the abandonment confirmation and cancels it
- **THEN** the match and its resume state remain unchanged

#### Scenario: Local match is abandoned

- **WHEN** the coach confirms abandonment of a local match
- **THEN** the active match is ended, its resumable snapshot is cleared, and the coach is
  returned to the main menu

### Requirement: Online controls reflect session role and state

Online-only menu entries SHALL appear only for online matches and SHALL reflect whether
the current coach is host or guest and whether the session is connected, reconnecting,
or disconnected.

#### Scenario: Local match omits online controls

- **WHEN** the options menu opens in a local or sandbox match
- **THEN** no online connection controls are shown

#### Scenario: Disconnected online coach sees reconnect

- **WHEN** an online coach opens the menu while the session is disconnected and
  reconnect is supported
- **THEN** a reconnect action is available

#### Scenario: Guest cannot invoke a host-only action

- **WHEN** a guest opens a menu containing a host-only session action
- **THEN** the guest cannot invoke it and the role restriction is communicated

### Requirement: The menu is accessible and headlessly testable

The options trigger, menu, entries, confirmation, and status text SHALL expose accessible
roles and names and SHALL support keyboard operation.

#### Scenario: Keyboard-only return

- **WHEN** a Playwright test opens the menu, selects Return to Main Menu, and confirms
  using only keyboard input
- **THEN** the same save and navigation behavior occurs as with pointer input

### Requirement: The menu can host an inline control entry

The Match Options menu SHALL support an entry that renders an inline interactive control
(such as a mute checkbox and volume slider), in addition to its simple labelled actions.
This entry SHALL NOT require the coach to leave the menu or open a separate popup to use
it, and SHALL NOT permanently occupy the HUD outside the expanded menu. Such a control
SHALL join the same keyboard navigation as the menu's other entries — reachable by Arrow
key, with Tab/Shift+Tab kept within the open menu rather than leaking focus elsewhere on
the page.

#### Scenario: Sound control lives in the menu

- **WHEN** the coach opens the Match Options menu
- **THEN** a mute checkbox and volume slider are available as an entry inside that menu

#### Scenario: No separate floating sound popup

- **WHEN** the Match Options menu is closed
- **THEN** no separate mute/volume popup is shown elsewhere on the HUD

#### Scenario: Inline control is keyboard-reachable within the trapped menu

- **WHEN** the coach opens the menu and presses Arrow keys to navigate its entries
- **THEN** focus can reach the inline control's own interactive elements, and Tab does not
  move focus outside the open menu
