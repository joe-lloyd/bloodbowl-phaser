# Task 11: Developer Tools & Scenario Loader

**Status**: 📋 NOT STARTED
**Priority**: 🟡 Medium
**Phase**: 4 - Tooling & Polish
**Dependencies**: [Task 02](./02-architecture-refactoring.md)

## 📝 Description

Create a suite of developer tools and a scenario loader to quickly set up specific game states (e.g., "Setup Done", "Mid-Turn", "Touchdown Imminent") without playing through the full game flow. This drastically reduces iteration time for testing mechanics.

## 🎯 Objectives

1. **Scenario Loader**: Ability to load a predefined `GameState` via URL param or Debug UI.
2. **Debug UI**: An overlay to inspect current state, toggle flags, and trigger events.
3. **State Manipulation**: Tools to drag-and-drop players, force turnovers, or set ball position.

## ✅ Acceptance Criteria

- [ ] Debug Mode toggle implemented
- [ ] Scenario Preset system created
- [ ] Helper method to load `GameState` from JSON/Object
- [ ] UI to trigger "Skip to Phase X"
- [ ] Shortcuts (e.g., Press 'T' to force turnover)

## 📋 Scenarios to Support

- **Setup Complete**: Both teams set up, ready for kickoff.
- **Mid-Turn**: Active player selected, ready to move.
- **Blitz**: Player declared blitz, ready to block.
- **Scoring Position**: Player with ball adjacent to endzone.

## 🛠 Technical Approach

- Create `ScenarioManager` service.
- Add `loadScenario(scenarioId: string)` to `GameService`.
- Use a GUI library (e.g., `tweakpane` or simple HTML/CSS overlay) for the control panel.
