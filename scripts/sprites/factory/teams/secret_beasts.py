"""Secret League models, round one: apes, Slann frogs, were-beasts, sprites and elementals. Each one stands in
for the same kind of position on several teams (see src/data/community/secretLeagueModels.json)."""
import math
from mathutils import Vector
from lib import Biped, Floating, register, core, looks, palette
from lib.core import UP, ball_at, cone, ellipsoid, flat_cone, lerp, tband, tube
from teams import elves_common as ec

palette.ramp("slann_skin", "#1e4a3a", "#3a8a5a", "#7ac87a")
palette.ramp("slann_belly", "#8a7a3c", "#c8b866", "#ece09a")
palette.ramp("ape_face", "#3a2a22", "#6a5040", "#9a7a62")
palette.ramp("flame", "#a8321a", "#f07a1e", "#ffd24a")
palette.ramp("water", "#1a3a6a", "#2a6ab0", "#7ac0f0")
palette.ramp("gale", "#6a7a8a", "#a8c0d0", "#eaf6fa")
palette.ramp("wing_fey", "#5a7a8a", "#a0d0e0", "#e8f8ff")
core.HEADS.setdefault("blank", lambda J, P, L, tag, pose: None)


# ----------------------------------------------------------------------------- apes
class Ape(Biped):
    """Knuckle-walking ape: long arms, short bowed legs, a kit1 vest and kit2 wrist wraps."""
    race = "troll"
    knobs = dict(legs=0.62, arms=1.3, limb=1.25, shoulders=1.2, torso=1.15, hunch=24, head=0.95, hands=1.2, head_fwd=0.06)
    fur = "fur_black"
    layout = dict(head="snout", snout=(0.45, 1.1), ears="rat", ear_mat="ape_face", snout_mat="ape_face", eye_mat="eye_yellow",
                  fangs=False, legs="fur_black", boots="ape_face", cuff=None, wraps="kit2", belt=None)
    stance = dict(lean=18, legs={"l": (14, 16, 26), "r": (-6, 16, 20)}, arms={"l": (14, 26, 18), "r": (14, 26, 18)}, hands="fist")
    stride, arm_swing, jump = 36, 40, 0.22

    def make_layout(self, pose):
        L = super().make_layout(pose)
        L.update(skin=self.fur, arms=self.fur, legs=self.fur, torso="kit1")
        return L

    def idle(self, ph, p, w):       # bobs and beats its chest in turn
        k = w["up"]
        p.update(nod=-6 * w["breath"], arms={"l": (14 + 70 * k, 26, 18 + 90 * k), "r": (14 + 70 * w["dn"], 26, 18 + 90 * w["dn"])})

    def extras(self, J, P, L, tag, pose):
        tband(tag + "vest", J, P, [0.12, 0.3, P["sh_h"] - 0.04], "kit1", k=1.08, add=0.015, arc=(-130, 130))
        tband(tag + "vesthem", J, P, [0.1, 0.15], "kit2", k=1.1, add=0.02, arc=(-130, 130))


@register
class Bonobo(Ape):
    """The small, quick ape: black fur, slight build."""
    key = "ape_bonobo"
    knobs = dict(Ape.knobs, limb=1.0, shoulders=1.0, torso=0.95)
    target_px = 70


@register
class Chimpanzee(Ape):
    """A wiry black ape with big ears."""
    key = "ape_chimpanzee"
    knobs = dict(Ape.knobs, limb=1.1, shoulders=1.08)
    layout = dict(Ape.layout, snout=(0.6, 1.0))
    target_px = 76


@register
class Orangutan(Ape):
    """A heavy red ape with very long arms and cheek pads."""
    key = "ape_orangutan"
    fur = "fur_red"
    knobs = dict(Ape.knobs, arms=1.5, belly=1.2, shoulders=1.25)
    layout = dict(Ape.layout, legs="fur_red")
    target_px = 84

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        c, X, F, U, s = ec.hf(J)
        for sd in (-1, 1):
            ellipsoid(tag + "cheekpad%d" % sd, c + X * sd * s[0] * 1.05 + F * s[1] * 0.3, (s[0] * 0.45, s[1] * 0.2, s[2] * 0.6), "ape_face",
                      J["head_R"])


