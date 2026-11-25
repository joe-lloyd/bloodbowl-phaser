# Visual design

The UI uses a dark stadium-broadcast palette. Shared tokens live in
[`tailwind.config.js`](../../tailwind.config.js), base styles in
[`global.css`](../../src/ui/styles/global.css), and reusable controls in
[`HudKit.tsx`](../../src/ui/components/componentWarehouse/HudKit.tsx).

## HUD components

Run `pnpm gallery` to see every component and state on one page, at desktop and
phone size, with a Drift section that measures where they disagree.
`scripts/hud-shots/check-gallery.mjs` checks that each one renders.

- Use `hud-*` colours and `text-hud-*` type sizes.
- Use the display, label and body font tokens from the shared theme.
- Use `PanelHeader` for panel titles and `HudButton` for actions.
- Keep panels clear of pitch targets, including at narrow landscape sizes.
- Add gallery states for new decisions, including online waiting states.

### Roll panels

Weather, the coin toss and the kick-off table use
[`RollShell`](../../src/ui/components/hud/RollShell.tsx). Copy it for any roll a
coach starts and waits for.

- Dice on the left, words top right, one main button bottom right, results
  along the bottom. Every part keeps its place for the whole roll.
- Reserve the space before the roll. The words take the height of the longest
  result, and the button's place stays when there is no button.
- While dice roll, the button stays and is disabled. The next step replaces it.
- Red is the main button. Gold is the result.
- Opening a result's details replaces the words. It adds no line of its own.

### Small text

Before adding a label, caption or hint in small capitals, remove it and see
whether the panel still makes sense.

- No label that repeats the title, the picture or the button.
- No instructions for pointing, tapping or scrolling.
- A panel has one title, one message and its buttons.

[`hudDesignDrift.test.ts`](../../__tests__/unit/hudDesignDrift.test.ts) checks
these conventions. `scripts/hud-shots/check-header-fit.mjs` checks gallery
header fit. Inspect actual game screens as well as gallery captures.

## Canvas & UI Overlay

### Canvas Configuration

- **Renderer**: WebGL. Team kits are tinted onto sprites and the stadium at
  runtime, which the canvas renderer cannot do.
- **Size**: the canvas fills the window (`Phaser.Scale.RESIZE`), with
  `pixelArt` on so the pre-rendered art scales by whole pixels.
- **Camera**: `CameraController` frames the board. The overview fits the
  pitch and both dugouts; selecting a player, a move, a pass or a kick-off
  closes in on the action. The mouse wheel zooms around the cursor and a
  right- or middle-button drag pans. A manual move holds the camera until
  the next turn or selection; `0` or `1` returns to the overview.
  With `prefers-reduced-motion` set, the camera cuts instead of gliding and
  skips the opening shot; the e2e suite runs that way.

### React Overlay

- **Position**: Fixed, full viewport, over the canvas
- **Pointer events**: Only on interactive elements
- **Layout**: floating stacks in the four corners (`HUDLayout`): the score
  top left, match options and the kick-off panel top right, the player card
  and dice log bottom left, the action menu and End Turn bottom right. The
  middle of the screen is left to the board.
- **Loading**: `LoadingScreen` covers the window with both team names in
  their colours until the stadium and sprites have loaded.

## The isometric board

The match is drawn isometrically with the same camera the art was rendered
with in Blender: orthographic, 30 degrees above the ground, turned 45
degrees. A grid square is 2.8 m and the art is 25 px per metre, so a
square is a 99 x 49.5 px diamond. Grid x runs down-right on screen and grid y
down-left.

- `gridToPixel` and `pixelToGrid` in `GridUtils.ts` are the only projection.
  Everything that turns a square into a screen point, or a click into a
  square, goes through them (`Pitch.getPixelPosition`, `Pitch.worldToGrid`).
- `Stadium` draws the pre-rendered backdrop: grass, lines, end zones, stands,
  crowd and both dugouts' boxes. Its `meta.json` says where the far corner of
  square (0, 0) lands in the image, which is where `Pitch` puts its overlay
  container.
- `Pitch` draws only what changes in play: highlights, reach, paths, pass
  previews, tackle zones. Squares are diamonds.
- Players and the ball depth-sort by screen y, so nearer figures overlap
  farther ones.

## Match style

Every match is played in one style, Blood Bowl: a timber and stone ground on
a sunny afternoon, team flags over the stands, serif labels on the dugouts.
It is a pre-rendered stadium, a render of every player model in the same
warm light, and the canvas colour around them, all in
`src/game/presentation/matchStyle.ts`. New presentation work, such as pitch
weather, draws on top of this style rather than adding another.

There used to be a second style, Neon, and a picker for it in local setup
and the online lobby. Saves, lobbies and links from then still carry a pitch
theme id (`presentation.pitchThemeId`, `settings.pitchThemeId`, `?theme=`);
nothing reads it, so they open in the Blood Bowl style.

### Players

Each roster position maps to a model in
`src/game/presentation/spriteManifest.json`, generated by
`scripts/sprites/build_game_assets.py`. A model is rendered in eight facings
with idle, run, fall and cheer animations, and split into three layers: the
figure, and its primary and secondary kit pixels in grey, which Phaser tints
with the team's colours. `PlayerSprite` stacks the three layers, runs while
moving, plays the fall when a player goes down and lies there while prone or
stunned. A team cheers, three jumps with its arms up, as it walks on and when
it scores.
`PlayerPortrait` draws the same art in React for the team builder and roster.

### Dugouts

Each team's dugout is baked into the stadium: reserves (4 x 3 squares), KO
(3 x 3), injured (3 x 3) and sent off (1 x 3), on the same squares as the
pitch. Team 1's is on the far touchline in its own half, team 2's on the near
touchline in its own half, so the benches sit at opposite corners. Reserves
stand facing the pitch; KO'd and injured players lie in their boxes.

## Fantasy Theme Elements

### Parchment Effect

- Background: `bg-blood-bowl-parchment`
- Shadow: `shadow-parchment` or `shadow-parchment-light`
- Use fixed/absolute positioning for background layer

### Stars Decoration

- Use on main titles for extra flair
- Position absolute, centered above title

## Responsive Breakpoints

- **2xl**: >= 1536px (large desktops)
- **xl**: >= 1280px (desktops)
- **lg**: >= 1024px (small desktops, tablets landscape)
- **md**: >= 768px (tablets portrait)
- **sm**: >= 640px (large phones)
- **Default**: < 640px (phones)

## Best Practices

1. **Use generous spacing** - Don't crowd elements
2. **Make touch targets large** - Minimum 44x44px
3. **Use visual hierarchy** - Size indicates importance
4. **Consistent padding** - Same padding across similar elements
5. **Hover states** - Always provide visual feedback
6. **Transitions** - Smooth 200-300ms transitions
7. **Shadows for depth** - Layer UI elements visually
