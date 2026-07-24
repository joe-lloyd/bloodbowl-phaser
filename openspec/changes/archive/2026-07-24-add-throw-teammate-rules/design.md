## Context

The engine already resolves the Pass Action end-to-end through `PassOperation`: a Passing Ability Test via `PassController`, ball flight, scatter (`BallMovementController.scatter` — 3× D8) or throw-in (`BallManager.throwIn` — single D6 direction), catch/bounce, interception, and turnover — all fed by the `DecisionService`/reroll channels and the `foldTrigger` skill-fold pattern. Skills are small `SkillRule` objects registered in `src/game/skills/index.ts` and hooked at named trigger points; passive/eligibility skills often gate via pure helpers rather than a fold.

Throw Team-mate is the last big "act on a team-mate as if they were the ball" subsystem. Its traits are already present in the `SkillType` enum (`THROW_TEAM_MATE`, `KICK_TEAM_MATE`, `RIGHT_STUFF`, `SWOOP`, `STRONG_ARM`) and `ALWAYS_HUNGRY` is registered inert with a comment explicitly deferring to this work. The coverage gate (`__tests__/headless/rules/gate.test.ts`) hard-codes the implemented set at 69 and must be edited consciously.

## Goals / Non-Goals

**Goals:**
- A working Throw Team-mate Action resolvable in local, online (host/guest), and headless play.
- Kick Team-mate as a thin variant of the same resolution with its own fumble handling.
- Right Stuff eligibility gating (has trait + ST ≤ 3) applied at both action-offer time and resolution time.
- Always Hungry, Swoop, and Strong Arm applied at the correct points of the sequence.
- Seeded catalog configs + gate snapshot update so the rules count as implemented.

**Non-Goals:**
- Modelling the thrown player's own skills triggering mid-flight (e.g. their Catch/Dodge) beyond the Right Stuff landing roll — a thrown player does not make a Catch roll.
- Team Draft List construction UI for removing an eaten/lost player permanently (we remove from the in-match roster and mark them; roster-persistence is out of scope here).
- Any new animation work beyond emitting the events the front end already listens for; visuals can reuse pass/ball-flight events.

## Decisions

### 1. A dedicated `ThrowTeammateOperation` with a shared resolution core, not an extension of `PassOperation`
The thrown object is a **player**, not the ball: the "landing" resolves a Right Stuff roll (Standing/Prone/crash) rather than a Catch, and a fumble drops/injures a player rather than bouncing a ball. Overloading `PassOperation` would tangle two outcome models. Instead add `ThrowTeammateOperation(throwerId, targetTeammateId, aimX, aimY, mode: "throw" | "kick")`. `mode` selects Kick Team-mate's fumble path and disables Strong Arm. This mirrors how `StabOperation` is its own operation that reuses `InjuryOperation`/`BounceOperation`.
- *Alternative considered*: a `kick` flag on `PassOperation`. Rejected — the catch/interception branch of `PassOperation` is ball-specific and would need to be short-circuited everywhere.

### 2. Right Stuff eligibility is a pure helper, gated in two places
Add `isRightStuffEligible(player)` = `hasSkill(RIGHT_STUFF) && stats.ST <= 3`. Used by (a) `actionAvailability.ts` to only offer Throw/Kick Team-mate when a reachable/adjacent team-mate qualifies, and (b) `ThrowTeammateOperation` as a guard before resolving. Keeping it pure keeps the offer logic Phaser-free and unit-testable, consistent with `computeActionAvailability`.
- Register `RIGHT_STUFF` as a real (non-inert) rule so the gate recognises it, even though its behaviour is a passive eligibility predicate — matching how other passive traits are registered with an `onCountAssists`/gate-only shape.

