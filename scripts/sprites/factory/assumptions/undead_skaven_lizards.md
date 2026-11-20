# undead_skaven_lizards assumptions

Decisions made without the owner for Necromantic Horror, Shambiling Undead, Tomb Kings, Skaven and
Lizardmen (21 models). Files: `teams/undead_skaven_lizards_{kit,undead,tomb,skaven,lizard}.py`.

## Shared models
- `zombie` and `ghoul` are used by both undead teams, so their kit areas are generic (torn jersey,
  loincloth, headband) and carry no team-specific gear. The other undead positions differ by build and
  headgear: skeleton = spiked pot helm and tabard, wight = crown and cape, mummy = huge and bandaged,
  werewolf = wolf head and tail, wraith = legless hooded robe, flesh golem = tiny head on huge shoulders.
- The four Skaven positions are also used by Underworld Denizens and the Rat Ogre by Chaos Renegade.
  They carry no team iconography, only kit colours, so they work on all three teams.
- `tk_skeleton` is deliberately unlike `skeleton`: bare ribs, headcloth with neck flap, broad collar and
  kilt instead of helm, mail and tabard.

## Design choices
- Each Skaven position has its own fur colour as well as its own gear (brown clanrat, grey thrower,
  black blitzer, grey hooded gutter runner). With dark default team colours the clanrat's jersey is
  low in contrast against brown fur; it is clearer with brighter team colours.
- The Gutter Runner's hood, mask and scarf are black as the brief asks; its kit colours are the sash
  (kit1), thigh wraps and loincloth (kit2) and a tail band.
- The Wraith's robe is black; kit1 is the shroud cape, hem and hood rim, kit2 the cuffs, belt and cord.
- The Tomb Guardian is sandstone (new ramp `tomb_sand`), with kit1 crown and kilt and a kit2 collar.
- Lizards: saurus blue-green, skinks a brighter green (`skin_skink`), chameleon leaf-green with blotches
  and a curled tail, kroxigor dark swamp-green (`skin_krox`). Three new ramps in total for the batch.
- Monsters carry kit colour on harnesses, loincloths, bracers, shoulder-plate rims and tail rings.
- The tongue of the Chameleon Skink is a thin strip from the mouth, shown only in a few idle frames.
- Nothing round is held in any hand; `pass` is the library's empty-handed throw for every model.

## Technical
- The library tail is replaced by a batch tail (`K.tail`) that supports kit bands, a tip blade, back
  spikes and a curl. Ribbons, straps, harness, sash, crown and stitches are local helpers in
  `undead_skaven_lizards_kit.py`.
- Height factors are within 0.9..1.1; small hunched models (ghoul, gutter runner, skinks, zombie) use
  up to 1.1 so the detail survives.
- The Tomb Guardian and the Anointed Blitzer reuse the `flesh_golem` and `wight` race presets with
  their own materials, because no statue or priest preset exists.
- The Wraith uses the `Floating` plan: it glides for `run` and collapses into a heap for `fall`.
