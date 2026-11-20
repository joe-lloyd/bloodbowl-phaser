"""Necromantic Horror and Shambling Undead (models zombie, ghoul, werewolf, wraith, flesh_golem, skeleton,
wight, mummy). Zombie and Ghoul are shared by both teams. No figure holds a ball."""
import math
from mathutils import Vector, Matrix
from lib import Biped, Floating, register, core, parts
from lib.core import tube, tband, ball_at, box, lerp, UP, basis, D, cone, flat_cone, ellipsoid, cap, surf
from teams import undead_skaven_lizards_kit as K

def two(w, key="s1"):
    return 1 if w[key] > 0 else -1

@register
class Zombie(Biped):
    """Shambler: stooped, both arms groping forward, torn kit1 jersey with a ragged hem, one kit2 shoulder
    pad hanging on, bald head lolling."""
    key = "zombie"
    race = "zombie"
    knobs = dict(hunch=18, head_fwd=0.08, limb=0.95)
    layout = dict(hair=None, legs="rags", boots="leather", cuff=None, belt="rope", buckle=None,
                  pads="football_small", pad_sides=("l",), pad_mat="kit2", pad_trim="rust", wraps="rags")
    stance = dict(lean=4, nod=6, look=-14, legs={"l": (12, 8, 16), "r": (-12, 10, 6)}, feet={"r": 12},
                  arms={"l": (78, 8, 10), "r": (58, 12, 22)}, hands="relaxed")
    stride, arm_swing, run_lean, jump = 26, 8, 6, 0.08
    height = 1.08

    def idle(self, ph, p, w):       # sways from foot to foot, arms pawing the air, head lolling over
        k = two(w)
        p.update(lean=4 + 3 * k, look=-14 + 22 * w["c1"], nod=6 + 8 * w["dn"],
                 arms={"l": (78 + 12 * w["s2"], 8, 10 + 14 * w["up"]), "r": (58 - 12 * w["s2"], 12, 22 + 14 * w["dn"])})

    def adjust(self, name, i, pose):
        if name == "run":           # a lurching shuffle with the arms still out in front
            a = pose["arms"]
            pose["arms"] = {"l": (70 + a["l"][0], 8, 14), "r": (60 + a["r"][0], 12, 20)}
            pose["hands"] = "relaxed"

    def extras(self, J, P, L, tag, pose):
        sh = P["sh_h"]
        tband(tag + "jersey", J, P, [0.1, 0.22, 0.36, sh, sh + 0.04], "kit1", k=1.05, add=0.015, solid=0.03)
        tband(tag + "jerseyrag", J, P, [0.1, 0.0, -0.1], "kit2", k=1.08, add=0.02, solid=0.025, jag=0.9)
        el, wr = J["arms"]["r"][1:3]
        shd = J["arms"]["r"][0]
        r = K.arm_r(L)
        tube(tag + "sleeve", [shd, lerp(shd, el, 0.5), lerp(shd, el, 0.8)], [r * 1.12, r * 1.1, r * 1.08], "kit1", n=8)
        K.ring(tag, "sleevehem", shd, el, 0.76, 0.86, r * 1.12, "kit2")
        c, X, F, U, s = K.hframe(J)
        ellipsoid(tag + "wound", c + U * s[2] * 0.7 + X * s[0] * 0.45 + F * s[1] * 0.2, (0.07, 0.06, 0.04), "mouth", J["head_R"], seg=8)
        K.surf_stitch(J, P, tag, "scar", 0.4, 28, 0.2, 12, 3, off=0.045)

