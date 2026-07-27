## Context

`BlockResolutionService.getPushOptions` implements the rulebook's three-tier push (open → crowd → chain) over the three squares behind the defender. `getGrabPushOptions` implements Grab (p.135) separately: all eight on-pitch, unoccupied squares around the defender, empty if none exist. `BlockManager.requestPushDecision` tries the Grab set first, but only when `chain.links.length === 0` (i.e. only for the push directly caused by the Grab-holding attacker, not any further push forced later in the same chain); if Grab's set is empty or the attacker lacks Grab/Side Step, it falls through to the normal three-square tiered logic. This is correct per the rulebook. The only chain-push scenario (`src/data/scenarios.ts`, id `chain-push`) predates Grab being on any default roster, occupies only the three traditional squares, and defaults to the Human roster — so it has never exercised a Grab-holding attacker, and nothing states in the spec what "correct" looks like in that case.

## Goals / Non-Goals

**Goals:**
- Make the already-correct Grab/chain interaction explicit in `push-chain-rules` so it can't be mistaken for a bug again.
- Lock the interaction with seeded scenarios exercising a real Grab-holder (Black Orc), per the project's rule-fix convention of seeded scenario + headless test.
- Make a Grab-assisted push legible in the match log so a coach isn't surprised by a push landing outside the usual three squares.

**Non-Goals:**
- Changing push resolution, tiering, or Grab's square-selection logic — it already matches the rulebook.
- Re-litigating whether Grab should propagate through later chain links; current behavior (it doesn't) is being documented, not changed, absent a rules citation saying otherwise.

## Decisions

- **Document behavior via spec + scenario, not a code fix**, since the existing implementation already matches the cited rulebook pages for both Grab (p.135) and the standard push tiers (p.55). Treating this as a coverage/legibility gap rather than a defect avoids introducing an actual regression to "fix" a false one.
- **Add the match-log line inside `BlockManager.requestPushDecision`** at the point where the Grab-widened option list is used (i.e., `anyAdjacent.length > 0`), since that is the only place that already knows whether Grab produced the option set.

## Risks / Trade-offs

- [The user may still expect the old three-square-only behavior] → the new spec requirement and log message make the rule visible in the match log and in `openspec/specs/push-chain-rules`, so the behavior is explainable rather than silently "different."
