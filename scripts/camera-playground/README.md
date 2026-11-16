# Evaluate the camera policies

Build the standalone page from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm exec tsc -p scripts/camera-playground/tsconfig.json
pnpm exec eslint scripts/camera-playground/*.ts
node scripts/camera-playground/build.mjs
```

The output is `dist/camera-playground/`. It uses relative assets and needs no game service. The build copies the stadium and six player atlas images from `public/`. Vite bundles the atlas frame metadata and the game's grid projection. No production camera module is imported or changed.

To publish on old-mac, build into the HTMLify project folder:

```sh
node scripts/camera-playground/build.mjs /Users/joe/htmlify/bloodbowl/camera-playground-2026-11-16
node ~/Projects/MyProjects/HomeLab/old-mac/htmlify/build-indexes.mjs
node ~/Projects/MyProjects/HomeLab/old-mac/htmlify/open-link.mjs bloodbowl/camera-playground-2026-11-16/
```

The build replaces the target folder. Keep screenshots and verification output outside it until the final build, then copy them into an `evidence/` subfolder.

Run the browser checks against the published page through the existing daemon:

```sh
node scripts/camera-playground/verify.mjs /tmp/camera-playground-evidence
```

The check reads the daemon token from the local HTMLify configuration without printing it. It compares the LAN certificate fingerprint with the configured certificate before browser access. Playwright accepts that daemon's self-signed certificate. No server starts. If Chromium is missing, install it with `pnpm exec playwright install chromium`.

The check drives the visible controls at desktop and phone sizes. It samples zoom each animation frame during selection, movement, blocks, and tray changes. It also checks the opening, both turn handoffs, eligibility, exhaustion, manual camera controls, pitch clicks, keyboard selection, saved notes, clipboard feedback, and page overflow. Results and screenshots go into the specified output folder.

## Policy behavior

| Policy            | End activation                                           | End team turn                                                       |
| ----------------- | -------------------------------------------------------- | ------------------------------------------------------------------- |
| A, team reset     | Frame eligible teammates with a 420 ms pan and zoom      | Widen for 650 ms, pause for 600 ms, frame the other team for 650 ms |
| B, keep zoom      | Pan to eligible teammates for 420 ms at the current zoom | Same handoff as A                                                   |
| C, fixed overview | Pan to eligible teammates at the current zoom            | Pan to the other team without changing zoom                         |

Every policy opens with a 1,250 ms one-way zoom and a fixed world centre. Selection, movement, blocks, tray changes, and viewport changes preserve zoom. Manual zoom establishes a new held scale. Reduced motion shortens camera and movement transitions.

The canvas renderer reuses the stadium layers, sprite atlases, feet anchors, and 20 × 11 pitch projection. It approximates the score bug and dice tray in HTML at their game positions. It stages movement and block animation without running the match rules or the production Phaser camera. The smaller figures in C and offscreen teammates in B are intentional comparison costs.

`window.cameraPlayground.snapshot()` exposes read-only copies of the current camera and match staging data for verification. User actions still go through the visible controls. Notes stay in local storage on the device; Copy feedback includes the policy, scenario, team, zoom, and last trigger.
