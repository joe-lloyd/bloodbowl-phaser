## 1. Dice-roll variation

- [x] 1.1 In `src/ui/sound/catalog.ts`, change the `diceRoll` entry to vary its pattern per trigger (e.g. pick from a small set of note sequences, or randomize notes/timing within the existing voice)
- [x] 1.2 Verify the sound test/audition page still plays a recognizable "dice roll" family of sounds, just not byte-identical every time

## 2. Full sound teardown on leaving a match

- [x] 2.1 Add `SoundManager.stop()` (or `suspend()`) that halts the `@strudel/web` scheduler/audio context
- [x] 2.2 In `SoundSuite`, track every `Audio` instance created by `playSample()` in a `Set`, removing each on its `ended`/`error` handler
- [x] 2.3 `SoundSuite.dispose()` pauses and clears every tracked in-flight `Audio` instance in addition to unsubscribing event bindings
- [x] 2.4 `GamePage.tsx`'s cleanup effect calls `SoundManager.stop()` alongside `suite.dispose()`
- [x] 2.5 Verify a new match's `SoundManager.init()` correctly re-starts after a previous one was stopped (no stale/dead scheduler)

## 3. Relocate mute/volume into Match Options

- [x] 3.1 Add a "panel"/inline-control entry kind to the Match Options menu's entry model (`computeMatchOptionsMenu.ts` and `MatchOptionsMenu.tsx`)
- [x] 3.2 Render `SoundToggle`'s checkbox+slider as that entry inside `MatchOptionsMenu.tsx`
- [x] 3.3 Remove `SoundToggle`'s standalone `absolute top-4 right-4 z-50` rendering from `GameHUD.tsx`
- [x] 3.4 Confirm the relocated control still reads/writes the same persisted mute/volume settings

## 4. Sandbox verification

- [x] 4.1 Manually verify in sandbox mode (browser) that the relocated mute checkbox and volume slider now visibly affect playback, with `SandboxOverlay` no longer overlapping it
- [x] 4.2 If sandbox playback still ignores mute/volume after relocation, investigate whether sandbox mounts its own `SoundManager`/`SoundSuite` instance separately from the settings store, and fix the read path

## 5. Verification

- [x] 5.1 Add/update a unit test asserting `SoundSuite.dispose()` stops tracked in-flight samples
- [x] 5.2 Add/update a unit test asserting `SoundManager.stop()` halts the scheduler
- [x] 5.3 Manually verify: leave a match mid-sound-effect, confirm silence; start a new match, confirm no bleed-through from the old one
- [x] 5.4 Run the full unit test suite and confirm no regressions
