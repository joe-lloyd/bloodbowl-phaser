# Proposal: add-leagues-and-tournaments

## Why

Teams live only in a private per-user library (`users/{uid}/teams/{teamId}`, owner read+write), and matches are one-off exhibitions — there is no way to run a league or tournament, and no way for another coach to even see your team roster. Blood Bowl's depth is in campaigns: standings, brackets, and teams that persist across a season. This adds the Firestore structure and the builder pages to run both formats, locally and hosted.

## What Changes

- **Shared team collection**: publish a team to a shared collection where anyone can read it but only the owner can write it, so opponents/organizers can view a roster without being able to edit it. The private library stays; publishing is opt-in.
- **Tournament builder**: a page to create a tournament — name, format (single/double elimination or round-robin), entrant teams (from shared/published teams or ad-hoc), seeding, and a generated bracket/schedule that advances as results are recorded.
- **League builder**: a page to create a league — member teams, a season schedule (round-robin/divisions), a standings table, and persistence of results and team progression across the season.
- **Both formats playable locally and hosted**: a tournament/league fixture can be launched as either a local (hotseat) match or a hosted online match, and its result is recorded back to the bracket/standings.
- **Result recording + progression tie-in**: recording a fixture result updates standings/brackets and (via `add-spp-progression-stats`) the participating teams' progression, persisted to their owners.

## Capabilities

### New Capabilities

- `shared-team-library`: The published/shared team collection and its access model — public read, owner-only write — plus publish/unpublish and how shared teams are discovered and referenced by leagues/tournaments.
- `tournament-builder`: Creating and running a tournament — formats, entrants, seeding, bracket/schedule generation, fixture launch (local or hosted), and result-driven advancement.
- `league-builder`: Creating and running a league — membership, season scheduling, standings, and cross-season persistence of results and team progression.
- `competition-play-integration`: Launching a league/tournament fixture as a local or hosted match, carrying the competition/fixture context (including on a hosted lobby), and recording the result back to the competition.

### Modified Capabilities

<!-- none — the online-lobby capability is not yet in openspec/specs (its change is unarchived); the hosted-fixture context is specified here under competition-play-integration and reconciled with online-lobby at implementation time -->


## Impact

- **Firestore**: new shared-teams collection with public-read/owner-write rules; new `leagues/{id}` and `tournaments/{id}` documents with membership-scoped writes; `firestore.rules` extended accordingly.
- **New code**: shared-team repository (read others, write own), league & tournament data models + builders (pages under `src/ui`), bracket/schedule/standings logic (pure, testable), and result-recording wiring.
- **Touched code**: `TeamManager`/repository (publish path), `OnlineLobby`/match creation (fixture context), main menu (League/Tournament sections), and the post-match flow (report result).
- **Depends on**: `add-spp-progression-stats` for per-team progression across a season (soft dependency — standings work without it; progression tie-in needs it).
- **Untouched**: core turn/rules engine and headless (competitions are orchestration around matches, not rule changes).
