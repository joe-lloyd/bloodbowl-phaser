# Tasks: explain-sideline-crew-on-hover

## 1. Staff projection carries its own explanation

- [ ] 1.1 Extend `SidelineStaffMember` in `src/game/presentation/sidelineStaff.ts` with a display name and a match-effect description per type
- [ ] 1.2 Expose the team's true count per staff type alongside the capped drawn count
- [ ] 1.3 Add a payload builder that turns a staff type plus team into the panel subject, shared by both renderers

## 2. Info-panel channel accepts a non-player subject

- [ ] 2.1 Add `UI_ShowInfo` with a discriminated subject (`player` | `sidelineCrew`) in `src/types/events.ts`, keeping `UI_ShowPlayerInfo` working during migration
- [ ] 2.2 Render the crew subject in `PlayerInfoPanel` with name, effect, and count, and no statline, skills, or status
- [ ] 2.3 Reuse `UI_HidePlayerInfo` to clear the panel

## 3. Hover wiring

- [ ] 3.1 Give each crew container in `Dugout.createStaffRail` a hit area sized to the figure with `pointerover`/`pointerout` emitting show/hide
- [ ] 3.2 Wire the `NO STAFF` board label to the same events through the React board-label overlay
- [ ] 3.3 Confirm hover takes no pointer-down and cannot start a drag or change selection

## 4. Verification

- [ ] 4.1 Unit test the staff projection's names, effect text, and real-vs-drawn counts, including a team above a cap
- [ ] 4.2 Component test that a crew subject renders without player fields and clears on hide
- [ ] 4.3 Browser pass: hover each of the four crew types and the `NO STAFF` placeholder mid-activation, confirming the panel fills and clears and the activation is untouched
- [ ] 4.4 Run the unit and component suites and report the result
