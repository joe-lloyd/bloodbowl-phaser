"""Chaos Renegade: renegade_lineman, renegade_thrower, renegade_orc, renegade_goblin, renegade_skaven,
renegade_dark_elf (the Minotaur, Chaos Ogre and Chaos Troll are in chaos_chosen.py; the Rat Ogre belongs
to another batch). Costume: the Turncoats. Every one wears a torn kit1 rag skirt, a kit2 hip sash and the
crossed-slash mark, over whatever is left of the kit of the team they deserted. No figure holds a ball."""
import math
from mathutils import Vector, Matrix
from lib import Biped, register, core, parts
from lib.core import tube, tband, ball_at, box, cone, flat_cone, ellipsoid, lerp, UP, basis, D, surf
from teams import chaos_common as cc

def turncoat(J, P, tag, pose, side=-1, sash_len=0.42, mark_h=0.36, rag=True, mark="kit2"):
    if rag:
        cc.rags(J, P, tag, "kit1", h0=0.1, h1=-0.24, jag=0.55)
    cc.sash(J, P, tag, pose, "kit2", side=side, ln=sash_len)
    if mark:
        cc.sigil(J, P, tag, h=mark_h, mat=mark, size=0.17, off=0.05)

@register
class RenegadeLineman(Biped):
    """Human deserter: head-scarf and eye patch, one battered shoulder pad, bare bandaged other arm, kit1 vest and rag skirt, kit2 sash."""
    key = "renegade_lineman"
    race = "human"
    knobs = dict(shoulders=1.06)
    layout = dict(hair=None, scarf="kit1", torso="kit1", arms="skin_human", legs="rags", boots="leather", cuff="rags", wraps="bandage",
                  pads="football", pad_sides=("l",), pad_mat="darkmetal", pad_trim="kit2", spikes=1, belt="leather", buckle="brass",
                  bracers="leather", brow="hair")
    stance = dict(lean=6, legs={"l": (6, 12, 10), "r": (-5, 12, 10)}, arms={"l": (14, 26, 56, -4), "r": (14, 26, 56, -4)}, hands="fist")
    height = 1.0

    def idle(self, ph, p, w):       # spoiling for it: rolls his head, then smacks a fist into his open palm
        up = w["up"]
        p.update(look=20 * w["c1"], nod=8 * w["dn"],
                 arms={"l": (14 + 30 * up, 26 - 14 * up, 56 + 40 * up, -4 - 34 * up), "r": (14 + 34 * up, 26 - 14 * up, 56 + 44 * up, -4 - 34 * up)},
                 hand_modes={"l": "open" if up > 0.2 else "fist"})

    def extras(self, J, P, L, tag, pose):
        cc.eye_patch(J, tag, sd=1)
        turncoat(J, P, tag, pose, side=1)
        cc.strap(J, P, tag, "leather", r=0.035, flip=-1)

@register
class RenegadeThrower(Biped):
    """Human passer: bare head with swept hair and a kit2 headband, long kit1 coat-tails flying behind, one kit2 sleeve on the throwing arm."""
    key = "renegade_thrower"
    race = "human"
    knobs = dict(limb=0.9, legs=1.06, shoulders=0.96)
    layout = dict(hair="swept", hair_mat="hair_blond", brow="hair_blond", torso="kit1", arms="shirt", legs="trouser", coat="tails",
                  coat_mat="kit1", hem="kit2", boots="boot", cuff="kit2", belt="leather", buckle="brass", sleeve_cuff="kit2",
                  bracers="kit2", neckband="kit2", lining="cloth_black")
    stance = dict(lean=2, twist=-8, legs={"l": (6, 8, 6), "r": (-6, 8, 6)}, arms={"l": (0, 30, 80, -40), "r": (20, 22, 60, 0)}, hands="relaxed")
    stride, arm_swing, jump = 40, 34, 0.24
    height = 1.03

    def idle(self, ph, p, w):       # loosens the throwing arm: slow shoulder circles, off hand on his hip
        a = w["a"]
        p.update(arms={"l": (0, 30, 80, -40), "r": (20 + 60 * w["up"] - 30 * w["dn"], 22 + 30 * abs(w["c1"]), 60 + 30 * w["s2"], 0)},
                 hand_modes={"r": "open" if w["s1"] > 0 else "relaxed"}, look=10 * w["c1"])

    def extras(self, J, P, L, tag, pose):
        cc.headband(J, tag, "kit2", h=0.36)
        turncoat(J, P, tag, pose, side=-1, rag=False, mark_h=0.38)
        cc.strap(J, P, tag, "leather", r=0.03, flip=1)

