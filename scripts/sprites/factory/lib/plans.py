"""Body plans. A model is a subclass of one of these, registered with lib.register().

    Model      base class: key, pose(anim, i, n), build(pose)
    Biped      everything on two legs; races are proportion presets (RACES)
    Quadruped  four-legged animals (fox, boar)
    Centaur    quadruped body with a biped torso mounted on the front
    Vehicle    wheeled machine with an optional driver (deathroller, pump wagon)
    Floating   legless hovering biped in a robe (wraith)

build() creates meshes under core.ROOT[0], in metres, standing on z = 0 at the origin and facing -Y.
Overall size never matters: the renderer scales every model so its idle height matches today's sprite.
"""
import copy, math
import bpy
from mathutils import Vector, Matrix
from . import core, anim, parts
from .core import D, UP, lerp, basis, ellipsoid, ball_at, cone, flat_cone, box, tube, loft, tband, surf

class Model:
    key = None               # the game's model key, e.g. "thrall"
    plan = "model"
    height = 1.0             # target idle height as a factor of today's sprite (keep within 0.9 .. 1.1)
    lie = 0.2                # metres the figure is lifted when lying down (about half its body depth)
    lie_shift = 0.75         # metres it slides forward while falling, so the lying body stays on its square
    ref_frame = 128          # frame size of a model with no reference sprite; a big one needs more
    animations = dict(anim.ANIMS)

    def unlined(self):
        """Parts whose darkest pixels get no inner line."""
        return ()

    def pose(self, name, i, n):
        raise NotImplementedError

    def build(self, pose):
        raise NotImplementedError

    def idle(self, ph, pose, w):
        """Idle personality hook. ph is the loop phase in [0, 1); pose is the default idle pose, which you
        may change in place (or return a new one); w holds periodic helpers from anim.wave():
        w["s1"], w["c1"], w["s2"] (sines), w["up"], w["dn"] (half waves), w["breath"] (0 or 1).
        Use only periodic terms so frame 7 flows into frame 0, and prefer two-state changes for large
        body parts so pixels hold still."""
        return pose

