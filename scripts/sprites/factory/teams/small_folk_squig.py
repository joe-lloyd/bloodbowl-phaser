"""Night Goblin beasts. cave_maw is hand-modelled in art/cave_maw.blend: edit it there and render again. Its
objects are named after the part they draw, its materials after palette keys, and the jaw, arms and legs turn
about their object origins."""
import functools
import math
import os

import bpy
from mathutils import Matrix, Vector

from lib import Biped, Model, anim, core, looks, palette, register
from lib.core import UP, ball_at, cone, flat_cone, tband, tube
from teams import small_folk_common as sf
from teams.small_folk_goblin import GOB, gob_face, tall_hood

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
        maw(self.key + "_", pose)


def maw(tag, pose, place=Matrix(), skip=()):
    """Draw the cave beast in a pose (jaw, arm and leg degrees), moved by `place`, without the parts in skip."""
    parts = blend_parts("cave_maw")
    for name, (verts, faces, mat, rest, parent) in parts.items():
        if name in skip:
            continue
        limb = name if name in LIMBS else parent
        if limb in LIMBS:
            joint = parts[limb][3]
            rest = joint @ Matrix.Rotation(math.radians(pose.get(LIMBS[limb], 0)), 4, "X") @ joint.inverted() @ rest
        me = bpy.data.meshes.new(name)
        me.from_pydata([place @ rest @ v for v in verts], [], faces)
        for p in me.polygons:
            p.use_smooth = True
        me.materials.append(palette.material(mat))
        ob = bpy.data.objects.new(tag + name, me)
        bpy.context.collection.objects.link(ob)
        ob.parent = core.ROOT[0]


class SquigCrew(looks.Fine, Biped):
    """A goblin with a cave beast of its own. pose["_squig"] places the beast (at, turn, over, jaw, arm, leg) and
    pose["_at"] the goblin's pelvis, or its feet when pose["_tip"] tips it onto its back."""
    race = "goblin"
    lie = 0.0
    squig_size = 0.8
    skip = ()

    def beast(self, squig):
        size, over = self.squig_size, math.radians(squig.get("over", 0))
        lift = BACK * size * (1 - math.cos(over)) / 2
        at = Matrix.Translation(squig["at"]) @ Matrix.Translation((0, 0, lift))
        return at @ Matrix.Rotation(math.radians(squig.get("turn", 0)), 4, "Z") @ Matrix.Rotation(over, 4, "Y") @ Matrix.Scale(size, 4)

    def build(self, pose):
        place = self.beast(pose["_squig"])
        maw(self.key + "_squig_", pose["_squig"], place, self.skip)
        root = core.ROOT[0]
        sub = bpy.data.objects.new(self.key + "_seat", None)
        bpy.context.collection.objects.link(sub)
        sub.parent = root
        mine = Matrix.Translation(pose["_at"]) @ Matrix.Rotation(-math.radians(pose.get("_tip", 0)), 4, "X")
        sub.matrix_local = mine
        self.to_goblin = mine.inverted() @ place
        core.ROOT[0] = sub
        try:
            return super().build(pose)
        finally:
            core.ROOT[0] = root

    def on_beast(self, x, y, z):
        """A point of the beast, in the goblin's space."""
        return self.to_goblin @ Vector((x, y, z))

    def pose(self, name, i, n):
        p = super().pose(name, i, n)
        if name == "fall":
            p["_tip"] = p.pop("pitch", 0)
        return p

    def chain(self, tag, a, b, sag):
        n = 8
        pts = [a.lerp(b, i / n) - UP * sag * math.sin(math.pi * i / n) for i in range(n + 1)]
        tube(tag + "chain", pts, [0.032] * (n + 1), "darkmetal", n=5)
        for i in range(1, n):
            ball_at(tag + "link%d" % i, pts[i], 0.055, "metal")


