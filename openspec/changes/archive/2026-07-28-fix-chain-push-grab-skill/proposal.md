## Why

The user reports "chain push is now not working because Black Orcs have Grab by default — there are more options so they can't push into the dudes behind them." Investigation shows this is **not a regression in push resolution**: `BlockResolutionService.getGrabPushOptions` (rulebook p.135) correctly offers all eight on-pitch, unoccupied squares around the defender when the attacker has Grab, and correctly returns nothing — falling through to the normal three-square tiered logic, including chain push — when the defender is fully boxed in. The real problem is that this behavior is undocumented in `openspec/specs/push-chain-rules` and untested for a Grab-holding attacker: the only chain-push scenario (`src/data/scenarios.ts`, id `chain-push`) occupies just the three traditional "behind" squares and defaults both teams to the Human roster (no Grab), so it says nothing about what should happen once a Black Orc — Grab by default (`src/data/RosterTemplates.ts`) — throws the block. Without a spec requirement or a scenario covering it, this correct-but-surprising interaction reads as broken every time a Grab-holder is involved, exactly as it did here.

## What Changes

- The `push-chain-rules` capability SHALL gain an explicit requirement describing how Grab interacts with the push tiers: an attacker with Grab widens the "open" tier to all eight on-pitch squares adjacent to the defender; the chain-push tier (and the crowd tier) are unaffected and still resolve over the normal three squares once Grab finds no unoccupied square among the eight.
- The `push-chain-rules` capability SHALL gain a requirement that Grab's wider square set applies only to the push directly caused by the Grab-holding attacker, not to any further pushes forced later in the same chain (matching current `BlockManager` behavior, which restricts the wide set to `chain.links.length === 0`) — made explicit so it is never "fixed" away as a false bug again.
- A new seeded headless scenario SHALL cover a Grab-holding attacker (a Black Orc) blocking a defender who is fully boxed in on all eight adjacent squares, asserting the push still chains through an occupied square exactly as it would without Grab.
- A second new seeded headless scenario SHALL cover the same Grab-holding attacker with at least one open square among the eight (but none of the three traditional squares open), asserting Grab lets the coach choose that square instead of chaining.
- The match log entry for a Grab-assisted push SHALL name Grab explicitly (e.g. "Grab: pushed to (x,y)") so a coach watching the block can see why a square outside the usual three was offered, instead of it looking arbitrary.

## Capabilities

### Modified Capabilities
- `push-chain-rules`: add the Grab-interaction requirements described above (chain tier untouched by Grab beyond the boxed-in case; Grab's wide square set does not propagate past the first link of a chain).

## Impact

- `src/services/BlockResolutionService.ts` (`getGrabPushOptions`, `getPushOptions`) — behavior confirmed correct, not changed.
- `src/game/managers/BlockManager.ts` (`requestPushDecision`'s `chain.links.length === 0` gate) — behavior confirmed correct, not changed; may gain a log-message tweak.
- `src/data/scenarios.ts` — new scenario(s) for a Grab-holding attacker (Black Orc) alongside the existing `chain-push` scenario.
- `__tests__/headless/push-chain.test.ts` — new test cases for the two scenarios above.
- `openspec/specs/push-chain-rules/spec.md` — new requirements documenting the Grab interaction.
