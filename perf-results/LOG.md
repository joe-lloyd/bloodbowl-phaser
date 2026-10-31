# Browser cost hill climb

`pnpm perf` builds the app in e2e mode, opens the `pickup-success-seeded`
sandbox at 1440x900, and measures two windows per run: 30 s idle on the
board, then 20 s covering a move, a pick-up and its dice roll. It runs
twice per config: headless SwiftShader, which is what the online-match rig
uses, and headed Chromium on the real GPU. Numbers are the median of 3 runs.
The JSON for each run sits next to this file.

Under SwiftShader the GPU process is saturated. A cheaper frame shows up as
more frames per second at the same CPU, so watch `cpuMsPerFrame` and
`drawFps` there, not only `cpuPct`.

## Baseline: main @ 27d73a4

Load average 17 to 24 on old-mac while the online match ran.
GPU renderer: Intel UHD Graphics 630 through ANGLE Metal.

| window             | cpu % | gpu proc % | renderer % | draw fps | cpu ms/frame | frame p95 ms |
| ------------------ | ----: | ---------: | ---------: | -------: | -----------: | -----------: |
| swiftshader/idle   |   642 |        639 |          3 |      6.2 |         1038 |          217 |
| swiftshader/action |   633 |        624 |          7 |      5.7 |         1107 |          233 |
| gpu/idle           |    46 |         36 |         10 |     60.6 |          7.7 |           18 |
| gpu/action         |    93 |         67 |         21 |     60.1 |         15.6 |           18 |

File: `2026-10-31T07-27-38-727Z.json`.

## Profile notes before round 1

Measured with one-off probes in the SwiftShader config:

- Sleeping Phaser's loop takes the browser from 640% to 0%. The HUD and
  the page cost nothing; the Phaser canvas is the whole bill.
- Phaser issues 2 draw calls a frame and uploads no textures. There are
  only 277 game objects.
- Hiding the three stadium images, each 3171x2226 and drawn over the full
  screen, raises Phaser from 6.7 to 15.5 fps. A 720x450 viewport raises it
  to 24 fps. The cost is per pixel.
- An empty camera still costs 113% at 60 fps.
- Players loop a 6 fps idle animation unless reduced motion is on, so the
  board never truly stands still.
- After a roll the dice tray keeps redrawing its held dice every frame
  until the next roll. In the GPU config that doubles draw calls per second.

## Attempts

### Round 1: stop redrawing held dice once they are still. Reverted.

Hypothesis: after a roll the tray redraws its lifted dice every frame until
the next roll, so stopping once they are still saves that work.

The draw count fell in the action window, from 246 to 197 per second in the
GPU config, and a probe showed no dice draws after the roll. CPU did not
fall: gpu/action went from 93% to 97% (`07-39-33-194Z`). The tray already
stops the dice a few seconds after they land, so only that gap was saved.

To see the state a match sits in most, the bench gained a third window,
`held`: 20 s right after the roll. Baseline with it (`07-51-11-270Z`,
load 19 to 28):

| window             | cpu % | draw fps | cpu ms/frame |
| ------------------ | ----: | -------: | -----------: |
| swiftshader/idle   |   644 |      6.2 |         1038 |
| swiftshader/action |   636 |      5.8 |         1106 |
| swiftshader/held   |   671 |      5.8 |         1156 |
| gpu/idle           |    47 |     60.7 |          7.7 |
| gpu/action         |    92 |     60.3 |         15.3 |
| gpu/held           |    84 |     61.0 |         13.7 |

Round 1 under the same bench (`08-08-27-538Z`): gpu/action 102%, gpu/held
87%. SwiftShader idle read 809% at 10.6 fps because the load fell to 16,
which shows how much SwiftShader numbers follow the machine's load.
Decision: revert. No gain beyond noise.

Probe findings from this round, in the GPU config after the roll:

- The board costs 83% after the roll and 44% before it, with the same
  2 draw calls per frame from Phaser.
- With Phaser's loop asleep the page still costs 28%. Stopping the one
  `animate-pulse` element, the ◄ arrow in the action stepper, brings that
  to 7%. With Phaser running it is worth about 10%.

### Round 2: skip Phaser's render when nothing on screen changed. Kept with round 3.

