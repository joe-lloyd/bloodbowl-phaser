"""Chaos Dwarf: chaos_dwarf, flamesmith, hobgoblin, hobgoblin_stabba, bull_centaur (the Minotaur is in
chaos_chosen.py). Costume: the Ashen Forge, black iron and bronze. No figure holds a ball."""
import math
from mathutils import Vector, Matrix
from lib import Biped, Centaur, register, core, parts, looks
from lib.core import tube, tband, ball_at, box, cone, flat_cone, ellipsoid, lerp, UP, basis, D, surf
from teams import chaos_common as cc

FORGE = dict(skin="skin_tan", hair=None, beard="hair", brow="hair", eyes="red", torso="darkmetal", arms="kit1", legs="cloth_black",
             boots="darkmetal", cuff="brass", belt="leather", buckle="brass", trim="brass")

@register
class ChaosDwarf(Biped):
    """Blocker: a square block of black scale under the tallest hat on the pitch, kit2 hat bands, tiered curled beard, kit1 sleeves and skirt."""
    key = "chaos_dwarf"
    race = "dwarf"
    knobs = dict(shoulders=1.25, torso=1.28)
    layout = dict(FORGE, breast="darkmetal", emblem_mat="kit2", pads="plate", pad_mat="kit2", pad_trim="brass", coat="gambeson",
                  coat_mat="kit1", hem="kit2", gauntlets=True, beard_len=0.5, hat="tall", helm_mat="darkmetal")
    stance = dict(lean=2, legs={"l": (4, 16, 6), "r": (-4, 16, 6)}, arms={"l": (6, 30, 40, -6), "r": (6, 30, 40, -6)}, hands="fist")
    stride, arm_swing, jump = 30, 24, 0.1
    height = 1.1

    def idle(self, ph, p, w):       # immovable: plants his feet and strokes his curled beard, once per loop
        up = 1 if w["s1"] > 0.3 else 0
        p.update(arms={"l": (6, 30, 40, -6), "r": (6 + 50 * up, 30 - 16 * up, 40 + 86 * up + 10 * w["s2"] * up, -6 - 30 * up)},
                 hand_modes={"r": "relaxed" if up else "fist"}, nod=6 * up)

    def extras(self, J, P, L, tag, pose):
        hat = L.get("hat")
        if hat == "tall":
            cc.tall_hat(J, tag, 0.62, "darkmetal", bands=((0.08, "kit2", 0.1), (0.5, "kit1", 0.09), (0.84, "kit2", 0.1)), taper=0.92,
                        rim="brass", k=0.98, lift=0.5)
        elif hat == "horned":
            cc.tall_hat(J, tag, 0.34, "darkmetal", bands=((0.1, "kit2", 0.1), (0.62, "kit1", 0.09)), taper=0.9, rim="brass", k=0.98, lift=0.5)
            cc.hat_horns(J, tag)
        cc.curled_beard(J, tag, rows=4, ln=0.9)
        for i, a in enumerate((-40, 0, 40)):           # scale rows on the cuirass
            ball_at(tag + "rivet%d" % i, surf(J, P, 0.18, a, 0.03), 0.03, "brass")

@register
class Flamesmith(Biped):
    """Fire-breather: bronze fuel tank and smoking chimney on his back, snouted brass mask with goggles, kit2 leather apron, kit1 tank bands and sleeves. No tall hat."""
    key = "flamesmith"
    race = "dwarf"
    knobs = dict(shoulders=1.1)
    layout = dict(FORGE, beard="hair", beard_len=0.9, helm="skull", helm_mat="brass", torso="kit1", tabard="kit2", tabard_trim="brass",
                  bracers="brass", gloves="leather", neckband="kit1", tank="brass", hat=None)
    stance = dict(lean=8, legs={"l": (8, 12, 10), "r": (-6, 12, 8)}, arms={"l": (16, 24, 50, 0), "r": (16, 24, 50, 0)}, hands="fist")
    stride, arm_swing, jump = 32, 26, 0.1
    height = 1.05

    def idle(self, ph, p, w):       # leans back, then huffs a jet of flame from the mask
        b = w["breath"]
        p.update(lean=8 - 12 * (1 - b) * w["dn"] + 8 * w["up"], fire=w["up"] ** 0.5, nod=-6 * w["up"],
                 arms={"l": (16 - 20 * w["up"], 24 + 10 * w["up"], 50, 0), "r": (16 - 20 * w["up"], 24 + 10 * w["up"], 50, 0)})

    def adjust(self, name, i, pose):
        if name == "block":
            pose["fire"] = (0, 0, 0.5, 1.0, 1.0, 0.4, 0, 0)[i]
        pose.setdefault("flick", i)

    def extras(self, J, P, L, tag, pose):
        c, X, F, U, s = cc.hf(J)
        top = cc.tank(J, P, tag, body=L["tank"], band="kit1")
        if L.get("hat") == "drum":
            cc.tall_hat(J, tag, 0.3, "darkmetal", bands=((0.14, "kit2", 0.1),), taper=0.92, rim="brass", k=0.98, lift=0.5)
        fl = pose.get("flick", 0) % 2
        cc.flame(tag + "pilot", top, UP, 0.16 + 0.07 * fl, r=0.06)
        # mask: goggles and a snout nozzle fed by a hose from the tank
        noz = c + F * s[1] * 0.95 - U * s[2] * 0.25
        cone(tag + "nozzle", noz, noz + F * 0.16 - U * 0.02, 0.085, "brass", 8, r2=0.06)
        for sd in (-1, 1):
            ball_at(tag + "gog%d" % sd, c + F * s[1] * 0.92 + X * sd * s[0] * 0.42 + U * s[2] * 0.2, 0.06, "fire" if pose.get("fire") else "darkmetal")
        tube(tag + "hose", [noz + X * 0.08, c + X * s[0] * 1.15 - U * s[2] * 0.3, cc.back_pt(J, P, 0.5, 0.12, 0.14)], [0.04, 0.04, 0.04],
             "leather", n=6)
        k = pose.get("fire", 0)
        if k > 0.05:
            d = (F - U * 0.15).normalized()
            cc.flame(tag + "jet", noz + F * 0.14, d, 0.2 + 0.5 * k, r=0.06 + 0.07 * k)
        cc.strap(J, P, tag, "leather", r=0.035, flip=1)
        cc.strap(J, P, tag, "leather", r=0.035, flip=-1, name="strapb")