# ---------------------------------------------------------------------------- biped
# Proportion knobs (all factors relative to a human, default 1):
#   legs, arms        limb length          limb, arm      thickness (arm is on top of limb)
#   shoulders, torso  width, bulk          belly          extra girth below the chest
#   torso_len         torso height         head           head size        hands, feet   size
#   hips              hip width            neck           neck thickness
#   hunch             forward stoop in degrees            head_fwd         head pushed forward (metres)
#   digi              True = digitigrade legs (thigh forward, shin back, long foot)
# "L" entries are default layout keys for the race (skin, head kind, ears, eyes ...).
RACES = {
    "human": dict(L=dict(skin="skin_human", eyes="dark", ears="human", hair="short", hair_mat="hair_brown", brow="hair_brown", lip="lip_h")),
    "elf": dict(legs=1.08, limb=0.85, shoulders=0.9, torso=0.9, L=dict(skin="skin_elf", eyes="dark", ears="pointed", hair="long", hair_mat="hair_blond", brow="hair_blond", lip="lip_h")),
    "dwarf": dict(legs=0.55, arms=0.85, limb=1.25, shoulders=1.15, torso=1.2, torso_len=0.9, head=1.15, L=dict(skin="skin_fair", eyes="dark", ears="human", hair=None, beard="hair_red", brow="hair_red", lip="lip_h")),
    "halfling": dict(legs=0.5, arms=0.75, torso=1.1, belly=1.25, torso_len=0.75, head=1.2, L=dict(skin="skin_fair", eyes="dark", ears="human", hair="short", hair_mat="hair_brown", brow="hair_brown", lip="lip_h")),
    "gnome": dict(legs=0.45, arms=0.7, limb=0.95, torso_len=0.7, head=1.25, L=dict(skin="skin_fair", eyes="dark", ears="pointed", hair=None, beard="hair_white", brow="hair_white", lip="lip_h")),
    "goblin": dict(legs=0.6, arms=0.95, limb=0.8, shoulders=0.9, torso=0.85, torso_len=0.75, head=1.2, hunch=8, L=dict(skin="skin_goblin", eyes="red", ears="big", hair=None, brow="socket", lip="skin_goblin", fangs=True)),
    "snotling": dict(legs=0.45, arms=0.8, limb=0.7, torso=0.75, torso_len=0.6, head=1.3, L=dict(skin="skin_goblin", eyes="red", ears="big", hair=None, brow="socket", lip="skin_goblin")),
    "orc": dict(legs=0.9, arms=1.1, limb=1.3, shoulders=1.25, torso=1.2, head=1.05, hunch=8, L=dict(skin="skin_orc", eyes="red", ears="pointed", hair=None, brow="socket", lip="skin_orc", tusks=True)),
    "black_orc": dict(legs=0.9, arms=1.12, limb=1.45, shoulders=1.35, torso=1.3, head=1.0, hunch=8, L=dict(skin="skin_orc", eyes="red", ears="pointed", hair=None, brow="socket", lip="skin_orc", tusks=True)),
    "ogre": dict(legs=0.85, arms=1.1, limb=1.6, shoulders=1.3, torso=1.5, belly=1.4, head=0.95, hands=1.2, L=dict(skin="skin_ogre", eyes="dark", ears="human", hair=None, brow="hair_brown", lip="lip_h")),
    "troll": dict(legs=0.8, arms=1.3, limb=1.5, shoulders=1.3, torso=1.35, belly=1.2, hunch=14, hands=1.4, L=dict(skin="skin_troll", eyes="red", ears="big", hair=None, brow="socket", lip="skin_troll", fangs=True)),
    "minotaur": dict(digi=True, arms=1.15, limb=1.5, shoulders=1.4, torso=1.3, hunch=12, head=1.1, hands=1.2, L=dict(skin="fur_brown", head="snout", snout=(1.0, 1.1), ears="bull", horns="bull", eye_mat="eye", claws=None)),
    "rat_ogre": dict(digi=True, arms=1.25, limb=1.4, shoulders=1.3, torso=1.2, hunch=22, head=1.05, hands=1.3, L=dict(skin="fur_grey", head="snout", snout=(1.25, 0.8), ears="rat", fangs=True, tail=dict(len=1.1, r=0.07, mat="skin_rat"), claws=0.12)),
    "skaven": dict(digi=True, legs=0.95, limb=0.8, shoulders=0.85, torso=0.85, hunch=14, L=dict(skin="fur_brown", head="snout", snout=(1.25, 0.75), ears="rat", tail=dict(len=0.9, r=0.045, mat="skin_rat"))),
    "saurus": dict(limb=1.25, shoulders=1.15, torso=1.15, hunch=12, L=dict(skin="skin_lizard", head="snout", snout=(1.3, 1.0), fangs=True, eye_mat="eye_yellow", tail=dict(len=0.9, r=0.13, mat="skin_lizard", up=0.05), claws=0.08)),
    "skink": dict(legs=0.7, limb=0.7, torso=0.75, torso_len=0.8, hunch=12, head=1.1, L=dict(skin="skin_lizard", head="snout", snout=(1.1, 0.8), eye_mat="eye_yellow", crest="kit1", tail=dict(len=0.7, r=0.07, mat="skin_lizard", up=0.1))),
    "kroxigor": dict(arms=1.2, limb=1.6, shoulders=1.4, torso=1.4, hunch=18, hands=1.3, L=dict(skin="skin_lizard", head="snout", snout=(1.5, 1.1), fangs=True, eye_mat="eye_yellow", tail=dict(len=1.2, r=0.18, mat="skin_lizard", up=0.05), claws=0.1)),
    "beastman": dict(digi=True, limb=1.1, hunch=8, L=dict(skin="fur_brown", head="snout", snout=(0.9, 0.85), ears="bull", horns="goat")),
    "skeleton": dict(limb=0.55, torso=0.7, shoulders=0.95, L=dict(skin="bone_old", head="skull", eye_mat="eye_green")),
    "zombie": dict(hunch=12, head_fwd=0.05, L=dict(skin="skin_zombie", eyes="dark", ears="human", hair=None, brow="socket", lip="skin_zombie")),
    "mummy": dict(limb=1.25, shoulders=1.15, torso=1.1, L=dict(skin="bandage", head="skull", eye_mat="eye_yellow")),
    "ghoul": dict(hunch=18, limb=0.85, arms=1.15, head_fwd=0.05, L=dict(skin="skin_ghoul", eyes="red", ears="pointed", hair=None, brow="socket", lip="skin_ghoul", fangs=True, claws=0.1)),
    "wight": dict(limb=0.8, torso=0.9, L=dict(skin="bone_old", head="skull", eye_mat="eye_green")),
    "flesh_golem": dict(arms=1.15, limb=1.45, shoulders=1.3, torso=1.3, hands=1.2, L=dict(skin="skin_golem", eyes="dark", ears="human", hair=None, brow="socket", lip="skin_golem")),
    "werewolf": dict(digi=True, arms=1.15, limb=1.2, shoulders=1.15, hunch=18, L=dict(skin="fur_grey", head="snout", snout=(1.2, 0.9), ears="wolf", fangs=True, eye_mat="eye_yellow", tail=dict(len=0.7, r=0.1, mat="fur_grey", up=0.3), claws=0.1)),
    "yhetee": dict(arms=1.2, limb=1.6, shoulders=1.35, torso=1.4, hunch=12, hands=1.3, L=dict(skin="fur_white", head="snout", snout=(0.7, 1.1), fangs=True, eye_mat="eye", claws=0.1)),
    "treeman": dict(legs=0.8, arms=1.3, limb=1.7, shoulders=1.4, torso=1.5, hands=1.4, feet=1.3, L=dict(skin="bark", eyes="dark", ears=None, hair=None, brow="socket", lip="bark")),
}

