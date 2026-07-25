## Context

`TurnManager` sets `phase = GAME_OVER` and notifies. `SceneOrchestrator.resolveMatchComplete` computes the result string, logs it, and emits a notification. `GameHUD` renders `<PostMatchProgression visible={phase === GAME_OVER} />`. `PostMatchProgression` then returns `null` on its very first guard when `!tracker?.progressionEnabled` — which is the default for local play, sandbox, and any lobby that did not opt in. The result: the whole post-match experience is invisible for the common case.

The data is all present. `MatchStatsTracker` accumulates per-player `completions`, `superbThrows`, `safeLandings`, `interceptions`, `casualties`, `touchdowns`, `mvps`, and `participated` throughout the match, and `summary(players)` already returns it. Only `sppEarned` is progression-conditional. `StatsTables` inside `PostMatchProgression` already renders exactly the table wanted — it is just unreachable.

## Goals / Non-Goals

**Goals:**
- Every completed match ends on a screen that states the result and shows what each player did.
- Progression is an additional section, never a gate.
- A competition fixture records its result before the coach leaves.
- Both coaches in an online match reach the screen.

**Non-Goals:**
- Changing SPP values, MVP mechanics, or advancement rules — `player-progression` owns those and is unchanged.
- Career/lifetime statistics across matches. This screen reports one match. Career stats belong with the team-lifecycle work.
- Redesigning `MatchStats` collection.

## Decisions

**1. Split the screen into Result → Statistics → Progression, and gate only the third.**
The component becomes three sections behind one visibility flag (`phase === GAME_OVER`). The `progressionEnabled` check moves from the component's top-level early return down to the progression section alone. This is the whole fix for the reported bug and is a deletion, not an addition — the strictly simpler structure that keeps every existing feature.

Alternative considered: a separate lightweight results screen for non-progression matches. Rejected — two components rendering the same score and the same stats tables is precisely the duplication that drifts.

**2. `MatchStats.summary()` is the single source for the tables, with `sppEarned` conditional.**
`summary()` already zeroes `sppEarned` when progression is off; the tables render the SPP column only when progression is enabled. No second stats path.

**3. Full time is announced through the announcer, not the console.**
`resolveMatchComplete` emits a full-time announcement and a log entry. The `console.log` stays as a developer aid but is no longer the only output. If `overhaul-match-announcements` has not landed, the existing notification path carries it — the two changes are independent.

**4. The exit route always exists, and competition reporting happens before it.**
The screen always offers "Leave match". For a fixture launched with a competition context, the result is recorded on entry to the screen (as `GamePage` already does on `GAME_OVER`) and the screen shows confirmation that it was recorded, so a coach can see the fixture is settled before navigating away. Alternative considered: recording on exit. Rejected — a coach who closes the tab would lose the result.

**5. Online: both coaches see the screen; each acts only on their own team.**
Visibility is driven by the phase, which both sides observe, so no new sync is needed. The existing `ownedTeams` filter already restricts progression actions to the local coach; the results and statistics sections show both teams to both coaches.

## Risks / Trade-offs

- **[Showing the screen where it previously never appeared may reveal latent errors in the stats tables]** → The tables are exercised by a headless test over a completed match before the gate is moved.
- **[A match ended by concession or forfeit may have partial stats]** → The screen renders whatever `summary()` returns and labels the outcome as a concession; players with `participated === false` are omitted as they are today.
- **[Sandbox and scenario matches will now show a results screen]** → Acceptable and arguably desirable; the screen states plainly that no SPP is awarded.
- **[Double-recording a competition result]** → `GamePage` already guards with `reportedRef`; the screen reads the recorded state rather than recording a second time.

## Migration Plan

Behavioral only, no persisted format change. Land in one pass: restructure the component into three sections, move the progression gate, wire the announcement, add the exit route. Existing progression-enabled matches see the same flow with a results header in front of it.

## Open Questions

- Should a drawn match in a knockout tournament fixture prompt for a decider on this screen, or be handled entirely in the competition view? Leaning competition view, to keep the results screen match-scoped.
