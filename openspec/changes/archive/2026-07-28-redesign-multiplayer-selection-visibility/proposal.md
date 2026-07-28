## Why

Two related online-match visibility bugs surfaced by real play: (1) during interactive kickoff-table steps (Solid Defence, Quick Snap, High Kick, Charge!) that only one coach may resolve, both coaches' screens currently render the same Skip/Confirm buttons and eligible/selected highlight circles — the passive coach sees controls they cannot use and clutter that doesn't belong to them, instead of just watching the outcome happen. (2) For the rest of the match, the team a coach doesn't control is shown with a blanket white "selectable" square over every one of its players whenever it's that team's turn, when in an online match that coach can never select any of those players anyway — it doesn't tell them anything actionable, and it hides the one thing that would be useful: which single player the other coach is actually looking at or acting through right now.

## What Changes

- `KickoffEventOverlay.tsx` SHALL NOT render the Skip/Confirm button row for a coach who is not the deciding coach for the open step; that coach sees the event/outcome text only.
- `GameplayInteractionController.syncKickoffStepInteraction()` SHALL NOT draw the blue-eligible or gold-selected pitch highlight circles for a coach who is not the deciding coach for the open step.
- In an online match, the white "active team" square border (`PlayerSprite.teamTurnBorder`) SHALL NOT be drawn for the opposing (not-locally-controlled) team. The yellow (prone) and orange (stunned) status-border colors, and the dimmed-opacity treatment for already-activated players, are unaffected — they are status information, not team-selectability, and continue to render for both teams exactly as today.
- A new live indicator (a red ring) SHALL show, on the local board, which single player of the opposing team the other coach currently has selected — replacing the blanket white team highlight with something specific and truthful about what the other coach is doing, for the whole match (not just kickoff).
- The match-sync transport gains a small new envelope kind carrying "this coach's current selection changed" so a guest's local selection (which today never leaves their browser) can reach the host, symmetric to how chat already crosses in both directions.

## Capabilities

### New Capabilities
(none — this composes existing capabilities)

### Modified Capabilities
- `kickoff-event-interactions`: add a requirement that step controls (Skip/Confirm) and eligible/selected pitch highlights are only rendered for the deciding coach; the passive coach sees the event/outcome and the live result of the deciding coach's moves, nothing else.
- `match-state-visual-sync`: add a requirement that a team a coach does not control, in an online match, is never shown with the blanket "active team" white square; instead a single red-ring indicator shows the specific player the other coach currently has selected, updated live.
- `game-sync-transport`: add a requirement for a lightweight, order-independent "selection changed" envelope kind that either peer may send at any time to inform the other which of their own players (if any) is currently selected.

## Impact

- `src/ui/components/hud/KickoffEventOverlay.tsx` — gate the button row on `canAct`.
- `src/game/controllers/GameplayInteractionController.ts` — gate `syncKickoffStepInteraction()`'s highlight loops on `canAct`; forward local selection changes to the network layer.
- `src/scenes/GameScene.ts` — gate the `TurnStarted` white-border assignment by `myTeamId` when an online match is active; render the new remote-selection red ring.
- `src/game/elements/PlayerSprite.ts` — add a second, independent ring for the remote-selection indicator (distinct from the existing local `selectionRing`).
- `src/types/events.ts` — add a `RemoteSelectionChanged` event and payload type.
- `src/network/envelope.ts`, `src/network/HostSession.ts`, `src/network/GuestSession.ts` — add a `"selection"` envelope kind, symmetric `sendSelection`/`onSelection` on both sessions.
- `src/network/OnlineMatch.ts` — wire local `PlayerSelected` (for the locally-controlled team only, deduped) to `sendSelection`, and incoming selections to `RemoteSelectionChanged`.
