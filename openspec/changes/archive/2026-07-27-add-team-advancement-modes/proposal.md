## Why

The app currently treats progression as a single boolean, but Sevens teams are built for different environments with incompatible advancement rules. Matched Play grants tier-based skills up front, Advanced League uses normal SPP progression, and Sevens Skill Selection awards one random skill after each game and subjects experienced players to the Draft.

## What Changes

- Require every team to choose one immutable advancement mode at creation: Matched Play, Advanced League (SPP), or Sevens Skill Selection.
- Draft Matched Play rosters against an event rule package: tier-based skill allowance, Primary in place of Secondary, and at most one added skill per player.
- Keep the existing SPP earning and spending flow only for Advanced League teams.
- Implement Sevens Skill Selection without SPP: after each game choose one eligible participant for a two-roll random Primary choice, or randomly select an eligible participant for a two-roll random Secondary choice.
- Increase player value for every awarded advancement and run the post-game Draft roll for each player with added skills, removing drafted players and paying compensation equal to their skill-value increase.
- Let leagues and tournaments declare an advancement mode, draft budget, and compatible roster rules; only matching legal teams can enter.
- Surface compatibility and refusal reasons before a team joins a competition.

## Capabilities

### New Capabilities
- `team-advancement-modes`: immutable team progression modes and their matched-play, SPP, random-skill, value-increase, and Draft behavior.
- `competition-roster-rules`: competition-defined advancement mode, starting budget, skill package, and team compatibility validation.

### Modified Capabilities
- `player-progression`: standard SPP earning and spending applies to Advanced League teams rather than every progression-enabled match.

## Impact

- Team/player models and persistence: advancement mode, added-skill provenance, value increases, and Draft history.
- Team builder and management: mode choice, matched-play skill package, compatibility display, and deferred advancement controls.
- Post-match: mode-specific progression pipeline, random skill selection, Draft rolls, compensation, and announcements.
- Competitions/lobbies: rule profiles, entrant validation, starting budgets, and online synchronization.
- Tests: deterministic tier packages, SPP gating, random skills, Draft outcomes, value calculations, and competition compatibility.
