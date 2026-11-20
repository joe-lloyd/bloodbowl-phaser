# greenskins_dwarfs assumptions

Decisions made without the owner for the Orc, Black Orc, Ogre, Underworld Denizens (own models) and
Dwarf models. Team files: `teams/greenskins_dwarfs_common.py` (shared parts, registers nothing),
`_orc.py`, `_monsters.py`, `_dwarf.py`.

## Resumed run
- The earlier run left the common parts, the Orc and Black Orc file and the monsters file with previews
  only (no atlases). They were kept. The Dwarf file was missing and was written in this run.
- Changes to the kept specs, all for checklist point 2 (team colour): Orc Blitzer and Black Orc
  pauldrons changed from dark iron to kit1; the Gnoblar's bedroll and rope belt changed to kit2; the Ogre
  Runt Punter got kit2 trousers and cap (kit1 cap band) and small tusks, because he read as a plain human
  with almost no secondary colour.

## Team colour
- Black Orc: the review colour pair is near-black and red, so kit1 areas (pauldrons, tabard, belt, arm
  bands) look like black plate on the review sheet. That is intended: the body plate stays fixed black
  iron and the kit1 areas take whatever primary colour the game supplies.
- Monsters carry the colours as loincloths, straps, plates, collars and forearm bands. The Ogre
  Blocker's gut plate is kit1 with a kit2 rim; with the review colours (orange on tan skin) the contrast
  is lower than it will be with most real team colours.
- The Troll is shared by Orc, Black Orc, Goblin and Snotling, so it wears no team-specific motif, only
  kit1 loincloth, shoulder plate and bands and a kit2 strap.

## Design
- All designs are our own takes on the archetypes; no official iconography was copied.
- Big Un uses the `black_orc` proportion preset (bigger than the orcs) with orc skin; the Black Orc has
  its own darker skin ramp, so the two never share a team sheet and still differ.
- Goblin Bruiser and Gnoblar use the `goblin` preset; the Gnoblar has shorter legs, a bigger head, olive
  skin and drooping ears to separate it from goblins.
- Ogre Runt Punter: the `pass` animation is replaced by an empty kick (he punts team-mates, he does
  not throw).
- Mutant Rat Ogre: the extra growths are a third arm on the flank, a second tail and crystal spurs.
- Dwarf beards per position: lineman a square brown slab with a kit clasp, runner two blond plaits with
  kit ties, blitzer one long red beard with brass rings, troll slayer a wild orange bush, deathroller
  driver a white fork.
- The Dwarf Lineman's "shield-wall" look is a pair of square plates strapped to the forearms. They are
  square and strapped on, not held, to stay clear of the no-ball rule.
- Troll Slayer tattoos are fixed blue (not a kit colour); his kit colours are the trousers, sash, loin
  cloth and arm bands.
- Deathroller: built on the `Vehicle` plan with all detail added in `extras()` (spiked drum, toothed
  ram plate, boiler, funnel, levers, pennant). The driver grips nothing; the levers stand free in front
  of him. Its fall is the plan's default (tips onto its side).
- The Dwarf Blitzer measures taller than today's sprite (crest and wings count towards the height);
  the body itself is about the lineman's size.

## New palette entries
- `gd_skin_blackorc`, `gd_warp`, `gd_hair_orange`, `gd_iron`. All four are built from colours already
  in the master palette, so the palette does not grow.

## Library notes (worked around locally, lib/ untouched)
- A `Vehicle` driver class must define `legs` in its `stance`, although its legs are never drawn:
  without it the biped animations raise `KeyError: 'legs'`.
- The built-in dwarf beard is a single shape, so the batch draws its own beards (`gd.beard`) and sets
  `beard=None` in the layout.
- The size calibration measures the full idle silhouette, so tall headgear (crests, horns, spikes)
  shrinks the body. `height` is used to compensate, within 0.9..1.1.

## Render times
- Full set (6 animations x 8 facings x 8 frames) on two processes while other builders were rendering:
  156 to 273 s per model, about 39 minutes of wall time for the 19 models, plus four re-renders
  (ogre_runt, gnoblar, deathroller, dwarf_runner; 116 to 164 s each) after sheet review.
