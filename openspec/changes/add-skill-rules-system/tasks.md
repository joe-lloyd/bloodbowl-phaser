# Tasks: add-skill-rules-system

## 1. Framework (zero behavior change)

- [x] 1.1 Define `SkillRule` interface + context types in `src/game/skills/` — `BlockResultContext` + `onBlockResult` hook done; dodge/dice-count/pickup/catch/pass contexts added as those hooks land (2–3).
- [x] 1.2 Implement `SkillRegistry` (get/register/has/coverage/_reset); rules registered via `registerBuiltinSkills()` on import — full suite unchanged (388 green).
- [~] 1.3 Insert hook fold points — DONE for `BlockManager` (both-down result via `foldBlockResult`); `DodgeController`/`PickupOperation`/`CatchController`/`PassController` still to wire (arrive with their reroll skills in 5.3–5.6).
- [x] 1.4 Add `SkillTriggered` and `RerollUsed` events to `types/events.ts` (SkillTriggered wired; RerollUsed lands with the reroll machinery).

## 2. Reroll machinery

- [ ] 2.1 Implement `RerollArbiter`: source availability (skill per-action, team per-turn on own turn), no-reroll-of-reroll, team counter decrement
- [ ] 2.2 Reroll offers pause resolution: browser dialog component + `pendingDecision` type `reroll` and `use-reroll` command in `src/headless/protocol.ts`/`HeadlessGame` (with gating)
- [ ] 2.3 Seeded tests: offer/decline/accept paths, constraint matrix, determinism across reroll paths

## 3. Reactive/interrupt trigger framework

- [ ] 3.1 Define named trigger points (`onDodgeDeclared`, `onBlockDeclared`, `onPush`, `onBlockResult`, `onFollowUp`, `onArmourBreak`) and a deterministic all-participant gather (actor → target → adjacents by position) that folds registered rules from every relevant player, not just the actor.
- [ ] 3.2 Reactions as decisions: a trigger may raise a `pendingDecision` whose `chooserTeamId` is the reacting player's team (reuses the reroll decision channel); the base action pauses and resumes with the answer. Add the `reaction` `pendingDecision` + `use-reaction` reply to `src/headless/protocol.ts`/`HeadlessGame`.
- [ ] 3.3 Flow-altering effects enqueue a `GameOperation` on `GameFlowManager` (never inline base-rule mutation); `SkillTriggered` announces each. Seeded test: a stubbed flow-effect rule adds a step without editing the base rule.

## 4. Online decision routing (extends add-online-multiplayer)

- [ ] 4.1 Map the new `reroll`/`reaction` decisions to their `chooserTeamId` in `OwnershipGate.decisionOwner`; relay `use-reroll`/`use-reaction` in `NetworkedGameService`.
- [ ] 4.2 Online ownership test: a skill reroll/reaction decision is accepted only from the reacting coach's session (mirror the existing uphill-block-dice test), and the guest's dialog is gated by `mayAct`.

## 5. Starter skills (one task each, rulebook-verified against docs/pdfs)

- [x] 5.1 Block: attacker survives Both Down (no knockdown, no turnover for attacker's team) — `rules/BlockRule.ts`; both-have-Block = neither falls; turnover derived from attacker knockdown. Locked by `__tests__/headless/skill-block.test.ts` (5 tests incl. inert-skill + coverage).
- [ ] 5.2 Wrestle: Both Down option to place both prone without armour rolls (defender/owner decision via pendingDecision)
- [ ] 5.3 Dodge: dodge reroll offer + Defender Stumbles interaction (treated as Push unless attacker has Tackle — Tackle may land as inert stub)
- [ ] 5.4 Sure Hands: pickup reroll offer
- [ ] 5.5 Catch: catch reroll offer
- [ ] 5.6 Pass: pass reroll offer
- [ ] 5.7 Reactive starter — Stand Firm (refuse a push, reacting-team decision at `onPush`) or Diving Tackle (drop prone to worsen an escaping opponent's dodge at `onDodgeDeclared`): proves trigger point + reacting-team decision + flow effect, and works online.

## 6. Visibility & wrap-up

- [ ] 6.1 Game log/UI shows skill triggers, reroll usage, and reactions; headless events verified in command responses
- [ ] 6.2 Coverage snapshot test (7 implemented, rest inert by name) so future skills update it consciously
- [ ] 6.3 Full suite green; full-match headless bot answers reroll/reaction decisions (extend bot policy: always decline)
