## Why

The dugout's Sideline Crew rail draws a figure per assistant coach, cheerleader, apothecary, and dedicated fan, each badged with a single character — `C`, `★`, `+`, `F`. Nothing explains them. `Dugout.createStaffRail` builds each figure as a plain container with a name and no input handling, so hovering does nothing, and a coach has no way to learn that the star icons are what add to the Cheering Fans roll or that the `+` is the once-per-match Apothecary. Every other object on the board answers "what is this?" by filling the top-right information panel on hover; the crew rail is the one thing that does not.

## What Changes

- **Sideline crew figures are hoverable.** Each rendered crew figure SHALL respond to hover by filling the same top-right information panel used for players.
- **The panel explains the role, not just its name.** The panel SHALL name the crew type, state what it does in match terms — assistant coaches add to the Brilliant Coaching roll, cheerleaders add to the Cheering Fans roll, dedicated fans add to the Pitch Invasion roll and to winnings, the apothecary patches up one KO or casualty per match — and show how many of that type the team has.
- **Capped counts are honest.** Where a team has more of a staff type than the rail can draw, the panel SHALL report the team's real count rather than the number of drawn figures.
- **An empty rail is explained too.** The `NO STAFF` placeholder SHALL be hoverable and SHALL explain that the team retains no sideline staff and what that costs them.
- **Hover-out restores the panel.** Moving off a crew figure SHALL clear the crew information the same way moving off a player does, without disturbing a player selection.

## Capabilities

### New Capabilities
- `sideline-crew-inspection`: hovering a sideline crew figure explains what that staff type is and what it does, through the existing information panel.

## Impact

- Rail rendering: `src/game/elements/Dugout.ts` `createStaffRail` — crew containers gain a hit area and pointer-over/out handlers; the `NO STAFF` label becomes hoverable.
- Staff model: `src/game/presentation/sidelineStaff.ts` — `SidelineStaffMember` gains the display name and rules explanation alongside its existing label and colour, keeping the projection pure and testable, plus the team's true count per type for the capped case.
- Events: `src/types/events.ts` — the info-panel channel currently carries a `Player` (`UI_ShowPlayerInfo`); it needs a subject that is not a player, either as a sibling event or a widened payload.
- Panel: `src/ui/components/hud/PlayerInfoPanel.tsx` renders the crew subject without pretending it is a player (no statline, no skills).
- Tests: a unit test over the staff projection's explanations and capped counts, plus a component/browser check that hover fills and clears the panel.
