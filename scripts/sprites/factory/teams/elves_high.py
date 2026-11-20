"""High Elf team (he_lineman, he_blitzer, he_thrower, he_catcher).
Costume: gleaming plate with gold trim, tall helms, long robes, a noble bearing. No figure holds a ball.
Three models carry two roster positions each: he_blitzer is also the Dragon Prince, he_thrower the Phoenix
Warrior and he_catcher the White Lion, so each is dressed as the grander of its two roles."""
from mathutils import Vector
from lib import Biped, register, core, looks
from lib.core import tube, tband, ball_at, cone, flat_cone, lerp, UP, surf
from teams import elves_common as ec

HE = dict(skin="skin_elf", hair_mat="hair_blond", brow="hair_blond", trim="gold", legs="kit1", boots="metal", cuff="gold", tie="kit2")

@register
class Lineman(looks.Fine, Biped):
    """Plain tall-spired helm with a kit2 tassel, knee-length kit1 tabard with kit2 trim; stands at parade rest."""
    key = "he_lineman"
    race = "elf"
    layout = dict(HE, hair=None, helm="open", helm_tail=True, torso="kit1", arms="kit1", breast="metal", emblem_mat="kit2",
                  pads="plate", tabard="kit1", tabard_trim="kit2", belt="kit2", sleeve_cuff="kit2", greaves=True,
                  robe_len=0.8, robe_lining="kit2", hem="kit2", elf_spire="metal")
    stance = dict(lean=-2, nod=-8, legs={"l": (2, 5, 2), "r": (-2, 5, 2)}, arms={"l": (-26, 12, 14, -40), "r": (-26, 12, 14, -40)},
                  hands="fist")
    height = 0.98

    def idle(self, ph, p, w):       # parade rest, hands clasped behind him; rocks from heels to toes, chin high
        toe = 12 * (1 if w["s1"] > 0 else 0)
        p.update(feet={"l": toe, "r": toe}, nod=-8 - 4 * w["breath"], look=12 * w["s2"])

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        if L.get("elf_spire"):
            top = ec.spire(J, tag, L["elf_spire"], h=0.36, lean=0.06, tip="gold")
            ec.streamers(tag, top, J, pose, "kit2", length=0.3, w=0.045, sd=1, n=1, name="tassel")
        ec.loose_hair(J, L, tag)

    def details(self, J, P, L, tag, pose):
        ec.studs(J, P, tag, "beltgem", [(0.07, 0)], "kit2", r=0.03, off=0.1)
        ec.studs(J, P, tag, "rivet", [(0.3, -40), (0.3, 40)], "gold", r=0.022, off=0.08)

@register
class Blitzer(looks.Fine, Biped):
    """Dragon Prince / Blitzer: dragon-crested helm with a tall kit2 sail and swept gold horns, long kit2 cape,
    great gilded pauldrons, fists on hips."""
    key = "he_blitzer"
    race = "elf"
    knobs = dict(shoulders=1.06, limb=0.98)
    layout = dict(HE, hair=None, helm="open", helm_tail=True, torso="kit1", arms="kit1", breast="metal", emblem_mat="kit2",
                  gorget=True, pads="big", gauntlets=True, greaves=True, kneecops=True, tabard="kit1", tabard_trim="kit2",
                  belt="kit2", cape="long", cape_mat="kit2", cape_lining="kit1", elf_dragon="kit2")
    stance = dict(lean=-3, nod=-6, legs={"l": (6, 12, 4), "r": (-4, 12, 4)}, arms={"l": (-8, 52, 104, -34), "r": (-8, 52, 104, -34)},
                  hands="fist")
    stride, arm_swing, jump = 38, 30, 0.18
    height = 1.04

    def idle(self, ph, p, w):       # fists on hips, chest out; the cape billows and he slowly surveys his subjects
        p.update(look=24 * w["s1"], nod=-6 - 5 * w["breath"], cape=0.08 + 0.08 * w["s2"], lean=-3 - 2 * w["breath"])

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        if L.get("elf_dragon"):
            ec.spire(J, tag, "metal", h=0.22, lean=0.1, r=0.75)
            ec.comb(J, tag, L["elf_dragon"], h=0.34, lo=0.55, back=-0.95, n=9, thick=0.06, bulge=0.75)
            ec.swept_horns(J, tag, "gold", k=0.95, up=0.7, back=2.2, r=0.055)
        ec.loose_hair(J, L, tag)
        # scale skirt: gilded leaf-shaped plates over the hips
        ec.leaf_ring(J, P, tag, 0.08, 10, 0.26, "gold", width=0.1, droop=0.85, name="tasset", alt="metal")

    def details(self, J, P, L, tag, pose):
        ec.studs(J, P, tag, "gorgetgem", [(P["sh_h"] + 0.05, 0)], "kit2", r=0.032, off=0.09)
        ec.studs(J, P, tag, "rivet", [(0.3, -40), (0.3, 40), (0.42, -46), (0.42, 46)], "gold", r=0.022, off=0.08)