HOB = dict(skin="skin_goblin", legs="rags", boots="leather", cuff=None, belt="rope", buckle=None, fangs=True)

@register
class Hobgoblin(looks.Fine, Biped):
    """Lanky lineman: long-limbed goblin with a floppy pointed kit1 cap, hooked nose, wide ears, kit2 jerkin, bare arms."""
    key = "hobgoblin"
    race = "goblin"
    knobs = dict(legs=0.95, arms=1.12, limb=0.72, torso=0.8, torso_len=0.9, head=1.05, hunch=10, shoulders=0.95)
    layout = dict(HOB, torso="kit2", arms="skin_goblin", jersey="kit2", neckband="kit1", wraps="rags", arm_band="kit1", shorts="kit1",
                  cap="floppy", topknot=None, xstrap=None, helm_mat="darkmetal")
    stance = dict(lean=6, legs={"l": (6, 10, 14), "r": (-6, 10, 14)}, arms={"l": (20, 14, 70, -10), "r": (20, 14, 70, -10)}, hands="relaxed")
    stride, arm_swing, run_lean, jump = 42, 36, 18, 0.22
    height = 1.08

    def idle(self, ph, p, w):       # shifty: wrings his hands and keeps checking over each shoulder
        p.update(look=38 * (1 if w["s1"] > 0 else -1) * (1 if abs(w["s1"]) > 0.5 else 0), nod=4,
                 arms={"l": (26 + 8 * w["s2"], 10, 84, -24), "r": (26 - 8 * w["s2"], 10, 84, -24)})

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        if L.get("cap") == "floppy":
            cc.floppy_cap(J, tag, "kit1", "kit2", h=0.5, flop=0.3)
        if L.get("topknot"):
            cc.topknot(J, tag, L["topknot"], "kit1")
        if L.get("xstrap"):
            cc.strap(J, P, tag, L["xstrap"], r=0.045, flip=1, name="xstrap")
        cc.big_ears(J, L, tag, size=0.85, droop=0.06)
        cc.long_nose(J, L, tag, ln=0.17)
        cc.sash(J, P, tag, pose, "kit1", side=1, ln=0.3, r=0.04)

    def details(self, J, P, L, tag, pose):
        c, X, F, U, s = cc.hf(J)
        for sd in (-1, 1):                              # brass rings through both ears, a pouch on the belt
            root = c + X * sd * s[0] * 0.85 + U * s[2] * 0.05
            ball_at(tag + "earring%d" % sd, root + (X * sd * 0.2 + U * 0.02 - F * 0.06) * 0.85 - U * 0.04, 0.025, "brass")
        box(tag + "pouch", surf(J, P, -0.02, -40, 0.06), (0.1, 0.06, 0.1), "leather", basis(J["X"], J["F"], J["u"]))

