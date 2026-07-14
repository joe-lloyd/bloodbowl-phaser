# Tasks: add-skill-rules-system

## 1. Framework (zero behavior change)

- [ ] 1.1 Define `SkillRule` interface with hook methods and context types (dodge, block dice count, block result apply, pickup, catch, pass) in `src/game/skills/`
- [ ] 1.2 Implement `SkillRegistry` (get, register, coverage report); no rules registered yet — verify all 325+ tests unchanged
- [ ] 1.3 Insert hook fold points into `DodgeController`, `BlockResolutionService`/`BlockManager` result application, `PickupOperation`, `CatchController`, `PassController`
- [ ] 1.4 Add `SkillTriggered` and `RerollUsed` events to `types/events.ts`

## 2. Reroll machinery

- [ ] 2.1 Implement `RerollArbiter`: source availability (skill per-action, team per-turn on own turn), no-reroll-of-reroll, team counter decrement
- [ ] 2.2 Reroll offers pause resolution: browser dialog component + `pendingDecision` type `reroll` and `use-reroll` command in `src/headless/protocol.ts`/`HeadlessGame` (with gating)
- [ ] 2.3 Seeded tests: offer/decline/accept paths, constraint matrix, determinism across reroll paths

## 3. Starter skills (one task each, rulebook-verified against docs/pdfs)

- [ ] 3.1 Block: attacker survives Both Down (no knockdown, no turnover for attacker's team)
- [ ] 3.2 Wrestle: Both Down option to place both prone without armour rolls (defender/owner decision via pendingDecision)
- [ ] 3.3 Dodge: dodge reroll offer + Defender Stumbles interaction (treated as Push unless attacker has Tackle — Tackle may land as inert stub)
- [ ] 3.4 Sure Hands: pickup reroll offer
- [ ] 3.5 Catch: catch reroll offer
- [ ] 3.6 Pass: pass reroll offer

## 4. Visibility & wrap-up

- [ ] 4.1 Game log/UI shows skill triggers and reroll usage; headless events verified in command responses
- [ ] 4.2 Coverage snapshot test (6 implemented, rest inert by name) so future skills update it consciously
- [ ] 4.3 Full suite green; full-match headless bot answers reroll decisions (extend bot policy: always decline)