DEFAULT_STANCE = dict(lean=4, legs={"l": (5, 9, 8), "r": (-4, 9, 8)}, arms={"l": (8, 22, 30), "r": (8, 22, 30)},
                      hands="relaxed")

# per torso ring from the hips up: (width, depth, shift back)
ATHLETE = {"m": ((0.96, 1.04, 0.01), (0.84, 0.92, 0.0), (0.98, 1.06, -0.005), (1.08, 1.14, -0.01), (1.12, 1.06, 0.0), (1.0, 1.0, 0.0)),
           "f": ((1.16, 1.22, 0.035), (0.7, 0.78, 0.0), (0.9, 0.96, 0.0), (0.98, 1.0, 0.0), (0.98, 1.0, 0.0), (1.0, 1.0, 0.0))}

class Biped(Model):
    """Two-legged figure built from the approved concept's body, costume and face parts.

    Class attributes a model sets:
      race          key of RACES (proportion preset + default layout)
      sex           "m" or "f" (f: narrower shoulders and waist, lighter limbs and neck)
      knobs         dict of proportion knobs overriding the race preset
      layout        dict of layout keys (materials and gear switches, see README)
      stance        the idle pose every animation starts from
      stride, arm_swing, run_lean, jump   animation feel (smaller for heavy models)
    Hooks: idle(ph, pose, w), extras(J, P, L, tag, pose), adjust(name, i, pose).
    """
    plan = "biped"
    race = "human"
    sex = "m"
    knobs = {}
    layout = {}
    stance = DEFAULT_STANCE
    stride, arm_swing, run_lean, jump = 38, 32, 14, 0.2
    mount = None             # (forward metres, height metres): put the pelvis there instead of on its legs

    def unlined(self):
        """A black line round a woman's chin reads as a beard, and round a man's chest as breasts."""
        return ("chin", "neck", "head") if self.sex == "f" else ("pec-1", "pec1")

    def pose(self, name, i, n):
        p = anim.BIPED[name](self, i, n)
        q = self.adjust(name, i, p)
        return q if q is not None else p

    def adjust(self, name, i, pose):
        """Change any animation's pose for this model (called for every frame)."""
        return pose

    def extras(self, J, P, L, tag, pose):
        """Add model-specific parts (called last). J is the joint dict, P the proportions, L the layout."""

    # -- proportions and layout
    def knob(self, name, default=1.0):
        return self.knobs.get(name, RACES[self.race].get(name, default))

    def proportions(self, L):
        k = self.knob
        fem = self.sex == "f"
        P = copy.deepcopy(core.HUMAN)
        legs, arms, tl = k("legs"), k("arms"), k("torso_len")
        P["thigh"] *= legs; P["shin"] *= legs
        P["uarm"] *= arms; P["farm"] *= arms
        P["hand"] *= k("hands"); P["foot"] *= k("feet"); P["hip_w"] *= k("hips") * (0.6 + 0.4 * k("torso"))
        sw = k("shoulders") * (0.87 if fem else 1.0)
        waist = 0.85 if fem else 1.0
        tk, belly = k("torso"), k("belly")
        shaped = belly <= 1 or (fem and self.race == "ogre")
        if fem and shaped:
            belly = min(belly, 1.12)
        P["sh_h"] *= tl
        P["neck_h"] = P["sh_h"] + 0.085
        P["head_h"] = P["neck_h"] + 0.245 * (0.6 + 0.4 * k("head"))
        P["sh_w"] *= sw * (0.5 + 0.5 * tk)
        P["torso"] = [(h * tl, rx * tk * (sw if h > 0.2 else waist * belly if h > 0 else belly),
                       ry * tk * ((1 + (sw - 1) * 0.5) if h > 0.2 else waist * belly), b) for h, rx, ry, b in P["torso"]]
        if shaped:                   # athletes: a narrow waist under a full chest, and curved hips
            P["torso"] = [(h, rx * shape[0], ry * shape[1], b + shape[2])
                          for (h, rx, ry, b), shape in zip(P["torso"], ATHLETE["f" if fem else "m"])]
        P["bust"] = fem and self.race not in ("halfling", "gnome")
        P["hunch"] = k("hunch", 0) + L.get("hunch", 0)
        P["head_fwd"] = k("head_fwd", 0.0)
        if k("digi", False):
            P.update(digi=True, thigh=0.44 * legs, shin=0.4 * legs, meta=0.4 * legs, ankle=0.07, foot=0.26 * k("feet"))
        return P

    def make_layout(self, pose):
        L = dict(RACES[self.race].get("L", {}))
        L.update(self.layout)
        L.update(pose.get("layout", {}))
        k = self.knob
        fem = self.sex == "f"
        L.update(sex=self.sex, _action=bool(pose.get("_action")), hand_modes=pose.get("hand_modes", {}))
        L["limb"] = k("limb") * (0.93 if fem else 1.0)
        L["arm"] = k("arm") * (0.92 if fem else 1.0)
        L["neck"] = k("neck") * (0.82 if fem else 1.0) * (0.7 + 0.3 * k("limb"))
        L["head_scale"] = k("head") * (0.96 if fem else 1.0)
        L.setdefault("torso", L["skin"]); L.setdefault("arms", L["torso"]); L.setdefault("legs", "trouser")
        return L

    def build(self, pose):
        L = self.make_layout(pose)
        P = self.proportions(L)
        J = core.skeleton(P, pose)
        tag = self.key + "_"
        root = core.ROOT[0]
        if self.mount:
            sub = bpy.data.objects.new(tag + "mount", None)
            bpy.context.collection.objects.link(sub)
            sub.parent = root
            sub.location = (0, -self.mount[0], self.mount[1] - J["pelvis"].z)
            core.ROOT[0] = sub
        try:
            self.dress(J, P, L, tag, pose)
            self.extras(J, P, L, tag, pose)
        finally:
            core.ROOT[0] = root
        return J

    def dress(self, J, P, L, tag, pose):
        """Body, head, costume and race parts, all driven by the layout."""
        core.body(J, P, L, tag, pose)
        core.helmet(J, L, tag)
        flare = pose.get("flare", 0.06)
        coat = L.get("coat")
        cm = L.get("coat_mat", L["torso"])
        if coat == "frock":
            core.skirt(J, P, L, tag, 0.62, (-176, 176), flare, cm)
        elif coat == "tails":
            core.skirt(J, P, L, tag, 0.74, (-62, 62), flare + 0.12, cm)
        elif coat == "gambeson":
            core.skirt(J, P, L, tag, 0.32, (-178, 178), flare * 0.4, cm, lining=cm)
        elif coat == "robe":
            core.skirt(J, P, L, tag, L.get("robe_len", 1.0), (-178, 178), flare, cm, lining=L.get("robe_lining", cm),
                       jag=L.get("jag", 0.0))
        if L.get("lapels"):
            core.lapels(J, P, L, tag)
        if L.get("tabard"):
            core.panel(J, P, tag, True, 0.6, 0.13, L["tabard"], flare, trim=L.get("tabard_trim"))
            core.panel(J, P, tag, False, 0.6, 0.14, L["tabard"], flare, trim=L.get("tabard_trim"))
        if L.get("loin"):
            core.panel(J, P, tag, True, 0.42, 0.12, L["loin"], flare, trim=L.get("loin_trim"), top=0.03)
            core.panel(J, P, tag, False, 0.45, 0.14, L["loin"], flare, trim=L.get("loin_trim"), top=0.03)
        if L.get("jersey"):
            tband(tag + "jersey", J, P, [0.08, 0.22, 0.36, P["sh_h"], P["sh_h"] + 0.04], L["jersey"], k=1.05, add=0.015, solid=0.03)
            core.cups(J, P, tag + "jersey", L["jersey"], off=0.02)
        if L.get("shorts"):
            tband(tag + "shorts", J, P, [-0.085, 0.0, 0.1], L["shorts"], k=1.07, add=0.012, solid=0.03)
        if L.get("breast"):
            core.breastplate(J, P, L, tag)
        if L.get("gorget"):
            core.gorget(J, P, L, tag)
        if L.get("neckband"):
            tband(tag + "neckband", J, P, [P["sh_h"], P["sh_h"] + 0.06, P["sh_h"] + 0.11], L["neckband"], k=1.0, add=0.03, solid=0.03)
        if L.get("belt"):
            core.belt(J, P, L, tag, mat=L["belt"], buckle=L.get("buckle", "gold"))
        if L.get("collar"):
            core.collar(J, P, L, tag, mat=(L.get("collar_mat", "kit2"), L.get("collar_lining", "lining")))
        if L.get("cape"):
            core.cape(J, P, L, tag, {"long": 1.2, "short": 0.66}[L["cape"]], pose.get("cape", 0.0),
                      mats=(L.get("cape_mat", "kit2"), L.get("cape_lining", "lining")))
        core.pauldrons(J, P, L, tag)
        if L.get("tail"):
            parts.tail(J, P, L, tag, pose)
        if L.get("horns"):
            parts.horns(J, L, tag)
        if L.get("tusks"):
            parts.tusks(J, L, tag)
        if L.get("beard"):
            parts.beard(J, L, tag)
        if L.get("wings"):
            for sd in (-1, 1):
                core.wing(J, P, L, tag, sd, bool(pose.get("wings")))

