"""One model spec per Blood Bowl player type, and which team fields which.

Loaded after blender_players.py and model_kit.py (it reads SKIN). Plain data
apart from that, so the page builder can read TEAMS and KITS too:

    python3 -c "import runpy; print(runpy.run_path('team_models.py', {'SKIN': {}})['TEAMS'])"

TEAMS keys match RosterName in src/data/RosterTemplates.ts, and the position
names match its positionName strings exactly.
"""


# Side of one pitch square in metres. The treeman is the biggest player, and
# its widest idle frame in any facing (2.77 m) just fits inside one square.
# Every other model keeps its true size against it.
SQUARE_M = 2.8


def M(body="human", parts=(), **kw):
    return dict(body=body, parts=list(parts), **kw)


def skin(name, **more):
    """Colours with a SKIN preset; keyword colours win, including skin itself."""
    return {"skin": SKIN[name], **more}


FOOTBALL = ["helmet:football", "visor", "pads:round", "number", "kneepads"]

MODELS = {
    # ------------------------------------------------------------ humans
    "human_lineman": M("human", ["face:human", *FOOTBALL]),
    "human_thrower": M("human", ["face:human", "hair:short", "helmet:open", "pads:round", "number", "hand_r:ball"],
                       colors=dict(hair=(0.5, 0.3, 0.15))),
    "human_catcher": M("human", ["face:human", "helmet:cap", "number", "kneepads", "gauntlets:kit2"],
                       shape=dict(torso=(0.46, 0.28, 0.5), arm=0.075), shorts="kit2"),
    "human_blitzer": M("human", ["face:human", "helmet:crested", "visor", "pads:big", "breastplate", "kneepads"]),
    "halfling_hopeful": M("halfling", ["face:halfling", "hair:short", "helmet:cap", "number"], feet="bare",
                          colors=dict(hair=(0.45, 0.25, 0.1))),
    "ogre": M("ogre", ["face:ogre", "hair:topknot", "gutplate", "pads:plate", "number"], feet="bare", gloves="skin",
              bare_arms=True, colors=skin("ogre", hair=(0.1, 0.08, 0.08))),

    # ------------------------------------------------------------- orcs
    "orc_lineman": M("orc", ["face:orc", "hair:bald", "hair:mohawk", "ears:small", "visor", "pads:spiked", "number"],
                     bare_arms=True, colors=skin("orc")),
    "orc_thrower": M("orc", ["face:orc", "helmet:open", "ears:small", "pads:round", "number", "hand_r:ball"],
                     bare_arms=True, colors=skin("orc")),
    "orc_blitzer": M("orc", ["face:orc", "helmet:horned", "pads:spiked", "breastplate:metal", "number"],
                     bare_arms=True, colors=skin("orc")),
    "big_un": M("orc", ["face:orc", "helmet:great", "pads:big", "breastplate:metal", "gauntlets:metal"],
                shape=dict(scale=1.2, torso=(0.74, 0.46, 0.56)), bare_arms=True, colors=skin("orc")),
    "goblin_lineman": M("goblin", ["face:goblin", "ears:goblin", "helmet:pot", "pads:round", "number"],
                        bare_arms=True, colors=skin("goblin")),
    "troll": M("troll", ["face:troll", "hair:short", "loincloth", "pads:plate"], shirt="skin", bare_arms=True,
               feet="bare", gloves="skin", colors=skin("troll", hair=(0.2, 0.3, 0.25))),

    # -------------------------------------------------------- black orcs
    "goblin_bruiser": M("goblin", ["face:goblin", "ears:goblin", "helmet:spiked", "pads:round", "hand_r:club"],
                        bare_arms=True, colors=skin("goblin")),
    "black_orc": M("black_orc", ["face:orc", "helmet:horned:steel", "pads:plate:steel", "breastplate:kit2",
                                 "gauntlets:steel", "number"], bare_arms=True, colors=skin("black_orc")),

    # ------------------------------------------------------- bretonnians
    "bret_squire": M("human", ["face:human", "hair:short", "helmet:open:steel", "tabard", "pads:round"],
                     colors=dict(hair=(0.6, 0.45, 0.2))),
    "bret_catcher": M("human", ["face:human", "helmet:crested:steel", "breastplate", "tabard", "bracers"],
                      shape=dict(torso=(0.48, 0.3, 0.5))),
    "bret_thrower": M("human", ["face:human", "helmet:winged:steel", "breastplate", "tabard", "hand_r:ball"]),
    "grail_knight": M("big_human", ["face:human", "helmet:great:steel", "helmet:crown", "pads:plate:steel",
                                    "breastplate:gold", "cape", "gauntlets"], colors=dict(gold=(0.95, 0.78, 0.3))),

    # ------------------------------------------------------------- chaos
    "beastman": M("beastman", ["face:goat", "horns:curled", "pads:fur", "loincloth"], feet="hoof", bare_arms=True,
                  legs="fur", shins="fur", colors=skin("goat")),
    "chaos_chosen": M("big_human", ["face:human", "helmet:spiked:metal", "horns:big", "pads:spiked:metal",
                                    "breastplate:metal", "gauntlets:metal", "back_spikes"],
                      shape=dict(scale=1.15)),
    "chaos_troll": M("troll", ["face:troll", "horns:small", "back_spikes", "loincloth", "pads:spiked"], shirt="skin",
                     bare_arms=True, feet="bare", gloves="skin", colors=skin("troll")),
    "chaos_ogre": M("ogre", ["face:ogre", "horns:big", "gutplate:bronze", "pads:spiked", "loincloth"], shirt="skin",
                    feet="bare", gloves="skin", bare_arms=True, colors=skin("ogre")),
    "minotaur": M("minotaur", ["face:bull", "horns:big", "hair:mane:fur", "loincloth", "chains", "tail:bull"],
                  shirt="skin", feet="hoof", gloves="skin", bare_arms=True, legs="fur", shins="fur",
                  colors=skin("bull", fur=(0.3, 0.2, 0.15))),

    # ------------------------------------------------------ chaos dwarfs
    "hobgoblin": M("goblin", ["face:goblin", "ears:small", "helmet:spiked", "pads:round", "number"],
                   shape=dict(hip=0.78, thigh=0.34, torso=(0.4, 0.28, 0.4), neck=0.48, shoulder=0.26, upper=0.3,
                              fore=0.28, head_scale=1.1), bare_arms=True,
                   colors=skin("goblin", skin=(0.42, 0.5, 0.38))),
    "hobgoblin_stabba": M("goblin", ["face:goblin", "ears:small", "helmet:hood", "helmet:mask", "hand_r:dagger",
                                     "hand_l:dagger"],
                          shape=dict(hip=0.78, thigh=0.34, torso=(0.38, 0.26, 0.4), neck=0.48, shoulder=0.24,
                                     upper=0.3, fore=0.28, head_scale=1.1), bare_arms=True,
                          colors=dict(skin=(0.42, 0.5, 0.38))),
    "chaos_dwarf": M("dwarf", ["face:dwarf", "beard:braided", "helmet:tophat:bronze", "pads:plate:bronze",
                               "breastplate:bronze"], colors=dict(skin=SKIN["chaos_dwarf"], hair=(0.06, 0.05, 0.06))),
    "flamesmith": M("dwarf", ["face:dwarf", "beard:huge", "helmet:tophat:bronze", "hand_r:flamer", "pads:round"],
                    colors=dict(skin=SKIN["chaos_dwarf"], hair=(0.06, 0.05, 0.06))),
    "bull_centaur": M("dwarf", ["face:dwarf", "beard:braided", "helmet:tophat:bronze", "pads:plate:bronze",
                                "tail:bull"], rig="centaur",
                      shape=dict(length=1.1, height=0.62, width=0.42, hide="skin", scale=1.1, head_scale=1.05),
                      colors=dict(skin=SKIN["chaos_dwarf"], hair=(0.06, 0.05, 0.06))),

    # -------------------------------------------------- chaos renegades
    "renegade_lineman": M("human", ["face:human", "helmet:spiked:metal", "pads:spiked", "number", "tattoos"],
                          bare_arms=True),
    "renegade_thrower": M("human", ["face:human", "helmet:hood", "pads:round", "hand_r:ball", "tattoos"],
                          bare_arms=True),
    "renegade_goblin": M("goblin", ["face:goblin", "ears:goblin", "helmet:spiked:metal", "pads:spiked"],
                         bare_arms=True, colors=skin("goblin")),
    "renegade_orc": M("orc", ["face:orc", "helmet:spiked:metal", "ears:small", "pads:spiked", "back_spikes"],
                      bare_arms=True, colors=skin("orc")),
    "renegade_skaven": M("skaven", ["face:rat", "ears:rat", "horns:small", "pads:spiked", "tail:rat"],
                         bare_arms=True, feet="claw", colors=skin("rat")),
    "renegade_dark_elf": M("elf", ["face:elf", "ears:elf", "hair:long", "helmet:spiked:metal", "pads:spiked"],
                           colors=dict(skin=SKIN["dark_elf"], hair=(0.92, 0.92, 0.98))),

    # --------------------------------------------------------- dark elves
    "de_lineman": M("elf", ["face:elf", "ears:elf", "hair:long", "helmet:spiked:metal", "pads:plate"],
                    colors=dict(skin=SKIN["dark_elf"], hair=(0.92, 0.92, 0.98))),
    "de_runner": M("elf", ["face:elf", "ears:elf_long", "hair:ponytail", "helmet:mask", "bracers"],
                   shape=dict(torso=(0.38, 0.25, 0.52)), colors=dict(skin=SKIN["dark_elf"], hair=(0.92, 0.92, 0.98))),
    "de_blitzer": M("elf", ["face:elf", "ears:elf", "hair:long", "helmet:spiked:metal", "pads:spiked:metal",
                            "breastplate:metal", "cape"], colors=dict(skin=SKIN["dark_elf"], hair=(0.92, 0.92, 0.98))),
    "assassin": M("elf", ["face:elf", "helmet:hood", "helmet:mask", "cape", "hand_r:dagger", "hand_l:dagger"],
                  colors=dict(skin=SKIN["dark_elf"])),
    "witch_elf": M("elf_female", ["face:elf", "ears:elf_long", "hair:wild_long", "bracers:kit2:blades",
                                  "high_boots", "collar"], bare_arms=True, legs="skin",
                   colors=dict(skin=SKIN["dark_elf"], hair=(0.96, 0.96, 1.0))),

    # -------------------------------------------------------------- dwarfs
    "dwarf_lineman": M("dwarf", ["face:dwarf", "beard:huge", "helmet:dwarf:steel", "pads:plate", "number"],
                       colors=dict(hair=(0.55, 0.3, 0.12))),
    "dwarf_runner": M("dwarf", ["face:dwarf", "beard:long", "helmet:open", "hand_r:ball"],
                      shape=dict(torso=(0.54, 0.4, 0.46)), colors=dict(hair=(0.35, 0.22, 0.1))),
    "dwarf_blitzer": M("dwarf", ["face:dwarf", "beard:braided", "helmet:horned:steel", "pads:spiked",
                                 "gauntlets"], colors=dict(hair=(0.7, 0.68, 0.62))),
    "troll_slayer": M("dwarf", ["face:dwarf", "hair:mohawk", "beard:braided", "tattoos", "hand_r:axe", "hand_l:axe",
                                "loincloth"], shirt="skin", bare_arms=True,
                      colors=dict(hair=(1.0, 0.45, 0.1))),
    "deathroller": M("dwarf", ["roller"], rig="vehicle", colors=dict(hair=(0.55, 0.3, 0.12))),

    # ------------------------------------------------------- elven union
    "union_lineman": M("elf", ["face:elf", "ears:elf", "helmet:sleek", "pads:round", "number", "kneepads"]),
    "union_thrower": M("elf", ["face:elf", "ears:elf", "hair:ponytail", "helmet:sleek", "pads:round", "hand_r:ball"],
                       colors=dict(hair=(0.95, 0.8, 0.4))),
    "union_catcher": M("elf", ["face:elf", "ears:elf", "helmet:sleek", "gauntlets:kit2", "kneepads"],
                       shape=dict(torso=(0.38, 0.25, 0.52))),
    "union_blitzer": M("elf", ["face:elf", "ears:elf", "helmet:sleek", "helmet:crested", "pads:big",
                               "breastplate:kit2"]),

    # ---------------------------------------------------------- high elves
    "he_lineman": M("elf", ["face:elf", "ears:elf", "hair:long", "helmet:tall", "pads:plate:gold", "tabard"],
                    colors=dict(hair=(0.98, 0.88, 0.55))),
    "he_thrower": M("elf", ["face:elf", "ears:elf", "hair:long", "helmet:tall", "cape", "hand_r:ball"],
                    colors=dict(hair=(0.98, 0.88, 0.55))),
    "he_catcher": M("elf", ["face:elf", "ears:elf", "hair:long", "helmet:winged", "kneepads"],
                    shape=dict(torso=(0.38, 0.25, 0.52)), colors=dict(hair=(0.98, 0.88, 0.55))),
    "he_blitzer": M("elf", ["face:elf", "ears:elf", "helmet:tall", "pads:plate:gold", "breastplate:gold", "cape"]),

    # -------------------------------------------------------------- gnomes
    "gnome_lineman": M("gnome", ["face:gnome", "beard:long", "helmet:pointed", "number"],
                       colors=dict(skin=(0.88, 0.62, 0.52), hair=(0.94, 0.93, 0.9))),
    "gnome_beastmaster": M("gnome", ["face:gnome", "beard:long", "helmet:pointed", "furcloak", "beastmaster",
                                     "hand_r:whip"], colors=dict(skin=(0.88, 0.62, 0.52), hair=(0.6, 0.6, 0.6))),
    "gnome_illusionist": M("gnome", ["face:gnome", "beard:huge", "helmet:wizard", "cape", "illusion", "hand_r:staff"],
                           colors=dict(skin=(0.88, 0.62, 0.52), hair=(0.94, 0.93, 0.9))),
    "woodland_fox": M("gnome", ["animal_head:fox", "tail:fox", "neckring"], rig="quad",
                      shape=dict(length=0.62, height=0.32, width=0.22, head_scale=1.0),
                      colors=dict(fur=(0.95, 0.42, 0.12), bone=(0.95, 0.92, 0.85))),
    "treeman": M("human", [], rig="tree", shape=dict(scale=1.25)),
    "treeman_loren": M("human", [], rig="tree", shape=dict(scale=1.25), colors=dict(leaf=(0.85, 0.55, 0.15), wood=(0.36, 0.26, 0.18))),

    # ------------------------------------------------------------- goblins
    "bomma": M("goblin", ["face:goblin", "ears:goblin", "helmet:cap", "hand_r:bomb", "hand_l:bomb"], bare_arms=True,
               colors=skin("goblin")),
    "loony": M("goblin", ["face:goblin", "ears:goblin", "helmet:pot", "eyes", "hand_r:chainsaw"], bare_arms=True,
               colors=skin("goblin")),
    "fanatic": M("goblin", ["face:goblin", "helmet:hood", "eyes", "hand_r:chain_ball"], bare_arms=True,
                 colors=skin("goblin")),
    "pogoer": M("goblin", ["face:goblin", "ears:goblin", "helmet:pot", "pogo"], bare_arms=True, colors=skin("goblin")),
    "ooligan": M("goblin", ["face:goblin", "ears:goblin", "hair:mohawk", "scarf", "hand_r:club"], bare_arms=True,
                 colors=skin("goblin", hair=(1.0, 0.2, 0.6))),
    "doom_diver": M("goblin", ["face:goblin", "ears:goblin", "helmet:cap", "doom_wings"], bare_arms=True,
                    colors=skin("goblin")),

    # ----------------------------------------------------------- halflings
    "halfling_hefty": M("halfling", ["face:halfling", "hair:short", "helmet:open", "pads:round", "number"], feet="bare",
                        shape=dict(belly=0.22, torso=(0.46, 0.38, 0.38)), colors=dict(hair=(0.45, 0.25, 0.1))),
    "halfling_catcher": M("halfling", ["face:halfling", "hair:short", "gauntlets:kit2", "kneepads"], feet="bare",
                          colors=dict(hair=(0.7, 0.45, 0.2))),

    # ---------------------------------------------------- imperial nobility
    "imperial_lineman": M("human", ["face:human", "helmet:open:steel", "tabard", "pads:round"]),
    "imperial_thrower": M("human", ["face:human", "hair:short", "helmet:feather", "cape", "hand_r:ball"],
                          colors=dict(feather=(1.0, 0.95, 0.9), hair=(0.4, 0.25, 0.12))),
    "noble_blitzer": M("human", ["face:human", "helmet:crested:steel", "breastplate:gold", "cape", "gauntlets"]),
    "bodyguard": M("big_human", ["face:human", "helmet:great:steel", "pads:plate:steel", "breastplate:steel",
                                 "gauntlets"]),

    # -------------------------------------------------------------- khorne
    "marauder": M("human", ["face:human", "helmet:spiked:bronze", "pads:fur", "tattoos", "chains"], bare_arms=True),
    "khorngor": M("beastman", ["face:goat", "horns:big:bronze", "pads:spiked:bronze", "loincloth"], feet="hoof",
                  bare_arms=True, legs="fur", shins="fur", colors=skin("goat", skin=(0.5, 0.25, 0.2))),
    "bloodseeker": M("big_human", ["face:human", "helmet:great:bronze", "horns:big:bronze", "pads:plate:bronze",
                                   "breastplate:kit2", "gauntlets:bronze", "back_spikes:bronze"], shape=dict(scale=1.15)),
    "bloodspawn": M("spawn", ["face:spawn", "mutation:claw", "back_spikes:bronze", "collar:bronze", "loincloth"],
                    shirt="skin", bare_arms=True, feet="claw", gloves="skin", colors=skin("red")),

    # ----------------------------------------------------------- lizardmen
    "skink": M("skink", ["face:lizard", "crest", "tail:thin_lizard", "loincloth"], feet="claw", bare_arms=True,
               colors=skin("skink")),
    "chameleon_skink": M("skink", ["face:lizard", "crest", "eyes:glow", "tail:thin_lizard", "loincloth",
                                   "hand_r:dagger"], feet="claw", bare_arms=True, shirt="skin",
                         colors=dict(skin=(0.45, 0.75, 0.35))),
    "saurus": M("saurus", ["face:lizard", "crest", "tail:lizard", "pads:plate:gold", "loincloth:kit1"],
                shirt="skin", feet="claw", bare_arms=True, gloves="skin", colors=skin("lizard")),
    "kroxigor": M("kroxigor", ["face:lizard", "crest", "tail:lizard", "loincloth", "pads:plate:kit2", "hand_r:hammer"],
                  shirt="skin", feet="claw", bare_arms=True, gloves="skin",
                  colors=dict(skin=(0.3, 0.45, 0.55))),

    # ------------------------------------------------- necromantic horror
    "zombie": M("zombie", ["face:zombie", "hair:short", "pads:round", "number"], colors=skin("zombie")),
    "ghoul": M("ghoul", ["face:human", "ears:small", "claws", "loincloth"], bare_arms=True, shirt="kit1", feet="bare",
               gloves="skin", colors=dict(skin=(0.65, 0.66, 0.7))),
    "wraith": M("human", ["face:hood", "helmet:hood", "hand_r:scythe"], rig="float",
                shape=dict(torso=(0.44, 0.28, 0.5), arm=0.06), colors=dict(skin=(0.1, 0.1, 0.12))),
    "werewolf": M("werewolf", ["face:wolf", "ears:wolf", "hair:mane:fur", "claws", "tail:wolf", "loincloth"],
                  shirt="kit1", bare_arms=True, feet="claw", gloves="skin", legs="fur", shins="fur",
                  colors=dict(skin=(0.4, 0.36, 0.34), fur=(0.32, 0.28, 0.26))),
    "flesh_golem": M("golem", ["face:human", "stitches", "hair:short", "pads:plate"], bare_arms=True, gloves="skin",
                     feet="bare", colors=dict(skin=(0.7, 0.62, 0.62))),

    # --------------------------------------------------------------- norse
    "norse_raider": M("human", ["face:human", "beard:braided", "helmet:horned:steel", "pads:fur", "number"],
                      colors=dict(hair=(0.9, 0.7, 0.3))),
    "beer_boar": M("human", ["animal_head:boar", "tail:boar", "saddle"], rig="quad",
                   shape=dict(length=0.64, height=0.34, width=0.3, head_scale=1.0), colors=dict(fur=(0.3, 0.2, 0.16))),
    "berserker": M("human", ["face:human", "hair:wild", "beard:long", "tattoos", "pads:fur", "hand_r:axe"],
                   shirt="skin", bare_arms=True, colors=dict(hair=(0.85, 0.45, 0.15))),
    "valkyrie": M("female", ["face:human", "hair:braids", "helmet:winged:steel", "breastplate", "cape",
                             "hand_l:shield", "hand_r:spear"], colors=dict(hair=(0.95, 0.82, 0.45))),
    "ulfwerener": M("werewolf", ["face:wolf", "ears:wolf", "furcloak", "pads:fur", "claws", "tail:wolf"],
                    shirt="kit1", bare_arms=True, feet="claw", gloves="skin", colors=dict(skin=SKIN["wolf"])),
    "yhetee": M("yhetee", ["face:yeti", "horns:curled:steel", "claws"], shirt="fur", bare_arms=True, legs="kit1",
                shins="fur", feet="claw", gloves="fur", sleeves="fur", forearms="fur",
                colors=dict(fur=(0.92, 0.94, 0.98), skin=(0.6, 0.75, 0.9), steel=(0.7, 0.9, 1.0))),

    # -------------------------------------------------------------- nurgle
    "rotter": M("zombie", ["face:zombie", "horns:single", "boils", "pads:round", "number"], colors=skin("rot")),
    "pestigor": M("beastman", ["face:goat", "horns:curled", "boils", "loincloth"], feet="hoof", bare_arms=True,
                  legs="fur", shins="fur", colors=skin("rot", fur=(0.4, 0.42, 0.25))),
    "bloater": M("big_human", ["face:zombie", "helmet:open", "horns:single", "boils", "pads:plate"],
                 shape=dict(belly=0.42, scale=1.12), colors=skin("rot")),
    "rotspawn": M("spawn", ["face:spawn", "mutation:tentacle", "boils", "loincloth"], shirt="skin", bare_arms=True,
                  feet="claw", gloves="skin", colors=skin("rot")),

    # ---------------------------------------------------------------- ogres
    "gnoblar": M("goblin", ["face:goblin", "ears:goblin", "hair:mohawk", "helmet:cap"],
                 shape=dict(hip=0.42, thigh=0.18, head_scale=1.35), bare_arms=True,
                 colors=dict(skin=(0.6, 0.62, 0.4), hair=(0.2, 0.15, 0.1))),
    "ogre_runt": M("ogre", ["face:ogre", "hair:bald", "gutplate", "number"], shape=dict(scale=1.0), feet="bare",
                   gloves="skin", bare_arms=True, colors=skin("ogre")),
    "ogre_blocker": M("ogre", ["face:ogre", "hair:topknot", "gutplate", "pads:plate", "gauntlets"],
                      shape=dict(scale=1.2), feet="bare", bare_arms=True, colors=skin("ogre")),

    # ------------------------------------------------------ shambling undead
    "skeleton": M("skeleton", ["face:skull", "helmet:open:metal", "pads:round"], sleeves="bone", forearms="bone",
                  gloves="bone", legs="bone", shins="bone", feet="bone", colors=dict(skin=SKIN["pale"])),
    "wight": M("skeleton", ["face:skull", "eyes:glow", "helmet:crown", "breastplate:metal", "pads:spiked:metal",
                            "cape"], shape=dict(scale=1.08, torso=(0.5, 0.3, 0.52)), forearms="bone", gloves="bone",
               shins="bone", colors=dict(skin=SKIN["pale"])),
    "mummy": M("mummy", ["face:wrapped", "bandages", "pads:round"], shirt="wrap", sleeves="wrap", forearms="wrap",
               gloves="wrap", legs="wrap", shins="wrap", feet="wrap"),

    # -------------------------------------------------------------- skaven
    "skaven_lineman": M("skaven", ["face:rat", "ears:rat", "helmet:open", "pads:round", "number", "tail:rat"],
                        bare_arms=True, feet="claw", colors=skin("rat")),
    "skaven_thrower": M("skaven", ["face:rat", "ears:rat", "helmet:hood", "pads:round", "tail:rat", "hand_r:ball"],
                        bare_arms=True, feet="claw", colors=skin("rat")),
    "gutter_runner": M("gutter_runner", ["face:rat", "ears:rat", "helmet:mask", "tail:rat", "hand_r:dagger"],
                       bare_arms=True, feet="claw", shirt="kit2", colors=skin("rat", fur=(0.2, 0.18, 0.18))),
    "skaven_blitzer": M("skaven", ["face:rat", "ears:rat", "helmet:spiked", "pads:spiked", "breastplate:metal",
                                   "tail:rat"], shape=dict(torso=(0.5, 0.34, 0.48), arm=0.08), bare_arms=True,
                        feet="claw", colors=skin("rat")),
    "rat_ogre": M("rat_ogre", ["face:rat", "ears:rat", "claws", "tail:rat", "chains", "pads:plate", "loincloth"],
                  shirt="skin", bare_arms=True, feet="claw", gloves="skin", colors=dict(skin=(0.72, 0.5, 0.48))),
    "rat_ogre_mutant": M("rat_ogre", ["face:rat", "ears:rat", "eyes:glow", "mutation:tentacle", "tail:rat",
                                      "pads:plate", "loincloth"], shirt="skin", bare_arms=True, feet="claw",
                         gloves="skin", colors=dict(skin=(0.6, 0.45, 0.62))),

    # ------------------------------------------------------------- snotlings
    "snotling": M("snotling", ["face:snotling", "ears:small", "helmet:pot"], bare_arms=True, colors=skin("snotling")),
    "fungus_flinga": M("snotling", ["face:snotling", "ears:small", "helmet:pointed", "hand_r:fungus"], bare_arms=True,
                       colors=skin("snotling")),
    "fun_hoppa": M("snotling", ["face:snotling", "ears:small", "helmet:cap", "mushroom"], bare_arms=True,
                   colors=skin("snotling")),
    "stilty_runna": M("snotling", ["face:snotling", "ears:small", "helmet:pot"], bare_arms=True,
                      shape=dict(hip=0.82, thigh=0.36), legs="wood", shins="wood", feet="wood",
                      colors=skin("snotling")),
    "pump_wagon": M("snotling", ["wagon"], rig="vehicle", colors=skin("snotling")),

    # ----------------------------------------------------------- tomb kings
    "tk_skeleton": M("skeleton", ["face:skull", "helmet:nemes", "loincloth:kit1", "hand_r:spear"], shirt="bone",
                     sleeves="bone", forearms="bone", gloves="bone", legs="bone", shins="bone", feet="bone"),
    "anointed_thrower": M("skeleton", ["face:skull", "eyes:glow", "helmet:nemes", "collar:gold", "hand_r:ball",
                                       "loincloth"], sleeves="bone", forearms="bone", gloves="bone", legs="bone",
                          shins="bone", feet="bone"),
    "anointed_blitzer": M("skeleton", ["face:skull", "eyes:glow", "helmet:nemes", "breastplate:gold", "pads:plate:gold",
                                       "loincloth"], forearms="bone", gloves="bone", legs="bone", shins="bone",
                          feet="bone"),
    "tomb_guardian": M("tomb_guardian", ["face:skull", "eyes:glow", "helmet:nemes", "breastplate:bronze",
                                         "pads:plate:bronze", "hand_r:axe"], shirt="kit1", sleeves="bone",
                       forearms="bone", gloves="bone", legs="bone", shins="bone", feet="bone",
                       colors=dict(bone=(0.82, 0.76, 0.6))),

    # --------------------------------------------------- underworld denizens
    "goblin_underworld": M("goblin", ["face:goblin", "ears:goblin", "helmet:hood", "eyes:glow", "pads:round"],
                           bare_arms=True, colors=dict(skin=(0.5, 0.6, 0.45))),
    "snotling_underworld": M("snotling", ["face:snotling", "ears:small", "eyes:glow", "helmet:hood"], bare_arms=True,
                             colors=skin("snotling")),
    "troll_underworld": M("troll", ["face:troll", "eyes:glow", "boils:glow", "loincloth"], shirt="skin",
                          bare_arms=True, feet="bare", gloves="skin", colors=dict(skin=(0.45, 0.42, 0.55))),

    # ------------------------------------------------------------ vampires
    "thrall": M("human", ["face:human", "hair:short", "pads:round", "number"], colors=dict(skin=(0.78, 0.7, 0.68))),
    "vampire_thrower": M("human", ["face:vampire", "hair:slick", "eyes", "collar", "cape", "hand_r:ball"],
                         shape=dict(torso=(0.48, 0.3, 0.52)), colors=skin("pale")),
    "vampire_blitzer": M("human", ["face:vampire", "hair:slick", "eyes", "collar", "pads:plate", "breastplate:metal"],
                         shape=dict(torso=(0.52, 0.32, 0.52)), colors=skin("pale")),
    "vampire_runner": M("human", ["face:vampire", "hair:slick", "eyes", "collar", "kneepads"],
                        shape=dict(torso=(0.44, 0.28, 0.52), arm=0.07), colors=skin("pale")),
    "vargheist": M("vargheist", ["face:bat", "eyes", "wings:bat", "claws", "loincloth", "collar"], shirt="skin",
                   bare_arms=True, feet="claw", gloves="skin", colors=dict(skin=(0.5, 0.42, 0.55))),

    # ----------------------------------------------------------- wood elves
    "we_lineman": M("elf", ["face:elf", "ears:elf", "hair:long", "helmet:open", "pads:leaf"],
                    colors=dict(hair=(0.6, 0.25, 0.1))),
    "we_thrower": M("elf", ["face:elf", "ears:elf", "hair:braids", "pads:leaf", "hand_r:ball"],
                    colors=dict(hair=(0.75, 0.55, 0.2))),
    "we_catcher": M("elf", ["face:elf", "ears:elf_long", "hair:ponytail", "gauntlets:kit2", "kneepads"],
                    shape=dict(torso=(0.36, 0.24, 0.5)), colors=dict(hair=(0.4, 0.22, 0.1))),
    "wardancer": M("elf", ["face:elf", "ears:elf_long", "hair:topknot", "tattoos", "loincloth", "hand_r:dagger",
                           "hand_l:dagger"], shirt="skin", bare_arms=True, colors=dict(hair=(1.0, 0.35, 0.1))),
}

