# Architecture

React owns navigation and coaching controls. Phaser renders the pitch. A shared
TypeScript engine owns game rules and runs without a browser through the
headless API and simulation CLI.

## Entry points

| Area            | Start here                                              | Responsibility                                         |
| --------------- | ------------------------------------------------------- | ------------------------------------------------------ |
| Browser startup | [`src/main.ts`](../../src/main.ts)                      | Mount the React app                                    |
| Navigation      | [`App.tsx`](../../src/ui/App.tsx)                       | Menus, teams, competitions and match routes            |
| Match view      | [`GamePage.tsx`](../../src/ui/pages/GamePage.tsx)       | Create and dispose Phaser; connect HUD and match state |
| Scene assets    | [`BootScene.ts`](../../src/scenes/BootScene.ts)         | Load match assets                                      |
| Match rendering | [`GameScene.ts`](../../src/scenes/GameScene.ts)         | Render and interact with the live board                |
| Rule service    | [`GameService.ts`](../../src/services/GameService.ts)   | Engine commands, state and rule orchestration          |
| Headless API    | [`HeadlessGame.ts`](../../src/headless/HeadlessGame.ts) | Command dispatch, snapshots and decisions              |
| Simulation      | [`src/simulation/`](../../src/simulation/)              | Coaches, candidate actions, invariants and recordings  |

Phaser starts for match and Sandbox views. Menu and team pages are React routes;
there is no Phaser menu-scene hierarchy to maintain.

## Commands, rules and presentation

The UI sends actions through the game service. Operations in
[`src/game/operations/`](../../src/game/operations/) resolve gameplay, with
validators, managers and skill hooks enforcing their rules. The flow queue
coordinates paced operations and decisions such as re-rolls or pushes.
[`EventBus`](../../src/services/EventBus.ts) carries engine events to the
presentation layer.

[`src/types/`](../../src/types/) defines live domain objects.
[`RosterTemplates.ts`](../../src/data/RosterTemplates.ts) defines roster data.
[`skillCatalog.ts`](../../src/data/skillCatalog.ts) contains public skill metadata
and original UI hints. Private book files are not runtime dependencies.

[`src/game/presentation/`](../../src/game/presentation/) owns stadium styles and
rendering policy. Sprite animation timing is independent of the render-on-change
optimisation. Art generation is documented in the
[sprite pipeline](../../scripts/sprites/README.md).

## Persistence

Team persistence uses the repository interface in
[`TeamManager.ts`](../../src/game/managers/TeamManager.ts).
[`teamPersistence.ts`](../../src/data/persistence/teamPersistence.ts) normalizes
stored data and hydrates live teams from roster definitions. Signed-out play
uses local storage. Signing in swaps to a cloud-backed team repository.

[`MatchSaveRepository.ts`](../../src/game/persistence/MatchSaveRepository.ts)
stores the local resume point. The save format in
[`serialization.ts`](../../src/headless/serialization.ts) carries teams, engine
state, drive state and replay information. It is separate from the runtime
object graph. Competition persistence lives in
[`src/competition/`](../../src/competition/).

## Online matches

[`OnlineMatch.ts`](../../src/network/OnlineMatch.ts) builds an engine in each
browser. [`LockstepSession.ts`](../../src/network/LockstepSession.ts) exchanges
ordered commands and checks state checksums. A mismatch requests resync.
Firebase provides authentication, storage and transport; it does not run an
authoritative match engine.

Keep changes to command payloads, save data and resync data consistent. These
are external boundaries even when local play also uses their types. Read the
[active lockstep tasks](../../openspec/changes/online-lockstep-play/tasks.md)
and [status page](../STATUS.md#online-play) before changing network behaviour.

## Where to put a change

- Put rule calculations and legality in the engine, with headless behaviour tests.
- Put render state, sprites and camera work in Phaser presentation code.
- Put menus, prompts and player-facing controls in React components.
- Parse persisted and network data at their boundaries before handing it to rules.
- Extend shared scenario cases when behaviour must agree across engine and UI.

See [testing](testing-guide.md) for the checks that exercise these boundaries.
