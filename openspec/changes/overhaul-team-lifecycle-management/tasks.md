## 1. Lifecycle mode

- [ ] 1.1 Add `firstMatchPlayedAt` to the team record and derive `mode` from it
- [ ] 1.2 Stamp it when the post-match summary is confirmed, and verify an abandoned match does not stamp it
- [ ] 1.3 Backfill existing teams: stamp teams with recorded match history, leave the rest in draft
- [ ] 1.4 Show the mode in the team list and on the team page, listing which active-team rules are enforced

## 2. Edit legality and pricing

- [ ] 2.1 Add a single `canEdit(team, operation)` predicate returning allowed or refused-with-reason for every team-building operation
- [ ] 2.2 Add `priceOf(team, item)` returning roster price in draft, doubled re-roll price in active, and unavailable for Dedicated Fans in active
- [ ] 2.3 Route `TeamBuilder` through both, showing the price that will be charged
- [ ] 2.4 Route `TeamManagement` through both for every edit it offers
- [ ] 2.5 Render refusal reasons from the predicate rather than writing messages per screen
- [ ] 2.6 Resolve the open question on which further active-team rules to enforce now

## 3. Player development page

- [ ] 3.1 Extract `AdvancementForm` and `SkillSelectors` out of `PostMatchProgression` into a shared component
- [ ] 3.2 Confirm the post-match screen still works unchanged against the extracted component
- [ ] 3.3 Build the development page: characteristics with advances and injuries marked, starting versus gained skills, injuries, level, SPP spent and available, career statistics
- [ ] 3.4 Wire SPP spending through `applyAdvancement` and `saveTeam`, allowed in both modes
- [ ] 3.5 Flag players with SPP available and players who must advance in the roster view

## 4. Remove publishing

- [ ] 4.1 Add Firestore rules granting authenticated read on any coach's teams and owner-only write
- [ ] 4.2 Rework `SharedTeamBrowser` into a browser over coaches and their live teams
- [ ] 4.3 Repoint every competition entrant referencing a shared document at the underlying owner/team pair, retaining cached display fields where the team is gone
- [ ] 4.4 Verify the repointing against every existing competition before deleting anything
- [ ] 4.5 Remove the publish/unpublish UI, `sharedTeamRepository`, and the `SharedTeam` type
- [ ] 4.6 Delete the `sharedTeams` collection
- [ ] 4.7 Collapse `source: "shared" | "local"` to a single entrant path in `CompetitionBuilder`

## 5. Verification

- [ ] 5.1 Add tests for the `canEdit` table across both modes and every operation
- [ ] 5.2 Add a test asserting an active team is charged double for a re-roll and refused Dedicated Fans
- [ ] 5.3 Add a test asserting a first completed match moves a team from draft to active and an abandoned one does not
- [ ] 5.4 Add a test asserting a non-owner cannot write another coach's team, including as a competition organizer
- [ ] 5.5 In the app: create a team, play a match, confirm it locks, spend SPP on the development page, and add it to a competition from another account
- [ ] 5.6 Mark the item fixed in `ai_notes.md` with a dated note
