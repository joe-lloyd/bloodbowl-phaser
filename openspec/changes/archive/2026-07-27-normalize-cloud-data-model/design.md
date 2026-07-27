## Context

Three duplication sites compound:

1. **Team documents.** `writeCloudTeam` does `JSON.parse(JSON.stringify(team))` on the live in-memory `Team`. A `Player` holds `stats`, `baseStats`, `skills` as resolved `Skill` objects (each with `description` text from `traitsAndSkills.json`), `keywords`, `primary`/`secondary` category arrays, `cost`, `teamValue`, plus match-only fields `status`, `gridPosition`, `hasActed`, `conditions`, `plagueRiddenUsed`. For a 11-player roster this is kilobytes of text that is byte-for-byte reproducible from `RosterTemplates` given the roster name and position name.

2. **Competition entrants.** `CompetitionEntrant.team: Team` is documented as "immutable roster snapshot used for every fixture in this competition". That was a deliberate choice — it keeps fixtures reproducible — but it means a league season's worth of player advancement never reaches the fixtures, and the league document grows a full roster copy per entrant.

3. **Shared teams.** `SharedTeam.team: Team` is a third copy, refreshed manually by re-publishing.

The in-memory model does not need to change. `Player` as it stands is a good runtime object. What changes is what crosses the persistence boundary — a stored record that is a strict subset, plus a hydration step that reconstitutes the runtime object.

## Goals / Non-Goals

**Goals:**
- One authoritative copy of a team; everything else references it.
- Stored records contain only what cannot be derived.
- Career statistics that a coach actually wants to see, stored with the player.
- Existing data migrates without loss.

**Non-Goals:**
- Changing the in-memory `Player`/`Team` types used during a match.
- Removing the shared-team library or changing publish semantics — that is `overhaul-team-lifecycle-management`.
- Firestore security-rule redesign beyond what the new document shapes require.

## Decisions

**1. A stored record type distinct from the runtime type, with an explicit hydrate step.**
`StoredPlayer` carries: `id`, `playerName`, `number`, `rosterName`, `positionName`, `playerKind`, `spp`, `level`, `advancements`, `characteristicAdvances`, `addedSkills` (skill types only, not resolved objects), `injuries`, `careerStats`. `hydratePlayer(stored)` looks up the roster template and rebuilds `stats` (base plus characteristic advances minus injury decreases), `baseStats`, `skills` (template skills plus added skills, resolved), `keywords`, `primary`/`secondary`, `cost`, and `teamValue`.

Alternative considered: keeping the fat document and stripping only the obviously transient fields. Rejected — it halves the noise but leaves the drift problem, because a skill description edited in `traitsAndSkills.json` would still be stale in every saved team. Deriving means the rulebook data has exactly one home.

**2. Derived values are recomputed, never stored — including team value.**
`teamValue` and `cost` are functions of the roster and the advancements. Storing them invites the stored and computed values to disagree. `calculateTeamValue` already exists and runs at load.

**3. Competitions hold a reference plus a display cache, and the reference is authoritative.**
`CompetitionEntrant` becomes `{ id, seed, teamRef: { ownerUid, teamId }, display: { teamName, rosterName, coachName } }`. The `display` fields exist so a fixture list renders without fetching every roster; they are a cache and are refreshed when the competition is loaded by someone who can read the team. The roster itself is fetched when a fixture is launched.

This deliberately gives up the "immutable snapshot" property. For a league that is correct and desirable — the whole point of a season is that teams develop between fixtures. For a one-day tournament where the roster should be frozen, freezing belongs to the team's own draft/active lifecycle (a team locked at entry), not to a copy in the competition document. Recorded as a trade-off rather than a free win.

**4. A team's competition membership is a single field on the team.**
`Team.activeCompetitionId?: string`. Entering a competition sets it; a team with it set cannot be entered into another. This makes "one competition at a time" enforceable at the point of entry rather than by scanning every competition document.

**5. Coaches are `{ uid, displayName }`, with `uid` authoritative.**
The display name is a cache for rendering, refreshed on load. No coach record is copied into competition or team documents.

**6. Career statistics are folded at match completion, from the match summary.**
`MatchStats.summary()` already produces per-player match totals. At confirmation, those add into `StoredPlayer.careerStats`. Squares moved and kills need new counters in the tracker; the rest already exist. Folding at confirmation (not continuously) keeps one write per match per team and means an abandoned match contributes nothing.

**7. Versioned documents and a tolerant reader.**
Every stored document gains `schemaVersion`. The reader accepts the old fat shape (no version) and the new shape, converting the former on read and writing back the latter on the next save — lazy migration, no big-bang script, no downtime. A one-off backfill can run later to catch documents that are never opened.

## Risks / Trade-offs

- **[Hydration depends on roster templates matching stored position names]** → A `positionName` that no longer exists in its roster hydrates to a placeholder with the stored progression intact and a visible warning, rather than throwing away the player. Position renames are handled by an alias map.
- **[Losing the immutable competition snapshot changes tournament fairness]** → Documented above; freezing moves to the team lifecycle. Flagged for the user's decision before implementation, since it is a rules-facing choice rather than a technical one.
- **[Lazy migration leaves mixed shapes in the database for a long time]** → The reader handles both, and the version field makes the state legible; a backfill can be run at any point.
- **[Career stats double-counting on a resumed or re-confirmed match]** → Folding is idempotent per match id, recorded on the player, so re-confirmation cannot add twice.
- **[Smaller documents change nothing a user sees]** → True; the visible payoff is career statistics and teams that stop drifting between copies. Worth stating so the work is not judged on document size alone.

## Migration Plan

1. Add `schemaVersion`, the stored-record types, and `hydratePlayer`/`dehydratePlayer` with round-trip tests against every roster.
2. Make the team reader tolerant of both shapes; keep writing the old shape.
3. Switch writes to the new shape. Documents migrate as they are saved.
4. Add `careerStats` and the fold-at-confirmation step.
5. Convert competition entrants to references, with a reader that accepts embedded snapshots and converts them.
6. Add `Team.activeCompetitionId` and enforce single membership at entry.
7. Optional backfill pass over untouched documents.

Rollback: steps 2 and 5 leave the reader able to consume both shapes, so reverting the writer is sufficient at any point before the backfill.

## Open Questions

- ~~Should a one-day tournament freeze its entrants' rosters at entry (via the team lifecycle lock), or accept that rosters develop mid-tournament?~~ **Resolved during implementation**: tournaments use the same referencing model as leagues — rosters are fetched live at fixture launch, not frozen. The team-lifecycle lock this trade-off depends on does not exist yet (it belongs to `overhaul-team-lifecycle-management`, out of scope here per this document's Non-Goals), so there is no mechanism to freeze a roster today. Treating tournaments differently from leagues without that lock would only mean "we forgot to fetch live," not an intentional freeze — worse than the documented trade-off. When the lifecycle lock ships, a tournament organizer can require entrants be locked at entry as a separate, additive constraint; nothing here blocks that.
- Which career statistics matter enough to display versus merely store? Proposed display set: games played, touchdowns, completions, casualties, kills, MVPs; stored-only: passes attempted, interceptions, squares moved. **Resolved as proposed** — see `player-career-stats` spec and `src/ui/components/pages/TeamManagement.tsx`.
