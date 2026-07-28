## Context

`KickoffEventOverlay.tsx` and `GameplayInteractionController.syncKickoffStepInteraction()` already compute `canAct` (`!match || (match.myTeamId === step.teamId && match.mayAct())`) but only use it to *disable* buttons/dragging, not to hide the interactive chrome outright. The actual state driving these (`getKickoffEventStep()`) is already correctly synced across the wire: on the guest it's read from `NetworkedGameService.getKickoffEventStep()`, which is sourced from `CommandResponse.pendingDecision` (the `"kickoff-event"` decision variant), refreshed on every command response/broadcast/resync. So item 1 is a pure rendering-gate fix — no state-sync change needed.

Item 2 is different: it needs *new* information to flow across the wire. `GameplayInteractionController.selectPlayer()` / `deselectPlayer()` emit `PlayerSelected` purely as local UI state — never a `HeadlessCommand`, because selecting a player to inspect or begin a move declaration doesn't mutate engine state. Tracing the existing network layer (`src/network/OnlineMatch.ts`, `HostSession.ts`, `GuestSession.ts`, `envelope.ts`):

- The host's `EventBroadcaster` relays every event emitted on the host's local bus except those in `UI_INTENT_EVENTS` — `PlayerSelected` is not in that set, so a **host's own** selection already reaches the guest today (nothing currently renders it specially, but the data arrives).
- The **guest** has no outbound channel for anything but `"command"` / `"chat"` / `"resync-request"` / `"hello"` envelopes (`GuestSession.sendCommand`/`sendChat`/`requestResync`/`sendHello`). A guest's local selection never leaves their browser.
- Charge!'s `advanceCharge()` (`KickoffEventManager.ts`) already emits `PlayerSelected` for the newly-active player as a genuine **engine** event — this always originates on the host (the only place `KickoffEventManager` runs) and already crosses to the guest via the generic broadcaster today.

So the one true gap is guest → host. The fix needs a channel that works the same way in both directions so the code doesn't special-case host vs. guest.

## Goals / Non-Goals

**Goals:**
- Passive kickoff-step coach sees no Skip/Confirm buttons and no eligible/selected highlight circles; they still see the event/outcome text and the deciding coach's moves happening live (already true today via `PlayerMoved`/`PlayerPlaced`).
- A coach never sees a blanket "this whole team is selectable" white square for a team they don't control in an online match.
- A coach sees a single, live-updating red ring on whichever one player of the opposing team the other coach currently has selected — for the entire match, including (via the same mechanism) kickoff steps.
- Yellow prone / orange stunned status borders and activated-opacity dimming are untouched.

**Non-Goals:**
- Redesigning the local `selectionRing`/`highlight()` mechanism used for a coach's own click-to-inspect/act flow — it is untouched, just joined by a second, independent visual.
- General "presence" features (cursors, hover previews) — only *selection* (the same signal `PlayerSelected` already represents locally) is broadcast.
- Sending every local selection change (including inspecting an opponent's own player) across the wire — only a coach's selection of one of *their own* controlled team's players is meaningful to the other side, since that is the thing the blanket white square used to represent.

## Decisions

- **New envelope kind `"selection"`, payload `{ playerId: string | null }`.** Both `HostSession` and `GuestSession` get a `sendSelection(playerId)` method and an `onSelection` callback, mirroring the existing `sendChat`/`onChat` pair exactly (same shape, same "just forward, no seq-dependent ordering logic needed" treatment already used for chat). Alternative considered: piggyback the existing `EventBroadcaster`/generic-events mechanism used for engine events. Rejected because that path is strictly host-outbound (the guest has no equivalent), and retrofitting a guest-outbound generic-event broadcaster would be a much larger change for a single event type; a dedicated envelope kind is the smaller, more obviously-correct diff and matches an existing precedent (chat) instead of inventing a new pattern.
- **Forwarding logic lives in `OnlineMatch.ts`**, not the controller. `GameplayInteractionController` keeps emitting `PlayerSelected` exactly as it does today (including from the kickoff click handler and, indirectly via the engine, from `advanceCharge()`); `OnlineMatch.ts` subscribes to that same local `eventBus` and, only when `player.teamId === myTeamId` (or `player` is `null` following a selection that *was* on `myTeamId`), calls `session.sendSelection`, deduped against the last value actually sent so the common "select A, then A again" or repeated `deselectPlayer()` calls don't spam the transport. This keeps the interaction controller free of any network awareness, consistent with how it already treats `getActiveOnlineMatch()` purely as a read-only gate (`canAct`), never as something it pushes into.
- **Receiving side renders from a new local-only event, not by re-interpreting `PlayerSelected`.** `onSelection` emits `GameEventNames.RemoteSelectionChanged` with `{ playerId }`. `GameScene` keeps a single `remoteSelectedPlayerId` and asks `PlayerSprite` for a **second, independent ring** (not a reuse of `highlight()`/`selectionRing`) so remote-selection display can never collide with or be clobbered by the existing local click-to-inspect highlight, which uses the same ring object with a variable color today. This is the smallest change that guarantees no visual or state interference between "what I clicked" and "what they selected."
- **`teamTurnBorder` gating is a one-line addition at the call site**, not a change to `PlayerSprite`: `GameScene`'s `TurnStarted` handler already computes `sprite.getPlayer().teamId === turnData.teamId`; it now also requires `!match || turnData.teamId === match.myTeamId`. Local/offline play (`match` is `null`) is completely unaffected — both teams keep behaving exactly as before, since local hotseat has no "team I don't control" concept.
- **Kickoff and general play share one mechanism.** Once the blue/gold kickoff-step highlights are hidden from the passive coach (item 1), the same red-ring channel (item 2) is what lets that coach see which player the deciding coach currently has selected during Solid Defence/Quick Snap/Charge! — no kickoff-specific network code is added; `PlayerSelected` already fires from the existing kickoff click handler and from `advanceCharge()`, so it flows through the same `myTeamId`-gated forwarding path automatically.

## Risks / Trade-offs

- [A host-originated selection now travels to the guest via *two* paths: the pre-existing generic `EventBroadcaster` replay of `PlayerSelected` (unused for rendering) and the new dedicated `"selection"` envelope.] → Harmless — the guest's rendering only ever reacts to `RemoteSelectionChanged` (sourced solely from `onSelection`), never to a replayed `PlayerSelected`, so there is no double-render; the only cost is one small extra Firestore write per host selection change, which is the same order of magnitude as existing chat/heartbeat traffic and not a hot path (selection changes at the rate of coach clicks, not per-frame).
- [Deduping "only send when the forwarded value changed" needs care around rapid select→deselect→select-different-own-player sequences (e.g. `selectPlayer()` always calls `deselectPlayer()` internally first).] → Accepted as a minor, cosmetic flicker risk (the other coach's red ring could blink off between two clicks); not worth adding debounce complexity for a purely cosmetic indicator.
- [New envelope kind widens the `Envelope` union that `FirestoreTransport`, `HostSession`, and `GuestSession` all switch over.] → Both switches already have safe fallthrough (`default: break` / unhandled kinds are ignored), so this is additive and cannot regress existing message handling; covered by a `createInMemoryTransportPair`-based session test.

## Migration Plan

No data migration. Purely additive: new envelope kind, new event, new rendering. Older-vs-newer protocol versions aren't a concern here since `"selection"` envelopes are cosmetic (a peer running old code simply never emits or reacts to them; nothing depends on receiving one). No `PROTOCOL_VERSION` bump needed — commands and snapshots are unchanged.

## Open Questions

None — scope is fully bounded by the proposal and confirmed against the current code paths listed above.
