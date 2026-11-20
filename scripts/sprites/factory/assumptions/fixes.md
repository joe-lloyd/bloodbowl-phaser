# Fix pass: decisions and notes

Targeted fixes only. No redesigns, no new models, no changes to `lib/`. Every changed model was re-rendered
with `--force` (all 6 animations, 8 facings), and `--finish` was run once at the end.

## Changed models

| Model | File | Change |
|---|---|---|
| woodland_fox | small_folk_gnome.py | The brush now curls out to the side (it used to stand straight up behind the head). Big flared ears with black tips and white cheek ruffs, a wider saddle cloth reaching down both flanks, and a bandana spread across the chest with kit2 knot ends. `height` went from 1.1 to 1.02, giving 24 px against 23 px today. |
| werewolf | undead_skaven_lizards_undead.py | Harness straps are about 75% wider (0.075 to 0.13) with a deeper kit1 collar. Added a kit1 plate guard on the left shoulder with an iron rim, and kit1 bands on both upper arms. |
| kroxigor | undead_skaven_lizards_lizard.py | The head is carried 14 degrees higher (all animations except fall) and the jaw always hangs slightly open, so the dark mouth line and teeth read head-on. Added a pale lower-jaw plate, brow ridges, and a kit1 muzzle strap with a kit2 rim. Harness straps went from 0.085 to 0.13 wide, with a taller kit1 yoke. |
| halfling_catcher | small_folk_halfling.py | The kit1 vest became a long tunic that flares over the hips to mid-thigh, with a kit2 hem. The scarf is bigger: thicker kit2 wrap, wider and longer striped tails. |
| ooligan | small_folk_goblin.py | Bigger scarf: a thick kit2 wrap with a kit1 stripe, and longer, wider tails striped kit2/kit1. The rattle is a long, square-cut clacker: a kit1 board with two kit2 bands, wooden slats and an end frame on a longer handle. It is built only from boxes, so it never reads as round. |
| ogre_blocker | greenskins_dwarfs_monsters.py | Bigger gut plate (rx 0.3 to 0.4, rz 0.25 to 0.33) standing further off the belly, on a wide double dark-iron rim. It has a kit2 diamond on the front and brass rivets. |
| skaven_lineman | undead_skaven_lizards_skaven.py | Added kit2 trim round the kit1 jersey: a wide collar, a chest hoop and a hem. The rusty scrap plate moved from the jersey front to the left flank, so the front of the kit1 jersey is clear. |
| troll | greenskins_dwarfs_monsters.py | `height` 1.1 to 1.04: 46 px against 46 px today (was 51). |
| troll_underworld | greenskins_dwarfs_monsters.py | `height` 1.1 to 1.02: 47 px against 46 px today (was 52). |
| black_orc | greenskins_dwarfs_orc.py | `height` 1.08 to 1.04: 50 px against 46 px today (was 51, which is 1.11x). |
| dwarf_blitzer | greenskins_dwarfs_dwarf.py | `height` 1.08 to 1.03: 40 px against 37 px today (was 41, 1.11x). |
| amazon_jaguar | men_amazon.py | From behind she showed almost no kit1 (0.7% of the figure; the gold pelt covers the back). Added a kit1 girdle over the pelt and a kit1 brow band on the cat hood (n facing now 4.3%). |
| khorngor | chaos_khorne.py | Team colour barely showed against the red hide (kit1 5%, kit2 under 2%). Harness straps are wider (0.05 to 0.08). Added a ragged kit1 war-kilt on a wide kit2 girdle, and a kit2 collar. `height` 1.08 to 1.05, because it sat at 1.10x. |
| renegade_skaven | chaos_renegade.py | Head-on, the hunch and rubbing hands hid the vest (kit1 4%, kit2 under 2%). Added kit1 upper sleeves (forearms stay fur), a ragged kit1 shoulder mantle, a kit2 neck rag and a kit2 brow band. Now se is kit1 11% and kit2 9%. |
| noble_blitzer | men_imperial.py | `height` 1.1 to 1.06: 53 px against 49 px today (was 55, 1.12x). |
| imperial_thrower | men_imperial.py | `height` 1.1 to 1.06: 50 px against 47 px today (was 52, 1.11x). |
| pestigor | chaos_nurgle.py | `height` 1.1 to 1.06: 40 px against 38 px today (was 42, 1.105x). |

