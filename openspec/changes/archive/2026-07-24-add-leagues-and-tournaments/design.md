# Design: add-leagues-and-tournaments

## Context

Teams persist through `TeamRepository` (sync façade; localStorage when signed out, a write-through Firestore cache at `users/{uid}/teams/{teamId}` when signed in). `firestore.rules` today scopes team docs to owner read+write and game docs to their two members. Online matches are created through the lobby (`OnlineLobby`, `firebase/lobby.ts`, join via callable Function). There is no shared visibility of teams and no competition structure. Bracket/standings math is pure logic that should stay engine-independent and testable.

## Goals / Non-Goals

**Goals:**

- Publish a team so others can read (not edit) it.
- Build and run tournaments (elimination / round-robin) and leagues (season schedule + standings).
- Launch any fixture as a local or hosted match and record its result back.
- Persist competition state and per-team progression across a season.

**Non-Goals:**

- Matchmaking/ranking/ELO across the whole player base.
- Inducements, sponsorship, and the full league economy (future; standings/brackets first).
- Real-time spectating of other people's fixtures.
- Changing any game rule or the match engine.

## Decisions

### 1. Shared team collection separate from the private library

Publishing copies (or references) a team into a shared collection with **public read, owner-only write**, leaving the private `users/{uid}/teams` library intact. A published team is a snapshot the owner can refresh; readers can never write it. Alternative — opening read on the private collection — rejected: it would expose the entire private library and complicate the existing owner-only rule.

### 2. Leagues/tournaments as their own Firestore documents with membership-scoped writes

`tournaments/{id}` and `leagues/{id}` hold format, entrants (references to shared teams), schedule/bracket, and results. Writes are scoped to the organizer (and, for reporting a result, the fixture's participants) via `firestore.rules`, mirroring how game docs restrict writes to members. Bracket advancement and standings are recomputed from recorded results.

### 3. Bracket/schedule/standings as pure modules

Seeding, single/double-elimination bracket generation, round-robin scheduling, and standings computation are pure functions over the competition document — no Firestore, no engine — so they are unit-testable and identical for local and hosted play. The UI and persistence are thin layers over them.

### 4. Fixture launch carries competition context

Launching a fixture attaches `{ competitionType, competitionId, fixtureId }` to the match — for local play it lives in match setup state; for hosted play it's a field on the lobby/match doc (the `online-lobby` delta). When the match ends, the post-match flow reports the result (score, and via `add-spp-progression-stats`, progression) back to the competition document, which recomputes standings/bracket.

### 5. Progression tie-in is soft-coupled

Standings and brackets work from scores alone. When `add-spp-progression-stats` is present, recording a result also persists each participating team's progression to its owner. Ordering: this change can land its structure first; the progression write-back is wired where the two meet.

## Risks / Trade-offs

- [Shared team snapshot goes stale vs. the owner's edits] → publishing is an explicit snapshot with a visible "republish" action; competitions reference the snapshot taken at entry so a mid-season edit can't retroactively change played fixtures.
- [Result reporting trust in hosted play] → only fixture participants may write a result, and the two-member game-doc pattern already models this; disputes are out of scope (organizer can correct).
- [Firestore rule complexity] → keep competition writes organizer-scoped with a narrow participant-report exception; cover with the rules test approach used for lobby/messages.
- [Local (hotseat) result has no second account to attest] → local fixtures are recorded by the single device running them; acceptable for hotseat leagues.

## Migration Plan

Land in order: (1) shared-team collection + rules + publish/unpublish; (2) pure bracket/schedule/standings modules with tests; (3) tournament builder + run; (4) league builder + run; (5) fixture launch + result recording (local first, then the hosted `online-lobby` delta); (6) progression tie-in. Each step is independently shippable; no migration of existing private teams (publishing is additive and opt-in).

## Open Questions

- Shared team as a full snapshot copy vs. a reference + permission (lean: snapshot copy for immutability during a season).
- Whether leagues support divisions/conferences in v1 or a single table first (lean: single round-robin table first).
- Double-elimination in v1 or single-elim + round-robin first (lean: single-elim + round-robin, double-elim follow-up).
- How ad-hoc (unpublished) entrants are represented for a purely local tournament (lean: allow local-only entrants that never touch Firestore).
