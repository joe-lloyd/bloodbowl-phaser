# Assumptions: `men` batch

Teams: Human, Imperial Nobility, Bretonian, Amazon, Norse (and the shared Ogre used by Old World Alliance).
Files: `teams/men_common.py` (shared parts, registers nothing), `teams/men_human.py`, `teams/men_imperial.py`,
`teams/men_bret.py`, `teams/men_amazon.py`, `teams/men_norse.py`.

## Design decisions

- **Ogre** is registered in `men_human.py`. One model serves Human, Imperial Nobility and Old World Alliance, so
  it wears neutral gear: a kit1 gut-plate and harness with kit2 studs and bracers, and no team-specific heraldry.
- **Human**: positions differ by headgear and build. Lineman has a wide kettle helm and quilted jack, Thrower
  a peaked cap with a long feather and one bare arm, Catcher is bare-headed with a headband and bare legs,
  Blitzer is in full plate with a tall plume.
- **Imperial Nobility**: Lineman wears a beret and mi-parti hose, Thrower a wide-brimmed hat with a half-cape,
  Noble Blitzer a combed morion with twin plumes and trunk hose, Bodyguard a closed sallet with folded arms.
  The Bodyguard's pauldrons are kit2 so he does not read as plain grey steel when kit1 is a pale colour.
- **Bretonian**: heraldry is generic (halved and quartered fields in the two kit colours, a feather fan, a
  crown). No lily, grail or other specific emblem is used. The Squire is a hooded peasant; the knights differ
  by helm (open helm with mantling, bascinet with raised visor, crowned great helm).
- **Amazon**: all four share a kit1 top and kit2 loincloth; the animal gear makes the silhouette. The Python
  Warrior's snake is draped round her body and over a shoulder. It is never in a hand.
- **Norse**: Berserker has a spiked red mane and bare chest with kit1 war paint; Raider a horned cap and fur
  mantle; Valkyrie a winged helm, braids and short cape; Ulfwerener a hunched wolfman with kit1 pauldrons and
  harness; Yhetee a white horned beast with a kit1 shoulder yoke and waist wrap; Beer Boar a quadruped with a
  keg on a kit1 blanket.
- The Raider's drinking horn and the Beer Boar's keg are strapped to the belt and the back. Nothing is held.
- The big, hunched figures (Ulfwerener, Yhetee) are seen from above, so the chest is hidden in most facings.
  Their kit colours sit on the shoulders, forearms and waist instead of the chest.
- `height` is 1.0 to 1.1 for most models, so the new sprites are up to 10% taller than today's. Linemen stay
  at 1.0 and the stars at 1.08 to 1.1, which helps tell positions apart.
- Three ramps were added to the shared palette: `pelt`, `mail`, and the alias `fur_dark`.

## Library notes (worked around locally, nothing in `lib/` changed)

- `core.gorget` crashes when the layout has `breast=None` explicitly (it reads the key with a default, gets
  `None`, and passes it on as a material). Workaround: leave the `breast` key out.
- `pads` on one side are hidden under large fur tufts or a mantle; kit colour on beasts is added in `extras`.
- Layout `bracers` are thinner than the forearms of the big races, so they barely show. The beasts get their
  own wider cuffs in `extras`.