@register
class RenegadeOrc(Biped):
    """Orc bruiser: bolted iron jaw-guard and topknot, huge spiked kit1 shoulder pads, bare green arms, kit1 rag skirt, kit2 sash."""
    key = "renegade_orc"
    race = "orc"
    knobs = dict(shoulders=1.4, torso=1.28)
    layout = dict(torso="skin_orc", legs="leather", boots="boot", cuff="rags", pads="football_big", pad_mat="kit1", pad_trim="kit2", spikes=1,
                  belt="leather", buckle="brass", bracers="darkmetal", arm_band="kit2", tusks=False)
    stance = dict(lean=6, legs={"l": (5, 16, 10), "r": (-4, 16, 10)}, arms={"l": (8, 34, 44, -4), "r": (8, 34, 44, -4)}, hands="fist")
    stride, arm_swing, jump = 32, 26, 0.12
    height = 1.0

    def idle(self, ph, p, w):       # thumps his chest with alternating fists
        l, r = max(0.0, w["s2"]) * (1 if w["s1"] > 0 else 0), max(0.0, w["s2"]) * (1 if w["s1"] < 0 else 0)
        p.update(arms={"l": (8 + 40 * l, 34 - 24 * l, 44 + 80 * l, -4 - 40 * l), "r": (8 + 40 * r, 34 - 24 * r, 44 + 80 * r, -4 - 40 * r)},
                 jaw=20, lean=6 - 4 * w["breath"])

    def extras(self, J, P, L, tag, pose):
        c, X, F, U, s = cc.hf(J)
        R = J["head_R"]
        core.cap(tag + "jawguard", c - U * s[2] * 0.3 + F * s[1] * 0.1, (s[0] * 1.12, s[1] * 1.15, s[2] * 0.95), "darkmetal",
                 (F * 0.7 - U * 0.7).normalized(), cut=0.25, rot=R, thick=0.03)
        for sd in (-1, 1):
            ball_at(tag + "jbolt%d" % sd, c + X * sd * s[0] * 1.0 - U * s[2] * 0.35 + F * s[1] * 0.3, 0.035, "brass")
            cone(tag + "jtusk%d" % sd, c + F * s[1] * 1.0 - U * s[2] * 0.75 + X * sd * s[0] * 0.4, c + F * s[1] * 1.08 - U * s[2] * 0.15 + X * sd * s[0] * 0.45,
                 0.035, "bone", 6)
        top = c + U * s[2] * 0.95 - F * s[1] * 0.2
        tube(tag + "topknot", [top, top + U * 0.14 - F * 0.04, top + U * 0.2 - F * 0.2, top + U * 0.06 - F * 0.34], [0.05, 0.075, 0.06, 0.02], "hair", n=6)
        tube(tag + "knottie", [top + U * 0.02, top + U * 0.08], [0.06, 0.06], "kit2", n=6)
        turncoat(J, P, tag, pose, side=-1, mark=None)
        cc.sigil(J, P, tag, h=0.2, mat="white", size=0.2, off=0.03)
        cc.strap(J, P, tag, "kit1", r=0.05, flip=1)

@register
class RenegadeGoblin(Biped):
    """Goblin scrounger: a stolen iron kettle helm far too big for him with a kit2 stripe, ears poking out, kit1 smock down to his knees."""
    key = "renegade_goblin"
    race = "goblin"
    knobs = dict(head=1.3)
    layout = dict(skin="skin_goblin", torso="kit1", arms="kit1", legs="rags", boots="leather", cuff=None, helm="kettle", helm_mat="darkmetal",
                  coat="robe", coat_mat="kit1", robe_len=0.42, jag=0.5, robe_lining="kit1", belt="rope", buckle=None, sleeve_cuff="kit2",
                  fangs=True, neckband="kit2")
    stance = dict(lean=6, legs={"l": (6, 12, 12), "r": (-6, 12, 12)}, arms={"l": (16, 26, 50), "r": (16, 26, 50)}, hands="fist")
    stride, arm_swing, run_lean, jump = 44, 40, 18, 0.3
    height = 1.08

    def idle(self, ph, p, w):       # hops from foot to foot; the helm slips over his eyes and he shoves it back up
        k = 1 if w["s2"] > 0 else -1
        up = 1 if w["s1"] < -0.3 else 0
        p.update(legs={"l": (6, 12, 12 + 14 * k), "r": (-6, 12, 12 - 14 * k)}, nod=14 * (1 if w["s1"] < 0 else 0),
                 arms={"l": (16, 26, 50), "r": (16 + 110 * up, 26, 50 + 80 * up, -20 * up)}, hand_modes={"r": "open" if up else "fist"})

    def extras(self, J, P, L, tag, pose):
        c, X, F, U, s = cc.hf(J)
        cc.big_ears(J, L, tag, size=1.0, droop=0.16)
        cc.long_nose(J, L, tag, ln=0.14)
        tube(tag + "hstripe", [c - F * s[1] * 1.0 + U * s[2] * 0.62, c + U * s[2] * 1.2, c + F * s[1] * 1.0 + U * s[2] * 0.62], [0.05, 0.055, 0.05],
             "kit2", ref=X, n=6, flat=0.5)
        cone(tag + "hspike", c + U * s[2] * 1.15, c + U * (s[2] * 1.15 + 0.16), 0.045, "bone", 6)
        cc.sash(J, P, tag, pose, "kit2", side=-1, ln=0.26, r=0.04)
        cc.sigil(J, P, tag, h=0.2, mat="kit2", size=0.13, off=0.07)

