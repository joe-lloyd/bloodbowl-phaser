## Why

Throw Team-mate is a whole cluster of interlocking traits (Throw Team-mate, Kick Team-mate, Right Stuff, Always Hungry, Swoop, Strong Arm) that the engine currently names but does not play — `AlwaysHungryRule` is registered inert with a comment pointing at "the deferred Throw Team-mate subsystem." This change builds that subsystem so those traits move from documented-but-inert to actually enforced, advancing rule coverage past the interceptions milestone.

## What Changes

- Add a **Throw Team-mate Action**: a Standing player with the trait picks up an eligible team-mate and throws them like the ball — a Passing Ability Test, scatter of the thrown player to a landing square, then a Right Stuff landing roll that decides whether they land Standing, land Prone, or crash into another player.
- Add **Right Stuff** eligibility gating: only a team-mate that has Right Stuff **and** Strength 3 or less is a legal target for a Throw or Kick Team-mate Action.
- Add **Kick Team-mate**: reuses the Throw Team-mate resolution, but a Fumbled throw removes the kicked player from play and forces an immediate Injury Roll instead of dropping them in the kicker's square.
- Add **Always Hungry**: before completing a Throw Team-mate Action, the thrower rolls a D6; on a 1 they try to eat the team-mate (second D6 — 1 = eaten and removed from the draft list with no apothecary/regeneration, 2+ = squirm free = automatic Fumble).
- Add **Swoop**: a thrown player scatters using the Throw-in template (single direction, 1 square) instead of the 3-square Scatter template, and gets +1 to the Right Stuff landing roll.
- Add **Strong Arm**: a positive modifier to the Passing Ability Test of a Throw Team-mate Action only — explicitly **not** Kick Team-mate.
- Wire the Throw Team-mate / Kick Team-mate Action into the contextual action menu (target-gated on an eligible adjacent/reachable team-mate) and the headless action protocol.
- Register all six traits in `SkillRegistry`, add seeded catalog configurations, and update the `gate.test.ts` coverage snapshot consciously.

## Capabilities

### New Capabilities
- `throw-teammate`: The Throw Team-mate and Kick Team-mate Actions — eligibility (Right Stuff, ST≤3), the Passing Ability Test with modifiers (Strong Arm), thrown-player scatter and Right Stuff landing roll (with Swoop), Always Hungry's pre-throw eat roll, fumble handling (including Kick Team-mate's remove-and-injure), and the turnover rules.

### Modified Capabilities
- `skill-catalog`: adds catalog configurations for Throw Team-mate, Kick Team-mate, Right Stuff, Always Hungry, Swoop, and Strong Arm so the coverage gate recognises them as implemented rather than inert.

## Impact

- **New engine code**: a `ThrowTeammateOperation` (and shared resolution used by Kick Team-mate), plus skill rules for `THROW_TEAM_MATE`, `KICK_TEAM_MATE`, `RIGHT_STUFF`, `SWOOP`, `STRONG_ARM`, and an active clause for the existing `ALWAYS_HUNGRY` rule.
- **Touched**: `src/game/skills/index.ts` (registration), `src/game/rules/actionAvailability.ts` + the action menu UI (offer the action), the headless action protocol, `src/data/ruleScenarios/*` (seeded configs), and `__tests__/headless/rules/gate.test.ts` (coverage snapshot moves from 69 upward).
- **Reuses**: existing scatter / throw-in templates (`BallMovementController`, `BallManager`), `InjuryOperation`, `BounceOperation`, the `DecisionService`/reroll channels, and the `foldTrigger` skill-fold pattern.
- No changes to serialization shape beyond players already carrying these skills; online/headless play inherit the decision-channel behaviour used by interceptions.
