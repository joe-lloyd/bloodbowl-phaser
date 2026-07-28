## Why

Seed teams (`src/seeding/teamFixtures.ts`) are built through `createTeam` without ever choosing an advancement mode, so every generated "Founders" team loads with `advancementMode` unset — a coach opening one in Team Builder is immediately blocked by "Choose a mode before saving this team," and there is no seeded team that exercises Matched Play or Sevens Skill Selection at all. Separately, while `src/seeding/playerLifecycle.ts` already grants some seed players spendable SPP, those players sit on teams with no explicit advancement mode, so the SPP-spending flow (`PlayerPage.tsx`'s `canAdvance` path) can't be reached from a clean seed refresh without first manually picking a mode. Finally, the Team Management overview card shows a draft/active status pill but nothing about which advancement mode a team uses, so a coach can't tell modes apart at a glance.

## What Changes

- Every seed team built by `buildSeedTeam` SHALL be created with an explicit, locked `advancementMode` — no seeded team loads with an unset mode.
- Seed rosters SHALL be distributed across all three advancement modes (Matched Play, Advanced League, Sevens Skill Selection) so each mode's UI and rules are reachable from a seed refresh, with the Human/Orc/Dwarf/Skaven "Founders" teams (which already carry real SPP/advancement history via `decorateSeedTeams`) pinned to Advanced League — the only mode that legitimately earns spendable SPP.
- The Team Management overview card SHALL show an advancement-mode pill next to the existing draft/active status pill, reusing that pill's visual pattern (rounded, `px-2 py-0.5`, `text-xs font-bold uppercase tracking-wide`).
- Add a short-label lookup for the three advancement modes for use in the new pill (existing `MODE_LABELS` in `AdvancementModePanel.tsx` is verbose, meant for the mode-selector buttons, not a compact badge).

## Capabilities

### Modified Capabilities
- `development-seed-data`: seed teams currently have no advancement-mode invariant; this adds the requirement that every seeded team carries an explicit, locked mode and that the catalog covers all three modes.
- `team-advancement-modes`: adds a requirement that a team's advancement mode is visible in the Team Management overview, matching the existing draft/active visibility requirement in `team-lifecycle-modes`.

## Impact

- `src/seeding/teamFixtures.ts` (`buildSeedTeam`) — assign and lock an advancement mode per roster.
- `src/ui/components/TeamBuilder/AdvancementModePanel.tsx` — add a short-label export for the new pill.
- `src/ui/components/pages/TeamManagement.tsx` — render the new pill beside the draft/active pill.
- Existing seed tests (`__tests__/unit/seeding/teamFixtures.test.ts`, `__tests__/integration/developmentSeed.test.ts`) gain new assertions; no breaking change to their existing assertions.
