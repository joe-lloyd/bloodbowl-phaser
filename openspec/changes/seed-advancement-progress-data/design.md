## Context

`buildSeedTeam` (`src/seeding/teamFixtures.ts`) creates every development seed
team via the shared `createTeam` helper but never passes an `advancementMode`,
so all ~30 seeded rosters load with the mode unset. Separately,
`decorateSeedTeams` (`src/seeding/playerLifecycle.ts`) already grants earned/
spendable SPP and multi-advancement histories to specific players on the
Human, Orc, Dwarf, and Skaven "Founders" teams — that data is real, it's just
not paired with an explicit mode. The Team Management overview card
(`src/ui/components/pages/TeamManagement.tsx`, `teamStatus`/pill block around
line 199) already renders a draft/active pill; this change adds a sibling
pill for advancement mode using the same visual pattern.

## Goals / Non-Goals

**Goals:**
- Every seed team gets an explicit, locked `advancementMode`.
- The seed catalog covers all three modes so each mode's UI/rules are
  reachable straight from a seed refresh.
- The four already-decorated rosters (real SPP/advancement history) are
  pinned to Advanced League, since that's the only mode the rules allow to
  earn spendable SPP (`team-advancement-modes`: "Advanced League alone uses
  standard SPP progression").
- A compact advancement-mode pill appears on the Team Management overview
  card, next to the existing draft/active pill.

**Non-Goals:**
- No change to the advancement-mode *rules* themselves (package sizing, SPP
  costs, Draft resolution) — this is seed data + a read-only badge only.
- No change to `decorateSeedTeams`' existing SPP/advancement plans — they
  already produce spendable SPP (e.g. the Human Catcher's 9 unspent SPP) and
  a capped Legend (Orc Blitzer); this change only makes sure the team those
  players sit on is unambiguously Advanced League.
- Not touching the overview card's stats grid — that's a different,
  in-flight change (`team-management-layout`) on the same file.

## Decisions

- **Mode assignment strategy**: cycle the 30 rosters through
  `["matched-play", "advanced-league", "sevens-skill-selection"]` by their
  index in `Object.values(RosterName)` (stable, deterministic — enum
  declaration order), then override Human/Orc/Dwarf/Skaven to
  `"advanced-league"` unconditionally. Alternative considered: hand-picking a
  mode per roster — rejected as needless bookkeeping for 30 rosters when a
  deterministic cycle already guarantees every mode is represented and reads
  cleanly as "these four are special, everyone else round-robins."
- **Locking**: call the existing `lockAdvancementMode(team)` right after
  `createTeam` so seed teams read as already-committed ("selected its
  advancement type already" per the request), matching how a real coach's
  team gets locked on first save (`TeamBuilder.tsx`).
- **Pill placement/style**: reuse the exact class pattern of the existing
  draft/active pill (`rounded px-2 py-0.5 text-xs font-bold uppercase
  tracking-wide`) rather than introducing a new badge component — this repo's
  simplification guidance prefers reusing an established pattern over adding
  a new one for a single extra badge.
- **Short labels**: add a small `ADVANCEMENT_MODE_SHORT_LABELS` map next to
  the existing `MODE_LABELS` in `AdvancementModePanel.tsx` rather than
  reusing `MODE_LABELS` directly — those are long, parenthetical strings
  ("Matched Play (event skill package)") sized for the mode-selector buttons,
  not a compact overview pill.

## Risks / Trade-offs

- [Risk] Another in-flight change (`restore-team-overview-stats`) also edits
  the same overview card region → [Mitigation] none needed here; the pill
  edit is scoped to the existing badge row (a few lines), or is resolved by
  the orchestrator at merge as noted in the task brief.
- [Risk] Changing seed team modes could, in principle, interact with
  existing seed invariant tests → [Mitigation] `validateDevelopmentSeedData`
  does not currently check `advancementMode` at all (per its own comment,
  that validation is deferred), so this addition can't regress it; new
  assertions are additive in `teamFixtures.test.ts` /
  `developmentSeed.test.ts`.
