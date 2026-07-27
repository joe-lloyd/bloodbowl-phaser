## Context

Several reported defects share the same boundary problem: the rules engine reaches the
correct outcome, but the scene does not consistently reconcile every visual and
interaction affordance with the resulting match state. Mid-route pickups, casualty
movement, restored activation state, and Punt declarations all pass through different
operation/event paths today, which makes one-off visual fixes easy to miss.

## Goals / Non-Goals

**Goals:**

- Make canonical match state the source of truth for ball, dugout, activation, and Punt
  presentation.
- Make reconciliation idempotent so resume, replay, and repeated events cannot duplicate
  sprites or transitions.
- Add deterministic headless regression scenarios for every reported defect.
- Keep animation events observable so selected scenarios can also have screenshot
  baselines.

**Non-Goals:**

- Redesign the pitch, dugouts, or activation visual language.
- Change pickup, casualty, activation, or Punt rules.
- Introduce a second visual-only persistence model.

## Decisions

### Reconcile affected entities after authoritative state transitions

The scene will expose small reconciliation functions for ball ownership/location, player
pitch/dugout location, and activation styling. Operations update match state first and
then emit enough context for the scene to reconcile the affected entity. Restore uses
the same functions over the full state.

This is preferred over adding more imperative sprite moves to each rule branch because
those moves drift from save/resume and replay paths.

### Treat ball possession as one mutually exclusive visual state

At any instant the ball is either loose at one square or carried by one player. Applying
one representation removes the other before creating or attaching the desired visual.
The carrier marker is derived from the same possession state.

### Complete casualty relocation in the resolution operation

When an injury resolves to Knocked Out, the player leaves the pitch occupancy model and
enters the correct dugout box in the same operation. The scene transition may animate,
but input and subsequent rules observe the completed state immediately.

### Give Punt a declaration event before resolution

Punt will emit an explicit declaration/animation event before the kick/scatter operation
continues. Headless mode acknowledges that event without rendering; graphical clients
play the kick animation and then acknowledge it.

### Test state first and screenshots selectively

Every regression gets headless state and event assertions. A small stable subset also
gets screenshot baselines for loose-ball removal, KO placement, restored activation, and
Punt declaration. This avoids making all gameplay coverage dependent on pixel rendering.

## Risks / Trade-offs

- **Legacy event handlers may still mutate sprites directly** → Route touched paths
  through reconciliation and assert there is exactly one ball visual and one player
  location.
- **Animation acknowledgement could stall headless runs** → The headless adapter
  auto-acknowledges presentation events while still recording them.
- **Screenshot baselines can be platform-sensitive** → Use fixed viewport, fonts, seed,
  camera position, and only stable checkpoints.

## Migration Plan

Existing saves require no schema migration. On load, the scene rebuilds the affected
visuals from existing canonical match state. Regression scenarios will be added before
removing any legacy direct sprite updates.
