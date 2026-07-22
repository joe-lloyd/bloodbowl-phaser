## Context

The Pass Action is orchestrated by `PassOperation.execute` (`src/game/operations/PassOperation.ts`): it counts marking opponents, folds `onPassDeclared`/`onPassResult` skill triggers, calls `PassController.attemptPass` to roll accuracy and compute the landing square (target for accurate, scatter path for inaccurate), then routes to `CatchOperation` or `BounceOperation` and, on failure, `triggerTurnover`.

`PassController` (`src/game/controllers/PassController.ts`) already exposes `checkInterceptions` and `attemptInterception`, but nothing calls them, so interceptions do not happen today. `checkInterceptions` uses a `distFromStart + distToEnd <= distance + 1` heuristic rather than the rulebook's Range Ruler overlap, ignores lost-tackle-zone, and `attemptInterception` lacks the natural-6 rule and per-interceptor marking count.

Mid-action coach choices already have a home: `DecisionService` (`src/game/skills/DecisionService.ts`) with typed requests in `src/types/decisions.ts` (`reroll`, `reaction`), surfaced to the browser via HUD dialogs and to headless/online play via `src/headless/protocol.ts` pendingDecision/reply. Interception is another such choice and should reuse this channel. Marking is already computed by `CatchController.countMarkingOpponents`. The pass-setup UI lives in `PassInteractionState` (`src/game/controllers/interaction_states/PassState.ts`) drawing through `Pitch.drawPassZones`/`drawPassLine`, which already convert grid coords to square centres via `gridToPixel`.

## Goals / Non-Goals

**Goals:**
- Insert a rulebook-correct interception step into `PassOperation`, after the accuracy roll fixes the actual landing square and before catch/bounce resolution.
- Replace the interception geometry with a Range Ruler (passer-centre → landing-centre) overlap test, gated on Standing + has-Tackle-Zone.
- Resolve the interception Agility Test with the correct modifiers (-3 accurate / -2 inaccurate, -1 per marking opponent) and the natural-6 auto-success; success grants possession and a Turnover.
- Add an `interception` decision so the defending coach picks the interceptor, reusing the reroll/reaction decision pipeline end-to-end (engine, browser dialog, headless protocol).
- Provide a pass-setup highlight of interceptable squares for the hovered target, with the aim locked to square centres.

**Non-Goals:**
- No new pass mechanics beyond interception (no Dump-Off, Pass skill rerolls, Hail Mary geometry changes here).
- No AI heuristic for *whether* a headless/AI defender should intercept beyond a simple default; the decision plumbing is the deliverable.
- No change to accuracy/scatter maths or catch resolution other than being cancelled on a successful interception.

## Decisions