@register
class Gorilla(Ape):
    """A broad grey-black gorilla with a crested skull."""
    key = "ape_gorilla"
    fur = "fur_black"
    knobs = dict(Ape.knobs, limb=1.5, shoulders=1.4, torso=1.35)
    target_px = 100
    stride, jump = 30, 0.12


@register
class Silverback(Gorilla):
    """The biggest ape: a silver saddle down its back."""
    key = "ape_silverback"
    knobs = dict(Gorilla.knobs, limb=1.65, shoulders=1.55, torso=1.45)
    target_px = 118
    lie, lie_shift = 0.3, 1.0

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        tband(tag + "saddle", J, P, [0.05, 0.25, 0.42], "fur_white", k=1.1, add=0.02, arc=(-60, 60))


# ----------------------------------------------------------------------------- Slann
class Slann(Biped):
    """A frog-man on long springing legs: wide flat head, kit1 vest and kit2 belt, webbed feet."""
    race = "skink"
    knobs = dict(legs=1.05, digi=True, limb=0.85, torso=0.9, head=0.95, hunch=6)
    layout = dict(skin="slann_skin", head="snout", snout=(0.3, 2.1), ears="none", eye_mat="eye_yellow", snout_mat="slann_skin", nose_mat="slann_skin", crest=None,
                  torso="kit1", arms="slann_skin", legs="slann_skin", belt="kit2", buckle="gold", tail=None)
    stance = dict(lean=10, legs={"l": (24, 18, 50), "r": (24, 18, 50)}, arms={"l": (20, 26, 40), "r": (20, 26, 40)}, hands="open")
    stride, arm_swing, jump = 44, 30, 0.42
    target_px = 82

    def idle(self, ph, p, w):       # squats and springs on the spot, throat puffing
        k = w["breath"]
        p.update(hop=0.06 * k, legs={"l": (24 + 8 * k, 18, 50 - 20 * k), "r": (24 + 8 * k, 18, 50 - 20 * k)})

    def extras(self, J, P, L, tag, pose):
        c, X, F, U, s = ec.hf(J)
        ellipsoid(tag + "throat", c - U * s[2] * 0.62 + F * s[1] * 0.3, (s[0] * 0.75, s[1] * 0.55, s[2] * 0.35), "slann_belly", J["head_R"])
        for sd in (-1, 1):          # big eyes up on top of the wide head
            e = c + X * sd * s[0] * 0.62 + U * s[2] * 0.7 + F * s[1] * 0.4
            ellipsoid(tag + "bulge%d" % sd, e, (s[0] * 0.42, s[0] * 0.42, s[0] * 0.38), "slann_skin", J["head_R"])
            ellipsoid(tag + "frogeye%d" % sd, e + F * s[0] * 0.25 + U * s[0] * 0.05, (s[0] * 0.3, s[0] * 0.2, s[0] * 0.28), "eye_yellow",
                      J["head_R"])
            ball_at(tag + "pupil%d" % sd, e + F * s[0] * 0.42 + U * s[0] * 0.05, s[0] * 0.12, "socket")
        tube(tag + "mouth", [c + F * s[1] * 0.75 - U * s[2] * 0.3 + X * sd * s[0] * 0.8 for sd in (-1, 0, 1)], [0.02] * 3, "socket", n=5)


@register
class SlannLineman(Slann):
    key = "slann_lineman"


@register
class SlannCatcher(Slann):
    """Leaner, with kit2 wrist bands and longer legs."""
    key = "slann_catcher"
    knobs = dict(Slann.knobs, legs=1.18, limb=0.8)
    layout = dict(Slann.layout, wraps="kit2")
    target_px = 86


