## Why

Match-level controls are scattered across the HUD, with the destructive abandon button occupying prime space while online controls appear elsewhere. A compact, expandable options menu in the bottom-right gives local and online matches one predictable home for leaving, abandoning, and future match settings.

## What Changes

- Replace the standalone abandon control with a bottom-right expandable match-options menu.
- Provide a non-destructive “Return to main menu” action for resumable local matches, preserving the latest autosave.
- Keep “Abandon match” as a separate confirmed action that ends the match and removes its resumable save.
- Move applicable online leave/disconnect controls into the same menu, with wording and consequences appropriate to host and guest.
- Make the menu keyboard accessible, responsive, and safe against accidental destructive activation.

## Capabilities

### New Capabilities
- `in-match-options-menu`: a unified expandable menu for local navigation, confirmed abandonment, online departure, and future match-scoped options.

### Modified Capabilities

## Impact

- UI: `GameHUD`, online match controls, button components, overlay layering, focus management, and responsive positioning.
- Navigation/persistence: `GamePage`, local match autosave repository, results flow, and abandon/forfeit handling.
- Online lifecycle: host/guest disconnect and concession paths.
- Tests: component accessibility, local save preservation/clearing, and online ownership behavior.