@register
class RenegadeSkaven(Biped):
    """Rat outcast: brown mutant with a row of bone spines down his back and stub horns, kit1 rag vest and skirt, kit2 arm rings and tail ring."""
    key = "renegade_skaven"
    race = "skaven"
    knobs = dict(hunch=18)
    layout = dict(skin="fur_brown", legs="fur_brown", dark="fur_black", jersey="kit1", arms="kit1", forearms="fur_brown", horns="small", horn_mat="bone", bracers="kit2",
                  arm_band="kit2", belt="rope", buckle=None, fangs=True, eye_mat="eye",
                  tail=dict(len=1.0, r=0.045, mat="skin_rat", up=0.25))
    stance = dict(lean=10, nod=6, legs={"l": (8, 10, 10), "r": (-8, 10, 8)}, arms={"l": (26, 16, 80, -10), "r": (26, 16, 80, -10)},
                  hands="relaxed")
    stride, arm_swing, run_lean, jump = 46, 36, 22, 0.26
    height = 1.08

    def idle(self, ph, p, w):       # twitchy: nose up sniffing the wind, tail lashing, hands rubbing
        p.update(nod=6 - 20 * w["up"], look=24 * w["s2"] * (1 if w["s1"] < 0 else 0), tail=w["s2"],
                 arms={"l": (26 + 8 * w["s2"], 12, 86, -22), "r": (26 - 8 * w["s2"], 12, 86, -22)})

    def extras(self, J, P, L, tag, pose):
        cc.spines(J, P, tag, (0.16, 0.3, 0.44), mat="bone", ln=0.2, r=0.05)
        turncoat(J, P, tag, pose, side=1, sash_len=0.34, mark_h=0.3)
        # the hunch and rubbing hands hide the vest head-on: a ragged kit1 mantle over the shoulders,
        # a kit2 neck rag and a kit2 brow band put team colour on the parts that face the camera
        sh = P["sh_h"]
        tband(tag + "mantle", J, P, [sh - 0.12, sh - 0.03, sh + 0.05], "kit1", k=1.12, add=0.06, solid=0.03, jag=0.35)
        tband(tag + "neckrag", J, P, [sh + 0.03, sh + 0.1], "kit2", k=1.0, add=0.07, solid=0.03)
        cc.headband(J, tag, "kit2", h=0.3, w=0.09, k=1.1)
        B = J["B"]
        Bh = cc.horiz(B)
        ball_at(tag + "tailring", J["pelvis"] + B * 0.1 + Bh * 0.4 - UP * 0.28, 0.07, "kit2")

@register
class RenegadeDarkElf(Biped):
    """Elf exile: tall and slim, long white hair, barbed dark-steel shoulder and cuirass, kit1 half-cape and rag skirt, kit2 sash, greaves."""
    key = "renegade_dark_elf"
    race = "elf"
    knobs = dict(legs=1.12)
    layout = dict(skin="skin", hair="long", hair_mat="hair_white", brow="hair_white", tie="kit2", lip="lip", eyes="red", torso="cloth_black",
                  arms="cloth_black", legs="cloth_black", breast="darkmetal", emblem_mat="kit2", trim="kit2", pads="plate", pad_sides=("l",),
                  pad_mat="darkmetal", pad_trim="kit2", spikes=2, spike_mat="darkmetal", cape="short", cape_mat="kit1",
                  cape_lining="cloth_black", clasp=False, greaves=True, bracers="darkmetal", belt="kit2", buckle="brass")
    stance = dict(lean=0, twist=8, legs={"l": (8, 6, 4), "r": (-8, 6, 10)}, arms={"l": (4, 20, 20), "r": (10, 26, 100, -30)}, hands="relaxed")
    stride, arm_swing, run_lean, jump = 44, 36, 16, 0.26
    height = 1.04

    def idle(self, ph, p, w):       # bored contempt: studies the nails of one raised hand, cape stirring, then a slow glance away
        p.update(arms={"l": (4, 20, 20), "r": (10 + 20 * w["up"], 26, 100 + 20 * w["up"], -30)},
                 hand_modes={"r": "open" if w["s1"] > 0 else "relaxed"}, look=-30 * w["dn"], nod=10 * w["up"], cape=0.06 + 0.06 * w["s2"])

    def extras(self, J, P, L, tag, pose):
        turncoat(J, P, tag, pose, side=1, sash_len=0.5, mark=None)
