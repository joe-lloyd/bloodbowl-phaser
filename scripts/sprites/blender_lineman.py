"""Build a test human lineman in Blender and render pixel sprite frames.

Run inside Blender (5.1) on Jellybingus:

    exec(open("C:/.../blender_lineman.py").read())
    build()
    render_all("C:/.../renders")

The figure is rigid parts parented to a hierarchy of empties, like a
miniature on pins. Poses are pure functions of (animation, frame), so a
render is deterministic and needs no keyframes.

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

# Facing per direction, as rotation about Z. The figure is modelled facing -Y,
# which is "down the screen" (south) from the camera.
DIRECTIONS = {
    "s": 0,
    "se": 45,
    "e": 90,
    "ne": 135,
    "n": 180,
    "nw": -135,
    "w": -90,
    "sw": -45,
}

ANIMATIONS = {"idle": 8, "run": 8, "block": 6, "fall": 8}

CAMERA_ELEVATION_DEG = 38
ORTHO_SCALE = 3.2  # 50 px per metre at "hi"
SIZES = {"hi": 160, "lo": 80}

KIT_GREY = (0.8, 0.8, 0.8)


# ---------------------------------------------------------------- materials


def toon_material(name, color):
    """Diffuse lighting stepped into three flat bands, then emitted."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    diffuse = nt.nodes.new("ShaderNodeBsdfDiffuse")
    to_rgb = nt.nodes.new("ShaderNodeShaderToRGB")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    mix = nt.nodes.new("ShaderNodeMix")
    emit = nt.nodes.new("ShaderNodeEmission")

    ramp.color_ramp.interpolation = "CONSTANT"
    els = ramp.color_ramp.elements
    els[0].position, els[0].color = 0.0, (0.38, 0.36, 0.48, 1)
    els[1].position, els[1].color = 0.3, (0.68, 0.66, 0.74, 1)
    top = els.new(0.7)
    top.color = (1.0, 1.0, 1.0, 1)

    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    mix.inputs["B"].default_value = (*color, 1)

    nt.links.new(diffuse.outputs[0], to_rgb.inputs[0])
    nt.links.new(to_rgb.outputs["Color"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], mix.inputs["A"])
    nt.links.new(mix.outputs["Result"], emit.inputs["Color"])
    nt.links.new(emit.outputs[0], out.inputs["Surface"])
    return mat


def flat_material(name, color):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs["Color"].default_value = (*color, 1)
    nt.links.new(emit.outputs[0], out.inputs["Surface"])
    return mat


PALETTE = {
    "kit1": KIT_GREY,  # jersey and helmet stripe, tinted primary
    "kit2": KIT_GREY,  # helmet and shoulder pads, tinted secondary
    "skin": (0.72, 0.45, 0.32),
    "cloth": (0.78, 0.74, 0.62),  # breeches
    "leather": (0.30, 0.17, 0.08),
    "boot": (0.10, 0.08, 0.07),
    "metal": (0.55, 0.56, 0.6),
}
MASK_COLOR = {"kit1": (1, 0, 0), "kit2": (0, 1, 0)}


# ------------------------------------------------------------------ meshes


def mesh_object(name, build_fn, material, parent, location=(0, 0, 0), scale=(1, 1, 1), rotation=(0, 0, 0)):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    build_fn(bm)
    for f in bm.faces:
        f.smooth = True
    bm.to_mesh(me)
    bm.free()
    me.materials.append(bpy.data.materials[material])
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = parent
    ob.location = location
    ob.scale = scale
    ob.rotation_euler = rotation
    ob["part"] = material
    return ob


def sphere(radius=1.0):
    return lambda bm: bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=radius)


def cylinder(radius, depth, top_scale=1.0):
    """Cylinder hanging down from the origin, length `depth`."""

    def build(bm):
        bmesh.ops.create_cone(
            bm,
            cap_ends=True,
            segments=12,
            radius1=radius * top_scale,
            radius2=radius,
            depth=depth,
            matrix=Matrix.Translation((0, 0, -depth / 2)),
        )

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


