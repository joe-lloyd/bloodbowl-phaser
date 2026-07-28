## Why

The Dice Log colors dice rolls by pass/fail (green/red/orange) with no idea who's watching, and durable log entries (weather, kickoff, score, skill, info) get no result coloring at all — only a team-identity border. In online play a player can't tell at a glance whether a colored roll favored them or their opponent; in solo/hotseat play there's no "my team" to key off at all, so a simpler positive/negative rule is needed instead. Warning-style entries (like "Select a Kicker first!") are indistinguishable from ordinary log entries. On top of that, the log text is small and has no way to make it bigger.

## What Changes

- Add a single shared, pure classification module used by both online and solo/local play: `classifyNature(row)` derives an intrinsic "good / bad / neutral / warning / unknown" nature from a roll's `resultState`/`rollType` or an entry's `category`; `resolveDisplayColor(nature, teamId, perspectiveTeamId)` turns that into the color actually shown, given who's watching (`perspectiveTeamId` is `null` in solo/local, or the viewer's `myTeamId` online).
- Online play: a roll/entry attributed to the viewer's own team is green when it's a "good" outcome and red when it's "bad"; a roll/entry attributed to the opponent is the opposite (their good news is red, their bad news is green).
- Solo/local play (no online match, no single "my team" perspective): every "good" roll/entry is green and every "bad" one is red, regardless of which team produced it.
- Rolls/entries that are inherently perspective-based rather than good/bad for a side — Coin Toss, Weather, and the Kickoff Event table — always render in a distinct neutral color (blue), in both online and solo play.
- Warning/informational entries (the deprecated `UI_Notification` → category `"info"` path, e.g. "Select a Kicker first!") always render in a distinct warning color (orange/yellow), regardless of perspective.
- Anything not covered by the above (skill triggers, reroll usage, generic action/drive entries, and dice rolls with no `resultState`) keeps its current unclassified look — no regression for cases the classifier can't confidently color.
- Add a manual font-size scale control to the Dice Log panel header (a persisted zoom stepper), so players who find the log text too small can bump it up.

## Capabilities

### New Capabilities
- `dice-log-font-scale`: a user-adjustable, persisted font-size scale control for the Dice Log panel.

### Modified Capabilities
- `match-log-entries`: log entries (and dice rows) now carry a perspective-aware good/bad/neutral/warning color, computed by a shared classification rule rather than the current ad hoc pass/fail-only coloring.

## Impact

- `src/ui/components/hud/DiceLog.tsx`: consumes the new classification module for both `DiceRow` and `EntryRow` rendering; adds the font-scale control and applies it to the log's text elements.
- New pure module (e.g. `src/ui/components/hud/diceLogColor.ts`): `classifyNature`, `resolveDisplayColor`, and the color→Tailwind-class mapping, plus direct unit tests.
- `src/network/OnlineMatch.ts`: existing `myTeamId` is the perspective source for online play; no change needed there, just consumed.
- No changes to dice-roll emission call sites — classification is derived entirely from data already on `DiceRoll`/`UI_LogEntry` events (`resultState`, `rollType`, `category`, `teamId`).