Hypothesis: Phaser clears and redraws the canvas 60 times a second on a
still board. Reading what a frame would draw after each update, and
skipping the draw when it matches the last frame drawn, saves that work.

A probe first: on the idle board no tweens or timers run. The only change
is the players' 6 fps idle animation, and because each player starts at a
random millisecond phase, 75% of ticks hold a frame flip somewhere.

Change: `src/game/presentation/renderOnChange.ts`, installed through the
game config's `callbacks.postBoot`. After each step it flattens every
visible object's transform, frame, tint, text, shape and graphics commands,
plus every camera, into a reused array and compares it with the last frame
drawn. A match skips `preRender`, the scene render and `postRender`.

Result at load 20 to 26, against the first 3-window baseline
(`08-21-29-181Z`): gpu/idle 47% to 43%, gpu/held 84% to 77%. Phaser drew
48 frames a second instead of 60.

When the online match finished the load fell to about 10, so the baseline
was rerun to match (`08-48-04-200Z`):

| window             | cpu % | draw fps | cpu ms/frame |
| ------------------ | ----: | -------: | -----------: |
| swiftshader/idle   |   986 |     13.4 |          738 |
| swiftshader/action |  1042 |     10.7 |          986 |
| swiftshader/held   |  1115 |     10.9 |         1028 |
| gpu/idle           |    41 |     60.4 |          6.8 |
| gpu/action         |    80 |     60.1 |         13.3 |
| gpu/held           |    71 |     60.5 |         11.7 |

Round 2 at the same load (`08-39-44-058Z`): gpu/idle 42%, gpu/held 66%,
gpu/action 78%. The GPU process saved a little and the renderer spent about
4% more walking the display list. On its own that is not past noise, but it
is the mechanism round 3 needs, so it stayed in for round 3.

Freshness check: `scripts/perf/verifyRender.ts` turns on reduced motion so
a still board does not animate. At 10 checkpoints (hover, select, escape,
declare, route, confirm, after the roll, wheel zoom, mouse off) it compares
the screen with a forced real draw. All 10 matched. Its `--control` mode
crops the stadium, which the check does not read, and is reported stale,
so the check can catch a missed change. The app does not call `setCrop`.

### Round 3: idle animation on one shared beat. Kept, shipped with round 2.

Hypothesis: if every player's idle frame flips on the same tick, a still
board changes 6 times a second, and round 2 skips the other 54 draws.

Change: `PlayerSprite` rounds its random phase to whole idle frames and
runs idle on the scene clock instead of from when idle began. Each player
still shows its own offset in the cycle; only the moment of the flip is
shared.

Result (`08-56-42-231Z`, load 5 to 10), against the low-load baseline:

| window             | before cpu % | after cpu % | change | draw fps after |
| ------------------ | -----------: | ----------: | -----: | -------------: |
| swiftshader/idle   |          986 |         456 |   -54% |            6.0 |
| swiftshader/action |         1042 |         654 |   -37% |            9.5 |
| swiftshader/held   |         1115 |         543 |   -51% |            6.1 |
| gpu/idle           |           41 |          16 |   -60% |            6.0 |
| gpu/action         |           80 |          59 |   -27% |           17.2 |
| gpu/held           |           71 |          45 |   -36% |            6.1 |

Checks: 756 sprite frame changes in 3 s, the same as before, now on 18
ticks out of 180. Eight distinct images of the reserve area in 3 s, so the
idle animation still plays. The freshness check still passes. `pnpm test`
passes, 1,966 tests. Lint is clean on the changed files and `tsc` reports
the same 62 diagnostics as main. The browser-gameplay suite passed 60 with
3 skipped and 1 failure, `turn-catch-up.e2e.ts:5`, which also fails alone
on main.

Decision: keep rounds 2 and 3 together.

What remains in gpu/held: about 16% renderer and 27% GPU process. The ◄
arrow's `animate-pulse` makes Chromium composite at 60 fps, and Phaser's
update loop and the change check still run every tick.

### Round 4: flatten the stadium's three tinted layers into one texture. Kept.

Hypothesis: SwiftShader's cost is per pixel, and the stadium is three
full-screen layers, the base and two tinted masks. One layer cuts that
fill to a third.