### 1. Interception runs inside PassOperation, after landing is known, before resolution
The rulebook checks interception against the *actual* landing square, which is only known after `attemptPass` returns `finalPosition` (and only for non-fumbles — a fumble never leaves the passer's square). So the step slots in after `attemptPass`/`onPassResult` and before the `playerAtLanding`/bounce branch. On success we skip the catch/bounce branch entirely, set the ball to the interceptor, and call `triggerTurnover`.
- *Alternative considered:* resolve interception inside `PassController.attemptPass`. Rejected — the controller is a pure calculation helper with no flow/decision access; keeping the coach decision and turnover in the operation matches the existing layering (managers/controllers stay decision-free).

### 2. Range Ruler overlap = distance-to-segment ≤ 0.875 squares, on square centres
Model the ruler as the line segment between passer-centre and landing-centre. A candidate square is overlapped when the perpendicular distance from its centre to that segment is ≤ `INTERCEPT_HALF_WIDTH` (0.875 squares — the range ruler is ~1.75 squares wide, so 0.875 either side of the pass line), clamped to the segment endpoints, and its projection lies between the two ends. This is deterministic, symmetric, and identical between the setup preview and resolution because both operate on integer square centres (hence the aim must lock to centres). It only widens results on diagonal passes — flanking squares on a straight pass sit 1.0 away and stay excluded. Rewrite `checkInterceptions(from, landing, opponents, isAccurate)` to use this, filtering to `hasTackleZone(opponent)` (Standing + has-TZ); `getInterceptionSquares(from, to)` returns the whole corridor for the setup preview.
- *Alternative considered:* keep the `distFromStart + distToEnd` heuristic. Rejected — it is not the rulebook ruler, over-selects off-line squares, and would make the preview disagree with resolution.

### 2b. Pass range = the radial range-ruler table, not Chebyshev bands
`measureRange` previously used Chebyshev distance (`max(|dx|,|dy|)`) with 0–3/4–6/7–10/11+ bands, which is wrong: the physical range ruler is radial, so diagonal throws reach further. Replace it with a 27×27 lookup (`PASSING_ARRAY`, `RULER_RADIUS = 13`) indexed `[dy+13][dx+13]`, where each cell is the negative-modifier magnitude (0 Quick … 3 Long Bomb) and `null` is out of range. `PASS_RANGES` is ordered by that value, so `measureRange` returns `PASS_RANGES[value ?? 3]` and `rangeValue(from, to)` exposes the raw 0–3/`null`. Straight-axis distances are unchanged (so existing pass/skill scenarios still hold); diagonals now cost more (e.g. a (3,3) offset is a Short Pass, not a Quick Pass).
- *Alternative considered:* keep Chebyshev. Rejected — it under-penalises diagonal throws and disagrees with the tabletop range ruler.

### 3. Reuse the DecisionService channel with a new `interception` request
Add `InterceptionDecisionRequest`/`Answer` to `src/types/decisions.ts` (`type: "interception"`, `chooserTeamId` = defending team, a list of `{ playerId, modifier }` candidates), extend the `DecisionRequest`/`DecisionAnswer` unions, `DecisionService`, the browser dialog set, and the headless protocol pendingDecision/reply mapping. The answer carries the chosen `playerId` (or none). This keeps interception working identically across local, online host/guest, and headless, exactly as rerolls/reactions do.
- *Alternative considered:* a bespoke event + ad-hoc await. Rejected — duplicates the decision infrastructure and would not serialize for online/headless.

### 4. Extend the roll, not the modifier plumbing
`attemptInterception` gains natural-6 auto-success and takes the interceptor's marking count (from `countMarkingOpponents(interceptor.gridPosition, passingTeam)`) so the -1-per-marker term is computed at the interceptor, not the passer. The base -3/-2 comes from the pass's accurate/inaccurate result. Emit interception events (attempt/success/fail) in `src/types/events.ts` for the log and animations.

### 5. Preview via the existing pass-visualization layer
`PassInteractionState.handleSquareHover` already snaps to grid `(x, y)`; add a call that runs the same eligibility geometry (passer → hovered square) over live opponents and asks `Pitch` to highlight those squares on a new `pass_intercept` layer, cleared in `clearPassVisualization`. The arrow already renders to `gridToPixel` centres; the "lock to centre" requirement is satisfied by ensuring any free-cursor aiming is quantised to the hovered square before drawing.

## Risks / Trade-offs

- **Ruler edge cases (diagonal passes grazing a corner)** → Use ≤ 0.5 perpendicular distance with endpoint clamping and lock to centres; cover diagonal/orthogonal/corner cases with a seeded headless scenario so geometry is pinned by tests.
- **Turnover timing / animation ordering** → Interception cancels the catch/bounce branch; sequence the possession-change and `triggerTurnover` after the ball-flight animation delay, consistent with how fumble/turnover are already ordered in `PassOperation`.
- **Decision fan-out to online/headless** → Mirror the reroll/reaction request precisely (serializable fields only, `chooserTeamId` set to the defender) and add a headless reply path; a missing mapping would hang online play, so add a protocol test.
- **Preview/resolution divergence** → Both paths must call the *same* eligibility function on integer centres; share one helper to avoid drift.

## Open Questions

- Should the headless/AI defender auto-attempt with the best (least-penalised) eligible interceptor by default, or always decline unless scripted? Proposed default: auto-pick the lowest-penalty candidate; scenarios can override.
- When several candidates tie, is any UI ordering needed beyond "defending coach picks"? Assume free choice for now.