@register
class Ghoul(Biped):
    """Crouching scavenger: bent double, very long clawed arms almost on the turf, bald with pointed ears,
    kit2 headband with trailing tails, kit1 loincloth, bone ridge down the spine."""
    key = "ghoul"
    race = "ghoul"
    knobs = dict(hunch=36, arms=1.4, legs=0.92, head=1.08, head_fwd=0.1, limb=0.8, shoulders=1.08, hands=1.2)
    layout = dict(legs="skin_ghoul", boots="skin_ghoul", cuff=None, loin="kit1", loin_trim="kit2", shorts="kit1", belt="rope",
                  buckle=None, wraps="kit2", arm_band="kit1", pads="football_small", pad_mat="kit1", pad_trim="kit2",
                  claws=0.16, finger=1.25)
    stance = dict(lean=8, nod=-28, legs={"l": (34, 16, 66), "r": (22, 16, 62)}, arms={"l": (14, 20, 18), "r": (30, 18, 30)},
                  hands="open")
    stride, arm_swing, run_lean, jump = 40, 44, 16, 0.22
    height = 1.1

    def idle(self, ph, p, w):       # sniffs left and right in quick snaps, claws clenching, rocking on its haunches
        k = two(w)
        flex = "fist" if w["s2"] > 0.3 else "open"
        p.update(look=26 * k, nod=-28 + 10 * w["up"], lean=8 + 4 * (1 if w["s2"] > 0 else 0),
                 arms={"l": (14 + 14 * w["up"], 20, 18 + 20 * w["up"]), "r": (30 + 14 * w["dn"], 18, 30 + 20 * w["dn"])},
                 hand_modes={"l": flex}, sway=0.6 * w["s1"])

    def extras(self, J, P, L, tag, pose):
        sh = P["sh_h"]
        tband(tag + "vest", J, P, [0.2, 0.32, sh - 0.03, sh + 0.03], "kit1", k=1.05, add=0.015, solid=0.03)
        tband(tag + "vestrag", J, P, [0.2, 0.12, 0.05], "kit1", k=1.07, add=0.02, solid=0.025, jag=0.9)
        tband(tag + "vestneck", J, P, [sh - 0.01, sh + 0.05], "kit2", k=1.03, add=0.03, solid=0.03)
        K.spines(J, P, tag, "bone", [0.12, 0.22, 0.32, 0.42], length=0.11, r=0.05, lift=0.2)
        K.head_band(J, tag, "kit2", 0.25, 0.62, 1.08)
        c, X, F, U, s = K.hframe(J)
        knot = c - F * s[1] * 1.05 + U * s[2] * 0.42
        ball_at(tag + "knot", knot, 0.05, "kit2")
        for i, sd in enumerate((-1, 1)):
            K.ribbon(J, tag, "btail%d" % i, knot, 0.42 + 0.08 * i, "kit2", pose, w=0.045, side=sd * 0.1, back=0.6)

