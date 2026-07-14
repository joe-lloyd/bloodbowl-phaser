# Design: add-sound-effects-suite

## Context

`SoundManager` (Strudel) can synthesize audio and already handles AudioContext unlock-on-click, but it is constructed inside `ServiceContainer`, giving the engine a hard dependency on `@strudel/web` — a browser-only package whose import crashes plain Node (hit during the headless CLI work; worked around by keeping headless off the `ServiceContainer` path). Gameplay currently triggers no sounds; only the SoundTest page calls it.

## Goals / Non-Goals

**Goals:**

- Every significant interaction has a distinct, immediate sound.
- Bindings are declarative data (event name → effect name), trivially extendable when new events appear (e.g. `KORecoveryRolled` from fix-halftime-drive-reset).
- Sound is physically incapable of breaking the engine or headless mode.
- User control: mute + volume, persisted.

**Non-Goals:**

- Music/ambience system beyond the existing opening theme.
- Positional/spatial audio, commentary, or voice.
- A licensed sample library (synthesis first; samples can override later without spec change).

## Decisions

### 1. Event-driven SoundSuite, zero engine changes

A single `SoundSuite` class subscribes to the shared EventBus in the React/Phaser layer (mounted once in `App`/`GamePage`). It owns a `Record<GameEventName, SoundName>` binding table plus per-sound definitions. Alternative — sprinkling `playSFX` calls through managers/operations — rejected: it recreates the UI-in-engine coupling this codebase just paid to remove.

### 2. SoundManager moves to src/ui/sound/

`ServiceContainer` drops its `soundManager`; the UI constructs it. This makes the "no `@strudel/web` in the engine chain" rule structural instead of accidental. The import-boundary is enforced by a test that imports every `src/game` + `src/services` + `src/headless` module in Node (the existing headless suite effectively does this).

### 3. Strudel synthesis as the default source

Each catalog entry is a small synth definition (Strudel pattern/one-shot). No binary assets, no licensing, instant tweakability, and consistent with the existing dependency. Catalog entries may declare an optional `sampleUrl` (from `public/assets/sounds/`) which takes precedence when present — the upgrade path to recorded samples requires no code change.

### 4. Priority + throttling instead of raw fan-out

Busy sequences (block → armour → injury → casualty) can emit many events in ~1s; the suite gets simple rules: per-sound minimum re-trigger interval, and a small priority scale so a touchdown/whistle interrupts lesser effects. Alternative (play everything) — rejected: chains of 5 overlapping synth hits sound like noise.

### 5. Settings via localStorage

`{muted: boolean, volume: 0..1}` read at mount, written on change, exposed through a small settings hook + UI toggle in the HUD. No engine involvement.

## Risks / Trade-offs

- [Synthesized effects may sound cheap] → catalog is data; per-sound sample overrides are the escape hatch, and the audition page makes iteration fast.
- [AudioContext autoplay policies] → reuse SoundManager's existing unlock-on-first-click flow; suite queues nothing before unlock (drops early sounds silently).
- [Event storms during operation chains] → throttle/priority rules above; tuned on the audition page.

## Migration Plan

Move `SoundManager` first (mechanical; update SoundTest page + `ServiceContainer`), then land the suite + bindings, then settings. Each step keeps tests green; no persisted-data migration.

## Open Questions

- Exact catalog list finalization (start with ~14 in the proposal; audition page will drive additions).
- Whether the Phaser scene should also duck/pause sounds when the tab loses focus (browser default behavior may suffice).
