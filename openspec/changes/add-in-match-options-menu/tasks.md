## 1. Menu State and Actions

- [ ] 1.1 Define context-derived in-match option descriptors for local, sandbox, resumed, host, guest, and connection states
- [ ] 1.2 Implement a single bottom-right options trigger and expandable menu in the match HUD
- [ ] 1.3 Remove the superseded permanent abandon and online controls after their actions are routed through the menu

## 2. Navigation and Abandonment

- [ ] 2.1 Implement Return to Main Menu through the canonical local autosave/resume path without recording concession
- [ ] 2.2 Implement destructive Abandon Match as a distinct action with explanatory confirmation and cancel behavior
- [ ] 2.3 Clear or finalize resumable state only after abandonment is confirmed for the current match type
- [ ] 2.4 Ensure navigation failures leave the coach in the match with an actionable error rather than discarding state

## 3. Online Context

- [ ] 3.1 Move connection status and supported reconnect/session actions into the options menu
- [ ] 3.2 Gate host-only actions by authoritative role and explain unavailable actions to guests
- [ ] 3.3 Refresh action enabled state when connection or ownership changes while the menu is open

## 4. Accessibility and Verification

- [ ] 4.1 Add accessible names, expanded state, focus entry/return, Escape handling, and keyboard navigation
- [ ] 4.2 Add component tests for menu contents across all match and connection contexts
- [ ] 4.3 Add headless Playwright coverage for return/save/resume, cancel/confirm abandonment, guest restrictions, and reconnect visibility
- [ ] 4.4 Add a fixed-viewport screenshot baseline for the collapsed and expanded bottom-right menu
