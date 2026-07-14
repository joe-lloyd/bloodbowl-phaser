# Proposal: add-skill-rules-system

## Why

Players carry `skills[]` data (820-line `Skills.ts` catalog) but no skill actually does anything: dodges, blocks, pickups, and passes roll raw dice regardless of Block, Dodge, Sure Hands, etc. To play "exactly like the board game" every skill eventually needs its rule enforced — but hardcoding them into managers would recreate the god-object problem. We need a system where each skill is a self-contained rule plugged into well-defined hook points, so rules can be added one at a time as needed.

## What Changes

- Add a **skill rule framework**: a registry mapping `SkillType` → rule object, with typed hook points invoked from the existing services/controllers at rule-relevant moments (dodge roll assembly, block dice count/result resolution, pickup/catch/pass rolls, armour/injury modifiers, movement).
- **Unimplemented skills are inert**: a skill with no registered rule changes nothing and cannot crash play; the registry can report coverage (implemented vs. catalog) so board-game fidelity is measurable.
- Add **reroll decision points**: the mechanism skills like Dodge/Sure Hands/Pass need ("failed — use skill reroll?") and team rerolls share. Surfaces in the browser as a dialog and in the headless protocol as a new `pendingDecision` type with a `use-reroll` reply.
- Implement a **starter set** proving each hook type: **Block** (both-down immunity), **Dodge** (dodge reroll + Defender Stumbles interaction), **Sure Hands** (pickup reroll), **Catch** (catch reroll), **Pass** (pass reroll), **Wrestle** (both-down choice).
- Skill effects are **visible**: events announce when a skill modifies a roll or offers a reroll, so UI, logs, and AI agents can see why outcomes changed.

## Capabilities

### New Capabilities

- `skill-rules`: The rule framework — registry, hook points, inert-by-default behavior, coverage reporting — plus the starter six skills' exact rule behavior per the 2025 rulebook.
- `reroll-decisions`: Reroll offers as first-class decisions: sources (skill vs. team reroll), once-per-action/once-per-turn constraints, decision surfacing in UI and headless protocol, and dice determinism across reroll paths.

### Modified Capabilities

- `action-protocol`: New `pendingDecision` variant (`reroll`) and `use-reroll` reply command; legal-action enumeration unaffected. (Delta against the add-headless-engine spec, which is still in `openspec/changes/` — coordinate archiving order.)

## Impact

- **Modified code**: `DodgeController`, `BlockResolutionService`/`BlockManager`, `PickupOperation`, `CatchOperation`/`CatchController`, `PassController`, `DiceController` (reroll path), `types/events.ts` (skill/reroll events), `src/headless/protocol.ts` + `HeadlessGame` (new decision type).
- **New code**: `src/game/skills/` (registry, rule interface, starter rules), reroll dialog component.
- **Data**: `Skills.ts` catalog unchanged (already the source of truth for names/categories).
- **Tests**: per-skill seeded tests; headless reroll decision flow; coverage report snapshot.