@register
class Thrower(looks.Fine, Biped):
    """Phoenix Warrior / Thrower: flame-feather plume fanning back from the helm, feathered kit2 collar,
    floor-length kit1 robe, one pauldron on the off shoulder; the throwing arm is free."""
    key = "he_thrower"
    race = "elf"
    layout = dict(HE, hair=None, helm="open", helm_tail=True, torso="kit1", arms="kit1", coat="robe", robe_len=0.8,
                  robe_lining="kit2", hem="kit2", breast="metal", emblem_mat="kit2", pads="plate", pad_sides=("l",),
                  belt="kit2", sleeve_cuff="kit2", bracers="gold", tabard_trim="kit2", elf_phoenix="kit2", elf_ruff="kit2")
    stance = dict(lean=0, twist=-8, legs={"l": (5, 6, 4), "r": (-4, 6, 4)}, arms={"l": (-6, 46, 100, -30), "r": (30, 20, 84, 0)},
                  hands="relaxed")
    height = 1.0

    def idle(self, ph, p, w):       # off hand on hip; rolls the wrist of the raised throwing hand, plume nodding
        flex = ("open", "open", "relaxed", "fist", "fist", "relaxed", "open", "open")[int(round(ph * 8)) % 8]
        p.update(hand_modes={"r": flex}, nod=-4 + 6 * w["s2"],
                 arms={"l": (-6, 46, 100, -30), "r": (30 + 12 * w["s1"], 20, 84 + 22 * w["c1"], 0)})

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        c, X, F, U, s = ec.hf(J)
        root = c + U * s[2] * 1.0 - F * s[1] * 0.15
        act = 1.0 if pose.get("_action") else 0.0
        if L.get("elf_phoenix"):
            for i, (dx, hh, bk) in enumerate(((0, 0.56, 0.3), (-0.13, 0.44, 0.42), (0.13, 0.44, 0.42), (-0.24, 0.3, 0.5),
                                              (0.24, 0.3, 0.5))):
                tip = root + U * hh * (1 - 0.45 * act) - F * (bk + 0.3 * act) + X * dx
                flat_cone(tag + "plume%d" % i, root - U * 0.05, tip, 0.075, L["elf_phoenix"] if i else "fire", F, 0.3)
        if L.get("elf_circlet"):
            ec.headband(J, tag, L["elf_circlet"], lo=0.34, hi=0.5)
            ec.feathers(J, tag, "kit2", n=1, h=0.3, at=(0.85, 0.35, -0.3), r=0.06, alt="fire")
        ec.loose_hair(J, L, tag)
        if L.get("elf_ruff"):
            ec.leaf_ring(J, P, tag, P["sh_h"] + 0.03, 12, 0.24, L["elf_ruff"], width=0.1, droop=0.55, off=0.05, name="ruff")

    def details(self, J, P, L, tag, pose):
        ec.studs(J, P, tag, "brooch", [(P["sh_h"] - 0.03, 0)], "fire", r=0.03, off=0.1)
        ec.studs(J, P, tag, "beltgem", [(0.07, 0)], "gold", r=0.028, off=0.1)

@register
class Catcher(looks.Fine, Biped):
    """White Lion / Catcher: bare-headed with long blond hair and a gold circlet, a white fur pelt over the
    shoulders with hanging paws, bare arms, short kit1 tunic and kit2 sash; light on his feet."""
    key = "he_catcher"
    race = "elf"
    knobs = dict(legs=1.12, limb=0.84)
    layout = dict(HE, hair="slick", torso="kit1", arms="skin_elf", legs="skin_elf", boots="leather", cuff="fur_white",
                  coat="gambeson", hem="kit2", belt="kit2", bracers="gold", arm_band="kit2", elf_backhair="hair_blond",
                  elf_pelt="fur_white")
    stance = dict(lean=10, nod=-4, legs={"l": (12, 12, 20), "r": (-10, 12, 16)}, feet={"r": 14},
                  arms={"l": (30, 26, 70, 6), "r": (30, 26, 70, 6)}, hands="open")
    stride, arm_swing, run_lean, jump = 44, 38, 20, 0.28
    height = 1.02

    def idle(self, ph, p, w):       # hands spread and ready; shifts his weight (two states) and tosses his hair back
        k = 1 if w["s1"] > 0 else -1
        p.update(twist=7 * k, nod=-4 - 14 * max(0.0, w["s2"]) * (1 if ph < 0.5 else 0), sash=0.05 * w["s1"],
                 legs={"l": (12, 12, 20 + 7 * k), "r": (-10, 12, 16 - 7 * k)})

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        ec.loose_hair(J, L, tag)
        ec.headband(J, tag, "gold", lo=0.32, hi=0.5)
        if L.get("elf_pelt"):
            fur = L["elf_pelt"]
            ec.drape(J, P, tag, "pelt", 0.34, -165, 165, (fur, fur), fold=0.4, grow=0.03, jag=0.06, depth=0.05, nu=16, thick=0.05,
                     flare=0.1)
            ec.leaf_ring(J, P, tag, P["sh_h"] + 0.05, 9, 0.16, fur, width=0.11, droop=0.5, off=0.06, name="ruff")
            for sd in (-1, 1):          # the pelt's paws hang on the chest
                a = surf(J, P, P["sh_h"] - 0.04, sd * 38, 0.06)
                b = surf(J, P, 0.26, sd * 24, 0.07)
                tube(tag + "paw%d" % sd, [a, lerp(a, b, 0.6), b], [0.07, 0.06, 0.075], fur, n=6)
                for j in (-1, 0, 1):
                    cone(tag + "pclaw%d%d" % (sd, j), b + J["X"] * j * 0.035, b + J["X"] * j * 0.05 - J["u"] * 0.1, 0.02, "bone", 5)
        ec.shorts(J, L, tag, "kit1", hem="kit2", length=0.3)
        ec.sash(J, P, tag, pose, "kit2", sd=-1, length=0.42)

    def details(self, J, P, L, tag, pose):
        c, X, F, U, s = ec.hf(J)
        ball_at(tag + "circletgem", c + F * s[1] * 1.1 + U * s[2] * 0.42, 0.028, "kit2")
        ec.studs(J, P, tag, "beltstud", [(0.07, a) for a in (-50, -20, 20, 50)], "gold", r=0.02, off=0.08)
