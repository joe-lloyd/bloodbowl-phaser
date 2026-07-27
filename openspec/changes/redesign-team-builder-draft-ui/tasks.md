## 1. Advancement mode styling

- [ ] 1.1 In `AdvancementModePanel.tsx`, export `ModeSelector` (or lift it) so `TeamBuilder.tsx` can render it directly under the Team Colours block
- [ ] 1.2 Replace `ModeSelector`'s native `<select>` with a row of styled buttons (one per `TeamAdvancementMode`), reusing the Team Colours container treatment from `TeamBuilder.tsx` (`text-[#1d3860] font-bold text-xs uppercase` label over `flex gap-2 flex-wrap bg-white p-2 border-2 border-[#1d3860]`) and the selected/unselected button states used for the colour swatches
- [ ] 1.3 Preserve existing behavior: locked/immutable state once finalized or competition-entered, and the "choose a mode before saving" warning
- [ ] 1.4 Keep `AdvancementModePanel`'s mode-specific package UI (Primary/Secondary skill allocation) unchanged below the relocated selector

## 2. Reroll pricing fix

- [ ] 2.1 In `teamPricing.ts`, fix `priceOf("reroll")`: draft (`!active`) returns `rosterCost * 2`; active returns `{ amount: null, reason: "Active teams cannot purchase re-rolls." }`
- [ ] 2.2 In `teamEditLegality.ts`, add a `case "buy-reroll"` to `canEdit` refusing it for active teams, mirroring `"buy-dedicated-fans"`
- [ ] 2.3 Update the doc comments in both files to state the corrected rule (draft = double roster price; active = not purchasable)
- [ ] 2.4 Verify `TeamBuilder.tsx` and Team Management's reroll purchase UI read `priceOf`/`canEdit` (not a hardcoded price) so both surfaces pick up the fix automatically

## 3. Verification

- [ ] 3.1 Add/update a unit test for `priceOf(team, {type:"reroll"})` covering draft (double) and active (`null` + reason)
- [ ] 3.2 Add/update a unit test for `canEdit(team, {type:"buy-reroll"})` covering draft (allowed) and active (refused)
- [ ] 3.3 Manually verify in the browser: draft team reroll price shows double the roster's base cost; an active team's reroll purchase control is disabled/refused
- [ ] 3.4 Manually verify the advancement-mode selector renders as a styled button row matching Team Colours, keeps working for all three modes, and still locks once finalized
- [ ] 3.5 Run the full unit test suite and confirm no regressions
