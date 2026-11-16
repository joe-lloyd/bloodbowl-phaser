## Context

The catalogue and advanced studies expose engine-authoritative candidates, but the planner only understands movement, ordinary blocks and ball transfers. Secure the Ball, Gaze and Multiple Block need declarations, plans and continuations together. Vampire plans must account for feeding at the action's actual endpoint.

## Goals / Non-Goals

**Goals:** Three useful action plans in focused modules; correct rule costs; possession-aware feeding safeguards; deterministic tactical evidence and a fresh mirrored comparison.

**Non-Goals:** Complete every roadmap module in one release, maximize trigger counts, change engine rules, or infer an individual skill's win value from team-level results. Throwing/landing, punts, foul/weapons and jumps follow as separate tested modules.

## Decisions

- Candidate enumeration uses existing legality helpers and the legal-actions response. Multiple Block adds every distinct adjacent target pair; Gaze adds legal adjacent Standing targets; Secure the Ball uses movement and ends on pickup. The planner always selects an offered command.
- Capability functions propose normal Activation objects. Typed intents carry targets or routes; declaration and continuation share the same proposal functions. An experimental option can disable the new modules for direct policy comparisons.
- Secure routes carry a distinct ordinary-D6 pickup roll. Its target includes applicable pickup modifiers; Sure Hands cannot reroll it. Compare securing with ordinary pickups, including the value of continuing movement or scoring after the normal pickup.
- Gaze values removal of a relevant tackle zone, including the resulting improvement to another available player's scoring or carrier-hit line. It does not value an irrelevant distant target. Moving into position pays movement risk and the gazer's lost activation.
- Multiple Block uses the existing BlockValidator against a cloned board with the attacker's Strength reduced by two, matching simultaneous assists. Price both hits and combined attacker-down risk; preserve an ordinary single block when the double hit is worse.
- A feeding helper checks native Thrall Lineman keywords, adjacency and possession. Failed-Bloodlust endpoints without legal non-carrier support lose value; safe support positions and bite targets preserve possession. Do not infer feeding support from roster names alone.
- Keep a frozen pre-change planner as the comparison opponent. Use fresh seeds and reversed physical sides across public recipes, with both base and advanced snapshots. Report complete-pair uncertainty, per-roster results, original bash SPP objectives and natural action counts. Engine errors or replay failures block promotion; uncertain performance is labeled uncertain.

## Risks / Trade-offs

- A new action consumes a useful activation → beneficial, harmful and neutral tactical boards test the chosen action and target, with normal actions retained as alternatives.
- Route probabilities diverge from Secure the Ball rules → use the same modifier preview and a separate roll kind with no skill reroll.
- Gaze may be tactically useful only through another player → evaluate available follow-up actions rather than merely rewarding the target becoming Distracted.
- Feeding plans can sacrifice a Thrall carrier → exclude the holder from safe feeding support and test bite choices explicitly.
- Aggregate results can hide weak roster regressions → publish roster results and bash objectives, with no promotion claim from trigger counts or a confidence interval spanning no effect.

## Migration Plan

Run tactical regressions and a headless smoke batch, freeze the candidate, execute confirmation on Daily Driver, then publish evidence with the PR. Keep the existing planner available through the experiment option for rollback and comparison.
