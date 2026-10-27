"""Model kit: body presets, rigs and a vocabulary of parts for Blood Bowl players.

Loaded into the same globals as blender_players.py, after it. A model is a
spec dict:

    dict(
        body="orc",                      # a BODIES preset
        shape={"hunch": 0.3},            # overrides on that preset
        rig="biped",                     # biped, quad, centaur, vehicle, float, tree
        colors={"skin": (r, g, b)},      # overrides on the material colours
        parts=["face:orc", "helmet:football", "pads:spiked", "hand_r:dagger"],
    )

Each part is "name" or "name:arg:arg". PARTS maps the name to a builder that
places meshes on the rig's joints. Kit-coloured meshes use the kit1 and kit2
materials, which Phaser tints with the team colours.
"""

import math

# Body presets. Lengths in metres; a human's hips stand at 1.0.
HUMAN = dict(hip=1.0, thigh=0.44, chest=0.1, torso=(0.52, 0.32, 0.5), neck=0.62, shoulder=0.34,
             pad=0.17, arm=0.085, upper=0.34, fore=0.3, fist=0.095, hunch=0.0, scale=1.0, head_scale=1.0)


def body(base=HUMAN, **kw):
    out = dict(base)
    out.update(kw)
    return out


BODIES = {
    "human": body(),
    "female": body(hip=1.0, torso=(0.44, 0.27, 0.5), shoulder=0.28, pad=0.13, arm=0.068, fist=0.08,
                   upper=0.33, fore=0.29, female=True),
    "big_human": body(scale=1.08, torso=(0.6, 0.38, 0.54), shoulder=0.4, pad=0.2, arm=0.1, fist=0.11),
    "elf": body(hip=1.1, thigh=0.5, torso=(0.42, 0.27, 0.54), neck=0.64, shoulder=0.28, pad=0.13,
                arm=0.068, upper=0.36, fore=0.33, fist=0.075),
    "elf_female": body(hip=1.1, thigh=0.5, torso=(0.4, 0.25, 0.5), neck=0.6, shoulder=0.25, pad=0.0,
                       arm=0.06, upper=0.34, fore=0.31, fist=0.068, female=True),
    "dwarf": body(hip=0.6, thigh=0.26, torso=(0.62, 0.44, 0.48), neck=0.5, shoulder=0.38, pad=0.16,
                  arm=0.1, upper=0.27, fore=0.25, fist=0.105, head_scale=1.15),
    "halfling": body(hip=0.55, thigh=0.24, torso=(0.42, 0.34, 0.36), neck=0.4, shoulder=0.24, pad=0.1,
                     arm=0.065, upper=0.22, fore=0.2, fist=0.07, head_scale=1.25, belly=0.17),
    "goblin": body(hip=0.52, thigh=0.22, chest=0.05, torso=(0.34, 0.25, 0.3), neck=0.36, shoulder=0.21,
                   pad=0.1, arm=0.055, upper=0.22, fore=0.21, fist=0.07, hunch=0.25, head_scale=1.3),
    "snotling": body(hip=0.3, thigh=0.12, chest=0.04, torso=(0.24, 0.2, 0.2), neck=0.22, shoulder=0.14,
                     pad=0.0, arm=0.04, upper=0.14, fore=0.13, fist=0.05, hunch=0.2, head_scale=1.05),
    "gnome": body(hip=0.52, thigh=0.22, chest=0.05, torso=(0.44, 0.34, 0.34), neck=0.38, shoulder=0.26,
                  pad=0.1, arm=0.066, upper=0.22, fore=0.2, fist=0.075, hunch=0.05, head_scale=1.2),
    "orc": body(hip=0.86, thigh=0.38, chest=0.08, torso=(0.68, 0.42, 0.52), neck=0.6, shoulder=0.44,
                pad=0.19, arm=0.12, upper=0.36, fore=0.36, fist=0.14, hunch=0.2, scale=1.12),
    "black_orc": body(hip=0.9, thigh=0.4, chest=0.08, torso=(0.78, 0.48, 0.56), neck=0.62, shoulder=0.5,
                      pad=0.22, arm=0.14, upper=0.38, fore=0.38, fist=0.16, hunch=0.22, scale=1.2),
    "skaven": body(hip=0.95, thigh=0.42, torso=(0.44, 0.3, 0.46), neck=0.58, shoulder=0.29, pad=0.13,
                   arm=0.068, upper=0.34, fore=0.32, fist=0.075, hunch=0.32),
    "gutter_runner": body(hip=0.92, thigh=0.42, torso=(0.36, 0.26, 0.42), neck=0.55, shoulder=0.24,
                          pad=0.0, arm=0.058, upper=0.33, fore=0.31, fist=0.065, hunch=0.42),
    "beastman": body(torso=(0.56, 0.36, 0.52), shoulder=0.37, arm=0.095, fist=0.105, hunch=0.12),
    "ogre": body(hip=1.2, thigh=0.52, chest=0.12, torso=(0.98, 0.64, 0.8), neck=0.86, shoulder=0.64,
                 pad=0.24, arm=0.17, upper=0.5, fore=0.5, fist=0.2, hunch=0.18, scale=1.12, belly=0.38),
    "troll": body(hip=1.2, thigh=0.56, chest=0.12, torso=(0.82, 0.52, 0.76), neck=0.76, shoulder=0.56,
                  pad=0.0, arm=0.15, upper=0.62, fore=0.62, fist=0.19, hunch=0.5, scale=1.12),
    "minotaur": body(hip=1.2, thigh=0.54, chest=0.12, torso=(0.92, 0.56, 0.8), neck=0.82, shoulder=0.6,
                     pad=0.0, arm=0.16, upper=0.52, fore=0.5, fist=0.18, hunch=0.22, scale=1.12),
    "rat_ogre": body(hip=1.12, thigh=0.5, chest=0.12, torso=(0.86, 0.56, 0.76), neck=0.74, shoulder=0.58,
                     pad=0.0, arm=0.15, upper=0.56, fore=0.56, fist=0.17, hunch=0.5, scale=1.1),
    "kroxigor": body(hip=1.18, thigh=0.52, chest=0.12, torso=(0.96, 0.62, 0.8), neck=0.8, shoulder=0.62,
                     pad=0.0, arm=0.17, upper=0.52, fore=0.52, fist=0.19, hunch=0.38, scale=1.14),
    "saurus": body(hip=1.02, thigh=0.46, torso=(0.64, 0.44, 0.56), neck=0.66, shoulder=0.42, pad=0.0,
                   arm=0.11, upper=0.36, fore=0.34, fist=0.12, hunch=0.24, scale=1.08),
    "skink": body(hip=0.72, thigh=0.32, torso=(0.36, 0.26, 0.36), neck=0.46, shoulder=0.22, pad=0.0,
                  arm=0.055, upper=0.26, fore=0.24, fist=0.06, hunch=0.18, head_scale=1.15),
    "skeleton": body(torso=(0.44, 0.26, 0.5), shoulder=0.3, pad=0.0, arm=0.045, fist=0.065),
    "zombie": body(hunch=0.25, torso=(0.5, 0.3, 0.5), arm=0.08),
    "ghoul": body(hip=0.95, torso=(0.4, 0.28, 0.46), shoulder=0.27, pad=0.0, arm=0.06, upper=0.38,
                  fore=0.38, fist=0.075, hunch=0.48),
    "werewolf": body(hip=1.05, thigh=0.46, torso=(0.62, 0.42, 0.58), shoulder=0.42, pad=0.0, arm=0.11,
                     upper=0.4, fore=0.4, fist=0.12, hunch=0.35, scale=1.08),
    "mummy": body(scale=1.25, torso=(0.62, 0.38, 0.58), shoulder=0.4, pad=0.0, arm=0.11, fist=0.11, hunch=0.15),
    "golem": body(hip=1.15, thigh=0.5, chest=0.12, torso=(0.9, 0.58, 0.76), neck=0.78, shoulder=0.58,
                  pad=0.0, arm=0.16, upper=0.48, fore=0.48, fist=0.19, hunch=0.2, scale=1.12, belly=0.3),
    "tomb_guardian": body(hip=1.15, thigh=0.5, chest=0.12, torso=(0.72, 0.42, 0.72), neck=0.76,
                          shoulder=0.48, pad=0.0, arm=0.08, upper=0.5, fore=0.48, fist=0.12, scale=1.2),
    "vargheist": body(hip=1.12, thigh=0.5, chest=0.12, torso=(0.72, 0.46, 0.7), neck=0.72, shoulder=0.5,
                      pad=0.0, arm=0.11, upper=0.56, fore=0.56, fist=0.13, hunch=0.55, scale=1.12),
    "spawn": body(hip=1.18, thigh=0.5, chest=0.12, torso=(1.0, 0.68, 0.82), neck=0.74, shoulder=0.64,
                  pad=0.0, arm=0.17, upper=0.5, fore=0.52, fist=0.2, hunch=0.4, scale=1.12, belly=0.4),
    "yhetee": body(hip=1.18, thigh=0.52, chest=0.12, torso=(0.9, 0.6, 0.78), neck=0.78, shoulder=0.6,
                   pad=0.0, arm=0.17, upper=0.54, fore=0.54, fist=0.19, hunch=0.35, scale=1.1),
}

