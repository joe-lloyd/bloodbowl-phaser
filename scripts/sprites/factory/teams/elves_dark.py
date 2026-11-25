"""Dark Elf team (assassin, de_blitzer, de_lineman, de_runner, witch_elf).
Costume: pale skin, white hair, spiked dark steel, cruel elegance. No figure holds a ball or a weapon."""
from mathutils import Vector
from lib import Biped, register, core, looks
from lib.core import tube, tband, ball_at, cone, flat_cone, lerp, UP, surf
from teams import elves_common as ec

DE = dict(skin="skin", eyes="red", lip="lip", hair_mat="hair_white", brow="hair_white", trim="kit2", legs="trouser",
          boots="darkmetal", cuff="kit2", spike_mat="darkmetal", tie="kit2")

@register
class Lineman(looks.Fine, Biped):
    """Ridged helm: a saw-toothed kit1 comb on a dark steel skull cap; quilted kit1 coat, arms folded in contempt."""
    key = "de_lineman"
    race = "elf"
    layout = dict(DE, hair=None, helm="skull", helm_mat="darkmetal", helm_tail=True, torso="kit1", arms="kit1",
                  coat="gambeson", hem="kit2", breast="darkmetal", emblem_mat="kit2", pads="plate", pad_mat="darkmetal",
                  pad_trim="kit2", spikes=1, bracers="darkmetal", belt="kit2", buckle="darkmetal", kneecops=True,
                  knee_mat="darkmetal", elf_comb="kit1", elf_cheeks="darkmetal", plume=None)
    stance = dict(lean=-2, nod=-6, legs={"l": (5, 8, 5), "r": (-4, 8, 5)}, arms={"l": (22, 16, 104, -52), "r": (26, 16, 100, -52)},
                  hands="fist")
    height = 1.0

    def idle(self, ph, p, w):       # arms folded; a slow contemptuous head turn and a tapping foot
        p.update(look=26 * w["s1"], nod=-6 - 4 * w["breath"], feet={"r": -16 * (1 if w["s2"] > 0 else 0)})

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        if L.get("elf_comb"):
            ec.comb(J, tag, L["elf_comb"], h=0.2, lo=0.75, back=-0.95, n=9, jag=0.55, thick=0.06)
        c, X, F, U, s = ec.hf(J)
        if L.get("elf_cheeks"):
            for sd in (-1, 1):          # cheek guards
                a = c + X * sd * s[0] * 1.05 + U * s[2] * 0.2 + F * s[1] * 0.2
                flat_cone(tag + "cheek%d" % sd, a, a - U * s[2] * 1.0 + F * s[1] * 0.45, 0.09, L["elf_cheeks"], X, 0.3)
        ec.loose_hair(J, L, tag)

    def details(self, J, P, L, tag, pose):
        ec.studs(J, P, tag, "beltstud", [(0.07, a) for a in (-70, -40, 40, 70)], "darkmetal", r=0.024, off=0.075)
        ec.studs(J, P, tag, "brooch", [(P["sh_h"] - 0.01, 0)], "kit2", r=0.03, off=0.08)

