## 1. Lifecycle and Shared Legality

- [x] 1.1 Add `firstMatchPlayedAt` and derive draft/active mode from it
- [x] 1.2 Stamp the first completed match and verify abandonment does not activate a team
- [x] 1.3 Backfill teams with recorded match history while leaving unplayed teams draft
- [x] 1.4 Implement shared roster validation for 7-11 players, at most four non-Lineman players, positional maxima, and budget
- [x] 1.5 Route finalization, match selection, competition entry, and development seeding through structured validation
- [x] 1.6 Permit incomplete draft persistence but clearly prevent play and entry until valid

## 2. Edit Legality and Pricing

- [x] 2.1 Implement one structured `canEdit(team, operation)` service for all team-building operations
- [x] 2.2 Implement one `priceOf(team, item)` service with roster-price draft re-rolls, doubled active re-rolls, and unavailable active Dedicated Fans
- [x] 2.3 Route Team Builder and Team Management through the same legality and pricing services
- [x] 2.4 Show the exact displayed price that will be charged and render shared refusal reasons
- [x] 2.5 Show mode, legality, and enforced active rules in team lists and team details

## 3. Team Builder Readability

- [x] 3.1 Replace miniature roster-summary typography with the application's normal body-text tokens
- [x] 3.2 Define shared column tracks so table headers, player rows, prices, and counts align
- [x] 3.3 Add supported narrow-width scrolling or stacked layouts without clipping actions
- [x] 3.4 Add component and fixed-viewport visual tests for desktop and narrow builder layouts

## 4. Player Development

- [x] 4.1 Extract advancement controls into a reusable Manage Team development component
- [x] 4.2 Remove direct skill and characteristic assignment from the post-match results flow
- [x] 4.3 Build the player page with characteristics, injuries, starting/gained skills, SPP, career statistics, provenance, and pending work
- [x] 4.4 Resolve Advanced League SPP advancement through the normal advancement and team-save services
- [x] 4.5 Show eligible/required development in the roster and support mode-specific pending work

## 5. Remove Publishing

- [x] 5.1 Add authenticated read and owner-only write rules for live team documents
- [x] 5.2 Rework the shared browser to list coaches and their live teams
- [x] 5.3 Repoint competition entrants from shared copies to owner/team references and retain historical cached fields where needed
- [x] 5.4 Verify every reference migration before deleting shared data
- [x] 5.5 Remove publish/unpublish UI, shared repository/type, and source branching
- [x] 5.6 Remove the `sharedTeams` collection only after verified migration

## 6. Verification

- [x] 6.1 Add unit tests for lifecycle, every edit operation, pricing, and every shared roster legality rule
- [x] 6.2 Add tests proving active re-roll price display equals charge and Dedicated Fans are refused
- [x] 6.3 Add headless Playwright journeys for incomplete draft repair, legal finalization, first-match activation, and active management
- [x] 6.4 Add a journey that records post-match SPP, exits without selecting a skill, and resolves development in Manage Team
- [x] 6.5 Test authenticated read, owner-only write, entrant migration, and historical missing-team rendering
