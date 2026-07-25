# Tasks: implement-kickoff-event-table

## 1. The Sevens table

- [ ] 1.1 Add a `KickoffEvent` enum with the eleven Sevens results and replace the string switch in `KickoffController.rollKickoffEvent()`; delete Perfect Defence, Blitz! and Throw a Rock
- [ ] 1.2 Extend the `KickoffResult` event payload with the enum and a structured outcome describing what each team received
- [ ] 1.3 Introduce a `Record<KickoffEvent, KickoffEventResolver>` resolver table, initially all no-ops that produce a described outcome
- [ ] 1.4 Log the roll, the event name and its meaning through the match log rather than `console.log` in `KickoffPhaseHandler`

## 2. Drive- and turn-scoped effects

- [ ] 2.1 Add a `DriveEffects` record to game state: free re-rolls per team, owed offensive assist (with its turn), per-player `maModifier`/`avModifier`/`confinedToReserves`
- [ ] 2.2 Clear `DriveEffects` in the end-of-drive teardown alongside the pitch clear
- [ ] 2.3 Have the re-roll count, the block assist calculation, and effective MA/AV read through `DriveEffects`
- [ ] 2.4 Drop the owed offensive assist when its turn ends, used or not

## 3. Non-interactive events

- [ ] 3.1 Get the Ref (2): grant each team one Bribe for the match; it is lost at full time
- [ ] 3.2 Time-Out (3): move both turn markers back one on kicking-team turn 4-6, forward one otherwise, clamped to the half's bounds
- [ ] 3.3 Cheering Fans (6): D6 + Cheerleaders per coach; winner (or both on a tie) gets an extra Offensive Assist on their next turn's first Block
- [ ] 3.4 Brilliant Coaching (7): D6 + Assistant Coaches per coach; winner (or both on a tie) gets one free re-roll for the drive
- [ ] 3.5 Changing Weather (8): re-roll the weather; on Perfect Conditions add Scatter (3) to the ball's in-air path
- [ ] 3.6 Dodgy Snack (11): D6 per coach; lowest (or both on a tie) rolls for a random player on the pitch — 2+ is -1 MA/-1 AV for the drive, 1 places them in Reserves for the drive
- [ ] 3.7 Pitch Invasion (12): D6 + Fan Factor per coach; lowest (or both on a tie) has a random player on the pitch placed prone and stunned

## 4. The pending event step

- [ ] 4.1 Add a `KICKOFF_EVENT` pending step to the kickoff sequence carrying `{ event, owningTeam, selectionLimit }`, awaiting confirm or skip, modelled on the reroll-decision flow
- [ ] 4.2 Resolve the step at the correct point relative to the kick (before the kick, except High Kick which is after the landing square is known)
- [ ] 4.3 Route the step through the host-native/guest-proxy path and add its actions to the `UI_INTENT_EVENTS` filter; the non-owning coach sees but cannot act
- [ ] 4.4 HUD for the step: the event and its meaning, the D3+1 limit, player selection, confirm and skip

## 5. Interactive events

- [ ] 5.1 High Kick (5): show the landing square; place one Open receiving player into it
- [ ] 5.2 Quick Snap (9): D3+1 selection of Open receiving players, each moving exactly one square in any direction with no dodge, refusing occupied and off-pitch squares, not marking players as having acted
- [ ] 5.3 Solid Defence (4): D3+1 selection of Open kicking players, removed from the pitch and re-placed through the existing setup validation
- [ ] 5.4 Charge! (10): D3+1 selection activated one at a time through the normal activation path with a free-action budget of one Move each plus one Blitz, one Throw Team-mate and one Kick Team-mate across the sequence
- [ ] 5.5 Abort the Charge! sequence on the first selected player to fall over or be knocked down; players who acted are not marked as having acted for the coming turn

## 6. Verification

- [ ] 6.1 Seeded headless scenario per event (eleven) asserting the resulting state, run through the deterministic dice service
- [ ] 6.2 Headless scenarios for expiry: unused free re-roll, unused offensive assist, Dodgy Snack modifiers restored at the next drive
- [ ] 6.3 Headless scenario for Charge! aborting on a knockdown mid-sequence
- [ ] 6.4 Online test: a guest coach's Quick Snap selection is proxied to the host and both coaches see the same board
- [ ] 6.5 Browser pass through a full drive for each interactive event; full test suite green