def build():
    for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.worlds):
        for block in list(coll):
            coll.remove(block)
    for name, color in PALETTE.items():
        toon_material(name, color)

    root = joint("root", None, (0, 0, 0))  # facing
    body = joint("body", root, (0, 0, 1.0))  # hips; animation root
    chest = joint("chest", body, (0, 0, 0.1))
    head = joint("head", chest, (0, 0, 0.62))
    J = {"root": root, "body": body, "chest": chest, "head": head}

    # Hips and breeches
    mesh_object("pelvis", box(0.46, 0.3, 0.28), "cloth", body, (0, 0, -0.04))
    mesh_object("belt", box(0.48, 0.32, 0.06), "leather", body, (0, 0, 0.1))

    # Torso: jersey with a taper toward the waist
    mesh_object("torso", box(0.52, 0.32, 0.5), "kit1", chest, (0, 0, 0.3), scale=(1, 1, 1))
    mesh_object("number_plate", box(0.22, 0.02, 0.18), "cloth", chest, (0, -0.165, 0.33))
    for side, sx in (("l", 1), ("r", -1)):
        mesh_object(f"pad_{side}", sphere(0.17), "kit2", chest, (0.29 * sx, 0, 0.5), scale=(1.1, 1.0, 0.6))

    # Head: helmet with a cage, a little face and a stripe
    mesh_object("neck", cylinder(0.08, 0.14), "skin", head, (0, 0, 0.1))
    mesh_object("face", sphere(0.15), "skin", head, (0, -0.06, 0.12), scale=(0.85, 0.8, 0.95))
    mesh_object("helmet", sphere(0.2), "kit2", head, (0, 0.03, 0.2), scale=(1.0, 1.05, 0.95))
    mesh_object("stripe", box(0.07, 0.42, 0.04), "kit1", head, (0, 0.03, 0.385))
    mesh_object("cage", box(0.26, 0.04, 0.03), "metal", head, (0, -0.19, 0.08))
    mesh_object("cage_v", box(0.03, 0.04, 0.16), "metal", head, (0, -0.2, 0.12))

    for side, sx in (("l", 1), ("r", -1)):
        sh = joint(f"shoulder_{side}", chest, (0.34 * sx, 0, 0.46))
        el = joint(f"elbow_{side}", sh, (0, 0, -0.34))
        mesh_object(f"upper_arm_{side}", cylinder(0.085, 0.34, 1.15), "kit1", sh)
        mesh_object(f"forearm_{side}", cylinder(0.075, 0.3), "skin", el)
        mesh_object(f"glove_{side}", sphere(0.095), "leather", el, (0, 0, -0.34))

        hip = joint(f"hip_{side}", body, (0.13 * sx, 0, -0.08))
        kn = joint(f"knee_{side}", hip, (0, 0, -0.44))
        mesh_object(f"thigh_{side}", cylinder(0.1, 0.44, 1.1), "cloth", hip)
        mesh_object(f"shin_{side}", cylinder(0.085, 0.3), "boot", kn)
        mesh_object(f"boot_{side}", box(0.17, 0.3, 0.14), "boot", kn, (0, -0.05, -0.41))
        J.update({f"shoulder_{side}": sh, f"elbow_{side}": el, f"hip_{side}": hip, f"knee_{side}": kn})

    setup_scene()
    return {"objects": len(bpy.data.objects)}


def setup_scene():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.film_transparent = True
    scene.render.filter_size = 0.0  # no anti-aliasing: hard pixel edges
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    if scene.eevee.taa_render_samples:
        scene.eevee.taa_render_samples = 1

    world = bpy.data.worlds.new("world")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.08, 0.08, 0.1, 1)
    scene.world = world

    sun_data = bpy.data.lights.new("sun", "SUN")
    sun_data.energy = 2.6
    sun = bpy.data.objects.new("sun", sun_data)
    scene.collection.objects.link(sun)
    # Light from the upper left, slightly in front of the figure.
    sun.rotation_euler = Euler((math.radians(40), math.radians(-35), math.radians(-20)))

    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = ORTHO_SCALE
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    el = math.radians(CAMERA_ELEVATION_DEG)
    target = Vector((0, 0, 0.62))
    cam.location = target + Vector((0, -math.cos(el), math.sin(el))) * 10
    cam.rotation_euler = Euler((math.pi / 2 - el, 0, 0))
    scene.camera = cam


