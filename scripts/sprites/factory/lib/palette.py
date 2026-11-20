"""Palette and pixel materials.

Every material is a palette key that maps to a three-tone ramp (dark, mid, light) or to one flat colour.
The pixel shader picks one of the three tones from the diffuse lighting, with a one-pixel checker dither
locked to the screen where two tones meet, so every rendered pixel is exactly one palette colour.

kit1 and kit2 are rendered in reserved marker colours. After rendering they are moved to the kit1 / kit2
atlas layers as a grey ramp, which the game tints by multiplying with the team colours.

Team files may add ramps with ramp() / flat() / alias(); they must not change existing entries.
"""
import bpy

KIT_MARKERS = {"kit1": ("#3c003c", "#780078", "#f000f0"), "kit2": ("#003c3c", "#007878", "#00f0f0")}
KIT_GREYS = (0.42, 0.68, 0.96)          # dark, mid, light grey written to the kit layers
OUTLINE = "#1a1020"

RAMPS = {
    # team kit (reserved markers)
    "kit1": KIT_MARKERS["kit1"], "kit2": KIT_MARKERS["kit2"],
    # skins
    "skin": ("#8a7a9c", "#c4b8d2", "#f0ecf5"),                 # pale vampire
    "thrall_skin": ("#8a5c3c", "#b0805f", "#e2bc9e"), "skin_human": ("#8a5c3c", "#b0805f", "#e2bc9e"),
    "skin_fair": ("#a06a50", "#d69c7c", "#f6ccae"), "skin_tan": ("#6a4026", "#9a6238", "#c88a58"),
    "skin_dark": ("#3a2418", "#5e3a26", "#8a5a3c"), "skin_elf": ("#b08a78", "#e6c4ac", "#fae6d2"),
    "skin_orc": ("#2f4a22", "#56803a", "#86b356"), "skin_goblin": ("#3d5a1e", "#6e9a2c", "#a6cc4a"),
    "skin_troll": ("#3a4a52", "#62808a", "#94b4b8"), "skin_ogre": ("#7a4e38", "#b47e5c", "#e0ae8a"),
    "skin_rat": ("#8a4a52", "#c47e84", "#eab0b0"), "skin_lizard": ("#1e4a5a", "#2f7e8e", "#5ab8b8"),
    "skin_belly": ("#8a7a3c", "#c8b866", "#ece09a"), "skin_zombie": ("#4a5640", "#7a8a66", "#aab890"),
    "skin_ghoul": ("#5a5060", "#8a8094", "#b8b0c0"), "skin_golem": ("#5a6a5a", "#8a9a80", "#b8c4a8"),
    "skin_chaos": ("#5a1418", "#962428", "#d04a3a"), "skin_nurgle": ("#4a4a1e", "#7a7a30", "#a8a850"),
    "nos_skin": ("#5a6a5a", "#8a9a80", "#b8c4a8"),
    "varg_skin": ("#3e2a56", "#7a6688", "#a590b2"), "varg_dark": ("#1a1020", "#3e2a56", "#7a6688"),
    "ear_in": ("#8a7a9c", "#c4b8d2", "#c4b8d2"), "membrane": ("#1a1020", "#2e2636", "#565a70"),
    "lip": ("#8a7a9c", "#8a7a9c", "#c4b8d2"), "lip_f": ("#560a1c", "#8f1028", "#8f1028"),
    "lip_h": ("#8a5c3c", "#b0805f", "#b0805f"),
    # fur, bone, plants
    "fur_brown": ("#3a2416", "#6a4426", "#9a6c40"), "fur_grey": ("#3a3a46", "#666878", "#9a9cac"),
    "fur_white": ("#8a94a8", "#c8d0de", "#f4f6fa"), "fur_red": ("#6a2a14", "#a84a20", "#d87a3a"),
    "fur_black": ("#1a1020", "#2e2636", "#565a70"),
    "bone": ("#b0805f", "#f4ecd2", "#f4ecd2"), "bone_old": ("#8a7a5c", "#cfc3a0", "#f4ecd2"),
    "bandage": ("#7a6a4c", "#b8a67e", "#e4d6b0"),
    "bark": ("#3a2618", "#6a4a2c", "#967248"), "leaf": ("#1f4a22", "#3a7a34", "#6aae4a"),
    # hair
    "hair": ("#1a1020", "#2e2636", "#3e2a56"), "thrall_hair": ("#2e2636", "#54361f", "#8a5c3c"),
    "hair_brown": ("#2e2636", "#54361f", "#8a5c3c"), "hair_blond": ("#8a6a20", "#c8a03a", "#f0d470"),
    "hair_red": ("#6a2010", "#b03a18", "#e06a2a"), "hair_white": ("#8a8a9a", "#c8c8d4", "#f4f4f8"),
    # cloth and leather (not team coloured)
    "lining": ("#560a1c", "#560a1c", "#8f1028"), "shirt": ("#c4b8d2", "#f0ecf5", "#f0ecf5"),
    "trouser": ("#1a1020", "#2e2636", "#3e2a56"), "rags": ("#54361f", "#8a5c3c", "#b0805f"),
    "cloth_green": ("#243a22", "#3e6038", "#648a54"), "cloth_blue": ("#1e2a52", "#34488a", "#5a74b8"),
    "cloth_black": ("#1a1020", "#2e2636", "#565a70"),
    "leather": ("#2e2636", "#54361f", "#8a5c3c"), "boot": ("#2e2636", "#54361f", "#8a5c3c"),
    "sole": ("#1a1020", "#1a1020", "#2e2636"), "rope": ("#8a6a20", "#c8a03a", "#c8a03a"),
    "ball": ("#54361f", "#8a5c3c", "#b0805f"),
    # metal, wood, stone
    "metal": ("#565a70", "#969db0", "#d6dbe6"), "darkmetal": ("#2e2636", "#565a70", "#969db0"),
    "facemask": ("#565a70", "#969db0", "#d6dbe6"),
    "gold": ("#54361f", "#9a7430", "#e8c060"), "brass": ("#5a3a14", "#a8742a", "#e0b04c"),
    "rust": ("#4a2414", "#8a4a26", "#b8743c"), "wood": ("#3a2414", "#6e4826", "#a07040"),
    "stone": ("#3a3a46", "#666878", "#9a9cac"),
}
FLAT = {"eye": "#ff3030", "eye_yellow": "#ffd21e", "eye_green": "#6aff4a", "socket": "#1a1020", "mouth": "#560a1c",
        "white": "#f0ecf5", "fire": "#ff8a1e", "black": "#1a1020"}

