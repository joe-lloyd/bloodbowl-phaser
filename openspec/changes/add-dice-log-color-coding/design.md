## Context

`DiceLog.tsx` renders two kinds of rows:
- `DiceRow` — a raw dice roll (`GameEventNames.DiceRoll`), carrying `rollType: string`, `resultState?: "none" | "success" | "failure" | "fumble"`, and `teamId?: string`.
- `EntryRow` — a durable outcome (`GameEventNames.UI_LogEntry`, plus the deprecated `UI_Notification`/`UI_GameLog` aliases), carrying `category: LogEntryCategory` (`weather | kickoff | skill | reroll | score | drive | action | info`) and `teamId?: string`.

Today, `DiceRow` coloring is a flat ternary on `resultState` (success→green, failure→red, fumble→orange, else→gray) with no perspective and no team awareness — `fumble` is dead code (grep confirms no call site ever emits it; it stays supported as a value for forward-compat). `EntryRow` coloring is a team-identity border only (`getTeamColorClass`), with no result semantics at all.

Investigation of every `DiceController` emission site (`src/game/controllers/DiceController.ts`) confirms one clean invariant: whenever `resultState` is `"success"`, that is good news for `teamId`; whenever it's `"failure"`/`"fumble"`, that is bad news for `teamId`. This holds even for `rollArmorCheck`, where `teamId` is the attacking player's team (not the injured player's) — armor breaking is a "success" for the attacker. So no per-roll-type special-casing is needed for the good/bad axis, only for the "not really good/bad for anyone" axis (Coin Toss, Weather, Kickoff Event) and the warning axis (`category: "info"`).

The perspective signal already exists: `getActiveOnlineMatch()` (`src/network/OnlineMatch.ts`) returns `null` in solo/local play and an object with `myTeamId: string` in online play.

## Goals / Non-Goals

**Goals:**
- One shared, pure, unit-testable classification function used identically by online and solo/local rendering — no per-mode branching duplicated in the component.
- Correct color for every combination the user described: online own-team good/bad, online opponent good/bad (inverted), solo good/bad regardless of team, neutral (Coin Toss/Weather/Kickoff), warning (info/notification text).
- Zero regression for row/entry kinds the classifier can't confidently place (skill, reroll, action, drive categories; dice rolls with `resultState: "none"` and an unrecognized `rollType`) — they keep exactly their current look.
- A persisted, user-controlled font-size scale for the log panel.

**Non-Goals:**
- Classifying block-dice results (`rollType: "Block Roll"`), scatter/bounce rolls, or plain informational rolls (Armour Roll's raw 2D6, Injury Roll) that never set `resultState` — these have no reliable success/failure signal today and stay unclassified (`"unknown"`), matching current behavior. Adding that would mean parsing free-text `description`/`value` per roll type, which is a much larger, riskier change than this note asked for.
- Reclassifying `category: "skill" | "reroll" | "action" | "drive"` — a skill trigger or reroll can be offensively or defensively motivated and has no consistent polarity from the event shape alone.
- Changing any emission call site (`DiceController`, `WeatherManager`, `KickoffEventManager`, `CoinFlipOverlay`, etc.) — classification is derived entirely from fields already on the events.
- Chat panel font scaling — the ask is specifically about the dice log's roll/entry text.

## Decisions

### 1. Two-step pure function, not one combined mapping
`classifyNature(row): "good" | "bad" | "neutral" | "warning" | "unknown"` is computed independent of the viewer, from `resultState`/`rollType` (dice rows) or `category` (entry rows):
- `rollType` is `"Coin Toss"`, `"Weather"`, or `"Kickoff Event"` → `"neutral"` (dice rows only; these are the exact strings the emitting code uses).
- `category` is `"weather"` or `"kickoff"` → `"neutral"` (entry rows).
- `category` is `"info"` → `"warning"` (this is exactly the deprecated `UI_Notification` path — "Select a Kicker first!" and similar strings land here).
- `resultState === "success"` (dice) or `category === "score"` (entry) → `"good"`.
- `resultState === "failure" | "fumble"` (dice) → `"bad"`.
- Anything else → `"unknown"`.

`resolveDisplayColor(nature, teamId, perspectiveTeamId): same 5-value type` then folds in the viewer:
- `neutral` / `warning` / `unknown` pass through unchanged — perspective never touches them.
- `good` / `bad` with no `perspectiveTeamId` (solo/local) or no `teamId` (can't attribute) pass through unchanged — this is exactly "every positive roll green, every negative roll red, regardless of team."
- `good` / `bad` with a `perspectiveTeamId` and a `teamId`: if `teamId === perspectiveTeamId`, pass through unchanged (my team's success is green, my team's failure is red); if not, invert (`good` → `bad`, `bad` → `good` — the opponent's success is bad for me, their failure is good for me).

Splitting into two functions (rather than one `classify(row, perspective)`) keeps the "what happened" question and the "who's watching" question independently testable and keeps the online/solo rule as one small, symmetric piece of logic instead of two parallel code paths.

### 2. Color mapping and fallback for `"unknown"`
```
good    → border-green-500 / bg-green-900/20   (existing green)
bad     → border-red-500   / bg-red-900/20     (existing red)
neutral → border-blue-500  / bg-blue-900/20    (new)
warning → border-yellow-500/ bg-yellow-900/20  (new)
unknown → DiceRow: existing gray fallback (border-gray-500/bg-gray-900/20)
          EntryRow: existing team-identity border (getTeamColorClass), unchanged
```
`unknown` is deliberately mapped differently per row kind because that's what each kind already shows today for anything unclassified — the goal is "add coloring for the cases we can classify," not "change the look of everything else."

### 3. Perspective source
`DiceLog` already calls `getActiveOnlineMatch()`. `perspectiveTeamId = match?.myTeamId ?? null` is computed once per render and passed into `resolveDisplayColor` for every row. No new plumbing needed.

### 4. Font scale: em-relative sizing off a container `font-size`, not `zoom`/`transform`
The log row text uses fixed Tailwind size utilities (`text-[11px]`, `text-xs`, `text-sm`), which are `rem`-based (relative to the document root), so simply setting a `font-size` on a wrapping container has no effect on them. Two options considered:
- **`zoom` / `transform: scale()`** on the container — simplest to write, but `zoom` is non-standard (fine for this Chromium-based build, but a lint/portability smell) and `transform: scale()` doesn't reflow layout (it visually scales the box without changing the space it occupies, so surrounding flex/scroll sizing gets out of sync with the visibly larger text).
- **Container `font-size` in `rem` (the scale) + convert the row text classes to `em`-based equivalents** (chosen). The scrollable log container gets `style={{ fontSize: `${scale}rem` }}`; `text-[11px]` becomes `text-[0.6875em]`, `text-xs` becomes `text-[0.75em]`, `text-sm` becomes `text-[0.875em]` (the em values reproduce the original px sizes at `scale = 1`, since `0.6875em × 16px = 11px`, etc., and Tailwind's default root is 16px). Elements without an explicit size class (the black dice-value badges) already inherit the container's `font-size` directly, so they scale automatically — no class changes needed there. This keeps real layout reflow (rows genuinely get taller/narrower content), which is what "manually set the size of the font" implies.

The scale itself: a small stepper in the Dice Log header (visible on the "dice" tab only), default `1` (100%), clamped to `[0.75, 2]` in `0.125` steps, persisted to `localStorage` under a single key so it survives reloads. No new dependency — a controlled number in component state, initialized lazily from `localStorage.getItem(...)`.

## Risks / Trade-offs

- **[Risk] A future roll type reuses `rollType: "Weather"` or `"Coin Toss"` for something that IS team-attributable** → Mitigation: these are exact-string matches on values only ever produced by `WeatherManager`/`KickoffEventManager`/the coin-flip call sites; if that ever changes, the classifier is one small function to update, and the unit tests pin today's set of strings so a drift is caught by a failing test, not a silent miscoloring.
- **[Risk] `localStorage` unavailable (SSR/tests)** → Mitigation: guard the read/write with a `try/catch` (already the pattern used elsewhere in this file, e.g. `teamIdForPlayer`), falling back to the default scale of `1`.
- **[Trade-off] Block dice, scatter, and other `resultState: "none"` rolls stay uncolored** → Accepted per Non-Goals; coloring them reliably needs per-roll-type result parsing that's out of scope for this pass and the note didn't ask for exhaustive coverage, just "almost every."

## Migration Plan

Purely additive UI change behind existing event data — no schema, persistence, or protocol changes. Ship in one PR: new `diceLogColor.ts` module + `DiceLog.tsx` wiring + font-scale control. No feature flag needed; rollback is a plain revert.

## Open Questions

None — scope and rules were confirmed against the actual emission call sites during investigation (see Context).
