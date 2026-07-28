## 1. Classification module

- [x] 1.1 Create `src/ui/components/hud/diceLogColor.ts` with `classifyDiceRowNature`, `classifyEntryNature`, `resolveDisplayColor`, the `LogColor` type, and a `LOG_COLOR_CLASSES` Tailwind-class map, per design.md's rules (neutral roll types/categories, warning="info", good="success"/"score", bad="failure"/"fumble", else "unknown").
- [x] 1.2 Add `__tests__/unit/diceLogColor.test.ts` covering: online own-team good/bad, online opponent good/bad (inverted), solo good/bad regardless of team, neutral (Coin Toss/Weather/Kickoff Event rollType and weather/kickoff category) unaffected by perspective, warning (info category) unaffected by perspective, score category good/bad by perspective, unknown/unattributed fallback (missing teamId, missing perspective, unrecognized category/resultState).

## 2. Wire coloring into DiceLog

- [x] 2.1 In `DiceLog.tsx`, compute `perspectiveTeamId = match?.myTeamId ?? null` once per render.
- [x] 2.2 Replace the `DiceRow` resultState ternary with `classifyDiceRowNature` + `resolveDisplayColor`, mapping `"unknown"` to the existing gray fallback and all other colors to `LOG_COLOR_CLASSES`.
- [x] 2.3 Apply the same classify/resolve pipeline to `EntryRow` rendering, mapping `"unknown"` to the existing `getTeamColorClass` team-identity border (unchanged) and all other colors to `LOG_COLOR_CLASSES`.
- [x] 2.4 Manually sanity-check in the running app (or an existing HUD test harness) that weather/kickoff/coin-toss entries render neutral/blue, an info notification renders warning/orange, and a score entry renders good/bad correctly for both a solo game and each side of an online match.

## 3. Font-size scale control

- [x] 3.1 Add a `scale` state to `DiceLog`, lazily initialized from `localStorage` (guarded with try/catch, default `1`), clamped to `[0.75, 2]`.
- [x] 3.2 Add a small stepper control (e.g. `A-` / `A+` buttons showing the current percentage) to the Dice Log header, visible on the "dice" tab, that adjusts `scale` in `0.125` steps and persists the new value to `localStorage`.
- [x] 3.3 Apply `style={{ fontSize: `${scale}rem` }}` to the scrollable log content container; convert the row text size classes (`text-[11px]`, `text-xs`, `text-sm` within the dice/entry row rendering) to their `em`-relative equivalents (`text-[0.6875em]`, `text-[0.75em]`, `text-[0.875em]`) so they scale off the container instead of the document root.
- [x] 3.4 Confirm the dice-value/roll-value badges (which have no explicit size class) visibly scale too, since they inherit the container's font-size directly.

## 4. Verification

- [x] 4.1 Run the full unit test suite and confirm no regressions (existing DiceLog-adjacent tests, if any, still pass).
- [x] 4.2 Run lint/typecheck on the changed files.
