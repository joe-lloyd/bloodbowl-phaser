## 1. Foul-caused KO/Casualty

- [ ] 1.1 In `FoulOperation.ts`, replace the inline `case InjuryResult.KO` branch with a call to `movePlayerToBox(target, { box: "ko" }, eventBus)` (matching `InjuryOperation.ts`)
- [ ] 1.2 Replace the inline `case InjuryResult.CASUALTY` branch with the same casualty-application path `InjuryOperation.ts`/`CasualtyOperation` uses, preserving the existing `PlayerCasualtyInflicted` emission
- [ ] 1.3 Confirm `PlayerStatusChanged` is emitted for both paths (via the seam) so `PlayPhaseHandler` reconciles the sprite off the pitch

## 2. Send-Off cleanup

- [ ] 2.1 In `SendOffOperation.ts`, add `movePlayerToBox(player, { box: "sent-off" }, eventBus)` alongside the existing notification, matching `EndDriveOperations.ts:107`'s pattern
- [ ] 2.2 Add a sent-off section to `Dugout.ts`, rendered from the same status-driven `playerBoxOf`/`resolvePlayerLocation` logic as the existing Reserves/Dead-and-Injured sections, with a red-card (or equivalent) icon
- [ ] 2.3 Verify a sent-off player is excluded from that team's on-pitch player count for the remainder of the match

## 3. Highlight timing

- [ ] 3.1 In `GameplayInteractionController.ts`'s foul call site, await `GameFlowManager.whenIdle()` before calling `deselectPlayer()`, instead of clearing immediately after the fire-and-forget `foulPlayer()` call
- [ ] 3.2 Verify the red target highlight remains visible while the foul's dice/injury/send-off resolution is still playing out, and clears once it's done

## 4. Verification

- [ ] 4.1 Add a headless test: a Foul resulting in KO removes the target from the pitch into the KO box and emits `PlayerStatusChanged`
- [ ] 4.2 Add a headless test: a Foul resulting in Casualty removes the target into dead-and-injured
- [ ] 4.3 Add a headless test: a Foul resulting in Send-Off removes the fouling player from the pitch into the sent-off box
- [ ] 4.4 Add a browser/unit test verifying the dugout renders the sent-off marker for an ejected player
- [ ] 4.5 Add a test verifying the foul highlight clears only after resolution completes, not immediately on declaration
- [ ] 4.6 Run the full unit/headless test suite and confirm no regressions
