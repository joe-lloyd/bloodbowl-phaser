## Context

`GameHUD` reaches the post-match component at `GAME_OVER`, but the component returns
early when progression is disabled. `MatchStatsTracker` already records the information
needed for both teams. Advancement controls are embedded in the same component, which
couples seeing the result to making immediate long-term roster choices.

## Goals / Non-Goals

**Goals:**

- Always show the actual result and match statistics.
- Label concessions and forfeits without inventing scoring events.
- Confirm MVP and SPP when the match is eligible.
- Persist development work for later completion in Manage Team.
- Record competition outcomes exactly once and always provide a route out.

**Non-Goals:**

- Change SPP values or advancement legality.
- Add artificial concession touchdowns.
- Require a coach to choose a skill before leaving the match.
- Redesign career-stat storage.

## Decisions

### Structure the flow as Result, Statistics, then Awards

The visibility gate is only `GAME_OVER`. Result and Statistics always render. Awards
renders only for eligible progression and contains MVP nomination plus SPP confirmation,
not advancement selection.

### Preserve played score separately from termination reason

The match result stores score and termination reason as distinct facts. Concession and
forfeit affect the outcome label and competition resolution policy, but do not append a
touchdown event, change player touchdown statistics, or rewrite the displayed played
score.

### Convert confirmed awards into pending team development

After MVP/SPP confirmation, any player now eligible or required to advance is recorded
as pending development on the saved team. Manage Team owns skill and characteristic
choices. The results screen can then exit without losing the obligation.

### Record fixtures on entry and make recording idempotent

Competition context submits the result when the results screen is entered and displays
confirmation. A stable fixture/result key prevents rerenders, reconnects, or resumes from
recording it again.

### Use the existing stats summary as the table source

`MatchStats.summary()` feeds both teams. Progression eligibility only determines whether
SPP is displayed and awarded; it does not determine whether match statistics exist.

## Risks / Trade-offs

- **A coach may forget pending advancement** → Mark it prominently on the roster and
  Manage Team, and let competition rules block a later fixture when completion is
  required.
- **Existing competition logic may encode a concession score policy** → Keep policy
  outcome fields separate from played score and test that no touchdown/stat event is
  created.
- **Online reconnect may repeat award confirmation** → Persist stable award and result
  ids and make confirmation idempotent.

## Migration Plan

No existing match save requires a destructive migration. New pending-development fields
default empty. Remove advancement selection from the results component only after Manage
Team can resolve the same advancement service and save path.