# Amazons.
MODELS.update({
    "amazon_eagle": M("female", ["face:human", "hair:long", "helmet:feather", "loincloth"], bare_arms=True,
                      legs="skin", colors=dict(skin=SKIN["tan"], hair=(0.1, 0.07, 0.05))),
    "amazon_python": M("female", ["face:human", "hair:braids", "helmet:hood", "loincloth", "hand_r:ball"],
                       bare_arms=True, legs="skin", colors=dict(skin=SKIN["tan"], hair=(0.1, 0.07, 0.05))),
    "amazon_piranha": M("female", ["face:human", "hair:wild_long", "bracers:kit2:blades", "loincloth", "high_boots"],
                        bare_arms=True, legs="skin", colors=dict(skin=SKIN["tan"], hair=(0.1, 0.07, 0.05))),
    "amazon_jaguar": M("female", ["face:human", "hair:long", "furcloak", "pads:fur", "loincloth"], bare_arms=True,
                       legs="skin", shape=dict(torso=(0.5, 0.3, 0.52), arm=0.08, scale=1.05),
                       colors=dict(skin=SKIN["tan"], hair=(0.1, 0.07, 0.05), fur=(0.95, 0.65, 0.2))),
})

TEAMS = {
    "AMAZON": [("Eagle Warrior", "amazon_eagle"), ("Python Warrior", "amazon_python"),
               ("Piranha Warrior", "amazon_piranha"), ("Jaguar Warrior", "amazon_jaguar")],
    "BLACK_ORC": [("Goblin Bruiser", "goblin_bruiser"), ("Black Orc", "black_orc"), ("Trained Troll", "troll")],
    "BRETONIAN": [("Bretonian Squire", "bret_squire"), ("Bretonian Knight Catcher", "bret_catcher"),
                  ("Bretonian Knight Thrower", "bret_thrower"), ("Grail Knight", "grail_knight")],
    "CHAOS_CHOSEN": [("Beastmen", "beastman"), ("Chaos Chosen", "chaos_chosen"), ("Chaos Troll", "chaos_troll"),
                     ("Chaos Ogre", "chaos_ogre"), ("Minotaur", "minotaur")],
    "CHAOS_DWARF": [("Hobgoblin Lineman", "hobgoblin"), ("Hobgoblin Sneaky Stabbas", "hobgoblin_stabba"),
                    ("Chaos Dwarf Blocker", "chaos_dwarf"), ("Chaos Dwarf Flamesmith", "flamesmith"),
                    ("Bull Centaur Blitzer", "bull_centaur"), ("Minotaur", "minotaur")],
    "CHAOS_RENEGADE": [("Renegade Lineman", "renegade_lineman"), ("Renegade Human Thrower", "renegade_thrower"),
                       ("Renegade Goblin", "renegade_goblin"), ("Renegade Orc", "renegade_orc"),
                       ("Renegade Skaven", "renegade_skaven"), ("Renegade Dark Elf", "renegade_dark_elf"),
                       ("Renegade Troll", "chaos_troll"), ("Renegade Ogre", "chaos_ogre"),
                       ("Renegade Rat Ogre", "rat_ogre"), ("Renegade Minotaur", "minotaur")],
    "DARK_ELF": [("Dark Elf Lineman", "de_lineman"), ("Dark Elf Runner", "de_runner"),
                 ("Dark Elf Blitzer", "de_blitzer"), ("Assassin", "assassin"), ("Witch Elf", "witch_elf")],
    "DWARF": [("Dwarf Lineman", "dwarf_lineman"), ("Dwarf Runner", "dwarf_runner"), ("Dwarf Blitzer", "dwarf_blitzer"),
              ("Troll Slayer", "troll_slayer"), ("Deathroller", "deathroller")],
    "ELVEN_UNION": [("Union Lineman", "union_lineman"), ("Union Thrower", "union_thrower"),
                    ("Union Catcher", "union_catcher"), ("Union Blitzer", "union_blitzer")],
    "HIGH_ELF": [("High Elf Lineman", "he_lineman"), ("High Elf Thrower", "he_thrower"),
                 ("High Elf Catcher", "he_catcher"), ("High Elf Blitzer", "he_blitzer")],
    "GNOME": [("Gnome Lineman", "gnome_lineman"), ("Gnome Beastmaster", "gnome_beastmaster"),
              ("Gnome Illusionist", "gnome_illusionist"), ("Woodland Fox", "woodland_fox"),
              ("Altern Forest Treeman", "treeman")],
    "GOBLIN": [("Goblin Lineman", "goblin_lineman"), ("Bomma", "bomma"), ("Loony", "loony"), ("Fanatic", "fanatic"),
               ("Pogoer", "pogoer"), ("'Ooligan", "ooligan"), ("Doom Diver", "doom_diver"),
               ("Trained Troll", "troll")],
    "HALFLING": [("Halfling Hopeful", "halfling_hopeful"), ("Halfling Hefty", "halfling_hefty"),
                 ("Halfling Catcher", "halfling_catcher"), ("Altern Forest Treeman", "treeman")],
    "HUMAN": [("Human Lineman", "human_lineman"), ("Human Thrower", "human_thrower"),
              ("Human Catcher", "human_catcher"), ("Human Blitzer", "human_blitzer"),
              ("Halfling Hopeful", "halfling_hopeful"), ("Ogre", "ogre")],
    "IMPERIAL_NOBILITY": [("Imperial Lineman", "imperial_lineman"), ("Imperial Thrower", "imperial_thrower"),
                          ("Noble Blitzer", "noble_blitzer"), ("Bodyguard", "bodyguard"), ("Ogre", "ogre")],
    "KHORNE": [("Bloodborn Marauder", "marauder"), ("Khorngor", "khorngor"), ("Bloodseeker", "bloodseeker"),
               ("Bloodspawn", "bloodspawn")],
    "LIZARDMEN": [("Skink Lineman", "skink"), ("Chameleon Skink", "chameleon_skink"),
                  ("Saurus Blocker", "saurus"), ("Kroxigor", "kroxigor")],
    "NECROMANTIC_HORROR": [("Zombie Lineman", "zombie"), ("Ghoul Runner", "ghoul"), ("Wraith", "wraith"),
                           ("Werewolf", "werewolf"), ("Flesh Golem", "flesh_golem")],
    "NORSE": [("Norse Raider Lineman", "norse_raider"), ("Beer Boar", "beer_boar"), ("Norse Berserker", "berserker"),
              ("Valkyrie", "valkyrie"), ("Ulfwerener", "ulfwerener"), ("Yhetee", "yhetee")],
    "NURGLE": [("Rotter Lineman", "rotter"), ("Pestigor", "pestigor"), ("Bloater", "bloater"),
               ("Rotspawn", "rotspawn")],
    "OGRE": [("Gnoblar Lineman", "gnoblar"), ("Ogre Runt Punter", "ogre_runt"), ("Ogre Blocker", "ogre_blocker")],
    "OLD_WORLD_ALLIANCE": [("Human Lineman", "human_lineman"), ("Human Thrower", "human_thrower"),
                           ("Human Catcher", "human_catcher"), ("Human Blitzer", "human_blitzer"),
                           ("Dwarf Lineman", "dwarf_lineman"), ("Dwarf Runner", "dwarf_runner"),
                           ("Dwarf Blitzer", "dwarf_blitzer"), ("Troll Slayer", "troll_slayer"),
                           ("Halfling Hopeful", "halfling_hopeful"), ("Ogre", "ogre"),
                           ("Altern Forest Treeman", "treeman")],
    "ORC": [("Orc Lineman", "orc_lineman"), ("Goblin Lineman", "goblin_lineman"), ("Orc Thrower", "orc_thrower"),
            ("Orc Blitzer", "orc_blitzer"), ("Big Un Blocker", "big_un"), ("Untrained Troll", "troll")],
    "SHAMBLING_UNDEAD": [("Skeleton Lineman", "skeleton"), ("Zombie Lineman", "zombie"), ("Ghoul Runner", "ghoul"),
                         ("Wight Blitzer", "wight"), ("Mummy", "mummy")],
    "SKAVEN": [("Skaven Lineman", "skaven_lineman"), ("Skaven Thrower", "skaven_thrower"),
               ("Gutter Runner", "gutter_runner"), ("Skaven Blitzer", "skaven_blitzer"), ("Rat Ogre", "rat_ogre")],
    "SNOTLING": [("Snotling Lineman", "snotling"), ("Fungus Flinga", "fungus_flinga"), ("Fun-hoppa", "fun_hoppa"),
                 ("Stilty Runna", "stilty_runna"), ("Pump Wagon", "pump_wagon"), ("Trained Troll", "troll")],
    "TOMB_KINGS": [("Skeleton Lineman", "tk_skeleton"), ("Anointed Thrower", "anointed_thrower"),
                   ("Anointed Blitzer", "anointed_blitzer"), ("Tomb Guardian", "tomb_guardian")],
    "UNDERWORLD_DENIZENS": [("Underworld Goblin Lineman", "goblin_underworld"),
                            ("Underworld Snotling", "snotling_underworld"), ("Skaven Clanrat", "skaven_lineman"),
                            ("Skaven Thrower", "skaven_thrower"), ("Gutter Runner", "gutter_runner"),
                            ("Skaven Blitzer", "skaven_blitzer"), ("Underworld Troll", "troll_underworld"),
                            ("Mutant Rat Ogre", "rat_ogre_mutant")],
    "VAMPIRE": [("Thrall Lineman", "thrall"), ("Vampire Thrower", "vampire_thrower"),
                ("Vampire Blitzer", "vampire_blitzer"), ("Vampire Runner", "vampire_runner"),
                ("Vargheist", "vargheist")],
    "WOOD_ELF": [("Wood Elf Lineman", "we_lineman"), ("Wood Elf Thrower", "we_thrower"),
                 ("Wood Elf Catcher", "we_catcher"), ("Wardancer", "wardancer"),
                 ("Loren Forest Treeman", "treeman_loren")],
}