New reference, rounds 2 and 3 on the work branch (`09-16-15-716Z`, load 8
to 13): swiftshader idle 462%, action 659%, held 534%; gpu idle 15%,
action 79%, held 50%.

First try: draw the tinted layers into a Phaser DynamicTexture once. It
cut SwiftShader CPU by a third (`09-24-20-032Z`), but it was not pixel
exact. A DynamicTexture filters linearly, and even with NEAREST set, whole
texel columns shifted, so small sign lettering changed ("DEATH O" read
"TEAM O" zoomed in). About 23% of pixels were also 1 to 2 levels off.
Dropped.

Second try: blend the layers on the CPU at match start with the
renderer's maths, colour times tint, over what is below by alpha, into a
canvas the same size. Screenshots of a static board differ from before on
280 pixels, the same 280 that differ between two runs of main.
`addCanvas` kept a 28 MB copy of the pixels in the JS heap, so the texture
is made with `textures.create` instead; heap after GC is 19.6 MB, as on
main.

Result (`09-37-49-395Z`, load 5 to 10, the `addCanvas` build; the shipped
build draws the same texture):

| window             | before cpu % | after cpu % | change | cpu ms/frame |
| ------------------ | -----------: | ----------: | -----: | -----------: |
| swiftshader/idle   |          462 |         309 |   -33% |    765 → 513 |
| swiftshader/action |          659 |         493 |   -25% |    645 → 421 |
| swiftshader/held   |          534 |         378 |   -29% |    883 → 625 |
| gpu/idle           |           15 |          17 |  noise |              |
| gpu/action         |           79 |          58 |  noise |              |
| gpu/held           |           50 |          47 |  noise |              |

A rerun of the shipped build (`09-55-16-372Z`) hit load 50 from another
project's upload job, so its SwiftShader numbers are not comparable. Its
GPU numbers agree: 16%, 66%, 48%.

Checks: `pnpm test` 1,966 passed. Browser-gameplay 60 passed, 3 skipped,
and the same `turn-catch-up.e2e.ts:5` failure as main. Lint clean, `tsc`
at main's 62.

Decision: keep.

### Round 5: one texture per Phaser batch. Kept.

Hypothesis: Phaser's multi-texture shader picks a texture through a chain
of `if` branches over up to 16 samplers. SwiftShader runs every branch for
every pixel, so each pixel pays for 16 lookups. With `maxTextures: 1`
there is one sampler, at the cost of more draw calls.

An earlier probe override of this setting never reached Phaser, so it was
tested as a config edit; `game.renderer.maxTextures` read 1.

Result (`10-04-33-076Z`, load 6 to 8), against round 4:

| window             | before cpu % | after cpu % | change | cpu ms/frame |
| ------------------ | -----------: | ----------: | -----: | -----------: |
| swiftshader/idle   |          309 |         123 |   -60% |    513 → 203 |
| swiftshader/action |          493 |         307 |   -38% |    421 → 193 |
| swiftshader/held   |          378 |         159 |   -58% |    625 → 262 |
| gpu/idle           |           17 |          12 |   -27% |              |
| gpu/action         |           58 |          54 |   noise |              |
| gpu/held           |           47 |          36 |   -24% |              |

Draw calls rose from 2 to about 58 a frame, 350 a second at idle.

Checks: pixel parity against round 4 in both configs. SwiftShader: 40
pixels differ by at most 2 levels, below the 280 that differ between two
runs of the same build. Real GPU: 546 against a self-diff of 278, and every
extra pixel is in the Dice Log panel, which is DOM, not the canvas. The
freshness check passes at all 10 checkpoints. Idle animation still gives 8
distinct reserve-area images in 3 s. `pnpm test` 1,966 passed. Lint clean.

Decision: keep.

### Round 6: put the pulsing ◄ arrow on its own compositor layer. Reverted.

Hypothesis: with Phaser drawing 6 frames a second, the held state still
costs the GPU process about 20% against 5% idle. The difference is the
action stepper's `animate-pulse` arrow. `will-change: opacity` might let
Chromium animate it without recompositing the page.

