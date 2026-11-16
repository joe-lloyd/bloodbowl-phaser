## Context

The approved research plan identified lost receiver intent, missing passing rerolls, fixed tier precedence and eleven-player targets. The pending skill-plan milestone supplies existing Gaze, securing, double-block and Bloodlust modules. The headless engine, public coach seam and replay-verified policy-study runner already serve browser and batch play.

## Goals and boundaries

Complete useful plays through the shared engine. Make late-half and injury-preserving decisions visible in fixtures and results. Automate acquisition and diagnosis so models inspect decisions and summaries instead of replaying work manually. Skill contracts distinguish proven tactics from mechanics and unimplemented hypotheses; catalogue completeness must not be confused with tactical completion.

## Decisions

- Keep concrete intent per game inside each planner instance. Rebuild the remaining legal route to its target after every observed command, retain pending reaction handling, and invalidate on changed actor, turn, possession or unavailable target. Search primes the same planner with its proposed opening intent and distinguishes targets sharing a declaration. This fixes the observed failure without adding a general planning language.
- Use one sequence probability calculation for approach, pass, catch and receiver movement, sharing a team reroll and respecting actual skill spending. Reuse engine rule previews and capability checks rather than roster-name probability bonuses.
- Compare outcome values before coarse safety tiers. Late-half scoring values account for the remaining scoring horizon and the cost of a reply, instead of discarding every risky plan below ordinary progress. Turn-five preparation considers next-turn reach including rushes. Defensive fallback means no viable scoring plan was found within the supported horizon, not an unsupported proof that every legal miracle is impossible.
- Derive injury persistence from existing league/progression state. Price exposure using fielded opponents, player value, armour and necessary defence. Preserve winning play as the main goal, with roster-specific SPP accounting recorded separately. Bloodlust remains a native capability module in the same planner.
- Reuse frozen actual policies, study workers, initial saves, event telemetry and immediate replay verification. A small lab entry point runs named tactical contracts before smoke and confirmation. Keep discovery and held-out seeds separate, record explicit stage verdicts and emit short machine-readable failure receipts.
- Report equal-roster and per-opponent results from complete balanced blocks. Record receiving possession and source digests. Coverage teams remain separate from coherent packages and actual random progression. A registry maps all skills to named evidence or an honest open/scope status. It never certifies a forced rule script as an AI choice.

## Risks and tradeoffs

- Retained intent can become stale. Validate it against the current board and candidate commands at every step, and test reload and interruption.
- Late-half optimism can sacrifice valuable players on pointless plays. Test score, half, injury persistence and defensive counterexamples alongside the big-play boards.
- Broader proposals can raise runtime. Bound preparation and trial budgets, measure decision time, and retain deterministic replay.
- More games can reproduce the same blind spot. Tactical gates run first; reports expose missing opportunities and action proposals rather than rewarding raw triggers.

## Delivery

Land the prerequisite skill-plan change through its existing review gate. Ship this change in focused commits and a separate ready PR. Run the repeatable lab on Daily Driver, publish a dark HTMLify progress/results page, and attach final-source provenance. Review findings that change behavior invalidate the candidate performance claim and require fresh confirmation.
