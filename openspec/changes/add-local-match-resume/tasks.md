## 1. Save payload

- [ ] 1.1 Define the `MatchSave` payload type: version, savedAt, snapshot, teams, drive assignment, RNG state, match statistics, optional competition context
- [ ] 1.2 Add serialize/deserialize for the payload alongside `serializeGameState`, leaving the `GameSnapshot` contract untouched
- [ ] 1.3 Add JSON-safe state capture and restore to the RNG service
- [ ] 1.4 Add JSON-safe state capture and restore to `MatchStatsTracker`
- [ ] 1.5 Capture the drive's kicking/receiving assignment into the payload rather than leaving it on the scene

## 2. Storage seam

- [ ] 2.1 Add a match-save repository with a swappable backend, mirroring `TeamManager`'s storage seam
- [ ] 2.2 Implement the localStorage backend with quota-error handling that degrades to a snapshot-only save once and warns
- [ ] 2.3 Implement read, write, clear, and describe (team names, score, half/turn) operations
- [ ] 2.4 Discard unreadable or version-mismatched saves with a warning instead of throwing

## 3. Autosave

- [ ] 3.1 Add a single autosave subscriber that writes after action-resolved, turn-ended, phase-changed, and drive-ended events
- [ ] 3.2 Gate the write on an idle operation queue and no pending decision, and debounce it
- [ ] 3.3 Verify no save is taken mid-animation or mid-operation
- [ ] 3.4 Skip autosave entirely for online matches, which keep their existing host resync

## 4. Resume flow

- [ ] 4.1 Add a resume entry to the main menu showing team names, score, and half/turn when a save exists
- [ ] 4.2 Boot `GamePage` and `GameScene` from a restored state — board, dugouts, ball, phase, sub-phase — rather than a fresh setup
- [ ] 4.3 Restore the RNG and statistics tracker into the service container on resume
- [ ] 4.4 Restore the competition context so a resumed fixture still reports its result
- [ ] 4.5 Add discard with confirmation, and warn before a new match replaces an existing save
- [ ] 4.6 Clear the save at full time when the coach leaves the results screen

## 5. Cloud save

- [ ] 5.1 Add a per-coach saved-match document in Firestore and a backend that writes both cloud and local
- [ ] 5.2 Swap the backend in on sign-in and restore the localStorage backend on sign-out, following the team repository pattern
- [ ] 5.3 Reconcile local and cloud saves by newest `savedAt`, retaining the loser under a conflict key for the session
- [ ] 5.4 Verify resume on a second device for a signed-in coach

## 6. Verification

- [ ] 6.1 Add a headless test: seed a match, save mid-drive, restore, and assert identical dice and legal commands
- [ ] 6.2 Add a test asserting player status, SPP, skills, and injuries survive a save/restore round-trip
- [ ] 6.3 Add a test asserting statistics continue accumulating across a resume
- [ ] 6.4 Add a test asserting a corrupt or version-mismatched save is discarded without blocking startup
- [ ] 6.5 In the browser: play a local match, refresh mid-turn, resume, and finish it
- [ ] 6.6 Mark the item fixed in `ai_notes.md` with a dated note
