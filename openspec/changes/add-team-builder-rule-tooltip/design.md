## Context

`AvailableHires.tsx` (roster templates) and `TeamRoster.tsx` (drafted players) both render a Skills column as `player.skills.map((s) => s.type).join(", ")` inside a `<TableCell title={...same joined string...}>`. Neither component gives a coach any way to see what a skill actually does.

`src/types/Skills.ts` exports `SKILL_DEFINITIONS: Record<SkillType, SkillDefinition>`, generated at load time from `docs/rulebook/skills.json`. Every entry has `.text` (the full rulebook rules text) and `.description` (first sentence only). This is already imported wherever skill data is needed and requires no new data plumbing.

No reusable tooltip/popover component exists anywhere in `src/ui/components/componentWarehouse/` (confirmed by search — only native `title` attributes and ad hoc `group-hover`/`onMouseEnter` CSS effects are used elsewhere in the UI). `docs/design/blood-bowl-2025-style-guide.md` documents an intended tooltip style ("Dark parchment, Small serif text") that has never been built.

## Goals / Non-Goals

**Goals:**
- A coach can hover any skill/trait name shown while drafting and read its full rule text without leaving the page.
- Introduce exactly one reusable tooltip primitive, styled per the style guide, so future features don't reinvent it.

**Non-Goals:**
- Touching player-development/advancement UI (`PlayerPage.tsx`, `PendingDevelopmentPanel.tsx`) or any other skill-listing surface outside the draft page's two tables — out of scope for this change.
- Keyboard/focus-accessible tooltip semantics (ARIA `describedby`, focus-trigger) — CSS hover only, matching the fidelity of the `title`-attribute pattern it replaces. Can be revisited later if needed.
- A generic positioning/collision engine (e.g. floating-ui) — the skills columns are inside bounded table cells, so a fixed-offset CSS tooltip is sufficient.

## Decisions

- **Build a small `Tooltip` component using CSS `group`/`group-hover`, not a new dependency.** The codebase already uses this exact Tailwind pattern (`TeamManagement.tsx`'s player rail: `className="... group"` + `group-hover:scale-110`). No tooltip library is installed (`package.json` has no radix/floating-ui/react-tooltip), and pulling one in for a single-purpose hover popover would be disproportionate. Alternative considered: native `title` attribute only — rejected, because it's what's already there and is exactly the "coach has to already know the rule" problem being fixed (no rich text, slow OS-controlled delay, truncates, unstyled).
- **`Tooltip` wraps a trigger element and renders `{children}` plus an absolutely-positioned panel, shown via `opacity-0 group-hover:opacity-100` + `pointer-events-none`.** Panel styled dark-parchment-on-serif per the style guide: dark brown/black background, warm parchment text, small serif (`font-body`) type, rounded border. Lives in `componentWarehouse/Tooltip.tsx` so any future feature (e.g., a future PlayerPage skill list) can reuse it without rebuilding.
- **Each skill renders as its own small badge, not a joined string.** `AvailableHires.tsx` and `TeamRoster.tsx` switch their Skills `<TableCell>` from one `.join(", ")` text node to a `flex flex-wrap gap-1` list of `<Tooltip content={SKILL_DEFINITIONS[skill.type].text}><span>{skill.type}</span></Tooltip>` badges. The redundant cell-level `title` (same joined names) is dropped since each badge now carries its own real explanation.
- **Tooltip content is the full `.text`, not `.description`.** `.description` is a truncated first-sentence summary already used elsewhere for compact contexts; a coach asking "what does this do" wants the actual rule, not a fragment. Parameterized skills (e.g. Loner "4+") show their `parameter` alongside the name so the badge itself stays unambiguous even though the tooltip text is the family's generic rule text.

## Risks / Trade-offs

- [CSS-hover-only tooltip is unreachable via keyboard/touch] → matches the existing `title`-attribute fidelity this replaces; no regression versus current behavior, and out-of-scope per Non-Goals.
- [Splitting one joined string into N badges could visually crowd narrow table cells] → cells already use `flex-wrap`-friendly small text; badges use compact padding and wrap, and existing tests assert no miniature (`text-[10px]`/`text-[9px]`) font sizes, which the new badges must respect.
