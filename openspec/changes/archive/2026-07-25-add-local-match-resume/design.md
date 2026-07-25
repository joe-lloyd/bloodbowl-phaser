## Context

`serializeGameState` produces a `GameSnapshot` covering phase, sub-phase, active team, turn data, score, weather, ball position, active player, ejected coaches, and per-player position/status/stats/skills/conditions. That is enough for the online transport, because the host keeps everything else in memory and re-derives it. It is *not* enough to restore a match into an empty process:

- Which team is kicking and which is receiving this drive lives on the scene (`scene.kickingTeam` / `receivingTeam`), not the snapshot.
- The random-number generator's state is not captured, so a resumed match would diverge from a seeded one.
- `MatchStatsTracker` accumulates SPP-relevant events for the whole match and is purely in-memory.
- Team rosters are supplied to the scene at boot; the snapshot carries only the subset of player fields play needs, not the full roster records (cost, primary/secondary access, SPP, injuries).
- A competition fixture's context is held by `GamePage`.

Team persistence already has the right shape to copy: `TeamManager` writes to localStorage behind a swappable storage seam, and `cloudTeamRepository` swaps in a Firestore backend when signed in. Match saves should reuse that pattern rather than invent a second one.

## Goals / Non-Goals

**Goals:**
- Refreshing the page never costs more than the action in flight.
- A resumed match is indistinguishable from the one that was interrupted, including dice determinism.
- Signed-in coaches can resume on another device.
- One save mechanism, matching the existing team-storage pattern.

**Non-Goals:**
- Resuming an *online* match from local storage. Online already has host resync; the guest cache stays as it is.
- Replay or undo history. This is a single resumable position, not a timeline.
- Multiple concurrent saved local matches. One in-progress local match per coach; starting a new one replaces it after confirmation.

## Decisions

**1. A save is a wrapper around the snapshot, not a redesign of it.**
`MatchSave = { version, savedAt, snapshot: GameSnapshot, teams: Team[], drive: { kickingTeamId, receivingTeamId, half }, rng: RngState, matchStats: MatchStatsSnapshot, competition?: CompetitionContext }`. The snapshot keeps its existing contract for the headless runner and the transport; the extra fields sit beside it. Alternative considered: widening `GameSnapshot` itself. Rejected — the transport sends a snapshot per action and does not need rosters or RNG state on every message.

**2. Full roster records are saved, not reconstructed from the snapshot.**
The snapshot's `PlayerSnapshot` is deliberately a play-time projection. Restoring a match needs the real `Team`/`Player` records so SPP, injuries, and team value survive. Saving them costs bytes and removes a whole class of "restored player lost their advancement" bugs.

**3. Autosave is driven by one hook, not sprinkled through the engine.**
A single subscriber on the event bus writes the save after events that advance the game (action resolved, turn ended, phase changed, drive ended). It is debounced and never runs mid-operation — the flow manager's queue must be idle, so a save is always taken at a resumable boundary. Alternative considered: saving on every event. Rejected — it would capture mid-animation and mid-operation states that cannot be resumed cleanly.

**4. Storage seam mirrors `TeamManager`.**
localStorage is the default backend; signing in swaps in a Firestore-backed one that also writes locally. On startup both are read and the newer `savedAt` wins, so a coach who played offline on this device does not lose that progress to an older cloud save. Alternative considered: cloud-only when signed in. Rejected — it makes offline play lossy for exactly the coaches who opted into accounts.

**5. Resume is offered, never forced.**
The main menu shows a resume entry with the two team names, the score, and the half/turn. Discarding requires confirmation. A save whose version does not match, or which fails to deserialize, is discarded with a console warning and the coach is not blocked from starting a new match. Refusing to boot on a bad save would be the worst possible failure mode for a feature whose entire purpose is recovering from failure.

**6. RNG state is captured through the existing RNG service seam.**
The service exposes a serializable state; restoring it means a resumed seeded match produces the same dice as an uninterrupted one, which is what makes the rule scenarios and the headless tests able to cover resume at all.

## Risks / Trade-offs

- **[localStorage quota]** → A save is a few hundred KB at most; the writer catches quota errors, drops to snapshot-only (no rosters) once, and warns. Cloud save is unaffected.
- **[Saving at a bad boundary yields an unresumable match]** → Saves are only taken with the operation queue idle and no pending decision; a resume that lands in an inconsistent phase falls back to the last clean boundary rather than restoring garbage.
- **[Roster records in the save go stale against the team library]** → The save is authoritative for the in-progress match; on completion, progression writes back through the normal `saveTeam` path. Stated explicitly so the two do not race.
- **[Cloud/local conflict]** → Newest `savedAt` wins, and the losing save is kept for one session under a `.conflict` key so nothing is silently destroyed.
- **[Scope creep into online resume]** → Explicitly out of scope; the online guest cache is untouched.

## Migration Plan

1. Add the save payload type and the storage seam with the localStorage backend.
2. Add RNG state and match-stats serialization.
3. Add the autosave subscriber and the boot-from-save path.
4. Add the main-menu resume entry and the discard flow.
5. Add the Firestore backend and the newest-wins reconciliation.

`version` is stamped from the start, so a later payload change can discard old saves cleanly rather than crashing on them.

## Open Questions

- Should a competition fixture in progress also be resumable by a *different* coach on the same account, or is a save strictly per-device-per-coach? Leaning per-coach, since the cloud save is already account-scoped.