@register
class SquigWrangler(SquigCrew):
    """A robed goblin hanging on to a cave beast by its chain and steering it with a prod longer than he is."""
    key = "squig_wrangler"
    layout = dict(GOB, torso="kit2", legs="cloth_black", belt="rope", buckle=None, wraps="kit1", hood="pointed", rags=0.3)
    stance = dict(lean=-12, legs={"l": (20, 18, 26), "r": (-10, 18, 14)}, arms={"l": (72, 16, 14, 14), "r": (66, 34, 60, 0)},
                  hands="fist")
    stride, arm_swing, jump, run_lean = 34, 0, 0.16, -14
    target_px = 120
    squig_size = 0.68
    FRONT, BEHIND, SIDE = -0.62, 0.72, 0.34      # the beast to one side in front, so chain and prod show

    def pose(self, name, i, n):
        p = super().pose(name, i, n)
        w = anim.wave(i / n)
        turn = math.sin(math.pi * i / (n - 1))
        squig = dict(at=(-self.SIDE, self.FRONT, 0), jaw=8 + 14 * w["breath"])
        p.update(_at=(self.SIDE, self.BEHIND, 0.0), _poke=0.0)
        if name == "idle":           # the beast strains to one side, then the other; he leans back and jabs it straight
            squig.update(turn=14 * (1 if w["s1"] > 0 else -1))
            p.update(_poke=0.16 * w["up"], twist=-6 * (1 if w["s1"] > 0 else -1))
        elif name == "run":
            bound = abs(w["s1"])
            squig.update(at=(-self.SIDE, self.FRONT - 0.1, 0.3 * bound), leg=45 * bound, arm=-25 * bound, jaw=18)
            p.update(arms=dict(self.stance["arms"]), hands="fist")
        elif name == "cheer":
            squig.update(at=(-self.SIDE, self.FRONT, 0.22 * w["up"]), jaw=30 * w["up"], leg=30 * w["up"])
            p.update(arms=dict(self.stance["arms"], r=(150, 20, 16, 0)), hands="fist", _raise=1.0)
        elif name == "fall":
            t = min(1, i / (n - 2))
            squig.update(over=180 * t, jaw=20, leg=40 * t, arm=-30 * t)
            p.update(_loose=min(1.0, t * 1.5), _at=(self.SIDE, self.BEHIND - 0.1, 0.16 * t))
        else:                        # block / pass: the beast is let out on its chain and bites
            squig.update(at=(-self.SIDE, self.FRONT - 0.3 * turn, 0.12 * turn), jaw=38 * turn, leg=25 * turn, arm=-30 * turn)
            p.update(arms=dict(self.stance["arms"], l=(80, 14, 8, 0)), hands="fist", _poke=0.25 * turn, shift=0.0, lean=-6)
        p["_squig"] = squig
        return p

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        gob_face(J, L, tag, ears=0.9, nose=0.24)
        tall_hood(J, tag, L.get("hood"))
        if L.get("rags"):
            core.skirt(J, P, L, tag, L["rags"], (-178, 178), pose.get("flare", 0.1), "kit2", lining="kit2", jag=0.5, top=0.08)
        gl, gr = J["grip_l"][0], J["grip_r"][0]
        ring = self.on_beast(0, 0.14, 1.12)
        self.chain(tag, gl, ring, 0.1 + 0.1 * pose.get("_loose", 0.0))
        ball_at(tag + "ring", ring, 0.07, "metal")
        loose = pose.get("_loose", 0.0)
        aim = (self.on_beast(0.5, -0.1, 1.0) - gr).normalized()
        if pose.get("_raise"):
            aim = (UP - J["F"] * 0.1 + J["X"] * 0.25).normalized()
        aim = aim.lerp(Vector((0.9, 0.2, -0.1)), loose).normalized()
        grip = gr + aim * pose.get("_poke", 0.0)
        tip = grip + aim * 1.15
        tube(tag + "prod", [grip - aim * 0.85, tip], [0.042, 0.034], "wood", n=6)
        side = aim.cross(UP).normalized()
        for k in (-1, 1):            # a forked iron end
            flat_cone(tag + "fork%d" % k, tip - aim * 0.05, tip + aim * 0.2 + side * k * 0.09, 0.05, "metal", UP, 0.4)
        tube(tag + "prodtie", [tip - aim * 0.16, tip - aim * 0.05], [0.05, 0.05], "kit1", n=6)


