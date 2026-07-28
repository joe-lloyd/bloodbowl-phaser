## Why

Despite today's `overhaul-sound-system` change (archived 2026-07-28), in-game sound is still broken: the coach reports it gets "stuck" repeating one sound (the dice roll) forever and never advances to new sounds, mute/volume still appear to do nothing, and every effect is described as thin/basic. Root-causing this: `SoundManager`/`catalog.ts` synthesize every one-shot SFX as a `@strudel/web` `Pattern.play()` call. Strudel's scheduler is built for live-coding — `.play()` sets *one* continuously-looping pattern on a shared global scheduler, not independent one-shot voices. `SoundManager.playOneShot()` works around this with a `setTimeout(() => cycle.stop(), durationMs)` hack, but when two sounds trigger close together (dice roll's `minRetriggerMs` is 150ms and it's the single most frequent event in a match), the second `.play()` silently replaces the first pattern on the shared scheduler while the first's stale `setTimeout` later calls `.stop()` on a cycle reference the scheduler has already moved on from — leaving whichever pattern most recently "won" the race looping forever, immune to `SoundSuite`'s own mute/volume gate (which only gates *new* triggers, not an already-looping stray pattern). This single architectural mismatch explains the stuck-loop bug, the apparent mute/volume no-op, and the flat/basic sound quality (Strudel's `note`/`s` mini-notation is a poor fit for layered percussive SFX design). Separately, the sound debug dashboard's "Back to Main Menu" button emits a `UI_SceneChange` event that nothing in the app subscribes to, so it's a dead click.

## What Changes

- **BREAKING**: Drop `@strudel/core`/`@strudel/web` entirely and replace the synthesis layer with a small hand-rolled Web Audio API engine (`AudioContext`, `OscillatorNode`/`AudioBufferSourceNode`/`BiquadFilterNode`/`GainNode`). Every trigger creates its own independent, freshly-allocated nodes — there is no shared "current pattern" slot to race over, so concurrent/rapid triggers can never starve or strand each other.
- Drop the music system entirely: `SoundManager.playOpeningTheme()`/`playGameplayTheme()` and the SoundTest page's "Music Controls" panel are removed. Only SFX remain.
- Redesign every catalog effect as a short layered Web Audio recipe matching the requested character: dice roll (rattling multi-tap noise clicks + a landing thud, still randomized per trigger), catch (bright quick transient), pass (filtered noise whoosh sweep), touchdown (layered crowd-roar noise swell), end of half (single whistle blast), send-off (a stronger/longer single whistle blast), KO/injury (bone-crunch: noise burst + pitch-drop thump), turnover (dissonant detuned buzz — "bad news" register), fumble (comedic descending pitch-bend "boing"), ball bounce (brighter/louder than before), knockdown (kept low-pitched, but louder/clearer), block impact (thicker, punchier layered thud). Drop the `uiClick` sound and its binding to `UI_ActionSelected` entirely.
- Master mute/volume become instant and reliable: all sources route through one master `GainNode` whose gain is driven directly by the persisted `soundSettings` store, so toggling mute silences in-flight sound immediately (not just future triggers) and volume changes apply live.
- Fix the sound debug dashboard's "Back to Main Menu" button: replace the dead `eventBus.emit(UI_SceneChange, ...)` call with `useNavigate()` → `navigate("/")`, matching how every other page navigates home.
- Update/replace the existing Strudel-mocking unit tests (`__tests__/unit/soundTeardown.test.ts`) for the new Web Audio-based engine, keeping equivalent teardown/mute/dice-variation coverage.

## Capabilities

### Modified Capabilities
- `sound-effects`: synthesis engine changes from `@strudel/web` to native Web Audio API; music entirely removed; `uiClick` removed from the catalog; mute/volume apply instantly to in-flight sound, not just new triggers; catalog effect character requirements added for the effects called out as too basic (dice roll, catch, pass, touchdown, end of half, send-off, KO/injury, turnover, fumble, ball bounce, knockdown, block impact); "stays out of the engine import chain" requirement now references the Web Audio engine instead of `@strudel/web`.

## Impact

- `package.json` / `pnpm-lock.yaml` — remove `@strudel/core`, `@strudel/web`.
- `src/types/strudel.d.ts` — removed (no longer needed).
- `src/ui/sound/SoundManager.ts` — rewritten: owns the shared `AudioContext` + master `GainNode`, exposes `init()`/`stop()`/`playOneShot()`-equivalent built on native nodes; `playOpeningTheme`/`playGameplayTheme`/`playSFX` removed.
- `src/ui/sound/catalog.ts` — every entry's `build` becomes a Web Audio recipe (oscillators/noise buffers/filters/envelopes) instead of a Strudel pattern string; `uiClick` entry removed.
- `src/ui/sound/SoundSuite.ts` — trigger/mute/volume path adapted to the new engine; `UI_ActionSelected` binding removed.
- `src/ui/sound/settings.ts` — unchanged in shape; now drives the master `GainNode` directly for instant mute/volume.
- `src/ui/sound/bindingLabels.ts` — drop `uiClick` entry.
- `src/ui/components/pages/SoundTest.tsx` — "Music Controls" panel removed; "Back to Main Menu" button fixed to use `useNavigate()`.
- `__tests__/unit/soundTeardown.test.ts` — rewritten against the Web Audio engine (no more `vi.mock("@strudel/web", ...)`).
- `openspec/specs/sound-effects/spec.md` — delta spec for the above.