@register
class Blitzer(looks.Fine, Biped):
    """Horned helm and a short cape: tall swept steel horns, big double-spiked pauldrons, kit1 tabard."""
    key = "de_blitzer"
    race = "elf"
    knobs = dict(shoulders=1.02, limb=0.95)
    layout = dict(DE, hair=None, helm="open", helm_mat="darkmetal", helm_tail=True, torso="kit1", arms="darkmetal",
                  gloves="darkmetal", breast="darkmetal", emblem_mat="kit1", gorget=True, pads="big", pad_mat="darkmetal",
                  pad_trim="kit2", spikes=2, tabard="kit1", tabard_trim="kit2", belt="kit2", buckle="darkmetal",
                  cape="short", cape_mat="kit1", cape_lining="kit2", clasp=False, kneecops=True, knee_mat="darkmetal",
                  elf_horns="metal")
    stance = dict(lean=4, legs={"l": (8, 13, 8), "r": (-6, 13, 8)}, arms={"l": (4, 30, 40, -6), "r": (4, 30, 40, -6)},
                  hands="fist")
    stride, arm_swing, jump = 36, 30, 0.16
    height = 1.06

    def idle(self, ph, p, w):       # a predator scanning the pitch: head sweeps, one clawed hand flexes, cape stirs
        flex = ("open", "open", "relaxed", "fist", "fist", "fist", "relaxed", "open")[int(round(ph * 8)) % 8]
        p.update(look=30 * w["s1"], nod=-4, cape=0.05 + 0.05 * w["s2"], hand_modes={"l": flex},
                 arms={"l": (10 + 14 * w["up"], 30, 40 + 40 * w["up"], -6), "r": (4, 30 + 3 * w["breath"], 40, -6)})

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        if L.get("elf_horns"):
            ec.swept_horns(J, tag, L["elf_horns"], k=1.15)
        ec.loose_hair(J, L, tag)
        for side, sd in (("l", -1), ("r", 1)):      # elbow blades
            sh, el, wr = J["arms"][side][:3]
            cone(tag + "elb" + side, el, el + (el - wr).normalized() * 0.16 + (el - sh).normalized() * 0.08, 0.05, "darkmetal", 6)

    def details(self, J, P, L, tag, pose):
        ec.studs(J, P, tag, "rivet", [(0.3, -34), (0.3, 34), (0.42, -42), (0.42, 42)], "kit2", r=0.022, off=0.08)
        ec.studs(J, P, tag, "gorgetgem", [(P["sh_h"] + 0.05, 0)], "kit2", r=0.03, off=0.09)

@register
class Runner(looks.Fine, Biped):
    """Light leathers and a long kit2 scarf: bare-headed with swept white hair, bare arms, scarf tails streaming."""
    key = "de_runner"
    race = "elf"
    knobs = dict(legs=1.13, limb=0.78, shoulders=0.86, torso=0.84)
    layout = dict(DE, hair="swept", torso="kit1", arms="skin", legs="leather", boots="boot", cuff="kit2", bracers="leather",
                  belt="leather", buckle="darkmetal", neckband="kit2", arm_band="kit1", pads="leather", pad_sides=("l",),
                  elf_mask="kit2", elf_scarf="kit2")
    stance = dict(lean=10, twist=8, nod=-4, legs={"l": (14, 7, 16), "r": (-14, 7, 10)}, feet={"r": 18},
                  arms={"l": (-14, 16, 40), "r": (24, 14, 60, 4)}, hands="relaxed")
    stride, arm_swing, run_lean, jump = 46, 40, 20, 0.26
    height = 1.04

    def idle(self, ph, p, w):       # tugs the scarf up over his nose, then glances back over his shoulder
        up = w["up"]
        p.update(look=-38 * w["dn"], sash=0.05 * w["s2"],
                 arms={"l": (-14, 16, 40), "r": (24 + 46 * up, 14, 60 + 78 * up, 4 - 30 * up)})

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        if L.get("elf_mask"):
            ec.face_mask(J, tag, L["elf_mask"])
        if L.get("elf_scarf"):
            knot = J["neck"] + J["B"] * 0.12 + J["X"] * 0.06
            ball_at(tag + "scarfknot", knot, 0.07, L["elf_scarf"])
            ec.streamers(tag, knot, J, pose, L["elf_scarf"], length=0.62, w=0.065, sd=1, n=2, name="scarf")
        ec.loose_hair(J, L, tag, length=0.5)
        tband(tag + "vest", J, P, [0.1, 0.24], "leather", k=1.07, add=0.012)
        ec.shorts(J, L, tag, "kit1", hem="kit2", length=0.42)
        ec.torso_stripe(J, P, tag, "strap", [(0.12, 60), (0.3, 20), (P["sh_h"], -40)], "kit2", r=0.035, off=0.03)

    def details(self, J, P, L, tag, pose):
        ec.studs(J, P, tag, "vestlace", [(0.13, 0), (0.17, 0), (0.21, 0)], "kit2", r=0.018, off=0.07)
        ec.studs(J, P, tag, "strapbuckle", [(0.3, 20)], "darkmetal", r=0.028, off=0.06)