@register
class SquigHopper(SquigCrew):
    """A goblin bouncing along astride a cave beast, hauling on reins tied through its jaw."""
    key = "squig_hopper"
    layout = dict(GOB, wraps="leather", neckband="kit2", helm="skull", helm_mat="metal", helmspike="metal")
    stance = dict(lean=4, legs={"l": (62, 56, 78), "r": (62, 56, 78)}, arms={"l": (22, 18, 84, -6), "r": (22, 18, 84, -6)},
                  hands="fist")
    jump = 0.3
    target_px = 114
    squig_size = 0.88
    skip = ("ridge1", "ridge2")      # where he sits
    SEAT = 1.06

    def pose(self, name, i, n):
        p = super().pose(name, i, n) if name == "fall" else dict(self.stance)
        w = anim.wave(i / n)
        turn = math.sin(math.pi * i / (n - 1))
        squig = dict(at=(0, 0, 0), jaw=8)
        if name == "idle":           # the beast pants and shuffles; he looks about and tugs the reins
            squig.update(jaw=6 + 14 * w["breath"])
            p.update(look=22 * w["s1"], lean=4 - 4 * w["breath"])
        elif name == "run":
            bound = math.sin(math.pi * i / n)
            squig.update(leg=55 * bound, arm=-28 * bound, jaw=16, at=(0, 0, 0))
            p.update(hop=0.55 * bound, lean=4 + 14 * bound, _action=True, pitch=-8 * math.cos(math.pi * i / n) * bound)
        elif name == "cheer":
            squig.update(leg=35 * w["up"], arm=-40 * w["up"], jaw=32 * w["up"])
            p.update(hop=0.3 * w["up"], arms=dict(self.stance["arms"], r=(160, 24, 14, 0)), lean=-2)
        elif name != "fall":
            squig.update(jaw=38 * turn, leg=25 * turn, arm=-30 * turn)
            p.update(shift=0.22 * turn, lean=4 + 22 * turn, hop=0.14 * turn)
        seat = Vector((0, 0.16, self.SEAT * self.squig_size - self.hips(p)))
        if name == "fall":           # the beast rolls over and throws him off behind it
            t = min(1, i / (n - 2))
            squig.update(at=(0, -0.45 * t, 0), over=180 * t, jaw=20, leg=40 * t, arm=-30 * t)
            seat = seat.lerp(Vector((0, 0.5, 0.18)), min(1, t * 1.4))
            p["_loose"] = min(1.0, t * 1.5)
        p.update(_at=tuple(seat), _squig=squig)
        return p

    def hips(self, pose):
        return core.skeleton(self.proportions(self.make_layout(pose)), pose)["pelvis"].z

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        gob_face(J, L, tag, ears=0.95)
        tall_hood(J, tag, L.get("hood"))
        c, X, F, U, s = sf.hf(J)
        if L.get("helmspike"):
            cone(tag + "helmspike", c + U * s[2] * 1.05, c + U * (s[2] * 1.05 + 0.26), 0.07, L["helmspike"], 6)
        tband(tag + "hem", J, P, [0.0, 0.07], "kit2", k=1.05, add=0.012, solid=0.03)
        if pose.get("_loose", 0.0) < 0.3:
            for side, sd in (("l", -1), ("r", 1)):
                grip, bit = J["grip_" + side][0], self.on_beast(sd * 0.5, -0.5, 0.72)
                mid = grip.lerp(bit, 0.5) - UP * 0.04
                tube(tag + "rein" + side, [grip, mid, bit], [0.03, 0.03, 0.03], "kit2", n=5)
                ball_at(tag + "bit" + side, bit, 0.06, "metal")
