# scene-lifecycle-teardown Specification

## Purpose
TBD - created by archiving change fix-drive-transition-lifecycle. Update Purpose after archive.
## Requirements
### Requirement: A shut-down scene has no live event subscriptions
When a match scene shuts down or is destroyed, its orchestrator, active phase handler, controllers, and every event-bus subscription they registered SHALL be removed. No handler holding a reference to that scene SHALL remain subscribed to the shared event bus.

#### Scenario: Leaving a match unsubscribes its handlers
- **WHEN** a match scene is shut down
- **THEN** the orchestrator is destroyed, the active phase handler is exited, and none of their event-bus listeners remain registered

#### Scenario: Events after shutdown reach no stale handler
- **WHEN** a kickoff event is emitted after a scene has shut down
- **THEN** no handler belonging to that shut-down scene runs

### Requirement: A second match in the same session starts clean
Starting a new match without reloading the page SHALL produce a scene whose handlers, service container, and event subscriptions belong only to that new match. The previous match's state SHALL NOT influence it.

#### Scenario: Second match kickoff does not crash
- **WHEN** a coach finishes or leaves a match and starts a second match in the same browser session, then reaches the kickoff
- **THEN** the ball is placed and the kickoff resolves with no error, and specifically no null-scene error from creating the ball sprite

#### Scenario: Service container is reset before the new scene is built
- **WHEN** a new match is started in the same session
- **THEN** the previous match's service container is reset before the new scene is created, so the new scene never observes the old container

### Requirement: Creating scene visuals on an inactive scene is a no-op
Factory paths that create sprites or containers — including the ball sprite, player sprites, and dugouts — SHALL return without effect when the owning scene is no longer active, and SHALL log a warning identifying the scene. They SHALL NOT throw.

#### Scenario: Ball placement on a dead scene does not throw
- **WHEN** ball placement is invoked on a scene that has already shut down
- **THEN** no sprite is created, no error is thrown, and a warning naming the scene is logged

#### Scenario: The guard does not hide ordering problems
- **WHEN** the inactive-scene guard triggers
- **THEN** a warning is logged so the leaked call is visible during development

