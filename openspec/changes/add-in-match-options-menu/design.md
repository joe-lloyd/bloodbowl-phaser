## Context

Match-level controls currently compete for permanent space in the bottom-right HUD.
Destructive abandonment, online connection controls, and ordinary navigation also lack
a single predictable home. The menu must work across local, sandbox, resumed, and online
matches without changing the meaning of each action.

## Goals / Non-Goals

**Goals:**

- Replace the bottom-right control cluster with a compact expandable options menu.
- Provide a safe Return to Main Menu path that preserves resumable local progress.
- Keep Abandon Match explicit, confirmed, and distinct from returning.
- Show online-only controls only when an online session supports them.
- Make the menu keyboard accessible and testable headlessly.

**Non-Goals:**

- Redesign the rest of the match HUD.
- Add pause semantics to online matches.
- Change server authority or reconnect policy.

## Decisions

### Use one menu trigger with context-derived entries

A single labelled options button opens a focus-managed menu. Entries are produced from
match context rather than hidden with ad hoc CSS, so local and online coverage can assert
the exact available actions.

### Separate return from abandonment

Return to Main Menu requests the existing save/resume path and leaves the match
resumable. Abandon Match is destructive to the active match, always requires
confirmation, and clears or finalizes resume state according to match type.

### Keep online session operations behind the same menu

Reconnect/status controls appear only when an online session exists. Actions that only
the host may perform are disabled or omitted for guests with an explanation.

### Model the menu as ordinary accessible UI

The trigger exposes expanded state, focus enters the menu, Escape closes it, and focus
returns to the trigger. Playwright will exercise it using roles and labels rather than
coordinates.

## Risks / Trade-offs

- **Extra click for frequently used controls** → Keep only genuinely match-level options
  in the menu and make the trigger consistently placed.
- **Return could be confused with concede/abandon** → Use distinct labels, explanatory
  copy, and confirmation only for destructive actions.
- **Online capability may change while open** → Recompute enabled state from current
  session state before executing an entry.
