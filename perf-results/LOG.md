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
