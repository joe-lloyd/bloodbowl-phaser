## Context

`KickoffEventManager` owns `this.step: KickoffEventStepState | null` as private mutable state. `openStep()` and `finishStep()` do assign fresh values (`this.step = {...}` / `this.step = null`), so a step *starting* or *ending* always produces a new reference and re-renders correctly. But every mutation that happens *during* a step's lifetime — `togglePlayerSelection` pushing/splicing `selectedPlayerIds`, `movePlayer`/`placePlayer` pushing `movedPlayerIds`, `confirmStep` attaching a `charge` sub-object, `advanceCharge` reassigning `charge.activePlayerId` and shifting `charge.queue` — mutates the existing object/sub-object in place. `KickoffEventOverlay.tsx`'s `refresh()` calls `setStep(gameService.getKickoffEventStep())`, and since `getKickoffEventStep()` returns that same `this.step` reference, React's `Object.is` bailout in `useState` means the component does not re-render for any of these in-step mutations — only for the start/end transitions. This one root cause explains both the frozen x/x counter and the "Charge looks broken" symptom (the overlay keeps showing the first Charge! player's name/instruction forever).

Separately, the kickoff table roll firing twice for one drive (refresh → different result) is a distinct area: `BallManager` has two paths that call `resolveKickoffEvent()` (inside `executeKick()`'s normal flow, and the standalone public `rollKickoff()`), and `RNGService` already has `getState()`/`setState()` capturing `currentSeed` (the PRNG's current position, not just its original seed) — so the primitives for correct persistence exist; the bug is more likely a re-invocation of the resolve step rather than a missing seed-position save, but this needs verification against the actual save/restore call path before concluding a fix.

Finally, the HUD stacking issue is purely a layout/order issue: `GameHUD.tsx` renders `PlayerInfoPanel` before `KickoffEventOverlay` in the same normal (non-reversed) flex column, and `PlayerInfoPanel`'s own container uses `flex flex-col-reverse`, which puts its later JSX children (hovered content) visually above its earlier ones (selected content).

## Goals / Non-Goals

**Goals:**
- Kickoff step UI (counter, Charge! active player, instructions) always reflects current engine state.
- A drive's kickoff table resolves exactly once, surviving a mid-kickoff page refresh without changing the result.
- Kickoff panel stays visually fixed regardless of hover; order is kickoff notes → selected → hovered.

**Non-Goals:**
- Redesigning `KickoffEventManager`'s internal step-mutation model — it can keep mutating in place internally; only the external read boundary (`getStep()`) needs to stop leaking the same reference.
- A general HUD layout overhaul — only the relative order/positioning of these three specific blocks.

## Decisions

- **`getStep()` returns a deep-enough copy**: `{ ...this.step, selectedPlayerIds: [...], movedPlayerIds: [...], awaitingPlacement: [...], charge: this.step.charge ? { ...this.step.charge, queue: [...this.step.charge.queue] } : undefined }`. This is the minimal, lowest-risk fix — it changes nothing about internal mutation logic, only what callers observe.
- **Kickoff-roll-once guard**: track whether the current drive's kickoff has already resolved (e.g. a `kickoffResolvedForDrive: boolean` alongside existing drive-scoped state, cleared in the same end-of-drive teardown that clears `DriveEffects`), and have `resolveKickoffEvent`/`rollKickoff` no-op (or replay the stored outcome) if it's already true for this drive. This needs confirming against how `GameStateRestored`/match resume actually re-enters the kickoff phase before finalizing the exact guard location.
- **HUD order fix**: move `<KickoffEventOverlay />` before `<PlayerInfoPanel />` in `GameHUD.tsx`'s right column, and change `PlayerInfoPanel`'s outer container from `flex-col-reverse` to `flex-col` (with selected rendered before hovered in JSX, matching normal top-to-bottom order) so hovering never touches the kickoff panel's position and the visual order becomes kickoff → selected → hovered.

## Risks / Trade-offs

- [Deep-copying the step on every `getStep()` call adds allocation on a hot path (called on every relevant event)] → negligible; step objects are small (a handful of ids), and this only happens while a kickoff step is open, a small fraction of total play time.
- [The exact root cause of the seeding/reroll bug is not yet confirmed] → scoped as an investigation + regression-test task rather than a blind fix, per the project's convention of locking rule fixes with a seeded scenario once understood.
