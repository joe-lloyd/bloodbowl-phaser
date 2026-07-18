# Tasks: add-leagues-and-tournaments

## 1. Shared team library

- [ ] 1.1 Firestore: shared-teams collection with public read / owner-only write; extend `firestore.rules` and cover with a rules test
- [ ] 1.2 Shared-team repository: publish/unpublish (snapshot from the owner's team), refresh, read others' shared teams
- [ ] 1.3 UI: publish/unpublish action in the team library; a shared-team browser (read-only roster view)

## 2. Pure competition logic

- [ ] 2.1 Data models for `tournaments/{id}` and `leagues/{id}` (format, entrants as shared-team references or local-only entrants, schedule/bracket, results, standings)
- [ ] 2.2 Pure modules: seeding, single-elimination bracket generation + advancement, round-robin scheduling, standings computation — deterministic and unit-tested
- [ ] 2.3 Unit tests: bracket from seeds, winner advancement to a champion, round-robin schedule + standings from a set of results

## 3. Tournament builder

- [ ] 3.1 Create-tournament page: name, format, entrants (shared or ad-hoc), seeding
- [ ] 3.2 Bracket/schedule view that advances as results are recorded; champion/final standings on completion
- [ ] 3.3 Firestore persistence with organizer-scoped writes (+ participant result-report exception)

## 4. League builder

- [ ] 4.1 Create-league page: name, members, generated round-robin season
- [ ] 4.2 Standings table computed from recorded results; season resumes intact after reload
- [ ] 4.3 Firestore persistence + rules (organizer-scoped, participant result exception)

## 5. Play integration

- [ ] 5.1 Launch a fixture locally (hotseat) with the fixture's two teams, carrying `{ competitionType, competitionId, fixtureId }` in match setup state
- [ ] 5.2 Launch a fixture hosted: create the online match with fixture context on the lobby/match doc (reconcile with the `online-lobby` capability)
- [ ] 5.3 On match end, record the result back to the competition (update bracket/standings)

## 6. Progression tie-in

- [ ] 6.1 When `add-spp-progression-stats` is present, recording a fixture result also persists each participating team's progression to its owner
- [ ] 6.2 Ensure standings/brackets still function with progression absent (soft dependency)

## 7. Navigation + verification

- [ ] 7.1 Main-menu entry points for League and Tournament (create/browse/resume)
- [ ] 7.2 Verify end-to-end: build a small local round-robin league, play a fixture, see standings update and progression persist
- [ ] 7.3 Verify a hosted single-elimination tournament fixture reports its result and advances the bracket; full test suite + rules tests green
