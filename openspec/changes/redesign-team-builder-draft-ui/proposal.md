## Why

Two team-builder draft issues: (1) the advancement mode selector is a plain native `<select>` (`AdvancementModePanel.tsx`'s `ModeSelector`) sitting next to a row of hand-styled team-colour swatch buttons in `TeamBuilder.tsx`, so it visually clashes with the rest of the page; (2) `teamPricing.ts`'s own header comment states the Sevens intent — "draft teams pay roster price for everything; active teams pay double roster price for re-rolls" — but the code does the opposite: `priceOf("reroll")` only doubles when `active` is true, charging the plain roster price during draft, and `teamEditLegality.ts`'s `canEdit()` has no case for `"buy-reroll"` so it falls through to `ALLOWED`, letting an active (post-draft) team buy rerolls at all. In Sevens, rerolls cost double at draft time and simply cannot be bought afterward.

## What Changes

- The advancement-mode selector SHALL be restyled as a row of styled option buttons (matching the active/selected treatment already used for the team-colour swatches in `TeamBuilder.tsx`), placed directly under the Team Colours section, replacing the native `<select>`.
- **BREAKING (team economy):** Reroll price during the draft SHALL be double the roster's base reroll cost (matching every other Sevens draft price), not the roster's plain reroll cost.
- **BREAKING (team economy):** Buying a reroll after the draft (an "active" team) SHALL be refused outright — rerolls SHALL NOT be purchasable post-draft in Sevens, regardless of price.

## Capabilities

### Modified Capabilities
- `team-lifecycle-modes`: today's spec (`Draft teams are editable`, `Active purchasing rules are enforced`) has the reroll-cost rule backwards — it documents draft rerolls at roster price and active rerolls at double, purchasable. It SHALL instead require draft rerolls at double roster price and refuse reroll purchases outright once a team is active.

Note: the advancement-mode selector's restyle (native `<select>` → a styled option-button row matching the team-colour swatches) is a presentation-only change with no requirement-level behavior change to `team-advancement-modes`, so it needs no delta spec.

## Impact

- `src/ui/components/TeamBuilder/AdvancementModePanel.tsx` (`ModeSelector`, `MODE_LABELS`).
- `src/ui/components/pages/TeamBuilder.tsx` (team-colour swatch styling reused for the mode row; consumes `priceOf`/`canEdit` for reroll display and purchase, lines ~210, 216, 541, 553).
- `src/game/rules/teamPricing.ts` (`priceOf("reroll")`, `rerollRosterCost`).
- `src/game/rules/teamEditLegality.ts` (`canEdit`, add a `"buy-reroll"` case refusing it for active teams, mirroring the existing `buy-dedicated-fans` refusal).
- `src/data/RosterTemplates.ts` — reference only, no change (base `rerollCost` values are unaffected; only how draft pricing uses them changes).
