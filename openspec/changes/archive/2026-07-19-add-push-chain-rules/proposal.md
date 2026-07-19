# Proposal: add-push-chain-rules

## Why

`BlockManager.executePush` moves the pushed player one square and stops. When every push square is occupied nothing legal happens (no chain push), and when a player is pushed at the sideline/end zone with nowhere to go there is no crowd-surf — so a whole dimension of Blood Bowl positional play (surfing opponents, chain-shoving cages) simply doesn't exist. This is the last open item on the playtest bug list.

## What Changes

- **Chain pushes** (rulebook p.55): when the pushed player's only push squares are occupied, the occupant is pushed onward as if pushed themselves — recursively. The coach of the **original blocker** chooses every push direction in the chain. Prone/stunned players can be chain-pushed. Surfaces as repeated push-direction decisions (browser dialog / headless `pendingDecision`) attributed to the blocking coach.
- **Pushed into the crowd** (p.55/p.68): a player at the sideline or end zone with no unoccupied push square is pushed off the pitch: immediate **Injury by the Crowd** roll — no armour roll; a Stunned result becomes Reserves instead. If they held the ball, it is **thrown in** from the sideline square; if they were on the active team, it's a **turnover**.
- **Throw-in**: ball re-enters via the throw-in template (direction + distance dice per p.73), then normal bounce/catch resolution at the landing square.
- Push-direction option generation extends to include occupied squares (chain) and the off-pitch "crowd" pseudo-direction when applicable — the existing `push-direction` decision machinery carries all of it.
- Works identically in browser and headless; deterministic under seed.

## Capabilities

### New Capabilities

- `push-chain-rules`: Chain push resolution (recursive pushes, blocker's coach chooses all directions, prone/stunned chainable), crowd-surf (injury by the crowd, stunned→reserves, turnover for active team), and ball throw-in from crowd pushes.

### Modified Capabilities

- `action-protocol`: The `push-direction` pending decision may occur multiple times per block (chain) and its options may include occupied squares and a crowd exit; documented as a delta.

## Impact

- **Modified code**: `BlockManager` (executePush → chain/crowd resolution), `BlockResolutionService.getValidPushDirections` (occupied + off-pitch options), `InjuryOperation`/new `CrowdInjuryOperation`, `BallManager` (throw-in), `types/events.ts` (`PlayerPushedIntoCrowd`, `BallThrownIn`).
- **Headless**: `HeadlessGame` push-direction interception already generic; chain repetition needs no protocol change beyond the delta.
- **UI**: existing push-direction selection reused per chain link; crowd result notification.
- **Tests**: seeded chain-push and crowd-surf scenarios; full suite stays green.
