# Tasks: implement-kickoff-event-table

## 1. The Sevens table

- [x] 1.1 Add a `KickoffEvent` enum with the eleven Sevens results and replace the string switch in `KickoffController.rollKickoffEvent()`; delete Perfect Defence, Blitz! and Throw a Rock
- [x] 1.2 Extend the `KickoffResult` event payload with the enum and a structured outcome describing what each team received
- [x] 1.3 Introduce a `Record<KickoffEvent, KickoffEventResolver>` resolver table, initially all no-ops that produce a described outcome
- [x] 1.4 Log the roll, the event name and its meaning through the match log rather than `console.log` in `KickoffPhaseHandler`

## 2. Drive- and turn-scoped effects

- [x] 2.1 Add a `DriveEffects` record to game state: free re-rolls per team, owed offensive assist (with its turn), per-player `maModifier`/`avModifier`/`confinedToReserves`
- [x] 2.2 Clear `DriveEffects` in the end-of-drive teardown alongside the pitch clear
- [x] 2.3 Have the re-roll count, the block assist calculation, and effective MA/AV read through `DriveEffects`
- [x] 2.4 Drop the owed offensive assist when its turn ends, used or not

## 3. Non-interactive events

- [x] 3.1 Get the Ref (2): grant each team one Bribe for the match; it is lost at full time
- [x] 3.2 Time-Out (3): move both turn markers back one on kicking-team turn 4-6, forward one otherwise, clamped to the half's bounds
- [x] 3.3 Cheering Fans (6): D6 + Cheerleaders per coach; winner (or both on a tie) gets an extra Offensive Assist on their next turn's first Block
- [x] 3.4 Brilliant Coaching (7): D6 + Assistant Coaches per coach; winner (or both on a tie) gets one free re-roll for the drive
- [x] 3.5 Changing Weather (8): re-roll the weather; on Perfect Conditions add Scatter (3) to the ball's in-air path
- [x] 3.6 Dodgy Snack (11): D6 per coach; lowest (or both on a tie) rolls for a random player on the pitch — 2+ is -1 MA/-1 AV for the drive, 1 places them in Reserves for the drive
- [x] 3.7 Pitch Invasion (12): D6 + Fan Factor per coach; lowest (or both on a tie) has a random player on the pitch placed prone and stunned

## 4. The pending event step

- [x] 4.1 Add a `KICKOFF_EVENT` pending step to the kickoff sequence carrying `{ event, owningTeam, selectionLimit }`, awaiting confirm or skip, modelled on the reroll-decision flow
- [x] 4.2 Resolve the step after launch while the ball is airborne and before it lands; High Kick additionally waits until the landing square is known
- [x] 4.3 Route the step through the host-native/guest-proxy path and add its actions to the `UI_INTENT_EVENTS` filter; the non-owning coach sees but cannot act
- [x] 4.4 HUD for the step: the event and its meaning, the D3+1 limit, player selection, confirm and skip

## 5. Interactive events

- [x] 5.1 High Kick (5): show the landing square; place one Open receiving player into it
- [x] 5.2 Quick Snap (9): D3+1 selection of Open receiving players, each moving exactly one square in any direction with no dodge, refusing occupied and off-pitch squares, not marking players as having acted
- [x] 5.3 Solid Defence (4): D3+1 direct on-pitch drags of Open kicking players to legal setup squares, never staging them in Reserves and spending the allowance only after a valid drop
- [x] 5.4 Charge! (10): D3+1 selection activated one at a time through the normal activation path with a free-action budget of one Move each plus one Blitz, one Throw Team-mate and one Kick Team-mate across the sequence
- [x] 5.5 Abort the Charge! sequence on the first selected player to fall over or be knocked down; players who acted are not marked as having acted for the coming turn

## 6. Verification

- [x] 6.1 Seeded headless scenario per event (eleven) asserting the resulting state, run through the deterministic dice service
- [x] 6.2 Headless scenarios for expiry: unused free re-roll, unused offensive assist, Dodgy Snack modifiers restored at the next drive
- [x] 6.3 Headless scenario for Charge! aborting on a knockdown mid-sequence
- [x] 6.4 Online test: a guest coach's Quick Snap selection is proxied to the host and both coaches see the same board
- [x] 6.5 Browser pass through a full drive for each interactive event; full test suite green
- [x] 6.6 Add a dedicated Kickoff Table sandbox topic with standard/late-half setups and curated deterministic seeds for all eleven outcomes
- [x] 6.7 Replace the ghost-ball rendering with a single-ball lifecycle: enlarged at the deviated square while airborne, then scaled back to normal only after the table fully resolves
- [x] 6.8 Hand the completed landing into normal catch/bounce/touchback resolution and cover the render/event order with regression tests
- [x] 6.9 Remove kickoff camera tracking/reset, render the airborne ball semi-transparent, restore full opacity on landing, and cover both behaviors with a regression test

## 7. Playtest feedback

- [x] 7.1 Replace the kickoff overlay's player buttons and bespoke action controls with pitch-native eligible-player highlighting, player clicks, board-square input, setup dragging, the existing context menu, and the existing action window; keep only event information, progress, confirm, and skip in the overlay
- [x] 7.2 Fix Solid Defence so each Open kicking player is redeployed in one direct on-pitch drag, without a separate selection pass or Reserve staging
- [x] 7.3 Fix High Kick so an Open receiving player can be selected directly on the pitch and placed beneath the indicated airborne-ball landing square
- [x] 7.4 Fix Quick Snap so eligible receiving players can be selected and moved one legal square through normal pitch interaction without consuming their coming-turn activation
- [x] 7.5 Fix Charge! so eligible kicking players are selected on the pitch and resolve sequential free actions through the existing action window/context menu, without starting or consuming the normal turn
- [x] 7.6 Gate ball landing and the receiving team's first turn until every interactive kickoff selection, placement, movement, or activation has completed or been skipped
- [x] 7.7 Make contested kickoff-event dice logs name each team beside the raw roll, modifier, total, winner/tie, and awarded effect; name affected players and preserve Get the Ref's working Bribe result
- [x] 7.8 Verify Dodgy Snack immediately applies and visibly reports the selected player's effective MA/AV penalty or move to Reserves, then expires it at drive end
- [x] 7.9 Route Pitch Invasion through the canonical Stunned state so the affected model is sideways with the standard orange border, and add render/state regression coverage
- [ ] 7.10 Add focused browser/headless/network regressions for all four interactive pitch-native flows and the corrected non-interactive feedback
- [x] 7.11 Move the informational kickoff-event popup into the bottom-right temporary-menu area without covering the pitch interaction
- [ ] 7.12 Take the Dodgy Snack -1 MA out of MA before Rushes: route every `moveAllowance`/`rushAllowance`/raw-`stats.MA` movement caller (`MovementValidator`, `GameplayInteractionController`, `PlayPhaseHandler`, `GameService`) through the drive-modified player view so an afflicted player moves MA-1 squares and keeps their full Rush allowance
- [ ] 7.13 Make the movement preview, remaining-squares readout, and Rush-square highlighting agree with the reduced MA so the first Rush square is at MA-1, not raw MA
- [ ] 7.14 Add a seeded scenario for an afflicted MA 6 player reaching 7 squares as 5 + 2 Rushes, plus a Sprint variant reaching 8 as 5 + 3 Rushes
