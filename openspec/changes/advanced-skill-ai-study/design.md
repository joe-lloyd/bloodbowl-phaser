## Context

The frozen baseline has 81 legal recipes, 30 rosters, 108 skill/trait names and 106 registered match rules. Announced effects cover 59 names; passive mechanics can work without announcing an event. Natural matches cannot establish the value of a rare ability by trigger count alone.

## Goals / Non-Goals

**Goals:** Make results understandable, expose advancement-only skills legally, measure whole-team outcomes and contextual mechanical differences, and give every catalogue entry a next experiment.

**Non-Goals:** Automatically train or promote an AI policy, infer causal skill value from win correlations, grant mutations to positions without access, or treat forced scenario scripts as AI selections.

## Decisions

- Keep the original engine and planner frozen. Add six legal chosen advancements per advanced team, capped at two per player, using the existing progression API and actual costs.
- Construct role-aware packages across every legal recipe and two build replicates. Prefer uncovered skills while respecting positional access, prerequisites and incompatibilities.
- Use a randomized allocation control on the same players with the same access, category and elite-cost band. This controls team value and advancement cost; it is explicitly distinct from the application's cheaper two-roll random-primary development mode.
- Use three comparisons: focused versus baseline, randomized versus baseline, and focused versus randomized. For each recipe/build replicate, use two cyclic opponent offsets and mirrored physical sides with the same seed. Preserve native rerolls and exclude free inducements. Skill-versus-baseline comparisons intentionally measure the extra development and are not equal-TV competitions.
- Run skill-present/absent versions of registered rule scenarios over a fixed seed panel. Separate unavailable actions, rejected scripts and comparable endpoints. Count events directly from the event bus; scenario scripts are mechanical probes, not natural AI use.
- Record frozen inputs, results, actual initial saves and commands. Verify complete game traces and reconcile event totals before analysis.
- Present the baseline, new comparisons and coverage roadmap in a compact offline dashboard. Give each skill an explicit tactical hypothesis, counterexample, implementation module and evidence status. Keep detailed CSVs accessible without making them the default view.

## Risks / Trade-offs

- [Focused builds are coverage-oriented rather than optimized] → Label the selection objective and compare with randomized allocations without claiming an optimal development guide.
- [A skill changes dice consumption] → Treat matching seeds as variance reduction, not identical dice tapes; bootstrap complete mirrored pairs.
- [Removing an enabling trait makes a scenario illegal] → Record capability loss separately and exclude it from comparable endpoint estimates.
- [Shared planner blind spots persist] → Report zero natural selections candidly and prioritize candidate/intent modules before further weight tuning.
- [Trait or lifecycle rules cannot be learned as advancements] → Retain native traits and controlled fixtures, and mark draft/post-match scope explicitly.
