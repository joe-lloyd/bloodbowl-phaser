"""Khorne: marauder, khorngor, bloodseeker, bloodspawn. Costume: the Brass Reavers, blood and brass.
No figure holds a ball."""
import math
from mathutils import Vector, Matrix
from lib import Biped, register, core, parts, looks
from lib.core import tube, tband, ball_at, box, cone, flat_cone, ellipsoid, lerp, UP, basis, D, surf
from teams import chaos_common as cc

@register
class Marauder(looks.Fine, Biped):
    """Bare-chested tribesman: tall red mohawk and beard, kit1 warpaint and kilt, spiked brass collar, kit2 cross-strap, fur boots."""
    key = "marauder"
    race = "human"
    knobs = dict(shoulders=1.1, limb=1.06)
    layout = dict(skin="skin_tan", hair=None, beard="hair_red", beard_len=0.45, brow="hair_red", legs="leather", coat="gambeson",
                  coat_mat="kit1", hem="kit2", boots="fur_brown", cuff="fur_brown", belt="leather", buckle="brass", bracers="brass",
                  arm_band="kit1", neckband="brass", mohawk=True, wrap=None, helm_mat="darkmetal", horn_mat="bone", hair_mat="hair_red",
                  tie="kit2", cape_mat="fur_brown", cape_lining="leather", clasp=False)
    stance = dict(lean=6, legs={"l": (6, 14, 10), "r": (-5, 14, 10)}, arms={"l": (10, 34, 50, -6), "r": (10, 34, 50, -6)}, hands="fist")
    stride, arm_swing, run_lean, jump = 40, 36, 18, 0.24
    height = 1.02

    def idle(self, ph, p, w):       # frenzy building: throws his head back and howls, fists shaking at his sides
        up = w["up"]
        p.update(nod=-24 * up, jaw=30 * up, lean=6 - 8 * up,
                 arms={"l": (10 - 16 * up, 34 + 14 * up, 50 + 30 * up + 8 * w["s2"], -6), "r": (10 - 16 * up, 34 + 14 * up, 50 + 30 * up - 8 * w["s2"], -6)})

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        if L.get("mohawk"):
            cc.mohawk(J, tag, "hair_red", h=0.3, n=6, lo=0.7)
        if L.get("wrap"):
            cc.chest_wrap(J, P, tag, L["wrap"])
        cc.warpaint(J, P, tag, "kit1", hs=(0.42, 0.33, 0.24))
        cc.strap(J, P, tag, "kit2", r=0.04, flip=1)
        cc.collar_spikes(J, P, tag, mat="brass", n=6, ln=0.1)

    def details(self, J, P, L, tag, pose):
        p = surf(J, P, -0.02, 48, 0.1)                  # a small skull trophy tied at the hip, brass rings on the wrists
        tube(tag + "trophycord", [surf(J, P, 0.06, 48, 0.06), p], [0.012, 0.012], "leather", n=5)
        c = p - UP * 0.07
        R = basis(J["X"], J["F"], J["u"])
        ellipsoid(tag + "trophy", c, (0.06, 0.06, 0.065), "bone", R, seg=10)
        for sd in (-1, 1):
            ball_at(tag + "trophyeye%d" % sd, c + J["F"] * 0.05 + J["X"] * sd * 0.022 + UP * 0.01, 0.014, "socket")
        for side in ("l", "r"):
            el, wr = J["arms"][side][1:3]
            k = L["limb"] * core.LIMB * L.get("arm", 1.0)
            tube(tag + "wring" + side, [lerp(el, wr, 0.88), lerp(el, wr, 0.95)], [0.085 * k, 0.085 * k], "brass", n=10)

@register
class Khorngor(Biped):
    """Beast-headed brute: dark red hide, curled ram horns, a brass skull-plate, brass shoulder with kit2 rim, kit1 loincloth and harness."""
    key = "khorngor"
    race = "beastman"
    knobs = dict(shoulders=1.25, torso=1.15, limb=1.22, hunch=14)
    layout = dict(skin="fur_red", legs="fur_red", dark="fur_black", horns="ram", horn_mat="bone", snout=(1.0, 1.0), fangs=True, loin="kit1",
                  loin_trim="kit2", pads="plate", pad_sides=("r",), pad_mat="brass", pad_trim="kit2", spikes=2, belt="leather", buckle="brass",
                  bracers="kit2", arm_band="brass", skullplate="brass")
    stance = dict(lean=10, nod=12, legs={"l": (8, 14, 10), "r": (-8, 14, 6)}, arms={"l": (16, 30, 60, -6), "r": (16, 30, 60, -6)}, hands="fist")
    stride, arm_swing, run_lean, jump = 38, 30, 20, 0.2
    height = 1.05

    def idle(self, ph, p, w):       # juggernaut: rocks from hoof to hoof with his head lowered, horns swinging side to side
        k = 1 if w["s1"] > 0 else -1
        p.update(legs={"l": (8, 14, 10 + 12 * k), "r": (-8, 14, 6 - 12 * k)}, look=26 * w["s1"], nod=12 + 10 * abs(w["s2"]), jaw=8 + 14 * w["up"])

    def extras(self, J, P, L, tag, pose):
        c, X, F, U, s = cc.hf(J)
        if L.get("skullplate"):
            core.cap(tag + "skullplate", c + U * 0.02, (s[0] * 1.1, s[1] * 1.12, s[2] * 1.1), L["skullplate"], (U * 0.8 + F * 0.5).normalized(),
                     cut=0.5, rot=J["head_R"], thick=0.03)
        cc.strap(J, P, tag, "kit1", r=0.08, flip=1)
        cc.strap(J, P, tag, "kit1", r=0.08, flip=-1, name="strapb")
        ball_at(tag + "boss", surf(J, P, 0.3, 0, 0.08), 0.07, "brass")
        # team colour that reads against the red hide: ragged kit1 war-kilt on a wide kit2 girdle, kit2 collar
        cc.rags(J, P, tag, "kit1", h0=0.06, h1=-0.24, jag=0.45, k=1.14, name="kilt")
        tband(tag + "girdle", J, P, [0.03, 0.09, 0.15], "kit2", k=1.12, add=0.05, solid=0.035)
        tband(tag + "kcollar", J, P, [P["sh_h"] - 0.03, P["sh_h"] + 0.05], "kit2", k=1.08, add=0.05, solid=0.03)
        cc.spines(J, P, tag, (0.2, 0.34, 0.48), mat="fur_black", ln=0.1, r=0.07, name="mane")