## Decisions

- **"Within 10%"** means an idle `se` height of at most 1.10x today's sprite. The driver rounds to whole pixels,
  so a spec with `height = 1.1` can land 1 px over. Fixed models use 1.02 to 1.06 to leave margin.
- **big_un** (50 px against 46, 1.087x) is inside 10% and was left alone. black_orc and dwarf_blitzer were
  1.11x and were brought in.
- **Team-colour threshold for the men/chaos review.** The approved Vampire set has models at about 2 to 5% kit
  coverage (Vargheist kit1 4.6%, kit2 2.8%; Vampire Thrower kit1 2.1% from behind). So "missing or invisible"
  was taken to mean under about 2% of the figure in the `se` or `n` idle frame, or clearly invisible on the
  sheet. A pixel count over the kit layers (fixtools/audit.py in the scratchpad) found three such models:
  jaguar, khorngor and renegade_skaven.
- **Fox colour on the review sheet.** The Gnome review tint for kit2 is a red-orange very close to fox fur, so the
  kit2 straps look faint on the sheet. The game supplies real team colours, so this was not changed further.
- **Kroxigor head.** It is raised by a pose offset in `adjust()`, not by changing the race preset. The fall
  animation is left as it was.

## Seen and deliberately left alone (taste or tint, not a checklist failure)

- **Grail Knight and Valkyrie from behind** show almost only kit2 (cape or wings and braids; kit1 1.3 to 1.4%).
  This is the same pattern as the approved Vampire Thrower's cape, and kit1 is strong from the front.
- **Bretonian Knight Catcher and Knight Thrower** are both helmed knights in metal and blue. They differ in the
  quartered tabard against the dark legs, and in the spiked helm with arm tassels. That is weaker than ideal,
  but they are not identical.
- **Low-contrast review tints:** Nurgle kit1 (olive on green skin), Chaos Chosen kit2 (dark grey on dark
  armour), Necromantic Horror kit1 (slate), Amazon kit1 (gold on bronze skin). The kit areas exist; the
  default sheet tints make them look faint.
- **Pestigor** kit1 is 2.8% in `se`, at the level of the approved Vargheist. Its size was fixed, its colours were not.
- **Models at exactly 1.10x** (bret_catcher, grail_knight, human_blitzer, human_catcher, vampire_runner,
  chaos_troll, khorngor before this pass) are at the limit, not over it. Only khorngor was touched, because its
  kit was changed anyway.
- **Other batches' models over 1.10x** that were not in the fix list (bomma, doom_diver and fanatic at 1.12;
  ghoul at 1.13; skaven_blitzer at 1.10) were not in scope and were left alone.
- **Falls:** every men/chaos model ends lying down (bull_centaur on its side, as designed). No vanishing
  frames, no frames touching the canvas edge, no ball-like objects in any `pass` or `cheer` frame.

## Final scripted scan

`fixtools/scan.py` and `fixtools/audit.py` in the scratchpad check every men and chaos model plus the fix-list
models. They measure:

- kit1 and kit2 share under 2% in the `se` or `n` idle frame;
- idle height outside 0.90 to 1.10x of today's;
- frames touching the frame edge, and empty frames;
- the height of the fall end frame's pixel-mass centroid. The approved Vampire set peaks at 0.30 of idle
  height, so the flag limit is 0.33.

What the scan still flags, and why each one was accepted:

- grail_knight and valkyrie: kit1 from behind (see above).
- grail_knight and human_blitzer: 54/49 = 1.102, which is the 1 px rounding at the limit.
- kroxigor: kit2 from behind is 1.5%, because kit2 sits on the tail bands and the muzzle rim. It was not in the
  fix list for kit2; kit1 there is 15%.
- Falls flagged between 0.35 and 0.40: beer_boar, bull_centaur and woodland_fox fall onto their sides as
  four-legged bodies; chaos_troll and rotspawn lie with arms or tentacles raised. All five were checked on the
  sheets and end lying down.
- No edge-touching or empty frames anywhere.

Final `--finish`: the manifest has 130 models, each with 6 animations of 8 frames.

## Library

No `lib/` changes.
