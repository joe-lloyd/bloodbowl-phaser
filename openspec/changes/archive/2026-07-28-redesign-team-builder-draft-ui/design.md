## Context

`TeamBuilder.tsx` renders the Team Colours field as an uppercase label (`text-[#1d3860] font-bold text-xs uppercase`) over a bordered white box (`flex gap-2 flex-wrap bg-white p-2 border-2 border-[#1d3860]`) containing round swatch `<button>`s with a gold-border/scale "selected" state. Immediately after it (line 524), `<AdvancementModePanel>` renders its own section with a native `<select>` styled independently (`bg-white border-2 border-bb-dark-gold rounded-lg px-4 py-3`). The two controls sit back to back but look like they belong to different design systems.

Separately, `teamPricing.ts`'s own doc comment states Sevens rerolls should be roster price at draft and double at active — but `priceOf("reroll")` does the opposite, and `team-lifecycle-modes/spec.md` (`Draft teams are editable`, `Active purchasing rules are enforced`) codifies that same backwards rule as intended behavior, including a scenario asserting "active team buys a re-roll... twice the roster price." `teamEditLegality.ts` already declares a `"buy-reroll"` `TeamOperation` variant but `canEdit`'s switch has no case for it, so it falls through to `default: ALLOWED` — active teams can currently buy rerolls at all, which Sevens forbids.

## Goals / Non-Goals

**Goals:**
- Make the advancement-mode control visually consistent with the rest of the draft form using patterns already in the file (no new design system).
- Correct the reroll price/legality inversion so draft = double, active = refused, matching the header-comment intent and Sevens rules.

**Non-Goals:**
- Changing which advancement modes exist or how mode-specific skill packages work.
- Any other pricing rule (apothecary, coaches, cheerleaders, dedicated fans) — unaffected.

## Decisions

- **Render the mode row as buttons in `TeamBuilder.tsx`, not inside `AdvancementModePanel.tsx`'s own bordered section**, mirroring the Team Colours field exactly (uppercase label + `bg-white p-2 border-2 border-[#1d3860]` container), then pass the chosen mode into `AdvancementModePanel` (or keep `AdvancementModePanel` owning state but expose `ModeSelector` for `TeamBuilder` to place). Simplest: move `ModeSelector`'s rendering call site into `TeamBuilder.tsx`'s Team Colours block and keep `AdvancementModePanel` for the mode-specific package UI below it (Primary/Secondary skill allocation), unchanged.
- **`priceOf("reroll")` inverts its ternary**: `active ? rosterCost : rosterCost * 2`, and returns `null`/reason for `active` (see next point) so the display never claims a purchasable double price for an active team.
- **`canEdit` gains a `"buy-reroll"` case refusing it for active teams**, exactly like the existing `"buy-dedicated-fans"` case, so Team Management's reroll purchase button (which already goes through `canEdit`) disables/refuses consistently with the price service.

## Risks / Trade-offs

- [An existing saved active team that already bought a reroll post-draft under the old (wrong) rule] → no migration needed; this only gates future purchases, it does not retroactively remove a reroll a team already owns.
- [`team-lifecycle-modes/spec.md`'s existing scenario names "twice the roster price" for the active case] → that scenario is being replaced by a "refused outright" scenario in the same delta; the old scenario text must be fully superseded, not left contradicting the new one.