# Materials every model can use. The style palette and the spec override these.
BASE_COLORS = dict(
    cloth=(0.26, 0.24, 0.32), leather=(0.3, 0.2, 0.16), boot=(0.08, 0.07, 0.1), metal=(0.1, 0.1, 0.13),
    steel=(0.62, 0.65, 0.72), gold=(0.92, 0.72, 0.26), bronze=(0.72, 0.45, 0.2), bone=(0.9, 0.86, 0.74),
    fur=(0.46, 0.34, 0.24), wood=(0.44, 0.28, 0.15), leaf=(0.34, 0.66, 0.28), wrap=(0.8, 0.76, 0.6),
    hair=(0.08, 0.07, 0.1), skin=(0.8, 0.58, 0.52), horn=(0.78, 0.72, 0.6), feather=(0.95, 0.4, 0.15),
    flesh=(0.75, 0.4, 0.45), dark=(0.05, 0.05, 0.07),
)
FLAT_COLORS = dict(eyes=(1.0, 0.08, 0.1), glow=(0.3, 1.0, 0.45), fire=(1.0, 0.55, 0.1))
SKIN = dict(
    human=(0.8, 0.58, 0.52), tan=(0.66, 0.44, 0.32), dark=(0.42, 0.28, 0.2), pale=(0.88, 0.88, 0.95),
    elf=(0.86, 0.7, 0.62), dark_elf=(0.78, 0.76, 0.88), orc=(0.34, 0.66, 0.42), black_orc=(0.2, 0.3, 0.24),
    goblin=(0.48, 0.66, 0.3), snotling=(0.55, 0.78, 0.32), troll=(0.4, 0.55, 0.5), ogre=(0.78, 0.6, 0.5),
    rat=(0.48, 0.4, 0.34), lizard=(0.25, 0.6, 0.62), skink=(0.3, 0.55, 0.85), zombie=(0.55, 0.65, 0.45),
    rot=(0.6, 0.66, 0.38), dwarf=(0.82, 0.6, 0.5), chaos_dwarf=(0.62, 0.48, 0.42), bull=(0.36, 0.24, 0.18),
    goat=(0.5, 0.4, 0.32), wolf=(0.45, 0.42, 0.4), yeti=(0.9, 0.92, 0.96), red=(0.75, 0.25, 0.22),
)

SIDES = (("l", 1), ("r", -1))


class Ctx:
    """What a part builder needs: the joints, the body plan and torso size."""

    def __init__(self, spec, b):
        self.spec = spec
        self.b = b
        self.j = {}
        self.tw, self.td, self.th = b["torso"]
        self.lw = self.tw / 0.52


# ----------------------------------------------------------------------- rigs


def rig_biped(c):
    b, spec = c.b, c.spec
    leg = b["hip"] - 0.08
    root = joint("root", None, (0, 0, 0))
    root.scale = (b["scale"],) * 3
    bodyj = joint("body", root, (0, 0, b["hip"]))
    chest = joint("chest", bodyj, (0, 0, b["chest"]))
    head = joint("head", chest, (0, -0.1 * min(1.0, b["hunch"] * 3) - 0.2 * b["hunch"], b["neck"]))  # hunched heads jut forward
    head.scale = (b["head_scale"],) * 3
    c.j.update(root=root, body=bodyj, chest=chest, head=head)
    tw, td, th, lw = c.tw, c.td, c.th, c.lw
    shirt = spec.get("shirt", "kit1")

    mesh_object("pelvis", box(tw * (0.95 if b.get("female") else 0.88), td * 0.92, 0.28), spec.get("shorts", "cloth"), bodyj, (0, 0, -0.04))
    mesh_object("belt", box(tw * 0.92, td, 0.06), "leather", bodyj, (0, 0, 0.1))
    if b.get("female"):
        mesh_object("waist", box(tw * 0.74, td * 0.82, th * 0.5), shirt, chest, (0, 0, th * 0.28))
        mesh_object("ribs", box(tw, td, th * 0.5), shirt, chest, (0, 0, th * 0.74))
        for side, sx in SIDES:
            mesh_object(f"bust_{side}", sphere(tw * 0.15), shirt, chest, (tw * 0.18 * sx, -td * 0.42, th * 0.68),
                        scale=(1, 0.75, 0.85))
    else:
        mesh_object("torso", box(tw, td, th), shirt, chest, (0, 0, th * 0.6))
    if b.get("belly"):
        mesh_object("belly", sphere(b["belly"]), spec.get("belly_part", shirt), chest,
                    (0, -td * 0.35, th * 0.32), scale=(1.2, 1.0, 1.0))
    mesh_object("neck", cylinder(0.08 * lw ** 0.5, 0.14), "skin", head, (0, 0, 0.1))

    arm_part = "skin" if spec.get("bare_arms") else spec.get("sleeves", shirt)
    for side, sx in SIDES:
        sh = joint(f"shoulder_{side}", chest, (b["shoulder"] * sx, 0, th * 0.92))
        el = joint(f"elbow_{side}", sh, (0, 0, -b["upper"]))
        hand = joint(f"hand_{side}", el, (0, 0, -b["fore"] - b["fist"] * 0.4))
        mesh_object(f"upper_arm_{side}", cylinder(b["arm"], b["upper"], 1.15), arm_part, sh)
        mesh_object(f"forearm_{side}", cylinder(b["arm"] * 0.9, b["fore"]), spec.get("forearms", "skin"), el)
        mesh_object(f"fist_{side}", sphere(b["fist"]), spec.get("gloves", "leather"), hand)

        hip = joint(f"hip_{side}", bodyj, (0.13 * sx * lw, 0, -0.08))
        kn = joint(f"knee_{side}", hip, (0, 0, -b["thigh"]))
        ankle = joint(f"ankle_{side}", kn, (0, 0, -(leg - b["thigh"]) + 0.07))
        mesh_object(f"thigh_{side}", cylinder(0.1 * lw, b["thigh"], 1.1), spec.get("legs", "cloth"), hip)
        mesh_object(f"shin_{side}", cylinder(0.085 * lw, leg - b["thigh"] - 0.14), spec.get("shins", "boot"), kn)
        feet = spec.get("feet", "boot")
        if feet == "hoof":
            mesh_object(f"hoof_{side}", cylinder(0.075 * lw, 0.14, 1.25), "dark", ankle, (0, 0, 0.07))
        elif feet == "claw":
            mesh_object(f"foot_{side}", box(0.16 * lw, 0.3 * lw, 0.1), "skin", ankle, (0, -0.06 * lw, -0.02))
            for k in (-1, 0, 1):
                mesh_object(f"talon_{side}{k}", cone(0.025 * lw, 0.1 * lw), "horn", ankle,
                            (0.05 * k * lw, -0.2 * lw, -0.04), rotation=(1.57, 0, 0))
        elif feet == "bare":
            mesh_object(f"foot_{side}", box(0.15 * lw, 0.28 * lw, 0.1), "skin", ankle, (0, -0.05 * lw, -0.02))
        else:
            mesh_object(f"boot_{side}", box(0.17 * lw, 0.3 * lw, 0.14), feet if feet != "boot" else "boot", ankle, (0, -0.05 * lw, 0))
        c.j.update({f"shoulder_{side}": sh, f"elbow_{side}": el, f"hand_{side}": hand, f"hip_{side}": hip,
                    f"knee_{side}": kn, f"ankle_{side}": ankle})
    c.j["tail"] = joint("tail", bodyj, (0, td * 0.45, -0.05))


def rig_quad(c, mount=False):
    """Four legs and a level body. `length` and `height` come from the shape."""
    b = c.b
    L, H, W = b.get("length", 0.9), b.get("height", 0.45), b.get("width", 0.32)
    root = joint("root", None, (0, 0, 0))
    root.scale = (b["scale"],) * 3
    bodyj = joint("body", root, (0, 0, H))
    c.j.update(root=root, body=bodyj)
    mesh_object("barrel", sphere(0.5), b.get("hide", "fur"), bodyj, (0, 0, 0.04), scale=(W * 1.15, L, H * 0.62))
    for name, (sx, sy) in dict(fl=(1, -1), fr=(-1, -1), bl=(1, 1), br=(-1, 1)).items():
        hip = joint(f"leg_{name}", bodyj, (W * 0.42 * sx, L * 0.36 * sy, -0.02))
        kn = joint(f"knee_{name}", hip, (0, 0, -H * 0.5))
        mesh_object(f"thigh_{name}", cylinder(W * 0.24, H * 0.5, 1.2), b.get("hide", "fur"), hip)
        mesh_object(f"shin_{name}", cylinder(W * 0.15, H * 0.44), b.get("hide", "fur"), kn)
        mesh_object(f"paw_{name}", sphere(W * 0.18), b.get("paws", "dark"), kn, (0, -0.02, -H * 0.46), scale=(1, 1.3, 0.6))
    c.j["tail"] = joint("tail", bodyj, (0, L * 0.5, 0.06))
    if not mount:
        neck = joint("neck", bodyj, (0, -L * 0.48, H * 0.28))
        head = joint("head", neck, (0, -0.06, 0.08))
        head.scale = (b["head_scale"],) * 3
        c.j.update(neck=neck, head=head, chest=bodyj)