# ------------------------------------------------------------------- poses


def set_pose(pose):
    """pose maps joint name -> (rx, ry, rz, dx, dy, dz) offsets from rest."""
    for ob in bpy.data.objects:
        if "rest" not in ob:
            continue
        rx, ry, rz, dx, dy, dz = pose.get(ob.name, (0, 0, 0, 0, 0, 0))
        rest = ob["rest"]
        ob.location = (rest[0] + dx, rest[1] + dy, rest[2] + dz)
        if ob.name != "root":
            ob.rotation_euler = (rx, ry, rz)


def lerp_keys(keys, t):
    """Piecewise linear through [(t, value)], value a tuple."""
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t0 <= t <= t1:
            u = (t - t0) / (t1 - t0) if t1 > t0 else 0
            u = u * u * (3 - 2 * u)
            return tuple(a + (b - a) * u for a, b in zip(v0, v1))
    return keys[-1][1]


def R(rx=0, ry=0, rz=0, dx=0, dy=0, dz=0):
    return (rx, ry, rz, dx, dy, dz)


def pose_idle(f, n):
    """Ready stance: breathing, weight shift, hands flexing."""
    p = 2 * math.pi * f / n
    s, c = math.sin(p), math.cos(p)
    knee = 0.28 + 0.06 * s
    return {
        "body": R(rx=0.05, ry=0.03 * c, dz=-0.05 - 0.025 * s, dx=0.02 * c),
        "chest": R(rx=0.04 + 0.04 * s, ry=-0.03 * c),
        "head": R(rx=-0.05 - 0.03 * s, rz=0.12 * c),
        "shoulder_l": R(rx=-0.25 + 0.06 * s, ry=0.32 + 0.04 * c),
        "shoulder_r": R(rx=-0.25 + 0.06 * s, ry=-0.32 - 0.04 * c),
        "elbow_l": R(rx=-0.9 - 0.1 * c),
        "elbow_r": R(rx=-0.9 - 0.1 * s),
        "hip_l": R(rx=-0.35 - 0.03 * s, ry=0.12),
        "hip_r": R(rx=-0.35 - 0.03 * s, ry=-0.12),
        "knee_l": R(rx=knee + 0.25),
        "knee_r": R(rx=knee + 0.25),
    }


