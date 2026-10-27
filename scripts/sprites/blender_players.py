"""Build test players in Blender and render isometric pixel sprite frames.

Run inside Blender (5.1) on Jellybingus:

    g = {}
    exec(open("C:/.../blender_players.py").read(), g)
    g["build"]("orc", "neon")
    g["render_all"]("C:/.../renders/neon/orc")

A player is rigid parts parented to a hierarchy of empties, like a
miniature on pins. Poses are pure functions of (animation, frame), so a
render is deterministic and needs no keyframes.

The camera is a 2:1 isometric view: orthographic, 30 degrees above the
ground and turned 45 degrees, so pitch squares become 2:1 diamonds. Grid x
runs to world +X and grid y to world -Y, which is why the facing names below
are grid directions.

Each frame is rendered twice: a colour pass where kit is neutral grey, and a
mask pass where primary kit is red, secondary kit is green and everything
else is black. build_sheets.py turns the pair into a base sheet plus two kit
sheets that Phaser tints with the team colours.
"""

import json
import math
import os

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

# Facing per grid direction, as rotation about Z. The figure is modelled
# facing -Y, which is grid +y ("s").
DIRECTIONS = {"s": 0, "se": 45, "e": 90, "ne": 135, "n": 180, "nw": -135, "w": -90, "sw": -45}

ANIMATIONS = {"idle": 8, "run": 8, "block": 6, "fall": 8}

CAMERA_ELEVATION_DEG = 30  # sin(30) = 0.5 gives 2:1 diamonds
CAMERA_AZIMUTH_DEG = 45
PX_PER_UNIT = {"hi": 50, "lo": 25}
FRAME = {"hi": 192, "lo": 96}

KIT_GREY = (0.8, 0.8, 0.8)

# Per art direction: toon light bands, sun, edge lights, palette and kit.
STYLES = {
    "neon": dict(
        size="lo",
        ramp=[(0.0, (0.3, 0.22, 0.46)), (0.3, (0.62, 0.55, 0.82)), (0.7, (1.0, 0.96, 1.0))],
        sun=dict(energy=2.6, color=(0.85, 0.85, 1.0), rot=(55, 0, 160)),
        # screen-left is world (-1, -1), screen-right (1, 1); both lean slightly behind
        rims=[((-1.4, -0.6, 0.25), (1.0, 0.15, 0.7)), ((0.6, 1.4, 0.25), (0.15, 0.9, 1.0))],
        rim_width=0.55,
        palette=dict(cloth=(0.26, 0.24, 0.32), leather=(0.2, 0.16, 0.2), boot=(0.08, 0.07, 0.1),
                     metal=(0.1, 0.1, 0.13), skin=(0.8, 0.58, 0.52), orc_skin=(0.34, 0.66, 0.42)),
        kit=dict(human=("visor",), orc=("visor", "bald"), elf=("visor",)),
    ),
    "ritual": dict(
        size="hi",
        ramp=[(0.0, (0.18, 0.21, 0.2)), (0.32, (0.48, 0.5, 0.47)), (0.72, (0.82, 0.82, 0.78))],
        sun=dict(energy=2.4, color=(0.85, 0.9, 0.88), rot=(25, 10, 200)),
        rims=[((0.6, 1.4, 0.1), (0.85, 0.22, 0.08))],  # brazier glow from behind right
        rim_width=0.6,
        palette=dict(cloth=(0.33, 0.3, 0.27), leather=(0.24, 0.19, 0.15), boot=(0.14, 0.12, 0.11),
                     metal=(0.42, 0.41, 0.38), skin=(0.6, 0.5, 0.45), orc_skin=(0.36, 0.43, 0.3)),
        kit=dict(human=("great_helm", "tabard"), orc=("horns", "tabard")),
    ),
    "league": dict(
        size="hi",
        ramp=[(0.0, (0.32, 0.48, 0.52)), (0.3, (0.78, 0.76, 0.7)), (0.7, (1.05, 1.0, 0.92))],
        sun=dict(energy=2.8, color=(1.0, 0.95, 0.85), rot=(40, 0, 130)),
        rims=[],
        rim_width=0.6,
        palette=dict(cloth=(0.92, 0.9, 0.84), leather=(0.45, 0.24, 0.12), boot=(0.12, 0.1, 0.09),
                     metal=(0.78, 0.78, 0.8), skin=(0.86, 0.6, 0.45), orc_skin=(0.42, 0.62, 0.25)),
        kit=dict(human=("cage", "number"), orc=("number", "bald")),
    ),
}

