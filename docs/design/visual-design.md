# Blood Bowl Sevens - Visual Design Guide

## Color Palette

### Primary Colors

- **Primary Blue**: `#1d3860` - Headers, borders, primary buttons
- **Primary Dark Blue**: `#092540` - Hover states, accents
- **Danger Red**: `#922d26` - Delete/danger buttons, warnings
- **Danger Dark Red**: `#701d1a` - Danger hover states
- **Gold Accent**: `#eaaa02` - Highlights, selected indicators, special text

### Supporting Colors

- **Parchment**: `#fffef0` - Background for fantasy theme
- **Parchment Shadow**: `#8a4d0f` - Inset shadows for depth
- **Light Blue**: `#d4e8ff` - Hover backgrounds, highlights

## Typography

### Headings

- **Page Title (h1)**: `text-5xl` (48px) - Main page titles
- **Section Title (h2)**: `text-3xl` (30px) - Section headers
- **Subsection (h3)**: `text-2xl` (24px) - Cards, panels

### Body Text

- **Large**: `text-xl` (20px) - Important content
- **Base**: `text-base` (16px) - Standard text
- **Small**: `text-sm` (14px) - Secondary info

### Font Weights

- **Bold**: `font-bold` - Titles, emphasis
- **Normal**: `font-normal` - Body text

## Spacing

### Container Padding

- **Desktop**: `p-12` (48px)
- **Tablet**: `p-10` (40px)
- **Mobile**: `p-6` (24px)

### Section Spacing

- **Between sections**: `mb-12` (48px)
- **Between elements**: `mb-8` (32px)
- **Cards/panels**: `p-8` (32px)

### Grid Gaps

- **Large grids**: `gap-12` (48px)
- **Medium grids**: `gap-8` (32px)
- **Small grids**: `gap-6` (24px)

## Component Sizing

### Buttons

- **Large**: `px-8 py-4 text-xl` - Primary CTA buttons
- **Medium**: `px-6 py-3 text-lg` - Standard buttons
- **Small**: `px-4 py-2 text-base` - Secondary actions

### Cards

- **Minimum padding**: `p-8` (32px)
- **Hover lift**: `-translate-y-1`
- **Shadow on hover**: `shadow-2xl`

### Inputs

- **Height**: `py-4` (16px vertical padding)
- **Text size**: `text-xl`
- **Focus ring**: `ring-4 ring-blood-bowl-primary/20`

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

## Match styles

A match style is a pre-rendered stadium, a render of every player model in
that style's light, and a few colours for what Phaser draws on top. The
catalogue is `src/game/presentation/pitchThemes.ts`; the id is still called a
pitch theme because saves and online lobbies store it under that name.

- **Blood Bowl** (the default): a timber and stone ground on a sunny
  afternoon, team flags over the stands, serif labels on the dugouts.
- **Neon**: a night-club arena with black turf, glowing lines and bloom.

Both styles share the board geometry, so a style changes only how the match
looks. Ids from before the styles (classic, mud, astro, wasteland) load as
the default. The shared `PitchThemePicker` shows a thumbnail of each stadium
for local match setup and the online lobby; online guests display the host's
choice.

### Players

Each roster position maps to a model in
`src/game/presentation/spriteManifest.json`, generated by
`scripts/sprites/build_game_assets.py`. A model is rendered in eight facings
with idle, run and fall animations, and split into three layers: the figure,
and its primary and secondary kit pixels in grey, which Phaser tints with the
team's colours. `PlayerSprite` stacks the three layers, runs while moving,
plays the fall when a player goes down and lies there while prone or stunned.
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