def pose_run(f, n):
    p = 2 * math.pi * f / n
    s = math.sin(p)
    knee_l = 0.25 + 1.1 * max(0.0, math.sin(p + math.pi / 2))
    knee_r = 0.25 + 1.1 * max(0.0, math.sin(p - math.pi / 2))
    return {
        "body": R(rx=0.22, dz=0.06 * abs(math.cos(p)) - 0.06, rz=0.08 * s),
        "chest": R(rx=0.22, rz=-0.16 * s),
        "head": R(rx=-0.35, rz=0.08 * s),
        "shoulder_l": R(rx=0.75 * s, ry=0.15),
        "shoulder_r": R(rx=-0.75 * s, ry=-0.15),
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
    keys = [
        (0.0, (0.12, 0.0, -0.05, 0.1, -0.2, -0.5, 0.3)),
        (0.25, (0.35, 0.12, -0.18, 0.25, -0.9, -0.9, 0.9)),
        (0.55, (0.75, -0.45, -0.12, 0.45, -1.9, -0.6, 0.5)),
        (0.8, (0.6, -0.35, -0.1, 0.35, -1.5, -0.7, 0.6)),
        (1.0, (0.2, -0.1, -0.06, 0.12, -0.4, -0.5, 0.35)),
    ]
    lean, fwd, drop, chest, arm, hip, knee = lerp_keys(keys, t)
    return {
        "body": R(rx=lean, dy=fwd, dz=drop),
        "chest": R(rx=chest, rz=0.35 * chest),
        "head": R(rx=-lean - 0.1),
        "shoulder_l": R(rx=arm, ry=0.3),
        "shoulder_r": R(rx=arm * 0.6, ry=-0.5),
        "elbow_l": R(rx=-0.5),
        "elbow_r": R(rx=-1.3),
        "hip_l": R(rx=hip - 0.3, ry=0.1),
        "hip_r": R(rx=-hip * 0.2 + 0.3, ry=-0.1),
        "knee_l": R(rx=knee + 0.3),
        "knee_r": R(rx=knee),
    }


def pose_fall(f, n):
    """Knocked onto the back, arms thrown up, one small bounce."""
    t = f / (n - 1)
    keys = [
        (0.0, (0.0, 0.0, 0.0, 0.0, 0.3)),
        (0.3, (-0.6, 0.1, -0.15, -2.2, 0.9)),
        (0.65, (-1.5, 0.15, -0.72, -2.8, 0.6)),
        (0.8, (-1.42, 0.1, -0.66, -2.5, 0.4)),
        (1.0, (-1.52, 0.08, -0.74, -2.7, 0.45)),
    ]
    rot, back, drop, arm, knee = lerp_keys(keys, t)
    return {
        "body": R(rx=rot, dy=back, dz=drop),
        "chest": R(rx=-0.1),
        "head": R(rx=0.35 * min(1.0, t * 2)),
        "shoulder_l": R(rx=arm, ry=0.5),
        "shoulder_r": R(rx=arm * 0.85, ry=-0.6),
        "elbow_l": R(rx=-0.4),
        "elbow_r": R(rx=-0.7),
        "hip_l": R(rx=-0.6 - knee * 0.5, ry=0.15),
        "hip_r": R(rx=-0.2, ry=-0.15),
        "knee_l": R(rx=knee + 0.4),
        "knee_r": R(rx=knee * 0.4),
    }


POSES = {"idle": pose_idle, "run": pose_run, "block": pose_block, "fall": pose_fall}


# ------------------------------------------------------------------ render


def assign_pass(kind):
    """kind 'color' restores toon materials; 'mask' swaps in flat ids."""
    flats = {}
    for ob in bpy.data.objects:
        if ob.type != "MESH":
            continue
        part = ob["part"]
        if kind == "color":
            mat = bpy.data.materials[part]
        else:
            key = f"mask_{part}"
            if key not in flats:
                flats[key] = bpy.data.materials.get(key) or flat_material(key, MASK_COLOR.get(part, (0, 0, 0)))
            mat = flats[key]
        ob.data.materials[0] = mat


def feet_anchor(size):
    """Pixel position of the world origin, where the feet stand."""
    from bpy_extras.object_utils import world_to_camera_view

    scene = bpy.context.scene
    bpy.context.view_layer.update()
    co = world_to_camera_view(scene, scene.camera, Vector((0, 0, 0)))
    return [round(co.x * size, 2), round((1 - co.y) * size, 2)]


def render_all(out_dir, animations=None, sizes=None, directions=None):
    scene = bpy.context.scene
    root = bpy.data.objects["root"]
    animations = animations or list(ANIMATIONS)
    directions = directions or list(DIRECTIONS)
    meta = {
        "directions": directions,
        "animations": {a: ANIMATIONS[a] for a in animations},
        "elevation": CAMERA_ELEVATION_DEG,
        "sizes": {},
    }
    count = 0
    for size_name, px in (sizes or SIZES).items():
        scene.render.resolution_x = scene.render.resolution_y = px
        meta["sizes"][size_name] = {"frame": px, "anchor": feet_anchor(px)}
        for kind in ("color", "mask"):
            assign_pass(kind)
            for anim in animations:
                n = ANIMATIONS[anim]
                for d in directions:
                    root.rotation_euler = (0, 0, math.radians(DIRECTIONS[d]))
                    for f in range(n):
                        set_pose(POSES[anim](f, n))
                        bpy.context.view_layer.update()
                        path = os.path.join(out_dir, size_name, anim, f"{d}_{f}_{kind}.png")
                        scene.render.filepath = path
                        bpy.ops.render.render(write_still=True)
                        count += 1
    assign_pass("color")
    set_pose(POSES["idle"](0, 8))
    root.rotation_euler = (0, 0, 0)
    with open(os.path.join(out_dir, "meta.json"), "w") as fh:
        json.dump(meta, fh, indent=2)
    return {"rendered": count, "meta": meta}
