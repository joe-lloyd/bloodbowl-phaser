# Proposal: add-spp-progression-stats

## Why

`Player` already carries unused `spp` and `level` fields, but nothing awards Star Player Points, no per-player match stats are tracked, and there is no post-match screen or advancement step — so a saved team never grows. Casualties today emit only a `UI_Notification` (`"CASUALTY!"`), with no attributable domain event, so even the raw data SPP needs is not captured. This change makes matches count: track the stats, show them after the game, and let players advance.

## What Changes

- **Per-player match stat tracking**: a stats accumulator subscribes to gameplay events and records, per player, the SPP-earning actions from the 2025 rules — completions (passes/hand-offs that gain ground per the ruleset), throwing/deflection SPP, rushing (carrying the ball over the line — touchdowns), knockdowns/blocks that cause a casualty, interceptions, and MVP — plus flavour stats for the summary (blocks thrown, yards moved, injuries suffered).
- **New attributable domain events**: add `PlayerCasualtyInflicted` (attacker + victim), `PassCompletedFor` / `InterceptionMade` attribution, and an end-of-match `MvpAwarded` roll, so the stats layer never has to scrape notification strings. **BREAKING** for any listener assuming casualties are notification-only.
- **SPP calculation**: convert tracked stats into SPP at end of match per the 2025 values (completion, deflection, casualty, interception, touchdown, MVP), added to each player's running `spp`.
- **Advancement / level-up**: after the match, spend SPP on advancements — random/chosen skill (primary/secondary cost table), characteristic increases — updating `skills`, `stats`, `level`, `teamValue`, and `cost`. Applied through a post-match flow the coach confirms.
- **Post-match statistics page**: a summary screen listing both teams' per-player lines (the tracked stats + SPP earned), team totals (score, casualties, completions), and the MVP, with the advancement step reachable from it.
- **Persistence**: progression (new SPP, skills, stat changes, injuries) is written back to the owning coach's saved team via the existing cloud/local `TeamRepository` (`users/{uid}/teams/{teamId}`), so growth survives between matches.

## Capabilities

### New Capabilities

- `match-stats`: The per-player statistics model tracked during a match — the stat catalog, the domain events it binds to (including the new attributable casualty/interception/MVP events), and the guarantee that tracking is engine-driven and headless-safe.
- `player-progression`: SPP award values and calculation from tracked stats, the advancement options and their SPP costs, level thresholds, and how advancements mutate a player and persist to the saved team.
- `post-match-summary`: The end-of-match statistics/summary screen — per-player and per-team lines, MVP, and the entry point into the advancement flow.

### Modified Capabilities

<!-- none — no stats/progression capability exists in openspec/specs yet -->

## Impact

- **New code**: a `MatchStats` accumulator (UI/engine-adjacent, event-driven), an `Spp`/advancement module (pure, headless-testable), the post-match summary page + advancement UI, and progression write-back through `TeamRepository`.
- **New events** in `src/types/events.ts`: `PlayerCasualtyInflicted`, interception/MVP attribution — emitted from `InjuryOperation`/`CrowdInjuryOperation`/`FoulOperation`, the pass/catch path, and a new end-of-match MVP step.
- **Touched types**: `Player` (`spp`/`level` become live; possibly add a `matchStats`/career-stats sub-record), `Team` (season/career totals optional).
- **Persistence**: reuses `cloudTeamRepository` + local repository; no schema migration for existing saved teams (new fields default to zero/empty).
- **Untouched**: core turn/rules engine behavior — this layer only observes events and applies advancement between matches; headless play stays fully functional (stats accumulate, no UI required).
