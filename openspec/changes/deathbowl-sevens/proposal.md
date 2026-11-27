## Why

The owner wants Deathbowl Sevens, the NAF's four-team variant, as an experimental mode behind the admin menu, played end to end against computer coaches. The engine plays exactly two teams with one ball on a rectangle where both teams attack along x. `docs/GAME_TYPES.md` left Deathbowl out for that reason. Four teams, two balls and four attack directions have to become part of the engine's shape, not a layer bolted beside it.

## What Changes

- The match engine becomes N-seat. A match has an ordered list of seats, each with a team and a frame: its attack direction and the geometry that follows from it. Sevens, Street, Beach and Gutter Bowl become the two-seat case and stay bit-identical.
- Balls become a list of one or two. Per-turn action limits become a ledger: Blitz and Foul per opposing team, Pass and Hand-off per ball.
- The drive-based match flow moves behind a `MatchFlow` seam, beside a continuous Deathbowl flow.
- Deathbowl rules arrive as one variant: the plus pitch, set-up in turn order, two balls at the centre, continuous touchdowns, cross-team assists, interception order across teams, points and placings.
- The computer coach reads a board from any seat and gets Deathbowl evaluation weights fitted from four-seat self-play.
- The browser gets the plus pitch, four kits and dugouts, a four-row scoreboard, the new prompts, a placings screen and an admin-only entry with local save and resume.
- `pnpm parity` proves each engine change keeps two-team matches identical.

## Capabilities

### New Capabilities

- `deathbowl-sevens`: a four-team, two-ball match on a plus pitch with its own rules, flow, result, computer coach and admin-only entry.
- `match-parity`: a repeatable check that an engine change leaves the final state of 330 two-team planner matches unchanged.

### Modified Capabilities

None. Every existing game type keeps its rules and its results.

## Impact

Touches the rules engine (`src/game`, `src/services/gameService`), headless and serialization (`src/headless`, `src/boundary/schemas`), the computer coach (`src/simulation`), the Phaser board and HUD (`src/scenes`, `src/game/elements`, `src/ui`), and the simulation scripts. No Firestore schema or rules change: Deathbowl is local, an exhibition, and saves to its own local slot. No new dependencies. About 20 pull requests, each one purpose, each engine PR gated by `pnpm parity`.
