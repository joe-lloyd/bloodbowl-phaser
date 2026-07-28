## 1. Seed data: explicit advancement modes

- [x] 1.1 In `src/seeding/teamFixtures.ts`, add a deterministic
      `seedAdvancementMode(rosterName)` helper: cycles
      `["matched-play", "advanced-league", "sevens-skill-selection"]` by the
      roster's index in `Object.values(RosterName)`, except Human, Orc,
      Dwarf, and Skaven (the rosters `playerLifecycle.ts` decorates with real
      SPP/advancement history) always return `"advanced-league"`.
- [x] 1.2 In `buildSeedTeam`, pass the resolved mode into `createTeam(...)`
      and call `lockAdvancementMode(team)` right after, so every seed team
      loads with an explicit, locked mode.
- [x] 1.3 Update `__tests__/unit/seeding/teamFixtures.test.ts`: assert every
      built team has a non-empty `advancementMode` and
      `advancementModeLocked === true`; assert all three modes appear at
      least once across the catalog; assert Human/Orc/Dwarf/Skaven are
      `advanced-league`.
- [x] 1.4 Run `__tests__/integration/developmentSeed.test.ts` and
      `__tests__/unit/seeding/*.test.ts` to confirm no existing assertion
      (treasury, legality, idempotency, cleanup) regresses.

## 2. Team overview: advancement-mode pill

- [x] 2.1 In `src/ui/components/TeamBuilder/AdvancementModePanel.tsx`, add
      and export `ADVANCEMENT_MODE_SHORT_LABELS: Record<TeamAdvancementMode,
      string>` (e.g. "Matched Play", "Advanced League", "Skill Selection")
      next to the existing `MODE_LABELS`.
- [x] 2.2 In `src/ui/components/pages/TeamManagement.tsx`, render a pill for
      `team.advancementMode` beside the existing draft/active pill (same
      `rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wide` class
      pattern, a distinct color), showing nothing when the mode is unset
      (legacy/unmigrated teams).
- [x] 2.3 Add/extend a test in `__tests__/unit/ui/TeamManagement.test.tsx`
      covering: a team with an advancement mode shows its pill text; a team
      without one renders no advancement-mode pill.

## 3. Verify and wrap up

- [x] 3.1 Run the full test suite locally before committing.
- [x] 3.2 Confirm `NOTES_FOR_AI.md` is untouched (orchestrator owns it).

## 4. Fast-follow: real in-progress state for Matched Play / Skill Selection

- [x] 4.1 In `src/seeding/playerLifecycle.ts`, add a helper that, given a
      recipient player, allocates one Matched Play package skill via
      `allocateMatchedPlaySkill` (importing from
      `../game/progression/advancementModes`) and gives that player a
      zero-SPP `careerStats` line via the existing `careerStatsFor(0,
      matches)` so the seed validator's SPP-reconciliation check still
      passes for a non-SPP-sourced advancement.
- [x] 4.2 Add a helper that gives a team a pending Sevens Skill Selection
      award via the existing `createPendingSkillSelection` helper (same
      module import), with a synthetic match id and a few eligible
      participant ids.
- [x] 4.3 In `decorateSeedTeams`, after the existing `TEAM_DECORATIONS` loop,
      find the first built team with `advancementMode === "matched-play"`
      and apply the Matched Play helper to one of its players; find the
      first with `advancementMode === "sevens-skill-selection"` and apply
      the pending-award helper. Recompute `team.teamValue` for the
      Matched-Play team afterward.
- [x] 4.4 Extend `__tests__/unit/seeding/playerLifecycle.test.ts` (or
      `teamFixtures.test.ts`): assert the seeded Matched Play team has a
      player with a `matched-play-package` sourced advancement and
      unspent package allowance remaining; assert the seeded Sevens Skill
      Selection team has a `pendingDevelopment` entry of kind
      `"sevens-skill-selection"`.
- [x] 4.5 Run `__tests__/integration/developmentSeed.test.ts` (validator/
      idempotency/cleanup) plus the full suite to confirm no regression.
- [x] 4.6 Fix the `developmentSeed.test.ts` doc-drift in `proposal.md`
      (claimed new assertions there; that file was never touched) — corrected
      the Impact section to name the files actually touched
      (`teamFixtures.test.ts`, `playerLifecycle.test.ts`).