@register
class Assassin(looks.Fine, Biped):
    """Hooded and masked: kit2 hood, ragged kit1 shoulder cloak over a black suit, kit1 mask, wraps and sash; low crouch."""
    key = "assassin"
    race = "elf"
    knobs = dict(limb=0.82, shoulders=0.88)
    layout = dict(DE, hair=None, helm="hood", hood_mat="kit2", torso="cloth_black", arms="cloth_black", legs="cloth_black",
                  boots="cloth_black", cuff=None, wraps="kit1", gloves="cloth_black", loin="kit1", loin_trim="kit2", belt="kit1", buckle="darkmetal", hunch=6,
                  elf_mask="kit1", elf_cloak="kit1", cape=None, cape_mat="kit1", cape_lining="kit2", clasp=False)
    stance = dict(lean=14, nod=-8, legs={"l": (20, 14, 34), "r": (-12, 14, 30)}, feet={"r": 14},
                  arms={"l": (10, 34, 50, 10), "r": (10, 34, 50, 10)}, hands="open")
    stride, arm_swing, run_lean, jump = 42, 16, 26, 0.2
    height = 0.95

    def idle(self, ph, p, w):       # coiled in a crouch: sinks lower (two states), head darts, a hand drifts to a hilt
        k = w["breath"]
        p.update(lean=14 + 5 * k, look=34 * w["s2"], sash=0.04 * w["s1"],
                 legs={"l": (20 + 5 * k, 14, 34 + 12 * k), "r": (-12 - 3 * k, 14, 30 + 12 * k)},
                 arms={"l": (10, 34, 50, 10), "r": (10 - 40 * w["dn"], 34 - 12 * w["dn"], 50 + 30 * w["dn"], 10)})

    def adjust(self, name, i, pose):
        if name == "run":           # runs with the arms trailing behind
            pose["arms"] = {"l": (-50 + 8 * pose["twist"] / 7, 20, 20), "r": (-50 - 8 * pose["twist"] / 7, 20, 20)}
            pose["hands"] = "open"

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        if L.get("elf_mask"):
            ec.face_mask(J, tag, L["elf_mask"])
        if L.get("elf_cloak"):
            ec.drape(J, P, tag, "cloak", 0.62, -150, 70, (L["elf_cloak"], "kit2"), stream=pose.get("cape", 0.0) * 0.6, jag=0.07,
                     depth=0.12, nu=12, grow=0.01)
        ec.sash(J, P, tag, pose, "kit1", sd=1, length=0.6)
        ec.torso_stripe(J, P, tag, "baldric", [(0.1, 55), (0.3, 10), (P["sh_h"], -45)], "kit1", r=0.045, off=0.02)
        for sd in (-1, 1):
            ec.sheath(J, tag, sd)
        for side in ("l", "r"):
            ec.leg_band(J, L, tag, side, 0.35, 0.5, "kit1", "thigh", name="garter")
            ec.leg_band(J, L, tag, side, 0.5, 0.62, "kit1", "shin", name="anklet")

    def details(self, J, P, L, tag, pose):
        ec.studs(J, P, tag, "vial", [(0.2, 62), (0.24, 52), (0.28, 42)], "kit2", r=0.026, off=0.05)
        ec.studs(J, P, tag, "baldricbuckle", [(0.3, 10)], "darkmetal", r=0.03, off=0.045)

