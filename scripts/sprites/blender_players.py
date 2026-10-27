"""Build test players in Blender and render isometric pixel sprite frames.

Run inside Blender (5.1) on Jellybingus:

    g = {}
    for f in ("blender_players.py", "model_kit.py", "team_models.py"):
        exec(open("C:/.../" + f).read(), g)
    g["build_model"](g["MODELS"]["orc_lineman"])
    g["render_all"]("C:/.../renders/orc_lineman", "lo")

model_kit.py holds the rigs and parts; team_models.py holds one spec per
player type.

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
        # Bands keep only a light violet cast so skin colours still tell races apart.
        ramp=[(0.0, (0.44, 0.38, 0.56)), (0.3, (0.8, 0.76, 0.88)), (0.7, (1.0, 0.98, 1.0))],
        sun=dict(energy=2.6, color=(0.85, 0.85, 1.0), rot=(55, 0, 160)),
        # screen-left is world (-1, -1), screen-right (1, 1); both lean slightly behind
        rims=[((-1.4, -0.6, 0.25), (1.0, 0.15, 0.7)), ((0.6, 1.4, 0.25), (0.15, 0.9, 1.0))],
        rim_width=0.55,
        palette=dict(cloth=(0.34, 0.32, 0.4), leather=(0.32, 0.22, 0.2), boot=(0.1, 0.09, 0.12),
                     metal=(0.2, 0.2, 0.25), skin=(0.8, 0.58, 0.52), orc_skin=(0.34, 0.66, 0.42)),
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

# ry that swings a limb away from the body. The left side sits at +X, and a
# positive rotation about Y swings a hanging limb toward -X, so left is negative.
OUT = {"l": -1.0, "r": 1.0}

MASK_COLOR = {"kit1": (1, 0, 0), "kit2": (0, 1, 0)}
STATE = {}  # body plan of the model being built, read by the poses


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
    lean = 0.3 + hunch * 0.45 + 0.03 * s  # more lean buried big guys' heads in their chests
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


def render_all(out_dir, size, animations=None, directions=None, frame=None):
    scene = bpy.context.scene
    root = bpy.data.objects["root"]
    animations = animations or list(ANIMATIONS)
    directions = directions or list(DIRECTIONS)
    px = frame or FRAME[size]  # big models get a bigger frame at the same pixels per metre
    scene.render.resolution_x = scene.render.resolution_y = px
    scene.camera.data.ortho_scale = px / PX_PER_UNIT[size]
    meta_path = os.path.join(out_dir, "meta.json")
    sizes = json.load(open(meta_path))["sizes"] if os.path.exists(meta_path) else {}
    sizes[size] = {"frame": px, "anchor": feet_anchor(px), "px_per_unit": PX_PER_UNIT[size]}
    meta = {
        "directions": directions,
        "animations": {a: ANIMATIONS[a] for a in animations},
        "elevation": CAMERA_ELEVATION_DEG,
        "sizes": sizes,
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
    with open(meta_path, "w") as fh:
        json.dump(meta, fh, indent=2)
    return {"rendered": count, "meta": meta}
