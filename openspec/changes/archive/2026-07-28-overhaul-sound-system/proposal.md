## Why

Three sound complaints point at the same underlying gaps in `src/ui/sound/`: (1) the dice-roll effect is one fixed four-note pattern (`catalog.ts`'s `diceRoll` entry) played identically for every roll regardless of outcome, so repeated rolls sound like "boom boom boom boom" with no variation, and the mute/volume controls appear unresponsive in sandbox mode even though `SoundSuite.trigger()` reads live settings on every call — the real issue there looks like a layout collision (`SoundToggle` and `SandboxOverlay` both pinned to the same HUD corner) rather than a logic bypass; (2) leaving a match (`GamePage.tsx`'s cleanup effect) only calls `suite.dispose()`, which unsubscribes event bindings but never stops the underlying `@strudel/web` scheduler or any in-flight `new Audio(url)` sample, so music/samples can keep playing after the scene is gone — `openspec/specs/scene-lifecycle-teardown` covers engine/event-bus teardown but has no audio-teardown requirement at all; (3) the mute/volume popup (`SoundToggle.tsx`) is pinned `absolute top-4 right-4`, the same corner as other HUD elements, and should live inside the existing bottom-right Match Options menu (`MatchOptionsMenu.tsx`) instead of floating on its own.

## What Changes

- The dice-roll sound SHALL vary (e.g. by roll outcome or a small randomized variation) rather than playing one identical fixed pattern every time.
- Leaving a match (unmounting the game page / tearing down the scene) SHALL fully stop all sound: the `@strudel/web` scheduler/audio context SHALL be stopped or suspended, and any in-flight one-shot sample playback SHALL be tracked and stopped, not merely have its event bindings unsubscribed.
- The mute toggle and volume control SHALL move from their own floating top-right popup into the existing bottom-right Match Options menu, as a new option entry that hosts an inline control (not just a label/action row) — the Match Options menu entry model SHALL gain a "panel" or "control" entry variant that can render a mute checkbox and volume slider in place of a simple action button.
- Sandbox mode SHALL be confirmed (and covered by a test) to route dice/mute/volume through the same `SoundSuite`/settings path as a normal match; if the corner-overlap with `SandboxOverlay` is the actual cause of "doesn't do anything," the sound control's relocation into Match Options resolves it as a side effect.

## Capabilities

### Modified Capabilities
- `sound-effects`: dice-roll variation, and a new requirement that leaving a match fully stops all sound playback (scheduler and in-flight samples), not just event bindings.
- `in-match-options-menu`: a new "panel" entry type that can host an inline control (checkbox + slider), used to relocate the mute/volume control into the menu.

## Impact

- `src/ui/sound/catalog.ts` — `diceRoll` entry gains variation.
- `src/ui/sound/SoundSuite.ts` — `dispose()` and `playSample()`: track in-flight `Audio` instances so they can be stopped; ensure teardown fully silences output.
- `src/ui/sound/SoundManager.ts` — expose a `stop()`/`suspend()` that fully halts the `@strudel/web` scheduler/audio context, called from `GamePage.tsx`'s cleanup instead of (or in addition to) `suite.dispose()`.
- `src/ui/pages/GamePage.tsx` — cleanup effect calls the new stop path.
- `src/ui/components/hud/SoundToggle.tsx` — becomes the control rendered inside a Match Options entry instead of its own floating popup.
- `src/ui/components/hud/MatchOptionsMenu.tsx` / `computeMatchOptionsMenu.ts` — new entry variant for an inline control; `GameHUD.tsx` stops rendering `SoundToggle` as a separate `absolute top-4 right-4` overlay.
- `openspec/specs/scene-lifecycle-teardown` is not modified by this change (audio teardown is now owned by `sound-effects`'s own requirement instead).
