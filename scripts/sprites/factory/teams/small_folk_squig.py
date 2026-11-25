"""Night Goblin beasts. cave_maw is hand-modelled in art/cave_maw.blend: edit it there and render again. Its
objects are named after the part they draw, its materials after palette keys, and the jaw, arms and legs turn
about their object origins."""
import functools
import math
import os

import bpy
from mathutils import Matrix

from lib import Model, anim, core, palette, register

ART = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "art")
LIMBS = {"jaw": "jaw", "arm_l": "arm", "arm_r": "arm", "leg_l": "leg", "leg_r": "leg"}
BACK = 1.1


@functools.lru_cache(maxsize=None)
def blend_parts(name):
    """The parts of art/<name>.blend, read once: {part: (vertices, faces, palette key, rest matrix, parent)}."""
    with bpy.data.libraries.load(os.path.join(ART, name + ".blend")) as (available, wanted):
        wanted.objects = list(available.objects)
    scene = bpy.context.scene.collection
    for ob in wanted.objects:
        scene.objects.link(ob)
    bpy.context.view_layer.update()
    parts = {ob.name: ([v.co.copy() for v in ob.data.vertices], [tuple(p.vertices) for p in ob.data.polygons],
                       ob.data.materials[0].name.split(".")[0], ob.matrix_world.copy(), ob.parent and ob.parent.name)
             for ob in wanted.objects}
    for ob in wanted.objects:
        bpy.data.objects.remove(ob)
    return parts


@register
class CaveMaw(Model):
    """A round red cave beast, half of it jaw: stalked yellow eyes, bone spines and a kit band round its middle.
    It bounds instead of running and ends a fall on its back with its feet in the air."""
    key = "cave_maw"
    plan = "beast"
    target_px = 76
    lie, lie_shift = 0.5, 0.0

    def pose(self, name, i, n):
        w = anim.wave(i / n)
        turn = math.sin(math.pi * i / (n - 1))
        if name == "idle":
            return dict(jaw=6 + 12 * w["breath"])
        if name == "run":
            bound = math.sin(math.pi * i / n)
            return dict(hop=0.34 * bound, leg=50 * bound, arm=-25 * bound, jaw=14, pitch=-10 * math.cos(math.pi * i / n) * bound)
        if name == "cheer":
            return dict(hop=0.3 * w["up"], jaw=30 * w["up"], leg=35 * w["up"], arm=-40 * w["up"])
        if name == "fall":
            over = math.pi * min(1, i / (n - 2))
            return dict(roll=math.degrees(over), hop=BACK * (1 - math.cos(over)) / 2, jaw=20, leg=40 * i / (n - 1),
                        arm=-30 * i / (n - 1))
        return dict(shift=0.2 * turn, jaw=38 * turn, leg=25 * turn, arm=-30 * turn)

    def build(self, pose):
        parts = blend_parts(self.key)
        for name, (verts, faces, mat, rest, parent) in parts.items():
            limb = name if name in LIMBS else parent
            if limb in LIMBS:
                joint = parts[limb][3]
                rest = joint @ Matrix.Rotation(math.radians(pose.get(LIMBS[limb], 0)), 4, "X") @ joint.inverted() @ rest
            me = bpy.data.meshes.new(name)
            me.from_pydata([rest @ v for v in verts], [], faces)
            for p in me.polygons:
                p.use_smooth = True
            me.materials.append(palette.material(mat))
            ob = bpy.data.objects.new(self.key + "_" + name, me)
            bpy.context.collection.objects.link(ob)
            ob.parent = core.ROOT[0]