@register
class Werewolf(Biped):
    """Wolf-headed frenzied runner on hooked legs: black mane down the back, bushy tail, crossed kit1
    harness, torn kit2 breeches, claws spread wide. Throws its head back and howls."""
    key = "werewolf"
    race = "werewolf"
    knobs = dict(shoulders=1.28, torso=1.1, arms=1.22, head=1.12, hands=1.25)
    layout = dict(tail=None, claws=0.16, shorts="kit2", belt="leather", buckle="gold", bracers="kit1", neckband=None,
                  skin="fur_brown", legs="fur_brown", dark="fur_black", snout=(1.3, 0.85), nose_mat="socket",
                  pads="plate", pad_mat="kit1", pad_trim="metal", pad_sides=("l",), arm_band="kit1")
    stance = dict(lean=2, nod=-6, jaw=16, legs={"l": (8, 14, 10), "r": (-8, 14, 6)},
                  arms={"l": (6, 36, 44, 6), "r": (12, 36, 50, 6)}, hands="open")
    stride, arm_swing, run_lean, jump = 46, 40, 20, 0.26
    height = 1.05

    def idle(self, ph, p, w):       # snarls, then throws the head back in a long howl while the tail lashes
        howl = max(0.0, math.sin(w["a"] - 0.6)) ** 0.7
        p.update(nod=-6 - 46 * howl, jaw=16 + 26 * howl, lean=2 - 6 * (1 if howl > 0.4 else 0), tail=w["s2"],
                 arms={"l": (6 - 10 * howl, 36 + 8 * howl, 44, 6), "r": (12 - 10 * howl, 36 + 8 * howl, 50, 6)})

    def adjust(self, name, i, pose):
        pose.setdefault("jaw", 16)
        if name in ("run", "block"):
            pose["hands"] = "open"
            pose["jaw"] = 30

    def extras(self, J, P, L, tag, pose):
        K.harness(J, P, tag, "kit1", boss="gold", w=0.13, lo=0.12)
        tband(tag + "collar", J, P, [P["sh_h"] - 0.02, P["sh_h"] + 0.08], "kit1", k=1.06, add=0.045, solid=0.03)
        K.spines(J, P, tag, "fur_black", [0.2, 0.32, 0.44, 0.56], length=0.2, r=0.09, name="mane", lift=0.7)
        c, X, F, U, s = K.hframe(J)
        for i, (x, z) in enumerate(((-0.45, 0.55), (0.0, 0.8), (0.45, 0.55))):
            b = c - F * s[1] * 0.6 + X * x * s[0] + U * z * s[2]
            cone(tag + "ruff%d" % i, b, b - F * 0.22 + U * 0.1 + X * x * 0.1, 0.08, "fur_black", 6)
        k = L["limb"] * core.LIMB
        for side in ("l", "r"):
            hip, knee = J["legs"][side][:2]
            tube(tag + "breech" + side, [hip + J["u"] * 0.04, lerp(hip, knee, 0.35), lerp(hip, knee, 0.62)],
                 [0.2 * k, 0.225 * k, 0.19 * k], "kit2", n=10)
            tube(tag + "breechhem" + side, [lerp(hip, knee, 0.6), lerp(hip, knee, 0.7)], [0.2 * k, 0.19 * k], "rags", n=10)
        K.tail(J, tag, pose, ln=0.8, r=0.12, mat="fur_brown", up=0.45)

@register
class Wraith(Floating):
    """Hovering spectre: black hooded robe with ragged kit1 hem, kit1 shroud over the shoulders, kit2 cuffs
    and cord, long bone fingers reaching out, green eyes inside the hood."""
    key = "wraith"
    race = "skeleton"
    knobs = dict(arms=1.15, shoulders=1.0, hands=1.05)
    layout = dict(torso="cloth_black", arms="cloth_black", coat_mat="cloth_black", robe_lining="kit1", hem="kit1",
                  helm="hood", hood_mat="cloth_black", belt="kit2", buckle="gold", sleeve_cuff="kit2", jag=0.7,
                  claws=0.08, finger=1.3, clasp=False, trim="kit2")
    stance = dict(lean=6, nod=10, legs={"l": (0, 5, 0), "r": (0, 5, 0)}, arms={"l": (34, 30, 46), "r": (50, 30, 40)},
                  hands="open")
    hover = 0.24
    height = 1.0

    def idle(self, ph, p, w):       # bobs in the air, one hand slowly beckoning, the shroud drifting
        beck = ("open", "open", "relaxed", "fist", "fist", "relaxed", "open", "open")[int(round(ph * 8)) % 8]
        p.update(look=16 * w["s1"], cape=0.1 + 0.1 * w["s1"], hand_modes={"r": beck},
                 arms={"l": (34 + 8 * w["c1"], 30, 46), "r": (50 + 22 * w["up"], 30, 40 + 40 * w["up"])})

    def extras(self, J, P, L, tag, pose):
        core.cape(J, P, L, tag, 0.78, pose.get("cape", 0.0), mats=("kit1", "cloth_black"))
        c, X, F, U, s = K.hframe(J)
        cap(tag + "hoodrim", c + U * 0.01 - F * 0.02, (s[0] * 1.36, s[1] * 1.34, s[2] * 1.32), "kit1",
            (U * 0.5 - F * 0.85).normalized(), cut=-0.5, hi=-0.34, rot=J["head_R"], thick=0.035)
        sh = P["sh_h"]
        for sd in (-1, 1):          # a stole down the front of the robe
            K.strap(J, P, tag, "stole%d" % sd, sh + 0.03, 24 * sd, -0.22, 16 * sd, "kit2", w=0.06, off=0.05)
        tband(tag + "mantle", J, P, [sh - 0.06, sh + 0.0, sh + 0.06], "kit1", k=1.06, add=0.05, solid=0.03)
        start = surf(J, P, 0.07, 35, 0.06)
        K.ribbon(J, tag, "cord", start, 0.5, "kit2", pose, w=0.035, back=-0.1, key="cape")