def rig_centaur(c):
    """Bull body with a man's torso on the front of it."""
    rig_quad(c, mount=True)
    b = c.b
    L, H = b.get("length", 1.1), b.get("height", 0.6)
    chest = joint("chest", c.j["body"], (0, -L * 0.36, H * 0.42))
    head = joint("head", chest, (0, -0.05, b["neck"]))
    head.scale = (b["head_scale"],) * 3
    c.j.update(chest=chest, head=head)
    mesh_object("torso", box(c.tw, c.td, c.th), c.spec.get("shirt", "kit1"), chest, (0, 0, c.th * 0.55))
    for side, sx in SIDES:
        sh = joint(f"shoulder_{side}", chest, (b["shoulder"] * sx, 0, c.th * 0.92))
        el = joint(f"elbow_{side}", sh, (0, 0, -b["upper"]))
        hand = joint(f"hand_{side}", el, (0, 0, -b["fore"] - b["fist"] * 0.4))
        mesh_object(f"upper_arm_{side}", cylinder(b["arm"], b["upper"], 1.15), "skin", sh)
        mesh_object(f"forearm_{side}", cylinder(b["arm"] * 0.9, b["fore"]), "skin", el)
        mesh_object(f"fist_{side}", sphere(b["fist"]), "leather", hand)
        c.j.update({f"shoulder_{side}": sh, f"elbow_{side}": el, f"hand_{side}": hand})


def rig_vehicle(c):
    """A chassis on wheels or a roller, with a driver joint on top."""
    root = joint("root", None, (0, 0, 0))
    bodyj = joint("body", root, (0, 0, 0.45))
    roller = joint("roller", root, (0, -0.95, 0.42))
    driver = joint("chest", bodyj, (0, 0.25, 0.42))
    head = joint("head", driver, (0, -0.02, 0.42))
    head.scale = (1.15,) * 3
    c.j.update(root=root, body=bodyj, roller=roller, chest=driver, head=head)


def rig_float(c):
    """A hooded robe that hovers: no legs."""
    b = c.b
    root = joint("root", None, (0, 0, 0))
    bodyj = joint("body", root, (0, 0, 1.15))
    chest = joint("chest", bodyj, (0, 0, 0.05))
    head = joint("head", chest, (0, -0.06, b["neck"]))
    c.j.update(root=root, body=bodyj, chest=chest, head=head)
    mesh_object("robe", cone(0.36, 1.1), "kit2", bodyj, (0, 0.04, -1.0))
    mesh_object("robe_top", box(c.tw, c.td, c.th), "kit1", chest, (0, 0, c.th * 0.6))
    for side, sx in SIDES:
        sh = joint(f"shoulder_{side}", chest, (b["shoulder"] * sx, 0, c.th * 0.92))
        el = joint(f"elbow_{side}", sh, (0, 0, -b["upper"]))
        hand = joint(f"hand_{side}", el, (0, 0, -b["fore"] - b["fist"] * 0.4))
        mesh_object(f"sleeve_{side}", cylinder(b["arm"] * 1.4, b["upper"], 0.8), "kit2", sh)
        mesh_object(f"forearm_{side}", cylinder(b["arm"] * 0.7, b["fore"]), "bone", el)
        mesh_object(f"fist_{side}", sphere(b["fist"]), "bone", hand)
        c.j.update({f"shoulder_{side}": sh, f"elbow_{side}": el, f"hand_{side}": hand})


def rig_tree(c):
    """Trunk, root legs and branch arms."""
    root = joint("root", None, (0, 0, 0))
    root.scale = (c.b["scale"],) * 3
    bodyj = joint("body", root, (0, 0, 1.1))
    chest = joint("chest", bodyj, (0, 0, 0.2))
    head = joint("head", chest, (0, -0.1, 1.4))
    c.j.update(root=root, body=bodyj, chest=chest, head=head)
    mesh_object("trunk_low", cylinder(0.42, 0.75, 0.85), "wood", bodyj, (0, 0, 0.35))
    mesh_object("trunk", cylinder(0.36, 1.5, 0.85), "wood", chest, (0, 0, 1.4))
    mesh_object("bark_kit", box(0.5, 0.06, 0.5), "kit1", chest, (0, -0.33, 0.8))
    for k, (x, y, z, s) in enumerate(((0.25, 0.1, 1.75, 0.42), (-0.3, 0.05, 1.7, 0.38), (0.0, 0.2, 1.95, 0.45),
                                      (0.1, -0.2, 1.8, 0.32))):
        mesh_object(f"leaves_{k}", sphere(s), "leaf", chest, (x, y, z), scale=(1, 1, 0.8))
    for side, sx in SIDES:
        sh = joint(f"shoulder_{side}", chest, (0.36 * sx, 0, 1.15))
        el = joint(f"elbow_{side}", sh, (0, 0, -0.7))
        hand = joint(f"hand_{side}", el, (0, 0, -0.6))
        mesh_object(f"branch_up_{side}", cylinder(0.12, 0.7, 1.2), "wood", sh)
        mesh_object(f"branch_low_{side}", cylinder(0.09, 0.62), "wood", el)
        for k in (-1, 0, 1):
            mesh_object(f"twig_{side}{k}", cone(0.04, 0.3), "wood", hand, (0.05 * k, 0, 0), rotation=(3.14 + 0.4 * k, 0, 0))
        hip = joint(f"hip_{side}", bodyj, (0.22 * sx, 0, 0))
        kn = joint(f"knee_{side}", hip, (0, 0, -0.55))
        mesh_object(f"root_up_{side}", cylinder(0.17, 0.55, 1.1), "wood", hip)
        mesh_object(f"root_low_{side}", cylinder(0.14, 0.5, 1.0), "wood", kn)
        for k in (-1, 0, 1):
            mesh_object(f"rootlet_{side}{k}", cone(0.06, 0.32), "wood", kn, (0.06 * k, -0.08, -0.5), rotation=(1.9, 0.4 * k, 0))
        c.j.update({f"shoulder_{side}": sh, f"elbow_{side}": el, f"hand_{side}": hand, f"hip_{side}": hip, f"knee_{side}": kn})


RIGS = dict(biped=rig_biped, quad=rig_quad, centaur=rig_centaur, vehicle=rig_vehicle, float=rig_float, tree=rig_tree)

# ---------------------------------------------------------------------- heads


