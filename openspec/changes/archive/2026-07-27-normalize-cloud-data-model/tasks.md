## 1. Stored record types

- [x] 1.1 Define `StoredPlayer` and `StoredTeam` with a `schemaVersion`, holding only non-derivable data
- [x] 1.2 Implement `dehydratePlayer(player) -> StoredPlayer`, excluding statlines, resolved skills, keywords, access, cost, team value, and all match state
- [x] 1.3 Implement `hydratePlayer(stored) -> Player` from `RosterTemplates` plus advancements and injuries
- [x] 1.4 Recompute team value on load with `calculateTeamValue` rather than reading it
- [x] 1.5 Add a position-alias map and a marked-placeholder path for a position no longer in its roster, preserving progression and warning
- [x] 1.6 Add a round-trip test covering every position of every roster

## 2. Tolerant reader, then normalized writer

- [x] 2.1 Make the team reader accept both the previous full-object shape and the normalized shape
- [x] 2.2 Convert old-shape documents on read
- [x] 2.3 Switch `cloudTeamRepository` and the localStorage backend to write the normalized shape with the current version
- [x] 2.4 Verify a converted document is rewritten normalized on its next save
- [x] 2.5 Add an optional backfill pass for documents that are never opened

## 3. Career statistics

- [x] 3.1 Add `careerStats` to the stored player record
- [x] 3.2 Add squares-moved and kills counters to `MatchStatsTracker`
- [x] 3.3 Fold the match summary into career totals when the post-match summary is confirmed, keyed by match id so it is idempotent
- [x] 3.4 Verify an abandoned match contributes nothing
- [x] 3.5 Display the agreed set — games played, touchdowns, completions, casualties, kills, MVPs — in team management

## 4. Competition references

- [x] 4.1 Replace `CompetitionEntrant.team` with `teamRef: { ownerUid, teamId }` plus a `display` cache
- [x] 4.2 Fetch live rosters by reference when a fixture is launched
- [x] 4.3 Refresh cached display fields when a competition is loaded by a reader who can see the team
- [x] 4.4 Make the competition reader accept embedded-roster documents and convert them on read
- [x] 4.5 Store coach identity as uid plus cached display name on entrants and fixtures
- [x] 4.6 Resolve the open question on freezing tournament rosters before finalising this group

## 5. Single active competition

- [x] 5.1 Add `activeCompetitionId` to the team record
- [x] 5.2 Set it on entry and refuse entry when it is already set, naming the existing competition
- [x] 5.3 Clear it when a competition completes and when a team is withdrawn
- [x] 5.4 Surface the constraint in the competition builder's team picker

## 6. Rules and verification

- [x] 6.1 Update Firestore security rules for the new document shapes
- [x] 6.2 Add tests for old-shape read, conversion, and normalized write for teams, leagues, and tournaments
- [x] 6.3 Add a test asserting advancement gained in one league fixture is present in the next
- [x] 6.4 Verify in the app: save a team, inspect the stored document, reload, and confirm identical play behavior
- [x] 6.5 Verify a league season carries player development across rounds
- [x] 6.6 Mark the item fixed in `ai_notes.md` with a dated note