# Body plan per race. Lengths in metres; the human hips stand at 1.0. `head`
# picks the head builder; the flags add race-specific parts.
RACES = {
    "human": dict(hip=1.0, thigh=0.44, chest=0.1, torso=(0.52, 0.32, 0.5), neck=0.62, shoulder=0.34,
                  pad=0.17, arm=0.085, upper=0.34, fore=0.3, fist=0.095, hunch=0.0, head="human"),
    "orc": dict(hip=0.86, thigh=0.38, chest=0.08, torso=(0.68, 0.42, 0.52), neck=0.6, shoulder=0.44,
                pad=0.19, arm=0.12, upper=0.36, fore=0.36, fist=0.14, hunch=0.2, scale=1.12, head="orc",
                bare_arms=True),
    "elf": dict(hip=1.1, thigh=0.5, chest=0.1, torso=(0.42, 0.27, 0.54), neck=0.64, shoulder=0.28,
                pad=0.13, arm=0.068, upper=0.36, fore=0.33, fist=0.075, hunch=0.0, head="elf",
                skin=(0.86, 0.7, 0.62), hair=(0.98, 0.86, 0.48)),
    "witch_elf": dict(hip=1.04, thigh=0.47, chest=0.09, torso=(0.38, 0.25, 0.48), neck=0.6, shoulder=0.25,
                      pad=0, arm=0.062, upper=0.33, fore=0.3, fist=0.07, hunch=0.05, head="witch_elf",
                      skin=(0.84, 0.8, 0.9), hair=(0.96, 0.96, 1.0), bare_arms=True, bracers=True),
    "goblin": dict(hip=0.52, thigh=0.22, chest=0.05, torso=(0.34, 0.25, 0.3), neck=0.36, shoulder=0.21,
                   pad=0.1, arm=0.055, upper=0.22, fore=0.21, fist=0.07, hunch=0.25, head="goblin",
                   head_scale=1.3, skin=(0.48, 0.66, 0.3), bare_arms=True),
    "gnome": dict(hip=0.52, thigh=0.22, chest=0.05, torso=(0.44, 0.34, 0.34), neck=0.38, shoulder=0.26,
                  pad=0.1, arm=0.066, upper=0.22, fore=0.2, fist=0.075, hunch=0.05, head="gnome",
                  head_scale=1.2, skin=(0.88, 0.62, 0.52), hair=(0.94, 0.93, 0.9)),
    "vampire": dict(hip=1.06, thigh=0.48, chest=0.1, torso=(0.48, 0.3, 0.52), neck=0.62, shoulder=0.31,
                    pad=0.12, arm=0.072, upper=0.35, fore=0.32, fist=0.08, hunch=0.0, head="vampire",
                    skin=(0.88, 0.88, 0.95), hair=(0.07, 0.06, 0.1), cape=True),
}

# ry that swings a limb away from the body. The left side sits at +X, and a
# positive rotation about Y swings a hanging limb toward -X, so left is negative.
OUT = {"l": -1.0, "r": 1.0}

MASK_COLOR = {"kit1": (1, 0, 0), "kit2": (0, 1, 0)}
STATE = {}  # race body plan in use, read by the poses


# ---------------------------------------------------------------- materials


def rim_mask(nt, direction, threshold):
    """1 where the surface faces `direction` closely enough, else 0: a hard side light."""
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    dot = nt.nodes.new("ShaderNodeVectorMath")
    dot.operation = "DOT_PRODUCT"
    dot.inputs[1].default_value = Vector(direction).normalized()
    side = nt.nodes.new("ShaderNodeMath")
    side.operation = "GREATER_THAN"
    side.inputs[1].default_value = threshold
    nt.links.new(geo.outputs["Normal"], dot.inputs[0])
    nt.links.new(dot.outputs["Value"], side.inputs[0])
    return side.outputs[0]


