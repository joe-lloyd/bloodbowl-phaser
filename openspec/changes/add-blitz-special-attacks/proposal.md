## Why

Block-replacing Special Actions can be declared while standing adjacent to an opponent, but the browser does not consistently let the same player use that attack as the Block portion of a Blitz. Stab, Chainsaw, Breathe Fire, Monstrous Mouth, and Projectile Vomit need one shared declaration model so their direct and Blitz variants obey the same targeting, turn budget, and activation rules.

## What Changes

- Offer each eligible adjacent attack as a direct Special Action.
- Offer a distinct `Blitz (with <attack>)` action for every eligible block-replacing attack on the player.
- Spend the team's single Blitz declaration and normal movement allowance, then resolve the selected Special Action instead of Block when a target is reached.
- Prevent a player from both using the selected replacement and making a normal Block in the same Blitz activation.
- Carry the declared replacement through browser, headless, and online protocols with identical legality and ownership checks.
- Add roster-authentic seeded scenarios for Stab, Chainsaw, Breathe Fire, Monstrous Mouth, and Projectile Vomit.

## Capabilities

### New Capabilities

### Modified Capabilities
- `skill-rules`: block-replacing Special Actions gain explicit direct-action and Blitz-replacement declaration, targeting, and completion requirements.

## Impact

- Action availability and declaration: `actionAvailability`, `GameplayInteractionController`, action menus, activation state, and turn flags.
- Rule operations: Stab, Chainsaw, Breathe Fire, Chomp/Monstrous Mouth, and Projectile Vomit.
- Protocol/network: headless command schema, legal actions, ownership gating, host/guest synchronization.
- Scenarios/tests: skill rule scenarios using players and teams that possess each skill naturally.