def p_face(c, kind="human"):
    h = c.j["head"]
    m = mesh_object
    if kind in ("human", "elf", "zombie", "vampire"):
        sx = 0.8 if kind in ("elf", "vampire") else 0.85
        m("face", sphere(0.15), "skin", h, (0, -0.05, 0.12), scale=(sx, 0.8, 1.0))
        if kind == "zombie":
            m("jaw", box(0.16, 0.12, 0.06), "skin", h, (0.02, -0.12, 0.02), rotation=(0.3, 0, 0.2))
    elif kind == "orc":
        m("face", sphere(0.17), "skin", h, (0, -0.08, 0.1), scale=(1.15, 0.95, 0.9))
        m("jaw", box(0.28, 0.2, 0.12), "skin", h, (0, -0.12, 0.0))
        for sx in (1, -1):
            m(f"tusk_{sx}", cone(0.03, 0.1), "bone", h, (0.09 * sx, -0.2, 0.04))
    elif kind == "goblin":
        m("face", sphere(0.16), "skin", h, (0, -0.04, 0.12), scale=(1.0, 0.95, 0.9))
        m("nose", cone(0.045, 0.17), "skin", h, (0, -0.16, 0.1), rotation=(1.75, 0, 0))
        m("grin", box(0.14, 0.03, 0.02), "bone", h, (0, -0.17, 0.03))
    elif kind == "rat":
        m("face", sphere(0.14), "skin", h, (0, -0.03, 0.14))
        m("snout", cone(0.09, 0.26), "skin", h, (0, -0.1, 0.1), rotation=(1.75, 0, 0))
        m("nose_tip", sphere(0.03), "flesh", h, (0, -0.36, 0.06))
        m("teeth", box(0.04, 0.02, 0.05), "bone", h, (0, -0.3, 0.02))
    elif kind == "lizard":
        m("face", sphere(0.14), "skin", h, (0, -0.02, 0.14), scale=(0.9, 1, 0.9))
        m("snout", box(0.16, 0.3, 0.12), "skin", h, (0, -0.2, 0.08))
        m("brow", box(0.2, 0.06, 0.04), "skin", h, (0, -0.1, 0.19))
    elif kind == "bull":
        m("face", sphere(0.2), "skin", h, (0, -0.06, 0.14), scale=(1, 1.05, 0.95))
        m("muzzle", box(0.24, 0.24, 0.16), "skin", h, (0, -0.24, 0.06))
        m("nostrils", box(0.18, 0.02, 0.06), "dark", h, (0, -0.365, 0.06))
        m("ring", cylinder(0.05, 0.015), "gold", h, (0, -0.37, 0.03), rotation=(1.57, 0, 0))
    elif kind == "goat":
        m("face", sphere(0.15), "skin", h, (0, -0.04, 0.13))
        m("muzzle", box(0.13, 0.2, 0.12), "skin", h, (0, -0.18, 0.06), rotation=(-0.3, 0, 0))
        m("beard_tuft", cone(0.05, 0.12), "fur", h, (0, -0.2, -0.04), rotation=(3.14, 0, 0))
    elif kind == "wolf":
        m("face", sphere(0.16), "skin", h, (0, -0.03, 0.14))
        m("snout", cone(0.1, 0.28), "skin", h, (0, -0.12, 0.08), rotation=(1.65, 0, 0))
        m("fangs", box(0.08, 0.02, 0.05), "bone", h, (0, -0.3, 0.0))
    elif kind == "skull":
        m("face", sphere(0.14), "bone", h, (0, -0.04, 0.14), scale=(0.85, 0.9, 1.0))
        m("jaw", box(0.14, 0.12, 0.06), "bone", h, (0, -0.1, 0.02))
        for sx in (1, -1):
            m(f"socket_{sx}", box(0.05, 0.02, 0.045), "dark", h, (0.05 * sx, -0.165, 0.15))
    elif kind == "ogre":
        m("face", sphere(0.2), "skin", h, (0, -0.06, 0.12), scale=(1.1, 0.95, 0.9))
        m("jaw", box(0.32, 0.18, 0.14), "skin", h, (0, -0.1, -0.02))
        m("teeth", box(0.24, 0.02, 0.03), "bone", h, (0, -0.19, 0.03))
    elif kind == "troll":
        m("face", sphere(0.17), "skin", h, (0, -0.05, 0.14), scale=(0.95, 1.0, 1.05))
        m("nose", cone(0.06, 0.2), "skin", h, (0, -0.16, 0.14), rotation=(2.0, 0, 0))
        m("jaw", box(0.3, 0.2, 0.12), "skin", h, (0, -0.12, -0.02))
        for sx in (1, -1):
            m(f"tusk_{sx}", cone(0.03, 0.09), "bone", h, (0.1 * sx, -0.2, 0.03))
    elif kind == "yeti":
        m("face", sphere(0.2), "fur", h, (0, -0.04, 0.14), scale=(1.1, 1, 1))
        m("muzzle", box(0.2, 0.08, 0.12), "skin", h, (0, -0.2, 0.08))
    elif kind == "wrapped":
        m("face", sphere(0.15), "wrap", h, (0, -0.04, 0.13))
        for sx in (1, -1):
            m(f"eye_{sx}", box(0.04, 0.02, 0.025), "glow", h, (0.05 * sx, -0.18, 0.15))
    elif kind == "hood":
        m("face", sphere(0.13), "dark", h, (0, -0.04, 0.13))
        for sx in (1, -1):
            m(f"eye_{sx}", box(0.04, 0.02, 0.025), "glow", h, (0.05 * sx, -0.16, 0.15))
    elif kind == "dwarf":
        m("face", sphere(0.15), "skin", h, (0, -0.05, 0.12), scale=(0.95, 0.85, 0.95))
        m("nose", sphere(0.05), "skin", h, (0, -0.18, 0.12))
    elif kind == "gnome":
        m("face", sphere(0.15), "skin", h, (0, -0.04, 0.12))
        m("nose", sphere(0.065), "skin", h, (0, -0.17, 0.1))
    elif kind == "halfling":
        m("face", sphere(0.16), "skin", h, (0, -0.04, 0.12), scale=(1.0, 0.9, 0.95))
        m("cheeks", box(0.22, 0.04, 0.06), "flesh", h, (0, -0.15, 0.08))
    elif kind == "snotling":
        m("face", sphere(0.16), "skin", h, (0, -0.02, 0.12))
        m("mouth", box(0.16, 0.03, 0.03), "dark", h, (0, -0.16, 0.06))
    elif kind == "spawn":
        m("face", sphere(0.18), "skin", h, (0.04, -0.06, 0.1), scale=(1.2, 1, 0.85))
        m("maw", box(0.26, 0.04, 0.1), "flesh", h, (0, -0.22, 0.04))
        for k, x in enumerate((-0.08, 0.02, 0.1)):
            m(f"eye_{k}", sphere(0.03), "glow", h, (x, -0.2, 0.16 + 0.03 * k))
    elif kind == "bat":
        m("face", sphere(0.17), "skin", h, (0, -0.05, 0.12))
        m("snout", box(0.12, 0.12, 0.08), "skin", h, (0, -0.2, 0.08))
        m("fangs", box(0.1, 0.02, 0.06), "bone", h, (0, -0.26, 0.02))
        for sx in (1, -1):
            m(f"bat_ear_{sx}", cone(0.07, 0.26), "skin", h, (0.12 * sx, 0, 0.26), rotation=(0, 0.4 * sx, 0))
    else:
        raise ValueError(f"unknown face {kind}")


def p_eyes(c, color="eyes"):
    for sx in (1, -1):
        mesh_object(f"glow_eye_{sx}", box(0.045, 0.02, 0.025), color, c.j["head"], (0.05 * sx, -0.17, 0.15))


def p_ears(c, kind="elf"):
    h = c.j["head"]
    spec = dict(elf=(0.035, 0.22, 1.1, -0.3), elf_long=(0.035, 0.3, 1.0, -0.6), goblin=(0.06, 0.34, 1.25, -0.2),
                rat=(0.07, 0.14, 0.3, 0.0), wolf=(0.06, 0.18, 0.3, 0.0), small=(0.04, 0.1, 1.3, 0.0))[kind]
    r, length, out, tilt = spec
    for sx in (1, -1):
        y = 0.04 if kind in ("rat", "wolf") else -0.02
        z = 0.27 if kind in ("rat", "wolf") else 0.15
        mesh_object(f"ear_{sx}", cone(r, length), "skin", h, (0.12 * sx, y, z), rotation=(tilt, out * sx, 0))


def p_hair(c, kind="short", part="hair"):
    h = c.j["head"]
    m = mesh_object
    if kind == "mohawk":
        m("mohawk", box(0.06, 0.34, 0.12), part, h, (0, 0.0, 0.36))
    elif kind == "ponytail":
        m("ponytail", box(0.09, 0.07, 0.42), part, h, (0, 0.2, 0.02), rotation=(-0.35, 0, 0))
    elif kind == "long":
        m("hair_cap", sphere(0.16), part, h, (0, 0.03, 0.18), scale=(1.02, 1.05, 0.95))
        m("hair_back", box(0.26, 0.08, 0.46), part, h, (0, 0.13, -0.06), rotation=(-0.15, 0, 0))
    elif kind == "wild":
        m("hair_cap", sphere(0.16), part, h, (0, 0.04, 0.2), scale=(1.0, 1.05, 0.95))
        for k, (ry, rx) in enumerate([(0, -0.9), (0.5, -0.7), (-0.5, -0.7), (0.9, -0.3), (-0.9, -0.3), (0.3, -1.4), (-0.3, -1.4)]):
            m(f"spike_{k}", cone(0.06, 0.34), part, h, (0, 0.08, 0.24), rotation=(rx, ry, 0))
    elif kind == "wild_long":
        p_hair(c, "wild", part)
        m("hair_mane", box(0.3, 0.1, 0.55), part, h, (0, 0.16, -0.1), rotation=(-0.2, 0, 0))
    elif kind == "slick":
        m("hair", sphere(0.165), part, h, (0, 0.03, 0.19), scale=(1.0, 1.08, 0.82))
        m("widows_peak", cone(0.05, 0.1), part, h, (0, -0.15, 0.25), rotation=(2.6, 0, 0))
    elif kind == "topknot":
        m("hair_cap", sphere(0.155), part, h, (0, 0.03, 0.18), scale=(1, 1, 0.8))
        m("topknot", cylinder(0.05, 0.22), part, h, (0, 0.04, 0.5))
        m("topknot_tail", box(0.05, 0.05, 0.3), part, h, (0, 0.14, 0.3), rotation=(-0.6, 0, 0))
    elif kind == "braids":
        m("hair_cap", sphere(0.16), part, h, (0, 0.03, 0.18), scale=(1.02, 1.05, 0.95))
        for sx in (1, -1):
            m(f"braid_{sx}", cylinder(0.04, 0.4), part, h, (0.13 * sx, -0.02, 0.1))
    elif kind == "short":
        m("hair_cap", sphere(0.158), part, h, (0, 0.03, 0.17), scale=(1, 1.05, 0.85))
    elif kind == "mane":
        m("mane", sphere(0.26), part, h, (0, 0.08, 0.05), scale=(1.1, 1, 1.1))
    elif kind == "bald":
        m("dome", sphere(0.17), "skin", h, (0, -0.02, 0.22), scale=(1.0, 1.05, 0.95))
    else:
        raise ValueError(f"unknown hair {kind}")


def p_beard(c, kind="long", part="hair"):
    h = c.j["head"]
    size = dict(short=(0.13, 0.9), long=(0.16, 1.3), huge=(0.2, 1.7), braided=(0.16, 1.3))[kind]
    mesh_object("beard", sphere(size[0]), part, h, (0, -0.1, -0.03), scale=(1.0, 0.75, size[1]))
    if kind == "braided":
        for sx in (1, -1):
            mesh_object(f"beard_braid_{sx}", cylinder(0.035, 0.26), part, h, (0.06 * sx, -0.13, -0.15))
    mesh_object("moustache", box(0.2, 0.05, 0.05), part, h, (0, -0.17, 0.08))


def p_horns(c, kind="small", part="horn"):
    h = c.j["head"]
    r, length, out, up, x, z = dict(small=(0.04, 0.16, 0.5, 0.0, 0.12, 0.3), big=(0.07, 0.38, 1.25, -0.5, 0.18, 0.24),
                                    curled=(0.05, 0.26, 0.6, 0.7, 0.12, 0.28), single=(0.05, 0.22, 0.0, 0.3, 0.0, 0.34),
                                    viking=(0.045, 0.24, 1.0, -0.2, 0.16, 0.3))[kind]
    sides = (1,) if kind == "single" else (1, -1)
    for sx in sides:
        mesh_object(f"horn_{sx}", cone(r, length), part, h, (x * sx, 0.02, z), rotation=(up, out * sx, 0))


