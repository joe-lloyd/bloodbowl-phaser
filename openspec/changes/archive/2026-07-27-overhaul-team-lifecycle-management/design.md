## Context

The current team builder has partial UI checks, but the model has no durable first-match
fact and no shared finalization validator. Team management also publishes copies to a
separate collection and embeds advancement in the post-match component. These paths
allow legality and pricing to drift. The builder's dense tables compound the problem by
shrinking important roster information.

## Goals / Non-Goals

**Goals:**

- Derive draft or active mode from a durable first completed match.
- Enforce one roster legality and one edit/pricing service across all entry points.
- Make the builder readable without hiding information.
- Resolve pending player development from Manage Team.
- Replace published copies with live read-only team references.

**Non-Goals:**

- Implement every league inducement or journeyman rule.
- Change advancement costs, rolls, or skill access.
- Allow an active team to return to draft.

## Decisions

### Derive lifecycle from `firstMatchPlayedAt`

Absence means draft; a confirmed first completed match stamps the value and makes the
team active permanently. Abandoned matches do not stamp it.

### Centralize edit legality and pricing

`canEdit(team, operation)` returns structured allowed/refused results.
`priceOf(team, item)` returns the amount the UI displays and the command charges. Both
Team Builder and Team Management use them, including doubled active-team re-rolls and
unavailable active Dedicated Fans.

### Centralize roster finalization validation

`validateRoster(team, profile)` enforces team size, the maximum four non-Lineman Sevens
rule, per-position roster maxima, and budget. Draft work may be persisted as incomplete,
but play, competition entry, and finalization require a valid result. Seed builders also
consume this validator.

### Use stable table layout and normal body typography

Roster tables define shared column tracks for headers and rows. Critical text does not
drop below the application's body scale. Narrow viewports scroll or switch to a
deliberate stacked layout instead of compressing labels and numbers into tiny text.

### Delete publishing after reference migration

Authenticated users may read team documents and only owners may write them. Competition
entrants use owner/team ids. References are migrated and verified before the shared copy
collection and publish UI are removed; historical cached fields remain for missing teams.

### Make Manage Team the only advancement editor

Extract the advancement controls into a reusable development component used by the
player page. Post-match records awards and pending work but does not host direct skill or
characteristic selection. Applying development uses the normal advancement and team-save
services.

## Risks / Trade-offs

- **Previously tolerated rosters may fail the shared validator** → Show all structured
  reasons and allow incomplete drafts to be repaired without permitting play.
- **Active locking surprises experimental coaches** → Display mode and the exact enforced
  rules before the first match.
- **Public authenticated read changes visibility** → Limit write strictly to owner and
  avoid exposing data beyond coach-selected team content.
- **Deleting shared copies is irreversible** → Verify every entrant reference and retain
  historical cached display fields before deletion.
- **Narrow screens cannot fit all columns** → Prefer scrolling/stacking over unreadably
  small text.

## Migration Plan

1. Add and backfill `firstMatchPlayedAt`; add shared legality, edit, and pricing services.
2. Route builder/management/finalization/entry through them and update the builder layout.
3. Add Manage Team player development and pending-development handoff.
4. Enable authenticated read and owner-only write of live team documents.
5. Repoint and verify competition entrant references.
6. Remove publish UI, repository/types, and finally the shared collection.