def new_material(name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(emit.outputs[0], out.inputs["Surface"])
    return mat, nt, emit


def mix(nt, a, b, fac):
    m = nt.nodes.new("ShaderNodeMix")
    m.data_type = "RGBA"
    nt.links.new(fac, m.inputs["Factor"])
    for sock, val in (("A", a), ("B", b)):
        if isinstance(val, tuple):
            m.inputs[sock].default_value = (*val, 1)
        else:
            nt.links.new(val, m.inputs[sock])
    return m.outputs["Result"]


def toon_material(name, color, style):
    """Diffuse light stepped into three bands, tinted, plus hard edge lights."""
    mat, nt, emit = new_material(name)
    diffuse = nt.nodes.new("ShaderNodeBsdfDiffuse")
    to_rgb = nt.nodes.new("ShaderNodeShaderToRGB")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "CONSTANT"
    els = ramp.color_ramp.elements
    bands = style["ramp"]
    els[0].position, els[0].color = bands[0][0], (*bands[0][1], 1)
    els[1].position, els[1].color = bands[1][0], (*bands[1][1], 1)
    for pos, col in bands[2:]:
        els.new(pos).color = (*col, 1)
    base = nt.nodes.new("ShaderNodeMix")
    base.data_type = "RGBA"
    base.blend_type = "MULTIPLY"
    base.inputs["Factor"].default_value = 1.0
    base.inputs["B"].default_value = (*color, 1)
    nt.links.new(diffuse.outputs[0], to_rgb.inputs[0])
    nt.links.new(to_rgb.outputs["Color"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], base.inputs["A"])
    shaded = base.outputs["Result"]
    for direction, rim_color in style["rims"]:
        shaded = mix(nt, shaded, rim_color, rim_mask(nt, direction, style["rim_width"]))
    nt.links.new(shaded, emit.inputs["Color"])
    return mat


def mask_material(name, color, style):
    """Flat id colour; edge-lit pixels are not kit, so they stay untinted."""
    mat, nt, emit = new_material(name)
    shaded = None
    emit.inputs["Color"].default_value = (*color, 1)
    for direction, _ in style["rims"]:
        shaded = mix(nt, shaded if shaded is not None else color, (0, 0, 0), rim_mask(nt, direction, style["rim_width"]))
    if shaded is not None:
        nt.links.new(shaded, emit.inputs["Color"])
    return mat


# ------------------------------------------------------------------ meshes


def mesh_object(name, build_fn, part, parent, location=(0, 0, 0), scale=(1, 1, 1), rotation=(0, 0, 0)):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    build_fn(bm)
    for f in bm.faces:
        f.smooth = True
    bm.to_mesh(me)
    bm.free()
    me.materials.append(bpy.data.materials[part])
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = parent
    ob.location = location
    ob.scale = scale
    ob.rotation_euler = rotation
    ob["part"] = part
    return ob


def sphere(radius=1.0):
    return lambda bm: bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=radius)


def cylinder(radius, depth, top_scale=1.0):
    """Cylinder hanging down from the origin, length `depth`."""

    def build(bm):
        bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=radius * top_scale, radius2=radius,
                              depth=depth, matrix=Matrix.Translation((0, 0, -depth / 2)))

    return build


def cone(radius, depth):
    """Cone pointing up from the origin."""

    def build(bm):
        bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=radius, radius2=0.0, depth=depth,
                              matrix=Matrix.Translation((0, 0, depth / 2)))

    return build


def box(sx, sy, sz):
    def build(bm):
        bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Diagonal((sx, sy, sz, 1)))
        bmesh.ops.bevel(bm, geom=bm.verts[:] + bm.edges[:], offset=min(sx, sy, sz) * 0.25, segments=2, affect="EDGES")

    return build


def joint(name, parent, location):
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_size = 0.08
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = parent
    ob.location = location
    ob["rest"] = list(location)
    return ob


# ------------------------------------------------------------------- build


def head_human(h, r, extras):
    mesh_object("face", sphere(0.15), "skin", h, (0, -0.06, 0.12), scale=(0.85, 0.8, 0.95))
    if "great_helm" in extras:
        mesh_object("helmet", cylinder(0.19, 0.36), "metal", h, (0, 0.0, 0.38))
        mesh_object("helm_top", sphere(0.19), "metal", h, (0, 0, 0.38), scale=(1, 1, 0.45))
        mesh_object("eye_slit", box(0.26, 0.04, 0.035), "boot", h, (0, -0.185, 0.2))
        mesh_object("crest", box(0.04, 0.34, 0.12), "kit2", h, (0, 0, 0.47))
        return
    mesh_object("helmet", sphere(0.2), "kit2", h, (0, 0.03, 0.2), scale=(1.0, 1.05, 0.95))
    mesh_object("stripe", box(0.07, 0.42, 0.04), "kit1", h, (0, 0.03, 0.384))
    if "cage" in extras:
        mesh_object("cage", box(0.26, 0.04, 0.03), "metal", h, (0, -0.19, 0.08))
        mesh_object("cage_v", box(0.03, 0.04, 0.16), "metal", h, (0, -0.2, 0.12))


