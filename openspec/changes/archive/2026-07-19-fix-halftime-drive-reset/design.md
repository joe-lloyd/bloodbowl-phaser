# Design: fix-halftime-drive-reset

## Context

`addTouchdown` → `startEndDriveSequence` → `recoverKO` → `resetForKickoff` exists as a chain of sub-phase flips with delays, but none of the steps do their actual job: players keep `gridPosition`, `SetupManager.placedPlayers` persists across drives (its constructor syncs once and nothing clears it), KO'd players never roll to recover, and the ball position carries over. Halftime reuses the same broken path via `TurnManager.endHalf` → `onHalfEnded` → `startSetup`. The recent headless full-match test only passes because stale placements make `isSetupComplete` return true immediately — exactly the corrupted state this change removes.

## Guiding Philosophy

Same as add-headless-engine: delete the fake sequence rather than patch around it. `startEndDriveSequence`/`recoverKO` in their current form are replaced, not extended.

## Goals / Non-Goals

**Goals:**

- One authoritative end-of-drive sequence used by touchdown, halftime, and (later) end-of-game paths.
- Correct kicking-team determination per drive with the coin flip only before drive 1.
- Works identically headless and in the browser (events only, no UI calls from the engine).

**Non-Goals:**

- Casualty/injury post-game rolls, apothecary, secret weapons enforcement (SECRET_WEAPONS sub-phase stays a pass-through for now).
- Fan/weather re-rolls at halftime, prayers to Nuffle, or any inducements.
- Overtime.

## Decisions

### 1. EndDriveOperation chain over method calls

Model the sequence as operations queued on the existing `GameFlowManager` (`ClearPitchOperation` → `KORecoveryOperation` → then `startSetup(kickingTeamId)`), consistent with how armour/injury chains already work, using `context.delay` for pacing so headless runs instantly. Alternative: keep plain methods on `GameService` — rejected because the sequence needs event-paced steps the UI can animate, which is exactly what operations are for.

### 2. Drive state owned by TurnManager

`TurnManager` already tracks `driveKickingTeamId` and `firstHalfKickingTeamId`; it becomes the single source for "who kicks the next drive": after a touchdown the scorer kicks; at halftime the first-half kicker receives. `GameService` asks it, nothing else derives kicking teams. The coin flip result feeds it once at match start.

### 3. SetupManager gets an explicit resetForNewDrive()

Clears `placedPlayers`, `setupReady`, and each player's `gridPosition` (status → Reserve unless KO/Injured/Dead/Removed). Called only from the end-of-drive sequence. This removes the accidental "players stay placed" behavior the current full-match bot exploits — the bot must genuinely re-place each drive.

### 4. KO recovery is a dice event, not silent state

Each KO'd player rolls via `DiceController` (D6, threshold per the 2025 rulebook — verify exact Sevens value against `docs/pdfs/` during implementation) and emits a `KORecoveryRolled` event `{playerId, roll, recovered}`. UI shows it; headless surfaces it in command responses like any other event. No player decision involved, so no new `pendingDecision` type.

## Risks / Trade-offs

- [Existing full-match headless test passes *because* of stale placements; it will need real re-placement logic] → the bot already contains placement code; tighten it and assert players return to dugouts between drives.
- [Browser SetupPhaseHandler may assume the coin-flip overlay runs before every setup] → gate the coin flip on "first drive of the match" (no `firstHalfKickingTeamId` yet); add a UI check.
- [Rulebook detail risk: exact KO recovery threshold/modifiers in Sevens 2025] → implementer verifies against the in-repo PDF before coding; spec states the roll exists and is event-visible, not the number.

## Migration Plan

Pure behavior fix on `main`; no data migration. Land engine sequence + tests first, then UI wiring.

## Open Questions — RESOLVED (rulebook verified 2026-07-14)

- **KO recovery**: D6 per Knocked-out player during the End of Drive Sequence; 4+ recovers to the Reserves Box, 1–3 stays in the KO box ("Recover Knocked-out Players", p.83). The in-repo PDF is the standard 2025 rulebook with no Sevens-specific KO table, so the standard 4+ applies.
- **Stunned players at drive end**: everyone on the pitch returns to the dugout; only players set up for the next drive leave the Reserves Box — so stunned/prone players go to Reserves like the rest. (Stunned→Prone rollover is an end-of-team-turn rule, not a drive-end rule.)
- **Kicking team at restart** (verbatim rule): touchdown → "the team that scored will become the kicking team"; halftime → "the next half will begin with the team that began the game as the receiving team becoming the kicking team".
- **Noted for add-skill-rules-system**: Team Re-rolls replenish to full at half-time (p.29) — the halftime path here should emit enough information for that change to hook into.
- Weather end-of-drive effects exist ("End of Drive Effects" stage) — this change adds the stage as a no-op ordering point; actual weather effects are future work.
