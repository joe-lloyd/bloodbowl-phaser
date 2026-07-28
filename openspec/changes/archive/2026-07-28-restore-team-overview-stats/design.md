## Context

Earlier the same day, `redesign-team-management-pages` (archived, PR #21, commit `b06d8df`) moved the Team Value / Treasury / Roster x/11 / Record grid off the Team Management overview cards and onto the team detail page (`TeamBuilder.tsx`), reasoning that the overview is for browsing/picking a team while the detail page is for studying one. That commit deliberately left the per-player "Career statistics" `<details>` block on the overview, reasoning it was "a separate per-player feature."

The user has direct feedback on both halves of that decision:
- The summary grid move was wrong — they use wins/losses/team value/treasury/roster count constantly from the overview and want it back there.
- The career-statistics table, however, *should* move — off the overview and onto the detail page, specifically as columns on the player roster table (not a separate collapsed block).

So this change reverses one half of the prior decision (summary grid → back on overview) and completes the other half in the direction the prior change didn't go far enough (career stats → off overview, onto detail page's roster table).

## Goals / Non-Goals

**Goals:**
- Restore `TeamStatsOverview` (Team Value, Treasury, Roster x/11, Record) to the Team Management overview cards.
- Remove the per-player career-statistics `<details>` block from the overview.
- Show each player's career statistics (GP, TD, CMP, CAS, Kills, MVP) as columns in the roster table on the team detail page (`TeamRoster.tsx`, rendered inside `TeamBuilder.tsx`).

**Non-Goals:**
- Not removing `TeamStatsOverview` from the detail page — the user did not ask for that, and leaving it there is not a regression (memory rule: never lose a feature). The grid now appears on both overview and detail.
- Not changing what career stats are tracked or how they're computed (`careerStats.ts`, `foldMatchStatsIntoCareer`) — presentation-only.
- Not touching the individual player development page (`PlayerPage.tsx`), which already shows a fuller career-stats breakdown for one player at a time; that's unrelated to "extra columns in the roster table."

## Decisions

- **Reuse `TeamStatsOverview` as-is on the overview card.** It already renders exactly the four fields requested (Team Value, Treasury, Roster x/11, Record) and is already imported into `TeamManagement.tsx` for its `numToHex`/`formatGold` helpers, so this is a one-line addition (`<TeamStatsOverview team={team} />`) plus an import change, not a rewrite. Only the doc comment on the component needs to change since it currently claims the grid lives on the detail page "rather than" the overview.
- **Delete the `<details>` block outright rather than relocating its JSX.** The career-stats block is a full independent `<table>` with its own headers; the detail page already has a `TeamRoster` table with per-player rows, so the natural home for "extra columns" is *inside* that existing table, not a second table bolted onto the page. Ruthless-simplification: no dead code, no duplicate table markup.
- **Add career-stat columns to `TeamRoster.tsx` directly** (not a wrapper/HOC) since it's the one component that owns the roster `<table>`, already scrolls horizontally (`overflow-x-auto` in `BloodBowlTable`) for exactly this kind of width growth, and already reads `player.*` per row. Six new columns (GP, TD, CMP, CAS, Kills, MVP) mirror the fields the old overview table showed, sourced from `player.careerStats` with `?? 0` fallbacks (a player with no `careerStats` — never played a match — shows zeros, same behavior as before).
- **Empty roster slots widen their `colSpan`** from 6 to 12 (6 existing non-# columns + 6 new stat columns) so the "Empty Slot" placeholder still spans the full row correctly.
- **Spec update, not a new capability.** `team-management-layout` already owns "where per-team stats show" — this change modifies that requirement and adds a sibling one for where career stats show, rather than inventing a new capability for a presentation reversal.

## Risks / Trade-offs

- [Overview card gets taller again, and a second parallel change (`seed-advancement-progress-data`) is independently adding a pill to the same card] → Both changes touch `TeamManagement.tsx`'s per-card JSX; a merge conflict is expected and acceptable, to be resolved by whoever merges second. Not addressed here.
- [Roster table gets wider (13 columns total)] → Already mitigated by the existing horizontal-scroll wrapper; no new scroll mechanism needed. Verified via the existing `TeamRoster.test.tsx` assertion that `colgroup col` count matches `thead th` count.
- [Duplicating `TeamStatsOverview` on both overview and detail pages could read as redundant] → Accepted per explicit non-goal above; removing it from the detail page was never requested and doing so unprompted risks re-triggering the same complaint in reverse.

## Migration Plan

Presentation-only change behind no flag; ships directly. No data migration — `careerStats` already exists on `Player` and is already populated post-match.
