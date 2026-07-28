## 1. Tooltip component

- [x] 1.1 Create `src/ui/components/componentWarehouse/Tooltip.tsx`: a `group`/`group-hover` CSS tooltip wrapping a trigger, with a dark-parchment/small-serif panel per `docs/design/blood-bowl-2025-style-guide.md`.

## 2. Wire skills to the tooltip

- [x] 2.1 In `AvailableHires.tsx`, replace the joined-string Skills cell with a `flex flex-wrap` list of per-skill badges, each wrapped in `Tooltip` showing `SKILL_DEFINITIONS[skill.type].text`; drop the cell's redundant joined-list `title`.
- [x] 2.2 In `TeamRoster.tsx`, apply the same per-skill badge + `Tooltip` treatment to its Skills cell; drop the redundant `title`.
- [x] 2.3 Verify no cell introduces a miniature (`text-[10px]`/`text-[9px]`) font size, consistent with the existing readability requirement asserted in `TeamRoster.test.tsx`.

## 3. Tests

- [x] 3.1 Add/extend component tests under `__tests__/unit/ui/` (following the `createRoot`/`act` pattern in `TeamRoster.test.tsx` and `TeamBuilder.test.tsx`) asserting each skill renders as its own hoverable element carrying that skill's rule text, for both `AvailableHires` and `TeamRoster`.

## 4. Keyboard accessibility (review follow-up)

- [x] 4.1 Make `Tooltip`'s trigger keyboard-focusable (`tabIndex={0}`) and reveal the panel on focus (`group-focus`/`group-focus-within`) as well as hover; add `aria-describedby` linking the trigger to the `role="tooltip"` panel.
- [x] 4.2 Move the separating comma between skill badges outside each `Tooltip` so hovering/focusing the punctuation doesn't also trigger the neighboring skill's tooltip.
- [x] 4.3 Center the tooltip panel under its trigger instead of left-aligning it, to reduce edge-clipping inside the table's `overflow-x-auto` wrapper.
- [x] 4.4 Add a test asserting keyboard focus (not just mouse hover) reveals a skill's tooltip.

## 5. Verification

- [x] 5.1 Run the affected unit tests and confirm they pass.
