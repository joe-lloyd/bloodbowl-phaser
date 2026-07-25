## 1. Restructure the post-match component

- [ ] 1.1 Split `PostMatchProgression` into three sections — Result, Statistics, Progression — behind the single `visible` flag
- [ ] 1.2 Move the `progressionEnabled` check off the top-level early return and onto the Progression section only
- [ ] 1.3 Keep the component rendering when a tracker exists but progression is off, and when teams are resolvable from live game state
- [ ] 1.4 Resolve the participating teams without depending on the stats tracker's team ids alone, so the screen works even when no stats were recorded

## 2. Result section

- [ ] 2.1 Render both team names, the final score, and the outcome (win / draw / concession)
- [ ] 2.2 Show a clear note when the match awards no SPP
- [ ] 2.3 Always render a "Leave match" route back to the main menu, disabled only while a required advancement is outstanding, with the reason shown

## 3. Statistics section

- [ ] 3.1 Render `StatsTables` for both teams from `MatchStats.summary()`
- [ ] 3.2 Show the SPP column only when progression is enabled
- [ ] 3.3 Confirm `summary()` returns complete participation, completions, interceptions, casualties, and touchdowns when progression is disabled
- [ ] 3.4 Omit players who did not participate

## 4. Match end wiring

- [ ] 4.1 Emit a full-time announcement and a match-log entry from `SceneOrchestrator.resolveMatchComplete`, keeping the console line as a developer aid
- [ ] 4.2 Confirm `GameHUD` shows the screen on `GAME_OVER` for local, online, sandbox, and competition matches
- [ ] 4.3 Confirm both coaches in an online match reach the screen and that progression actions stay restricted to each coach's own team

## 5. Competition reporting

- [ ] 5.1 Confirm the fixture result is recorded once on reaching `GAME_OVER`, guarded by the existing reported flag
- [ ] 5.2 Show confirmation on the results screen that the fixture result was recorded
- [ ] 5.3 Verify the competition view reflects the recorded result after leaving the match

## 6. Verification

- [ ] 6.1 Add a headless test that plays a match to full time with progression disabled and asserts a complete stats summary is produced
- [ ] 6.2 Add a component test asserting the screen renders with progression disabled and hides only the progression controls
- [ ] 6.3 Play a full local match to full time and confirm result, statistics, and exit
- [ ] 6.4 Play a full progression-enabled match and confirm MVP, SPP, and advancement still work after the results section
- [ ] 6.5 Play a competition fixture to full time and confirm the result is recorded and confirmed
- [ ] 6.6 Mark the item fixed in `ai_notes.md` with a dated note
