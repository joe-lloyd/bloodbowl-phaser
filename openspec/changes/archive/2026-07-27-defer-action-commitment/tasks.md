# Tasks: defer-action-commitment

## 1. The commitment predicate

- [x] 1.1 Promote `cancelAction`'s inline test into a named `isActionCommitted(playerId)` on `PlayerActionManager`, covering movement used, block replacement used, already activated, and an explicit committed flag
- [x] 1.2 Have the predicate report which term committed the action so refusals can name it
- [x] 1.3 Point `cancelAction` at the predicate and remove its duplicated conditions

## 2. Move the turn flags to commitment

- [x] 2.1 Set `hasBlitzed`/`hasPassed`/`hasHandedOff`/`hasFouled` at the commit transition instead of in `declareAction`
- [x] 2.2 Delete the per-action flag-undo ladder from `cancelAction` now that an uncommitted declaration never set a flag
- [x] 2.3 Mark the activation committed at the first die roll, first movement step, and activation finalization
- [x] 2.4 Commit the declaration in `ActivationGateOperation` before the gate rolls, so a passed or failed gate both spend the action

## 3. Releasing a declaration

- [x] 3.1 Attempt a release when the coach selects another player or deselects while a declaration is live; refuse the selection change with the reason when the action is committed
- [x] 3.2 Let `declareAction` replace an uncommitted declaration for the same player instead of refusing
- [x] 3.3 Expose release as a coach intent through the network proxy and the headless protocol, resolved authoritatively by the host
- [x] 3.4 Refresh the action window, availability, and turn-flag HUD when a release restores an allowance

## 4. Making Distracted visible

- [x] 4.1 Draw the tackle-zone overlay from `hasTackleZone(op)` instead of `op.status === "Active"`
- [x] 4.2 Add a condition treatment to `PlayerSprite`, distinct from the Prone and Stunned status colours, applied while Distracted
- [x] 4.3 Name the active condition in `PlayerInfoPanel`
- [x] 4.4 Clear the treatment and restore the drawn tackle zone when the condition clears

## 5. Verification

- [x] 5.1 Seeded scenario: declare Blitz, select another player, assert the Blitz is available and nobody is marked activated
- [x] 5.2 Seeded scenario: declare Blitz, move one square, attempt to select another player — assert refusal and that the Blitz stays spent
- [x] 5.3 Seeded scenario: Bone-head fails its gate — assert Distracted, activation ended, and Blitz spent
- [x] 5.4 Regression: a Distracted player draws no tackle-zone squares and blocks no dodge modifier, and both return when the condition clears
- [x] 5.5 Online test: a guest's release is proxied and both coaches see the restored allowance
- [x] 5.6 Resume test: a match saved with a live uncommitted declaration restores with the allowance intact
- [x] 5.7 Run the unit, rule-scenario, and headless suites and report the result