@register
class SlannBlitzer(Slann):
    """Heavier, with a kit2 shoulder pad."""
    key = "slann_blitzer"
    knobs = dict(Slann.knobs, limb=1.05, shoulders=1.1)
    layout = dict(Slann.layout, pads="leather", pad_mat="kit2", pad_trim="gold", pad_sides=("l",))


# ----------------------------------------------------------------------------- were-beasts
@register
class Werebear(Biped):
    """A hulking bear-man: round ears, short muzzle, kit1 harness, claws."""
    key = "werebear"
    race = "werewolf"
    knobs = dict(digi=False, legs=0.8, arms=1.15, limb=1.6, shoulders=1.4, torso=1.4, belly=1.15, hunch=18, head=1.05, hands=1.3)
    layout = dict(skin="fur_brown", head="snout", snout=(0.7, 1.15), ears="rat", ear_mat="fur_brown", fangs=True, eye_mat="eye",
                  legs="fur_brown", boots="fur_brown", cuff=None, claws=0.1, tail=None, belt="kit2", buckle="gold")
    stance = dict(lean=12, legs={"l": (8, 16, 12), "r": (-6, 16, 10)}, arms={"l": (20, 30, 40), "r": (20, 30, 40)}, hands="open")
    stride, jump = 28, 0.1
    target_px = 112
    lie, lie_shift = 0.3, 1.0

    def idle(self, ph, p, w):       # rears up and swipes the air
        p.update(lean=12 - 14 * w["up"], arms={"l": (20 + 60 * w["up"], 30, 40), "r": (20, 30, 40)})

    def extras(self, J, P, L, tag, pose):
        ec.torso_stripe(J, P, tag, "harness", [(0.1, 50), (0.3, 0), (P["sh_h"], -50)], "kit1", r=0.06, off=0.03)


@register
class Werecat(Biped):
    """A lean cat-man on springing legs: striped orange fur, long tail, kit1 shorts and a kit2 collar."""
    key = "werecat"
    race = "werewolf"
    knobs = dict(limb=0.95, shoulders=0.95, torso=0.9, hunch=10, head=0.95)
    layout = dict(skin="fur_red", head="snout", snout=(0.55, 0.85), ears="wolf", fangs=True, eye_mat="eye_green", legs="fur_red",
                  claws=0.08, tail=dict(len=0.95, r=0.07, mat="fur_red", up=0.5), shorts="kit1", neckband="kit2")
    stance = dict(lean=14, legs={"l": (16, 12, 30), "r": (-10, 12, 24)}, arms={"l": (30, 24, 50), "r": (30, 24, 50)}, hands="open")
    stride, arm_swing, jump = 46, 40, 0.34
    target_px = 92

    def extras(self, J, P, L, tag, pose):
        for i, h in enumerate((0.15, 0.27, 0.39)):
            ec.torso_stripe(J, P, tag, "stripe%d" % i, [(h, 70), (h + 0.03, 110), (h, 150)], "fur_black", r=0.025, off=0.01)
            ec.torso_stripe(J, P, tag, "stripeb%d" % i, [(h, -70), (h + 0.03, -110), (h, -150)], "fur_black", r=0.025, off=0.01)


# ----------------------------------------------------------------------------- sprites
@register
class Sprite(looks.Fine, Biped):
    """A tiny fey with dragonfly wings, a kit1 leaf tunic and kit2 sash; she flutters off the ground."""
    key = "sprite"
    race = "elf"
    sex = "f"
    knobs = dict(head=1.25, limb=0.8)
    layout = dict(skin="skin_elf", hair="short", hair_mat="elf_pink", brow="elf_pink", lip="lip_f", torso="kit1", arms="skin_elf",
                  legs="skin_elf", boots="kit2", cuff=None, belt="kit2")
    stance = dict(lean=6, legs={"l": (10, 6, 30), "r": (-4, 6, 40)}, arms={"l": (20, 36, 30), "r": (20, 36, 30)}, hands="open")
    stride, jump = 30, 0.4
    target_px = 52

    def pose(self, name, i, n):
        p = super().pose(name, i, n)
        if name != "fall":
            p["hop"] = p.get("hop", 0) + 0.25 + 0.05 * math.sin(2 * math.pi * i / n)
        p["_beat"] = i % 2
        return p

    def extras(self, J, P, L, tag, pose):
        root = J["pelvis"] + J["u"] * (P["sh_h"] - 0.08) + J["B"] * 0.16
        open_ = 1.0 if pose.get("_beat") else 0.6
        for sd in (-1, 1):
            for j, (up, ln) in enumerate(((0.6, 1.25), (-0.2, 0.95))):
                d = (J["X"] * sd * open_ + UP * up + J["B"] * 0.4).normalized()
                flat_cone(tag + "wing%d%d" % (sd, j), root, root + d * ln, 0.34 - 0.07 * j, "wing_fey", J["B"], squash=0.12)
        ec.leaf_ring(J, P, tag, 0.06, 8, 0.22, "kit1", width=0.09, droop=0.85, off=0.02, name="petal", alt="kit2")


