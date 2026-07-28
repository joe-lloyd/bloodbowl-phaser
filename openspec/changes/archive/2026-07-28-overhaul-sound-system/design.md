## Context

`src/ui/sound/` is a self-contained layer: `SoundManager` wraps `@strudel/web`'s global scheduler/`AudioContext`; `SoundSuite` binds `catalog.ts` effects to `EventBus` events and also fires one-shot samples via bare `new Audio(url)` with no reference retained (`SoundSuite.playSample`). `GamePage.tsx` mounts one `SoundManager`/`SoundSuite` pair per page visit and on unmount calls only `suite.dispose()`, which (per `SoundSuite.ts`) unsubscribes its event bindings — it never calls into `SoundManager` to stop the scheduler, and has no way to reach any `Audio` object already playing. Separately, `SoundToggle.tsx` (mute checkbox + volume slider) is rendered by `GameHUD.tsx` as its own `absolute top-4 right-4 z-50` overlay, sharing the same screen corner as `TurnIndicator`/`SandboxOverlay`/`PlayerInfoPanel`; `MatchOptionsMenu.tsx` already owns the bottom-right corner with a labelled trigger and a list of simple action entries (`computeMatchOptionsMenu.ts`), but its entry model has no variant for an inline interactive control.

## Goals / Non-Goals

**Goals:**
- Stop all sound reliably when a match/scene is left.
- Make the dice-roll sound less monotonous.
- Move mute/volume into the existing bottom-right menu rather than a competing floating popup.

**Non-Goals:**
- A general audio-engine rewrite or new sound catalog entries beyond dice-roll variation.
- Changing `@strudel/web` itself or the event→sound binding architecture — only teardown and dice-roll content change.
- Diagnosing sandbox mute/volume as a separate code-level bug before confirming the corner-overlap isn't the actual cause; if the relocation doesn't fully resolve it, that's follow-up work, not blocked by this change.

## Decisions

- **`SoundManager` gets an explicit `stop()`** that suspends/closes the underlying audio context (or calls `@strudel/web`'s equivalent stop-all), called from `GamePage.tsx`'s cleanup alongside (not instead of) `suite.dispose()`.
- **`SoundSuite` tracks in-flight `Audio` instances in a `Set`**, removing each on its `ended`/`error` event, and `dispose()` pauses and clears every tracked instance — closing the "sample keeps playing after teardown" gap without changing the fire-and-forget call sites.
- **Dice-roll variation is a content change in `catalog.ts`, not a new architecture**: vary the synthesized pattern per call (e.g. picking from a small set of note sequences, or randomizing the specific notes/timing within the existing `sine*4` voice) so repeats don't sound identical, while keeping the binding model (`DiceRoll` event → catalog entry) unchanged.
- **Match Options menu gains a new entry kind** (e.g. `{ type: "panel"; render: () => ReactNode }` alongside the existing action-entry shape) specifically so `SoundToggle`'s checkbox+slider can be dropped in as one entry without inventing a second menu system. `GameHUD.tsx` stops rendering `SoundToggle` as its own top-right overlay.

## Risks / Trade-offs

- [Suspending/closing the shared `AudioContext` on every page leave could make the next match's first sound feel delayed while it re-inits] → acceptable; `SoundManager.init()` already runs on mount and is expected to have some startup cost, matching today's behavior on first load.
- [A "panel" entry type is a small API expansion to `in-match-options-menu`, which today only knows simple actions] → scoped narrowly (one new entry kind) rather than a general menu redesign, and covered by the existing menu's keyboard/accessibility requirement.
