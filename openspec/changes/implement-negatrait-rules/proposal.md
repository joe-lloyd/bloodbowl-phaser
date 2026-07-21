# Proposal: implement-negatrait-rules

## Why

The skill campaign stands at 48/108 after the standard-rules part shipped; the next scoped part is the negatrait batch — the traits that negatively affect a team's own players (Bone Head, Really Stupid, Take Root, Loner, …). Rosters already carry these traits, so today a Bone Head player activates as reliably as a human Blitzer: the biggest remaining rulebook-fidelity gap, and the one that most changes how AI and coaches must plan turns.

## What Changes

- New `onActivationDeclared` trigger: negatraits roll after an action is declared and can downgrade, end, or gate the activation (Bone Head, Really Stupid, Animal Savagery, Unchannelled Fury, Take Root, Bloodlust, Animosity).
- New player conditions with engine-wide effects, visible in serialization and the sandbox: **Distracted** (Bone Head/Really Stupid failures, Hypnotic Gaze), **Rooted** (Take Root), **Chomped** (Monstrous Mouth). Conditions modify tackle zones, assists, movement, and pushes per the 2025 book, with defined expiry timing.
- Reroll-gate and reroll-extension rules: Loner (X+) gates team rerolls; Pro adds a die-level reroll (one die of any roll during the player's activation, 3+ to use) — resolves the open design question from the previous part.
- Roll-modifier negatraits on existing seams: Drunkard (−1 Rush), Timmm-ber! (stand-up bonus for MA ≤ 2).
- Keyword-parameterized rules reading `Player.keywords`: Animosity (X) refuses pass/hand-off to matching team-mates on a 1; Hatred (X) rerolls one Player Down result blocking matching keyword.
- Reaction/end-of-turn traits: Trickster (relocate before block dice), Pick-Me-Up (end-of-opponent-turn 5+ stand-up aura) via a new end-of-turn trigger.
- Special activation actions following the established Stab pattern (declare → operation → activation ends): Breathe Fire, Projectile Vomit, Hypnotic Gaze (with its pre-move), Chomp (Monstrous Mouth); My Ball gates declarations via the existing `onActionDeclared` fold.
- Always Hungry registers with its enforceable clause; its Throw Team-mate clause stays with the subsystem part.
- Every rule ships with rule-scenario catalog configurations; the coverage-gate snapshot moves from 48 to 68 implemented; extra scenario coverage for activation/turnover edge cases (historically fragile area).

## Capabilities

### New Capabilities

- `player-conditions`: named, serializable player conditions (Distracted, Rooted, Chomped) with book-defined effects and expiry, honoured by movement, blocking, and assist logic and visible to UI/headless consumers.

### Modified Capabilities

- `skill-rules`: adds requirements for the activation-declared gate (roll after declaring, before performing), the die-level reroll (Pro), the end-of-opponent-turn trigger (Pick-Me-Up), and keyword-parameterized rules.

## Impact

- **Skills framework**: new trigger points (`onActivationDeclared`, end-of-opponent-turn), Pro extension in the reroll machinery (`withRerollOffer`/`RerollArbiter`), ~20 new rule files under `src/game/skills/rules/`.
- **Engine**: activation declaration path (`PlayerActionManager`/`GameService.declareAction`), `TurnManager` (end-of-turn hook, lost activations), `BlockValidator`/assist logic and `MovementManager` (condition effects), push chain (Rooted cannot be pushed).
- **Headless/protocol**: new special-action commands (breathe-fire, vomit, gaze, chomp) mirroring `stab`; conditions in `serialization.ts` snapshots.
- **Verification**: `src/data/ruleScenarios/` negatrait entries, gate snapshot in `__tests__/headless/rules/gate.test.ts` (48 → 68), seeded activation/turnover edge-case scenarios.
- **Out of scope**: Throw Team-mate clause of Always Hungry, interception-flow traits, and all batch-9 subsystems (follow-up parts).