def head_orc(h, r, extras):
    mesh_object("face", sphere(0.17), "skin", h, (0, -0.08, 0.1), scale=(1.15, 0.95, 0.9))
    mesh_object("jaw", box(0.28, 0.2, 0.12), "skin", h, (0, -0.12, 0.0))
    for sx in (1, -1):
        mesh_object(f"tusk_{sx}", cone(0.03, 0.1), "cloth", h, (0.09 * sx, -0.2, 0.04))
    if "bald" in extras:
        mesh_object("dome", sphere(0.17), "skin", h, (0, -0.02, 0.22), scale=(1.0, 1.05, 0.95))
        mesh_object("mohawk", box(0.06, 0.34, 0.12), "hair", h, (0, 0.0, 0.38))
        for sx in (1, -1):
            mesh_object(f"ear_{sx}", cone(0.05, 0.18), "skin", h, (0.15 * sx, 0.0, 0.2), rotation=(0, 1.3 * sx, 0))
    else:
        mesh_object("helmet", sphere(0.18), "kit2", h, (0, 0.03, 0.22), scale=(1.0, 1.05, 0.8))
        mesh_object("stripe", box(0.07, 0.4, 0.04), "kit1", h, (0, 0.03, 0.36))
    if "horns" in extras:
        for sx in (1, -1):
            mesh_object(f"horn_{sx}", cone(0.05, 0.26), "cloth", h, (0.16 * sx, 0.02, 0.3), rotation=(0, 0.7 * sx, 0))


def head_elf(h, r, extras):
    mesh_object("face", sphere(0.14), "skin", h, (0, -0.05, 0.13), scale=(0.8, 0.8, 1.02))
    mesh_object("helmet", sphere(0.18), "kit2", h, (0, 0.03, 0.23), scale=(0.95, 1.08, 0.85))
    mesh_object("fin", box(0.03, 0.36, 0.1), "kit1", h, (0, 0.04, 0.38))
    mesh_object("ponytail", box(0.09, 0.07, 0.42), "hair", h, (0, 0.2, 0.02), rotation=(-0.35, 0, 0))
    for sx in (1, -1):
        mesh_object(f"ear_{sx}", cone(0.035, 0.22), "skin", h, (0.13 * sx, -0.02, 0.15), rotation=(-0.3, 1.1 * sx, 0))


def head_witch_elf(h, r, extras):
    mesh_object("face", sphere(0.14), "skin", h, (0, -0.05, 0.13), scale=(0.8, 0.8, 1.0))
    mesh_object("hair_cap", sphere(0.16), "hair", h, (0, 0.04, 0.2), scale=(1.0, 1.05, 0.95))
    spikes = [(0, -0.9), (0.5, -0.7), (-0.5, -0.7), (0.9, -0.3), (-0.9, -0.3), (0.3, -1.4), (-0.3, -1.4)]
    for k, (ry, rx) in enumerate(spikes):
        mesh_object(f"spike_{k}", cone(0.06, 0.34), "hair", h, (0, 0.08, 0.24), rotation=(rx, ry, 0))
    for sx in (1, -1):
        mesh_object(f"ear_{sx}", cone(0.035, 0.24), "skin", h, (0.12 * sx, -0.02, 0.15), rotation=(-0.4, 1.15 * sx, 0))


def head_goblin(h, r, extras):
    mesh_object("face", sphere(0.16), "skin", h, (0, -0.04, 0.12), scale=(1.0, 0.95, 0.9))
    mesh_object("nose", cone(0.045, 0.17), "skin", h, (0, -0.16, 0.1), rotation=(1.75, 0, 0))
    for sx in (1, -1):
        mesh_object(f"ear_{sx}", cone(0.06, 0.34), "skin", h, (0.13 * sx, 0.0, 0.16), rotation=(-0.2, 1.25 * sx, 0))
    mesh_object("helmet", sphere(0.22), "kit2", h, (0, 0.03, 0.2), scale=(1.0, 1.0, 0.82))
    mesh_object("stripe", box(0.07, 0.45, 0.04), "kit1", h, (0, 0.03, 0.375))


def head_gnome(h, r, extras):
    mesh_object("face", sphere(0.15), "skin", h, (0, -0.04, 0.12))
    mesh_object("nose", sphere(0.065), "skin", h, (0, -0.17, 0.1))
    mesh_object("beard", sphere(0.16), "hair", h, (0, -0.1, -0.02), scale=(1.0, 0.75, 1.25))
    mesh_object("hat", cone(0.18, 0.5), "kit2", h, (0, 0.02, 0.2), rotation=(-0.3, 0, 0))
    mesh_object("hat_band", cylinder(0.185, 0.06), "kit1", h, (0, 0.02, 0.26))
    mesh_object("goggles", box(0.28, 0.06, 0.07), "metal", h, (0, -0.14, 0.26))


