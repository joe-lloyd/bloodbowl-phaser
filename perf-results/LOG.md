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
