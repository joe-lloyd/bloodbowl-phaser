## 1. Web Audio synthesis engine

- [x] 1.1 Create `src/ui/sound/synth.ts`: shared noise-buffer generator, and primitives `tone(ctx, dest, opts)`, `noiseBurst(ctx, dest, opts)`, `sweep(ctx, dest, opts)`, each returning `{ stop(): void }` and self-cleaning via node `onended`
- [x] 1.2 Rewrite `src/ui/sound/SoundManager.ts`: own the shared `AudioContext` + master `GainNode` (connected to `ctx.destination`), unlock-on-first-gesture via native `resume()`, track every active playback unit in a `Set` for `stop()`
- [x] 1.3 Remove `playOpeningTheme`, `playGameplayTheme`, `playSFX` from `SoundManager`
- [x] 1.4 Wire `soundSettings.subscribe()` into `SoundManager`'s master `GainNode` so mute/volume changes apply instantly to in-flight sound

## 2. Catalog redesign

- [x] 2.1 Rewrite `src/ui/sound/catalog.ts`: each `SoundCatalogEntry.build` becomes a Web Audio recipe using the new primitives instead of a Strudel pattern; remove the `@strudel/web` import
- [x] 2.2 Implement `diceRoll`: randomized multi-tap noise rattle + landing thud (keep per-trigger randomization)
- [x] 2.3 Implement `catch`: bright fast-attack tone + noise snap
- [x] 2.4 Implement `pass`: bandpass-filtered noise sweep (whoosh)
- [x] 2.5 Implement `touchdown`: layered noise swell + randomized short tones (crowd cheer)
- [x] 2.6 Implement `endOfHalf`: single whistle blast (vibrato sine/triangle burst)
- [x] 2.7 Implement `sendOff`: longer/louder whistle blast, distinct from `endOfHalf`
- [x] 2.8 Implement `koInjury`: noise crack transient + low downward-pitch thump (bone-crunch)
- [x] 2.9 Implement `turnoverWhistle` content as a dissonant detuned tone cluster (not a whistle)
- [x] 2.10 Implement `fumble`: descending pitch-bend "boing" (comedic slide)
- [x] 2.11 Implement `ballBounce`: raise base pitch/gain vs. the old entry (brighter, louder)
- [x] 2.12 Implement `knockdown`: keep low pitch, thicken layering and raise gain for audibility
- [x] 2.13 Implement `blockImpact`: thicker layered low thud + sharper noise crack (more punch)
- [x] 2.14 Port remaining entries (`pushback`, `kickoff`, `foul`) onto the new primitives, preserving their existing character
- [x] 2.15 Remove the `uiClick` entry from `CATALOG`/`SoundName`

## 3. Suite/bindings cleanup

- [x] 3.1 Remove the `UI_ActionSelected` → `uiClick` binding from `SoundSuite.mount()`
- [x] 3.2 Remove `uiClick` from `src/ui/sound/bindingLabels.ts`
- [x] 3.3 Confirm `SoundSuite.trigger()`/`dispose()` work unchanged against the new engine's playback-unit shape (adjust the tracked-units generalization if `playOneShot`'s signature changed)

## 4. Drop Strudel dependency

- [x] 4.1 Remove `@strudel/core` and `@strudel/web` from `package.json`; run the package manager to update the lockfile
- [x] 4.2 Delete `src/types/strudel.d.ts`
- [x] 4.3 Grep the repo to confirm no remaining `@strudel/*` imports outside removed code

## 5. SoundTest debug page

- [x] 5.1 Remove the "Music Controls" card (Initialize/Play Opening Theme buttons) from `src/ui/components/pages/SoundTest.tsx`; keep a "Stop All" control wired to `SoundManager.stop()`
- [x] 5.2 Fix `handleBack` to use `useNavigate()` → `navigate("/")` instead of emitting the dead `UI_SceneChange` event
- [x] 5.3 Remove `GameEventNames.UI_SceneChange` and its type entry from `src/types/events.ts` if nothing else references it after the fix

## 6. Tests

- [x] 6.1 Rewrite `__tests__/unit/soundTeardown.test.ts` against the Web Audio engine (stub `AudioContext`/nodes instead of mocking `@strudel/web`); keep equivalent coverage: `SoundManager.stop()` halts all active playback, `SoundSuite.dispose()` stops tracked in-flight units, dice-roll variation still holds
- [x] 6.2 Add a unit test asserting mute/volume changes reach a currently-playing sound's gain (not just gate future triggers)
- [x] 6.3 Add a unit test/assertion that concurrent triggers (e.g. two `diceRoll` triggers in immediate succession) each get independent playback units, none left dangling
- [x] 6.4 Add a unit test for the SoundTest "Back to Main Menu" navigation fix
- [x] 6.5 Run the full unit test suite and confirm no regressions; confirm headless/engine tests still never import the sound system
      — 143/143 test files, 1299/1299 tests passed (`npx vitest run`); headless/rules/engine suites pass unchanged, confirming no sound-system import reached them.

## 7. Verification

- [ ] 7.1 Manually exercise the sound test/audition page in a real browser (or headless Chromium) triggering every catalog entry in rapid succession; confirm (via console/state, since audio can't be heard programmatically) that no entry gets stuck scheduling forever and later triggers are not suppressed
- [ ] 7.2 Manually verify mute/volume slider changes affect a currently-playing sound's `GainNode` value in DevTools
- [ ] 7.3 Manually verify the "Back to Main Menu" button on the sound test page navigates to `/`