@register
class WitchElf(looks.Fine, Biped):
    """Wild white mane, bare limbs, kit1 bandeau and loincloth; blade-shaped fins on bracers, greaves and tiara."""
    key = "witch_elf"
    race = "elf"
    sex = "f"
    knobs = dict(legs=1.1, limb=0.82)
    layout = dict(DE, hair=None, lip="lip_f", torso="skin", arms="skin", legs="skin", loin="kit1", loin_trim="kit2",
                  belt="kit2", buckle="darkmetal", bracers="darkmetal", neckband="kit2", cuff=None,
                  elf_mane="hair_white", elf_tiara="metal", elf_horns=None)
    stance = dict(lean=8, nod=-10, legs={"l": (10, 20, 14), "r": (-8, 20, 14)}, arms={"l": (16, 50, 62, 30), "r": (16, 50, 62, 30)},
                  hands="open")
    stride, arm_swing, run_lean, jump = 44, 38, 22, 0.3
    height = 1.0

    def idle(self, ph, p, w):       # frenzy barely held: rocks side to side (two states) and claws the air in turn
        k = 1 if w["s1"] > 0 else -1
        p.update(twist=9 * k, look=-16 * k, nod=-10 + 8 * w["s2"],
                 arms={"l": (16 + 34 * w["up"], 50, 62 + 30 * w["up"], 30), "r": (16 + 34 * w["dn"], 50, 62 + 30 * w["dn"], 30)})

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        if L.get("elf_mane"):
            ec.mane(J, tag, L["elf_mane"], length=0.2)
        c, X, F, U, s = ec.hf(J)
        if L.get("elf_tiara"):
            for i, x in enumerate((-0.45, 0, 0.45)):        # blade tiara
                b = c + F * s[1] * 0.95 + U * s[2] * 0.5 + X * x * s[0]
                flat_cone(tag + "tiara%d" % i, b - U * 0.04, b + U * (0.2 if x == 0 else 0.13) + X * x * 0.1, 0.045, L["elf_tiara"],
                          F, 0.3)
        if L.get("elf_horns"):
            ec.swept_horns(J, tag, L["elf_horns"], k=1.25, up=1.3, back=0.8, r=0.065)
        tband(tag + "bandeau", J, P, [0.33, 0.4, 0.47], "kit1", k=1.06, add=0.012)
        for sd in (-1, 1):          # a fuller, shaped bust under the bandeau
            core.ellipsoid(tag + "cup%d" % sd, surf(J, P, 0.385, 27 * sd, -0.005), (0.1, 0.095, 0.098), "kit1",
                           core.basis(J["X"], J["F"], J["u"]))
        ec.torso_stripe(J, P, tag, "halter", [(0.47, -30), (P["sh_h"] + 0.04, -12)], "kit1", r=0.03)
        ec.torso_stripe(J, P, tag, "halter2", [(0.47, 30), (P["sh_h"] + 0.04, 12)], "kit1", r=0.03)
        for side, sd in (("l", -1), ("r", 1)):
            sh, el, wr = J["arms"][side][:3]
            ec.fin(tag, "bfin" + side, wr, el, J["X"] * sd, "metal", h=0.2, flat=J["F"])
            hip, knee, ankle = J["legs"][side][:3]
            cone(tag + "kfin" + side, knee + J["hF"] * 0.05, knee + J["hF"] * 0.1 + UP * 0.2, 0.05, "metal", 6)
            ec.leg_band(J, L, tag, side, 0.3, 0.42, "kit1", "thigh", name="garter")
            ec.arm_band(J, L, tag, side, 0.3, 0.5, "kit1", "upper")

    def details(self, J, P, L, tag, pose):
        c, X, F, U, s = ec.hf(J)
        for sd in (-1, 1):          # blade earrings
            a = c + X * sd * s[0] * 0.95 - U * s[2] * 0.12
            cone(tag + "earring%d" % sd, a, a - U * 0.12, 0.022, "metal", 5)
        ec.studs(J, P, tag, "bandeaugem", [(0.4, 0)], "kit2", r=0.03, off=0.07)