def head_vampire(h, r, extras):
    mesh_object("face", sphere(0.15), "skin", h, (0, -0.05, 0.12), scale=(0.82, 0.82, 1.04))
    mesh_object("hair", sphere(0.165), "hair", h, (0, 0.03, 0.19), scale=(1.0, 1.08, 0.82))
    mesh_object("widows_peak", cone(0.05, 0.1), "hair", h, (0, -0.15, 0.25), rotation=(2.6, 0, 0))
    for sx in (1, -1):
        mesh_object(f"eye_{sx}", box(0.05, 0.02, 0.025), "eyes", h, (0.05 * sx, -0.165, 0.15))


HEADS = {"human": head_human, "orc": head_orc, "elf": head_elf, "witch_elf": head_witch_elf,
         "goblin": head_goblin, "gnome": head_gnome, "vampire": head_vampire}


def build(race, style_name):
    style = STYLES[style_name]
    r = RACES[race]
    leg = r["hip"] - 0.08  # hip joint to sole
    STATE.clear()
    STATE.update(r, leg=leg)
    for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.worlds):
        for block in list(coll):
            coll.remove(block)

    pal = dict(style["palette"])
    orc_skin = pal.pop("orc_skin")
    pal["skin"] = orc_skin if race == "orc" else r.get("skin", pal["skin"])
    pal["hair"] = r.get("hair", (0.08, 0.07, 0.1))
    pal.update(kit1=KIT_GREY, kit2=KIT_GREY)
    for part, color in pal.items():
        toon_material(part, color, style)
        mask_material(f"mask_{part}", MASK_COLOR.get(part, (0, 0, 0)), style)
    new_material("eyes")[2].inputs["Color"].default_value = (1.0, 0.08, 0.1, 1)  # glows, never shaded
    new_material("mask_eyes")[2].inputs["Color"].default_value = (0, 0, 0, 1)
    extras = style["kit"].get(race, ())

    root = joint("root", None, (0, 0, 0))
    root.scale = (r.get("scale", 1.0),) * 3
    body = joint("body", root, (0, 0, r["hip"]))
    chest = joint("chest", body, (0, 0, r["chest"]))
    head = joint("head", chest, (0, -0.1 * (r["hunch"] > 0.1), r["neck"]))
    head.scale = (r.get("head_scale", 1.0),) * 3
    tw, td, th = r["torso"]
    lw = tw / 0.52  # limb thickness follows torso width

    mesh_object("pelvis", box(tw * 0.88, td * 0.92, 0.28), "cloth", body, (0, 0, -0.04))
    mesh_object("belt", box(tw * 0.92, td, 0.06), "leather", body, (0, 0, 0.1))
    mesh_object("torso", box(tw, td, th), "kit1", chest, (0, 0, th * 0.6))
    if "number" in extras:
        mesh_object("number_plate", box(0.22, 0.02, 0.18), "cloth", chest, (0, -td / 2 - 0.005, th * 0.66))
    if "tabard" in extras:
        mesh_object("tabard_f", box(tw * 0.5, 0.03, 0.5), "kit2", body, (0, -td / 2 - 0.02, -0.18))
        mesh_object("tabard_b", box(tw * 0.5, 0.03, 0.42), "kit2", body, (0, td / 2 + 0.02, -0.14))
    if r.get("cape"):
        mesh_object("collar", box(tw * 0.95, 0.05, 0.3), "kit2", chest, (0, td / 2, th + 0.1), rotation=(-0.25, 0, 0))
        mesh_object("cape", box(tw * 1.0, 0.03, 0.85), "kit2", chest, (0, td / 2 + 0.06, th - 0.32), rotation=(-0.12, 0, 0))
    if r["pad"]:
        for side, sx in (("l", 1), ("r", -1)):
            pad = mesh_object(f"pad_{side}", sphere(r["pad"]), "kit2", chest,
                              (r["shoulder"] * 0.86 * sx, 0, th), scale=(1.1, 1.0, 0.62))
            if race == "orc":
                for k, (dx, dy) in enumerate(((0, 0), (0.08, 0.06), (-0.04, -0.08))):
                    mesh_object(f"spike_{side}{k}", cone(0.045, 0.16), "metal", pad, (dx * sx / 1.1, dy, 0.14 / 0.62),
                                scale=(1 / 1.1, 1, 1 / 0.62))

    mesh_object("neck", cylinder(0.08 * (1.4 if race == "orc" else 1), 0.14), "skin", head, (0, 0, 0.1))
    HEADS[r["head"]](head, r, extras)
    if "visor" in extras:
        mesh_object("visor", box(0.34, 0.08, 0.09), "metal", head, (0, -0.15 if race != "orc" else -0.17, 0.2))

    for side, sx in (("l", 1), ("r", -1)):
        sh = joint(f"shoulder_{side}", chest, (r["shoulder"] * sx, 0, th * 0.92))
        el = joint(f"elbow_{side}", sh, (0, 0, -r["upper"]))
        mesh_object(f"upper_arm_{side}", cylinder(r["arm"], r["upper"], 1.15), "skin" if r.get("bare_arms") else "kit1", sh)
        mesh_object(f"forearm_{side}", cylinder(r["arm"] * 0.9, r["fore"]), "skin", el)
        mesh_object(f"glove_{side}", sphere(r["fist"]), "leather", el, (0, 0, -r["fore"] - r["fist"] * 0.4))
        if r.get("bracers"):
            mesh_object(f"bracer_{side}", cylinder(r["arm"] * 1.15, r["fore"] * 0.55), "kit2", el, (0, 0, -r["fore"] * 0.35))
            mesh_object(f"blade_{side}", cone(0.03, 0.16), "metal", el, (0.06 * sx, 0, -r["fore"] * 0.55), rotation=(0, 1.4 * sx, 0))

        hip = joint(f"hip_{side}", body, (0.13 * sx * lw, 0, -0.08))
        kn = joint(f"knee_{side}", hip, (0, 0, -r["thigh"]))
        ankle = joint(f"ankle_{side}", kn, (0, 0, -(leg - r["thigh"]) + 0.07))
        mesh_object(f"thigh_{side}", cylinder(0.1 * lw, r["thigh"], 1.1), "cloth", hip)
        mesh_object(f"shin_{side}", cylinder(0.085 * lw, leg - r["thigh"] - 0.14), "boot", kn)
        mesh_object(f"boot_{side}", box(0.17 * lw, 0.3 * lw, 0.14), "boot", ankle, (0, -0.05 * lw, 0))

    setup_scene(style)
    return {"objects": len(bpy.data.objects)}


