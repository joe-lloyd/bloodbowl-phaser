## Context

`TeamManagement.tsx` (the `/build-team` overview grid) renders each saved team as a card whose "Stats Grid" (lines ~241-274) is inline JSX — a 2x2 grid of Team Value, Treasury, Roster count, and Record — built from locally-defined `formatGold`/`numToHex` helpers, plus a separate "Career statistics" `<details>` block per player. `TeamBuilder.tsx` (the `/build-team/:teamId` detail page) currently shows only a compact `TV: {formatGold(calculateTeamValue(team))}` badge (line ~518) with no treasury/roster/record display. `TeamSelect.tsx` (`/select-team`, mode="play") renders two mirrored columns, each `.map()`-ing every saved team into a full-width `<button>` row with no search, filter, or virtualization — so with N teams the page height is driven by `2N` rows.

## Goals / Non-Goals

**Goals:**
- Move the detailed stats block from the browsing/overview surface to the surface meant for studying one team.
- Make local-play team selection usable at a much larger team count via search/filter and a denser row.

**Non-Goals:**
- Changing team value/treasury/record computation.
- Changing which teams are eligible/legal for a match (`legalityIssues()` stays as-is).
- Redesigning the Team Management career-statistics `<details>` block (out of scope unless it naturally travels with the stats grid).

## Decisions

- **Extract the stats grid into a small shared component** (e.g. `TeamManagement/TeamStatsOverview.tsx`) taking a `team: Team` prop, so it can be dropped into `TeamBuilder.tsx` without duplicating `formatGold`/`numToHex`. `TeamManagement.tsx` stops rendering it; `TeamBuilder.tsx` renders it near the existing `TV:` badge.
- **Team-select redesign: add a simple text filter input per column, not a full architecture change.** `TeamSelect.tsx`'s per-side team list is filtered by a local `useState<string>` search string (case-insensitive substring match on team name and roster name) before `.map()`. Combined with shrinking each row's padding/font to a denser single-line treatment (name + roster, no separate subtitle block), this bounds the visible list to what the coach is looking for without introducing pagination/virtualization machinery the rest of the app doesn't use elsewhere.

## Risks / Trade-offs

- [A very large number of teams (100+) might still be slow to render even filtered down visually] → out of scope; the complaint is about page length/usability at the user's actual team count, not raw rendering performance — virtualization can be a follow-up if that becomes the real bottleneck.
- [Moving the stats grid changes `TeamManagement.tsx`'s card height, which may affect its own grid layout] → acceptable and intended; that's the whole point of the request (shorter overview cards).