### 3. Sequence ordering inside `ThrowTeammateOperation`
Follow the rulebook order precisely so triggers land where the book says:
1. Validate eligibility (thrower has trait & is Standing; target is a team-mate, Standing, Right-Stuff-eligible, adjacent/pickup-able).
2. **Always Hungry** (thrower only, `mode === "throw"` or `"kick"`): roll D6; on 1, roll again — 1 = eat (remove team-mate, no apoth/regen, bounce ball if carried, **turnover**, end action); 2+ = squirm free ⇒ force a Fumble outcome (skip to fumble handling).
3. **Passing Ability Test**: reuse `PassController` PA math. Apply **Strong Arm** as a `+` modifier **only when `mode === "throw"`**. A natural 1 (or forced squirm-free) = Fumble.
4. **Fumble handling**:
   - `mode === "throw"`: the team-mate is dropped Prone in the thrower's square, make an Injury Roll for them (they were "dropped"), ball bounces if it was on the thrower; **turnover**.
   - `mode === "kick"`: the kicked player is **removed from play** and takes an **immediate Injury Roll**; **turnover**. (Per the trait: a Kick Team-mate fumble is harsher than a throw fumble.)
5. **Scatter of the thrown player** (non-fumble): from the aim square, use the **Scatter template** (3× D8 via `BallMovementController.scatter`) normally, or the **Throw-in template** (single D6 direction via the `BallManager.throwIn` geometry) when the thrower has **Swoop**.
6. **Right Stuff landing roll** at the final square: D6, **+1 if Swoop**, against a target that determines Standing vs Prone; if the landing square is occupied, the thrown player and the occupant both go down (crash) per the trait. A thrown player never makes a Catch roll; if they land on the ball they may attempt to catch only per Right Stuff's own wording (treat landing-with-ball as a normal bounce-on-them per current ball rules unless the trait says otherwise — resolve via existing catch/bounce).
7. End the action; a thrown-player that lands Prone or is injured, or that crashes, causes a **turnover** per the trait (any Throw Team-mate that ends with the thrown player prone/off-pitch is a turnover).

### 4. Reuse existing scatter/throw-in geometry rather than new templates
`BallMovementController.scatter` and `BallManager.throwIn` already encode the two templates. `ThrowTeammateOperation` calls them for the thrown player's displacement, then places the player (not the ball) at the resolved square. Swoop only switches which template is used and adds +1 to the landing roll.
- *Alternative*: new player-scatter helpers. Rejected — duplicates tested geometry.

### 5. Decision & reroll routing mirrors interceptions
The PA test's reroll offer flows through the same `DecisionService`/`RerollArbiter` path `PassOperation` uses, so host/guest/headless parity is inherited. Always Hungry's eat roll is a forced sequence (no coach choice) so it needs no decision.

### 6. Coverage gate update
Add the six skills to the `implemented` array and bump `expect(cov.implemented).toBe(...)` from 69 to 75 in `gate.test.ts`, and add one catalog entry per skill in `src/data/ruleScenarios/` (Strong Arm & Right Stuff under strength/traits; the rest under traits). This is the "conscious update" the gate demands.

## Risks / Trade-offs

- **Turnover conditions are fiddly** (eat, fumble-throw, fumble-kick, land-prone, crash all turn over; land-standing does not) → encode each exit path explicitly in the operation and lock every branch with a seeded headless test.
- **Thrown player's status/injury interactions** (Regeneration, Thick Skull on the injury roll; Stunty table) → reuse `InjuryOperation` unchanged so injury-side rules keep working; do not special-case them here.
- **Always Hungry ordering** ("after moving, before completing the throw") → resolve the eat roll at the top of `ThrowTeammateOperation` (movement having already happened during action declaration), matching the existing move-then-act flow used by Blitz.
- **UI offer correctness** (only show when a legal eligible team-mate exists) → gate purely in `actionAvailability.ts` and cover with unit tests, same pattern as the special actions.
- **Gate snapshot churn** → single deliberate edit; the test's own comment says update the list consciously.

## Open Questions

- Exact Right Stuff landing-roll target numbers and the crash rule's downed-players detail should be pinned to the 2025 rulebook wording during `specs`/implementation (the spec will state the thresholds normatively).
- Whether a thrown player landing on the ball attempts a catch or it simply bounces — resolve against the rulebook when writing the spec; default to the existing ball-on-player bounce/catch path.