def setup_scene(style):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.film_transparent = True
    scene.render.filter_size = 0.0  # no anti-aliasing: hard pixel edges
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.eevee.taa_render_samples = 1

    world = bpy.data.worlds.new("world")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.06, 0.06, 0.08, 1)
    scene.world = world

    sun_data = bpy.data.lights.new("sun", "SUN")
    sun_data.energy = style["sun"]["energy"]
    sun_data.color = style["sun"]["color"]
    sun = bpy.data.objects.new("sun", sun_data)
    scene.collection.objects.link(sun)
    sun.rotation_euler = Euler(tuple(math.radians(a) for a in style["sun"]["rot"]))

    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    el, az = math.radians(CAMERA_ELEVATION_DEG), math.radians(CAMERA_AZIMUTH_DEG)
    target = Vector((0, 0, 0.62))
    cam.location = target + Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el))) * 10
    cam.rotation_euler = Euler((math.pi / 2 - el, 0, az))
    scene.camera = cam


# ------------------------------------------------------------------- poses


def set_pose(pose):
    """pose maps joint name -> (rx, ry, rz, dx, dy, dz) offsets from rest.

    Ankles are not posed directly: each one cancels the pitch of the body,
    hip and knee above it, so boots stay flat on the ground.
    """
    pose = dict(pose)
    for side in ("l", "r"):
        pitch = sum(pose.get(j, R())[0] for j in ("body", f"hip_{side}", f"knee_{side}"))
        pose[f"ankle_{side}"] = R(rx=-pitch)
    for ob in bpy.data.objects:
        if "rest" not in ob:
            continue
        rx, ry, rz, dx, dy, dz = pose.get(ob.name, (0, 0, 0, 0, 0, 0))
        rest = ob["rest"]
        ob.location = (rest[0] + dx, rest[1] + dy, rest[2] + dz)
        if ob.name != "root":
            ob.rotation_euler = (rx, ry, rz)