# ---------------------------------------------------------------------------- quadruped
class Quadruped(Model):
    """Four-legged animal. Attributes: body=(length, radius), leg_len, leg_r, neck, skin, belly_mat,
    head layout (same keys as the snout head: snout, ears, fangs, eye_mat, horns, tusks),
    tail (dict as in parts.tail), coat=material of a kit blanket over the back, collar=material.
    Pose keys: legs4 = (front-left, front-right, back-left, back-right) swing degrees, nod, jaw, tail,
    plus the whole-figure keys (pitch < 0 rears up, hop, roll, shift)."""
    plan = "quadruped"
    body = (0.95, 0.27)
    leg_len, leg_r = 0.5, 0.07
    skin = "fur_brown"
    belly_mat = None
    head = dict(snout=(1.1, 0.9), ears="wolf")
    head_size = 0.2
    tail = dict(len=0.6, r=0.08)
    coat, collar = "kit1", "kit2"
    headless = False         # True: body, legs and tail only (used by Centaur)
    lie = 0.25
    lie_shift = 0.0

    def pose(self, name, i, n):
        w = anim.wave(i / n)
        s1, c1 = w["s1"], w["c1"]
        if name == "idle":
            p = dict(legs4=(0, 0, 0, 0), nod=4 * w["breath"], tail=w["s1"])
            out = self.idle(i / n, p, w)
            return out if out is not None else p
        if name == "run":
            return dict(legs4=(40 * s1, 40 * c1, -40 * c1, -40 * s1), hop=0.06 * max(0, w["s2"]), nod=-6, tail=0.4 * s1)
        if name == "cheer":
            return dict(legs4=(30 * w["up"], 30 * w["up"], 0, 0), pitch=-22 * w["up"], hop=0.1 * w["up"], jaw=30 * w["up"],
                        tail=w["s2"])
        if name == "fall":
            return anim.keyframes([(0, dict(legs4=(0, 0, 0, 0))), (3, dict(legs4=(20, -20, 15, -15), roll=50, hop=0.04)),
                                   (5, dict(legs4=(30, 10, 25, 5), roll=90)), (7, dict(legs4=(25, 5, 20, 0), roll=90))], i * 7.0 / (n - 1))
        lunge = dict(legs4=(35, 35, -30, -30), shift=0.2, nod=-18, jaw=(30 if name == "pass" else 5))
        return anim.keyframes([(0, dict(legs4=(0, 0, 0, 0))), (1, dict(legs4=(-15, -15, 10, 10), shift=-0.05)), (3, lunge),
                               (4, lunge), (7, dict(legs4=(0, 0, 0, 0)))], i * 7.0 / (n - 1))

    def build(self, pose):
        tag = self.key + "_"
        ln, r = self.body
        X, F, B = Vector((1, 0, 0)), Vector((0, -1, 0)), Vector((0, 1, 0))
        h = self.leg_len + r * 0.8
        c = Vector((0, 0, h))
        skin = self.skin
        rings = [(c + B * (ln * t), X, UP, r * k, r * k2) for t, k, k2 in
                 ((-0.55, 0.55, 0.6), (-0.4, 0.95, 1.0), (0.0, 1.0, 1.0), (0.35, 0.95, 0.95), (0.55, 0.5, 0.55))]
        loft(tag + "body", rings, skin, n=12)
        if self.belly_mat:
            ellipsoid(tag + "belly", c - UP * r * 0.35, (r * 0.8, ln * 0.4, r * 0.75), self.belly_mat)
        if self.coat:      # team blanket over the back and flanks
            loft(tag + "coat", [(c + B * (ln * t), X, UP, r * 1.08, r * 1.08) for t in (-0.22, 0.0, 0.22)], self.coat, n=12,
                 arc=(-115, 115), caps=False, subsurf=1, solidify=0.03)
        swings = pose.get("legs4", (0, 0, 0, 0))
        for i, (sx, fy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
            hip = c + X * sx * r * 0.7 + B * (fy * ln * 0.36) - UP * r * 0.3
            a = D(swings[i])
            d = Vector((0, -math.sin(a), -math.cos(a)))
            knee = hip + d * self.leg_len * 0.5
            foot = knee + Vector((0, -math.sin(a * 0.4), -math.cos(a * 0.4))) * self.leg_len * 0.55
            foot.z = max(foot.z, 0.04)
            tube(tag + "leg%d" % i, [hip, knee, foot], [self.leg_r * 1.5, self.leg_r, self.leg_r * 0.8], skin, n=8)
            ball_at(tag + "paw%d" % i, foot + F * 0.02, self.leg_r * 1.2, getattr(self, "paw_mat", skin))
        J = {"pelvis": c + B * ln * 0.5, "B": B, "X": X, "F": F, "u": UP}
        if self.headless:
            if self.tail:
                parts.tail(J, {}, dict(skin=skin, tail=self.tail), tag, pose)
            self.extras(J, tag, pose, c)
            return J
        nod = D(pose.get("nod", 0))
        neck = c + F * ln * 0.5 + UP * r * 0.3
        hc = neck + F * (0.12 + self.head_size * 0.6) + UP * (0.12 - math.sin(nod) * 0.1)
        tube(tag + "neck", [neck - F * 0.05, hc], [r * 0.7, self.head_size * 0.8], skin, n=10)
        if self.collar:
            tube(tag + "collar", [lerp(neck, hc, 0.3), lerp(neck, hc, 0.55)], [r * 0.72, r * 0.68], self.collar, n=10)
        hf = (F * math.cos(nod) - UP * math.sin(nod)).normalized()
        R = basis(X, hf, X.cross(hf) * -1)
        s = (self.head_size, self.head_size * 1.1, self.head_size * 0.95)
        ellipsoid(tag + "head", hc, s, skin, R)
        J.update(head=hc, head_R=R, head_s=s)
        L = dict(self.head, skin=skin)
        parts.snout_head(J, {}, L, tag, pose)
        if L.get("horns"):
            parts.horns(J, L, tag)
        if L.get("tusks"):
            parts.tusks(J, L, tag)
        if self.tail:
            parts.tail(J, {}, dict(skin=skin, tail=self.tail), tag, pose)
        self.extras(J, tag, pose, c)
        return J

    def extras(self, J, tag, pose, centre):
        """Add model-specific parts (a barrel, a saddle ...). centre is the middle of the body."""

# ---------------------------------------------------------------------------- centaur
class Centaur(Biped):
    """A quadruped body with a biped torso on the front. Set `horse` attributes through the nested
    Quadruped subclass `Body` (skin, body, leg_len, tail, coat ...); the torso is a normal Biped layout."""
    plan = "centaur"
    lie = 0.3
    lie_shift = 0.0
    jump = 0.1

    class Body(Quadruped):
        headless = True
        collar = None
        body = (1.0, 0.3)
        leg_len, leg_r = 0.6, 0.09

    def pose(self, name, i, n):
        p = super().pose(name, i, n)
        q = self.Body.pose(self._body(), name, i, n)
        for k in ("legs4", "hop", "roll", "shift", "tail"):
            if k in q:
                p[k] = q[k]
        if name == "fall":
            p.pop("pitch", None)       # a centaur tips onto its side rather than its back
        p["legs"] = {"l": (0, 6, 0), "r": (0, 6, 0)}
        p.pop("feet", None)
        return p

    def _body(self):
        b = self.Body()
        b.key = self.key + "_body"
        return b

    def build(self, pose):
        b = self._body()
        ln, r = b.body
        Quadruped.build(b, pose)
        self.layout = dict(self.layout, no_legs=True)
        self.mount = (ln * 0.42, b.leg_len + r * 1.3)
        return super().build(pose)

# ---------------------------------------------------------------------------- vehicle
class Vehicle(Model):
    """Wheeled machine. Attributes: size=(width, length, height) of the chassis, drum=(radius, width) for
    a front roller (or None), wheels=radius of the rear wheels, hull/trim/roof materials, funnel=True.
    `driver` may be a Biped subclass; its torso is mounted on the chassis and animated with the biped
    animations. Pose keys: spin (degrees of wheel rotation), puff (0..1 smoke), plus whole-figure keys."""
    plan = "vehicle"
    size = (0.9, 1.3, 0.55)
    drum = (0.42, 1.0)
    wheels = 0.3
    hull, trim, roof = "kit1", "kit2", "darkmetal"
    funnel = True
    driver = None
    driver_at = (0.1, 0.75)       # (forward, height) of the driver's pelvis
    lie = 0.45
    lie_shift = 0.0

    def pose(self, name, i, n):
        w = anim.wave(i / n)
        base = dict(spin=0, puff=(i % 4) / 4.0)
        if self.driver:
            d = self._driver()
            base["driver"] = anim.BIPED[name if name != "fall" else "cheer"](d, i, n)
            base["driver"].pop("hop", None)
        if name == "idle":
            base.update(hop=0.02 * w["breath"])
            out = self.idle(i / n, base, w)
            return out if out is not None else base
        if name == "run":
            base.update(spin=45.0 * i, hop=0.03 * (i % 2), shift=0.0)
        elif name == "cheer":
            base.update(hop=0.08 * w["up"], spin=20 * w["s1"])
        elif name == "fall":
            base.update(anim.keyframes([(0, dict(roll=0)), (2, dict(roll=25, hop=0.05)), (5, dict(roll=90)), (7, dict(roll=90))],
                                       i * 7.0 / (n - 1)))
            base["spin"] = 30.0 * i
        else:
            base.update(anim.keyframes([(0, dict(shift=0)), (1, dict(shift=-0.08)), (3, dict(shift=0.25)), (4, dict(shift=0.25)),
                                        (7, dict(shift=0))], i * 7.0 / (n - 1)))
            base["spin"] = 30.0 * i
        return base

    def _driver(self):
        d = self.driver()
        d.key = self.key + "_driver"
        d.layout = dict(d.layout, no_legs=True)
        d.mount = self.driver_at
        return d

    def build(self, pose):
        tag = self.key + "_"
        wd, ln, ht = self.size
        X, F = Vector((1, 0, 0)), Vector((0, -1, 0))
        wr = self.wheels
        base = wr * 1.1
        c = Vector((0, 0.1, base + ht / 2))
        box(tag + "hull", c, (wd, ln, ht), self.hull)
        box(tag + "trim", c + UP * (ht / 2), (wd * 1.06, ln * 1.04, 0.07), self.trim)
        box(tag + "skirt", c - UP * (ht / 2 - 0.04), (wd * 1.04, ln * 1.02, 0.08), self.roof)
        spin = D(pose.get("spin", 0))
        if self.drum:
            dr, dw = self.drum
            dc = Vector((0, -ln / 2 - dr * 0.55, dr))
            parts.cylinder(tag + "drum", dc - X * dw / 2, dc + X * dw / 2, dr, "metal", seg=14)
            for j in range(6):        # studs show the drum turning
                a = spin + j * math.pi / 3
                dd = Vector((0, math.sin(a), math.cos(a)))
                for sx in (-0.3, 0.3):
                    cone(tag + "stud%d%d" % (j, sx > 0), dc + X * dw * sx + dd * dr * 0.95, dc + X * dw * sx + dd * (dr + 0.1), 0.06, "darkmetal", 5)
            for sx in (-1, 1):
                tube(tag + "arm%d" % sx, [dc + X * sx * (dw / 2 + 0.04), c + X * sx * (wd / 2) - F * (-ln * 0.3)], [0.05, 0.06], self.roof, n=6)
        for sx in (-1, 1):
            wc = Vector((sx * (wd / 2 + 0.06), ln * 0.35, wr))
            parts.cylinder(tag + "wheel%d" % sx, wc - X * 0.06, wc + X * 0.06, wr, "wood", seg=12)
            ball_at(tag + "hub%d" % sx, wc + X * sx * 0.07, wr * 0.3, "brass")
            for j in range(4):
                a = spin + j * math.pi / 2
                dd = Vector((0, math.sin(a), math.cos(a)))
                ball_at(tag + "spoke%d%d" % (sx, j), wc + X * sx * 0.07 + dd * wr * 0.7, wr * 0.14, "darkmetal")
        if self.funnel:
            fb = c + UP * (ht / 2) + Vector((wd * 0.25, ln * 0.3, 0))
            parts.cylinder(tag + "funnel", fb, fb + UP * 0.5, 0.09, self.roof, seg=8)
            parts.cylinder(tag + "funnelrim", fb + UP * 0.46, fb + UP * 0.54, 0.12, self.trim, seg=8)
            pf = pose.get("puff", 0)
            ball_at(tag + "puff", fb + UP * (0.62 + 0.3 * pf), 0.07 + 0.08 * pf, "white")
        self.extras(tag, pose, c)
        if self.driver and "driver" in pose:
            self._driver().build(pose["driver"])

    def extras(self, tag, pose, centre):
        """Add model-specific parts. centre is the middle of the chassis box."""

# ---------------------------------------------------------------------------- floating
class Floating(Biped):
    """Legless biped in a long robe that hovers. Uses the biped layout; set layout["coat_mat"] for the robe.
    It glides instead of running and sinks into a heap instead of falling over."""
    plan = "floating"
    hover = 0.22
    jump = 0.25

    def pose(self, name, i, n):
        w = anim.wave(i / n)
        p = super().pose(name, i, n)
        p["legs"] = {"l": (0, 5, 0), "r": (0, 5, 0)}
        p.pop("feet", None)
        if name == "fall":
            t = i / float(n - 1)
            p.pop("pitch", None)
            p.update(lean=30 * min(1, t * 2), squash=1 - 0.72 * t, hop=self.hover * (1 - t), flare=0.5 * t)
        elif name == "run":
            p.update(lean=30, hop=self.hover + 0.04 * w["s2"], flare=0.7)
        else:
            p["hop"] = self.hover + p.get("hop", 0) + (0.05 * w["breath"] if name == "idle" else 0)
        return p

    def make_layout(self, pose):
        L = super().make_layout(pose)
        L.update(no_legs=True)
        L.setdefault("coat", "robe")
        L.setdefault("jag", 0.3)
        return L
