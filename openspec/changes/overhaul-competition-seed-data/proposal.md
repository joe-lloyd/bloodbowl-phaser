## Why

The development seed button creates superficially full rosters but many are illegal, keep the entire 600,000 treasury after hiring, and provide no realistic league or tournament history. Reliable UI and end-to-end testing needs deterministic, rule-valid teams and competitions in draft, active, and completed states.

## What Changes

- Build seed rosters through the same legality and pricing rules as the team builder.
- Guarantee at least seven players, no more than four players without the Lineman keyword, all roster positional limits, roster-specific re-roll pricing, and treasury equal to the unspent draft budget.
- Seed deterministic player histories spanning rookies through the advancement cap, including SPP, gained skills, value increases, injuries, and career statistics.
- Seed leagues and tournaments in draft/new, active/in-progress, and completed/historical states, including valid fixtures, standings, brackets, winners, and progression.
- Enforce that a seeded team belongs to at most one active league or tournament while allowing historical completed memberships to remain visible.
- Make seed creation idempotent, versioned, and safely removable without deleting coach-created data.

## Capabilities

### New Capabilities
- `development-seed-data`: deterministic, legal, lifecycle-rich seed teams, leagues, and tournaments for UI and end-to-end testing.

### Modified Capabilities

## Impact

- Seeding: `TeamManager.seedAllRosterTeams`, new competition seed builders, stable ids, seed versioning, and cleanup.
- Rule reuse: team legality, roster templates/keywords, treasury/team-value calculation, advancement modes, and competition membership rules.
- Competition persistence: league/tournament fixtures, standings, bracket linkage, champions, and local/cloud repositories.
- Tests: invariant validation for every seed plus UI fixtures for draft, active, and completed competition states.
