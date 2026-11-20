# Chaos batch assumptions

Decisions made without the owner for Chaos Chosen, Chaos Dwarf, Chaos Renegade, Khorne and Nurgle
(24 models). Team files: `teams/chaos_common.py` (shared parts, registers nothing), `chaos_chosen.py`,
`chaos_dwarf.py`, `chaos_renegade.py`, `chaos_khorne.py`, `chaos_nurgle.py`.

## Resumed run
- The five Chaos Chosen models and `chaos_common.py` existed from the run that was cut off. I kept them
  and changed two things: the Beastman got a kit1 jersey and loincloth (the old tabard was hidden by his
  stoop, so no team colour showed from the front) and the Minotaur got a bigger kit1 shoulder plate,
  kit1 bracers and a kit2 collar.

## Design
- Costume names are our own: the Iron Horde (Chosen), the Ashen Forge (Chaos Dwarf), the Turncoats
  (Renegade), the Brass Reavers (Khorne), the Rot Wardens (Nurgle). No official iconography is copied.
  The Renegade mark is two crossed slashes.
- Shared big guys (Minotaur, Chaos Ogre, Chaos Troll) carry no team-specific symbol, because they appear
  on three teams. Their team colour is on loincloths, harness, banner, bracers and collars.
- Chaos Dwarf: only the Blocker and the Bull Centaur wear the tall drum hat (the Centaur's is shorter
  and has horns). The Flamesmith has a domed brass mask and a fuel tank instead, so the three dwarfs
  differ in silhouette.
- Flamesmith: the fire is a pilot flame on the tank chimney plus a jet from the mask in `idle` and
  `block`. Nothing is held.
- Hobgoblin Sneaky Stabba holds a thin knife in the right hand in every animation (a blade, not round).
  His `pass` is mirrored so the empty left hand throws.
- Hobgoblins use the goblin preset stretched taller and thinner.
- Renegades: each keeps its race silhouette; the unifying items are a torn kit1 rag skirt, a kit2 hip
  sash and the slash mark. The Renegade Skaven is brown with bone spines and stub horns so it does not
  repeat the Skaven team's models. The Renegade Rat Ogre (`rat_ogre`) belongs to another batch.
- Bloodspawn is built on the minotaur preset (digitigrade, snout head) with a red hide, although its
  keyword is HUMAN: it is meant to read as a mutated beast.
- Rotspawn is a biped with no hands; its arms continue as tentacles and five more grow from the back.
- Nurgle skins: Rotter grey-green, Pestigor pale yellow, Bloater and Rotspawn olive. I varied them so
  the kit areas stay readable, because the review colours for Nurgle are olive and brown.
- Review-sheet caveat: Khorne's default review colours (red, brass) are close to the Bloodspawn's hide
  and the Bloodseeker's brass plate, and Chaos Chosen's kit2 is dark grey next to dark iron. The kit
  areas are there (check the kit layers); they will stand out more with other team colours.

## Sizes
- `height` factors are within 0.9..1.1. Models with tall headgear or horns use up to 1.1 so the body
  does not shrink (Chaos Dwarf 1.10, Pestigor 1.10, Beastman 1.08).

## Library notes (worked around locally, nothing in `lib/` changed)
- `ears="big"` in the goblin, snotling and troll presets is not drawn by `core.face` (it falls back to a
  human ear). I draw big ears with `chaos_common.big_ears`.
- Digitigrade races default `legs` to "trouser" through `make_layout`, so beast legs come out black
  unless `legs` is set to the skin material. I set it on every beast model.
- The "tails" coat always uses the fixed dark-red `lining` for its inside (no layout key), which shows
  on the Renegade Thrower's fallen frame.
- `Centaur` shows only the torso and four legs in the `se` facing (the body is hidden behind), and its
  fall tips sideways with the torso stiff. Accepted.
- Preview shows only frame 0 of the idle, so idle gestures can only be checked on the full sheet.
