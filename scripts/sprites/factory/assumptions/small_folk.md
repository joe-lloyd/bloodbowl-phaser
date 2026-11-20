# small_folk: assumptions and decisions

Batch: Goblin, Snotling, Halfling, Gnome and the shared Treeman (20 models).
Files: `teams/small_folk_common.py` (shared parts, no models), `small_folk_goblin.py`, `small_folk_snotling.py`,
`small_folk_halfling.py` (also the Treeman), `small_folk_gnome.py` (also the fox).

## Design decisions

- **One prop per position.** These figures are 22 to 42 px tall, so each position is defined by one large prop or
  hat rather than by armour detail.
- **Goblin** is a scrapyard gang. The Fanatic's spiked weight is always on its chain, away from the hands.
  The Bomma's bombs stay in the satchel; his hand holds a thin lit taper. The 'Ooligan's rattle is a flat board
  on a handle.
- **Snotling** wear sack smocks in the primary colour with a secondary hem. The Fun-hoppa sits on the toadstool
  and holds rope reins; the toadstool is ridden, never held. The Fungus Flinga's toadstools stay in the back-sack.
- **Pump Wagon** has two crew working a see-saw pump (no single driver). Hull, keg and flag carry the primary
  colour; pump beam, side stripe, flag stripe and crew neckbands the secondary.
- **Halfling** is a kitchen brigade: cooking-pot helm (Hopeful), cook's hat plus frying pan on the back (Hefty),
  bare-headed runner with a long scarf (Catcher). The Hefty's idle prop is a long loaf (a stick shape).
- **Halfling Hopeful is shared** with Human and Old World Alliance, so it uses no halfling-only team motif:
  shirt in the primary colour, apron in the secondary.
- **Gnome**: the hat is the position (bent cone, wide starry wizard hat, fur cap with antlers). The Illusionist
  keeps a staff in the off hand; the throwing hand is empty. His sparks are small squares above an open palm.
- **Woodland Fox** carries the primary colour on a bandana and saddle cloth and the secondary on two harness straps.
- **Treeman is shared** by Halfling, Gnome and Old World Alliance: primary colour on a tabard and forearm
  drapes, secondary on the drape ends, tabard trim, belt, wrist wraps and branch ribbons. It has no team-specific motif.
- **Goblin Lineman is shared** with Orc: plain goblin, primary jersey, secondary wraps, neckband and chest stripe.

## Size

- `height` stays within 0.9 to 1.1 everywhere. Bomma, Doom Diver and Fanatic use 1.1 because today's sprites are
  very small for the props they carry. Stilty Runna and Fun-hoppa are measured including stilts and toadstool,
  so the snotling itself is smaller than the lineman.
- The Fox uses 1.1 (today's fox is 23 px head-on).

## Technical notes

- New palette ramps: `shroom` (toadstool caps) and `sack` (sackcloth). Nothing else was added.
- Pogoer, Stilty Runna and Fun-hoppa override `pose()` to ride above the ground with `hop`; their props are
  drawn down to the real ground level in `extras()`.
- The pump crew are built by a local helper (`small_folk_common.mounted`) because the Vehicle plan supports one
  forward-facing driver only; the helper places a full biped at a point with a turn about the vertical.
- Review-sheet tints: the Goblin default pair is orange and dark grey, so the secondary colour looks close to
  black on the sheets; the Halfling secondary is cream and reads close to skin. Both are effects of the default
  tints, not of missing kit areas.

## Library observations (worked around locally, lib untouched)

- `Vehicle` has no hook for several crew or for a crew member facing another way (see above).
- `Quadruped` has no sit or lie pose; the fox's fall is the stock roll onto its side.
- Whole-figure `pitch` also rotates props drawn in `extras()`, so dropped props (pogo stick, toadstool, chainsaw
  engine) are placed in body coordinates and end up lying beside the fallen figure rather than staying upright.
- `race` presets list `ears="big"` for goblins and snotlings, but the face code draws no large ear for it; the
  batch draws its own ears (`small_folk_common.big_ears`).
