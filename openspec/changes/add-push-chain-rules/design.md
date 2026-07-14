# Design: add-push-chain-rules

## Context

Push resolution lives in `BlockManager`: `resolveBlock` emits `UI_SelectPushDirection` with `BlockResolutionService.getValidPushDirections` (currently: the up-to-3 squares away from the attacker that are unoccupied and on-pitch), then `executePush` moves the defender, knocks down on POW, and offers follow-up. The push-direction choice already flows as a browser dialog and a headless `pendingDecision` with `chooserTeamId` — the delivery mechanism for chain decisions exists. Rulebook facts verified (p.55, p.68, p.73): chain pushes recurse with the original blocker's coach choosing every direction; crowd pushes skip the armour roll and go straight to an injury roll with Stunned→Reserves; a carried ball is thrown in; active-team crowd exits are turnovers.

## Guiding Philosophy

Same as the rest of the refactor: replace `executePush`'s single-square logic with a proper push resolver rather than bolting cases onto it.

## Goals / Non-Goals

**Goals:**

- Rules-correct chain pushes and crowd surfs, browser + headless, deterministic.
- One push resolver that the existing decision machinery drives; no parallel flows.

**Non-Goals:**

- Skills that modify pushes (Side Step, Stand Firm, Grab, Fend) — they become skill rules in the add-skill-rules-system framework later; the resolver exposes the hook surface but implements none.
- Apothecary interaction with crowd injuries (no apothecary system yet).
- Spectator/fan theming beyond a notification.

## Decisions

### 1. A PushResolver owning the whole chain

New `src/game/managers/PushResolver.ts` (used by `BlockManager`): given attacker→defender, it computes push options; when the chosen square is occupied it recurses — each link produces another push-direction decision **attributed to the original blocker's team** (`chooserTeamId` stays the blocker's coach per the rulebook). Moves apply only once the full chain is chosen, innermost player first, so intermediate board states can't corrupt option generation. Alternative — apply each link eagerly — rejected: an applied middle link changes occupancy under the still-open outer decision.

### 2. Options: unoccupied first, occupied only when forced, crowd only when nothing else

Per the rules, a player is pushed into an occupied square **only if** no unoccupied push square exists, and into the crowd **only if** there are no squares at all (sideline/end zone). `getValidPushDirections` gains a tiered result: `{unoccupied[], occupied[], crowd: boolean}`; the decision options present exactly the legal tier. A crowd exit is represented as an off-pitch coordinate so the existing `{x,y}` decision shape survives (protocol delta documents it).

### 3. Crowd injury as an operation

`CrowdInjuryOperation` on the flow queue: injury roll via `DiceController` (no armour), Stunned→Reserves box, KO/Casualty as normal; emits `PlayerPushedIntoCrowd` + existing injury events; then ball throw-in if the surfed player carried it, and `triggerTurnover` if they were on the active team (the turnover latch from the cascade fix absorbs duplicates).

### 4. Throw-in via BallManager

`BallManager.throwIn(fromSquare)`: direction from the throw-in template semantics (D6 over the three infield directions) and distance dice per p.73 (exact dice verified against the PDF during implementation), landing resolves through the existing bounce/catch chain (`CatchOperation`/`BounceOperation`), which already handles everything downstream including turnovers via the latch.

## Risks / Trade-offs

- [Deferred application vs. current immediate `executePush` behavior changes event timing the UI animates] → keep emitting one `PlayerMoved` per link in chain order after resolution; the UI animates them sequentially as it already does for single pushes.
- [Follow-up interaction: blocker follow-up happens after the chain resolves] → follow-up decision stays the last step, unchanged.
- [Headless bot must answer repeated push decisions] → the full-match bot already answers any `push-direction` decision with option 0; no bot change needed.

## Migration Plan

Land resolver + tiered options with single-push parity first (all existing tests green), then chain recursion, then crowd + throw-in. Each step on `main` with seeded tests.

## Open Questions

- RESOLVED (task 1.1): throw-in = D6 direction over the template's three infield directions, ball travels **2D6 squares** (counting the origin square as the first), catch attempt if it lands occupied; corner throw-ins use D3 over three directions. Landing on an empty square rests the ball there (bounce-on-landing refinement deferred with kickoff deviation work).
- Whether the crowd-surfed player's team may use an apothecary later — out of scope until apothecaries exist.