# Default colours used only for the review sheets (the game supplies real team colours at run time).
TEAM_COLOURS = {
    "Amazon": ("#c8a02a", "#2a7a4a"), "Black Orc": ("#2e2e3a", "#c83a2a"), "Bretonian": ("#2a4aa8", "#e8c84a"),
    "Chaos Chosen": ("#8a1a1a", "#3a3a46"), "Chaos Dwarf": ("#a82a1a", "#e8b43a"), "Chaos Renegade": ("#5a2a7a", "#c8c8d0"),
    "Dark Elf": ("#5a2a8a", "#2a2a36"), "Dwarf": ("#2a5aa8", "#e8a02a"), "Elven Union": ("#2a8a8a", "#e8e0c8"),
    "Gnome": ("#3a8a3a", "#c84a2a"), "Goblin": ("#c8742a", "#3a3a46"), "Halfling": ("#6a9a3a", "#e8d48a"),
    "High Elf": ("#e8e8f0", "#2a5ac8"), "Human": ("#2a4ac8", "#e8e8e8"), "Imperial Nobility": ("#e8e8e8", "#c82a2a"),
    "Khorne": ("#a81a1a", "#c8a04a"), "Lizardmen": ("#2a8ab8", "#e8c84a"), "Necromantic Horror": ("#4a5a6a", "#8a2a2a"),
    "Norse": ("#3a6ab8", "#c8c8c8"), "Nurgle": ("#6a7a2a", "#8a5a3a"), "Ogre": ("#b85a2a", "#3a4a5a"),
    "Old World Alliance": ("#c8a02a", "#2a4a8a"), "Orc": ("#c82a2a", "#e8c82a"), "Shambiling Undead": ("#4a3a5a", "#8ab84a"),
    "Skaven": ("#8a2a2a", "#c8a84a"), "Snotling": ("#c8a02a", "#8a2a6a"), "Tomb Kings": ("#2a8a9a", "#e8c84a"),
    "Underworld Denizens": ("#6a3a8a", "#8ab82a"), "Vampire": ("#a3132b", "#7a5aa0"), "Wood Elf": ("#3a7a2a", "#c8a04a"),
}

