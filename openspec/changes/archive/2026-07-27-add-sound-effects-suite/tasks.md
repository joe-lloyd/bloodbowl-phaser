# Tasks: add-sound-effects-suite

## 1. Decouple sound from the engine

- [x] 1.1 Move `SoundManager` to `src/ui/sound/SoundManager.ts`; remove `soundManager` from `ServiceContainer`; update `SoundTest` page imports
- [x] 1.2 Verify no `src/game`/`src/services`/`src/headless` module reaches `@strudel/web` (headless suite in Node is the regression gate)

## 2. Sound suite

- [x] 2.1 Define the catalog type (`name`, synth definition, optional `sampleUrl`, priority, minimum re-trigger interval) and the ~15 starter entries
- [x] 2.2 Implement `SoundSuite`: EventBus subscriptions, binding table (event → sound), priority/throttle rules, unlock-on-first-click handling reused from `SoundManager`
- [x] 2.3 Mount the suite once in the UI shell (`App`/`GamePage`), active during gameplay only

## 3. Settings & audition

- [x] 3.1 Mute + volume settings persisted in localStorage, HUD toggle, applied to all playback
- [x] 3.2 Extend the SoundTest page into an audition board listing every catalog entry with its binding(s)

## 4. Verification

- [ ] 4.1 Manual browser pass: block chain, kickoff, pickup fumble, turnover, touchdown each audibly distinct; no audio spam during operation chains
- [x] 4.2 Full test suite green; headless CLI still starts in plain Node
