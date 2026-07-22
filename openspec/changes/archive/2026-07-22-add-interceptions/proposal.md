## Why

The Pass Action currently resolves with no chance for the defending team to intercept the ball. `PassController` already carries `checkInterceptions`/`attemptInterception` stubs, but they are dead code — `PassOperation` never calls them, the geometry is a rough Chebyshev heuristic rather than the rulebook's Range Ruler overlap, and there is no way for a coach to choose an interceptor. Passing therefore skips a core rule and a key tactical decision. Players also have no way to see, while aiming a pass, which enemies threaten it.

## What Changes

- Add a real **Interception** step to the Pass sequence: after the accuracy roll fixes the *actual* landing square, any Standing opposition player whose square the Range Ruler (passer → landing square) overlaps may be offered as an interceptor.
- Determine interceptors with true **Range Ruler geometry** locked to square centres, replacing the `distFromStart + distToEnd` heuristic. A player who has **lost their Tackle Zone** (Prone/Stunned, or a negatrait/skill that removes it) cannot intercept.
- Resolve the interception as an **Agility Test** with modifiers: **-3** vs an Accurate pass, **-2** vs an Inaccurate pass, **-1 per opponent Marking the interceptor**; success **or a natural 6** intercepts, granting possession and causing a **Turnover**. On a failed test the pass continues to its landing square as before.
- Add an **interception coach decision** so the defending coach picks which eligible player attempts (mirroring the existing reroll/reaction decision channel), wired through the headless protocol so it works in local, online, and headless play.
- **UI:** while setting up a pass, highlight the squares from which an opponent could intercept the hovered target, and **lock the pass arrow to square centres** so the previewed Range Ruler matches the resolved geometry.

## Capabilities

### New Capabilities
- `interceptions`: Eligibility (Range Ruler overlap, Standing, has Tackle Zone), the interception Agility Test and its modifiers, the natural-6 rule, possession/Turnover outcome, the defending-coach interceptor decision, and the pass-setup highlight of interceptable squares.

### Modified Capabilities
<!-- No existing spec defines the Pass Action at the requirement level; interception is introduced as a new capability. -->

## Impact

- **Engine:** `PassOperation` (insert interception step after accuracy roll, before catch/bounce), `PassController` (rewrite `checkInterceptions` to Range Ruler geometry; extend `attemptInterception` for natural-6 and per-interceptor marking), `CatchController.countMarkingOpponents` (reused for the interceptor's marking modifier).
- **Decisions/protocol:** new `interception` decision in `src/types/decisions.ts`, `DecisionService`, and `src/headless/protocol.ts` + `HeadlessGame` (pendingDecision/reply); `src/types/events.ts` interception events for UI/log.
- **UI:** `PassInteractionState` + `Pitch` (`drawPassLine`/new interception highlight, square-centre arrow lock); optional HUD dialog for the interceptor choice alongside the existing reroll/reaction dialogs.
- **Tests:** new seeded rule scenario (`src/data/ruleScenarios/passing.ts`) + headless CLI test locking interception geometry and outcome; `PassController` unit tests updated.
