## Why

`AvailableHires.tsx` and `TeamRoster.tsx` on the Team Builder / draft page (`/build-team/:teamId`) list each player's skills only as a comma-joined name string (e.g. "Block, Dodge, Tackle"), with a native `title` attribute that repeats the same joined names rather than explaining any of them. A coach drafting a team who doesn't already have the rulebook memorized has no way to learn what a listed skill or trait actually does without leaving the page. `src/types/Skills.ts` already carries the full rulebook text for every skill via `SKILL_DEFINITIONS[type].text`, generated from `docs/rulebook/skills.json` — it just isn't surfaced in the draft UI.

## What Changes

- Add a small reusable `Tooltip` component to `src/ui/components/componentWarehouse/`, styled per `docs/design/blood-bowl-2025-style-guide.md`'s documented (but until now unimplemented) tooltip spec: dark parchment background, small serif text.
- In `AvailableHires.tsx` and `TeamRoster.tsx`, render each player/template's skills as individual name badges (instead of one joined string) and wrap each badge in the new `Tooltip`, showing that skill's full rulebook rule text (`SKILL_DEFINITIONS[type].text`) on hover.
- Remove the redundant joined-list `title` attribute these two tables currently set on the skills cell, now that each skill name carries its own real explanation on hover.

## Capabilities

### New Capabilities
- `team-builder-rule-tooltips`: Hovering a skill/trait name shown during team drafting (available hires and current roster) reveals that skill's full rulebook rule text.

### Modified Capabilities
(none — no existing spec documents the skills-list presentation being changed)

## Impact

- `src/ui/components/componentWarehouse/Tooltip.tsx` (new).
- `src/ui/components/TeamBuilder/AvailableHires.tsx` (Skills column rendering).
- `src/ui/components/TeamBuilder/TeamRoster.tsx` (Skills column rendering).
- `src/types/Skills.ts` — reference only, no change (`SKILL_DEFINITIONS` already exposes `.text`).
- New/updated component tests under `__tests__/unit/ui/`.