def p_helmet(c, kind="football", part="kit2"):
    h = c.j["head"]
    m = mesh_object
    if kind == "football":
        m("helmet", sphere(0.2), part, h, (0, 0.03, 0.2), scale=(1.0, 1.05, 0.95))
        m("stripe", box(0.07, 0.42, 0.04), "kit1", h, (0, 0.03, 0.384))
        m("cage", box(0.26, 0.04, 0.03), "steel", h, (0, -0.19, 0.08))
        m("cage_v", box(0.03, 0.04, 0.16), "steel", h, (0, -0.2, 0.12))
    elif kind == "open":
        m("helmet", sphere(0.19), part, h, (0, 0.04, 0.22), scale=(1.0, 1.05, 0.8))
    elif kind == "dwarf":
        m("helmet", sphere(0.19), part, h, (0, 0.03, 0.22), scale=(1.0, 1.05, 0.85))
        m("nasal", box(0.035, 0.03, 0.14), part, h, (0, -0.18, 0.17))
        m("rim", cylinder(0.2, 0.04), "bronze", h, (0, 0.03, 0.2))
    elif kind == "winged":
        m("helmet", sphere(0.19), part, h, (0, 0.03, 0.22), scale=(1.0, 1.05, 0.85))
        for sx in (1, -1):
            m(f"wing_{sx}", box(0.03, 0.22, 0.2), "steel", h, (0.18 * sx, 0.08, 0.32), rotation=(0.5, -0.3 * sx, 0))
    elif kind == "great":
        m("helmet", cylinder(0.19, 0.36), part, h, (0, 0.0, 0.38))
        m("helm_top", sphere(0.19), part, h, (0, 0, 0.38), scale=(1, 1, 0.45))
        m("eye_slit", box(0.26, 0.04, 0.035), "dark", h, (0, -0.185, 0.2))
    elif kind == "crested":
        m("helmet", sphere(0.19), part, h, (0, 0.03, 0.22), scale=(0.95, 1.08, 0.9))
        m("crest", box(0.04, 0.42, 0.22), "kit1", h, (0, 0.06, 0.44))
    elif kind == "tall":
        m("helmet", sphere(0.18), part, h, (0, 0.03, 0.26), scale=(0.95, 1.1, 1.25))
        m("crest", box(0.035, 0.34, 0.26), "gold", h, (0, 0.05, 0.5))
        m("cheek", box(0.3, 0.04, 0.16), part, h, (0, -0.12, 0.1))
    elif kind == "sleek":
        m("helmet", sphere(0.19), part, h, (0, 0.04, 0.22), scale=(0.95, 1.15, 0.85))
        m("fin", box(0.03, 0.4, 0.12), "kit1", h, (0, 0.08, 0.38))
        m("visor_bar", box(0.3, 0.05, 0.05), "glow", h, (0, -0.16, 0.17))
    elif kind == "spiked":
        m("helmet", sphere(0.19), part, h, (0, 0.03, 0.22), scale=(0.95, 1.08, 0.95))
        for k, ry in enumerate((-0.6, 0.0, 0.6)):
            m(f"spike_{k}", cone(0.04, 0.22), "steel", h, (0, 0.04, 0.36), rotation=(-0.3, ry, 0))
    elif kind == "horned":
        m("helmet", sphere(0.19), part, h, (0, 0.03, 0.22), scale=(1.0, 1.05, 0.85))
        p_horns(c, "viking")
    elif kind == "hood":
        m("hood", sphere(0.2), part, h, (0, 0.04, 0.18), scale=(1.0, 1.1, 1.05))
        m("hood_tip", cone(0.12, 0.2), part, h, (0, 0.14, 0.32), rotation=(-0.9, 0, 0))
    elif kind == "pointed":
        m("hat", cone(0.18, 0.5), part, h, (0, 0.02, 0.2), rotation=(-0.3, 0, 0))
        m("hat_band", cylinder(0.185, 0.06), "kit1", h, (0, 0.02, 0.26))
    elif kind == "wizard":
        m("hat_brim", cylinder(0.3, 0.03), part, h, (0, 0.02, 0.25))
        m("hat", cone(0.17, 0.62), part, h, (0, 0.04, 0.25), rotation=(-0.35, 0, 0))
    elif kind == "pot":
        m("helmet", sphere(0.22), part, h, (0, 0.03, 0.2), scale=(1.0, 1.0, 0.82))
        m("stripe", box(0.07, 0.45, 0.04), "kit1", h, (0, 0.03, 0.375))
    elif kind == "cap":
        m("cap", sphere(0.17), part, h, (0, 0.02, 0.2), scale=(1.0, 1.05, 0.7))
        m("peak", box(0.24, 0.12, 0.03), part, h, (0, -0.18, 0.2))
    elif kind == "nemes":
        m("nemes", sphere(0.19), part, h, (0, 0.03, 0.2), scale=(1.0, 1.05, 0.9))
        for sx in (1, -1):
            m(f"lappet_{sx}", box(0.1, 0.06, 0.34), part, h, (0.14 * sx, -0.02, -0.04))
        m("uraeus", cone(0.03, 0.1), "gold", h, (0, -0.18, 0.32))
    elif kind == "crown":
        m("crown", cylinder(0.17, 0.1, 1.15), "gold", h, (0, 0.02, 0.36))
        for k in range(5):
            a = k * 2 * math.pi / 5
            m(f"point_{k}", cone(0.03, 0.08), "gold", h, (0.17 * math.sin(a), 0.02 + 0.17 * math.cos(a), 0.36))
    elif kind == "feather":
        m("band", cylinder(0.17, 0.06), part, h, (0, 0.02, 0.24))
        for k, ry in enumerate((-0.5, -0.2, 0.1, 0.4)):
            m(f"feather_{k}", box(0.05, 0.02, 0.3), "feather", h, (0.06 * k - 0.09, 0.1, 0.4), rotation=(-0.3, ry, 0))
    elif kind == "skull":
        m("helmet", sphere(0.19), part, h, (0, 0.03, 0.22), scale=(1.0, 1.05, 0.9))
        m("skull_face", box(0.22, 0.04, 0.16), "bone", h, (0, -0.18, 0.2))
        for sx in (1, -1):
            m(f"socket_{sx}", box(0.05, 0.02, 0.04), "dark", h, (0.05 * sx, -0.2, 0.22))
    elif kind == "tophat":
        m("hat", cylinder(0.17, 0.5, 0.8), part, h, (0, 0.02, 0.58))
        m("hat_brim", cylinder(0.24, 0.04), part, h, (0, 0.02, 0.32))
        m("hat_band", cylinder(0.175, 0.06), "kit1", h, (0, 0.02, 0.38))
    elif kind == "mask":
        m("mask", box(0.26, 0.05, 0.1), part, h, (0, -0.16, 0.08))
    else:
        raise ValueError(f"unknown helmet {kind}")


def p_visor(c, part="metal"):
    mesh_object("visor", box(0.34, 0.08, 0.09), part, c.j["head"], (0, -0.16, 0.2))


# ---------------------------------------------------------------------- torso


def p_pads(c, kind="round", part="kit2"):
    b = c.b
    r = b["pad"] or 0.15
    for side, sx in SIDES:
        at = (b["shoulder"] * 0.86 * sx, 0, c.th)
        if kind == "round":
            mesh_object(f"pad_{side}", sphere(r), part, c.j["chest"], at, scale=(1.1, 1.0, 0.62))
        elif kind == "big":
            mesh_object(f"pad_{side}", sphere(r * 1.3), part, c.j["chest"], at, scale=(1.15, 1.0, 0.6))
        elif kind == "spiked":
            pad = mesh_object(f"pad_{side}", sphere(r), part, c.j["chest"], at, scale=(1.1, 1.0, 0.62))
            for k, (dx, dy) in enumerate(((0, 0), (0.08, 0.06), (-0.04, -0.08))):
                mesh_object(f"spike_{side}{k}", cone(0.045, 0.16), "steel", pad, (dx * sx / 1.1, dy, 0.14 / 0.62),
                            scale=(1 / 1.1, 1, 1 / 0.62))
        elif kind == "plate":
            mesh_object(f"pad_{side}", box(r * 2.0, r * 1.8, r * 0.7), part, c.j["chest"], at, rotation=(0, 0.35 * sx, 0))
        elif kind == "fur":
            mesh_object(f"pad_{side}", sphere(r * 1.15), "fur", c.j["chest"], at, scale=(1.1, 1.05, 0.7))
        elif kind == "leaf":
            mesh_object(f"pad_{side}", box(r * 1.8, r * 1.4, r * 0.3), "leaf", c.j["chest"], at, rotation=(0, 0.5 * sx, 0))
        elif kind == "bone":
            mesh_object(f"pad_{side}", sphere(r), "bone", c.j["chest"], at, scale=(1.1, 1.0, 0.62))
        else:
            raise ValueError(f"unknown pads {kind}")


