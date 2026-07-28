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

- At least one seeded Matched Play team has a partial event-skill-package
  allocation (some allowance used, some remaining), and one seeded Sevens
  Skill Selection team has a pending post-game skill-selection award — real
  in-progress state for each mode's own mechanic, not just the mode label —
  so a coach can open the seed catalog and click straight into testing
  either flow, matching the user's ask to test "the spending and adding new
  skills setup as well as the other advancement types."

**Non-Goals:**
- No change to the advancement-mode *rules* themselves (package sizing, SPP
  costs, Draft resolution) — this is seed data + a read-only badge only.
- No change to `decorateSeedTeams`' existing SPP/advancement plans — they
  already produce spendable SPP (e.g. the Human Catcher's 9 unspent SPP) and
  a capped Legend (Orc Blitzer); this change only makes sure the team those
  players sit on is unambiguously Advanced League.
- Not touching the overview card's stats grid — that's a different,
  in-flight change (`team-management-layout`) on the same file.
- Not putting advancement mode text into the team *name* — the user's note
  floated this as an alternative to a pill ("or add something in the team
  name so i can see"); the pill supersedes it (same visibility, without
  fighting a coach's own naming or the card's name line for space).

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
- **What "in progress" concretely means per mode**: read from the existing
  UI/rules code rather than invented:
  - Matched Play: `AdvancementModePanel.tsx`'s `AdvancementModePanel` renders
    whenever `team.advancementMode === "matched-play"` and shows
    `matchedPlayPackageStatus` (used/totalAllowance) plus a form to allocate
    the next skill. A team with zero allocations shows an *empty* form — a
    team with one allocation already made (via `allocateMatchedPlaySkill`)
    and allowance remaining shows both the already-taken skill *and* the
    live "allocate another" form, exercising more of the flow.
  - Sevens Skill Selection: the actual testable unit is a
    `PendingDevelopment` entry of kind `"sevens-skill-selection"` — created
    normally by `createPendingSkillSelection` after a match — which
    `PendingDevelopmentPanel.tsx`'s `SkillSelectionEntry` renders on the Team
    Management overview itself (no need to open the detail page). Seeding
    calls that same `createPendingSkillSelection` helper directly with a
    synthetic match id and a few eligible player ids, rather than
    hand-building the `PendingDevelopment` object, so it can't drift from the
    real shape.
- **Which rosters get the demo state**: pick the *first* built team (by seed
  catalog order) whose already-assigned `advancementMode` matches, i.e.
  `teams.find(t => t.advancementMode === "matched-play")` /
  `"sevens-skill-selection"` — this reads the mode directly off the team
  object rather than re-deriving it from `seedAdvancementMode`, so
  `playerLifecycle.ts` stays decoupled from `teamFixtures.ts`'s cycling
  logic and can't silently pick the wrong roster if that cycle ever changes.
  With the current cycle this resolves to Amazon (Matched Play) and
  Bretonian (Sevens Skill Selection).
- **Matched Play recipient still needs a legality-clean career line**: the
  existing seed validator (`validateSeeds.ts`'s `validatePlayerProgression`)
  treats any player with a stored advancement but no `careerStats` as
  invalid — it predates mode-specific advancement sources and only knows the
  SPP-reconciliation shape. Rather than special-case the validator for this
  one demo player, the decorated recipient gets a zero-SPP `careerStats` line
  via the existing `careerStatsFor(0, matches)` helper (a player who played
  matches but earned no SPP-worthy stat lines — true for Matched Play, which
  never earns SPP), satisfying the existing reconciliation checks unchanged.

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