@register
class HobgoblinStabba(Biped):
    """Sneak: crouched under a black cowl and short cloak with kit1 lining band, kit2 mask scarf, a thin knife held low and behind."""
    key = "hobgoblin_stabba"
    race = "goblin"
    knobs = dict(legs=0.9, arms=1.1, limb=0.72, torso=0.8, torso_len=0.9, head=1.05, hunch=20, shoulders=0.95)
    layout = dict(HOB, torso="cloth_black", arms="cloth_black", legs="cloth_black", helm="hood", hood_mat="kit1", cape="short",
                  cape_mat="cloth_black", cape_lining="kit1", clasp=False, neckband="kit2", bracers="kit2", belt="kit2", shorts="kit1")
    stance = dict(lean=12, nod=8, legs={"l": (14, 12, 26), "r": (-10, 12, 24)}, arms={"l": (30, 16, 70, -10), "r": (-30, 20, 40, 0)},
                  hands="fist")
    stride, arm_swing, run_lean, jump = 40, 30, 22, 0.16
    height = 1.02

    def idle(self, ph, p, w):       # lurks: sinks lower, peers left and right, the hidden knife twitches behind his back
        k = 1 if w["s1"] > 0 else 0
        p.update(lean=12 + 6 * k, look=30 * w["c1"], legs={"l": (14, 12, 26 + 10 * k), "r": (-10, 12, 24 + 10 * k)},
                 arms={"l": (30, 16, 70, -10), "r": (-30 - 16 * max(0, w["s2"]), 20, 40 + 30 * max(0, w["s2"]), 0)})

    def adjust(self, name, i, pose):
        modes = dict(pose.get("hand_modes", {}))
        modes["r"] = "fist"              # the knife hand stays closed
        pose["hand_modes"] = modes
        if name == "pass":               # throws with the empty left hand instead
            a = pose["arms"]
            pose["arms"] = {"l": a["r"], "r": (-30, 20, 40, 0)}
            pose["twist"] = -pose.get("twist", 0)

    def extras(self, J, P, L, tag, pose):
        cc.long_nose(J, L, tag, ln=0.2)
        parts.rod(J, "r", tag, length=0.2, r=0.022, mat="leather", head="blade", head_mat="metal")
        cc.sash(J, P, tag, pose, "kit2", side=-1, ln=0.26, r=0.035)

class CentaurTorso:
    pass

@register
class BullCentaur(Centaur):
    """Blitzer: armoured dwarf torso on a black bull's body, horned drum hat, kit1 barding with kit2 trim, brass rump plate, tufted tail."""
    key = "bull_centaur"
    race = "dwarf"
    knobs = dict(shoulders=1.25, torso=1.2, torso_len=1.0)
    layout = dict(FORGE, breast="darkmetal", emblem_mat="kit2", pads="big", pad_mat="kit2", pad_trim="brass", spikes=1, gauntlets=True,
                  beard_len=0.5, neckband="kit1")
    stance = dict(lean=4, legs={"l": (0, 6, 0), "r": (0, 6, 0)}, arms={"l": (10, 32, 50, -10), "r": (10, 32, 50, -10)}, hands="fist")
    arm_swing = 22
    height = 1.04

    class Body(Centaur.Body):
        skin = "fur_black"
        coat = "kit1"
        body = (1.05, 0.33)
        leg_len, leg_r = 0.56, 0.1
        paw_mat = "brass"
        tail = dict(len=0.55, r=0.045, mat="fur_black", up=-0.2, tip="hair_red")

        def extras(self, J, tag, pose, c):
            ln, r = self.body
            X, B = J["X"], J["B"]
            for i, t in enumerate((-0.24, 0.24)):          # kit2 edges of the barding
                core.loft(tag + "bard%d" % i, [(c + B * (ln * (t + dt)), X, UP, r * 1.11, r * 1.11) for dt in (-0.03, 0.03)], "kit2", n=12,
                          arc=(-118, 118), caps=False, subsurf=1, solidify=0.03)
            core.cap(tag + "rump", c + B * ln * 0.42, (r * 1.02, r * 0.9, r * 1.0), "brass", (B + UP * 0.6).normalized(), cut=0.45, thick=0.03)
            for sd in (-1, 1):
                ball_at(tag + "boss%d" % sd, c + X * sd * r * 1.05 + UP * r * 0.2, 0.07, "brass")

    def idle(self, ph, p, w):       # impatient: stamps a front hoof, tail lashing, folds his arms and glowers
        up = w["up"]
        p.update(legs4=(46 * (1 if (w["s2"] > 0 and w["s1"] > 0) else 0), 0, 0, 0), tail=w["s2"], look=18 * w["c1"],
                 arms={"l": (40, 6, 100, -50), "r": (36, 6, 96, -50)})

    def extras(self, J, P, L, tag, pose):
        top, ax, r = cc.tall_hat(J, tag, 0.4, "darkmetal", bands=((0.1, "kit1", 0.1), (0.72, "kit2", 0.1)), taper=0.9, rim="brass", k=0.98, lift=0.5)
        c, X, F, U, s = cc.hf(J)
        cc.hat_horns(J, tag)                                # bull horns bolted to the hat
        cc.curled_beard(J, tag, rows=2)