def p_breastplate(c, part="steel"):
    mesh_object("breastplate", box(c.tw * 0.9, 0.06, c.th * 0.7), part, c.j["chest"], (0, -c.td / 2 - 0.02, c.th * 0.6))


def p_gutplate(c, part="gold"):
    mesh_object("gutplate", cylinder(c.tw * 0.32, 0.05), part, c.j["chest"], (0, -c.td * 0.35 - c.b.get("belly", 0.2), c.th * 0.32),
                rotation=(1.57, 0, 0))


def p_scarf(c, part="kit1"):
    mesh_object("scarf", cylinder(0.1 * c.lw ** 0.5, 0.08), part, c.j["head"], (0, 0, 0.0))
    mesh_object("scarf_tail", box(0.07, 0.03, 0.3), part, c.j["chest"], (0.08, -c.td / 2 - 0.02, c.th * 0.85))


def p_crest(c, part="kit2"):
    for k in range(4):
        mesh_object(f"crest_{k}", cone(0.035, 0.18 - 0.025 * k), part, c.j["head"], (0, 0.02 + 0.08 * k, 0.26 - 0.02 * k),
                    rotation=(-0.5, 0, 0))


def p_neckring(c, part="kit1"):
    mesh_object("neckring", cylinder(0.11, 0.05), part, c.j["neck"], (0, 0, 0.02), rotation=(0.6, 0, 0))


def p_number(c):
    mesh_object("number_plate", box(0.22, 0.02, 0.18), "cloth", c.j["chest"], (0, -c.td / 2 - 0.005, c.th * 0.66))


def p_tabard(c, part="kit2"):
    mesh_object("tabard_f", box(c.tw * 0.5, 0.03, 0.5), part, c.j["body"], (0, -c.td / 2 - 0.02, -0.18))
    mesh_object("tabard_b", box(c.tw * 0.5, 0.03, 0.42), part, c.j["body"], (0, c.td / 2 + 0.02, -0.14))


def p_loincloth(c, part="kit2"):
    mesh_object("loin", box(c.tw * 0.45, 0.03, 0.34), part, c.j["body"], (0, -c.td / 2 - 0.02, -0.12))


def p_skirt(c, part="kit2"):
    mesh_object("skirt", cone(c.tw * 0.62, 0.34), part, c.j["body"], (0, 0, -0.22))


def p_cape(c, part="kit2"):
    mesh_object("collar", box(c.tw * 0.95, 0.05, 0.3), part, c.j["chest"], (0, c.td / 2, c.th + 0.1), rotation=(-0.25, 0, 0))
    mesh_object("cape", box(c.tw * 1.0, 0.03, 0.9), part, c.j["chest"], (0, c.td / 2 + 0.06, c.th - 0.32), rotation=(-0.12, 0, 0))


def p_collar(c, part="kit2"):
    mesh_object("high_collar", box(c.tw * 0.95, 0.05, 0.38), part, c.j["chest"], (0, c.td / 2 - 0.02, c.th + 0.12), rotation=(-0.3, 0, 0))
    for sx in (1, -1):
        mesh_object(f"collar_wing_{sx}", box(0.05, 0.16, 0.34), part, c.j["chest"], (c.tw * 0.44 * sx, c.td * 0.25, c.th + 0.1), rotation=(0, 0.3 * sx, 0))


def p_furcloak(c):
    mesh_object("fur_collar", sphere(c.tw * 0.55), "fur", c.j["chest"], (0, c.td * 0.15, c.th * 0.95), scale=(1.1, 0.8, 0.45))
    mesh_object("fur_back", box(c.tw * 1.0, 0.06, c.th * 1.3), "fur", c.j["chest"], (0, c.td / 2 + 0.04, c.th * 0.45))


def p_wings(c, kind="bat"):
    part = "skin" if kind == "bat" else "kit2"
    for side, sx in SIDES:
        mesh_object(f"wing_{side}", box(0.04, 0.5, 0.75), part, c.j["chest"], (c.tw * 0.45 * sx, c.td / 2 + 0.2, c.th * 1.05),
                    rotation=(-0.4, 0.5 * sx, 0.5 * sx))
        mesh_object(f"wing_bone_{side}", cylinder(0.025, 0.8), "dark", c.j["chest"], (c.tw * 0.45 * sx, c.td / 2 + 0.25, c.th * 1.4),
                    rotation=(-0.4, 0.5 * sx, 0.5 * sx))


def p_tail(c, kind="rat"):
    r, length, part = dict(rat=(0.035, 0.85, "flesh"), lizard=(0.12, 0.6, "skin"), thin_lizard=(0.06, 0.6, "skin"),
                           wolf=(0.08, 0.45, "fur"), fox=(0.12, 0.6, "fur"), boar=(0.03, 0.2, "skin"),
                           bull=(0.03, 0.55, "skin"))[kind]
    mesh_object("tail_mesh", cone(r, length), part, c.j["tail"], (0, 0, 0), rotation=(-1.9, 0, 0))


def p_spikes_back(c, part="steel"):
    for k in range(3):
        mesh_object(f"back_spike_{k}", cone(0.05, 0.22), part, c.j["chest"], ((k - 1) * 0.12, c.td / 2, c.th * 0.8),
                    rotation=(-1.2, 0, 0))


def p_hunchback(c, part="skin"):
    mesh_object("hump", sphere(c.tw * 0.42), part, c.j["chest"], (0.06, c.td * 0.35, c.th * 0.85))


def p_boils(c, part="flesh"):
    for k, (x, z) in enumerate(((0.12, 0.3), (-0.15, 0.5), (0.05, 0.6), (-0.05, 0.15))):
        mesh_object(f"boil_{k}", sphere(0.06), part, c.j["chest"], (x * c.lw, -c.td / 2, z * c.th * 1.6))


def p_mutation(c, kind="claw"):
    """Chaos gifts on the right arm: a crab claw, a tentacle or a blade."""
    el, hand = c.j["elbow_r"], c.j["hand_r"]
    if kind == "claw":
        mesh_object("claw_a", cone(0.12, 0.42), "flesh", hand, (0.03, 0, -0.05), rotation=(3.0, 0.2, 0))
        mesh_object("claw_b", cone(0.09, 0.32), "flesh", hand, (-0.06, 0, -0.05), rotation=(3.0, -0.4, 0))
    elif kind == "tentacle":
        for k in range(4):
            mesh_object(f"tentacle_{k}", cylinder(0.09 - 0.018 * k, 0.24), "flesh", hand, (0.03 * k, -0.04 * k, -0.2 * k))
    elif kind == "blade":
        mesh_object("arm_blade", box(0.04, 0.12, 0.6), "bone", hand, (0, 0, -0.3))


def p_tattoos(c):
    for side, sx in SIDES:
        mesh_object(f"tattoo_{side}", cylinder(c.b["arm"] * 1.02, c.b["upper"] * 0.3), "kit1", c.j["shoulder_" + side], (0, 0, -c.b["upper"] * 0.4))


def p_bandages(c):
    for k in range(3):
        mesh_object(f"strip_{k}", cylinder(c.tw * 0.55, 0.05), "wrap", c.j["chest"], (0, 0, c.th * (0.25 + 0.25 * k)),
                    rotation=(0.15 * (k - 1), 0, 0))


def p_stitches(c):
    for k in range(3):
        mesh_object(f"stitch_{k}", box(0.03, 0.02, c.th * 0.8), "dark", c.j["chest"], ((k - 1) * 0.16, -c.td / 2 - 0.01, c.th * 0.6))
    mesh_object("bolt_l", cylinder(0.03, 0.12), "steel", c.j["head"], (0.17, 0, 0.06), rotation=(0, 1.57, 0))
    mesh_object("bolt_r", cylinder(0.03, 0.12), "steel", c.j["head"], (-0.17, 0, 0.06), rotation=(0, 1.57, 0))


def p_chains(c):
    mesh_object("chain_sash", box(0.06, 0.04, c.th * 1.1), "steel", c.j["chest"], (0, -c.td / 2 - 0.02, c.th * 0.6), rotation=(0, 0.6, 0))


# ---------------------------------------------------------------------- limbs


def p_bracers(c, part="kit2", blades=False):
    for side, sx in SIDES:
        mesh_object(f"bracer_{side}", cylinder(c.b["arm"] * 1.15, c.b["fore"] * 0.55), part, c.j["elbow_" + side], (0, 0, -c.b["fore"] * 0.35))
        if blades:
            mesh_object(f"blade_{side}", cone(0.035, 0.24), "steel", c.j["elbow_" + side], (0.06 * sx, 0, -c.b["fore"] * 0.5),
                        rotation=(0, 1.3 * sx, 0))


def p_gauntlets(c, part="steel"):
    for side, _ in SIDES:
        mesh_object(f"gauntlet_{side}", sphere(c.b["fist"] * 1.25), part, c.j["hand_" + side])


def p_claws(c, part="horn"):
    for side, _ in SIDES:
        for k in (-1, 0, 1):
            mesh_object(f"claw_{side}{k}", cone(0.03 * c.lw, 0.16 * c.lw), part, c.j["hand_" + side], (0.04 * k * c.lw, -0.03, -0.06),
                        rotation=(2.8, 0.3 * k, 0))


def p_kneepads(c, part="kit2"):
    for side, _ in SIDES:
        mesh_object(f"kneepad_{side}", sphere(0.1 * c.lw), part, c.j["knee_" + side], (0, -0.05, 0), scale=(1, 0.8, 1))