Result (`10-25-20-938Z`, load 4 to 6): gpu/held 37% against 36%, gpu/idle 15%
against 12%. Chromium still produces a compositor frame every vsync while
the animation runs. Decision: revert. Removing or slowing the pulse would
change what the coach sees, so it is listed as a recommendation instead.

### Round 7: compare shape paths by reference in the change check. Kept.

Evidence: a CDP CPU profile of the page at idle showed the change check
from round 2 was most of the page's JavaScript. On the sandbox board it
read about 17,000 numbers a tick, nearly all from shape paths, mostly the
86 player ring ellipses. Phaser assigns a new `pathData` array whenever a
shape's geometry changes, and the app never touches `pathData`, so the
array reference is enough.

Whole-process CPU (`10-35-09-855Z`, load 3 to 5) did not separate from noise:
gpu/idle 14% against 12%, gpu/held 42% against 36%. The renderer process
fell from 7.7% to 6.9% at idle. The profiler measures the targeted cost
directly, at a 200 µs sampling interval over 10 s:

| state | page JS ms per 10 s, before | after | change |
| ----- | --------------------------: | ----: | -----: |
| idle  |                         456 |   206 |   -55% |
| held  |                         615 |   341 |   -45% |

The freshness check passes at all 10 checkpoints, and its control is still
caught. Decision: keep, pushed to #60 because it refines that PR's code.

### Why the loop stopped here

The stop rule is three rounds in a row with nothing kept, or idle CPU near
zero. Neither held: round 7 was kept, and the idle board still costs 12 to
14% on the real GPU. The loop stopped because no candidate was left that
keeps the picture the same and has evidence of a gain over 5%:

- A profile of the action window shows 600 ms of page JavaScript in 12 s.
  The change check leads; Phaser and the dice scene are small.
- Versioning graphics redraws would cut the change check's last 1,306
  values a tick. That is under 1% of a core, and it needs a patch to
  Phaser's `Graphics` prototype.
- What remains is compositing driven by animation the coach sees: the
  6 fps idle breathing, the ◄ pulse, and the dice roll. Cutting those
  changes the picture, so they are listed as recommendations.

## Final: rounds 2 to 7 (`10-51-25-984Z`, load 3 to 5)

| window             | main cpu % | final cpu % | change | main draw fps | final draw fps |
| ------------------ | ---------: | ----------: | -----: | ------------: | -------------: |
| swiftshader/idle   |        986 |         123 |   -88% |          13.4 |            6.0 |
| swiftshader/action |       1042 |         294 |   -72% |          10.7 |           15.3 |
| swiftshader/held   |       1115 |         171 |   -85% |          10.9 |            6.1 |
| gpu/idle           |         41 |          14 |   -66% |          60.4 |            6.0 |
| gpu/action         |         80 |          56 |   -31% |          60.1 |           17.5 |
| gpu/held           |         71 |          43 |   -40% |          60.5 |            6.1 |

Main is `08-48-04-200Z` at load 9 to 13. Under SwiftShader, main renders
fewer frames during the action than final does, because each frame is so
expensive; final draws the roll's motion at 15 fps against main's 11.

## The online-match rig

SwiftShader, final build. The bench gained `--reduced-motion` and
`--video WxH`; video CPU counts Playwright's ffmpeg encoder.

| setting                              | idle % | action % | held % | load     | file             |
| ------------------------------------ | -----: | -------: | -----: | -------- | ---------------- |
| no video                             |    123 |      294 |    171 | 3 to 5   | `10-51-25-984Z`  |
| reduced motion, no video             |      8 |      143 |     36 | 3 to 5   | `11-04-14-591Z`  |
| no video                             |    148 |      220 |    197 | 29 to 39 | `11-39-56-646Z`  |
| video 720x450, ffmpeg 15% idle       |    178 |      255 |    246 | 29 to 39 | `11-35-26-473Z`  |
| video 1440x900, ffmpeg 51% idle      |    235 |      325 |    322 | 29 to 39 | `11-31-03-469Z`  |

`11-19-00-960Z` is a no-video run at load about 20, kept for reference.
Hasaki has an AMD Raven Ridge GPU with `/dev/dri/renderD128`, so a
GPU-backed browser there is worth trying. Not tested: it means changing
the launch-server, which this work leaves alone.
