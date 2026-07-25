## Why

Firestore stores the same data many times over. `cloudTeamRepository.toPlainDoc` writes the entire `Team` object, so every saved team carries each player's full statline, base statline, resolved `Skill` objects including their rulebook description text, keywords, skill-category access, cost, team value, and even transient match fields like `hasActed`, `status`, and `gridPosition`. All of that is derivable from the roster template plus the player's position. On top of that, `CompetitionEntrant` embeds a complete `Team` snapshot per entrant, and `SharedTeam` embeds another complete copy — so a team in one league with a published copy exists three times in the database, and they drift the moment a player advances.

The signal in a saved team is small: which roster and position a player is, their name and number, their SPP and advancements, their stat increases, their new skills, and their injuries. The noise is everything else. And what a coach actually wants to see — games played, touchdowns, casualties inflicted, completions, kills — is not stored at all.

## What Changes

- **Players persist only their unique data.** A persisted player record SHALL carry identity (id, name, number, roster position), progression (SPP, level, advancements, chosen skills, characteristic increases), injuries, and career statistics. The base statline, base skills with their descriptions, keywords, skill-category access, and cost SHALL be rehydrated from the roster template on load rather than stored.
- **Transient match state is never persisted.** `status`, `gridPosition`, `hasActed`, `conditions`, and other per-match fields SHALL be excluded from the stored record.
- **Career statistics are recorded.** Each player SHALL accumulate lifetime totals — games played, touchdowns, casualties inflicted, kills, completions, passes, interceptions, squares moved, MVPs — persisted with the player and shown in team management.
- **Competitions reference teams, they do not copy them.** A league or tournament entrant SHALL reference a team by owner and team id. The embedded roster snapshot SHALL be removed, and entrant display data SHALL be limited to what a fixture list needs (team name, roster name, coach name, seed).
- **A team is in at most one active competition.** A team SHALL be entered in at most one active league or tournament at a time, and that association SHALL be recorded as a single reference on the team.
- **Coaches are referenced, not duplicated.** Coach identity on entrants and fixtures SHALL be a uid reference with a cached display name, not a copied coach record.
- **BREAKING**: the stored shape of teams and competitions changes. A one-time migration SHALL convert existing documents, and the reader SHALL accept both shapes during the transition.

## Capabilities

### New Capabilities
- `normalized-team-persistence`: stored player and team records carry only non-derivable data, with statlines and base skills rehydrated from roster templates on load.
- `player-career-stats`: per-player lifetime statistics are accumulated across matches, persisted, and displayed.

### Modified Capabilities
- `league-builder`: entrants reference teams and coaches by id rather than embedding roster snapshots; a team belongs to at most one active competition.
- `tournament-builder`: the same referencing model applies to tournament entrants and brackets.

## Impact

- **BREAKING** storage shape: `users/{uid}/teams/{teamId}` documents, league and tournament documents, and shared-team documents.
- Persistence: `src/firebase/cloudTeamRepository.ts` (`toPlainDoc`), `src/firebase/sharedTeamRepository.ts`, `src/competition/repository.ts` (localStorage competitions), `src/game/managers/TeamManager.ts`.
- Types: `src/types/Player.ts`, `src/types/Team.ts`, `src/competition/types.ts` (`CompetitionEntrant.team` removed), new stored-record types distinct from the in-memory ones.
- Rehydration: `src/data/RosterTemplates.ts` as the source for base statlines, base skills, keywords, and access; a `hydratePlayer(stored)` seam.
- Career stats: `src/game/progression/MatchStats.ts` feeding a persisted per-player total at match completion.
- UI: `src/ui/components/pages/TeamManagement.tsx`, `TeamBuilder.tsx`, `CompetitionView.tsx`, `CompetitionBuilder.tsx`, `SharedTeamBrowser.tsx`.
- Migration: a versioned reader plus a one-time converter for existing documents.
