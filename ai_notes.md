- [x] FIXED (2026-07-14): found a bug where when a failed action causes a turnover and then the ball rolls into another failed action it makes the other team instanmtly suffer a turnover as well even if its the same team, to be clear we need to mark that a turnover has happened resolve everything else until the ball is at rest and then begin the other teams turn so that mulltiple turnovers from one action is not a thing that can happen.
      — Root cause: every `triggerTurnover` scheduled its own `endTurn`. Fix: turnover latch in `TurnManager.checkTurnover` (secondary failures absorbed) + turn ends only after `GameFlowManager.whenIdle()` (ball at rest). Regression tests in `__tests__/headless/turnover.test.ts`.
- [x] FIXED (2026-07-14): when moving a plyer we get the little best path line, but when hovering a square that is further than a nice path the path still refulese to go through takle zones, we need to allow the path to always be shown as far as the player can sprint
      — Root cause: A*'s tackle-zone penalty pushed routes into detours that blew the MA+2 step budget, so no path came back at all. Fix: safe pass first, then a direct steps-first fallback in `MovementValidator.findPath`. Tests added.
- [x] FIXED (2026-07-14, verify in browser): when a player has picked up the ball it should travel with his/her model and not just instantly telport to the end square
      — Ball now tweens along the same path in lockstep with the carrier (`GameScene.animateBallAlong`, triggered from `PlayPhaseHandler.handlePlayerMove`). Known minor: on a pickup mid-path the ball visually joins from the mover's origin rather than the pickup square.
- [x] FIXED (2026-07-14): when a player trys to pick up the ball on square 3 but is moving all the way to square 5 and they fail to pick up the ball the rest of the movement should stop because a turnover means that the player does not get to finish the rest of their movement.
      — The engine already truncated the move; the double-turnover bug above made it look like play continued. Now covered by a test asserting the mover stops on the ball square.
- [x] FIXED (2026-07-14, verify in browser): the active team should have all their players highlighted on the boarder of the square, lets make it like this
    - selected square is like now but double the thickness of the square 
    - stunned players have a orange boarder
    - down players have a yellow boarder
    - and we still use the opacity to show which players have gone or not 
      — `PlayerSprite` gained a status-colored square border (white standing / yellow prone / orange stunned) toggled per team on `TurnStarted`; selection ring thickness doubled (3→6); activated-opacity untouched.
- [ ] we need to implement the push rules for pushing tinto the crowed & for pushing into other players, the chain push rules
- [ ] the coin toll result should also appear in the dice log, technically a coin is a d2
- [ ] when setting up the team on the board i should be able to change them around until i confirm setup, for example i can press a premade setup and then i can drag them around, right now after they are placed they are locked into place
- [ ] wghen dragging players onto thew pitch the drag area is off center, the 0,0 of the dugoiut appears to be the center of the draggable areathey should just be one to one with the grid
- [ ] when kicking or reciving the dugout should be on the side you playing for example if you are on the left side of the pitch the purple side of the dugout should be on the left, if you are on the right side we should flip it found and put the purple on the right 
- [ ] the active teams white boparder is a little too much can we make it a bit more subtle
- [ ] touchdowns still dont get scored when the ball reaches the endzone and is in position of a player on the oposing side to the touchdown side, make sure we do a touch down and then go back and setup again for the next round 