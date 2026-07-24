# Tasks: add-skill-rules-system

## 1. Framework (zero behavior change)

- [x] 1.1 Define `SkillRule` interface + context types in `src/game/skills/` — `BlockResultContext` + `onBlockResult` hook done; dodge/dice-count/pickup/catch/pass contexts added as those hooks land (2–3).
- [x] 1.2 Implement `SkillRegistry` (get/register/has/coverage/_reset); rules registered via `registerBuiltinSkills()` on import — full suite unchanged (388 green).
- [x] 1.3 Insert hook fold points — `BlockManager` (both-down via `foldBlockResult`); dodge (`MovementManager`), pickup/catch (`AgilityTestOperation`), pass (`PassController.attemptPass`) all fold through `withRerollOffer`.
- [x] 1.4 Add `SkillTriggered` and `RerollUsed` events to `types/events.ts` (SkillTriggered wired; RerollUsed lands with the reroll machinery).

## 2. Reroll machinery

- [x] 2.1 Implement `RerollArbiter`: source availability (skill per-action, team per-turn on own turn), no-reroll-of-reroll, team counter decrement
- [x] 2.2 Reroll offers pause resolution: browser dialog component (`RerollDialog`) + `pendingDecision` type `reroll` and `use-reroll` command in `src/headless/protocol.ts`/`HeadlessGame` (suspend/resume via awaitable `DecisionService`; gated like block dice)
- [x] 2.3 Seeded tests: offer/decline/accept paths, constraint matrix, determinism across reroll paths (`__tests__/headless/reroll-decisions.test.ts`, 8 tests)

## 3. Reactive/interrupt trigger framework

- [x] 3.1 Define named trigger points (`onDodgeDeclared`, `onBlockDeclared`, `onPush`, `onBlockResult`, `onFollowUp`, `onArmourBreak`) and a deterministic all-participant gather (actor → target → adjacents by position) that folds registered rules from every relevant player, not just the actor. All six wired (`MovementManager`, `BlockManager`, `GameService.followUpPush`, `ArmourOperation`); hooks may be async so reactions can pause.
- [x] 3.2 Reactions as decisions: a trigger may raise a `pendingDecision` whose `chooserTeamId` is the reacting player's team (reuses the reroll decision channel); the base action pauses and resumes with the answer. Added `reaction` `pendingDecision` + `use-reaction` reply to protocol/`HeadlessGame`, `answerReaction` on `IGameService`, `ReactionDialog` in the HUD.
- [x] 3.3 Flow-altering effects enqueue a `GameOperation` on `GameFlowManager` via `ctx.flow` (never inline base-rule mutation); `SkillTriggered` announces each. Seeded test: stubbed flow-effect rule adds a step without editing the base rule (`__tests__/headless/skill-triggers.test.ts`).

## 4. Online decision routing (extends add-online-multiplayer)

- [x] 4.1 Map the new `reroll`/`reaction` decisions to their `chooserTeamId` in `OwnershipGate.decisionOwner`; relay `use-reroll`/`use-reaction` in `NetworkedGameService` (+ host-facade overrides in `OnlineMatch`, `UI_RerollResponse`/`UI_ReactionResponse` in the intent filter).
- [x] 4.2 Online ownership test: a skill reroll/reaction decision is accepted only from the reacting coach's session (`__tests__/network/sessions.test.ts`, mirroring the uphill-block-dice test); the guest's dialogs are gated by `mayAct` (which routes through `decisionOwner`, covered by the same gate).

## 5. Starter skills (one task each, rulebook-verified against docs/pdfs)

- [x] 5.1 Block: attacker survives Both Down (no knockdown, no turnover for attacker's team) — `rules/BlockRule.ts`; both-have-Block = neither falls; turnover derived from attacker knockdown. Locked by `__tests__/headless/skill-block.test.ts` (5 tests incl. inert-skill + coverage).
- [x] 5.2 Wrestle: Both Down option to place both prone without armour rolls (owner decision via `reaction` pendingDecision); verified vs 2025 rulebook p.141 — "regardless of any other Skills" overrides Block; Placed Prone (p.42) = no armour, turnover only if the active player carried the ball.
- [x] 5.3 Dodge: dodge reroll offer + Defender Stumbles treated as Push unless attacker has Tackle (p.130/62). Tackle implemented fully (not a stub): denies the Dodge skill reroll at `onDodgeDeclared` (p.140).
- [x] 5.4 Sure Hands: pickup reroll offer (`rules/SureHandsRule.ts`)
- [x] 5.5 Catch: catch reroll offer (`rules/CatchRule.ts`)
- [x] 5.6 Pass: pass reroll offer, fired before scatter/fumble resolution (`rules/PassRule.ts`)
- [x] 5.7 Reactive starter — Stand Firm (refuse a push, reacting-team decision at `onPush`, 2025 p.139; POW knocks down in place, no follow-up, activation ends): proves trigger point + reacting-team decision + flow effect. Online ownership covered in 4.2.

## 6. Visibility & wrap-up

- [x] 6.1 Game log/UI shows skill triggers, reroll usage, and reactions (`DiceLog` entries for `SkillTriggered`/`RerollUsed`; `RerollDialog`/`ReactionDialog` overlays); headless events verified in command responses by the skill-trigger/reroll tests.
- [x] 6.2 Coverage snapshot test (8 implemented: Block, Catch, Dodge, Pass, Stand Firm, Sure Hands, Tackle, Wrestle — Tackle landed real, not inert; rest inert by name) so future skills update it consciously (`skill-block.test.ts`).
- [x] 6.3 Full suite green (412 tests); full-match headless bot answers reroll/reaction decisions with an always-decline policy and a seeded match that provably raises them (`fullGame.test.ts`).