CANVAS = [128, 128]      # set by the renderer before any material is built (the dither is in screen pixels)
STYLE = {"dither": 0.1, "tones": 3, "density": 1}
# dither: checker strength at tone edges; tones: 3 = dark/mid/light, 2 = dark/mid; density: pixels per
# pixel of the shipped size, which team files read to add details that only resolve from 2x up
MATS = {}

def ramp(name, dark, mid, light):
    """Register a new three-tone ramp (hex strings). Existing names cannot be redefined."""
    if name in RAMPS or name in FLAT:
        if RAMPS.get(name) != (dark, mid, light):
            raise ValueError("palette entry %r already exists" % name)
        return
    RAMPS[name] = (dark, mid, light)

def flat(name, hexc):
    if name in RAMPS or (name in FLAT and FLAT[name] != hexc):
        raise ValueError("palette entry %r already exists" % name)
    FLAT[name] = hexc

def alias(name, existing):
    if existing in FLAT:
        flat(name, FLAT[existing])
    else:
        ramp(name, *RAMPS[existing])

def lin(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple((x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4) for x in c)

def all_colours():
    """The master palette as a sorted list of hex strings."""
    return sorted({h for r in RAMPS.values() for h in r} | set(FLAT.values()) | {OUTLINE})

def clear():
    for m in list(MATS.values()):
        bpy.data.materials.remove(m)
    MATS.clear()

def _emission(name, colour_socket_or_rgb):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    return m, nt, em

def flat_material(name, rgb_linear):
    m, nt, em = _emission(name, None)
    em.inputs["Color"].default_value = tuple(rgb_linear) + (1,)
    return m

def material(key):
    if key in MATS:
        return MATS[key]
    if key in FLAT:
        MATS[key] = flat_material(key, lin(FLAT[key]))
        return MATS[key]
    if key not in RAMPS:
        raise KeyError("unknown palette key %r; add it with palette.ramp() or palette.flat() in your team file" % key)
    d, mid, light = (lin(h) for h in RAMPS[key])
    m, nt, em = _emission(key, None)
    N, LK = nt.nodes.new, nt.links.new
    diff = N("ShaderNodeBsdfDiffuse")
    s2r = N("ShaderNodeShaderToRGB")
    LK(diff.outputs[0], s2r.inputs[0])
    tc = N("ShaderNodeTexCoord")
    px = N("ShaderNodeVectorMath"); px.operation = "MULTIPLY"
    LK(tc.outputs["Window"], px.inputs[0])
    px.inputs[1].default_value = (CANVAS[0], CANVAS[1], 0)
    chk = N("ShaderNodeTexChecker")
    LK(px.outputs[0], chk.inputs["Vector"])
    chk.inputs["Scale"].default_value = 1.0
    off = N("ShaderNodeMath"); off.operation = "MULTIPLY_ADD"
    LK(chk.outputs["Fac"], off.inputs[0])
    off.inputs[1].default_value, off.inputs[2].default_value = STYLE["dither"], -STYLE["dither"] / 2
    add = N("ShaderNodeMath"); add.operation = "ADD"
    LK(s2r.outputs["Color"], add.inputs[0]); LK(off.outputs[0], add.inputs[1])
    r = N("ShaderNodeValToRGB")
    r.color_ramp.interpolation = "CONSTANT"
    els = r.color_ramp.elements
    els[0].position, els[0].color = 0.0, d + (1,)
    if STYLE["tones"] == 2:
        els[1].position, els[1].color = 0.3, mid + (1,)
    else:
        els[1].position, els[1].color = 0.58, light + (1,)
        e = els.new(0.2); e.color = mid + (1,)
    LK(add.outputs[0], r.inputs["Fac"])
    LK(r.outputs["Color"], em.inputs["Color"])
    MATS[key] = m
    return m