def lerp_keys(keys, t):
    """Smoothstep through [(t, value)], value a tuple."""
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t0 <= t <= t1:
            u = (t - t0) / (t1 - t0) if t1 > t0 else 0
            u = u * u * (3 - 2 * u)
            return tuple(a + (b - a) * u for a, b in zip(v0, v1))
    return keys[-1][1]


def R(rx=0, ry=0, rz=0, dx=0, dy=0, dz=0):
    return (rx, ry, rz, dx, dy, dz)


def stance_drop(thigh, knee, spread):
    """How far the hips sink so bent, spread legs still reach the ground.

    thigh is the thigh's angle from vertical (negative swings forward) and
    knee the bend at the knee, both in world terms.
    """
    l1 = STATE["thigh"]
    l2 = STATE["leg"] - l1
    reach = (l1 * math.cos(thigh) + l2 * math.cos(thigh + knee)) * math.cos(spread)
    return reach - STATE["leg"]


def pose_idle(f, n):
    """Ready stance: feet wide, knees bent, chest over the toes, hands out to block."""
    p = 2 * math.pi * f / n
    s, c = math.sin(p), math.cos(p)
    hunch = STATE["hunch"]
    tilt = 0.12 + hunch * 0.3          # pelvis tips forward
    spread = 0.3                       # each leg swings this far out
    thigh = -0.72                      # thighs forward of the hips
    knee = 1.22 + 0.07 * s             # knees breathe with the body
    lean = 0.3 + hunch + 0.03 * s
    return {
        "body": R(rx=tilt, rz=0.04 * c, dx=0.025 * c, dz=stance_drop(thigh, knee, spread)),
        "chest": R(rx=lean, rz=-0.05 * c),
        "head": R(rx=-(tilt + lean) + 0.05, rz=0.2 * math.sin(p)),
        "hip_l": R(rx=thigh - tilt, ry=OUT["l"] * spread),
        "hip_r": R(rx=thigh - tilt, ry=OUT["r"] * spread),
        "knee_l": R(rx=knee),
        "knee_r": R(rx=knee),
        "shoulder_l": R(rx=-0.8 + 0.05 * s, ry=OUT["l"] * (0.55 + 0.04 * c)),
        "shoulder_r": R(rx=-0.8 + 0.05 * s, ry=OUT["r"] * (0.55 - 0.04 * c)),
        "elbow_l": R(rx=-1.05 - 0.1 * c),
        "elbow_r": R(rx=-1.05 - 0.1 * s),
    }


def pose_run(f, n):
    p = 2 * math.pi * f / n
    s = math.sin(p)
    k = STATE["leg"] / 0.92
    knee_l = 0.25 + 1.1 * max(0.0, math.sin(p + math.pi / 2))
    knee_r = 0.25 + 1.1 * max(0.0, math.sin(p - math.pi / 2))
    hunch = STATE["hunch"]
    return {
        "body": R(rx=0.22 + hunch * 0.3, dz=(0.06 * abs(math.cos(p)) - 0.06) * k, rz=0.08 * s),
        "chest": R(rx=0.22 + hunch * 0.5, rz=-0.16 * s),
        "head": R(rx=-0.35 - hunch * 0.6, rz=0.08 * s),
        "shoulder_l": R(rx=0.75 * s, ry=OUT["l"] * 0.15),
        "shoulder_r": R(rx=-0.75 * s, ry=OUT["r"] * 0.15),
        "elbow_l": R(rx=-1.4),
        "elbow_r": R(rx=-1.4),
        "hip_l": R(rx=-0.8 * s - 0.15),
        "hip_r": R(rx=0.8 * s - 0.15),
        "knee_l": R(rx=knee_l),
        "knee_r": R(rx=knee_r),
    }


def pose_block(f, n):
    """Shoulder charge: crouch, drive forward, recover."""
    t = f / (n - 1)
    k = STATE["leg"] / 0.92
    keys = [
        (0.0, (0.12, 0.0, -0.05, 0.1, -0.2, -0.5, 0.3)),
        (0.25, (0.35, 0.12, -0.18, 0.25, -0.9, -0.9, 0.9)),
        (0.55, (0.75, -0.45, -0.12, 0.45, -1.9, -0.6, 0.5)),
        (0.8, (0.6, -0.35, -0.1, 0.35, -1.5, -0.7, 0.6)),
        (1.0, (0.2, -0.1, -0.06, 0.12, -0.4, -0.5, 0.35)),
    ]
    lean, fwd, drop, chest, arm, hip, knee = lerp_keys(keys, t)
    return {
        "body": R(rx=lean, dy=fwd * k, dz=drop * k),
        "chest": R(rx=chest + STATE["hunch"] * 0.5, rz=0.35 * chest),
        "head": R(rx=-lean - 0.1 - STATE["hunch"]),
        "shoulder_l": R(rx=arm, ry=OUT["l"] * 0.3),
        "shoulder_r": R(rx=arm * 0.6, ry=OUT["r"] * 0.5),
        "elbow_l": R(rx=-0.5),
        "elbow_r": R(rx=-1.3),
        "hip_l": R(rx=hip - 0.3, ry=OUT["l"] * 0.1),
        "hip_r": R(rx=-hip * 0.2 + 0.3, ry=OUT["r"] * 0.1),
        "knee_l": R(rx=knee + 0.3),
        "knee_r": R(rx=knee),
    }


