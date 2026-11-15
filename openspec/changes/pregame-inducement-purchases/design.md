# Design

## Context

The inducement session currently lives outside serialized game state. Its unused HUD panel assumes local hotseat and optimistic network calls do not echo its state. Local opening uses CoinFlipOverlay; online opening has a separate shared readiness/toss screen. ComputerMatch uses the same command proxy as online.

## Goals / Non-Goals

Goals: one authoritative pregame state and purchase validation path; no gameplay until confirmed inventory and choices are ready; backwards-compatible saves.
Non-goals: change prices, add treasury spending, alter draft-budget purchases or introduce new inducement effects.

## Decisions

- Opt new graphical matches into a persisted pregame state containing ready flags and the authoritative offer. Keep older saves and headless scenarios without the opt-in compatible.
- Store selections in state and reconstruct the small negotiation from that state, avoiding stale cached sessions after snapshot replacement. Include it in existing save/sync serialization.
- Readiness comes from the opening weather ready-up (`ready-weather`), which the guest sends before the host. Reuse the purchase commands and reject edits before both teams ready, out of turn, after confirmation, and outside the opening. The higher team value buys first; the ownership gate refuses the other coach before sending, because lockstep cannot take purchases from both coaches at once. Confirmation commits draft plus purchased inventory once.
- Share the readiness/purchase component between local and online toss screens. Derive progress from accepted state; wait for network acknowledgments and show failures. Hold the toss until both confirmations and pregame decisions settle.
- ComputerMatch readies its side and chooses affordable catalog items using a small deterministic purchase policy. It continues to answer pregame owner decisions through its existing decision handling.
- Preserve Matched Play's zero petty cash and show its existing draft inventory. Defer table resolution for new graphical matches until both confirmations.

## Risks / Trade-offs

- Pregame decisions can suspend confirmation → keep decision dialogs mounted and hide shopping while a decision is pending.
- Reconnect may replace the state object → read current serialized offer instead of a cached negotiation.
- Existing matches have no pregame marker → only fresh graphical states require the gate.
- Snapshot shape changes → keep new fields optional and cover round-trip, two-peer and resume behavior.
