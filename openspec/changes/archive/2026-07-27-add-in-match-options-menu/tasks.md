## 1. Menu State and Actions

- [x] 1.1 Define context-derived in-match option descriptors for local, sandbox, resumed, host, guest, and connection states
- [x] 1.2 Implement a single bottom-right options trigger and expandable menu in the match HUD
- [x] 1.3 Remove the superseded permanent abandon and online controls after their actions are routed through the menu

## 2. Navigation and Abandonment

- [x] 2.1 Implement Return to Main Menu through the canonical local autosave/resume path without recording concession
- [x] 2.2 Implement destructive Abandon Match as a distinct action with explanatory confirmation and cancel behavior
- [x] 2.3 Clear or finalize resumable state only after abandonment is confirmed for the current match type
- [x] 2.4 Ensure navigation failures leave the coach in the match with an actionable error rather than discarding state

## 3. Online Context

- [x] 3.1 Move connection status and supported reconnect/session actions into the options menu
- [x] 3.2 Gate host-only actions by authoritative role and explain unavailable actions to guests
- [x] 3.3 Refresh action enabled state when connection or ownership changes while the menu is open

## 4. Accessibility and Verification

- [x] 4.1 Add accessible names, expanded state, focus entry/return, Escape handling, and keyboard navigation
- [x] 4.2 Add component tests for menu contents across all match and connection contexts
- [x] 4.3 Add headless Playwright coverage for return/save/resume, cancel/confirm abandonment, guest restrictions, and reconnect visibility
      (deviation: no Playwright/e2e harness exists in this worktree yet — that infra is being added by the
      parallel `add-comprehensive-e2e-scenario-testing` change. Implemented as equivalent vitest + jsdom
      component/DOM coverage instead: `__tests__/unit/gameHudMatchOptions.test.tsx` covers return/save/resume,
      cancel/confirm abandonment, guest restrictions, and reconnect visibility flipping live. The one scenario
      jsdom cannot verify — native Enter/Space activating a focused `<button>` — is confirmed empirically as a
      jsdom gap (real browsers do this natively); every menu entry is a genuine `<button>`, so Playwright's
      keyboard press will exercise it correctly once that harness lands.)
- [x] 4.4 Add a fixed-viewport screenshot baseline for the collapsed and expanded bottom-right menu
      (deviation: no pixel-screenshot tooling is wired into this worktree; followed the existing browser-free
      "deterministic render vs. checked-in fixture" convention from
      `__tests__/headless/match-state-visual-baseline.test.ts`, applied to the menu's DOM subtree instead of an
      SVG — see `__tests__/unit/matchOptionsMenuVisualBaseline.test.tsx` and `__tests__/unit/screenshots/`.)