# Neon kit per team: primary (jersey), secondary (pads, helmets). Secondaries
# stay mid-tone: near-black helmets made heads vanish into the pads.
KITS = {
    "AMAZON": (0xff8a1e, 0x2ac0b0), "BLACK_ORC": (0xffd21e, 0x8a8a96), "BRETONIAN": (0x2e6bff, 0xffd84a),
    "CHAOS_CHOSEN": (0xff2a3a, 0x9a5a6a), "CHAOS_DWARF": (0xff4a1e, 0xc08a4a), "CHAOS_RENEGADE": (0xff2a9d, 0x9a7a8a),
    "DARK_ELF": (0xa040ff, 0x7a6a9a), "DWARF": (0xff9a1e, 0x5a8ae0), "ELVEN_UNION": (0x23e6ff, 0xf2f6ff),
    "HIGH_ELF": (0xf6f2e4, 0xffc832), "GNOME": (0x4affb4, 0xff7a3a), "GOBLIN": (0xd4ff1e, 0x7aa83a),
    "HALFLING": (0xffe04a, 0x6ac04a), "HUMAN": (0xff2a9d, 0x9a8ac8), "IMPERIAL_NOBILITY": (0xff3a4a, 0xffc832),
    "KHORNE": (0xff1a1a, 0xe0a040), "LIZARDMEN": (0x1effc8, 0xffb21e), "NECROMANTIC_HORROR": (0x9a4aff, 0x4aff7a),
    "NORSE": (0x8ad8ff, 0xf2f6ff), "NURGLE": (0xa8d42a, 0xa08a5a), "OGRE": (0xff7a1e, 0xa89090),
    "OLD_WORLD_ALLIANCE": (0x3a8aff, 0xf2f2f2), "ORC": (0x23e6ff, 0x6a9aaa), "SHAMBLING_UNDEAD": (0xc04aff, 0x9a8ab0),
    "SKAVEN": (0x8aff1e, 0xa08a6a), "SNOTLING": (0xb4ff3a, 0xff4ab4), "TOMB_KINGS": (0xffc832, 0x1ec8c8),
    "UNDERWORLD_DENIZENS": (0x5aff3a, 0xa04ae0), "VAMPIRE": (0xff1e3a, 0x8a7a9a), "WOOD_ELF": (0x7aff3a, 0x4aa04a),
}
