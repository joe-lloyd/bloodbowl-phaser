## 1. Lifecycle and Shared Legality

- [ ] 1.1 Add `firstMatchPlayedAt` and derive draft/active mode from it
- [ ] 1.2 Stamp the first completed match and verify abandonment does not activate a team
- [ ] 1.3 Backfill teams with recorded match history while leaving unplayed teams draft
- [ ] 1.4 Implement shared roster validation for 7-11 players, at most four non-Lineman players, positional maxima, and budget
- [ ] 1.5 Route finalization, match selection, competition entry, and development seeding through structured validation
- [ ] 1.6 Permit incomplete draft persistence but clearly prevent play and entry until valid

## 2. Edit Legality and Pricing

- [ ] 2.1 Implement one structured `canEdit(team, operation)` service for all team-building operations
- [ ] 2.2 Implement one `priceOf(team, item)` service with roster-price draft re-rolls, doubled active re-rolls, and unavailable active Dedicated Fans
- [ ] 2.3 Route Team Builder and Team Management through the same legality and pricing services
- [ ] 2.4 Show the exact displayed price that will be charged and render shared refusal reasons
- [ ] 2.5 Show mode, legality, and enforced active rules in team lists and team details

## 3. Team Builder Readability

- [ ] 3.1 Replace miniature roster-summary typography with the application's normal body-text tokens
- [ ] 3.2 Define shared column tracks so table headers, player rows, prices, and counts align
- [ ] 3.3 Add supported narrow-width scrolling or stacked layouts without clipping actions
- [ ] 3.4 Add component and fixed-viewport visual tests for desktop and narrow builder layouts

## 4. Player Development

- [ ] 4.1 Extract advancement controls into a reusable Manage Team development component
- [ ] 4.2 Remove direct skill and characteristic assignment from the post-match results flow
- [ ] 4.3 Build the player page with characteristics, injuries, starting/gained skills, SPP, career statistics, provenance, and pending work
- [ ] 4.4 Resolve Advanced League SPP advancement through the normal advancement and team-save services
- [ ] 4.5 Show eligible/required development in the roster and support mode-specific pending work

## 5. Remove Publishing

- [ ] 5.1 Add authenticated read and owner-only write rules for live team documents
- [ ] 5.2 Rework the shared browser to list coaches and their live teams
- [ ] 5.3 Repoint competition entrants from shared copies to owner/team references and retain historical cached fields where needed
- [ ] 5.4 Verify every reference migration before deleting shared data
- [ ] 5.5 Remove publish/unpublish UI, shared repository/type, and source branching
- [ ] 5.6 Remove the `sharedTeams` collection only after verified migration

## 6. Verification

- [ ] 6.1 Add unit tests for lifecycle, every edit operation, pricing, and every shared roster legality rule
- [ ] 6.2 Add tests proving active re-roll price display equals charge and Dedicated Fans are refused
- [ ] 6.3 Add headless Playwright journeys for incomplete draft repair, legal finalization, first-match activation, and active management
- [ ] 6.4 Add a journey that records post-match SPP, exits without selecting a skill, and resolves development in Manage Team
- [ ] 6.5 Test authenticated read, owner-only write, entrant migration, and historical missing-team rendering
