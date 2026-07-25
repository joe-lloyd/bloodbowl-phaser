## 1. Result and Termination Model

- [ ] 1.1 Keep played score and termination reason as separate match-result fields
- [ ] 1.2 Remove any concession path that appends an artificial touchdown, changes the played score, or awards player touchdown statistics
- [ ] 1.3 Make result and award recording idempotent across rerender, resume, and reconnect

## 2. Results Screen Structure

- [ ] 2.1 Split the post-match component into Result, Statistics, and Awards sections behind the game-over visibility flag
- [ ] 2.2 Remove the top-level progression-enabled early return so every match renders the result
- [ ] 2.3 Render team names, played score, and normal/draw/concession/forfeit outcome labels
- [ ] 2.4 Render both participant statistics tables from `MatchStats.summary()` and show SPP only when eligible
- [ ] 2.5 Provide a main-menu exit after required result and award recording

## 3. Awards and Deferred Development

- [ ] 3.1 Keep MVP nomination and SPP confirmation on the results screen for eligible matches
- [ ] 3.2 Remove skill and characteristic assignment controls from the post-match flow
- [ ] 3.3 Persist eligible and required advancements as pending team development after awards are confirmed
- [ ] 3.4 Surface pending development in Manage Team using the shared advancement service and save path
- [ ] 3.5 Ensure pending development never blocks leaving results, while incomplete required award recording may do so with a reason

## 4. Match and Competition Wiring

- [ ] 4.1 Emit a full-time announcement and match-log entry from match completion
- [ ] 4.2 Show the results screen for local, online, sandbox, and competition game-over phases
- [ ] 4.3 Record a competition fixture result exactly once and show confirmation before leaving
- [ ] 4.4 Restrict online award actions to the owning coach while both coaches can see both teams' results and statistics

## 5. Verification

- [ ] 5.1 Add component tests for progression-disabled, progression-enabled, concession, and pending-development results
- [ ] 5.2 Add a regression test proving a 0-0 concession remains displayed as 0-0 and creates no touchdown event or statistic
- [ ] 5.3 Add headless Playwright flows for local, online, sandbox, and competition completion
- [ ] 5.4 Add a journey that confirms MVP/SPP, leaves without assigning a skill, and completes the pending advancement in Manage Team
- [ ] 5.5 Add result-recording tests for rerender, save/resume, and reconnect idempotency