@register
class FleshGolem(Biped):
    """Stitched giant: tiny bolted head with a riveted skull plate between huge shoulders, sewn-on grey
    forearms, kit1 breeches, one dark shoulder plate on a kit2 strap, seams everywhere."""
    key = "flesh_golem"
    race = "flesh_golem"
    knobs = dict(head=0.86, shoulders=1.45, torso=1.38, hunch=8, arms=1.22, limb=1.5, hands=1.3, legs=0.92)
    layout = dict(hair=None, eyes="dark", forearms="skin_ghoul", legs="kit1", boots="boot", cuff="leather", belt="kit2",
                  buckle="darkmetal", pads="plate", pad_sides=("r",), pad_mat="darkmetal", pad_trim="kit2")
    stance = dict(lean=2, legs={"l": (5, 15, 8), "r": (-4, 15, 8)}, arms={"l": (8, 30, 30, 0), "r": (8, 30, 30, 0)},
                  hands="fist")
    stride, arm_swing, run_lean, jump = 28, 22, 8, 0.08
    lie, lie_shift = 0.3, 1.0

    def idle(self, ph, p, w):       # stands dead still, then a spark: head jerks to one side and one arm spasms up
        jolt = 1.0 if 0.45 <= ph < 0.7 else 0.0
        p.update(look=-10 + 30 * jolt, nod=4 - 10 * jolt, lean=2 + 2 * w["breath"],
                 arms={"l": (8, 30, 30, 0), "r": (8 + 34 * jolt, 30 + 8 * jolt, 30 + 50 * jolt, 0)},
                 hand_modes={"r": "open" if jolt else "fist"})

    def extras(self, J, P, L, tag, pose):
        sh = P["sh_h"]
        K.strap(J, P, tag, "padF", sh + 0.02, 44, 0.1, -80, "kit2", 0.06)
        K.strap(J, P, tag, "padB", sh + 0.02, 138, 0.1, 258, "kit2", 0.06)
        K.surf_stitch(J, P, tag, "seam1", 0.46, -34, 0.22, -6, 4, off=0.02)
        K.surf_stitch(J, P, tag, "seam2", 0.3, 170, 0.48, 200, 3, off=0.02)
        r = K.arm_r(L)
        for side in ("l", "r"):
            shd, el, wr = J["arms"][side][:3]
            K.ring(tag, "elbowseam" + side, el, wr, 0.02, 0.1, r * 0.98, "socket")
            K.ring(tag, "cuffk" + side, el, wr, 0.78, 0.96, r * 0.84, "kit1")
        c, X, F, U, s = K.hframe(J)
        cap(tag + "plate", c + U * 0.01, (s[0] * 1.1, s[1] * 1.1, s[2] * 1.1), "metal", (U * 0.8 - X * 0.6).normalized(),
            cut=0.5, rot=J["head_R"], thick=0.03)
        for i, a in enumerate((-0.4, 0.3)):
            ball_at(tag + "rivet%d" % i, c + U * s[2] * 1.02 + X * (-0.5 * s[0]) + F * a * s[1], 0.03, "darkmetal")
        nk = J["neck"]
        for sd in (-1, 1):
            parts.cylinder(tag + "bolt%d" % sd, nk + X * sd * 0.05 + J["u"] * 0.03, nk + X * sd * 0.2 + J["u"] * 0.03, 0.04, "metal", seg=6)
        K.stitch(tag, "brow", c + F * s[1] * 1.0 + U * s[2] * 0.55 - X * s[0] * 0.5, c + F * s[1] * 0.95 + U * s[2] * 0.35 + X * s[0] * 0.5, 2,
                 across=U)

