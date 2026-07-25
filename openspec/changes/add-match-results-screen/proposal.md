## Why

Finishing a match produces nothing a coach can see. The only output is a console line — `[Orchestrator] Match complete. Full time — Shambiling Undead Sample 1 : 1 Human Sample (draw)` — and a transient banner. There is no results screen, no match statistics, and no SPP screen. The post-match UI that exists is gated behind `progressionEnabled`, which is off by default, so an ordinary exhibition or local match shows nothing at all and the coach is left staring at a finished pitch with no way forward. Everything needed is already tracked: `MatchStats` records completions, casualties, touchdowns, and interceptions for every player throughout the match, and is simply never shown.

## What Changes

- **Full time always presents a results screen.** Reaching `GAME_OVER` SHALL present a results screen showing the final score, the winner or draw, and each team's match statistics — regardless of whether progression is enabled.
- **Match statistics are always shown.** Per-player completions, throw team-mate results, interceptions, casualties inflicted, and touchdowns SHALL be presented for both teams, drawn from the stats already tracked during the match.
- **SPP and advancement follow the results, they do not gate them.** When progression is enabled the results screen SHALL continue into MVP nomination, SPP confirmation, and player advancement. When progression is disabled it SHALL show the result and statistics and offer to leave, with a clear note that this match does not award SPP.
- **There is always a way out.** The results screen SHALL offer a route back to the main menu, and — for a competition fixture — SHALL report the result to the competition before leaving.
- **The match-complete announcement is a real announcement.** Full time SHALL be announced on screen and recorded in the match log rather than only written to the console.

## Capabilities

### New Capabilities
- `match-results-screen`: full time presents the score, outcome, and per-player match statistics for both teams, with a route onward, in every match type.

### Modified Capabilities
- `post-match-summary`: the summary is presented for every completed match; progression eligibility controls which sections are offered, not whether the screen appears.

## Impact

- Match end: `src/game/controllers/SceneOrchestrator.ts` (`resolveMatchComplete`), `src/game/managers/TurnManager.ts` (`GAME_OVER` transition).
- UI: `src/ui/components/hud/PostMatchProgression.tsx` (the `progressionEnabled` early return, the stats tables), `src/ui/components/hud/GameHUD.tsx` (visibility), a new results section preceding the progression flow.
- Stats: `src/game/progression/MatchStats.ts` (`summary()` usable without progression), `src/services/ServiceContainer.ts`.
- Competition: `src/ui/pages/GamePage.tsx` result reporting, `src/competition/resultRecording.ts`.
- Online: `src/network/OnlineMatch.ts` — both coaches must reach the results screen, and only the owning coach may act on their own team's progression.
- Depends on `phase-announcer` from `overhaul-match-announcements` for the full-time announcement; degrades to the existing banner if that change lands later.