def p_high_boots(c, part="kit2"):
    for side, _ in SIDES:
        mesh_object(f"high_boot_{side}", cylinder(0.095 * c.lw, (c.b["hip"] - 0.08 - c.b["thigh"]) * 0.8), part, c.j["knee_" + side], (0, 0, -0.02))


# --------------------------------------------------------------------- held


def p_hand(c, side, item, part=None):
    """Something held in one hand. Items hang along the forearm unless noted."""
    hand = c.j["hand_" + side]
    sx = 1 if side == "l" else -1
    m = mesh_object
    if item == "ball":
        m(f"ball_{side}", sphere(0.12), "leather", hand, (0, -0.1, 0), scale=(1, 1.4, 1))
    elif item == "bomb":
        m(f"bomb_{side}", sphere(0.12), "dark", hand, (0, -0.06, -0.04))
        m(f"fuse_{side}", cylinder(0.015, 0.1), "fire", hand, (0, -0.06, 0.12))
    elif item == "dagger":
        m(f"dagger_{side}", cone(0.04, 0.32), part or "steel", hand, (0, -0.02, -0.04), rotation=(3.14, 0, 0))
    elif item == "sword":
        m(f"sword_{side}", box(0.05, 0.02, 0.7), part or "steel", hand, (0, 0, -0.38))
        m(f"guard_{side}", box(0.2, 0.04, 0.03), "gold", hand, (0, 0, -0.03))
    elif item == "axe":
        m(f"haft_{side}", cylinder(0.025, 0.6), "wood", hand, (0, 0, 0.25))
        m(f"axe_head_{side}", box(0.04, 0.2, 0.16), part or "steel", hand, (0, -0.1, 0.48))
    elif item == "chainsaw":
        m(f"saw_body_{side}", box(0.14, 0.2, 0.18), "kit2", hand, (0, -0.08, -0.04))
        m(f"saw_blade_{side}", box(0.04, 0.12, 0.7), "steel", hand, (0, -0.1, -0.45))
    elif item == "flamer":
        m(f"tank_{side}", cylinder(0.08, 0.36), "bronze", hand, (0, 0.05, 0.1))
        m(f"nozzle_{side}", cone(0.06, 0.3), "bronze", hand, (0, -0.2, -0.02), rotation=(1.57, 0, 0))
        m(f"flame_{side}", cone(0.08, 0.26), "fire", hand, (0, -0.48, -0.02), rotation=(-1.57, 0, 0))
    elif item == "staff":
        m(f"staff_{side}", cylinder(0.025, 1.3), "wood", hand, (0, 0, 0.7))
        m(f"orb_{side}", sphere(0.07), "glow", hand, (0, 0, 0.72))
    elif item == "whip":
        for k in range(5):
            m(f"whip_{side}{k}", cylinder(0.018, 0.16), "leather", hand, (0.04 * k * sx, -0.05 * k, -0.15 * k))
    elif item == "fungus":
        m(f"cap_{side}", sphere(0.12), "kit1", hand, (0, -0.04, 0.06), scale=(1, 1, 0.6))
        m(f"stalk_{side}", cylinder(0.04, 0.1), "bone", hand, (0, -0.04, 0.04))
    elif item == "chain_ball":
        for k in range(5):
            m(f"chain_{side}{k}", sphere(0.04), "steel", hand, (0.12 * k * sx, -0.06 * k, -0.04 * k))
        m(f"iron_ball_{side}", sphere(0.42), "metal", hand, (0.75 * sx, -0.3, -0.2))
        for k in range(6):
            a = k * math.pi / 3
            m(f"ball_spike_{side}{k}", cone(0.06, 0.18), "steel", hand,
              (0.75 * sx + 0.42 * math.cos(a), -0.3, -0.2 + 0.42 * math.sin(a)), rotation=(0, a + 1.57, 0))
    elif item == "spear":
        m(f"spear_{side}", cylinder(0.025, 1.4), "wood", hand, (0, 0, 0.55))
        m(f"spear_tip_{side}", cone(0.05, 0.18), "steel", hand, (0, 0, 1.25))
    elif item == "shield":
        m(f"shield_{side}", cylinder(0.26, 0.05), part or "kit2", hand, (0.08 * sx, 0, 0), rotation=(0, 1.57, 0))
        m(f"boss_{side}", sphere(0.06), "steel", hand, (0.12 * sx, 0, 0))
    elif item == "club":
        m(f"club_{side}", cylinder(0.09, 0.6, 0.5), "wood", hand, (0, 0, -0.32))
    elif item == "scythe":
        m(f"scythe_haft_{side}", cylinder(0.025, 1.5), "wood", hand, (0, 0, 0.5))
        m(f"scythe_blade_{side}", box(0.03, 0.55, 0.1), "steel", hand, (0, -0.25, 1.22), rotation=(0.3, 0, 0))
    elif item == "hammer":
        m(f"hammer_haft_{side}", cylinder(0.025, 0.5), "wood", hand, (0, 0, 0.2))
        m(f"hammer_head_{side}", box(0.14, 0.24, 0.14), part or "steel", hand, (0, 0, 0.46))
    else:
        raise ValueError(f"unknown item {item}")


def p_hand_l(c, item, part=None):
    p_hand(c, "l", item, part)


def p_hand_r(c, item, part=None):
    p_hand(c, "r", item, part)


def p_pogo(c):
    b = c.j["body"]
    mesh_object("pogo_pole", cylinder(0.035, 1.0), "steel", b, (0, -0.18, 0.15))
    mesh_object("pogo_spring", cylinder(0.07, 0.25), "bronze", b, (0, -0.18, -0.55))
    mesh_object("pogo_bar", box(0.4, 0.04, 0.04), "steel", b, (0, -0.18, 0.12))


def p_stilts(c):
    for side, _ in SIDES:
        mesh_object(f"stilt_{side}", cylinder(0.03, 0.5), "wood", c.j["ankle_" + side], (0, 0, -0.18))


def p_doom_wings(c):
    for side, sx in SIDES:
        mesh_object(f"glider_{side}", box(0.7, 0.3, 0.03), "kit2", c.j["chest"], (0.5 * sx, 0.12, c.th * 0.8),
                    rotation=(0, -0.25 * sx, 0))
        mesh_object(f"strut_{side}", cylinder(0.015, 0.7), "wood", c.j["chest"], (0.5 * sx, 0.1, c.th * 0.8), rotation=(0, 1.57, 0))
    mesh_object("goggles", box(0.26, 0.06, 0.07), "steel", c.j["head"], (0, -0.15, 0.22))


def p_mushroom(c):
    """Fun-hoppa: a big springy mushroom under the snotling."""
    r = c.j["root"]
    mesh_object("shroom_cap", sphere(0.36), "kit1", r, (0, 0, 0.32), scale=(1, 1, 0.55))
    mesh_object("shroom_stalk", cylinder(0.1, 0.18), "bone", r, (0, 0, 0.16))
    c.j["body"].location = (0, 0, c.b["hip"] + 0.42)
    c.j["body"]["rest"] = list(c.j["body"].location)


def p_beastmaster(c):
    mesh_object("satchel", box(0.14, 0.08, 0.14), "leather", c.j["body"], (0.14, -0.12, -0.06))


def p_illusion(c):
    for k, (x, z) in enumerate(((0.2, 0.3), (-0.2, 0.42), (0.0, 0.62))):
        mesh_object(f"sparkle_{k}", sphere(0.04), "glow", c.j["chest"], (x, -0.3, z))


# ----------------------------------------------------------------- quad parts


def p_animal_head(c, kind="fox"):
    h = c.j["head"]
    m = mesh_object
    if kind == "fox":
        m("skull", sphere(0.16), "fur", h, (0, 0, 0.04))
        m("snout", cone(0.08, 0.24), "fur", h, (0, -0.12, 0.0), rotation=(1.7, 0, 0))
        m("nose", sphere(0.03), "dark", h, (0, -0.34, -0.02))
        for sx in (1, -1):
            m(f"ear_{sx}", cone(0.06, 0.16), "fur", h, (0.09 * sx, 0.03, 0.16))
        m("bib", sphere(0.1), "bone", h, (0, -0.1, -0.1))
    elif kind == "boar":
        m("skull", sphere(0.2), "fur", h, (0, 0, 0.02), scale=(1, 1.1, 0.95))
        m("snout", cylinder(0.08, 0.14), "flesh", h, (0, -0.24, -0.02), rotation=(1.57, 0, 0))
        for sx in (1, -1):
            m(f"tusk_{sx}", cone(0.025, 0.14), "bone", h, (0.08 * sx, -0.2, -0.06), rotation=(-0.4, 0, 0))
            m(f"ear_{sx}", cone(0.05, 0.12), "fur", h, (0.12 * sx, 0.05, 0.16), rotation=(0, 0.6 * sx, 0))
        m("barrel_keg", cylinder(0.14, 0.28), "wood", c.j["body"], (0, 0.05, 0.36), rotation=(0, 1.57, 0))
        m("keg_band", cylinder(0.145, 0.04), "steel", c.j["body"], (0, 0.05, 0.36), rotation=(0, 1.57, 0))
    else:
        raise ValueError(kind)


def p_saddle(c):
    mesh_object("saddle", box(0.34, 0.4, 0.06), "kit1", c.j["body"], (0, 0.05, c.b.get("height", 0.45) * 0.32))