# ----------------------------------------------------------------------------- elementals
class Elemental(Floating):
    """A faceless figure of one element over a swirl instead of legs; kit bands mark its team."""
    race = "human"
    element = "flame"
    knobs = dict(shoulders=1.15, torso=1.1, limb=1.1, head=0.9)
    target_px = 96

    def make_layout(self, pose):
        L = super().make_layout(pose)
        L.update(skin=self.element, torso=self.element, arms=self.element, coat_mat=self.element, robe_lining=self.element,
                 head="blank", hair=None, neckband="kit1", sleeve_cuff="kit2", belt="kit2", buckle=None, jag=0.8, hem=None)
        return L

    def extras(self, J, P, L, tag, pose):
        c, U = J["head"], UP
        t = pose.get("_t", 0.0)
        for i in range(7):
            a = 2 * math.pi * (i / 7 + t)
            r = 0.16 + 0.05 * (i % 3)
            b = c + Vector((math.cos(a) * r, math.sin(a) * r, 0.05))
            self.wisp(tag + "crown%d" % i, b, i)
        for side in ("l", "r"):
            sh = J["arms"][side][0]
            self.wisp(tag + "sh" + side, sh + UP * 0.08, 3)

    def wisp(self, name, at, i):
        cone(name, at, at + UP * (0.22 + 0.06 * (i % 3)), 0.06, self.element, 6)

    def pose(self, name, i, n):
        p = super().pose(name, i, n)
        p["_t"] = i / float(n)
        return p


@register
class FireElemental(Elemental):
    """Living fire: flames rise from its head and shoulders."""
    key = "elemental_fire"


@register
class WaterElemental(Elemental):
    """Living water: droplets circle its head."""
    key = "elemental_water"
    element = "water"

    def wisp(self, name, at, i):
        ball_at(name, at + UP * 0.06, 0.06, "water")


@register
class AirElemental(Elemental):
    """Living air: pale gusts curl round its head."""
    key = "elemental_air"
    element = "gale"

    def wisp(self, name, at, i):
        tube(name, [at, at + Vector((0.08, 0.04, 0.12)), at + Vector((0.02, 0.1, 0.24))], [0.04, 0.03, 0.01], "gale", n=6)


@register
class IncarnateFire(FireElemental):
    key = "incarnate_fire"
    knobs = dict(Elemental.knobs, shoulders=1.4, torso=1.35, limb=1.5)
    target_px = 128


@register
class IncarnateWater(WaterElemental):
    key = "incarnate_water"
    knobs = IncarnateFire.knobs
    target_px = 128


@register
class IncarnateAir(AirElemental):
    key = "incarnate_air"
    knobs = IncarnateFire.knobs
    target_px = 128


@register
class IncarnateEarth(Elemental):
    """A boulder giant: grey stone with a kit band of moss."""
    key = "incarnate_earth"
    element = "stone"
    knobs = IncarnateFire.knobs
    target_px = 128

    def wisp(self, name, at, i):
        ellipsoid(name, at + UP * 0.05, (0.09, 0.08, 0.07), "stone")
