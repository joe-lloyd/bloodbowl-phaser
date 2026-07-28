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