@register
class Skeleton(Biped):
    """Shambling Undead lineman: thin bones under a rusty spiked pot helm with cheek flaps and a mail shirt,
    long kit1 tabard edged kit2, kit2 scarf at the neck."""
    key = "skeleton"
    race = "skeleton"
    layout = dict(helm="skull", helm_mat="rust", jersey="darkmetal", tabard="kit1", tabard_trim="kit2", belt="leather",
                  legs="bone_old", boots="leather", cuff="rags", neckband="kit2", arm_band="kit2")
    stance = dict(lean=2, look=8, legs={"l": (6, 9, 8), "r": (-5, 9, 8)}, arms={"l": (6, 22, 22), "r": (18, 24, 54, 6)},
                  hands="relaxed")
    height = 1.0

    def idle(self, ph, p, w):       # rattles: the skull chatters up and down, cocks to one side, shoulders shrug
        k = two(w)
        p.update(look=8 + 20 * k, nod=6 * two(w, "s2"),
                 arms={"l": (6, 22 + 8 * w["up"], 22), "r": (18, 24 + 8 * w["up"], 54, 6)})

    def extras(self, J, P, L, tag, pose):
        tband(tag + "mailhem", J, P, [0.1, 0.02, -0.06], "darkmetal", k=1.08, add=0.02, solid=0.025, jag=0.5)
        c, X, F, U, s = K.hframe(J)
        cone(tag + "helmspike", c + U * s[2] * 1.05, c + U * (s[2] * 1.05 + 0.2), 0.05, "rust", 6)
        for sd in (-1, 1):
            box(tag + "cheek%d" % sd, c + X * sd * s[0] * 1.08 - U * s[2] * 0.2 + F * s[1] * 0.1, (0.03, 0.14, 0.24), "rust", J["head_R"])
        start = surf(J, P, P["sh_h"] + 0.04, 150, 0.05)
        K.ribbon(J, tag, "scarf", start, 0.4, "kit2", pose, w=0.05, back=0.5)

@register
class Wight(Biped):
    """Crowned barrow champion: tall, dark plate over bone, gold crown points on an open helm, long tattered
    kit1 cape, kit2 tabard, one fist always raised."""
    key = "wight"
    race = "wight"
    knobs = dict(limb=0.92, shoulders=1.12, legs=1.06)
    layout = dict(torso="rust", arms="bone_old", legs="bone_old", helm="open", helm_mat="darkmetal", trim="gold",
                  pads="plate", pad_mat="darkmetal", pad_trim="kit2", breast="darkmetal", emblem_mat="kit1", gorget=True,
                  tabard="kit2", tabard_trim="gold", cape="long", cape_mat="kit1", cape_lining="cloth_black", greaves=True,
                  bracers="darkmetal", belt="leather", claws=0.08)
    stance = dict(lean=0, nod=-4, legs={"l": (5, 10, 5), "r": (-4, 10, 5)}, arms={"l": (4, 24, 18), "r": (38, 26, 100, 0)},
                  hands="fist")
    stride, arm_swing, jump = 36, 30, 0.16
    height = 1.0

    def idle(self, ph, p, w):       # regal menace: the cape stirs, the raised hand opens into a claw and closes again
        grip = ("fist", "fist", "relaxed", "open", "open", "open", "relaxed", "fist")[int(round(ph * 8)) % 8]
        p.update(look=14 * w["s1"], cape=0.07 + 0.07 * w["s1"], hand_modes={"r": grip},
                 arms={"l": (4, 24, 18), "r": (38 + 10 * w["up"], 26, 100 - 14 * w["up"], 0)})

    def extras(self, J, P, L, tag, pose):
        K.crown(J, tag, "gold", n=7, h=0.2, lo=0.42, hi=0.62, r=0.05, k=1.22)