@register
class Bloodseeker(Biped):
    """Armoured zealot: sealed brass plate with kit1 enamel, a tall fan crest instead of horns, huge kit1 pauldrons, kit2 tabard, spiked collar."""
    key = "bloodseeker"
    race = "human"
    knobs = dict(shoulders=1.28, limb=1.25, torso=1.2, neck=1.2)
    layout = dict(torso="brass", arms="brass", forearms="kit1", gloves="brass", legs="brass", boots="brass", cuff="kit1", breast="kit1",
                  trim="brass", emblem_mat="brass", gorget=True, pads="big", pad_mat="kit1", pad_trim="brass", spikes=1, spike_mat="brass",
                  tabard="kit2", tabard_trim="brass", belt="leather", buckle="brass", helm="winged", helm_mat="brass", crest_mat="kit1",
                  plume="kit1", kneecops=True, knee_mat="kit1", horn_mat="bone", hair=None, hair_mat="hair_red", tie="kit2")
    stance = dict(lean=4, legs={"l": (6, 15, 8), "r": (-5, 15, 8)}, arms={"l": (6, 34, 44, -8), "r": (6, 34, 44, -8)}, hands="fist")
    stride, arm_swing, jump = 33, 27, 0.13
    height = 1.03

    def idle(self, ph, p, w):       # the oath: slowly raises one clenched fist to the sky and holds it there
        up = 1 if w["s1"] > 0 else 0
        p.update(arms={"l": (6, 34, 44, -8), "r": (6 + 150 * up, 34 - 14 * up, 44 - 30 * up, -8)}, nod=-10 * up, lean=4 - 4 * up)

    def extras(self, J, P, L, tag, pose):
        cc.collar_spikes(J, P, tag, mat="brass", n=6, ln=0.11, r=0.035)
        cc.chain(tag + "chn", surf(J, P, 0.07, 10, 0.07), surf(J, P, 0.07, 65, 0.07), "darkmetal", n=5, sag=0.13)

@register
class Bloodspawn(Biped):
    """Massive red mutant: knuckle-walking horned beast with long bone claws, a ridge of back spikes and a lashing tail, kit1 loincloth, bracers and arm bands, kit2 crossed harness and collar."""
    key = "bloodspawn"
    race = "minotaur"
    knobs = dict(shoulders=1.6, torso=1.4, hunch=26, arms=1.4, limb=1.55, hands=1.5, head=1.0, head_fwd=0.1)
    layout = dict(skin="skin_chaos", legs="skin_chaos", dark="fur_black", snout=(0.75, 1.25), ears="none", horn_mat="fur_black", fangs=True,
                  claws=0.22, finger=1.2, loin="kit1", loin_trim="kit2", bracers="kit1", neckband="kit2", belt="leather", buckle="brass",
                  arm_band="kit1", tail=dict(len=1.0, r=0.1, mat="skin_chaos", up=0.3, tip="bone"))
    stance = dict(lean=8, nod=4, jaw=14, legs={"l": (8, 20, 12), "r": (-8, 20, 8)}, arms={"l": (22, 30, 20, 6), "r": (16, 30, 16, 6)},
                  hands="open")
    stride, arm_swing, jump = 30, 28, 0.1
    lie, lie_shift = 0.34, 1.0
    height = 1.04

    def idle(self, ph, p, w):       # barely leashed: chest heaves, both claws flex wide, jaws snap twice, tail lashes
        b = w["breath"]
        p.update(lean=8 + 4 * b, jaw=14 + 30 * max(0.0, w["s2"]) ** 2, look=16 * w["s1"], tail=w["s2"],
                 arms={"l": (22, 30 + 12 * b, 20 + 14 * b, 6), "r": (16, 30 + 12 * b, 16 + 14 * b, 6)})

    def adjust(self, name, i, pose):
        pose["hands"] = "open"
        pose["hand_modes"] = {}
        pose.setdefault("jaw", 14)

    def extras(self, J, P, L, tag, pose):
        cc.spines(J, P, tag, (0.16, 0.32, 0.48, 0.64), mat="bone", ln=0.26, r=0.08)
        cc.strap(J, P, tag, "kit2", r=0.06, flip=1)
        cc.strap(J, P, tag, "kit2", r=0.06, flip=-1, name="strapb")
        ball_at(tag + "boss", surf(J, P, 0.34, 0, 0.08), 0.09, "brass")
        cc.collar_spikes(J, P, tag, mat="brass", n=6, ln=0.14, r=0.045, h=P["sh_h"] + 0.06)
        for side, sd in (("l", -1), ("r", 1)):          # bone spurs on the forearms and shoulders
            sh, el, wr, tip = J["arms"][side]
            d = (wr - el).normalized()
            cone(tag + "spur" + side, el, el - d * 0.3 + J["B"] * 0.08, 0.07, "bone", 6)
            cone(tag + "shspk" + side, sh + UP * 0.08, sh + UP * 0.34 + J["X"] * sd * 0.14, 0.08, "bone", 6)