def pose_fall(f, n):
    """Knocked onto the back, arms thrown up, one small bounce."""
    t = f / (n - 1)
    lie = 0.26 - STATE["hip"]  # hips come to rest just above the ground
    keys = [
        (0.0, (0.0, 0.0, 0.0, 0.0, 0.3)),
        (0.3, (-0.6, 0.1, lie * 0.2, -2.2, 0.9)),
        (0.65, (-1.5, 0.15, lie, -2.8, 0.6)),
        (0.8, (-1.42, 0.1, lie * 0.92, -2.5, 0.4)),
        (1.0, (-1.52, 0.08, lie, -2.7, 0.45)),
    ]
    rot, back, drop, arm, knee = lerp_keys(keys, t)
    return {
        "body": R(rx=rot, dy=back, dz=drop),
        "chest": R(rx=-0.1),
        "head": R(rx=0.35 * min(1.0, t * 2)),
        "shoulder_l": R(rx=arm, ry=OUT["l"] * 0.5),
        "shoulder_r": R(rx=arm * 0.85, ry=OUT["r"] * 0.6),
        "elbow_l": R(rx=-0.4),
        "elbow_r": R(rx=-0.7),
        "hip_l": R(rx=-0.6 - knee * 0.5, ry=OUT["l"] * 0.15),
        "hip_r": R(rx=-0.2, ry=OUT["r"] * 0.15),
        "knee_l": R(rx=knee + 0.4),
        "knee_r": R(rx=knee * 0.4),
    }


POSES = {"idle": pose_idle, "run": pose_run, "block": pose_block, "fall": pose_fall}


# ------------------------------------------------------------------ render


def assign_pass(kind):
    for ob in bpy.data.objects:
        if ob.type == "MESH":
            part = ob["part"]
            ob.data.materials[0] = bpy.data.materials[part if kind == "color" else f"mask_{part}"]


def feet_anchor(px):
    from bpy_extras.object_utils import world_to_camera_view

    scene = bpy.context.scene
    bpy.context.view_layer.update()
    co = world_to_camera_view(scene, scene.camera, Vector((0, 0, 0)))
    return [round(co.x * px, 2), round((1 - co.y) * px, 2)]


def render_all(out_dir, size, animations=None, directions=None):
    scene = bpy.context.scene
    root = bpy.data.objects["root"]
    animations = animations or list(ANIMATIONS)
    directions = directions or list(DIRECTIONS)
    px = FRAME[size]
    scene.render.resolution_x = scene.render.resolution_y = px
    scene.camera.data.ortho_scale = px / PX_PER_UNIT[size]
    meta = {
        "directions": directions,
        "animations": {a: ANIMATIONS[a] for a in animations},
        "elevation": CAMERA_ELEVATION_DEG,
        "sizes": {size: {"frame": px, "anchor": feet_anchor(px), "px_per_unit": PX_PER_UNIT[size]}},
    }
    count = 0
    for kind in ("color", "mask"):
        assign_pass(kind)
        for anim in animations:
            n = ANIMATIONS[anim]
            for d in directions:
                root.rotation_euler = (0, 0, math.radians(DIRECTIONS[d]))
                for f in range(n):
                    set_pose(POSES[anim](f, n))
                    bpy.context.view_layer.update()
                    scene.render.filepath = os.path.join(out_dir, size, anim, f"{d}_{f}_{kind}.png")
                    bpy.ops.render.render(write_still=True)
                    count += 1
    assign_pass("color")
    set_pose(POSES["idle"](0, 8))
    root.rotation_euler = (0, 0, 0)
    with open(os.path.join(out_dir, "meta.json"), "w") as fh:
        json.dump(meta, fh, indent=2)
    return {"rendered": count, "meta": meta}
