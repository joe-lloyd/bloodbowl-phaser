# Proposal: add-skill-rules-system

## Why

Players carry `skills[]` data (820-line `Skills.ts` catalog) but no skill actually does anything: dodges, blocks, pickups, and passes roll raw dice regardless of Block, Dodge, Sure Hands, etc. To play "exactly like the board game" every skill eventually needs its rule enforced — but hardcoding them into managers would recreate the god-object problem. We need a system where each skill is a self-contained rule plugged into well-defined hook points, so rules can be added one at a time as needed.

## What Changes

- Add a **skill rule framework**: a registry mapping `SkillType` → rule object, with typed hook points invoked from the existing services/controllers at rule-relevant moments (dodge roll assembly, block dice count/result resolution, pickup/catch/pass rolls, armour/injury modifiers, movement).
- **Unimplemented skills are inert**: a skill with no registered rule changes nothing and cannot crash play; the registry can report coverage (implemented vs. catalog) so board-game fidelity is measurable.
- Add **reroll decision points**: the mechanism skills like Dodge/Sure Hands/Pass need ("failed — use skill reroll?") and team rerolls share. Surfaces in the browser as a dialog and in the headless protocol as a new `pendingDecision` type with a `use-reroll` reply.
- Add a **reactive/interrupt trigger model** so skills can fire on the *opponent's* action or mid-flow and legitimately bend the base rules (Tackle denying a dodge reroll, Diving Tackle worsening a dodge, Stand Firm refusing a push, Frenzy forcing a second block, Foul Appearance/Dauntless pre-block rolls). Named trigger points gather rules from **all** relevant players (actor, target, adjacent); reactions that need a coach's choice surface as `pendingDecision`s owned by the *reacting* team; flow-altering effects enqueue through the existing `GameFlowManager` rather than editing the base rule. This is how "affects anything, any time" plugs in without rewriting the rules it modifies.
- **Online-ready by construction**: every skill choice (reroll or reaction) is a `pendingDecision` with a `chooserTeamId`, which the host-authoritative multiplayer layer already routes by ownership — so skills work identically in local and online play with only a small protocol/gate extension.
- Implement a **starter set** proving each hook type: **Block** (both-down immunity), **Dodge** (dodge reroll + Defender Stumbles interaction), **Sure Hands** (pickup reroll), **Catch** (catch reroll), **Pass** (pass reroll), **Wrestle** (both-down choice), and one **reactive skill** (Stand Firm or Diving Tackle) proving the trigger + reacting-team decision + flow effect.
- Skill effects are **visible**: events announce when a skill modifies a roll, offers a reroll, or triggers a reaction, so UI, logs, and AI agents can see why outcomes changed.

## Capabilities

### New Capabilities

- `skill-rules`: The rule framework — registry, hook points, inert-by-default behavior, coverage reporting — plus the starter six skills' exact rule behavior per the 2025 rulebook.
- `reroll-decisions`: Reroll offers as first-class decisions: sources (skill vs. team reroll), once-per-action/once-per-turn constraints, decision surfacing in UI and headless protocol, and dice determinism across reroll paths.

### Modified Capabilities

- `action-protocol`: New `pendingDecision` variant (`reroll`) and `use-reroll` reply command; legal-action enumeration unaffected. (Delta against the add-headless-engine spec, which is still in `openspec/changes/` — coordinate archiving order.)

## Impact

- **Modified code**: `DodgeController`, `BlockResolutionService`/`BlockManager`, `PickupOperation`, `CatchOperation`/`CatchController`, `PassController`, `DiceController` (reroll path), `types/events.ts` (skill/reroll/reaction events), `src/headless/protocol.ts` + `HeadlessGame` (new `reroll`/`reaction` decisions), `GameFlowManager` (flow-altering skill operations).
- **New code**: `src/game/skills/` (registry, rule interface, trigger points, starter rules incl. one reactive skill), reroll/reaction dialog component.
- **Online integration** (small, additive): `OwnershipGate.decisionOwner` + `NetworkedGameService` extended for the new decision types so skill choices route to the correct coach over host-authoritative multiplayer (the transport/gate already exist).
- **Data**: `Skills.ts` catalog unchanged (already the source of truth for names/categories).
- **Tests**: per-skill seeded tests; headless reroll/reaction decision flow; an online decision-ownership test for a skill decision; coverage report snapshot.
- **Coordination**: `add-online-multiplayer` should land/settle first (this change extends its `OwnershipGate`/`NetworkedGameService`); the `action-protocol` delta targets the promoted spec once `add-headless-engine` is archived.