# ------------------------------------------------------------------ vehicles


def p_roller(c):
    """Dwarf Deathroller: a steam roller with a dwarf at the wheel."""
    r, b = c.j["roller"], c.j["body"]
    m = mesh_object
    m("roller_drum", cylinder(0.42, 0.95), "steel", r, (0.47, 0, 0), rotation=(0, 1.57, 0))
    m("roller_band_a", cylinder(0.44, 0.06), "kit1", r, (0.3, 0, 0), rotation=(0, 1.57, 0))
    m("roller_band_b", cylinder(0.44, 0.06), "kit1", r, (-0.3, 0, 0), rotation=(0, 1.57, 0))
    m("chassis", box(0.8, 1.1, 0.5), "kit2", b, (0, 0.1, 0))
    m("boiler", cylinder(0.26, 0.7), "bronze", b, (0, -0.35, 0.55), rotation=(1.57, 0, 0))
    m("chimney", cylinder(0.08, 0.6, 1.2), "metal", b, (0, -0.5, 1.15))
    m("rear_wheel_l", cylinder(0.3, 0.1), "metal", b, (0.45, 0.45, -0.15), rotation=(0, 1.57, 0))
    m("rear_wheel_r", cylinder(0.3, 0.1), "metal", b, (-0.45, 0.45, -0.15), rotation=(0, 1.57, 0))
    m("ram", cone(0.12, 0.3), "steel", b, (0, -0.65, 0.1), rotation=(1.57, 0, 0))
    m("driver_body", box(0.4, 0.3, 0.38), "kit1", c.j["chest"], (0, 0, 0.18))
    p_face(c, "dwarf")
    p_beard(c, "huge", "hair")
    p_helmet(c, "dwarf", "steel")


def p_wagon(c):
    """Snotling Pump Wagon: a cart pumped by snotlings, with a spiked roller in front."""
    r, b = c.j["roller"], c.j["body"]
    m = mesh_object
    m("roller_drum", cylinder(0.32, 0.9), "wood", r, (0.45, 0, -0.08), rotation=(0, 1.57, 0))
    for k in range(6):
        a = k * math.pi / 3
        m(f"roller_spike_{k}", cone(0.05, 0.18), "steel", r, (0, 0.32 * math.cos(a), -0.08 + 0.32 * math.sin(a)),
          rotation=(a - 1.57, 0, 0))
    m("cart", box(0.9, 1.1, 0.4), "wood", b, (0, 0.15, 0))
    m("cart_trim", box(0.94, 1.14, 0.08), "kit1", b, (0, 0.15, 0.2))
    m("pump", box(0.5, 0.05, 0.05), "steel", b, (0, 0.2, 0.75))
    m("pump_post", cylinder(0.04, 0.5), "wood", b, (0, 0.2, 0.5))
    for sx in (1, -1):
        m(f"wheel_{sx}", cylinder(0.28, 0.08), "wood", b, (0.48 * sx, 0.45, -0.18), rotation=(0, 1.57, 0))
    for k, (x, y) in enumerate(((-0.2, 0.1), (0.2, 0.3), (0.0, 0.5))):
        m(f"snot_{k}", sphere(0.12), "skin", b, (x, y, 0.5))
        m(f"snot_hat_{k}", cone(0.08, 0.12), "kit2", b, (x, y, 0.6))
    m("sail", box(0.03, 0.5, 0.5), "kit2", b, (0, 0.5, 0.9))


# ---------------------------------------------------------------------- build

PARTS = dict(
    face=p_face, eyes=p_eyes, ears=p_ears, hair=p_hair, beard=p_beard, horns=p_horns, helmet=p_helmet, visor=p_visor,
    pads=p_pads, breastplate=p_breastplate, number=p_number, gutplate=p_gutplate, scarf=p_scarf, crest=p_crest,
    neckring=p_neckring, tabard=p_tabard, loincloth=p_loincloth, skirt=p_skirt,
    cape=p_cape, collar=p_collar, furcloak=p_furcloak, wings=p_wings, tail=p_tail, back_spikes=p_spikes_back,
    hunchback=p_hunchback, boils=p_boils, mutation=p_mutation, tattoos=p_tattoos, bandages=p_bandages,
    stitches=p_stitches, chains=p_chains, bracers=p_bracers, gauntlets=p_gauntlets, claws=p_claws,
    kneepads=p_kneepads, high_boots=p_high_boots, hand_l=p_hand_l, hand_r=p_hand_r, pogo=p_pogo, stilts=p_stilts,
    doom_wings=p_doom_wings, mushroom=p_mushroom, beastmaster=p_beastmaster, illusion=p_illusion,
    animal_head=p_animal_head, saddle=p_saddle, roller=p_roller, wagon=p_wagon,
)


def build_model(spec, style_name="neon"):
    """Clear the scene and build one model from its spec."""
    style = STYLES[style_name]
    rig = spec.get("rig", "biped")
    b = dict(BODIES[spec.get("body", "human")])
    b.update(spec.get("shape", {}))
    STATE.clear()
    STATE.update(b, rig=rig, leg=b["hip"] - 0.08)
    for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.worlds):
        for block in list(coll):
            coll.remove(block)

    colors = dict(BASE_COLORS)
    colors.update({k: v for k, v in style["palette"].items() if k in BASE_COLORS})
    colors.update(spec.get("colors", {}))
    colors.update(kit1=KIT_GREY, kit2=KIT_GREY)
    for part, color in colors.items():
        toon_material(part, color, style)
        mask_material(f"mask_{part}", MASK_COLOR.get(part, (0, 0, 0)), style)
    for part, color in FLAT_COLORS.items():
        new_material(part)[2].inputs["Color"].default_value = (*spec.get("colors", {}).get(part, color), 1)
        new_material(f"mask_{part}")[2].inputs["Color"].default_value = (0, 0, 0, 1)

    c = Ctx(spec, b)
    RIGS[rig](c)
    for token in spec.get("parts", []):
        name, *args = token.split(":")
        PARTS[name](c, *args)
    setup_scene(style)
    return {"objects": len(bpy.data.objects)}


# ---------------------------------------------------------------------- poses


def pose_idle_quad(f, n):
    p = 2 * math.pi * f / n
    s, co = math.sin(p), math.cos(p)
    return {"body": R(dz=0.015 * s, rx=0.02 * s), "neck": R(rx=-0.1 + 0.05 * s, rz=0.25 * co),
            "head": R(rx=0.05 * co), "tail": R(rz=0.5 * math.sin(2 * p), rx=0.2)}


def pose_idle_centaur(f, n):
    p = 2 * math.pi * f / n
    s, co = math.sin(p), math.cos(p)
    out = {"body": R(dz=0.015 * s), "tail": R(rz=0.4 * math.sin(2 * p))}
    out.update({"chest": R(rx=0.15 + 0.03 * s, rz=0.05 * co), "head": R(rx=-0.15, rz=0.2 * s),
                "shoulder_l": R(rx=-0.8 + 0.05 * s, ry=OUT["l"] * 0.55), "shoulder_r": R(rx=-0.8 + 0.05 * s, ry=OUT["r"] * 0.55),
                "elbow_l": R(rx=-1.0 - 0.1 * co), "elbow_r": R(rx=-1.0 - 0.1 * s)})
    return out


def pose_idle_vehicle(f, n):
    p = 2 * math.pi * f / n
    return {"body": R(dz=0.012 * math.sin(4 * p), rx=0.01 * math.sin(2 * p)), "roller": R(rx=-p / 4),
            "head": R(rz=0.25 * math.sin(p))}


def pose_idle_float(f, n):
    p = 2 * math.pi * f / n
    s, co = math.sin(p), math.cos(p)
    return {"body": R(dz=0.06 * s, rx=0.06), "chest": R(rx=0.15 + 0.03 * co), "head": R(rx=-0.1, rz=0.15 * s),
            "shoulder_l": R(rx=-1.1 + 0.1 * s, ry=OUT["l"] * 0.5), "shoulder_r": R(rx=-1.1 + 0.1 * co, ry=OUT["r"] * 0.5),
            "elbow_l": R(rx=-0.4), "elbow_r": R(rx=-0.4)}


def pose_idle_tree(f, n):
    p = 2 * math.pi * f / n
    s, co = math.sin(p), math.cos(p)
    return {"chest": R(rx=0.04 * s, ry=0.03 * co), "head": R(rz=0.1 * s),
            "shoulder_l": R(rx=-0.3 + 0.08 * s, ry=OUT["l"] * 0.5), "shoulder_r": R(rx=-0.3 + 0.08 * co, ry=OUT["r"] * 0.5),
            "elbow_l": R(rx=-0.6), "elbow_r": R(rx=-0.6), "hip_l": R(ry=OUT["l"] * 0.15), "hip_r": R(ry=OUT["r"] * 0.15)}


def pose_idle_any(f, n):
    rig = STATE.get("rig", "biped")
    if rig == "biped":
        pose = pose_idle(f, n)
        pose["tail"] = R(rx=0.3, rz=0.35 * math.sin(2 * math.pi * f / n))
        return pose
    return dict(quad=pose_idle_quad, centaur=pose_idle_centaur, vehicle=pose_idle_vehicle,
                float=pose_idle_float, tree=pose_idle_tree)[rig](f, n)


POSES["idle"] = pose_idle_any
