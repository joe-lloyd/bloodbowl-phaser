## Context

`GameService.addTouchdown` sets `phase = TOUCHDOWN`, emits `PhaseChanged`, and after a fixed 2s delay calls `endDrive`, which queues `ClearPitchOperation → KORecoveryOperation → StartNextDriveOperation` on the flow manager. `SceneOrchestrator.handlePhaseChange` has no `case GamePhase.TOUCHDOWN`, so it hits `default` and warns; whatever handler was active for PLAY is torn down and nothing replaces it. The drive sequence still runs on the flow manager, which is why play limps forward — but the scene has no owner during the celebration, which is where the duplicate-player and stuck-setup symptoms surface.

`rollKORecovery` loops both rosters, rolls, flips `status` to `RESERVE`, and emits `KORecoveryRolled` per player — all synchronously inside one operation followed by a single 800ms delay. Nothing paces it, and the dugout rebuild that reacts to those events is not sequenced against the pitch clear, which allows a player to be rendered in Reserves while a stale pitch sprite still exists.

`SetupManager.isSetupComplete` and the placement cap are written around the number seven (`GameConfig.MIN_PLAYERS`). With KO'd and injured players out, a Sevens roster frequently has fewer than seven available, and setup can never report complete.

The `queueDepthSort` crash is a listener-lifetime bug. `KickoffPhaseHandler` subscribes to `BallKicked` on the shared `EventBus` and captures `this.scene`. The EventBus outlives the Phaser scene. If the first match's handler is not unsubscribed before the second match kicks off, `this.scene["placeBallVisual"]` runs against a shut-down scene, and `new BallSprite(this, …)` dereferences a null `sys`.

## Goals / Non-Goals

**Goals:**
- Every phase the engine can enter has an owner in the orchestrator.
- KO recovery reads as a rulebook sequence a coach can watch and verify.
- A player is one record in one place, always.
- A short-handed team can field what it has and play on.
- A second match in the same session starts from a clean slate.

**Non-Goals:**
- Reworking the flow-manager/operation model. The end-of-drive sequence stays three operations; only their pacing and the events they emit change.
- Journeymen / hiring to fill an under-strength roster between matches — that belongs with the team-lifecycle work.
- Kickoff-event rework, camera work, or the announcement redesign (separate changes).

## Decisions

**1. TOUCHDOWN gets a real handler, not just a `case` that does nothing.**
A `TouchdownPhaseHandler` SHALL own the celebration window: it announces the scorer and score, holds the scene for the celebration beat, and exits when the end-of-drive sequence takes over. Alternative considered: adding `case GamePhase.TOUCHDOWN: this.currentHandler = null;` to silence the warning. Rejected — the warning is a symptom; the real defect is that no component owns the scene during the celebration, which is exactly when the pitch is being cleared underneath it.

**2. KO recovery becomes one operation per player, not one operation for all players.**
`KORecoveryOperation` SHALL expand into a paced loop: for each KO'd player, roll, emit `KORecoveryRolled`, await a short beat for the animation, then apply the status change. Applying the status change *after* the roll is shown keeps the visual and the model in step. Alternative considered: keeping the synchronous roll and animating afterwards from the event log. Rejected — that is exactly the current split that let the pitch sprite and the dugout slot disagree.

**3. A single `movePlayerToBox` seam owns dugout membership.**
Status transitions between pitch / Reserves / KO / Casualty SHALL go through one function that clears the player's previous representation before creating the new one. The duplicate arose because two paths (the pitch clear and the recovery) each created a representation without the other removing one. One seam, one representation — the simplification that makes the class of bug impossible rather than fixing this instance of it.

**4. Setup completeness is "all available placed", capped at seven.**
`isSetupComplete(teamId)` SHALL return true when the number of placed players equals `min(7, availablePlayers)`, where available excludes KO, Casualty, and sent-off players. The placement cap stays at seven. `GameConfig.MIN_PLAYERS` keeps its meaning for *team building* (you may not build a roster below seven) and stops being consulted for *fielding*. Alternative considered: auto-conceding when a team cannot field a minimum. Rejected — the 2025 rules let a short-handed team play on, and conceding is a coach's decision.

**5. Handler teardown is guaranteed by the scene, and visual creation is guarded.**
`GameScene.shutdown` SHALL destroy the orchestrator (which exits the active handler and unsubscribes it) and `ServiceContainer.reset()` SHALL happen before a new scene is created. As a belt-and-braces second line, `placeBallVisual` and the other sprite factories SHALL return early when the scene is no longer active. Both, not either: the teardown is the fix, the guard is the seatbelt that turns a future leak into a no-op instead of a crash.

## Risks / Trade-offs

- **[Paced KO recovery lengthens the gap between drives]** → Per-player beat kept short (~500ms) with the whole sequence skippable by a click; the total for a typical one-or-two-KO drive stays under the current fixed 800ms plus one beat.
- **[Changing setup completeness could let a team kick off with nobody on the pitch]** → Completeness requires every *available* player placed; a team with zero available players is a distinct condition and is reported rather than silently kicking off.
- **[Early-return guards could mask a real ordering bug in future]** → The guards log once at warn level with the scene key, so a leak is visible in the console instead of silent.
- **[`MIN_PLAYERS` is read in more places than expected]** → Every read is audited in the tasks; team-building reads keep the constant, fielding reads move to the availability count.

## Migration Plan

No persisted-format change. Behavioral only. The `TouchdownPhaseHandler` is additive; the KO recovery operation keeps its name and position in the queue so scenario snapshots that assert queue order stay valid. Roll out behind no flag — the current behavior is a crash and a stall, so there is nothing to preserve.

## Open Questions

- Should the celebration beat be skippable by click, or fixed-length for online matches where both coaches must stay in step? Leaning skippable locally and fixed-length online; confirm against the online sync envelope before implementing.