@register
class Mummy(Biped):
    """Huge bandaged brute: wide and slow, arms reaching, darker wrappings banding every limb, loose strips
    trailing from the wrists, kit1 loincloth and sash, broad kit2 collar and arm rings."""
    key = "mummy"
    race = "mummy"
    knobs = dict(limb=1.55, shoulders=1.42, torso=1.4, arms=1.18, legs=0.86, head=0.92, hunch=10, hands=1.3, belly=1.1)
    layout = dict(legs="bandage", boots="bandage", cuff=None, loin="kit1", loin_trim="gold", belt="gold", buckle="kit2",
                  arm_band="kit2")
    stance = dict(lean=4, legs={"l": (6, 15, 8), "r": (-5, 15, 8)}, arms={"l": (58, 16, 22), "r": (40, 18, 36)},
                  hands="open")
    stride, arm_swing, run_lean, jump = 24, 10, 6, 0.06
    lie, lie_shift = 0.3, 1.0

    def idle(self, ph, p, w):       # rocks slowly, the reaching hands closing on nothing, loose bandages swinging
        k = two(w)
        grab = "fist" if w["s2"] > 0 else "open"
        p.update(lean=4 + 3 * k, look=12 * w["c1"], sway=w["s1"], hand_modes={"l": grab},
                 arms={"l": (58 + 10 * w["s1"], 16, 22), "r": (40 - 10 * w["s1"], 18, 36)})

    def adjust(self, name, i, pose):
        if name == "run":
            a = pose["arms"]
            pose["arms"] = {"l": (56 + a["l"][0], 14, 20), "r": (44 + a["r"][0], 16, 30)}
            pose["hands"] = "open"

    def extras(self, J, P, L, tag, pose):
        sh = P["sh_h"]
        tband(tag + "collar", J, P, [sh - 0.1, sh - 0.02, sh + 0.05], "kit2", k=1.06, add=0.035, solid=0.03)
        tband(tag + "collarrim", J, P, [sh - 0.13, sh - 0.09], "gold", k=1.06, add=0.045, solid=0.03)
        K.sash(J, P, tag, "kit1", w=0.075)
        for i, h in enumerate((0.16, 0.3)):
            tband(tag + "wrapT%d" % i, J, P, [h, h + 0.035], "rags", k=1.03, add=0.012, solid=0.02)
        ra, rl = K.arm_r(L), K.leg_r(L)
        for side in ("l", "r"):
            shd, el, wr = J["arms"][side][:3]
            hip, knee, ankle = J["legs"][side][:3]
            for i, t in enumerate((0.25, 0.6)):
                K.ring(tag, "wrapA%s%d" % (side, i), el, wr, t, t + 0.12, ra * 0.95, "rags")
                K.ring(tag, "wrapL%s%d" % (side, i), hip, knee, t, t + 0.1, rl * 1.07, "rags")
            K.ring(tag, "wrapS" + side, knee, ankle, 0.35, 0.47, rl * 0.9, "rags")
            K.ribbon(J, tag, "strip" + side, lerp(el, wr, 0.8), 0.5, "bandage", pose, w=0.05, back=0.2)
        c, X, F, U, s = K.hframe(J)
        K.head_band(J, tag, "rags", 0.1, 0.3, 1.05, "hwrap")
        K.ribbon(J, tag, "hstrip", c - F * s[1] * 1.0 + U * s[2] * 0.2, 0.45, "bandage", pose, w=0.05, back=0.4)
