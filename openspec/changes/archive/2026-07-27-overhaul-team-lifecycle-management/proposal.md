## Why

Team management does not reliably distinguish an editable new roster from a team that
has begun its playing history. That lets active teams use draft-only operations and
obscures active re-roll pricing. The builder also permits hard-to-read roster overviews
and needs one shared legality definition for minimum players, Sevens positional mix, and
roster limits. Publishing separately copies teams and can drift, while player development
should be available from Manage Team whenever the coach is ready.

## What Changes

- Teams are draft until their first completed match and active thereafter.
- Draft teams remain editable, but an incomplete or illegal draft cannot be finalized,
  selected for play, or entered in a competition.
- Shared roster validation enforces at least seven and at most eleven players, at most
  four players without the Lineman keyword, roster positional maxima, and non-negative
  budget.
- Active teams use legal in-play edits: re-rolls cost double roster price, Dedicated Fans
  cannot be purchased, and eligible players can be hired at roster price.
- The team builder uses readable body-sized text, aligned table columns, and responsive
  overflow instead of shrinking critical roster information.
- Publishing is removed. Authenticated coaches read the owner's live team and only the
  owner may write it; competitions reference that team directly.
- Manage Team provides player detail and resolves saved pending development, including
  SPP advancement, outside the post-match results screen.

## Capabilities

### New Capabilities

- `team-lifecycle-modes`: draft/active lifecycle, shared roster legality, mode-aware
  purchasing, and readable team-builder presentation.
- `player-development-page`: durable player details and pending development resolution
  from Manage Team.

### Modified Capabilities

- `shared-team-library`: remove publishing and shared snapshots in favor of authenticated
  read and owner-only write of live teams.
- `post-match-summary`: mark pending/mandatory development after SPP confirmation without
  hosting skill or characteristic assignment there; resolution moves to Manage Team, and
  finishing post-match is no longer blocked on it (the mandatory-advance rule is enforced
  at the next match launch instead).

## Impact

- Team/player types, first-match stamping, migration, legality and pricing services.
- Team Builder and Team Management layout, controls, refusal reasons, and player pages.
- Post-match pending-development handoff and the shared advancement service.
- Firestore rules, team browsing, competition entrant references, and shared-team
  migration/removal.
- Unit and headless Playwright coverage for lifecycle, legality, readability, purchasing,
  development, permissions, and migration.
