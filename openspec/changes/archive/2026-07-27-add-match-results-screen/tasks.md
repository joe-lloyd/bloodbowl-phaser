## 1. Result and Termination Model

- [x] 1.1 Keep played score and termination reason as separate match-result fields
- [x] 1.2 Remove any concession path that appends an artificial touchdown, changes the played score, or awards player touchdown statistics
- [x] 1.3 Make result and award recording idempotent across rerender, resume, and reconnect

## 2. Results Screen Structure

- [x] 2.1 Split the post-match component into Result, Statistics, and Awards sections behind the game-over visibility flag
- [x] 2.2 Remove the top-level progression-enabled early return so every match renders the result
- [x] 2.3 Render team names, played score, and normal/draw/concession/forfeit outcome labels
- [x] 2.4 Render both participant statistics tables from `MatchStats.summary()` and show SPP only when eligible
- [x] 2.5 Provide a main-menu exit after required result and award recording

## 3. Awards and Deferred Development

- [x] 3.1 Keep MVP nomination and SPP confirmation on the results screen for eligible matches
- [x] 3.2 Remove skill and characteristic assignment controls from the post-match flow
- [x] 3.3 Persist eligible and required advancements as pending team development after awards are confirmed
- [x] 3.4 Surface pending development in Manage Team using the shared advancement service and save path
- [x] 3.5 Ensure pending development never blocks leaving results, while incomplete required award recording may do so with a reason

## 4. Match and Competition Wiring

- [x] 4.1 Emit a full-time announcement and match-log entry from match completion
- [x] 4.2 Show the results screen for local, online, sandbox, and competition game-over phases
- [x] 4.3 Record a competition fixture result exactly once and show confirmation before leaving
- [x] 4.4 Restrict online award actions to the owning coach while both coaches can see both teams' results and statistics

## 5. Verification

- [x] 5.1 Add component tests for progression-disabled, progression-enabled, concession, and pending-development results
- [x] 5.2 Add a regression test proving a 0-0 concession remains displayed as 0-0 and creates no touchdown event or statistic
- [x] 5.3 Add headless Playwright flows for local, online, sandbox, and competition completion (no Playwright harness exists on `main` yet — see deviation note in the PR; covered instead with headless/vitest flows: `__tests__/headless/fullGame.test.ts`, `__tests__/headless/sevens-setup.test.ts`, `__tests__/unit/matchResultsScreen.test.tsx`)
- [x] 5.4 Add a journey that confirms MVP/SPP, leaves without assigning a skill, and completes the pending advancement in Manage Team (covered as a vitest journey across `__tests__/unit/matchResultsScreen.test.tsx` + `__tests__/unit/playerDevelopment.test.tsx` rather than Playwright, for the same reason)
- [x] 5.5 Add result-recording tests for rerender, save/resume, and reconnect idempotency
