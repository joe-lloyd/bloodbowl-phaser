## Why

Finishing a match currently produces no dependable coach-facing result for ordinary
matches. The data for score and player statistics exists, but the summary is hidden when
progression is disabled. The enabled progression flow also asks coaches to assign
advancements immediately, while a concession can be presented as though an extra
touchdown was scored. Results should report what happened, record awards, and let the
coach manage development later.

## What Changes

- Full time always presents a results screen for local, online, sandbox, and competition
  matches.
- The screen shows both teams, the actual final score, outcome, and per-player match
  statistics whether or not progression is enabled.
- A concession or forfeit is labelled as such without adding an artificial touchdown,
  mutating the played score, or awarding touchdown statistics.
- Eligible matches complete MVP nomination and SPP confirmation on the results screen,
  but never assign skills or characteristics there.
- Pending advancements are saved and surfaced in Manage Team for the coach to resolve in
  their own time.
- The screen always offers a route out after required result/award recording, and
  competition results are recorded exactly once before leaving.
- Full time is announced on screen and written to the match log.

## Capabilities

### New Capabilities

- `match-results-screen`: every completed match presents the actual result, player
  statistics, award confirmation where eligible, and a safe route onward.

### Modified Capabilities

- `post-match-summary`: progression eligibility controls MVP/SPP awards, while skill and
  characteristic advancement is deferred to Manage Team.

## Impact

- Match completion and announcements in `SceneOrchestrator`, `TurnManager`, and match
  result modelling.
- `PostMatchProgression`, `GameHUD`, and the extraction or removal of direct advancement
  controls from the results flow.
- Match statistics, MVP/SPP confirmation, pending team development, and team management.
- Competition result recording and online owner gating.
- Headless and Playwright coverage for normal, disabled-progression, concession, online,
  and competition match completion.
